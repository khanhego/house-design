import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { cloneDocument, emptyDocument, HOUSE_TYPES, HouseDocumentSchema } from '@hd/core'
import type { HouseDocument, Snapshot } from '@hd/core'
import type { Ctx } from '../context.ts'
import { AppError, forbidden, notFound, validation } from '../lib/errors.ts'
import { requireUser } from '../lib/auth.ts'
import { parse } from '../lib/validate.ts'
import { assertProject } from '../services/access.ts'
import type { AuthUser } from '../services/access.ts'
import { checksFor, newVersion } from '../services/workflow.ts'
import { FileTooLargeError } from '../storage/storage.ts'
import { fileUrl } from '../repos/types.ts'
import type { FileKind, FileRow, House, Project, Version } from '../repos/types.ts'
import { MAX_UPLOAD_BYTES } from '../lib/limits.ts'

const SLUG = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang').min(3).max(60)
const optText = (max: number) => z.string().trim().max(max).nullable().optional()

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', dxf: 'image/vnd.dxf',
}
const ALLOWED: Record<string, string[]> = {
  input: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'glb', 'gltf', 'dxf'],
  logo: ['jpg', 'jpeg', 'png', 'webp'],
  cover: ['jpg', 'jpeg', 'png', 'webp'],
  gallery_image: ['jpg', 'jpeg', 'png', 'webp'],
  library_image: ['jpg', 'jpeg', 'png', 'webp'],
  item_image: ['jpg', 'jpeg', 'png', 'webp'],
  evidence: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
  model_original: ['glb', 'gltf'],
}

/** Nhận một tệp multipart, lưu vào storage, tạo bản ghi files. Trường form phải gửi trước tệp. */
export const receiveFile = async (ctx: Ctx, req: FastifyRequest, user: AuthUser, opts: { kind?: FileKind; projectId?: string | null; kinds?: FileKind[] }) => {
  const part = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES } })
  if (!part) throw validation({ file: 'Chưa chọn tệp' })
  const fields = Object.fromEntries(Object.entries(part.fields).map(([k, v]) => [k, (v as { value?: string }).value]))
  const kind = (opts.kind ?? fields.kind) as FileKind
  if (!kind || !(opts.kinds ?? Object.keys(ALLOWED)).includes(kind) || !ALLOWED[kind]) throw validation({ kind: 'Loại tệp không hợp lệ' })
  const ext = (part.filename.split('.').pop() ?? '').toLowerCase()
  if (!ALLOWED[kind].includes(ext)) {
    part.file.resume()
    throw new AppError(415, 'UNSUPPORTED_FILE', `Không nhận tệp .${ext} cho mục này`)
  }
  const projectId = opts.projectId !== undefined ? opts.projectId : (fields.projectId as string | undefined) ?? null
  const key = ctx.storage.newKey(kind, part.filename)
  let bytes = 0
  try {
    bytes = await ctx.storage.putStream(key, part.file, MAX_UPLOAD_BYTES)
  } catch (e) {
    if (e instanceof FileTooLargeError || part.file.truncated) throw new AppError(413, 'FILE_TOO_LARGE', `Tệp ${part.filename} vượt 200 MB`)
    throw e
  }
  if (part.file.truncated) {
    await ctx.storage.remove(key)
    throw new AppError(413, 'FILE_TOO_LARGE', `Tệp ${part.filename} vượt 200 MB`)
  }
  return ctx.repos.files.create({ projectId, kind, originalName: part.filename, mime: MIME[ext] ?? part.mimetype, bytes, storageKey: key, uploadedBy: user.id })
}

export const fileOut = (f: FileRow, uploadedByName?: string | null) => ({
  id: f.id, kind: f.kind, originalName: f.originalName, mime: f.mime, bytes: f.bytes, url: fileUrl(f.storageKey), createdAt: f.createdAt,
  ...(uploadedByName !== undefined ? { uploadedByName } : {}),
})

const projectOut = (ctx: Ctx, p: Project) => {
  const cover = p.coverFileId ? ctx.repos.files.get(p.coverFileId) : undefined
  return { ...p, coverUrl: cover ? fileUrl(cover.storageKey) : null, publicUrl: `/v/${p.slug}`, clientName: ctx.repos.clients.get(p.clientId)?.name ?? null }
}

