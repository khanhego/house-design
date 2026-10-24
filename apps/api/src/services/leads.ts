import { INTERESTS, newId, normalizePhoneVN, sortedFloors } from '@hd/core'
import { nowIso } from '../db/sqlite.ts'
import { AppError, notFound, validation } from '../lib/errors.ts'
import { addDays, vnDateTime, vnStartOfDay } from '../lib/time.ts'
import type { Ctx } from '../context.ts'
import type { AuthUser } from './access.ts'
import { availability } from './access.ts'
import { enqueueEmail } from './mail.ts'
import { publishedSnapshot } from './public.ts'

/* Lead (02 API-62, 70…72; 02a §4 dòng 62, 70–72; BR-09, R-26). */

export const INTEREST_LABEL: Record<string, string> = { live: 'Mua để ở', invest: 'Đầu tư', interior: 'Tư vấn nội thất', other: 'Khác' }
export const SOURCE_LABEL: Record<string, string> = { link: 'Link', qr: 'QR', embed: 'Nhúng' }
const MERGE_WINDOW_MS = 24 * 3600 * 1000

export interface LeadInput {
  projectSlug: string
  houseSlug?: string | null
  name?: string | null
  phone: string
  email?: string | null
  interest?: (typeof INTERESTS)[number] | null
  message?: string | null
  consent: boolean
  context?: { floorId?: string; roomId?: string } | null
  source?: 'link' | 'qr' | 'embed'
  deviceId?: string | null
}

interface LeadRow {
  id: string
  project_id: string
  house_id: string | null
  name: string | null
  phone: string
  email: string | null
  interest: string | null
  message: string | null
  context_json: string
  source: string
  contact_count: number
  status: string
  created_at: string
  last_contact_at: string
}

/** Tên tầng/phòng lấy từ bản đang phát hành (lưu cùng lead để CSV, E5 đọc được kể cả khi nhà đổi sau). */
const contextNames = (ctx: Ctx, houseId: string | null, c: LeadInput['context']) => {
  if (!houseId || !c?.floorId) return {}
  const house = ctx.repos.houses.get(houseId)
  const snap = house ? publishedSnapshot(ctx, house)?.snapshot : null
  const floor = snap ? sortedFloors(snap.document).find((f) => f.id === c.floorId) : undefined
  const room = floor?.rooms.find((r) => r.id === c.roomId)
  return { floorId: c.floorId, roomId: c.roomId, floorName: floor?.name ?? null, roomName: room?.name ?? null }
}

