import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Ctx } from '../context.ts'
import { AppError, notFound, validation } from '../lib/errors.ts'
import { requireUser } from '../lib/auth.ts'
import { parse } from '../lib/validate.ts'
import { assertProject } from '../services/access.ts'
import { fileUrl } from '../repos/types.ts'
import type { ModelAsset, ModelNormalize } from '../repos/types.ts'
import { DEFAULT_NORMALIZE, enqueueModel } from '../jobs/modelJob.ts'
import { receiveFile } from './projects.ts'

export const modelOut = (ctx: Ctx, m: ModelAsset) => {
  const f = m.optimizedFileId ? ctx.repos.files.get(m.optimizedFileId) : undefined
  const lf = m.lightFileId ? ctx.repos.files.get(m.lightFileId) : undefined
  const o = ctx.repos.files.get(m.originalFileId)
  return {
    id: m.id, status: m.status, url: f ? fileUrl(f.storageKey) : null, report: m.report, level: m.level, reasons: m.reasons, error: m.error, originalName: o?.originalName ?? null,
    // đồ chân thực (item 03 lát R2)
    lightUrl: lf ? fileUrl(lf.storageKey) : null, lightReport: m.lightReport, normalize: m.normalize,
  }
}

const Normalize = z.object({
  unit: z.enum(['auto', 'm', 'cm', 'mm', 'in']).default('auto'),
  upAxis: z.enum(['auto', 'y', 'z']).default('auto'),
  declaredMm: z.tuple([z.number().min(1).max(20000), z.number().min(1).max(20000), z.number().min(1).max(20000)]).nullable().default(null),
})

/** Trường form khi tải mô hình đồ: `unit`, `upAxis`, `declaredMm` = "R,C,S" (mm). */
const normalizeFromFields = (f: Record<string, string | undefined>): ModelNormalize => {
  const mm = f.declaredMm?.split(',').map((x) => Number(x.trim()))
  return parse(Normalize, {
    unit: f.unit || undefined,
    upAxis: f.upAxis || undefined,
    declaredMm: mm && mm.length === 3 && mm.every((x) => x > 0) ? mm : null,
  }) as ModelNormalize
}

/** API-37, 38 · item 03 lát R2: FBX/OBJ/ZIP, chuẩn hoá, bản nhẹ, xử lý lại. */
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
    let normalize = DEFAULT_NORMALIZE
    const f = await receiveFile(ctx, req, u, { kind: 'model_original', projectId: null, onFields: (fields) => (normalize = normalizeFromFields(fields)) })
    const m = ctx.repos.models.create({ projectId: null, originalFileId: f.id, createdBy: u.id, normalize })
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
  // tự nhận sai đơn vị / trục → chọn tay rồi xử lý lại (R2.2, DEC-R15)
  app.post<{ Params: { id: string } }>('/api/v1/models/:id/reprocess', async (req, reply) => {
    requireUser(ctx, req, ['admin', 'producer'])
    const m = ctx.repos.models.get(req.params.id)
    if (!m) throw notFound()
    if (m.projectId) throw validation({ id: 'Chỉ xử lý lại được mô hình đồ thư viện' })
    if (m.status === 'processing') throw new AppError(409, 'MODEL_PROCESSING', 'Mô hình đang được xử lý')
    const b = parse(Normalize, req.body ?? {}) as ModelNormalize
    ctx.repos.models.restart(m.id, b)
    // mô hình đổi → món dùng nó phải duyệt lại, chọn lại cách xử lý lệch kích thước
    for (const it of ctx.repos.library.list({ allClients: true, includeRetired: true }).filter((i) => i.modelAssetId === m.id))
      ctx.repos.library.update(it.id, { sizeAccepted: false, ...(it.status === 'ready' ? { status: 'draft' as const, approvedBy: null, approvedAt: null } : {}) })
    enqueueModel(ctx, m.id)
    return reply.status(202).send({ model: modelOut(ctx, ctx.repos.models.get(m.id)!) })
  })
}
