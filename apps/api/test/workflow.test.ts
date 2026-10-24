import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { floorFromRects } from '@hd/core'
import type { HouseDocument } from '@hd/core'
import { makeApp, outbox, upload, userWithLogin } from './helpers.ts'
import type { TestApp } from './helpers.ts'
import { remindDue } from '../src/services/workflow.ts'
import { businessDaysBetween } from '../src/lib/time.ts'

let t: TestApp
let admin: string
let producer: string
let approverA: string
let approverB: string
let projectId = ''
let houseId = ''
let versionId = ''
const png = Buffer.from('89504e470d0a1a0a', 'hex')
const subOf = (vid: string) => t.ctx.repos.versions.get(vid)!.currentSubmissionId!

/** Lưu một tài liệu đủ điều kiện gửi duyệt (có ảnh nền để kiểm R-01). */
const readyDoc = async (vid: string) => {
  const v = (await t.call('GET', `/api/v1/versions/${vid}`, { cookie: producer })).json
  const cover = await upload(t, '/api/v1/files', producer, { name: 'c.png', content: png }, { kind: 'cover', projectId })
  const input = await upload(t, `/api/v1/projects/${projectId}/files`, producer, { name: 'mb.png', content: png })
  const floor = floorFromRects({ name: 'Tầng 1', order: 1, elevation: 0, rooms: [{ name: 'Khách', function: 'living', rect: [0, 0, 4000, 5000] }] })
  floor.underlay = { fileId: input.json.file.id, mmPerPx: 10, offset: [0, 0], rotation: 0, opacity: 0.5 }
  floor.calibrated = true
  const doc: HouseDocument = { ...v.document, floors: [floor], coverFileId: cover.json.file.id }
  const r = await t.call('PUT', `/api/v1/versions/${vid}/document`, { cookie: producer, body: { document: doc }, headers: { 'if-match': String(v.revision) } })
  expect(r.status, r.body).toBe(200)
  return input.json.file.id as string
}

beforeAll(async () => {
  t = await makeApp()
  admin = await userWithLogin(t, 'admin@test.vn', 'admin')
  producer = await userWithLogin(t, 'prod@test.vn', 'producer')
  const clientA = (await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'KH A' } })).json.client.id
  const clientB = (await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'KH B' } })).json.client.id
  approverA = await userWithLogin(t, 'a@kh.vn', 'approver', clientA)
  approverB = await userWithLogin(t, 'b@kh.vn', 'approver', clientB)
  projectId = (await t.call('POST', '/api/v1/projects', { cookie: admin, body: { clientId: clientA, slug: 'du-an-wf', name: 'Dự án WF' } })).json.project.id
  const h = await t.call('POST', `/api/v1/projects/${projectId}/houses`, { cookie: producer, body: { name: 'Mẫu WF', slug: 'mau-wf', houseType: 'apartment', declaredArea: 20 } })
  if (h.status !== 201) throw new Error(h.body)
  houseId = h.json.house.id
  versionId = h.json.version.id
}, 60_000)
afterAll(async () => t.close())

