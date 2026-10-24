import { auditFloor, bboxOf, newId, pointInPolygon, stairEnd, wallSegments } from '@hd/core'
import type { Floor, HouseDocument, NavLibrary, PlacedItem, Room } from '@hd/core'

/*
 * Bày đồ cho nhà mẫu (seed) mà vẫn đi lại được:
 * - đồ bám tường, thử lần lượt các tường và vị trí dọc tường; không đặt vào vùng trước cửa đi / hai đầu cầu thang;
 * - sau khi bày cả nhà, kiểm lối đi (auditFloor) và bỏ bớt đồ ít quan trọng nằm ở chỗ hẹp cho tới khi hết lỗi do đồ.
 */

type Sizes = Record<string, [number, number, number]>
type LibIds = Record<string, string>
type Side = 'top' | 'bottom' | 'left' | 'right'
interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const ROT: Record<Side, number> = { top: 0, bottom: 180, left: 90, right: -90 }
const IN: Record<Side, [number, number]> = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] }
const SIDES: Side[] = ['top', 'bottom', 'left', 'right']
const overlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
const grow = (b: Box, k: number): Box => ({ x0: b.x0 - k, y0: b.y0 - k, x1: b.x1 + k, y1: b.y1 + k })

/** Vùng phải để trống: trước và sau mỗi cửa đi (`depth` mm tính từ mặt tường), hai đầu cầu thang, chỗ đầu thang từ tầng dưới lên. */
const keepClear = (doc: HouseDocument, f: Floor, depth: number): Box[] => {
  const out: Box[] = []
  for (const L of wallSegments(f))
    for (const sp of L.openings) {
      if (sp.opening.kind !== 'door') continue
      const a = L.wall.a
      const { u, n } = L.frame
      const p0: [number, number] = [a[0] + u[0] * (sp.from - 150), a[1] + u[1] * (sp.from - 150)]
      const p1: [number, number] = [a[0] + u[0] * (sp.to + 150), a[1] + u[1] * (sp.to + 150)]
      const k = L.wall.thickness / 2 + depth
      const xs = [p0[0] + n[0] * k, p0[0] - n[0] * k, p1[0] + n[0] * k, p1[0] - n[0] * k]
      const ys = [p0[1] + n[1] * k, p0[1] - n[1] * k, p1[1] + n[1] * k, p1[1] - n[1] * k]
      out.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) })
    }
  for (const s of f.stairs) {
    const b = bboxOf(s.polygon)
    const along = Math.abs(Math.cos((s.upDirection * Math.PI) / 180)) > 0.5
    out.push(along ? { x0: b.minX - 1000, y0: b.minY - 100, x1: b.maxX + 1000, y1: b.maxY + 100 } : { x0: b.minX - 100, y0: b.minY - 1000, x1: b.maxX + 100, y1: b.maxY + 1000 })
  }
  for (const s of doc.floors.flatMap((x) => x.stairs.filter((st) => st.toFloorId === f.id))) {
    const [x, y] = stairEnd(s, 'top')
    out.push({ x0: x - 800, y0: y - 800, x1: x + 800, y1: y + 800 })
    // lỗ cầu thang từ tầng dưới: không có sàn để đặt đồ
    const b = bboxOf(s.polygon)
    out.push({ x0: b.minX - 100, y0: b.minY - 100, x1: b.maxX + 100, y1: b.maxY + 100 })
  }
  return out
}

/** Bày đồ một phòng theo công năng. */
/** Đồ thiết yếu: không đặt được với vùng trống chuẩn thì thử với vùng trống hẹp hơn (phòng nhỏ như WC). */
const ESSENTIAL = new Set(['toilet', 'vanity', 'bed', 'bedKing', 'kitchen', 'sofa'])

