import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, upload } from '../../lib/api.ts'
import { fmtArea, fmtDateTime, vi } from '../../i18n/vi.ts'
import { PageHead } from '../layout.tsx'
import { ShareBox } from '../share.tsx'
import { Badge, Button, EmptyState, ErrorState, Field, Modal, Skeleton, StateBadge, errMsg, fieldErrors, slugify, toast } from '../ui.tsx'
import type { Me } from '../auth.tsx'
import type { ClientRow, FileOut, HouseRow, ProjectRow } from '../types.ts'

export const ProjectsPage = ({ me }: { me: Me }) => {
  const q = useQuery({ queryKey: ['projects'], queryFn: () => api<{ items: ProjectRow[] }>('GET', 'projects') })
  const [create, setCreate] = useState(false)
  return (
    <>
      <PageHead title="Dự án" sub="Mỗi dự án là một trang công khai chứa các mẫu nhà" actions={me.role === 'admin' && <Button kind="primary" onClick={() => setCreate(true)}>Tạo dự án</Button>} />
      {q.isLoading ? <Skeleton rows={4} /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data!.items.length ? (
        <EmptyState action={me.role === 'admin' && <Button kind="primary" onClick={() => setCreate(true)}>Tạo dự án</Button>}>Chưa có dự án nào.</EmptyState>
      ) : (
        <div className="cards">
          {q.data!.items.map((p) => (
            <Link key={p.id} to={`/studio/projects/${p.id}`} className="pcard">
              <div className="pcard-img">{p.coverUrl && <img src={p.coverUrl} alt="" />}</div>
              <div className="pcard-body">
                <h3>{p.name}</h3>
                <p className="muted small">{p.clientName} · /v/{p.slug}</p>
                <p className="small">{p.houses?.length ?? 0} mẫu nhà · {p.houses?.filter((h) => h.published).length ?? 0} đã phát hành</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      {create && <CreateProject onClose={() => setCreate(false)} />}
    </>
  )
}

const CreateProject = ({ onClose }: { onClose: () => void }) => {
  const nav = useNavigate()
  const qc = useQueryClient()
  const clients = useQuery({ queryKey: ['clients'], queryFn: () => api<{ items: ClientRow[] }>('GET', 'clients') })
  const [f, setF] = useState({ name: '', slug: '', clientId: '', touched: false })
  const [errs, setErrs] = useState<Record<string, string>>({})
  const m = useMutation({
    mutationFn: () => api<{ project: ProjectRow }>('POST', 'projects', { name: f.name, slug: f.slug, clientId: f.clientId }),
    onSuccess: (r) => (void qc.invalidateQueries({ queryKey: ['projects'] }), nav(`/studio/projects/${r.project.id}`)),
    onError: (e) => (setErrs(fieldErrors(e)), !Object.keys(fieldErrors(e)).length && toast(errMsg(e), 'danger')),
  })
  return (
    <Modal title="Tạo dự án" onClose={onClose}>
      <form className="form am-body" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
        <Field label="Khách hàng" error={errs.clientId}>{(id) => (
          <select id={id} required value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
            <option value="">— Chọn —</option>
            {clients.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}</Field>
        <Field label="Tên dự án" error={errs.name}>{(id) => <input id={id} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.touched ? f.slug : slugify(e.target.value) })} />}</Field>
        <Field label="Đường dẫn" error={errs.slug} hint={`Trang công khai: /v/${f.slug || '…'} — khoá sau lần phát hành đầu`}>{(id) => <input id={id} required value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value, touched: true })} />}</Field>
        <footer className="am-foot">
          <Button type="button" onClick={onClose}>Huỷ</Button>
          <Button kind="primary" type="submit" disabled={m.isPending}>Tạo</Button>
        </footer>
      </form>
    </Modal>
  )
}

type Tab = 'info' | 'files' | 'houses' | 'share'

export const ProjectDetailPage = ({ me }: { me: Me }) => {
  const { id = '' } = useParams()
  const q = useQuery({ queryKey: ['project', id], queryFn: () => api<{ project: ProjectRow }>('GET', `projects/${id}`) })
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get('tab') as Tab) || 'houses')
  if (q.isLoading) return <Skeleton rows={5} />
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const p = q.data!.project
  return (
    <>
      <PageHead
        title={p.name}
        sub={<><Link to="/studio/projects">← Dự án</Link> · {p.clientName} · <a href={p.publicUrl} target="_blank" rel="noreferrer">/v/{p.slug}</a></>}
      />
      <nav className="tabs">
        {([['houses', 'Mẫu nhà'], ['info', 'Thông tin'], ['files', 'Tài liệu'], ['share', 'Chia sẻ']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      {tab === 'info' && <ProjectInfo p={p} me={me} />}
      {tab === 'files' && <ProjectFiles projectId={p.id} />}
      {tab === 'houses' && <ProjectHouses p={p} />}
      {tab === 'share' && (
        <section className="card">
          <h2>Chia sẻ dự án</h2>
          <ShareBox path={p.publicUrl} label={p.name} />
        </section>
      )}
    </>
  )
}

const ProjectInfo = ({ p, me }: { p: ProjectRow; me: Me }) => {
  const qc = useQueryClient()
  const admin = me.role === 'admin'
  const [f, setF] = useState({
    name: p.name, slug: p.slug, location: p.location ?? '', description: p.description ?? '',
    phone: p.contact.phone ?? '', zalo: p.contact.zalo ?? '', leadEmails: (p.contact.leadEmails ?? []).join(', '),
    disclaimer: p.disclaimer ?? '', privacyPolicy: p.privacyPolicy ?? '', coverFileId: p.coverFileId, coverUrl: p.coverUrl,
  })
  const [errs, setErrs] = useState<Record<string, string>>({})
  const m = useMutation({
    mutationFn: () => {
      const base = { name: f.name, location: f.location || null, description: f.description || null, coverFileId: f.coverFileId }
      const body = admin
        ? { ...base, slug: f.slug, disclaimer: f.disclaimer || null, privacyPolicy: f.privacyPolicy || null, contact: { phone: f.phone || null, zalo: f.zalo || null, leadEmails: f.leadEmails.split(/[,\s]+/).filter(Boolean) } }
        : base
      return api('PATCH', `projects/${p.id}`, body)
    },
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ['project', p.id] }), void qc.invalidateQueries({ queryKey: ['projects'] }), setErrs({}), toast('Đã lưu')),
    onError: (e) => (setErrs(fieldErrors(e)), toast(errMsg(e), 'danger')),
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  return (
    <form className="card form grid2" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
      <Field label="Tên dự án" error={errs.name}>{(id) => <input id={id} required value={f.name} onChange={set('name')} />}</Field>
      <Field label="Đường dẫn" error={errs.slug} hint={p.slugLocked ? 'Đã khoá vì đã phát hành (link và QR đã chia sẻ sẽ hỏng nếu đổi)' : 'Khoá sau lần phát hành đầu'}>
        {(id) => <input id={id} value={f.slug} onChange={set('slug')} disabled={!admin || p.slugLocked} />}
      </Field>
      <Field label="Địa điểm">{(id) => <input id={id} value={f.location} onChange={set('location')} />}</Field>
      <Field label="Ảnh bìa">{(id) => (
        <div className="logo-row">
          {f.coverUrl && <img src={f.coverUrl} alt="" />}
          <input id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            try {
              const r = await upload<{ file: { id: string; url: string } }>('files', file, { kind: 'cover', projectId: p.id })
              setF((s) => ({ ...s, coverFileId: r.file.id, coverUrl: r.file.url }))
            } catch (err) {
              toast(errMsg(err), 'danger')
            }
          }} />
        </div>
      )}</Field>
      <Field label="Mô tả" id="desc">{(id) => <textarea id={id} rows={3} value={f.description} onChange={set('description')} />}</Field>
      <div />
      <h3 className="span2">Liên hệ & pháp lý {!admin && <Badge>Chỉ quản trị viên sửa</Badge>}</h3>
      <Field label="Số điện thoại hotline" error={errs['contact.phone']}>{(id) => <input id={id} value={f.phone} onChange={set('phone')} disabled={!admin} />}</Field>
      <Field label="Zalo" error={errs['contact.zalo']}>{(id) => <input id={id} value={f.zalo} onChange={set('zalo')} disabled={!admin} />}</Field>
      <Field label="Email nhận lead" hint="Tối đa 5 email, cách nhau bằng dấu phẩy" error={errs['contact.leadEmails']}>{(id) => <input id={id} value={f.leadEmails} onChange={set('leadEmails')} disabled={!admin} />}</Field>
      <Field label="Dòng miễn trừ" hint="Để trống dùng câu mặc định (BR-06)">{(id) => <textarea id={id} rows={2} value={f.disclaimer} onChange={set('disclaimer')} disabled={!admin} />}</Field>
      <Field label="Chính sách xử lý dữ liệu" hint={<>Hiện ở <a href={`/v/${p.slug}/chinh-sach-du-lieu`} target="_blank" rel="noreferrer">trang chính sách</a>; để trống dùng mẫu mặc định</>}>{(id) => <textarea id={id} rows={4} value={f.privacyPolicy} onChange={set('privacyPolicy')} disabled={!admin} />}</Field>
      <footer className="span2 right"><Button kind="primary" type="submit" disabled={m.isPending}>Lưu thông tin</Button></footer>
    </form>
  )
}

