import { useLayoutEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { catalog } from '../data/catalog'
import type { Placement, Room } from '../data/types'
import { FurnitureModel } from './models'

export interface HoverInfo {
  name: string
  pos: [number, number, number]
}

interface Props {
  room: Room
  placement: Placement
  variantId?: string
  selected: boolean
  onSelect: (id: string) => void
  onHover: (info: HoverInfo | null) => void
}

/** Khung viền + vòng sáng dưới sàn cho món đang chọn. */
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
  return (
    <>
      <lineSegments position={center}>
        <edgesGeometry args={[new THREE.BoxGeometry(size.x + 0.04, size.y + 0.04, size.z + 0.04)]} />
        <lineBasicMaterial color="#e07a3f" />
      </lineSegments>
      <mesh ref={ring} position={[center.x, 0.015, center.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r, r + 0.05, 64]} />
        <meshBasicMaterial color="#e07a3f" transparent opacity={0.85} />
      </mesh>
    </>
  )
}

export const Furniture = ({ room, placement, variantId, selected, onSelect, onHover }: Props) => {
  const product = catalog[placement.productId]
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0]
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const [box, setBox] = useState<THREE.Box3 | null>(null)

  // Bao khung tính trong hệ toạ độ của món đồ để khớp khi xoay
  useLayoutEffect(() => {
    if (!selected || !outer.current || !inner.current) return setBox(null)
    outer.current.updateWorldMatrix(true, true)
    const b = new THREE.Box3().setFromObject(inner.current, true)
    b.applyMatrix4(outer.current.matrixWorld.clone().invert())
    setBox(b)
  }, [selected, placement.productId])

  const [x, z] = placement.at
  const lift = hovered && !selected ? 0.03 : 0

  return (
    <group
      ref={outer}
      position={[room.rect[0] + x, 0, room.rect[1] + z]}
      rotation={[0, THREE.MathUtils.degToRad(placement.rot ?? 0), 0]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(placement.id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
        const p = outer.current!.position
        onHover({ name: product.name, pos: [p.x, product.size[1] + 0.25, p.z] })
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = ''
        onHover(null)
      }}
    >
      <group ref={inner} position={[0, lift, 0]}>
        <FurnitureModel model={product.model} size={product.size} color={variant.color} accent={variant.accent} />
      </group>
      {box && <SelectionBox box={box} />}
    </group>
  )
}
