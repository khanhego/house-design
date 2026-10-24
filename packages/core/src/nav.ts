import { pointInPolygon, polygonArea, wallSegments } from './geometry.ts'
import type { Floor, HouseDocument, Point } from './schema.ts'
import { stairEnd } from './stairs.ts'

/*
 * Lối đi trong nhà — một nguồn sự thật cho cả trình xem 3D (người mẫu đi, bấm sàn để đi tới), kiểm khi gửi duyệt
 * và test nhà mẫu. Đơn vị mm, mặt bằng (x, y).
 *
 * Vật cản là các khối hộp đúng kích thước thật (không bo đầu — đầu tường không lấn vào khung cửa): phần tường đặc và
 * bậu cửa sổ (< 1 m), ô cửa sổ (kính — kể cả kính sát sàn), đồ nội thất cao ≥ 15 cm. Ô cửa đi không chặn.
 * Người là hình tròn bán kính BODY_RADIUS: đứng được khi cách mọi vật cản ≥ BODY_RADIUS.
 */

export const BODY_RADIUS = 200
/** Lối đi hẹp hơn mức này (khoảng trống giữa hai vật cản) thì cảnh báo — 0,65 m (cửa WC 0,7 m vẫn đạt). */
export const NARROW_PASSAGE = 650
/** Phòng không có chỗ đứng nào rộng ≥ 1 m thì coi là chật. */
export const CRAMPED_SPOT = 1000

/** Khối hộp xoay trên mặt bằng: tâm, trục dọc (vector đơn vị), nửa dài, nửa rộng (mm). */
export interface Obstacle {
  c: Point
  u: Point
  hl: number
  hw: number
}

const box = (a: Point, b: Point, hw: number): Obstacle => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const u: Point = len > 1e-6 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0]
  return { c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], u, hl: len / 2, hw }
}

export type NavLibrary = Record<string, { category: string; sizeMm: [number, number, number] }>

export const wallObstacles = (floor: Floor): Obstacle[] =>
  wallSegments(floor).flatMap((L) => {
    const at = (s: number): Point => [L.wall.a[0] + L.frame.u[0] * s, L.wall.a[1] + L.frame.u[1] * s]
    const half = L.wall.thickness / 2
    const solid = L.pieces.filter((p) => p.bottom < 1000).map((p) => box(at(p.from), at(p.to), half))
    const glass = L.openings.filter((o) => o.opening.kind === 'window').map((o) => box(at(o.from), at(o.to), half))
    return [...solid, ...glass]
  })

/** Đồ nội thất chặn người: khung chữ nhật theo kích thước thư viện, xoay theo góc đặt. Bỏ thảm, đồ thấp < 15 cm, đồ treo cao. */
export const furnitureObstacles = (floor: Floor, lib: NavLibrary): Obstacle[] =>
  floor.items.flatMap((it) => {
    if (!('libraryItemId' in it.source)) return []
    const li = lib[it.source.libraryItemId]
    if (!li || li.category === 'rug' || li.sizeMm[1] < 150 || it.elevation > 1200) return []
    const [w, , d] = li.sizeMm
    const t = (it.rotation * Math.PI) / 180
    return [{ c: [it.position[0], it.position[1]] as Point, u: [Math.cos(t), Math.sin(t)] as Point, hl: w / 2, hw: d / 2 }]
  })

/** Khối cầu thang trên tầng của nó (gầm thang, lan can hai bên) — chỉ đi lên được từ chân thang. */
export const stairObstacles = (floor: Floor): Obstacle[] =>
  floor.stairs
    .filter((s) => s.polygon.length >= 3)
    .map((s) => {
      const xs = s.polygon.map((p) => p[0])
      const ys = s.polygon.map((p) => p[1])
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      return { c: [(x0 + x1) / 2, (y0 + y1) / 2] as Point, u: [1, 0] as Point, hl: (x1 - x0) / 2, hw: (y1 - y0) / 2 }
    })

export const obstaclesOf = (floor: Floor, lib: NavLibrary = {}) => [...wallObstacles(floor), ...furnitureObstacles(floor, lib), ...stairObstacles(floor)]

/** Khoảng cách từ điểm tới khối hộp (0 nếu nằm trong). */
export const distToBox = (p: Point, o: Obstacle) => {
  const dx = p[0] - o.c[0]
  const dy = p[1] - o.c[1]
  const a = Math.abs(dx * o.u[0] + dy * o.u[1]) - o.hl
  const b = Math.abs(-dx * o.u[1] + dy * o.u[0]) - o.hw
  return Math.hypot(Math.max(0, a), Math.max(0, b))
}

