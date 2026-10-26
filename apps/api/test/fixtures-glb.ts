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

/* ---------- item 03 lát R2: mô hình đồ ---------- */

/** Mặt cầu UV `seg × seg × 2` tam giác, bán kính `r` (đơn vị tệp). Đặt lệch gốc để kiểm chuẩn hoá. */
export const sphereGlb = async (seg: number, r = 0.5) => {
  const doc = new Document()
  const buf = doc.createBuffer()
  const pos: number[] = []
  for (let i = 0; i <= seg; i++)
    for (let j = 0; j <= seg; j++) {
      const th = (i / seg) * Math.PI
      const ph = (j / seg) * Math.PI * 2
      pos.push(r * Math.sin(th) * Math.cos(ph) + 3, r * Math.cos(th) + 2, r * Math.sin(th) * Math.sin(ph) - 1)
    }
  const idx: number[] = []
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j
      const b = a + seg + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const p = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buf))
    .setMaterial(doc.createMaterial('vai'))
  doc.createScene('s').addChild(doc.createNode('cau').setMesh(doc.createMesh('cau').addPrimitive(p)))
  return new NodeIO().writeBinary(doc)
}

/** `n` tam giác rời, lớn, ngẫu nhiên (không giảm được mà giữ hình) — kiểm mức Chặn (AC-R2). */
export const soupGlb = async (n: number) => {
  const doc = new Document()
  const buf = doc.createBuffer()
  let s = 12345
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const pos = new Float32Array(n * 9).map(() => rnd() * 2)
  const p = doc.createPrimitive().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf))
  doc.createScene('s').addChild(doc.createNode('soup').setMesh(doc.createMesh('soup').addPrimitive(p)))
  return new NodeIO().writeBinary(doc)
}

/** Hộp OBJ (cm, Y lên trên) rộng 200, cao 90, sâu 85; có MTL + ảnh vân nếu `texture`. */
export const boxObj = (texture?: string) => {
  const v = [[0, 0, 0], [200, 0, 0], [200, 90, 0], [0, 90, 0], [0, 0, 85], [200, 0, 85], [200, 90, 85], [0, 90, 85]]
  const obj = [
    'mtllib sofa.mtl',
    ...v.map((p) => `v ${p.join(' ')}`),
    'vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1',
    'usemtl vai',
    ...[[1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 8, 4], [4, 8, 5, 1]].map((q) => `f ${q.map((i, k) => `${i}/${k + 1}`).join(' ')}`),
  ].join('\n')
  const mtl = `newmtl vai\nKd 0.6 0.6 0.65\n${texture ? `map_Kd ${texture}\n` : ''}`
  return { obj, mtl }
}

/** Hộp FBX ASCII kiểu 3ds Max: cm, trục Z lên trên — rộng 200, sâu 85, cao 90. */
export const boxFbx = () => {
  const v = [0, 0, 0, 200, 0, 0, 200, 85, 0, 0, 85, 0, 0, 0, 90, 200, 0, 90, 200, 85, 90, 0, 85, 90]
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
  const idx = quads.flatMap((q) => [q[0], q[1], q[2], -(q[3] + 1)])
  return `; FBX 7.4.0 project file
FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7400
}
GlobalSettings:  {
	Version: 1000
	Properties70:  {
		P: "UpAxis", "int", "Integer", "",2
		P: "UpAxisSign", "int", "Integer", "",1
		P: "UnitScaleFactor", "double", "Number", "",1
	}
}
Objects:  {
	Geometry: 1000, "Geometry::Box", "Mesh" {
		Vertices: *${v.length} {
			a: ${v.join(',')}
		}
		PolygonVertexIndex: *${idx.length} {
			a: ${idx.join(',')}
		}
		GeometryVersion: 124
	}
	Model: 2000, "Model::sofa", "Mesh" {
		Version: 232
		Properties70:  {
		}
	}
}
Connections:  {
	C: "OO",2000,0
	C: "OO",1000,2000
}
`
}
