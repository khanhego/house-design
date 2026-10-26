/*
 * Xuất bản demo tĩnh cho GitHub Pages: dựng dữ liệu nhà mẫu (seed) trong một thư mục tạm, gọi chính API công khai để
 * lấy JSON + file (ảnh, mô hình), ghi vào apps/web/dist/static-api và apps/web/dist/files. Không đọc dữ liệu thật
 * trong data/ (dữ liệu khách hàng không bao giờ lên bản demo).
 *
 * Dùng: VITE_BASE=/house-design/ VITE_STATIC=1 npm run build && node scripts/export-static.ts
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadConfig } from '../apps/api/src/config.ts'
import { buildApp } from '../apps/api/src/server.ts'
import { seedDemo } from '../apps/api/src/seed/seed.ts'

const BASE = process.env.VITE_BASE ?? '/'
const DIST = join(import.meta.dirname, '../apps/web/dist')
const OUT_API = join(DIST, 'static-api')

const dir = mkdtempSync(join(tmpdir(), 'hd-static-'))
const cfg = loadConfig({ NODE_ENV: 'development', DATA_DIR: dir, PUBLIC_BASE_URL: 'http://localhost' }, { formTokenSecret: 'static-export' })
const built = await buildApp(cfg, { dbFile: ':memory:', logger: false })
const seed = await seedDemo(built.ctx, { adminEmail: 'admin@local.test', adminPassword: 'admin12345' })

const get = async (url: string) => {
  const r = await built.app.inject({ method: 'GET', url, headers: { 'x-requested-with': 'fetch' } })
  if (r.statusCode !== 200) throw new Error(`${url} → ${r.statusCode}`)
  return r
}

const files = new Set<string>()
/** Đường dẫn tuyệt đối trong JSON (/files/…, /v/…) → dưới base của Pages; gom file cần chép. */
const rewrite = (json: unknown) => {
  const text = JSON.stringify(json)
  for (const m of text.matchAll(/"\/files\/([^"?]+)/g)) files.add(m[1])
  return text.replaceAll('"/files/', `"${BASE}files/`).replaceAll('"/v/', `"${BASE}v/`)
}
const write = (rel: string, body: string) => {
  const p = join(OUT_API, `${rel}.json`)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, body)
}

const slug = seed.projectSlug
const project = (await get(`/api/v1/public/projects/${slug}`)).json()
write(`projects/${slug}`, rewrite(project))
write(`projects/${slug}/privacy`, rewrite((await get(`/api/v1/public/projects/${slug}/privacy`)).json()))
const houses: string[] = project.houses.map((h: { slug: string }) => h.slug)
for (const h of houses) write(`projects/${slug}/houses/${h}`, rewrite((await get(`/api/v1/public/projects/${slug}/houses/${h}`)).json()))

for (const key of files) {
  const r = await get(`/files/${key}`)
  const p = join(DIST, 'files', key)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, r.rawPayload)
}

// trang: /v/* dùng viewer.html; Pages trả 404.html cho mọi đường dẫn không có file → SPA chạy được
const viewer = readFileSync(join(DIST, 'viewer.html'), 'utf8').replace('<!--OG-->', `<title>${project.project.name} · Nhà mẫu online</title>`)
writeFileSync(join(DIST, 'viewer.html'), viewer)
writeFileSync(join(DIST, '404.html'), viewer)
writeFileSync(join(DIST, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Nhà mẫu online</title><meta http-equiv="refresh" content="0; url=${BASE}v/${slug}"><a href="${BASE}v/${slug}">Xem nhà mẫu</a>`)
writeFileSync(join(DIST, '.nojekyll'), '')
copyFileSync(join(DIST, 'viewer.html'), join(DIST, 'v.html'))

await built.close()
rmSync(dir, { recursive: true, force: true })
console.log(`Đã xuất bản demo tĩnh: dự án ${slug}, ${houses.length} mẫu nhà (${houses.join(', ')}), ${files.size} file → ${DIST}`)