/** Tạo hoặc gộp lead (trùng SĐT trong 24 giờ, BR-09) + E5 tới email nhận lead của dự án. */
export const submitLead = (ctx: Ctx, input: LeadInput) => {
  const phone = normalizePhoneVN(input.phone)
  const fields: Record<string, string> = {}
  if (!phone) fields.phone = 'Số điện thoại cần 10 chữ số, bắt đầu bằng 0 (ví dụ 0912 345 678).'
  if (input.consent !== true) fields.consent = 'Bạn cần đồng ý để chúng tôi liên hệ.'
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) fields.email = 'Email chưa đúng định dạng.'
  if (Object.keys(fields).length) throw validation(fields)

  const project = ctx.repos.projects.bySlug(input.projectSlug)
  if (!project) throw notFound()
  const client = ctx.repos.clients.get(project.clientId)
  if (!availability(client, project).available) throw new AppError(410, 'PROJECT_UNAVAILABLE', 'Nội dung này hiện không còn hiển thị.')
  const house = input.houseSlug ? ctx.repos.houses.bySlug(project.id, input.houseSlug) : undefined
  const houseId = house?.publishedVersionId ? house.id : null
  const context = contextNames(ctx, houseId, input.context)
  const now = nowIso()

  const { id, merged, count } = ctx.db.tx(() => {
    const prev = ctx.db.get<{ id: string; contact_count: number }>(
      'SELECT id, contact_count FROM leads WHERE project_id = ? AND phone = ? AND last_contact_at >= ? ORDER BY last_contact_at DESC LIMIT 1',
      project.id, phone, new Date(Date.now() - MERGE_WINDOW_MS).toISOString(),
    )
    if (prev) {
      ctx.db.run(
        `UPDATE leads SET contact_count = contact_count + 1, last_contact_at = ?, house_id = COALESCE(?, house_id), context_json = COALESCE(?, context_json),
         name = COALESCE(?, name), email = COALESCE(?, email), interest = COALESCE(?, interest), message = COALESCE(?, message), status = 'new' WHERE id = ?`,
        now, houseId, context.floorId ? JSON.stringify(context) : null, input.name || null, input.email || null, input.interest ?? null, input.message || null, prev.id,
      )
      return { id: prev.id, merged: true, count: prev.contact_count + 1 }
    }
    const id = newId('led')
    ctx.db.run(
      `INSERT INTO leads (id, project_id, house_id, name, phone, email, interest, message, consent_at, context_json, source, device_id, created_at, last_contact_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, project.id, houseId, input.name || null, phone, input.email || null, input.interest ?? null, input.message || null, now,
      JSON.stringify(context), input.source ?? 'link', input.deviceId ?? null, now, now,
    )
    return { id, merged: false, count: 1 }
  })

  for (const to of project.contact.leadEmails ?? []) {
    enqueueEmail(ctx, to, 'E5', {
      name: input.name || null, phone, contactCount: count, projectId: project.id, projectName: project.name,
      houseName: house?.name ?? null, floorName: context.floorName ?? null, roomName: context.roomName ?? null,
      interest: input.interest ? INTEREST_LABEL[input.interest] : null, message: input.message || null,
    }, id)
  }
  return { lead: { id }, merged }
}

export interface LeadFilter {
  clientId?: string
  projectId?: string
  houseId?: string
  from?: string
  to?: string
  status?: 'new' | 'contacted'
}

/** Điều kiện WHERE theo quyền: người duyệt chỉ thấy dự án của khách hàng mình. */
const where = (user: AuthUser, f: LeadFilter) => {
  const conds: string[] = []
  const args: (string | number)[] = []
  const clientId = user.role === 'approver' ? user.clientId! : f.clientId
  if (clientId) (conds.push('p.client_id = ?'), args.push(clientId))
  if (f.projectId) (conds.push('l.project_id = ?'), args.push(f.projectId))
  if (f.houseId) (conds.push('l.house_id = ?'), args.push(f.houseId))
  if (f.from) (conds.push('l.created_at >= ?'), args.push(vnStartOfDay(f.from).toISOString()))
  if (f.to) (conds.push('l.created_at < ?'), args.push(vnStartOfDay(addDays(f.to, 1)).toISOString()))
  if (f.status) (conds.push('l.status = ?'), args.push(f.status))
  return { sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '', args }
}

const out = (r: LeadRow & { house_name: string | null }) => {
  const c = JSON.parse(r.context_json || '{}') as { floorName?: string | null; roomName?: string | null }
  return {
    id: r.id, createdAt: r.created_at, lastContactAt: r.last_contact_at, name: r.name, phone: r.phone, email: r.email,
    interest: r.interest, message: r.message, house: r.house_id ? { id: r.house_id, name: r.house_name } : null,
    context: { floorName: c.floorName ?? null, roomName: c.roomName ?? null }, source: r.source, contactCount: r.contact_count, status: r.status,
  }
}

export const listLeads = (ctx: Ctx, user: AuthUser, f: LeadFilter, page: { limit: number; cursor?: string | null }) => {
  const w = where(user, f)
  let sql = w.sql
  const args = [...w.args]
  if (page.cursor) {
    const [at, id] = Buffer.from(page.cursor, 'base64url').toString().split('|')
    sql += `${sql ? ' AND' : 'WHERE'} (l.created_at < ? OR (l.created_at = ? AND l.id < ?))`
    args.push(at, at, id)
  }
  const rows = ctx.db.all<LeadRow & { house_name: string | null }>(
    `SELECT l.*, h.name house_name FROM leads l JOIN projects p ON p.id = l.project_id LEFT JOIN houses h ON h.id = l.house_id ${sql}
     ORDER BY l.created_at DESC, l.id DESC LIMIT ?`, ...args, page.limit + 1,
  )
  const more = rows.length > page.limit
  const items = rows.slice(0, page.limit)
  const last = items.at(-1)
  return { items: items.map(out), nextCursor: more && last ? Buffer.from(`${last.created_at}|${last.id}`).toString('base64url') : null }
}

const loadScoped = (ctx: Ctx, user: AuthUser, id: string) => {
  const r = ctx.db.get<{ id: string; client_id: string }>('SELECT l.id, p.client_id FROM leads l JOIN projects p ON p.id = l.project_id WHERE l.id = ?', id)
  // khác khách hàng → 404 (không tiết lộ lead tồn tại)
  if (!r || (user.role === 'approver' && r.client_id !== user.clientId)) throw notFound('Không tìm thấy lead')
  return r
}

export const setLeadStatus = (ctx: Ctx, user: AuthUser, id: string, status: 'new' | 'contacted') => {
  loadScoped(ctx, user, id)
  ctx.db.run('UPDATE leads SET status = ? WHERE id = ?', status, id)
  const r = ctx.db.get<LeadRow & { house_name: string | null }>('SELECT l.*, h.name house_name FROM leads l LEFT JOIN houses h ON h.id = l.house_id WHERE l.id = ?', id)!
  return out(r)
}

/** Xoá cứng + che dữ liệu cá nhân trong outbox (NFR-04, R-26). */
export const deleteLead = (ctx: Ctx, user: AuthUser, id: string) => {
  loadScoped(ctx, user, id)
  ctx.db.tx(() => {
    // email chưa gửi thì huỷ luôn, không gửi bản rỗng (R-G3-07)
    ctx.db.run("UPDATE outbox_emails SET status = 'failed', last_error = 'lead deleted' WHERE lead_id = ? AND status = 'queued'", id)
    ctx.db.run("UPDATE outbox_emails SET data_json = '{}' WHERE lead_id = ?", id)
    ctx.db.run('DELETE FROM leads WHERE id = ?', id)
  })
}

export const leadsCsvRows = (ctx: Ctx, user: AuthUser, f: LeadFilter) => {
  const w = where(user, f)
  const rows = ctx.db.all<LeadRow & { house_name: string | null }>(
    `SELECT l.*, h.name house_name FROM leads l JOIN projects p ON p.id = l.project_id LEFT JOIN houses h ON h.id = l.house_id ${w.sql}
     ORDER BY l.created_at DESC LIMIT 10000`, ...w.args,
  )
  return rows.map(out).map((l) => [
    vnDateTime(l.createdAt), l.name, l.phone, l.email, l.interest ? INTEREST_LABEL[l.interest] : '', l.message, l.house?.name ?? '',
    l.context.floorName, l.context.roomName, SOURCE_LABEL[l.source] ?? l.source, l.contactCount, l.status === 'contacted' ? 'Đã liên hệ' : 'Mới',
  ])
}

export const LEADS_CSV_HEADER = ['Thời điểm', 'Họ tên', 'SĐT', 'Email', 'Quan tâm', 'Lời nhắn', 'Mẫu nhà', 'Tầng', 'Phòng', 'Nguồn', 'Số lần liên hệ', 'Trạng thái']
