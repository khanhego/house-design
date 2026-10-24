import { BODY_RADIUS as BODY_MM, buildNavGrid, clearanceAt, findPath, furnitureObstacles, standable, stairEnd as stairEndMm, wallObstacles, wallSegments } from '@hd/core'
import type { Floor, NavGrid, NavLibrary, Obstacle, Point } from '@hd/core'

/*
 * Đi bộ trong nhà (chế độ "Đứng trong phòng"), đơn vị mét trên mặt bằng (x, z).
 * Va chạm và tìm đường dùng chung với kiểm lối đi khi dựng (@hd/core nav.ts): tường / đồ là khối hộp đúng kích thước,
 * chỉ qua được ô cửa đi.
 */

export type P2 = [number, number]
export type Blocker = Obstacle

/** Bán kính thân người khi kiểm va chạm (m). */
export const BODY_RADIUS = BODY_MM / 1000

const mm = (p: P2): Point => [p[0] * 1000, p[1] * 1000]
const m = (p: Point): P2 => [p[0] / 1000, p[1] / 1000]

/** Phần tường đặc, bậu và kính cửa sổ chặn người. Ô cửa đi không chặn. */
export const blockersOf = (floor: Floor): Blocker[] => wallObstacles(floor)

/** Đồ nội thất chặn người (bỏ thảm, đồ thấp < 15 cm). */
export const furnitureBlockers = (floor: Floor, lib: NavLibrary): Blocker[] => furnitureObstacles(floor, lib)

export const isFree = (p: P2, blockers: Blocker[]) => standable(mm(p), blockers)

/** Khoảng trống (m) từ điểm tới vật chặn gần nhất; 0 nếu nằm trong vật chặn. */
export const clearance = (p: P2, blockers: Blocker[]) => clearanceAt(mm(p), blockers) / 1000

/**
 * Đi từ `from` về phía `to` theo bước nhỏ; không xuyên tường. Bị chặn thì thử lệch hướng dần (±20°…±70°) để trượt
 * dọc tường, lướt qua cạnh khung cửa / góc đồ thay vì dính lại. Trả điểm xa nhất đi được.
 */
export const stepTowards = (from: P2, to: P2, blockers: Blocker[], step = 0.04): P2 => {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (d < 1e-6) return from
  // đang kẹt (vd. dữ liệu đặt đồ chồng lên chỗ đứng) → cho bước ra, không giữ chặt
  if (!isFree(from, blockers)) return to
  const n = Math.ceil(d / step)
  const len = d / n
  const dir = Math.atan2(to[1] - from[1], to[0] - from[0])
  let last = from
  for (let i = 0; i < n; i++) {
    let moved = false
    for (const off of [0, 20, -20, 40, -40, 60, -60, 75, -75]) {
      const a = dir + (off * Math.PI) / 180
      const k = len * Math.cos((off * Math.PI) / 180)
      const p: P2 = [last[0] + Math.cos(a) * k, last[1] + Math.sin(a) * k]
      if (isFree(p, blockers)) {
        last = p
        moved = true
        break
      }
    }
    if (!moved) return last
  }
  return last
}

/** Điểm đứng hợp lệ gần `p` nhất (xoắn ốc), dùng khi đặt người vào phòng. */
export const nearestFree = (p: P2, blockers: Blocker[]): P2 => {
  if (isFree(p, blockers)) return p
  for (let r = 0.1; r < 4; r += 0.1) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      const q: P2 = [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r]
      if (isFree(q, blockers)) return q
    }
  }
  return p
}

const inPoly = (p: P2, poly: P2[]) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Chỗ đứng thoáng nhất trong phòng, ưu tiên gần tâm: lấy mẫu lưới 0,2 m trong đa giác phòng. */
export const bestSpot = (polygon: P2[], center: P2, blockers: Blocker[]): P2 => {
  const xs = polygon.map((p) => p[0])
  const zs = polygon.map((p) => p[1])
  let best: P2 | null = null
  let score = -Infinity
  for (let x = Math.min(...xs) + 0.1; x <= Math.max(...xs); x += 0.2) {
    for (let z = Math.min(...zs) + 0.1; z <= Math.max(...zs); z += 0.2) {
      const p: P2 = [x, z]
      if (!inPoly(p, polygon) || !isFree(p, blockers)) continue
      const sc = Math.min(clearance(p, blockers), 0.7) - 0.6 * Math.hypot(x - center[0], z - center[1])
      if (sc > score) (score = sc), (best = p)
    }
  }
  return best ?? nearestFree(center, blockers)
}

