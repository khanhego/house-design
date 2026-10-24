import { useMemo, useState } from 'react'
import { catalog, formatPrice } from '../data/catalog'
import type { House, Placement } from '../data/types'
import { HouseScene, type ViewMode } from '../three/HouseScene'
import type { WallMode } from '../three/Structure'
import { FloorPlan } from './FloorPlan'
import { houseTotal } from './HouseList'

interface Props {
  house: House
  onBack: () => void
}

const WALL_MODES: { id: WallMode; label: string }[] = [
  { id: 'cut', label: 'Tự cắt' },
  { id: 'low', label: 'Tường thấp' },
  { id: 'full', label: 'Đầy đủ' },
]

export const Viewer = ({ house, onBack }: Props) => {
  const [roomId, setRoomId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('orbit')
  const [wallMode, setWallMode] = useState<WallMode>('cut')
  const [night, setNight] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [variants, setVariants] = useState<Record<string, string>>({})

  const room = house.rooms.find((r) => r.id === roomId) ?? null
  const selected = useMemo(() => {
    for (const r of house.rooms) {
      const pl = r.placements.find((p) => p.id === selectedId)
      if (pl) return { room: r, placement: pl }
    }
    return null
  }, [house, selectedId])

  const listed: Placement[] = room ? room.placements : house.rooms.flatMap((r) => r.placements)
  const listTotal = listed.reduce((s, p) => s + catalog[p.productId].price, 0)

  const focusRoom = (id: string | null) => {
    setRoomId(id)
    if (!id) setViewMode('orbit')
  }

  // Chọn từ danh sách ở chế độ toàn cảnh thì đưa camera tới phòng chứa món đó
  const selectFromList = (id: string) => {
    setSelectedId(id)
    if (!roomId) setRoomId(house.rooms.find((r) => r.placements.some((p) => p.id === id))?.id ?? null)
  }

  const enterInside = () => {
    if (!roomId) setRoomId(house.rooms[0].id)
    setViewMode('inside')
    setAutoRotate(false)
  }

  const product = selected ? catalog[selected.placement.productId] : null
  const activeVariant = product && (variants[selected!.placement.id] ?? product.variants[0].id)

  return (
    <div className="viewer">
      <header className="topbar">
        <button className="btn ghost" onClick={onBack}>
          ← Chọn nhà khác
        </button>
        <div className="title">
          <strong>{house.name}</strong>
          <span className="muted">
            {house.type} · {house.area} m² · {house.style}
          </span>
        </div>
        <div className="topbar-total">
          <span className="muted">Trọn gói nội thất</span>
          <strong>{formatPrice(houseTotal(house))}</strong>
        </div>
      </header>

      <div className="stage">
        <HouseScene
          house={house}
          roomId={roomId}
          viewMode={viewMode}
          wallMode={wallMode}
          night={night}
          autoRotate={autoRotate}
          selectedId={selectedId}
          variants={variants}
          onSelect={setSelectedId}
          onFocusRoom={focusRoom}
        />

        <aside className="panel left">
          <div className="panel-section">
            <h3>Phòng</h3>
            <div className="plan-mini">
              <FloorPlan house={house} activeRoomId={roomId} onRoomClick={focusRoom} />
            </div>
            <div className="room-list">
              <button className={!roomId ? 'pill active' : 'pill'} onClick={() => focusRoom(null)}>
                Toàn cảnh
              </button>
              {house.rooms.map((r) => (
                <button key={r.id} className={roomId === r.id ? 'pill active' : 'pill'} onClick={() => focusRoom(r.id)}>
                  {r.name}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <h3>Góc nhìn</h3>
            <div className="segmented">
              <button className={viewMode === 'orbit' ? 'active' : ''} onClick={() => setViewMode('orbit')}>
                Xoay 3D
              </button>
              <button className={viewMode === 'inside' ? 'active' : ''} onClick={enterInside}>
                Đứng trong phòng
              </button>
            </div>
            {viewMode === 'orbit' && (
              <>
                <h4>Tường</h4>
                <div className="segmented">
                  {WALL_MODES.map((m) => (
                    <button key={m.id} className={wallMode === m.id ? 'active' : ''} onClick={() => setWallMode(m.id)}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="toggles">
              <label>
                <input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)} /> Ánh sáng buổi tối
              </label>
              {viewMode === 'orbit' && (
                <label>
                  <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} /> Tự động xoay
                </label>
              )}
            </div>
          </div>
        </aside>

        <aside className="panel right">
          {product && selected ? (
            <div className="product">
              <button className="close" aria-label="Đóng" onClick={() => setSelectedId(null)}>
                ×
              </button>
              <span className="chip">{product.category}</span>
              <h2>{product.name}</h2>
              <div className="price">{formatPrice(product.price)}</div>
              <p>{product.description}</p>
              <dl className="specs">
                <div>
                  <dt>Kích thước (R×C×S)</dt>
                  <dd>{product.size.map((n) => Math.round(n * 100)).join(' × ')} cm</dd>
                </div>
                <div>
                  <dt>Chất liệu</dt>
                  <dd>{product.material}</dd>
                </div>
                <div>
                  <dt>Vị trí</dt>
                  <dd>{selected.room.name}</dd>
                </div>
              </dl>
              <h4>Màu sắc / hoàn thiện</h4>
              <div className="swatches">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    className={activeVariant === v.id ? 'swatch active' : 'swatch'}
                    onClick={() => setVariants((s) => ({ ...s, [selected.placement.id]: v.id }))}
                    title={v.name}
                  >
                    <span style={{ background: v.color }} />
                    {v.name}
                  </button>
                ))}
              </div>
              <button className="btn primary block" onClick={() => alert('Demo: form liên hệ tư vấn sẽ mở ở đây.')}>
                Nhận tư vấn món này
              </button>
            </div>
          ) : (
            <div className="inventory">
              <h3>Nội thất {room ? `· ${room.name}` : 'trong nhà'}</h3>
              <p className="muted small">Bấm vào món đồ trong cảnh 3D hoặc trong danh sách để xem chi tiết.</p>
              <ul>
                {listed.map((pl) => {
                  const pr = catalog[pl.productId]
                  const v = pr.variants.find((x) => x.id === variants[pl.id]) ?? pr.variants[0]
                  return (
                    <li key={pl.id}>
                      <button onClick={() => selectFromList(pl.id)}>
                        <span className="dot" style={{ background: v.color }} />
                        <span className="name">{pr.name}</span>
                        <span className="muted">{formatPrice(pr.price)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="total">
                <span>Tổng</span>
                <strong>{formatPrice(listTotal)}</strong>
              </div>
            </div>
          )}
        </aside>

        <div className="hint">
          {viewMode === 'orbit'
            ? 'Kéo để xoay · Cuộn để phóng to · Chuột phải để di chuyển · Nhấp đúp sàn để vào phòng'
            : 'Kéo để nhìn quanh phòng · Bấm vào món đồ để xem chi tiết'}
        </div>
      </div>
    </div>
  )
}
