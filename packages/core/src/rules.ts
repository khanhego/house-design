import { bboxOf, centroid, isSimplePolygon, pointInPolygon, polygonArea, wallsOutline } from './geometry.ts'
import { auditFloor } from './nav.ts'
import type { NavLibrary } from './nav.ts'
import { newId } from './ids.ts'
import { MAX_FLOORS } from './schema.ts'
import type { TourChapter } from './schema.ts'
import type { Floor, HouseDocument, ModelReport, PlacedItem, Point } from './schema.ts'

export const DEFAULT_DISCLAIMER =
  'Hình ảnh 3D và bản vẽ mang tính minh hoạ, có thể thay đổi theo thực tế thi công và hồ sơ được phê duyệt.'

export const DEFAULT_PRIVACY_POLICY = `Chúng tôi thu thập họ tên, số điện thoại, email và nhu cầu bạn để lại để liên hệ tư vấn về dự án.
Thông tin chỉ được chủ dự án và đơn vị vận hành trang này sử dụng cho mục đích tư vấn, không bán cho bên thứ ba.
Trang có ghi nhận lượt xem ẩn danh (mã thiết bị ngẫu nhiên lưu trên trình duyệt của bạn) để thống kê; mã này được liên kết với thông tin bạn để lại khi bạn gửi form.
Bạn có thể yêu cầu xoá thông tin bất kỳ lúc nào qua số điện thoại liên hệ của dự án.`

/* ---------- Diện tích & định dạng (BR-04, NFR-10) ---------- */

const round2 = (n: number) => Math.round(n * 100) / 100

/** Diện tích phòng theo lòng tường, m², làm tròn 2 chữ số. */
export const roomArea = (polygon: Point[]) => round2(polygonArea(polygon) / 1e6)

export interface FloorAreaResult {
  m2: number
  fromOutline: boolean
}

/** Diện tích sàn tầng: theo đường bao nếu có, không thì hình chữ nhật bao mép ngoài các tường. */
export const floorGrossArea = (floor: Floor): FloorAreaResult => {
  if (floor.outline && floor.outline.length >= 3) return { m2: round2(polygonArea(floor.outline) / 1e6), fromOutline: true }
  const pts = wallsOutline(floor)
  if (!pts.length) return { m2: 0, fromOutline: false }
  const b = bboxOf(pts)
  return { m2: round2(((b.maxX - b.minX) * (b.maxY - b.minY)) / 1e6), fromOutline: false }
}

const nf2 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

export const formatArea = (m2: number) => `${nf2.format(m2)} m²`
export const formatMm = (mm: number) => nf0.format(Math.round(mm))

/* ---------- Đồ → phòng (FR-05.04) ---------- */

export const assignItemsToRooms = (floor: Floor): Record<string, string | null> => {
  const out: Record<string, string | null> = {}
  for (const it of floor.items) {
    const room = floor.rooms.find((r) => r.polygon.length >= 3 && pointInPolygon(it.position, r.polygon))
    out[it.id] = room?.id ?? null
  }
  return out
}

export const roomLabelPoint = (polygon: Point[]): Point => {
  const c = centroid(polygon)
  if (pointInPolygon(c, polygon)) return c
  const b = bboxOf(polygon)
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
}

/* ---------- Ngân sách hiệu năng (BR-07, 02 §6 API-37) ---------- */

export const BUDGET = {
  warn: { triangles: 400_000, drawCalls: 120, textureBytes: 128 * 2 ** 20, fileBytes: 10 * 2 ** 20 },
  block: { triangles: 800_000, drawCalls: 250, textureBytes: 256 * 2 ** 20, fileBytes: 14 * 2 ** 20 },
} as const

/** Bản máy tính (item 03 lát R2, DEC-R17): đồ dùng bản đầy đủ. `BUDGET` ở trên áp cho bản điện thoại (bản nhẹ). */
export const BUDGET_DESKTOP = {
  warn: { triangles: 1_500_000, drawCalls: 250, textureBytes: 384 * 2 ** 20, fileBytes: 30 * 2 ** 20 },
  block: { triangles: 3_000_000, drawCalls: 400, textureBytes: 768 * 2 ** 20, fileBytes: 45 * 2 ** 20 },
} as const

export type BudgetMetric = keyof typeof BUDGET.warn
type Budget = { warn: Record<BudgetMetric, number>; block: Record<BudgetMetric, number> }
export type Level = 'ok' | 'warn' | 'block'

