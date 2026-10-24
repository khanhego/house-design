import { z } from 'zod'

/** Mọi độ dài, cao độ, toạ độ: mm. Mặt bằng: x sang phải, y xuống dưới. Góc: độ. */

const id = z.string().min(1).max(64)
const mm = z.number().finite()
const positiveMm = z.number().finite().positive().max(200_000)

export const PointSchema = z.tuple([mm, mm])
export type Point = z.infer<typeof PointSchema>

export const ROOM_FUNCTIONS = [
  'living', 'kitchen', 'dining', 'bedroom', 'bathroom', 'wc', 'study', 'worship',
  'laundry', 'storage', 'garage', 'hall', 'stair', 'other',
] as const
export const OUTDOOR_KINDS = ['yard', 'garden', 'pool', 'terrace', 'balcony', 'loggia'] as const
export const HOUSE_TYPES = ['apartment', 'townhouse', 'villa', 'cottage'] as const
export const ITEM_CATEGORIES = [
  'sofa', 'chair', 'table', 'bed', 'storage', 'kitchen', 'appliance', 'bath',
  'lighting', 'decor', 'plant', 'rug', 'other',
] as const
export const FALLBACK_SHAPES = [
  'sofa', 'sofaL', 'armchair', 'coffeeTable', 'tvStand', 'rug', 'floorLamp', 'plant', 'bookshelf',
  'diningTable', 'chair', 'kitchen', 'fridge', 'bed', 'nightstand', 'wardrobe', 'desk', 'officeChair',
  'vanity', 'toilet', 'shower',
] as const
export const INTERESTS = ['live', 'invest', 'interior', 'other'] as const
export const PLANS = ['unit', 'project', 'library'] as const
export const FILE_KINDS = [
  'input', 'logo', 'cover', 'gallery_image', 'library_image', 'item_image',
  'model_original', 'model_optimized', 'evidence', 'tour_image', 'tour_clip',
] as const
export const VERSION_STATES = ['draft', 'pending_review', 'approved', 'published', 'superseded', 'unpublished'] as const
export const EVENT_TYPES = [
  'project_open', 'house_open', 'floor_select', 'room_select', 'walk_mode', 'item_open',
  'plan_open', 'pdf_download', 'contact_click', 'lead_submit', 'fallback_shown',
  'tour_open', 'tour_scene', 'tour_complete',
] as const

export type RoomFunction = (typeof ROOM_FUNCTIONS)[number]
export type HouseType = (typeof HOUSE_TYPES)[number]
export type ItemCategory = (typeof ITEM_CATEGORIES)[number]
export type FallbackShape = (typeof FALLBACK_SHAPES)[number]
export type VersionState = (typeof VERSION_STATES)[number]
export type EventType = (typeof EVENT_TYPES)[number]

export const MAX_FLOORS = 10
export const MAX_GALLERY = 12

export const WallSchema = z.object({
  id,
  a: PointSchema,
  b: PointSchema,
  thickness: positiveMm,
  height: positiveMm.optional(),
})

export const OpeningSchema = z.object({
  id,
  wallId: id,
  kind: z.enum(['door', 'window']),
  offset: z.number().finite().min(0),
  width: positiveMm,
  height: positiveMm,
  sill: z.number().finite().min(0),
  hinge: z.enum(['start', 'end']),
  swing: z.enum(['left', 'right']),
})

const PolygonSchema = z.array(PointSchema).max(500)

export const RoomSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  function: z.enum(ROOM_FUNCTIONS),
  polygon: PolygonSchema,
})

export const StairSchema = z.object({
  id,
  polygon: PolygonSchema,
  upDirection: z.number().finite(),
  toFloorId: id.optional(),
  /** thẳng (mặc định) hoặc chữ U có chiếu nghỉ — vào / ra cùng một phía, xếp chồng các tầng được */
  shape: z.enum(['straight', 'u']).optional(),
})

export const OutdoorAreaSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  kind: z.enum(OUTDOOR_KINDS),
  polygon: PolygonSchema,
})

