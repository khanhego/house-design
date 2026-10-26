import { memo, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { bboxOf, pointInPolygon, stairLayout, wallsOutline, wallSegments } from '@hd/core'
import type { Floor, HouseDocument, OutdoorArea, Point, Room, Stair } from '@hd/core'
import { MAT } from './materials.ts'
import { floorKindFor, floorTexture, TILE_METERS } from './textures.ts'
import { M } from './units.ts'
import { highlighted as highlightOf, meterBox, useSurfaces } from './surfaces.ts'

export type WallMode = 'auto' | 'low' | 'full'

const LOW_MM = 220

/** Shape trong mặt phẳng XY với y = -planY, để sau khi xoay -90° quanh X thành (X = x, Z = planY). */
const shapeOf = (poly: Point[]) => {
  const s = new THREE.Shape()
  poly.forEach(([x, y], i) => (i === 0 ? s.moveTo(M(x), -M(y)) : s.lineTo(M(x), -M(y))))
  s.closePath()
  return s
}

const flatGeometry = (poly: Point[]) => {
  const g = new THREE.ShapeGeometry(shapeOf(poly))
  g.rotateX(-Math.PI / 2)
  return g
}

const extrudeGeometry = (poly: Point[], depthM: number) => {
  const g = new THREE.ExtrudeGeometry(shapeOf(poly), { depth: depthM, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  return g
}

/* ---------- sàn ---------- */

const texturedMaterials = new Map<string, THREE.MeshStandardMaterial>()
const floorMaterial = (room: Room, highlighted: boolean) => {
  const kind = floorKindFor(room.function)
  const key = `${kind}:${highlighted}`
  if (!texturedMaterials.has(key)) {
    const tex = floorTexture(kind).clone()
    tex.repeat.set(1 / TILE_METERS[kind], 1 / TILE_METERS[kind])
    tex.needsUpdate = true
    texturedMaterials.set(key, new THREE.MeshStandardMaterial({ map: tex, roughness: kind === 'wood' ? 0.6 : 0.4, emissive: highlighted ? '#c8643a' : '#000000', emissiveIntensity: highlighted ? 0.12 : 0 }))
  }
  return texturedMaterials.get(key)!
}

const RoomFloor = ({ room, elevation, highlighted, onClick, onDoubleClick }: {
  room: Room
  elevation: number
  highlighted: boolean
  onClick?: (e: ThreeEvent<MouseEvent>) => void
  onDoubleClick?: (e: ThreeEvent<MouseEvent>) => void
}) => {
  const geo = useMemo(() => (room.polygon.length >= 3 ? flatGeometry(room.polygon) : null), [room.polygon])
  const real = useSurfaces().get(room.finish?.floor)
  if (!geo) return null
  // vật liệu thật (item 03) nếu đã gán; chưa gán thì texture vẽ bằng code như trước
  const mat = real ? (highlighted ? highlightOf(real) : real) : floorMaterial(room, highlighted)
  return (
    <mesh geometry={geo} material={mat} position={[0, M(elevation) + 0.003, 0]} receiveShadow onClick={onClick} onDoubleClick={onDoubleClick} userData={{ roomId: room.id }} />
  )
}

/** Trần phòng (item 03): chỉ hiện khi đứng trong nhà ở tầng đang xem — nhìn từ trên xuống không bị che. */
const RoomCeiling = ({ room, top }: { room: Room; top: number }) => {
  const geo = useMemo(() => {
    if (room.polygon.length < 3) return null
    const g = flatGeometry(room.polygon)
    // lật mặt để nhìn thấy từ dưới lên: đảo chiều tam giác + pháp tuyến hướng xuống
    const idx = g.getIndex()
    if (idx) for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1)
      idx.setX(i + 1, idx.getX(i + 2))
      idx.setX(i + 2, b)
    }
    const nor = g.getAttribute('normal')
    for (let i = 0; i < nor.count; i++) nor.setY(i, -nor.getY(i))
    return g
  }, [room.polygon])
  const mat = useSurfaces().get(room.finish?.ceiling) ?? MAT.ceiling
  if (!geo) return null
  return <mesh geometry={geo} material={mat} position={[0, M(top) - 0.005, 0]} receiveShadow />
}

const Slab = ({ outline, elevation }: { outline: Point[]; elevation: number }) => {
  const geo = useMemo(() => extrudeGeometry(outline, 0.15), [outline])
  return <mesh geometry={geo} material={MAT.slab} position={[0, M(elevation) - 0.15, 0]} receiveShadow castShadow />
}

/* ---------- tường ---------- */

interface PieceBox {
  pos: [number, number, number]
  size: [number, number, number]
  rotY: number
}

const segIntersect = (p1: Point, p2: Point, p3: Point, p4: Point) => {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0])
  if (Math.abs(d) < 1e-9) return false
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d
  return t > 0 && t < 1 && u > -0.05 && u < 1.05
}