const houseOut = (ctx: Ctx, h: House) => {
  const latest = ctx.repos.versions.latest(h.id)
  const open = ctx.repos.versions.open(h.id)
  const pub = h.publishedVersionId ? ctx.repos.versions.get(h.publishedVersionId) : undefined
  let coverUrl: string | null = null
  const src = pub ?? latest
  if (src) {
    const cid = (JSON.parse(src.document) as HouseDocument).coverFileId
    const f = cid ? ctx.repos.files.get(cid) : undefined
    coverUrl = f ? fileUrl(f.storageKey) : null
  }
  return {
    house: h,
    latestVersion: latest ? { id: latest.id, number: latest.number, state: latest.state, revision: latest.revision } : null,
    published: pub ? { versionId: pub.id, number: pub.number, publishedAt: pub.publishedAt } : null,
    openVersionId: open?.id ?? null,
    coverUrl,
  }
}

/** Kiểm tham chiếu trong tài liệu (R-34): cửa → tường, cầu thang → tầng, mô hình/đồ/tệp thuộc dự án. */
export const validateRefs = (ctx: Ctx, doc: HouseDocument, projectId: string) => {
  const errs: Record<string, string> = {}
  const floorIds = new Set(doc.floors.map((f) => f.id))
  const modelIds = new Set<string>()
  const fileIds = new Set<string>([...(doc.coverFileId ? [doc.coverFileId] : []), ...doc.gallery])
  const libIds = new Set<string>()
  doc.floors.forEach((f, fi) => {
    const walls = new Set(f.walls.map((w) => w.id))
    f.openings.forEach((o, oi) => {
      if (!walls.has(o.wallId)) errs[`floors.${fi}.openings.${oi}.wallId`] = 'Cửa gắn vào tường không tồn tại'
    })
    f.stairs.forEach((s, si) => {
      if (s.toFloorId && !floorIds.has(s.toFloorId)) errs[`floors.${fi}.stairs.${si}.toFloorId`] = 'Tầng nối không tồn tại'
    })
    if (f.modelRef) modelIds.add(f.modelRef.modelAssetId)
    if (f.underlay) fileIds.add(f.underlay.fileId)
    f.items.forEach((it) => {
      if ('libraryItemId' in it.source) libIds.add(it.source.libraryItemId)
      else modelIds.add(it.source.modelNode.modelAssetId)
      it.info?.imageFileIds?.forEach((id) => fileIds.add(id))
    })
  })
  if (doc.exterior?.modelRef) modelIds.add(doc.exterior.modelRef.modelAssetId)
  if (doc.wholeModel) modelIds.add(doc.wholeModel.modelAssetId)
  const ms = ctx.repos.models.byIds([...modelIds])
  for (const id of modelIds) {
    const m = ms.get(id)
    if (!m || m.projectId !== projectId) errs[`models.${id}`] = 'Mô hình không thuộc dự án'
  }
  const lib = ctx.repos.library.byIds([...libIds])
  for (const id of libIds) if (!lib.get(id) || lib.get(id)!.archived) errs[`library.${id}`] = 'Đồ thư viện không tồn tại hoặc đã lưu trữ'
  const fs = ctx.repos.files.byIds([...fileIds])
  for (const id of fileIds) if (!fs.get(id) || fs.get(id)!.projectId !== projectId) errs[`files.${id}`] = 'Tệp không thuộc dự án'
  if (Object.keys(errs).length) throw new AppError(400, 'DOCUMENT_INVALID', 'Tài liệu mẫu nhà không hợp lệ', { fields: errs })
}

const loadHouse = (ctx: Ctx, user: AuthUser, houseId: string) => {
  const h = ctx.repos.houses.get(houseId)
  if (!h) throw notFound('Không tìm thấy mẫu nhà')
  const p = assertProject(ctx, user, h.projectId)
  return { house: h, project: p }
}

const loadVersion = (ctx: Ctx, user: AuthUser, versionId: string) => {
  const v = ctx.repos.versions.get(versionId)
  if (!v) throw notFound('Không tìm thấy phiên bản')
  const { house, project } = loadHouse(ctx, user, v.houseId)
  return { v, house, project }
}

const submissionsOut = (ctx: Ctx, v: Version) =>
  ctx.repos.submissions.listForVersion(v.id).map((s) => {
    const r = ctx.repos.reviews.forSubmission(s.id)
    const ev = r?.evidenceFileId ? ctx.repos.files.get(r.evidenceFileId) : undefined
    return {
      id: s.id,
      seq: s.seq,
      submittedAt: s.submittedAt,
      submittedByName: ctx.repos.users.get(s.submittedBy)?.name ?? null,
      withdrawnAt: s.withdrawnAt,
      snapshotHash: s.snapshotHash,
      reviews: r
        ? [{ id: r.id, decision: r.decision, note: r.note, targets: r.targets, userName: ctx.repos.users.get(r.userId)?.name ?? null, onBehalf: r.onBehalf, evidenceUrl: ev ? fileUrl(ev.storageKey) : null, createdAt: r.createdAt }]
        : [],
    }
  })

