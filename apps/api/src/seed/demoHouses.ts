import { emptyDocument, floorFromRects } from '@hd/core'
import type { Floor, HouseDocument, HouseType } from '@hd/core'
import { furnishHouse } from './furnish.ts'
import type { LibraryInput } from '../repos/repos.ts'

/* Dữ liệu demo (AC-01): 4 loại nhà, đồ thư viện chuyển từ catalog prototype (src/legacy/data/catalog.ts). */

const woods = [
  { id: 'oak', name: 'Gỗ sồi', color: '#c89f6e' },
  { id: 'walnut', name: 'Óc chó', color: '#6b4a32' },
  { id: 'white', name: 'Trắng mờ', color: '#ecebe6' },
]
const fabrics = [
  { id: 'stone', name: 'Xám đá', color: '#8a8f94' },
  { id: 'cream', name: 'Be kem', color: '#d9cbb4' },
  { id: 'moss', name: 'Xanh rêu', color: '#5e6b52' },
]

type RawItem = Omit<LibraryInput, 'imageFileIds' | 'modelAssetId'> & { key: string }

const RAW: RawItem[] = [
  { key: 'sofa', name: 'Sofa băng Oslo', category: 'sofa', sizeMm: [2200, 850, 950], material: 'Vải bố chống bám bẩn, khung gỗ dầu', brand: 'Oslo', description: 'Sofa 3 chỗ dáng thấp, đệm mút D40.', fallbackShape: 'sofa', variants: fabrics },
  { key: 'sofaL', name: 'Sofa góc L Milano', category: 'sofa', sizeMm: [2800, 850, 1800], material: 'Vải nhung, chân kim loại', brand: 'Milano', description: 'Sofa góc chữ L cho phòng khách từ 20 m².', fallbackShape: 'sofaL', variants: fabrics },
  { key: 'armchair', name: 'Ghế bành Luna', category: 'chair', sizeMm: [850, 850, 850], material: 'Vải bouclé, chân gỗ sồi', brand: 'Luna', description: 'Ghế đơn bo tròn.', fallbackShape: 'armchair', variants: fabrics },
  { key: 'coffee', name: 'Bàn trà Oak', category: 'table', sizeMm: [1100, 420, 600], material: 'Gỗ sồi tự nhiên', brand: 'Oak', description: 'Bàn trà có kệ dưới.', fallbackShape: 'coffeeTable', variants: woods },
  { key: 'tv', name: 'Kệ TV Nord', category: 'storage', sizeMm: [1800, 500, 420], material: 'MDF chống ẩm phủ veneer', brand: 'Nord', description: 'Kệ TV 2 ngăn kéo, đi dây âm.', fallbackShape: 'tvStand', variants: woods },
  { key: 'rug', name: 'Thảm len Dune', category: 'rug', sizeMm: [2400, 20, 1700], material: 'Len dệt tay', brand: 'Dune', description: 'Thảm len dày, tông trung tính.', fallbackShape: 'rug', variants: [{ id: 'sand', name: 'Cát', color: '#d8c7a8' }, { id: 'grey', name: 'Xám nhạt', color: '#b9b8b3' }] },
  { key: 'lamp', name: 'Đèn cây Arc', category: 'lighting', sizeMm: [400, 1700, 400], material: 'Thép sơn tĩnh điện, chụp vải lanh', brand: 'Arc', description: 'Ánh sáng vàng ấm 2700K.', fallbackShape: 'floorLamp', variants: [{ id: 'black', name: 'Đen', color: '#2b2b2b' }, { id: 'brass', name: 'Đồng', color: '#b08d57' }] },
  { key: 'plant', name: 'Chậu cây Monstera', category: 'plant', sizeMm: [500, 1300, 500], material: 'Chậu gốm men', brand: null, description: 'Cây trầu bà lá xẻ.', fallbackShape: 'plant', variants: [{ id: 'green', name: 'Xanh', color: '#4f7a45' }] },
  { key: 'shelf', name: 'Kệ sách Grid', category: 'storage', sizeMm: [1000, 1900, 350], material: 'Gỗ cao su ghép', brand: 'Grid', description: 'Kệ 5 tầng dạng lưới.', fallbackShape: 'bookshelf', variants: woods },
  { key: 'dining', name: 'Bàn ăn Walnut', category: 'table', sizeMm: [1600, 750, 900], material: 'Gỗ óc chó nguyên tấm', brand: 'Walnut', description: 'Bàn ăn 4–6 người.', fallbackShape: 'diningTable', variants: woods },
  { key: 'chair', name: 'Ghế ăn Café', category: 'chair', sizeMm: [450, 850, 500], material: 'Gỗ tần bì, nệm da PU', brand: 'Café', description: 'Ghế ăn tựa cong.', fallbackShape: 'chair', variants: woods },
  { key: 'kitchen', name: 'Tủ bếp chữ I Line', category: 'kitchen', sizeMm: [2400, 2200, 620], material: 'Acrylic bóng gương, mặt đá thạch anh', brand: 'Line', description: 'Tủ bếp trên dưới kèm bếp từ, chậu rửa.', fallbackShape: 'kitchen', variants: [{ id: 'white', name: 'Trắng', color: '#f2f1ec' }, { id: 'sage', name: 'Xanh sage', color: '#9aa891' }] },
  { key: 'fridge', name: 'Tủ lạnh Inverter 420L', category: 'appliance', sizeMm: [700, 1850, 700], material: 'Thép không gỉ', brand: null, description: 'Tủ lạnh 2 cánh tiết kiệm điện.', fallbackShape: 'fridge', variants: [{ id: 'steel', name: 'Inox', color: '#c9ccd0' }] },
  { key: 'bed', name: 'Giường Haven 1m6', category: 'bed', sizeMm: [1600, 1000, 2100], material: 'Khung gỗ, đầu giường bọc nỉ', brand: 'Haven', description: 'Giường bọc nỉ đầu cao.', fallbackShape: 'bed', variants: fabrics },
  { key: 'bedKing', name: 'Giường Haven 1m8', category: 'bed', sizeMm: [1800, 1050, 2100], material: 'Khung gỗ, đầu giường bọc nỉ', brand: 'Haven', description: 'Bản King cho phòng master.', fallbackShape: 'bed', variants: fabrics },
  { key: 'nightstand', name: 'Tab đầu giường Mini', category: 'storage', sizeMm: [500, 500, 400], material: 'MDF phủ melamine', brand: null, description: 'Tab 1 ngăn kéo.', fallbackShape: 'nightstand', variants: woods },
  { key: 'wardrobe', name: 'Tủ áo cánh lùa', category: 'storage', sizeMm: [1800, 2200, 600], material: 'MDF chống ẩm, ray lùa giảm chấn', brand: null, description: 'Tủ 2 cánh lùa.', fallbackShape: 'wardrobe', variants: woods },
  { key: 'desk', name: 'Bàn làm việc Focus', category: 'table', sizeMm: [1400, 750, 700], material: 'Mặt gỗ, chân thép', brand: 'Focus', description: 'Bàn có hộc tủ, máng đi dây.', fallbackShape: 'desk', variants: woods },
  { key: 'officeChair', name: 'Ghế công thái học', category: 'chair', sizeMm: [600, 1100, 600], material: 'Lưới, chân nhôm', brand: null, description: 'Ngả lưng, chỉnh tựa đầu.', fallbackShape: 'officeChair', variants: [{ id: 'black', name: 'Đen', color: '#2b2b2b' }] },
  { key: 'vanity', name: 'Tủ lavabo Aqua', category: 'bath', sizeMm: [900, 850, 500], material: 'PVC chống nước, chậu sứ', brand: 'Aqua', description: 'Tủ lavabo treo tường kèm gương.', fallbackShape: 'vanity', variants: woods },
  { key: 'toilet', name: 'Bồn cầu một khối', category: 'bath', sizeMm: [400, 800, 700], material: 'Sứ men nano', brand: null, description: 'Xả xoáy, nắp đóng êm.', fallbackShape: 'toilet', variants: [{ id: 'white', name: 'Trắng', color: '#f4f4f2' }] },
  { key: 'shower', name: 'Cabin tắm kính', category: 'bath', sizeMm: [900, 2000, 900], material: 'Kính cường lực 8 mm', brand: null, description: 'Cabin vuông, sen cây.', fallbackShape: 'shower', variants: [{ id: 'chrome', name: 'Chrome', color: '#c9ccd0' }] },
]

