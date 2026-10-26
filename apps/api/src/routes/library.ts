import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { FALLBACK_SHAPES, ITEM_CATEGORIES, LICENSES, SIZE_MUST_CHOOSE_PCT, SOURCE_KINDS, sizeDeviation } from '@hd/core'
import type { HouseDocument } from '@hd/core'
import type { Ctx } from '../context.ts'
import { AppError, forbidden, notFound, validation } from '../lib/errors.ts'
import { requireUser } from '../lib/auth.ts'
import { parse } from '../lib/validate.ts'
import { fileUrl } from '../repos/types.ts'
import type { LibraryItem } from '../repos/types.ts'
import { approvalProblem } from '../services/materials.ts'

const ItemBody = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(ITEM_CATEGORIES),
  sizeMm: z.tuple([z.number().min(1).max(20000), z.number().min(1).max(20000), z.number().min(1).max(20000)]),
  material: z.string().trim().max(300).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  imageFileIds: z.array(z.string().max(64)).max(12).optional(),
  modelAssetId: z.string().max(64).nullable().optional(),
  fallbackShape: z.enum(FALLBACK_SHAPES).nullable().optional(),
  variants: z
    .array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,32}$/), name: z.string().trim().min(1).max(60), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/) }))
    .max(20)
    .optional()
    .refine((v) => !v || new Set(v.map((x) => x.id)).size === v.length, 'Mã biến thể bị trùng'),
  // item 03 lát R2: mã sản phẩm, nguồn & giấy phép (BR-R1), phạm vi khách (BR-R3)
  productCode: z.string().trim().max(60).nullable().optional(),
  sourceKind: z.enum(SOURCE_KINDS).optional(),
  sourceName: z.string().trim().max(120).nullable().optional(),
  sourceUrl: z.string().trim().url().max(500).nullable().optional(),
  license: z.enum(LICENSES).nullable().optional(),
  attribution: z.string().trim().max(500).nullable().optional(),
  clientId: z.string().max(64).nullable().optional(),
  /** lệch kích thước > 20%: chọn co giãn mô hình theo khai báo (BR-R4) */
  acceptSizeMismatch: z.boolean().optional(),
})
type Body = z.infer<typeof ItemBody>

/** Sửa những trường này ở món đã duyệt → về Nháp, QTV duyệt lại (FR-13.05). Bản đã phát hành không đổi (BR-R6). */
const REVIEWED = ['modelAssetId', 'sourceKind', 'sourceName', 'sourceUrl', 'license', 'attribution', 'clientId'] as const

/** Số mẫu nhà đang dùng đồ (bản mở + bản đang phát hành). */
const usage = (ctx: Ctx, itemId: string) => {
  const rows = ctx.db.all<{ house_id: string; document: string }>(
    "SELECT house_id, document FROM versions WHERE state IN ('draft','pending_review','approved','published')",
  )
  const houses = new Set<string>()
  for (const r of rows) {
    const doc = JSON.parse(r.document) as HouseDocument
    if (doc.floors.some((f) => f.items.some((it) => 'libraryItemId' in it.source && it.source.libraryItemId === itemId))) houses.add(r.house_id)
  }
  return houses.size
}

/** Kích thước đo được của mô hình đã chuẩn hoá (mm), nếu có. */
const measuredOf = (ctx: Ctx, modelAssetId: string | null | undefined) => {
  const m = modelAssetId ? ctx.repos.models.get(modelAssetId) : undefined
  return m?.status === 'ready' ? m.normalize?.result?.measuredMm ?? null : null
}

