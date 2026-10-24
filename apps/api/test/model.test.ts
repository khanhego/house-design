import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { optimizeGlb, makeIO } from '../src/jobs/modelOptimize.ts'
import { runWorker } from '../src/jobs/modelJob.ts'
import { runOneJob } from '../src/jobs/runner.ts'
import { jobHandlers } from '../src/jobs/handlers.ts'
import { syntheticGlb } from './fixtures-glb.ts'
import { makeApp, upload, userWithLogin } from './helpers.ts'
import type { TestApp } from './helpers.ts'

const dir = mkdtempSync(join(tmpdir(), 'hd-glb-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('spike GLB (02a §7, N-02)', () => {
  it('2.000 mesh, 40 vật liệu, 30 item_ (15 nhóm lồng 3 cấp), 60 wall_ → giữ tên, draw call phần không tên ≤ 40', async () => {
    const glb = await syntheticGlb({ meshes: 2000, materials: 40, items: 30, walls: 60 })
    const input = join(dir, 'spike.glb')
    const output = join(dir, 'spike-opt.glb')
    writeFileSync(input, glb)
    const { report } = await optimizeGlb(input, output)
    const items = report.nodeNames.filter((n) => n.startsWith('item_'))
    const walls = report.nodeNames.filter((n) => n.startsWith('wall_'))
    expect(items).toHaveLength(30)
    expect(walls).toHaveLength(60)
    // đọc lại bằng decoder meshopt: mỗi item_/wall_ là một node mesh, không còn con
    const io = await makeIO()
    const doc = await io.read(output)
    const named = doc.getRoot().listNodes().filter((n) => /^(item_|wall_)/.test(n.getName()))
    expect(named.every((n) => n.getMesh() && n.listChildren().length === 0)).toBe(true)
    const nested = doc.getRoot().listNodes().find((n) => n.getName() === 'item_do_0')!
    expect(nested.getMesh()!.listPrimitives().length).toBeGreaterThan(0)
    const unnamedDrawCalls = report.drawCalls - named.reduce((s, n) => s + n.getMesh()!.listPrimitives().length, 0)
    expect(unnamedDrawCalls).toBeLessThanOrEqual(40)
    expect(report.triangles).toBe(2000 * 12)
    expect(report.fileBytes).toBeLessThan(glb.byteLength)
    console.log(`spike: ${glb.byteLength} → ${report.fileBytes} bytes, drawCalls ${report.drawCalls} (không tên ${unnamedDrawCalls}), tam giác ${report.triangles}`)
  }, 60_000)

  it('worker thread: tệp rác → lỗi tiếng Việt (EX-1)', async () => {
    const input = join(dir, 'rac.glb')
    writeFileSync(input, 'không phải glb')
    const r = await runWorker(input, join(dir, 'rac-opt.glb'))
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Không đọc được tệp mô hình')
  }, 30_000)
  void NodeIO
})

describe('API-37/38 + job', () => {
  let t: TestApp
  beforeAll(async () => {
    t = await makeApp()
  })
  afterAll(async () => t.close())
  it('tải GLB → processing → job → ready + báo cáo', async () => {
    const admin = await userWithLogin(t, 'admin@test.vn', 'admin')
    const cli = (await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'KH' } })).json.client.id
    const prj = (await t.call('POST', '/api/v1/projects', { cookie: admin, body: { clientId: cli, slug: 'du-an-m', name: 'M' } })).json.project.id
    const glb = Buffer.from(await syntheticGlb({ meshes: 50, materials: 4, items: 3, walls: 4 }))
    const up = await upload(t, `/api/v1/projects/${prj}/models`, admin, { name: 'tang-1.glb', content: glb })
    expect(up.status).toBe(202)
    expect(up.json.model.status).toBe('processing')
    expect(await runOneJob(t.ctx, 'model', jobHandlers(t.ctx).model)).toBe(true)
    const m = await t.call('GET', `/api/v1/models/${up.json.model.id}`, { cookie: admin })
    expect(m.json.model).toMatchObject({ status: 'ready', level: 'ok' })
    expect(m.json.model.report.nodeNames).toHaveLength(7)
    expect(m.json.model.url).toMatch(/^\/files\/model_optimized\//)
    const bad = await upload(t, `/api/v1/projects/${prj}/models`, admin, { name: 'tang-1.skp', content: 'x' })
    expect(bad.status).toBe(415)
  }, 60_000)
})
