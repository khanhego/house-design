import type { ReactNode } from 'react'
import type { ModelKey } from '../data/types'

type V3 = [number, number, number]

interface BoxProps {
  p: V3
  s: V3
  c: string
  rough?: number
  metal?: number
  opacity?: number
}

/** Khối hộp có toạ độ tâm p và kích thước s. */
const B = ({ p, s, c, rough = 0.7, metal = 0, opacity }: BoxProps) => (
  <mesh position={p} castShadow receiveShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial
      color={c}
      roughness={rough}
      metalness={metal}
      transparent={opacity !== undefined}
      opacity={opacity ?? 1}
    />
  </mesh>
)

const Cyl = ({ p, r, h, c, rough = 0.6, metal = 0, rTop }: { p: V3; r: number; h: number; c: string; rough?: number; metal?: number; rTop?: number }) => (
  <mesh position={p} castShadow receiveShadow>
    <cylinderGeometry args={[rTop ?? r, r, h, 24]} />
    <meshStandardMaterial color={c} roughness={rough} metalness={metal} />
  </mesh>
)

/** 4 chân tại các góc, cách mép một khoảng inset. */
const Legs = ({ w, d, h, c, inset = 0.06, t = 0.04 }: { w: number; d: number; h: number; c: string; inset?: number; t?: number }) => (
  <>
    {[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => (
        <B key={`${sx}${sz}`} p={[sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset)]} s={[t, h, t]} c={c} />
      )),
    )}
  </>
)

export interface ModelProps {
  size: V3
  color: string
  accent?: string
}

const DARK = '#2e2b28'
const METAL = '#9a9ea3'

