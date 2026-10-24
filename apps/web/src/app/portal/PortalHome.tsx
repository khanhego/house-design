import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api.ts'
import { vi } from '../../i18n/vi.ts'
import type { Me } from '../auth.tsx'
import { PageHead } from '../layout.tsx'
import { ShareBox } from '../share.tsx'
import { Badge, Button, EmptyState, ErrorState, Modal, Skeleton } from '../ui.tsx'
import type { ProjectRow } from '../types.ts'

type HouseCard = NonNullable<ProjectRow['houses']>[number]

const status = (h: HouseCard) =>
  h.latestVersion?.state === 'pending_review'
    ? <Badge tone="warn">Chờ bạn duyệt</Badge>
    : h.published
      ? <Badge tone="ok">Đã phát hành · phiên bản {h.published.number}</Badge>
      : <Badge>Đang dựng</Badge>

/** C2 — Dự án của tôi (FR-09.02, 09.03): mẫu nhà + trạng thái, link, mã nhúng, QR. */
export const PortalHome = (_p: { me: Me }) => {
  const q = useQuery({ queryKey: ['projects'], queryFn: () => api<{ items: ProjectRow[] }>('GET', 'projects') })
  const [share, setShare] = useState<{ path: string; label: string } | null>(null)
  if (q.isLoading) return <Skeleton rows={5} />
  if (q.error) return <ErrorState error={q.error} retry={() => void q.refetch()} />
  const items = q.data!.items
  return (
    <>
      <PageHead title="Dự án của tôi" />
      {!items.length && <EmptyState>Chưa có dự án nào. Nhà cung cấp sẽ thêm khi bắt đầu triển khai.</EmptyState>}
      {items.map((p) => {
        const houses = [...(p.houses ?? [])].sort((a, b) => Number(b.latestVersion?.state === 'pending_review') - Number(a.latestVersion?.state === 'pending_review'))
        return (
          <section key={p.id} className="card portal-project">
            <header className="row-head">
              <div>
                <h2>{p.name}</h2>
                {p.location && <p className="muted small">{p.location}</p>}
              </div>
              <Button small onClick={() => setShare({ path: p.publicUrl, label: p.name })}>Link · Mã nhúng · QR</Button>
            </header>
            {!houses.length && <p className="muted">Chưa có mẫu nhà.</p>}
            <ul className="portal-houses">
              {houses.map((h) => (
                <li key={h.id} className={h.latestVersion?.state === 'pending_review' ? 'hot' : ''}>
                  {h.coverUrl ? <img src={h.coverUrl} alt="" /> : <span className="ph" />}
                  <div className="grow">
                    <strong>{h.name}</strong>
                    <span className="muted small">{vi.houseType[h.houseType]}</span>
                    {status(h)}
                  </div>
                  <div className="portal-actions">
                    {h.latestVersion?.state === 'pending_review' && <Link className="ab ab-sm ab-primary" to={`/portal/review/${h.latestVersion.id}`}>Xem & duyệt</Link>}
                    {h.published && (
                      <>
                        <a className="ab ab-sm" href={`/v/${p.slug}/${h.slug}`} target="_blank" rel="noreferrer">Mở trang xem</a>
                        <Button small onClick={() => setShare({ path: `/v/${p.slug}/${h.slug}`, label: h.name })}>Chia sẻ</Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {share && <Modal title={`Chia sẻ ${share.label}`} onClose={() => setShare(null)} wide><div className="am-body"><ShareBox path={share.path} label={share.label} /></div></Modal>}
    </>
  )
}
