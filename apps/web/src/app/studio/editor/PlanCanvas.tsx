import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { bboxOf, newId, roomArea, roomLabelPoint, wallRect, wallSegments, formatArea, formatMm } from '@hd/core'
import type { Floor, Point } from '@hd/core'
import { currentFloor, useEditor } from './store.ts'
import type { SelKind } from './store.ts'
import { nearestWall, snapPoint } from './snap.ts'
import { useUnderlay } from './underlay.ts'

export interface FileInfo {
  url: string
  mime: string
}

interface View {
  cx: number
  cy: number
  scale: number
}

const f1 = (n: number) => Math.round(n * 10) / 10
const pts = (ps: Point[]) => ps.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ')
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])
const same = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < 1 && Math.abs(a[1] - b[1]) < 1

const FN_NAME: Record<string, string> = { living: 'Phòng khách', bedroom: 'Phòng ngủ', kitchen: 'Bếp', wc: 'WC', other: 'Phòng' }

/** Canvas 2D của trình dựng (FR-03.03–03.08). Toạ độ mm; nét không đổi theo zoom. */
export const PlanCanvas = ({ files, wallThickness, ortho, grid, onCalibrate, onMessage }: {
  files: Record<string, FileInfo>
  wallThickness: number
  ortho: boolean
  grid: boolean
  onCalibrate: (measuredMm: number, apply: (realMm: number) => void) => void
  onMessage: (m: string) => void
}) => {
  const doc = useEditor((s) => s.doc)
  const floorId = useEditor((s) => s.floorId)
  const tool = useEditor((s) => s.tool)
  const selection = useEditor((s) => s.selection)
  const draft = useEditor((s) => s.draft)
  const locked = useEditor((s) => s.state !== 'draft')
  const { editFloor, select, setDraft } = useEditor.getState()
  const floor = currentFloor({ doc, floorId })

  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 900, h: 640 })
  const [view, setView] = useState<View | null>(null)
  const [hover, setHover] = useState<Point | null>(null)
  const [measure, setMeasure] = useState<[Point, Point] | null>(null)
  const [space, setSpace] = useState(false)
  const action = useRef<
    | { type: 'pan'; sx: number; sy: number; view: View; moved: boolean }
    | { type: 'vertex'; orig: Point; kind: SelKind; id: string; index: number }
    | null
  >(null)

  const underlaySrc = useMemo(() => {
    const u = floor?.underlay
    const fi = u ? files[u.fileId] : undefined
    return fi ? { url: fi.url, isPdf: fi.mime === 'application/pdf', page: u!.page } : null
  }, [floor?.underlay, files])
  const { img: under, err: underErr } = useUnderlay(underlaySrc)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // khung nhìn ban đầu: vừa tầng + ảnh nền
  const fit = useCallback(() => {
    if (!floor) return
    const ps: Point[] = [...floor.walls.flatMap((w) => [w.a, w.b]), ...floor.rooms.flatMap((r) => r.polygon), ...floor.areas.flatMap((a) => a.polygon), ...(floor.outline ?? [])]
    if (floor.underlay && under) {
      const { offset, mmPerPx } = floor.underlay
      ps.push(offset, [offset[0] + under.w * mmPerPx, offset[1] + under.h * mmPerPx])
    }
    if (!ps.length) return setView({ cx: 5000, cy: 5000, scale: Math.min(size.w, size.h) / 14000 })
    const b = bboxOf(ps)
    const w = Math.max(b.maxX - b.minX, 2000)
    const h = Math.max(b.maxY - b.minY, 2000)
    setView({ cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, scale: Math.min(size.w / (w * 1.25), size.h / (h * 1.25)) })
  }, [floor, under, size])
  useEffect(() => {
    setView(null)
  }, [floorId])
  // vừa chọn / đổi ảnh nền → căn lại khung nhìn để thấy cả ảnh
  useEffect(() => {
    if (under) setView(null)
  }, [under?.url])
  useEffect(() => {
    if (!view && floor && (!floor.underlay || under || underErr)) fit()
  }, [view, floor, under, underErr, fit])

  const v = view ?? { cx: 5000, cy: 5000, scale: 0.06 }
  const px = (n: number) => n / v.scale
  const viewBox = `${v.cx - size.w / 2 / v.scale} ${v.cy - size.h / 2 / v.scale} ${size.w / v.scale} ${size.h / v.scale}`

  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current!
    const m = svg.getScreenCTM()!.inverse()
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m)
    return [p.x, p.y]
  }
  const snap = (raw: Point, prev?: Point | null, exclude?: Point[]) => snapPoint(raw, { floor, scale: v.scale, prev, ortho, grid, exclude }).p

  /* ---------- hoàn tất hình đang vẽ ---------- */
  const finishPolygon = useCallback(() => {
    const s = useEditor.getState()
    const d = s.draft
    if (d.length < 3) return setDraft([])
    const poly = d.map((p) => [p[0], p[1]] as Point)
    if (s.tool === 'room') {
      const id = newId('rom')
      s.editFloor((f) => void f.rooms.push({ id, name: `${FN_NAME.other} ${f.rooms.length + 1}`, function: 'other', polygon: poly }))
      select({ kind: 'room', id })
    } else if (s.tool === 'area') {
      const id = newId('are')
      s.editFloor((f) => void f.areas.push({ id, name: 'Sân', kind: 'yard', polygon: poly }))
      select({ kind: 'area', id })
    } else if (s.tool === 'outline') {
      s.editFloor((f) => void (f.outline = poly))
      select({ kind: 'outline', id: 'outline' })
    }
    setDraft([])
  }, [select, setDraft])

  const deleteSelection = useCallback(() => {
    const s = useEditor.getState()
    const sel = s.selection
    if (!sel) return
    s.editFloor((f) => {
      if (sel.kind === 'wall') {
        f.walls = f.walls.filter((w) => w.id !== sel.id)
        f.openings = f.openings.filter((o) => o.wallId !== sel.id)
      }
      if (sel.kind === 'opening') f.openings = f.openings.filter((o) => o.id !== sel.id)
      if (sel.kind === 'room') f.rooms = f.rooms.filter((r) => r.id !== sel.id)
      if (sel.kind === 'stair') f.stairs = f.stairs.filter((r) => r.id !== sel.id)
      if (sel.kind === 'area') f.areas = f.areas.filter((r) => r.id !== sel.id)
      if (sel.kind === 'outline') f.outline = undefined
    })
    select(null)
  }, [select])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      if (e.code === 'Space') setSpace(true)
      if (e.key === 'Escape') {
        setDraft([])
        setMeasure(null)
      }
      if (e.key === 'Enter') {
        const s = useEditor.getState()
        if (['room', 'area', 'outline'].includes(s.tool)) finishPolygon()
        else setDraft([])
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !locked) deleteSelection()
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => (window.removeEventListener('keydown', down), window.removeEventListener('keyup', up))
  }, [finishPolygon, deleteSelection, setDraft, locked])

  /* ---------- chuột ---------- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (!floor) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const raw = toWorld(e)
    const target = e.target as Element
    if (e.button === 1 || space || (tool === 'select' && !target.closest('[data-id],[data-handle]'))) {
      action.current = { type: 'pan', sx: e.clientX, sy: e.clientY, view: v, moved: false }
      return
    }
    if (locked && tool !== 'measure' && tool !== 'select') return onMessage('Phiên bản đang chờ duyệt — chỉ xem.')
    const last = draft[draft.length - 1] ?? null
    const p = snap(raw, last)

    switch (tool) {
      case 'select': {
        const h = target.closest('[data-handle]')
        if (h && !locked) {
          const [kind, id, index] = h.getAttribute('data-handle')!.split(':')
          const orig = getVertex(floor, kind as SelKind, id, Number(index))
          if (orig) action.current = { type: 'vertex', orig, kind: kind as SelKind, id, index: Number(index) }
          return
        }
        const el = target.closest('[data-id]')!
        select({ kind: el.getAttribute('data-kind') as SelKind, id: el.getAttribute('data-id')! })
        return
      }
      case 'wall': {
        if (last && dist(last, p) > 20) {
          const id = newId('wal')
          editFloor((f) => void f.walls.push({ id, a: last, b: p, thickness: wallThickness }))
        }
        setDraft([p])
        return
      }
      case 'room':
      case 'area':
      case 'outline': {
        if (draft.length >= 3 && dist(draft[0], p) * v.scale <= 14) return finishPolygon()
        setDraft([...draft, p])
        return
      }
      case 'stair': {
        if (!last) return setDraft([p])
        const [a, b] = [last, p]
        const poly: Point[] = [[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])], [Math.min(a[0], b[0]), Math.max(a[1], b[1])]]
        const w = Math.abs(a[0] - b[0])
        const h = Math.abs(a[1] - b[1])
        const id = newId('str')
        editFloor((f) => void f.stairs.push({ id, polygon: poly, upDirection: h >= w ? 90 : 0 }))
        select({ kind: 'stair', id })
        setDraft([])
        return
      }
      case 'door':
      case 'window': {
        const hit = nearestWall(floor, raw, 400)
        if (!hit) return onMessage('Bấm lên một bức tường để đặt cửa.')
        const width = tool === 'door' ? 900 : 1200
        if (hit.len < width + 20) return onMessage('Tường quá ngắn cho cửa này.')
        const offset = Math.round(Math.max(0, Math.min(hit.len - width, hit.t - width / 2)))
        const id = newId('opn')
        editFloor((f) =>
          void f.openings.push({ id, wallId: hit.wallId, kind: tool, offset, width, height: tool === 'door' ? 2200 : 1400, sill: tool === 'door' ? 0 : 900, hinge: 'start', swing: 'left' }),
        )
        select({ kind: 'opening', id })
        return
      }
      case 'calibrate':
      case 'measure': {
        if (!last) return setDraft([p])
        const d = dist(last, p)
        setDraft([])
        if (tool === 'measure') return setMeasure([last, p])
        if (d < 50) return onMessage('Đoạn quá ngắn, hãy chọn một kích thước dài trên bản vẽ.')
        onCalibrate(d, (real) => applyCalibration(real / d))
        return
      }
    }
  }

  const applyCalibration = (k: number) => {
    editFloor((f) => {
      const o: Point = f.underlay?.offset ?? [0, 0]
      const sc = (p: Point): Point => [Math.round(o[0] + (p[0] - o[0]) * k), Math.round(o[1] + (p[1] - o[1]) * k)]
      if (f.underlay) f.underlay.mmPerPx *= k
      f.walls.forEach((w) => ((w.a = sc(w.a)), (w.b = sc(w.b))))
      f.openings.forEach((op) => ((op.offset = Math.round(op.offset * k)), (op.width = Math.round(op.width * k))))
      f.rooms.forEach((r) => (r.polygon = r.polygon.map(sc)))
      f.areas.forEach((r) => (r.polygon = r.polygon.map(sc)))
      f.stairs.forEach((r) => (r.polygon = r.polygon.map(sc)))
      if (f.outline) f.outline = f.outline.map(sc)
      f.items.forEach((it) => (it.position = sc(it.position)))
      f.calibrated = true
    })
    setView(null)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const a = action.current
    if (a?.type === 'pan') {
      const dx = e.clientX - a.sx
      const dy = e.clientY - a.sy
      if (Math.abs(dx) + Math.abs(dy) > 3) a.moved = true
      setView({ ...a.view, cx: a.view.cx - dx / a.view.scale, cy: a.view.cy - dy / a.view.scale })
      return
    }
    const raw = toWorld(e)
    if (a?.type === 'vertex' && floor) {
      const p = snap(raw, null, [a.orig])
      editFloor((f) => moveVertex(f, a.orig, p), { coalesce: `drag:${a.kind}:${a.id}:${a.index}` })
      a.orig = p
      return
    }
    setHover(snap(raw, draft[draft.length - 1] ?? null))
  }

  const onPointerUp = () => {
    const a = action.current
    action.current = null
    if (a?.type === 'pan' && !a.moved && tool === 'select') select(null)
  }

  const onWheel = (e: React.WheelEvent) => {
    const w = toWorld(e)
    const k = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const scale = Math.min(2, Math.max(0.005, v.scale * k))
    const rect = svgRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    setView({ scale, cx: w[0] - (sx - size.w / 2) / scale, cy: w[1] - (sy - size.h / 2) / scale })
  }

  /* ---------- vẽ ---------- */
  const layouts = useMemo(() => (floor ? wallSegments(floor) : []), [floor])
  if (!floor) return <div className="ed-canvas" ref={wrapRef} />

  const isSel = (kind: SelKind, id: string) => selection?.kind === kind && selection.id === id
  const last = draft[draft.length - 1]
  const font = px(12)
  const cursor = space || action.current?.type === 'pan' ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair'

  return (
    <div className="ed-canvas" ref={wrapRef}>
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        viewBox={viewBox}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => (tool === 'wall' ? setDraft([]) : ['room', 'area', 'outline'].includes(tool) && finishPolygon())}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {floor.underlay && under && (
          <image
            href={under.url}
            x={floor.underlay.offset[0]}
            y={floor.underlay.offset[1]}
            width={under.w * floor.underlay.mmPerPx}
            height={under.h * floor.underlay.mmPerPx}
            opacity={floor.underlay.opacity}
            transform={`rotate(${floor.underlay.rotation} ${floor.underlay.offset[0]} ${floor.underlay.offset[1]})`}
            preserveAspectRatio="none"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {floor.outline && (
          <polygon data-kind="outline" data-id="outline" points={pts(floor.outline)} fill="none" stroke={isSel('outline', 'outline') ? '#e07a3f' : '#3b5b8c'} strokeWidth={1.5} strokeDasharray="8 5" vectorEffect="non-scaling-stroke" />
        )}
        {floor.areas.map((a) => (
          <polygon key={a.id} data-kind="area" data-id={a.id} points={pts(a.polygon)} fill={a.kind === 'pool' ? 'rgba(74,163,199,0.35)' : 'rgba(140,173,110,0.25)'} stroke={isSel('area', a.id) ? '#e07a3f' : '#6f8f5a'} strokeWidth={isSel('area', a.id) ? 2.5 : 1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        ))}
        {floor.rooms.map((r) => (
          <polygon key={r.id} data-kind="room" data-id={r.id} points={pts(r.polygon)} fill={isSel('room', r.id) ? 'rgba(224,122,63,0.22)' : 'rgba(247,244,239,0.75)'} stroke={isSel('room', r.id) ? '#e07a3f' : 'rgba(0,0,0,0.15)'} strokeWidth={isSel('room', r.id) ? 2 : 1} vectorEffect="non-scaling-stroke" />
        ))}
        {floor.stairs.map((s) => (
          <polygon key={s.id} data-kind="stair" data-id={s.id} points={pts(s.polygon)} fill="rgba(203,184,156,0.5)" stroke={isSel('stair', s.id) ? '#e07a3f' : '#8a7458'} strokeWidth={isSel('stair', s.id) ? 2.5 : 1} vectorEffect="non-scaling-stroke" />
        ))}
        {floor.items.map((it) => (
          <circle key={it.id} cx={it.position[0]} cy={it.position[1]} r={px(3)} fill="#9a8f84" style={{ pointerEvents: 'none' }} />
        ))}

        {layouts.map((L) => (
          <g key={L.wall.id}>
            <polygon data-kind="wall" data-id={L.wall.id} points={pts(wallRect(L.wall, 0, L.frame.len))} fill={isSel('wall', L.wall.id) ? '#e07a3f' : '#2b2723'} stroke="none" opacity={floor.underlay ? 0.85 : 1} />
            {L.openings.map((o) => {
              const r = wallRect(L.wall, o.from, o.to)
              return (
                <polygon key={o.opening.id} data-kind="opening" data-id={o.opening.id} points={pts(r)} fill={isSel('opening', o.opening.id) ? '#ffe0cc' : '#ffffff'} stroke={o.opening.kind === 'window' ? '#3a8fb7' : '#a1793f'} strokeWidth={isSel('opening', o.opening.id) ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" />
              )
            })}
          </g>
        ))}

        {/* nhãn phòng */}
        {floor.rooms.map((r) => {
          if (r.polygon.length < 3) return null
          const c = roomLabelPoint(r.polygon)
          const b = bboxOf(r.polygon)
          return (
            <text key={`l${r.id}`} x={c[0]} y={c[1]} fontSize={font} textAnchor="middle" fill="#3a332c" style={{ pointerEvents: 'none' }}>
              <tspan x={c[0]} fontWeight="600">{r.name}</tspan>
              {floor.calibrated && (
                <>
                  <tspan x={c[0]} dy={font * 1.2}>{formatArea(roomArea(r.polygon))}</tspan>
                  <tspan x={c[0]} dy={font * 1.2} fill="#3b5b8c">{formatMm(b.maxX - b.minX)} × {formatMm(b.maxY - b.minY)}</tspan>
                </>
              )}
            </text>
          )
        })}

        {/* kích thước tường đang chọn */}
        {selection?.kind === 'wall' && floor.calibrated && (() => {
          const w = floor.walls.find((x) => x.id === selection.id)
          if (!w) return null
          const m: Point = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]
          return <Label at={m} text={`${formatMm(dist(w.a, w.b))} mm`} font={font} />
        })()}

        {/* tay nắm đỉnh */}
        {selection && !locked && handlesFor(floor, selection.kind, selection.id).map((p, i) => (
          <rect key={i} data-handle={`${selection.kind}:${selection.id}:${i}`} x={p[0] - px(5)} y={p[1] - px(5)} width={px(10)} height={px(10)} fill="#fff" stroke="#e07a3f" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ cursor: 'move' }} />
        ))}

        {/* đang vẽ */}
        {draft.length > 0 && hover && (
          <>
            {tool === 'wall' && last && (
              <polygon points={pts(wallRect({ id: 'p', a: last, b: hover, thickness: wallThickness }, 0, dist(last, hover)))} fill="rgba(224,122,63,0.45)" style={{ pointerEvents: 'none' }} />
            )}
            {['room', 'area', 'outline'].includes(tool) && (
              <polyline points={pts([...draft, hover])} fill="rgba(224,122,63,0.12)" stroke="#e07a3f" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
            )}
            {tool === 'stair' && last && (
              <rect x={Math.min(last[0], hover[0])} y={Math.min(last[1], hover[1])} width={Math.abs(last[0] - hover[0])} height={Math.abs(last[1] - hover[1])} fill="rgba(203,184,156,0.5)" stroke="#e07a3f" vectorEffect="non-scaling-stroke" />
            )}
            {(tool === 'calibrate' || tool === 'measure') && last && <line x1={last[0]} y1={last[1]} x2={hover[0]} y2={hover[1]} stroke="#e07a3f" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
            {last && <Label at={hover} text={tool === 'calibrate' && !floor.calibrated ? 'Chọn điểm thứ hai' : `${formatMm(dist(last, hover))} mm`} font={font} offset={px(14)} />}
          </>
        )}
        {measure && (
          <>
            <line x1={measure[0][0]} y1={measure[0][1]} x2={measure[1][0]} y2={measure[1][1]} stroke="#3b5b8c" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <Label at={[(measure[0][0] + measure[1][0]) / 2, (measure[0][1] + measure[1][1]) / 2]} text={`${formatMm(dist(measure[0], measure[1]))} mm`} font={font} />
          </>
        )}
        {hover && tool !== 'select' && <circle cx={hover[0]} cy={hover[1]} r={px(4)} fill="none" stroke="#e07a3f" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />}
      </svg>
      <div className="ed-zoom">
        <button onClick={() => setView({ ...v, scale: v.scale * 1.25 })} aria-label="Phóng to">+</button>
        <button onClick={() => setView({ ...v, scale: v.scale / 1.25 })} aria-label="Thu nhỏ">−</button>
        <button onClick={() => setView(null)} aria-label="Vừa khung">⤢</button>
      </div>
      {underErr && <p className="ed-warn">Không tải được ảnh nền.</p>}
    </div>
  )
}

