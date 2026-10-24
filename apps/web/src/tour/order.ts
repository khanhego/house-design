/* Sắp ảnh tour và đặt tên cảnh từ tên tệp (item 02, FR-12.02, EX-T2). */

export interface PhotoInput {
  name: string
  /** thời điểm chụp từ EXIF (ISO, không múi giờ) */
  takenAt?: string | null
  /** thứ tự người dùng chọn tệp */
  index: number
}

/** Số thứ tự ở đầu tên tệp: "01-mat-tien.jpg" → 1. */
export const leadingNumber = (name: string): number | null => {
  const m = name.match(/^\s*(\d{1,4})(?!\d)/)
  return m ? Number(m[1]) : null
}

/** Cách hệ thống đã xếp — để báo người dựng kiểm lại khi không theo tên tệp. */
export type OrderedBy = 'name' | 'time' | 'selection'

/**
 * Xếp theo số đầu tên tệp; tệp không có số xếp sau, theo thời điểm chụp rồi thứ tự chọn.
 * Không tệp nào có số → theo thời điểm chụp (nếu đủ) → theo thứ tự chọn.
 */
export const orderPhotos = <T extends PhotoInput>(list: T[]): { items: T[]; by: OrderedBy } => {
  const num = (x: T) => leadingNumber(x.name)
  const time = (x: T) => x.takenAt ?? ''
  const byTimeThenIndex = (a: T, b: T) => (time(a) && time(b) && time(a) !== time(b) ? (time(a) < time(b) ? -1 : 1) : a.index - b.index)
  const numbered = list.filter((x) => num(x) !== null)
  if (numbered.length) {
    const rest = list.filter((x) => num(x) === null).sort(byTimeThenIndex)
    const items = [...numbered.sort((a, b) => num(a)! - num(b)! || a.index - b.index), ...rest]
    return { items, by: rest.length ? 'selection' : 'name' }
  }
  if (list.every((x) => x.takenAt)) return { items: [...list].sort(byTimeThenIndex), by: 'time' }
  return { items: [...list].sort((a, b) => a.index - b.index), by: 'selection' }
}

/** Từ không dấu thường gặp trong tên tệp (theo kịch bản chụp §11) → tiếng Việt có dấu. */
const WORDS: [RegExp, string][] = [
  [/\bphong khach\b/g, 'phòng khách'],
  [/\bphong sinh hoat\b/g, 'phòng sinh hoạt'],
  [/\bphong thay do\b/g, 'phòng thay đồ'],
  [/\bphong tre em\b/g, 'phòng trẻ em'],
  [/\bnha ve sinh\b/g, 'nhà vệ sinh'],
  [/\bnha bep\b/g, 'nhà bếp'],
  [/\bgara\b/g, 'gara'],
  [/\bho boi\b/g, 'hồ bơi'],
  [/\bsan sau\b/g, 'sân sau'],
  [/\bsan truoc\b/g, 'sân trước'],
  [/\btoan canh\b/g, 'toàn cảnh'],
  [/\bphong ngu\b/g, 'phòng ngủ'],
  [/\bphong an\b/g, 'phòng ăn'],
  [/\bphong tho\b/g, 'phòng thờ'],
  [/\bphong lam viec\b/g, 'phòng làm việc'],
  [/\bphong tam\b/g, 'phòng tắm'],
  [/\bphong giat\b/g, 'phòng giặt'],
  [/\bmat tien\b/g, 'mặt tiền'],
  [/\bcua chinh\b/g, 'cửa chính'],
  [/\bcau thang\b/g, 'cầu thang'],
  [/\bsan thuong\b/g, 'sân thượng'],
  [/\bsan vuon\b/g, 'sân vườn'],
  [/\bban cong\b/g, 'ban công'],
  [/\bhanh lang\b/g, 'hành lang'],
  [/\bsanh tang\b/g, 'sảnh tầng'],
  [/\bsanh\b/g, 'sảnh'],
  [/\bbep\b/g, 'bếp'],
  [/\bcong\b/g, 'cổng'],
  [/\bsan\b/g, 'sân'],
  [/\btang\b/g, 'tầng'],
  [/\blo gia\b|\blogia\b/g, 'lô gia'],
  [/\bwc\b/g, 'WC'],
]

/** "03-phong-khach.jpg" → "Phòng khách"; tên rỗng → "Cảnh n". */
export const sceneTitle = (fileName: string, n: number) => {
  // macOS trả tên tệp dạng tách dấu (NFD) → chuẩn hoá để so khớp từ điển và gợi ý chương
  let t = fileName
    .normalize('NFC')
    .replace(/\.[^.]+$/, '')
    .replace(/^\s*\d{1,4}\s*[-_.)\s]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return `Cảnh ${n}`
  const lower = t.toLowerCase()
  if (lower === t || /^[a-z0-9 ]+$/i.test(t)) {
    t = WORDS.reduce((s, [re, vi]) => s.replace(re, vi), lower)
  }
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 80)
}

/* Thứ tự cảnh & clip chuyển cảnh (BR-T3): clip quay từ cảnh n sang n+1, cặp đổi thì clip mất hiệu lực. */

interface Linkable {
  id: string
  clipFileId?: string
  clipSource?: 'upload' | 'ai'
}

const dropClip = <T extends Linkable>(s: T): T => {
  const { clipFileId: _c, clipSource: _s, ...rest } = s
  return rest as T
}

/** Gỡ clip của mọi cảnh mà cảnh kế tiếp đã khác so với danh sách trước. Trả danh sách mới + số clip đã gỡ. */
export const relinkClips = <T extends Linkable>(before: T[], after: T[]): { list: T[]; dropped: number } => {
  const nextOf = new Map(before.map((s, i) => [s.id, before[i + 1]?.id]))
  let dropped = 0
  const list = after.map((s, i) => {
    if (s.clipFileId && nextOf.get(s.id) !== after[i + 1]?.id) {
      dropped++
      return dropClip(s)
    }
    return s
  })
  return { list, dropped }
}

/** Kéo cảnh `fromId` thả lên `toId`: kéo tới thì đứng sau, kéo lui thì đứng trước. */
export const moveScene = <T extends Linkable>(list: T[], fromId: string, toId: string) => {
  const from = list.findIndex((s) => s.id === fromId)
  const to = list.findIndex((s) => s.id === toId)
  if (from < 0 || to < 0 || from === to) return { list, dropped: 0 }
  const out = [...list]
  const [it] = out.splice(from, 1)
  out.splice(out.findIndex((s) => s.id === toId) + (from < to ? 1 : 0), 0, it)
  return relinkClips(list, out)
}

/** Xoá cảnh: clip của cảnh đứng trước (đang trỏ vào cảnh bị xoá) bị gỡ. */
export const removeScene = <T extends Linkable>(list: T[], id: string) => relinkClips(list, list.filter((s) => s.id !== id))

/** Thay ảnh cảnh `id`: gỡ clip của cặp (n−1 → n) và (n → n+1) vì khung đầu/cuối không còn khớp (R-T-08). */
export const replacedImage = <T extends Linkable>(list: T[], id: string) => {
  const i = list.findIndex((s) => s.id === id)
  let dropped = 0
  const out = list.map((s, k) => ((k === i || k === i - 1) && s.clipFileId ? (dropped++, dropClip(s)) : s))
  return { list: out, dropped }
}
