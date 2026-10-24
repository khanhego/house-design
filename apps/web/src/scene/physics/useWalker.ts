import { useEffect, useState } from 'react'
import type { HouseDocument, NavLibrary } from '@hd/core'
import type { Walker } from './walker.ts'

/**
 * Người mẫu vật lý cho ngôi nhà — chỉ tải bộ vật lý + navmesh (≈ 2 MB WASM, gói riêng) khi vào chế độ
 * Đứng trong phòng; dựng lại khi đổi nhà, giải phóng khi rời.
 */
export const useWalker = (doc: HouseDocument, lib: NavLibrary, enabled: boolean): Walker | null => {
  const [walker, setWalker] = useState<Walker | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    let made: Walker | null = null
    import('./walker.ts')
      .then(async (m) => {
        await m.loadPhysics()
        if (!alive) return
        made = new m.Walker(doc, lib)
        setWalker(made)
      })
      .catch(() => {
        /* không nạp được WASM → người mẫu đi theo cách cũ (mặt bằng 2D) */
      })
    return () => {
      alive = false
      made?.dispose()
      setWalker(null)
    }
  }, [doc, lib, enabled])
  return walker
}