describe('workflow (API-39, 50…55)', () => {
  it('gửi duyệt khi còn lỗi chặn → 422 SUBMIT_BLOCKED kèm checks; người dựng không gửi được (TC-08.01)', async () => {
    const r = await t.call('POST', `/api/v1/versions/${versionId}/submit`, { cookie: admin })
    expect(r.status).toBe(422)
    expect(r.json.error.code).toBe('SUBMIT_BLOCKED')
    expect(r.json.error.checks.map((c: { code: string }) => c.code)).toContain('NO_COVER')
    expect((await t.call('POST', `/api/v1/versions/${versionId}/submit`, { cookie: producer })).status).toBe(403)
  })

  it('xem trước bản nháp: QTV xem được, người duyệt → 403; không lộ ảnh nền (R-01, R-11)', async () => {
    await readyDoc(versionId)
    const p = await t.call('GET', `/api/v1/versions/${versionId}/preview`, { cookie: producer })
    expect(p.status).toBe(200)
    expect(p.headers['cache-control']).toBe('private, no-store')
    expect(p.json.preview).toMatchObject({ versionNumber: 1, state: 'draft' })
    expect(p.json.document.floors[0].underlay).toBeUndefined()
    expect(p.json.antiBot).toBeUndefined()
    expect((await t.call('GET', `/api/v1/versions/${versionId}/preview`, { cookie: approverA })).status).toBe(403)
  })

  it('gửi duyệt → chờ duyệt, E3 cho người duyệt; rút lại; gửi lại (TC-08.02, 08.03)', async () => {
    const r = await t.call('POST', `/api/v1/versions/${versionId}/submit`, { cookie: admin })
    expect(r.status, r.body).toBe(200)
    expect(r.json.version.state).toBe('pending_review')
    expect(outbox(t, 'E3').map((e) => e.to_addr)).toEqual(['a@kh.vn'])
    const w = await t.call('POST', `/api/v1/versions/${versionId}/withdraw`, { cookie: admin })
    expect(w.json.version.state).toBe('draft')
    expect(w.json.submission.withdrawnAt).toBeTruthy()
    expect((await t.call('POST', `/api/v1/versions/${versionId}/withdraw`, { cookie: admin })).json.error.code).toBe('INVALID_STATE')
    expect((await t.call('POST', `/api/v1/versions/${versionId}/submit`, { cookie: admin })).status).toBe(200)
  })

  it('người duyệt xem trước bản đã gửi; khách khác → 403', async () => {
    const p = await t.call('GET', `/api/v1/versions/${versionId}/preview`, { cookie: approverA })
    expect(p.status).toBe(200)
    expect(p.json.preview).toMatchObject({ state: 'pending_review', submittedByName: 'admin' })
    expect((await t.call('GET', `/api/v1/versions/${versionId}/preview`, { cookie: approverB })).status).toBe(403)
    expect((await t.call('POST', `/api/v1/versions/${versionId}/review`, { cookie: approverB, body: { decision: 'approved', submissionId: subOf(versionId) } })).status).toBe(403)
  })

  it('yêu cầu sửa cần ghi chú ≥ 10 ký tự; có ghi chú → về Đang dựng (TC-08.05)', async () => {
    const short = await t.call('POST', `/api/v1/versions/${versionId}/review`, { cookie: approverA, body: { decision: 'changes_requested', note: 'sửa đi', submissionId: subOf(versionId) } })
    expect(short.json.error.code).toBe('VALIDATION_ERROR')
    const r = await t.call('POST', `/api/v1/versions/${versionId}/review`, { cookie: approverA, body: { decision: 'changes_requested', note: 'Đổi phòng khách thành phòng làm việc', targets: [{ floorId: 'f1' }], submissionId: subOf(versionId) } })
    expect(r.status, r.body).toBe(200)
    expect(r.json.version.state).toBe('draft')
    expect((await t.call('POST', `/api/v1/versions/${versionId}/review`, { cookie: approverA, body: { decision: 'approved', submissionId: 'sub_cu' } })).json.error.code).toBe('INVALID_STATE')
  })

  it('duyệt gắn với lần gửi đã xem: rút về rồi gửi lại → quyết định theo lần cũ bị từ chối (R-G3-03)', async () => {
    expect((await t.call('POST', `/api/v1/versions/${versionId}/submit`, { cookie: admin })).status).toBe(200)
    const seen = (await t.call('GET', `/api/v1/versions/${versionId}/preview`, { cookie: approverA })).json.preview.submissionId
    expect(seen).toBe(subOf(versionId))
    await t.call('POST', `/api/v1/versions/${versionId}/withdraw`, { cookie: admin })
    await t.call('POST', `/api/v1/versions/${versionId}/submit`, { cookie: admin })
    const stale = await t.call('POST', `/api/v1/versions/${versionId}/review`, { cookie: approverA, body: { decision: 'approved', submissionId: seen } })
    expect(stale.status).toBe(409)
    expect((await t.call('POST', `/api/v1/versions/${versionId}/review`, { cookie: approverA, body: { decision: 'approved' } })).status).toBe(400)
    await t.call('POST', `/api/v1/versions/${versionId}/withdraw`, { cookie: admin })
  })

  it('duyệt thay cần bằng chứng của dự án; duyệt → phát hành → công khai (TC-08.04, 08.06, 08.07)', async () => {
    expect((await t.call('POST', `/api/v1/versions/${versionId}/submit`, { cookie: admin })).status).toBe(200)
    expect((await t.call('POST', `/api/v1/versions/${versionId}/publish`, { cookie: admin })).json.error.code).toBe('INVALID_STATE')
    const noEv = await t.call('POST', `/api/v1/versions/${versionId}/review-on-behalf`, { cookie: admin, body: { decision: 'approved', note: 'Duyệt qua Zalo 24/10', evidenceFileId: 'fil_khong_co', submissionId: subOf(versionId) } })
    expect(noEv.json.error.code).toBe('VALIDATION_ERROR')
    const ev = await upload(t, '/api/v1/files', admin, { name: 'zalo.png', content: png }, { kind: 'evidence', projectId })
    const ok = await t.call('POST', `/api/v1/versions/${versionId}/review-on-behalf`, { cookie: admin, body: { decision: 'approved', note: 'Duyệt qua Zalo 24/10', evidenceFileId: ev.json.file.id, submissionId: subOf(versionId) } })
    expect(ok.status, ok.body).toBe(200)
    expect(ok.json.review.onBehalf).toBe(true)
    expect(ok.json.version.state).toBe('approved')
    const pub = await t.call('POST', `/api/v1/versions/${versionId}/publish`, { cookie: admin })
    expect(pub.status, pub.body).toBe(200)
    expect(pub.json.house.publishedVersionId).toBe(versionId)
    expect(pub.json.previous).toBeNull()
    expect((await t.call('GET', '/api/v1/public/projects/du-an-wf/houses/mau-wf')).status).toBe(200)
  })

  it('phiên bản 2 phát hành thay phiên bản 1 (superseded); gỡ phát hành → 404 công khai (TC-08.08)', async () => {
    const nv = await t.call('POST', `/api/v1/houses/${houseId}/versions`, { cookie: producer })
    const v2 = nv.json.version.id
    expect((await t.call('POST', `/api/v1/versions/${v2}/submit`, { cookie: admin })).status).toBe(200)
    expect((await t.call('POST', `/api/v1/versions/${v2}/review`, { cookie: approverA, body: { decision: 'approved', submissionId: subOf(v2) } })).status).toBe(200)
    const pub = await t.call('POST', `/api/v1/versions/${v2}/publish`, { cookie: admin })
    expect(pub.json.previous).toEqual({ id: versionId, state: 'superseded' })
    expect((await t.call('GET', '/api/v1/public/projects/du-an-wf/houses/mau-wf')).json.version.number).toBe(2)
    const un = await t.call('POST', `/api/v1/houses/${houseId}/unpublish`, { cookie: admin })
    expect(un.json).toMatchObject({ house: { publishedVersionId: null }, version: { id: v2, state: 'unpublished' } })
    expect((await t.call('GET', '/api/v1/public/projects/du-an-wf/houses/mau-wf')).status).toBe(404)
    expect((await t.call('POST', `/api/v1/houses/${houseId}/unpublish`, { cookie: admin })).json.error.code).toBe('INVALID_STATE')
    // phát hành lại bản cũ (superseded) được
    expect((await t.call('POST', `/api/v1/versions/${versionId}/publish`, { cookie: admin })).status).toBe(200)
  })

  it('E4: nhắc một lần sau ≥ 5 ngày làm việc, bỏ T7/CN (TC-08.09)', async () => {
    const nv = await t.call('POST', `/api/v1/houses/${houseId}/versions`, { cookie: producer })
    const v3 = nv.json.version.id
    await t.call('POST', `/api/v1/versions/${v3}/submit`, { cookie: admin })
    const at = new Date(t.ctx.repos.submissions.lastForVersion(v3)!.submittedAt).getTime()
    const day = 86_400_000
    expect(remindDue(t.ctx, new Date(at + 2 * day))).toBe(0)
    expect(remindDue(t.ctx, new Date(at + 8 * day))).toBe(1)
    expect(remindDue(t.ctx, new Date(at + 20 * day))).toBe(0)
    // gửi T6 23/10/2026 10:00 giờ VN: tới T5 29/10 là 4 ngày làm việc, tới T6 30/10 là 5
    expect(businessDaysBetween(new Date('2026-10-23T03:00:00Z'), new Date('2026-10-29T03:00:00Z'))).toBe(4)
    expect(businessDaysBetween(new Date('2026-10-23T03:00:00Z'), new Date('2026-10-30T03:00:00Z'))).toBe(5)
    expect(outbox(t, 'E4').map((e) => e.to_addr)).toEqual(['a@kh.vn'])
  })
})
