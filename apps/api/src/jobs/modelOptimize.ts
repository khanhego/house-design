import { writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import type { Mesh, Node, Primitive } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { clearNodeTransform, cloneDocument, dedup, flatten, getBounds, join, meshopt, prune, simplify, textureCompress, transformPrimitive, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import { ITEM_BUDGET } from '@hd/core'
import type { ModelReport } from '@hd/core'
import type { ModelNormalize } from '../repos/types.ts'
import { readModel } from './modelImport.ts'

/* Tối ưu GLB (02a §7, DEC-22 v0.2, N-02). Chạy trong worker thread qua modelWorker.ts. */

export const TAG = /^(item_|wall_)/i

type Mat4 = number[]

const multiply = (a: Mat4, b: Mat4): Mat4 => {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return out
}

const invert = (m: Mat4): Mat4 => {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (!det) return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  det = 1 / det
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ]
}

/** Bản sao primitive với accessor riêng (để biến đổi không ảnh hưởng nơi khác dùng chung). */
const deepClonePrimitive = (doc: Document, p: Primitive) => {
  const c = doc.createPrimitive().setMode(p.getMode()).setMaterial(p.getMaterial())
  for (const sem of p.listSemantics()) c.setAttribute(sem, p.getAttribute(sem)!.clone())
  const idx = p.getIndices()
  if (idx) c.setIndices(idx.clone())
  return c
}

/**
 * Gộp mỗi node `item_*`/`wall_*` (cấp cao nhất) cùng cây con thành một node mesh mang đúng tên (N-02),
 * để tên còn nguyên sau flatten/join và bấm chọn được cả món đồ.
 */
export const collapseNamed = (doc: Document) => {
  const collapse = (node: Node) => {
    const rootInv = invert(node.getWorldMatrix() as unknown as Mat4)
    const parts: { prim: Primitive; m: Mat4 }[] = []
    const visit = (n: Node) => {
      const mesh = n.getMesh()
      if (mesh) {
        const rel = multiply(rootInv, n.getWorldMatrix() as unknown as Mat4)
        for (const prim of mesh.listPrimitives()) parts.push({ prim, m: rel })
      }
      n.listChildren().forEach(visit)
    }
    visit(node)
    if (!parts.length) return
    const merged = doc.createMesh(node.getName())
    for (const { prim, m } of parts) {
      const c = deepClonePrimitive(doc, prim)
      transformPrimitive(c, m as never)
      merged.addPrimitive(c)
    }
    for (const child of node.listChildren()) {
      node.removeChild(child)
      child.dispose()
    }
    node.setMesh(merged)
  }
  for (const scene of doc.getRoot().listScenes()) {
    const walk = (n: Node) => (TAG.test(n.getName()) ? collapse(n) : n.listChildren().forEach(walk))
    scene.listChildren().forEach(walk)
  }
  // join({ keepNamed }) giữ cả node lẫn mesh có tên → xoá tên mọi thứ không theo quy ước
  const keepMeshes = new Set(doc.getRoot().listNodes().filter((n) => TAG.test(n.getName())).map((n) => n.getMesh()))
  for (const n of doc.getRoot().listNodes()) if (!TAG.test(n.getName())) n.setName('')
  for (const m of doc.getRoot().listMeshes()) if (!keepMeshes.has(m)) m.setName('')
}

export const reportOf = (doc: Document, fileBytes: number): ModelReport => {
  let triangles = 0
  let drawCalls = 0
  const nodeNames: string[] = []
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  scene?.traverse((n) => {
    if (TAG.test(n.getName())) nodeNames.push(n.getName())
    const mesh = n.getMesh()
    if (!mesh) return
    for (const p of mesh.listPrimitives()) {
      drawCalls++
      if (p.getMode() !== 4) continue
      const idx = p.getIndices()
      triangles += Math.floor((idx ? idx.getCount() : p.getAttribute('POSITION')?.getCount() ?? 0) / 3)
    }
  })
  let textureBytes = 0
  let maxTexturePx = 0
  for (const t of doc.getRoot().listTextures()) {
    const s = t.getSize()
    if (s) {
      textureBytes += Math.round((s[0] * s[1] * 4 * 4) / 3)
      maxTexturePx = Math.max(maxTexturePx, s[0], s[1])
    }
  }
  const b = scene ? getBounds(scene) : { min: [0, 0, 0], max: [0, 0, 0] }
  return {
    triangles,
    drawCalls,
    textureBytes,
    fileBytes,
    bbox: { min: b.min as [number, number, number], max: b.max as [number, number, number] },
    nodeNames,
    maxTexturePx,
  }
}

export const makeIO = async () => {
  await MeshoptDecoder.ready
  await MeshoptEncoder.ready
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
}

/** Đọc GLB/glTF/FBX/OBJ/ZIP, tối ưu, ghi GLB (mô hình tầng / cả nhà). Ném lỗi tiếng Việt khi không đọc được (EX-1). */
export const optimizeGlb = async (input: string, output: string, ext = extname(input)): Promise<{ report: ModelReport; warnings: string[] }> => {
  const io = await makeIO()
  const warnings: string[] = []
  const { doc } = await readModel(io, input, ext || 'glb')
  await doc.transform(dedup(), prune())
  collapseNamed(doc)
  await doc.transform(flatten(), join({ keepNamed: true }), weld(), prune())
  try {
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048] }))
  } catch (e) {
    warnings.push(`Bỏ qua nén texture: ${(e as Error).message.slice(0, 120)}`)
  }
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  const glb = await io.writeBinary(doc)
  await writeFile(output, glb)
  return { report: reportOf(doc, glb.byteLength), warnings }
}

