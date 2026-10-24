import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeApp, outbox, userWithLogin } from './helpers.ts'
import type { TestApp } from './helpers.ts'
import { sendQueuedMail } from '../src/jobs/runner.ts'

let t: TestApp
let admin: string
beforeAll(async () => {
  t = await makeApp()
  admin = await userWithLogin(t, 'admin@test.vn', 'admin')
})
afterAll(async () => t.close())

describe('auth (API-01…05)', () => {
  it('đăng nhập đúng → cookie HttpOnly; /me trả người dùng', async () => {
    const r = await t.call('POST', '/api/v1/auth/login', { body: { email: 'ADMIN@test.vn', password: 'matkhau123' } })
    expect(r.status).toBe(200)
    expect(String(r.headers['set-cookie'])).toMatch(/sid=.*HttpOnly.*SameSite=Lax/i)
    const me = await t.call('GET', '/api/v1/auth/me', { cookie: admin })
    expect(me.json.user).toMatchObject({ email: 'admin@test.vn', role: 'admin', clientId: null })
  })

  it('sai 5 lần → khoá 15 phút, lần 6 đúng vẫn bị khoá (TC-01.08)', async () => {
    await userWithLogin(t, 'lock@test.vn', 'producer')
    for (let i = 0; i < 4; i++) {
      const r = await t.call('POST', '/api/v1/auth/login', { body: { email: 'lock@test.vn', password: 'sai' } })
      expect(r.json.error.code).toBe('INVALID_CREDENTIALS')
    }
    const fifth = await t.call('POST', '/api/v1/auth/login', { body: { email: 'lock@test.vn', password: 'sai' } })
    expect(fifth.status).toBe(423)
    const sixth = await t.call('POST', '/api/v1/auth/login', { body: { email: 'lock@test.vn', password: 'matkhau123' } })
    expect(sixth.json.error.code).toBe('ACCOUNT_LOCKED')
  })

  it('chưa đăng nhập → 401; producer gọi API quản trị → 403', async () => {
    expect((await t.call('GET', '/api/v1/auth/me')).status).toBe(401)
    const prod = await userWithLogin(t, 'prod@test.vn', 'producer')
    expect((await t.call('POST', '/api/v1/clients', { cookie: prod, body: { name: 'X' } })).status).toBe(403)
    expect((await t.call('GET', '/api/v1/users', { cookie: prod })).status).toBe(403)
  })
})

describe('khách hàng & tài khoản (API-10…13)', () => {
  let clientId = ''
  it('tạo khách hàng; màu sai → 400 (TC-01.01, 01.02)', async () => {
    const bad = await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'KH', brandColor: 'green' } })
    expect(bad.status).toBe(400)
    expect(bad.json.error.fields.brandColor).toBeTruthy()
    const r = await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'Sunrise', brandColor: '#0E6B5C', contact: { phone: '+84 912 345 678' }, hostingUntil: '2027-10-31' } })
    expect(r.status).toBe(201)
    expect(r.json.client).toMatchObject({ status: 'active', brandColor: '#0E6B5C', contact: { phone: '0912345678' } })
    clientId = r.json.client.id
  })

  it('mời người duyệt → E1 có token trong fragment; đặt mật khẩu → active; token dùng lại → lỗi (TC-01.03, 01.06, 01.07)', async () => {
    const noClient = await t.call('POST', '/api/v1/users', { cookie: admin, body: { email: 'lan@sunrise.vn', name: 'Lan', role: 'approver' } })
    expect(noClient.status).toBe(400)
    const r = await t.call('POST', '/api/v1/users', { cookie: admin, body: { email: 'lan@sunrise.vn', name: 'Lan', role: 'approver', clientId } })
    expect(r.status).toBe(201)
    expect(r.json.user.status).toBe('invited')
    const mail = outbox(t, 'E1').find((m) => m.to_addr === 'lan@sunrise.vn')!
    const token = mail.data.token as string
    const sent: { to: string; text: string }[] = []
    await sendQueuedMail(t.ctx, { send: async (to, m) => void sent.push({ to, text: m.text }) })
    expect(sent.find((s) => s.to === 'lan@sunrise.vn')!.text).toContain(`/portal/set-password#token=${token}`)
    const short = await t.call('POST', '/api/v1/auth/password/set', { body: { token, password: '123' } })
    expect(short.status).toBe(400)
    const ok = await t.call('POST', '/api/v1/auth/password/set', { body: { token, password: 'matkhau-moi' } })
    expect(ok.status).toBe(200)
    expect(ok.json.user).toMatchObject({ status: 'active', clientName: 'Sunrise' })
    const again = await t.call('POST', '/api/v1/auth/password/set', { body: { token, password: 'matkhau-khac' } })
    expect(again.json.error.code).toBe('TOKEN_INVALID')
  })

  it('email trùng khác hoa thường → 409 (TC-01.05)', async () => {
    const r = await t.call('POST', '/api/v1/users', { cookie: admin, body: { email: 'LAN@sunrise.vn', name: 'Lan 2', role: 'producer' } })
    expect(r.status).toBe(409)
    expect(r.json.error.code).toBe('EMAIL_TAKEN')
  })

  it('vô hiệu user → phiên mất ngay (TC-01.09)', async () => {
    const cookie = await userWithLogin(t, 'tam@test.vn', 'producer')
    expect((await t.call('GET', '/api/v1/auth/me', { cookie })).status).toBe(200)
    const u = t.ctx.repos.users.byEmail('tam@test.vn')!
    await t.call('PATCH', `/api/v1/users/${u.id}`, { cookie: admin, body: { status: 'disabled' } })
    expect((await t.call('GET', '/api/v1/auth/me', { cookie })).status).toBe(401)
    const relogin = await t.call('POST', '/api/v1/auth/login', { body: { email: 'tam@test.vn', password: 'matkhau123' } })
    expect(relogin.json.error.code).toBe('ACCOUNT_DISABLED')
  })

  it('tạm ngưng khách hàng → người duyệt mất phiên (TC-01.10)', async () => {
    const cookie = await userWithLogin(t, 'duyet2@sunrise.vn', 'approver', clientId)
    expect((await t.call('GET', '/api/v1/auth/me', { cookie })).status).toBe(200)
    await t.call('PATCH', `/api/v1/clients/${clientId}`, { cookie: admin, body: { status: 'suspended' } })
    expect((await t.call('GET', '/api/v1/auth/me', { cookie })).status).toBe(401)
    await t.call('PATCH', `/api/v1/clients/${clientId}`, { cookie: admin, body: { status: 'active' } })
  })

  it('không vô hiệu quản trị viên cuối cùng (TC-01.15)', async () => {
    const me = t.ctx.repos.users.byEmail('admin@test.vn')!
    const r = await t.call('PATCH', `/api/v1/users/${me.id}`, { cookie: admin, body: { status: 'disabled' } })
    expect(r.json.error.code).toBe('LAST_ADMIN')
  })

  it('quên mật khẩu luôn 204, chỉ gửi E2 cho tài khoản active', async () => {
    expect((await t.call('POST', '/api/v1/auth/password/forgot', { body: { email: 'khong-co@test.vn' } })).status).toBe(204)
    await t.call('POST', '/api/v1/auth/password/forgot', { body: { email: 'admin@test.vn' } })
    expect(outbox(t, 'E2').map((m) => m.to_addr)).toEqual(['admin@test.vn'])
  })
})
