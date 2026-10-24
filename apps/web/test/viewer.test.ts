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
