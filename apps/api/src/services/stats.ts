import { sortedFloors } from '@hd/core'
import type { Snapshot } from '@hd/core'
import { nowIso } from '../db/sqlite.ts'
import { validation } from '../lib/errors.ts'
import { addDays, vnDate, vnStartOfDay } from '../lib/time.ts'
import type { Ctx } from '../context.ts'
import type { AuthUser } from './access.ts'
import { assertProject } from './access.ts'
import { publishedSnapshot } from './public.ts'

/* Sự kiện xem & thống kê (02 API-63, 80, 81; 02a §4.2; BR-10). */

export const EVENT_TYPES = ['project_open', 'house_open', 'floor_select', 'room_select', 'walk_mode', 'item_open', 'plan_open', 'pdf_download', 'contact_click', 'lead_submit', 'fallback_shown'] as const
export const DEVICE_CLASSES = ['mobile', 'desktop', 'fallback'] as const
const SOURCES = ['link', 'qr', 'embed'] as const
const DAY = 86_400_000

export interface EventBatch {
  projectSlug: string
  sessionId: string
  deviceId: string
  source: string
  deviceClass: string
  events: { type: string; houseSlug?: string; targetId?: string; ts: string }[]
}

/** Ghi lô sự kiện; sự kiện sai bị bỏ, không báo lỗi. Trả số sự kiện đã ghi. */
export const recordEvents = (ctx: Ctx, b: EventBatch, now = Date.now()) => {
  const project = ctx.repos.projects.bySlug(b.projectSlug)
  if (!project) return 0
  const source = (SOURCES as readonly string[]).includes(b.source) ? b.source : 'link'
  const device = (DEVICE_CLASSES as readonly string[]).includes(b.deviceClass) ? b.deviceClass : 'desktop'
  const houses = new Map<string, string | null>()
  const houseId = (slug?: string) => {
    if (!slug) return null
    if (!houses.has(slug)) houses.set(slug, ctx.repos.houses.bySlug(project.id, slug)?.id ?? null)
    return houses.get(slug)!
  }
  let n = 0
  ctx.db.tx(() => {
    for (const e of b.events.slice(0, 50)) {
      const t = Date.parse(e.ts)
      if (!(EVENT_TYPES as readonly string[]).includes(e.type) || !Number.isFinite(t) || Math.abs(t - now) > DAY) continue
      ctx.db.run(
        'INSERT INTO view_events (project_id, house_id, session_id, device_id, type, target_id, source, device_class, ts) VALUES (?,?,?,?,?,?,?,?,?)',
        project.id, houseId(e.houseSlug), b.sessionId.slice(0, 64), b.deviceId.slice(0, 64), e.type, e.targetId?.slice(0, 64) ?? null, source, device, new Date(t).toISOString(),
      )
      n++
    }
  })
  return n
}

export interface StatsQuery {
  projectId?: string
  clientId?: string
  houseId?: string
  from?: string
  to?: string
}

/** Khoảng ngày (giờ VN): mặc định 30 ngày gần nhất; tối đa 366 ngày. */
export const range = (q: StatsQuery) => {
  const to = q.to ?? vnDate()
  const from = q.from ?? addDays(to, -29)
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1
  if (!(days >= 1)) throw validation({ from: 'Ngày bắt đầu phải trước ngày kết thúc' })
  if (days > 366) throw validation({ from: 'Khoảng thời gian tối đa 366 ngày' })
  return { from, to, days, fromIso: vnStartOfDay(from).toISOString(), toIso: vnStartOfDay(addDays(to, 1)).toISOString() }
}

/** Phạm vi dự án theo quyền: người duyệt bắt buộc projectId của mình; QTV tuỳ chọn (lọc khách hàng). */
const scope = (ctx: Ctx, user: AuthUser, q: StatsQuery) => {
  if (q.projectId) {
    assertProject(ctx, user, q.projectId)
    return { sql: 'project_id = ?', args: [q.projectId] }
  }
  if (user.role === 'approver') throw validation({ projectId: 'Chọn một dự án' })
  if (q.clientId) return { sql: 'project_id IN (SELECT id FROM projects WHERE client_id = ?)', args: [q.clientId] }
  return { sql: '1 = 1', args: [] as string[] }
}

const snapCache = new Map<string, Snapshot | null>()
const snapOf = (ctx: Ctx, houseId: string) => {
  const house = ctx.repos.houses.get(houseId)
  const key = `${houseId}:${house?.publishedVersionId ?? ''}`
  if (!snapCache.has(key)) snapCache.set(key, house ? publishedSnapshot(ctx, house)?.snapshot ?? null : null)
  return snapCache.get(key)!
}

