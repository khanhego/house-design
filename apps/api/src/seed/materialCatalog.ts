/*
 * Bộ vật liệu chuẩn ban đầu (item 03, DEC-R7: 30 vật liệu). Vật liệu có ảnh vân lấy từ Poly Haven (CC0, ảnh quét
 * thật, kích thước thật theo mm); sơn và kim loại là vật liệu màu, không cần ảnh. Ảnh vân đã tải sẵn vào
 * `seed/materials/<key>/` bằng `node scripts/fetch-materials.ts` để seed, CI và bản demo tĩnh chạy không cần mạng.
 */

export type MaterialCategory = 'wood' | 'tile' | 'stone' | 'concrete' | 'paint' | 'plaster' | 'brick' | 'metal' | 'fabric' | 'other'

export interface CatalogMaterial {
  key: string
  name: string
  category: MaterialCategory
  /** kích thước thật một ô vân (mm) — gạch 600 × 600 phủ đúng 0,6 m */
  tileMm: [number, number]
  /** màu nền (vật liệu màu) hoặc màu trung bình (vật liệu có ảnh) */
  color: string
  roughness: number
  metalness?: number
  /** id trên Poly Haven nếu có ảnh vân */
  polyhaven?: string
  /** gạch men sinh bằng code (Poly Haven không có gạch men ốp sạch): số viên theo ngang × dọc trong một ô vân, màu men, màu ron, bề rộng ron (mm) */
  generated?: { cols: number; rows: number; glaze: string; grout: string; groutMm: number }
}

const PH = (id: string) => `https://polyhaven.com/a/${id}`
export const sourceUrlOf = (m: CatalogMaterial) => (m.polyhaven ? PH(m.polyhaven) : null)

