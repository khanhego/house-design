import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../src/config.ts'
import type { Config } from '../src/config.ts'
import { buildApp } from '../src/server.ts'
import type { App } from '../src/server.ts'

export interface TestApp extends App {
  dir: string
  /** gọi API kèm header CSRF và cookie (nếu có) */
  call: (method: string, url: string, opts?: { body?: unknown; cookie?: string; headers?: Record<string, string> }) => Promise<{ status: number; json: any; headers: Record<string, unknown>; body: string }>
}

export const makeApp = async (overrides: Partial<Config> = {}): Promise<TestApp> => {
  const dir = mkdtempSync(join(tmpdir(), 'hd-api-'))
  const cfg = loadConfig({ NODE_ENV: 'test', DATA_DIR: dir, PUBLIC_BASE_URL: 'http://localhost:5173' }, { formTokenSecret: 'test-secret', ...overrides })
  const built = await buildApp(cfg, { dbFile: ':memory:', logger: false })
  const call: TestApp['call'] = async (method, url, opts = {}) => {
    const headers: Record<string, string> = { 'x-requested-with': 'fetch', ...opts.headers }
    if (opts.cookie) headers.cookie = opts.cookie
    const res = await built.app.inject({ method: method as 'GET', url, headers, payload: opts.body as object | undefined })
    let json: unknown = null
    try {
      json = JSON.parse(res.body)
    } catch {
      json = null
    }
    return { status: res.statusCode, json, headers: res.headers as Record<string, unknown>, body: res.body }
  }
  return {
    ...built,
    dir,
    call,
    close: async () => {
      await built.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

import { hashPassword } from '../src/lib/auth.ts'

/** Tạo người dùng active và đăng nhập, trả cookie. */
export const userWithLogin = async (t: TestApp, email: string, role: 'admin' | 'producer' | 'approver', clientId: string | null = null, password = 'matkhau123') => {
  if (!t.ctx.repos.users.byEmail(email)) {
    t.ctx.repos.users.create({ email, name: email.split('@')[0], role, clientId, status: 'active', passwordHash: await hashPassword(password) })
  }
  return login(t, email, password)
}

export const login = async (t: TestApp, email: string, password: string) => {
  const r = await t.call('POST', '/api/v1/auth/login', { body: { email, password } })
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${r.body}`)
  const set = r.headers['set-cookie'] as string | string[]
  return (Array.isArray(set) ? set[0] : set).split(';')[0]
}

export const outbox = (t: TestApp, template?: string) =>
  t.ctx.db.all<{ to_addr: string; template: string; data_json: string; lead_id: string | null }>(
    template ? 'SELECT * FROM outbox_emails WHERE template = ? ORDER BY created_at' : 'SELECT * FROM outbox_emails ORDER BY created_at',
    ...(template ? [template] : []),
  ).map((r) => ({ ...r, data: JSON.parse(r.data_json) }))

/** Gửi multipart (trường form trước, tệp sau). */
export const upload = async (t: TestApp, url: string, cookie: string, file: { name: string; content: Buffer | string; type?: string }, fields: Record<string, string> = {}) => {
  const boundary = '----hdtest' + Math.random().toString(16).slice(2)
  const parts: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type ?? 'application/octet-stream'}\r\n\r\n`))
  parts.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content))
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  const res = await t.app.inject({
    method: 'POST', url, payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-requested-with': 'fetch', cookie },
  })
  return { status: res.statusCode, json: JSON.parse(res.body || '{}') }
}
