import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sortedFloors } from '@hd/core'
import { login, makeApp, outbox, userWithLogin } from './helpers.ts'
import type { TestApp } from './helpers.ts'
import { seedDemo } from '../src/seed/seed.ts'
import type { SeedResult } from '../src/seed/seed.ts'

let t: TestApp
let seed: SeedResult
let admin: string
let approver: string
let otherApprover: string
let houseSlug = ''
let floorId = ''
let roomId = ''
let itemId = ''

const token = () => t.ctx.forms.issue(Date.now() - 5000)
const lead = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  t.call('POST', '/api/v1/public/leads', {
    body: { projectSlug: 'sunrise-garden', phone: '0912345678', consent: true, website: '', formToken: token(), deviceId: `d_${Math.random()}`, ...body },
    headers,
  })

beforeAll(async () => {
  t = await makeApp()
  seed = await seedDemo(t.ctx, { adminEmail: 'admin@test.vn', adminPassword: 'admin12345' })
  admin = await login(t, 'admin@test.vn', 'admin12345')
  approver = await login(t, seed.approverEmail, 'admin12345')
  const other = (await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'KH khác' } })).json.client.id
  otherApprover = await userWithLogin(t, 'khac@kh.vn', 'approver', other)
  await t.call('PATCH', `/api/v1/projects/${seed.projectId}`, { cookie: admin, body: { contact: { phone: '0900000000', leadEmails: ['sales@sunrise.vn'] } } })
  const house = t.ctx.repos.houses.get(seed.houseIds[0])!
  houseSlug = house.slug
  const pub = (await t.call('GET', `/api/v1/public/projects/sunrise-garden/houses/${houseSlug}`)).json
  const f = sortedFloors(pub.document).find((x) => x.rooms.length && x.items.length)!
  floorId = f.id
  roomId = f.rooms[0].id
  itemId = f.items[0].id
}, 60_000)
afterAll(async () => t.close())

describe('lead công khai (API-62)', () => {
  it('SĐT sai, thiếu đồng ý → 400 với chữ lỗi SRS (TC-10.02)', async () => {
    const r = await lead({ phone: '12345', consent: false })
    expect(r.status).toBe(400)
    expect(r.json.error.fields.phone).toContain('10 chữ số')
    expect(r.json.error.fields.consent).toBe('Bạn cần đồng ý để chúng tôi liên hệ.')
  })
  it('honeypot → 201 giả, không lưu (TC-10.04)', async () => {
    const r = await lead({ website: 'http://spam' })
    expect(r.json.lead.id).toBe('led_ignored')
    expect(t.ctx.db.get<{ n: number }>('SELECT COUNT(*) n FROM leads')!.n).toBe(0)
  })
  it('form token thiếu hoặc gửi quá nhanh → 429 CAPTCHA_REQUIRED (TC-10.05)', async () => {
    expect((await lead({ formToken: null })).json.error.code).toBe('CAPTCHA_REQUIRED')
    expect((await lead({ formToken: t.ctx.forms.issue() })).json.error.code).toBe('CAPTCHA_REQUIRED')
  })
  it('tạo lead + E5 có tầng/phòng; trùng SĐT trong 24 giờ → gộp, liên hệ lần 2 (TC-10.01, 10.03, BR-09)', async () => {
    const r = await lead({ houseSlug, name: 'Minh', phone: '+84 912 345 678', interest: 'live', context: { floorId, roomId }, source: 'qr' })
    expect(r.status, r.body).toBe(201)
    const e5 = outbox(t, 'E5')
    expect(e5).toHaveLength(1)
    expect(e5[0].to_addr).toBe('sales@sunrise.vn')
    expect(e5[0].lead_id).toBe(r.json.lead.id)
    expect(e5[0].data.roomName).toBeTruthy()
    const again = await lead({ houseSlug, phone: '0912 345 678', message: 'Gọi buổi tối' })
    expect(again.status).toBe(200)
    expect(again.json).toEqual({ lead: { id: r.json.lead.id }, merged: true })
    expect(outbox(t, 'E5')[1].data.contactCount).toBe(2)
  })
  it('> 3 lần/10 phút cùng thiết bị → 429 (TC-10.05)', async () => {
    const deviceId = 'd_spam'
    for (let i = 0; i < 3; i++) expect((await lead({ deviceId, phone: `091000000${i}` })).status).toBe(201)
    expect((await lead({ deviceId, phone: '0910000009' })).json.error.code).toBe('CAPTCHA_REQUIRED')
  })
})

