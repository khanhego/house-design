import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Check } from '@hd/core'
import { api, ApiError, upload } from '../../lib/api.ts'
import { fmtDateTime } from '../../i18n/vi.ts'
import type { Me } from '../auth.tsx'
import { PageHead } from '../layout.tsx'
import { Button, Confirm, EmptyState, ErrorState, Field, Modal, Skeleton, StateBadge, errMsg, fieldErrors, toast } from '../ui.tsx'
import type { HouseRow, ProjectRow, SubmissionOut, VersionRef } from '../types.ts'

interface HouseOut {
  house: HouseRow
  latestVersion: VersionRef | null
  published: { versionId: string; number: number; publishedAt: string | null } | null
  openVersionId: string | null
}
interface VersionItem {
  id: string
  number: number
  state: string
  createdAt: string
  publishedAt: string | null
  submissions: SubmissionOut[]
}

type Action = { kind: 'publish' | 'unpublish' | 'withdraw'; v: VersionItem } | { kind: 'behalf'; v: VersionItem } | null

/** A5 — Phiên bản & phát hành (FR-08.01–08.08, SRS §10.4). */
export const VersionsPage = ({ me }: { me: Me }) => {
  const { id: houseId = '' } = useParams()
  const qc = useQueryClient()
  const nav = useNavigate()
  const house = useQuery({ queryKey: ['house', houseId], queryFn: () => api<HouseOut>('GET', `houses/${houseId}`) })
  const versions = useQuery({ queryKey: ['versions', houseId], queryFn: () => api<{ items: VersionItem[] }>('GET', `houses/${houseId}/versions`) })
  const project = useQuery({
    queryKey: ['project', house.data?.house.projectId],
    queryFn: () => api<{ project: ProjectRow }>('GET', `projects/${house.data!.house.projectId}`),
    enabled: !!house.data,
  })
  const [action, setAction] = useState<Action>(null)
  const [blocked, setBlocked] = useState<{ v: VersionItem; checks: Check[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const isAdmin = me.role === 'admin'

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['house', houseId] }), qc.invalidateQueries({ queryKey: ['versions', houseId] })])
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast(ok)
      setAction(null)
      await refresh()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_STATE') {
        toast('Phiên bản đã được xử lý ở nơi khác. Đã tải lại.', 'danger')
        setAction(null)
        await refresh()
      } else toast(errMsg(e), 'danger')
    } finally {
      setBusy(false)
    }
  }

  const submit = async (v: VersionItem) => {
    setBusy(true)
    try {
      await api('POST', `versions/${v.id}/submit`)
      toast(`Đã gửi khách duyệt phiên bản ${v.number}`)
      await refresh()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SUBMIT_BLOCKED') setBlocked({ v, checks: (e.body.checks as Check[]) ?? [] })
      else toast(errMsg(e), 'danger')
    } finally {
      setBusy(false)
    }
  }

  const newVersion = async () => {
    try {
      await api('POST', `houses/${houseId}/versions`)
      nav(`/studio/houses/${houseId}/edit`)
    } catch (e) {
      toast(errMsg(e), 'danger')
    }
  }

  if (house.isLoading || versions.isLoading) return <Skeleton rows={6} />
  if (house.error || versions.error) return <ErrorState error={house.error ?? versions.error} retry={() => void refresh()} />
  const h = house.data!
  const items = versions.data!.items
  const publishedNo = h.published?.number
  const publicUrl = project.data ? `${location.origin}${project.data.project.publicUrl}/${h.house.slug}` : null
  const neverSubmitted = items.every((v) => !v.submissions.length)

  const actions = (v: VersionItem) => {
    if (!isAdmin) return null
    switch (v.state) {
      case 'draft':
        return (
          <>
            <Link className="ab ab-sm" to={`/studio/houses/${houseId}/edit`}>Mở trình dựng</Link>
            <Button small kind="primary" disabled={busy} onClick={() => void submit(v)}>Gửi khách duyệt</Button>
          </>
        )
      case 'pending_review':
        return (
          <>
            <a className="ab ab-sm" href={`/portal/review/${v.id}`} target="_blank" rel="noreferrer">Xem như khách</a>
            <Button small onClick={() => setAction({ kind: 'withdraw', v })}>Rút về để sửa</Button>
            <Button small onClick={() => setAction({ kind: 'behalf', v })}>Ghi nhận duyệt thay</Button>
          </>
        )
      case 'approved':
        return <Button small kind="primary" onClick={() => setAction({ kind: 'publish', v })}>Phát hành</Button>
      case 'published':
        return (
          <>
            <Button small kind="danger" onClick={() => setAction({ kind: 'unpublish', v })}>Gỡ</Button>
            {!h.openVersionId && <Button small onClick={() => void newVersion()}>Tạo phiên bản mới</Button>}
          </>
        )
      case 'superseded':
      case 'unpublished':
        return <Button small onClick={() => setAction({ kind: 'publish', v })}>Khôi phục phát hành</Button>
    }
    return null
  }

  return (
    <>
      <PageHead
        title={<>{h.house.name} · Phiên bản</>}
        sub={
          <>
            <Link to={`/studio/projects/${h.house.projectId}`}>← {project.data?.project.name ?? 'Dự án'}</Link>
            {' · '}
            {h.published ? <>Đang công khai: phiên bản {h.published.number}{publicUrl && <> · <a href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a></>}</> : 'Chưa công khai'}
          </>
        }
        actions={!isAdmin && <span className="muted small">Chỉ quản trị viên gửi duyệt và phát hành.</span>}
      />
      {neverSubmitted && <EmptyState>Chưa gửi duyệt lần nào.</EmptyState>}
      <div className="ver-list">
        {[...items].reverse().map((v) => (
          <section key={v.id} className="card ver">
            <header className="ver-head">
              <strong>Phiên bản {v.number}</strong>
              <StateBadge state={v.state} />
              <span className="muted small">Tạo {fmtDateTime(v.createdAt)}{v.publishedAt && ` · phát hành ${fmtDateTime(v.publishedAt)}`}</span>
              <span className="grow" />
              {actions(v)}
            </header>
            {v.submissions.length > 0 && (
              <ul className="ver-log">
                {[...v.submissions].reverse().map((s) => (
                  <li key={s.id}>
                    <div>Gửi duyệt lần {s.seq} · {fmtDateTime(s.submittedAt)} bởi {s.submittedByName ?? '—'}{s.withdrawnAt && <em> · đã rút về {fmtDateTime(s.withdrawnAt)}</em>}</div>
                    {s.reviews.map((r) => (
                      <div key={r.id} className={`ver-review ${r.decision}`}>
                        <strong>{r.decision === 'approved' ? 'Duyệt' : 'Yêu cầu sửa'}</strong> · {r.userName ?? '—'}{r.onBehalf && ' (QTV ghi nhận thay)'} · {fmtDateTime(r.createdAt)}
                        {r.note && <p>{r.note}</p>}
                        {r.evidenceUrl && <a href={r.evidenceUrl} target="_blank" rel="noreferrer">Xem bằng chứng</a>}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {blocked && (
        <Modal title={`Chưa gửi duyệt được phiên bản ${blocked.v.number}`} onClose={() => setBlocked(null)}>
          <div className="am-body">
            <ul className="checks">
              {blocked.checks.map((c, i) => (
                <li key={i} className={c.level}>
                  <Link to={`/studio/houses/${houseId}/edit${c.floorId ? `?floor=${c.floorId}` : ''}`}>{c.level === 'block' ? '✕' : '⚠'} {c.message}</Link>
                </li>
              ))}
            </ul>
          </div>
          <footer className="am-foot"><Button onClick={() => setBlocked(null)}>Đóng</Button><Link className="ab ab-primary" to={`/studio/houses/${houseId}/edit`}>Mở trình dựng</Link></footer>
        </Modal>
      )}
      {action?.kind === 'publish' && (
        <Confirm
          title="Phát hành"
          message={<p>Phát hành phiên bản {action.v.number}?{publishedNo ? ` Link công khai sẽ hiện phiên bản này thay cho phiên bản ${publishedNo}.` : ' Mẫu nhà sẽ hiện trên link công khai.'}</p>}
          confirmLabel="Phát hành"
          busy={busy}
          onClose={() => setAction(null)}
          onConfirm={() => void run(() => api('POST', `versions/${action.v.id}/publish`), `Đã phát hành phiên bản ${action.v.number}`)}
        />
      )}
      {action?.kind === 'unpublish' && (
        <Confirm
          title="Gỡ phát hành"
          danger
          message={<p>Gỡ {h.house.name} khỏi trang công khai? Người xem sẽ thấy thông báo không khả dụng.</p>}
          confirmLabel="Gỡ"
          busy={busy}
          onClose={() => setAction(null)}
          onConfirm={() => void run(() => api('POST', `houses/${houseId}/unpublish`), 'Đã gỡ khỏi trang công khai')}
        />
      )}
      {action?.kind === 'withdraw' && (
        <Confirm
          title="Rút về để sửa"
          message={<p>Rút phiên bản {action.v.number} về Đang dựng? Người duyệt sẽ thấy phiên bản đã được rút lại.</p>}
          confirmLabel="Rút về"
          busy={busy}
          onClose={() => setAction(null)}
          onConfirm={() => void run(() => api('POST', `versions/${action.v.id}/withdraw`), `Đã rút phiên bản ${action.v.number} về Đang dựng`)}
        />
      )}
      {action?.kind === 'behalf' && <OnBehalfDialog v={action.v} projectId={h.house.projectId} onClose={() => setAction(null)} onDone={() => (setAction(null), void refresh())} />}
    </>
  )
}

/** Ghi nhận duyệt thay (FR-08.07): bắt buộc tệp bằng chứng + ghi chú ≥ 10 ký tự. */
const OnBehalfDialog = ({ v, projectId, onClose, onDone }: { v: VersionItem; projectId: string; onClose: () => void; onDone: () => void }) => {
  const [decision, setDecision] = useState<'approved' | 'changes_requested'>('approved')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (note.trim().length < 10) errs.note = 'Ghi chú cần ít nhất 10 ký tự (kênh, thời điểm, người duyệt)'
    if (!file) errs.evidenceFileId = 'Cần tải ảnh chụp hoặc PDF bằng chứng'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const ev = await upload<{ file: { id: string } }>('files', file!, { kind: 'evidence', projectId })
      await api('POST', `versions/${v.id}/review-on-behalf`, { decision, note: note.trim(), evidenceFileId: ev.file.id })
      toast(decision === 'approved' ? `Đã ghi nhận duyệt phiên bản ${v.number}` : 'Đã ghi nhận yêu cầu sửa')
      onDone()
    } catch (err) {
      setErrors(fieldErrors(err))
      if (!Object.keys(fieldErrors(err)).length) toast(errMsg(err), 'danger')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={`Ghi nhận duyệt thay · phiên bản ${v.number}`} onClose={onClose}>
      <form className="form am-body" onSubmit={(e) => void save(e)}>
        <p className="muted small">Dùng khi khách duyệt qua Zalo, email hoặc giấy. Lần duyệt được lưu kèm tên bạn và bằng chứng.</p>
        <Field label="Quyết định">
          {(id) => (
            <select id={id} value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
              <option value="approved">Khách đã duyệt</option>
              <option value="changes_requested">Khách yêu cầu sửa</option>
            </select>
          )}
        </Field>
        <Field label="Ghi chú" error={errors.note}>{(id) => <textarea id={id} rows={3} value={note} placeholder="Ví dụ: Anh Tuấn duyệt qua Zalo lúc 14:05 24/10" onChange={(e) => setNote(e.target.value)} />}</Field>
        <Field label="Bằng chứng (ảnh hoặc PDF)" error={errors.evidenceFileId}>{(id) => <input id={id} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}</Field>
        <footer className="am-foot">
          <Button type="button" onClick={onClose}>Huỷ</Button>
          <Button kind="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Ghi nhận'}</Button>
        </footer>
      </form>
    </Modal>
  )
}