/* ---------- Mô hình đồ thư viện (item 03 lát R2, R2.2) ---------- */

const UNIT_SCALE = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254 } as const
type Unit = keyof typeof UNIT_SCALE
/** Cỡ hợp lý của một món đồ nội thất (cạnh lớn nhất, mét) khi không có kích thước khai báo. */
const SANE_M: [number, number] = [0.05, 8]

/** Kích thước (R, C, S) theo mét khi đặt trục `up` lên trên, với hệ số `k`. */
const dimsOf = (size: number[], k: number, up: 'y' | 'z'): [number, number, number] =>
  up === 'y' ? [size[0] * k, size[1] * k, size[2] * k] : [size[0] * k, size[2] * k, size[1] * k]

/**
 * Chọn đơn vị + trục đứng (BR-R4, DEC-R15). Có kích thước khai báo: chọn cặp lệch ít nhất theo từng trục
 * (ưu tiên nhẹ mét, trục Y khi ngang nhau). Không có: trục Y, đơn vị đưa cạnh lớn nhất về 0,05–8 m.
 */
export const chooseFrame = (size: number[], req: Pick<ModelNormalize, 'unit' | 'upAxis' | 'declaredMm'>): { unit: Unit; upAxis: 'y' | 'z'; notes: string[] } => {
  const units: Unit[] = req.unit === 'auto' ? ['m', 'cm', 'mm', 'in'] : [req.unit]
  const axes: ('y' | 'z')[] = req.upAxis === 'auto' ? ['y', 'z'] : [req.upAxis]
  const notes: string[] = []
  let unit: Unit = units[0]
  let upAxis: 'y' | 'z' = axes[0]
  if (req.declaredMm) {
    const want = req.declaredMm.map((v) => v / 1000)
    let best = Infinity
    for (const u of units)
      for (const a of axes) {
        const d = dimsOf(size, UNIT_SCALE[u], a)
        const err = Math.max(...d.map((v, i) => Math.abs(v - want[i]) / want[i])) + (u === 'm' ? 0 : 0.001) + (a === 'y' ? 0 : 0.002)
        if (err < best) [best, unit, upAxis] = [err, u, a]
      }
  } else if (req.unit === 'auto') {
    const max = Math.max(...size)
    unit = units.find((u) => max * UNIT_SCALE[u] >= SANE_M[0] && max * UNIT_SCALE[u] <= SANE_M[1]) ?? 'm'
  }
  if (req.unit === 'auto' && unit !== 'm') notes.push(`Tự nhận đơn vị ${unit === 'in' ? 'inch' : unit}, đã đổi về mét`)
  if (req.upAxis === 'auto' && upAxis === 'z') notes.push('Mô hình dùng trục Z hướng lên, đã xoay đứng lại')
  return { unit, upAxis, notes }
}

/** Đưa về mét, Y lên trên, gốc ở giữa đáy; nướng biến đổi vào đỉnh (mọi node về ma trận đơn vị). */
const normalizeFrame = (doc: Document, k: number, up: 'y' | 'z') => {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  if (!scene) throw new Error('Mô hình không có cảnh nào')
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose()
  const root = doc.createNode('item_root').setScale([k, k, k])
  // Z lên trên → xoay −90° quanh X: (x, y, z) → (x, z, −y)
  if (up === 'z') root.setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2])
  for (const c of scene.listChildren()) root.addChild(c)
  scene.addChild(root)
  const b = getBounds(scene)
  root.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2])
  // một mesh dùng ở nhiều node → tách bản sao trước khi nướng
  const used = new Set<Mesh>()
  const bake = (n: Node) => {
    const m = n.getMesh()
    if (m) used.has(m) ? n.setMesh(m.clone()) : used.add(m)
    clearNodeTransform(n)
    n.listChildren().forEach(bake)
  }
  bake(root)
  // hoạt ảnh / da không dùng cho đồ nội thất
  for (const a of doc.getRoot().listAnimations()) a.dispose()
  for (const sk of doc.getRoot().listSkins()) sk.dispose()
}

