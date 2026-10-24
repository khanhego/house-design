import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sortedFloors } from '@hd/core'
import type { PublicHousePayload } from '@hd/core'
import { api, ApiError } from '../../lib/api.ts'
import { fmtDateTime } from '../../i18n/vi.ts'
import { HousePage } from '../../viewer/HousePage.tsx'
import '../../viewer/viewer.css'
import type { Me } from '../auth.tsx'
import { Button, Confirm, ErrorState, Field, Forbidden, Modal, errMsg, fieldErrors, toast } from '../ui.tsx'
import type { ReviewOut, SubmissionOut } from '../types.ts'

interface VersionMeta {
  id: string
  houseId: string
  number: number
  state: string
  lastSubmission?: { seq: number; withdrawnAt: string | null; reviews: ReviewOut[] } | null
}
type Preview = PublicHousePayload & { preview: NonNullable<PublicHousePayload['preview']> }

const decisionText = (r: ReviewOut) => (r.decision === 'approved' ? 'duyệt' : 'yêu cầu sửa')

/** C3 — Xem trước & duyệt (FR-08.03–08.05). Gọi API-34 trước; bản nháp → thông báo theo metadata (R-11), còn lại → API-39. */
export const ReviewPage = ({ me }: { me: Me }) => {
  const { versionId = '' } = useParams()
  const qc = useQueryClient()
  const home = me.role === 'approver' ? '/portal' : '/studio/projects'
  const meta = useQuery({ queryKey: ['review-meta', versionId], queryFn: () => api<VersionMeta>('GET', `versions/${versionId}`), retry: false })
  const staff = me.role !== 'approver'
  const canPreview = !!meta.data && (staff || meta.data.state !== 'draft')
  const preview = useQuery({ queryKey: ['preview', versionId], queryFn: () => api<Preview>('GET', `versions/${versionId}/preview`), enabled: canPreview, retry: false })
  const history = useQuery({
    queryKey: ['versions', meta.data?.houseId],
    queryFn: () => api<{ items: { id: string; number: number; state: string; submissions: SubmissionOut[] }[] }>('GET', `houses/${meta.data!.houseId}/versions`),
    enabled: !!meta.data,
  })
  const [dialog, setDialog] = useState<'approve' | 'changes' | null>(null)
  const [busy, setBusy] = useState(false)

  const err = meta.error ?? (canPreview ? preview.error : null)
  if (err instanceof ApiError && err.status === 403) return <div className="center-page"><Forbidden home={home} /></div>
  if (err) return <div className="center-page"><ErrorState error={err} retry={() => void (meta.refetch(), preview.refetch())} /></div>
  if (meta.isLoading || (canPreview && preview.isLoading)) return <div className="center-page"><div className="spinner" /></div>
  const m = meta.data!

  if (!canPreview) {
    const last = m.lastSubmission
    const r = last?.reviews.at(-1)
    return (
      <div className="center-page">
        <div className="card notice">
          <p>
            {last?.withdrawnAt
              ? 'Phiên bản này đã được nhà cung cấp rút lại để chỉnh sửa.'
              : r
                ? `Phiên bản ${m.number} đã được ${decisionText(r)} lúc ${fmtDateTime(r.createdAt)} bởi ${r.userName ?? '—'}.`
                : `Phiên bản ${m.number} đang được nhà cung cấp dựng, chưa gửi bạn duyệt.`}
          </p>
          <Link className="ab ab-primary" to={home}>Về Dự án của tôi</Link>
        </div>
      </div>
    )
  }

  const data = preview.data!
  const sub = history.data?.items.find((v) => v.id === versionId)?.submissions.at(-1)
  const lastReview = sub?.reviews.at(-1)
  const pending = data.preview.state === 'pending_review'
  const canAct = pending && me.role === 'approver'
  const others = (history.data?.items ?? []).filter((v) => v.id !== versionId && v.submissions.some((s) => s.reviews.length))

  // metadata trước: bản về Đang dựng thì người duyệt không được gọi API-39 nữa
  const reload = async () => {
    await qc.invalidateQueries({ queryKey: ['review-meta', versionId] })
    await Promise.all([qc.invalidateQueries({ queryKey: ['preview', versionId] }), qc.invalidateQueries({ queryKey: ['versions', m.houseId] })])
  }
  const send = async (body: { decision: 'approved' | 'changes_requested'; note?: string; targets?: { floorId: string; roomId?: string }[] }) => {
    setBusy(true)
    try {
      // gắn quyết định với đúng lần gửi đang xem (R-G3-03)
      await api('POST', `versions/${versionId}/review`, { ...body, submissionId: data.preview.submissionId })
      toast(body.decision === 'approved' ? `Đã duyệt phiên bản ${m.number}` : 'Đã gửi yêu cầu sửa')
      setDialog(null)
      await reload()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_STATE') {
        toast('Phiên bản đã được xử lý. Đã tải lại.', 'danger')
        setDialog(null)
        await reload()
      } else throw e
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="review-page">
      <HousePage
        data={data}
        toast={(s) => toast(s)}
        previewBanner={<div className="preview-banner">BẢN XEM TRƯỚC · Phiên bản {m.number} · Chưa công khai</div>}
      />
      <footer className="review-bar">
        <div className="grow">
          <strong>Phiên bản {m.number}</strong>
          {data.preview.submittedAt && <> · gửi {fmtDateTime(data.preview.submittedAt)} bởi {data.preview.submittedByName ?? '—'}</>}
          {!pending && lastReview && <div className="small">Phiên bản {m.number} đã được {decisionText(lastReview)} lúc {fmtDateTime(lastReview.createdAt)} bởi {lastReview.userName ?? '—'}.</div>}
          {others.length > 0 && (
            <details className="small">
              <summary>Lịch sử duyệt các phiên bản trước</summary>
              <ul>
                {others.flatMap((v) => v.submissions.flatMap((s) => s.reviews.map((r) => (
                  <li key={r.id}>Phiên bản {v.number}: {decisionText(r)} · {r.userName ?? '—'} · {fmtDateTime(r.createdAt)}{r.note && ` — ${r.note}`}</li>
                ))))}
              </ul>
            </details>
          )}
        </div>
        {canAct && (
          <>
            <Button onClick={() => setDialog('changes')}>Yêu cầu sửa</Button>
            <Button kind="primary" onClick={() => setDialog('approve')}>Duyệt phiên bản này</Button>
          </>
        )}
        {!canAct && <Link className="ab" to={home}>{me.role === 'approver' ? 'Về Dự án của tôi' : 'Đóng'}</Link>}
      </footer>
      {dialog === 'approve' && (
        <Confirm
          title="Duyệt phiên bản"
          message={<p>Bạn duyệt phiên bản {m.number} của {data.house.name}. Nội dung này sẽ được phép công khai. Lần duyệt được ghi lại kèm tên bạn và thời điểm.</p>}
          confirmLabel="Xác nhận duyệt"
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={() => void send({ decision: 'approved' }).catch((e) => toast(errMsg(e), 'danger'))}
        />
      )}
      {dialog === 'changes' && <ChangesDialog data={data} busy={busy} onClose={() => setDialog(null)} onSend={(note, targets) => send({ decision: 'changes_requested', note, targets })} />}
    </div>
  )
}