const models: Record<ModelKey, (m: ModelProps) => ReactNode> = {
  sofa: ({ size: [w, h, d], color, accent = DARK }) => {
    const seatH = 0.42
    const arm = 0.16
    const seatW = (w - arm * 2) / 3
    return (
      <>
        <Legs w={w} d={d} h={0.08} c={accent} />
        <B p={[0, 0.2, 0]} s={[w, 0.24, d]} c={color} />
        {[-1, 0, 1].map((i) => (
          <B key={i} p={[i * seatW, seatH - 0.04, 0.08]} s={[seatW - 0.02, 0.14, d - 0.3]} c={color} rough={0.9} />
        ))}
        <B p={[0, (h + 0.32) / 2, -d / 2 + 0.11]} s={[w, h - 0.32, 0.22]} c={color} />
        {[-1, 0, 1].map((i) => (
          <B key={`b${i}`} p={[i * seatW, 0.62, -d / 2 + 0.3]} s={[seatW - 0.04, 0.34, 0.14]} c={color} rough={0.95} />
        ))}
        {[-1, 1].map((s) => (
          <B key={`a${s}`} p={[s * (w / 2 - arm / 2), 0.4, 0]} s={[arm, 0.6, d]} c={color} />
        ))}
      </>
    )
  },

  sofaL: ({ size: [w, h, d], color, accent = DARK }) => {
    const depth = 0.95
    return (
      <>
        <group position={[0, 0, -(d - depth) / 2]}>
          <Legs w={w} d={depth} h={0.08} c={accent} />
          <B p={[0, 0.2, 0]} s={[w, 0.24, depth]} c={color} />
          <B p={[0, 0.38, 0.08]} s={[w - 0.3, 0.14, depth - 0.3]} c={color} rough={0.9} />
          <B p={[0, (h + 0.32) / 2, -depth / 2 + 0.11]} s={[w, h - 0.32, 0.22]} c={color} />
          <B p={[-w / 2 + 0.08, 0.4, 0]} s={[0.16, 0.6, depth]} c={color} />
        </group>
        {/* Phần chaise kéo dài về phía trước */}
        <B p={[w / 2 - 0.45, 0.2, (depth) / 2 - 0.05]} s={[0.9, 0.24, d - depth + 0.1]} c={color} />
        <B p={[w / 2 - 0.45, 0.38, depth / 2 - 0.05]} s={[0.86, 0.14, d - depth]} c={color} rough={0.9} />
        <B p={[w / 2 - 0.08, 0.4, 0.05]} s={[0.16, 0.6, d - 0.1]} c={color} />
      </>
    )
  },

  armchair: ({ size: [w, h, d], color, accent = '#c89f6e' }) => (
    <>
      <Legs w={w - 0.1} d={d - 0.1} h={0.14} c={accent} t={0.035} />
      <B p={[0, 0.27, 0]} s={[w, 0.26, d]} c={color} rough={0.95} />
      <B p={[0, (h + 0.4) / 2, -d / 2 + 0.1]} s={[w, h - 0.4, 0.2]} c={color} rough={0.95} />
      {[-1, 1].map((s) => (
        <B key={s} p={[s * (w / 2 - 0.07), 0.5, 0.02]} s={[0.14, 0.3, d - 0.04]} c={color} rough={0.95} />
      ))}
    </>
  ),

  coffeeTable: ({ size: [w, h, d], color }) => (
    <>
      <B p={[0, h - 0.02, 0]} s={[w, 0.04, d]} c={color} rough={0.5} />
      <B p={[0, 0.12, 0]} s={[w - 0.12, 0.025, d - 0.12]} c={color} rough={0.5} />
      <Legs w={w} d={d} h={h - 0.04} c={color} />
    </>
  ),

  tvStand: ({ size: [w, h, d], color }) => (
    <>
      <B p={[0, h / 2 + 0.05, 0]} s={[w, h - 0.1, d]} c={color} rough={0.55} />
      {[-1, 1].map((s) => (
        <B key={s} p={[s * w / 4, h / 2 + 0.05, d / 2 + 0.003]} s={[w / 2 - 0.04, h - 0.18, 0.005]} c={color} rough={0.4} />
      ))}
      <Legs w={w} d={d} h={0.05} c={DARK} />
      {/* TV 65" */}
      <B p={[0, h + 0.05, -0.05]} s={[0.35, 0.02, 0.2]} c={DARK} />
      <B p={[0, h + 0.47, -0.05]} s={[1.45, 0.83, 0.04]} c="#141518" rough={0.2} metal={0.3} />
      <B p={[0, h + 0.47, -0.028]} s={[1.41, 0.79, 0.002]} c="#22303d" rough={0.1} />
    </>
  ),

  rug: ({ size: [w, , d], color }) => (
    <mesh position={[0, 0.006, 0]} receiveShadow>
      <boxGeometry args={[w, 0.012, d]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  ),

  floorLamp: ({ size: [, h], color, accent = '#f1e6d0' }) => (
    <>
      <Cyl p={[0, 0.015, 0]} r={0.16} h={0.03} c={color} metal={0.4} rough={0.4} />
      <Cyl p={[0, h / 2, 0]} r={0.012} h={h - 0.2} c={color} metal={0.4} rough={0.4} />
      <mesh position={[0, h - 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.2, 0.26, 24, 1, true]} />
        <meshStandardMaterial color={accent} side={2} emissive="#ffd9a0" emissiveIntensity={0.35} />
      </mesh>
      <pointLight position={[0, h - 0.2, 0]} intensity={1.2} distance={4} color="#ffd9a0" />
    </>
  ),

  plant: ({ size: [w, h], color, accent = '#efece6' }) => (
    <>
      <Cyl p={[0, 0.17, 0]} r={w * 0.32} rTop={w * 0.38} h={0.34} c={accent} rough={0.5} />
      <Cyl p={[0, 0.33, 0]} r={w * 0.34} h={0.02} c="#4a3a2a" />
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2
        const r = 0.08 + (i % 3) * 0.05
        const y = 0.55 + (i % 4) * ((h - 0.7) / 4)
        return (
          <mesh key={i} position={[Math.cos(a) * r, y, Math.sin(a) * r]} rotation={[0.5 * Math.sin(a), a, 0.6]} castShadow>
            <sphereGeometry args={[0.16, 10, 6]} />
            <meshStandardMaterial color={i % 2 ? color : '#3f6638'} roughness={0.8} />
          </mesh>
        )
      })}
      <Cyl p={[0, 0.6, 0]} r={0.015} h={0.6} c="#3f5a32" />
    </>
  ),

  bookshelf: ({ size: [w, h, d], color }) => {
    const shelves = 5
    const books = ['#8b4a3c', '#33475b', '#c8b48a', '#556b4f', '#2e2b28', '#a87b52']
    return (
      <>
        {[-1, 1].map((s) => (
          <B key={s} p={[s * (w / 2 - 0.015), h / 2, 0]} s={[0.03, h, d]} c={color} />
        ))}
        <B p={[0, h / 2, -d / 2 + 0.008]} s={[w, h, 0.016]} c={color} />
        {Array.from({ length: shelves + 1 }, (_, i) => (
          <B key={`s${i}`} p={[0, 0.03 + (i * (h - 0.06)) / shelves, 0]} s={[w, 0.03, d]} c={color} />
        ))}
        {Array.from({ length: shelves }, (_, i) =>
          Array.from({ length: 7 }, (_, j) => {
            if ((i + j) % 4 === 3) return null
            const bh = 0.18 + ((i * 7 + j) % 3) * 0.04
            return (
              <B
                key={`b${i}${j}`}
                p={[-w / 2 + 0.1 + j * 0.06, 0.045 + (i * (h - 0.06)) / shelves + bh / 2, 0.01]}
                s={[0.045, bh, d - 0.08]}
                c={books[(i * 3 + j) % books.length]}
              />
            )
          }),
        )}
      </>
    )
  },

  diningTable: ({ size: [w, h, d], color }) => (
    <>
      <B p={[0, h - 0.025, 0]} s={[w, 0.05, d]} c={color} rough={0.45} />
      <Legs w={w} d={d} h={h - 0.05} c={color} inset={0.1} t={0.06} />
      <Cyl p={[0, h + 0.06, 0]} r={0.09} rTop={0.06} h={0.12} c="#e9e4da" rough={0.3} />
    </>
  ),

  chair: ({ size: [w, h, d], color }) => (
    <>
      <Legs w={w} d={d} h={0.45} c={color} inset={0.03} t={0.03} />
      <B p={[0, 0.46, 0]} s={[w, 0.04, d]} c="#3d3936" rough={0.6} />
      {[-1, 1].map((s) => (
        <B key={s} p={[s * (w / 2 - 0.015), 0.66, -d / 2 + 0.03]} s={[0.03, 0.4, 0.03]} c={color} />
      ))}
      <B p={[0, h - 0.07, -d / 2 + 0.03]} s={[w, 0.12, 0.025]} c={color} />
    </>
  ),

  kitchen: ({ size: [w, h, d], color, accent = '#d9d6cf' }) => {
    const doors = Math.round(w / 0.6)
    const dw = w / doors
    return (
      <>
        <B p={[0, 0.05, 0.02]} s={[w, 0.1, d - 0.06]} c={DARK} />
        <B p={[0, 0.47, 0]} s={[w, 0.74, d - 0.02]} c={color} rough={0.25} />
        {Array.from({ length: doors }, (_, i) => (
          <B key={i} p={[-w / 2 + dw * (i + 0.5), 0.47, d / 2 - 0.005]} s={[dw - 0.012, 0.72, 0.01]} c={color} rough={0.2} />
        ))}
        <B p={[0, 0.865, 0.01]} s={[w + 0.02, 0.03, d]} c={accent} rough={0.2} />
        {/* Bếp từ + chậu rửa */}
        <B p={[w / 4, 0.882, 0.02]} s={[0.6, 0.006, 0.5]} c="#111" rough={0.1} />
        <B p={[-w / 4, 0.875, 0.02]} s={[0.55, 0.012, 0.4]} c={METAL} metal={0.8} rough={0.3} />
        <Cyl p={[-w / 4, 1.0, -0.18]} r={0.015} h={0.24} c={METAL} metal={0.9} rough={0.2} />
        {/* Tủ trên */}
        <B p={[0, h - 0.35, -d / 2 + 0.18]} s={[w, 0.7, 0.35]} c={color} rough={0.25} />
        {Array.from({ length: doors }, (_, i) => (
          <B key={`u${i}`} p={[-w / 2 + dw * (i + 0.5), h - 0.35, -d / 2 + 0.36]} s={[dw - 0.012, 0.68, 0.01]} c={color} rough={0.2} />
        ))}
        <B p={[0, 1.2, -d / 2 + 0.005]} s={[w, 0.6, 0.01]} c="#e8e2d6" rough={0.15} />
      </>
    )
  },

  fridge: ({ size: [w, h, d], color }) => (
    <>
      <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} metal={0.6} rough={0.3} />
      <B p={[0, h / 2, d / 2 + 0.002]} s={[0.006, h - 0.04, 0.004]} c={DARK} />
      {[-1, 1].map((s) => (
        <B key={s} p={[s * 0.06, h * 0.6, d / 2 + 0.02]} s={[0.02, 0.5, 0.03]} c={DARK} />
      ))}
    </>
  ),

  bed: ({ size: [w, h, d], color, accent = '#c89f6e' }) => (
    <>
      <B p={[0, 0.17, 0.02]} s={[w, 0.22, d - 0.04]} c={color} />
      <Legs w={w} d={d} h={0.06} c={accent} />
      <B p={[0, 0.38, 0.04]} s={[w - 0.08, 0.2, d - 0.16]} c="#f6f4ef" rough={0.95} />
      {/* Chăn */}
      <B p={[0, 0.49, 0.32]} s={[w - 0.04, 0.04, d - 0.7]} c="#e6e0d4" rough={1} />
      <B p={[0, 0.5, d / 2 - 0.32]} s={[w - 0.02, 0.05, 0.42]} c={color} rough={1} />
      {[-1, 1].map((s) => (
        <B key={s} p={[s * w / 4.3, 0.55, -d / 2 + 0.3]} s={[w / 2.5, 0.13, 0.36]} c="#fbfaf7" rough={1} />
      ))}
      <B p={[0, h / 2 + 0.05, -d / 2 + 0.05]} s={[w + 0.06, h - 0.1, 0.1]} c={color} rough={0.95} />
    </>
  ),

  nightstand: ({ size: [w, h, d], color }) => (
    <>
      <B p={[0, h / 2 + 0.04, 0]} s={[w, h - 0.08, d]} c={color} rough={0.5} />
      <Legs w={w} d={d} h={0.08} c={color} inset={0.03} t={0.03} />
      <B p={[0, h / 2 + 0.08, d / 2 + 0.01]} s={[0.12, 0.015, 0.015]} c={DARK} />
      <Cyl p={[0.1, h + 0.02, -0.05]} r={0.06} h={0.04} c="#e9e4da" />
      <Cyl p={[0.1, h + 0.18, -0.05]} r={0.012} h={0.28} c="#b08d57" metal={0.5} />
      <mesh position={[0.1, h + 0.33, -0.05]}>
        <cylinderGeometry args={[0.07, 0.1, 0.12, 20, 1, true]} />
        <meshStandardMaterial color="#f1e6d0" side={2} emissive="#ffd9a0" emissiveIntensity={0.3} />
      </mesh>
    </>
  ),

  wardrobe: ({ size: [w, h, d], color }) => (
    <>
      <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} rough={0.5} />
      {[-1, 1].map((s) => (
        <B key={s} p={[s * w / 4, h / 2, d / 2 + (s > 0 ? 0.012 : 0.003)]} s={[w / 2, h - 0.04, 0.012]} c={color} rough={0.45} />
      ))}
      {[-1, 1].map((s) => (
        <B key={`h${s}`} p={[s * 0.06, h / 2, d / 2 + 0.03]} s={[0.015, 0.6, 0.015]} c={DARK} />
      ))}
    </>
  ),

  desk: ({ size: [w, h, d], color }) => (
    <>
      <B p={[0, h - 0.02, 0]} s={[w, 0.035, d]} c={color} rough={0.45} />
      {[-1, 1].map((s) => (
        <B key={s} p={[s * (w / 2 - 0.05), (h - 0.04) / 2, 0]} s={[0.04, h - 0.04, d - 0.06]} c={DARK} metal={0.5} rough={0.4} />
      ))}
      <B p={[w / 2 - 0.3, h - 0.2, 0]} s={[0.4, 0.3, d - 0.08]} c={color} />
      {/* Màn hình + laptop */}
      <B p={[-0.15, h + 0.26, -d / 2 + 0.15]} s={[0.6, 0.36, 0.025]} c="#141518" rough={0.2} />
      <B p={[-0.15, h + 0.05, -d / 2 + 0.16]} s={[0.04, 0.1, 0.04]} c={DARK} />
      <B p={[0.35, h + 0.008, 0.05]} s={[0.32, 0.012, 0.22]} c="#c9ccd0" metal={0.6} />
    </>
  ),

  officeChair: ({ size: [w, h, d], color }) => (
    <>
      <Cyl p={[0, 0.04, 0]} r={0.3} h={0.04} c={DARK} metal={0.5} rough={0.4} />
      <Cyl p={[0, 0.26, 0]} r={0.03} h={0.4} c={METAL} metal={0.8} rough={0.3} />
      <B p={[0, 0.48, 0]} s={[w - 0.08, 0.08, d - 0.08]} c={color} rough={0.8} />
      <B p={[0, 0.82, -d / 2 + 0.06]} s={[w - 0.12, 0.55, 0.05]} c={color} rough={0.8} />
      <B p={[0, h - 0.06, -d / 2 + 0.07]} s={[0.3, 0.1, 0.05]} c={color} rough={0.8} />
      {[-1, 1].map((s) => (
        <B key={s} p={[s * (w / 2 - 0.04), 0.65, 0]} s={[0.04, 0.03, 0.3]} c={DARK} />
      ))}
    </>
  ),

  vanity: ({ size: [w, h, d], color }) => (
    <>
      <B p={[0, h - 0.25, 0]} s={[w, 0.4, d]} c={color} rough={0.5} />
      <B p={[0, h - 0.03, 0]} s={[w, 0.06, d]} c="#f4f4f2" rough={0.15} />
      <Cyl p={[0, h + 0.1, -d / 2 + 0.05]} r={0.012} h={0.2} c={METAL} metal={0.9} rough={0.2} />
      <B p={[0, h + 0.55, -d / 2 + 0.01]} s={[w - 0.1, 0.7, 0.02]} c="#cfe0e8" metal={0.9} rough={0.05} />
    </>
  ),

  toilet: ({ size: [w, h, d], color }) => (
    <>
      <Cyl p={[0, 0.2, 0.06]} r={w * 0.42} rTop={w * 0.5} h={0.4} c={color} rough={0.15} />
      <B p={[0, 0.6, -d / 2 + 0.1]} s={[w, 0.4, 0.18]} c={color} rough={0.15} />
      <B p={[0, h - 0.19, -d / 2 + 0.1]} s={[w + 0.02, 0.02, 0.2]} c={color} rough={0.15} />
    </>
  ),

  shower: ({ size: [w, h, d], color }) => (
    <>
      <B p={[0, 0.04, 0]} s={[w, 0.08, d]} c="#f4f4f2" rough={0.2} />
      <B p={[0, h / 2, d / 2]} s={[w, h - 0.08, 0.01]} c="#cfe7f0" rough={0.05} opacity={0.3} />
      <B p={[w / 2, h / 2, 0]} s={[0.01, h - 0.08, d]} c="#cfe7f0" rough={0.05} opacity={0.3} />
      <B p={[w / 2, h / 2, d / 2]} s={[0.03, h, 0.03]} c={color} metal={0.8} rough={0.3} />
      <Cyl p={[-w / 2 + 0.08, h / 2 + 0.1, -d / 2 + 0.08]} r={0.012} h={h - 0.2} c={color} metal={0.8} rough={0.3} />
      <Cyl p={[-w / 2 + 0.18, h - 0.1, -d / 2 + 0.18]} r={0.1} h={0.02} c={color} metal={0.8} rough={0.3} />
    </>
  ),
}

export const FurnitureModel = ({ model, ...props }: ModelProps & { model: ModelKey }) => <>{models[model](props)}</>
