import { describe, expect, it } from 'vitest'
import { pickScale } from '../src/lib/pdfScale.ts'
import { inkFor } from '../src/viewer/Brand.tsx'

describe('PDF', () => {
  it('chọn tỷ lệ lớn nhất vừa khung A3 (396 × 236 mm)', () => {
    expect(pickScale(12000, 9000)).toBe(50) // căn hộ 12 × 9 m
    expect(pickScale(7000, 20000)).toBe(100) // nhà phố 18 m
    expect(pickScale(30000, 30000)).toBe(200)
  })
})

describe('thương hiệu', () => {
  it('chữ tương phản trên màu thương hiệu', () => {
    expect(inkFor('#0E6B5C')).toBe('#ffffff')
    expect(inkFor('#F4E04D')).toBe('#1d1a17')
  })
})

describe('tracker (BR-10)', async () => {
  const { sessionFor, deviceIdOf } = await import('../src/lib/tracker.ts')
  const mem = () => {
    const m = new Map<string, string>()
    return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) }
  }
  it('giữ phiên khi còn tương tác; > 30 phút không tương tác → phiên mới', () => {
    const s = mem()
    const a = sessionFor(s, 0)
    expect(sessionFor(s, 29 * 60_000)).toBe(a)
    expect(sessionFor(s, 58 * 60_000)).toBe(a)
    expect(sessionFor(s, 58 * 60_000 + 30 * 60_000 + 1)).not.toBe(a)
  })
  it('mã thiết bị ổn định', () => {
    const s = mem()
    expect(deviceIdOf(s)).toBe(deviceIdOf(s))
  })
})

describe('đi bộ trong nhà — va chạm tường', async () => {
  const { floorFromRects } = await import('@hd/core')
  const { blockersOf, isFree, stepTowards } = await import('../src/scene/walk.ts')
  // hai phòng 4 × 4 m cạnh nhau, tường ngăn ở x = 4 m
  const f = floorFromRects({ name: 'T1', order: 1, elevation: 0, rooms: [{ name: 'A', function: 'living', rect: [0, 0, 4000, 4000] }, { name: 'B', function: 'bedroom', rect: [4000, 0, 4000, 4000] }] })
  const mid = f.walls.find((w) => w.a[0] === 4000 && w.b[0] === 4000)!
  it('tường ngăn chặn người, dừng trước tường', () => {
    const end = stepTowards([2, 1], [6, 1], blockersOf(f))
    expect(end[0]).toBeLessThan(4 - 0.2)
    expect(end[0]).toBeGreaterThan(3.5)
  })
  it('qua được ô cửa đi, không qua được cửa sổ', () => {
    const withDoor = { ...f, openings: [{ id: 'd', wallId: mid.id, kind: 'door' as const, offset: 1500, width: 900, height: 2100, sill: 0, hinge: 'start' as const, swing: 'left' as const }] }
    const y = (Math.min(mid.a[1], mid.b[1]) + 1950) / 1000
    expect(stepTowards([2, y], [6, y], blockersOf(withDoor))[0]).toBeCloseTo(6)
    const withWindow = { ...f, openings: [{ ...withDoor.openings[0], kind: 'window' as const, sill: 900, height: 1200 }] }
    expect(stepTowards([2, y], [6, y], blockersOf(withWindow))[0]).toBeLessThan(4)
    expect(isFree([2, 2], blockersOf(f))).toBe(true)
  })
})

describe('đi bộ trong nhà — va chạm đồ', async () => {
  const { floorFromRects } = await import('@hd/core')
  const { furnitureBlockers, stepTowards } = await import('../src/scene/walk.ts')
  const f = floorFromRects({ name: 'T1', order: 1, elevation: 0, rooms: [{ name: 'A', function: 'dining', rect: [0, 0, 6000, 6000] }] })
  f.items = [
    { id: 't', source: { libraryItemId: 'table' }, position: [3000, 3000], elevation: 0, rotation: 0 },
    { id: 'r', source: { libraryItemId: 'rug' }, position: [3000, 1000], elevation: 0, rotation: 0 },
  ]
  const lib = { table: { category: 'table', sizeMm: [1600, 750, 900] as [number, number, number] }, rug: { category: 'rug', sizeMm: [2000, 10, 1400] as [number, number, number] } }
  it('bàn ăn chặn người, thảm thì đi qua được', () => {
    const bl = furnitureBlockers(f, lib)
    expect(bl).toHaveLength(4)
    expect(stepTowards([1, 3], [5, 3], bl)[0]).toBeLessThan(3 - 0.8)
    expect(stepTowards([1, 1], [5, 1], bl)[0]).toBeCloseTo(5)
  })
})

describe('đi bộ trong nhà — không kẹt khi tâm phòng trùng bàn', async () => {
  const { floorFromRects } = await import('@hd/core')
  const { blockersOf, furnitureBlockers, isFree, nearestFree, stepTowards } = await import('../src/scene/walk.ts')
  const f = floorFromRects({ name: 'T1', order: 1, elevation: 0, rooms: [{ name: 'Bếp & ăn', function: 'dining', rect: [0, 0, 5000, 4000] }] })
  f.items = [{ id: 't', source: { libraryItemId: 'table' }, position: [2500, 2000], elevation: 0, rotation: 0 }]
  const bl = [...blockersOf(f), ...furnitureBlockers(f, { table: { category: 'table', sizeMm: [1600, 750, 900] } })]
  it('tâm bàn là chỗ bị chặn; người được đặt ra ngoài bàn và đi lại được', () => {
    expect(isFree([2.5, 2], bl)).toBe(false)
    const start = nearestFree([2.5, 2], bl)
    expect(isFree(start, bl)).toBe(true)
    const moved = stepTowards(start, [start[0], start[1] < 2 ? 0.6 : 3.4], bl)
    expect(Math.hypot(moved[0] - start[0], moved[1] - start[1])).toBeGreaterThan(0.2)
  })
  it('đang kẹt trong đồ vẫn bước ra được', () => {
    expect(stepTowards([2.5, 2], [2.5, 2.1], bl)).toEqual([2.5, 2.1])
  })
})
