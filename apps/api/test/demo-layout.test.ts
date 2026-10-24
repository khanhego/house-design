import { describe, expect, it } from 'vitest'
import { unreachableRooms } from '@hd/core'
import { LIBRARY, demoHouses } from '../src/seed/demoHouses.ts'

/* Nhà mẫu phải đi lại được: mọi phòng có lối vào từ cửa chính / cầu thang (lỗi kẻ thừa tường ngăn). */
describe('nhà mẫu — lối đi giữa các phòng', () => {
  const ids = Object.fromEntries(LIBRARY.map((l) => [l.key, `lib_${l.key}`]))
  const sizes = Object.fromEntries(LIBRARY.map((l) => [l.key, l.sizeMm]))
  for (const h of demoHouses(ids as never, sizes as never)) {
    it(`${h.slug}: không phòng nào bị cô lập`, () => {
      const bad = h.document.floors.flatMap((f) => unreachableRooms(h.document, f).map((id) => `${f.name} · ${f.rooms.find((r) => r.id === id)!.name}`))
      expect(bad).toEqual([])
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