describe('quản lý lead (API-70…72)', () => {
  it('người duyệt thấy lead dự án mình; khách khác không thấy; người dựng → 403', async () => {
    const r = await t.call('GET', `/api/v1/leads?projectId=${seed.projectId}`, { cookie: approver })
    expect(r.status).toBe(200)
    const minh = r.json.items.find((l: { name: string }) => l.name === 'Minh')
    expect(minh).toMatchObject({ phone: '0912345678', contactCount: 2, source: 'qr', status: 'new', house: { name: expect.any(String) } })
    expect(minh.context.roomName).toBeTruthy()
    expect((await t.call('GET', '/api/v1/leads', { cookie: otherApprover })).json.items).toHaveLength(0)
    const producer = await userWithLogin(t, 'dung@test.vn', 'producer')
    expect((await t.call('GET', '/api/v1/leads', { cookie: producer })).status).toBe(403)
    expect((await t.call('PATCH', `/api/v1/leads/${minh.id}`, { cookie: otherApprover, body: { status: 'contacted' } })).status).toBe(404)
  })
  it('phân trang theo cursor', async () => {
    const p1 = await t.call('GET', '/api/v1/leads?limit=2', { cookie: admin })
    expect(p1.json.items).toHaveLength(2)
    const p2 = await t.call('GET', `/api/v1/leads?limit=2&cursor=${p1.json.nextCursor}`, { cookie: admin })
    expect(p2.json.items[0].id).not.toBe(p1.json.items[1].id)
    const all = await t.call('GET', '/api/v1/leads?limit=200', { cookie: admin })
    expect(all.json.items).toHaveLength(4)
  })
  it('CSV có BOM và chặn công thức; đánh dấu đã liên hệ; xoá cứng che outbox (TC-10.06, NFR-04, R-26, R-27)', async () => {
    const evil = await lead({ name: '=HYPERLINK("http://x")', phone: '0987654321' })
    const csv = await t.call('GET', '/api/v1/leads.csv', { cookie: approver })
    expect(csv.headers['content-type']).toContain('text/csv')
    expect(csv.body.charCodeAt(0)).toBe(0xfeff)
    expect(csv.body).toContain(`"'=HYPERLINK(""http://x"")"`)
    const id = evil.json.lead.id
    const p = await t.call('PATCH', `/api/v1/leads/${id}`, { cookie: approver, body: { status: 'contacted' } })
    expect(p.json.lead.status).toBe('contacted')
    expect((await t.call('DELETE', `/api/v1/leads/${id}`, { cookie: approver })).status).toBe(204)
    expect(t.ctx.db.get('SELECT id FROM leads WHERE id = ?', id)).toBeUndefined()
    const masked = t.ctx.db.get<{ data_json: string }>('SELECT data_json FROM outbox_emails WHERE lead_id = ?', id)!
    expect(masked.data_json).toBe('{}')
  })
})

describe('sự kiện & thống kê (API-63, 80, 81)', () => {
  it('ghi lô sự kiện, bỏ sự kiện sai; thống kê đếm phiên, phòng, đồ, nguồn (TC-11.01, 11.02)', async () => {
    const now = new Date().toISOString()
    const batch = (sessionId: string, deviceId: string, source: string, deviceClass: string, extra: object[] = []) =>
      t.call('POST', '/api/v1/public/events', { body: { projectSlug: 'sunrise-garden', sessionId, deviceId, source, deviceClass, events: [{ type: 'house_open', houseSlug, ts: now }, ...extra] } })
    expect((await batch('s1', 'd1', 'qr', 'mobile', [
      { type: 'room_select', houseSlug, targetId: roomId, ts: now },
      { type: 'item_open', houseSlug, targetId: itemId, ts: now },
      { type: 'hack', ts: now },
      { type: 'floor_select', ts: '2020-01-01T00:00:00Z' },
    ])).status).toBe(204)
    await batch('s2', 'd1', 'link', 'desktop')
    await batch('s3', 'd2', 'embed', 'mobile', [{ type: 'room_select', houseSlug, targetId: roomId, ts: now }])
    expect(t.ctx.db.get<{ n: number }>('SELECT COUNT(*) n FROM view_events')!.n).toBe(6)
    const s = await t.call('GET', `/api/v1/stats?projectId=${seed.projectId}`, { cookie: approver })
    expect(s.status, s.body).toBe(200)
    expect(s.json.totals).toMatchObject({ views: 3, uniqueViewers: 2, leads: 4 })
    expect(s.json.daily).toHaveLength(30)
    expect(s.json.topRooms[0]).toMatchObject({ selects: 2 })
    expect(s.json.topRooms[0].roomName).not.toBe('—')
    expect(s.json.topItems[0].name).not.toBe('—')
    expect(s.json.bySource).toEqual({ link: 1, qr: 1, embed: 1 })
    expect(s.json.byDevice).toMatchObject({ mobile: 2, desktop: 1 })
  })
  it('người duyệt bắt buộc projectId; khoảng > 366 ngày → 400; CSV (TC-11.03)', async () => {
    expect((await t.call('GET', '/api/v1/stats', { cookie: approver })).status).toBe(400)
    expect((await t.call('GET', `/api/v1/stats?projectId=${seed.projectId}`, { cookie: otherApprover })).status).toBe(403)
    expect((await t.call('GET', '/api/v1/stats?from=2024-01-01&to=2026-01-01', { cookie: admin })).json.error.code).toBe('VALIDATION_ERROR')
    const csv = await t.call('GET', `/api/v1/stats.csv?projectId=${seed.projectId}`, { cookie: approver })
    expect(csv.body).toContain('Ngày,Lượt xem,Lead')
    expect(csv.body).toContain('Tổng,3,4')
  })
})
