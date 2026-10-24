import { stairLayout } from '../stairs.ts'
import { add, bboxOf, lerp, rotatePoint, scale, sub, wallRect, wallSegments, wallsOutline } from '../geometry.ts'
import type { Bbox2 } from '../geometry.ts'
import { formatArea, formatMm, roomArea, roomLabelPoint } from '../rules.ts'
import type { Floor, Point } from '../schema.ts'
import { escapeXml } from './escape.ts'

export interface PlanStyle {
  wall: string
  room: string
  roomHighlight: string
  outdoor: string
  line: string
  thin: string
  text: string
  dim: string
  font: string
}

export const DEFAULT_PLAN_STYLE: PlanStyle = {
  wall: '#26221f',
  room: '#f7f4ef',
  roomHighlight: '#f3d9c9',
  outdoor: '#eaf1e6',
  line: '#26221f',
  thin: '#6f6a64',
  text: '#26221f',
  dim: '#3b5b8c',
  font: "'Be Vietnam Pro', Arial, sans-serif",
}

export interface PlanOptions {
  /** Mẫu số tỷ lệ in (1:50 → 50). Quyết định độ dày nét và cỡ chữ theo mm giấy. */
  scaleDenominator?: number
  /** Kích thước [rộng, sâu] mm của từng đồ để vẽ đường bao; thiếu thì bỏ qua đồ đó. */
  itemSizes?: Record<string, [number, number]>
  showItems?: boolean
  showDimensions?: boolean
  highlightRoomId?: string | null
  style?: Partial<PlanStyle>
}

export interface PlanResult {
  svg: string
  viewBox: Bbox2
  empty: boolean
}

const f = (n: number) => (Math.round(n * 10) / 10).toString()
const pts = (ps: Point[]) => ps.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')

