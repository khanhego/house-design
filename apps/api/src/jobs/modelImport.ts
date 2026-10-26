import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, normalize, relative } from 'node:path'
import type { Document, NodeIO } from '@gltf-transform/core'
import { unzipSync } from 'fflate'

/*
 * Đọc mô hình về Document của gltf-transform (item 03 lát R2, R2.2):
 * - `.glb` / `.gltf`: gltf-transform đọc trực tiếp;
 * - `.fbx` / `.obj`: assimpjs (assimp WASM) chuyển sang GLB 2.0 trong bộ nhớ (DEC-R14);
 * - `.zip`: giải nén vào thư mục tạm (giới hạn số tệp, dung lượng, chặn `..`), chọn tệp chính glb → gltf → fbx → obj.
 */

export const MODEL_EXTS = ['glb', 'gltf', 'fbx', 'obj', 'zip'] as const
const MAIN_ORDER = ['glb', 'gltf', 'fbx', 'obj']
const ZIP_MAX_FILES = 300
const ZIP_MAX_BYTES = 400 * 2 ** 20

const BAD_FILE = 'Không đọc được tệp mô hình. Hãy xuất lại dạng GLB, FBX hoặc OBJ (kèm MTL và ảnh texture, nén chung một tệp .zip).'

type Assimp = {
  FileList: new () => { AddFile: (name: string, data: Uint8Array) => void }
  ConvertFileList: (list: unknown, format: string) => { IsSuccess: () => boolean; GetErrorCode: () => string; FileCount: () => number; GetFile: (i: number) => { GetContent: () => Uint8Array } }
}
let assimp: Promise<Assimp> | null = null
const loadAssimp = () => (assimp ??= import('assimpjs').then((m) => (m.default as () => Promise<Assimp>)()))

/** FBX/OBJ (+ tệp kèm: MTL, texture — tên tệp là khoá, assimp tìm theo tên) → GLB. */
const convertWithAssimp = async (main: string, extra: { name: string; data: Uint8Array }[]) => {
  const ajs = await loadAssimp()
  const list = new ajs.FileList()
  list.AddFile(basename(main), new Uint8Array(readFileSync(main)))
  for (const f of extra) list.AddFile(f.name, f.data)
  const r = ajs.ConvertFileList(list, 'glb2')
  if (!r.IsSuccess() || r.FileCount() < 1) throw new Error(`assimp: ${r.GetErrorCode()}`)
  return r.GetFile(0).GetContent()
}

/** PNG trắng 1 × 1 — thay ảnh texture không tìm thấy. */
const WHITE_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

/**
 * GLB của assimp trỏ ảnh texture ra ngoài (đường dẫn trong MTL/FBX, có khi là đường dẫn tuyệt đối của máy dựng).
 * Tìm ảnh theo tên tệp trong các tệp kèm; không thấy → ảnh trắng + cảnh báo. Trả JSONDocument cho `io.readJSON`.
 */
const resolveAssimpGlb = (glb: Uint8Array, extra: { name: string; data: Uint8Array }[], warnings: string[]) => {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  const jsonLen = dv.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen))) as { images?: { uri?: string; mimeType?: string }[] }
  const resources: Record<string, Uint8Array> = {}
  const binAt = 20 + jsonLen
  if (binAt + 8 <= glb.byteLength) resources['@glb.bin'] = glb.subarray(binAt + 8, binAt + 8 + dv.getUint32(binAt, true))
  const byName = new Map(extra.map((f) => [f.name.toLowerCase(), f.data]))
  ;(json.images ?? []).forEach((img, i) => {
    if (!img.uri || img.uri.startsWith('data:')) return
    const name = decodeURIComponent(img.uri).split(/[\\/]/).pop()!.toLowerCase()
    const data = byName.get(name)
    if (data) return void (resources[img.uri] = data)
    warnings.push(`Không tìm thấy ảnh texture "${name}" — hãy nén ảnh chung với mô hình trong tệp .zip`)
    img.uri = `thieu-anh-${i}.png`
    img.mimeType = 'image/png'
    resources[img.uri] = WHITE_PNG
  })
  return { json, resources }
}

/** Giải nén an toàn: chỉ đường dẫn tương đối nằm trong thư mục đích. */
const extractZip = (zipPath: string, dest: string) => {
  let count = 0
  let total = 0
  const entries = unzipSync(new Uint8Array(readFileSync(zipPath)), {
    filter: (f) => {
      if (f.name.endsWith('/') || f.name.startsWith('__MACOSX/') || basename(f.name).startsWith('.')) return false
      count++
      total += f.originalSize
      if (count > ZIP_MAX_FILES) throw new Error(`Tệp nén có hơn ${ZIP_MAX_FILES} tệp`)
      if (total > ZIP_MAX_BYTES) throw new Error(`Tệp nén giải ra hơn ${ZIP_MAX_BYTES / 2 ** 20} MB`)
      return true
    },
  })
  const files: string[] = []
  for (const [name, data] of Object.entries(entries)) {
    const out = normalize(join(dest, name))
    const rel = relative(dest, out)
    if (!rel || rel.startsWith('..') || rel.includes(':')) continue
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, data)
    files.push(out)
  }
  return files
}

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? listFiles(p) : [p]
  })

/**
 * Đọc mô hình bất kỳ định dạng hỗ trợ. `ext` là đuôi tệp gốc (tệp lưu trữ có thể không giữ đuôi).
 * Trả `format` để ghi vào kết quả chuẩn hoá.
 */
export const readModel = async (io: NodeIO, input: string, ext: string): Promise<{ doc: Document; format: string; warnings: string[] }> => {
  const e = ext.toLowerCase().replace(/^\./, '')
  const warnings: string[] = []
  let tmp: string | null = null
  try {
    let main = input
    let format = e
    let siblings: string[] = []
    if (e === 'zip') {
      tmp = mkdtempSync(join(tmpdir(), 'hd-model-'))
      let files: string[]
      try {
        files = extractZip(input, tmp)
      } catch (err) {
        throw new Error(`Không giải nén được tệp .zip: ${(err as Error).message}`)
      }
      const pick = MAIN_ORDER.map((x) => files.find((f) => extname(f).toLowerCase() === `.${x}`)).find(Boolean)
      if (!pick) throw new Error('Trong tệp .zip không có tệp GLB, glTF, FBX hoặc OBJ')
      main = pick
      format = extname(pick).slice(1).toLowerCase()
      siblings = listFiles(tmp).filter((f) => f !== pick)
    }
    try {
      if (format === 'glb') return { doc: await io.readBinary(new Uint8Array(readFileSync(main))), format, warnings }
      if (format === 'gltf') return { doc: await io.read(main), format, warnings }
      if (format === 'fbx' || format === 'obj') {
        const extra = siblings.map((f) => ({ name: basename(f), data: new Uint8Array(readFileSync(f)) }))
        const glb = await convertWithAssimp(main, extra)
        return { doc: await io.readJSON(resolveAssimpGlb(glb, extra, warnings) as never), format, warnings }
      }
    } catch (err) {
      throw new Error(`${BAD_FILE} (${(err as Error).message.slice(0, 120)})`)
    }
    throw new Error(`Không nhận định dạng .${format}`)
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  }
}
