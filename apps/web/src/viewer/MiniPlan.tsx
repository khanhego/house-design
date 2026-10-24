import { useMemo } from 'react'
import { planSvg } from '@hd/core'
import type { Floor } from '@hd/core'

/** Mặt bằng thu nhỏ; bấm phòng để chọn (FR-06.05). SVG do core sinh và đã escape (R-16). */
export const MiniPlan = ({ floor, roomId, onRoom, dims = false, scale = 200, className = 'mini-plan' }: {
  floor: Floor
  roomId: string | null
  onRoom: (roomId: string) => void
  dims?: boolean
  scale?: number
  className?: string
}) => {
  const svg = useMemo(() => planSvg(floor, { scaleDenominator: scale, showDimensions: dims, highlightRoomId: roomId }).svg, [floor, roomId, dims, scale])
  if (!svg) return null
  return (
    <div
      className={className}
      onClick={(e) => {
        const el = (e.target as Element).closest('[data-room-id]')
        const id = el?.getAttribute('data-room-id')
        if (id) onRoom(id)
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
