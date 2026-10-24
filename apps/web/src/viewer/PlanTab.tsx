import { useMemo, useRef, useState } from 'react'
import { floorGrossArea, formatArea, planSvg } from '@hd/core'
import type { Floor } from '@hd/core'

/** Tab Mặt bằng (FR-07.01–07.03): kéo, phóng to; bấm phòng → về 3D tại phòng đó. */
export const PlanTab = ({ floors, floorId, onFloor, onRoom, onPdf, pdfBusy }: {
  floors: Floor[]
  floorId: string
  onFloor: (id: string) => void
  onRoom: (floorId: string, roomId: string) => void
  onPdf: () => void
  pdfBusy: boolean
}) => {
  const floor = floors.find((f) => f.id === floorId) ?? floors[0]
  const plan = useMemo(() => planSvg(floor, { scaleDenominator: 70 }), [floor])
  const [z, setZ] = useState(1)
  const [pan, setPan] = useState<[number, number]>([0, 0])
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)
  const area = floorGrossArea(floor)

  return (
    <div className="plan-tab">
      <div className="plan-toolbar">
        <nav className="chips" aria-label="Chọn tầng">
          {floors.map((f) => (
            <button key={f.id} className={f.id === floor.id ? 'chip active' : 'chip'} onClick={() => (onFloor(f.id), setZ(1), setPan([0, 0]))}>
              {f.name}
            </button>
          ))}
        </nav>
        <span className="muted small hide-sm">Diện tích sàn {formatArea(area.m2)}</span>
        <div className="plan-zoom">
          <button className="icon-btn" onClick={() => setZ((v) => Math.max(0.5, v / 1.25))} aria-label="Thu nhỏ">−</button>
          <button className="icon-btn" onClick={() => setZ((v) => Math.min(6, v * 1.25))} aria-label="Phóng to">+</button>
          <button className="btn primary small" onClick={onPdf} disabled={pdfBusy}>{pdfBusy ? 'Đang tạo PDF…' : 'Tải PDF mặt bằng'}</button>
        </div>
      </div>
      {plan.empty ? (
        <p className="muted plan-empty">Tầng này chưa có mặt bằng.</p>
      ) : (
        <div
          className="plan-canvas"
          onWheel={(e) => setZ((v) => Math.min(6, Math.max(0.5, v * (e.deltaY < 0 ? 1.1 : 0.9))))}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, px: pan[0], py: pan[1], moved: false }
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const d = drag.current
            if (!d) return
            const dx = e.clientX - d.x
            const dy = e.clientY - d.y
            if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
            setPan([d.px + dx, d.py + dy])
          }}
          onPointerUp={(e) => {
            const d = drag.current
            drag.current = null
            if (d && !d.moved) {
              const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-room-id]')
              const id = el?.getAttribute('data-room-id')
              if (id) onRoom(floor.id, id)
            }
          }}
        >
          <div className="plan-svg" style={{ transform: `translate(${pan[0]}px, ${pan[1]}px) scale(${z})` }} dangerouslySetInnerHTML={{ __html: plan.svg }} />
        </div>
      )}
    </div>
  )
}
