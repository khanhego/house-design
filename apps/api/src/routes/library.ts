import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { FALLBACK_SHAPES, ITEM_CATEGORIES } from '@hd/core'
import type { HouseDocument } from '@hd/core'
import type { Ctx } from '../context.ts'
import { AppError, notFound, validation } from '../lib/errors.ts'
import { requireUser } from '../lib/auth.ts'
import { parse } from '../lib/validate.ts'
import { fileUrl } from '../repos/types.ts'
import type { LibraryItem } from '../repos/types.ts'

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
})

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

const itemOut = (ctx: Ctx, i: LibraryItem) => {
  const imgs = ctx.repos.files.byIds(i.imageFileIds)
  const model = i.modelAssetId ? ctx.repos.models.get(i.modelAssetId) : undefined
  const mf = model?.optimizedFileId ? ctx.repos.files.get(model.optimizedFileId) : undefined
  return {
    ...i,
    imageUrls: i.imageFileIds.map((id) => imgs.get(id)).filter(Boolean).map((f) => fileUrl(f!.storageKey)),
    model: model ? { id: model.id, status: model.status, level: model.level, url: mf ? fileUrl(mf.storageKey) : null } : null,
  }
}

const checkRefs = (ctx: Ctx, b: { imageFileIds?: string[]; modelAssetId?: string | null }) => {
  if (b.imageFileIds) {
    const fs = ctx.repos.files.byIds(b.imageFileIds)
    if (b.imageFileIds.some((id) => fs.get(id)?.kind !== 'library_image')) throw validation({ imageFileIds: 'Ảnh không hợp lệ' })
  }
  if (b.modelAssetId) {
    const m = ctx.repos.models.get(b.modelAssetId)
    if (!m || m.projectId !== null) throw validation({ modelAssetId: 'Mô hình không thuộc thư viện' })
  }
}

/** API-40, 41. */
export const registerLibrary = async (app: FastifyInstance, ctx: Ctx) => {
  app.get('/api/v1/library/items', async (req) => {
    requireUser(ctx, req, ['admin', 'producer'])
    const q = req.query as { q?: string; category?: string }
    return { items: ctx.repos.library.list({ q: q.q?.trim() || undefined, category: q.category || undefined }).map((i) => itemOut(ctx, i)), nextCursor: null }
  })
  app.post('/api/v1/library/items', async (req, reply) => {
    requireUser(ctx, req, ['admin', 'producer'])
    const b = parse(ItemBody, req.body)
    checkRefs(ctx, b)
    const it = ctx.repos.library.create({
      name: b.name, category: b.category, sizeMm: b.sizeMm, material: b.material ?? null, brand: b.brand ?? null, description: b.description ?? null,
      imageFileIds: b.imageFileIds ?? [], modelAssetId: b.modelAssetId ?? null, fallbackShape: b.fallbackShape ?? null, variants: b.variants ?? [],
    })
    return reply.status(201).send({ item: itemOut(ctx, it) })
  })
  app.patch<{ Params: { id: string } }>('/api/v1/library/items/:id', async (req) => {
    requireUser(ctx, req, ['admin', 'producer'])
    const cur = ctx.repos.library.get(req.params.id)
    if (!cur || cur.archived) throw notFound()
    const b = parse(ItemBody.partial(), req.body)
    checkRefs(ctx, b)
    return { item: itemOut(ctx, ctx.repos.library.update(cur.id, b)!) }
  })
  app.delete<{ Params: { id: string } }>('/api/v1/library/items/:id', async (req, reply) => {
    requireUser(ctx, req, ['admin', 'producer'])
    const cur = ctx.repos.library.get(req.params.id)
    if (!cur || cur.archived) throw notFound()
    const n = usage(ctx, cur.id)
    if (n > 0) throw new AppError(409, 'ITEM_IN_USE', `Đồ này đang dùng ở ${n} mẫu nhà, không xoá được.`, { extra: { usage: n } })
    ctx.repos.library.update(cur.id, { archived: true })
    return reply.status(204).send()
  })
}