/** Khoảng trống (mm) từ điểm tới vật cản gần nhất; 0 nếu nằm trong vật cản. */
export const clearanceAt = (p: Point, obs: Obstacle[]) => {
  let m = Infinity
  for (const o of obs) {
    const d = distToBox(p, o)
    if (d < m) m = d
    if (!m) return 0
  }
  return m
}

export const standable = (p: Point, obs: Obstacle[]) => clearanceAt(p, obs) >= BODY_RADIUS

/** Đoạn thẳng a → b đi được (lấy mẫu mỗi 25 mm). */
export const segmentFree = (a: Point, b: Point, obs: Obstacle[]) => {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 25))
  for (let i = 0; i <= n; i++) if (!standable([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n], obs)) return false
  return true
}

// ---------- lưới ----------

export interface NavGrid {
  x0: number
  y0: number
  nx: number
  ny: number
  cell: number
  /** khoảng trống tại tâm ô (mm) */
  clear: Float32Array
  obs: Obstacle[]
}

export const buildNavGrid = (floor: Floor, obs: Obstacle[], cell = 50): NavGrid => {
  const pts = [...floor.walls.flatMap((w) => [w.a, w.b]), ...floor.rooms.flatMap((r) => r.polygon), ...floor.areas.flatMap((a) => a.polygon)]
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const pad = 1500
  const x0 = (xs.length ? Math.min(...xs) : 0) - pad
  const y0 = (ys.length ? Math.min(...ys) : 0) - pad
  const nx = Math.max(1, Math.ceil(((xs.length ? Math.max(...xs) : 0) + pad - x0) / cell))
  const ny = Math.max(1, Math.ceil(((ys.length ? Math.max(...ys) : 0) + pad - y0) / cell))
  const clear = new Float32Array(nx * ny)
  // vật cản theo hàng ô (bỏ vật cản xa hơn 1,5 m theo trục y) cho nhanh
  const CAP = 1500
  const ob = obs.map((o) => {
    const ey = Math.abs(o.u[1]) * o.hl + Math.abs(o.u[0]) * o.hw
    return { o, lo: o.c[1] - ey - CAP, hi: o.c[1] + ey + CAP }
  })
  for (let j = 0; j < ny; j++) {
    const y = y0 + (j + 0.5) * cell
    const row = ob.filter((x) => y >= x.lo && y <= x.hi).map((x) => x.o)
    for (let i = 0; i < nx; i++) clear[j * nx + i] = Math.min(CAP, clearanceAt([x0 + (i + 0.5) * cell, y], row))
  }
  return { x0, y0, nx, ny, cell, clear, obs }
}

export const cellOf = (g: NavGrid, p: Point) => {
  const i = Math.floor((p[0] - g.x0) / g.cell)
  const j = Math.floor((p[1] - g.y0) / g.cell)
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i
}
export const centerOf = (g: NavGrid, k: number): Point => [g.x0 + ((k % g.nx) + 0.5) * g.cell, g.y0 + (Math.floor(k / g.nx) + 0.5) * g.cell]
const freeCell = (g: NavGrid, k: number) => k >= 0 && g.clear[k] >= BODY_RADIUS

/** Ô đứng được gần `p` nhất trong bán kính `maxR` (mm); -1 nếu không có. */
export const nearestFreeCell = (g: NavGrid, p: Point, maxR = 1500) => {
  const k0 = cellOf(g, p)
  if (freeCell(g, k0)) return k0
  const r = Math.ceil(maxR / g.cell)
  const ci = Math.floor((p[0] - g.x0) / g.cell)
  const cj = Math.floor((p[1] - g.y0) / g.cell)
  let best = -1
  let bd = Infinity
  for (let dj = -r; dj <= r; dj++)
    for (let di = -r; di <= r; di++) {
      const i = ci + di
      const j = cj + dj
      if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue
      const k = j * g.nx + i
      const d = di * di + dj * dj
      if (d < bd && freeCell(g, k)) (bd = d), (best = k)
    }
  return best
}

const N8: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]