export const ModelRefSchema = z.object({
  modelAssetId: id,
  offset: z.tuple([mm, mm, mm]),
  rotation: z.number().finite(),
  scale: z.number().finite().positive(),
})

export const ItemInfoSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(ITEM_CATEGORIES),
  sizeMm: z.tuple([positiveMm, positiveMm, positiveMm]),
  material: z.string().max(300).optional(),
  brand: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  imageFileIds: z.array(id).max(12).optional(),
})

export const PlacedItemSchema = z.object({
  id,
  source: z.union([
    z.object({ libraryItemId: id }),
    z.object({ modelNode: z.object({ modelAssetId: id, nodeName: z.string().min(1).max(200) }) }),
  ]),
  info: ItemInfoSchema.partial().optional(),
  position: PointSchema,
  elevation: mm,
  rotation: z.number().finite(),
  variantId: z.string().max(64).optional(),
})

export const UnderlaySchema = z.object({
  fileId: id,
  page: z.number().int().min(1).optional(),
  mmPerPx: z.number().finite().positive(),
  offset: PointSchema,
  rotation: z.number().finite(),
  opacity: z.number().min(0).max(1),
})

export const FloorSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  order: z.number().int(),
  elevation: mm,
  height: positiveMm,
  underlay: UnderlaySchema.optional(),
  calibrated: z.boolean(),
  outline: PolygonSchema.optional(),
  walls: z.array(WallSchema).max(2000),
  openings: z.array(OpeningSchema).max(1000),
  rooms: z.array(RoomSchema).max(200),
  stairs: z.array(StairSchema).max(20),
  areas: z.array(OutdoorAreaSchema).max(50),
  modelRef: ModelRefSchema.optional(),
  items: z.array(PlacedItemSchema).max(1000),
})

export const ViewpointSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  kind: z.enum(['overview', 'facade', 'room']),
  floorId: id.optional(),
  roomId: id.optional(),
  position: z.tuple([mm, mm, mm]),
  target: z.tuple([mm, mm, mm]),
  isDefault: z.boolean(),
})

/* Tham quan ảnh thật (item 02, FR-12.*) */
export const MAX_TOUR_SCENES = 60
/** Chương của hành trình (CR-3, FR-12.17) — thứ tự cố định */
// kịch bản đi từ trong ra ngoài (CR-4): bên trong → sân vườn & hồ bơi → ngoài nhà nhìn lại toàn cảnh
export const TOUR_CHAPTERS = ['interior', 'outdoor', 'exterior'] as const
export type TourChapter = (typeof TOUR_CHAPTERS)[number]
export const TOUR_CHAPTER_LABEL: Record<TourChapter, string> = { exterior: 'Ngoài nhà', interior: 'Bên trong', outdoor: 'Sân vườn & hồ bơi' }
const unit = z.number().finite().min(0).max(1)
export const TourSceneSchema = z.object({
  id,
  fileId: id,
  smallFileId: id,
  // để trống được khi đang dựng (tự lưu không hỏng); gửi duyệt mới bắt buộc (BR-T1)
  title: z.string().trim().max(80),
  description: z.string().max(300).optional(),
  highlights: z.array(z.string().trim().min(1).max(60)).max(3),
  next: z.tuple([unit, unit]).optional(),
  floorId: id.optional(),
  roomId: id.optional(),
  clipFileId: id.optional(),
  clipSource: z.enum(['upload', 'ai']).optional(),
  chapter: z.enum(TOUR_CHAPTERS).optional(),
})
export const TourSchema = z.object({
  autoplaySec: z.number().int().min(2).max(15),
  scenes: z.array(TourSceneSchema).max(MAX_TOUR_SCENES),
})

export const HouseDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  floors: z.array(FloorSchema).max(MAX_FLOORS),
  exterior: z.object({ modelRef: ModelRefSchema.optional() }).optional(),
  wholeModel: ModelRefSchema.optional(),
  viewpoints: z.array(ViewpointSchema).max(50),
  lighting: z.object({ night: z.boolean() }),
  coverFileId: id.optional(),
  gallery: z.array(id).max(MAX_GALLERY),
  tour: TourSchema.optional(),
})

