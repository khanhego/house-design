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
