import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { floorFromRects } from '@hd/core'
import type { HouseDocument } from '@hd/core'
import { makeApp, upload, userWithLogin } from './helpers.ts'
import type { TestApp } from './helpers.ts'
import { seedDemo } from '../src/seed/seed.ts'
import { MATERIAL_CATALOG } from '../src/seed/materialCatalog.ts'

/* Item 03 lát R1 — thư viện vật liệu (API-M1…M5), phạm vi khách (BR-R3), giấy phép (BR-R1), snapshot công khai. */

let t: TestApp
let admin: string
let producer: string
let clientA = ''
let clientB = ''
let projectA = ''

const texture = (color: string) => sharp({ create: { width: 2048, height: 2048, channels: 3, background: color } }).jpeg().toBuffer()
const body = (key: string, extra: Record<string, unknown> = {}) => ({
  key, name: `Vật liệu ${key}`, category: 'tile', tileMm: [600, 600], color: '#dddddd', roughness: 0.4, sourceKind: 'client_file', sourceName: 'Catalog khách', ...extra,
})

beforeAll(async () => {
  t = await makeApp()
  admin = await userWithLogin(t, 'admin@test.vn', 'admin')
  producer = await userWithLogin(t, 'dung@test.vn', 'producer')
  clientA = (await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'Nội thất An Phát' } })).json.client.id
  clientB = (await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'Sunrise Land' } })).json.client.id
  projectA = (await t.call('POST', '/api/v1/projects', { cookie: admin, body: { clientId: clientA, slug: 'du-an-an-phat', name: 'An Phát', contact: { leadEmails: ['a@a.vn'] } } })).json.project.id
}, 60_000)
afterAll(async () => t.close())

