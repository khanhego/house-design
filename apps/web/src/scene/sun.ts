/*
 * Hướng nắng theo hướng nhà và giờ (item 03, FR-13.12). Vĩ độ 16°B (miền Trung — trung bình Việt Nam), ngày xuân phân
 * (mặt trời mọc chính Đông, lặn chính Tây, trưa ở phía Nam): đủ để vệt nắng qua cửa sổ đúng hướng và đổi theo giờ.
 *
 * Mặt bằng: x sang phải, y xuống dưới. `northDeg` = góc của hướng Bắc, đo theo chiều kim đồng hồ từ trục −y
 * (mặc định 180: Bắc ở phía y lớn — mặt tiền y nhỏ quay hướng Nam). Thế giới three.js: x = x, z = y, y hướng lên.
 */

const LAT = (16 * Math.PI) / 180

export interface Sun {
  /** vector đơn vị từ mặt đất hướng tới mặt trời (thế giới three.js) */
  dir: [number, number, number]
  /** độ cao mặt trời (rad) */
  altitude: number
  /** 0…1 — cường độ nắng (0 khi mặt trời ở dưới chân trời) */
  strength: number
}

export const sunFor = (northDeg = 180, hour = 9): Sun => {
  const H = ((hour - 12) * 15 * Math.PI) / 180 // góc giờ
  const dec = 0 // xuân phân
  const sinAlt = Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H)
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)))
  // phương vị đo từ Bắc theo chiều kim đồng hồ (Đông = 90°)
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(LAT) - Math.tan(dec) * Math.cos(LAT)) + Math.PI
  const t = (northDeg * Math.PI) / 180
  const N: [number, number] = [Math.sin(t), -Math.cos(t)] // hướng Bắc trên mặt bằng
  const E: [number, number] = [Math.cos(t), Math.sin(t)] // hướng Đông = Bắc quay 90° theo chiều kim đồng hồ
  const c = Math.cos(alt)
  const px = c * (N[0] * Math.cos(az) + E[0] * Math.sin(az))
  const py = c * (N[1] * Math.cos(az) + E[1] * Math.sin(az))
  return { dir: [px, Math.sin(alt), py], altitude: alt, strength: Math.max(0, Math.min(1, Math.sin(alt) * 2.2)) }
}

/** Màu nắng: chiều tà / sáng sớm ấm hơn. */
export const sunColor = (alt: number) => (alt < 0.35 ? '#ffd2a1' : alt < 0.7 ? '#ffe7c9' : '#fff6ea')
