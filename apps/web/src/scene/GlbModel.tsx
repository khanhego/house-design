import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { ModelRef } from '@hd/core'
import { deg, M } from './units.ts'
import type { WallMode } from './FloorGroup.tsx'

/**
 * Mô hình GLB gắn vào tầng / ngoại thất / cả nhà (02 §8 "Cắt tường", DEC-29):
 * - Tự cắt: ẩn node `wall_*` nằm giữa camera và điểm nhìn; không có `wall_*` → cắt ngang ở sàn + 1,5 m.
 * - Tường thấp: cắt ngang ở sàn + 1,2 m. Đầy đủ: không cắt.
 * - `topClipY` (m): mặt cắt đỉnh tầng để ẩn phần phía trên khi chọn một tầng.
 * - Node `item_*` bấm được (gắn thông tin đồ — FR-05.03).
 */
export const GlbModel = ({ url, modelRef, floorElevationM, wallMode, target, topClipY, selectedNode, onPickNode }: {
  url: string
  modelRef: ModelRef
  floorElevationM: number
  wallMode: WallMode
  target: React.RefObject<THREE.Vector3>
  topClipY: number | null
  selectedNode?: string | null
  onPickNode?: (nodeName: string, point: THREE.Vector3) => void
}) => {
  const { scene } = useGLTF(url, false, true)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])

  const planes = useMemo(() => ({ cut: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), top: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0) }), [])

  const root = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = mesh.receiveShadow = true
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const cloned = mats.map((m) => {
          const c = (m as THREE.Material).clone()
          c.clippingPlanes = [planes.cut, planes.top]
          return c
        })
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
      }
    })
    return root
  }, [scene, planes])

  // tính đoạn thẳng (trục dài bbox) của từng node wall_* sau khi đặt transform
  const wallSegs = useMemo(() => {
    const segs: { obj: THREE.Object3D; a: THREE.Vector2; b: THREE.Vector2 }[] = []
    root.updateWorldMatrix(true, true)
    root.traverse((o) => {
      if (!/^wall_/i.test(o.name)) return
      const bb = new THREE.Box3().setFromObject(o)
      const s = bb.getSize(new THREE.Vector3())
      const c = bb.getCenter(new THREE.Vector3())
      const a = s.x >= s.z ? new THREE.Vector2(bb.min.x, c.z) : new THREE.Vector2(c.x, bb.min.z)
      const b = s.x >= s.z ? new THREE.Vector2(bb.max.x, c.z) : new THREE.Vector2(c.x, bb.max.z)
      segs.push({ obj: o, a, b })
    })
    return segs
  }, [root])

  useFrame(() => {
    const cam = new THREE.Vector2(camera.position.x, camera.position.z)
    const tgt = new THREE.Vector2(target.current.x, target.current.z)
    const useNodes = wallMode === 'auto' && wallSegs.length > 0
    const cutAt = wallMode === 'low' ? 1.2 : wallMode === 'auto' && !useNodes ? 1.5 : null
    planes.cut.constant = cutAt === null ? 1e6 : floorElevationM + cutAt
    planes.top.constant = topClipY ?? 1e6
    for (const w of wallSegs) {
      if (!useNodes) {
        w.obj.visible = true
        continue
      }
      // ẩn khi đoạn camera→điểm nhìn cắt qua tường (mở rộng 5%)
      const d = (w.b.x - w.a.x) * (tgt.y - cam.y) - (w.b.y - w.a.y) * (tgt.x - cam.x)
      let hide = false
      if (Math.abs(d) > 1e-9) {
        const t = ((w.a.x - cam.x) * (tgt.y - cam.y) - (w.a.y - cam.y) * (tgt.x - cam.x)) / d
        const u = ((w.a.x - cam.x) * (w.b.y - w.a.y) - (w.a.y - cam.y) * (w.b.x - w.a.x)) / d
        hide = t > -0.05 && t < 1.05 && u > 0 && u < 1
      }
      w.obj.visible = !hide
    }
  })

  return (
    <>
    <group
      position={[M(modelRef.offset[0]), M(modelRef.offset[2]), M(modelRef.offset[1])]}
      rotation={[0, -deg(modelRef.rotation), 0]}
      scale={modelRef.scale}
      onClick={
        onPickNode
          ? (e) => {
              let o: THREE.Object3D | null = e.object
              while (o && !/^item_/i.test(o.name)) o = o.parent
              if (o) {
                e.stopPropagation()
                onPickNode(o.name, e.point)
              }
            }
          : undefined
      }
    >
      <primitive object={root} />
    </group>
    {selectedNode && <NodeOutline root={root} name={selectedNode} />}
    </>
  )
}

/** Khung viền node đang chọn, đặt ở gốc cảnh (BoxHelper tính theo toạ độ thế giới). */
const NodeOutline = ({ root, name }: { root: THREE.Object3D; name: string }) => {
  const helper = useMemo(() => {
    const node = root.getObjectByName(name)
    return node ? new THREE.BoxHelper(node, '#e07a3f') : null
  }, [root, name])
  useFrame(() => helper?.update())
  return helper ? <primitive object={helper} /> : null
}
