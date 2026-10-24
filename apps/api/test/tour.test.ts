import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import type { HouseDocument } from '@hd/core'
import { makeApp, outbox, upload, userWithLogin } from './helpers.ts'
import type { TestApp } from './helpers.ts'
import { submitLead } from '../src/services/leads.ts'

/* Item 02 — Tham quan ảnh thật: API-24, tour trong tài liệu, mẫu nhà chỉ có tour, lead theo cảnh. */

let t: TestApp
let admin: string
let producer: string
let projectId = ''
let houseId = ''
let versionId = ''

const photo = async (w: number, h: number, color: string) =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Make: 'TestCam', DateTime: '2026:10:20 09:15:00' } } })
    .toBuffer()

beforeAll(async () => {
  t = await makeApp()
  admin = await userWithLogin(t, 'admin@test.vn', 'admin')
  producer = await userWithLogin(t, 'dung@test.vn', 'producer')
  const c = (await t.call('POST', '/api/v1/clients', { cookie: admin, body: { name: 'KH tour' } })).json.client.id
  projectId = (await t.call('POST', '/api/v1/projects', { cookie: admin, body: { clientId: c, slug: 'du-an-tour', name: 'Dự án tour', contact: { leadEmails: ['sales@tour.vn'] } } })).json.project.id
  const h = await t.call('POST', `/api/v1/projects/${projectId}/houses`, { cookie: producer, body: { name: 'Nhà phố Lê Lợi', slug: 'nha-pho-le-loi', houseType: 'townhouse', declaredArea: 72 } })
  houseId = h.json.house.id
  versionId = h.json.version.id
}, 60_000)
afterAll(async () => t.close())

describe('ảnh tour (API-24)', () => {
  it('ra 2 cỡ WebP, không còn EXIF, trả thời điểm chụp (AC-T6, EX-T2)', async () => {
    const r = await upload(t, `/api/v1/projects/${projectId}/tour-images`, producer, { name: '01-mat-tien.jpg', content: await photo(4000, 3000, '#8899aa'), type: 'image/jpeg' })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    expect(r.json.image).toMatchObject({ width: 2560, height: 1920 })
    expect(r.json.takenAt).toBe('2026-10-20T09:15:00')
    const big = await t.app.inject({ method: 'GET', url: r.json.image.url, headers: { cookie: producer } })
    expect(big.headers['content-type']).toBe('image/webp')
    const meta = await sharp(big.rawPayload).metadata()
    expect(meta.exif).toBeUndefined()
    const small = await sharp((await t.app.inject({ method: 'GET', url: r.json.small.url, headers: { cookie: producer } })).rawPayload).metadata()
    expect(small.width).toBe(1280)
  })
  it('HEIC và tệp lạ bị từ chối; người duyệt không tải được', async () => {
    const heic = await upload(t, `/api/v1/projects/${projectId}/tour-images`, producer, { name: 'IMG_0001.HEIC', content: 'x' })
    expect(heic.status).toBe(415)
    expect(heic.json.error.message).toContain('HEIC')
    expect((await upload(t, `/api/v1/projects/${projectId}/tour-images`, producer, { name: 'a.gif', content: 'x' })).status).toBe(415)
  })
})

describe('mẫu nhà chỉ có tour', () => {
  it('lưu tour, gửi duyệt, phát hành, trang công khai có modes = tour; lead kèm tên cảnh (AC-T4, AC-T5)', async () => {
    const imgs = []
    for (const [i, c] of ['#aa6644', '#668844', '#446688'].entries()) {
      const r = await upload(t, `/api/v1/projects/${projectId}/tour-images`, producer, { name: `0${i + 1}-canh.jpg`, content: await photo(2000, 1500, c), type: 'image/jpeg' })
      imgs.push(r.json)
    }
    const v = (await t.call('GET', `/api/v1/versions/${versionId}`, { cookie: producer })).json
    const doc: HouseDocument = {
      ...v.document,
      coverFileId: imgs[0].image.id,
      tour: {
        autoplaySec: 4,
        scenes: imgs.map((im, i) => ({ id: `scn_${i}`, fileId: im.image.id, smallFileId: im.small.id, title: ['Mặt tiền', 'Phòng khách', 'Bếp'][i], highlights: i === 1 ? ['Trần 3,6 m'] : [], ...(i < 2 ? { next: [0.5, 0.55] as [number, number] } : {}) })),
      },
    }
    const saved = await t.call('PUT', `/api/v1/versions/${versionId}/document`, { cookie: producer, body: { document: doc }, headers: { 'if-match': String(v.revision) } })
    expect(saved.status, saved.body).toBe(200)
    expect(saved.json.checks.filter((c: { level: string }) => c.level === 'block')).toEqual([])
    // tham chiếu sai loại tệp → DOCUMENT_INVALID
    const bad = structuredClone(doc)
    bad.tour!.scenes[0].fileId = imgs[0].image.id
    bad.tour!.scenes[0].smallFileId = 'fil_khong_co'
    expect((await t.call('PUT', `/api/v1/versions/${versionId}/document`, { cookie: producer, body: { document: bad }, headers: { 'if-match': String(saved.json.revision) } })).json.error.code).toBe('DOCUMENT_INVALID')

    expect((await t.call('POST', `/api/v1/versions/${versionId}/submit`, { cookie: admin })).status).toBe(200)
    const sub = t.ctx.repos.versions.get(versionId)!.currentSubmissionId!
    await t.call('POST', `/api/v1/versions/${versionId}/review-on-behalf`, { cookie: admin, body: { decision: 'approved', note: 'Duyệt tour qua Zalo', evidenceFileId: (await upload(t, '/api/v1/files', admin, { name: 'z.png', content: await photo(10, 10, '#fff') }, { kind: 'evidence', projectId })).json.file.id, submissionId: sub } })
    expect((await t.call('POST', `/api/v1/versions/${versionId}/publish`, { cookie: admin })).status).toBe(200)

    const pub = await t.call('GET', '/api/v1/public/projects/du-an-tour')
    expect(pub.json.houses[0].modes).toEqual(['tour'])
    const house = (await t.call('GET', '/api/v1/public/projects/du-an-tour/houses/nha-pho-le-loi')).json
    expect(house.document.tour.scenes).toHaveLength(3)
    const url = house.resolved.files[house.document.tour.scenes[1].fileId]
    expect(url).toBeTruthy()
    expect((await t.app.inject({ method: 'GET', url })).statusCode).toBe(200) // ảnh tour công khai sau phát hành

    submitLead(t.ctx, { projectSlug: 'du-an-tour', houseSlug: 'nha-pho-le-loi', phone: '0912000111', consent: true, context: { sceneId: house.document.tour.scenes[1].id } })
    const e5 = outbox(t, 'E5').at(-1)!
    expect(e5.data.roomName).toBe('Ảnh thật · Phòng khách')
  })
  it('không có tầng dựng, không có tour → chặn NO_CONTENT; tour 1 cảnh → TOUR_TOO_SHORT', async () => {
    const h = await t.call('POST', `/api/v1/projects/${projectId}/houses`, { cookie: producer, body: { name: 'Trống', slug: 'trong', houseType: 'apartment', declaredArea: 30 } })
    const v = (await t.call('GET', `/api/v1/versions/${h.json.version.id}`, { cookie: producer })).json
    expect(v.checks.map((c: { code: string }) => c.code)).toContain('NO_CONTENT')
  })
})
