import type { FallbackShape, HouseType, ItemCategory, MaterialCategory, MaterialMap, ModelReport, Variant, VersionState } from '@hd/core'

export type Role = 'admin' | 'producer' | 'approver'

export interface Client {
  id: string
  name: string
  logoFileId: string | null
  brandColor: string
  contact: { phone?: string | null; zalo?: string | null; email?: string | null; address?: string | null }
  plan: 'unit' | 'project' | 'library' | null
  hostingUntil: string | null
  status: 'active' | 'suspended'
  showPoweredBy: boolean
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  email: string
  name: string
  role: Role
  clientId: string | null
  passwordHash: string | null
  status: 'invited' | 'active' | 'disabled'
  failedLogins: number
  lockedUntil: string | null
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  clientId: string
  slug: string
  slugLocked: boolean
  name: string
  location: string | null
  description: string | null
  coverFileId: string | null
  contact: { phone?: string | null; zalo?: string | null; leadEmails?: string[] }
  disclaimer: string | null
  privacyPolicy: string | null
  status: 'active' | 'unavailable'
  createdAt: string
  updatedAt: string
}

export interface House {
  id: string
  projectId: string
  slug: string
  slugLocked: boolean
  name: string
  houseType: HouseType
  declaredArea: number
  bedrooms: number
  bathrooms: number
  description: string | null
  /** giá bán ₫ (CR-3) */
  price: number | null
  /** diện tích đất m² */
  landArea: number | null
  features: string[]
  publishedVersionId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Version {
  id: string
  houseId: string
  number: number
  state: VersionState
  document: string
  revision: number
  currentSubmissionId: string | null
  publishedAt: string | null
  publishedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface Submission {
  id: string
  versionId: string
  seq: number
  snapshot: string
  snapshotHash: string
  submittedAt: string
  submittedBy: string
  withdrawnAt: string | null
  withdrawnBy: string | null
  remindedAt: string | null
}

export interface Review {
  id: string
  submissionId: string
  versionId: string
  decision: 'approved' | 'changes_requested'
  note: string | null
  targets: { floorId: string; roomId?: string }[]
  userId: string
  onBehalf: boolean
  evidenceFileId: string | null
  snapshotHash: string
  createdAt: string
}

export interface ModelAsset {
  id: string
  projectId: string | null
  originalFileId: string
  optimizedFileId: string | null
  status: 'processing' | 'ready' | 'failed'
  error: string | null
  report: ModelReport | null
  level: 'ok' | 'warn' | 'block' | null
  reasons: string[]
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface LibraryItem {
  id: string
  name: string
  category: ItemCategory
  sizeMm: [number, number, number]
  material: string | null
  brand: string | null
  description: string | null
  imageFileIds: string[]
  modelAssetId: string | null
  fallbackShape: FallbackShape | null
  variants: Variant[]
  archived: boolean
  createdAt: string
  updatedAt: string
}

export type MaterialStatus = 'draft' | 'ready' | 'retired'
export type MaterialSourceKind = 'free_library' | 'ai' | 'client_file' | 'in_house'
export type MaterialLicense = 'cc0' | 'cc_by' | 'commercial' | 'client_exclusive'

/** Vật liệu (item 03, migration 004). Mỗi ảnh vân có 2 cỡ: 1024 (đầy đủ) và 256 (nhẹ, tải trước). */
export interface Material {
  id: string
  key: string
  name: string
  category: MaterialCategory
  tileMm: [number, number]
  color: string
  roughness: number
  metalness: number
  files: Partial<Record<MaterialMap, { full: string; small: string }>>
  sourceKind: MaterialSourceKind
  sourceName: string | null
  sourceUrl: string | null
  license: MaterialLicense | null
  attribution: string | null
  clientId: string | null
  status: MaterialStatus
  approvedBy: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

export type FileKind =
  | 'input' | 'logo' | 'cover' | 'gallery_image' | 'library_image' | 'item_image'
  | 'model_original' | 'model_optimized' | 'evidence' | 'tour_image' | 'tour_clip' | 'material_texture'

export interface FileRow {
  id: string
  projectId: string | null
  kind: FileKind
  originalName: string
  mime: string
  bytes: number
  storageKey: string
  uploadedBy: string | null
  createdAt: string
}

export interface Lead {
  id: string
  projectId: string
  houseId: string | null
  name: string | null
  phone: string
  email: string | null
  interest: 'live' | 'invest' | 'interior' | 'other' | null
  message: string | null
  consentAt: string
  context: { floorId?: string; roomId?: string }
  source: 'link' | 'qr' | 'embed'
  deviceId: string | null
  contactCount: number
  status: 'new' | 'contacted'
  createdAt: string
  lastContactAt: string
}

export const fileUrl = (storageKey: string) => `/files/${storageKey}`
