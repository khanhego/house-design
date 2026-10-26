import { newId } from '@hd/core'
import type { HouseDocument } from '@hd/core'
import { nowIso, parseJson } from '../db/sqlite.ts'
import type { Db, Row } from '../db/sqlite.ts'
import type {
  Client, FileKind, FileRow, House, LibraryItem, Material, ModelAsset, ModelNormalize, Project, Review, Submission, User, Version,
} from './types.ts'

/* Repository SQL thuần (DEC-21). Mỗi hàm map hàng ↔ object camelCase. */

const bool = (v: unknown) => v === 1 || v === true

/* ---------- clients ---------- */

const toClient = (r: Row): Client => ({
  id: r.id as string,
  name: r.name as string,
  logoFileId: (r.logo_file_id as string) ?? null,
  brandColor: r.brand_color as string,
  contact: parseJson(r.contact_json, {}),
  plan: (r.plan as Client['plan']) ?? null,
  hostingUntil: (r.hosting_until as string) ?? null,
  status: r.status as Client['status'],
  showPoweredBy: bool(r.show_powered_by),
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
})

export const clients = (db: Db) => ({
  create(c: Pick<Client, 'name'> & Partial<Pick<Client, 'logoFileId' | 'brandColor' | 'contact' | 'plan' | 'hostingUntil' | 'showPoweredBy'>>): Client {
    const id = newId('cli')
    const t = nowIso()
    db.run(
      'INSERT INTO clients (id, name, logo_file_id, brand_color, contact_json, plan, hosting_until, show_powered_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      id, c.name, c.logoFileId ?? null, c.brandColor ?? '#1F4FA3', JSON.stringify(c.contact ?? {}), c.plan ?? null, c.hostingUntil ?? null,
      c.showPoweredBy ?? true, t, t,
    )
    return this.get(id)!
  },
  get: (id: string) => {
    const r = db.get('SELECT * FROM clients WHERE id = ?', id)
    return r ? toClient(r) : undefined
  },
  list: () => db.all('SELECT * FROM clients ORDER BY name COLLATE NOCASE').map(toClient),
  update(id: string, p: Partial<Omit<Client, 'id' | 'createdAt' | 'updatedAt'>>) {
    const cur = this.get(id)
    if (!cur) return undefined
    const n = { ...cur, ...p }
    db.run(
      'UPDATE clients SET name=?, logo_file_id=?, brand_color=?, contact_json=?, plan=?, hosting_until=?, status=?, show_powered_by=?, updated_at=? WHERE id=?',
      n.name, n.logoFileId, n.brandColor, JSON.stringify(n.contact ?? {}), n.plan, n.hostingUntil, n.status, n.showPoweredBy, nowIso(), id,
    )
    return this.get(id)!
  },
})

/* ---------- users ---------- */

const toUser = (r: Row): User => ({
  id: r.id as string,
  email: r.email as string,
  name: r.name as string,
  role: r.role as User['role'],
  clientId: (r.client_id as string) ?? null,
  passwordHash: (r.password_hash as string) ?? null,
  status: r.status as User['status'],
  failedLogins: r.failed_logins as number,
  lockedUntil: (r.locked_until as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
})

export const users = (db: Db) => ({
  create(u: Pick<User, 'email' | 'name' | 'role'> & Partial<Pick<User, 'clientId' | 'passwordHash' | 'status'>>): User {
    const id = newId('usr')
    const t = nowIso()
    db.run(
      'INSERT INTO users (id, email, name, role, client_id, password_hash, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, u.email.trim(), u.name, u.role, u.clientId ?? null, u.passwordHash ?? null, u.status ?? 'invited', t, t,
    )
    return this.get(id)!
  },
  get: (id: string) => {
    const r = db.get('SELECT * FROM users WHERE id = ?', id)
    return r ? toUser(r) : undefined
  },
  byEmail: (email: string) => {
    const r = db.get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email.trim())
    return r ? toUser(r) : undefined
  },
  list: (clientId?: string) =>
    (clientId ? db.all('SELECT * FROM users WHERE client_id = ? ORDER BY name', clientId) : db.all('SELECT * FROM users ORDER BY role, name')).map(toUser),
  update(id: string, p: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'email'>>) {
    const cur = this.get(id)
    if (!cur) return undefined
    const n = { ...cur, ...p }
    db.run(
      'UPDATE users SET name=?, role=?, client_id=?, password_hash=?, status=?, failed_logins=?, locked_until=?, updated_at=? WHERE id=?',
      n.name, n.role, n.clientId, n.passwordHash, n.status, n.failedLogins, n.lockedUntil, nowIso(), id,
    )
    return this.get(id)!
  },
  activeApprovers: (clientId: string) =>
    db.all("SELECT * FROM users WHERE client_id = ? AND role = 'approver' AND status = 'active'", clientId).map(toUser),
  countActiveAdmins: () => db.get<{ n: number }>("SELECT COUNT(*) n FROM users WHERE role='admin' AND status='active'")!.n,
})

