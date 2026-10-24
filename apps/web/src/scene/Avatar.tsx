import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/** Trạng thái người mẫu dùng chung giữa camera và hình người (mét). */
export interface AvatarState {
  pos: THREE.Vector3
  heading: number
  /** tốc độ hiện tại m/s — điều khiển dáng bước */
  speed: number
  visible: boolean
}

export const newAvatarState = (): AvatarState => ({ pos: new THREE.Vector3(), heading: 0, speed: 0, visible: true })

/* Tỷ lệ người trưởng thành 1,70 m: chân 0,86 · thân 0,52 · đầu đỉnh 1,70 · vai 0,42. */
const H = { hip: 0.9, shoulder: 1.42, head: 1.585, headR: 0.115, leg: 0.86, arm: 0.6, shoulderW: 0.21 }

/** Người mẫu đơn giản đúng tỷ lệ để cảm nhận kích thước phòng (chế độ Đứng trong phòng). */
export const Avatar = ({ state }: { state: React.RefObject<AvatarState> }) => {
  const root = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const phase = useRef(0)
  const mat = useMemo(
    () => ({
      skin: new THREE.MeshStandardMaterial({ color: '#d9b08c', roughness: 0.7 }),
      shirt: new THREE.MeshStandardMaterial({ color: '#4f6d8a', roughness: 0.85 }),
      pants: new THREE.MeshStandardMaterial({ color: '#33363d', roughness: 0.9 }),
      shoe: new THREE.MeshStandardMaterial({ color: '#1f1f22', roughness: 0.6 }),
      hair: new THREE.MeshStandardMaterial({ color: '#2a211c', roughness: 0.9 }),
    }),
    [],
  )

  useFrame((_, dt) => {
    const s = state.current
    const g = root.current
    if (!g || !s) return
    g.visible = s.visible
    g.position.copy(s.pos)
    // xoay mượt về hướng đi
    let d = s.heading - g.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    g.rotation.y += d * Math.min(1, dt * 10)
    const k = Math.min(1, s.speed / 1.3)
    phase.current += dt * (4 + 4 * k) * (k > 0.02 ? 1 : 0)
    const swing = Math.sin(phase.current) * 0.55 * k
    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing
    if (armL.current) armL.current.rotation.x = -swing * 0.8
    if (armR.current) armR.current.rotation.x = swing * 0.8
    // nhún nhẹ khi bước
    g.position.y += Math.abs(Math.sin(phase.current)) * 0.025 * k
  })

  const leg = (x: number, ref: React.RefObject<THREE.Group | null>) => (
    <group ref={ref} position={[x, H.hip, 0]}>
      <mesh position={[0, -H.leg / 2 + 0.02, 0]} material={mat.pants} castShadow>
        <capsuleGeometry args={[0.065, H.leg - 0.16, 4, 10]} />
      </mesh>
      <mesh position={[0, -H.leg + 0.035, 0.05]} material={mat.shoe} castShadow>
        <boxGeometry args={[0.1, 0.07, 0.26]} />
      </mesh>
    </group>
  )
  const arm = (x: number, ref: React.RefObject<THREE.Group | null>) => (
    <group ref={ref} position={[x, H.shoulder - 0.03, 0]}>
      <mesh position={[0, -H.arm / 2 + 0.04, 0]} material={mat.shirt} castShadow>
        <capsuleGeometry args={[0.048, H.arm - 0.2, 4, 10]} />
      </mesh>
      <mesh position={[0, -H.arm + 0.04, 0]} material={mat.skin} castShadow>
        <sphereGeometry args={[0.045, 12, 10]} />
      </mesh>
    </group>
  )

  return (
    <group ref={root}>
      {leg(-0.1, legL)}
      {leg(0.1, legR)}
      {/* hông + thân */}
      <mesh position={[0, H.hip + 0.02, 0]} material={mat.pants} castShadow>
        <boxGeometry args={[0.34, 0.14, 0.2]} />
      </mesh>
      <mesh position={[0, (H.hip + H.shoulder) / 2 + 0.03, 0]} material={mat.shirt} castShadow>
        <capsuleGeometry args={[0.16, H.shoulder - H.hip - 0.26, 4, 14]} />
      </mesh>
      <mesh position={[0, H.shoulder - 0.04, 0]} material={mat.shirt} castShadow scale={[1.35, 0.55, 0.75]}>
        <sphereGeometry args={[0.16, 16, 12]} />
      </mesh>
      {arm(-H.shoulderW, armL)}
      {arm(H.shoulderW, armR)}
      {/* cổ + đầu */}
      <mesh position={[0, H.shoulder + 0.05, 0]} material={mat.skin}>
        <cylinderGeometry args={[0.045, 0.05, 0.1, 10]} />
      </mesh>
      <mesh position={[0, H.head, 0]} material={mat.skin} castShadow scale={[0.9, 1.08, 0.95]}>
        <sphereGeometry args={[H.headR, 20, 16]} />
      </mesh>
      <mesh position={[0, H.head + 0.035, -0.012]} material={mat.hair} scale={[0.95, 0.8, 1]}>
        <sphereGeometry args={[H.headR + 0.006, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* mũi chỉ hướng nhìn (+z) */}
      <mesh position={[0, H.head - 0.01, H.headR * 0.95]} material={mat.skin}>
        <sphereGeometry args={[0.018, 8, 6]} />
      </mesh>
    </group>
  )
}

/** Độ cao mắt (m) — camera bám theo khi ở góc nhìn người thứ nhất. */
export const EYE_HEIGHT = 1.6
