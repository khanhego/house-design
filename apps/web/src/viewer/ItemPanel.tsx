import type { PlacedItem, ResolvedLibraryItem } from '@hd/core'
import { fmtInt } from '../i18n/vi.ts'

export interface ItemView {
  item: PlacedItem
  name: string
  sizeMm: [number, number, number] | null
  material?: string
  brand?: string
  description?: string
  imageUrls: string[]
  lib: ResolvedLibraryItem | null
  roomName: string | null
}

/** Chi tiết đồ (FR-06.08, FR-05.05). */
export const ItemPanel = ({ view, variantId, onVariant, onClose }: {
  view: ItemView
  variantId?: string
  onVariant: (id: string) => void
  onClose: () => void
}) => {
  const variants = view.lib?.variants ?? []
  const active = variantId ?? view.item.variantId ?? variants[0]?.id
  return (
    <div className="item-panel">
      <button className="close" aria-label="Đóng" onClick={onClose}>×</button>
      {view.imageUrls[0] && <img className="item-img" src={view.imageUrls[0]} alt="" />}
      <h3>{view.name}</h3>
      {view.roomName && <p className="muted small">{view.roomName}</p>}
      <dl className="specs">
        {view.sizeMm && (
          <div>
            <dt>Kích thước (R × C × S)</dt>
            <dd>{view.sizeMm.map((n) => fmtInt(n)).join(' × ')} mm</dd>
          </div>
        )}
        {view.material && (
          <div>
            <dt>Chất liệu</dt>
            <dd>{view.material}</dd>
          </div>
        )}
        {view.brand && (
          <div>
            <dt>Thương hiệu</dt>
            <dd>{view.brand}</dd>
          </div>
        )}
      </dl>
      {view.description && <p className="item-desc">{view.description}</p>}
      {variants.length > 1 && (
        <>
          <h4>Màu sắc / hoàn thiện</h4>
          <div className="swatches">
            {variants.map((v) => (
              <button key={v.id} className={active === v.id ? 'swatch active' : 'swatch'} onClick={() => onVariant(v.id)} aria-pressed={active === v.id}>
                <span style={{ background: v.color }} />
                {v.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