export interface BudgetTotals {
  triangles: number
  drawCalls: number
  textureBytes: number
  fileBytes: number
}

export const levelOf = (t: BudgetTotals, budget: Budget = BUDGET): { level: Level; reasons: string[] } => {
  const reasons: string[] = []
  let level: Level = 'ok'
  for (const k of Object.keys(budget.warn) as BudgetMetric[]) {
    if (t[k] > budget.block[k]) {
      level = 'block'
      reasons.push(`${k} > ${budget.block[k]}`)
    } else if (t[k] > budget.warn[k]) {
      if (level === 'ok') level = 'warn'
      reasons.push(`${k} > ${budget.warn[k]}`)
    }
  }
  return { level, reasons }
}

/**
 * Ngân sách một món đồ (BR-R2): vượt mức Đạt → tự giảm; sau khi giảm vẫn vượt mức Chặn (gấp đôi) → từ chối.
 * Texture vượt cỡ luôn được thu nhỏ khi tối ưu nên chỉ tính tam giác và dung lượng.
 */
export const ITEM_BUDGET = {
  full: { triangles: 50_000, texturePx: 2048, fileBytes: 3 * 2 ** 20 },
  light: { triangles: 5_000, texturePx: 512, fileBytes: 300 * 2 ** 10 },
} as const

export const itemLevel = (r: Pick<ModelReport, 'triangles' | 'fileBytes'>, variant: keyof typeof ITEM_BUDGET): { level: Level; reasons: string[] } => {
  const b = ITEM_BUDGET[variant]
  const name = variant === 'full' ? 'Bản đầy đủ' : 'Bản nhẹ'
  const reasons: string[] = []
  let level: Level = 'ok'
  const check = (v: number, ok: number, label: string, fmt: (n: number) => string) => {
    if (v > ok * 2) level = 'block'
    else if (v > ok && level === 'ok') level = 'warn'
    if (v > ok) reasons.push(`${name}: ${label} ${fmt(v)} > ${fmt(ok)}`)
  }
  check(r.triangles, b.triangles, 'tam giác', (n) => n.toLocaleString('vi-VN'))
  check(r.fileBytes, b.fileBytes, 'dung lượng', (n) => (n >= 2 ** 20 ? `${(n / 2 ** 20).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`))
  return { level, reasons }
}

/** Lệch lớn nhất giữa kích thước đo được và khai báo, theo từng trục (BR-R4), tính bằng %. */
export const sizeDeviation = (declared: [number, number, number], measured: [number, number, number]) =>
  Math.max(...declared.map((d, i) => (d > 0 ? (Math.abs(measured[i] - d) / d) * 100 : 0)))

export const SIZE_WARN_PCT = 3
export const SIZE_MUST_CHOOSE_PCT = 20

export interface ModelInfo {
  status: 'processing' | 'ready' | 'failed'
  report?: ModelReport | null
  /** báo cáo bản nhẹ (đồ thư viện, item 03 lát R2) */
  lightReport?: ModelReport | null
}

export interface CheckContext {
  models: Record<string, ModelInfo>
  /** modelAssetId của đồ thư viện (nếu có GLB) */
  libraryModels: Record<string, string | null | undefined>
  /** kích thước + loại đồ thư viện — để kiểm lối đi có tính đồ nội thất */
  libraryItems?: NavLibrary
  /** vật liệu mẫu nhà dùng: tên + trạng thái (item 03, FR-13.16) — thiếu id = vật liệu không còn */
  materials?: Record<string, { name: string; status: 'draft' | 'ready' | 'retired' }>
  /** trạng thái + phạm vi đồ thư viện (item 03 lát R2, FR-13.05, BR-R3) — thiếu id = đồ không còn */
  libraryStatus?: Record<string, { name: string; status: 'draft' | 'ready' | 'retired'; clientId: string | null }>
  /** khách của dự án */
  clientId?: string | null
}

/** Mô hình được tham chiếu trong một góc xem tầng: tầng + ngoại thất + cả nhà + GLB đồ thư viện trên tầng. */
export const modelsForFloor = (doc: HouseDocument, floor: Floor, ctx: CheckContext): string[] => {
  const ids = new Set<string>()
  if (floor.modelRef) ids.add(floor.modelRef.modelAssetId)
  if (doc.exterior?.modelRef) ids.add(doc.exterior.modelRef.modelAssetId)
  if (doc.wholeModel) ids.add(doc.wholeModel.modelAssetId)
  for (const it of floor.items) {
    if ('libraryItemId' in it.source) {
      const m = ctx.libraryModels[it.source.libraryItemId]
      if (m) ids.add(m)
    }
  }
  return [...ids]
}