const WallRun = memo(({ layout, elevation, mode, target, rooms, finishes }: {
  layout: ReturnType<typeof wallSegments>[number]
  elevation: number
  mode: WallMode
  target: React.RefObject<THREE.Vector3>
  rooms: Room[]
  finishes?: HouseDocument['finishes']
}) => {
  const kit = useSurfaces()
  const ref = useRef<THREE.Group>(null)
  const glassRef = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  const { wall, frame, height } = layout
  const rotY = -Math.atan2(frame.u[1], frame.u[0])

  const { glass, doors } = useMemo(() => {
    const at = (t: number): [number, number] => [wall.a[0] + frame.u[0] * t, wall.a[1] + frame.u[1] * t]
    const box = (from: number, to: number, bottom: number, top: number, thick: number): PieceBox => {
      const [x, y] = at((from + to) / 2)
      return { pos: [M(x), M((bottom + top) / 2), M(y)], size: [M(to - from), M(top - bottom), M(thick)], rotY }
    }
    const glass: PieceBox[] = []
    const doors: { pos: [number, number, number]; size: [number, number, number]; rotY: number }[] = []
    for (const o of layout.openings) {
      if (o.opening.kind === 'window') {
        glass.push(box(o.from, o.to, o.opening.sill, Math.min(height, o.opening.sill + o.opening.height), 24))
      } else {
        // cánh cửa mở 90° về phía swing, bản lề tại hinge
        const side = o.opening.swing === 'left' ? 1 : -1
        const hingeT = o.opening.hinge === 'start' ? o.from : o.to
        const w = o.to - o.from
        const [hx, hy] = at(hingeT)
        const nx = frame.n[0] * side
        const ny = frame.n[1] * side
        const cx = hx + nx * (wall.thickness / 2 + w / 2) - frame.u[0] * (o.opening.hinge === 'start' ? -20 : 20)
        const cy = hy + ny * (wall.thickness / 2 + w / 2) - frame.u[1] * (o.opening.hinge === 'start' ? -20 : 20)
        const h = Math.min(height, o.opening.height)
        doors.push({ pos: [M(cx), M(h / 2), M(cy)], size: [M(w), M(h), 0.04], rotY: -Math.atan2(ny, nx) })
      }
    }
    return { glass, doors }
  }, [layout, wall, frame, height, rotY])

  // vật liệu từng mặt tường (item 03): mặt +z của hộp = phía pháp tuyến n của tường. Một đoạn tường có thể chạy
  // qua nhiều phòng → chia đoạn theo phòng ở mỗi mặt (lấy mẫu mỗi 200 mm, cách mặt tường 150 mm); không có phòng
  // (mặt ngoài nhà) → vật liệu mặt ngoài
  const pieces = useMemo(() => {
    const off = wall.thickness / 2 + 150
    const roomAt = (t: number, k: number) => {
      const p: Point = [wall.a[0] + frame.u[0] * t + frame.n[0] * off * k, wall.a[1] + frame.u[1] * t + frame.n[1] * off * k]
      return rooms.find((x) => pointInPolygon(p, x.polygon)) ?? null
    }
    const matOf = (r: Room | null) => kit.get(r ? r.finish?.wall : finishes?.facade) ?? MAT.wall
    const out: { b: PieceBox; geo: THREE.BufferGeometry; mats: THREE.Material[] }[] = []
    for (const p of layout.pieces) {
      // các đoạn con có cùng (phòng mặt +, phòng mặt −)
      const cuts: { from: number; to: number; plus: Room | null; minus: Room | null }[] = []
      const n = Math.max(1, Math.ceil((p.to - p.from) / 200))
      for (let i = 0; i < n; i++) {
        const a0 = p.from + ((p.to - p.from) * i) / n
        const a1 = p.from + ((p.to - p.from) * (i + 1)) / n
        const mid = (a0 + a1) / 2
        const plus = roomAt(mid, 1)
        const minus = roomAt(mid, -1)
        const last = cuts[cuts.length - 1]
        if (last && last.plus === plus && last.minus === minus) last.to = a1
        else cuts.push({ from: a0, to: a1, plus, minus })
      }
      for (const c of cuts) {
        const [x, y] = [wall.a[0] + frame.u[0] * ((c.from + c.to) / 2), wall.a[1] + frame.u[1] * ((c.from + c.to) / 2)]
        const b: PieceBox = { pos: [M(x), M((p.bottom + p.top) / 2), M(y)], size: [M(c.to - c.from), M(p.top - p.bottom), M(wall.thickness)], rotY }
        out.push({ b, geo: meterBox(b.size[0], b.size[1], b.size[2]), mats: [MAT.wall, MAT.wall, MAT.wallTop, MAT.wall, matOf(c.plus), matOf(c.minus)] })
      }
    }
    return out
  }, [layout, rooms, finishes, kit, wall, frame, rotY])
  const doorMat = kit.get(finishes?.door) ?? MAT.door
  const doorGeos = useMemo(() => doors.map((d) => meterBox(d.size[0], d.size[1], d.size[2])), [doors])

  const tmp = useMemo(() => ({ cam: [0, 0] as Point, tgt: [0, 0] as Point }), [])
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    let want = 1
    if (mode === 'low') want = LOW_MM / height
    else if (mode === 'auto') {
      tmp.cam[0] = camera.position.x * 1000
      tmp.cam[1] = camera.position.z * 1000
      tmp.tgt[0] = target.current.x * 1000
      tmp.tgt[1] = target.current.z * 1000
      if (segIntersect(tmp.cam, tmp.tgt, wall.a, wall.b)) want = LOW_MM / height
    }
    g.scale.y = THREE.MathUtils.damp(g.scale.y, want, 9, dt)
    if (glassRef.current) glassRef.current.visible = g.scale.y > 0.6
  })

  return (
    <group ref={ref} position={[0, M(elevation), 0]}>
      {pieces.map(({ b, geo, mats }, i) => (
        <mesh key={i} position={b.pos} rotation={[0, b.rotY, 0]} geometry={geo} material={mats} castShadow receiveShadow />
      ))}
      <group ref={glassRef}>
        {glass.map((b, i) => (
          <mesh key={i} position={b.pos} rotation={[0, b.rotY, 0]} material={MAT.glass}>
            <boxGeometry args={b.size} />
          </mesh>
        ))}
        {doors.map((d, i) => (
          <mesh key={i} position={d.pos} rotation={[0, d.rotY, 0]} geometry={doorGeos[i]} material={doorMat} castShadow />
        ))}
      </group>
    </group>
  )
})