const ChangesDialog = ({ data, busy, onClose, onSend }: {
  data: PublicHousePayload
  busy: boolean
  onClose: () => void
  onSend: (note: string, targets: { floorId: string; roomId?: string }[]) => Promise<void>
}) => {
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const floors = sortedFloors(data.document)
  const toggle = (k: string) => setPicked((s) => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    return n
  })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (note.trim().length < 10) return setErrors({ note: 'Ghi chú cần ít nhất 10 ký tự' })
    const targets = [...picked].map((k) => {
      const [floorId, roomId] = k.split('/')
      return roomId ? { floorId, roomId } : { floorId }
    })
    try {
      await onSend(note.trim(), targets)
    } catch (err) {
      setErrors(fieldErrors(err))
      if (!Object.keys(fieldErrors(err)).length) toast(errMsg(err), 'danger')
    }
  }
  return (
    <Modal title="Yêu cầu sửa" onClose={onClose} wide>
      <form className="form am-body" onSubmit={(e) => void submit(e)}>
        <Field label="Cần sửa gì?" error={errors.note}>{(id) => <textarea id={id} rows={4} value={note} placeholder="Ví dụ: Đổi phòng ngủ 2 thành phòng làm việc, bỏ bồn tắm" onChange={(e) => setNote(e.target.value)} />}</Field>
        <div>
          <p className="small muted">Tầng / phòng liên quan (tuỳ chọn)</p>
          <div className="targets">
            {floors.map((f) => (
              <fieldset key={f.id}>
                <label className="check"><input type="checkbox" checked={picked.has(f.id)} onChange={() => toggle(f.id)} /> <strong>{f.name}</strong></label>
                {f.rooms.map((r) => (
                  <label key={r.id} className="check"><input type="checkbox" checked={picked.has(`${f.id}/${r.id}`)} onChange={() => toggle(`${f.id}/${r.id}`)} /> {r.name}</label>
                ))}
              </fieldset>
            ))}
          </div>
        </div>
        <footer className="am-foot">
          <Button type="button" onClick={onClose}>Huỷ</Button>
          <Button kind="primary" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu sửa'}</Button>
        </footer>
      </form>
    </Modal>
  )
}