/**
 * Tổng chi phí hiển thị một góc xem tầng. GLB đồ thư viện dùng nhiều lần chỉ tải một lần nhưng vẽ nhiều lần.
 * `light` = bản điện thoại: đồ thư viện tính theo bản nhẹ (nếu có) — FR-13.16.
 */
export const budgetForFloor = (doc: HouseDocument, floor: Floor, ctx: CheckContext, variant: 'light' | 'full' = 'light'): BudgetTotals => {
  const t: BudgetTotals = { triangles: 0, drawCalls: 0, textureBytes: 0, fileBytes: 0 }
  const counted = new Set<string>()
  const add = (id: string, times: number, item = false) => {
    const m = ctx.models[id]
    const r = item && variant === 'light' ? m?.lightReport ?? m?.report : m?.report
    if (!r) return
    t.triangles += r.triangles * times
    t.drawCalls += r.drawCalls * times
    if (!counted.has(id)) {
      t.textureBytes += r.textureBytes
      t.fileBytes += r.fileBytes
      counted.add(id)
    }
  }
  if (floor.modelRef) add(floor.modelRef.modelAssetId, 1)
  if (doc.exterior?.modelRef) add(doc.exterior.modelRef.modelAssetId, 1)
  if (doc.wholeModel) add(doc.wholeModel.modelAssetId, 1)
  const uses = new Map<string, number>()
  for (const it of floor.items) {
    if ('libraryItemId' in it.source) {
      const m = ctx.libraryModels[it.source.libraryItemId]
      if (m) uses.set(m, (uses.get(m) ?? 0) + 1)
    }
  }
  for (const [id, n] of uses) add(id, n, true)
  return t
}

/* ---------- Kiểm gửi duyệt (FR-08.02, 02 §5.3) ---------- */

export interface Check {
  level: 'block' | 'warn'
  code:
    | 'NO_CONTENT' | 'TOUR_TOO_SHORT' | 'TOUR_NO_NEXT' | 'TOUR_SCENE_NO_TITLE' | 'TOO_MANY_FLOORS' | 'FLOOR_NOT_CALIBRATED' | 'ROOM_NOT_CLOSED' | 'ROOM_UNREACHABLE' | 'ROOM_NO_SPACE' | 'NARROW_PASSAGE' | 'ROOM_CRAMPED' | 'DOOR_BLOCKED' | 'STAIR_BLOCKED' | 'STAIR_NOWHERE' | 'MATERIAL_NOT_READY' | 'ITEM_NOT_READY' | 'ITEM_OTHER_CLIENT' | 'MODEL_PROCESSING'
    | 'MODEL_FAILED' | 'MODEL_NODE_MISSING' | 'BUDGET_BLOCK' | 'BUDGET_WARN' | 'NO_COVER'
    | 'FLOOR_NO_OUTLINE' | 'NO_DEFAULT_VIEWPOINT'
  message: string
  floorId?: string
  objectId?: string
}

const referencedModels = (doc: HouseDocument): string[] => {
  const ids = new Set<string>()
  for (const f of doc.floors) {
    if (f.modelRef) ids.add(f.modelRef.modelAssetId)
    for (const it of f.items) if ('modelNode' in it.source) ids.add(it.source.modelNode.modelAssetId)
  }
  if (doc.exterior?.modelRef) ids.add(doc.exterior.modelRef.modelAssetId)
  if (doc.wholeModel) ids.add(doc.wholeModel.modelAssetId)
  return [...ids]
}

/** Tầng có nội dung dựng (tường, phòng hoặc mô hình) — tầng rỗng không tính là 3D. */
export const floorHasContent = (f: Floor) => f.walls.length > 0 || f.rooms.length > 0 || !!f.modelRef
/** Mẫu nhà có phần xem 3D. */
export const hasModel3d = (doc: HouseDocument) => doc.floors.some(floorHasContent) || !!doc.wholeModel
/** Mẫu nhà có tour ảnh thật dùng được (≥ 2 cảnh). */
export const hasTour = (doc: HouseDocument) => (doc.tour?.scenes.length ?? 0) >= 2

