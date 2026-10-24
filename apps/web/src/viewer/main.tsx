import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useParams } from 'react-router'
import '../styles/tokens.css'
import './viewer.css'
import { useHouse, useProject, hasWebGL2, sourceFromUrl } from './data.ts'
import type { Load } from './data.ts'
import { ProjectPage } from './ProjectPage.tsx'
import { HousePage } from './HousePage.tsx'
import { No3D, Unavailable } from './Fallback.tsx'
import { useToast } from './Toast.tsx'
import { BrandMark, Disclaimer, useBrand } from './Brand.tsx'
import { api } from '../lib/api.ts'
import { hasTour } from '@hd/core'
import type { Branding, PublicHousePayload, PublicProjectInfo, PublicProjectPayload } from '@hd/core'
import { useEffect } from 'react'
import { createTracker } from '../lib/tracker.ts'
import type { Tracker } from '../lib/tracker.ts'
import { LeadDrawer } from './LeadDrawer.tsx'
import type { LeadContext } from './LeadDrawer.tsx'

const SOURCE = sourceFromUrl()
const WEBGL = hasWebGL2()
const DEVICE = !WEBGL ? 'fallback' : matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop'

/** Một tracker cho mỗi dự án đang xem (FR-11.01). */
const useTracker = (projectSlug: string) => {
  const t = useMemo(() => createTracker({ projectSlug, source: SOURCE, deviceClass: DEVICE }), [projectSlug])
  useEffect(() => t.start(), [t])
  return t
}

/** Form lead dùng chung cho V1, V2, V4. */
const useLead = (tracker: Tracker, data: PublicProjectPayload | PublicHousePayload | null) => {
  const [ctx, setCtx] = useState<LeadContext | null>(null)
  const node = ctx && data && data.antiBot ? (
    <LeadDrawer
      project={data.project}
      branding={data.branding}
      antiBot={data.antiBot}
      context={ctx}
      source={SOURCE}
      deviceId={tracker.deviceId}
      onClose={() => setCtx(null)}
      onSent={() => tracker.track('lead_submit', { houseSlug: ctx.houseSlug })}
    />
  ) : null
  return { open: setCtx, node }
}

const Status = <T,>({ load, retry, children }: { load: Load<T>; retry: () => void; children: (d: T) => React.ReactNode }) => {
  if (load.state === 'loading') return <div className="v-splash"><div className="spinner" />Đang tải…</div>
  if (load.state === 'unavailable') return <Unavailable contact={load.contact} />
  if (load.state === 'notfound') return <Unavailable contact={null} />
  if (load.state === 'error')
    return (
      <div className="v-splash">
        <p>Không tải được dự án. Kiểm tra kết nối rồi thử lại.</p>
        <button className="btn primary" onClick={retry}>Thử lại</button>
      </div>
    )
  return <>{children(load.data)}</>
}

const ProjectRoute = () => {
  const { project = '' } = useParams()
  const [k, setK] = useState(0)
  const load = useProject(project, k)
  const tracker = useTracker(project)
  const data = load.state === 'ok' ? load.data : null
  const lead = useLead(tracker, data)
  useEffect(() => {
    if (data) tracker.track('project_open')
  }, [data, tracker])
  return (
    <>
      <Status load={load} retry={() => setK((x) => x + 1)}>
        {(d) => <ProjectPage data={d} onLead={() => lead.open({})} onContact={(kind) => tracker.track('contact_click', { targetId: kind })} />}
      </Status>
      {lead.node}
    </>
  )
}

const HouseRoute = () => {
  const { project = '', house = '' } = useParams()
  const [k, setK] = useState(0)
  const load = useHouse(project, house, k)
  const toast = useToast()
  const tracker = useTracker(project)
  const data = load.state === 'ok' ? load.data : null
  const lead = useLead(tracker, data)
  useEffect(() => {
    if (!data) return
    tracker.track('house_open', { houseSlug: house })
    if (!WEBGL) tracker.track('fallback_shown', { houseSlug: house })
  }, [data, tracker, house])
  const ev = (type: Parameters<Tracker['track']>[0]) => (targetId?: string | null) => tracker.track(type, { houseSlug: house, targetId: targetId ?? undefined })
  const openLead = (c: { floorId?: string; roomId?: string; sceneId?: string } = {}) => data && lead.open({ houseSlug: house, houseName: data.house.name, ...c })
  return (
    <>
      <Status load={load} retry={() => setK((x) => x + 1)}>
        {(d) =>
          WEBGL || hasTour(d.document) ? (
            <HousePage
              data={d}
              backTo={`/v/${project}${SOURCE !== 'link' ? `?src=${SOURCE}` : ''}`}
              toast={toast.show}
              onLead={openLead}
              events={{
                floor: ev('floor_select'), room: ev('room_select'), walk: ev('walk_mode'), item: ev('item_open'),
                plan: () => ev('plan_open')(), pdf: () => ev('pdf_download')(), contact: (kind) => ev('contact_click')(kind),
                tourOpen: () => ev('tour_open')(), tourScene: (id) => ev('tour_scene')(id), tourComplete: () => ev('tour_complete')(),
              }}
              no3d={!WEBGL}
            />
          ) : (
            <No3D data={d} onLead={() => openLead()} onPdf={() => (ev('pdf_download')(), void import('../lib/pdf.ts').then((m) => m.exportPlanPdf(d)))} />
          )
        }
      </Status>
      {lead.node}
      {toast.node}
    </>
  )
}

/** V5 — chính sách xử lý dữ liệu (NFR-04). */
const PrivacyRoute = () => {
  const { project = '' } = useParams()
  const [d, setD] = useState<{ project: PublicProjectInfo; branding: Branding; policy: string | null } | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    api<{ project: PublicProjectInfo; branding: Branding; policy: string | null }>('GET', `/api/v1/public/projects/${project}/privacy`).then(setD).catch(() => setErr(true))
  }, [project])
  useBrand(d?.branding)
  if (err) return <Unavailable contact={null} />
  if (!d) return <div className="v-splash"><div className="spinner" />Đang tải…</div>
  return (
    <main className="v5">
      <BrandMark b={d.branding} />
      <h1>Chính sách xử lý dữ liệu cá nhân</h1>
      <p className="muted">{d.project.name} · {d.branding.name}</p>
      {(d.policy ?? '').split(/\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
      {!d.policy && <DefaultPolicy />}
      <Disclaimer text={d.project.disclaimer} branding={d.branding} />
    </main>
  )
}

const DefaultPolicy = () => (
  <>
    <p>Chúng tôi thu thập họ tên, số điện thoại, email và nhu cầu bạn để lại để liên hệ tư vấn về dự án.</p>
    <p>Thông tin chỉ được chủ dự án và đơn vị vận hành trang này sử dụng cho mục đích tư vấn, không bán cho bên thứ ba.</p>
    <p>Trang có ghi nhận lượt xem ẩn danh (mã thiết bị ngẫu nhiên lưu trên trình duyệt của bạn) để thống kê; mã này được liên kết với thông tin bạn để lại khi bạn gửi form.</p>
    <p>Bạn có thể yêu cầu xoá thông tin bất kỳ lúc nào qua số điện thoại liên hệ của dự án.</p>
  </>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/v/:project" element={<ProjectRoute />} />
        <Route path="/v/:project/chinh-sach-du-lieu" element={<PrivacyRoute />} />
        <Route path="/v/:project/:house" element={<HouseRoute />} />
        <Route path="*" element={<Unavailable contact={null} />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
