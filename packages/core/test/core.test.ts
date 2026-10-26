import { describe, expect, it } from 'vitest'
import {
  cloneDocument, emptyDocument, floorFromRects, floorGrossArea, formatArea, HouseDocumentSchema,
  normalizePhoneVN, planSvg, roomArea, stripUnderlay, submitChecks, wallSegments, budgetForFloor,
  levelOf, BUDGET, duplicateFloor, assignItemsToRooms, isSimplePolygon, auditFloor, findPath, buildNavGrid, obstaclesOf, standable, hasModel3d, hasTour, formatPriceVnd, sceneChapters, guessChapter,
} from '../src/index.ts'
import type { HouseDocument, ModelReport } from '../src/index.ts'

const floor = () =>
  floorFromRects({
    name: 'Tầng 1', order: 1, elevation: 0,
    rooms: [
      { name: 'Phòng khách', function: 'living', rect: [0, 0, 5000, 6000] },
      { name: 'Phòng ngủ', function: 'bedroom', rect: [5000, 0, 3000, 4000] },
      { name: 'WC', function: 'wc', rect: [5000, 4000, 3000, 2000] },
    ],
    openings: [
      { kind: 'door', axis: 'y', at: 5000, from: 3000, to: 3900 },
      { kind: 'window', axis: 'x', at: 0, from: 1000, to: 3500 },
    ],
  })

const doc = (): HouseDocument => ({ ...emptyDocument(), floors: [floor()], coverFileId: 'fil_cover' })

const report = (r: Partial<ModelReport>): ModelReport => ({
  triangles: 0, drawCalls: 0, textureBytes: 0, fileBytes: 0, bbox: { min: [0, 0, 0], max: [1, 1, 1] }, nodeNames: [], ...r,
})

describe('BR-04 diện tích', () => {
  it('phòng lòng tường 3.600 × 4.200 = 15,12 m² (AC-06)', () => {
    expect(roomArea([[0, 0], [3600, 0], [3600, 4200], [0, 4200]])).toBe(15.12)
    expect(formatArea(15.12)).toBe('15,12 m²')
  })
  it('diện tích sàn theo đường bao 5.000 × 15.000 = 75,00 m²', () => {
    const f = { ...floor(), outline: [[0, 0], [5000, 0], [5000, 15000], [0, 15000]] as [number, number][] }
    expect(floorGrossArea(f)).toEqual({ m2: 75, fromOutline: true })
  })
  it('không có đường bao → hình chữ nhật bao mép ngoài tường', () => {
    const f = { ...floor(), outline: undefined }
    // tim tường 8.000 × 6.000, tường ngoài dày 200 → 8.200 × 6.200
    expect(floorGrossArea(f)).toEqual({ m2: 50.84, fromOutline: false })
  })
})

describe('builder + schema', () => {
  it('tài liệu dựng từ hình chữ nhật hợp lệ theo schema', () => {
    expect(HouseDocumentSchema.safeParse(doc()).success).toBe(true)
  })
  it('gộp tường chung, phòng là lòng tường', () => {
    const f = floor()
    const living = f.rooms.find((r) => r.name === 'Phòng khách')!
    // tường ngoài 200 (nửa 100), tường trong 110 (nửa 55)
    expect(living.polygon[0]).toEqual([100, 100])
    expect(living.polygon[2]).toEqual([5000 - 55, 6000 - 100])
    // đường x=5000 từ 0..6000 là một tường
    expect(f.walls.filter((w) => w.a[0] === 5000 && w.b[0] === 5000)).toHaveLength(1)
  })
})

describe('wallSegments', () => {
  it('chia tường có cửa đi và cửa sổ thành khối đặc, lanh tô, bậu', () => {
    const f = floor()
    const layouts = wallSegments(f)
    const withWindow = layouts.find((l) => l.openings.some((o) => o.opening.kind === 'window'))!
    expect(withWindow.pieces.map((p) => p.kind).sort()).toEqual(['lintel', 'sill', 'solid', 'solid'])
    const withDoor = layouts.find((l) => l.openings.some((o) => o.opening.kind === 'door'))!
    expect(withDoor.pieces.filter((p) => p.kind === 'sill')).toHaveLength(0)
  })
  it('xử lý tường xiên', () => {
    const f = { ...floor(), walls: [{ id: 'w1', a: [0, 0] as [number, number], b: [3000, 4000] as [number, number], thickness: 200 }], openings: [
      { id: 'o1', wallId: 'w1', kind: 'door' as const, offset: 1000, width: 900, height: 2100, sill: 0, hinge: 'start' as const, swing: 'left' as const },
    ] }
    const [l] = wallSegments(f)
    expect(l.frame.len).toBe(5000)
    expect(l.openings[0].from).toBe(1000)
    expect(l.openings[0].to).toBe(1900)
  })
})

