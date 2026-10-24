import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HouseDocumentSchema } from '@hd/core'
import type { HouseDocument, PublicHousePayload, PublicProjectPayload } from '@hd/core'
import { makeApp } from './helpers.ts'
import type { TestApp } from './helpers.ts'
import { seedDemo } from '../src/seed/seed.ts'
import type { SeedResult } from '../src/seed/seed.ts'
import { newVersion, publish, review, submit, unpublish, withdraw } from '../src/services/workflow.ts'
import type { AuthUser } from '../src/services/access.ts'

let t: TestApp
let seed: SeedResult
let admin: AuthUser

beforeAll(async () => {
  t = await makeApp()
  seed = await seedDemo(t.ctx, { adminEmail: 'admin@test.vn', adminPassword: 'admin12345' })
  const u = t.ctx.repos.users.byEmail('admin@test.vn')!
  admin = { id: u.id, name: u.name, email: u.email, role: 'admin', clientId: null }
}, 60_000)
afterAll(async () => t.close())

describe('seed AC-01', () => {
  it('4 mẫu nhà đủ 4 loại, đã phát hành', async () => {
    const r = await t.call('GET', '/api/v1/public/projects/sunrise-garden')
    expect(r.status).toBe(200)
    const p = r.json as PublicProjectPayload
    expect(p.houses.map((h) => h.houseType).sort()).toEqual(['apartment', 'cottage', 'townhouse', 'villa'])
    expect(p.houses.find((h) => h.houseType === 'townhouse')!.floors).toBe(4)
    expect(p.branding.name).toBe('Sunrise Land')
    expect(p.branding.logoUrl).toMatch(/^\/files\/logo\//)
    expect(p.antiBot.formToken).toMatch(/^ft_/)
    expect(p.project.disclaimer).toContain('minh hoạ')
    expect(r.headers['cache-control']).toBe('public, max-age=60')
  })

  it('mẫu nhà có tài liệu hợp lệ, đồ thư viện được giải sẵn, không có report và ảnh nền', async () => {
    const r = await t.call('GET', '/api/v1/public/projects/sunrise-garden/houses/biet-thu-b2')
    expect(r.status).toBe(200)
    const h = r.json as PublicHousePayload
    expect(HouseDocumentSchema.safeParse(h.document).success).toBe(true)
    expect(h.document.floors.map((f) => f.name)).toEqual(['Tầng 1', 'Tầng 2', 'Tầng 3'])
    expect(h.document.floors[0].areas.map((a) => a.kind)).toContain('pool')
    const itemIds = h.document.floors.flatMap((f) => f.items).map((i) => ('libraryItemId' in i.source ? i.source.libraryItemId : ''))
    expect(itemIds.length).toBeGreaterThan(10)
    expect(itemIds.every((id) => h.resolved.libraryItems[id])).toBe(true)
    expect(JSON.stringify(h)).not.toContain('underlay')
    expect(h.house.declaredArea).toBe(395)
  })

  it('404 / 410', async () => {
    expect((await t.call('GET', '/api/v1/public/projects/khong-co')).status).toBe(404)
    expect((await t.call('GET', '/api/v1/public/projects/sunrise-garden/houses/khong-co')).status).toBe(404)
    t.ctx.repos.clients.update(seed.clientId, { status: 'suspended' })
    const r = await t.call('GET', '/api/v1/public/projects/sunrise-garden')
    expect(r.status).toBe(410)
    expect(r.json.error.code).toBe('PROJECT_UNAVAILABLE')
    t.ctx.repos.clients.update(seed.clientId, { status: 'active' })
  })

  it('BR-08: quá hạn hosting 7 ngày thì gỡ, gia hạn thì hiện lại', async () => {
    const past = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10)
    t.ctx.repos.clients.update(seed.clientId, { hostingUntil: past })
    expect((await t.call('GET', '/api/v1/public/projects/sunrise-garden')).status).toBe(410)
    const sixDays = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10)
    t.ctx.repos.clients.update(seed.clientId, { hostingUntil: sixDays })
    expect((await t.call('GET', '/api/v1/public/projects/sunrise-garden')).status).toBe(200)
    t.ctx.repos.clients.update(seed.clientId, { hostingUntil: '2099-01-01' })
  })
})

