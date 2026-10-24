import { Document, NodeIO } from '@gltf-transform/core'
import type { Node } from '@gltf-transform/core'

/** GLB tổng hợp cho spike (02a §7): nhiều mesh, nhiều vật liệu, node item_* lồng 3 cấp, node wall_*. */
export const syntheticGlb = async (opts: { meshes: number; materials: number; items: number; walls: number }) => {
  const doc = new Document()
  const buf = doc.createBuffer()
  const scene = doc.createScene('scene')
  doc.getRoot().setDefaultScene(scene)
  const mats = Array.from({ length: opts.materials }, (_, i) => doc.createMaterial(`m${i}`).setBaseColorFactor([((i * 37) % 255) / 255, 0.5, 0.5, 1]))
  // khối hộp 12 tam giác
  const pos = new Float32Array([
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  ])
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0])
  const box = (name: string, i: number): Node => {
    const p = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos.slice()).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx.slice()).setBuffer(buf))
      .setMaterial(mats[i % mats.length])
    return doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(p)).setTranslation([(i % 50) * 0.3, 0, Math.floor(i / 50) * 0.3])
  }
  let n = 0
  // đồ: một nửa là nhóm lồng 3 cấp
  for (let i = 0; i < opts.items; i++) {
    const g = doc.createNode(`item_do_${i}`).setTranslation([i, 0, 5])
    if (i % 2 === 0) {
      const lvl1 = doc.createNode(`grp_${i}_a`)
      const lvl2 = doc.createNode(`grp_${i}_b`).setTranslation([0, 0.5, 0])
      lvl2.addChild(box(`leg_${i}_1`, n++)).addChild(box(`leg_${i}_2`, n++))
      lvl1.addChild(lvl2).addChild(box(`seat_${i}`, n++))
      g.addChild(lvl1)
    } else g.addChild(box(`body_${i}`, n++))
    scene.addChild(g)
  }
  for (let i = 0; i < opts.walls; i++) {
    const w = doc.createNode(`wall_${i}`).setTranslation([i * 0.5, 0, -2])
    w.addChild(box(`wall_part_${i}_a`, n++)).addChild(box(`wall_part_${i}_b`, n++))
    scene.addChild(w)
  }
  while (n < opts.meshes) scene.addChild(box(`misc_${n}`, n++))
  return new NodeIO().writeBinary(doc)
}