const furnishRoom = (room: Room, clear: Box[], relaxed: Box[], lib: LibIds, sizes: Sizes): PlacedItem[] => {
  const b = bboxOf(room.polygon)
  const W = b.maxX - b.minX
  const D = b.maxY - b.minY
  const out: PlacedItem[] = []
  const taken: Box[] = []
  const size = (k: string) => sizes[k] ?? [500, 500, 500]

  let zones = clear
  const fits = (bx: Box) =>
    bx.x0 >= b.minX + 5 && bx.y0 >= b.minY + 5 && bx.x1 <= b.maxX - 5 && bx.y1 <= b.maxY - 5 && !zones.some((c) => overlap(c, bx)) && !taken.some((t) => overlap(grow(t, 60), bx))
  const boxAt = (k: string, x: number, y: number, rot: number): Box => {
    const [w, , d] = size(k)
    const [hx, hy] = Math.abs(rot) % 180 === 90 ? [d / 2, w / 2] : [w / 2, d / 2]
    return { x0: x - hx, y0: y - hy, x1: x + hx, y1: y + hy }
  }
  const commit = (k: string, x: number, y: number, rot: number) => {
    taken.push(boxAt(k, x, y, rot))
    if (lib[k]) out.push({ id: newId('itm'), source: { libraryItemId: lib[k] }, position: [Math.round(x), Math.round(y)], elevation: 0, rotation: rot })
  }
  /** Vị trí đặt sát tường `side`, `t` = vị trí dọc tường (0…1). */
  const onWall = (k: string, side: Side, t: number, gap = 30) => {
    const [w, , d] = size(k)
    const along = side === 'top' || side === 'bottom' ? W : D
    const c = (side === 'top' || side === 'bottom' ? b.minX : b.minY) + w / 2 + (along - w) * t
    const x = side === 'left' ? b.minX + d / 2 + gap : side === 'right' ? b.maxX - d / 2 - gap : c
    const y = side === 'top' ? b.minY + d / 2 + gap : side === 'bottom' ? b.maxY - d / 2 - gap : c
    return { x, y, rot: ROT[side] }
  }
  /** Đặt đồ sát tường: thử các tường theo thứ tự ưu tiên, mỗi tường thử nhiều vị trí. Trả chỗ đã đặt hoặc null. */
  const wallItem = (k: string, sides: Side[] = SIDES, ts = [0.5, 0.3, 0.7, 0.12, 0.88, 0, 1], extra?: (p: { x: number; y: number; rot: number; side: Side }) => boolean) => {
    for (const z of ESSENTIAL.has(k) ? [clear, relaxed] : [clear]) {
      zones = z
      for (const side of sides)
        for (const t of ts) {
          const p = onWall(k, side, t)
          if (!fits(boxAt(k, p.x, p.y, p.rot))) continue
          if (extra && !extra({ ...p, side })) continue
          commit(k, p.x, p.y, p.rot)
          zones = clear
          return { ...p, side }
        }
    }
    zones = clear
    return null
  }
  /** Đồ đặt tự do (bàn trà, bàn ăn): thử quanh vị trí mong muốn. */
  const freeItem = (k: string, x: number, y: number, rot = 0) => {
    for (const [dx, dy] of [[0, 0], [0, 300], [0, -300], [300, 0], [-300, 0], [0, 600], [0, -600], [600, 0], [-600, 0]]) {
      if (fits(boxAt(k, x + dx, y + dy, rot))) {
        commit(k, x + dx, y + dy, rot)
        return [x + dx, y + dy] as const
      }
    }
    return null
  }
  const corner = (k: string) => {
    const [w, , d] = size(k)
    for (const [x, y] of [[b.minX + w / 2 + 60, b.minY + d / 2 + 60], [b.maxX - w / 2 - 60, b.minY + d / 2 + 60], [b.minX + w / 2 + 60, b.maxY - d / 2 - 60], [b.maxX - w / 2 - 60, b.maxY - d / 2 - 60]])
      if (fits(boxAt(k, x, y, 0))) return commit(k, x, y, 0)
  }
  const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

  switch (room.function) {
    case 'living': {
      const s = wallItem(W > 3000 && D > 3000 ? (W >= D ? 'sofa' : 'sofa') : 'sofa')
      if (s) {
        const [, , sd] = size('sofa')
        const [, , cd] = size('coffee')
        const [ix, iy] = IN[s.side]
        const k = sd / 2 + 420 + cd / 2
        const deep = s.side === 'top' || s.side === 'bottom' ? D : W
        if (deep > sd + 420 + cd + 900 + size('tv')[2]) {
          if (lib.rug) out.push({ id: newId('itm'), source: { libraryItemId: lib.rug }, position: [Math.round(s.x + ix * k), Math.round(s.y + iy * k)], elevation: 0, rotation: s.rot })
          freeItem('coffee', s.x + ix * k, s.y + iy * k, s.rot)
        }
        if (deep > sd + 2200) wallItem('tv', [opposite[s.side]])
      }
      if (W * D > 18e6) {
        corner('plant')
        corner('lamp')
      }
      break
    }
    case 'bedroom': {
      const bed = W * D > 14e6 ? 'bedKing' : 'bed'
      const [bw] = size(bed)
      // đầu giường sát tường; chừa lối ≥ 0,6 m ở ít nhất một bên và cuối giường
      const placed = wallItem(bed, ['top', 'left', 'right', 'bottom'], [0.5, 0.35, 0.65], (p) => {
        const along = p.side === 'top' || p.side === 'bottom' ? W : D
        const deep = p.side === 'top' || p.side === 'bottom' ? D : W
        return along - bw >= 600 && deep - size(bed)[2] >= 650
      })
      if (placed) {
        const [ux, uy] = placed.side === 'top' || placed.side === 'bottom' ? [1, 0] : [0, 1]
        const [ix, iy] = IN[placed.side]
        const [nw, , nd] = size('nightstand')
        for (const sg of [-1, 1]) {
          const off = bw / 2 + nw / 2 + 60
          const x = placed.x + ux * off * sg - ix * (size(bed)[2] / 2 - nd / 2 - 30)
          const y = placed.y + uy * off * sg - iy * (size(bed)[2] / 2 - nd / 2 - 30)
          if (fits(boxAt('nightstand', x, y, placed.rot))) commit('nightstand', x, y, placed.rot)
        }
        wallItem('wardrobe', SIDES.filter((x) => x !== placed.side))
      }
      break
    }
    case 'kitchen':
    case 'dining': {
      const k = wallItem('kitchen', ['top', 'left', 'right', 'bottom'], [0, 1, 0.5])
      if (W > 3400) wallItem('fridge', k ? [k.side, ...SIDES.filter((s) => s !== k.side)] : SIDES, [1, 0, 0.9, 0.1])
      if (W * D > 14e6) {
        // bàn ăn + 4 ghế như một cụm
        const cx = b.minX + W / 2
        const cy = b.minY + D * 0.6
        const [tw, , td] = size('dining')
        const cd = size('chair')[2]
        const groupW = tw
        const groupD = td + 2 * (cd + 200)
        for (const [dx, dy] of [[0, 0], [0, 400], [0, -400], [400, 0], [-400, 0], [0, 800], [0, -800]]) {
          const g = { x0: cx + dx - groupW / 2, y0: cy + dy - groupD / 2, x1: cx + dx + groupW / 2, y1: cy + dy + groupD / 2 }
          if (!fits(g)) continue
          taken.push(g)
          const X = cx + dx
          const Y = cy + dy
          const put = (key: string, x: number, y: number, rot: number) => lib[key] && out.push({ id: newId('itm'), source: { libraryItemId: lib[key] }, position: [Math.round(x), Math.round(y)], elevation: 0, rotation: rot })
          put('dining', X, Y, 0)
          for (const sx of [-400, 400]) {
            put('chair', X + sx, Y - td / 2 - cd / 2 - 100, 0)
            put('chair', X + sx, Y + td / 2 + cd / 2 + 100, 180)
          }
          break
        }
      }
      break
    }
    case 'bathroom':
    case 'wc':
      wallItem('vanity', ['left', 'top', 'right', 'bottom'], [0, 0.5, 1])
      wallItem('toilet', ['right', 'top', 'left', 'bottom'], [0, 1, 0.5])
      if (W * D > 4.5e6) corner('shower')
      break
    case 'study': {
      const d = wallItem('desk', ['top', 'left', 'right', 'bottom'])
      if (d) {
        const [ix, iy] = IN[d.side]
        const k = size('desk')[2] / 2 + 350
        freeItem('officeChair', d.x + ix * k, d.y + iy * k, ROT[opposite[d.side]])
        wallItem('shelf', SIDES.filter((s) => s !== d.side))
      }
      break
    }
    case 'hall':
      // sảnh / hành lang để thoáng: chỉ cây ở góc; sảnh rộng thì thêm ghế sát tường
      corner('plant')
      if (W * D > 16e6 && Math.min(W, D) > 3000) wallItem('armchair', SIDES, [0.2, 0.8])
      break
    case 'worship':
      wallItem('shelf', ['top', 'bottom', 'left', 'right'])
      break
  }
  return out
}

