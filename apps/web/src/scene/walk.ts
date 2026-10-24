import { wallSegments } from '@hd/core'
import type { Floor } from '@hd/core'

/* Đi bộ trong nhà (chế độ "Đứng trong phòng"): chặn đi xuyên tường, chỉ qua được ô cửa đi. Đơn vị: mét, mặt bằng (x, z). */

export type P2 = [number, number]

export interface Blocker {
  a: P2
  b: P2
  /** nửa độ dày tường (m) */
  half: number
  /** khối đặc (đồ nội thất): điểm nằm trong đa giác này cũng bị chặn */
  solid?: P2[]
}

/** Bán kính thân người khi kiểm va chạm (m). */
export const BODY_RADIUS = 0.22

/** Đoạn tường chặn người: phần đặc và bậu cửa sổ (thấp hơn 1 m). Ô cửa đi không chặn. */
export const blockersOf = (floor: Floor): Blocker[] =>
  wallSegments(floor).flatMap((L) => {
    const { wall, frame } = L
    return L.pieces
      .filter((p) => p.bottom < 1000)
      .map((p) => ({
        a: [(wall.a[0] + frame.u[0] * p.from) / 1000, (wall.a[1] + frame.u[1] * p.from) / 1000] as P2,
        b: [(wall.a[0] + frame.u[0] * p.to) / 1000, (wall.a[1] + frame.u[1] * p.to) / 1000] as P2,
        half: wall.thickness / 2000,
      }))
  })

const distToSeg = (p: P2, a: P2, b: P2) => {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2)) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
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

export const isFree = (p: P2, blockers: Blocker[]) =>
  blockers.every((w) => distToSeg(p, w.a, w.b) >= w.half + BODY_RADIUS && !(w.solid && inPoly(p, w.solid)))

/** Đi từ `from` về phía `to` theo bước nhỏ; dừng trước tường. Trả điểm xa nhất đi được. */
export const stepTowards = (from: P2, to: P2, blockers: Blocker[], step = 0.04): P2 => {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (d < 1e-6) return from
  // đang kẹt (vd. dữ liệu đặt đồ chồng lên chỗ đứng) → cho bước ra, không giữ chặt
  if (!isFree(from, blockers)) return to
  const n = Math.ceil(d / step)
  const sx = (to[0] - from[0]) / n
  const sz = (to[1] - from[1]) / n
  let last = from
  // đi từng bước từ vị trí hiện tại; bị chặn thì trượt dọc tường, không trượt được thì dừng (không "nhảy" qua tường)
  for (let i = 0; i < n; i++) {
    const p: P2 = [last[0] + sx, last[1] + sz]
    if (isFree(p, blockers)) {
      last = p
      continue
    }
    const alongX: P2 = [last[0] + sx, last[1]]
    const alongZ: P2 = [last[0], last[1] + sz]
    if (Math.abs(sx) > 1e-9 && isFree(alongX, blockers)) last = alongX
    else if (Math.abs(sz) > 1e-9 && isFree(alongZ, blockers)) last = alongZ
    else return last
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

/** Đồ nội thất chặn người: khung chữ nhật theo kích thước thư viện, xoay theo góc đặt. Bỏ qua thảm, đồ thấp < 15 cm. */
export const furnitureBlockers = (floor: Floor, libraryItems: Record<string, { category: string; sizeMm: [number, number, number] }>): Blocker[] =>
  floor.items.flatMap((it) => {
    if (!('libraryItemId' in it.source)) return []
    const lib = libraryItems[it.source.libraryItemId]
    if (!lib || lib.category === 'rug' || lib.sizeMm[1] < 150 || it.elevation > 1200) return []
    const [w, , d] = lib.sizeMm
    const t = (it.rotation * Math.PI) / 180
    const c = Math.cos(t)
    const s = Math.sin(t)
    const corner = (x: number, z: number): P2 => [(it.position[0] + x * c - z * s) / 1000, (it.position[1] + x * s + z * c) / 1000]
    const pts = [corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2)]
    return pts.map((a, i) => ({ a, b: pts[(i + 1) % 4], half: 0, solid: i === 0 ? pts : undefined }))
  })

/** Khoảng trống (m) từ điểm tới vật chặn gần nhất; âm/0 nếu nằm trong khối đặc. */
export const clearance = (p: P2, blockers: Blocker[]) => {
  let m = Infinity
  for (const w of blockers) {
    if (w.solid && inPoly(p, w.solid)) return 0
    m = Math.min(m, distToSeg(p, w.a, w.b) - w.half)
  }
  return m
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
