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
