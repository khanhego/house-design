import { createHash } from 'node:crypto'
import { libraryItemIds, stripUnderlay } from '@hd/core'
import type { CheckContext, HouseDocument, ResolvedLibraryItem, ResolvedModel, Snapshot } from '@hd/core'
import { AppError } from '../lib/errors.ts'
import { fileUrl } from '../repos/types.ts'
import type { House } from '../repos/types.ts'
import type { Ctx } from '../context.ts'

const PUBLIC_KINDS = new Set(['cover', 'gallery_image', 'library_image', 'item_image', 'model_optimized', 'tour_image', 'tour_clip'])

/** JSON chuẩn hoá (khoá sắp xếp) để băm. */
export const canonicalJson = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`
}

export const hashSnapshot = (s: Snapshot) => createHash('sha256').update(canonicalJson(s)).digest('hex')

const modelIdsOf = (doc: HouseDocument) => {
  const ids = new Set<string>()
  for (const f of doc.floors) {
    if (f.modelRef) ids.add(f.modelRef.modelAssetId)
    for (const it of f.items) if ('modelNode' in it.source) ids.add(it.source.modelNode.modelAssetId)
  }
  if (doc.exterior?.modelRef) ids.add(doc.exterior.modelRef.modelAssetId)
  if (doc.wholeModel) ids.add(doc.wholeModel.modelAssetId)
  return ids
}

/** Ngữ cảnh cho `submitChecks` (trạng thái + báo cáo mô hình, GLB của đồ thư viện). */
export const checkContext = (ctx: Ctx, doc: HouseDocument): CheckContext => {
  const lib = ctx.repos.library.byIds(libraryItemIds(doc))
  const ids = modelIdsOf(doc)
  for (const it of lib.values()) if (it.modelAssetId) ids.add(it.modelAssetId)
  const ms = ctx.repos.models.byIds([...ids])
  return {
    models: Object.fromEntries([...ms.values()].map((m) => [m.id, { status: m.status, report: m.report }])),
    libraryModels: Object.fromEntries([...lib.values()].map((i) => [i.id, i.modelAssetId])),
  }
}

/**
 * Dựng snapshot (02a §4.1). Bỏ ảnh nền; chỉ file kind công khai được phép xuất hiện (R-01).
 * Trả kèm danh sách storage key để ghi `submission_files`.
 */
export const buildSnapshot = (ctx: Ctx, docJson: string, house: House): { snapshot: Snapshot; storageKeys: string[]; hash: string } => {
  const raw = JSON.parse(docJson) as HouseDocument
  const document = stripUnderlay(raw)
  const keys: string[] = []

  const fileIds = new Set<string>()
  if (document.coverFileId) fileIds.add(document.coverFileId)
  document.gallery.forEach((id) => fileIds.add(id))
  for (const f of document.floors) for (const it of f.items) it.info?.imageFileIds?.forEach((id) => fileIds.add(id))
  // tour ảnh thật: ảnh 2 cỡ + clip chuyển cảnh
  for (const sc of document.tour?.scenes ?? []) [sc.fileId, sc.smallFileId, sc.clipFileId].forEach((id) => id && fileIds.add(id))

  const lib = ctx.repos.library.byIds(libraryItemIds(document))
  for (const it of lib.values()) it.imageFileIds.forEach((id) => fileIds.add(id))
  const modelIds = modelIdsOf(document)
  for (const it of lib.values()) if (it.modelAssetId) modelIds.add(it.modelAssetId)
  const ms = ctx.repos.models.byIds([...modelIds])
  for (const m of ms.values()) if (m.optimizedFileId) fileIds.add(m.optimizedFileId)

  const fs = ctx.repos.files.byIds([...fileIds])
  const url = (id: string | null | undefined) => {
    if (!id) return null
    const f = fs.get(id)
    if (!f) return null
    if (!PUBLIC_KINDS.has(f.kind)) throw new AppError(500, 'INTERNAL', `File ${f.kind} không được phép vào snapshot`)
    keys.push(f.storageKey)
    return fileUrl(f.storageKey)
  }

  const models: Record<string, ResolvedModel> = {}
  for (const m of ms.values()) {
    if (m.status !== 'ready' || !m.optimizedFileId || !m.report) continue
    const u = url(m.optimizedFileId)
    if (u) models[m.id] = { url: u, bbox: m.report.bbox, report: m.report }
  }

  const libraryItems: Record<string, ResolvedLibraryItem> = {}
  for (const it of lib.values()) {
    libraryItems[it.id] = {
      name: it.name,
      category: it.category,
      sizeMm: it.sizeMm,
      material: it.material ?? undefined,
      brand: it.brand ?? undefined,
      description: it.description ?? undefined,
      imageUrls: it.imageFileIds.map(url).filter((x): x is string => !!x),
      variants: it.variants,
      modelUrl: it.modelAssetId && models[it.modelAssetId] ? models[it.modelAssetId].url : null,
      modelAssetId: it.modelAssetId && models[it.modelAssetId] ? it.modelAssetId : null,
      fallbackShape: it.fallbackShape,
    }
  }

  const filesOut: Record<string, string> = {}
  for (const id of fileIds) {
    const f = fs.get(id)
    if (!f || f.kind === 'model_optimized' || f.kind === 'library_image') continue
    const u = url(id)
    if (u) filesOut[id] = u
  }

  const snapshot: Snapshot = {
    document,
    house: {
      name: house.name,
      houseType: house.houseType,
      declaredArea: house.declaredArea,
      bedrooms: house.bedrooms,
      bathrooms: house.bathrooms,
      description: house.description,
      price: house.price,
      landArea: house.landArea,
      features: house.features,
    },
    resolved: { libraryItems, models, files: filesOut },
  }
  return { snapshot, storageKeys: [...new Set(keys)], hash: hashSnapshot(snapshot) }
}

/** Payload công khai bỏ `report` của mô hình (N-07). */
export const publicResolved = (s: Snapshot): Snapshot['resolved'] => ({
  ...s.resolved,
  models: Object.fromEntries(Object.entries(s.resolved.models).map(([k, m]) => [k, { url: m.url, bbox: m.bbox }])),
})