describe('BR-05/BR-07 kiểm gửi duyệt', () => {
  it('tầng chưa hiệu chỉnh bị chặn', () => {
    const d = doc()
    d.floors[0].calibrated = false
    const checks = submitChecks(d, { models: {}, libraryModels: {} })
    expect(checks).toContainEqual(expect.objectContaining({ code: 'FLOOR_NOT_CALIBRATED', level: 'block', floorId: d.floors[0].id }))
  })
  it('thiếu ảnh đại diện bị chặn; thiếu điểm nhìn chỉ cảnh báo', () => {
    const d = { ...doc(), coverFileId: undefined }
    const codes = submitChecks(d, { models: {}, libraryModels: {} }).map((c) => `${c.code}:${c.level}`)
    expect(codes).toContain('NO_COVER:block')
    expect(codes).toContain('NO_DEFAULT_VIEWPOINT:warn')
  })
  it('phòng tự cắt bị chặn', () => {
    expect(isSimplePolygon([[0, 0], [100, 100], [100, 0], [0, 100]])).toBe(false)
    const d = doc()
    d.floors[0].rooms[0].polygon = [[0, 0], [1000, 1000], [1000, 0], [0, 1000]]
    expect(submitChecks(d, { models: {}, libraryModels: {} }).some((c) => c.code === 'ROOM_NOT_CLOSED')).toBe(true)
  })
  it('ngân sách tính tổng một góc xem tầng: tầng + ngoại thất + đồ thư viện', () => {
    const d = doc()
    d.floors[0].modelRef = { modelAssetId: 'mdl_f', offset: [0, 0, 0], rotation: 0, scale: 1 }
    d.exterior = { modelRef: { modelAssetId: 'mdl_x', offset: [0, 0, 0], rotation: 0, scale: 1 } }
    d.floors[0].items = [1, 2].map((i) => ({ id: `itm_${i}`, source: { libraryItemId: 'lib_chair' }, position: [1000, 1000] as [number, number], elevation: 0, rotation: 0 }))
    const ctx = {
      models: {
        mdl_f: { status: 'ready' as const, report: report({ triangles: 300_000, drawCalls: 60, fileBytes: 8 * 2 ** 20 }) },
        mdl_x: { status: 'ready' as const, report: report({ triangles: 200_000, drawCalls: 40, fileBytes: 5 * 2 ** 20 }) },
        mdl_c: { status: 'ready' as const, report: report({ triangles: 10_000, drawCalls: 2, fileBytes: 2 ** 20 }) },
      },
      libraryModels: { lib_chair: 'mdl_c' },
    }
    const t = budgetForFloor(d, d.floors[0], ctx)
    expect(t.triangles).toBe(520_000)
    expect(t.drawCalls).toBe(104)
    expect(t.fileBytes).toBe(14 * 2 ** 20) // ghế chỉ tải một lần
    expect(levelOf(t).level).toBe('warn')
    ctx.models.mdl_f.report.fileBytes = 9 * 2 ** 20
    const checks = submitChecks(d, ctx)
    expect(checks).toContainEqual(expect.objectContaining({ code: 'BUDGET_BLOCK', floorId: d.floors[0].id }))
    expect(BUDGET.block.fileBytes).toBe(14 * 2 ** 20)
  })
  it('mô hình đang xử lý / lỗi / mất node', () => {
    const d = doc()
    d.floors[0].modelRef = { modelAssetId: 'mdl_a', offset: [0, 0, 0], rotation: 0, scale: 1 }
    d.floors[0].items = [{ id: 'itm_1', source: { modelNode: { modelAssetId: 'mdl_a', nodeName: 'item_sofa' } }, position: [0, 0], elevation: 0, rotation: 0 }]
    expect(submitChecks(d, { models: { mdl_a: { status: 'processing' } }, libraryModels: {} }).some((c) => c.code === 'MODEL_PROCESSING')).toBe(true)
    expect(submitChecks(d, { models: { mdl_a: { status: 'failed' } }, libraryModels: {} }).some((c) => c.code === 'MODEL_FAILED')).toBe(true)
    const missing = submitChecks(d, { models: { mdl_a: { status: 'ready', report: report({ nodeNames: ['item_bed'] }) } }, libraryModels: {} })
    expect(missing.some((c) => c.code === 'MODEL_NODE_MISSING')).toBe(true)
  })
})