/** Ảnh texture sharp không đọc được (EXR, TGA…) không nén được và rất nặng → bỏ, cảnh báo xuất lại JPG/PNG. */
const dropUnreadableTextures = async (doc: Document, warnings: string[]) => {
  for (const t of doc.getRoot().listTextures()) {
    const img = t.getImage()
    const ok = img && (await sharp(img).metadata().then(() => true, () => false))
    if (ok) continue
    warnings.push(`Bỏ ảnh texture "${t.getURI() || t.getName() || 'không tên'}" (${t.getMimeType() || 'định dạng lạ'}) — chỉ nhận JPG, PNG, WebP`)
    t.dispose()
  }
}

const triangles = (doc: Document) =>
  doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((s, p) => s + (p.getMode() === 4 ? Math.floor((p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount() ?? 0) / 3) : 0), 0)

/** Giảm tam giác về `target` (meshoptimizer); thử nới sai số dần tới `maxError`. */
const reduceTo = async (doc: Document, target: number, errors: number[]) => {
  for (const error of errors) {
    const n = triangles(doc)
    if (n <= target) return
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / n), error }), prune())
  }
}

export interface ItemResult {
  report: ModelReport
  lightReport: ModelReport
  normalize: NonNullable<ModelNormalize['result']>
  warnings: string[]
}

/**
 * Mô hình đồ: đọc (mọi định dạng) → chuẩn hoá khung → bản đầy đủ (≤ 50.000 tam giác, texture ≤ 2.048) →
 * bản nhẹ từ bản đầy đủ (≤ 5.000, texture ≤ 512). Ghi 2 GLB nén meshopt.
 */
export const optimizeItem = async (input: string, output: string, lightOutput: string, ext: string, req: ModelNormalize): Promise<ItemResult> => {
  const io = await makeIO()
  await MeshoptSimplifier.ready
  const warnings: string[] = []
  const { doc, format, warnings: readWarnings } = await readModel(io, input, ext)
  warnings.push(...readWarnings)
  await doc.transform(dedup(), prune())
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  if (!scene || !doc.getRoot().listMeshes().length) throw new Error('Mô hình không có hình khối nào')
  const b0 = getBounds(scene)
  const size = [0, 1, 2].map((i) => b0.max[i] - b0.min[i])
  if (!size.every((v) => Number.isFinite(v)) || Math.max(...size) <= 0) throw new Error('Mô hình rỗng hoặc hộp bao không hợp lệ')
  const frame = chooseFrame(size, req)
  normalizeFrame(doc, UNIT_SCALE[frame.unit], frame.upAxis)
  await doc.transform(flatten(), join(), weld(), prune())

  await reduceTo(doc, ITEM_BUDGET.full.triangles, [0.01, 0.03])
  await dropUnreadableTextures(doc, warnings)
  try {
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [ITEM_BUDGET.full.texturePx, ITEM_BUDGET.full.texturePx] }))
  } catch (e) {
    warnings.push(`Bỏ qua nén texture: ${(e as Error).message.slice(0, 120)}`)
  }
  const light = cloneDocument(doc)
  await reduceTo(light, ITEM_BUDGET.light.triangles, [0.05, 0.15])
  try {
    await light.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [ITEM_BUDGET.light.texturePx, ITEM_BUDGET.light.texturePx], quality: 70 }))
  } catch (e) {
    warnings.push(`Bỏ qua nén texture bản nhẹ: ${(e as Error).message.slice(0, 120)}`)
  }
  const write = async (d: Document, path: string) => {
    await d.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
    const glb = await io.writeBinary(d)
    await writeFile(path, glb)
    return reportOf(d, glb.byteLength)
  }
  const report = await write(doc, output)
  const lightReport = await write(light, lightOutput)
  const b = report.bbox
  const measuredMm = [0, 1, 2].map((i) => Math.round((b.max[i] - b.min[i]) * 1000)) as [number, number, number]
  return { report, lightReport, normalize: { format, scale: UNIT_SCALE[frame.unit], unit: frame.unit, upAxis: frame.upAxis, measuredMm, notes: frame.notes }, warnings }
}
