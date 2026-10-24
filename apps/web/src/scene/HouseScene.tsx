import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { bboxOf, roomLabelPoint, sortedFloors, wallsOutline } from '@hd/core'
import type { Floor, HouseDocument, ModelRef, Point, Snapshot } from '@hd/core'
import { FloorGroup } from './FloorGroup.tsx'
import type { WallMode } from './FloorGroup.tsx'
import { FloorItems } from './Items.tsx'
import { GlbModel } from './GlbModel.tsx'
import { MAT } from './materials.ts'
import { M } from './units.ts'

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

const Lights = ({ bounds, night, floor, lowPower }: { bounds: HouseBounds; night: boolean; floor: Floor | null; lowPower: boolean }) => {
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
  return (
    <>
      <color attach="background" args={[night ? '#1a1e28' : '#ebe7e0']} />
      <fog attach="fog" args={[night ? '#1a1e28' : '#ebe7e0', span * 3.5, span * 8]} />
      <hemisphereLight args={[night ? '#5a6a90' : '#fffaf0', night ? '#20232b' : '#b9ab98', night ? 0.3 : 1.15]} />
      <directionalLight
        position={[cx + span * 0.6, span * 1.3, cz - span * 0.5]}
        intensity={night ? 0.25 : 2.1}
        color={night ? '#9fb2ff' : '#fff3e0'}
        castShadow={!lowPower}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-far={span * 5}
      >
        <object3D attach="target" position={[cx, 0, cz]} />
      </directionalLight>
      {lamps.map((l) => (
        <pointLight key={l.id} position={l.pos} intensity={5} distance={7} color="#ffcf91" />
      ))}
    </>
  )
}

/* ---------- camera ---------- */

const CameraRig = ({ doc, bounds, floor, roomId, mode, autoRotate, target, walkTo }: {
  doc: HouseDocument
  bounds: HouseBounds
  floor: Floor | null
  roomId: string | null
  mode: ViewMode
  autoRotate: boolean
  target: React.RefObject<THREE.Vector3>
  walkTo: React.RefObject<THREE.Vector3 | null>
}) => {
  const ref = useRef<CameraControls>(null)
  const aspect = useThree((s) => s.size.width / s.size.height)
  const k = Math.max(1, 1.1 / aspect)
  const firstRun = useRef(true)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const smooth = !firstRun.current
    firstRun.current = false
    const room = floor?.rooms.find((r) => r.id === roomId) ?? null
    const elev = floor ? M(floor.elevation) : 0

    if (mode === 'inside') {
      const f = floor ?? sortedFloors(doc)[0]
      const r = room ?? f.rooms[0]
      if (!r) return
      // đứng ở 1/4 cuối phòng, nhìn về phía đầu phòng (nơi thường kê sofa / giường)
      const rb = bboxOf(r.polygon)
      const cx = (rb.minX + rb.maxX) / 2
      const eye = new THREE.Vector3(M(cx), M(f.elevation) + 1.6, M(rb.maxY - (rb.maxY - rb.minY) * 0.22))
      const look = new THREE.Vector3(M(cx), M(f.elevation) + 1.1, M(rb.minY))
      c.minDistance = 0
      c.maxDistance = 0.1
      c.maxPolarAngle = Math.PI * 0.95
      c.minPolarAngle = Math.PI * 0.05
      c.azimuthRotateSpeed = -0.35
      c.polarRotateSpeed = -0.35
      c.dollySpeed = 0
      c.truckSpeed = 0
      const dir = look.clone().sub(eye).normalize().multiplyScalar(0.05)
      void c.setLookAt(eye.x, eye.y, eye.z, eye.x + dir.x, eye.y + dir.y, eye.z + dir.z, smooth)
      return
    }

    c.minDistance = 1.5
    c.maxDistance = 80
    c.minPolarAngle = 0
    c.maxPolarAngle = Math.PI / 2.1
    c.azimuthRotateSpeed = 1
    c.polarRotateSpeed = 1
    c.dollySpeed = 1
    c.truckSpeed = 1

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
  }, [doc, bounds, floor, roomId, mode, k])

  useFrame((_, dt) => {
    const c = ref.current
    if (!c) return
    c.getTarget(target.current)
    if (mode === 'inside' && walkTo.current) {
      const p = walkTo.current
      walkTo.current = null
      const pos = c.getPosition(new THREE.Vector3())
      const dir = target.current.clone().sub(pos)
      void c.setLookAt(p.x, pos.y, p.z, p.x + dir.x, pos.y + dir.y, p.z + dir.z, true)
    }
    if (autoRotate && mode === 'orbit' && !c.active) c.azimuthAngle += dt * 0.12
  })

  return <CameraControls ref={ref} makeDefault smoothTime={0.35} />
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
  const doc = data.document
  const floors = useMemo(() => sortedFloors(doc), [doc])
  const bounds = useMemo(() => houseBounds(doc), [doc])
  const floor = floorId === 'all' ? null : floors.find((f) => f.id === floorId) ?? null
  const target = useRef(new THREE.Vector3())
  const walkTo = useRef<THREE.Vector3 | null>(null)

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
      walkTo.current = point.clone()
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
    <>
      <Lights bounds={bounds} night={night} floor={floor ?? floors[floors.length - 1] ?? null} lowPower={p.lowPower} />
      <CameraRig doc={doc} bounds={bounds} floor={floor} roomId={roomId} mode={mode} autoRotate={!!p.autoRotate} target={target} walkTo={walkTo} />
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
            />
            {f.modelRef && (
              <Model data={data} modelRef={f.modelRef} floorElevationM={M(f.elevation)} wallMode={isCurrent ? effWallMode : 'full'} target={target} topClipY={null} floorId={f.id} onPick={pickNode} selectedNode={selectedNodeItem} />
            )}
            <FloorItems floor={f} libraryItems={data.resolved.libraryItems} variants={variants} selectedItemId={selectedItemId} onSelect={p.onSelectItem} onHover={p.onHoverItem} />
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
    </>
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
