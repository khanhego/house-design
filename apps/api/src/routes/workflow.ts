import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sortedFloors } from '@hd/core'
import type { PublicHousePayload, Snapshot } from '@hd/core'
import type { Ctx } from '../context.ts'
import { forbidden, notFound, validation } from '../lib/errors.ts'
import { requireUser } from '../lib/auth.ts'
import { parse } from '../lib/validate.ts'
import { assertProject } from '../services/access.ts'
import type { AuthUser } from '../services/access.ts'
import { branding, projectInfo } from '../services/public.ts'
import { buildSnapshot, publicResolved } from '../services/snapshot.ts'
import { publish, review, submit, unpublish, withdraw } from '../services/workflow.ts'

const loadVersion = (ctx: Ctx, user: AuthUser, versionId: string) => {
  const v = ctx.repos.versions.get(versionId)
  if (!v) throw notFound('Không tìm thấy phiên bản')
  const house = ctx.repos.houses.get(v.houseId)!
  const project = assertProject(ctx, user, house.projectId)
  return { v, house, project }
}

const Targets = z.array(z.object({ floorId: z.string().max(40), roomId: z.string().max(40).optional() }).strict()).max(50).optional()
const ReviewBody = z.object({
  decision: z.enum(['approved', 'changes_requested']),
  note: z.string().max(2000).nullable().optional(),
  targets: Targets,
}).strict()
const OnBehalfBody = ReviewBody.extend({ note: z.string().max(2000), evidenceFileId: z.string().min(1) })

/** Workflow phiên bản & xem trước (02 API-39, 50…55; 02a §4). */
export const registerWorkflow = async (app: FastifyInstance, ctx: Ctx) => {
  /* API-39: cùng shape API-61; bản nháp dựng tại chỗ, còn lại từ snapshot của submission. */
  app.get<{ Params: { id: string } }>('/api/v1/versions/:id/preview', async (req, reply) => {
    const u = requireUser(ctx, req)
    const { v, house, project } = loadVersion(ctx, u, req.params.id)
    if (u.role === 'approver' && v.state === 'draft') throw forbidden()
    let snapshot: Snapshot
    let submittedAt: string | null = null
    let submittedBy: string | null = null
    if (v.state === 'draft') snapshot = buildSnapshot(ctx, v.document, house).snapshot
    else {
      const sub = (v.currentSubmissionId && ctx.repos.submissions.get(v.currentSubmissionId)) || ctx.repos.submissions.lastForVersion(v.id)
      if (!sub) throw notFound()
      snapshot = JSON.parse(sub.snapshot) as Snapshot
      submittedAt = sub.submittedAt
      submittedBy = sub.submittedBy
    }
    const client = ctx.repos.clients.get(project.clientId)!
    reply.header('cache-control', 'private, no-store')
    const out: PublicHousePayload = {
      project: projectInfo(ctx, project),
      branding: branding(ctx, client),
      house: { ...snapshot.house, slug: house.slug },
      version: { number: v.number, publishedAt: v.publishedAt },
      document: { ...snapshot.document, floors: sortedFloors(snapshot.document) },
      resolved: publicResolved(snapshot),
      preview: { versionNumber: v.number, state: v.state, submittedAt, submittedByName: submittedBy ? ctx.repos.users.get(submittedBy)?.name ?? null : null },
    }
    return out
  })

  app.post<{ Params: { id: string } }>('/api/v1/versions/:id/submit', async (req) => {
    const u = requireUser(ctx, req, ['admin'])
    loadVersion(ctx, u, req.params.id)
    return submit(ctx, req.params.id, u)
  })

  app.post<{ Params: { id: string } }>('/api/v1/versions/:id/withdraw', async (req) => {
    const u = requireUser(ctx, req, ['admin'])
    loadVersion(ctx, u, req.params.id)
    const r = withdraw(ctx, req.params.id, u)
    return { version: r.version, submission: r.submission ? { id: r.submission.id, withdrawnAt: r.submission.withdrawnAt } : null }
  })

  app.post<{ Params: { id: string } }>('/api/v1/versions/:id/review', async (req) => {
    const u = requireUser(ctx, req, ['approver'])
    loadVersion(ctx, u, req.params.id)
    const b = parse(ReviewBody, req.body)
    return review(ctx, req.params.id, u, b)
  })

  app.post<{ Params: { id: string } }>('/api/v1/versions/:id/review-on-behalf', async (req) => {
    const u = requireUser(ctx, req, ['admin'])
    const { project } = loadVersion(ctx, u, req.params.id)
    const b = parse(OnBehalfBody, req.body)
    const ev = ctx.repos.files.get(b.evidenceFileId)
    if (!ev || ev.kind !== 'evidence' || ev.projectId !== project.id) throw validation({ evidenceFileId: 'Cần tải bằng chứng duyệt của dự án này' })
    return review(ctx, req.params.id, u, b, { evidenceFileId: ev.id })
  })

  app.post<{ Params: { id: string } }>('/api/v1/versions/:id/publish', async (req) => {
    const u = requireUser(ctx, req, ['admin'])
    loadVersion(ctx, u, req.params.id)
    const r = publish(ctx, req.params.id, u)
    return { house: { id: r.house.id, publishedVersionId: r.house.publishedVersionId }, version: r.version, previous: r.previous ? { id: r.previous.id, state: r.previous.state } : null }
  })

  app.post<{ Params: { id: string } }>('/api/v1/houses/:id/unpublish', async (req) => {
    const u = requireUser(ctx, req, ['admin'])
    const h = ctx.repos.houses.get(req.params.id)
    if (!h) throw notFound('Không tìm thấy mẫu nhà')
    assertProject(ctx, u, h.projectId)
    const r = unpublish(ctx, h.id)
    return { house: { id: r.house.id, publishedVersionId: null }, version: { id: r.version.id, state: r.version.state } }
  })
}