export type Wall = z.infer<typeof WallSchema>
export type Opening = z.infer<typeof OpeningSchema>
export type Room = z.infer<typeof RoomSchema>
export type Stair = z.infer<typeof StairSchema>
export type OutdoorArea = z.infer<typeof OutdoorAreaSchema>
export type ModelRef = z.infer<typeof ModelRefSchema>
export type ItemInfo = z.infer<typeof ItemInfoSchema>
export type PlacedItem = z.infer<typeof PlacedItemSchema>
export type Underlay = z.infer<typeof UnderlaySchema>
export type Floor = z.infer<typeof FloorSchema>
export type Viewpoint = z.infer<typeof ViewpointSchema>
export type HouseDocument = z.infer<typeof HouseDocumentSchema>
export type TourScene = z.infer<typeof TourSceneSchema>
export type Tour = z.infer<typeof TourSchema>

/* ---------- Dữ liệu đã giải sẵn (snapshot) và payload công khai ---------- */

export interface Variant {
  id: string
  name: string
  color: string
}

export interface ResolvedLibraryItem {
  name: string
  category: ItemCategory
  sizeMm: [number, number, number]
  material?: string
  brand?: string
  description?: string
  imageUrls: string[]
  variants: Variant[]
  modelUrl: string | null
  modelAssetId: string | null
  fallbackShape: FallbackShape | null
}

export interface Bbox3 {
  min: [number, number, number]
  max: [number, number, number]
}

export interface ModelReport {
  triangles: number
  drawCalls: number
  textureBytes: number
  fileBytes: number
  bbox: Bbox3
  nodeNames: string[]
}

export interface ResolvedModel {
  url: string
  bbox: Bbox3
  report?: ModelReport
}

export interface HouseMeta {
  name: string
  houseType: HouseType
  declaredArea: number
  bedrooms: number
  bathrooms: number
  description: string | null
  /** giá bán (₫), null = "liên hệ" (CR-3, FR-12.21) — có thể thiếu ở snapshot cũ */
  price?: number | null
  /** diện tích đất (m²) */
  landArea?: number | null
  /** điểm nổi bật của căn nhà (≤ 6) */
  features?: string[]
}

export interface Snapshot {
  document: HouseDocument
  house: HouseMeta
  resolved: {
    libraryItems: Record<string, ResolvedLibraryItem>
    models: Record<string, ResolvedModel>
    files: Record<string, string>
  }
}

export interface Branding {
  name: string
  logoUrl: string | null
  brandColor: string
  showPoweredBy: boolean
}

export interface PublicProjectInfo {
  slug: string
  name: string
  location: string | null
  description: string | null
  coverUrl: string | null
  disclaimer: string
  contact: { phone: string | null; zalo: string | null }
  hasLeadForm: boolean
  privacyPolicyUrl: string
}

export interface AntiBot {
  formToken: string
  turnstileSiteKey: string | null
}

export interface PublicHousePayload {
  project: PublicProjectInfo
  branding: Branding
  antiBot?: AntiBot
  house: HouseMeta & { slug: string }
  version: { number: number; publishedAt: string | null }
  document: HouseDocument
  resolved: Snapshot['resolved']
  preview?: { versionNumber: number; state: VersionState; submissionId: string | null; submittedAt: string | null; submittedByName: string | null }
}

export interface PublicHouseCard {
  slug: string
  name: string
  houseType: HouseType
  declaredArea: number
  bedrooms: number
  bathrooms: number
  floors: number
  coverUrl: string | null
  /** giá bán đã duyệt (CR-3) */
  price: number | null
  /** chế độ xem có trong bản phát hành (FR-06.01, CR-2) */
  modes: ('3d' | 'tour')[]
}

export interface PublicProjectPayload {
  project: PublicProjectInfo
  branding: Branding
  antiBot: AntiBot
  houses: PublicHouseCard[]
}