/** Hướng (rad, quy ước atan2(dx, dz)) đi được xa nhất từ `p` — để vừa vào phòng là nhìn và đi được ngay. */
export const openHeading = (p: P2, blockers: Blocker[], reach = 5): number => {
  let best = 0
  let far = -1
  for (let k = 0; k < 16; k++) {
    const h = (k / 16) * Math.PI * 2
    const end = stepTowards(p, [p[0] + Math.sin(h) * reach, p[1] + Math.cos(h) * reach], blockers, 0.08)
    const d = Math.hypot(end[0] - p[0], end[1] - p[1])
    if (d > far + 0.05) (far = d), (best = h)
  }
  return best
}

/** Chỗ đứng trống gần `p` nhất nằm trong một trong các vùng `areas` (phòng / sân) — khi chuyển tầng qua cầu thang. */
export const nearestFreeIn = (p: P2, blockers: Blocker[], areas: P2[][]): P2 => {
  const ok = (q: P2) => isFree(q, blockers) && areas.some((a) => inPoly(q, a))
  if (ok(p)) return p
  for (let r = 0.1; r < 6; r += 0.1) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2
      const q: P2 = [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r]
      if (ok(q)) return q
    }
  }
  return nearestFree(p, blockers)
}

/** Điểm đứng ở đầu trên (`top`) hoặc chân (`bottom`) cầu thang, cách mép 0,6 m (m). */
export const stairEnd = (polygon: [number, number][], upDirection: number, end: 'top' | 'bottom'): P2 => m(stairEndMm(polygon, upDirection, end))

/** Lưới tìm đường cho một tầng (tính một lần khi vào tầng). */
export const navGridOf = (floor: Floor, blockers: Blocker[]): NavGrid => buildNavGrid(floor, blockers, 50)

/** Đường đi (m) từ `from` tới `to` né tường, đồ, qua cửa; không có đường → null. Điểm đầu là `from`. */
export const pathTo = (grid: NavGrid, from: P2, to: P2): P2[] | null => findPath(grid, mm(from), mm(to))?.map(m) ?? null

/** Ô cửa đi trên tầng (m): tâm, pháp tuyến, nửa bề rộng. */
export interface Portal {
  c: P2
  n: P2
  half: number
}

export const portalsOf = (floor: Floor): Portal[] =>
  wallSegments(floor).flatMap((L) =>
    L.openings
      .filter((o) => o.opening.kind === 'door')
      .map((o) => {
        const s = (o.from + o.to) / 2
        return { c: [(L.wall.a[0] + L.frame.u[0] * s) / 1000, (L.wall.a[1] + L.frame.u[1] * s) / 1000] as P2, n: [L.frame.n[0], L.frame.n[1]] as P2, half: (o.to - o.from) / 2000 }
      }),
  )

/**
 * Một bước đi theo hướng `dir` (đơn vị) dài `dist` (m). Bị chặn mà đang hướng về một ô cửa gần (≤ 1,6 m) thì kéo
 * hướng đi vào giữa cửa — đi chéo lệch tâm không còn dính vào cạnh khung cửa.
 */
export const walkStep = (from: P2, dir: P2, dist: number, blockers: Blocker[], portals: Portal[]): P2 => {
  const plain = stepTowards(from, [from[0] + dir[0] * dist, from[1] + dir[1] * dist], blockers)
  const got = Math.hypot(plain[0] - from[0], plain[1] - from[1])
  if (got > dist * 0.6) return plain
  let best: P2 | null = null
  let bd = Infinity
  for (const p of portals) {
    const vx = p.c[0] - from[0]
    const vz = p.c[1] - from[1]
    const d = Math.hypot(vx, vz)
    if (d > 1.6 || d < 1e-3) continue
    const along = vx * p.n[0] + vz * p.n[1]
    const side = Math.sign(along) || Math.sign(dir[0] * p.n[0] + dir[1] * p.n[1]) || 1
    // đang muốn đi qua cửa: hướng đi cùng chiều xuyên cửa
    if ((dir[0] * p.n[0] + dir[1] * p.n[1]) * side < 0.25) continue
    // điểm ngắm: trước cửa thì nhắm giữa cửa, đã vào khung cửa thì nhắm ra phía bên kia
    const aim: P2 = Math.abs(along) > 0.15 ? [p.c[0] - p.n[0] * side * 0.05, p.c[1] - p.n[1] * side * 0.05] : [p.c[0] + p.n[0] * side * 0.5, p.c[1] + p.n[1] * side * 0.5]
    if (d < bd) (bd = d), (best = aim)
  }
  if (!best) return plain
  const ax = best[0] - from[0]
  const az = best[1] - from[1]
  const al = Math.hypot(ax, az) || 1
  const mix: P2 = [dir[0] * 0.3 + (ax / al) * 0.7, dir[1] * 0.3 + (az / al) * 0.7]
  const ml = Math.hypot(mix[0], mix[1]) || 1
  const assisted = stepTowards(from, [from[0] + (mix[0] / ml) * dist, from[1] + (mix[1] / ml) * dist], blockers)
  return Math.hypot(assisted[0] - from[0], assisted[1] - from[1]) > got ? assisted : plain
}
