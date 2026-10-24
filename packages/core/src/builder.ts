import { newId } from './ids.ts'
import type { Floor, Opening, OutdoorArea, Point, RoomFunction, Stair, Wall } from './schema.ts'

/**
 * Dựng nhanh một tầng từ các phòng hình chữ nhật (mm), cho seed và test.
 * Tường nằm trên cạnh phòng, cạnh chung được gộp; đa giác phòng là lòng tường (thụt nửa độ dày).
 * Mở rộng từ `buildWalls` của prototype (src/three/Structure.tsx).
 */
export interface RectRoom {
  name: string
  function: RoomFunction
  /** [x, y, rộng, sâu] mm, theo tim tường */
  rect: [number, number, number, number]
}

export interface LineOpening {
  kind: 'door' | 'window'
  /** 'x': tường chạy theo trục x tại y = at; 'y': tường chạy theo trục y tại x = at */
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
  height?: number
  sill?: number
  hinge?: 'start' | 'end'
  swing?: 'left' | 'right'
}

export interface RectFloorSpec {
  name: string
  order: number
  elevation: number
  height?: number
  rooms: RectRoom[]
  openings?: LineOpening[]
  areas?: { name: string; kind: OutdoorArea['kind']; rect: [number, number, number, number] }[]
  stairs?: { rect: [number, number, number, number]; upDirection: number; toFloorId?: string }[]
  exteriorThickness?: number
  interiorThickness?: number
  /** cặp phòng thông nhau (không kẻ tường ở cạnh chung) — không gian mở: khách–bếp, sảnh–cầu thang… */
  open?: [string, string][]
}

type Interval = [number, number]

const rectPoly = ([x, y, w, d]: [number, number, number, number], inset = 0): Point[] => [
  [x + inset, y + inset],
  [x + w - inset, y + inset],
  [x + w - inset, y + d - inset],
  [x + inset, y + d - inset],
]

const union = (list: Interval[]) => {
  const sorted = [...list].sort((a, b) => a[0] - b[0])
  const out: Interval[] = []
  for (const iv of sorted) {
    const last = out[out.length - 1]
    if (last && iv[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], iv[1])
    else out.push([iv[0], iv[1]])
  }
  return out
}

