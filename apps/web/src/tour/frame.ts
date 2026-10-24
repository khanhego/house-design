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

/** Phủ kín khung mà phải cắt quá 12% ảnh → hiện đủ ảnh trên nền mờ (CR-4: không tràn viền). */
const fitOf = (img: HTMLImageElement, box: { width: number; height: number }) => {
  const ar = (img.naturalWidth || 1) / (img.naturalHeight || 1)
  const boxAr = box.width / Math.max(1, box.height)
  return Math.min(ar, boxAr) / Math.max(ar, boxAr) < 0.88 ? 'contain' : 'cover'
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
export const pointPx = (layer: HTMLElement, box: { width: number; height: number }, p: [number, number] | undefined): [number, number] => {
  const { fg } = parts(layer)
  const [nx, ny] = p ?? [0.5, 0.5]
  const w = fg.naturalWidth || box.width
  const h = fg.naturalHeight || box.height
  const s = layer.dataset.fit === 'contain' ? Math.min(box.width / w, box.height / h) : Math.max(box.width / w, box.height / h)
  const dw = w * s
  const dh = h * s
  return [(box.width - dw) / 2 + nx * dw, (box.height - dh) / 2 + ny * dh]
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Chuyển cảnh "bước tới" (CR-4), t = 0 → 1. Máy ảnh tiến nhẹ về điểm đi tiếp của cảnh trước (phóng tối đa 1,12),
 * cảnh sau hiện ra từ chính hướng đó, hơi nhoè rồi rõ dần — như bước qua một ô cửa. Ảnh cảnh trước giữ nguyên tới khi
 * cảnh sau đã phủ gần kín, nên không lộ hai ảnh chồng nhau. Lùi lại = chạy t từ 1 về 0.
 */
export const walk = (from: HTMLElement, to: HTMLElement, box: { width: number; height: number }, p: [number, number] | undefined, t: number) => {
  const [px, py] = pointPx(from, box, p)
  const dx = px - box.width / 2
  const dy = py - box.height / 2
  const a = smooth(0, 1, t)
  const u = smooth(0.25, 0.95, t)
  from.style.transformOrigin = `${px}px ${py}px`
  from.style.transform = `translate(${-dx * 0.18 * a}px, ${-dy * 0.18 * a}px) scale(${1 + 0.12 * a})`
  from.style.filter = `blur(${(5 * smooth(0.35, 0.9, t)).toFixed(2)}px)`
  from.style.opacity = String(1 - smooth(0.8, 1, t))
  from.style.zIndex = '1'
  to.style.transformOrigin = '50% 50%'
  to.style.transform = `translate(${dx * 0.1 * (1 - u)}px, ${dy * 0.1 * (1 - u)}px) scale(${1.06 - 0.06 * u})`
  to.style.filter = `blur(${(5 * (1 - u)).toFixed(2)}px)`
  to.style.opacity = String(smooth(0.2, 0.75, t))
  to.style.zIndex = '2'
}

/** Đưa khung về trạng thái đứng yên. */
export const rest = (layer: HTMLElement, opacity: number) => {
  layer.style.transform = ''
  layer.style.filter = ''
  layer.style.opacity = String(opacity)
}

/** Đặt khung lên trước và chạy lại hiệu ứng trôi chậm. */
export const bringFront = (front: HTMLElement, back: HTMLElement | null) => {
  back?.classList.remove('front')
  front.classList.remove('front')
  void front.offsetWidth // khởi động lại animation
  front.classList.add('front')
}
