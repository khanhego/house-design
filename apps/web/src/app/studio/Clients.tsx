import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, upload } from '../../lib/api.ts'
import { fmtDate } from '../../i18n/vi.ts'
import { PageHead } from '../layout.tsx'
import { Badge, Button, Confirm, EmptyState, ErrorState, Field, Modal, Skeleton, errMsg, fieldErrors, toast } from '../ui.tsx'
import type { ClientRow, UserRow } from '../types.ts'

const PLAN = { unit: 'Theo mẫu', project: 'Gói dự án', library: 'Thư viện mẫu nhà' } as Record<string, string>

const ClientForm = ({ initial, onClose }: { initial?: ClientRow; onClose: () => void }) => {
  const qc = useQueryClient()
  const [f, setF] = useState({
    name: initial?.name ?? '',
    brandColor: initial?.brandColor ?? '#1F4FA3',
    phone: initial?.contact.phone ?? '',
    zalo: initial?.contact.zalo ?? '',
    email: initial?.contact.email ?? '',
    address: initial?.contact.address ?? '',
    plan: initial?.plan ?? 'project',
    hostingUntil: initial?.hostingUntil ?? '',
    showPoweredBy: initial?.showPoweredBy ?? true,
    logoFileId: initial?.logoFileId ?? null,
    logoUrl: initial?.logoUrl ?? null,
  })
  const [errs, setErrs] = useState<Record<string, string>>({})
  const m = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name, brandColor: f.brandColor, plan: f.plan, hostingUntil: f.hostingUntil || null, showPoweredBy: f.showPoweredBy, logoFileId: f.logoFileId,
        contact: { phone: f.phone || null, zalo: f.zalo || null, email: f.email || null, address: f.address || null },
      }
      return initial ? api('PATCH', `clients/${initial.id}`, body) : api('POST', 'clients', body)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clients'] })
      toast('Đã lưu')
      onClose()
    },
    onError: (e) => {
      setErrs(fieldErrors(e))
      if (!Object.keys(fieldErrors(e)).length) toast(errMsg(e), 'danger')
    },
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))
  return (
    <Modal title={initial ? 'Sửa khách hàng' : 'Thêm khách hàng'} onClose={onClose} wide>
      <form className="form am-body grid2" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
        <Field label="Tên khách hàng" error={errs.name}>{(id) => <input id={id} required value={f.name} onChange={set('name')} />}</Field>
        <Field label="Màu thương hiệu" error={errs.brandColor}>
          {(id) => (
            <div className="color-row">
              <input type="color" value={f.brandColor} onChange={set('brandColor')} aria-label="Chọn màu" />
              <input id={id} value={f.brandColor} onChange={set('brandColor')} />
            </div>
          )}
        </Field>
        <Field label="Logo" hint="PNG/JPG/WebP, nền trong suốt càng tốt">
          {(id) => (
            <div className="logo-row">
              {f.logoUrl && <img src={f.logoUrl} alt="" />}
              <input id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const r = await upload<{ file: { id: string; url: string } }>('files', file, { kind: 'logo' })
                  setF((s) => ({ ...s, logoFileId: r.file.id, logoUrl: r.file.url }))
                } catch (err) {
                  toast(errMsg(err), 'danger')
                }
              }} />
            </div>
          )}
        </Field>
        <Field label="Gói">{(id) => <select id={id} value={f.plan ?? ''} onChange={set('plan')}>{Object.entries(PLAN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
        <Field label="Hạn hosting" hint="Quá hạn 7 ngày trang công khai tự gỡ (BR-08)">{(id) => <input id={id} type="date" value={f.hostingUntil} onChange={set('hostingUntil')} />}</Field>
        <Field label="Số điện thoại" error={errs['contact.phone']}>{(id) => <input id={id} value={f.phone} onChange={set('phone')} />}</Field>
        <Field label="Zalo" error={errs['contact.zalo']}>{(id) => <input id={id} value={f.zalo} onChange={set('zalo')} />}</Field>
        <Field label="Email" error={errs['contact.email']}>{(id) => <input id={id} type="email" value={f.email} onChange={set('email')} />}</Field>
        <Field label="Địa chỉ">{(id) => <input id={id} value={f.address} onChange={set('address')} />}</Field>
        <label className="check"><input type="checkbox" checked={f.showPoweredBy} onChange={set('showPoweredBy')} /> Hiện dòng "Nhà mẫu online" ở chân trang</label>
        <footer className="am-foot span2">
          <Button type="button" onClick={onClose}>Huỷ</Button>
          <Button kind="primary" type="submit" disabled={m.isPending}>Lưu</Button>
        </footer>
      </form>
    </Modal>
  )
}

export const ClientsPage = () => {
  const q = useQuery({ queryKey: ['clients'], queryFn: () => api<{ items: ClientRow[] }>('GET', 'clients') })
  const [edit, setEdit] = useState<ClientRow | 'new' | null>(null)
  return (
    <>
      <PageHead title="Khách hàng" sub="Bên bán nhà ký hợp đồng với nhà cung cấp" actions={<Button kind="primary" onClick={() => setEdit('new')}>Thêm khách hàng</Button>} />
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data!.items.length ? (
        <EmptyState action={<Button kind="primary" onClick={() => setEdit('new')}>Thêm khách hàng</Button>}>Chưa có khách hàng nào.</EmptyState>
      ) : (
        <table className="tbl">
          <thead><tr><th>Khách hàng</th><th>Gói</th><th>Hạn hosting</th><th>Dự án</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>
            {q.data!.items.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/studio/clients/${c.id}`} className="row-link"><span className="swatch-dot" style={{ background: c.brandColor }} />{c.name}</Link></td>
                <td>{c.plan ? PLAN[c.plan] : '—'}</td>
                <td>{c.hostingUntil ? fmtDate(c.hostingUntil + 'T00:00:00+07:00') : '—'}</td>
                <td className="num">{c.projectCount}</td>
                <td>{c.status === 'active' ? <Badge tone="ok">Hoạt động</Badge> : <Badge tone="danger">Tạm ngưng</Badge>}</td>
                <td className="right"><Button small onClick={() => setEdit(c)}>Sửa</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {edit && <ClientForm initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

export const ClientDetailPage = () => {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['clients', id], queryFn: () => api<{ client: ClientRow; users: UserRow[] }>('GET', `clients/${id}`) })
  const [edit, setEdit] = useState(false)
  const [invite, setInvite] = useState(false)
  const [suspend, setSuspend] = useState(false)
  const status = useMutation({
    mutationFn: (s: 'active' | 'suspended') => api('PATCH', `clients/${id}`, { status: s }),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ['clients'] }), setSuspend(false), toast('Đã cập nhật trạng thái')),
    onError: (e) => toast(errMsg(e), 'danger'),
  })
  if (q.isLoading) return <Skeleton />
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const { client, users } = q.data!
  return (
    <>
      <PageHead
        title={client.name}
        sub={<Link to="/studio/clients">← Khách hàng</Link>}
        actions={
          <>
            <Button onClick={() => setEdit(true)}>Sửa</Button>
            {client.status === 'active' ? <Button kind="danger" onClick={() => setSuspend(true)}>Tạm ngưng</Button> : <Button kind="primary" onClick={() => status.mutate('active')}>Kích hoạt lại</Button>}
          </>
        }
      />
      <section className="card">
        <div className="card-head"><h2>Người duyệt của khách hàng</h2><Button small kind="primary" onClick={() => setInvite(true)}>Mời người duyệt</Button></div>
        {!users.length ? <EmptyState>Chưa có người duyệt. Mời ít nhất một người để khách hàng duyệt mẫu nhà trước khi phát hành.</EmptyState> : <UserTable users={users} />}
      </section>
      {edit && <ClientForm initial={client} onClose={() => setEdit(false)} />}
      {invite && <InviteForm onClose={() => setInvite(false)} fixedClient={client} />}
      {suspend && (
        <Confirm
          title="Tạm ngưng khách hàng?"
          message={<p>Mọi dự án của <b>{client.name}</b> sẽ không còn hiển thị công khai và người duyệt bị đăng xuất. Kích hoạt lại thì hiện lại ngay.</p>}
          confirmLabel="Tạm ngưng"
          danger
          busy={status.isPending}
          onConfirm={() => status.mutate('suspended')}
          onClose={() => setSuspend(false)}
        />
      )}
    </>
  )
}

const STATUS = { invited: ['Đã mời', 'warn'], active: ['Hoạt động', 'ok'], disabled: ['Vô hiệu', 'danger'] } as const
const ROLE = { admin: 'Quản trị viên', producer: 'Người dựng', approver: 'Người duyệt' }

const UserTable = ({ users }: { users: UserRow[] }) => {
  const qc = useQueryClient()
  const act = useMutation({
    mutationFn: ({ u, a }: { u: UserRow; a: 'disable' | 'enable' | 'resend' }) =>
      a === 'resend' ? api('POST', `users/${u.id}/resend-invite`) : api('PATCH', `users/${u.id}`, { status: a === 'disable' ? 'disabled' : 'active' }),
    onSuccess: (_d, v) => (void qc.invalidateQueries({ queryKey: ['users'] }), void qc.invalidateQueries({ queryKey: ['clients'] }), toast(v.a === 'resend' ? 'Đã gửi lại lời mời' : 'Đã cập nhật')),
    onError: (e) => toast(errMsg(e), 'danger'),
  })
  return (
    <table className="tbl">
      <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Khách hàng</th><th>Trạng thái</th><th /></tr></thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td>{u.name}</td>
            <td>{u.email}</td>
            <td>{ROLE[u.role]}</td>
            <td>{u.clientName ?? '—'}</td>
            <td><Badge tone={STATUS[u.status][1]}>{STATUS[u.status][0]}</Badge></td>
            <td className="right">
              {u.status === 'invited' && <Button small onClick={() => act.mutate({ u, a: 'resend' })}>Gửi lại lời mời</Button>}
              {u.status === 'active' && <Button small kind="ghost" onClick={() => act.mutate({ u, a: 'disable' })}>Vô hiệu</Button>}
              {u.status === 'disabled' && <Button small onClick={() => act.mutate({ u, a: 'enable' })}>Kích hoạt</Button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const InviteForm = ({ onClose, fixedClient }: { onClose: () => void; fixedClient?: ClientRow }) => {
  const qc = useQueryClient()
  const clients = useQuery({ queryKey: ['clients'], queryFn: () => api<{ items: ClientRow[] }>('GET', 'clients'), enabled: !fixedClient })
  const [f, setF] = useState({ name: '', email: '', role: fixedClient ? 'approver' : 'producer', clientId: fixedClient?.id ?? '' })
  const [errs, setErrs] = useState<Record<string, string>>({})
  const m = useMutation({
    mutationFn: () => api('POST', 'users', { ...f, clientId: f.role === 'approver' ? f.clientId : null }),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ['users'] }), void qc.invalidateQueries({ queryKey: ['clients'] }), toast('Đã gửi lời mời qua email'), onClose()),
    onError: (e) => (setErrs(fieldErrors(e)), !Object.keys(fieldErrors(e)).length && toast(errMsg(e), 'danger')),
  })
  return (
    <Modal title="Mời tài khoản" onClose={onClose}>
      <form className="form am-body" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
        <Field label="Họ tên" error={errs.name}>{(id) => <input id={id} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label="Email" error={errs.email}>{(id) => <input id={id} type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        {!fixedClient && (
          <Field label="Vai trò">{(id) => (
            <select id={id} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="producer">Người dựng</option>
              <option value="admin">Quản trị viên</option>
              <option value="approver">Người duyệt (khách hàng)</option>
            </select>
          )}</Field>
        )}
        {f.role === 'approver' && !fixedClient && (
          <Field label="Khách hàng" error={errs.clientId}>{(id) => (
            <select id={id} required value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
              <option value="">— Chọn —</option>
              {clients.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}</Field>
        )}
        <footer className="am-foot">
          <Button type="button" onClick={onClose}>Huỷ</Button>
          <Button kind="primary" type="submit" disabled={m.isPending}>Gửi lời mời</Button>
        </footer>
      </form>
    </Modal>
  )
}

export const UsersPage = () => {
  const q = useQuery({ queryKey: ['users'], queryFn: () => api<{ items: UserRow[] }>('GET', 'users') })
  const [invite, setInvite] = useState(false)
  return (
    <>
      <PageHead title="Tài khoản" sub="Quản trị viên, người dựng và người duyệt của khách hàng" actions={<Button kind="primary" onClick={() => setInvite(true)}>Mời tài khoản</Button>} />
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : <UserTable users={q.data!.items} />}
      {invite && <InviteForm onClose={() => setInvite(false)} />}
    </>
  )
}
