import { bboxOf, pointInPolygon, wallSegments } from './geometry.ts'
import { sortedFloors } from './rules.ts'
import type { Floor, HouseDocument, Point } from './schema.ts'
import type { NavLibrary } from './nav.ts'
import { stairLayout } from './stairs.ts'
import type { StairFlight } from './stairs.ts'

/*
 * Khung va chạm 3D của ngôi nhà cho người mẫu đi bộ (bộ vật lý + navmesh trong trình xem). Đơn vị mét, hệ toạ độ
 * three.js: x = x mặt bằng, z = y mặt bằng, y hướng lên. Toàn bộ là khối hộp:
 * - sàn từng tầng = phòng ∪ sân/ban công ∪ đường bao, khoét lỗ cầu thang đi lên từ tầng dưới;
 * - tường đặc, bậu và kính cửa sổ (không đi xuyên kính), lanh tô trên cửa đi;
 * - cầu thang = dốc liền từ sàn tầng này tới sàn tầng trên (bộ điều khiển nhân vật leo dốc như leo bậc);
 * - lan can vô hình: mép sàn tầng trên (cả miệng lỗ cầu thang, trừ cạnh dốc đi lên), quanh hồ bơi, ranh khu đất;
 * - đồ nội thất cao ≥ 15 cm.
 */

export type WalkBoxKind = 'slab' | 'ground' | 'wall' | 'glass' | 'stair' | 'rail' | 'item'

export interface WalkBox {
  kind: WalkBoxKind
  /** tâm (m) */
  c: [number, number, number]
  /** nửa kích thước theo trục riêng của khối (m) */
  h: [number, number, number]
  /** quaternion [x, y, z, w] */
  q: [number, number, number, number]
}

const M = (mm: number) => mm / 1000
type Q = [number, number, number, number]
const qYaw = (a: number): Q => [0, Math.sin(a / 2), 0, Math.cos(a / 2)]
const qRoll = (a: number): Q => [0, 0, Math.sin(a / 2), Math.cos(a / 2)]
const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
/** góc quay quanh trục y của three.js để trục x riêng của khối nằm theo hướng (ux, uy) trên mặt bằng */
const yawOf = (ux: number, uy: number) => -Math.atan2(uy, ux)

/** Khối dọc theo đoạn a → b trên mặt bằng (mm), từ cao độ y0 tới y1 (m), dày `thick` (mm). */
const segBox = (kind: WalkBoxKind, a: Point, b: Point, y0: number, y1: number, thick: number): WalkBox | null => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (len < 1 || y1 - y0 < 0.005) return null
  return {
    kind,
    c: [M((a[0] + b[0]) / 2), (y0 + y1) / 2, M((a[1] + b[1]) / 2)],
    h: [M(len) / 2, (y1 - y0) / 2, M(thick) / 2],
    q: qYaw(yawOf((b[0] - a[0]) / len, (b[1] - a[1]) / len)),
  }
}

const RISE_DEFAULT = 3300
const CELL = 100

export const RAIL_HEIGHT = 1.1

/** Khung chữ nhật của một vế thang trên mặt bằng (mm). */
const flightRect = (fl: StairFlight): Point[] => {
  const dx = fl.to[0] - fl.from[0]
  const dy = fl.to[1] - fl.from[1]
  const l = Math.hypot(dx, dy) || 1
  const px = (-dy / l) * (fl.width / 2)
  const py = (dx / l) * (fl.width / 2)
  return [[fl.from[0] + px, fl.from[1] + py], [fl.to[0] + px, fl.to[1] + py], [fl.to[0] - px, fl.to[1] - py], [fl.from[0] - px, fl.from[1] - py]]
}
const unit = (fl: StairFlight): Point => {
  const l = Math.hypot(fl.to[0] - fl.from[0], fl.to[1] - fl.from[1]) || 1
  return [(fl.to[0] - fl.from[0]) / l, (fl.to[1] - fl.from[1]) / l]
}

/** Ô lưới mặt sàn của một tầng: 1 = có sàn, 2 = lỗ cầu thang từ tầng dưới đi lên. */
const slabGrid = (doc: HouseDocument, f: Floor) => {
  const holes = doc.floors.flatMap((x) => x.stairs.filter((s) => s.toFloorId === f.id))
  const region = [...f.rooms.map((r) => r.polygon), ...f.areas.map((a) => a.polygon), ...(f.outline && f.outline.length > 2 ? [f.outline] : [])]
  const pts = [...region.flat(), ...f.walls.flatMap((w) => [w.a, w.b])]
  if (!pts.length) return null
  const b = bboxOf(pts)
  const x0 = Math.floor(b.minX / CELL) * CELL - CELL
  const y0 = Math.floor(b.minY / CELL) * CELL - CELL
  const nx = Math.ceil((b.maxX - x0) / CELL) + 2
  const ny = Math.ceil((b.maxY - y0) / CELL) + 2
  const g = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const p: Point = [x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL]
      if (holes.some((s) => pointInPolygon(p, s.polygon))) g[j * nx + i] = 2
      else if (region.some((poly) => pointInPolygon(p, poly))) g[j * nx + i] = 1
    }
  return { x0, y0, nx, ny, g, holes }
}