/** Giá kiểu Việt (BR-T6): ≥ 1 tỷ → "12,5 tỷ ₫"; < 1 tỷ → "850 triệu ₫"; trống → null. */
export const formatPriceVnd = (v: number | null | undefined): string | null => {
  if (!v || v <= 0) return null
  const nf = (n: number, d: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: d })
  if (v >= 1e9) return `${nf(v / 1e9, 2)} tỷ ₫`
  if (v >= 1e6) return `${nf(Math.round(v / 1e6), 0)} triệu ₫`
  return `${nf(v, 0)} ₫`
}

/** Chương của từng cảnh theo BR-T8: cảnh chưa gán lấy chương của cảnh trước, cảnh 1 mặc định "Ngoài nhà". */
export const sceneChapters = (scenes: { chapter?: TourChapter }[]): TourChapter[] => {
  let cur: TourChapter = 'interior'
  return scenes.map((s) => (cur = s.chapter ?? cur))
}

/** Gợi ý chương từ tên cảnh (A7, khi nhập ảnh). */
export const guessChapter = (title: string): TourChapter | undefined => {
  const t = title.normalize('NFC').toLowerCase()
  if (/hồ bơi|bể bơi|sân vườn|sân sau|vườn|sân thượng|ban công|hiên sau|pool|garden|terrace|backyard/.test(t)) return 'outdoor'
  if (/mặt tiền|cổng|sân trước|ngoài nhà|nhìn lại|toàn cảnh|facade|exterior/.test(t)) return 'exterior'
  if (/phòng|bếp|sảnh|lối vào|wc|cầu thang|hành lang|lô gia|kitchen|living|bedroom|bath|room|entrance/.test(t)) return 'interior'
  return undefined
}