/** Hàng đợi ưu tiên nhỏ nhất. */
class Heap {
  k: number[] = []
  v: number[] = []
  get size() {
    return this.k.length
  }
  push(key: number, val: number) {
    const { k, v } = this
    k.push(key)
    v.push(val)
    let i = k.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (v[p] <= v[i]) break
      ;[k[p], k[i]] = [k[i], k[p]]
      ;[v[p], v[i]] = [v[i], v[p]]
      i = p
    }
  }
  pop() {
    const { k, v } = this
    const top = k[0]
    const lk = k.pop()!
    const lv = v.pop()!
    if (k.length) {
      k[0] = lk
      v[0] = lv
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < k.length && v[l] < v[m]) m = l
        if (r < k.length && v[r] < v[m]) m = r
        if (m === i) break
        ;[k[m], k[i]] = [k[i], k[m]]
        ;[v[m], v[i]] = [v[i], v[m]]
        i = m
      }
    }
    return top
  }
}

/**
 * Đường đi từ `from` tới `to` (mm) né tường và đồ, qua cửa; ưu tiên đi giữa lối (xa vật cản). Rút gọn thành các điểm
 * rẽ. `to` bị chặn thì đi tới chỗ đứng được gần nhất. Không có đường → null.
 */
export const findPath = (g: NavGrid, from: Point, to: Point): Point[] | null => {
  const s = nearestFreeCell(g, from, 800)
  const t = nearestFreeCell(g, to, 1500)
  if (s < 0 || t < 0) return null
  const N = g.nx * g.ny
  const cost = new Float64Array(N).fill(Infinity)
  const prev = new Int32Array(N).fill(-1)
  const closed = new Uint8Array(N)
  const [tx, ty] = [t % g.nx, Math.floor(t / g.nx)]
  const h = (k: number) => {
    const dx = Math.abs((k % g.nx) - tx)
    const dy = Math.abs(Math.floor(k / g.nx) - ty)
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
  }
  const heap = new Heap()
  cost[s] = 0
  heap.push(s, h(s))
  while (heap.size) {
    const k = heap.pop()
    if (k === t) break
    if (closed[k]) continue
    closed[k] = 1
    const i = k % g.nx
    const j = (k - i) / g.nx
    for (const [di, dj, w] of N8) {
      const a = i + di
      const b = j + dj
      if (a < 0 || b < 0 || a >= g.nx || b >= g.ny) continue
      const q = b * g.nx + a
      if (!freeCell(g, q)) continue
      if (di && dj && (!freeCell(g, j * g.nx + a) || !freeCell(g, b * g.nx + i))) continue
      // sát vật cản thì "đắt" hơn → đường đi giữa hành lang, qua giữa cửa
      const c = cost[k] + w * (1 + 1.5 * Math.max(0, (500 - g.clear[q]) / 500))
      if (c < cost[q]) {
        cost[q] = c
        prev[q] = k
        heap.push(q, c + h(q))
      }
    }
  }
  if (s !== t && prev[t] < 0) return null
  const cells: number[] = []
  for (let k = t; k !== -1; k = prev[k]) cells.push(k)
  cells.reverse()
  const raw: Point[] = cells.map((k) => centerOf(g, k))
  if (standable(from, g.obs)) raw[0] = from
  else raw.unshift(from)
  const end = standable(to, g.obs) ? to : raw[raw.length - 1]
  raw[raw.length - 1] = end
  // rút gọn: giữ điểm xa nhất còn nhìn thẳng được
  const out: Point[] = [raw[0]]
  let i = 0
  while (i < raw.length - 1) {
    let j = raw.length - 1
    while (j > i + 1 && !segmentFree(raw[i], raw[j], g.obs)) j--
    out.push(raw[j])
    i = j
  }
  return out
}

// ---------- kiểm lối đi khi dựng (gửi duyệt, test nhà mẫu) ----------

export type NavIssueCode = 'ROOM_UNREACHABLE' | 'ROOM_NO_SPACE' | 'NARROW_PASSAGE' | 'ROOM_CRAMPED' | 'DOOR_BLOCKED' | 'STAIR_BLOCKED' | 'STAIR_NOWHERE'

export interface NavIssue {
  code: NavIssueCode
  floorId: string
  roomId?: string
  /** vị trí chỗ có vấn đề (mm) */
  at?: Point
  /** số đo liên quan (mm) */
  value?: number
  message: string
}

const m1 = (mm: number) => (mm / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })

