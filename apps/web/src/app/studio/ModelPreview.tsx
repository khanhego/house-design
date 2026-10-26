import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Bounds, ContactShadows, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { fitToSize } from '../../scene/Items.tsx'
import { EnvironmentLight } from '../../scene/environment.tsx'

/*
 * Khung xem mô hình đồ xoay 360° (item 03 lát R2, A3): xem bản đầy đủ / bản nhẹ, chụp ảnh đại diện (DEC-R16 —
 * chụp trên trình duyệt vì máy chủ không có GPU). Đặt mô hình giống trang xem (`fitToSize`).
 */

export type Capture = () => Promise<Blob | null>

const Model = ({ url, sizeMm, normalized }: { url: string; sizeMm: [number, number, number] | null; normalized: boolean }) => {
  const { scene } = useGLTF(url, false, true)
  const obj = useMemo(() => {
    const c = scene.clone(true)
    if (sizeMm) fitToSize(c, sizeMm, normalized)
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true
    })
    return c
  }, [scene, sizeMm, normalized])
  return <primitive object={obj} />
}

/** Chụp ảnh vuông 1024 px nền trắng từ canvas đang hiển thị. */
const Capturer = ({ onCapture }: { onCapture: (fn: Capture) => void }) => {
  const { gl, scene, camera } = useThree()
  useEffect(
    () =>
      onCapture(async () => {
        gl.render(scene, camera)
        const src = gl.domElement
        const out = document.createElement('canvas')
        out.width = out.height = 1024
        const g = out.getContext('2d')!
        g.fillStyle = '#ffffff'
        g.fillRect(0, 0, 1024, 1024)
        const s = Math.min(src.width, src.height)
        g.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, 1024, 1024)
        return new Promise((r) => out.toBlob(r, 'image/jpeg', 0.9))
      }),
    [gl, scene, camera, onCapture],
  )
  return null
}

export const ModelPreview = ({ url, sizeMm, normalized, onCapture }: {
  url: string
  /** kích thước khai báo (mm) — đặt mô hình đúng như trong mẫu nhà */
  sizeMm: [number, number, number] | null
  normalized: boolean
  onCapture?: (fn: Capture) => void
}) => (
  <div className="model-preview">
    <Canvas shadows camera={{ position: [2.4, 1.6, 2.8], fov: 35 }} gl={{ preserveDrawingBuffer: true, antialias: true }} dpr={[1, 2]}>
      <color attach="background" args={['#f4f2ee']} />
      <EnvironmentLight intensity={0.6} />
      <hemisphereLight args={['#ffffff', '#d8d2c8', 0.5]} />
      <directionalLight position={[3, 5, 2]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.25} key={url}>
          <Model url={url} sizeMm={sizeMm} normalized={normalized} />
        </Bounds>
      </Suspense>
      <ContactShadows position={[0, 0.001, 0]} opacity={0.45} scale={8} blur={2.4} far={3} />
      <OrbitControls makeDefault autoRotate autoRotateSpeed={0.8} enablePan={false} />
      {onCapture && <Capturer onCapture={onCapture} />}
    </Canvas>
  </div>
)

export default ModelPreview