/** Mặt bằng một tầng dạng SVG, toạ độ mm (viewBox theo mm thật). Trả rỗng khi tầng chưa hiệu chỉnh (BR-05). */
export const planSvg = (floor: Floor, opts: PlanOptions = {}): PlanResult => {
  const st = { ...DEFAULT_PLAN_STYLE, ...opts.style }
  const k = opts.scaleDenominator ?? 100
  // độ dày nét / cỡ chữ theo mm giấy → mm thật
  const lw = { wall: 0.35 * k, thin: 0.18 * k, dim: 0.13 * k }
  const fs = { room: 2.6 * k, small: 2.0 * k, dim: 2.0 * k }
  const showDims = opts.showDimensions ?? true

  const outline = wallsOutline(floor)
  const allPts = [...outline, ...floor.rooms.flatMap((r) => r.polygon), ...floor.areas.flatMap((a) => a.polygon)]
  if (!floor.calibrated || allPts.length === 0) {
    return { svg: '', viewBox: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, empty: true }
  }

  const body: string[] = []

  // Khu vực ngoài nhà
  for (const a of floor.areas) {
    if (a.polygon.length < 3) continue
    const c = roomLabelPoint(a.polygon)
    body.push(
      `<polygon points="${pts(a.polygon)}" fill="${st.outdoor}" stroke="${st.thin}" stroke-width="${f(lw.thin)}" stroke-dasharray="${f(k * 1.5)} ${f(k)}"/>`,
      `<text x="${f(c[0])}" y="${f(c[1])}" font-size="${f(fs.small)}" fill="${st.thin}" text-anchor="middle" dominant-baseline="middle">${escapeXml(a.name)}</text>`,
    )
  }

  // Phòng
  for (const r of floor.rooms) {
    if (r.polygon.length < 3) continue
    const fill = r.id === opts.highlightRoomId ? st.roomHighlight : st.room
    body.push(`<polygon data-room-id="${escapeXml(r.id)}" points="${pts(r.polygon)}" fill="${fill}" stroke="none"/>`)
  }

  // Đồ
  if (opts.showItems !== false && opts.itemSizes) {
    for (const it of floor.items) {
      const size = opts.itemSizes[it.id]
      if (!size) continue
      const [w, d] = size
      const corners: Point[] = [
        [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2],
      ].map((p) => add(rotatePoint(p as Point, it.rotation), it.position))
      body.push(`<polygon points="${pts(corners)}" fill="none" stroke="${st.thin}" stroke-width="${f(lw.thin)}"/>`)
    }
  }

  // Cầu thang: đường bao, bậc vuông góc hướng lên, mũi tên
  for (const s of floor.stairs) {
    if (s.polygon.length < 3) continue
    body.push(`<polygon points="${pts(s.polygon)}" fill="#fff" stroke="${st.line}" stroke-width="${f(lw.thin)}"/>`)
    // bậc vuông góc với từng vế, mũi tên chạy theo các vế (thang thẳng hoặc chữ U)
    const L = stairLayout(s, 1)
    const tread = 260
    const path: Point[] = []
    for (const fl of L.flights) {
      const span = Math.hypot(fl.to[0] - fl.from[0], fl.to[1] - fl.from[1])
      if (span < 1) continue
      const dir: Point = [(fl.to[0] - fl.from[0]) / span, (fl.to[1] - fl.from[1]) / span]
      const perp: Point = [-dir[1], dir[0]]
      for (let t = tread; t < span; t += tread) {
        const m = add(fl.from, scale(dir, t))
        body.push(
          `<line x1="${f(m[0] + perp[0] * fl.width / 2)}" y1="${f(m[1] + perp[1] * fl.width / 2)}" x2="${f(m[0] - perp[0] * fl.width / 2)}" y2="${f(m[1] - perp[1] * fl.width / 2)}" stroke="${st.thin}" stroke-width="${f(lw.thin)}"/>`,
        )
      }
      path.push(add(fl.from, scale(dir, tread / 2)), add(fl.to, scale(dir, -tread / 2)))
    }
    if (L.landing) body.push(`<polygon points="${pts(L.landing.polygon)}" fill="none" stroke="${st.thin}" stroke-width="${f(lw.thin)}"/>`)
    if (path.length >= 2) {
      const p1 = path[path.length - 1]
      const p0 = path[path.length - 2]
      const dl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1
      const dir: Point = [(p1[0] - p0[0]) / dl, (p1[1] - p0[1]) / dl]
      const perp: Point = [-dir[1], dir[0]]
      const h1 = add(p1, add(scale(dir, -k * 1.5), scale(perp, k)))
      const h2 = add(p1, add(scale(dir, -k * 1.5), scale(perp, -k)))
      body.push(
        `<polyline points="${pts(path)}" fill="none" stroke="${st.line}" stroke-width="${f(lw.thin)}"/>`,
        `<polyline points="${pts([h1, p1, h2])}" fill="none" stroke="${st.line}" stroke-width="${f(lw.thin)}"/>`,
      )
    }
  }

  // Tường + lỗ cửa
  const layouts = wallSegments(floor)
  for (const L of layouts) {
    for (const p of L.pieces) {
      if (p.kind !== 'solid') continue
      body.push(`<polygon points="${pts(wallRect(L.wall, p.from, p.to))}" fill="${st.wall}" stroke="${st.wall}" stroke-width="${f(lw.thin / 2)}"/>`)
    }
    const { u, n } = L.frame
    const h = L.wall.thickness / 2
    for (const o of L.openings) {
      const at = (t: number, side: number): Point => add(add(L.wall.a, scale(u, t)), scale(n, side * h))
      if (o.opening.kind === 'window') {
        // khung cửa sổ: 2 mép tường + 2 nét kính ở giữa
        for (const side of [-1, -0.25, 0.25, 1]) {
          const a = at(o.from, side)
          const b = at(o.to, side)
          body.push(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${st.line}" stroke-width="${f(lw.thin)}"/>`)
        }
        for (const t of [o.from, o.to]) {
          const a = at(t, -1)
          const b = at(t, 1)
          body.push(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${st.line}" stroke-width="${f(lw.thin)}"/>`)
        }
      } else {
        const side = o.opening.swing === 'left' ? 1 : -1
        const hingeT = o.opening.hinge === 'start' ? o.from : o.to
        const otherT = o.opening.hinge === 'start' ? o.to : o.from
        const H = at(hingeT, side)
        const J = at(otherT, side)
        const w = o.to - o.from
        const leafEnd = add(H, scale(n, side * w))
        // cung mở: từ đầu cánh về mép đối diện, tâm tại bản lề
        const sweep = (() => {
          const v1 = sub(leafEnd, H)
          const v2 = sub(J, H)
          return v1[0] * v2[1] - v1[1] * v2[0] > 0 ? 1 : 0
        })()
        body.push(
          `<line x1="${f(H[0])}" y1="${f(H[1])}" x2="${f(leafEnd[0])}" y2="${f(leafEnd[1])}" stroke="${st.line}" stroke-width="${f(lw.thin * 1.4)}"/>`,
          `<path d="M ${f(leafEnd[0])} ${f(leafEnd[1])} A ${f(w)} ${f(w)} 0 0 ${sweep} ${f(J[0])} ${f(J[1])}" fill="none" stroke="${st.thin}" stroke-width="${f(lw.thin)}" stroke-dasharray="${f(k * 0.8)} ${f(k * 0.5)}"/>`,
        )
      }
    }
  }

  // Nhãn phòng: tên · diện tích · kích thước thông thuỷ
  for (const r of floor.rooms) {
    if (r.polygon.length < 3) continue
    const c = roomLabelPoint(r.polygon)
    const b = bboxOf(r.polygon)
    const lines = [
      `<tspan x="${f(c[0])}" dy="0" font-weight="bold" font-size="${f(fs.room)}">${escapeXml(r.name)}</tspan>`,
      `<tspan x="${f(c[0])}" dy="${f(fs.room * 1.15)}" font-size="${f(fs.small)}">${escapeXml(formatArea(roomArea(r.polygon)))}</tspan>`,
    ]
    if (showDims)
      lines.push(
        `<tspan x="${f(c[0])}" dy="${f(fs.small * 1.2)}" font-size="${f(fs.small)}" fill="${st.dim}">${formatMm(b.maxX - b.minX)} × ${formatMm(b.maxY - b.minY)}</tspan>`,
      )
    body.push(`<text data-room-id="${escapeXml(r.id)}" x="${f(c[0])}" y="${f(c[1] - fs.room * 0.6)}" fill="${st.text}" text-anchor="middle">${lines.join('')}</text>`)
  }

  // Kích thước ngoài
  const bb = bboxOf(outline.length ? outline : allPts)
  const dims: string[] = []
  let pad = 3 * k
  if (showDims && outline.length) {
    const chain = exteriorChains(floor, bb)
    const o1 = 8 * k
    const o2 = 15 * k
    pad = o2 + 6 * k
    const dl = (a: Point, b: Point, text: string, vertical: boolean) => dimLine(a, b, text, vertical, st, lw.dim, fs.dim, k)
    // chuỗi từng đoạn
    for (const [side, stops] of Object.entries(chain)) {
      for (let i = 0; i + 1 < stops.length; i++) {
        const s0 = stops[i]
        const s1 = stops[i + 1]
        if (s1 - s0 < 1) continue
        if (side === 'top') dims.push(dl([s0, bb.minY - o1], [s1, bb.minY - o1], formatMm(s1 - s0), false))
        if (side === 'bottom') dims.push(dl([s0, bb.maxY + o1], [s1, bb.maxY + o1], formatMm(s1 - s0), false))
        if (side === 'left') dims.push(dl([bb.minX - o1, s0], [bb.minX - o1, s1], formatMm(s1 - s0), true))
        if (side === 'right') dims.push(dl([bb.maxX + o1, s0], [bb.maxX + o1, s1], formatMm(s1 - s0), true))
      }
    }
    // kích thước tổng
    dims.push(dl([bb.minX, bb.maxY + o2], [bb.maxX, bb.maxY + o2], formatMm(bb.maxX - bb.minX), false))
    dims.push(dl([bb.minX - o2, bb.minY], [bb.minX - o2, bb.maxY], formatMm(bb.maxY - bb.minY), true))
    // đường gióng
    for (const x of [bb.minX, bb.maxX])
      dims.push(`<line x1="${f(x)}" y1="${f(bb.maxY + k)}" x2="${f(x)}" y2="${f(bb.maxY + o2 + k)}" stroke="${st.dim}" stroke-width="${f(lw.dim)}"/>`)
    for (const y of [bb.minY, bb.maxY])
      dims.push(`<line x1="${f(bb.minX - k)}" y1="${f(y)}" x2="${f(bb.minX - o2 - k)}" y2="${f(y)}" stroke="${st.dim}" stroke-width="${f(lw.dim)}"/>`)
  }

  const viewBox = { minX: bb.minX - pad, minY: bb.minY - pad, maxX: bb.maxX + pad, maxY: bb.maxY + pad }
  for (const p of allPts) {
    viewBox.minX = Math.min(viewBox.minX, p[0] - 3 * k)
    viewBox.minY = Math.min(viewBox.minY, p[1] - 3 * k)
    viewBox.maxX = Math.max(viewBox.maxX, p[0] + 3 * k)
    viewBox.maxY = Math.max(viewBox.maxY, p[1] + 3 * k)
  }
  const vb = `${f(viewBox.minX)} ${f(viewBox.minY)} ${f(viewBox.maxX - viewBox.minX)} ${f(viewBox.maxY - viewBox.minY)}`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" font-family="${st.font}">` +
    body.join('') +
    dims.join('') +
    `</svg>`
  return { svg, viewBox, empty: false }
}

/**
 * Điểm chia kích thước trên 4 cạnh bao: mép ngoài, mép lỗ cửa trên tường ngoài,
 * và tim các tường trong chạm vào cạnh đó. Bỏ đầu mút của chính tường ngoài để không sinh đoạn vụn ở góc.
 */
const exteriorChains = (floor: Floor, bb: Bbox2) => {
  const tol = 30
  const sides: Record<'top' | 'bottom' | 'left' | 'right', Set<number>> = {
    top: new Set([bb.minX, bb.maxX]),
    bottom: new Set([bb.minX, bb.maxX]),
    left: new Set([bb.minY, bb.maxY]),
    right: new Set([bb.minY, bb.maxY]),
  }
  const layouts = wallSegments(floor)
  type Side = 'top' | 'bottom' | 'left' | 'right'
  const sideOf = (L: (typeof layouts)[number]): Side | null => {
    const r = bboxOf(wallRect(L.wall, 0, L.frame.len))
    const horizontal = Math.abs(L.frame.u[1]) < 1e-3
    const vertical = Math.abs(L.frame.u[0]) < 1e-3
    if (horizontal && Math.abs(r.minY - bb.minY) < tol) return 'top'
    if (horizontal && Math.abs(r.maxY - bb.maxY) < tol) return 'bottom'
    if (vertical && Math.abs(r.minX - bb.minX) < tol) return 'left'
    if (vertical && Math.abs(r.maxX - bb.maxX) < tol) return 'right'
    return null
  }
  const exterior = layouts.map((L) => ({ L, side: sideOf(L) }))
  for (const { L, side } of exterior) {
    if (!side) continue
    const axis = side === 'top' || side === 'bottom' ? 0 : 1
    for (const o of L.openings) {
      sides[side].add(lerp(L.wall.a, L.wall.b, o.from / L.frame.len)[axis])
      sides[side].add(lerp(L.wall.a, L.wall.b, o.to / L.frame.len)[axis])
    }
  }
  // tường trong vuông góc chạm cạnh bao → thêm tim tường
  const edgeTol = 400
  for (const { L, side } of exterior) {
    if (side) continue
    const vertical = Math.abs(L.frame.u[0]) < 1e-3
    const horizontal = Math.abs(L.frame.u[1]) < 1e-3
    for (const p of [L.wall.a, L.wall.b]) {
      if (vertical && Math.abs(p[1] - bb.minY) < edgeTol) sides.top.add(p[0])
      if (vertical && Math.abs(p[1] - bb.maxY) < edgeTol) sides.bottom.add(p[0])
      if (horizontal && Math.abs(p[0] - bb.minX) < edgeTol) sides.left.add(p[1])
      if (horizontal && Math.abs(p[0] - bb.maxX) < edgeTol) sides.right.add(p[1])
    }
  }
  const norm = (s: Set<number>) => {
    const arr = [...s].map((v) => Math.round(v)).sort((a, b) => a - b)
    return arr.filter((v, i) => i === 0 || v - arr[i - 1] > 150)
  }
  return { top: norm(sides.top), bottom: norm(sides.bottom), left: norm(sides.left), right: norm(sides.right) }
}

const dimLine = (a: Point, b: Point, text: string, vertical: boolean, st: PlanStyle, w: number, size: number, k: number) => {
  const tick = k * 1.2
  const ticks = [a, b]
    .map((p) => `<line x1="${f(p[0] - tick)}" y1="${f(p[1] + tick)}" x2="${f(p[0] + tick)}" y2="${f(p[1] - tick)}" stroke="${st.dim}" stroke-width="${f(w * 2)}"/>`)
    .join('')
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const label = vertical
    ? `<text x="${f(mid[0] - k * 0.8)}" y="${f(mid[1])}" font-size="${f(size)}" fill="${st.dim}" text-anchor="middle" transform="rotate(-90 ${f(mid[0] - k * 0.8)} ${f(mid[1])})">${escapeXml(text)}</text>`
    : `<text x="${f(mid[0])}" y="${f(mid[1] - k * 0.8)}" font-size="${f(size)}" fill="${st.dim}" text-anchor="middle">${escapeXml(text)}</text>`
  return `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${st.dim}" stroke-width="${f(w)}"/>${ticks}${label}`
}
