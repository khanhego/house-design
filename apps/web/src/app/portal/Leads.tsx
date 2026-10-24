import { useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api.ts'
import { fmtDateTime } from '../../i18n/vi.ts'
import type { Me } from '../auth.tsx'
import { PageHead } from '../layout.tsx'
import { Badge, Button, Confirm, EmptyState, ErrorState, Skeleton, errMsg, toast } from '../ui.tsx'
import { ScopeFilters, qs } from './filters.tsx'
import type { ScopeValue } from './filters.tsx'

interface LeadOut {
  id: string
  createdAt: string
  lastContactAt: string
  name: string | null
  phone: string
  email: string | null
  interest: string | null
  message: string | null
  house: { id: string; name: string | null } | null
  context: { floorName: string | null; roomName: string | null }
  source: 'link' | 'qr' | 'embed'
  contactCount: number
  status: 'new' | 'contacted'
}

const INTEREST: Record<string, string> = { live: 'Mua để ở', invest: 'Đầu tư', interior: 'Tư vấn nội thất', other: 'Khác' }
const SOURCE: Record<string, string> = { link: 'Link', qr: 'QR', embed: 'Nhúng' }

/** C4 / A6 — Lead (FR-10.05, NFR-04). */
export const LeadsPage = ({ me }: { me: Me }) => {
  const qc = useQueryClient()
  const [scope, setScope] = useState<ScopeValue>({ clientId: '', projectId: new URLSearchParams(location.search).get('project') ?? '', houseId: '' })
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('')
  const [del, setDel] = useState<LeadOut | null>(null)
  const filter = qs({ ...scope, from, to, status })
  const q = useInfiniteQuery({
    queryKey: ['leads', filter],
    queryFn: ({ pageParam }) => api<{ items: LeadOut[]; nextCursor: string | null }>('GET', `leads?${qs({ ...scope, from, to, status, limit: 50, cursor: pageParam })}`),
    initialPageParam: null as string | null,
    getNextPageParam: (p) => p.nextCursor,
  })
  const items = q.data?.pages.flatMap((p) => p.items) ?? []
  const refresh = () => qc.invalidateQueries({ queryKey: ['leads'] })

  const mark = async (l: LeadOut, s: 'new' | 'contacted') => {
    try {
      await api('PATCH', `leads/${l.id}`, { status: s })
      await refresh()
    } catch (e) {
      toast(errMsg(e), 'danger')
    }
  }
  const remove = async () => {
    try {
      await api('DELETE', `leads/${del!.id}`)
      toast('Đã xoá lead')
      setDel(null)
      await refresh()
    } catch (e) {
      toast(errMsg(e), 'danger')
    }
  }

  return (
    <>
      <PageHead title="Lead" actions={<a className="ab" href={`/api/v1/leads.csv?${filter}`}>Tải CSV</a>} />
      <div className="filters">
        <ScopeFilters me={me} value={scope} onChange={setScope} />
        <label className="flt">Từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flt">Đến ngày<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="flt">Trạng thái
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="new">Mới</option>
            <option value="contacted">Đã liên hệ</option>
          </select>
        </label>
      </div>
      {q.isLoading ? <Skeleton rows={6} /> : q.error ? <ErrorState error={q.error} retry={() => void q.refetch()} /> : !items.length ? (
        <EmptyState>Chưa có lead nào trong khoảng thời gian này.</EmptyState>
      ) : (
        <div className="card tbl-wrap">
          <table className="tbl leads">
            <thead>
              <tr><th>Thời điểm</th><th>Khách</th><th>Quan tâm</th><th>Mẫu nhà · phòng</th><th>Nguồn</th><th className="num">Lần</th><th>Trạng thái</th><th /></tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} className={l.status === 'new' ? 'is-new' : ''}>
                  <td className="nowrap">{fmtDateTime(l.lastContactAt)}</td>
                  <td>
                    <strong>{l.name ?? '—'}</strong>
                    <div className="selectable">{l.phone}</div>
                    {l.email && <div className="muted small">{l.email}</div>}
                    {l.message && <div className="small msg">“{l.message}”</div>}
                  </td>
                  <td>{l.interest ? INTEREST[l.interest] : '—'}</td>
                  <td>{l.house?.name ?? '—'}{l.context.roomName && <div className="muted small">{[l.context.floorName, l.context.roomName].filter(Boolean).join(' · ')}</div>}</td>
                  <td>{SOURCE[l.source]}</td>
                  <td className="num">{l.contactCount}</td>
                  <td>{l.status === 'new' ? <Badge tone="warn">Mới</Badge> : <Badge tone="ok">Đã liên hệ</Badge>}</td>
                  <td className="right nowrap">
                    {l.status === 'new'
                      ? <Button small onClick={() => void mark(l, 'contacted')}>Đã liên hệ</Button>
                      : <Button small kind="ghost" onClick={() => void mark(l, 'new')}>Đánh dấu mới</Button>}
                    <Button small kind="ghost" onClick={() => setDel(l)} aria-label="Xoá lead">Xoá</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.hasNextPage && <div className="right"><Button small disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>{q.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}</Button></div>}
        </div>
      )}
      {del && (
        <Confirm title="Xoá lead" danger confirmLabel="Xoá vĩnh viễn" onClose={() => setDel(null)} onConfirm={() => void remove()}
          message={<p>Xoá vĩnh viễn thông tin của {del.name ?? del.phone}? Không khôi phục được.</p>} />
      )}
    </>
  )
}
