import type { HouseDocument, HouseType, ModelReport, Snapshot } from '@hd/core'
import type { Check } from '@hd/core'

export interface ClientRow {
  id: string
  name: string
  logoFileId: string | null
  logoUrl: string | null
  brandColor: string
  contact: { phone?: string | null; zalo?: string | null; email?: string | null; address?: string | null }
  plan: 'unit' | 'project' | 'library' | null
  hostingUntil: string | null
  status: 'active' | 'suspended'
  showPoweredBy: boolean
  projectCount: number
}

export interface UserRow {
  id: string
  email: string
  name: string
  role: 'admin' | 'producer' | 'approver'
  status: 'invited' | 'active' | 'disabled'
  clientId: string | null
  clientName: string | null
}

export interface VersionRef {
  id: string
  number: number
  state: string
  revision?: number
}

export interface HouseRow {
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
  price?: number | null
  landArea?: number | null
  features?: string[]
  publishedVersionId: string | null
  latestVersion: VersionRef | null
  published: { versionId: string; number: number; publishedAt: string | null } | null
  openVersionId: string | null
  coverUrl: string | null
}

export interface ProjectRow {
  id: string
  clientId: string
  clientName: string | null
  slug: string
  slugLocked: boolean
  name: string
  location: string | null
  description: string | null
  coverFileId: string | null
  coverUrl: string | null
  contact: { phone?: string | null; zalo?: string | null; leadEmails?: string[] }
  disclaimer: string | null
  privacyPolicy: string | null
  status: 'active' | 'unavailable'
  publicUrl: string
  houses?: { id: string; slug: string; name: string; houseType: HouseType; coverUrl: string | null; latestVersion: VersionRef | null; published: { versionId: string; number: number } | null }[]
}

export interface FileOut {
  id: string
  kind: string
  originalName: string
  mime: string
  bytes: number
  url: string
  createdAt: string
  uploadedByName?: string | null
}

export interface ReviewOut {
  id: string
  decision: 'approved' | 'changes_requested'
  note: string | null
  targets: { floorId: string; roomId?: string }[]
  userName: string | null
  onBehalf: boolean
  evidenceUrl: string | null
  createdAt: string
}

export interface SubmissionOut {
  id: string
  seq: number
  submittedAt: string
  submittedByName: string | null
  withdrawnAt: string | null
  snapshotHash: string
  reviews: ReviewOut[]
}

export interface VersionDetail {
  id: string
  houseId: string
  number: number
  state: string
  revision: number
  document: HouseDocument
  checks: Check[]
  submissions: SubmissionOut[]
}

export interface ModelOut {
  id: string
  status: 'processing' | 'ready' | 'failed'
  url: string | null
  report: ModelReport | null
  level: 'ok' | 'warn' | 'block' | null
  reasons: string[]
  error: string | null
  originalName: string | null
  /** đồ chân thực (item 03 lát R2) */
  lightUrl?: string | null
  lightReport?: ModelReport | null
  normalize?: {
    unit: 'auto' | 'm' | 'cm' | 'mm' | 'in'
    upAxis: 'auto' | 'y' | 'z'
    declaredMm: [number, number, number] | null
    result?: { format: string; scale: number; unit: 'm' | 'cm' | 'mm' | 'in'; upAxis: 'y' | 'z'; measuredMm: [number, number, number]; notes: string[] }
  } | null
}

export interface LibraryRow {
  id: string
  name: string
  category: string
  sizeMm: [number, number, number]
  material: string | null
  brand: string | null
  description: string | null
  imageFileIds: string[]
  imageUrls: string[]
  modelAssetId: string | null
  fallbackShape: string | null
  variants: { id: string; name: string; color: string }[]
  model: { id: string; status: string; level: string | null; url: string | null; lightUrl?: string | null; normalized?: boolean } | null
  // item 03 lát R2
  productCode: string | null
  sourceKind: MaterialRow['sourceKind']
  sourceName: string | null
  sourceUrl: string | null
  license: MaterialRow['license']
  attribution: string | null
  clientId: string | null
  clientName: string | null
  status: MaterialRow['status']
  sizeAccepted: boolean
  measuredMm: [number, number, number] | null
  sizeDeviation: number | null
}

export type { Snapshot }

/** Vật liệu (item 03, API-M1). */
export interface MaterialRow {
  id: string
  key: string
  name: string
  category: import('@hd/core').MaterialCategory
  tileMm: [number, number]
  color: string
  roughness: number
  metalness: number
  maps: Partial<Record<import('@hd/core').MaterialMap, { full: string; small: string }>>
  sourceKind: 'free_library' | 'ai' | 'client_file' | 'in_house'
  sourceName: string | null
  sourceUrl: string | null
  license: 'cc0' | 'cc_by' | 'commercial' | 'client_exclusive' | null
  attribution: string | null
  clientId: string | null
  status: 'draft' | 'ready' | 'retired'
  approvedAt: string | null
}
