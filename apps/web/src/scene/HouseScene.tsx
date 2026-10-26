import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, Html, Sky } from '@react-three/drei'
import * as THREE from 'three'
import { bboxOf, pointInPolygon, roomLabelPoint, sortedFloors, stairObstacles, wallsOutline } from '@hd/core'
import type { Floor, HouseDocument, ModelRef, Point, Snapshot } from '@hd/core'
import { FloorGroup } from './FloorGroup.tsx'
import type { WallMode } from './FloorGroup.tsx'
import { FloorItems } from './Items.tsx'
import { EnvironmentLight } from './environment.tsx'
import { GlbModel } from './GlbModel.tsx'
import { MAT } from './materials.ts'
import { M } from './units.ts'
import { Avatar, EYE_HEIGHT, newAvatarState } from './Avatar.tsx'
import type { AvatarState } from './Avatar.tsx'
import { bestSpot, blockersOf, furnitureBlockers, navGridOf, nearestFreeIn, openHeading, pathTo, portalsOf, stairEnd, walkStep } from './walk.ts'
import { stepTowards } from './walk.ts'
import type { Blocker, P2, Portal } from './walk.ts'
import { useWalker } from './physics/useWalker.ts'
import { SurfaceContext, useSurfaceKit } from './surfaces.ts'
import type { Quality } from './surfaces.ts'
import { sunColor, sunFor } from './sun.ts'
import type { V3, Walker } from './physics/walker.ts'

export type ViewMode = 'orbit' | 'facade' | 'inside'
export type { WallMode }

export interface SceneData {
  document: HouseDocument
  resolved: Snapshot['resolved']
}

export interface HouseSceneProps {
  data: SceneData
  /** id tầng đang xem hoặc 'all' (Cả nhà) */
  floorId: string
  roomId: string | null
  mode: ViewMode
  wallMode: WallMode
  night: boolean
  selectedItemId: string | null
  variants: Record<string, string>
  autoRotate?: boolean
  hoverLabel?: string | null
  hoverItemId?: string | null
  lowPower?: boolean
  onSelectItem: (id: string | null) => void
  onHoverItem: (id: string | null) => void
  onSelectRoom: (floorId: string, roomId: string) => void
  onPickModelNode?: (floorId: string | null, nodeName: string) => void
  onReady?: () => void
  /** điều khiển camera từ nút trên giao diện */
  cameraApi?: React.RefObject<CameraApi | null>
  /** người mẫu bước lên / rời cầu thang (chế độ Đứng trong phòng) */
  onStair?: (o: StairOption) => void
  /** chất lượng hiển thị (item 03, FR-13.15): nhẹ = ảnh vân 256, không bóng; đẹp = ảnh 1024 tải sau, bóng 4096 */
  quality?: Quality
}

export interface HouseBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  cx: number
  cy: number
  w: number
  d: number
  top: number
}

const floorPoints = (f: Floor): Point[] => [
  ...wallsOutline(f),
  ...(f.outline ?? []),
  ...f.rooms.flatMap((r) => r.polygon),
  ...f.areas.flatMap((a) => a.polygon),
]

export const houseBounds = (doc: HouseDocument): HouseBounds => {
  const pts = doc.floors.flatMap(floorPoints)
  const b = pts.length ? bboxOf(pts) : { minX: 0, minY: 0, maxX: 10000, maxY: 10000 }
  const top = doc.floors.reduce((m, f) => Math.max(m, f.elevation + f.height), 3000)
  return { ...b, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, w: b.maxX - b.minX, d: b.maxY - b.minY, top }
}

/* ---------- ánh sáng ---------- */