const itemOut = (ctx: Ctx, i: LibraryItem) => {
  const imgs = ctx.repos.files.byIds(i.imageFileIds)
  const model = i.modelAssetId ? ctx.repos.models.get(i.modelAssetId) : undefined
  const mf = model?.optimizedFileId ? ctx.repos.files.get(model.optimizedFileId) : undefined
  const lf = model?.lightFileId ? ctx.repos.files.get(model.lightFileId) : undefined
  const measuredMm = measuredOf(ctx, i.modelAssetId)
  return {
    ...i,
    imageUrls: i.imageFileIds.map((id) => imgs.get(id)).filter(Boolean).map((f) => fileUrl(f!.storageKey)),
    model: model
      ? { id: model.id, status: model.status, level: model.level, url: mf ? fileUrl(mf.storageKey) : null, lightUrl: lf ? fileUrl(lf.storageKey) : null, normalized: !!model.normalize?.result }
      : null,
    measuredMm,
    sizeDeviation: measuredMm ? Math.round(sizeDeviation(i.sizeMm, measuredMm) * 10) / 10 : null,
    clientName: i.clientId ? ctx.repos.clients.get(i.clientId)?.name ?? null : null,
  }
}

const checkRefs = (ctx: Ctx, b: { imageFileIds?: string[]; modelAssetId?: string | null; clientId?: string | null }) => {
  if (b.imageFileIds) {
    const fs = ctx.repos.files.byIds(b.imageFileIds)
    if (b.imageFileIds.some((id) => fs.get(id)?.kind !== 'library_image')) throw validation({ imageFileIds: 'Ảnh không hợp lệ' })
  }
  if (b.modelAssetId) {
    const m = ctx.repos.models.get(b.modelAssetId)
    if (!m || m.projectId !== null) throw validation({ modelAssetId: 'Mô hình không thuộc thư viện' })
  }
  if (b.clientId && !ctx.repos.clients.get(b.clientId)) throw validation({ clientId: 'Không tìm thấy khách hàng' })
}

/** BR-R4: mô hình lệch khai báo > 20% → phải chọn co giãn theo khai báo, hoặc sửa khai báo theo mô hình. */
const checkSize = (ctx: Ctx, sizeMm: [number, number, number], modelAssetId: string | null, accepted: boolean) => {
  const measuredMm = measuredOf(ctx, modelAssetId)
  if (!measuredMm || accepted) return
  const dev = sizeDeviation(sizeMm, measuredMm)
  if (dev > SIZE_MUST_CHOOSE_PCT)
    throw new AppError(422, 'SIZE_MISMATCH', `Mô hình đo được ${measuredMm.join(' × ')} mm, lệch ${dev.toFixed(0)}% so với kích thước khai báo. Chọn co giãn mô hình theo khai báo, hoặc lấy kích thước của mô hình.`, {
      extra: { measuredMm, deviation: Math.round(dev * 10) / 10 },
    })
}

const meta = (b: Partial<Body>) => {
  const out: Partial<LibraryItem> = {}
  for (const k of ['productCode', 'sourceKind', 'sourceName', 'sourceUrl', 'license', 'attribution', 'clientId'] as const) if (b[k] !== undefined) (out as Record<string, unknown>)[k] = b[k]
  return out
}

