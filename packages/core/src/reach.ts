import { bboxOf, pointInPolygon, wallSegments } from './geometry.ts'
import type { Floor, HouseDocument, Point } from './schema.ts'

/*
 * Lối đi trong nhà (kiểm khi dựng): phòng nào không đi tới được từ cửa chính / cầu thang.
 * Lưới 100 mm; ô bị chặn nếu cách phần tường đặc hoặc bậu cửa sổ < nửa dày tường + 200 mm
 * (người cần lối ≥ 0,4 m). Ô cửa đi không chặn.
 */

const CELL = 100
const CLEAR = 200

interface Seg {
  a: Point
  b: Point
  r: number
}

const segsOf = (floor: Floor): Seg[] =>
  wallSegments(floor).flatMap((L) =>
    L.pieces
      .filter((p) => p.bottom < 1000)
      .map((p) => ({
        a: [L.wall.a[0] + L.frame.u[0] * p.from, L.wall.a[1] + L.frame.u[1] * p.from] as Point,
        b: [L.wall.a[0] + L.frame.u[0] * p.to, L.wall.a[1] + L.frame.u[1] * p.to] as Point,
        r: L.wall.thickness / 2 + CLEAR,
      })),
  )

const near = (p: Point, s: Seg) => {
  const dx = s.b[0] - s.a[0]
  const dy = s.b[1] - s.a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - (s.a[0] + t * dx), p[1] - (s.a[1] + t * dy)) < s.r
}

/** id các phòng của `floor` không đi tới được. */
export const unreachableRooms = (doc: HouseDocument, floor: Floor): string[] => {
  if (!floor.rooms.length || !floor.walls.length) return []
  const segs = segsOf(floor)
  const pts = [...floor.walls.flatMap((w) => [w.a, w.b]), ...floor.rooms.flatMap((r) => r.polygon)]
  const b = bboxOf(pts)
  const x0 = b.minX - 1000
  const y0 = b.minY - 1000
  const nx = Math.ceil((b.maxX - b.minX + 2000) / CELL)
  const ny = Math.ceil((b.maxY - b.minY + 2000) / CELL)
  const at = (i: number, j: number): Point => [x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL]
  const blocked = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (segs.some((s) => near(at(i, j), s))) blocked[j * nx + i] = 1

  // điểm xuất phát: ngoài nhà nếu tường bao có cửa đi; nếu không (tầng trên) thì đầu cầu thang đi lên tới tầng này
  const seeds: number[] = []
  const hasExteriorDoor = floor.openings.some((o) => {
    if (o.kind !== 'door') return false
    const w = floor.walls.find((x) => x.id === o.wallId)
    return !!w && w.thickness >= 150
  })
  const arrivals = doc.floors.flatMap((f) => f.stairs.filter((s) => s.toFloorId === floor.id).map((s) => s.polygon))
  const ground = floor.elevation <= Math.min(...doc.floors.map((f) => f.elevation))
  if (hasExteriorDoor && (ground || !arrivals.length)) for (let i = 0; i < nx; i++) seeds.push(i) // hàng ô ngoài cùng = ngoài nhà
  else
    for (const poly of arrivals)
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (!blocked[j * nx + i] && pointInPolygon(at(i, j), poly)) seeds.push(j * nx + i)
  if (!seeds.length) return [] // không xác định được lối vào (vd. tầng chưa có cửa) — không kết luận

  const seen = new Uint8Array(nx * ny)
  const queue = seeds.filter((k) => !blocked[k])
  queue.forEach((k) => (seen[k] = 1))
  while (queue.length) {
    const k = queue.pop()!
    const i = k % nx
    const j = (k - i) / nx
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di
      const c = j + dj
      if (a < 0 || c < 0 || a >= nx || c >= ny) continue
      const q = c * nx + a
      if (!seen[q] && !blocked[q]) (seen[q] = 1), queue.push(q)
    }
  }

  return floor.rooms
    .filter((r) => {
      let any = false
      let reached = false
      for (let j = 0; j < ny && !reached; j++)
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i
          if (blocked[k] || !pointInPolygon(at(i, j), r.polygon)) continue
          any = true
          if (seen[k]) {
            reached = true
            break
          }
        }
      return any && !reached
    })
    .map((r) => r.id)
}
