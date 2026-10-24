import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { floorFromRects } from '@hd/core'
import type { HouseDocument } from '@hd/core'
import { login, makeApp, outbox, upload, userWithLogin } from './helpers.ts'
import type { TestApp } from './helpers.ts'
import { seedDemo } from '../src/seed/seed.ts'
import type { SeedResult } from '../src/seed/seed.ts'
import { submitLead } from '../src/services/leads.ts'

/* Hồi quy cho các phát hiện review G3 (R-G3-01, 02, 06, 07, 08, 09, 11). */

let t: TestApp
let seed: SeedResult
let admin: string
let producer: string
let approver: string
let other: string
const png = Buffer.from('89504e470d0a1a0a', 'hex')

beforeAll(async () => {
  t = await makeApp()
  seed = await seedDemo(t.ctx, { adminEmail: 'admin@test.vn', adminPassword: 'admin12345' })
  admin = await login(t, 'admin@test.vn', 'admin12345')
  approver = await login(t, seed.approverEmail, 'admin12345')
  producer = await userWithLogin(t, 'dung@test.vn', 'producer')
  const c2 = (await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'KH khác' } })).json.client.id
  other = await userWithLogin(t, 'khac@kh.vn', 'approver', c2)
}, 60_000)
afterAll(async () => t.close())

const lead = (headers: Record<string, string>, deviceId: string, phone: string) =>
  t.call('POST', '/api/v1/public/leads', {
    headers,
    body: { projectSlug: 'sunrise-garden', phone, consent: true, website: '', formToken: t.ctx.forms.issue(Date.now() - 5000), deviceId },
  })

describe('review G3', () => {
  it('R-G3-01: X-Forwarded-For giả không vượt được giới hạn theo IP', async () => {
    for (let i = 0; i < 20; i++) expect((await lead({ 'x-forwarded-for': `10.0.0.${i}` }, `d_${i}`, `09100000${String(i).padStart(2, '0')}`)).status).toBe(201)
    const r = await lead({ 'x-forwarded-for': '10.9.9.9' }, 'd_moi', '0919999999')
    expect(r.json.error.code).toBe('CAPTCHA_REQUIRED')
  })

  it('R-G3-02: tệp thư viện dùng chung vẫn công khai khi một dự án khác bị tạm ngưng', async () => {
    const second = await seedDemo(t.ctx, { adminEmail: 'admin@test.vn', adminPassword: 'admin12345', slug: 'du-an-tam-ngung' })
    const f = t.ctx.repos.files.create({ projectId: null, kind: 'library_image', originalName: 'sofa.png', mime: 'image/png', bytes: png.length, storageKey: 'library_image/dung-chung.png', uploadedBy: null })
    await t.ctx.storage.putStream(f.storageKey, (await import('node:stream')).Readable.from([png]), 1000)
    const subOf = (houseId: string) => t.ctx.repos.versions.get(t.ctx.repos.houses.get(houseId)!.publishedVersionId!)!.currentSubmissionId!
    // dự án bị tạm ngưng chèn trước để truy vấn cũ (LIMIT 1) chọn nhầm
    t.ctx.db.run('INSERT INTO submission_files (submission_id, storage_key) VALUES (?, ?)', subOf(second.houseIds[0]), f.storageKey)
    t.ctx.db.run('INSERT INTO submission_files (submission_id, storage_key) VALUES (?, ?)', subOf(seed.houseIds[0]), f.storageKey)
    t.ctx.repos.clients.update(second.clientId, { status: 'suspended' })
    const r = await t.call('GET', `/files/${f.storageKey}`)
    expect(r.status).toBe(200)
    expect(r.headers['cache-control']).toContain('public')
  })

  it('R-G3-06: ảnh đại diện trỏ vào tài liệu đầu vào → 400 DOCUMENT_INVALID (không phải 500 khi gửi)', async () => {
    const h = await t.call('POST', `/api/v1/projects/${seed.projectId}/houses`, { cookie: producer, body: { name: 'Mẫu kiểm tệp', slug: 'mau-kiem-tep', houseType: 'apartment', declaredArea: 30 } })
    const input = await upload(t, `/api/v1/projects/${seed.projectId}/files`, producer, { name: 'ban-ve.png', content: png })
    const doc: HouseDocument = { ...(await t.call('GET', `/api/v1/versions/${h.json.version.id}`, { cookie: producer })).json.document }
    doc.floors = [floorFromRects({ name: 'Tầng 1', order: 1, elevation: 0, rooms: [{ name: 'Khách', function: 'living', rect: [0, 0, 4000, 4000] }] })]
    doc.coverFileId = input.json.file.id
    const r = await t.call('PUT', `/api/v1/versions/${h.json.version.id}/document`, { cookie: producer, body: { document: doc }, headers: { 'if-match': '0' } })
    expect(r.json.error.code).toBe('DOCUMENT_INVALID')
    expect(Object.values(r.json.error.fields)).toContain('Loại tệp không đúng chỗ dùng')
  })

  it('R-G3-07: xoá lead → email E5 chưa gửi bị huỷ, không gửi bản rỗng', async () => {
    await t.call('PATCH', `/api/v1/projects/${seed.projectId}`, { cookie: admin, body: { contact: { leadEmails: ['sales@sunrise.vn'] } } })
    t.ctx.db.run('DELETE FROM leads')
    const id = submitLead(t.ctx, { projectSlug: 'sunrise-garden', phone: '0977000111', consent: true }).lead.id
    expect(id).toBeTruthy()
    expect((await t.call('DELETE', `/api/v1/leads/${id}`, { cookie: other })).status).toBe(404) // R-G3-09
    expect((await t.call('DELETE', `/api/v1/leads/${id}`, { cookie: approver })).status).toBe(204)
    const rows = t.ctx.db.all<{ status: string; data_json: string }>('SELECT status, data_json FROM outbox_emails WHERE lead_id = ?', id)
    expect(rows.every((x) => x.status === 'failed' && x.data_json === '{}')).toBe(true)
    expect(outbox(t, 'E5').length).toBeGreaterThan(0)
  })

  it('R-G3-08: người dựng chỉ thấy tên khách hàng, không xem được chi tiết', async () => {
    const list = await t.call('GET', '/api/v1/clients', { cookie: producer })
    expect(Object.keys(list.json.items[0]).sort()).toEqual(['id', 'name'])
    expect((await t.call('GET', `/api/v1/clients/${seed.clientId}`, { cookie: producer })).status).toBe(403)
  })

  it('R-G3-09: người duyệt khách hàng khác không đọc được tệp trong bản duyệt của khách hàng này', async () => {
    const h = t.ctx.repos.houses.get(seed.houseIds[0])!
    const sub = t.ctx.repos.versions.get(h.publishedVersionId!)!.currentSubmissionId!
    const key = t.ctx.db.get<{ storage_key: string }>('SELECT storage_key FROM submission_files WHERE submission_id = ? LIMIT 1', sub)!.storage_key
    t.ctx.repos.clients.update(seed.clientId, { status: 'suspended' }) // không còn công khai
    expect((await t.call('GET', `/files/${key}`, { cookie: other })).status).toBe(404)
    expect((await t.call('GET', `/files/${key}`)).status).toBe(404)
    t.ctx.repos.clients.update(seed.clientId, { status: 'active' })
  })

  it('R-G3-11: đường dẫn tệp có % không làm lỗi 500', async () => {
    expect((await t.call('GET', '/files/a%25')).status).toBe(404)
  })
})
