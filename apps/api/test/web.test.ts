import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeApp } from './helpers.ts'
import type { TestApp } from './helpers.ts'

let t: TestApp
let dist = ''

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'hd-dist-'))
  mkdirSync(join(dist, 'assets'))
  writeFileSync(join(dist, 'viewer.html'), '<html><head><!--OG--></head><body>viewer</body></html>')
  writeFileSync(join(dist, 'app.html'), '<html><body>app</body></html>')
  writeFileSync(join(dist, 'assets', 'x.js'), 'console.log(1)')
  t = await makeApp({ webDist: dist })
})
afterAll(async () => {
  await t.close()
  rmSync(dist, { recursive: true, force: true })
})

describe('phục vụ web build (routes/web.ts)', () => {
  it('tệp trong assets/ có cache dài hạn, không làm sập server', async () => {
    const r = await t.call('GET', '/assets/x.js')
    expect(r.status).toBe(200)
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect((await t.call('GET', '/healthz')).status).toBe(200)
  })
  it('viewer và app có CSP riêng; app không cho nhúng', async () => {
    const v = await t.call('GET', '/v/khong-co')
    expect(v.body).toContain('viewer')
    expect(String(v.headers['content-security-policy'])).toContain('frame-ancestors *')
    expect(String(v.headers['content-security-policy'])).toContain("media-src 'self' blob:")
    const a = await t.call('GET', '/studio/projects')
    expect(String(a.headers['content-security-policy'])).toContain("frame-ancestors 'none'")
    expect(a.headers['x-robots-tag']).toBe('noindex')
  })
})