/* ---------- files ---------- */

const toFile = (r: Row): FileRow => ({
  id: r.id as string,
  projectId: (r.project_id as string) ?? null,
  kind: r.kind as FileKind,
  originalName: r.original_name as string,
  mime: r.mime as string,
  bytes: r.bytes as number,
  storageKey: r.storage_key as string,
  uploadedBy: (r.uploaded_by as string) ?? null,
  createdAt: r.created_at as string,
})

export const files = (db: Db) => ({
  create(f: Omit<FileRow, 'id' | 'createdAt'>): FileRow {
    const id = newId('fil')
    db.run(
      'INSERT INTO files (id, project_id, kind, original_name, mime, bytes, storage_key, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, f.projectId, f.kind, f.originalName, f.mime, f.bytes, f.storageKey, f.uploadedBy, nowIso(),
    )
    return this.get(id)!
  },
  get: (id: string) => {
    const r = db.get('SELECT * FROM files WHERE id = ?', id)
    return r ? toFile(r) : undefined
  },
  byKey: (key: string) => {
    const r = db.get('SELECT * FROM files WHERE storage_key = ?', key)
    return r ? toFile(r) : undefined
  },
  byIds: (ids: string[]): Map<string, FileRow> => {
    if (!ids.length) return new Map()
    const rows = db.all(`SELECT * FROM files WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).map(toFile)
    return new Map(rows.map((f) => [f.id, f]))
  },
  listByProject: (projectId: string, kind?: FileKind) =>
    (kind
      ? db.all('SELECT * FROM files WHERE project_id = ? AND kind = ? ORDER BY created_at DESC', projectId, kind)
      : db.all('SELECT * FROM files WHERE project_id = ? ORDER BY created_at DESC', projectId)
    ).map(toFile),
})

/* ---------- projects ---------- */

const toProject = (r: Row): Project => ({
  id: r.id as string,
  clientId: r.client_id as string,
  slug: r.slug as string,
  slugLocked: bool(r.slug_locked),
  name: r.name as string,
  location: (r.location as string) ?? null,
  description: (r.description as string) ?? null,
  coverFileId: (r.cover_file_id as string) ?? null,
  contact: parseJson(r.contact_json, {}),
  disclaimer: (r.disclaimer as string) ?? null,
  privacyPolicy: (r.privacy_policy as string) ?? null,
  status: r.status as Project['status'],
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
})

export const projects = (db: Db) => ({
  create(p: Pick<Project, 'clientId' | 'slug' | 'name'> & Partial<Pick<Project, 'location' | 'description' | 'coverFileId' | 'contact' | 'disclaimer' | 'privacyPolicy'>>): Project {
    const id = newId('prj')
    const t = nowIso()
    db.run(
      'INSERT INTO projects (id, client_id, slug, name, location, description, cover_file_id, contact_json, disclaimer, privacy_policy, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      id, p.clientId, p.slug, p.name, p.location ?? null, p.description ?? null, p.coverFileId ?? null, JSON.stringify(p.contact ?? {}),
      p.disclaimer ?? null, p.privacyPolicy ?? null, t, t,
    )
    return this.get(id)!
  },
  get: (id: string) => {
    const r = db.get('SELECT * FROM projects WHERE id = ?', id)
    return r ? toProject(r) : undefined
  },
  bySlug: (slug: string) => {
    const r = db.get('SELECT * FROM projects WHERE slug = ?', slug)
    return r ? toProject(r) : undefined
  },
  list: (filter: { clientId?: string } = {}) =>
    (filter.clientId
      ? db.all('SELECT * FROM projects WHERE client_id = ? ORDER BY created_at DESC', filter.clientId)
      : db.all('SELECT * FROM projects ORDER BY created_at DESC')
    ).map(toProject),
  update(id: string, p: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>) {
    const cur = this.get(id)
    if (!cur) return undefined
    const n = { ...cur, ...p }
    db.run(
      'UPDATE projects SET client_id=?, slug=?, slug_locked=?, name=?, location=?, description=?, cover_file_id=?, contact_json=?, disclaimer=?, privacy_policy=?, status=?, updated_at=? WHERE id=?',
      n.clientId, n.slug, n.slugLocked, n.name, n.location, n.description, n.coverFileId, JSON.stringify(n.contact ?? {}), n.disclaimer,
      n.privacyPolicy, n.status, nowIso(), id,
    )
    return this.get(id)!
  },
})

/* ---------- houses ---------- */

const toHouse = (r: Row): House => ({
  id: r.id as string,
  projectId: r.project_id as string,
  slug: r.slug as string,
  slugLocked: bool(r.slug_locked),
  name: r.name as string,
  houseType: r.house_type as House['houseType'],
  declaredArea: r.declared_area as number,
  bedrooms: r.bedrooms as number,
  bathrooms: r.bathrooms as number,
  description: (r.description as string) ?? null,
  price: (r.price as number) ?? null,
  landArea: (r.land_area as number) ?? null,
  features: parseJson(r.features_json, []),
  publishedVersionId: (r.published_version_id as string) ?? null,
  sortOrder: r.sort_order as number,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
})

export const houses = (db: Db) => ({
  create(h: Pick<House, 'projectId' | 'slug' | 'name' | 'houseType' | 'declaredArea'> & Partial<Pick<House, 'bedrooms' | 'bathrooms' | 'description' | 'sortOrder' | 'price' | 'landArea' | 'features'>>): House {
    const id = newId('hou')
    const t = nowIso()
    db.run(
      'INSERT INTO houses (id, project_id, slug, name, house_type, declared_area, bedrooms, bathrooms, description, price, land_area, features_json, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, h.projectId, h.slug, h.name, h.houseType, h.declaredArea, h.bedrooms ?? 0, h.bathrooms ?? 0, h.description ?? null, h.price ?? null, h.landArea ?? null, JSON.stringify(h.features ?? []), h.sortOrder ?? 0, t, t,
    )
    return this.get(id)!
  },
  get: (id: string) => {
    const r = db.get('SELECT * FROM houses WHERE id = ?', id)
    return r ? toHouse(r) : undefined
  },
  bySlug: (projectId: string, slug: string) => {
    const r = db.get('SELECT * FROM houses WHERE project_id = ? AND slug = ?', projectId, slug)
    return r ? toHouse(r) : undefined
  },
  listByProject: (projectId: string) => db.all('SELECT * FROM houses WHERE project_id = ? ORDER BY sort_order, created_at', projectId).map(toHouse),
  update(id: string, p: Partial<Omit<House, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>) {
    const cur = this.get(id)
    if (!cur) return undefined
    const n = { ...cur, ...p }
    db.run(
      'UPDATE houses SET slug=?, slug_locked=?, name=?, house_type=?, declared_area=?, bedrooms=?, bathrooms=?, description=?, price=?, land_area=?, features_json=?, published_version_id=?, sort_order=?, updated_at=? WHERE id=?',
      n.slug, n.slugLocked, n.name, n.houseType, n.declaredArea, n.bedrooms, n.bathrooms, n.description, n.price, n.landArea, JSON.stringify(n.features), n.publishedVersionId, n.sortOrder, nowIso(), id,
    )
    return this.get(id)!
  },
})

/* ---------- versions ---------- */

const toVersion = (r: Row): Version => ({
  id: r.id as string,
  houseId: r.house_id as string,
  number: r.number as number,
  state: r.state as Version['state'],
  document: r.document as string,
  revision: r.revision as number,
  currentSubmissionId: (r.current_submission_id as string) ?? null,
  publishedAt: (r.published_at as string) ?? null,
  publishedBy: (r.published_by as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
})

export const versions = (db: Db) => ({
  create(houseId: string, number: number, document: HouseDocument): Version {
    const id = newId('ver')
    const t = nowIso()
    db.run('INSERT INTO versions (id, house_id, number, state, document, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', id, houseId, number, 'draft', JSON.stringify(document), t, t)
    return this.get(id)!
  },
  get: (id: string) => {
    const r = db.get('SELECT * FROM versions WHERE id = ?', id)
    return r ? toVersion(r) : undefined
  },
  listForHouse: (houseId: string) => db.all('SELECT * FROM versions WHERE house_id = ? ORDER BY number DESC', houseId).map(toVersion),
  latest: (houseId: string) => {
    const r = db.get('SELECT * FROM versions WHERE house_id = ? ORDER BY number DESC LIMIT 1', houseId)
    return r ? toVersion(r) : undefined
  },
  open: (houseId: string) => {
    const r = db.get("SELECT * FROM versions WHERE house_id = ? AND state IN ('draft','pending_review','approved')", houseId)
    return r ? toVersion(r) : undefined
  },
  /** Ghi tài liệu với khoá lạc quan; trả số hàng đổi (0 = lệch revision hoặc không còn draft). */
  saveDocument: (id: string, doc: HouseDocument, expectedRevision: number) =>
    db.run("UPDATE versions SET document=?, revision=revision+1, updated_at=? WHERE id=? AND revision=? AND state='draft'", JSON.stringify(doc), nowIso(), id, expectedRevision).changes,
  /** Chuyển trạng thái có điều kiện; 0 hàng = trạng thái đã đổi bởi người khác. */
  transition: (id: string, from: Version['state'][], to: Version['state'], extra: { currentSubmissionId?: string | null; publishedAt?: string | null; publishedBy?: string | null } = {}) => {
    const sets = ['state=?', 'updated_at=?']
    const params: (string | null)[] = [to, nowIso()]
    if ('currentSubmissionId' in extra) {
      sets.push('current_submission_id=?')
      params.push(extra.currentSubmissionId ?? null)
    }
    if ('publishedAt' in extra) {
      sets.push('published_at=?', 'published_by=?')
      params.push(extra.publishedAt ?? null, extra.publishedBy ?? null)
    }
    return db.run(`UPDATE versions SET ${sets.join(', ')} WHERE id=? AND state IN (${from.map(() => '?').join(',')})`, ...params, id, ...from).changes
  },
})

/* ---------- submissions & reviews ---------- */

const toSubmission = (r: Row): Submission => ({
  id: r.id as string,
  versionId: r.version_id as string,
  seq: r.seq as number,
  snapshot: r.snapshot as string,
  snapshotHash: r.snapshot_hash as string,
  submittedAt: r.submitted_at as string,
  submittedBy: r.submitted_by as string,
  withdrawnAt: (r.withdrawn_at as string) ?? null,
  withdrawnBy: (r.withdrawn_by as string) ?? null,
  remindedAt: (r.reminded_at as string) ?? null,
})

export const submissions = (db: Db) => ({
  create(versionId: string, snapshot: string, hash: string, userId: string, storageKeys: string[]): Submission {
    const id = newId('sub')
    const seq = (db.get<{ m: number | null }>('SELECT MAX(seq) m FROM submissions WHERE version_id = ?', versionId)?.m ?? 0) + 1
    db.run('INSERT INTO submissions (id, version_id, seq, snapshot, snapshot_hash, submitted_at, submitted_by) VALUES (?,?,?,?,?,?,?)', id, versionId, seq, snapshot, hash, nowIso(), userId)
    for (const k of new Set(storageKeys)) db.run('INSERT INTO submission_files (submission_id, storage_key) VALUES (?, ?)', id, k)
    return this.get(id)!
  },
  get: (id: string) => {
    const r = db.get('SELECT * FROM submissions WHERE id = ?', id)
    return r ? toSubmission(r) : undefined
  },
  listForVersion: (versionId: string) => db.all('SELECT * FROM submissions WHERE version_id = ? ORDER BY seq', versionId).map(toSubmission),
  lastForVersion: (versionId: string) => {
    const r = db.get('SELECT * FROM submissions WHERE version_id = ? ORDER BY seq DESC LIMIT 1', versionId)
    return r ? toSubmission(r) : undefined
  },
  withdraw: (id: string, userId: string) => db.run('UPDATE submissions SET withdrawn_at=?, withdrawn_by=? WHERE id=?', nowIso(), userId, id),
  markReminded: (id: string) => db.run('UPDATE submissions SET reminded_at=? WHERE id=?', nowIso(), id),
  /** Submission hiện tại của các version đang chờ duyệt, chưa nhắc. */
  pendingUnreminded: () =>
    db.all("SELECT s.* FROM submissions s JOIN versions v ON v.current_submission_id = s.id WHERE v.state = 'pending_review' AND s.reminded_at IS NULL AND s.withdrawn_at IS NULL").map(toSubmission),
})

const toReview = (r: Row): Review => ({
  id: r.id as string,
  submissionId: r.submission_id as string,
  versionId: r.version_id as string,
  decision: r.decision as Review['decision'],
  note: (r.note as string) ?? null,
  targets: parseJson(r.targets_json, []),
  userId: r.user_id as string,
  onBehalf: bool(r.on_behalf),
  evidenceFileId: (r.evidence_file_id as string) ?? null,
  snapshotHash: r.snapshot_hash as string,
  createdAt: r.created_at as string,
})

export const reviews = (db: Db) => ({
  create(r: Omit<Review, 'id' | 'createdAt'>): Review {
    const id = newId('rev')
    db.run(
      'INSERT INTO reviews (id, submission_id, version_id, decision, note, targets_json, user_id, on_behalf, evidence_file_id, snapshot_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id, r.submissionId, r.versionId, r.decision, r.note, JSON.stringify(r.targets), r.userId, r.onBehalf, r.evidenceFileId, r.snapshotHash, nowIso(),
    )
    return toReview(db.get('SELECT * FROM reviews WHERE id = ?', id)!)
  },
  forSubmission: (submissionId: string) => {
    const r = db.get('SELECT * FROM reviews WHERE submission_id = ?', submissionId)
    return r ? toReview(r) : undefined
  },
  forVersion: (versionId: string) => db.all('SELECT * FROM reviews WHERE version_id = ? ORDER BY created_at', versionId).map(toReview),
})

/* ---------- model assets ---------- */

const toModel = (r: Row): ModelAsset => ({
  id: r.id as string,
  projectId: (r.project_id as string) ?? null,
  originalFileId: r.original_file_id as string,
  optimizedFileId: (r.optimized_file_id as string) ?? null,
  status: r.status as ModelAsset['status'],
  error: (r.error as string) ?? null,
  report: parseJson(r.report_json, null),
  level: (r.level as ModelAsset['level']) ?? null,
  reasons: parseJson(r.reasons_json, []),
  lightFileId: (r.light_file_id as string) ?? null,
  lightReport: parseJson(r.light_report_json, null),
  normalize: parseJson(r.normalize_json, null),
  createdBy: (r.created_by as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
})

export const models = (db: Db) => ({
  create(m: Pick<ModelAsset, 'projectId' | 'originalFileId' | 'createdBy'> & { normalize?: ModelNormalize | null }): ModelAsset {
    const id = newId('mdl')
    const t = nowIso()
    db.run(
      'INSERT INTO model_assets (id, project_id, original_file_id, normalize_json, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      id, m.projectId, m.originalFileId, m.normalize ? JSON.stringify(m.normalize) : null, m.createdBy, t, t,
    )
    return this.get(id)!
  },
  /** Xử lý lại với yêu cầu chuẩn hoá mới (R2.2). */
  restart(id: string, normalize: ModelNormalize) {
    db.run(
      "UPDATE model_assets SET status='processing', error=NULL, normalize_json=?, updated_at=? WHERE id=?",
      JSON.stringify(normalize), nowIso(), id,
    )
  },
  get: (id: string) => {
    const r = db.get('SELECT * FROM model_assets WHERE id = ?', id)
    return r ? toModel(r) : undefined
  },
  byIds: (ids: string[]): Map<string, ModelAsset> => {
    if (!ids.length) return new Map()
    const rows = db.all(`SELECT * FROM model_assets WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).map(toModel)
    return new Map(rows.map((m) => [m.id, m]))
  },
  finish(id: string, p: {
    status: 'ready' | 'failed'; optimizedFileId?: string; report?: unknown; level?: string; reasons?: string[]; error?: string
    lightFileId?: string; lightReport?: unknown; normalize?: ModelNormalize | null
  }) {
    const keep = p.normalize === undefined ? this.get(id)?.normalize ?? null : p.normalize
    db.run(
      'UPDATE model_assets SET status=?, optimized_file_id=?, report_json=?, level=?, reasons_json=?, error=?, light_file_id=?, light_report_json=?, normalize_json=?, updated_at=? WHERE id=?',
      p.status, p.optimizedFileId ?? null, p.report ? JSON.stringify(p.report) : null, p.level ?? null, JSON.stringify(p.reasons ?? []), p.error ?? null,
      p.lightFileId ?? null, p.lightReport ? JSON.stringify(p.lightReport) : null, keep ? JSON.stringify(keep) : null, nowIso(), id,
    )
  },
})

