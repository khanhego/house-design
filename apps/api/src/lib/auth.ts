import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Ctx } from '../context.ts'
import { nowIso } from '../db/sqlite.ts'
import { forbidden, unauthenticated } from './errors.ts'
import type { AuthUser } from '../services/access.ts'
import type { Role } from '../repos/types.ts'

export const SESSION_COOKIE = 'sid'
const SESSION_DAYS = 14
const N = 2 ** 15

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

const scryptAsync = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(pw, salt, 64, { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 }, (err, key) => (err ? reject(err) : resolve(key))),
  )

/** scrypt (N=2^15, r=8, p=1, salt 16 byte) — 02 §8. */
export const hashPassword = async (pw: string) => {
  const salt = randomBytes(16)
  const key = await scryptAsync(pw, salt)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export const verifyPassword = async (pw: string, stored: string | null) => {
  if (!stored?.startsWith('scrypt$')) return false
  const [, s, k] = stored.split('$')
  const key = await scryptAsync(pw, Buffer.from(s, 'base64'))
  const expect = Buffer.from(k, 'base64')
  return key.length === expect.length && timingSafeEqual(key, expect)
}

export const newToken = () => randomBytes(32).toString('base64url')

export const createSession = (ctx: Ctx, reply: FastifyReply, userId: string) => {
  const token = newToken()
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5)
  ctx.db.run('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?,?,?,?)', sha256(token), userId, expires.toISOString(), nowIso())
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.cfg.cookieSecure,
    expires,
  })
}

export const destroySession = (ctx: Ctx, req: FastifyRequest, reply: FastifyReply) => {
  const token = req.cookies[SESSION_COOKIE]
  if (token) ctx.db.run('DELETE FROM sessions WHERE id = ?', sha256(token))
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

export const revokeSessions = (ctx: Ctx, userId: string) => ctx.db.run('DELETE FROM sessions WHERE user_id = ?', userId)

/**
 * Đọc người dùng từ cookie; kiểm lại trạng thái mỗi request (R-19).
 * Phiên trượt: gia hạn khi còn < 7 ngày.
 */
export const currentUser = (ctx: Ctx, req: FastifyRequest): AuthUser | null => {
  const token = req.cookies[SESSION_COOKIE]
  if (!token) return null
  const sid = sha256(token)
  const row = ctx.db.get<{ user_id: string; expires_at: string }>('SELECT user_id, expires_at FROM sessions WHERE id = ?', sid)
  if (!row || row.expires_at < nowIso()) return null
  const u = ctx.repos.users.get(row.user_id)
  if (!u || u.status !== 'active') return null
  if (u.role === 'approver') {
    const c = u.clientId ? ctx.repos.clients.get(u.clientId) : undefined
    if (!c || c.status !== 'active') return null
  }
  if (Date.parse(row.expires_at) - Date.now() < 7 * 864e5) {
    ctx.db.run('UPDATE sessions SET expires_at = ? WHERE id = ?', new Date(Date.now() + SESSION_DAYS * 864e5).toISOString(), sid)
  }
  return { id: u.id, name: u.name, email: u.email, role: u.role, clientId: u.clientId }
}

export const requireUser = (ctx: Ctx, req: FastifyRequest, roles?: Role[]): AuthUser => {
  const u = currentUser(ctx, req)
  if (!u) throw unauthenticated()
  if (roles && !roles.includes(u.role)) throw forbidden()
  return u
}