const Lights = ({ bounds, night, floor, lowPower, northDeg, hour, quality }: { bounds: HouseBounds; night: boolean; floor: Floor | null; lowPower: boolean; northDeg?: number; hour?: number; quality: Quality }) => {
  const span = Math.max(M(bounds.w), M(bounds.d), 8)
  const cx = M(bounds.cx)
  const cz = M(bounds.cy)
  const lamps = useMemo(() => {
    if (!night) return []
    const fl = floor ? [floor] : []
    return fl.flatMap((f) =>
      f.rooms.slice(0, 10).map((r) => {
        const [x, y] = roomLabelPoint(r.polygon)
        return { id: r.id, pos: [M(x), M(f.elevation + f.height - 300), M(y)] as [number, number, number] }
      }),
    )
  }, [night, floor])
  // nắng theo hướng nhà + giờ (FR-13.12): vệt nắng qua cửa sổ đúng phía, đổi theo giờ
  const sun = useMemo(() => sunFor(northDeg, hour), [northDeg, hour])
  const far = span * 1.6
  const sunPos: [number, number, number] = [cx + sun.dir[0] * far, Math.max(1.5, sun.dir[1] * far), cz + sun.dir[2] * far]
  const shadows = !lowPower && quality === 'full'
  return (
    <>
      <color attach="background" args={[night ? '#1a1e28' : '#dfe6ec']} />
      <fog attach="fog" args={[night ? '#1a1e28' : '#dfe6ec', span * 3.5, span * 8]} />
      {!night && <Sky distance={450} sunPosition={[sun.dir[0], Math.max(0.02, sun.dir[1]), sun.dir[2]]} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.8} />}
      <EnvironmentLight intensity={night ? 0.1 : 0.35} />
      <hemisphereLight args={[night ? '#5a6a90' : '#fbf6ee', night ? '#20232b' : '#b3a691', night ? 0.22 : 0.42]} />
      <directionalLight
        position={sunPos}
        intensity={night ? 0.2 : 0.4 + 2.1 * sun.strength}
        color={night ? '#9fb2ff' : sunColor(sun.altitude)}
        castShadow={shadows}
        shadow-mapSize={quality === 'full' ? [4096, 4096] : [2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
        shadow-radius={4}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-far={span * 5}
      >
        <object3D attach="target" position={[cx, 0, cz]} />
      </directionalLight>
      {lamps.map((l) => (
        <pointLight key={l.id} position={l.pos} intensity={5} distance={7} color="#ffcf91" castShadow={false} />
      ))}
    </>
  )
}

/* ---------- camera ---------- */

/** Điều khiển camera từ giao diện (nút ＋ / − / về toàn cảnh). */
export interface CameraApi {
  /** 1 = lại gần, -1 = lùi xa — một nấc */
  zoom: (dir: 1 | -1) => void
  /** giữ nút: zoom liên tục theo chiều `dir`; 0 = dừng */
  hold: (dir: 1 | -1 | 0) => void
  reset: () => void
  /** nhấp đúp sàn: bay lại gần điểm đó, giữ hướng nhìn */
  focus?: (p: THREE.Vector3) => void
  /** lần chuyển tầng kế tiếp: đặt người mẫu gần điểm này (m) — đi cầu thang */
  arriveAt?: (p: P2) => void
}

/** Người mẫu đang đứng trên cầu thang: có thể lên / xuống tầng nào. */
export type StairOption = {
  up?: { floorId: string; name: string; arrive: P2 }
  down?: { floorId: string; name: string; arrive: P2 }
} | null

const FOV_ORBIT = 45
const FOV_INSIDE = 60
/** tâm nhìn ở góc người thứ ba: ngang vai (m) */
const FOLLOW_H = 1.2
/** khoảng lùi mặc định của camera sau lưng người mẫu (m) — vừa phòng ở Việt Nam (3–5 m) */
const FOLLOW_DIST = 2.8
const WALK_SPEED = 1.4
const RUN_SPEED = 2.6
/** rad/s khi xoay bằng phím */
const TURN_SPEED = 1.9

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

const CameraRig = ({ doc, bounds, floor, roomId, mode, autoRotate, target, walkGoal, walkPath3, walker, avatar, blockers, portals, api, rig, suppressTeleport, onEnterRoom, onStair }: {
  doc: HouseDocument
  bounds: HouseBounds
  floor: Floor | null
  roomId: string | null
  mode: ViewMode
  autoRotate: boolean
  target: React.RefObject<THREE.Vector3>
  /** các điểm rẽ còn lại của đường đang đi (bấm sàn để đi tới) */
  walkGoal: React.RefObject<P2[] | null>
  /** đường đi trên navmesh (bộ vật lý) */
  walkPath3: React.RefObject<V3[] | null>
  /** người mẫu vật lý (null khi chưa nạp xong → đi theo mặt bằng 2D) */
  walker: Walker | null
  avatar: React.RefObject<AvatarState>
  blockers: Blocker[]
  portals: Portal[]
  api?: React.RefObject<CameraApi | null>
  rig: React.RefObject<CameraApi | null>
  suppressTeleport: React.RefObject<boolean>
  onEnterRoom: (floorId: string, roomId: string) => void
  onStair?: (o: StairOption) => void
}) => {
  const ref = useRef<CameraControls>(null)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const aspect = useThree((s) => s.size.width / s.size.height)
  const k = Math.max(1, 1.1 / aspect)
  const firstRun = useRef(true)
  const keys = useRef(new Set<string>())
  const [resetTick, setResetTick] = useState(0)
  const roomCheck = useRef(0)
  const holdDir = useRef<1 | -1 | 0>(0)
  const arrive = useRef<P2 | null>(null)
  const lastStair = useRef('')
  const stall = useRef(0)
  /** độ dài cần lò xo camera đang dùng (m) — thu vào ngay, bung ra từ từ */
  const arm = useRef(0)
  /** 0 = góc nhìn thứ ba, 1 = góc nhìn thứ nhất (khi camera bị ép sát) */
  const fpBlend = useRef(0)
  const fpOn = useRef(false)
  const dbg = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug3d')
  /** bộ vật lý đã nhận vị trí hiện tại của người mẫu chưa */
  const synced = useRef<Walker | null>(null)
  const insideFloor = floor ?? sortedFloors(doc)[0] ?? null
  const span = Math.max(M(bounds.w), M(bounds.d), M(bounds.top), 8)

  // đặt camera sau lưng người mẫu, nhìn theo hướng người
  const followBehind = (smooth: boolean, dist = FOLLOW_DIST) => {
    const c = ref.current
    const a = avatar.current
    if (!c || !a) return
    const t = new THREE.Vector3(a.pos.x, a.pos.y + FOLLOW_H, a.pos.z)
    const back = new THREE.Vector3(-Math.sin(a.heading), 0, -Math.cos(a.heading))
    const eye = t.clone().addScaledVector(back, dist).add(new THREE.Vector3(0, 1.1, 0))
    void c.setLookAt(eye.x, eye.y, eye.z, t.x, t.y, t.z, smooth)
  }

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const smooth = !firstRun.current
    firstRun.current = false
    const room = floor?.rooms.find((r) => r.id === roomId) ?? null
    const elev = floor ? M(floor.elevation) : 0

    if (mode === 'inside') {
      const f = insideFloor
      const a = avatar.current
      if (!f || !a) return
      c.minDistance = 0.2
      c.maxDistance = 6
      c.minPolarAngle = Math.PI * 0.12
      c.maxPolarAngle = Math.PI * 0.62
      c.azimuthRotateSpeed = 0.55
      c.polarRotateSpeed = 0.45
      c.dollySpeed = 1
      c.truckSpeed = 0
      c.dollyToCursor = false
      c.infinityDolly = false
      c.boundaryEnclosesCamera = false
      c.setBoundary(undefined)
      // camera không lọt ra sau tường
      const walls: THREE.Object3D[] = []
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === MAT.wall) walls.push(o)
      })
      c.colliderMeshes = walls
      // đi bộ sang phòng khác thì không dịch chuyển người
      if (suppressTeleport.current) {
        suppressTeleport.current = false
        return
      }
      // vừa đi cầu thang sang tầng này: đứng ở đầu/chân cầu thang, trong một phòng
      if (arrive.current) {
        const areas = [...f.rooms.map((r) => r.polygon), ...f.areas.map((x) => x.polygon)].map((poly) => poly.map(([px, py]) => [M(px), M(py)] as P2))
        const [x, z] = nearestFreeIn(arrive.current, blockers, areas)
        arrive.current = null
        a.pos.set(x, M(f.elevation), z)
        walker?.teleport({ x, y: M(f.elevation), z })
        walkPath3.current = null
        a.heading = openHeading([x, z], blockers)
        a.speed = 0
        walkGoal.current = null
        followBehind(smooth)
        return
      }
      const r = room ?? f.rooms[0]
      if (!r) return
      const [lx, ly] = roomLabelPoint(r.polygon)
      const [x, z] = bestSpot(r.polygon.map(([px, py]) => [M(px), M(py)] as P2), [M(lx), M(ly)], blockers)
      // nhìn về hướng thoáng nhất để vừa vào là thấy phòng và đi được ngay
      a.pos.set(x, M(f.elevation), z)
      walker?.teleport({ x, y: M(f.elevation), z })
      walkPath3.current = null
      a.heading = openHeading([x, z], blockers)
      a.speed = 0
      walkGoal.current = null
      followBehind(smooth)
      return
    }

    c.colliderMeshes = []
    c.minDistance = 0.8
    c.maxDistance = Math.max(20, span * 2.6)
    c.minPolarAngle = 0
    c.maxPolarAngle = Math.PI / 2.1
    c.azimuthRotateSpeed = 1
    c.polarRotateSpeed = 1
    c.dollySpeed = 1.4
    c.truckSpeed = 1
    // cuộn chuột phóng to đúng chỗ con trỏ đang chỉ; chạm khoảng cách tối thiểu thì đi tiếp tới trước (không bị kẹt)
    c.dollyToCursor = true
    c.infinityDolly = true
    // giữ camera trong khối bao quanh nhà, không chui xuống dưới mặt đất khi cuộn liên tục
    const pad = span * 1.5
    c.boundaryEnclosesCamera = true
    c.setBoundary(new THREE.Box3(
      new THREE.Vector3(M(bounds.minX) - pad, 0.25, M(bounds.minY) - pad),
      new THREE.Vector3(M(bounds.maxX) + pad, M(bounds.top) + span * 2.6, M(bounds.maxY) + pad),
    ))

    if (mode === 'facade') {
      const s = Math.max(M(bounds.w), M(bounds.top))
      const midY = M(bounds.top) * 0.45
      void c.setLookAt(M(bounds.cx) + s * 0.25, midY + 1.2, M(bounds.minY) - s * 1.25 * k, M(bounds.cx), midY, M(bounds.cy), smooth)
      return
    }
    if (room && floor) {
      const rb = bboxOf(room.polygon)
      const s = Math.max(M(rb.maxX - rb.minX), M(rb.maxY - rb.minY), 3)
      const [x, y] = roomLabelPoint(room.polygon)
      void c.setLookAt(M(x) + s * 0.7 * k, elev + (s * 1.05 + 2) * k, M(y) + s * 0.95 * k, M(x), elev + 0.5, M(y), smooth)
      return
    }
    if (floor) {
      const pts = floorPoints(floor)
      const fb = bboxOf(pts)
      const s = Math.max(M(fb.maxX - fb.minX), M(fb.maxY - fb.minY))
      const cx = M((fb.minX + fb.maxX) / 2)
      const cz = M((fb.minY + fb.maxY) / 2)
      void c.setLookAt(cx + s * 0.55 * k, elev + s * 0.95 * k, cz + s * 0.95 * k, cx, elev, cz, smooth)
      return
    }
    const def = doc.viewpoints.find((v) => v.isDefault)
    if (def) {
      void c.setLookAt(M(def.position[0]), M(def.position[2]), M(def.position[1]), M(def.target[0]), M(def.target[2]), M(def.target[1]), smooth)
      return
    }
    const s = Math.max(M(bounds.w), M(bounds.d), M(bounds.top))
    void c.setLookAt(M(bounds.cx) + s * 0.6 * k, M(bounds.top) * 0.4 + s * 0.8 * k, M(bounds.cy) - s * 1.0 * k, M(bounds.cx), M(bounds.top) * 0.3, M(bounds.cy), smooth)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, bounds, floor, roomId, mode, k, resetTick, blockers])

  // người mẫu vật lý vừa nạp xong: đặt vào đúng chỗ đang đứng; camera tự tránh tường bằng cần lò xo (không dùng collider của camera-controls)
  // (đặt người vào bộ vật lý làm ngay trong vòng khung hình — xem `synced` — vì khung hình có thể chạy trước effect)
  useEffect(() => {
    const c = ref.current
    if (walker && mode === 'inside' && c) c.colliderMeshes = []
  }, [walker, mode])

  // gỡ lỗi (?debug3d=1): cho kiểm thử tự động đọc khoảng cách / vị trí camera
  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug3d')) (window as unknown as { __hdControls?: CameraControls | null }).__hdControls = ref.current
  }, [])

  // nút ＋ / − / về toàn cảnh
  useEffect(() => {
    const v: CameraApi = {
      zoom: (dir) => {
        const c = ref.current
        if (!c) return
        void c.dolly(dir * Math.max(0.5, c.distance * 0.4), true)
      },
      hold: (dir) => void (holdDir.current = dir),
      arriveAt: (p) => void (arrive.current = p),
      reset: () => (mode === 'inside' ? followBehind(true) : setResetTick((t) => t + 1)),
      focus: (p) => {
        const c = ref.current
        if (!c || mode === 'inside') return
        const pos = c.getPosition(new THREE.Vector3())
        const dir = pos.clone().sub(target.current).normalize()
        const d = Math.max(3, c.distance * 0.45)
        const eye = p.clone().addScaledVector(dir, d)
        void c.setLookAt(eye.x, eye.y, eye.z, p.x, p.y, p.z, true)
      },
    }
    if (api) api.current = v
    rig.current = v
  })

  // phím W A S D / mũi tên để đi (chỉ khi Đứng trong phòng)
  useEffect(() => {
    if (mode !== 'inside') return
    const MOVE = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const kk = e.key.toLowerCase()
      if (!MOVE.includes(kk)) return
      if (kk.startsWith('arrow')) e.preventDefault()
      keys.current.add(kk)
      walkGoal.current = null
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    const blur = () => keys.current.clear()
    addEventListener('keydown', down)
    addEventListener('keyup', up)
    addEventListener('blur', blur)
    return () => {
      removeEventListener('keydown', down)
      removeEventListener('keyup', up)
      removeEventListener('blur', blur)
      keys.current.clear()
    }
  }, [mode, walkGoal])

  useFrame((_, dt) => {
    const c = ref.current
    if (!c) return
    c.getTarget(target.current)
    // giữ nút ＋/−: zoom liên tục, nhanh dần theo khoảng cách (≈ 1,6 lần mỗi giây)
    if (holdDir.current) void c.dolly(holdDir.current * Math.max(0.6, c.distance) * 1.3 * dt, false)
    // góc nhìn rộng hơn khi ở trong phòng để phòng không bị "chật"
    const fov = mode === 'inside' ? FOV_INSIDE : FOV_ORBIT
    if (!(mode === 'inside' && walker) && Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 4)
      camera.updateProjectionMatrix()
    }
    const a = avatar.current
    if (mode === 'inside' && a && insideFloor) {
      const pos = c.getPosition(new THREE.Vector3())
      const fwd = new THREE.Vector3(target.current.x - pos.x, 0, target.current.z - pos.z)
      if (fwd.lengthSq() < 1e-6) fwd.set(Math.sin(a.heading), 0, Math.cos(a.heading))
      fwd.normalize()
      const kb = keys.current
      // A/D, ←/→: xoay người (và camera) — W/S, ↑/↓: đi tới / lùi theo hướng nhìn
      const turn = (kb.has('a') || kb.has('arrowleft') ? 1 : 0) - (kb.has('d') || kb.has('arrowright') ? 1 : 0)
      if (turn) {
        void c.rotate(turn * TURN_SPEED * dt, 0, false)
        a.heading = Math.atan2(fwd.x, fwd.z)
      }
      const dirK = (kb.has('w') || kb.has('arrowup') ? 1 : 0) - (kb.has('s') || kb.has('arrowdown') ? 1 : 0)
      const speed = kb.has('shift') ? RUN_SPEED : WALK_SPEED
      let goal: P2 | null = null
      let faceFwd = false
      if (dirK) {
        const st = dirK * speed * dt * (dirK < 0 ? 0.6 : 1)
        goal = [a.pos.x + fwd.x * st, a.pos.z + fwd.z * st]
        faceFwd = true
      } else if (walkGoal.current?.length) {
        // đi theo đường đã tìm: tới điểm rẽ thì sang điểm kế
        const path = walkGoal.current
        let g = path[0]
        while (path.length > 1 && Math.hypot(g[0] - a.pos.x, g[1] - a.pos.z) < 0.08) (path.shift(), (g = path[0]))
        const dx = g[0] - a.pos.x
        const dz = g[1] - a.pos.z
        const d = Math.hypot(dx, dz)
        if (d < 0.05) walkGoal.current = null
        else {
          const st = Math.min(d, WALK_SPEED * dt)
          goal = [a.pos.x + (dx / d) * st, a.pos.z + (dz / d) * st]
        }
      }
      let moved = 0
      if (walker && synced.current !== walker) {
        walker.teleport({ x: a.pos.x, y: a.pos.y, z: a.pos.z })
        synced.current = walker
      }
      if (walker) {
        // bộ vật lý: trọng lực, leo cầu thang, trượt dọc tường, hỗ trợ qua cửa; bấm sàn → đi theo navmesh
        let vel = { x: 0, z: 0 }
        if (dirK) {
          const sp = dirK * speed * (dirK < 0 ? 0.6 : 1)
          vel = { x: fwd.x * sp, z: fwd.z * sp }
          walkPath3.current = null
        } else if (walkPath3.current?.length) {
          const path = walkPath3.current
          let q = path[0]
          while (path.length > 1 && Math.hypot(q.x - a.pos.x, q.z - a.pos.z) < 0.12 && Math.abs(q.y - a.pos.y) < 0.6) (path.shift(), (q = path[0]))
          const dx = q.x - a.pos.x
          const dz = q.z - a.pos.z
          const d = Math.hypot(dx, dz)
          if (d < 0.06 && path.length === 1) walkPath3.current = null
          else if (d > 1e-4) {
            const v = Math.min(WALK_SPEED, d / Math.max(dt, 1e-3))
            vel = { x: (dx / d) * v, z: (dz / d) * v }
          }
        }
        const before = { x: a.pos.x, y: a.pos.y, z: a.pos.z }
        walker.move(vel, dt)
        const p = walker.pos
        a.pos.set(p.x, p.y, p.z)
        moved = Math.hypot(p.x - before.x, p.z - before.z)
        if (moved > 1e-4) a.heading = faceFwd ? Math.atan2(fwd.x, fwd.z) : Math.atan2(p.x - before.x, p.z - before.z)
        // bị chặn hẳn ~0,75 s mới bỏ đường (khựng một nhịp khi bước từ dốc thang lên sàn thì vẫn đi tiếp)
        if (moved > 1e-3 || !(vel.x || vel.z)) stall.current = 0
        else if (walkPath3.current && ++stall.current > 45) (walkPath3.current = null), (stall.current = 0)
        if (moved > 1e-4 || Math.abs(p.y - before.y) > 1e-4) void c.moveTo(a.pos.x, a.pos.y + (c.distance < 0.8 ? EYE_HEIGHT : FOLLOW_H), a.pos.z, false)
      } else if (goal) {
        // đi bằng phím: có hỗ trợ đi qua cửa (không dính cạnh khung cửa khi đi chéo)
        const next = faceFwd
          ? walkStep([a.pos.x, a.pos.z], [fwd.x * Math.sign(dirK), fwd.z * Math.sign(dirK)], Math.hypot(goal[0] - a.pos.x, goal[1] - a.pos.z), blockers, portals)
          : stepTowards([a.pos.x, a.pos.z], goal, blockers)
        const ddx = next[0] - a.pos.x
        const ddz = next[1] - a.pos.z
        moved = Math.hypot(ddx, ddz)
        if (moved > 1e-4) {
          a.heading = faceFwd ? Math.atan2(fwd.x, fwd.z) : Math.atan2(ddx, ddz)
          a.pos.x = next[0]
          a.pos.z = next[1]
          // camera đi theo người, giữ nguyên góc nhìn
          void c.moveTo(a.pos.x, a.pos.y + (c.distance < 0.8 ? EYE_HEIGHT : FOLLOW_H), a.pos.z, false)
        } else walkGoal.current = null // chạm tường
      }
      a.speed += ((dt > 0 ? moved / dt : 0) - a.speed) * Math.min(1, dt * 8)
      // sát quá thì thành góc nhìn của chính người mẫu, tâm nhìn lên tầm mắt
      // camera bị tường ép sát lưng (hành lang hẹp) → tạm ẩn người mẫu thay vì che kín màn hình
      a.visible = c.distance > 0.6 && camera.position.distanceTo(target.current) > (walker ? 0.45 : 1.0)
      const wantH = a.pos.y + (c.distance < 0.8 ? EYE_HEIGHT : FOLLOW_H)
      if (!moved && Math.abs(target.current.y - wantH) > 0.01) void c.moveTo(a.pos.x, wantH, a.pos.z, true)
      // đi bộ sang phòng khác → chọn phòng đó (không dịch chuyển)
      roomCheck.current += dt
      if (roomCheck.current > 0.3) {
        roomCheck.current = 0
        const here: Point = [a.pos.x * 1000, a.pos.z * 1000]
        // leo cầu thang sang tầng khác (bộ vật lý): khi đã đứng trong một phòng của tầng đó thì chọn tầng + phòng đó
        const byY = walker ? [...sortedFloors(doc)].reverse().find((fl) => M(fl.elevation) <= a.pos.y + 0.4) : null
        const otherFloor = !!byY && byY.id !== insideFloor.id
        if (byY && otherFloor) {
          const r2 = byY.rooms.find((x) => pointInPolygon(here, x.polygon))
          if (r2) {
            suppressTeleport.current = true
            onEnterRoom(byY.id, r2.id)
          }
        }
        const r = otherFloor ? undefined : insideFloor.rooms.find((x) => pointInPolygon(here, x.polygon))
        if (r && r.id !== roomId) {
          suppressTeleport.current = true
          onEnterRoom(insideFloor.id, r.id)
        }
        // trên cầu thang → gợi ý lên / xuống tầng
        const up = insideFloor.stairs.find((st) => st.toFloorId && pointInPolygon(here, st.polygon))
        const down = doc.floors.flatMap((fl) => fl.stairs.filter((st) => st.toFloorId === insideFloor.id).map((st) => ({ fl, st }))).find((x) => pointInPolygon(here, x.st.polygon))
        const key = `${up?.toFloorId ?? ''}|${down?.fl.id ?? ''}`
        if (key !== lastStair.current) {
          lastStair.current = key
          const name = (id: string) => doc.floors.find((x) => x.id === id)?.name ?? ''
          onStair?.(
            key === '|'
              ? null
              : {
                  up: up?.toFloorId ? { floorId: up.toFloorId, name: name(up.toFloorId), arrive: stairEnd(up, 'top') } : undefined,
                  down: down ? { floorId: down.fl.id, name: down.fl.name, arrive: stairEnd(down.st, 'bottom') } : undefined,
                },
          )
        }
      }
    }
    // cần lò xo: camera dừng trước tường / kính / trần — không bao giờ lọt ra sau tường. Thu vào ngay khi bị chặn, bung ra
    // từ từ (không giật). Bị ép sát (phòng nhỏ, quay lưng vào tường gần) thì chuyển hẳn sang góc nhìn thứ nhất ở tầm mắt,
    // nhìn về phía trước — không còn cảnh camera dí vào lưng người mẫu làm khung nhìn hẹp
    if (mode === 'inside' && walker) {
      // camera-controls có lớp tránh va chạm riêng (đặt lại mỗi khi đổi phòng) — tắt, chỉ dùng cần lò xo của bộ vật lý
      if (c.colliderMeshes.length) c.colliderMeshes = []
      const t = target.current
      const want = camera.position.clone()
      const wantLen = want.distanceTo(t)
      const safe = walker.springArm({ x: t.x, y: t.y, z: t.z }, { x: want.x, y: want.y, z: want.z })
      const safeV = new THREE.Vector3(safe.x, safe.y, safe.z)
      const safeLen = safeV.distanceTo(t)
      arm.current = arm.current <= 0 || safeLen < arm.current ? safeLen : arm.current + (safeLen - arm.current) * Math.min(1, dt * 2.5)
      const back = safeV.sub(t).normalize()
      camera.position.copy(t).addScaledVector(back, arm.current)
      const av = avatar.current
      // có trễ: vào góc nhìn thứ nhất khi lùi được < 1,1 m, ra lại khi > 1,5 m (người dùng tự cuộn sát < 0,8 m thì giữ nguyên)
      const userClose = c.distance < 0.8
      if (!userClose && wantLen > 1.2) {
        if (!fpOn.current && safeLen < 1.1) fpOn.current = true
        else if (fpOn.current && safeLen > 1.5) fpOn.current = false
      } else fpOn.current = false
      fpBlend.current += ((fpOn.current ? 1 : 0) - fpBlend.current) * Math.min(1, dt * 8)
      const k = fpBlend.current
      if (dbg) (window as unknown as { __hdCam?: object }).__hdCam = { arm: arm.current, fp: k, want: wantLen, safe: safeLen, cd: c.distance }
      if (k > 0.001 && av) {
        const fwd = new THREE.Vector3(-back.x, 0, -back.z)
        if (fwd.lengthSq() < 1e-6) fwd.set(Math.sin(av.heading), 0, Math.cos(av.heading))
        fwd.normalize()
        const eye = new THREE.Vector3(av.pos.x, av.pos.y + EYE_HEIGHT, av.pos.z).addScaledVector(fwd, 0.12)
        camera.position.lerp(eye, k)
        camera.lookAt(t.clone().lerp(eye.clone().addScaledVector(fwd, 3).setY(eye.y - 0.15), k))
      }
      if (av) {
        // camera gần người thì làm mờ dần; góc nhìn thứ nhất thì ẩn hẳn
        av.opacity = userClose ? 1 : Math.max(0.3, Math.min(1, (arm.current - 0.6) / 0.8))
        if (k > 0.35) av.visible = false
      }
      const fovWant = FOV_INSIDE + 10 * k
      if (Math.abs(camera.fov - fovWant) > 0.05) {
        camera.fov += (fovWant - camera.fov) * Math.min(1, dt * 4)
        camera.updateProjectionMatrix()
      }
    } else arm.current = 0
    if (autoRotate && mode === 'orbit' && !c.active) c.azimuthAngle += dt * 0.12
  })

  return <CameraControls ref={ref} makeDefault smoothTime={0.22} draggingSmoothTime={0.08} />
}

