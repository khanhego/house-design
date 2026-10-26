import { Readable } from 'node:stream'
import sharp from 'sharp'
import type { MaterialMap, ResolvedMaterial } from '@hd/core'
import type { Ctx } from '../context.ts'
import { AppError } from '../lib/errors.ts'
import { fileUrl } from '../repos/types.ts'
import type { Material } from '../repos/types.ts'

/*
 * Vật liệu (item 03, lát R1): ảnh vân 2 cỡ — 1024 (đầy đủ) và 256 (nhẹ, tải trước, FR-13.14). Xoay theo EXIF, bỏ
 * metadata; pháp tuyến giữ màu gốc, độ nhám chuyển xám.
 */

export const TEXTURE_MAX_BYTES = 20 * 2 ** 20

export const saveTexture = async (ctx: Ctx, material: Material, map: MaterialMap, buf: Buffer, originalName: string, userId: string | null) => {
  let full: Buffer
  let small: Buffer
  try {
    const src = sharp(buf, { limitInputPixels: 60_000_000 }).rotate()
    const prep = map === 'rough' ? src.greyscale() : src
    full = await prep.clone().resize(1024, 1024, { fit: 'fill' }).jpeg({ quality: map === 'normal' ? 82 : 76, mozjpeg: true }).toBuffer()
    small = await prep.clone().resize(256, 256, { fit: 'fill' }).jpeg({ quality: 72, mozjpeg: true }).toBuffer()
  } catch {
    throw new AppError(415, 'UNSUPPORTED_FILE', `Không đọc được ảnh ${originalName} (hỏng hoặc lớn hơn 60 megapixel)`)
  }
  const save = async (data: Buffer, suffix: string) => {
    const name = `${material.key}-${map}${suffix}.jpg`
    const key = ctx.storage.newKey('material_texture', name)
    await ctx.storage.putStream(key, Readable.from([data]), data.length + 1)
    return ctx.repos.files.create({ projectId: null, kind: 'material_texture', originalName: name, mime: 'image/jpeg', bytes: data.length, storageKey: key, uploadedBy: userId })
  }
  const f = await save(full, '')
  const s = await save(small, '-256')
  return ctx.repos.materials.setMap(material.id, map, f.id, s.id)
}

/** URL ảnh vân của một vật liệu; `onFile` nhận storage key (snapshot ghi submission_files). */
export const materialMaps = (ctx: Ctx, m: Material, onFile?: (storageKey: string) => void) => {
  const ids = Object.values(m.files).flatMap((x) => [x.full, x.small])
  const fs = ctx.repos.files.byIds(ids)
  const maps: ResolvedMaterial['maps'] = {}
  for (const [k, v] of Object.entries(m.files) as [MaterialMap, { full: string; small: string }][]) {
    const a = fs.get(v.full)
    const b = fs.get(v.small)
    if (!a || !b) continue
    onFile?.(a.storageKey)
    onFile?.(b.storageKey)
    maps[k] = { full: fileUrl(a.storageKey), small: fileUrl(b.storageKey) }
  }
  return maps
}

export const resolveMaterial = (ctx: Ctx, m: Material, onFile?: (storageKey: string) => void): ResolvedMaterial => ({
  key: m.key,
  name: m.name,
  category: m.category,
  tileMm: m.tileMm,
  color: m.color,
  roughness: m.roughness,
  metalness: m.metalness,
  maps: materialMaps(ctx, m, onFile),
})

/** Đủ điều kiện duyệt (BR-R1): có nguồn + giấy phép cho phép; CC BY phải có nội dung ghi công. Dùng cho cả món đồ (lát R2). */
export const approvalProblem = (m: Pick<Material, 'license' | 'sourceKind' | 'sourceName' | 'sourceUrl' | 'attribution' | 'clientId'>): string | null => {
  if (!m.license) return 'Chưa khai giấy phép'
  if (m.sourceKind !== 'in_house' && !m.sourceName && !m.sourceUrl) return 'Chưa khai nguồn (tên kho hoặc đường dẫn gốc)'
  if (m.license === 'cc_by' && !m.attribution?.trim()) return 'Giấy phép CC BY cần nội dung ghi công'
  if (m.license === 'client_exclusive' && !m.clientId) return 'Giấy phép độc quyền của khách phải gắn với một khách hàng'
  return null
}
