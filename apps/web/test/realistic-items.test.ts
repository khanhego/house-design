import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { fitToSize, modelUrls } from '../src/scene/Items.tsx'
import { creditLine, creditRows } from '../src/viewer/Credits.tsx'
import type { ResolvedLibraryItem, Snapshot } from '@hd/core'

/* Item 03 lát R2 — tải dần mô hình đồ theo chất lượng, đặt đúng kích thước khai báo, ghi công. */

const box = (w: number, h: number, d: number, at: [number, number, number] = [0, 0, 0]) => {
  const g = new THREE.Group()
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d))
  m.position.set(...at)
  g.add(m)
  return g
}
const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())

describe('mô hình đồ chân thực (FR-13.01, 13.14, BR-R4)', () => {
  it('Nhẹ chỉ tải bản nhẹ; Đẹp tải bản nhẹ trước rồi bản đầy đủ; chưa có bản nhẹ thì tải bản đầy đủ', () => {
    const lib = { modelUrl: '/f/full.glb', modelLightUrl: '/f/nhe.glb' }
    expect(modelUrls(lib, 'light')).toEqual(['/f/nhe.glb'])
    expect(modelUrls(lib, 'full')).toEqual(['/f/nhe.glb', '/f/full.glb'])
    expect(modelUrls({ modelUrl: '/f/full.glb' }, 'light')).toEqual(['/f/full.glb'])
    expect(modelUrls({ modelUrl: null, modelLightUrl: null }, 'full')).toEqual([])
  })
  it('mô hình đã chuẩn hoá co giãn từng trục về kích thước khai báo, đáy ở 0, tâm ở giữa', () => {
    const o = fitToSize(box(2, 0.85, 0.9, [5, 3, 1]), [1800, 900, 850], true)
    const s = size(o)
    expect([s.x, s.y, s.z].map((v) => +v.toFixed(3))).toEqual([1.8, 0.9, 0.85])
    const b = new THREE.Box3().setFromObject(o)
    expect(b.min.y).toBeCloseTo(0, 6)
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0, 6)
  })
  it('mô hình cũ (chưa chuẩn hoá) giữ tỉ lệ; chỉ co đều khi sai đơn vị rõ ràng', () => {
    expect(size(fitToSize(box(2, 0.85, 0.9), [2100, 900, 850], false)).x).toBeCloseTo(2, 6)
    expect(size(fitToSize(box(200, 85, 90), [2000, 850, 900], false)).y).toBeCloseTo(0.85, 6)
  })
})

describe('nguồn đồ & vật liệu (FR-13.17)', () => {
  it('liệt kê đồ và vật liệu có nguồn; bỏ qua snapshot cũ chưa có; ghi công CC BY', () => {
    const lib = (name: string, credit?: ResolvedLibraryItem['credit']) => ({ name, credit }) as ResolvedLibraryItem
    const resolved = {
      libraryItems: {
        a: lib('Sofa', { sourceKind: 'free_library', sourceName: 'Poly Haven', sourceUrl: 'https://polyhaven.com/a/sofa_02', license: 'cc0', attribution: null }),
        b: lib('Ghế cũ'),
        c: lib('Đèn', { sourceKind: 'free_library', sourceName: 'Kho X', sourceUrl: null, license: 'cc_by', attribution: null }),
      },
      models: {}, files: {},
      materials: { m: { name: 'Gỗ sồi', credit: { sourceKind: 'free_library', sourceName: 'Poly Haven', sourceUrl: null, license: 'cc0', attribution: 'Poly Haven (CC0)' } } },
    } as unknown as Snapshot['resolved']
    expect(creditRows(resolved).map((r) => `${r.kind}:${r.name}`)).toEqual(['Đồ:Đèn', 'Đồ:Sofa', 'Vật liệu:Gỗ sồi'])
    expect(creditLine(resolved.libraryItems.c.credit)).toBe('Kho X · CC BY')
    expect(creditLine(resolved.libraryItems.a.credit)).toBeNull()
  })
})
