import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { floorFromRects } from '@hd/core'
import type { HouseDocument } from '@hd/core'
import { makeApp, upload, userWithLogin } from './helpers.ts'
import type { TestApp } from './helpers.ts'
import { seedDemo } from '../src/seed/seed.ts'
import { publish, review, submit } from '../src/services/workflow.ts'

let t: TestApp
let admin: string
let producer: string
let approverA: string
let approverB: string
let clientA = ''
let projectId = ''
const png = Buffer.from('89504e470d0a1a0a', 'hex')

beforeAll(async () => {
  t = await makeApp()
  await seedDemo(t.ctx, { adminEmail: 'seed@test.vn', adminPassword: 'admin12345' })
  admin = await userWithLogin(t, 'admin@test.vn', 'admin')
  producer = await userWithLogin(t, 'prod@test.vn', 'producer')
  clientA = (await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'KH A' } })).json.client.id
  const clientB = (await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'KH B' } })).json.client.id
  approverA = await userWithLogin(t, 'a@kh.vn', 'approver', clientA)
  approverB = await userWithLogin(t, 'b@kh.vn', 'approver', clientB)
  const p = await t.call('POST', '/api/v1/projects', { cookie: admin, body: { clientId: clientA, slug: 'du-an-a', name: 'Dự án A', contact: { leadEmails: ['sales@a.vn'] } } })
  projectId = p.json.project.id
}, 60_000)
afterAll(async () => t.close())

describe('dự án (API-20, 21)', () => {
  it('slug sai / trùng', async () => {
    expect((await t.call('POST', '/api/v1/projects', { cookie: admin, body: { clientId: clientA, slug: 'Sun_Rise!', name: 'x' } })).status).toBe(400)
    const dup = await t.call('POST', '/api/v1/projects', { cookie: admin, body: { clientId: clientA, slug: 'du-an-a', name: 'x' } })
    expect(dup.json.error.code).toBe('SLUG_TAKEN')
  })
  it('người dựng chỉ sửa được field nội dung (TC-01.14, R-03)', async () => {
    const ok = await t.call('PATCH', `/api/v1/projects/${projectId}`, { cookie: producer, body: { name: 'Dự án A mới', location: 'Hà Nội' } })
    expect(ok.status).toBe(200)
    const bad = await t.call('PATCH', `/api/v1/projects/${projectId}`, { cookie: producer, body: { contact: { leadEmails: ['hacker@x.vn'] } } })
    expect(bad.status).toBe(403)
    expect(bad.json.error.code).toBe('FIELD_FORBIDDEN')
  })
  it('người duyệt chỉ thấy dự án của mình (AC-12)', async () => {
    const a = await t.call('GET', '/api/v1/projects', { cookie: approverA })
    expect(a.json.items.map((p: { slug: string }) => p.slug)).toEqual(['du-an-a'])
    expect((await t.call('GET', `/api/v1/projects/${projectId}`, { cookie: approverB })).status).toBe(403)
    expect((await t.call('PATCH', `/api/v1/projects/${projectId}`, { cookie: approverA, body: { name: 'x' } })).status).toBe(403)
  })
})

describe('tệp (API-22, 23)', () => {
  it('tải tài liệu đầu vào, liệt kê; sai loại → 415 (TC-02.01, 02.02)', async () => {
    const r = await upload(t, `/api/v1/projects/${projectId}/files`, producer, { name: 'mat-bang tầng 1.png', content: png })
    expect(r.status).toBe(201)
    expect(r.json.file).toMatchObject({ kind: 'input', originalName: 'mat-bang tầng 1.png', mime: 'image/png' })
    const list = await t.call('GET', `/api/v1/projects/${projectId}/files`, { cookie: producer })
    expect(list.json.items).toHaveLength(1)
    const exe = await upload(t, `/api/v1/projects/${projectId}/files`, producer, { name: 'virus.exe', content: 'MZ' })
    expect(exe.status).toBe(415)
  })
  it('người dựng không tải được bằng chứng duyệt', async () => {
    const r = await upload(t, '/api/v1/files', producer, { name: 'zalo.png', content: png }, { kind: 'evidence', projectId })
    expect(r.status).toBe(403)
    const ok = await upload(t, '/api/v1/files', admin, { name: 'zalo.png', content: png }, { kind: 'evidence', projectId })
    expect(ok.status).toBe(201)
  })
})

