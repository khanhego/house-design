import { readFile, writeFile } from 'node:fs/promises'
import { Document, NodeIO } from '@gltf-transform/core'
import type { Node, Primitive } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, getBounds, join, meshopt, prune, textureCompress, transformPrimitive, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import type { ModelReport } from '@hd/core'

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
  for (const t of doc.getRoot().listTextures()) {
    const s = t.getSize()
    if (s) textureBytes += Math.round((s[0] * s[1] * 4 * 4) / 3)
  }
  const b = scene ? getBounds(scene) : { min: [0, 0, 0], max: [0, 0, 0] }
  return {
    triangles,
    drawCalls,
    textureBytes,
    fileBytes,
    bbox: { min: b.min as [number, number, number], max: b.max as [number, number, number] },
    nodeNames,
  }
}

export const makeIO = async () => {
  await MeshoptDecoder.ready
  await MeshoptEncoder.ready
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
}

/** Đọc GLB/glTF, tối ưu, ghi GLB. Ném lỗi tiếng Việt khi không đọc được (EX-1). */
export const optimizeGlb = async (input: string, output: string): Promise<{ report: ModelReport; warnings: string[] }> => {
  const io = await makeIO()
  const warnings: string[] = []
  let doc: Document
  try {
    doc = input.toLowerCase().endsWith('.gltf') ? await io.read(input) : await io.readBinary(new Uint8Array(await readFile(input)))
  } catch (e) {
    throw new Error(`Không đọc được tệp mô hình. Hãy xuất lại dạng GLB từ SketchUp/3ds Max/Blender. (${(e as Error).message.slice(0, 120)})`)
  }
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