describe('BR-09 số điện thoại', () => {
  it.each([
    ['+84 912 345 678', '0912345678'],
    ['0912.345.678', '0912345678'],
    ['84912345678', '0912345678'],
    ['091234', null],
    ['1912345678', null],
    ['09123456789', null],
  ])('%s → %s', (input, out) => expect(normalizePhoneVN(input)).toBe(out))
})

describe('tài liệu', () => {
  it('cloneDocument đổi id và giữ tham chiếu cửa → tường', () => {
    const d = doc()
    const c = cloneDocument(d)
    expect(c.floors[0].id).not.toBe(d.floors[0].id)
    const wallIds = new Set(c.floors[0].walls.map((w) => w.id))
    expect(c.floors[0].openings.every((o) => wallIds.has(o.wallId))).toBe(true)
    expect(d.floors[0].walls.some((w) => wallIds.has(w.id))).toBe(false)
  })
  it('duplicateFloor đặt tầng mới lên trên cùng', () => {
    const d = doc()
    const f = duplicateFloor(d, d.floors[0].id, 'Tầng 2')
    expect(f.elevation).toBe(3300)
    expect(f.order).toBe(2)
    expect(f.id).not.toBe(d.floors[0].id)
  })
  it('stripUnderlay bỏ ảnh nền (R-01)', () => {
    const d = doc()
    d.floors[0].underlay = { fileId: 'fil_in', mmPerPx: 10, offset: [0, 0], rotation: 0, opacity: 0.5 }
    expect(JSON.stringify(stripUnderlay(d))).not.toContain('fil_in')
  })
  it('gán đồ vào phòng theo vị trí', () => {
    const f = floor()
    f.items = [{ id: 'itm_1', source: { libraryItemId: 'lib_bed' }, position: [6500, 2000], elevation: 0, rotation: 0 }]
    const bedroom = f.rooms.find((r) => r.function === 'bedroom')!
    expect(assignItemsToRooms(f)).toEqual({ itm_1: bedroom.id })
  })
})

describe('planSvg', () => {
  it('có tường, cửa, tên + diện tích phòng, kích thước', () => {
    const { svg, empty } = planSvg(floor())
    expect(empty).toBe(false)
    expect(svg).toContain('Phòng khách')
    expect(svg).toMatch(/\d+,\d{2} m²/)
    expect(svg).toContain('8.200') // kích thước tổng theo mép ngoài
    expect(svg).toContain(' A ') // cung mở cửa
    expect(svg).toContain('data-room-id')
  })
  it('trả rỗng khi chưa hiệu chỉnh (BR-05)', () => {
    expect(planSvg({ ...floor(), calibrated: false }).empty).toBe(true)
  })
  it('escape chuỗi người dùng (R-16)', () => {
    const f = floor()
    f.rooms[0].name = '<script>alert(1)</script>'
    f.rooms[1].name = '" onload="alert(1)'
    const { svg } = planSvg(f)
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('" onload="')
    expect(svg).toContain('&lt;script&gt;')
  })
})