describe('mẫu nhà & phiên bản (API-30…36)', () => {
  let houseId = ''
  let versionId = ''
  it('tạo mẫu nhà kèm phiên bản 1 rỗng', async () => {
    const r = await t.call('POST', `/api/v1/projects/${projectId}/houses`, { cookie: producer, body: { name: 'Mẫu A', slug: 'mau-a', houseType: 'townhouse', declaredArea: 120, bedrooms: 3 } })
    expect(r.status).toBe(201)
    houseId = r.json.house.id
    versionId = r.json.version.id
    const v = await t.call('GET', `/api/v1/versions/${versionId}`, { cookie: producer })
    expect(v.json.document.floors).toHaveLength(1)
    expect(v.json.checks.map((c: { code: string }) => c.code)).toContain('FLOOR_NOT_CALIBRATED')
  })
  it('autosave: thiếu If-Match, xung đột, tham chiếu sai (TC-03.10, 03.11)', async () => {
    const v = (await t.call('GET', `/api/v1/versions/${versionId}`, { cookie: producer })).json
    const doc: HouseDocument = { ...v.document, floors: [floorFromRects({ name: 'Tầng 1', order: 1, elevation: 0, rooms: [{ name: 'Khách', function: 'living', rect: [0, 0, 4000, 5000] }] })] }
    expect((await t.call('PUT', `/api/v1/versions/${versionId}/document`, { cookie: producer, body: { document: doc } })).status).toBe(400)
    const ok = await t.call('PUT', `/api/v1/versions/${versionId}/document`, { cookie: producer, body: { document: doc }, headers: { 'if-match': '0' } })
    expect(ok.status).toBe(200)
    expect(ok.json.revision).toBe(1)
    const stale = await t.call('PUT', `/api/v1/versions/${versionId}/document`, { cookie: producer, body: { document: doc }, headers: { 'if-match': '0' } })
    expect(stale.json.error.code).toBe('REVISION_CONFLICT')
    const broken = structuredClone(doc)
    broken.floors[0].openings.push({ id: 'o1', wallId: 'khong-co', kind: 'door', offset: 0, width: 900, height: 2100, sill: 0, hinge: 'start', swing: 'left' })
    const bad = await t.call('PUT', `/api/v1/versions/${versionId}/document`, { cookie: producer, body: { document: broken }, headers: { 'if-match': '1' } })
    expect(bad.json.error.code).toBe('DOCUMENT_INVALID')
    expect(Object.keys(bad.json.error.fields)[0]).toContain('wallId')
    const garbage = await t.call('PUT', `/api/v1/versions/${versionId}/document`, { cookie: producer, body: { document: { schemaVersion: 2 } }, headers: { 'if-match': '1' } })
    expect(garbage.json.error.code).toBe('DOCUMENT_INVALID')
  })
  it('người duyệt: bản nháp chỉ thấy metadata; khách hàng khác → 403 (R-11, AC-12)', async () => {
    const a = await t.call('GET', `/api/v1/versions/${versionId}`, { cookie: approverA })
    expect(a.status).toBe(200)
    expect(a.json.document).toBeUndefined()
    expect(a.json.state).toBe('draft')
    expect((await t.call('GET', `/api/v1/versions/${versionId}`, { cookie: approverB })).status).toBe(403)
    expect((await t.call('PUT', `/api/v1/versions/${versionId}/document`, { cookie: approverA, body: { document: {} }, headers: { 'if-match': '1' } })).status).toBe(403)
  })
  it('sao chép mẫu nhà: id mới, tham chiếu cửa còn đúng (TC-03.09)', async () => {
    const r = await t.call('POST', `/api/v1/houses/${houseId}/duplicate`, { cookie: producer, body: { name: 'Mẫu A2', slug: 'mau-a2' } })
    expect(r.status).toBe(201)
    const src = (await t.call('GET', `/api/v1/versions/${versionId}`, { cookie: producer })).json.document as HouseDocument
    const dst = (await t.call('GET', `/api/v1/versions/${r.json.version.id}`, { cookie: producer })).json.document as HouseDocument
    expect(dst.floors[0].id).not.toBe(src.floors[0].id)
    expect(dst.floors[0].rooms[0].name).toBe('Khách')
  })
  it('phiên bản đang chờ duyệt bị khoá; slug khoá sau phát hành (TC-01.13)', async () => {
    const seedAdmin = t.ctx.repos.users.byEmail('seed@test.vn')!
    const actor = { id: seedAdmin.id, name: 'a', email: seedAdmin.email, role: 'admin' as const, clientId: null }
    const v = t.ctx.repos.versions.get(versionId)!
    const doc = JSON.parse(v.document) as HouseDocument
    const cover = await upload(t, '/api/v1/files', admin, { name: 'c.png', content: png }, { kind: 'cover', projectId })
    doc.coverFileId = cover.json.file.id
    t.ctx.repos.versions.saveDocument(v.id, doc, v.revision)
    submit(t.ctx, v.id, actor)
    const locked = await t.call('PUT', `/api/v1/versions/${versionId}/document`, { cookie: producer, body: { document: doc }, headers: { 'if-match': String(v.revision + 1) } })
    expect(locked.json.error.code).toBe('VERSION_LOCKED')
    review(t.ctx, v.id, actor, { decision: 'approved', note: 'duyệt để kiểm khoá slug' }, { evidenceFileId: null })
    publish(t.ctx, v.id, actor)
    const slug = await t.call('PATCH', `/api/v1/projects/${projectId}`, { cookie: admin, body: { slug: 'du-an-a-moi' } })
    expect(slug.json.error.code).toBe('SLUG_LOCKED')
    const hs = await t.call('PATCH', `/api/v1/houses/${houseId}`, { cookie: admin, body: { slug: 'mau-a-moi' } })
    expect(hs.json.error.code).toBe('SLUG_LOCKED')
    const nv = await t.call('POST', `/api/v1/houses/${houseId}/versions`, { cookie: producer })
    expect(nv.status).toBe(201)
    expect((await t.call('POST', `/api/v1/houses/${houseId}/versions`, { cookie: producer })).json.error.code).toBe('DRAFT_EXISTS')
    const hist = await t.call('GET', `/api/v1/houses/${houseId}/versions`, { cookie: approverA })
    expect(hist.json.items[1].submissions[0].reviews[0]).toMatchObject({ decision: 'approved', onBehalf: true })
  })
})