const fmtBytes = (b: number) => (b > 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`)

const ProjectFiles = ({ projectId }: { projectId: string }) => {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['files', projectId], queryFn: () => api<{ items: FileOut[] }>('GET', `projects/${projectId}/files`) })
  const [progress, setProgress] = useState<number | null>(null)
  const [drag, setDrag] = useState(false)
  const send = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (file.size > 200 * 2 ** 20) {
        toast(`Tệp ${file.name} vượt 200 MB`, 'danger')
        continue
      }
      try {
        setProgress(0)
        await upload(`projects/${projectId}/files`, file, {}, setProgress)
      } catch (e) {
        toast(`${file.name}: ${errMsg(e)}`, 'danger')
      }
    }
    setProgress(null)
    void qc.invalidateQueries({ queryKey: ['files', projectId] })
  }
  return (
    <section className="card">
      <div
        className={drag ? 'drop on' : 'drop'}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => (e.preventDefault(), setDrag(false), void send(e.dataTransfer.files))}
      >
        <p>Kéo thả ảnh/PDF mặt bằng, phối cảnh, GLB, DXF vào đây (≤ 200 MB/tệp)</p>
        <label className="ab ab-primary">Chọn tệp<input type="file" multiple hidden accept=".jpg,.jpeg,.png,.webp,.pdf,.glb,.gltf,.dxf" onChange={(e) => void send(e.target.files)} /></label>
        {progress !== null && <div className="bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
      </div>
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} /> : !q.data!.items.length ? <EmptyState>Chưa có tài liệu.</EmptyState> : (
        <table className="tbl">
          <thead><tr><th>Tệp</th><th>Dung lượng</th><th>Người tải</th><th>Thời điểm</th></tr></thead>
          <tbody>
            {q.data!.items.map((f) => (
              <tr key={f.id}>
                <td><a href={f.url} target="_blank" rel="noreferrer">{f.originalName}</a></td>
                <td className="num">{fmtBytes(f.bytes)}</td>
                <td>{f.uploadedByName ?? '—'}</td>
                <td>{fmtDateTime(f.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

const ProjectHouses = ({ p }: { p: ProjectRow }) => {
  const qc = useQueryClient()
  const nav = useNavigate()
  const q = useQuery({ queryKey: ['houses', p.id], queryFn: () => api<{ items: HouseRow[] }>('GET', `projects/${p.id}/houses`) })
  const [form, setForm] = useState<{ mode: 'new' } | { mode: 'dup'; from: HouseRow } | null>(null)
  const [share, setShare] = useState<HouseRow | null>(null)
  return (
    <section>
      <div className="row-head">
        <h2>Mẫu nhà</h2>
        <Button kind="primary" onClick={() => setForm({ mode: 'new' })}>Tạo mẫu nhà</Button>
      </div>
      {q.isLoading ? <Skeleton rows={4} /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data!.items.length ? (
        <EmptyState action={<Button kind="primary" onClick={() => setForm({ mode: 'new' })}>Tạo mẫu nhà</Button>}>Dự án chưa có mẫu nhà.</EmptyState>
      ) : (
        <table className="tbl">
          <thead><tr><th>Mẫu nhà</th><th>Loại</th><th>Diện tích</th><th>Phiên bản mới nhất</th><th>Đang công khai</th><th /></tr></thead>
          <tbody>
            {q.data!.items.map((h) => (
              <tr key={h.id}>
                <td className="with-thumb">{h.coverUrl ? <img src={h.coverUrl} alt="" /> : <span className="thumb" />}<span>{h.name}<br /><span className="muted small">{h.slug}</span></span></td>
                <td>{vi.houseType[h.houseType]}</td>
                <td className="num">{fmtArea(h.declaredArea)}</td>
                <td>{h.latestVersion ? <>v{h.latestVersion.number} <StateBadge state={h.latestVersion.state} /></> : '—'}</td>
                <td>{h.published ? <a href={`/v/${p.slug}/${h.slug}`} target="_blank" rel="noreferrer">v{h.published.number} ↗</a> : <span className="muted">—</span>}</td>
                <td className="right nowrap">
                  <Button small kind="primary" onClick={() => nav(`/studio/houses/${h.id}/edit`)}>Dựng</Button>
                  <Button small onClick={() => nav(`/studio/houses/${h.id}/versions`)}>Phiên bản</Button>
                  <Button small kind="ghost" onClick={() => setForm({ mode: 'dup', from: h })}>Sao chép</Button>
                  {h.published && <Button small kind="ghost" onClick={() => setShare(h)}>Chia sẻ</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {form && <HouseForm project={p} dupFrom={form.mode === 'dup' ? form.from : undefined} onClose={() => setForm(null)} onDone={(id) => (void qc.invalidateQueries({ queryKey: ['houses', p.id] }), setForm(null), form.mode === 'new' && nav(`/studio/houses/${id}/edit`))} />}
      {share && <Modal title={`Chia sẻ ${share.name}`} onClose={() => setShare(null)} wide><div className="am-body"><ShareBox path={`/v/${p.slug}/${share.slug}`} label={share.name} /></div></Modal>}
    </section>
  )
}

const HouseForm = ({ project, dupFrom, onClose, onDone }: { project: ProjectRow; dupFrom?: HouseRow; onClose: () => void; onDone: (houseId: string) => void }) => {
  const [f, setF] = useState({
    name: dupFrom ? `${dupFrom.name} (bản sao)` : '', slug: dupFrom ? `${dupFrom.slug}-2` : '', touched: !!dupFrom,
    houseType: 'townhouse', declaredArea: '', bedrooms: '2', bathrooms: '2', description: '',
  })
  const [errs, setErrs] = useState<Record<string, string>>({})
  const m = useMutation({
    mutationFn: () =>
      dupFrom
        ? api<{ house: { id: string } }>('POST', `houses/${dupFrom.id}/duplicate`, { name: f.name, slug: f.slug })
        : api<{ house: { id: string } }>('POST', `projects/${project.id}/houses`, {
            name: f.name, slug: f.slug, houseType: f.houseType, declaredArea: Number(f.declaredArea), bedrooms: Number(f.bedrooms), bathrooms: Number(f.bathrooms), description: f.description || null,
          }),
    onSuccess: (r) => (toast(dupFrom ? 'Đã sao chép mẫu nhà' : 'Đã tạo mẫu nhà'), onDone(r.house.id)),
    onError: (e) => (setErrs(fieldErrors(e)), !Object.keys(fieldErrors(e)).length && toast(errMsg(e), 'danger')),
  })
  return (
    <Modal title={dupFrom ? `Sao chép ${dupFrom.name}` : 'Tạo mẫu nhà'} onClose={onClose}>
      <form className="form am-body" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
        <Field label="Tên mẫu nhà" error={errs.name}>{(id) => <input id={id} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.touched ? f.slug : slugify(e.target.value) })} />}</Field>
        <Field label="Đường dẫn" error={errs.slug} hint={`/v/${project.slug}/${f.slug || '…'}`}>{(id) => <input id={id} required value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value, touched: true })} />}</Field>
        {!dupFrom && (
          <>
            <Field label="Loại nhà">{(id) => (
              <select id={id} value={f.houseType} onChange={(e) => setF({ ...f, houseType: e.target.value })}>
                {Object.entries(vi.houseType).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}</Field>
            <div className="grid3">
              <Field label="Diện tích công bố (m²)" error={errs.declaredArea}>{(id) => <input id={id} required type="number" min="1" step="0.1" value={f.declaredArea} onChange={(e) => setF({ ...f, declaredArea: e.target.value })} />}</Field>
              <Field label="Phòng ngủ">{(id) => <input id={id} type="number" min="0" value={f.bedrooms} onChange={(e) => setF({ ...f, bedrooms: e.target.value })} />}</Field>
              <Field label="WC">{(id) => <input id={id} type="number" min="0" value={f.bathrooms} onChange={(e) => setF({ ...f, bathrooms: e.target.value })} />}</Field>
            </div>
            <Field label="Mô tả">{(id) => <textarea id={id} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
          </>
        )}
        <footer className="am-foot">
          <Button type="button" onClick={onClose}>Huỷ</Button>
          <Button kind="primary" type="submit" disabled={m.isPending}>{dupFrom ? 'Sao chép' : 'Tạo & mở trình dựng'}</Button>
        </footer>
      </form>
    </Modal>
  )
}