/* ---------- cầu thang ---------- */

const StairMesh = ({ stair, elevation, rise, materialId }: { stair: Stair; elevation: number; rise: number; materialId?: string }) => {
  const mat = useSurfaces().get(materialId) ?? MAT.stair
  // bậc theo từng vế (thang thẳng hoặc chữ U — stairLayout dùng chung với va chạm đi bộ), chiếu nghỉ
  const parts = useMemo(() => {
    const L = stairLayout(stair, rise)
    const out: { pos: [number, number, number]; size: [number, number, number]; rotY: number }[] = []
    for (const fl of L.flights) {
      const dx = fl.to[0] - fl.from[0]
      const dy = fl.to[1] - fl.from[1]
      const run = Math.hypot(dx, dy)
      const dh = fl.h1 - fl.h0
      const n = Math.max(2, Math.round(dh / 175))
      const tread = run / n
      const rotY = -Math.atan2(dy, dx)
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n
        const h = fl.h0 + (dh / n) * (i + 1)
        // bậc trên dầm: khối từ mặt bậc xuống 0,25 m (thang chữ U xếp chồng vẫn thông, không đặc tới sàn)
        const th = Math.min(h, 250 + dh / n)
        out.push({ pos: [M(fl.from[0] + dx * t), M(h - th / 2), M(fl.from[1] + dy * t)], size: [M(tread), M(th), M(fl.width)], rotY })
      }
    }
    if (L.landing) {
      const b = bboxOf(L.landing.polygon)
      out.push({ pos: [M((b.minX + b.maxX) / 2), M(L.landing.h - 100), M((b.minY + b.maxY) / 2)], size: [M(b.maxX - b.minX), M(200), M(b.maxY - b.minY)], rotY: 0 })
    }
    return out
  }, [stair, rise])
  const geos = useMemo(() => parts.map((p) => meterBox(p.size[0], p.size[1], p.size[2])), [parts])
  return (
    <group position={[0, M(elevation), 0]}>
      {parts.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={[0, s.rotY, 0]} geometry={geos[i]} material={mat} castShadow receiveShadow />
      ))}
    </group>
  )
}

