import sharp from 'sharp'
import { escapeXml, planSvg, sortedFloors } from '@hd/core'
import type { HouseDocument } from '@hd/core'
import type { Ctx } from '../context.ts'
import { hashPassword } from '../lib/auth.ts'
import type { AuthUser } from '../services/access.ts'
import { publish, review, submit } from '../services/workflow.ts'
import { demoHouses, LIBRARY } from './demoHouses.ts'

const DEMO_PASSWORD = 'admin12345'

const ensureUser = async (ctx: Ctx, email: string, name: string, role: 'admin' | 'producer' | 'approver', password: string, clientId: string | null = null) => {
  const found = ctx.repos.users.byEmail(email)
  if (found) return found
  return ctx.repos.users.create({ email, name, role, clientId, status: 'active', passwordHash: await hashPassword(password) })
}

const storePng = async (ctx: Ctx, svg: string, name: string, kind: 'logo' | 'cover', projectId: string | null) => {
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  const key = ctx.storage.newKey(kind, name)
  await ctx.storage.putBuffer(key, png)
  return ctx.repos.files.create({ projectId, kind, originalName: name, mime: 'image/png', bytes: png.byteLength, storageKey: key, uploadedBy: null })
}

const logoSvg = (name: string, color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120">
  <rect x="8" y="12" width="96" height="96" rx="20" fill="${color}"/>
  <path d="M30 78 L56 40 L82 78 Z" fill="#fff"/><circle cx="74" cy="42" r="9" fill="#ffd27a"/>
  <text x="124" y="74" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="700" fill="#1f2a2a">${escapeXml(name)}</text>
</svg>`

/** Ảnh đại diện từ mặt bằng tầng đầu (người dựng thay bằng ảnh chụp 3D ở A3). */
const coverSvg = (doc: HouseDocument, title: string, color: string) => {
  const floor = sortedFloors(doc)[0]
  const plan = planSvg(floor, { scaleDenominator: 120, showDimensions: false })
  const inner = plan.svg.replace('<svg ', '<svg x="60" y="40" width="1080" height="600" preserveAspectRatio="xMidYMid meet" ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#f4f1ec"/>
  ${inner}
  <rect x="0" y="680" width="1200" height="120" fill="${color}"/>
  <text x="60" y="752" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="700" fill="#fff">${escapeXml(title)}</text>
</svg>`
}

export interface SeedResult {
  adminId: string
  clientId: string
  projectId: string
  projectSlug: string
  houseIds: string[]
  approverEmail: string
}

/** Dữ liệu demo theo AC-01. Idempotent: dự án đã có thì bỏ qua. */
export const seedDemo = async (ctx: Ctx, opts: { adminEmail: string; adminPassword: string; slug?: string } ): Promise<SeedResult> => {
  const slug = opts.slug ?? 'sunrise-garden'
  const admin = await ensureUser(ctx, opts.adminEmail, 'Quản trị viên', 'admin', opts.adminPassword)
  await ensureUser(ctx, 'dung@local.test', 'Người dựng Dũng', 'producer', DEMO_PASSWORD)

  const existing = ctx.repos.projects.bySlug(slug)
  if (existing) {
    return {
      adminId: admin.id, clientId: existing.clientId, projectId: existing.id, projectSlug: slug,
      houseIds: ctx.repos.houses.listByProject(existing.id).map((h) => h.id), approverEmail: 'duyet@sunrise.local',
    }
  }

  const libIds: Record<string, string> = {}
  const sizes: Record<string, [number, number, number]> = {}
  for (const { key, ...item } of LIBRARY) {
    const found = ctx.repos.library.list({ q: item.name }).find((i) => i.name === item.name)
    const it = found ?? ctx.repos.library.create(item)
    libIds[key] = it.id
    sizes[key] = it.sizeMm
  }

  const color = '#0E6B5C'
  const logo = await storePng(ctx, logoSvg('Sunrise Land', color), 'sunrise-logo.png', 'logo', null)
  const hostingUntil = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)
  const client = ctx.repos.clients.create({
    name: 'Sunrise Land',
    logoFileId: logo.id,
    brandColor: color,
    contact: { phone: '0901234567', zalo: '0901234567', email: 'sales@sunrise.local', address: 'TP. Bắc Giang' },
    plan: 'project',
    hostingUntil,
  })
  await ensureUser(ctx, 'duyet@sunrise.local', 'Lan (Sunrise Land)', 'approver', DEMO_PASSWORD, client.id)

  const project = ctx.repos.projects.create({
    clientId: client.id,
    slug,
    name: 'Sunrise Garden',
    location: 'TP. Bắc Giang',
    description: 'Khu nhà ở ven sông gồm căn hộ, nhà phố, biệt thự sân vườn và nhà vườn. Xem từng mẫu nhà 3D, mặt bằng có kích thước và nội thất đề xuất.',
    contact: { phone: '0901234567', zalo: '0901234567', leadEmails: ['sales@sunrise.local'] },
  })

  const actor: AuthUser = { id: admin.id, name: admin.name, email: admin.email, role: 'admin', clientId: null }
  const houseIds: string[] = []
  const demos = demoHouses(libIds, sizes)
  for (const [i, d] of demos.entries()) {
    const house = ctx.repos.houses.create({
      projectId: project.id, slug: d.slug, name: d.name, houseType: d.houseType, declaredArea: d.declaredArea,
      bedrooms: d.bedrooms, bathrooms: d.bathrooms, description: d.description, sortOrder: i,
    })
    const cover = await storePng(ctx, coverSvg(d.document, d.name, color), `${d.slug}-cover.png`, 'cover', project.id)
    const v = ctx.repos.versions.create(house.id, 1, { ...d.document, coverFileId: cover.id })
    submit(ctx, v.id, actor)
    review(ctx, v.id, actor, { decision: 'approved', note: 'Dữ liệu mẫu — duyệt nội bộ khi khởi tạo hệ thống' }, { evidenceFileId: null })
    publish(ctx, v.id, actor)
    houseIds.push(house.id)
  }
  if (!project.coverFileId) {
    const firstCover = JSON.parse(ctx.repos.versions.latest(houseIds[2])!.document).coverFileId as string
    const f = ctx.repos.files.get(firstCover)!
    ctx.repos.projects.update(project.id, { coverFileId: f.id })
  }
  return { adminId: admin.id, clientId: client.id, projectId: project.id, projectSlug: slug, houseIds, approverEmail: 'duyet@sunrise.local' }
}

/* CLI: `npm run seed` */
if (import.meta.filename === process.argv[1]) {
  const { loadConfig } = await import('../config.ts')
  const { buildApp } = await import('../server.ts')
  const cfg = loadConfig(process.env, { runJobs: false })
  if (!cfg.seedAdminEmail || !cfg.seedAdminPassword) throw new Error('Cần SEED_ADMIN_EMAIL và SEED_ADMIN_PASSWORD')
  const { ctx, close } = await buildApp(cfg, { logger: false })
  const r = await seedDemo(ctx, { adminEmail: cfg.seedAdminEmail, adminPassword: cfg.seedAdminPassword })
  console.log(`Đã seed dự án /v/${r.projectSlug} (${r.houseIds.length} mẫu nhà). Đăng nhập studio: ${cfg.seedAdminEmail}`)
  await close()
}
