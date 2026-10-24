import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api.ts'
import { Button, Field, errMsg } from './ui.tsx'

export interface Me {
  id: string
  email: string
  name: string
  role: 'admin' | 'producer' | 'approver'
  status: string
  clientId: string | null
  clientName: string | null
}

export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<{ user: Me }>('GET', 'auth/me')).user
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 5 * 60_000,
  })

export const homeFor = (me: Me) => (me.role === 'approver' ? '/portal' : '/studio/projects')

/** Guard theo vai trò (02b §2): chưa đăng nhập → trang đăng nhập; sai vai trò → về trang chính. */
export const Guard = ({ area, roles, children }: { area: 'portal' | 'studio'; roles?: Me['role'][]; children: (me: Me) => ReactNode }) => {
  const me = useMe()
  const loc = useLocation()
  if (me.isLoading) return <div className="center-page"><div className="spinner" /></div>
  if (!me.data) return <Navigate to={`/${area}/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  const u = me.data
  if (area === 'studio' && u.role === 'approver') return <Navigate to="/portal" replace />
  if (area === 'portal' && u.role !== 'approver' && !loc.pathname.startsWith('/portal/review/')) return <Navigate to="/studio/projects" replace />
  if (roles && !roles.includes(u.role))
    return (
      <div className="center-page">
        <p>Bạn không có quyền xem trang này.</p>
        <Link className="ab ab-primary" to={homeFor(u)}>Về trang chính</Link>
      </div>
    )
  return <>{children(u)}</>
}

const AuthCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="auth-page">
    <div className="auth-card">
      <div className="auth-brand">Nhà mẫu online</div>
      <h1>{title}</h1>
      {children}
    </div>
  </div>
)

export const LoginPage = ({ area }: { area: 'portal' | 'studio' }) => {
  const qc = useQueryClient()
  const nav = useNavigate()
  const next = new URLSearchParams(location.search).get('next')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      const { user } = await api<{ user: Me }>('POST', 'auth/login', { email, password })
      qc.setQueryData(['me'], user)
      nav(next && next.startsWith('/') ? next : homeFor(user), { replace: true })
    } catch (e2) {
      setErr(errMsg(e2))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthCard title={area === 'portal' ? 'Đăng nhập cổng khách hàng' : 'Đăng nhập studio'}>
      <form onSubmit={submit} className="form">
        {err && <p className="form-error" role="alert">{err}</p>}
        <Field label="Email">{(id) => <input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Mật khẩu">{(id) => <input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <Button kind="primary" type="submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
        <Link to={`/${area}/forgot`} className="link-sm">Quên mật khẩu?</Link>
      </form>
    </AuthCard>
  )
}

export const ForgotPage = ({ area }: { area: 'portal' | 'studio' }) => {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <AuthCard title="Quên mật khẩu">
      {sent ? (
        <p>Nếu email có trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu (hết hạn sau 1 giờ).</p>
      ) : (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            await api('POST', 'auth/password/forgot', { email }).catch(() => {})
            setBusy(false)
            setSent(true)
          }}
        >
          <Field label="Email">{(id) => <input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Button kind="primary" type="submit" disabled={busy}>Gửi liên kết</Button>
        </form>
      )}
      <Link to={`/${area}/login`} className="link-sm">← Đăng nhập</Link>
    </AuthCard>
  )
}

/** Token đọc từ fragment (#token=) để không lọt vào log máy chủ (R-28). */
export const SetPasswordPage = ({ area }: { area: 'portal' | 'studio' }) => {
  const qc = useQueryClient()
  const nav = useNavigate()
  const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? ''
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!token) return <AuthCard title="Liên kết không hợp lệ"><p>Liên kết thiếu mã. Hãy mở lại từ email hoặc yêu cầu gửi lại.</p><Link to={`/${area}/forgot`} className="link-sm">Yêu cầu gửi lại</Link></AuthCard>
  return (
    <AuthCard title="Đặt mật khẩu">
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault()
          if (pw.length < 8) return setErr('Mật khẩu cần ít nhất 8 ký tự.')
          if (pw !== pw2) return setErr('Hai mật khẩu chưa khớp.')
          setBusy(true)
          try {
            const { user } = await api<{ user: Me }>('POST', 'auth/password/set', { token, password: pw })
            history.replaceState(null, '', location.pathname)
            qc.setQueryData(['me'], user)
            nav(homeFor(user), { replace: true })
          } catch (e2) {
            setErr(e2 instanceof ApiError && e2.code === 'TOKEN_INVALID' ? 'Liên kết đã hết hạn. Yêu cầu gửi lại.' : errMsg(e2))
          } finally {
            setBusy(false)
          }
        }}
      >
        {err && <p className="form-error" role="alert">{err} {err.includes('hết hạn') && <Link to={`/${area}/forgot`}>Yêu cầu gửi lại</Link>}</p>}
        <Field label="Mật khẩu mới" hint="Ít nhất 8 ký tự">{(id) => <input id={id} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
        <Field label="Nhập lại mật khẩu">{(id) => <input id={id} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}</Field>
        <Button kind="primary" type="submit" disabled={busy}>Lưu mật khẩu</Button>
      </form>
    </AuthCard>
  )
}
