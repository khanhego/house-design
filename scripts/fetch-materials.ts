/*
 * Tải ảnh vân cho bộ vật liệu chuẩn (apps/api/src/seed/materialCatalog.ts) từ Poly Haven — CC0, "Powered by Poly Haven".
 * Lấy bản 1k (màu, pháp tuyến, độ nhám), nén lại để repo nhẹ: màu 1024 JPEG q72, pháp tuyến 1024 q80, nhám 512 xám.
 * Kết quả: apps/api/src/seed/materials/<key>/{color,normal,rough}.jpg — commit vào repo để seed / CI chạy không cần mạng.
 *
 * Dùng: node scripts/fetch-materials.ts   (chỉ tải vật liệu chưa có)
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { MATERIAL_CATALOG } from '../apps/api/src/seed/materialCatalog.ts'

const OUT = join(import.meta.dirname, '../apps/api/src/seed/materials')
const MAPS = [
  { from: 'Diffuse', to: 'color', size: 1024, q: 72, grey: false },
  { from: 'nor_gl', to: 'normal', size: 1024, q: 80, grey: false },
  { from: 'Rough', to: 'rough', size: 512, q: 75, grey: true },
] as const

let total = 0
for (const m of MATERIAL_CATALOG) {
  if (!m.polyhaven) continue
  const dir = join(OUT, m.key)
  if (MAPS.every((x) => existsSync(join(dir, `${x.to}.jpg`)))) continue
  mkdirSync(dir, { recursive: true })
  const files = (await (await fetch(`https://api.polyhaven.com/files/${m.polyhaven}`)).json()) as Record<string, Record<string, Record<string, { url: string }>>>
  for (const x of MAPS) {
    const url = files[x.from]?.['1k']?.jpg?.url
    if (!url) throw new Error(`${m.polyhaven}: thiếu ${x.from} 1k`)
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    let img = sharp(buf).resize(x.size, x.size, { fit: 'fill' })
    if (x.grey) img = img.greyscale()
    const out = await img.jpeg({ quality: x.q, mozjpeg: true }).toBuffer()
    writeFileSync(join(dir, `${x.to}.jpg`), out)
    total += out.length
  }
  console.log('✓', m.key, '←', m.polyhaven)
}
console.log(`Xong. Thêm ${(total / 2 ** 20).toFixed(1)} MB.`)
