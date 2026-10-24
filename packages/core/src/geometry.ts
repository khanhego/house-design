import type { Floor, Opening, Point, Wall } from './schema.ts'

export const EPS = 1e-6

export const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]]
export const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]]
export const scale = (a: Point, k: number): Point => [a[0] * k, a[1] * k]
export const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1]
export const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0]
export const length = (a: Point) => Math.hypot(a[0], a[1])
export const distance = (a: Point, b: Point) => length(sub(a, b))
export const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Diện tích có dấu (shoelace), mm². Dương khi các đỉnh xếp ngược chiều kim đồng hồ trong hệ y hướng lên. */
export const signedArea = (poly: Point[]) => {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

export const polygonArea = (poly: Point[]) => Math.abs(signedArea(poly))

export const centroid = (poly: Point[]): Point => {
  const a = signedArea(poly)
  if (Math.abs(a) < EPS) {
    const n = poly.length || 1
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n]
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    const f = x1 * y2 - x2 * y1
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  return [cx / (6 * a), cy / (6 * a)]
}

export const pointInPolygon = (p: Point, poly: Point[]) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const segmentsIntersect = (p1: Point, p2: Point, p3: Point, p4: Point) => {
  const d1 = cross(sub(p4, p3), sub(p1, p3))
  const d2 = cross(sub(p4, p3), sub(p2, p3))
  const d3 = cross(sub(p2, p1), sub(p3, p1))
  const d4 = cross(sub(p2, p1), sub(p4, p1))
  return d1 * d2 < -EPS && d3 * d4 < -EPS
}

/** Đa giác hợp lệ: ≥ 3 đỉnh, diện tích > 0, các cạnh không cắt nhau. */
export const isSimplePolygon = (poly: Point[]) => {
  if (poly.length < 3 || polygonArea(poly) < 1) return false
  const n = poly.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue
      if (segmentsIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false
    }
  }
  return true
}

export interface Bbox2 {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const bboxOf = (points: Point[]): Bbox2 => {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const [x, y] of points) {
    b.minX = Math.min(b.minX, x)
    b.minY = Math.min(b.minY, y)
    b.maxX = Math.max(b.maxX, x)
    b.maxY = Math.max(b.maxY, y)
  }
  return b
}

export const rotatePoint = (p: Point, deg: number, origin: Point = [0, 0]): Point => {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const [x, y] = sub(p, origin)
  return [origin[0] + x * c - y * s, origin[1] + x * s + y * c]
}

/* ---------- Tường ---------- */

export interface WallFrame {
  len: number
  /** vector đơn vị từ a tới b */
  u: Point
  /** pháp tuyến đơn vị (xoay u 90° ngược kim đồng hồ trong hệ màn hình y xuống) */
  n: Point
}

export const wallFrame = (w: Wall): WallFrame => {
  const d = sub(w.b, w.a)
  const len = length(d)
  const u: Point = len > EPS ? scale(d, 1 / len) : [1, 0]
  return { len, u, n: [-u[1], u[0]] }
}

/** Bốn góc hình chữ nhật của một đoạn tường [from, to] (mm dọc theo tường). */
export const wallRect = (w: Wall, from: number, to: number): Point[] => {
  const { u, n } = wallFrame(w)
  const h = w.thickness / 2
  const p0 = add(w.a, scale(u, from))
  const p1 = add(w.a, scale(u, to))
  return [add(p0, scale(n, h)), add(p1, scale(n, h)), add(p1, scale(n, -h)), add(p0, scale(n, -h))]
}

const near = (a: Point, b: Point, tol: number) => distance(a, b) <= tol

/** Đầu tường có nối với tường khác không (để kéo dài nửa độ dày cho kín góc). */
const endJoined = (floor: Floor, w: Wall, end: Point) =>
  floor.walls.some((o) => o.id !== w.id && (near(o.a, end, 1) || near(o.b, end, 1) || pointOnWall(o, end, 1)))

const pointOnWall = (w: Wall, p: Point, tol: number) => {
  const { len, u, n } = wallFrame(w)
  const d = sub(p, w.a)
  const t = dot(d, u)
  return t > tol && t < len - tol && Math.abs(dot(d, n)) <= tol
}

export interface WallPiece {
  wallId: string
  /** mm dọc theo tường tính từ a (có thể âm/vượt len khi kéo dài nửa độ dày ở góc) */
  from: number
  to: number
  /** cao độ so với sàn tầng, mm */
  bottom: number
  top: number
  kind: 'solid' | 'lintel' | 'sill'
}

export interface OpeningSpan {
  opening: Opening
  wallId: string
  from: number
  to: number
}

export interface WallLayout {
  wall: Wall
  frame: WallFrame
  height: number
  pieces: WallPiece[]
  openings: OpeningSpan[]
}

/**
 * Chia mỗi tường thành các khối đặc và các lỗ cửa.
 * Lỗ cửa bị cắt về trong chiều dài tường; lỗ chồng nhau được xử lý theo thứ tự offset.
 */
export const wallSegments = (floor: Floor): WallLayout[] =>
  floor.walls.map((w) => {
    const frame = wallFrame(w)
    const height = w.height ?? floor.height
    const extA = endJoined(floor, w, w.a) ? w.thickness / 2 : 0
    const extB = endJoined(floor, w, w.b) ? w.thickness / 2 : 0
    const start = -extA
    const end = frame.len + extB
    const ops = floor.openings
      .filter((o) => o.wallId === w.id)
      .map((o) => ({ o, from: Math.max(0, o.offset), to: Math.min(frame.len, o.offset + o.width) }))
      .filter((s) => s.to - s.from > 1)
      .sort((x, y) => x.from - y.from)

    const pieces: WallPiece[] = []
    const openings: OpeningSpan[] = []
    let cursor = start
    for (const { o, from, to } of ops) {
      const f = Math.max(from, cursor)
      if (to <= f) continue
      if (f > cursor) pieces.push({ wallId: w.id, from: cursor, to: f, bottom: 0, top: height, kind: 'solid' })
      const openTop = Math.min(height, o.sill + o.height)
      if (openTop < height) pieces.push({ wallId: w.id, from: f, to, bottom: openTop, top: height, kind: 'lintel' })
      if (o.kind === 'window' && o.sill > 0) pieces.push({ wallId: w.id, from: f, to, bottom: 0, top: Math.min(o.sill, height), kind: 'sill' })
      openings.push({ opening: o, wallId: w.id, from: f, to })
      cursor = to
    }
    if (end > cursor) pieces.push({ wallId: w.id, from: cursor, to: end, bottom: 0, top: height, kind: 'solid' })
    return { wall: w, frame, height, pieces, openings }
  })

/** Điểm p nằm phía nào của đường thẳng chứa tường (dấu tích có hướng). */
export const sideOfWall = (w: Wall, p: Point) => Math.sign(cross(sub(w.b, w.a), sub(p, w.a)))

/** Mép ngoài các tường (để tính bbox tầng). */
export const wallsOutline = (floor: Floor): Point[] =>
  floor.walls.flatMap((w) => wallRect(w, 0, wallFrame(w).len))