describe('lối đi — ROOM_UNREACHABLE', () => {
  const mk = (withDoor: boolean, open = false) =>
    floorFromRects({
      name: 'T1', order: 1, elevation: 0,
      rooms: [
        { name: 'Khách', function: 'living', rect: [0, 0, 5000, 4000] },
        { name: 'Ngủ', function: 'bedroom', rect: [5000, 0, 4000, 4000] },
      ],
      openings: [
        { kind: 'door', axis: 'x', at: 0, from: 1500, to: 2500 },
        ...(withDoor ? [{ kind: 'door' as const, axis: 'y' as const, at: 5000, from: 1500, to: 2400 }] : []),
      ],
      open: open ? [['Khách', 'Ngủ']] : undefined,
    })
  const docOf = (f: ReturnType<typeof mk>) => ({ ...emptyDocument(), floors: [f] })
  const unreachable = (f: ReturnType<typeof mk>, lib = {}) => auditFloor(docOf(f), f, lib).filter((i) => i.code === 'ROOM_UNREACHABLE').map((i) => f.rooms.find((r) => r.id === i.roomId)!.name)
  it('phòng không có cửa → cảnh báo; có cửa hoặc thông nhau → không', () => {
    expect(unreachable(mk(false))).toEqual(['Ngủ'])
    expect(unreachable(mk(true))).toEqual([])
    const f3 = mk(false, true)
    expect(f3.walls.some((w) => w.a[0] === 5000 && w.b[0] === 5000)).toBe(false)
    expect(unreachable(f3)).toEqual([])
  })
  it('đồ đặt chắn cửa → cảnh báo cửa bị chặn và phòng không vào được', () => {
    const f = mk(true)
    f.items = [{ id: 'w', source: { libraryItemId: 'wardrobe' }, position: [5400, 1950], elevation: 0, rotation: 90 }]
    const lib = { wardrobe: { category: 'storage', sizeMm: [1800, 2200, 600] as [number, number, number] } }
    const codes = auditFloor(docOf(f), f, lib).map((i) => i.code)
    expect(codes).toContain('DOOR_BLOCKED')
    expect(unreachable(f, lib)).toEqual(['Ngủ'])
  })
  it('cửa 0,9 m đi qua được — đầu tường không lấn vào khung cửa', () => {
    const f = mk(true)
    expect(standable([5000, 1950], obstaclesOf(f))).toBe(true)
    expect(auditFloor(docOf(f), f).filter((i) => i.code === 'NARROW_PASSAGE')).toEqual([])
  })
  it('tìm đường từ phòng này sang phòng kia qua cửa, không xuyên tường', () => {
    const f = mk(true)
    const g = buildNavGrid(f, obstaclesOf(f))
    const path = findPath(g, [2500, 3000], [7000, 3000])!
    expect(path.length).toBeGreaterThan(2)
    // có đi qua ô cửa (x = 5000, y 1500–2400)
    const cross = path.some((p, i) => i > 0 && (path[i - 1][0] - 5000) * (p[0] - 5000) <= 0 && Math.min(path[i - 1][1], p[1]) < 2400 && Math.max(path[i - 1][1], p[1]) > 1500)
    expect(cross).toBe(true)
    expect(findPath(buildNavGrid(mk(false), obstaclesOf(mk(false))), [2500, 3000], [7000, 3000])).toBeNull()
  })
})

