import * as THREE from 'three'
import type { RoomFunction } from '@hd/core'

/* Texture sàn vẽ bằng canvas — chuyển từ prototype (src/legacy/Structure.tsx). */

export type FloorKind = 'wood' | 'tile' | 'stone' | 'concrete'

export const floorKindFor = (fn: RoomFunction): FloorKind => {
  switch (fn) {
    case 'bedroom': case 'living': case 'study': case 'worship': case 'hall':
      return 'wood'
    case 'bathroom': case 'wc': case 'laundry': case 'kitchen': case 'dining':
      return 'tile'
    case 'garage': case 'storage':
      return 'concrete'
    default:
      return 'stone'
  }
}

/** Kích thước thật (m) mà một ô texture phủ lên. */
export const TILE_METERS: Record<FloorKind, number> = { wood: 1.6, tile: 1.2, stone: 1.6, concrete: 3 }

const makeTexture = (kind: FloorKind) => {
  const size = 512
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647

  if (kind === 'wood') {
    const rows = 8
    const rh = size / rows
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * size * 0.5
      while (x < size) {
        const len = size * (0.45 + rnd() * 0.4)
        g.fillStyle = `hsl(32, ${38 + rnd() * 10}%, ${58 + rnd() * 10}%)`
        g.fillRect(x, r * rh, len, rh)
        g.strokeStyle = 'rgba(80,50,25,0.12)'
        for (let k = 0; k < 6; k++) {
          const yy = r * rh + rnd() * rh
          g.beginPath()
          g.moveTo(x, yy)
          g.bezierCurveTo(x + len / 3, yy + 3, x + (2 * len) / 3, yy - 3, x + len, yy)
          g.stroke()
        }
        g.fillStyle = 'rgba(60,40,20,0.35)'
        g.fillRect(x, r * rh, 2, rh)
        x += len
      }
      g.fillStyle = 'rgba(60,40,20,0.3)'
      g.fillRect(0, r * rh, size, 2)
    }
  } else if (kind === 'concrete') {
    g.fillStyle = '#c9c6c0'
    g.fillRect(0, 0, size, size)
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(90,85,80,${rnd() * 0.06})`
      g.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 4, 2 + rnd() * 4)
    }
  } else {
    const n = kind === 'tile' ? 4 : 2
    const cell = size / n
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const l = kind === 'tile' ? 90 + rnd() * 3 : 84 + rnd() * 4
        g.fillStyle = `hsl(${kind === 'tile' ? 200 : 35}, ${kind === 'tile' ? 8 : 6}%, ${l}%)`
        g.fillRect(i * cell, j * cell, cell, cell)
      }
    g.strokeStyle = kind === 'tile' ? '#c9cfd2' : '#bdb6ad'
    g.lineWidth = 3
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, size); g.stroke()
      g.beginPath(); g.moveTo(0, i * cell); g.lineTo(size, i * cell); g.stroke()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

const cache = new Map<FloorKind, THREE.CanvasTexture>()
export const floorTexture = (kind: FloorKind) => {
  if (!cache.has(kind)) cache.set(kind, makeTexture(kind))
  return cache.get(kind)!
}
