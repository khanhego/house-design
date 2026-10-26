import { createContext, useContext, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ResolvedMaterial } from '@hd/core'

/*
 * Vật liệu hoàn thiện thật (item 03 lát R1): sàn, tường, trần, cửa, bậc thang dùng ảnh vân PBR đúng kích thước thật.
 * Tải dần (FR-13.14): ảnh 256 px hiện ngay; chất lượng Đẹp thì tải tiếp ảnh 1024 px rồi thay vào.
 * Mọi bề mặt có UV tính theo mét (sàn: toạ độ mặt bằng; tường: `meterBox`), nên repeat = 1 / kích thước ô vân (m).
 */

export type Quality = 'light' | 'full'

export interface SurfaceKit {
  /** vật liệu three.js theo id vật liệu; null = chưa gán / không có trong snapshot → dùng cách hiển thị cũ */
  get: (id: string | null | undefined) => THREE.MeshStandardMaterial | null
}

const none: SurfaceKit = { get: () => null }
export const SurfaceContext = createContext<SurfaceKit>(none)
export const useSurfaces = () => useContext(SurfaceContext)

const loader = new THREE.TextureLoader()
loader.setCrossOrigin('anonymous')

const prep = (tex: THREE.Texture, m: ResolvedMaterial, color: boolean) => {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1000 / m.tileMm[0], 1000 / m.tileMm[1])
  tex.anisotropy = 8
  if (color) tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

const SLOT = { color: 'map', normal: 'normalMap', rough: 'roughnessMap' } as const

/** Bộ vật liệu cho một ngôi nhà; tự giải phóng texture khi đổi nhà / chất lượng. */
export const useSurfaceKit = (materials: Record<string, ResolvedMaterial> | undefined, quality: Quality): SurfaceKit => {
  const kit = useMemo(() => {
    const cache = new Map<string, THREE.MeshStandardMaterial>()
    const textures: THREE.Texture[] = []
    let alive = true
    const make = (id: string, m: ResolvedMaterial) => {
      const mat = new THREE.MeshStandardMaterial({ color: m.maps.color ? '#ffffff' : m.color, roughness: m.maps.rough ? 1 : m.roughness, metalness: m.metalness })
      // chưa có ảnh: màu trung bình của vật liệu
      if (m.maps.color) mat.color.set(m.color)
      mat.name = m.key
      for (const [k, slot] of Object.entries(SLOT) as [keyof typeof SLOT, (typeof SLOT)[keyof typeof SLOT]][]) {
        const src = m.maps[k]
        if (!src) continue
        const load = (url: string, then?: () => void) =>
          loader.load(url, (tex) => {
            if (!alive) return tex.dispose()
            const old = mat[slot]
            mat[slot] = prep(tex, m, k === 'color')
            if (k === 'color') mat.color.set('#ffffff')
            if (slot === 'normalMap') mat.normalScale.set(1, 1)
            mat.needsUpdate = true
            textures.push(tex)
            if (old && old !== tex) old.dispose()
            then?.()
          })
        // bản nhẹ trước, bản đầy đủ sau (chất lượng Đẹp)
        load(src.small, quality === 'full' ? () => load(src.full) : undefined)
      }
      cache.set(id, mat)
      return mat
    }
    return {
      get: (id: string | null | undefined) => {
        if (!id || !materials?.[id]) return null
        return cache.get(id) ?? make(id, materials[id])
      },
      dispose: () => {
        alive = false
        cache.forEach((m) => m.dispose())
        textures.forEach((t) => t.dispose())
      },
    }
  }, [materials, quality])
  useEffect(() => () => kit.dispose(), [kit])
  return kit
}

/**
 * Hộp có UV theo mét trên mọi mặt (vân gạch / gỗ trên tường giữ đúng kích thước thật).
 * Thứ tự mặt của BoxGeometry: +x, −x, +y, −y, +z, −z — mỗi mặt 4 đỉnh.
 */
export const meterBox = (w: number, h: number, d: number) => {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  const size: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k
      uv.setXY(i, uv.getX(i) * size[f][0], uv.getY(i) * size[f][1])
    }
  uv.needsUpdate = true
  return g
}

/** Màu tô vùng phòng đang chọn (trên nền vật liệu thật). */
export const highlighted = (() => {
  const cache = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>()
  return (m: THREE.MeshStandardMaterial) => {
    let h = cache.get(m)
    if (!h) {
      h = m.clone()
      h.emissive.set('#c8643a')
      h.emissiveIntensity = 0.12
      cache.set(m, h)
    }
    // ảnh vân tải dần: luôn dùng ảnh mới nhất của vật liệu gốc
    if (h.map !== m.map || h.normalMap !== m.normalMap || h.roughnessMap !== m.roughnessMap) {
      h.map = m.map
      h.normalMap = m.normalMap
      h.roughnessMap = m.roughnessMap
      h.color.copy(m.color)
      h.needsUpdate = true
    }
    return h
  }
})()
