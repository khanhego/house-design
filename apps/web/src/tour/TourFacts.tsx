import { formatPriceVnd } from '@hd/core'
import type { HouseMeta } from '@hd/core'

/** Khối thông số căn nhà (CR-3, FR-12.20): giá, diện tích, phòng, vị trí, điểm nổi bật. */
export const TourFacts = ({ house, location, floors, compact }: { house: HouseMeta; location?: string | null; floors?: number; compact?: boolean }) => {
  const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
  const facts: [string, string][] = [
    ['Diện tích sàn', `${fmt(house.declaredArea)} m²`],
    ...(house.landArea ? ([['Diện tích đất', `${fmt(house.landArea)} m²`]] as [string, string][]) : []),
    ['Phòng ngủ', String(house.bedrooms)],
    ['Phòng tắm', String(house.bathrooms)],
    ...(floors ? ([['Số tầng', String(floors)]] as [string, string][]) : []),
  ]
  return (
    <div className={`facts${compact ? ' facts-compact' : ''}`}>
      <p className="facts-price">{formatPriceVnd(house.price) ?? 'Giá: liên hệ'}</p>
      {location && <p className="facts-loc">{location}</p>}
      <dl>
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {!compact && (house.features?.length ?? 0) > 0 && (
        <ul className="facts-features">
          {house.features!.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
    </div>
  )
}