describe('/files quyền (02 §6.2)', () => {
  it('ảnh đại diện trong bản phát hành và logo công khai, cache immutable', async () => {
    const p = (await t.call('GET', '/api/v1/public/projects/sunrise-garden')).json as PublicProjectPayload
    const cover = await t.call('GET', p.houses[0].coverUrl!)
    expect(cover.status).toBe(200)
    expect(cover.headers['content-type']).toBe('image/png')
    expect(cover.headers['cache-control']).toContain('immutable')
    expect((await t.call('GET', p.branding.logoUrl!)).status).toBe(200)
  })

  it('file input (ảnh nền) không bao giờ đọc được khi chưa đăng nhập (R-01, TC-02.03)', async () => {
    const key = t.ctx.storage.newKey('input', 'mat-bang.png')
    await t.ctx.storage.putBuffer(key, Buffer.from('fake'))
    const f = t.ctx.repos.files.create({ projectId: seed.projectId, kind: 'input', originalName: 'mat-bang.png', mime: 'image/png', bytes: 4, storageKey: key, uploadedBy: null })
    // gắn làm ảnh nền tầng của bản mới rồi phát hành
    const house = t.ctx.repos.houses.get(seed.houseIds[3])!
    const v = newVersion(t.ctx, house.id)
    const doc = JSON.parse(v.document) as HouseDocument
    doc.floors[0].underlay = { fileId: f.id, mmPerPx: 10, offset: [0, 0], rotation: 0, opacity: 0.5 }
    t.ctx.repos.versions.saveDocument(v.id, doc, v.revision)
    submit(t.ctx, v.id, admin)
    review(t.ctx, v.id, admin, { decision: 'approved', note: 'duyệt thử nghiệm ảnh nền' }, { evidenceFileId: null })
    publish(t.ctx, v.id, admin)
    expect((await t.call('GET', `/files/${key}`)).status).toBe(404)
    const sub = t.ctx.repos.submissions.lastForVersion(v.id)!
    expect(sub.snapshot).not.toContain(f.id)
    expect(t.ctx.db.get('SELECT 1 FROM submission_files WHERE storage_key = ?', key)).toBeUndefined()
  })

  it('key ngẫu nhiên không tồn tại → 404', async () => {
    expect((await t.call('GET', '/files/cover/abc/khong-co.png')).status).toBe(404)
  })
})

describe('workflow', () => {
  it('chuyển trạng thái, khoá slug, bản cũ thành superseded, link giữ nguyên (BR-02, AC-09)', async () => {
    const houseId = seed.houseIds[0]
    const before = t.ctx.repos.houses.get(houseId)!
    expect(before.slugLocked).toBe(true)
    const v = newVersion(t.ctx, houseId)
    expect(() => newVersion(t.ctx, houseId)).toThrow(/chưa phát hành/)
    expect(v.number).toBe(2)
    expect(() => publish(t.ctx, v.id, admin)).toThrow()
    submit(t.ctx, v.id, admin)
    expect(() => submit(t.ctx, v.id, admin)).toThrow()
    withdraw(t.ctx, v.id, admin)
    expect(t.ctx.repos.versions.get(v.id)!.state).toBe('draft')
    submit(t.ctx, v.id, admin)
    expect(() => review(t.ctx, v.id, admin, { decision: 'changes_requested', note: 'ngắn' })).toThrow()
    review(t.ctx, v.id, admin, { decision: 'changes_requested', note: 'Đổi phòng ngủ 2 thành phòng làm việc' })
    expect(t.ctx.repos.versions.get(v.id)!.state).toBe('draft')
    submit(t.ctx, v.id, admin)
    review(t.ctx, v.id, admin, { decision: 'approved', note: 'ok duyệt bản này' })
    const { previous } = publish(t.ctx, v.id, admin)
    expect(previous?.state).toBe('superseded')
    expect(t.ctx.repos.houses.get(houseId)!.publishedVersionId).toBe(v.id)
    const subs = t.ctx.repos.submissions.listForVersion(v.id)
    expect(subs.map((s) => s.seq)).toEqual([1, 2, 3])
    expect(subs[0].withdrawnAt).not.toBeNull()
    const pub = await t.call('GET', '/api/v1/public/projects/sunrise-garden/houses/can-ho-a2')
    expect(pub.json.version.number).toBe(2)
  })

  it('gỡ phát hành → 404 công khai; khôi phục bản cũ → hiện lại', async () => {
    const houseId = seed.houseIds[1]
    const vid = t.ctx.repos.houses.get(houseId)!.publishedVersionId!
    unpublish(t.ctx, houseId)
    expect((await t.call('GET', '/api/v1/public/projects/sunrise-garden/houses/nha-pho-a1')).status).toBe(404)
    publish(t.ctx, vid, admin)
    expect((await t.call('GET', '/api/v1/public/projects/sunrise-garden/houses/nha-pho-a1')).status).toBe(200)
  })

  it('meta mẫu nhà công khai lấy từ bản duyệt (DEC-28)', async () => {
    t.ctx.repos.houses.update(seed.houseIds[2], { declaredArea: 999 })
    const h = (await t.call('GET', '/api/v1/public/projects/sunrise-garden/houses/biet-thu-b2')).json as PublicHousePayload
    expect(h.house.declaredArea).toBe(395)
  })

  it('seed idempotent', async () => {
    const again = await seedDemo(t.ctx, { adminEmail: 'admin@test.vn', adminPassword: 'admin12345' })
    expect(again.projectId).toBe(seed.projectId)
    expect(t.ctx.repos.projects.list().length).toBe(1)
  })
})

describe('OG', () => {
  it('thẻ OG cho mẫu nhà và dự án', () => {
    const og = t.ctx.og('/v/sunrise-garden/biet-thu-b2')
    expect(og?.title).toBe('Biệt thự B2 · sân vườn · Sunrise Garden')
    expect(og?.image).toMatch(/^http:\/\/localhost:5173\/files\//)
    expect(t.ctx.og('/v/sunrise-garden')?.title).toBe('Sunrise Garden')
    expect(t.ctx.og('/v/khong-co')).toBeNull()
  })
})