/** API-40, 41 · item 03 lát R2 (R2.4): phạm vi, nguồn & giấy phép, duyệt. */
export const registerLibrary = async (app: FastifyInstance, ctx: Ctx) => {
  const load = (id: string) => {
    const cur = ctx.repos.library.get(id)
    if (!cur || cur.archived) throw notFound()
    return cur
  }

  app.get('/api/v1/library/items', async (req) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const q = req.query as { q?: string; category?: string; clientId?: string; all?: string; status?: string; includeRetired?: string }
    if (q.all === '1' && u.role !== 'admin') throw forbidden('Chỉ quản trị viên xem được đồ của mọi khách hàng')
    const items = ctx.repos.library.list({
      q: q.q?.trim() || undefined, category: q.category || undefined, clientId: q.clientId || null, allClients: q.all === '1',
      status: q.status || undefined, includeRetired: q.includeRetired === '1',
    })
    return { items: items.map((i) => itemOut(ctx, i)), nextCursor: null }
  })

  app.post('/api/v1/library/items', async (req, reply) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const b = parse(ItemBody, req.body)
    if (b.clientId && u.role !== 'admin') throw forbidden('Chỉ quản trị viên gán đồ cho khách hàng')
    checkRefs(ctx, b)
    checkSize(ctx, b.sizeMm, b.modelAssetId ?? null, !!b.acceptSizeMismatch)
    const it = ctx.repos.library.create({
      name: b.name, category: b.category, sizeMm: b.sizeMm, material: b.material ?? null, brand: b.brand ?? null, description: b.description ?? null,
      imageFileIds: b.imageFileIds ?? [], modelAssetId: b.modelAssetId ?? null, fallbackShape: b.fallbackShape ?? null, variants: b.variants ?? [],
      ...meta(b), sizeAccepted: !!b.acceptSizeMismatch,
    })
    return reply.status(201).send({ item: itemOut(ctx, it) })
  })

  app.patch<{ Params: { id: string } }>('/api/v1/library/items/:id', async (req) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const cur = load(req.params.id)
    const b = parse(ItemBody.partial(), req.body)
    if (b.clientId !== undefined && (b.clientId ?? null) !== cur.clientId && u.role !== 'admin') throw forbidden('Chỉ quản trị viên gán đồ cho khách hàng')
    checkRefs(ctx, b)
    const modelChanged = b.modelAssetId !== undefined && (b.modelAssetId ?? null) !== cur.modelAssetId
    const sizeAccepted = b.acceptSizeMismatch ?? (modelChanged ? false : cur.sizeAccepted)
    checkSize(ctx, b.sizeMm ?? cur.sizeMm, b.modelAssetId !== undefined ? b.modelAssetId ?? null : cur.modelAssetId, sizeAccepted)
    const reviewed = REVIEWED.some((k) => b[k] !== undefined && (b[k] ?? null) !== cur[k])
    const back = cur.status === 'ready' && reviewed ? { status: 'draft' as const, approvedBy: null, approvedAt: null } : {}
    const { acceptSizeMismatch: _a, ...rest } = b
    return { item: itemOut(ctx, ctx.repos.library.update(cur.id, { ...rest, sizeAccepted, ...back })!) }
  })

  app.post<{ Params: { id: string } }>('/api/v1/library/items/:id/approve', async (req) => {
    const u = requireUser(ctx, req, ['admin'])
    const cur = load(req.params.id)
    const problem = approvalProblem(cur)
    if (problem) throw new AppError(422, 'LICENSE_INCOMPLETE', problem)
    if (cur.modelAssetId) {
      const m = ctx.repos.models.get(cur.modelAssetId)
      if (m?.status !== 'ready') throw new AppError(422, 'MODEL_NOT_READY', m?.status === 'failed' ? 'Mô hình xử lý lỗi — tải lại mô hình trước khi duyệt' : 'Mô hình đang được xử lý')
    }
    checkSize(ctx, cur.sizeMm, cur.modelAssetId, cur.sizeAccepted)
    return { item: itemOut(ctx, ctx.repos.library.update(cur.id, { status: 'ready', approvedBy: u.id, approvedAt: new Date().toISOString() })!) }
  })

  app.post<{ Params: { id: string } }>('/api/v1/library/items/:id/retire', async (req) => {
    requireUser(ctx, req, ['admin'])
    const cur = load(req.params.id)
    return { item: itemOut(ctx, ctx.repos.library.update(cur.id, { status: 'retired' })!) }
  })

  app.delete<{ Params: { id: string } }>('/api/v1/library/items/:id', async (req, reply) => {
    requireUser(ctx, req, ['admin', 'producer'])
    const cur = load(req.params.id)
    const n = usage(ctx, cur.id)
    if (n > 0) throw new AppError(409, 'ITEM_IN_USE', `Đồ này đang dùng ở ${n} mẫu nhà, không xoá được.`, { extra: { usage: n } })
    ctx.repos.library.update(cur.id, { archived: true })
    return reply.status(204).send()
  })
}