export const stats = (ctx: Ctx, user: AuthUser, q: StatsQuery) => {
  const r = range(q)
  const s = scope(ctx, user, q)
  const base = `${s.sql} AND ts >= ? AND ts < ?${q.houseId ? ' AND house_id = ?' : ''}`
  const args = [...s.args, r.fromIso, r.toIso, ...(q.houseId ? [q.houseId] : [])]
  const one = <T>(sql: string) => ctx.db.get<T>(sql, ...args)!
  const all = <T>(sql: string) => ctx.db.all<T>(sql, ...args)

  const views = one<{ n: number }>(`SELECT COUNT(DISTINCT session_id) n FROM view_events WHERE ${base} AND type IN ('project_open','house_open')`).n
  const uniqueViewers = one<{ n: number }>(`SELECT COUNT(DISTINCT device_id) n FROM view_events WHERE ${base}`).n
  const avg = one<{ a: number | null }>(
    `SELECT AVG(d) a FROM (SELECT (julianday(MAX(ts)) - julianday(MIN(ts))) * 86400 d FROM view_events WHERE ${base} GROUP BY session_id)`,
  ).a
  const leadScope = s.sql.replace('project_id', 'l.project_id')
  const leadArgs = [...s.args, r.fromIso, r.toIso, ...(q.houseId ? [q.houseId] : [])]
  const leadWhere = `${leadScope} AND l.created_at >= ? AND l.created_at < ?${q.houseId ? ' AND l.house_id = ?' : ''}`
  const leads = ctx.db.get<{ n: number }>(`SELECT COUNT(*) n FROM leads l WHERE ${leadWhere}`, ...leadArgs)!.n

  const vDaily = new Map(all<{ d: string; n: number }>(
    `SELECT date(ts, '+7 hours') d, COUNT(DISTINCT session_id) n FROM view_events WHERE ${base} AND type IN ('project_open','house_open') GROUP BY d`,
  ).map((x) => [x.d, x.n]))
  const lDaily = new Map(ctx.db.all<{ d: string; n: number }>(`SELECT date(l.created_at, '+7 hours') d, COUNT(*) n FROM leads l WHERE ${leadWhere} GROUP BY d`, ...leadArgs).map((x) => [x.d, x.n]))
  const daily = Array.from({ length: r.days }, (_, i) => {
    const date = addDays(r.from, i)
    return { date, views: vDaily.get(date) ?? 0, leads: lDaily.get(date) ?? 0 }
  })

  const topHouses = all<{ house_id: string; n: number }>(
    `SELECT house_id, COUNT(DISTINCT session_id) n FROM view_events WHERE ${base} AND type = 'house_open' AND house_id IS NOT NULL GROUP BY house_id ORDER BY n DESC LIMIT 10`,
  ).map((x) => ({ id: x.house_id, name: ctx.repos.houses.get(x.house_id)?.name ?? '—', views: x.n }))

  const topRooms = all<{ house_id: string; target_id: string; n: number }>(
    `SELECT house_id, target_id, COUNT(*) n FROM view_events WHERE ${base} AND type = 'room_select' AND house_id IS NOT NULL AND target_id IS NOT NULL GROUP BY house_id, target_id ORDER BY n DESC LIMIT 10`,
  ).map((x) => {
    const snap = snapOf(ctx, x.house_id)
    const room = snap ? sortedFloors(snap.document).flatMap((f) => f.rooms).find((rm) => rm.id === x.target_id) : undefined
    return { houseName: ctx.repos.houses.get(x.house_id)?.name ?? '—', roomName: room?.name ?? '—', selects: x.n }
  })

  const topItems = all<{ house_id: string; target_id: string; n: number }>(
    `SELECT house_id, target_id, COUNT(*) n FROM view_events WHERE ${base} AND type = 'item_open' AND house_id IS NOT NULL AND target_id IS NOT NULL GROUP BY house_id, target_id ORDER BY n DESC LIMIT 10`,
  ).map((x) => {
    const snap = snapOf(ctx, x.house_id)
    const it = snap?.document.floors.flatMap((f) => f.items).find((i) => i.id === x.target_id)
    const name = it?.info?.name ?? (it && 'libraryItemId' in it.source ? snap!.resolved.libraryItems[it.source.libraryItemId]?.name : undefined)
    return { name: name ?? '—', opens: x.n }
  })

  const bySession = (col: 'source' | 'device_class') => Object.fromEntries(all<{ k: string; n: number }>(
    `SELECT ${col} k, COUNT(DISTINCT session_id) n FROM view_events WHERE ${base} GROUP BY ${col}`,
  ).map((x) => [x.k, x.n]))
  const bySource = { link: 0, qr: 0, embed: 0, ...bySession('source') }
  const byDevice = { mobile: 0, desktop: 0, fallback: 0, ...bySession('device_class') }

  return {
    range: { from: r.from, to: r.to },
    totals: { views, uniqueViewers, avgDurationSec: Math.round(avg ?? 0), leads, leadRate: views ? Math.round((leads / views) * 1000) / 1000 : 0 },
    daily, topHouses, topRooms, topItems, bySource, byDevice, generatedAt: nowIso(),
  }
}
