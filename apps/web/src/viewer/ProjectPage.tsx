import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { PublicProjectPayload } from '@hd/core'
import { fmtArea, vi } from '../i18n/vi.ts'
import { BrandMark, Disclaimer, useBrand } from './Brand.tsx'
import { ContactMenu } from './Contact.tsx'

/** V1 — trang dự án (FR-06.01). */
export const ProjectPage = ({ data, onLead, onContact }: { data: PublicProjectPayload; onLead?: () => void; onContact?: (k: 'call' | 'zalo' | 'form') => void }) => {
  useBrand(data.branding)
  const [filter, setFilter] = useState<string>('all')
  const types = useMemo(() => [...new Set(data.houses.map((h) => h.houseType))], [data.houses])
  const shown = filter === 'all' ? data.houses : data.houses.filter((h) => h.houseType === filter)
  const search = location.search

  return (
    <div className="v1">
      <header className="v1-top">
        <BrandMark b={data.branding} />
        <ContactMenu project={data.project} onLead={onLead} onClick={onContact} />
      </header>
      <section className="v1-hero">
        {data.project.coverUrl && <img className="v1-cover" src={data.project.coverUrl} alt="" />}
        <div className="v1-intro">
          <h1>{data.project.name}</h1>
          {data.project.location && <p className="v1-loc">{data.project.location}</p>}
          {data.project.description && <p className="v1-desc">{data.project.description}</p>}
        </div>
      </section>

      {data.houses.length === 0 ? (
        <section className="v1-empty">
          <p>Dự án đang cập nhật mẫu nhà. Để lại số điện thoại để nhận thông báo khi có.</p>
          {onLead && <button className="btn primary" onClick={onLead}>Liên hệ tư vấn</button>}
        </section>
      ) : (
        <>
          {types.length > 1 && (
            <nav className="chips" aria-label="Lọc theo loại nhà">
              {['all', ...types].map((t) => (
                <button key={t} className={filter === t ? 'chip active' : 'chip'} onClick={() => setFilter(t)} aria-pressed={filter === t}>
                  {vi.houseTypePlural[t] ?? t}
                </button>
              ))}
            </nav>
          )}
          {shown.length === 0 ? (
            <p className="v1-empty">
              Chưa có mẫu {vi.houseType[filter]?.toLowerCase()} trong dự án này. <button className="link" onClick={() => setFilter('all')}>Xem tất cả</button>
            </p>
          ) : (
            <section className="v1-grid">
              {shown.map((h) => (
                <Link key={h.slug} className="house-card" to={`/v/${data.project.slug}/${h.slug}${search}`}>
                  <div className="house-card-img">{h.coverUrl ? <img src={h.coverUrl} alt="" loading="lazy" /> : null}</div>
                  <div className="house-card-body">
                    <span className="modes">
                      <span className="tag">{vi.houseType[h.houseType]}</span>
                      {h.modes?.includes('3d') && <span className="tag">3D</span>}
                      {h.modes?.includes('tour') && <span className="tag">Ảnh thật</span>}
                    </span>
                    <h2>{h.name}</h2>
                    <p className="muted">
                      {fmtArea(h.declaredArea)} · {h.bedrooms} PN{h.floors ? ` · ${h.floors} tầng` : ''}
                    </p>
                    <span className="btn primary small">{h.modes?.includes('3d') === false ? 'Xem ảnh thật' : 'Xem 3D'}</span>
                  </div>
                </Link>
              ))}
            </section>
          )}
        </>
      )}
      <Disclaimer text={data.project.disclaimer} branding={data.branding} />
    </div>
  )
}
