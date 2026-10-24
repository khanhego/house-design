import { describe, expect, it } from 'vitest'
import { pickScale } from '../src/lib/pdfScale.ts'
import { inkFor } from '../src/viewer/Brand.tsx'

describe('PDF', () => {
  it('chọn tỷ lệ lớn nhất vừa khung A3 (396 × 236 mm)', () => {
    expect(pickScale(12000, 9000)).toBe(50) // căn hộ 12 × 9 m
    expect(pickScale(7000, 20000)).toBe(100) // nhà phố 18 m
    expect(pickScale(30000, 30000)).toBe(200)
  })
})

describe('thương hiệu', () => {
  it('chữ tương phản trên màu thương hiệu', () => {
    expect(inkFor('#0E6B5C')).toBe('#ffffff')
    expect(inkFor('#F4E04D')).toBe('#1d1a17')
  })
})

describe('tracker (BR-10)', async () => {
  const { sessionFor, deviceIdOf } = await import('../src/lib/tracker.ts')
  const mem = () => {
    const m = new Map<string, string>()
    return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) }
  }
  it('giữ phiên khi còn tương tác; > 30 phút không tương tác → phiên mới', () => {
    const s = mem()
    const a = sessionFor(s, 0)
    expect(sessionFor(s, 29 * 60_000)).toBe(a)
    expect(sessionFor(s, 58 * 60_000)).toBe(a)
    expect(sessionFor(s, 58 * 60_000 + 30 * 60_000 + 1)).not.toBe(a)
  })
  it('mã thiết bị ổn định', () => {
    const s = mem()
    expect(deviceIdOf(s)).toBe(deviceIdOf(s))
  })
})

describe('đi bộ trong nhà — va chạm tường', async () => {
  const { floorFromRects } = await import('@hd/core')
  const { blockersOf, isFree, stepTowards } = await import('../src/scene/walk.ts')
  // hai phòng 4 × 4 m cạnh nhau, tường ngăn ở x = 4 m
  const f = floorFromRects({ name: 'T1', order: 1, elevation: 0, rooms: [{ name: 'A', function: 'living', rect: [0, 0, 4000, 4000] }, { name: 'B', function: 'bedroom', rect: [4000, 0, 4000, 4000] }] })
  const mid = f.walls.find((w) => w.a[0] === 4000 && w.b[0] === 4000)!
  it('tường ngăn chặn người, dừng trước tường', () => {
    const end = stepTowards([2, 1], [6, 1], blockersOf(f))
    expect(end[0]).toBeLessThan(4 - 0.2)
    expect(end[0]).toBeGreaterThan(3.5)
  })
  it('qua được ô cửa đi, không qua được cửa sổ', () => {
    const withDoor = { ...f, openings: [{ id: 'd', wallId: mid.id, kind: 'door' as const, offset: 1500, width: 900, height: 2100, sill: 0, hinge: 'start' as const, swing: 'left' as const }] }
    const y = (Math.min(mid.a[1], mid.b[1]) + 1950) / 1000
    expect(stepTowards([2, y], [6, y], blockersOf(withDoor))[0]).toBeCloseTo(6)
    const withWindow = { ...f, openings: [{ ...withDoor.openings[0], kind: 'window' as const, sill: 900, height: 1200 }] }
    expect(stepTowards([2, y], [6, y], blockersOf(withWindow))[0]).toBeLessThan(4)
    expect(isFree([2, 2], blockersOf(f))).toBe(true)
  })
})

describe('đi bộ trong nhà — va chạm đồ', async () => {
  const { floorFromRects } = await import('@hd/core')
  const { furnitureBlockers, stepTowards } = await import('../src/scene/walk.ts')
  const f = floorFromRects({ name: 'T1', order: 1, elevation: 0, rooms: [{ name: 'A', function: 'dining', rect: [0, 0, 6000, 6000] }] })
  f.items = [
    { id: 't', source: { libraryItemId: 'table' }, position: [3000, 3000], elevation: 0, rotation: 0 },
    { id: 'r', source: { libraryItemId: 'rug' }, position: [3000, 1000], elevation: 0, rotation: 0 },
  ]
  const lib = { table: { category: 'table', sizeMm: [1600, 750, 900] as [number, number, number] }, rug: { category: 'rug', sizeMm: [2000, 10, 1400] as [number, number, number] } }
  it('bàn ăn chặn người, thảm thì đi qua được', () => {
    const bl = furnitureBlockers(f, lib)
    expect(bl).toHaveLength(4)
    expect(stepTowards([1, 3], [5, 3], bl)[0]).toBeLessThan(3 - 0.8)
    expect(stepTowards([1, 1], [5, 1], bl)[0]).toBeCloseTo(5)
  })
})