/** Thứ tự bỏ bớt khi chật: đồ phụ trước. */
const DROP_ORDER = ['plant', 'lamp', 'armchair', 'nightstand', 'shelf', 'chair', 'coffee', 'rug', 'officeChair', 'shower', 'wardrobe', 'fridge', 'tv', 'dining', 'desk', 'vanity', 'toilet', 'sofa', 'kitchen', 'bed', 'bedKing']

/** Bày đồ cả nhà rồi bỏ bớt đồ gây hẹp lối (theo auditFloor). */
export const furnishHouse = (doc: HouseDocument, lib: LibIds, sizes: Sizes, categories: Record<string, string>): HouseDocument => {
  const keyOf = Object.fromEntries(Object.entries(lib).map(([k, id]) => [id, k]))
  const navLib: NavLibrary = Object.fromEntries(Object.entries(lib).map(([k, id]) => [id, { category: categories[k] ?? 'other', sizeMm: sizes[k] }]))
  const floors = doc.floors.map((f) => {
    const clear = keepClear(doc, f, 900)
    const relaxed = keepClear(doc, f, 450)
    return { ...f, items: f.rooms.flatMap((r) => furnishRoom(r, clear, relaxed, lib, sizes)) }
  })
  const out: HouseDocument = { ...doc, floors }
  for (const f of out.floors) {
    const rank = (it: PlacedItem) => {
      const r = DROP_ORDER.indexOf(keyOf[(it.source as { libraryItemId: string }).libraryItemId] ?? '')
      return r < 0 ? DROP_ORDER.length : r
    }
    const count = () => auditFloor(out, f, navLib).filter((i) => i.code !== 'ROOM_CRAMPED')
    for (let guard = 0; guard < 40; guard++) {
      const issues = count()
      if (!issues.length) break
      // thử bỏ từng món (đồ phụ trước, đồ gần chỗ có vấn đề trước): giữ lần bỏ đầu tiên làm giảm số lỗi
      const near = (it: PlacedItem) => issues.some((i) => !!i.at && Math.hypot(it.position[0] - i.at[0], it.position[1] - i.at[1]) < 1600)
      const cand = f.items.filter((it) => 'libraryItemId' in it.source).sort((a, c) => Number(near(c)) - Number(near(a)) || rank(a) - rank(c))
      let done = false
      for (const it of cand) {
        const keep = f.items
        f.items = keep.filter((x) => x !== it)
        if (count().length < issues.length) {
          done = true
          break
        }
        f.items = keep
      }
      if (!done) break // lỗi do tường / bố cục — không phải do đồ
    }
  }
  return out
}