describe('thư viện vật liệu', () => {
  let matId = ''
  it('tạo nháp, tải ảnh vân → 2 cỡ 1024 + 256 JPEG; người duyệt không vào được (API-M1…M4)', async () => {
    const r = await t.call('POST', '/api/v1/materials', { cookie: producer, body: body('gach-600-an-phat', { clientId: clientA, license: 'client_exclusive' }) })
    expect(r.status, r.body).toBe(201)
    matId = r.json.item.id
    expect(r.json.item.status).toBe('draft')
    expect((await t.call('POST', '/api/v1/materials', { cookie: producer, body: body('gach-600-an-phat') })).json.error.fields.key).toBeTruthy()
    const up = await upload(t, `/api/v1/materials/${matId}/textures`, producer, { name: 'gach.jpg', content: await texture('#c0b0a0'), type: 'image/jpeg' }, { map: 'color' })
    expect(up.status, JSON.stringify(up.json)).toBe(201)
    const maps = up.json.item.maps.color
    const full = await sharp((await t.app.inject({ method: 'GET', url: maps.full, headers: { cookie: producer } })).rawPayload).metadata()
    const small = await sharp((await t.app.inject({ method: 'GET', url: maps.small, headers: { cookie: producer } })).rawPayload).metadata()
    expect([full.width, full.format]).toEqual([1024, 'jpeg'])
    expect(small.width).toBe(256)
    expect((await upload(t, `/api/v1/materials/${matId}/textures`, producer, { name: 'a.jpg', content: await texture('#000') }, { map: 'gloss' })).status).toBe(400)
    const approver = await userWithLogin(t, 'duyet@ap.vn', 'approver', clientA)
    expect((await t.call('GET', '/api/v1/materials', { cookie: approver })).status).toBe(403)
  })

  it('chỉ QTV duyệt; thiếu giấy phép / CC BY thiếu ghi công thì không duyệt được (BR-R1, FR-13.05)', async () => {
    expect((await t.call('POST', `/api/v1/materials/${matId}/approve`, { cookie: producer })).status).toBe(403)
    const noLic = (await t.call('POST', '/api/v1/materials', { cookie: producer, body: body('khong-giay-phep') })).json.item.id
    const r = await t.call('POST', `/api/v1/materials/${noLic}/approve`, { cookie: admin })
    expect([r.status, r.json.error.code]).toEqual([422, 'LICENSE_INCOMPLETE'])
    const ccby = (await t.call('POST', '/api/v1/materials', { cookie: producer, body: body('cc-by-thieu', { license: 'cc_by' }) })).json.item.id
    expect((await t.call('POST', `/api/v1/materials/${ccby}/approve`, { cookie: admin })).json.error.message).toContain('ghi công')
    const ok = await t.call('POST', `/api/v1/materials/${matId}/approve`, { cookie: admin })
    expect(ok.json.item.status).toBe('ready')
    // sửa vật liệu đã duyệt → về nháp
    expect((await t.call('PATCH', `/api/v1/materials/${matId}`, { cookie: producer, body: { roughness: 0.3 } })).json.item.status).toBe('draft')
    await t.call('POST', `/api/v1/materials/${matId}/approve`, { cookie: admin })
  })

  it('vật liệu của khách A chỉ thấy khi lọc theo khách A, không dùng được trong dự án khách khác (BR-R3)', async () => {
    const shared = (await t.call('GET', '/api/v1/materials', { cookie: producer })).json.items.map((m: { key: string }) => m.key)
    expect(shared).not.toContain('gach-600-an-phat')
    const forA = (await t.call('GET', `/api/v1/materials?clientId=${clientA}`, { cookie: producer })).json.items.map((m: { key: string }) => m.key)
    expect(forA).toContain('gach-600-an-phat')
    const forB = (await t.call('GET', `/api/v1/materials?clientId=${clientB}`, { cookie: producer })).json.items.map((m: { key: string }) => m.key)
    expect(forB).not.toContain('gach-600-an-phat')

    const projectB = (await t.call('POST', '/api/v1/projects', { cookie: admin, body: { clientId: clientB, slug: 'du-an-b', name: 'B', contact: { leadEmails: ['b@b.vn'] } } })).json.project.id
    const h = await t.call('POST', `/api/v1/projects/${projectB}/houses`, { cookie: producer, body: { name: 'Nhà B', slug: 'nha-b', houseType: 'townhouse', declaredArea: 60 } })
    const v = (await t.call('GET', `/api/v1/versions/${h.json.version.id}`, { cookie: producer })).json
    const f = floorFromRects({ name: 'T1', order: 1, elevation: 0, rooms: [{ name: 'WC', function: 'wc', rect: [0, 0, 2000, 2000] }], openings: [{ kind: 'door', axis: 'x', at: 0, from: 600, to: 1400 }] })
    f.rooms[0].finish = { floor: matId }
    const doc: HouseDocument = { ...v.document, floors: [f] }
    const r = await t.call('PUT', `/api/v1/versions/${h.json.version.id}/document`, { cookie: producer, body: { document: doc }, headers: { 'if-match': String(v.revision) } })
    expect(r.json.error.code).toBe('DOCUMENT_INVALID')
    expect(Object.values(r.json.error.fields)).toContain('Vật liệu thuộc khách hàng khác')
  })

  it('vật liệu nháp chặn gửi duyệt; đã duyệt thì vào snapshot và ảnh vân công khai sau phát hành (FR-13.16, BR-R6)', async () => {
    const draft = (await t.call('POST', '/api/v1/materials', { cookie: producer, body: body('son-nhap', { category: 'paint', sourceKind: 'in_house', license: 'cc0' }) })).json.item.id
    const h = await t.call('POST', `/api/v1/projects/${projectA}/houses`, { cookie: producer, body: { name: 'Căn A', slug: 'can-a', houseType: 'apartment', declaredArea: 60 } })
    const vid = h.json.version.id
    const v = (await t.call('GET', `/api/v1/versions/${vid}`, { cookie: producer })).json
    const f = floorFromRects({ name: 'T1', order: 1, elevation: 0, rooms: [{ name: 'WC', function: 'wc', rect: [0, 0, 2000, 2000] }], openings: [{ kind: 'door', axis: 'x', at: 0, from: 600, to: 1400 }] })
    f.rooms[0].finish = { floor: matId, wall: draft }
    const cover = (await upload(t, '/api/v1/files', producer, { name: 'cover.jpg', content: await texture('#abc'), type: 'image/jpeg' }, { kind: 'cover', projectId: projectA })).json.file.id
    const saved = await t.call('PUT', `/api/v1/versions/${vid}/document`, { cookie: producer, body: { document: { ...v.document, floors: [f], coverFileId: cover } }, headers: { 'if-match': String(v.revision) } })
    expect(saved.status, saved.body).toBe(200)
    expect(saved.json.checks.find((c: { code: string }) => c.code === 'MATERIAL_NOT_READY')?.level).toBe('block')
    expect((await t.call('POST', `/api/v1/versions/${vid}/submit`, { cookie: admin })).status).not.toBe(200)

    await t.call('POST', `/api/v1/materials/${draft}/approve`, { cookie: admin })
    const sr = await t.call('POST', `/api/v1/versions/${vid}/submit`, { cookie: admin })
    expect(sr.status, sr.body).toBe(200)
    const sub = t.ctx.repos.versions.get(vid)!.currentSubmissionId!
    const ev = (await upload(t, '/api/v1/files', admin, { name: 'z.png', content: await texture('#fff') }, { kind: 'evidence', projectId: projectA })).json.file.id
    const rv = await t.call('POST', `/api/v1/versions/${vid}/review-on-behalf`, { cookie: admin, body: { decision: 'approved', note: 'Khách duyệt qua Zalo', evidenceFileId: ev, submissionId: sub } })
    expect(rv.status, rv.body).toBe(200)
    const pb = await t.call('POST', `/api/v1/versions/${vid}/publish`, { cookie: admin })
    expect(pb.status, pb.body).toBe(200)

    const pub = (await t.call('GET', '/api/v1/public/projects/du-an-an-phat/houses/can-a')).json
    const m = pub.resolved.materials[matId]
    expect(m).toMatchObject({ key: 'gach-600-an-phat', tileMm: [600, 600] })
    // ảnh vân mở công khai (không cookie) sau phát hành
    expect((await t.app.inject({ method: 'GET', url: m.maps.color.small })).statusCode).toBe(200)
    // sửa vật liệu trong thư viện không đổi bản đã phát hành (BR-R6)
    await t.call('PATCH', `/api/v1/materials/${matId}`, { cookie: producer, body: { name: 'Tên mới' } })
    expect((await t.call('GET', '/api/v1/public/projects/du-an-an-phat/houses/can-a')).json.resolved.materials[matId].name).toBe('Vật liệu gach-600-an-phat')
  })
})

