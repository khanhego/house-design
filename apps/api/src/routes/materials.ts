import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { MATERIAL_CATEGORIES, MATERIAL_MAPS } from '@hd/core'
import type { MaterialMap } from '@hd/core'
import type { Ctx } from '../context.ts'
import { AppError, notFound, validation } from '../lib/errors.ts'
import { requireUser } from '../lib/auth.ts'
import { parse } from '../lib/validate.ts'
import type { Material } from '../repos/types.ts'
import { approvalProblem, materialMaps, saveTexture, TEXTURE_MAX_BYTES } from '../services/materials.ts'

/* Thư viện vật liệu (item 03 lát R1, API-M1…M5). */

const Body = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Mã chỉ gồm chữ thường không dấu, số, gạch ngang'),
  name: z.string().trim().min(1).max(120),
  category: z.enum(MATERIAL_CATEGORIES),
  tileMm: z.tuple([z.number().min(10).max(20000), z.number().min(10).max(20000)]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1).default(0),
  sourceKind: z.enum(['free_library', 'ai', 'client_file', 'in_house']),
  sourceName: z.string().trim().max(120).nullable().optional(),
  sourceUrl: z.string().trim().url().max(500).nullable().optional(),
  license: z.enum(['cc0', 'cc_by', 'commercial', 'client_exclusive']).nullable().optional(),
  attribution: z.string().trim().max(500).nullable().optional(),
  clientId: z.string().max(64).nullable().optional(),
})

export const materialOut = (ctx: Ctx, m: Material) => ({ ...m, maps: materialMaps(ctx, m) })

export const registerMaterials = async (app: FastifyInstance, ctx: Ctx) => {
  const load = (id: string) => {
    const m = ctx.repos.materials.get(id)
    if (!m) throw notFound()
    return m
  }
  const checkClient = (clientId: string | null | undefined) => {
    if (clientId && !ctx.repos.clients.get(clientId)) throw validation({ clientId: 'Không tìm thấy khách hàng' })
  }

  app.get('/api/v1/materials', async (req) => {
    requireUser(ctx, req, ['admin', 'producer'])
    const q = req.query as { clientId?: string; all?: string; category?: string; includeRetired?: string }
    const list = ctx.repos.materials.list({ clientId: q.clientId || null, allClients: q.all === '1', includeRetired: q.includeRetired === '1', category: q.category || undefined })
    return { items: list.map((m) => materialOut(ctx, m)) }
  })

  app.post('/api/v1/materials', async (req, reply) => {
    requireUser(ctx, req, ['admin', 'producer'])
    const b = parse(Body, req.body)
    checkClient(b.clientId)
    if (ctx.repos.materials.byKey(b.key)) throw validation({ key: 'Mã vật liệu đã có' })
    const m = ctx.repos.materials.create({
      key: b.key, name: b.name, category: b.category, tileMm: b.tileMm, color: b.color, roughness: b.roughness, metalness: b.metalness,
      sourceKind: b.sourceKind, sourceName: b.sourceName ?? null, sourceUrl: b.sourceUrl ?? null, license: b.license ?? null, attribution: b.attribution ?? null, clientId: b.clientId ?? null,
    })
    return reply.status(201).send({ item: materialOut(ctx, m) })
  })

  app.patch<{ Params: { id: string } }>('/api/v1/materials/:id', async (req) => {
    requireUser(ctx, req, ['admin', 'producer'])
    const cur = load(req.params.id)
    const b = parse(Body.partial(), req.body)
    checkClient(b.clientId)
    if (b.key && b.key !== cur.key && ctx.repos.materials.byKey(b.key)) throw validation({ key: 'Mã vật liệu đã có' })
    // sửa vật liệu đã duyệt → quay về nháp, QTV duyệt lại (bản đã phát hành không đổi — BR-R6)
    const back = cur.status === 'ready' ? { status: 'draft' as const, approvedBy: null, approvedAt: null } : {}
    return { item: materialOut(ctx, ctx.repos.materials.update(cur.id, { ...b, ...back })!) }
  })

  app.post<{ Params: { id: string } }>('/api/v1/materials/:id/textures', async (req, reply) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const cur = load(req.params.id)
    const part = await req.file({ limits: { fileSize: TEXTURE_MAX_BYTES } })
    if (!part) throw validation({ file: 'Chưa chọn tệp' })
    const map = (part.fields.map as { value?: string } | undefined)?.value as MaterialMap | undefined
    if (!map || !(MATERIAL_MAPS as readonly string[]).includes(map)) {
      part.file.resume()
      throw validation({ map: 'Chọn loại ảnh: màu, pháp tuyến hoặc độ nhám' })
    }
    const ext = (part.filename.split('.').pop() ?? '').toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      part.file.resume()
      throw new AppError(415, 'UNSUPPORTED_FILE', `Không nhận tệp .${ext} cho ảnh vân (JPG, PNG, WebP)`)
    }
    let buf: Buffer
    try {
      buf = await part.toBuffer()
    } catch {
      throw new AppError(413, 'FILE_TOO_LARGE', `Ảnh vượt ${TEXTURE_MAX_BYTES / 2 ** 20} MB`)
    }
    let m = await saveTexture(ctx, cur, map, buf, part.filename, u.id)
    if (m.status === 'ready') m = ctx.repos.materials.update(m.id, { status: 'draft', approvedBy: null, approvedAt: null })!
    return reply.status(201).send({ item: materialOut(ctx, m) })
  })

  app.post<{ Params: { id: string } }>('/api/v1/materials/:id/approve', async (req) => {
    const u = requireUser(ctx, req, ['admin'])
    const cur = load(req.params.id)
    const problem = approvalProblem(cur)
    if (problem) throw new AppError(422, 'LICENSE_INCOMPLETE', problem)
    return { item: materialOut(ctx, ctx.repos.materials.update(cur.id, { status: 'ready', approvedBy: u.id, approvedAt: new Date().toISOString() })!) }
  })

  app.post<{ Params: { id: string } }>('/api/v1/materials/:id/retire', async (req) => {
    requireUser(ctx, req, ['admin'])
    const cur = load(req.params.id)
    return { item: materialOut(ctx, ctx.repos.materials.update(cur.id, { status: 'retired' })!) }
  })
}