/** Khối dựng sẵn do đội làm: đội tự làm · CC0 · sẵn dùng (DEC-R18). */
export const LIBRARY: (LibraryInput & { key: string })[] = RAW.map((i) => ({
  ...i, imageFileIds: [], modelAssetId: null, sourceKind: 'in_house', sourceName: 'Nhà mẫu online', license: 'cc0', status: 'ready',
}))

type LibIds = Record<string, string>

const CATEGORY = Object.fromEntries(RAW.map((i) => [i.key, i.category]))

export interface DemoHouse {
  slug: string
  name: string
  houseType: HouseType
  declaredArea: number
  bedrooms: number
  bathrooms: number
  description: string
  document: HouseDocument
}

export const demoHouses = (lib: LibIds, sizes: Record<string, [number, number, number]>): DemoHouse[] => {
  const doc = (floors: Floor[]): HouseDocument => ({
    ...emptyDocument(),
    ...furnishHouse({ ...emptyDocument(), floors }, lib, sizes, CATEGORY),
  })

  // 1. Căn hộ 2PN — 1 sàn, lô gia
  const apt = doc([
    floorFromRects({
      name: 'Căn hộ', order: 1, elevation: 0, height: 3100,
      rooms: [
        { name: 'Phòng khách', function: 'living', rect: [0, 0, 5200, 4600] },
        { name: 'Bếp & ăn', function: 'kitchen', rect: [0, 4600, 5200, 3600] },
        { name: 'Phòng ngủ master', function: 'bedroom', rect: [5200, 0, 3800, 4200] },
        { name: 'WC master', function: 'bathroom', rect: [5200, 4200, 2000, 2200] },
        { name: 'WC chung', function: 'wc', rect: [7200, 4200, 1800, 2200] },
        { name: 'Phòng ngủ 2', function: 'bedroom', rect: [5200, 6400, 3800, 3200] },
      ],
      openings: [
        { kind: 'window', axis: 'x', at: 0, from: 800, to: 4400, sill: 300, height: 2000 },
        { kind: 'window', axis: 'x', at: 0, from: 5900, to: 8300 },
        { kind: 'door', axis: 'y', at: 0, from: 5600, to: 6600, swing: 'right' },
        { kind: 'door', axis: 'y', at: 5200, from: 3000, to: 3900, swing: 'right' },
        { kind: 'door', axis: 'y', at: 5200, from: 7200, to: 8100, swing: 'right' },
        { kind: 'door', axis: 'x', at: 4200, from: 5700, to: 6400 },
        { kind: 'door', axis: 'x', at: 6400, from: 7500, to: 8200, swing: 'right' },
        { kind: 'window', axis: 'x', at: 9600, from: 6000, to: 8200 },
      ],
      areas: [{ name: 'Lô gia', kind: 'loggia', rect: [-1400, 600, 1400, 3400] }],
      open: [['Phòng khách', 'Bếp & ăn']],
    }),
  ])

  // 2. Nhà phố 5 × 18 m — 4 tầng: T1, lửng, T2, T3 + sân thượng
  // thang chữ U (có chiếu nghỉ) đặt chồng cùng một chỗ ở mọi tầng, vào / ra ở phía mặt tiền của khối thang
  const W = 5000
  const stair = (toFloorId?: string) => ({ rect: [2800, 7000, 2200, 3800] as [number, number, number, number], upDirection: 90, shape: 'u' as const, toFloorId })
  const tp1 = floorFromRects({
    name: 'Tầng 1', order: 1, elevation: 0, height: 3600,
    rooms: [
      { name: 'Gara & sảnh', function: 'garage', rect: [0, 0, W, 5000] },
      { name: 'Phòng khách', function: 'living', rect: [0, 5000, W, 6000] },
      { name: 'Bếp & ăn', function: 'kitchen', rect: [0, 11000, W, 5000] },
      { name: 'WC', function: 'wc', rect: [0, 16000, 2200, 2000] },
      { name: 'Giặt phơi', function: 'laundry', rect: [2200, 16000, 2800, 2000] },
    ],
    openings: [
      { kind: 'door', axis: 'x', at: 0, from: 600, to: 4400, height: 2600 },
      { kind: 'door', axis: 'x', at: 5000, from: 700, to: 2100, swing: 'right' },
      { kind: 'door', axis: 'x', at: 11000, from: 700, to: 2300 },
      { kind: 'door', axis: 'x', at: 16000, from: 500, to: 1200 },
      { kind: 'door', axis: 'x', at: 16000, from: 3000, to: 3800 },
      { kind: 'window', axis: 'x', at: 18000, from: 2800, to: 4400 },
    ],
    stairs: [stair()],
  })
  const tpL = floorFromRects({
    name: 'Tầng lửng', order: 2, elevation: 3600, height: 2700,
    rooms: [
      { name: 'Phòng sinh hoạt', function: 'hall', rect: [0, 0, W, 5000] },
      { name: 'Phòng làm việc', function: 'study', rect: [0, 5000, W, 6000] },
    ],
    openings: [{ kind: 'window', axis: 'x', at: 0, from: 800, to: 4200, sill: 600, height: 1600 }],
    // lửng phủ phía trên phòng khách, là một không gian mở; bếp phía sau thông tầng
    open: [['Phòng sinh hoạt', 'Phòng làm việc']],
    stairs: [stair()],
  })
  const tp2 = floorFromRects({
    name: 'Tầng 2', order: 3, elevation: 6300, height: 3300,
    rooms: [
      { name: 'Phòng ngủ 1', function: 'bedroom', rect: [0, 0, W, 4800] },
      { name: 'WC 1', function: 'bathroom', rect: [0, 4800, 1800, 2200] },
      { name: 'Hành lang', function: 'hall', rect: [1800, 4800, 3200, 6000] },
      { name: 'Phòng ngủ 2', function: 'bedroom', rect: [0, 10800, W, 4400] },
      { name: 'WC 2', function: 'bathroom', rect: [0, 7000, 1800, 3800] },
    ],
    openings: [
      { kind: 'window', axis: 'x', at: 0, from: 900, to: 4100 },
      { kind: 'door', axis: 'x', at: 4800, from: 2900, to: 3700 },
      { kind: 'door', axis: 'y', at: 1800, from: 5200, to: 5900 },
      { kind: 'door', axis: 'y', at: 1800, from: 7600, to: 8300 },
      { kind: 'door', axis: 'x', at: 10800, from: 1900, to: 2700, swing: 'right' },
      { kind: 'window', axis: 'x', at: 15200, from: 1200, to: 3800 },
    ],
    stairs: [stair()],
  })
  const tp3 = floorFromRects({
    name: 'Tầng 3', order: 4, elevation: 9600, height: 3300,
    rooms: [
      { name: 'Phòng ngủ 3', function: 'bedroom', rect: [0, 0, W, 4800] },
      { name: 'Hành lang', function: 'hall', rect: [0, 4800, W, 6000] },
      { name: 'Phòng thờ', function: 'worship', rect: [0, 10800, W, 3600] },
    ],
    openings: [
      { kind: 'window', axis: 'x', at: 0, from: 900, to: 4100 },
      { kind: 'door', axis: 'x', at: 4800, from: 1800, to: 2700 },
      { kind: 'door', axis: 'x', at: 10800, from: 1000, to: 2400 },
      { kind: 'door', axis: 'x', at: 14400, from: 1500, to: 2500 },
    ],
    areas: [{ name: 'Sân thượng', kind: 'terrace', rect: [0, 14400, W, 3600] }],
  })
  tp1.stairs[0].toFloorId = tpL.id
  tpL.stairs[0].toFloorId = tp2.id
  tp2.stairs[0].toFloorId = tp3.id
  const town = doc([tp1, tpL, tp2, tp3])

  // 3. Biệt thự 3 tầng — sân vườn, hồ bơi
  // khối thang giữa nhà rộng 3 m: thang chữ U 2 m xếp chồng ở mọi tầng + lối đi 1 m bên cạnh thang
  const vs = (id?: string) => ({ rect: [6000, 4200, 2000, 3800] as [number, number, number, number], upDirection: 270, shape: 'u' as const, toFloorId: id })
  const v1 = floorFromRects({
    name: 'Tầng 1', order: 1, elevation: 0, height: 3800,
    rooms: [
      { name: 'Sảnh', function: 'hall', rect: [0, 0, 6000, 4000] },
      { name: 'Phòng khách', function: 'living', rect: [0, 4000, 6000, 6000] },
      { name: 'Bếp & ăn', function: 'kitchen', rect: [6000, 8000, 7000, 5000] },
      { name: 'Cầu thang', function: 'stair', rect: [6000, 4000, 3000, 4000] },
      { name: 'Phòng ngủ khách', function: 'bedroom', rect: [9000, 0, 4000, 5000] },
      { name: 'WC khách', function: 'wc', rect: [9000, 5000, 4000, 3000] },
      { name: 'Hành lang', function: 'hall', rect: [6000, 0, 3000, 4000] },
      { name: 'Phòng giặt', function: 'laundry', rect: [0, 10000, 6000, 3000] },
    ],
    openings: [
      { kind: 'door', axis: 'x', at: 0, from: 2000, to: 4000, height: 2700, swing: 'right' },
      { kind: 'window', axis: 'y', at: 0, from: 4800, to: 9200, sill: 200, height: 2400 },
      { kind: 'window', axis: 'x', at: 0, from: 10000, to: 12000 },
      // phòng ngủ khách mở ra hành lang, WC khách mở ra bếp ăn
      { kind: 'door', axis: 'y', at: 9000, from: 1500, to: 2400, swing: 'right' },
      { kind: 'door', axis: 'x', at: 8000, from: 9800, to: 10600 },
      { kind: 'window', axis: 'x', at: 13000, from: 7800, to: 10800, sill: 200, height: 2400 },
      { kind: 'door', axis: 'x', at: 13000, from: 11300, to: 12300 },
      { kind: 'door', axis: 'x', at: 10000, from: 2000, to: 2900 },
    ],
    // sảnh – hành lang, sảnh – khách – cầu thang – bếp ăn là không gian mở
    open: [['Sảnh', 'Phòng khách'], ['Sảnh', 'Hành lang'], ['Phòng khách', 'Cầu thang'], ['Cầu thang', 'Bếp & ăn'], ['Phòng khách', 'Bếp & ăn']],
    areas: [
      { name: 'Sân vườn trước', kind: 'garden', rect: [0, -5000, 13000, 5000] },
      { name: 'Sân sau', kind: 'yard', rect: [0, 13000, 13000, 6000] },
      { name: 'Hồ bơi', kind: 'pool', rect: [1500, 14200, 8000, 3800] },
    ],
    stairs: [vs()],
  })
  const v2 = floorFromRects({
    name: 'Tầng 2', order: 2, elevation: 3800, height: 3400,
    rooms: [
      { name: 'Phòng ngủ master', function: 'bedroom', rect: [0, 0, 6000, 5500] },
      { name: 'WC master', function: 'bathroom', rect: [0, 5500, 3000, 3000] },
      { name: 'Phòng thay đồ', function: 'storage', rect: [3000, 5500, 3000, 3000] },
      { name: 'Sảnh tầng', function: 'hall', rect: [6000, 4000, 3000, 4500] },
      { name: 'Phòng ngủ 2', function: 'bedroom', rect: [9000, 0, 4000, 4500] },
      { name: 'WC 2', function: 'bathroom', rect: [9000, 4500, 4000, 2500] },
      { name: 'Phòng ngủ 3', function: 'bedroom', rect: [9000, 7000, 4000, 4500] },
      { name: 'Phòng sinh hoạt', function: 'living', rect: [0, 8500, 9000, 3000] },
      { name: 'Hành lang', function: 'hall', rect: [6000, 0, 3000, 4000] },
    ],
    openings: [
      { kind: 'window', axis: 'x', at: 0, from: 1000, to: 5000, sill: 200, height: 2400 },
      { kind: 'door', axis: 'y', at: 6000, from: 1000, to: 1900, swing: 'right' },
      { kind: 'door', axis: 'x', at: 5500, from: 1000, to: 1800 },
      { kind: 'door', axis: 'x', at: 5500, from: 4100, to: 4900 },
      { kind: 'door', axis: 'y', at: 9000, from: 2800, to: 3700 },
      { kind: 'door', axis: 'x', at: 4500, from: 10000, to: 10800 },
      { kind: 'door', axis: 'y', at: 9000, from: 8600, to: 9500, swing: 'right' },
      { kind: 'window', axis: 'x', at: 0, from: 9800, to: 12200 },
    ],
    open: [['Sảnh tầng', 'Hành lang'], ['Sảnh tầng', 'Phòng sinh hoạt']],
    stairs: [vs()],
  })
  const v3 = floorFromRects({
    name: 'Tầng 3', order: 3, elevation: 7200, height: 3200,
    rooms: [
      { name: 'Phòng thờ', function: 'worship', rect: [0, 0, 6000, 4000] },
      { name: 'Phòng làm việc', function: 'study', rect: [0, 4000, 6000, 4000] },
      // sảnh tầng chạy hết chiều sâu khối thang: đầu thang từ tầng 2 lên ra đây
      { name: 'Sảnh tầng', function: 'hall', rect: [6000, 0, 3000, 9500] },
    ],
    openings: [
      { kind: 'door', axis: 'x', at: 4000, from: 2400, to: 3600 },
      { kind: 'door', axis: 'y', at: 6000, from: 1000, to: 2000 },
      { kind: 'door', axis: 'y', at: 9000, from: 1500, to: 2500, swing: 'right' },
      { kind: 'window', axis: 'x', at: 0, from: 1500, to: 4500 },
    ],
    areas: [{ name: 'Sân thượng', kind: 'terrace', rect: [9000, 0, 4000, 11500] }],
  })
  v1.stairs[0].toFloorId = v2.id
  v2.stairs[0].toFloorId = v3.id
  const villa = doc([v1, v2, v3])

  // 4. Nhà vườn cấp 4 — 1 tầng, sân trước
  const cottage = doc([
    floorFromRects({
      name: 'Tầng 1', order: 1, elevation: 0, height: 3600,
      rooms: [
        { name: 'Phòng khách', function: 'living', rect: [0, 0, 5000, 6000] },
        { name: 'Phòng thờ', function: 'worship', rect: [5000, 0, 4000, 3000] },
        { name: 'Phòng ngủ 1', function: 'bedroom', rect: [5000, 3000, 4000, 4000] },
        { name: 'Bếp & ăn', function: 'kitchen', rect: [0, 6000, 5000, 4500] },
        { name: 'Phòng ngủ 2', function: 'bedroom', rect: [5000, 7000, 4000, 4000] },
        { name: 'WC', function: 'wc', rect: [0, 10500, 3000, 2500] },
        { name: 'Kho', function: 'storage', rect: [3000, 10500, 2000, 2500] },
        { name: 'Hiên sau', function: 'hall', rect: [5000, 11000, 4000, 2000] },
      ],
      openings: [
        { kind: 'door', axis: 'x', at: 0, from: 1500, to: 3500, height: 2600, swing: 'right' },
        { kind: 'window', axis: 'y', at: 0, from: 1000, to: 4500 },
        { kind: 'door', axis: 'y', at: 5000, from: 1000, to: 1900 },
        { kind: 'door', axis: 'y', at: 5000, from: 4200, to: 5100, swing: 'right' },
        { kind: 'door', axis: 'x', at: 6000, from: 1500, to: 3500 },
        { kind: 'door', axis: 'y', at: 5000, from: 8200, to: 9100, swing: 'right' },
        { kind: 'door', axis: 'x', at: 10500, from: 1000, to: 1800 },
        { kind: 'door', axis: 'x', at: 10500, from: 3600, to: 4400, swing: 'right' },
        { kind: 'window', axis: 'y', at: 9000, from: 4000, to: 6000 },
        { kind: 'window', axis: 'y', at: 9000, from: 8000, to: 10000 },
        { kind: 'door', axis: 'x', at: 11000, from: 6500, to: 7500 },
      ],
      areas: [
        { name: 'Sân trước', kind: 'yard', rect: [0, -4000, 9000, 4000] },
        { name: 'Vườn rau', kind: 'garden', rect: [9000, 0, 3000, 13000] },
      ],
    }),
  ])

  return [
    { slug: 'can-ho-a2', name: 'Căn hộ A2 · 2 phòng ngủ', houseType: 'apartment', declaredArea: 78, bedrooms: 2, bathrooms: 2, description: 'Căn hộ góc 2 mặt thoáng, lô gia hướng Đông Nam.', document: apt },
    { slug: 'nha-pho-a1', name: 'Nhà phố A1 · 5 × 18 m', houseType: 'townhouse', declaredArea: 302, bedrooms: 3, bathrooms: 3, description: '4 tầng có tầng lửng và sân thượng, gara ô tô.', document: town },
    { slug: 'biet-thu-b2', name: 'Biệt thự B2 · sân vườn', houseType: 'villa', declaredArea: 395, bedrooms: 4, bathrooms: 4, description: 'Biệt thự 3 tầng, sân vườn trước, hồ bơi sau nhà.', document: villa },
    { slug: 'nha-vuon-c1', name: 'Nhà vườn C1 · mái thái', houseType: 'cottage', declaredArea: 117, bedrooms: 2, bathrooms: 1, description: 'Nhà cấp 4 một tầng, hiên sau và vườn rau.', document: cottage },
  ]
}