describe('tour ảnh thật (item 02)', () => {
  const scene = (i: number, next = true) => ({ id: `scn_${i}`, fileId: `fil_${i}`, smallFileId: `fis_${i}`, title: `Cảnh ${i}`, highlights: [], ...(next ? { next: [0.5, 0.5] as [number, number] } : {}) })
  const ctx = { models: {}, libraryModels: {} }
  const base = (): HouseDocument => ({ ...emptyDocument(), coverFileId: 'fil_c' })
  it('mẫu nhà chỉ có tour (tầng rỗng) gửi duyệt được; tầng rỗng không bị kiểm hiệu chỉnh', () => {
    const d = { ...base(), tour: { autoplaySec: 4, scenes: [scene(1), scene(2, false)] } }
    expect(HouseDocumentSchema.safeParse(d).success).toBe(true)
    const codes = submitChecks(d, ctx).filter((c) => c.level === 'block').map((c) => c.code)
    expect(codes).toEqual([])
    expect(hasModel3d(d)).toBe(false)
    expect(hasTour(d)).toBe(true)
  })
  it('không có tầng dựng và không có tour → chặn; tour 1 cảnh → chặn; thiếu điểm đi tiếp → cảnh báo', () => {
    expect(submitChecks(base(), ctx).map((c) => c.code)).toContain('NO_CONTENT')
    const one = { ...base(), tour: { autoplaySec: 4, scenes: [scene(1)] } }
    expect(submitChecks(one, ctx).map((c) => c.code)).toContain('TOUR_TOO_SHORT')
    const noNext = { ...base(), tour: { autoplaySec: 4, scenes: [scene(1, false), scene(2, false)] } }
    const w = submitChecks(noNext, ctx).filter((c) => c.code === 'TOUR_NO_NEXT')
    expect(w).toHaveLength(1)
    expect(w[0].level).toBe('warn')
  })
  it('sao chép tài liệu đổi id cảnh và giữ liên kết phòng', () => {
    const f = floorFromRects({ name: 'T1', order: 1, elevation: 0, rooms: [{ name: 'K', function: 'living', rect: [0, 0, 4000, 4000] }] })
    const d = { ...base(), floors: [f], tour: { autoplaySec: 4, scenes: [{ ...scene(1), floorId: f.id, roomId: f.rooms[0].id }, scene(2)] } }
    const c = cloneDocument(d)
    expect(c.tour!.scenes[0].id).not.toBe('scn_1')
    expect(c.tour!.scenes[0].floorId).toBe(c.floors[0].id)
    expect(c.tour!.scenes[0].roomId).toBe(c.floors[0].rooms[0].id)
  })
})

describe('CR-3 — giá, chương', () => {
  it('giá kiểu Việt (BR-T6)', () => {
    expect(formatPriceVnd(12_500_000_000)).toBe('12,5 tỷ ₫')
    expect(formatPriceVnd(850_000_000)).toBe('850 triệu ₫')
    expect(formatPriceVnd(3_250_000_000)).toBe('3,25 tỷ ₫')
    expect(formatPriceVnd(null)).toBeNull()
  })
  it('chương theo cảnh trước, cảnh 1 mặc định Ngoài nhà (BR-T8); gợi ý từ tên', () => {
    expect(sceneChapters([{}, { chapter: 'interior' }, {}, { chapter: 'outdoor' }, {}])).toEqual(['interior', 'interior', 'interior', 'outdoor', 'outdoor'])
    expect(guessChapter('Hồ bơi lúc chạng vạng')).toBe('outdoor')
    expect(guessChapter('Mặt tiền')).toBe('exterior')
    expect(guessChapter('Nhìn lại ngôi nhà qua hồ')).toBe('exterior')
    expect(guessChapter('Sảnh lối vào')).toBe('interior')
    expect(guessChapter('Phòng khách')).toBe('interior')
    expect(guessChapter('Cảnh 7')).toBeUndefined()
  })
})

describe('vật liệu hoàn thiện (item 03)', async () => {
  const { materialIds, submitChecks, emptyDocument: empty, floorFromRects: rect, DEFAULT_FINISH } = await import('../src/index.ts')
  it('materialIds gom sàn / tường / trần + dùng chung; vật liệu nháp / ngừng dùng chặn gửi duyệt', () => {
    const f = rect({ name: 'T1', order: 1, elevation: 0, rooms: [{ name: 'Khách', function: 'living', rect: [0, 0, 4000, 4000] }] })
    f.rooms[0].finish = { floor: 'mat_go', wall: 'mat_son' }
    const d = { ...empty(), floors: [f], finishes: { door: 'mat_cua' } }
    expect(materialIds(d).sort()).toEqual(['mat_cua', 'mat_go', 'mat_son'])
    const ctx = { models: {}, libraryModels: {}, materials: { mat_go: { name: 'Gỗ', status: 'ready' as const }, mat_son: { name: 'Sơn', status: 'draft' as const } } }
    const blocks = submitChecks(d, ctx).filter((c) => c.code === 'MATERIAL_NOT_READY')
    expect(blocks.map((c) => c.objectId).sort()).toEqual(['mat_cua', 'mat_son'])
    expect(blocks.every((c) => c.level === 'block')).toBe(true)
  })
  it('mọi công năng phòng có vật liệu mặc định', () => {
    for (const v of Object.values(DEFAULT_FINISH)) expect(v.floor && v.wall && v.ceiling).toBeTruthy()
  })
})