/** Gộp các ô = 1 thành ít hình chữ nhật nhất có thể (theo hàng rồi theo cột). */
const mergeRects = (nx: number, ny: number, on: (i: number, j: number) => boolean) => {
  const rects: { i0: number; i1: number; j0: number; j1: number }[] = []
  let open = new Map<string, { i0: number; i1: number; j0: number; j1: number }>()
  for (let j = 0; j <= ny; j++) {
    const runs: [number, number][] = []
    if (j < ny) {
      let i = 0
      while (i < nx) {
        if (!on(i, j)) {
          i++
          continue
        }
        const s = i
        while (i < nx && on(i, j)) i++
        runs.push([s, i])
      }
    }
    const next = new Map<string, { i0: number; i1: number; j0: number; j1: number }>()
    for (const [a, c] of runs) {
      const k = `${a}:${c}`
      const r = open.get(k)
      if (r) {
        r.j1 = j + 1
        next.set(k, r)
        open.delete(k)
      } else next.set(k, { i0: a, i1: c, j0: j, j1: j + 1 })
    }
    for (const r of open.values()) rects.push(r)
    open = next
  }
  return rects
}

export interface WalkGeometryOptions {
  /** cao độ mặt đất ngoài nhà (m), mặc định -0,16 như mặt đất hiển thị */
  groundY?: number
}

