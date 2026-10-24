import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { normalizePhoneVN, PLANS } from '@hd/core'
import type { Ctx } from '../context.ts'
import { AppError, notFound, validation } from '../lib/errors.ts'
import { requireUser, revokeSessions } from '../lib/auth.ts'
import { parse } from '../lib/validate.ts'
import { enqueueEmail } from '../services/mail.ts'
import { fileUrl } from '../repos/types.ts'
import type { Client } from '../repos/types.ts'
import { issueToken, publicUser } from './auth.ts'

const phone = z
  .string()
  .max(20)
  .transform((s, c) => {
    if (!s) return null
    const p = normalizePhoneVN(s)
    if (!p) c.addIssue({ code: 'custom', message: 'Số điện thoại cần 10 chữ số, bắt đầu bằng 0' })
    return p
  })
  .nullable()
  .optional()

const ClientBody = z.object({
  name: z.string().trim().min(1).max(200),
  logoFileId: z.string().max(64).nullable().optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Màu cần dạng #RRGGBB').optional(),
  contact: z
    .object({ phone, zalo: phone, email: z.string().email().max(200).nullable().optional().or(z.literal('')), address: z.string().max(300).nullable().optional() })
    .optional(),
  plan: z.enum(PLANS).nullable().optional(),
  hostingUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  showPoweredBy: z.boolean().optional(),
})

const clientOut = (ctx: Ctx, c: Client) => {
  const logo = c.logoFileId ? ctx.repos.files.get(c.logoFileId) : undefined
  const projectCount = ctx.db.get<{ n: number }>('SELECT COUNT(*) n FROM projects WHERE client_id = ?', c.id)!.n
  return { ...c, logoUrl: logo ? fileUrl(logo.storageKey) : null, projectCount }
}

/** API-10…13 (chỉ QTV). */
export const registerAdmin = async (app: FastifyInstance, ctx: Ctx) => {
  app.get('/api/v1/clients', async (req) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    // người dựng chỉ cần tên để lọc dự án (R-G3-08, DEC-42)
    if (u.role === 'producer') return { items: ctx.repos.clients.list().map((c) => ({ id: c.id, name: c.name })) }
    return { items: ctx.repos.clients.list().map((c) => clientOut(ctx, c)) }
  })
  app.post('/api/v1/clients', async (req, reply) => {
    requireUser(ctx, req, ['admin'])
    const b = parse(ClientBody, req.body)
    if (b.logoFileId && ctx.repos.files.get(b.logoFileId)?.kind !== 'logo') throw validation({ logoFileId: 'Logo không hợp lệ' })
    const c = ctx.repos.clients.create({ ...b, contact: b.contact ? { ...b.contact, email: b.contact.email || null } : {} })
    return reply.status(201).send({ client: clientOut(ctx, c) })
  })
  app.get<{ Params: { id: string } }>('/api/v1/clients/:id', async (req) => {
    requireUser(ctx, req, ['admin'])
    const c = ctx.repos.clients.get(req.params.id)
    if (!c) throw notFound()
    return { client: clientOut(ctx, c), users: ctx.repos.users.list(c.id).map((u) => publicUser(ctx, u)) }
  })
  app.patch<{ Params: { id: string } }>('/api/v1/clients/:id', async (req) => {
    requireUser(ctx, req, ['admin'])
    const b = parse(ClientBody.partial().extend({ status: z.enum(['active', 'suspended']).optional() }), req.body)
    const cur = ctx.repos.clients.get(req.params.id)
    if (!cur) throw notFound()
    const c = ctx.db.tx(() => {
      const c = ctx.repos.clients.update(cur.id, { ...b, contact: b.contact ? { ...cur.contact, ...b.contact, email: b.contact.email || null } : cur.contact })!
      if (b.status === 'suspended') for (const u of ctx.repos.users.list(c.id)) if (u.role === 'approver') revokeSessions(ctx, u.id)
      return c
    })
    return { client: clientOut(ctx, c) }
  })

  app.get('/api/v1/users', async (req) => {
    requireUser(ctx, req, ['admin'])
    return { items: ctx.repos.users.list().map((u) => publicUser(ctx, u)) }
  })
  app.post('/api/v1/users', async (req, reply) => {
    requireUser(ctx, req, ['admin'])
    const b = parse(
      z.object({ email: z.string().trim().email().max(200), name: z.string().trim().min(1).max(120), role: z.enum(['admin', 'producer', 'approver']), clientId: z.string().max(64).nullable().optional() }),
      req.body,
    )
    if (b.role === 'approver' && (!b.clientId || !ctx.repos.clients.get(b.clientId))) throw validation({ clientId: 'Người duyệt phải thuộc một khách hàng' })
    if (ctx.repos.users.byEmail(b.email)) throw new AppError(409, 'EMAIL_TAKEN', 'Email đã được dùng', { fields: { email: 'Email đã được dùng' } })
    const u = ctx.db.tx(() => {
      const u = ctx.repos.users.create({ email: b.email, name: b.name, role: b.role, clientId: b.role === 'approver' ? b.clientId! : null })
      const token = issueToken(ctx, u.id, 'invite')
      enqueueEmail(ctx, u.email, 'E1', { name: u.name, token, role: u.role })
      return u
    })
    return reply.status(201).send({ user: publicUser(ctx, u) })
  })
  app.patch<{ Params: { id: string } }>('/api/v1/users/:id', async (req) => {
    requireUser(ctx, req, ['admin'])
    const b = parse(
      z.object({ name: z.string().trim().min(1).max(120).optional(), role: z.enum(['admin', 'producer', 'approver']).optional(), clientId: z.string().max(64).nullable().optional(), status: z.enum(['active', 'disabled']).optional() }),
      req.body,
    )
    const cur = ctx.repos.users.get(req.params.id)
    if (!cur) throw notFound()
    const role = b.role ?? cur.role
    const clientId = role === 'approver' ? (b.clientId ?? cur.clientId) : null
    if (role === 'approver' && (!clientId || !ctx.repos.clients.get(clientId))) throw validation({ clientId: 'Người duyệt phải thuộc một khách hàng' })
    const demotingAdmin = cur.role === 'admin' && cur.status === 'active' && (role !== 'admin' || b.status === 'disabled')
    if (demotingAdmin && ctx.repos.users.countActiveAdmins() <= 1) throw new AppError(409, 'LAST_ADMIN', 'Không thể vô hiệu quản trị viên cuối cùng.')
    const status = b.status === 'active' && cur.status === 'invited' ? 'invited' : (b.status ?? cur.status)
    const u = ctx.db.tx(() => {
      const u = ctx.repos.users.update(cur.id, { name: b.name ?? cur.name, role, clientId, status })!
      if (status === 'disabled' || role !== cur.role || clientId !== cur.clientId) revokeSessions(ctx, u.id)
      return u
    })
    return { user: publicUser(ctx, u) }
  })
  app.post<{ Params: { id: string } }>('/api/v1/users/:id/resend-invite', async (req, reply) => {
    requireUser(ctx, req, ['admin'])
    const u = ctx.repos.users.get(req.params.id)
    if (!u) throw notFound()
    if (u.status !== 'invited') throw new AppError(409, 'INVALID_STATE', 'Tài khoản đã kích hoạt', { extra: { state: u.status } })
    const token = issueToken(ctx, u.id, 'invite')
    enqueueEmail(ctx, u.email, 'E1', { name: u.name, token, role: u.role })
    return reply.status(204).send()
  })
}
