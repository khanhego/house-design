import type { Floor, Point } from '@hd/core'

/* Bắt điểm (02b §3.1): đỉnh ≤ 12 px màn hình, góc 0/45/90° khi khoá góc, lưới 50 mm. */

export const GRID_MM = 50
export const SNAP_PX = 12

export const vertices = (f: Floor): Point[] => [
  ...f.walls.flatMap((w) => [w.a, w.b]),
  ...f.rooms.flatMap((r) => r.polygon),
  ...f.areas.flatMap((a) => a.polygon),
  ...f.stairs.flatMap((s) => s.polygon),
  ...(f.outline ?? []),
]

export interface SnapResult {
  p: Point
  kind: 'vertex' | 'axis' | 'grid' | 'none'
}

export const snapPoint = (raw: Point, opts: { floor: Floor | null; scale: number; prev?: Point | null; ortho: boolean; grid: boolean; exclude?: Point[] }): SnapResult => {
  const tol = SNAP_PX / opts.scale
  if (opts.floor) {
    let best: Point | null = null
    let bd = tol
    for (const v of vertices(opts.floor)) {
      if (opts.exclude?.some((e) => e === v)) continue
      const d = Math.hypot(v[0] - raw[0], v[1] - raw[1])
      if (d <= bd) {
        bd = d
        best = v
      }
    }
    if (best) return { p: [best[0], best[1]], kind: 'vertex' }
  }
  let p: Point = raw
  let kind: SnapResult['kind'] = 'none'
  if (opts.prev && opts.ortho) {
    const dx = raw[0] - opts.prev[0]
    const dy = raw[1] - opts.prev[1]
    const len = Math.hypot(dx, dy)
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
    const L = opts.grid ? Math.round(len / GRID_MM) * GRID_MM : len
    p = [opts.prev[0] + Math.cos(ang) * L, opts.prev[1] + Math.sin(ang) * L]
    kind = 'axis'
  } else if (opts.grid) {
    p = [Math.round(raw[0] / GRID_MM) * GRID_MM, Math.round(raw[1] / GRID_MM) * GRID_MM]
    kind = 'grid'
  }
  return { p: [Math.round(p[0]), Math.round(p[1])], kind }
}

/** Tường gần nhất trong ngưỡng: trả tường + vị trí dọc tường (mm từ a). */
export const nearestWall = (f: Floor, p: Point, maxDist: number) => {
  let best: { wallId: string; t: number; len: number; d: number } | null = null
  for (const w of f.walls) {
    const dx = w.b[0] - w.a[0]
    const dy = w.b[1] - w.a[1]
    const len = Math.hypot(dx, dy)
    if (len < 1) continue
    const t = Math.max(0, Math.min(len, ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dy) / len))
    const qx = w.a[0] + (dx / len) * t
    const qy = w.a[1] + (dy / len) * t
    const d = Math.hypot(p[0] - qx, p[1] - qy)
    if (d <= Math.max(maxDist, w.thickness) && (!best || d < best.d)) best = { wallId: w.id, t, len, d }
  }
  return best
}
