import { bboxOf } from './geometry.ts'
import type { Point, Stair } from './schema.ts'

/*
 * Hình học cầu thang (mm), dùng chung cho dựng 3D, mặt bằng, va chạm đi bộ và kiểm lối đi.
 * - Thang thẳng: một vế, đi vào ở cạnh dưới, ra ở cạnh trên (theo hướng lên).
 * - Thang chữ U (kiểu nhà phố): vế 1 đi lên ở nửa phải, chiếu nghỉ ở cuối, vế 2 quay lại ở nửa trái; đi vào và ra
 *   đều ở cạnh dưới — các tầng xếp chồng cùng một chỗ được.
 */

export interface StairFlight {
  /** tâm cạnh đầu / cuối vế (mm, mặt bằng) */
  from: Point
  to: Point
  width: number
  /** cao độ đầu / cuối vế so với sàn (mm) */
  h0: number
  h1: number
}

export interface StairLayout {
  flights: StairFlight[]
  /** chiếu nghỉ (đa giác, cao độ so với sàn) */
  landing: { polygon: Point[]; h: number } | null
  /** hướng lên (đơn vị) và hướng vuông góc */
  dir: Point
  perp: Point
}

const frame = (s: Stair) => {
  const b = bboxOf(s.polygon)
  const a = (s.upDirection * Math.PI) / 180
  const dir: Point = [Math.cos(a), Math.sin(a)]
  const along = Math.abs(dir[0]) > Math.abs(dir[1])
  // làm tròn theo trục chính để vế nằm đúng trong khung
  const d: Point = along ? [Math.sign(dir[0]), 0] : [0, Math.sign(dir[1])]
  const perp: Point = [-d[1], d[0]]
  const len = along ? b.maxX - b.minX : b.maxY - b.minY
  const width = along ? b.maxY - b.minY : b.maxX - b.minX
  const c: Point = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
  const bottom: Point = [c[0] - (d[0] * len) / 2, c[1] - (d[1] * len) / 2]
  return { d, perp, len, width, c, bottom }
}

export const stairLayout = (s: Stair, rise: number): StairLayout => {
  const { d, perp, len, width, bottom } = frame(s)
  const at = (t: number, side: number): Point => [bottom[0] + d[0] * t + perp[0] * side, bottom[1] + d[1] * t + perp[1] * side]
  if (s.shape !== 'u') return { flights: [{ from: at(0, 0), to: at(len, 0), width, h0: 0, h1: rise }], landing: null, dir: d, perp }
  const half = width / 2
  const lw = Math.min(half, len * 0.4) // sâu chiếu nghỉ
  const run = len - lw
  const landing: Point[] = [at(run, half), at(len, half), at(len, -half), at(run, -half)]
  return {
    flights: [
      { from: at(0, half / 2), to: at(run, half / 2), width: half, h0: 0, h1: rise / 2 },
      { from: at(run, -half / 2), to: at(0, -half / 2), width: half, h0: rise / 2, h1: rise },
    ],
    landing: { polygon: landing, h: rise / 2 },
    dir: d,
    perp,
  }
}

/** Điểm đứng ở chân (`bottom`, trên tầng có thang) hoặc đầu (`top`, trên tầng đi tới) cầu thang, cách mép 600 mm. */
export const stairEnd = (s: Stair | { polygon: Point[]; upDirection: number; shape?: Stair['shape'] }, end: 'top' | 'bottom'): Point => {
  const L = stairLayout(s as Stair, 1)
  const f = end === 'bottom' ? L.flights[0] : L.flights[L.flights.length - 1]
  const p = end === 'bottom' ? f.from : f.to
  const q = end === 'bottom' ? f.to : f.from
  const dl = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1
  // lùi ra khỏi vế thang 600 mm theo hướng ngược chiều đi lên của vế đó (chân) / thuận chiều (đầu)
  return [p[0] + ((p[0] - q[0]) / dl) * 600, p[1] + ((p[1] - q[1]) / dl) * 600]
}