export const MATERIAL_CATALOG: CatalogMaterial[] = [
  // gỗ sàn
  { key: 'go-cong-nghiep-sang', name: 'Sàn gỗ công nghiệp sáng', category: 'wood', tileMm: [1700, 1700], color: '#c9a77c', roughness: 0.55, polyhaven: 'laminate_floor_02' },
  { key: 'go-soi', name: 'Sàn gỗ sồi tự nhiên', category: 'wood', tileMm: [1700, 1700], color: '#b98e5f', roughness: 0.5, polyhaven: 'wood_floor' },
  { key: 'parquet-chu-nhat', name: 'Sàn parquet ô chữ nhật', category: 'wood', tileMm: [2250, 2250], color: '#a87c52', roughness: 0.5, polyhaven: 'rectangular_parquet' },
  { key: 'parquet-xuong-ca', name: 'Sàn parquet xương cá', category: 'wood', tileMm: [2360, 2360], color: '#9c7048', roughness: 0.5, polyhaven: 'diagonal_parquet' },
  { key: 'go-oc-cho-toi', name: 'Sàn gỗ óc chó tối màu', category: 'wood', tileMm: [2000, 2000], color: '#5e4330', roughness: 0.55, polyhaven: 'dark_wooden_planks' },
  // gạch, đá sàn
  { key: 'gach-trang-lon', name: 'Gạch men trắng khổ lớn', category: 'tile', tileMm: [3000, 3000], color: '#e7e4df', roughness: 0.3, polyhaven: 'floor_tiles_06' },
  { key: 'da-marble-trang', name: 'Đá marble trắng', category: 'stone', tileMm: [1500, 1500], color: '#ecebe8', roughness: 0.2, polyhaven: 'marble_01' },
  { key: 'gach-noi-that', name: 'Gạch lát nội thất xám', category: 'tile', tileMm: [1900, 1900], color: '#bdbab4', roughness: 0.35, polyhaven: 'interior_tiles' },
  { key: 'terrazzo', name: 'Gạch terrazzo', category: 'tile', tileMm: [2000, 2000], color: '#d6d0c6', roughness: 0.35, polyhaven: 'terrazzo_tiles' },
  { key: 'granite-xam', name: 'Đá granite xám', category: 'stone', tileMm: [1800, 1800], color: '#8e8c88', roughness: 0.3, polyhaven: 'granite_tile_03' },
  { key: 'gach-nung', name: 'Gạch nung đỏ', category: 'tile', tileMm: [2080, 2080], color: '#b0674a', roughness: 0.7, polyhaven: 'terracotta_floor_tiles' },
  { key: 'da-slate', name: 'Đá slate đen', category: 'stone', tileMm: [2000, 2000], color: '#55565a', roughness: 0.6, polyhaven: 'slate_floor_03' },
  // bê tông
  { key: 'be-tong-mai', name: 'Bê tông mài nâu', category: 'concrete', tileMm: [2000, 2000], color: '#a9a8a4', roughness: 0.6, polyhaven: 'smooth_concrete_floor' },
  { key: 'be-tong-son', name: 'Sàn bê tông sơn xanh', category: 'concrete', tileMm: [2000, 2000], color: '#9fa3a3', roughness: 0.55, polyhaven: 'painted_concrete' },
  // tường có vân
  { key: 'vua-trang', name: 'Tường vữa trắng', category: 'plaster', tileMm: [2000, 2000], color: '#ece9e3', roughness: 0.9, polyhaven: 'white_stucco' },
  { key: 'tuong-trat', name: 'Tường trát mộc', category: 'plaster', tileMm: [3200, 3200], color: '#d8d0c4', roughness: 0.9, polyhaven: 'plastered_wall_04' },
  { key: 'gach-tran', name: 'Tường gạch trần', category: 'brick', tileMm: [2000, 2000], color: '#a0644c', roughness: 0.85, polyhaven: 'brick_wall_13' },
  // ốp tường
  { key: 'gach-men-op-tuong', name: 'Gạch men ốp tường trắng 300 × 600', category: 'tile', tileMm: [1200, 1200], color: '#f2f2ef', roughness: 0.12, generated: { cols: 2, rows: 4, glaze: '#f3f3f0', grout: '#c9c9c4', groutMm: 2 } },
  // gỗ cửa, bậc thang
  { key: 'go-tu-bep', name: 'Gỗ tự nhiên vân thẳng', category: 'wood', tileMm: [600, 600], color: '#a7774a', roughness: 0.5, polyhaven: 'kitchen_wood' },
  { key: 'go-mat-ban', name: 'Gỗ óc chó mặt bàn', category: 'wood', tileMm: [1500, 1500], color: '#7a5235', roughness: 0.45, polyhaven: 'wood_table_001' },
  // sơn tường (vật liệu màu)
  { key: 'son-trang-nga', name: 'Sơn trắng ngà', category: 'paint', tileMm: [1000, 1000], color: '#f1ede4', roughness: 0.9 },
  { key: 'son-trang', name: 'Sơn trắng tinh', category: 'paint', tileMm: [1000, 1000], color: '#f7f7f4', roughness: 0.9 },
  { key: 'son-xam-nhat', name: 'Sơn xám nhạt', category: 'paint', tileMm: [1000, 1000], color: '#d9d8d3', roughness: 0.9 },
  { key: 'son-be', name: 'Sơn be ấm', category: 'paint', tileMm: [1000, 1000], color: '#e6d8c3', roughness: 0.9 },
  { key: 'son-xanh-sage', name: 'Sơn xanh sage', category: 'paint', tileMm: [1000, 1000], color: '#b7c2ad', roughness: 0.9 },
  { key: 'son-xanh-navy', name: 'Sơn xanh navy', category: 'paint', tileMm: [1000, 1000], color: '#3c4a60', roughness: 0.85 },
  { key: 'son-hong-dat', name: 'Sơn hồng đất', category: 'paint', tileMm: [1000, 1000], color: '#d4a998', roughness: 0.9 },
  { key: 'son-vang-kem', name: 'Sơn vàng kem', category: 'paint', tileMm: [1000, 1000], color: '#efe0b8', roughness: 0.9 },
  // kim loại (khung cửa sổ, lan can)
  { key: 'nhom-den', name: 'Nhôm sơn tĩnh điện đen', category: 'metal', tileMm: [1000, 1000], color: '#2b2c2e', roughness: 0.45, metalness: 0.6 },
  { key: 'inox', name: 'Inox xước', category: 'metal', tileMm: [1000, 1000], color: '#b9bcbf', roughness: 0.35, metalness: 1 },
]

/** Vật liệu mặc định theo công năng phòng — dùng chung với trình dựng (@hd/core finishes.ts). */
export { DEFAULT_FINISH, DEFAULT_SHARED_FINISH } from '@hd/core'
