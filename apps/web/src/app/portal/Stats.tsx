import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api.ts'
import { fmtInt } from '../../i18n/vi.ts'
import type { Me } from '../auth.tsx'
import { PageHead } from '../layout.tsx'
import { EmptyState, ErrorState, Skeleton } from '../ui.tsx'
import { ScopeFilters, qs, useFirstProject } from './filters.tsx'
import type { ScopeValue } from './filters.tsx'

interface StatsOut {
  range: { from: string; to: string }
  totals: { views: number; uniqueViewers: number; avgDurationSec: number; leads: number; leadRate: number }
  daily: { date: string; views: number; leads: number }[]
  topHouses: { id: string; name: string; views: number }[]
  topRooms: { houseName: string; roomName: string; selects: number }[]
  topItems: { name: string; opens: number }[]
  bySource: Record<string, number>
  byDevice: Record<string, number>
}

const ymd = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10)
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000))
const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} phút ${s % 60} giây` : `${s} giây`)
const pct = (r: number) => `${(r * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
const SOURCE: Record<string, string> = { link: 'Link', qr: 'QR', embed: 'Nhúng' }
const DEVICE: Record<string, string> = { mobile: 'Điện thoại', desktop: 'Máy tính', fallback: 'Dự phòng (không 3D)' }

/** Biểu đồ cột lượt xem theo ngày (một chuỗi, một trục; lead hiện trong chú thích khi rê chuột). */
const DailyChart = ({ daily }: { daily: StatsOut['daily'] }) => {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720
  const H = 180
  const pad = { l: 34, r: 8, t: 10, b: 22 }
  const max = Math.max(1, ...daily.map((d) => d.views))
  const nice = max <= 5 ? max : Math.ceil(max / 5) * 5
  const bw = (W - pad.l - pad.r) / daily.length
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice)
  const every = Math.ceil(daily.length / 8)
  const h = hover !== null ? daily[hover] : null
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Lượt xem theo ngày" onMouseLeave={() => setHover(null)}>
        {[...new Set([0, Math.round(nice / 2), nice])].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis">{fmtInt(v)}</text>
          </g>
        ))}
        {daily.map((d, i) => {
          const x = pad.l + i * bw
          const w = Math.max(1, bw - 2)
          const top = y(d.views)
          const hgt = H - pad.b - top
          return (
            <g key={d.date}>
              {d.views > 0 && <path className={`bar ${hover === i ? 'on' : ''}`} d={`M${x + 1},${H - pad.b} V${top + Math.min(3, hgt)} q0,-3 3,-3 H${x + 1 + w - 3} q3,0 3,3 V${H - pad.b} Z`} />}
              {i % every === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="axis">{dm(d.date)}</text>}
              <rect x={x} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          )
        })}
      </svg>
      <p className="chart-tip small" aria-live="polite">{h ? <><strong>{dm(h.date)}</strong> · {fmtInt(h.views)} lượt xem · {fmtInt(h.leads)} lead</> : 'Rê chuột lên cột để xem số theo ngày'}</p>
    </div>
  )
}

const Top = ({ title, rows }: { title: string; rows: [string, number][] }) => (
  <section className="card top">
    <h3>{title}</h3>
    {!rows.length ? <p className="muted small">Chưa có dữ liệu.</p> : (
      <ol>
        {rows.map(([k, v], i) => <li key={i}><span>{k}</span><span className="num">{fmtInt(v)}</span></li>)}
      </ol>
    )}
  </section>
)

/** C5 / A6 — Thống kê (FR-11.02, 11.03). */
export const StatsPage = ({ me }: { me: Me }) => {
  const approver = me.role === 'approver'
  const first = useFirstProject()
  const [scope, setScope] = useState<ScopeValue>({ clientId: '', projectId: '', houseId: '' })
  const [preset, setPreset] = useState<'7' | '30' | '90' | 'custom'>('30')
  const [custom, setCustom] = useState({ from: daysAgo(29), to: daysAgo(0) })
  useEffect(() => {
    if (approver && !scope.projectId && first.first) setScope((s) => ({ ...s, projectId: first.first }))
  }, [approver, first.first, scope.projectId])
  const range = preset === 'custom' ? custom : { from: daysAgo(Number(preset) - 1), to: daysAgo(0) }
  const filter = qs({ ...scope, ...range })
  const ready = !approver || !!scope.projectId
  const q = useQuery({ queryKey: ['stats', filter], queryFn: () => api<StatsOut>('GET', `stats?${filter}`), enabled: ready })

  if (approver && first.empty) return <EmptyState>Chưa có dự án nào. Nhà cung cấp sẽ thêm khi bắt đầu triển khai.</EmptyState>
  const s = q.data
  return (
    <>
      <PageHead title="Thống kê" actions={s && <a className="ab" href={`/api/v1/stats.csv?${filter}`}>Tải CSV</a>} />
      <div className="filters">
        <ScopeFilters me={me} value={scope} onChange={setScope} requireProject={approver} />
        <div className="seg" role="group" aria-label="Khoảng ngày">
          {(['7', '30', '90'] as const).map((p) => <button key={p} className={preset === p ? 'on' : ''} onClick={() => setPreset(p)}>{p} ngày</button>)}
          <button className={preset === 'custom' ? 'on' : ''} onClick={() => setPreset('custom')}>Tuỳ chọn</button>
        </div>
        {preset === 'custom' && (
          <>
            <label className="flt">Từ ngày<input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
            <label className="flt">Đến ngày<input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
          </>
        )}
      </div>
      {!ready || q.isLoading ? <Skeleton rows={6} /> : q.error ? <ErrorState error={q.error} retry={() => void q.refetch()} /> : s && s.totals.views === 0 ? (
        <EmptyState action={<Link className="ab ab-primary" to={approver ? '/portal' : scope.projectId ? `/studio/projects/${scope.projectId}` : '/studio/projects'}>Lấy link & QR</Link>}>
          Chưa có lượt xem. Chia sẻ link hoặc QR để bắt đầu.
        </EmptyState>
      ) : s && (
        <>
          <div className="tiles">
            <div className="tile"><span>Lượt xem</span><strong>{fmtInt(s.totals.views)}</strong></div>
            <div className="tile"><span>Người xem</span><strong>{fmtInt(s.totals.uniqueViewers)}</strong></div>
            <div className="tile"><span>Thời gian xem TB</span><strong>{dur(s.totals.avgDurationSec)}</strong></div>
            <div className="tile"><span>Lead</span><strong>{fmtInt(s.totals.leads)}</strong></div>
            <div className="tile"><span>Lead / lượt xem</span><strong>{pct(s.totals.leadRate)}</strong></div>
          </div>
          <section className="card">
            <h3>Lượt xem theo ngày</h3>
            <DailyChart daily={s.daily} />
          </section>
          <div className="tops">
            <Top title="Mẫu nhà xem nhiều" rows={s.topHouses.map((x) => [x.name, x.views])} />
            <Top title="Phòng được chọn nhiều" rows={s.topRooms.map((x) => [`${x.roomName} · ${x.houseName}`, x.selects])} />
            <Top title="Đồ được xem nhiều" rows={s.topItems.map((x) => [x.name, x.opens])} />
            <Top title="Theo nguồn (lượt xem)" rows={Object.entries(s.bySource).map(([k, v]) => [SOURCE[k] ?? k, v])} />
            <Top title="Theo thiết bị (lượt xem)" rows={Object.entries(s.byDevice).map(([k, v]) => [DEVICE[k] ?? k, v])} />
          </div>
        </>
      )}
    </>
  )
}