export const submitChecks = (doc: HouseDocument, ctx: CheckContext): Check[] => {
  const out: Check[] = []
  // vật liệu chưa duyệt giấy phép / đã ngừng dùng → không gửi duyệt được (FR-13.05, FR-13.16)
  if (ctx.materials)
    for (const id of materialIds(doc)) {
      const m = ctx.materials[id]
      if (!m || m.status !== 'ready')
        out.push({ level: 'block', code: 'MATERIAL_NOT_READY', objectId: id, message: m ? `Vật liệu "${m.name}" ${m.status === 'draft' ? 'chưa được duyệt giấy phép' : 'đã ngừng dùng'}` : 'Có vật liệu không còn trong thư viện' })
    }
  // đồ chưa duyệt giấy phép / ngừng dùng / của khách khác (FR-13.05, FR-13.16, BR-R3)
  if (ctx.libraryStatus)
    for (const id of libraryItemIds(doc)) {
      const it = ctx.libraryStatus[id]
      if (!it) continue
      if (it.clientId && it.clientId !== (ctx.clientId ?? null))
        out.push({ level: 'block', code: 'ITEM_OTHER_CLIENT', objectId: id, message: `Đồ "${it.name}" thuộc khách hàng khác` })
      else if (it.status !== 'ready')
        out.push({ level: 'block', code: 'ITEM_NOT_READY', objectId: id, message: `Đồ "${it.name}" ${it.status === 'draft' ? 'chưa được duyệt giấy phép' : 'đã ngừng dùng'}` })
    }
  const tourScenes = doc.tour?.scenes ?? []
  if (!hasModel3d(doc) && !tourScenes.length)
    out.push({ level: 'block', code: 'NO_CONTENT', message: 'Mẫu nhà chưa có tầng dựng hoặc tour ảnh thật' })
  if (tourScenes.length === 1) out.push({ level: 'block', code: 'TOUR_TOO_SHORT', message: 'Tour ảnh thật cần ít nhất 2 cảnh' })
  tourScenes.forEach((sc, i) => {
    if (!sc.title.trim()) out.push({ level: 'block', code: 'TOUR_SCENE_NO_TITLE', objectId: sc.id, message: `Cảnh ${i + 1} chưa có tên` })
  })
  tourScenes.slice(0, -1).forEach((sc, i) => {
    if (!sc.next) out.push({ level: 'warn', code: 'TOUR_NO_NEXT', objectId: sc.id, message: `Cảnh ${i + 1} "${sc.title}" chưa đặt điểm đi tiếp` })
  })
  if (doc.floors.length > MAX_FLOORS)
    out.push({ level: 'block', code: 'TOO_MANY_FLOORS', message: `Mẫu nhà có hơn ${MAX_FLOORS} tầng` })

  // tầng rỗng của mẫu nhà chỉ có tour ảnh thì bỏ qua kiểm dựng
  for (const f of doc.floors.filter((x) => floorHasContent(x) || !tourScenes.length)) {
    if (!f.calibrated)
      out.push({ level: 'block', code: 'FLOOR_NOT_CALIBRATED', floorId: f.id, message: `${f.name} chưa hiệu chỉnh tỷ lệ` })
    for (const r of f.rooms) {
      if (!isSimplePolygon(r.polygon))
        out.push({ level: 'block', code: 'ROOM_NOT_CLOSED', floorId: f.id, objectId: r.id, message: `${f.name}: phòng "${r.name}" chưa khép kín` })
    }
    // lối đi (nav.ts): phòng không vào được, lối hẹp, cửa bị đồ chặn, cầu thang bị chặn — cùng luật với người mẫu 3D
    if (f.calibrated)
      for (const i of auditFloor(doc, f, ctx.libraryItems ?? {}))
        out.push({ level: 'warn', code: i.code, floorId: f.id, objectId: i.roomId, message: i.message })
    if (!f.outline || f.outline.length < 3)
      out.push({ level: 'warn', code: 'FLOOR_NO_OUTLINE', floorId: f.id, message: `${f.name} chưa có đường bao, diện tích sàn tính theo hình chữ nhật bao` })
    for (const it of f.items) {
      if (!('modelNode' in it.source)) continue
      const m = ctx.models[it.source.modelNode.modelAssetId]
      if (m?.status === 'ready' && m.report && !m.report.nodeNames.includes(it.source.modelNode.nodeName))
        out.push({ level: 'block', code: 'MODEL_NODE_MISSING', floorId: f.id, objectId: it.id, message: `${f.name}: không còn đối tượng "${it.source.modelNode.nodeName}" trong mô hình` })
    }
    // hai bản (BR-07 mở rộng): điện thoại tải bản nhẹ của đồ, máy tính tải bản đầy đủ
    for (const [variant, budget, label] of [['light', BUDGET, 'bản điện thoại'], ['full', BUDGET_DESKTOP, 'bản máy tính']] as const) {
      const { level, reasons } = levelOf(budgetForFloor(doc, f, ctx, variant), budget)
      if (level === 'block')
        out.push({ level: 'block', code: 'BUDGET_BLOCK', floorId: f.id, message: `${f.name} vượt ngân sách hiển thị — ${label} (${reasons.join(', ')})` })
      else if (level === 'warn')
        out.push({ level: 'warn', code: 'BUDGET_WARN', floorId: f.id, message: `${f.name} gần vượt ngân sách hiển thị — ${label} (${reasons.join(', ')})` })
    }
  }

  for (const id of referencedModels(doc)) {
    const m = ctx.models[id]
    if (!m || m.status === 'processing')
      out.push({ level: 'block', code: 'MODEL_PROCESSING', objectId: id, message: 'Mô hình đang được xử lý' })
    else if (m.status === 'failed')
      out.push({ level: 'block', code: 'MODEL_FAILED', objectId: id, message: 'Mô hình xử lý lỗi, cần tải lại' })
  }

  if (!doc.coverFileId) out.push({ level: 'block', code: 'NO_COVER', message: 'Chưa có ảnh đại diện' })
  if (hasModel3d(doc) && !doc.viewpoints.some((v) => v.isDefault))
    out.push({ level: 'warn', code: 'NO_DEFAULT_VIEWPOINT', message: 'Chưa đặt điểm nhìn mặc định' })
  return out
}

export const hasBlocking = (checks: Check[]) => checks.some((c) => c.level === 'block')

/* ---------- Số điện thoại (BR-09) ---------- */

/** Chuẩn hoá SĐT Việt Nam về dạng 0xxxxxxxxx; trả null nếu không hợp lệ. */
export const normalizePhoneVN = (input: string): string | null => {
  let s = input.replace(/[\s.\-()]/g, '')
  if (s.startsWith('+84')) s = '0' + s.slice(3)
  else if (s.startsWith('84') && s.length === 11) s = '0' + s.slice(2)
  return /^0\d{9}$/.test(s) ? s : null
}

/* ---------- Tài liệu ---------- */

