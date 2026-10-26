import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Check } from '@hd/core'
import { api } from '../../../lib/api.ts'
import { fmtDateTime } from '../../../i18n/vi.ts'
import type { Me } from '../../auth.tsx'
import { Button, Modal, StateBadge, errMsg, toast } from '../../ui.tsx'
import type { FileOut, HouseRow, VersionDetail } from '../../types.ts'
import { useEditor } from './store.ts'
import type { Tab, Tool } from './store.ts'
import { useAutosave } from './useAutosave.ts'
import { PlanCanvas } from './PlanCanvas.tsx'
import type { FileInfo } from './PlanCanvas.tsx'
import { Inspector } from './Inspector.tsx'
import { FloorList } from './FloorList.tsx'
import { HouseInfoDialog } from './HouseInfo.tsx'

const ModelTab = lazy(() => import('./ModelTab.tsx').then((m) => ({ default: m.ModelTab })))
const ItemsTab = lazy(() => import('./ItemsTab.tsx').then((m) => ({ default: m.ItemsTab })))
const FinishTab = lazy(() => import('./FinishTab.tsx').then((m) => ({ default: m.FinishTab })))
const ViewsTab = lazy(() => import('./ViewsTab.tsx').then((m) => ({ default: m.ViewsTab })))
const TourTab = lazy(() => import('./TourTab.tsx').then((m) => ({ default: m.TourTab })))

const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'select', label: 'Chọn', key: 'v', hint: 'Chọn, kéo đỉnh; kéo nền để di chuyển khung nhìn' },
  { id: 'calibrate', label: 'Tỷ lệ', key: 'c', hint: 'Vẽ một đoạn trùng kích thước đã biết trên ảnh nền rồi nhập số mm' },
  { id: 'wall', label: 'Tường', key: 'w', hint: 'Bấm liên tiếp để vẽ; Enter hoặc nhấp đúp để kết thúc' },
  { id: 'room', label: 'Phòng', key: 'r', hint: 'Bấm các góc trong của phòng; bấm lại điểm đầu hoặc Enter để khép' },
  { id: 'door', label: 'Cửa đi', key: 'd', hint: 'Bấm lên tường' },
  { id: 'window', label: 'Cửa sổ', key: 'n', hint: 'Bấm lên tường' },
  { id: 'stair', label: 'Cầu thang', key: 's', hint: 'Bấm hai góc đối diện' },
  { id: 'area', label: 'Ngoài nhà', key: 'a', hint: 'Sân, vườn, hồ bơi, ban công: vẽ đa giác' },
  { id: 'outline', label: 'Đường bao', key: 'o', hint: 'Vẽ mép ngoài tường bao để tính diện tích sàn' },
  { id: 'measure', label: 'Đo', key: 'm', hint: 'Bấm hai điểm' },
]

const TABS: { id: Tab; label: string }[] = [
  { id: 'frame', label: 'Khung' },
  { id: 'model', label: 'Mô hình' },
  { id: 'items', label: 'Đồ' },
  { id: 'finish', label: 'Vật liệu & ánh sáng' },
  { id: 'views', label: 'Điểm nhìn & ảnh' },
  { id: 'tour', label: 'Ảnh thật' },
]

const SAVE_LABEL: Record<string, string> = { idle: '', saving: 'Đang lưu…', error: 'Mất kết nối — sẽ lưu khi có mạng', conflict: 'Xung đột', locked: 'Chỉ xem' }

