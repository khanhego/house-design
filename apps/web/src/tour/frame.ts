/*
 * Một "khung" ảnh của tour (dùng chung cho chế độ Từng cảnh và Phim — CR-3, FR-12.19):
 * nền mờ (chính ảnh đó, phủ kín) + ảnh chính. Ảnh dọc trên màn ngang hiện đủ ảnh (contain) thay vì cắt.
 *
 * <div class="tour-layer"><img class="tour-bg"><div class="tour-drift"><img class="tour-fg"></div></div>
 */

export const frameHtml = 'tour-layer'

const parts = (layer: HTMLElement) => ({
  bg: layer.querySelector<HTMLImageElement>('.tour-bg')!,
  fg: layer.querySelector<HTMLImageElement>('.tour-fg')!,
})

/** Ảnh quá "dọc" so với khung → hiện đủ ảnh trên nền mờ. */
const fitOf = (img: HTMLImageElement, box: { width: number; height: number }) => {
  const ar = (img.naturalWidth || 1) / (img.naturalHeight || 1)
  const boxAr = box.width / Math.max(1, box.height)
  return ar < boxAr * 0.8 ? 'contain' : 'cover'
}

/** Gắn ảnh vào khung, chờ giải mã xong rồi chọn cách hiện (cover / contain). */
export const setFrame = async (layer: HTMLElement, url: string) => {
  const { bg, fg } = parts(layer)
  if (fg.getAttribute('src') !== url) {
    fg.src = url
    bg.src = url
  }
  try {
    await fg.decode()
  } catch {
    /* ảnh hỏng vẫn tiếp tục */
  }
  layer.dataset.fit = fitOf(fg, layer.getBoundingClientRect())
}

/** Điểm đi tiếp (tỷ lệ trên ảnh) → toạ độ px trong khung, tính theo cách ảnh đang hiện. */
export const originFor = (layer: HTMLElement, box: DOMRect, p: [number, number] | undefined) => {
  const { fg } = parts(layer)
  const [nx, ny] = p ?? [0.5, 0.5]
  const w = fg.naturalWidth || box.width
  const h = fg.naturalHeight || box.height
  const s = layer.dataset.fit === 'contain' ? Math.min(box.width / w, box.height / h) : Math.max(box.width / w, box.height / h)
  const dw = w * s
  const dh = h * s
  return `${(box.width - dw) / 2 + nx * dw}px ${(box.height - dh) / 2 + ny * dh}px`
}

/** Đặt khung lên trước và chạy lại hiệu ứng trôi chậm (12 s). */
export const bringFront = (front: HTMLElement, back: HTMLElement | null) => {
  back?.classList.remove('front')
  front.classList.remove('front')
  void front.offsetWidth // khởi động lại animation
  front.classList.add('front')
}
