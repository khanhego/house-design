import type { Ctx } from '../context.ts'
import type { FileRow } from '../repos/types.ts'
import type { AuthUser } from './access.ts'
import { availability } from './access.ts'

/**
 * Quyền đọc file (02 §6.2). Trả { ok, public } — public quyết định header cache.
 * Không bao giờ phục vụ công khai file input/evidence/model_original.
 */
export const canReadFile = (ctx: Ctx, user: AuthUser | null, file: FileRow): { ok: boolean; public: boolean } => {
  const db = ctx.db
  // tệp thư viện dùng chung nhiều dự án: chỉ cần một dự án đang phát hành và còn khả dụng (R-G3-02)
  const publishedIn = db.all<{ project_id: string }>(
    `SELECT DISTINCT h.project_id FROM submission_files sf
       JOIN submissions s ON s.id = sf.submission_id
       JOIN versions v ON v.id = s.version_id AND v.current_submission_id = s.id AND v.state = 'published'
       JOIN houses h ON h.id = v.house_id
      WHERE sf.storage_key = ?`,
    file.storageKey,
  )
  for (const { project_id } of publishedIn) {
    const project = ctx.repos.projects.get(project_id)
    if (project && availability(ctx.repos.clients.get(project.clientId), project).available) return { ok: true, public: true }
  }
  if (file.kind === 'logo') {
    const c = db.get<{ id: string }>('SELECT id FROM clients WHERE logo_file_id = ?', file.id)
    if (c) {
      const client = ctx.repos.clients.get(c.id)
      if (client?.status === 'active') return { ok: true, public: true }
    }
  }
  if (file.kind === 'cover') {
    const p = db.get<{ id: string }>('SELECT id FROM projects WHERE cover_file_id = ?', file.id)
    if (p) {
      const project = ctx.repos.projects.get(p.id)!
      if (availability(ctx.repos.clients.get(project.clientId), project).available) return { ok: true, public: true }
    }
  }
  if (!user) return { ok: false, public: false }
  if (user.role === 'admin' || user.role === 'producer') return { ok: true, public: false }
  // người duyệt: file trong snapshot của khách hàng mình, bằng chứng thuộc dự án của mình, logo khách hàng mình
  if (file.kind === 'input' || file.kind === 'model_original') return { ok: false, public: false }
  const inOwnSubmission = db.get(
    `SELECT 1 FROM submission_files sf JOIN submissions s ON s.id = sf.submission_id
       JOIN versions v ON v.id = s.version_id JOIN houses h ON h.id = v.house_id JOIN projects p ON p.id = h.project_id
      WHERE sf.storage_key = ? AND p.client_id = ? LIMIT 1`,
    file.storageKey, user.clientId,
  )
  if (inOwnSubmission) return { ok: true, public: false }
  if (file.projectId) {
    const p = ctx.repos.projects.get(file.projectId)
    if (p && p.clientId === user.clientId && (file.kind === 'evidence' || file.kind === 'cover')) return { ok: true, public: false }
  }
  if (file.kind === 'logo' && db.get('SELECT 1 FROM clients WHERE logo_file_id = ? AND id = ?', file.id, user.clientId)) return { ok: true, public: false }
  return { ok: false, public: false }
}
