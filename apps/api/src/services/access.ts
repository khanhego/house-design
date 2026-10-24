import { forbidden, notFound } from '../lib/errors.ts'
import { addDays, vnDate } from '../lib/time.ts'
import type { Client, Project, Role } from '../repos/types.ts'
import type { Ctx } from '../context.ts'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
  clientId: string | null
}

/** BR-08: khách hàng tạm ngưng, quá hạn hosting 7 ngày, hoặc dự án bị đặt không khả dụng → không hiển thị công khai. */
export const availability = (client: Client | undefined, project: Project, today = vnDate()) => {
  if (!client || client.status !== 'active') return { available: false, reason: 'suspended' as const }
  if (project.status !== 'active') return { available: false, reason: 'unavailable' as const }
  if (client.hostingUntil && today > addDays(client.hostingUntil, 7)) return { available: false, reason: 'expired' as const }
  return { available: true as const, reason: null }
}

/** Còn hợp đồng (chưa quá hạn) — để V4 hiện liên hệ của khách hàng hay của nhà cung cấp. */
export const hasContract = (client: Client | undefined, today = vnDate()) =>
  !!client && client.status === 'active' && (!client.hostingUntil || today <= addDays(client.hostingUntil, 7))

/** A, P: mọi dự án; R: chỉ dự án của khách hàng mình (BR-11). */
export const assertProject = (ctx: Ctx, user: AuthUser, projectId: string): Project => {
  const p = ctx.repos.projects.get(projectId)
  if (!p) throw notFound('Không tìm thấy dự án')
  if (user.role === 'approver' && p.clientId !== user.clientId) throw forbidden()
  return p
}

export const assertRole = (user: AuthUser, roles: Role[]) => {
  if (!roles.includes(user.role)) throw forbidden()
}
