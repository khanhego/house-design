import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { houseBounds } from '../data/houses'
import type { House } from '../data/types'
import { Furniture, type HoverInfo } from './Furniture'
import { Floor, Walls, WALL_H, type WallMode } from './Structure'

export type ViewMode = 'orbit' | 'inside'

export interface SceneProps {
  house: House
  roomId: string | null
  viewMode: ViewMode
  wallMode: WallMode
  night: boolean
  autoRotate: boolean
  selectedId: string | null
  variants: Record<string, string>
  onSelect: (id: string | null) => void
  onFocusRoom: (id: string | null) => void
}

const Lights = ({ house, night }: { house: House; night: boolean }) => {
  const b = houseBounds(house)
  const span = Math.max(b.w, b.d)
  return (
    <>
      <color attach="background" args={[night ? '#1a1e28' : '#ebe7e0']} />
      <fog attach="fog" args={[night ? '#1a1e28' : '#ebe7e0', span * 3, span * 6]} />
      <hemisphereLight args={[night ? '#5a6a90' : '#fffaf0', night ? '#20232b' : '#b9ab98', night ? 0.25 : 1.1]} />
      <directionalLight
        position={[b.cx + span * 0.6, span * 1.2, b.cz + span * 0.4]}
        intensity={night ? 0.25 : 2.2}
        color={night ? '#9fb2ff' : '#fff3e0'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-far={span * 4}
      >
        <object3D attach="target" position={[b.cx, 0, b.cz]} />
      </directionalLight>
      {night &&
        house.rooms.map((r) => {
          const [x, z, w, d] = r.rect
          return (
            <pointLight
              key={r.id}
              position={[x + w / 2, WALL_H - 0.3, z + d / 2]}
              intensity={Math.max(w * d, 6) * 0.9}
              distance={Math.max(w, d) * 1.6}
              color="#ffcf91"
            />
          )
        })}
    </>
  )
}

/** Điều khiển camera: di chuyển mượt giữa toàn cảnh, từng phòng và chế độ đứng trong phòng. */
const CameraRig = ({ house, roomId, viewMode, autoRotate, target }: Pick<SceneProps, 'house' | 'roomId' | 'viewMode' | 'autoRotate'> & { target: React.RefObject<THREE.Vector3> }) => {
  const ref = useRef<CameraControls>(null)
  // Màn hình dọc (mobile) cần lùi camera xa hơn để thấy trọn nhà
  const aspect = useThree((st) => st.size.width / st.size.height)
  const k = Math.max(1, 1.1 / aspect)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const room = house.rooms.find((r) => r.id === roomId)
    const b = houseBounds(house)

    if (viewMode === 'inside') {
      const [x, z, w, d] = room?.rect ?? [b.minX, b.minZ, b.w, b.d]
      const cx = x + w / 2
      const cz = z + d / 2
      c.minDistance = 0
      c.maxPolarAngle = Math.PI
      c.azimuthRotateSpeed = -0.35
      c.polarRotateSpeed = -0.35
      c.dollySpeed = 0
      c.truckSpeed = 0
      // Đứng ở góc phòng nhìn về phía tâm
      const ex = x + w * 0.85
      const ez = z + d * 0.85
      c.setLookAt(ex, 1.6, ez, cx, 1.2, cz, true).then(() => {
        const dir = new THREE.Vector3(cx - ex, 1.2 - 1.6, cz - ez).normalize().multiplyScalar(0.05)
        c.setLookAt(ex, 1.6, ez, ex + dir.x, 1.6 + dir.y, ez + dir.z, false)
      })
      return
    }

    c.minDistance = 1.5
    c.maxDistance = 45
    c.maxPolarAngle = Math.PI / 2.15
    c.azimuthRotateSpeed = 1
    c.polarRotateSpeed = 1
    c.dollySpeed = 1
    c.truckSpeed = 1

    if (room) {
      const [x, z, w, d] = room.rect
      const cx = x + w / 2
      const cz = z + d / 2
      const s = Math.max(w, d)
      c.setLookAt(cx + s * 0.75 * k, (s * 1.05 + 1.8) * k, cz + s * 0.95 * k, cx, 0.6, cz, true)
    } else {
      const s = Math.max(b.w, b.d)
      c.setLookAt(b.cx + s * 0.55 * k, s * 0.95 * k, b.cz + s * 0.95 * k, b.cx, 0, b.cz, true)
    }
  }, [house, roomId, viewMode, k])

  useFrame((_, dt) => {
    const c = ref.current
    if (!c) return
    c.getTarget(target.current)
    if (autoRotate && viewMode === 'orbit' && !c.active) c.azimuthAngle += dt * 0.15
  })

  return <CameraControls ref={ref} makeDefault smoothTime={0.35} />
}

const Scene = (props: SceneProps) => {
  const { house, roomId, viewMode, wallMode, night, selectedId, variants, onSelect, onFocusRoom } = props
  const target = useRef(new THREE.Vector3())
  const b = useMemo(() => houseBounds(house), [house])
  const [hover, setHover] = useState<HoverInfo | null>(null)

  return (
    <>
      <Lights house={house} night={night} />
      <CameraRig {...props} target={target} />

      <mesh position={[b.cx, -0.02, b.cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={() => onSelect(null)}>
        <circleGeometry args={[Math.max(b.w, b.d) * 2.5, 64]} />
        <meshStandardMaterial color={night ? '#2a2e38' : '#dcd6cc'} roughness={1} />
      </mesh>
      {/* Đế nhà */}
      <mesh position={[b.cx, -0.01, b.cz]} receiveShadow>
        <boxGeometry args={[b.w + 0.6, 0.02, b.d + 0.6]} />
        <meshStandardMaterial color={night ? '#3a3e48' : '#c9c1b4'} roughness={1} />
      </mesh>

      {house.rooms.map((r) => (
        <Floor key={`${house.id}-${r.id}`} room={r} onFocus={() => onFocusRoom(r.id)} />
      ))}
      <Walls house={house} mode={viewMode === 'inside' ? 'full' : wallMode} target={target} />

      {house.rooms.flatMap((r) =>
        r.placements.map((pl) => (
          <Furniture
            key={`${house.id}-${pl.id}`}
            room={r}
            placement={pl}
            variantId={variants[pl.id]}
            selected={selectedId === pl.id}
            onSelect={onSelect}
            onHover={setHover}
          />
        )),
      )}

      {/* Html luôn được mount, chỉ ẩn/hiện, để tránh unmount root React giữa lúc render */}
      <Html position={hover?.pos ?? [0, 0, 0]} center pointerEvents="none" zIndexRange={[20, 0]}>
        <div className={hover && hover.name ? 'tag' : 'tag hidden'}>{hover?.name}</div>
      </Html>
      {house.rooms.map((r) => {
        const [x, z, w, d] = r.rect
        return (
          <Html key={r.id} position={[x + w / 2, WALL_H + 0.4, z + d / 2]} center zIndexRange={[10, 0]}>
            <button className={viewMode === 'orbit' && !roomId ? 'room-pin' : 'room-pin hidden'} onClick={() => onFocusRoom(r.id)}>
              {r.name}
            </button>
          </Html>
        )
      })}
    </>
  )
}

export const HouseScene = (props: SceneProps) => (
  <Canvas
    shadows
    dpr={[1, 2]}
    camera={{ fov: 45, position: [18, 14, 18], near: 0.05, far: 300 }}
    onPointerMissed={() => props.onSelect(null)}
  >
    <Scene {...props} />
  </Canvas>
)
