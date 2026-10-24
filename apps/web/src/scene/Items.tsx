import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { Floor, PlacedItem, ResolvedLibraryItem } from '@hd/core'
import { FurnitureModel } from './models.tsx'
import { deg, M } from './units.ts'

export interface ItemInfoView {
  id: string
  name: string
  floorId: string
  item: PlacedItem
  lib: ResolvedLibraryItem | null
}

/** Khung viền + vòng sáng cho đồ đang chọn (chuyển từ prototype src/legacy/Furniture.tsx). */
const SelectionBox = ({ box }: { box: THREE.Box3 }) => {
  const ring = useRef<THREE.Mesh>(null)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  useFrame(({ clock }) => {
    if (!ring.current) return
    const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.04
    ring.current.scale.set(s, s, 1)
  })
  const r = Math.max(size.x, size.z) * 0.62 + 0.08
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 0.04, size.y + 0.04, size.z + 0.04)), [size.x, size.y, size.z])
  return (
    <>
      <lineSegments position={center} geometry={edges}>
        <lineBasicMaterial color="#e07a3f" />
      </lineSegments>
      <mesh ref={ring} position={[center.x, box.min.y + 0.015, center.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r, r + 0.05, 64]} />
        <meshBasicMaterial color="#e07a3f" transparent opacity={0.85} />
      </mesh>
    </>
  )
}

const LibraryGlb = ({ url, size, color }: { url: string; size: [number, number, number]; color?: string }) => {
  const { scene } = useGLTF(url, false, true)
  const obj = useMemo(() => {
    const c = scene.clone(true)
    // đặt đáy ở y = 0, tâm x/z ở 0; co theo kích thước thư viện nếu GLB sai đơn vị
    const b = new THREE.Box3().setFromObject(c)
    const s = b.getSize(new THREE.Vector3())
    const k = s.x > 0 ? M(size[0]) / s.x : 1
    c.scale.setScalar(Math.abs(k - 1) > 0.2 ? k : 1)
    const b2 = new THREE.Box3().setFromObject(c)
    const ctr = b2.getCenter(new THREE.Vector3())
    c.position.set(-ctr.x, -b2.min.y, -ctr.z)
    if (color)
      c.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
        if (m && o.name.toLowerCase().includes('fabric')) {
          ;(o as THREE.Mesh).material = m.clone()
          ;((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(color)
        }
      })
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true
    })
    return c
  }, [scene, size, color])
  return <primitive object={obj} />
}

const ItemNode = ({ item, lib, floorElevation, variantId, selected, onSelect, onHover }: {
  item: PlacedItem
  lib: ResolvedLibraryItem
  floorElevation: number
  variantId?: string
  selected: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) => {
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const [box, setBox] = useState<THREE.Box3 | null>(null)
  const variant = lib.variants.find((v) => v.id === (variantId ?? item.variantId)) ?? lib.variants[0]
  const size: [number, number, number] = [M(lib.sizeMm[0]), M(lib.sizeMm[1]), M(lib.sizeMm[2])]

  useLayoutEffect(() => {
    if (!selected || !outer.current || !inner.current) return setBox(null)
    outer.current.updateWorldMatrix(true, true)
    const b = new THREE.Box3().setFromObject(inner.current, true)
    b.applyMatrix4(outer.current.matrixWorld.clone().invert())
    setBox(b)
  }, [selected, lib])

  return (
    <group
      ref={outer}
      position={[M(item.position[0]), M(floorElevation + item.elevation), M(item.position[1])]}
      rotation={[0, -deg(item.rotation), 0]}
      onClick={(e) => (e.stopPropagation(), onSelect(item.id))}
      onPointerOver={(e) => (e.stopPropagation(), onHover(item.id), (document.body.style.cursor = 'pointer'))}
      onPointerOut={() => (onHover(null), (document.body.style.cursor = ''))}
    >
      <group ref={inner}>
        {lib.modelUrl ? (
          <Suspense fallback={lib.fallbackShape ? <FurnitureModel model={lib.fallbackShape} size={size} color={variant?.color ?? '#999'} /> : null}>
            <LibraryGlb url={lib.modelUrl} size={lib.sizeMm} color={variant?.color} />
          </Suspense>
        ) : lib.fallbackShape ? (
          <FurnitureModel model={lib.fallbackShape} size={size} color={variant?.color ?? '#999'} />
        ) : (
          <mesh position={[0, size[1] / 2, 0]} castShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial color={variant?.color ?? '#bbb'} />
          </mesh>
        )}
      </group>
      {box && <SelectionBox box={box} />}
    </group>
  )
}

export const FloorItems = ({ floor, libraryItems, variants, selectedItemId, onSelect, onHover }: {
  floor: Floor
  libraryItems: Record<string, ResolvedLibraryItem>
  variants: Record<string, string>
  selectedItemId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) => (
  <group>
    {floor.items.map((it) => {
      if (!('libraryItemId' in it.source)) return null
      const lib = libraryItems[it.source.libraryItemId]
      if (!lib) return null
      return (
        <ItemNode
          key={it.id}
          item={it}
          lib={lib}
          floorElevation={floor.elevation}
          variantId={variants[it.id]}
          selected={selectedItemId === it.id}
          onSelect={onSelect}
          onHover={onHover}
        />
      )
    })}
  </group>
)