export const floorFromRects = (spec: RectFloorSpec): Floor => {
  const extT = spec.exteriorThickness ?? 200
  const intT = spec.interiorThickness ?? 110
  const minX = Math.min(...spec.rooms.map((r) => r.rect[0]))
  const minY = Math.min(...spec.rooms.map((r) => r.rect[1]))
  const maxX = Math.max(...spec.rooms.map((r) => r.rect[0] + r.rect[2]))
  const maxY = Math.max(...spec.rooms.map((r) => r.rect[1] + r.rect[3]))

  const lines = new Map<string, { axis: 'x' | 'y'; at: number; ivs: Interval[] }>()
  const addLine = (axis: 'x' | 'y', at: number, a: number, b: number) => {
    const key = `${axis}:${at}`
    if (!lines.has(key)) lines.set(key, { axis, at, ivs: [] })
    lines.get(key)!.ivs.push([a, b])
  }
  for (const { rect: [x, y, w, d] } of spec.rooms) {
    addLine('x', y, x, x + w)
    addLine('x', y + d, x, x + w)
    addLine('y', x, y, y + d)
    addLine('y', x + w, y, y + d)
  }

  // bỏ tường ở cạnh chung của các cặp phòng thông nhau
  const cut = new Map<string, Interval[]>()
  for (const [na, nb] of spec.open ?? []) {
    const A = spec.rooms.find((r) => r.name === na)?.rect
    const B = spec.rooms.find((r) => r.name === nb)?.rect
    if (!A || !B) throw new Error(`Không tìm thấy phòng để thông: ${na} – ${nb}`)
    const add = (axis: 'x' | 'y', at: number, a: number, b: number) => {
      if (b - a < 1) return
      const k = `${axis}:${at}`
      cut.set(k, [...(cut.get(k) ?? []), [a, b]])
    }
    for (const [P, Q] of [[A, B], [B, A]]) {
      if (P[0] + P[2] === Q[0]) add('y', Q[0], Math.max(P[1], Q[1]), Math.min(P[1] + P[3], Q[1] + Q[3]))
      if (P[1] + P[3] === Q[1]) add('x', Q[1], Math.max(P[0], Q[0]), Math.min(P[0] + P[2], Q[0] + Q[2]))
    }
  }
  const subtract = (ivs: Interval[], cuts: Interval[]) =>
    cuts.reduce<Interval[]>(
      (acc, [ca, cb]) => acc.flatMap(([a, b]) => [[a, Math.min(b, ca)], [Math.max(a, cb), b]] as Interval[]).filter(([a, b]) => b - a > 50),
      ivs,
    )

  const walls: Wall[] = []
  const wallLines: { wall: Wall; axis: 'x' | 'y'; at: number; from: number; to: number }[] = []
  for (const { axis, at, ivs } of lines.values()) {
    const exterior = axis === 'x' ? at === minY || at === maxY : at === minX || at === maxX
    for (const [from, to] of subtract(union(ivs), cut.get(`${axis}:${at}`) ?? [])) {
      const wall: Wall = {
        id: newId('wal'),
        a: axis === 'x' ? [from, at] : [at, from],
        b: axis === 'x' ? [to, at] : [at, to],
        thickness: exterior ? extT : intT,
      }
      walls.push(wall)
      wallLines.push({ wall, axis, at, from, to })
    }
  }

  const openings: Opening[] = []
  for (const o of spec.openings ?? []) {
    const host = wallLines.find((l) => l.axis === o.axis && Math.abs(l.at - o.at) < 1 && o.from >= l.from - 1 && o.to <= l.to + 1)
    if (!host) throw new Error(`Không tìm thấy tường cho lỗ cửa ${o.axis}=${o.at} [${o.from}, ${o.to}]`)
    const isDoor = o.kind === 'door'
    openings.push({
      id: newId('opn'),
      wallId: host.wall.id,
      kind: o.kind,
      offset: o.from - host.from,
      width: o.to - o.from,
      height: o.height ?? (isDoor ? 2200 : 1400),
      sill: o.sill ?? (isDoor ? 0 : 900),
      hinge: o.hinge ?? 'start',
      swing: o.swing ?? 'left',
    })
  }

  const thicknessAt = (axis: 'x' | 'y', at: number) =>
    (axis === 'x' ? at === minY || at === maxY : at === minX || at === maxX) ? extT : intT

  const rooms = spec.rooms.map((r) => {
    const [x, y, w, d] = r.rect
    const l = thicknessAt('y', x) / 2
    const rr = thicknessAt('y', x + w) / 2
    const t = thicknessAt('x', y) / 2
    const b = thicknessAt('x', y + d) / 2
    const polygon: Point[] = [
      [x + l, y + t],
      [x + w - rr, y + t],
      [x + w - rr, y + d - b],
      [x + l, y + d - b],
    ]
    return { id: newId('rom'), name: r.name, function: r.function, polygon }
  })

  const stairs: Stair[] = (spec.stairs ?? []).map((s) => ({
    id: newId('str'),
    polygon: rectPoly(s.rect),
    upDirection: s.upDirection,
    toFloorId: s.toFloorId,
  }))

  return {
    id: newId('flr'),
    name: spec.name,
    order: spec.order,
    elevation: spec.elevation,
    height: spec.height ?? 3300,
    calibrated: true,
    outline: [
      [minX - extT / 2, minY - extT / 2],
      [maxX + extT / 2, minY - extT / 2],
      [maxX + extT / 2, maxY + extT / 2],
      [minX - extT / 2, maxY + extT / 2],
    ],
    walls,
    openings,
    rooms,
    stairs,
    areas: (spec.areas ?? []).map((a) => ({ id: newId('are'), name: a.name, kind: a.kind, polygon: rectPoly(a.rect) })),
    items: [],
  }
}