const Label = ({ at, text, font, offset = 0 }: { at: Point; text: string; font: number; offset?: number }) => (
  <g style={{ pointerEvents: 'none' }}>
    <rect x={at[0] + offset - font * 0.3} y={at[1] - offset - font * 1.1} width={text.length * font * 0.6 + font * 0.6} height={font * 1.5} rx={font * 0.3} fill="#26221f" opacity={0.85} />
    <text x={at[0] + offset} y={at[1] - offset} fontSize={font} fill="#fff">{text}</text>
  </g>
)

const handlesFor = (f: Floor, kind: SelKind, id: string): Point[] => {
  if (kind === 'wall') {
    const w = f.walls.find((x) => x.id === id)
    return w ? [w.a, w.b] : []
  }
  if (kind === 'room') return f.rooms.find((x) => x.id === id)?.polygon ?? []
  if (kind === 'area') return f.areas.find((x) => x.id === id)?.polygon ?? []
  if (kind === 'stair') return f.stairs.find((x) => x.id === id)?.polygon ?? []
  if (kind === 'outline') return f.outline ?? []
  return []
}

const getVertex = (f: Floor, kind: SelKind, id: string, i: number): Point | null => handlesFor(f, kind, id)[i] ?? null

/** Di chuyển mọi đỉnh trùng `from` (tường + phòng + khu vực + đường bao) để giữ liền mạch. */
const moveVertex = (f: Floor, from: Point, to: Point) => {
  const mv = (p: Point): Point => (same(p, from) ? [to[0], to[1]] : p)
  f.walls.forEach((w) => ((w.a = mv(w.a)), (w.b = mv(w.b))))
  f.rooms.forEach((r) => (r.polygon = r.polygon.map(mv)))
  f.areas.forEach((r) => (r.polygon = r.polygon.map(mv)))
  f.stairs.forEach((r) => (r.polygon = r.polygon.map(mv)))
  if (f.outline) f.outline = f.outline.map(mv)
}

