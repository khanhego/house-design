/** Khung vẽ trên A3 ngang (mm) — dùng chung cho lib/pdf.ts và test. */
export const DRAW = { x: 12, y: 12, w: 396, h: 236 }

/** Chọn tỷ lệ chuẩn lớn nhất vừa khung vẽ (1:50 → 1:100 → 1:200). */
export const pickScale = (wMm: number, hMm: number) => [50, 100, 200, 500].find((k) => wMm / k <= DRAW.w && hMm / k <= DRAW.h) ?? 500