describe('thư viện (API-40, 41)', () => {
  it('tạo, tìm, sửa; xoá đồ đang dùng → 409 (TC-05.01, 05.04)', async () => {
    const r = await t.call('POST', '/api/v1/library/items', { cookie: producer, body: { name: 'Ghế thử', category: 'chair', sizeMm: [450, 850, 500], fallbackShape: 'chair', variants: [{ id: 'oak', name: 'Sồi', color: '#c89f6e' }] } })
    expect(r.status).toBe(201)
    const dupVariant = await t.call('POST', '/api/v1/library/items', { cookie: producer, body: { name: 'x', category: 'chair', sizeMm: [1, 1, 1], variants: [{ id: 'a', name: 'A', color: '#000000' }, { id: 'a', name: 'B', color: '#000000' }] } })
    expect(dupVariant.status).toBe(400)
    const found = await t.call('GET', '/api/v1/library/items?q=Ghế thử', { cookie: producer })
    expect(found.json.items).toHaveLength(1)
    expect((await t.call('DELETE', `/api/v1/library/items/${r.json.item.id}`, { cookie: producer })).status).toBe(204)
    const sofa = t.ctx.repos.library.list({ q: 'Sofa băng Oslo' })[0]
    const inUse = await t.call('DELETE', `/api/v1/library/items/${sofa.id}`, { cookie: producer })
    expect(inUse.status).toBe(409)
    expect(inUse.json.error.usage).toBeGreaterThan(0)
    expect((await t.call('GET', '/api/v1/library/items', { cookie: approverA })).status).toBe(403)
  })
})
