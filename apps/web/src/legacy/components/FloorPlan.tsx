import { houseBounds } from '../data/houses'
import type { House } from '../data/types'

interface Props {
  house: House
  activeRoomId?: string | null
  onRoomClick?: (id: string) => void
  showLabels?: boolean
}

const FLOOR_FILL = { wood: 'var(--plan-wood)', tile: 'var(--plan-tile)', stone: 'var(--plan-stone)' }

/** Mặt bằng 2D vẽ từ cùng dữ liệu với cảnh 3D. */
export const FloorPlan = ({ house, activeRoomId, onRoomClick, showLabels }: Props) => {
  const b = houseBounds(house)
  const pad = 0.4
  return (
    <svg
      className="plan"
      viewBox={`${b.minX - pad} ${b.minZ - pad} ${b.w + pad * 2} ${b.d + pad * 2}`}
      role="img"
      aria-label={`Mặt bằng ${house.name}`}
    >
      {house.rooms.map((r) => {
        const [x, z, w, d] = r.rect
        const active = r.id === activeRoomId
        return (
          <g key={r.id} className={onRoomClick ? 'plan-room clickable' : 'plan-room'} onClick={() => onRoomClick?.(r.id)}>
            <rect
              x={x}
              y={z}
              width={w}
              height={d}
              fill={active ? 'var(--accent-soft)' : FLOOR_FILL[r.floor]}
              stroke="var(--plan-wall)"
              strokeWidth={0.12}
            />
            {showLabels && (
              <text x={x + w / 2} y={z + d / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(w, d) * 0.16 + 0.15}>
                {r.name}
              </text>
            )}
          </g>
        )
      })}
      {house.openings.map((o, i) => {
        const [x1, y1, x2, y2] = o.axis === 'x' ? [o.from, o.at, o.to, o.at] : [o.at, o.from, o.at, o.to]
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={o.kind === 'door' ? 'var(--plan-bg)' : 'var(--plan-window)'}
            strokeWidth={o.kind === 'door' ? 0.14 : 0.08}
          />
        )
      })}
    </svg>
  )
}