/**
 * Kiểm một tầng: phòng không tới được, lối đi hẹp, phòng chật, cửa bị đồ chặn, chân/đầu cầu thang bị chặn.
 * Xuất phát: ngoài nhà (tầng trệt có cửa ra ngoài) hoặc đầu cầu thang đi lên tới tầng này.
 */
export const auditFloor = (doc: HouseDocument, floor: Floor, lib: NavLibrary = {}, grid?: NavGrid): NavIssue[] => {
  if (!floor.rooms.length || !floor.walls.length) return []
  const g = grid ?? buildNavGrid(floor, obstaclesOf(floor, lib))
  const out: NavIssue[] = []
  // tầng trên: chỉ đi được trên sàn thật (phòng, ban công / sân thượng, cầu thang) — ngoài đó là khoảng không
  if (floor.elevation > Math.min(...doc.floors.map((f) => f.elevation))) {
    const slab = [...floor.rooms.map((r) => r.polygon), ...floor.areas.map((a) => a.polygon), ...(floor.outline && floor.outline.length > 2 ? [floor.outline] : [])]
    // lỗ cầu thang từ tầng dưới lên không phải sàn
    const holes = doc.floors.flatMap((f) => f.stairs.filter((s) => s.toFloorId === floor.id).map((s) => s.polygon))
    for (let k = 0; k < g.nx * g.ny; k++) {
      if (g.clear[k] < BODY_RADIUS) continue
      const c = centerOf(g, k)
      if (!slab.some((poly) => pointInPolygon(c, poly)) || holes.some((poly) => pointInPolygon(c, poly))) g.clear[k] = 0
    }
  }
  const N = g.nx * g.ny
  const roomName = (id: string) => floor.rooms.find((r) => r.id === id)?.name ?? ''
  const roomAt = (p: Point) => floor.rooms.find((r) => pointInPolygon(p, r.polygon))

  // điểm xuất phát
  const seeds: number[] = []
  const exteriorDoor = floor.openings.some((o) => o.kind === 'door' && (floor.walls.find((w) => w.id === o.wallId)?.thickness ?? 0) >= 150)
  const arrivals = doc.floors.flatMap((f) => f.stairs.filter((s) => s.toFloorId === floor.id).map((s) => stairEnd(s, 'top')))
  const ground = floor.elevation <= Math.min(...doc.floors.map((f) => f.elevation))
  if (exteriorDoor && (ground || !arrivals.length)) {
    for (let i = 0; i < g.nx; i++) for (const j of [0, g.ny - 1]) if (freeCell(g, j * g.nx + i)) seeds.push(j * g.nx + i)
    for (let j = 0; j < g.ny; j++) for (const i of [0, g.nx - 1]) if (freeCell(g, j * g.nx + i)) seeds.push(j * g.nx + i)
  } else
    for (const p of arrivals) {
      const k = nearestFreeCell(g, p, 1200)
      if (k >= 0) seeds.push(k)
      else out.push({ code: 'STAIR_BLOCKED', floorId: floor.id, at: p, message: `${floor.name}: đầu cầu thang đi lên tới tầng này không có chỗ đứng` })
    }
  if (!seeds.length) return out

  // đường "rộng nhất" từ lối vào tới từng ô: bottleneck = khoảng trống nhỏ nhất dọc đường tốt nhất
  const best = new Float32Array(N).fill(-1)
  const prev = new Int32Array(N).fill(-1)
  const heap = new Heap()
  for (const k of seeds) {
    best[k] = g.clear[k]
    heap.push(k, -best[k])
  }
  const done = new Uint8Array(N)
  while (heap.size) {
    const k = heap.pop()
    if (done[k]) continue
    done[k] = 1
    const i = k % g.nx
    const j = (k - i) / g.nx
    for (const [di, dj] of N8) {
      const a = i + di
      const b = j + dj
      if (a < 0 || b < 0 || a >= g.nx || b >= g.ny) continue
      const q = b * g.nx + a
      if (!freeCell(g, q) || done[q]) continue
      if (di && dj && (!freeCell(g, j * g.nx + a) || !freeCell(g, b * g.nx + i))) continue
      const v = Math.min(best[k], g.clear[q])
      if (v > best[q]) {
        best[q] = v
        prev[q] = k
        heap.push(q, -v)
      }
    }
  }

  // từng phòng
  for (const r of floor.rooms) {
    let free = 0
    let reached = -1
    let widest = 0
    for (let k = 0; k < N; k++) {
      const p = centerOf(g, k)
      if (!freeCell(g, k) || !pointInPolygon(p, r.polygon)) continue
      free++
      widest = Math.max(widest, g.clear[k])
      if (best[k] >= 0 && (reached < 0 || best[k] > best[reached])) reached = k
    }
    const area = polygonArea(r.polygon)
    if (!free) {
      out.push({ code: 'ROOM_NO_SPACE', floorId: floor.id, roomId: r.id, message: `${floor.name}: "${r.name}" không còn chỗ đứng (đồ đặt kín hoặc phòng quá hẹp)` })
      continue
    }
    if (reached < 0) {
      out.push({ code: 'ROOM_UNREACHABLE', floorId: floor.id, roomId: r.id, message: `${floor.name}: không đi vào được "${r.name}" — thiếu cửa đi, hoặc lối vào bị tường / đồ chặn` })
      continue
    }
    // chỗ hẹp nhất trên đường tốt nhất vào phòng (khoảng trống giữa hai vật cản ≈ 2 × clearance)
    const width = 2 * best[reached]
    if (width < NARROW_PASSAGE) {
      let pinch = reached
      for (let k = reached; k !== -1; k = prev[k]) if (g.clear[k] < g.clear[pinch]) pinch = k
      const at = centerOf(g, pinch)
      const where = roomAt(at)
      out.push({ code: 'NARROW_PASSAGE', floorId: floor.id, roomId: r.id, at, value: width, message: `${floor.name}: lối vào "${r.name}" chỉ rộng ${m1(width)} m${where && where.id !== r.id ? ` (ở ${where.name})` : ''} — nên ≥ ${m1(NARROW_PASSAGE)} m` })
    }
    if (2 * widest < CRAMPED_SPOT && area > 3e6 && r.function !== 'stair' && r.function !== 'hall')
      out.push({ code: 'ROOM_CRAMPED', floorId: floor.id, roomId: r.id, value: 2 * widest, message: `${floor.name}: "${r.name}" chật — chỗ trống rộng nhất chỉ ${m1(2 * widest)} m` })
  }

  // cửa đi: ô cửa và hai bên cửa (600 mm) phải đứng được
  for (const L of wallSegments(floor))
    for (const sp of L.openings) {
      if (sp.opening.kind !== 'door') continue
      const s = (sp.from + sp.to) / 2
      const c: Point = [L.wall.a[0] + L.frame.u[0] * s, L.wall.a[1] + L.frame.u[1] * s]
      const off = L.wall.thickness / 2 + 600
      const sides: Point[] = [1, -1].map((k) => [c[0] + L.frame.n[0] * off * k, c[1] + L.frame.n[1] * off * k])
      const names = sides.map((p) => roomAt(p)?.name).filter(Boolean).join(' ↔ ') || 'ra ngoài'
      if (!standable(c, g.obs)) out.push({ code: 'DOOR_BLOCKED', floorId: floor.id, at: c, value: sp.to - sp.from, message: `${floor.name}: cửa ${names} không đi qua được (rộng ${m1(sp.to - sp.from)} m hoặc bị đồ chặn)` })
      else if (sides.some((p) => clearanceAt(p, g.obs) < BODY_RADIUS && !!roomAt(p))) out.push({ code: 'DOOR_BLOCKED', floorId: floor.id, at: c, message: `${floor.name}: lối trước cửa ${names} quá hẹp — vướng đồ, cầu thang hoặc tường` })
    }

  // chân cầu thang lên tầng trên phải tới được; cầu thang không dẫn lên đâu (vd. vẽ ở tầng trên cùng) là lỗi dựng
  for (const st of floor.stairs) {
    if (!st.toFloorId) {
      const p = stairEnd(st, 'bottom')
      out.push({ code: 'STAIR_NOWHERE', floorId: floor.id, at: p, message: `${floor.name}: cầu thang không dẫn lên tầng nào — chọn tầng đi tới, hoặc xoá nếu vẽ thừa` })
      continue
    }
    const p = stairEnd(st, 'bottom')
    const k = nearestFreeCell(g, p, 1200)
    if (k < 0 || best[k] < 0) out.push({ code: 'STAIR_BLOCKED', floorId: floor.id, at: p, message: `${floor.name}: không đi tới được chân cầu thang` })
  }
  return out
}

export const auditHouse = (doc: HouseDocument, lib: NavLibrary = {}) => doc.floors.flatMap((f) => auditFloor(doc, f, lib))
