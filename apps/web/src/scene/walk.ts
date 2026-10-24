import { wallSegments } from '@hd/core'
import type { Floor } from '@hd/core'

/* Đi bộ trong nhà (chế độ "Đứng trong phòng"): chặn đi xuyên tường, chỉ qua được ô cửa đi. Đơn vị: mét, mặt bằng (x, z). */

export type P2 = [number, number]

export interface Blocker {
  a: P2
  b: P2
  /** nửa độ dày tường (m) */
  half: number
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

export const isFree = (p: P2, blockers: Blocker[]) => blockers.every((w) => distToSeg(p, w.a, w.b) >= w.half + BODY_RADIUS)

/** Đi từ `from` về phía `to` theo bước nhỏ; dừng trước tường. Trả điểm xa nhất đi được. */
export const stepTowards = (from: P2, to: P2, blockers: Blocker[], step = 0.04): P2 => {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (d < 1e-6) return from
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
  for (let r = 0.1; r < 3; r += 0.1) {
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
    return pts.map((a, i) => ({ a, b: pts[(i + 1) % 4], half: 0 }))
  })
