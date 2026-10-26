import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** Phản chiếu môi trường dựng bằng code (DEC-R11, không tải HDRI) — dùng chung cho trang xem và khung xem đồ ở studio. */
export const EnvironmentLight = ({ intensity }: { intensity: number }) => {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    return () => {
      scene.environment = null
      env.dispose()
      pm.dispose()
    }
  }, [gl, scene])
  useEffect(() => void (scene.environmentIntensity = intensity), [scene, intensity])
  return null
}
