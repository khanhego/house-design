import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useParams } from 'react-router'
import '../styles/tokens.css'
import './viewer.css'
import { useHouse, useProject, hasWebGL2 } from './data.ts'
import type { Load } from './data.ts'
import { ProjectPage } from './ProjectPage.tsx'
import { HousePage } from './HousePage.tsx'
import { No3D, Unavailable } from './Fallback.tsx'
import { useToast } from './Toast.tsx'
import { BrandMark, Disclaimer, useBrand } from './Brand.tsx'
import { api } from '../lib/api.ts'
import type { Branding, PublicProjectInfo } from '@hd/core'
import { useEffect } from 'react'

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
  return <Status load={load} retry={() => setK((x) => x + 1)}>{(d) => <ProjectPage data={d} />}</Status>
}

const HouseRoute = () => {
  const { project = '', house = '' } = useParams()
  const [k, setK] = useState(0)
  const load = useHouse(project, house, k)
  const toast = useToast()
  const [webgl] = useState(hasWebGL2)
  return (
    <>
      <Status load={load} retry={() => setK((x) => x + 1)}>
        {(d) =>
          webgl ? (
            <HousePage data={d} backTo={`/v/${project}${location.search.includes('src=') ? `?src=${new URLSearchParams(location.search).get('src')}` : ''}`} toast={toast.show} />
          ) : (
            <No3D data={d} onPdf={() => void import('../lib/pdf.ts').then((m) => m.exportPlanPdf(d))} />
          )
        }
      </Status>
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
