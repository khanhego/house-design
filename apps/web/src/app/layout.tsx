import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import type { Me } from './auth.tsx'

const useLogout = () => {
  const qc = useQueryClient()
  const nav = useNavigate()
  return async (area: string) => {
    await api('POST', 'auth/logout').catch(() => {})
    qc.clear()
    nav(`/${area}/login`, { replace: true })
  }
}

const ROLE: Record<string, string> = { admin: 'Quản trị viên', producer: 'Người dựng', approver: 'Người duyệt' }

export const StudioLayout = ({ me, children, wide }: { me: Me; children: ReactNode; wide?: boolean }) => {
  const logout = useLogout()
  const links: [string, string, boolean][] = [
    ['/studio/projects', 'Dự án', true],
    ['/studio/library', 'Thư viện đồ', true],
    ['/studio/clients', 'Khách hàng', me.role === 'admin'],
    ['/studio/users', 'Tài khoản', me.role === 'admin'],
    ['/studio/leads', 'Lead', me.role === 'admin'],
    ['/studio/stats', 'Thống kê', me.role === 'admin'],
  ]
  return (
    <div className="studio">
      <aside className="side">
        <div className="side-brand">Nhà mẫu online<span>Studio</span></div>
        <nav>
          {links.filter((l) => l[2]).map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'on' : '')}>{label}</NavLink>
          ))}
        </nav>
        <div className="side-user">
          <strong>{me.name}</strong>
          <span>{ROLE[me.role]}</span>
          <button className="link-sm" onClick={() => void logout('studio')}>Đăng xuất</button>
        </div>
      </aside>
      <main className={wide ? 'studio-main wide' : 'studio-main'}>{children}</main>
    </div>
  )
}

export const PortalLayout = ({ me, children }: { me: Me; children: ReactNode }) => {
  const logout = useLogout()
  return (
    <div className="portal">
      <header className="portal-top">
        <div className="side-brand">Nhà mẫu online<span>{me.clientName ?? 'Cổng khách hàng'}</span></div>
        <nav>
          <NavLink to="/portal" end className={({ isActive }) => (isActive ? 'on' : '')}>Dự án của tôi</NavLink>
          <NavLink to="/portal/leads" className={({ isActive }) => (isActive ? 'on' : '')}>Lead</NavLink>
          <NavLink to="/portal/stats" className={({ isActive }) => (isActive ? 'on' : '')}>Thống kê</NavLink>
        </nav>
        <div className="portal-user">
          <span>{me.name}</span>
          <button className="link-sm" onClick={() => void logout('portal')}>Đăng xuất</button>
        </div>
      </header>
      <main className="portal-main">{children}</main>
    </div>
  )
}

export const PageHead = ({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) => (
  <header className="page-head">
    <div>
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>
)
