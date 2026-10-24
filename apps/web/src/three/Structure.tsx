import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { FloorKind, House, Opening, Room } from '../data/types'

export const WALL_H = 2.7
const T = 0.1
const DOOR_TOP = 2.1
const SILL = 0.9
const WIN_TOP = 2.2
const CUT_H = 0.22

export type WallMode = 'cut' | 'full' | 'low'

interface Piece {
  pos: [number, number, number]
  size: [number, number, number]
}

interface WallRun {
  axis: 'x' | 'z'
  at: number
  solid: Piece[]
  glass: Piece[]
  frames: Piece[]
}

type Interval = [number, number]

const unionIntervals = (list: Interval[]) => {
  const sorted = [...list].sort((a, b) => a[0] - b[0])
  const out: Interval[] = []
  for (const iv of sorted) {
    const last = out[out.length - 1]
    if (last && iv[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], iv[1])
    else out.push([...iv])
  }
  return out
}

/** Chuyển (toạ độ dọc tường, cao độ) sang khối 3D trên một đường tường. */
const piece = (axis: 'x' | 'z', at: number, a: number, b: number, y0: number, y1: number, thick = T): Piece => {
  const mid = (a + b) / 2
  const len = b - a
  const h = y1 - y0
  return axis === 'x'
    ? { pos: [mid, y0 + h / 2, at], size: [len, h, thick] }
    : { pos: [at, y0 + h / 2, mid], size: [thick, h, len] }
}

export const buildWalls = (house: House): WallRun[] => {
  const lines = new Map<string, { axis: 'x' | 'z'; at: number; ivs: Interval[] }>()
  const add = (axis: 'x' | 'z', at: number, a: number, b: number) => {
    const key = `${axis}:${at.toFixed(3)}`
    if (!lines.has(key)) lines.set(key, { axis, at, ivs: [] })
    lines.get(key)!.ivs.push([a, b])
  }
  for (const { rect: [x, z, w, d] } of house.rooms) {
    add('x', z, x, x + w)
    add('x', z + d, x, x + w)
    add('z', x, z, z + d)
    add('z', x + w, z, z + d)
  }

  const runs: WallRun[] = []
  for (const { axis, at, ivs } of lines.values()) {
    const ops = house.openings
      .filter((o) => o.axis === axis && Math.abs(o.at - at) < 1e-3)
      .sort((a, b) => a.from - b.from)
    for (const [a0, b0] of unionIntervals(ivs)) {
      const run: WallRun = { axis, at, solid: [], glass: [], frames: [] }
      // Kéo dài 2 đầu để các góc tường khép kín
      const a = a0 - T / 2
      const b = b0 + T / 2
      let cursor = a
      const inRun = ops.filter((o: Opening) => o.from >= a0 - 1e-3 && o.to <= b0 + 1e-3)
      for (const o of inRun) {
        if (o.from > cursor) run.solid.push(piece(axis, at, cursor, o.from, 0, WALL_H))
        const top = o.kind === 'door' ? DOOR_TOP : WIN_TOP
        run.solid.push(piece(axis, at, o.from, o.to, top, WALL_H))
        if (o.kind === 'window') {
          run.solid.push(piece(axis, at, o.from, o.to, 0, SILL))
          run.glass.push(piece(axis, at, o.from, o.to, SILL, WIN_TOP, 0.02))
          run.frames.push(piece(axis, at, o.from, o.to, SILL - 0.03, SILL, T + 0.04))
          run.frames.push(piece(axis, at, (o.from + o.to) / 2 - 0.02, (o.from + o.to) / 2 + 0.02, SILL, WIN_TOP, 0.05))
        }
        cursor = o.to
      }
      if (cursor < b) run.solid.push(piece(axis, at, cursor, b, 0, WALL_H))
      runs.push(run)
    }
  }
  return runs
}

