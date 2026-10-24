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