/** A3 — trình dựng mẫu nhà (FR-03.*, 04.*, 05.02–05.04). */
export const EditorPage = ({ me }: { me: Me }) => {
  const { id: houseId = '' } = useParams()
  const qc = useQueryClient()
  const [wide, setWide] = useState(() => window.innerWidth >= 1280)
  useEffect(() => {
    const h = () => setWide(window.innerWidth >= 1280)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const house = useQuery({ queryKey: ['house', houseId], queryFn: () => api<{ house: HouseRow; latestVersion: HouseRow['latestVersion']; openVersionId: string | null; published: HouseRow['published'] }>('GET', `houses/${houseId}`) })
  const versionId = house.data?.openVersionId ?? house.data?.latestVersion?.id ?? null
  const version = useQuery({ queryKey: ['version', versionId], queryFn: () => api<VersionDetail>('GET', `versions/${versionId}`), enabled: !!versionId,
    // luôn lấy bản mới khi mở trình dựng, không giữ cache sau khi rời (R-G3-04); không tự tải lại giữa lúc đang sửa
    staleTime: 0, gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false })
  const projectId = house.data?.house.projectId
  // khách của dự án → vật liệu riêng của khách hiện trong trình dựng (item 03)
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => api<{ project: { clientId: string } }>('GET', `projects/${projectId}`), enabled: !!projectId })
  useEffect(() => useEditor.getState().setClientId(project.data?.project.clientId ?? null), [project.data])
  const inputs = useQuery({ queryKey: ['files', projectId], queryFn: () => api<{ items: FileOut[] }>('GET', `projects/${projectId}/files`), enabled: !!projectId })

  const [checks, setChecks] = useState<Check[]>([])
  const [info, setInfo] = useState(false)
  const [calib, setCalib] = useState<{ measured: number; apply: (n: number) => void } | null>(null)
  const [thick, setThick] = useState(200)
  const [ortho, setOrtho] = useState(true)
  const [grid, setGrid] = useState(true)

  useEffect(() => {
    const v = version.data
    if (!v) return
    useEditor.getState().load({ versionId: v.id, houseId, state: v.state, doc: v.document, revision: v.revision })
    setChecks(v.checks)
  }, [version.data, houseId])

  const onChecks = useCallback((c: Check[]) => setChecks(c), [])
  useAutosave(onChecks)

  const tab = useEditor((s) => s.tab)
  const tool = useEditor((s) => s.tool)
  const doc = useEditor((s) => s.doc)
  const saveState = useEditor((s) => s.saveState)
  const savedAt = useEditor((s) => s.savedAt)
  const undoN = useEditor((s) => s.undo.length)
  const redoN = useEditor((s) => s.redo.length)
  const vstate = useEditor((s) => s.state)
  const { setTool, setTab, doUndo, doRedo, setFloor } = useEditor.getState()

  // phím tắt
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        return e.shiftKey ? doRedo() : doUndo()
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (useEditor.getState().tab !== 'frame') return
      const tl = TOOLS.find((x) => x.key === e.key.toLowerCase())
      if (tl) setTool(tl.id)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [doUndo, doRedo, setTool])

  const files = useMemo<Record<string, FileInfo>>(() => Object.fromEntries((inputs.data?.items ?? []).map((f) => [f.id, { url: f.url, mime: f.mime }])), [inputs.data])
  const inputList = useMemo(() => (inputs.data?.items ?? []).map((f) => ({ id: f.id, name: f.originalName, mime: f.mime })), [inputs.data])

  const lastReview = useMemo(() => {
    const subs = version.data?.submissions ?? []
    const r = subs[subs.length - 1]?.reviews[0]
    return r && r.decision === 'changes_requested' && vstate === 'draft' ? r : null
  }, [version.data, vstate])

  const reload = async () => {
    await qc.invalidateQueries({ queryKey: ['house', houseId] })
    await qc.invalidateQueries({ queryKey: ['version'] })
  }
  const newVersion = async () => {
    try {
      await api('POST', `houses/${houseId}/versions`)
      await reload()
      toast('Đã tạo phiên bản mới')
    } catch (e) {
      toast(errMsg(e), 'danger')
    }
  }

  if (!wide) return <div className="center-page"><p>Trình dựng cần màn hình máy tính (rộng từ 1.280 px).</p><Link className="ab" to="/studio/projects">← Dự án</Link></div>
  if (house.isLoading || version.isLoading || !doc) return <div className="center-page"><div className="spinner" />Đang tải mẫu nhà…</div>
  if (house.error || version.error) return <div className="center-page"><p>{errMsg(house.error ?? version.error)}</p><Link className="ab" to="/studio/projects">← Dự án</Link></div>

  const h = house.data!
  const blocking = checks.filter((c) => c.level === 'block')
  const curTool = TOOLS.find((t) => t.id === tool)

  return (
    <div className="editor">
      <header className="ed-top">
        <Link to={`/studio/projects/${h.house.projectId}`} className="ab ab-ghost ab-sm">←</Link>
        <div className="ed-title">
          <strong>{h.house.name}</strong>
          <span>Phiên bản {version.data!.number} · <StateBadge state={vstate} /></span>
        </div>
        <nav className="ed-tabs">
          {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </nav>
        <span className={`ed-save ${saveState}`}>{saveState === 'saved' && savedAt ? `Đã lưu lúc ${new Date(savedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : SAVE_LABEL[saveState]}</span>
        <Button small onClick={doUndo} disabled={!undoN} title="Hoàn tác (Ctrl+Z)">↶</Button>
        <Button small onClick={doRedo} disabled={!redoN} title="Làm lại (Ctrl+Shift+Z)">↷</Button>
        {house.data && <Button small onClick={() => setInfo(true)}>Thông tin & giá</Button>}
        <a className="ab ab-sm" href={`/portal/review/${version.data!.id}`} target="_blank" rel="noreferrer">Xem trước</a>
        {me.role === 'admin' && <Link className="ab ab-sm ab-primary" to={`/studio/houses/${houseId}/versions`}>Phiên bản & phát hành</Link>}
      </header>

      {vstate !== 'draft' && (
        <div className="ed-banner info">
          {vstate === 'pending_review' ? `Phiên bản ${version.data!.number} đang chờ khách duyệt — không sửa được.` : `Phiên bản ${version.data!.number} ${vstate === 'published' ? 'đã phát hành' : 'đã duyệt'} — chỉ xem.`}
          {!h.openVersionId && <Button small kind="primary" onClick={() => void newVersion()}>Tạo phiên bản mới để sửa</Button>}
        </div>
      )}
      {lastReview && (
        <div className="ed-banner warn">
          <b>Khách yêu cầu sửa:</b> {lastReview.note} <span className="muted">— {lastReview.userName}, {fmtDateTime(lastReview.createdAt)}</span>
          {lastReview.targets.length > 0 && (
            <span className="ed-targets">
              {lastReview.targets.map((t, i) => {
                const f = doc.floors.find((x) => x.id === t.floorId)
                const r = f?.rooms.find((x) => x.id === t.roomId)
                return <button key={i} className="chip-btn" onClick={() => (setFloor(t.floorId), r && useEditor.getState().select({ kind: 'room', id: r.id }))}>{f?.name}{r ? ` · ${r.name}` : ''}</button>
              })}
            </span>
          )}
        </div>
      )}

      <div className="ed-body">
        <aside className="ed-left"><FloorList /></aside>
        <section className="ed-center">
          {tab === 'frame' && (
            <>
              <div className="ed-tools">
                {TOOLS.map((t) => (
                  <button key={t.id} className={tool === t.id ? 'on' : ''} onClick={() => setTool(t.id)} title={`${t.hint} (${t.key.toUpperCase()})`}>
                    {t.label}<kbd>{t.key.toUpperCase()}</kbd>
                  </button>
                ))}
                <span className="sep" />
                {tool === 'wall' && (
                  <label className="ed-opt">Dày
                    <select value={thick} onChange={(e) => setThick(Number(e.target.value))}>
                      <option value={200}>200 (ngoài)</option><option value={110}>110 (trong)</option><option value={100}>100</option><option value={220}>220</option>
                    </select>
                  </label>
                )}
                <label className="ed-opt"><input type="checkbox" checked={ortho} onChange={(e) => setOrtho(e.target.checked)} /> Khoá góc 45°</label>
                <label className="ed-opt"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Lưới 50 mm</label>
              </div>
              <PlanCanvas files={files} wallThickness={thick} ortho={ortho} grid={grid} onCalibrate={(measured, apply) => setCalib({ measured, apply })} onMessage={(m) => toast(m, 'danger')} />
              <p className="ed-hint">{curTool?.hint} · Space + kéo để di chuyển · Cuộn để phóng to</p>
            </>
          )}
          <Suspense fallback={<div className="center-page"><div className="spinner" /></div>}>
            {tab === 'model' && projectId && <ModelTab projectId={projectId} onChecks={setChecks} />}
            {tab === 'items' && <ItemsTab />}
            {tab === 'finish' && <FinishTab />}
            {tab === 'views' && projectId && <ViewsTab projectId={projectId} />}
            {tab === 'tour' && projectId && <TourTab projectId={projectId} />}
          </Suspense>
        </section>
        {tab === 'frame' && <aside className="ed-right"><Inspector files={files} inputFiles={inputList} /></aside>}
      </div>

      <footer className="ed-checks">
        <strong>Gửi duyệt:</strong>
        {checks.length === 0 ? <span className="ok">✓ Đủ điều kiện</span> : checks.map((c, i) => (
          <button key={i} className={c.level === 'block' ? 'chk block' : 'chk warn'} onClick={() => c.floorId && setFloor(c.floorId)}>{c.level === 'block' ? '✗' : '⚠'} {c.message}</button>
        ))}
        {blocking.length === 0 && checks.length > 0 && <span className="ok">✓ Không còn lỗi chặn</span>}
      </footer>

      {saveState === 'conflict' && (
        <Modal title="Mẫu nhà vừa được sửa ở nơi khác" onClose={() => {}}>
          <div className="am-body"><p>Tải lại để tiếp tục. Thay đổi chưa lưu trong tab này sẽ bị bỏ.</p></div>
          <footer className="am-foot" style={{ padding: '0 20px 18px' }}><Button kind="primary" onClick={() => void reload()}>Tải lại</Button></footer>
        </Modal>
      )}
      {info && house.data && <HouseInfoDialog house={house.data.house} onClose={() => setInfo(false)} />}
      {calib && <CalibrateDialog measured={calib.measured} onClose={() => setCalib(null)} onApply={(n) => (calib.apply(n), setCalib(null), toast('Đã hiệu chỉnh tỷ lệ'))} />}
    </div>
  )
}

const CalibrateDialog = ({ measured, onApply, onClose }: { measured: number; onApply: (mm: number) => void; onClose: () => void }) => {
  const [v, setV] = useState('')
  return (
    <Modal title="Hiệu chỉnh tỷ lệ" onClose={onClose}>
      <form className="form am-body" onSubmit={(e) => (e.preventDefault(), Number(v) > 0 && onApply(Number(v)))}>
        <p className="muted small">Đoạn bạn vừa vẽ đang dài {Math.round(measured).toLocaleString('vi-VN')} mm theo tỷ lệ hiện tại. Nhập kích thước thật ghi trên bản vẽ:</p>
        <label className="ins-field"><span>Kích thước thật (mm)</span><input autoFocus type="number" min={1} value={v} onChange={(e) => setV(e.target.value)} placeholder="vd 5000" /></label>
        <footer className="am-foot"><Button type="button" onClick={onClose}>Huỷ</Button><Button kind="primary" type="submit">Áp dụng</Button></footer>
      </form>
    </Modal>
  )
}