const Wall = ({ run, color, mode, target }: { run: WallRun; color: string; mode: WallMode; target: React.RefObject<THREE.Vector3> }) => {
  const ref = useRef<THREE.Group>(null)
  const glassRef = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    let want = 1
    if (mode === 'low') want = CUT_H / WALL_H
    else if (mode === 'cut') {
      // Hạ tường nếu nó nằm giữa camera và điểm đang nhìn
      const t = target.current
      const camSide = run.axis === 'x' ? camera.position.z - run.at : camera.position.x - run.at
      const tgtSide = run.axis === 'x' ? t.z - run.at : t.x - run.at
      if (camSide * tgtSide < 0) want = CUT_H / WALL_H
    }
    g.scale.y = THREE.MathUtils.damp(g.scale.y, want, 8, dt)
    if (glassRef.current) glassRef.current.visible = g.scale.y > 0.6
  })

  return (
    <group ref={ref}>
      {run.solid.map((p, i) => (
        <mesh key={i} position={p.pos} castShadow receiveShadow>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      ))}
      <group ref={glassRef}>
        {run.glass.map((p, i) => (
          <mesh key={i} position={p.pos}>
            <boxGeometry args={p.size} />
            <meshStandardMaterial color="#bcd8e6" transparent opacity={0.25} roughness={0.05} metalness={0.2} />
          </mesh>
        ))}
        {run.frames.map((p, i) => (
          <mesh key={i} position={p.pos} castShadow>
            <boxGeometry args={p.size} />
            <meshStandardMaterial color="#3a3836" roughness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

export const Walls = ({ house, mode, target }: { house: House; mode: WallMode; target: React.RefObject<THREE.Vector3> }) => {
  const runs = useMemo(() => buildWalls(house), [house])
  return (
    <>
      {runs.map((r, i) => (
        <Wall key={`${house.id}-${i}`} run={r} color={house.wallColor} mode={mode} target={target} />
      ))}
    </>
  )
}

/* ---------- Sàn: vân gỗ / gạch / đá vẽ bằng canvas ---------- */

const makeTexture = (kind: FloorKind) => {
  const size = 512
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const rnd = (() => {
    let s = 7
    return () => ((s = (s * 16807) % 2147483647) / 2147483647)
  })()

  if (kind === 'wood') {
    const rows = 8
    const rh = size / rows
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * size * 0.5
      while (x < size) {
        const len = size * (0.45 + rnd() * 0.4)
        const l = 58 + rnd() * 10
        g.fillStyle = `hsl(32, ${38 + rnd() * 10}%, ${l}%)`
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
  } else {
    const n = kind === 'tile' ? 4 : 2
    const cell = size / n
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const l = kind === 'tile' ? 90 + rnd() * 3 : 84 + rnd() * 4
        g.fillStyle = `hsl(${kind === 'tile' ? 200 : 35}, ${kind === 'tile' ? 8 : 6}%, ${l}%)`
        g.fillRect(i * cell, j * cell, cell, cell)
        if (kind === 'stone') {
          for (let k = 0; k < 40; k++) {
            g.fillStyle = `rgba(120,110,100,${rnd() * 0.08})`
            g.beginPath()
            g.arc(i * cell + rnd() * cell, j * cell + rnd() * cell, rnd() * 20, 0, Math.PI * 2)
            g.fill()
          }
        }
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

/** Kích thước thực (m) mà một ô texture phủ lên. */
const TILE_METERS: Record<FloorKind, number> = { wood: 1.6, tile: 1.2, stone: 1.6 }
const textures = new Map<FloorKind, THREE.CanvasTexture>()
const getTexture = (kind: FloorKind) => {
  if (!textures.has(kind)) textures.set(kind, makeTexture(kind))
  return textures.get(kind)!
}

export const Floor = ({ room, onFocus }: { room: Room; onFocus: () => void }) => {
  const [x, z, w, d] = room.rect
  const map = useMemo(() => {
    const t = getTexture(room.floor).clone()
    t.repeat.set(w / TILE_METERS[room.floor], d / TILE_METERS[room.floor])
    t.needsUpdate = true
    return t
  }, [room.floor, w, d])

  return (
    <mesh
      position={[x + w / 2, 0.001, z + d / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onDoubleClick={(e) => {
        e.stopPropagation()
        onFocus()
      }}
    >
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={map} roughness={room.floor === 'wood' ? 0.6 : 0.35} />
    </mesh>
  )
}
