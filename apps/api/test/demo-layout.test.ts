import { describe, expect, it } from 'vitest'
import { auditHouse, pointInPolygon } from '@hd/core'
import { LIBRARY, demoHouses } from '../src/seed/demoHouses.ts'

/* Nhà mẫu phải đi lại được (nav.ts): mọi phòng vào được từ cửa chính / cầu thang, lối đi ≥ 0,65 m, không đồ chắn cửa / cầu thang. */
describe('nhà mẫu — lối đi giữa các phòng', () => {
  const ids = Object.fromEntries(LIBRARY.map((l) => [l.key, `lib_${l.key}`]))
  const sizes = Object.fromEntries(LIBRARY.map((l) => [l.key, l.sizeMm]))
  const lib = Object.fromEntries(LIBRARY.map((l) => [`lib_${l.key}`, { category: l.category, sizeMm: l.sizeMm }]))
  for (const h of demoHouses(ids as never, sizes as never)) {
    it(`${h.slug}: đi lại được khắp nhà, không lối hẹp, không đồ chắn cửa`, () => {
      expect(auditHouse(h.document, lib).map((i) => i.message)).toEqual([])
    })
    it(`${h.slug}: WC nào cũng có bồn cầu, phòng ngủ nào cũng có giường`, () => {
      for (const f of h.document.floors)
        for (const r of f.rooms) {
          const keys = f.items.filter((it) => pointInPolygon(it.position, r.polygon)).map((it) => ('libraryItemId' in it.source ? it.source.libraryItemId : ''))
          if (r.function === 'wc' || r.function === 'bathroom') expect(keys, `${f.name} · ${r.name}`).toContain('lib_toilet')
          if (r.function === 'bedroom') expect(keys.some((k) => k.startsWith('lib_bed')), `${f.name} · ${r.name}`).toBe(true)
        }
    })
  }
})

describe('làm mới nhà mẫu đã phát hành', async () => {
  const { makeApp } = await import('./helpers.ts')
  const { seedDemo, refreshDemo } = await import('../src/seed/seed.ts')
  it('tạo phiên bản 2 cho mọi nhà mẫu, phát hành, giữ ảnh đại diện', async () => {
    const t = await makeApp()
    await seedDemo(t.ctx, { adminEmail: 'admin@test.vn', adminPassword: 'admin12345' })
    const before = (await t.call('GET', '/api/v1/public/projects/sunrise-garden/houses/biet-thu-b2')).json
    expect(refreshDemo(t.ctx)).toHaveLength(4)
    const after = (await t.call('GET', '/api/v1/public/projects/sunrise-garden/houses/biet-thu-b2')).json
    expect(after.version.number).toBe(2)
    expect(after.document.coverFileId).toBe(before.document.coverFileId)
    expect(after.document.floors.flatMap((f: { rooms: { name: string }[] }) => f.rooms.map((r) => r.name))).toContain('Hành lang')
    await t.close()
  }, 60_000)
})
