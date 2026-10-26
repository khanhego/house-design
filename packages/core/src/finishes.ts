import type { RoomFunction } from './schema.ts'

/*
 * Vật liệu mặc định theo công năng phòng (item 03, FR-13.11) — theo `key` của vật liệu trong bộ chuẩn.
 * Dùng khi seed nhà mẫu và nút "Áp mặc định theo công năng" của trình dựng.
 */

/** Vật liệu mặc định theo công năng phòng (FR-13.11): sàn, tường, trần. */
export const DEFAULT_FINISH: Record<RoomFunction, { floor: string; wall: string; ceiling: string }> = {
  living: { floor: 'go-soi', wall: 'son-trang-nga', ceiling: 'son-trang' },
  bedroom: { floor: 'go-cong-nghiep-sang', wall: 'son-be', ceiling: 'son-trang' },
  study: { floor: 'parquet-chu-nhat', wall: 'son-xanh-sage', ceiling: 'son-trang' },
  kitchen: { floor: 'gach-noi-that', wall: 'son-trang', ceiling: 'son-trang' },
  dining: { floor: 'gach-noi-that', wall: 'son-trang-nga', ceiling: 'son-trang' },
  bathroom: { floor: 'granite-xam', wall: 'gach-men-op-tuong', ceiling: 'son-trang' },
  wc: { floor: 'granite-xam', wall: 'gach-men-op-tuong', ceiling: 'son-trang' },
  laundry: { floor: 'gach-noi-that', wall: 'son-xam-nhat', ceiling: 'son-trang' },
  worship: { floor: 'go-oc-cho-toi', wall: 'son-vang-kem', ceiling: 'son-trang' },
  hall: { floor: 'da-marble-trang', wall: 'son-trang-nga', ceiling: 'son-trang' },
  stair: { floor: 'da-marble-trang', wall: 'son-trang-nga', ceiling: 'son-trang' },
  storage: { floor: 'be-tong-mai', wall: 'son-xam-nhat', ceiling: 'son-trang' },
  garage: { floor: 'be-tong-son', wall: 'son-xam-nhat', ceiling: 'son-trang' },
  other: { floor: 'gach-noi-that', wall: 'son-trang-nga', ceiling: 'son-trang' },
}
export const DEFAULT_SHARED_FINISH = { door: 'go-mat-ban', frame: 'nhom-den', stair: 'go-soi' }