/** API-20…23, 30…36. */
export const registerProjects = async (app: FastifyInstance, ctx: Ctx) => {
  const ContactBody = z.object({
    phone: z.string().max(20).nullable().optional(),
    zalo: z.string().max(20).nullable().optional(),
    leadEmails: z.array(z.string().email()).max(5).optional(),
  })
  const ProjectBody = z.object({
    clientId: z.string().max(64),
    slug: SLUG,
    name: z.string().trim().min(1).max(200),
    location: optText(200),
    description: optText(4000),
    coverFileId: z.string().max(64).nullable().optional(),
    contact: ContactBody.optional(),
    disclaimer: optText(1000),
    privacyPolicy: optText(20000),
  })
  const PRODUCER_FIELDS = new Set(['name', 'location', 'description', 'coverFileId'])

  app.get('/api/v1/projects', async (req) => {
    const u = requireUser(ctx, req)
    const q = req.query as { clientId?: string }
    const list = ctx.repos.projects.list({ clientId: u.role === 'approver' ? u.clientId! : q.clientId })
    return {
      items: list.map((p) => ({
        ...projectOut(ctx, p),
        houses: ctx.repos.houses.listByProject(p.id).map((h) => {
          const o = houseOut(ctx, h)
          return { id: h.id, slug: h.slug, name: h.name, houseType: h.houseType, coverUrl: o.coverUrl, latestVersion: o.latestVersion, published: o.published }
        }),
      })),
    }
  })

  app.post('/api/v1/projects', async (req, reply) => {
    requireUser(ctx, req, ['admin'])
    const b = parse(ProjectBody, req.body)
    if (!ctx.repos.clients.get(b.clientId)) throw validation({ clientId: 'Khách hàng không tồn tại' })
    if (ctx.repos.projects.bySlug(b.slug)) throw new AppError(409, 'SLUG_TAKEN', 'Đường dẫn đã được dùng', { fields: { slug: 'Đường dẫn đã được dùng' } })
    const p = ctx.repos.projects.create({ ...b, contact: b.contact ?? {} })
    return reply.status(201).send({ project: projectOut(ctx, p) })
  })

  app.get<{ Params: { id: string } }>('/api/v1/projects/:id', async (req) => {
    const u = requireUser(ctx, req)
    const p = assertProject(ctx, u, req.params.id)
    return { project: projectOut(ctx, p) }
  })

  app.patch<{ Params: { id: string } }>('/api/v1/projects/:id', async (req) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const p = assertProject(ctx, u, req.params.id)
    const raw = (req.body ?? {}) as Record<string, unknown>
    if (u.role === 'producer') {
      const bad = Object.keys(raw).filter((k) => !PRODUCER_FIELDS.has(k))
      if (bad.length) throw new AppError(403, 'FIELD_FORBIDDEN', 'Bạn không có quyền sửa mục này.', { fields: Object.fromEntries(bad.map((k) => [k, 'Không có quyền sửa'])) })
    }
    const b = parse(ProjectBody.partial().extend({ status: z.enum(['active', 'unavailable']).optional() }), raw)
    if (b.slug && b.slug !== p.slug) {
      if (p.slugLocked) throw new AppError(409, 'SLUG_LOCKED', 'Đường dẫn đã khoá vì đã phát hành', { fields: { slug: 'Đường dẫn đã khoá' } })
      if (ctx.repos.projects.bySlug(b.slug)) throw new AppError(409, 'SLUG_TAKEN', 'Đường dẫn đã được dùng', { fields: { slug: 'Đường dẫn đã được dùng' } })
    }
    if (b.clientId && !ctx.repos.clients.get(b.clientId)) throw validation({ clientId: 'Khách hàng không tồn tại' })
    if (b.coverFileId) {
      const f = ctx.repos.files.get(b.coverFileId)
      if (!f || f.kind !== 'cover' || f.projectId !== p.id) throw validation({ coverFileId: 'Ảnh bìa không hợp lệ' })
    }
    const next = ctx.repos.projects.update(p.id, { ...b, contact: b.contact ? { ...p.contact, ...b.contact } : p.contact })!
    return { project: projectOut(ctx, next) }
  })

  app.get<{ Params: { id: string } }>('/api/v1/projects/:id/files', async (req) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    assertProject(ctx, u, req.params.id)
    const kind = (req.query as { kind?: FileKind }).kind
    return { items: ctx.repos.files.listByProject(req.params.id, kind ?? 'input').map((f) => fileOut(f, f.uploadedBy ? ctx.repos.users.get(f.uploadedBy)?.name ?? null : null)) }
  })

  app.post<{ Params: { id: string } }>('/api/v1/projects/:id/files', async (req, reply) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    assertProject(ctx, u, req.params.id)
    const f = await receiveFile(ctx, req, u, { kind: 'input', projectId: req.params.id })
    return reply.status(201).send({ file: fileOut(f) })
  })

  app.post('/api/v1/files', async (req, reply) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const f = await receiveFile(ctx, req, u, { kinds: ['logo', 'cover', 'gallery_image', 'library_image', 'item_image', 'evidence'] })
    const needsProject = ['cover', 'gallery_image', 'item_image', 'evidence'].includes(f.kind)
    const bad = (msg: string) => {
      void ctx.storage.remove(f.storageKey)
      ctx.db.run('DELETE FROM files WHERE id = ?', f.id)
      return msg
    }
    if (f.kind === 'evidence' && u.role !== 'admin') throw forbidden(bad('Chỉ quản trị viên được tải bằng chứng'))
    if (needsProject) {
      if (!f.projectId) throw validation({ projectId: bad('Cần chọn dự án') })
      try {
        assertProject(ctx, u, f.projectId)
      } catch (e) {
        bad('x')
        throw e
      }
    } else if (f.projectId) ctx.db.run('UPDATE files SET project_id = NULL WHERE id = ?', f.id)
    return reply.status(201).send({ file: fileOut(ctx.repos.files.get(f.id)!) })
  })

  /* ---------- mẫu nhà ---------- */
  const HouseBody = z.object({
    name: z.string().trim().min(1).max(200),
    slug: SLUG,
    houseType: z.enum(HOUSE_TYPES),
    declaredArea: z.number().min(1).max(100000),
    bedrooms: z.number().int().min(0).max(50).optional(),
    bathrooms: z.number().int().min(0).max(50).optional(),
    description: optText(4000),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })

  app.get<{ Params: { id: string } }>('/api/v1/projects/:id/houses', async (req) => {
    const u = requireUser(ctx, req)
    assertProject(ctx, u, req.params.id)
    return { items: ctx.repos.houses.listByProject(req.params.id).map((h) => {
      const o = houseOut(ctx, h)
      return { ...o.house, latestVersion: o.latestVersion, published: o.published, openVersionId: o.openVersionId, coverUrl: o.coverUrl }
    }) }
  })

  app.post<{ Params: { id: string } }>('/api/v1/projects/:id/houses', async (req, reply) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const p = assertProject(ctx, u, req.params.id)
    const b = parse(HouseBody, req.body)
    if (ctx.repos.houses.bySlug(p.id, b.slug)) throw new AppError(409, 'SLUG_TAKEN', 'Đường dẫn đã được dùng trong dự án', { fields: { slug: 'Đường dẫn đã được dùng' } })
    const { house, version } = ctx.db.tx(() => {
      const house = ctx.repos.houses.create({ ...b, projectId: p.id })
      const version = ctx.repos.versions.create(house.id, 1, emptyDocument())
      return { house, version }
    })
    return reply.status(201).send({ house, version: { id: version.id, number: 1, state: version.state, revision: 0 } })
  })

  app.get<{ Params: { id: string } }>('/api/v1/houses/:id', async (req) => {
    const u = requireUser(ctx, req)
    const { house } = loadHouse(ctx, u, req.params.id)
    return houseOut(ctx, house)
  })

  app.patch<{ Params: { id: string } }>('/api/v1/houses/:id', async (req) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const { house, project } = loadHouse(ctx, u, req.params.id)
    const b = parse(HouseBody.partial(), req.body)
    if (b.slug && b.slug !== house.slug) {
      if (house.slugLocked) throw new AppError(409, 'SLUG_LOCKED', 'Đường dẫn đã khoá vì đã phát hành', { fields: { slug: 'Đường dẫn đã khoá' } })
      if (ctx.repos.houses.bySlug(project.id, b.slug)) throw new AppError(409, 'SLUG_TAKEN', 'Đường dẫn đã được dùng trong dự án', { fields: { slug: 'Đường dẫn đã được dùng' } })
    }
    return { house: ctx.repos.houses.update(house.id, b)! }
  })

  app.post<{ Params: { id: string } }>('/api/v1/houses/:id/duplicate', async (req, reply) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const { house, project } = loadHouse(ctx, u, req.params.id)
    const b = parse(z.object({ name: z.string().trim().min(1).max(200), slug: SLUG }), req.body)
    if (ctx.repos.houses.bySlug(project.id, b.slug)) throw new AppError(409, 'SLUG_TAKEN', 'Đường dẫn đã được dùng trong dự án', { fields: { slug: 'Đường dẫn đã được dùng' } })
    const latest = ctx.repos.versions.latest(house.id)!
    const { h, v } = ctx.db.tx(() => {
      const h = ctx.repos.houses.create({ projectId: project.id, slug: b.slug, name: b.name, houseType: house.houseType, declaredArea: house.declaredArea, bedrooms: house.bedrooms, bathrooms: house.bathrooms, description: house.description, sortOrder: house.sortOrder + 1 })
      const v = ctx.repos.versions.create(h.id, 1, cloneDocument(JSON.parse(latest.document)))
      return { h, v }
    })
    return reply.status(201).send({ house: h, version: { id: v.id, number: 1, state: v.state, revision: 0 } })
  })

  /* ---------- phiên bản ---------- */
  app.get<{ Params: { id: string } }>('/api/v1/houses/:id/versions', async (req) => {
    const u = requireUser(ctx, req)
    const { house } = loadHouse(ctx, u, req.params.id)
    return {
      items: ctx.repos.versions.listForHouse(house.id).map((v) => ({
        id: v.id, number: v.number, state: v.state, createdAt: v.createdAt, publishedAt: v.publishedAt, submissions: submissionsOut(ctx, v),
      })),
    }
  })

  app.get<{ Params: { id: string } }>('/api/v1/versions/:id', async (req) => {
    const u = requireUser(ctx, req)
    const { v, house } = loadVersion(ctx, u, req.params.id)
    if (u.role === 'approver') {
      const last = ctx.repos.submissions.lastForVersion(v.id)
      if (v.state === 'draft') {
        return {
          id: v.id, houseId: house.id, number: v.number, state: v.state,
          lastSubmission: last ? { seq: last.seq, withdrawnAt: last.withdrawnAt, reviews: submissionsOut(ctx, v).find((s) => s.id === last.id)?.reviews ?? [] } : null,
        }
      }
      const sub = v.currentSubmissionId ? ctx.repos.submissions.get(v.currentSubmissionId) : last
      return { id: v.id, houseId: house.id, number: v.number, state: v.state, snapshot: sub ? (JSON.parse(sub.snapshot) as Snapshot) : null }
    }
    return {
      id: v.id, houseId: house.id, number: v.number, state: v.state, revision: v.revision,
      document: JSON.parse(v.document) as HouseDocument,
      checks: checksFor(ctx, v),
      submissions: submissionsOut(ctx, v),
    }
  })

  app.put<{ Params: { id: string } }>('/api/v1/versions/:id/document', async (req) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const { v, project } = loadVersion(ctx, u, req.params.id)
    const ifMatch = Number(req.headers['if-match'])
    if (!Number.isInteger(ifMatch)) throw validation({ 'if-match': 'Thiếu header If-Match' })
    const body = (req.body ?? {}) as { document?: unknown }
    const r = HouseDocumentSchema.safeParse(body.document)
    if (!r.success) {
      throw new AppError(400, 'DOCUMENT_INVALID', 'Tài liệu mẫu nhà không hợp lệ', {
        fields: Object.fromEntries(r.error.issues.slice(0, 20).map((i) => [i.path.join('.'), i.message])),
      })
    }
    validateRefs(ctx, r.data, project.id)
    const changed = ctx.repos.versions.saveDocument(v.id, r.data, ifMatch)
    if (!changed) {
      const cur = ctx.repos.versions.get(v.id)!
      if (cur.state !== 'draft') throw new AppError(409, 'VERSION_LOCKED', 'Phiên bản đang chờ duyệt hoặc đã phát hành — không sửa được', { extra: { state: cur.state } })
      throw new AppError(409, 'REVISION_CONFLICT', 'Mẫu nhà vừa được sửa ở nơi khác. Tải lại để tiếp tục.', { extra: { revision: cur.revision } })
    }
    const next = ctx.repos.versions.get(v.id)!
    return { revision: next.revision, checks: checksFor(ctx, next) }
  })

  app.post<{ Params: { id: string } }>('/api/v1/houses/:id/versions', async (req, reply) => {
    const u = requireUser(ctx, req, ['admin', 'producer'])
    const { house } = loadHouse(ctx, u, req.params.id)
    const v = newVersion(ctx, house.id)
    return reply.status(201).send({ version: { id: v.id, number: v.number, state: v.state, revision: v.revision } })
  })
}
