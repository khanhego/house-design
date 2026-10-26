import { describe, expect, it } from 'vitest'
import { sunFor } from '../src/scene/sun.ts'
import { meterBox } from '../src/scene/surfaces.ts'

/* Item 03 lát R1 — nắng theo hướng nhà + giờ, UV theo mét (vân đúng kích thước thật). */

describe('nắng theo hướng nhà và giờ (FR-13.12)', () => {
  it('mặt tiền quay Nam (northDeg 180): sáng nắng từ Đông, trưa ở phía Nam, chiều từ Tây', () => {
    // Bắc ở phía y lớn → Đông ở phía x âm, Nam ở phía y âm (z âm trong three.js)
    const am = sunFor(180, 8)
    const noon = sunFor(180, 12)
    const pm = sunFor(180, 16)
    expect(am.dir[0]).toBeLessThan(-0.3)
    expect(pm.dir[0]).toBeGreaterThan(0.3)
    expect(noon.dir[2]).toBeLessThan(0)
    expect(noon.altitude).toBeGreaterThan(am.altitude)
    expect(noon.strength).toBe(1)
  })
  it('xoay nhà 90° thì hướng nắng xoay theo; 6 giờ sáng nắng yếu, hướng đúng chiều', () => {
    const a = sunFor(180, 9)
    const b = sunFor(90, 9)
    // quay hướng Bắc 90° ngược chiều kim đồng hồ trên mặt bằng ⇒ vector nắng ngang cũng quay 90°
    const dot = a.dir[0] * b.dir[0] + a.dir[2] * b.dir[2]
    expect(Math.abs(dot)).toBeLessThan(0.05)
    expect(sunFor(180, 6).strength).toBeLessThan(0.2)
  })
})

describe('UV theo mét (FR-13.11)', () => {
  it('mặt ±z của hộp tường 4 × 3 × 0,2 m có UV 0…4 × 0…3', () => {
    const g = meterBox(4, 3, 0.2)
    const uv = g.getAttribute('uv')
    // mặt +z là mặt thứ 5 (đỉnh 16…19)
    const us = [16, 17, 18, 19].map((i) => uv.getX(i))
    const vs = [16, 17, 18, 19].map((i) => uv.getY(i))
    expect(Math.max(...us)).toBeCloseTo(4)
    expect(Math.max(...vs)).toBeCloseTo(3)
    // mặt đầu tường (+x) dùng bề dày làm chiều ngang
    expect(Math.max(...[0, 1, 2, 3].map((i) => uv.getX(i)))).toBeCloseTo(0.2)
  })
})
