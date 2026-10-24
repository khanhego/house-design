import type { FastifyInstance } from 'fastify'
import type { Ctx } from '../context.ts'
import { notFound } from '../lib/errors.ts'
import { requireUser } from '../lib/auth.ts'
import { assertProject } from '../services/access.ts'
import { fileUrl } from '../repos/types.ts'
import type { ModelAsset } from '../repos/types.ts'
import { enqueueModel } from '../jobs/modelJob.ts'
import { receiveFile } from './projects.ts'

export const modelOut = (ctx: Ctx, m: ModelAsset) => {
  const f = m.optimizedFileId ? ctx.repos.files.get(m.optimizedFileId) : undefined
  const o = ctx.repos.files.get(m.originalFileId)
  return { id: m.id, status: m.status, url: f ? fileUrl(f.storageKey) : null, report: m.report, level: m.level, reasons: m.reasons, error: m.error, originalName: o?.originalName ?? null }
}

/** API-37, 38. */
export const registerModels = async (app: FastifyInstance, ctx: Ctx) => {
  app.post<{ Params: { id: string } }>('/api/v1/projects/:id/models', async (req, reply) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    assertProject(ctx, u, req.params.id)
    const f = await receiveFile(ctx, req, u, { kind: 'model_original', projectId: req.params.id })
    const m = ctx.repos.models.create({ projectId: req.params.id, originalFileId: f.id, createdBy: u.id })
    enqueueModel(ctx, m.id)
    return reply.status(202).send({ model: modelOut(ctx, m) })
  })
  app.post('/api/v1/library/models', async (req, reply) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const f = await receiveFile(ctx, req, u, { kind: 'model_original', projectId: null })
    const m = ctx.repos.models.create({ projectId: null, originalFileId: f.id, createdBy: u.id })
    enqueueModel(ctx, m.id)
    return reply.status(202).send({ model: modelOut(ctx, m) })
  })
  app.get<{ Params: { id: string } }>('/api/v1/models/:id', async (req) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const m = ctx.repos.models.get(req.params.id)
    if (!m) throw notFound()
    if (m.projectId) assertProject(ctx, u, m.projectId)
    return { model: modelOut(ctx, m) }
  })
}
