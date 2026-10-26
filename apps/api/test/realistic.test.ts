import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { zipSync, strToU8 } from 'fflate'
import { floorFromRects, itemLevel } from '@hd/core'
import type { HouseDocument } from '@hd/core'
import { makeIO, optimizeItem } from '../src/jobs/modelOptimize.ts'
import { runOneJob } from '../src/jobs/runner.ts'
import { jobHandlers } from '../src/jobs/handlers.ts'
import { buildSnapshot } from '../src/services/snapshot.ts'
import { boxFbx, boxObj, soupGlb, sphereGlb } from './fixtures-glb.ts'
import { makeApp, upload, userWithLogin } from './helpers.ts'
import type { TestApp } from './helpers.ts'

/* Item 03 lát R2 — mô hình đồ chân thực: nhập file, chuẩn hoá, bản nhẹ, nguồn & giấy phép, phạm vi, chặn gửi duyệt. */

const dir = mkdtempSync(join(tmpdir(), 'hd-item-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const AUTO = { unit: 'auto', upAxis: 'auto', declaredMm: null } as const
const file = (name: string, data: string | Uint8Array) => {
  const p = join(dir, name)
  writeFileSync(p, data)
  return p
}
const out = (name: string) => [join(dir, `${name}.glb`), join(dir, `${name}-nhe.glb`)] as const

describe('xử lý mô hình đồ (R2.2)', () => {
  it('OBJ đơn vị cm → mét, gốc ở giữa đáy, báo đã đổi đơn vị (BR-R4)', async () => {
    const { obj } = boxObj()
    const r = await optimizeItem(file('sofa.obj', obj), ...out('obj'), 'obj', AUTO)
    expect(r.normalize).toMatchObject({ format: 'obj', unit: 'cm', upAxis: 'y', measuredMm: [2000, 900, 850] })
    expect(r.normalize.notes.join()).toContain('cm')
    const b = r.report.bbox
    expect(b.min[1]).toBeCloseTo(0, 5)
    expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(0, 5)
    expect((b.min[2] + b.max[2]) / 2).toBeCloseTo(0, 5)
  }, 30_000)

  it('FBX trục Z (3ds Max) + kích thước khai báo → xoay đứng lại, đúng kích thước', async () => {
    const r = await optimizeItem(file('sofa.fbx', boxFbx()), ...out('fbx'), 'fbx', { ...AUTO, declaredMm: [2000, 900, 850] })
    expect(r.normalize).toMatchObject({ format: 'fbx', unit: 'cm', upAxis: 'z', measuredMm: [2000, 900, 850] })
    expect(r.normalize.notes.join()).toContain('trục Z')
    // chọn tay trục Y → giữ nguyên (cao 85, sâu 90)
    const y = await optimizeItem(join(dir, 'sofa.fbx'), ...out('fbx-y'), 'fbx', { unit: 'cm', upAxis: 'y', declaredMm: [2000, 900, 850] })
    expect(y.normalize.measuredMm).toEqual([2000, 850, 900])
  }, 30_000)

  it('ZIP gồm OBJ + MTL + ảnh vân → texture vào GLB; bản nhẹ ≤ 512 px', async () => {
    // ảnh một màu bị prune() đổi thành màu nền → dùng ảnh nhiễu
    const png = await sharp({ create: { width: 2048, height: 2048, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).png().toBuffer()
    const { obj, mtl } = boxObj('textures/vai.png')
    const zip = zipSync({ 'sofa/sofa.obj': strToU8(obj), 'sofa/sofa.mtl': strToU8(mtl), 'sofa/textures/vai.png': new Uint8Array(png), '__MACOSX/._sofa.obj': strToU8('x') })
    const [full, light] = out('zip')
    const r = await optimizeItem(file('sofa.zip', zip), full, light, 'zip', AUTO)
    expect(r.normalize.format).toBe('obj')
    expect(r.report.maxTexturePx).toBe(2048)
    expect(r.lightReport.maxTexturePx).toBe(512)
    const doc = await (await makeIO()).read(full)
    expect(doc.getRoot().listTextures()[0].getMimeType()).toBe('image/webp')
  }, 30_000)

  it('OBJ trỏ ảnh texture không có trong tệp → vẫn xử lý, cảnh báo nén ảnh chung', async () => {
    const { obj } = boxObj()
    const { mtl } = boxObj('C:\\Users\\dung\\Desktop\\vai-lanh.jpg')
    const zip = zipSync({ 'sofa.obj': strToU8(obj), 'sofa.mtl': strToU8(mtl) })
    const r = await optimizeItem(file('thieu-anh.zip', zip), ...out('thieu-anh'), 'zip', AUTO)
    expect(r.warnings.join()).toContain('vai-lanh.jpg')
  }, 30_000)

  it('lưới 120.000 tam giác → bản đầy đủ ≤ 50.000, bản nhẹ ≤ 5.000, mức Đạt (AC-R1)', async () => {
    const r = await optimizeItem(file('cau.glb', await sphereGlb(245)), ...out('cau'), 'glb', { ...AUTO, declaredMm: [1000, 1000, 1000] })
    expect(r.report.triangles).toBeLessThanOrEqual(50_000)
    expect(r.report.triangles).toBeGreaterThan(20_000)
    expect(r.lightReport.triangles).toBeLessThanOrEqual(5_000)
    expect(itemLevel(r.report, 'full').level).toBe('ok')
    expect(itemLevel(r.lightReport, 'light').level).toBe('ok')
    expect(r.normalize.measuredMm.every((v) => Math.abs(v - 1000) <= 30)).toBe(true)
  }, 60_000)
})

describe('API thư viện đồ chân thực (R2.4)', () => {
  let t: TestApp
  let admin = ''
  let producer = ''
  let clientA = ''
  let clientB = ''
  let projectA = ''
  let modelId = ''
  let itemId = ''
  const job = () => runOneJob(t.ctx, 'model', jobHandlers(t.ctx).model)

  beforeAll(async () => {
    t = await makeApp()
    admin = await userWithLogin(t, 'admin@test.vn', 'admin')
    producer = await userWithLogin(t, 'dung@test.vn', 'producer')
    clientA = (await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'Nội thất An Phát' } })).json.client.id
    clientB = (await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'Sunrise Land' } })).json.client.id
    projectA = (await t.call('POST', '/api/v1/projects', { cookie: admin, body: { clientId: clientA, slug: 'du-an-an-phat', name: 'An Phát', contact: { leadEmails: ['a@a.vn'] } } })).json.project.id
  }, 60_000)
  afterAll(async () => t.close())

  it('tải FBX kèm kích thước khai báo → job → sẵn sàng, có bản nhẹ, kích thước đo được', async () => {
    const up = await upload(t, '/api/v1/library/models', producer, { name: 'sofa-an-phat.fbx', content: boxFbx() }, { declaredMm: '2000,900,850' })
    expect(up.status, JSON.stringify(up.json)).toBe(202)
    modelId = up.json.model.id
    expect(await job()).toBe(true)
    const m = (await t.call('GET', `/api/v1/models/${modelId}`, { cookie: producer })).json.model
    expect(m).toMatchObject({ status: 'ready', level: 'ok', normalize: { declaredMm: [2000, 900, 850], result: { upAxis: 'z', measuredMm: [2000, 900, 850] } } })
    expect(m.lightUrl).toMatch(/^\/files\/model_optimized\//)
    expect(m.lightReport.triangles).toBeLessThanOrEqual(5000)
    expect((await upload(t, '/api/v1/library/models', producer, { name: 'sofa.skp', content: 'x' })).status).toBe(415)
  }, 60_000)

  it('mô hình vượt mức Chặn sau khi tự giảm → lỗi nêu số liệu (AC-R2)', async () => {
    const up = await upload(t, '/api/v1/library/models', producer, { name: 'den-chum.glb', content: Buffer.from(await soupGlb(150_000)) })
    await job()
    const m = (await t.call('GET', `/api/v1/models/${up.json.model.id}`, { cookie: producer })).json.model
    expect(m.status).toBe('failed')
    expect(m.error).toMatch(/quá nặng.*tam giác/)
    expect(m.url).toBeNull()
  }, 120_000)

  it('lệch kích thước > 20% → SIZE_MISMATCH, chọn co giãn thì lưu được; 0% thì không hỏi (BR-R4)', async () => {
    const base = { name: 'Sofa An Phát', category: 'sofa', fallbackShape: 'sofa', modelAssetId: modelId, productCode: 'AP-SF-220', sourceKind: 'client_file', sourceName: 'Nội thất An Phát' }
    const bad = await t.call('POST', '/api/v1/library/items', { cookie: producer, body: { ...base, sizeMm: [1500, 900, 850] } })
    expect([bad.status, bad.json.error.code]).toEqual([422, 'SIZE_MISMATCH'])
    expect(bad.json.error.measuredMm).toEqual([2000, 900, 850])
    const forced = await t.call('POST', '/api/v1/library/items', { cookie: producer, body: { ...base, name: 'Sofa co giãn', sizeMm: [1500, 900, 850], acceptSizeMismatch: true } })
    expect(forced.status, forced.body).toBe(201)
    expect(forced.json.item.sizeDeviation).toBeCloseTo(33.3, 0)
    const ok = await t.call('POST', '/api/v1/library/items', { cookie: producer, body: { ...base, sizeMm: [2000, 900, 850] } })
    expect(ok.status, ok.body).toBe(201)
    itemId = ok.json.item.id
    expect(ok.json.item).toMatchObject({ status: 'draft', sizeDeviation: 0, productCode: 'AP-SF-220', model: { normalized: true } })
    expect(ok.json.item.model.lightUrl).toBeTruthy()
  })

  it('chỉ QTV duyệt; thiếu giấy phép → LICENSE_INCOMPLETE; sửa giấy phép món đã duyệt → về Nháp (FR-13.04, 13.05)', async () => {
    expect((await t.call('POST', `/api/v1/library/items/${itemId}/approve`, { cookie: producer })).status).toBe(403)
    const r = await t.call('POST', `/api/v1/library/items/${itemId}/approve`, { cookie: admin })
    expect([r.status, r.json.error.code]).toEqual([422, 'LICENSE_INCOMPLETE'])
    await t.call('PATCH', `/api/v1/library/items/${itemId}`, { cookie: producer, body: { license: 'commercial' } })
    expect((await t.call('POST', `/api/v1/library/items/${itemId}/approve`, { cookie: admin })).json.item.status).toBe('ready')
    expect((await t.call('PATCH', `/api/v1/library/items/${itemId}`, { cookie: producer, body: { description: 'Sofa vải lanh' } })).json.item.status).toBe('ready')
    expect((await t.call('PATCH', `/api/v1/library/items/${itemId}`, { cookie: producer, body: { license: 'cc0' } })).json.item.status).toBe('draft')
    await t.call('PATCH', `/api/v1/library/items/${itemId}`, { cookie: producer, body: { license: 'commercial' } })
    await t.call('POST', `/api/v1/library/items/${itemId}/approve`, { cookie: admin })
  })

  it('xử lý lại với trục chọn tay → món về Nháp, phải chọn lại xử lý lệch kích thước', async () => {
    const r = await t.call('POST', `/api/v1/models/${modelId}/reprocess`, { cookie: producer, body: { unit: 'cm', upAxis: 'y', declaredMm: [2000, 900, 850] } })
    expect(r.status, r.body).toBe(202)
    expect(r.json.model.status).toBe('processing')
    expect(t.ctx.repos.library.get(itemId)!.status).toBe('draft')
    await job()
    const m = (await t.call('GET', `/api/v1/models/${modelId}`, { cookie: producer })).json.model
    expect(m.normalize.result).toMatchObject({ upAxis: 'y', measuredMm: [2000, 850, 900] })
    // trả lại trục tự nhận
    await t.call('POST', `/api/v1/models/${modelId}/reprocess`, { cookie: producer, body: { declaredMm: [2000, 900, 850] } })
    await job()
    expect((await t.call('POST', `/api/v1/library/items/${itemId}/approve`, { cookie: admin })).json.item.status).toBe('ready')
  }, 60_000)

  it('phạm vi khách: chỉ QTV gán; món của khách A chỉ hiện khi dựng cho khách A (BR-R3, AC-R4)', async () => {
    expect((await t.call('PATCH', `/api/v1/library/items/${itemId}`, { cookie: producer, body: { clientId: clientA } })).status).toBe(403)
    const p = await t.call('PATCH', `/api/v1/library/items/${itemId}`, { cookie: admin, body: { clientId: clientA } })
    expect(p.json.item).toMatchObject({ clientId: clientA, clientName: 'Nội thất An Phát', status: 'draft' })
    await t.call('POST', `/api/v1/library/items/${itemId}/approve`, { cookie: admin })
    const names = async (q: string, cookie = producer) => (await t.call('GET', `/api/v1/library/items${q}`, { cookie })).json.items?.map((i: { name: string }) => i.name)
    expect(await names('')).not.toContain('Sofa An Phát')
    expect(await names(`?clientId=${clientA}`)).toContain('Sofa An Phát')
    expect(await names(`?clientId=${clientB}`)).not.toContain('Sofa An Phát')
    expect(await names('?all=1', admin)).toContain('Sofa An Phát')
    expect((await t.call('GET', '/api/v1/library/items?all=1', { cookie: producer })).status).toBe(403)
  })

  it('đồ nháp chặn gửi duyệt; đồ của khách khác không lưu được; snapshot có bản nhẹ + ghi công (AC-R3, FR-13.16, 13.17)', async () => {
    const h = await t.call('POST', `/api/v1/projects/${projectA}/houses`, { cookie: producer, body: { name: 'Căn A', slug: 'can-a', houseType: 'apartment', declaredArea: 60 } })
    const vid = h.json.version.id
    const v = (await t.call('GET', `/api/v1/versions/${vid}`, { cookie: producer })).json
    const f = floorFromRects({ name: 'T1', order: 1, elevation: 0, rooms: [{ name: 'Khách', function: 'living', rect: [0, 0, 5000, 4000] }], openings: [{ kind: 'door', axis: 'x', at: 0, from: 600, to: 1500 }] })
    f.items.push({ id: 'sofa1', source: { libraryItemId: itemId }, position: [2500, 3000], rotation: 0, elevation: 0 })
    const save = (doc: HouseDocument, rev: number) => t.call('PUT', `/api/v1/versions/${vid}/document`, { cookie: producer, body: { document: doc }, headers: { 'if-match': String(rev) } })
    const doc: HouseDocument = { ...v.document, floors: [f] }

    await t.call('PATCH', `/api/v1/library/items/${itemId}`, { cookie: producer, body: { attribution: 'Sofa — Nội thất An Phát' } })
    const s1 = await save(doc, v.revision)
    expect(s1.status, s1.body).toBe(200)
    expect(s1.json.checks.find((c: { code: string }) => c.code === 'ITEM_NOT_READY')).toMatchObject({ level: 'block', objectId: itemId })
    // ngân sách hai bản
    expect(s1.json.checks.some((c: { code: string }) => c.code.startsWith('BUDGET'))).toBe(false)

    await t.call('POST', `/api/v1/library/items/${itemId}/approve`, { cookie: admin })
    const vv = (await t.call('GET', `/api/v1/versions/${vid}`, { cookie: producer })).json
    expect(vv.checks.some((c: { code: string }) => c.code === 'ITEM_NOT_READY')).toBe(false)

    // đồ của khách B → không lưu được vào nhà của khách A
    const other = (await t.call('POST', '/api/v1/library/items', { cookie: admin, body: { name: 'Ghế Sunrise', category: 'chair', sizeMm: [450, 850, 500], fallbackShape: 'chair', clientId: clientB } })).json.item.id
    const f2 = structuredClone(f)
    f2.items.push({ ...f.items[0], id: 'ghe1', source: { libraryItemId: other } })
    const s2 = await save({ ...doc, floors: [f2] }, vv.revision)
    expect(s2.json.error.code).toBe('DOCUMENT_INVALID')
    expect(Object.values(s2.json.error.fields)).toContain('Đồ thuộc khách hàng khác')

    const snap = buildSnapshot(t.ctx, JSON.stringify(doc), t.ctx.repos.houses.get(h.json.house.id)!).snapshot
    const li = snap.resolved.libraryItems[itemId]
    expect(li).toMatchObject({ productCode: 'AP-SF-220', clientName: 'Nội thất An Phát', modelNormalized: true, credit: { license: 'commercial', attribution: 'Sofa — Nội thất An Phát' } })
    expect(li.modelLightUrl).toMatch(/^\/files\/model_optimized\//)
    expect(snap.resolved.models[modelId].lightUrl).toBe(li.modelLightUrl)
  }, 60_000)
})
