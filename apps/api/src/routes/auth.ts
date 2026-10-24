import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { nowIso } from '../db/sqlite.ts'
import type { Ctx } from '../context.ts'
import { AppError } from '../lib/errors.ts'
import { createSession, currentUser, destroySession, hashPassword, newToken, requireUser, revokeSessions, sha256, verifyPassword } from '../lib/auth.ts'
import { parse } from '../lib/validate.ts'
import { slidingWindow } from '../lib/rateLimit.ts'
import { enqueueEmail } from '../services/mail.ts'
import type { User } from '../repos/types.ts'

const MAX_FAILED = 5
const LOCK_MS = 15 * 60_000

export const publicUser = (ctx: Ctx, u: Pick<User, 'id' | 'email' | 'name' | 'role' | 'clientId'> & { status?: string }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status ?? 'active',
  clientId: u.clientId,
  clientName: u.clientId ? ctx.repos.clients.get(u.clientId)?.name ?? null : null,
})

/** Phát token mời/đặt lại (chỉ lưu sha256 — 02a §3). */
export const issueToken = (ctx: Ctx, userId: string, kind: 'invite' | 'reset') => {
  const token = newToken()
  const ttl = kind === 'invite' ? 72 * 3600_000 : 3600_000
  ctx.db.run("UPDATE tokens SET used_at=? WHERE user_id=? AND kind=? AND used_at IS NULL", nowIso(), userId, kind)
  ctx.db.run('INSERT INTO tokens (id, user_id, kind, expires_at) VALUES (?,?,?,?)', sha256(token), userId, kind, new Date(Date.now() + ttl).toISOString())
  return token
}

/** API-01…05. */
export const registerAuth = async (app: FastifyInstance, ctx: Ctx) => {
  // băm giả để email không tồn tại tốn cùng thời gian (R-G3-10)
  const dummyHash = await hashPassword(newToken())
  const forgotByEmail = slidingWindow(3, 3600_000)
  app.post('/api/v1/auth/login', async (req, reply) => {
    const b = parse(z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }), req.body)
    const u = ctx.repos.users.byEmail(b.email)
    const bad = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu chưa đúng.')
    if (!u) {
      await verifyPassword(b.password, dummyHash)
      throw bad()
    }
    if (u.lockedUntil && u.lockedUntil > nowIso())
      throw new AppError(423, 'ACCOUNT_LOCKED', 'Tài khoản tạm khoá 15 phút do nhập sai nhiều lần.', { extra: { lockedUntil: u.lockedUntil } })
    const ok = await verifyPassword(b.password, u.passwordHash)
    if (!ok) {
      const failed = u.failedLogins + 1
      const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS).toISOString() : null
      ctx.repos.users.update(u.id, { failedLogins: lock ? 0 : failed, lockedUntil: lock })
      if (lock) throw new AppError(423, 'ACCOUNT_LOCKED', 'Tài khoản tạm khoá 15 phút do nhập sai nhiều lần.', { extra: { lockedUntil: lock } })
      throw bad()
    }
    const client = u.clientId ? ctx.repos.clients.get(u.clientId) : undefined
    if (u.status !== 'active' || (u.role === 'approver' && client?.status !== 'active'))
      throw new AppError(403, 'ACCOUNT_DISABLED', 'Tài khoản không còn hoạt động. Liên hệ nhà cung cấp.')
    ctx.repos.users.update(u.id, { failedLogins: 0, lockedUntil: null })
    createSession(ctx, reply, u.id)
    return { user: publicUser(ctx, u) }
  })

  app.post('/api/v1/auth/logout', async (req, reply) => {
    destroySession(ctx, req, reply)
    return reply.status(204).send()
  })

  app.get('/api/v1/auth/me', async (req) => {
    const u = requireUser(ctx, req)
    return { user: publicUser(ctx, u) }
  })

  app.post('/api/v1/auth/password/forgot', async (req, reply) => {
    const b = parse(z.object({ email: z.string().email().max(200) }), req.body)
    const u = ctx.repos.users.byEmail(b.email)
    // tối đa 3 email E2 / giờ / địa chỉ; vẫn trả 204 để không lộ (R-G3-12)
    if (u && u.status === 'active' && forgotByEmail.hit(u.email.toLowerCase())) {
      const token = issueToken(ctx, u.id, 'reset')
      enqueueEmail(ctx, u.email, 'E2', { name: u.name, token, role: u.role })
    }
    return reply.status(204).send()
  })

  app.post('/api/v1/auth/password/set', async (req, reply) => {
    const b = parse(z.object({ token: z.string().min(10).max(200), password: z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự').max(200) }), req.body)
    const row = ctx.db.get<{ user_id: string; expires_at: string; used_at: string | null; kind: string }>('SELECT user_id, expires_at, used_at, kind FROM tokens WHERE id = ?', sha256(b.token))
    if (!row || row.used_at || row.expires_at < nowIso()) throw new AppError(400, 'TOKEN_INVALID', 'Liên kết đã hết hạn. Yêu cầu gửi lại.')
    const u = ctx.repos.users.get(row.user_id)
    if (!u || u.status === 'disabled') throw new AppError(400, 'TOKEN_INVALID', 'Liên kết đã hết hạn. Yêu cầu gửi lại.')
    const hash = await hashPassword(b.password)
    ctx.db.tx(() => {
      ctx.db.run('UPDATE tokens SET used_at=? WHERE id=?', nowIso(), sha256(b.token))
      ctx.repos.users.update(u.id, { passwordHash: hash, status: 'active', failedLogins: 0, lockedUntil: null })
      revokeSessions(ctx, u.id)
    })
    createSession(ctx, reply, u.id)
    return { user: publicUser(ctx, { ...u, status: 'active' }) }
  })

  void currentUser
}