/* ---------- library ---------- */

const toLibrary = (r: Row): LibraryItem => ({
  id: r.id as string,
  name: r.name as string,
  category: r.category as LibraryItem['category'],
  sizeMm: parseJson(r.size_json, [1000, 1000, 1000]),
  material: (r.material as string) ?? null,
  brand: (r.brand as string) ?? null,
  description: (r.description as string) ?? null,
  imageFileIds: parseJson(r.image_file_ids_json, []),
  modelAssetId: (r.model_asset_id as string) ?? null,
  fallbackShape: (r.fallback_shape as LibraryItem['fallbackShape']) ?? null,
  variants: parseJson(r.variants_json, []),
  productCode: (r.product_code as string) ?? null,
  sourceKind: (r.source_kind as LibraryItem['sourceKind']) ?? 'in_house',
  sourceName: (r.source_name as string) ?? null,
  sourceUrl: (r.source_url as string) ?? null,
  license: (r.license as LibraryItem['license']) ?? null,
  attribution: (r.attribution as string) ?? null,
  clientId: (r.client_id as string) ?? null,
  status: (r.status as LibraryItem['status']) ?? 'draft',
  approvedBy: (r.approved_by as string) ?? null,
  approvedAt: (r.approved_at as string) ?? null,
  sizeAccepted: bool(r.size_accepted),
  archived: bool(r.archived),
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
})