describe('bộ vật liệu chuẩn trong nhà mẫu (seed)', () => {
  it('30 vật liệu sẵn dùng, CC0 có nguồn; nhà mẫu có vật liệu sàn / tường / trần, cửa, cầu thang, hướng nhà', async () => {
    const s = await makeApp()
    await seedDemo(s.ctx, { adminEmail: 'admin@seed.vn', adminPassword: 'admin12345' })
    const all = s.ctx.repos.materials.list()
    expect(all).toHaveLength(MATERIAL_CATALOG.length)
    expect(all.every((m) => m.status === 'ready' && m.license === 'cc0')).toBe(true)
    expect(all.filter((m) => m.files.color).length).toBe(MATERIAL_CATALOG.filter((c) => c.polyhaven || c.generated).length)
    const pub = (await s.call('GET', '/api/v1/public/projects/sunrise-garden/houses/biet-thu-b2')).json
    const rooms = pub.document.floors.flatMap((f: { rooms: { finish?: Record<string, string> }[] }) => f.rooms)
    expect(rooms.every((r: { finish?: Record<string, string> }) => r.finish?.floor && r.finish.wall && r.finish.ceiling)).toBe(true)
    expect(pub.document.finishes).toMatchObject({ door: expect.any(String), stair: expect.any(String), facade: expect.any(String) })
    expect(pub.document.lighting.northDeg).toBe(160)
    expect(Object.keys(pub.resolved.materials).length).toBeGreaterThan(8)
    await s.close()
  }, 60_000)
})