describe('đi bộ trong nhà — không kẹt khi tâm phòng trùng bàn', async () => {
  const { floorFromRects } = await import('@hd/core')
  const { blockersOf, furnitureBlockers, isFree, nearestFree, stepTowards } = await import('../src/scene/walk.ts')
  const f = floorFromRects({ name: 'T1', order: 1, elevation: 0, rooms: [{ name: 'Bếp & ăn', function: 'dining', rect: [0, 0, 5000, 4000] }] })
  f.items = [{ id: 't', source: { libraryItemId: 'table' }, position: [2500, 2000], elevation: 0, rotation: 0 }]
  const bl = [...blockersOf(f), ...furnitureBlockers(f, { table: { category: 'table', sizeMm: [1600, 750, 900] } })]
  it('tâm bàn là chỗ bị chặn; người được đặt ra ngoài bàn và đi lại được', () => {
    expect(isFree([2.5, 2], bl)).toBe(false)
    const start = nearestFree([2.5, 2], bl)
    expect(isFree(start, bl)).toBe(true)
    const moved = stepTowards(start, [start[0], start[1] < 2 ? 0.6 : 3.4], bl)
    expect(Math.hypot(moved[0] - start[0], moved[1] - start[1])).toBeGreaterThan(0.2)
  })
  it('đang kẹt trong đồ vẫn bước ra được', () => {
    expect(stepTowards([2.5, 2], [2.5, 2.1], bl)).toEqual([2.5, 2.1])
  })
})

describe('tour ảnh thật — sắp thứ tự & tên cảnh (AC-T1)', async () => {
  const { orderPhotos, sceneTitle, leadingNumber } = await import('../src/tour/order.ts')
  it('xếp theo số đầu tên tệp, chọn lộn xộn vẫn đúng', () => {
    const names = ['10-ban-cong.jpg', '02-cong.jpg', '01-mat-tien.jpg', '03-cua-chinh.jpg']
    const { items, by } = orderPhotos(names.map((name, index) => ({ name, index })))
    expect(items.map((x) => x.name)).toEqual(['01-mat-tien.jpg', '02-cong.jpg', '03-cua-chinh.jpg', '10-ban-cong.jpg'])
    expect(by).toBe('name')
    expect(leadingNumber('IMG_1234.jpg')).toBeNull()
  })
  it('không có số → theo giờ chụp; thiếu giờ → theo thứ tự chọn', () => {
    const a = orderPhotos([{ name: 'IMG_9.jpg', index: 0, takenAt: '2026-10-20T10:05:00' }, { name: 'IMG_1.jpg', index: 1, takenAt: '2026-10-20T10:01:00' }])
    expect(a.items.map((x) => x.name)).toEqual(['IMG_1.jpg', 'IMG_9.jpg'])
    expect(a.by).toBe('time')
    const b = orderPhotos([{ name: 'b.jpg', index: 0 }, { name: 'a.jpg', index: 1, takenAt: '2026-01-01T00:00:00' }])
    expect(b.items.map((x) => x.name)).toEqual(['b.jpg', 'a.jpg'])
    expect(b.by).toBe('selection')
  })
  it('tên cảnh có dấu từ tên tệp không dấu', () => {
    expect(sceneTitle('04-phong-khach.jpg', 4)).toBe('Phòng khách')
    expect(sceneTitle('12_san_thuong.JPG', 12)).toBe('Sân thượng')
    expect(sceneTitle('07-sanh-tang-2.jpg', 7)).toBe('Sảnh tầng 2')
    expect(sceneTitle('08-Phòng ngủ master.jpg', 8)).toBe('Phòng ngủ master')
    expect(sceneTitle('05.jpg', 5)).toBe('Cảnh 5')
  })
})

describe('tên cảnh — từ điển phòng', async () => {
  const { sceneTitle } = await import('../src/tour/order.ts')
  it('phòng sinh hoạt, hồ bơi', () => {
    expect(sceneTitle('08-phong-sinh-hoat.jpg', 8)).toBe('Phòng sinh hoạt')
    expect(sceneTitle('20-ho-boi.jpg', 20)).toBe('Hồ bơi')
  })
})

describe('BR-T3 — clip chuyển cảnh khi đổi thứ tự / xoá / thay ảnh', async () => {
  const { moveScene, removeScene, replacedImage } = await import('../src/tour/order.ts')
  const mk = () => [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, clipFileId: `c${n}` as string | undefined }))
  it('kéo cảnh 3 lên trước cảnh 2 → gỡ clip 1→2, 2→3, 3→4 (ví dụ SRS)', () => {
    const { list, dropped } = moveScene(mk(), 's3', 's2')
    expect(list.map((s) => s.id)).toEqual(['s1', 's3', 's2', 's4', 's5'])
    expect(dropped).toBe(3)
    expect(list.filter((s) => s.clipFileId).map((s) => s.id)).toEqual(['s4', 's5'])
  })
  it('kéo tới: cảnh đứng sau cảnh được thả lên', () => {
    expect(moveScene(mk(), 's1', 's3').list.map((s) => s.id)).toEqual(['s2', 's3', 's1', 's4', 's5'])
  })
  it('xoá cảnh 3 → gỡ clip của cảnh 2; thay ảnh cảnh 3 → gỡ clip 2→3 và 3→4', () => {
    const r = removeScene(mk(), 's3')
    expect(r.dropped).toBe(1)
    expect(r.list.find((s) => s.id === 's2')!.clipFileId).toBeUndefined()
    const t = replacedImage(mk(), 's3')
    expect(t.dropped).toBe(2)
    expect(t.list.filter((s) => s.clipFileId).map((s) => s.id)).toEqual(['s1', 's4', 's5'])
  })
})