type LibraryMeta = 'productCode' | 'sourceKind' | 'sourceName' | 'sourceUrl' | 'license' | 'attribution' | 'clientId' | 'status' | 'approvedBy' | 'approvedAt' | 'sizeAccepted'
/** Nguồn, phạm vi, trạng thái tuỳ chọn khi tạo: mặc định đội tự làm · kho chung · nháp. */
export type LibraryInput = Omit<LibraryItem, 'id' | 'archived' | 'createdAt' | 'updatedAt' | LibraryMeta> & Partial<Pick<LibraryItem, LibraryMeta>>

export const library = (db: Db) => ({
  create(i: LibraryInput): LibraryItem {
    const id = newId('lib')
    const t = nowIso()
    db.run(
      'INSERT INTO library_items (id, name, category, size_json, material, brand, description, image_file_ids_json, model_asset_id, fallback_shape, variants_json, product_code, source_kind, source_name, source_url, license, attribution, client_id, status, approved_by, approved_at, size_accepted, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, i.name, i.category, JSON.stringify(i.sizeMm), i.material, i.brand, i.description, JSON.stringify(i.imageFileIds), i.modelAssetId, i.fallbackShape,
      JSON.stringify(i.variants), i.productCode ?? null, i.sourceKind ?? 'in_house', i.sourceName ?? null, i.sourceUrl ?? null, i.license ?? null, i.attribution ?? null,
      i.clientId ?? null, i.status ?? 'draft', i.approvedBy ?? null, i.approvedAt ?? null, i.sizeAccepted ?? false, t, t,
    )
    return this.get(id)!
  },
  get: (id: string) => {
    const r = db.get('SELECT * FROM library_items WHERE id = ?', id)
    return r ? toLibrary(r) : undefined
  },
  byIds: (ids: string[]): Map<string, LibraryItem> => {
    if (!ids.length) return new Map()
    const rows = db.all(`SELECT * FROM library_items WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).map(toLibrary)
    return new Map(rows.map((m) => [m.id, m]))
  },
  /** Kho chung + của khách `clientId` (BR-R3); `allClients` cho QTV xem hết. Mặc định ẩn món ngừng dùng. */
  list: (f: { q?: string; category?: string; includeArchived?: boolean; clientId?: string | null; allClients?: boolean; includeRetired?: boolean; status?: string } = {}) => {
    const where: string[] = []
    const params: string[] = []
    if (!f.includeArchived) where.push('archived = 0')
    if (f.status) {
      where.push('status = ?')
      params.push(f.status)
    } else if (!f.includeRetired) where.push("status <> 'retired'")
    if (!f.allClients) {
      if (f.clientId) {
        where.push('(client_id IS NULL OR client_id = ?)')
        params.push(f.clientId)
      } else where.push('client_id IS NULL')
    }
    if (f.category) {
      where.push('category = ?')
      params.push(f.category)
    }
    if (f.q) {
      where.push('(name LIKE ? OR brand LIKE ?)')
      params.push(`%${f.q}%`, `%${f.q}%`)
    }
    return db.all(`SELECT * FROM library_items ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name COLLATE NOCASE`, ...params).map(toLibrary)
  },
  update(id: string, p: Partial<LibraryInput> & { archived?: boolean }) {
    const cur = this.get(id)
    if (!cur) return undefined
    const n = { ...cur, ...p }
    db.run(
      'UPDATE library_items SET name=?, category=?, size_json=?, material=?, brand=?, description=?, image_file_ids_json=?, model_asset_id=?, fallback_shape=?, variants_json=?, product_code=?, source_kind=?, source_name=?, source_url=?, license=?, attribution=?, client_id=?, status=?, approved_by=?, approved_at=?, size_accepted=?, archived=?, updated_at=? WHERE id=?',
      n.name, n.category, JSON.stringify(n.sizeMm), n.material, n.brand, n.description, JSON.stringify(n.imageFileIds), n.modelAssetId, n.fallbackShape,
      JSON.stringify(n.variants), n.productCode, n.sourceKind, n.sourceName, n.sourceUrl, n.license, n.attribution, n.clientId, n.status, n.approvedBy, n.approvedAt,
      n.sizeAccepted, n.archived, nowIso(), id,
    )
    return this.get(id)!
  },
})

/* ---------- vật liệu (item 03) ---------- */

const MAPS = ['color', 'normal', 'rough'] as const

const toMaterial = (r: Row): Material => {
  const files: Material['files'] = {}
  for (const m of MAPS) {
    const full = r[`${m}_file_id`] as string | null
    const small = r[`${m}_small_file_id`] as string | null
    if (full && small) files[m] = { full, small }
  }
  return {
    id: r.id as string,
    key: r.key as string,
    name: r.name as string,
    category: r.category as Material['category'],
    tileMm: [r.tile_w_mm as number, r.tile_h_mm as number],
    color: r.color as string,
    roughness: r.roughness as number,
    metalness: r.metalness as number,
    files,
    sourceKind: r.source_kind as Material['sourceKind'],
    sourceName: (r.source_name as string) ?? null,
    sourceUrl: (r.source_url as string) ?? null,
    license: (r.license as Material['license']) ?? null,
    attribution: (r.attribution as string) ?? null,
    clientId: (r.client_id as string) ?? null,
    status: r.status as Material['status'],
    approvedBy: (r.approved_by as string) ?? null,
    approvedAt: (r.approved_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export type MaterialInput = Pick<Material, 'key' | 'name' | 'category' | 'tileMm' | 'color' | 'roughness' | 'metalness' | 'sourceKind' | 'sourceName' | 'sourceUrl' | 'license' | 'attribution' | 'clientId'>

export const materials = (db: Db) => ({
  create(i: MaterialInput): Material {
    const id = newId('mat')
    const t = nowIso()
    db.run(
      'INSERT INTO materials (id, key, name, category, tile_w_mm, tile_h_mm, color, roughness, metalness, source_kind, source_name, source_url, license, attribution, client_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, i.key, i.name, i.category, i.tileMm[0], i.tileMm[1], i.color, i.roughness, i.metalness, i.sourceKind, i.sourceName, i.sourceUrl, i.license, i.attribution, i.clientId, t, t,
    )
    return this.get(id)!
  },
  get: (id: string) => {
    const r = db.get('SELECT * FROM materials WHERE id = ?', id)
    return r ? toMaterial(r) : undefined
  },
  byKey: (key: string) => {
    const r = db.get('SELECT * FROM materials WHERE key = ?', key)
    return r ? toMaterial(r) : undefined
  },
  byIds: (ids: string[]): Map<string, Material> => {
    if (!ids.length) return new Map()
    const rows = db.all(`SELECT * FROM materials WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).map(toMaterial)
    return new Map(rows.map((m) => [m.id, m]))
  },
  /** Kho chung + của khách `clientId` (BR-R3); `allClients` cho QTV xem hết. */
  list: (f: { clientId?: string | null; allClients?: boolean; includeRetired?: boolean; category?: string } = {}) => {
    const where: string[] = []
    const params: string[] = []
    if (!f.includeRetired) where.push("status <> 'retired'")
    if (!f.allClients) {
      if (f.clientId) {
        where.push('(client_id IS NULL OR client_id = ?)')
        params.push(f.clientId)
      } else where.push('client_id IS NULL')
    }
    if (f.category) {
      where.push('category = ?')
      params.push(f.category)
    }
    return db.all(`SELECT * FROM materials ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY category, name COLLATE NOCASE`, ...params).map(toMaterial)
  },
  update(id: string, p: Partial<MaterialInput> & { status?: Material['status']; approvedBy?: string | null; approvedAt?: string | null }) {
    const cur = this.get(id)
    if (!cur) return undefined
    const n = { ...cur, ...p }
    db.run(
      'UPDATE materials SET key=?, name=?, category=?, tile_w_mm=?, tile_h_mm=?, color=?, roughness=?, metalness=?, source_kind=?, source_name=?, source_url=?, license=?, attribution=?, client_id=?, status=?, approved_by=?, approved_at=?, updated_at=? WHERE id=?',
      n.key, n.name, n.category, n.tileMm[0], n.tileMm[1], n.color, n.roughness, n.metalness, n.sourceKind, n.sourceName, n.sourceUrl, n.license, n.attribution, n.clientId,
      n.status, n.approvedBy, n.approvedAt, nowIso(), id,
    )
    return this.get(id)!
  },
  setMap(id: string, map: (typeof MAPS)[number], full: string, small: string) {
    db.run(`UPDATE materials SET ${map}_file_id = ?, ${map}_small_file_id = ?, updated_at = ? WHERE id = ?`, full, small, nowIso(), id)
    return this.get(id)!
  },
})

export const makeRepos = (db: Db) => ({
  clients: clients(db),
  users: users(db),
  files: files(db),
  projects: projects(db),
  houses: houses(db),
  versions: versions(db),
  submissions: submissions(db),
  reviews: reviews(db),
  models: models(db),
  library: library(db),
  materials: materials(db),
})

export type Repos = ReturnType<typeof makeRepos>