export const emptyFloor = (name: string, order: number, elevation: number, height = 3300): Floor => ({
  id: newId('flr'),
  name,
  order,
  elevation,
  height,
  calibrated: false,
  walls: [],
  openings: [],
  rooms: [],
  stairs: [],
  areas: [],
  items: [],
})

export const emptyDocument = (): HouseDocument => ({
  schemaVersion: 1,
  floors: [emptyFloor('Tầng 1', 1, 0)],
  viewpoints: [],
  lighting: { night: false },
  gallery: [],
})

/** Sao chép tài liệu, đổi mọi id nội bộ và giữ đúng tham chiếu (cửa → tường, cầu thang → tầng, điểm nhìn → tầng/phòng). */
export const cloneDocument = (doc: HouseDocument): HouseDocument => {
  const map = new Map<string, string>()
  const remap = (id: string, prefix: string) => {
    if (!map.has(id)) map.set(id, newId(prefix))
    return map.get(id)!
  }
  for (const f of doc.floors) {
    remap(f.id, 'flr')
    f.walls.forEach((w) => remap(w.id, 'wal'))
    f.rooms.forEach((r) => remap(r.id, 'rom'))
  }
  const m = (id: string | undefined) => (id ? map.get(id) ?? id : undefined)
  const c: HouseDocument = structuredClone(doc)
  for (const f of c.floors) {
    f.id = map.get(f.id)!
    f.walls.forEach((w) => (w.id = map.get(w.id)!))
    f.rooms.forEach((r) => (r.id = map.get(r.id)!))
    f.openings.forEach((o) => {
      o.id = newId('opn')
      o.wallId = map.get(o.wallId) ?? o.wallId
    })
    f.stairs.forEach((s) => {
      s.id = newId('str')
      s.toFloorId = m(s.toFloorId)
    })
    f.areas.forEach((a) => (a.id = newId('are')))
    f.items.forEach((it) => (it.id = newId('itm')))
  }
  c.tour?.scenes.forEach((sc) => {
    sc.id = newId('scn')
    sc.floorId = m(sc.floorId)
    sc.roomId = m(sc.roomId)
  })
  c.viewpoints.forEach((v) => {
    v.id = newId('vpt')
    v.floorId = m(v.floorId)
    v.roomId = m(v.roomId)
  })
  return c
}

/** Sao chép một tầng (FR-03.09): id mới, cao độ đặt trên tầng cao nhất. */
export const duplicateFloor = (doc: HouseDocument, floorId: string, name: string): Floor => {
  const src = doc.floors.find((f) => f.id === floorId)
  if (!src) throw new Error('floor not found')
  const tmp = cloneDocument({ ...doc, floors: [src], viewpoints: [] })
  const f = tmp.floors[0]
  const top = doc.floors.reduce((m, x) => Math.max(m, x.elevation + x.height), 0)
  f.name = name
  f.order = Math.max(...doc.floors.map((x) => x.order)) + 1
  f.elevation = top
  f.stairs.forEach((s) => (s.toFloorId = undefined))
  return f
}

/** Bỏ ảnh nền (tài liệu đầu vào bí mật) trước khi đưa vào snapshot công khai (R-01). */
export const stripUnderlay = (doc: HouseDocument): HouseDocument => ({
  ...doc,
  floors: doc.floors.map(({ underlay: _u, ...f }) => f),
})

export const sortedFloors = (doc: HouseDocument) => [...doc.floors].sort((a, b) => a.elevation - b.elevation || a.order - b.order)

export const libraryItemIds = (doc: HouseDocument): string[] => {
  const ids = new Set<string>()
  for (const f of doc.floors) for (const it of f.items) if ('libraryItemId' in it.source) ids.add(it.source.libraryItemId)
  return [...ids]
}

/** id vật liệu mẫu nhà đang dùng (sàn / tường / trần từng phòng + cửa, bậc thang, mặt ngoài) — item 03. */
export const materialIds = (doc: HouseDocument): string[] => {
  const ids = new Set<string>()
  for (const f of doc.floors) for (const r of f.rooms) for (const v of Object.values(r.finish ?? {})) if (v) ids.add(v)
  for (const v of Object.values(doc.finishes ?? {})) if (v) ids.add(v)
  return [...ids]
}

export const placedItemKind = (it: PlacedItem) => ('libraryItemId' in it.source ? 'library' : 'modelNode')