/* ---------- khu vực ngoài nhà ---------- */

const AreaMesh = ({ area, elevation }: { area: OutdoorArea; elevation: number }) => {
  const geo = useMemo(() => (area.polygon.length >= 3 ? flatGeometry(area.polygon) : null), [area.polygon])
  const edge = useMemo(() => (area.kind === 'pool' && area.polygon.length >= 3 ? extrudeGeometry(area.polygon, 0.06) : null), [area])
  if (!geo) return null
  const y = M(elevation)
  if (area.kind === 'pool')
    return (
      <group>
        {edge && <mesh geometry={edge} material={MAT.poolEdge} position={[0, y - 0.05, 0]} receiveShadow />}
        <mesh geometry={geo} material={MAT.water} position={[0, y + 0.02, 0]} />
      </group>
    )
  const mat = area.kind === 'garden' ? MAT.grass : area.kind === 'yard' ? MAT.paving : MAT.deck
  return <mesh geometry={geo} material={mat} position={[0, y + (area.kind === 'garden' ? -0.005 : 0.001), 0]} receiveShadow />
}

/* ---------- tầng ---------- */

export interface FloorGroupProps {
  floor: Floor
  /** chiều cao tới sàn tầng trên (cho cầu thang), mm */
  rise: number
  showWalls: boolean
  wallMode: WallMode
  target: React.RefObject<THREE.Vector3>
  selectedRoomId: string | null
  onRoomClick?: (roomId: string, point: THREE.Vector3) => void
  onRoomDoubleClick?: (roomId: string, point: THREE.Vector3) => void
  /** vật liệu dùng chung của mẫu nhà: cửa, bậc thang, mặt ngoài (item 03) */
  finishes?: HouseDocument['finishes']
  /** hiện trần phòng (đứng trong nhà ở tầng này) */
  showCeiling?: boolean
}

export const FloorGroup = ({ floor, rise, showWalls, wallMode, target, selectedRoomId, onRoomClick, onRoomDoubleClick, finishes, showCeiling }: FloorGroupProps) => {
  const layouts = useMemo(() => wallSegments(floor), [floor])
  const outline = useMemo<Point[]>(() => {
    if (floor.outline && floor.outline.length >= 3) return floor.outline
    const pts = wallsOutline(floor)
    if (!pts.length) return []
    const b = bboxOf(pts)
    return [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]]
  }, [floor])

  return (
    <group>
      {outline.length >= 3 && <Slab outline={outline} elevation={floor.elevation} />}
      {floor.areas.map((a) => (
        <AreaMesh key={a.id} area={a} elevation={floor.elevation} />
      ))}
      {floor.rooms.map((r) => (
        <RoomFloor
          key={r.id}
          room={r}
          elevation={floor.elevation}
          highlighted={r.id === selectedRoomId}
          onClick={onRoomClick ? (e) => (e.stopPropagation(), onRoomClick(r.id, e.point)) : undefined}
          onDoubleClick={onRoomDoubleClick ? (e) => (e.stopPropagation(), onRoomDoubleClick(r.id, e.point)) : undefined}
        />
      ))}
      {showWalls && layouts.map((l) => <WallRun key={l.wall.id} layout={l} elevation={floor.elevation} mode={wallMode} target={target} rooms={floor.rooms} finishes={finishes} />)}
      {showCeiling && showWalls && floor.rooms.map((r) => <RoomCeiling key={r.id} room={r} top={floor.elevation + floor.height} />)}
      {floor.stairs.map((s) => (
        <StairMesh key={s.id} stair={s} elevation={floor.elevation} rise={rise} materialId={finishes?.stair} />
      ))}
    </group>
  )
}
