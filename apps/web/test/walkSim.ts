import { buildNavGrid, centerOf, obstaclesOf, pointInPolygon, sortedFloors, stairEnd, wallSegments } from '@hd/core'
import type { Floor, HouseDocument, NavLibrary, Point } from '@hd/core'
import { Walker } from '../src/scene/physics/walker.ts'
import type { V3 } from '../src/scene/physics/walker.ts'

/*
 * Bộ mô phỏng đi bộ (không cần trình duyệt) cho người mẫu dùng bộ vật lý: cùng các kịch bản đã chạy trên trình duyệt
 * — đi qua mọi phòng, đi phím qua mọi cửa, leo mọi cầu thang — thêm đi lung tung kiểm không rời sàn, và cần lò xo camera.
 */

const DT = 1 / 60
const WALK = 1.4

/** Chỗ đứng thoáng nhất trong phòng (mm → m). */
export const roomSpot = (f: Floor, lib: NavLibrary, polygon: Point[]): V3 | null => {
  const g = buildNavGrid(f, obstaclesOf(f, lib))
  let best: Point | null = null
  let bc = -1
  for (let k = 0; k < g.clear.length; k++) {
    if (g.clear[k] <= bc) continue
    const c = centerOf(g, k)
    if (pointInPolygon(c, polygon)) (bc = g.clear[k]), (best = c)
  }
  return best ? { x: best[0] / 1000, y: f.elevation / 1000, z: best[1] / 1000 } : null
}

/** Đi theo đường navmesh tới `to`; trả khoảng cách còn lại (m) khi dừng. */
export const walkPath = (w: Walker, to: V3, maxT = 60): { gap: number; ok: boolean; path: number } => {
  const path = w.pathTo(to)
  if (!path) return { gap: Infinity, ok: false, path: 0 }
  let i = 1
  let stall = 0
  for (let t = 0; t < maxT && i < path.length; t += DT) {
    const p = w.pos
    const q = path[i]
    const dx = q.x - p.x
    const dz = q.z - p.z
    const d = Math.hypot(dx, dz)
    if (d < 0.12 && Math.abs(q.y - p.y) < 0.6) {
      i++
      continue
    }
    const v = Math.min(WALK, d / DT)
    const got = w.move({ x: (dx / d) * v, z: (dz / d) * v }, DT)
    stall = got < 1e-4 ? stall + 1 : 0
    if (stall > 90) break
  }
  for (let k = 0; k < 20; k++) w.move({ x: 0, z: 0 }, DT)
  const p = w.pos
  const gap = Math.hypot(p.x - to.x, p.z - to.z)
  return { gap, ok: gap < 0.35 && Math.abs(p.y - to.y) < 0.3, path: path.length }
}

/** Đi thẳng theo hướng `dir` trong `sec` giây (như giữ phím W). */
export const walkStraight = (w: Walker, dir: { x: number; z: number }, sec: number) => {
  for (let t = 0; t < sec; t += DT) w.move({ x: dir.x * WALK, z: dir.z * WALK }, DT)
}

export interface DoorCase {
  label: string
  floor: Floor
  c: [number, number]
  n: [number, number]
  u: [number, number]
  width: number
}

export const doorsOf = (doc: HouseDocument): DoorCase[] =>
  sortedFloors(doc).flatMap((f) =>
    wallSegments(f).flatMap((L) =>
      L.openings
        .filter((o) => o.opening.kind === 'door')
        .map((o) => {
          const s = (o.from + o.to) / 2
          return { label: `${f.name} cửa @${Math.round(L.wall.a[0] + L.frame.u[0] * s)},${Math.round(L.wall.a[1] + L.frame.u[1] * s)}`, floor: f, c: [(L.wall.a[0] + L.frame.u[0] * s) / 1000, (L.wall.a[1] + L.frame.u[1] * s) / 1000] as [number, number], n: [L.frame.n[0], L.frame.n[1]] as [number, number], u: [L.frame.u[0], L.frame.u[1]] as [number, number], width: (o.to - o.from) / 1000 }
        }),
    ),
  )

/** Vùng có sàn của tầng (mm) — để kiểm người không đứng giữa khoảng không. */
export const slabOf = (doc: HouseDocument, f: Floor): Point[][] => [
  ...f.rooms.map((r) => r.polygon),
  ...f.areas.map((a) => a.polygon),
  ...f.stairs.map((s) => s.polygon),
  ...doc.floors.flatMap((x) => x.stairs.filter((s) => s.toFloorId === f.id).map((s) => s.polygon)),
  ...(f.outline && f.outline.length > 2 ? [f.outline] : []),
]

/** Bộ sinh số ngẫu nhiên có hạt giống (để kết quả lặp lại được). */
export const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

export { stairEnd }
