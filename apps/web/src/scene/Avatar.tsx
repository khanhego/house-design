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
  /** độ đậm 0…1 — camera bị ép sát thì làm mờ để không che tầm nhìn */
  opacity: number
}

export const newAvatarState = (): AvatarState => ({ pos: new THREE.Vector3(), heading: 0, speed: 0, visible: true, opacity: 1 })

/*
 * Tỷ lệ người trưởng thành cao 1,70 m (≈ 7,5 lần chiều cao đầu):
 * đầu cao 0,23 · rộng 0,155 · vai (cao) 1,40 · rộng vai 0,39 · ngực rộng 0,33 · dày 0,22 · đáy chậu 0,80 · đầu ngón tay ≈ 0,65.
 */
const H = { crotch: 0.8, hip: 0.92, shoulder: 1.4, neck: 1.46, headC: 1.587, legR: 0.062, armR: 0.04, upperArm: 0.3, foreArm: 0.27, shoulderX: 0.19, legX: 0.09 }

/** Người mẫu đúng tỷ lệ để cảm nhận kích thước phòng (chế độ Đứng trong phòng). */
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
      pants: new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.9 }),
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
    const op = Math.max(0, Math.min(1, s.opacity))
    for (const m of Object.values(mat)) {
      const t = op < 0.99
      if (m.transparent !== t) (m.transparent = t), (m.needsUpdate = true)
      m.opacity = op
      m.depthWrite = !t
    }
    g.position.copy(s.pos)
    // xoay mượt về hướng đi
    let d = s.heading - g.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    g.rotation.y += d * Math.min(1, dt * 10)
    const k = Math.min(1, s.speed / 1.3)
    phase.current += dt * (4 + 4 * k) * (k > 0.02 ? 1 : 0)
    const swing = Math.sin(phase.current) * 0.5 * k
    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing
    if (armL.current) armL.current.rotation.x = -swing * 0.8
    if (armR.current) armR.current.rotation.x = swing * 0.8
    // nhún nhẹ khi bước
    g.position.y += Math.abs(Math.sin(phase.current)) * 0.02 * k
  })

  const legLen = H.crotch + 0.03
  const leg = (x: number, ref: React.RefObject<THREE.Group | null>) => (
    <group ref={ref} position={[x, legLen, 0]}>
      <mesh position={[0, -legLen / 2 + 0.03, 0]} material={mat.pants} castShadow>
        <capsuleGeometry args={[H.legR, legLen - 2 * H.legR - 0.05, 4, 10]} />
      </mesh>
      <mesh position={[0, -legLen + 0.03, 0.045]} material={mat.shoe} castShadow>
        <boxGeometry args={[0.09, 0.06, 0.25]} />
      </mesh>
    </group>
  )
  const armLen = H.upperArm + H.foreArm
  const arm = (x: number, ref: React.RefObject<THREE.Group | null>) => (
    <group ref={ref} position={[x, H.shoulder - 0.02, 0]}>
      <mesh position={[0, -armLen / 2 + 0.02, 0]} material={mat.shirt} castShadow>
        <capsuleGeometry args={[H.armR, armLen - 2 * H.armR - 0.04, 4, 10]} />
      </mesh>
      <mesh position={[0, -armLen - 0.03, 0]} material={mat.skin} castShadow scale={[0.8, 1.25, 0.55]}>
        <sphereGeometry args={[0.045, 12, 10]} />
      </mesh>
    </group>
  )
  const torsoH = H.shoulder - H.hip

  return (
    <group ref={root}>
      {leg(-H.legX, legL)}
      {leg(H.legX, legR)}
      {/* hông */}
      <mesh position={[0, H.crotch + 0.07, 0]} material={mat.pants} castShadow scale={[1, 1, 0.68]}>
        <capsuleGeometry args={[0.15, 0.04, 4, 14]} />
      </mesh>
      {/* thân: ngực rộng 0,33 · dày 0,22 */}
      <mesh position={[0, H.hip + torsoH / 2, 0]} material={mat.shirt} castShadow scale={[1, 1, 0.68]}>
        <capsuleGeometry args={[0.16, torsoH - 0.2, 4, 16]} />
      </mesh>
      <mesh position={[0, H.shoulder - 0.05, 0]} material={mat.shirt} castShadow scale={[1.2, 0.42, 0.62]}>
        <sphereGeometry args={[0.165, 16, 12]} />
      </mesh>
      {arm(-H.shoulderX, armL)}
      {arm(H.shoulderX, armR)}
      {/* cổ + đầu: cao 0,23 · rộng 0,155 */}
      <mesh position={[0, H.neck, 0]} material={mat.skin}>
        <cylinderGeometry args={[0.05, 0.055, 0.12, 10]} />
      </mesh>
      <mesh position={[0, H.headC, 0.005]} material={mat.skin} castShadow scale={[0.78, 1.13, 0.98]}>
        <sphereGeometry args={[0.1, 20, 16]} />
      </mesh>
      <mesh position={[0, H.headC + 0.03, -0.012]} material={mat.hair} scale={[0.82, 0.95, 1.02]}>
        <sphereGeometry args={[0.101, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* mũi chỉ hướng nhìn (+z) */}
      <mesh position={[0, H.headC - 0.015, 0.098]} material={mat.skin}>
        <sphereGeometry args={[0.014, 8, 6]} />
      </mesh>
    </group>
  )
}

/** Độ cao mắt (m) — camera bám theo khi ở góc nhìn người thứ nhất. */
export const EYE_HEIGHT = 1.6