const Ready = ({ onReady }: { onReady?: () => void }) => {
  const done = useRef(false)
  useFrame(() => {
    if (!done.current) {
      done.current = true
      onReady?.()
    }
  })
  return null
}

const Model = ({ data, modelRef, floorElevationM, wallMode, target, topClipY, floorId, onPick, selectedNode }: {
  data: SceneData
  modelRef: ModelRef
  floorElevationM: number
  wallMode: WallMode
  target: React.RefObject<THREE.Vector3>
  topClipY: number | null
  floorId: string | null
  onPick?: (floorId: string | null, nodeName: string) => void
  selectedNode?: string | null
}) => {
  const m = data.resolved.models[modelRef.modelAssetId]
  if (!m) return null
  return (
    <Suspense fallback={null}>
      <GlbModel
        url={m.url}
        modelRef={modelRef}
        floorElevationM={floorElevationM}
        wallMode={wallMode}
        target={target}
        topClipY={topClipY}
        selectedNode={selectedNode}
        onPickNode={onPick ? (name) => onPick(floorId, name) : undefined}
      />
    </Suspense>
  )
}

const SceneContent = (p: HouseSceneProps & { lowPower: boolean }) => {
  const { data, floorId, roomId, mode, wallMode, night, selectedItemId, variants } = p
  const quality: Quality = p.quality ?? (p.lowPower ? 'light' : 'full')
  // vật liệu thật (item 03): ảnh vân tải dần theo chất lượng
  const surfaces = useSurfaceKit(data.resolved.materials, quality)
  const doc = data.document
  const floors = useMemo(() => sortedFloors(doc), [doc])
  const bounds = useMemo(() => houseBounds(doc), [doc])
  const floor = floorId === 'all' ? null : floors.find((f) => f.id === floorId) ?? null
  const target = useRef(new THREE.Vector3())
  const walkGoal = useRef<P2[] | null>(null)
  const walkPath3 = useRef<V3[] | null>(null)
  const avatar = useRef<AvatarState>(newAvatarState())
  const suppressTeleport = useRef(false)
  const rig = useRef<CameraApi | null>(null)
  // gỡ lỗi: ?debug3d=1 cho phép đọc vị trí người mẫu từ trình duyệt (kiểm thử tự động)
  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug3d')) (window as unknown as { __hdAvatar?: AvatarState }).__hdAvatar = avatar.current
  }, [])
  const insideFloor = floor ?? floors[0] ?? null
  // tường + đồ nội thất chặn người mẫu
  const blockers = useMemo(() => (insideFloor ? [...blockersOf(insideFloor), ...furnitureBlockers(insideFloor, data.resolved.libraryItems), ...stairObstacles(insideFloor)] : []), [insideFloor, data.resolved.libraryItems])
  // người mẫu vật lý (Rapier + navmesh): nạp khi vào chế độ Đứng trong phòng
  const walker = useWalker(doc, data.resolved.libraryItems, mode === 'inside')
  const portals = useMemo(() => (insideFloor ? portalsOf(insideFloor) : []), [insideFloor])
  // lưới tìm đường — chỉ dựng khi đang đứng trong nhà
  const navGrid = useMemo(() => (mode === 'inside' && insideFloor ? navGridOf(insideFloor, blockers) : null), [mode, insideFloor, blockers])
  // gỡ lỗi (?debug3d=1): kiểm thử tự động cho người mẫu tự tìm đường tới (x, z)
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug3d')) return
    const win = window as unknown as { __hdWalkTo?: (x: number, z: number, y?: number) => number | null; __hdWalker?: Walker | null }
    win.__hdWalker = walker
    win.__hdWalkTo = (x, z, y) => {
      const a = avatar.current
      if (walker) {
        const path = walker.pathTo({ x, y: y ?? a.pos.y, z })
        walkPath3.current = path ? path.slice(1) : null
        return path ? path.length : null
      }
      const path = navGrid ? pathTo(navGrid, [a.pos.x, a.pos.z], [x, z]) : null
      walkGoal.current = path ? path.slice(1) : null
      return path ? path.length : null
    }
  }, [navGrid, walker])

  const visibleFloors = floor ? floors.filter((f) => f.elevation <= floor.elevation) : floors
  const effWallMode: WallMode = mode === 'inside' || mode === 'facade' || !floor ? 'full' : wallMode
  const topClipY = floor ? M(floor.elevation + floor.height) - 0.02 : null
  const hasWholeModel = !!doc.wholeModel
  const selectedNodeItem = useMemo(() => {
    for (const f of floors) for (const it of f.items) if (it.id === selectedItemId && 'modelNode' in it.source) return it.source.modelNode.nodeName
    return null
  }, [floors, selectedItemId])

  const rise = (f: Floor) => {
    const next = floors.find((x) => x.elevation > f.elevation)
    return next ? next.elevation - f.elevation : f.height
  }

  const onRoomClick = (f: Floor) => (roomId: string, point: THREE.Vector3) => {
    if (mode === 'inside') {
      // bấm sàn → người tự tìm đường đi tới đó, qua cửa, né đồ (không dịch chuyển tức thì)
      const a = avatar.current
      if (walker) {
        const path3 = walker.pathTo({ x: point.x, y: point.y, z: point.z })
        walkPath3.current = path3 ? path3.slice(1) : null
        walkGoal.current = null
      } else {
        const path = navGrid ? pathTo(navGrid, [a.pos.x, a.pos.z], [point.x, point.z]) : null
        walkGoal.current = path ? path.slice(1) : [[point.x, point.z]]
      }
      if (roomId !== p.roomId) suppressTeleport.current = true
      p.onSelectRoom(f.id, roomId)
      return
    }
    p.onSelectItem(null)
    p.onSelectRoom(f.id, roomId)
  }

  const pickNode = p.onPickModelNode
    ? p.onPickModelNode
    : (fid: string | null, name: string) => {
        const f = floors.find((x) => x.id === fid) ?? floors[0]
        const it = floors.flatMap((x) => x.items).find((i) => 'modelNode' in i.source && i.source.modelNode.nodeName === name)
        if (it) p.onSelectItem(it.id)
        void f
      }

  return (
    <SurfaceContext.Provider value={surfaces}>
      <Lights bounds={bounds} night={night} floor={floor ?? floors[floors.length - 1] ?? null} lowPower={p.lowPower} northDeg={doc.lighting.northDeg} hour={doc.lighting.hour} quality={quality} />
      <CameraRig
        doc={doc} bounds={bounds} floor={floor} roomId={roomId} mode={mode} autoRotate={!!p.autoRotate} target={target}
        walkGoal={walkGoal} walkPath3={walkPath3} walker={walker} avatar={avatar} blockers={blockers} portals={portals} api={p.cameraApi} rig={rig} suppressTeleport={suppressTeleport}
        onEnterRoom={(fid, rid) => p.onSelectRoom(fid, rid)}
        onStair={p.onStair}
      />
      {mode === 'inside' && <Avatar state={avatar} />}

      <mesh position={[M(bounds.cx), -0.16, M(bounds.cy)]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={night ? MAT.groundNight : MAT.ground} onClick={() => p.onSelectItem(null)}>
        <circleGeometry args={[Math.max(M(bounds.w), M(bounds.d)) * 3 + 20, 64]} />
      </mesh>

      {visibleFloors.map((f) => {
        const isCurrent = !floor || f.id === floor.id
        const hasModel = !!f.modelRef && !!data.resolved.models[f.modelRef.modelAssetId]
        return (
          <group key={f.id}>
            <FloorGroup
              floor={f}
              rise={rise(f)}
              showWalls={!hasModel && !hasWholeModel}
              wallMode={isCurrent ? effWallMode : 'full'}
              target={target}
              selectedRoomId={isCurrent ? roomId : null}
              onRoomClick={isCurrent ? onRoomClick(f) : undefined}
              onRoomDoubleClick={isCurrent && mode !== 'inside' ? (_r, pt) => rig.current?.focus?.(pt) : undefined}
              finishes={doc.finishes}
              showCeiling={mode === 'inside' && isCurrent}
            />
            {f.modelRef && (
              <Model data={data} modelRef={f.modelRef} floorElevationM={M(f.elevation)} wallMode={isCurrent ? effWallMode : 'full'} target={target} topClipY={null} floorId={f.id} onPick={pickNode} selectedNode={selectedNodeItem} />
            )}
            <FloorItems floor={f} libraryItems={data.resolved.libraryItems} variants={variants} selectedItemId={selectedItemId} onSelect={p.onSelectItem} onHover={p.onHoverItem} quality={quality} />
          </group>
        )
      })}

      {doc.wholeModel && (
        <Model data={data} modelRef={doc.wholeModel} floorElevationM={floor ? M(floor.elevation) : 0} wallMode={effWallMode} target={target} topClipY={topClipY} floorId={null} onPick={pickNode} selectedNode={selectedNodeItem} />
      )}
      {doc.exterior?.modelRef && (!floor || floor === floors[0]) && (
        <Model data={data} modelRef={doc.exterior.modelRef} floorElevationM={0} wallMode="full" target={target} topClipY={topClipY} floorId={null} />
      )}

      {p.hoverLabel && p.hoverItemId && <HoverLabel floors={floors} itemId={p.hoverItemId} label={p.hoverLabel} data={data} />}
      <Ready onReady={p.onReady} />
    </SurfaceContext.Provider>
  )
}

const HoverLabel = ({ floors, itemId, label, data }: { floors: Floor[]; itemId: string; label: string; data: SceneData }) => {
  for (const f of floors) {
    const it = f.items.find((i) => i.id === itemId)
    if (!it) continue
    const lib = 'libraryItemId' in it.source ? data.resolved.libraryItems[it.source.libraryItemId] : null
    const h = lib ? lib.sizeMm[1] : 1000
    return (
      <Html position={[M(it.position[0]), M(f.elevation + h) + 0.25, M(it.position[1])]} center pointerEvents="none" zIndexRange={[20, 0]}>
        <div className="scene-tag">{label}</div>
      </Html>
    )
  }
  return null
}

export const isLowPower = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 860)

export const HouseScene = (p: HouseSceneProps) => {
  const lowPower = p.lowPower ?? isLowPower()
  return (
    <Canvas
      shadows={!lowPower}
      dpr={lowPower ? [1, 1.5] : [1, 2]}
      camera={{ fov: 45, position: [20, 16, 20], near: 0.05, far: 500 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onPointerMissed={() => p.onSelectItem(null)}
    >
      <SceneContent {...p} lowPower={lowPower} />
    </Canvas>
  )
}
