import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError } from '../lib/api.ts'

/* Bộ UI dùng chung cho portal + studio (02b §3). */

export const Button = ({ kind = 'default', small, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'default' | 'primary' | 'danger' | 'ghost'; small?: boolean }) => (
  <button {...p} className={`ab ab-${kind}${small ? ' ab-sm' : ''} ${p.className ?? ''}`} />
)

export const Field = ({ label, error, hint, children, id }: { label: string; error?: string; hint?: ReactNode; children: (id: string) => ReactNode; id?: string }) => {
  const gen = useId()
  const fid = id ?? gen
  return (
    <div className={error ? 'field has-error' : 'field'}>
      <label htmlFor={fid}>{label}</label>
      {children(fid)}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  )
}

export const Badge = ({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'brand'; children: ReactNode }) => <span className={`badge badge-${tone}`}>{children}</span>

export const STATE_LABEL: Record<string, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'danger' | 'brand' }> = {
  draft: { label: 'Đang dựng', tone: 'neutral' },
  pending_review: { label: 'Chờ khách duyệt', tone: 'warn' },
  approved: { label: 'Đã duyệt', tone: 'brand' },
  published: { label: 'Đã phát hành', tone: 'ok' },
  superseded: { label: 'Đã thay thế', tone: 'neutral' },
  unpublished: { label: 'Đã gỡ', tone: 'danger' },
}
export const StateBadge = ({ state }: { state: string }) => <Badge tone={STATE_LABEL[state]?.tone ?? 'neutral'}>{STATE_LABEL[state]?.label ?? state}</Badge>

export const Skeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="skeleton" aria-busy="true" aria-label="Đang tải">
    {Array.from({ length: rows }, (_, i) => <div key={i} />)}
  </div>
)

export const EmptyState = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="empty">
    <p>{children}</p>
    {action}
  </div>
)

export const ErrorState = ({ error, retry }: { error: unknown; retry?: () => void }) => (
  <div className="error-state" role="alert">
    <p>{error instanceof ApiError ? error.message : 'Không tải được dữ liệu. Thử lại.'}</p>
    {retry && <Button onClick={retry}>Thử lại</Button>}
  </div>
)

export const Forbidden = ({ home }: { home: string }) => (
  <div className="empty">
    <p>Bạn không có quyền xem trang này.</p>
    <a className="ab ab-primary" href={home}>Về trang chính</a>
  </div>
)

export const Modal = ({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus()
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="am-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'am wide' : 'am'} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header>
          <h2>{title}</h2>
          <button className="x" onClick={onClose} aria-label="Đóng">×</button>
        </header>
        {children}
      </div>
    </div>
  )
}

export const Confirm = ({ title, message, confirmLabel, danger, onConfirm, onClose, busy }: {
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
  busy?: boolean
}) => (
  <Modal title={title} onClose={onClose}>
    <div className="am-body">{message}</div>
    <footer className="am-foot">
      <Button onClick={onClose}>Huỷ</Button>
      <Button kind={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{busy ? 'Đang xử lý…' : confirmLabel}</Button>
    </footer>
  </Modal>
)

/* toast toàn cục */
type ToastFn = (msg: string, tone?: 'ok' | 'danger') => void
let pushToast: ToastFn = () => {}
export const toast: ToastFn = (m, t) => pushToast(m, t)
export const ToastHost = () => {
  const [items, setItems] = useState<{ id: number; msg: string; tone: string }[]>([])
  useEffect(() => {
    pushToast = (msg, tone = 'ok') => {
      const id = Date.now() + Math.random()
      setItems((s) => [...s, { id, msg, tone }])
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3200)
    }
  }, [])
  return (
    <div className="toasts" role="status">
      {items.map((t) => <div key={t.id} className={`toast-item ${t.tone}`}>{t.msg}</div>)}
    </div>
  )
}

/** Gán lỗi server theo field (02b §5). */
export const fieldErrors = (e: unknown): Record<string, string> => (e instanceof ApiError ? e.fields : {})
export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Đã có lỗi, thử lại sau.')

export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** slug từ tên tiếng Việt (02b §5). */
export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
