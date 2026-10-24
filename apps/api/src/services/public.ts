import { DEFAULT_DISCLAIMER, floorHasContent, hasModel3d, hasTour, sortedFloors } from '@hd/core'
import type { Branding, PublicHouseCard, PublicHousePayload, PublicProjectInfo, PublicProjectPayload, Snapshot } from '@hd/core'
import { AppError, notFound } from '../lib/errors.ts'
import { fileUrl } from '../repos/types.ts'
import type { Client, House, Project } from '../repos/types.ts'
import type { Ctx, OgData } from '../context.ts'
import { availability, hasContract } from './access.ts'
import { publicResolved } from './snapshot.ts'

export const branding = (ctx: Ctx, client: Client): Branding => {
  const logo = client.logoFileId ? ctx.repos.files.get(client.logoFileId) : undefined
  return { name: client.name, logoUrl: logo ? fileUrl(logo.storageKey) : null, brandColor: client.brandColor, showPoweredBy: client.showPoweredBy }
}

export const projectInfo = (ctx: Ctx, p: Project): PublicProjectInfo => {
  const cover = p.coverFileId ? ctx.repos.files.get(p.coverFileId) : undefined
  return {
    slug: p.slug,
    name: p.name,
    location: p.location,
    description: p.description,
    coverUrl: cover ? fileUrl(cover.storageKey) : null,
    disclaimer: p.disclaimer?.trim() || DEFAULT_DISCLAIMER,
    contact: { phone: p.contact.phone ?? null, zalo: p.contact.zalo ?? null },
    hasLeadForm: true,
    privacyPolicyUrl: `/v/${p.slug}/chinh-sach-du-lieu`,
  }
}

const unavailable = (ctx: Ctx, client: Client | undefined) => {
  const contact = hasContract(client) && client
    ? { name: client.name, phone: client.contact.phone ?? null, email: client.contact.email ?? null }
    : null
  return new AppError(410, 'PROJECT_UNAVAILABLE', 'Nội dung này hiện không còn hiển thị.', { extra: { contact } })
}

const loadAvailableProject = (ctx: Ctx, slug: string) => {
  const project = ctx.repos.projects.bySlug(slug)
  if (!project) throw notFound()
  const client = ctx.repos.clients.get(project.clientId)
  if (!availability(client, project).available) throw unavailable(ctx, client)
  return { project, client: client! }
}

/** Snapshot của submission đã được duyệt thuộc version đang phát hành. */
export const publishedSnapshot = (ctx: Ctx, house: House): { snapshot: Snapshot; versionNumber: number; publishedAt: string | null } | null => {
  if (!house.publishedVersionId) return null
  const v = ctx.repos.versions.get(house.publishedVersionId)
  if (!v || v.state !== 'published' || !v.currentSubmissionId) return null
  const s = ctx.repos.submissions.get(v.currentSubmissionId)!
  return { snapshot: JSON.parse(s.snapshot) as Snapshot, versionNumber: v.number, publishedAt: v.publishedAt }
}

export const publicProject = (ctx: Ctx, slug: string): PublicProjectPayload => {
  const { project, client } = loadAvailableProject(ctx, slug)
  const houses: PublicHouseCard[] = []
  for (const h of ctx.repos.houses.listByProject(project.id)) {
    const pub = publishedSnapshot(ctx, h)
    if (!pub) continue
    const s = pub.snapshot
    houses.push({
      slug: h.slug,
      name: s.house.name,
      houseType: s.house.houseType,
      declaredArea: s.house.declaredArea,
      bedrooms: s.house.bedrooms,
      bathrooms: s.house.bathrooms,
      floors: s.document.floors.filter(floorHasContent).length,
      coverUrl: s.document.coverFileId ? s.resolved.files[s.document.coverFileId] ?? null : null,
      modes: [...(hasModel3d(s.document) ? (['3d'] as const) : []), ...(hasTour(s.document) ? (['tour'] as const) : [])],
    })
  }
  return {
    project: projectInfo(ctx, project),
    branding: branding(ctx, client),
    antiBot: { formToken: ctx.forms.issue(), turnstileSiteKey: ctx.cfg.turnstileSiteKey },
    houses,
  }
}

export const publicHouse = (ctx: Ctx, slug: string, houseSlug: string): PublicHousePayload => {
  const { project, client } = loadAvailableProject(ctx, slug)
  const house = ctx.repos.houses.bySlug(project.id, houseSlug)
  const pub = house ? publishedSnapshot(ctx, house) : null
  if (!house || !pub) throw notFound()
  return {
    project: projectInfo(ctx, project),
    branding: branding(ctx, client),
    antiBot: { formToken: ctx.forms.issue(), turnstileSiteKey: ctx.cfg.turnstileSiteKey },
    house: { ...pub.snapshot.house, slug: house.slug },
    version: { number: pub.versionNumber, publishedAt: pub.publishedAt },
    document: { ...pub.snapshot.document, floors: sortedFloors(pub.snapshot.document) },
    resolved: publicResolved(pub.snapshot),
  }
}

export const privacyPolicy = (ctx: Ctx, slug: string) => {
  const { project, client } = loadAvailableProject(ctx, slug)
  return { project: projectInfo(ctx, project), branding: branding(ctx, client), policy: project.privacyPolicy }
}

/** Thẻ OG cho /v/:slug(/:house) — lỗi hoặc không khả dụng thì không chèn. */
export const ogFor = (ctx: Ctx, path: string): OgData | null => {
  const m = path.match(/^\/v\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?\/?$/)
  if (!m) return null
  const base = ctx.cfg.publicBaseUrl
  try {
    if (m[2] && m[2] !== 'chinh-sach-du-lieu') {
      const h = publicHouse(ctx, m[1], m[2])
      const cover = h.document.coverFileId ? h.resolved.files[h.document.coverFileId] : null
      return {
        title: `${h.house.name} · ${h.project.name}`,
        description: `Xem nhà 3D và mặt bằng ${h.house.name}${h.house.declaredArea ? ` · ${h.house.declaredArea} m²` : ''}. ${h.branding.name}`,
        image: cover ? base + cover : null,
        url: base + path,
      }
    }
    const p = publicProject(ctx, m[1])
    return {
      title: p.project.name,
      description: p.project.description ?? `Xem nhà mẫu 3D của ${p.branding.name}`,
      image: p.project.coverUrl ? base + p.project.coverUrl : null,
      url: base + path,
    }
  } catch {
    return null
  }
}