export const walkGeometry = (doc: HouseDocument, lib: NavLibrary = {}, opts: WalkGeometryOptions = {}): WalkBox[] => {
  const out: WalkBox[] = []
  const push = (b: WalkBox | null) => b && out.push(b)
  const floors = sortedFloors(doc)
  if (!floors.length) return out
  const groundY = opts.groundY ?? -0.16
  const lowest = floors[0].elevation
  const riseOf = (f: Floor) => {
    const next = floors.find((x) => x.elevation > f.elevation)
    return next ? next.elevation - f.elevation : f.height || RISE_DEFAULT
  }

  // mặt đất + ranh khu đất (3 m quanh nhà và sân)
  const all = floors.flatMap((f) => [...f.rooms.flatMap((r) => r.polygon), ...f.areas.flatMap((a) => a.polygon), ...f.walls.flatMap((w) => [w.a, w.b]), ...(f.outline ?? [])])
  const lot = bboxOf(all.length ? all : [[0, 0], [10000, 10000]])
  const L = { minX: lot.minX - 3000, minY: lot.minY - 3000, maxX: lot.maxX + 3000, maxY: lot.maxY + 3000 }
  out.push({ kind: 'ground', c: [M((L.minX + L.maxX) / 2), groundY - 0.25, M((L.minY + L.maxY) / 2)], h: [M(L.maxX - L.minX) / 2, 0.25, M(L.maxY - L.minY) / 2], q: [0, 0, 0, 1] })
  const corners: Point[] = [[L.minX, L.minY], [L.maxX, L.minY], [L.maxX, L.maxY], [L.minX, L.maxY]]
  corners.forEach((a, i) => push(segBox('rail', a, corners[(i + 1) % 4], groundY, groundY + 2, 100)))

  for (const f of floors) {
    const elev = M(f.elevation)
    const ground = f.elevation <= lowest

    // sàn
    const sg = slabGrid(doc, f)
    if (sg) {
      const { x0, y0, nx, ny, g, holes } = sg
      for (const r of mergeRects(nx, ny, (i, j) => g[j * nx + i] === 1))
        out.push({
          kind: 'slab',
          c: [M(x0 + ((r.i0 + r.i1) / 2) * CELL), elev - 0.1, M(y0 + ((r.j0 + r.j1) / 2) * CELL)],
          h: [M((r.i1 - r.i0) * CELL) / 2, 0.1, M((r.j1 - r.j0) * CELL) / 2],
          q: [0, 0, 0, 1],
        })
      // lan can mép sàn tầng trên (không rơi xuống), bỏ cạnh dốc cầu thang đi lên
      if (!ground) {
        const isOn = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && g[j * nx + i] === 1
        const holeAt = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && g[j * nx + i] === 2
        // cạnh giữa ô sàn (i, j) và ô lỗ (i - di, j - dj) không có lan can khi đó là chỗ bước ra khỏi vế cuối của thang
        // từ tầng dưới lên, hoặc chỗ bước vào vế đầu của thang tầng này đặt chồng trong lỗ (thang chữ U xếp chồng)
        const exits = holes.map((st) => stairLayout(st, 1).flights.at(-1)!)
        const entries = f.stairs.filter((st) => st.toFloorId).map((st) => stairLayout(st, 1).flights[0])
        const arrival = (i: number, j: number, di: number, dj: number) => {
          const p: Point = [x0 + (i - di + 0.5) * CELL, y0 + (j - dj + 0.5) * CELL]
          return (
            exits.some((fl) => pointInPolygon(p, flightRect(fl)) && di * unit(fl)[0] + dj * unit(fl)[1] > 0.7) ||
            entries.some((fl) => pointInPolygon(p, flightRect(fl)) && -(di * unit(fl)[0] + dj * unit(fl)[1]) > 0.7)
          )
        }
        // cạnh dọc (giữa ô i-1 và i) và cạnh ngang (giữa ô j-1 và j)
        const edges: [Point, Point][] = []
        for (let j = 0; j < ny; j++) {
          for (let i = 0; i <= nx; i++) {
            const a = isOn(i - 1, j)
            const b = isOn(i, j)
            let need = a !== b
            if (need && (holeAt(i - 1, j) || holeAt(i, j))) need = !(b ? arrival(i, j, 1, 0) : arrival(i - 1, j, -1, 0))
            if (need) edges.push([[x0 + i * CELL, y0 + j * CELL], [x0 + i * CELL, y0 + (j + 1) * CELL]])
          }
        }
        for (let i = 0; i < nx; i++)
          for (let j = 0; j <= ny; j++) {
            const a = isOn(i, j - 1)
            const b = isOn(i, j)
            let need = a !== b
            if (need && (holeAt(i, j - 1) || holeAt(i, j))) need = !(b ? arrival(i, j, 0, 1) : arrival(i, j - 1, 0, -1))
            if (need) edges.push([[x0 + i * CELL, y0 + j * CELL], [x0 + (i + 1) * CELL, y0 + j * CELL]])
          }
        // gộp các đoạn thẳng hàng liền nhau
        const key = (e: [Point, Point]) => (e[0][0] === e[1][0] ? `v${e[0][0]}` : `h${e[0][1]}`)
        const groups = new Map<string, [Point, Point][]>()
        for (const e of edges) groups.set(key(e), [...(groups.get(key(e)) ?? []), e])
        for (const [k, es] of groups) {
          const vert = k[0] === 'v'
          const spans = es.map((e) => (vert ? [e[0][1], e[1][1]] : [e[0][0], e[1][0]])).sort((p, q) => p[0] - q[0])
          let cur = spans[0]
          const flush = () => {
            const at = Number(k.slice(1))
            push(segBox('rail', vert ? [at, cur[0]] : [cur[0], at], vert ? [at, cur[1]] : [cur[1], at], elev, elev + RAIL_HEIGHT, 60))
          }
          for (const s of spans.slice(1)) {
            if (s[0] <= cur[1] + 1) cur = [cur[0], Math.max(cur[1], s[1])]
            else (flush(), (cur = s))
          }
          flush()
        }
      }
    }

    // tường, kính, lanh tô
    for (const Lw of wallSegments(f)) {
      const at = (s: number): Point => [Lw.wall.a[0] + Lw.frame.u[0] * s, Lw.wall.a[1] + Lw.frame.u[1] * s]
      for (const p of Lw.pieces) push(segBox('wall', at(p.from), at(p.to), elev + M(p.bottom), elev + M(p.top), Lw.wall.thickness))
      for (const o of Lw.openings) {
        if (o.opening.kind !== 'window') continue
        const top = Math.min(Lw.height, o.opening.sill + o.opening.height)
        push(segBox('glass', at(o.from), at(o.to), elev + M(o.opening.sill), elev + M(top), Lw.wall.thickness))
      }
    }

    // cầu thang: mỗi vế là một dốc liền (leo như leo bậc), chiếu nghỉ, lan can hai bên vế và quanh chiếu nghỉ
    for (const s of f.stairs) {
      if (!s.toFloorId) continue
      const to = doc.floors.find((x) => x.id === s.toFloorId)
      const rise = to ? to.elevation - f.elevation : riseOf(f)
      const L = stairLayout(s, rise)
      for (const fl of L.flights) {
        const [ux, uy] = unit(fl)
        const run = M(Math.hypot(fl.to[0] - fl.from[0], fl.to[1] - fl.from[1])) + 0.04
        const dh = M(fl.h1 - fl.h0)
        const th = Math.atan2(dh, run)
        const thick = 0.12
        const nx = -Math.sin(th) * ux
        const ny = Math.cos(th)
        const nz = -Math.sin(th) * uy
        out.push({
          kind: 'stair',
          c: [M((fl.from[0] + fl.to[0]) / 2) - (nx * thick) / 2, elev + M(fl.h0 + fl.h1) / 2 - (ny * thick) / 2, M((fl.from[1] + fl.to[1]) / 2) - (nz * thick) / 2],
          h: [Math.hypot(run, dh) / 2, thick / 2, M(fl.width) / 2],
          q: qMul(qYaw(yawOf(ux, uy)), qRoll(th)),
        })
        // hai mép vế: kín từ sàn tới trên mặt dốc 1 m (gầm thang dựng đặc — không chui vào gầm thang)
        const r = flightRect(fl)
        push(segBox('rail', r[0], r[1], elev, elev + M(fl.h1) + 1, 60))
        push(segBox('rail', r[3], r[2], elev, elev + M(fl.h1) + 1, 60))
      }
      // thang thẳng: mặt sau gầm thang ở đầu trên
      if (!L.landing) {
        const r = flightRect(L.flights[0])
        push(segBox('rail', r[1], r[2], elev, elev + M(rise) - 0.05, 60))
      }
      if (L.landing) {
        const lp = L.landing.polygon
        const b = bboxOf(lp)
        const h = elev + M(L.landing.h)
        // chiếu nghỉ là tấm dày 0,2 m (thang chữ U xếp chồng: dưới chiếu nghỉ là khoảng trống trên đầu của vế tầng dưới)
        out.push({ kind: 'stair', c: [M((b.minX + b.maxX) / 2), h - 0.1, M((b.minY + b.maxY) / 2)], h: [M(b.maxX - b.minX) / 2, 0.1, M(b.maxY - b.minY) / 2], q: [0, 0, 0, 1] })
        // ba cạnh ngoài của chiếu nghỉ (cạnh còn lại nối hai vế)
        for (let k = 0; k < 3; k++) push(segBox('rail', lp[k], lp[k + 1], h, h + 1, 60))
      }
    }

    // hồ bơi: không đi xuống nước
    for (const a of f.areas)
      if (a.kind === 'pool') a.polygon.forEach((p, i) => push(segBox('rail', p, a.polygon[(i + 1) % a.polygon.length], elev + (ground ? -0.2 : 0), elev + 0.8, 60)))

    // đồ nội thất
    for (const it of f.items) {
      if (!('libraryItemId' in it.source)) continue
      const li = lib[it.source.libraryItemId]
      if (!li || li.category === 'rug' || li.sizeMm[1] < 150 || it.elevation > 1200) continue
      const [w, hgt, d] = li.sizeMm
      const t = (it.rotation * Math.PI) / 180
      const y0 = elev + M(it.elevation)
      out.push({ kind: 'item', c: [M(it.position[0]), y0 + M(hgt) / 2, M(it.position[1])], h: [M(w) / 2, M(hgt) / 2, M(d) / 2], q: qYaw(yawOf(Math.cos(t), Math.sin(t))) })
    }
  }
  return out
}

/** Tam giác của các khối (cho navmesh): positions phẳng [x,y,z,…] và indices. */
export const boxTriangles = (boxes: WalkBox[]) => {
  const positions: number[] = []
  const indices: number[] = []
  const rot = (q: Q, v: [number, number, number]): [number, number, number] => {
    const [x, y, z, w] = q
    const ix = w * v[0] + y * v[2] - z * v[1]
    const iy = w * v[1] + z * v[0] - x * v[2]
    const iz = w * v[2] + x * v[1] - y * v[0]
    const iw = -x * v[0] - y * v[1] - z * v[2]
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]
  }
  const faces = [
    [0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3],
  ]
  for (const b of boxes) {
    const base = positions.length / 3
    for (let k = 0; k < 8; k++) {
      const v: [number, number, number] = [(k & 4 ? 1 : -1) * b.h[0], (k & 2 ? 1 : -1) * b.h[1], (k & 1 ? 1 : -1) * b.h[2]]
      const r = rot(b.q, v)
      positions.push(b.c[0] + r[0], b.c[1] + r[1], b.c[2] + r[2])
    }
    for (const [a, c, d, e] of faces) indices.push(base + a, base + c, base + d, base + a, base + d, base + e)
  }
  return { positions, indices }
}
