import { catalog, formatPrice } from '../data/catalog'
import { houses } from '../data/houses'
import type { House } from '../data/types'
import { FloorPlan } from './FloorPlan'

export const houseTotal = (house: House) =>
  house.rooms.reduce((sum, r) => sum + r.placements.reduce((s, p) => s + catalog[p.productId].price, 0), 0)

export const HouseList = ({ onOpen }: { onOpen: (id: string) => void }) => (
  <div className="home">
    <header className="hero">
      <div className="brand">Nội Thất 3D</div>
      <h1>Bước vào ngôi nhà của bạn trước khi nó được hoàn thiện</h1>
      <p>Chọn một mẫu nhà, xoay 360°, mở từng phòng và xem chi tiết từng món nội thất: chất liệu, kích thước, màu sắc và giá.</p>
    </header>

    <section className="grid">
      {houses.map((h) => (
        <article key={h.id} className="card" onClick={() => onOpen(h.id)}>
          <div className="card-plan">
            <FloorPlan house={h} showLabels />
          </div>
          <div className="card-body">
            <div className="chips">
              <span className="chip">{h.type}</span>
              <span className="chip">{h.style}</span>
            </div>
            <h2>{h.name}</h2>
            <p className="muted">{h.tagline}</p>
            <dl className="specs">
              <div>
                <dt>Diện tích</dt>
                <dd>{h.area} m²</dd>
              </div>
              <div>
                <dt>Phòng ngủ</dt>
                <dd>{h.bedrooms}</dd>
              </div>
              <div>
                <dt>Trọn gói nội thất</dt>
                <dd>{formatPrice(houseTotal(h))}</dd>
              </div>
            </dl>
            <button className="btn primary">Xem nhà 3D →</button>
          </div>
        </article>
      ))}
    </section>
  </div>
)
