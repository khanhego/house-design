/*
 * Làm sạch MP4 tải lên làm clip chuyển cảnh (item 02, BR-T5, R-T-02).
 * iPhone ghi toạ độ GPS trong moov/udta (©xyz), moov/meta (com.apple.quicktime.location.ISO6709) và uuid (XMP).
 * Đổi kiểu các hộp đó thành `free` và ghi 0 lên toàn bộ nội dung — giữ nguyên kích thước nên mọi offset (stco/co64)
 * vẫn đúng, video phát bình thường, và không còn byte toạ độ nào trong tệp.
 */

const STRIP = new Set(['udta', 'meta', 'uuid'])
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf'])

interface Box {
  type: string
  start: number
  header: number
  end: number
}

const boxes = (buf: Buffer, from: number, to: number): Box[] => {
  const out: Box[] = []
  let p = from
  while (p + 8 <= to) {
    let size = buf.readUInt32BE(p)
    const type = buf.toString('latin1', p + 4, p + 8)
    let header = 8
    if (size === 1) {
      if (p + 16 > to) break
      size = Number(buf.readBigUInt64BE(p + 8))
      header = 16
    } else if (size === 0) size = to - p
    if (size < header || p + size > to) break
    out.push({ type, start: p, header, end: p + size })
    p += size
  }
  return out
}

/** Kiểm đúng MP4 (hộp đầu là `ftyp`, có `moov`) và xoá metadata tại chỗ. Trả số hộp đã vô hiệu hoá, hoặc null nếu không phải MP4. */
export const sanitizeMp4 = (buf: Buffer): number | null => {
  if (buf.length < 16 || buf.toString('latin1', 4, 8) !== 'ftyp') return null
  const top = boxes(buf, 0, buf.length)
  if (!top.some((b) => b.type === 'moov')) return null
  let n = 0
  const walk = (list: Box[]) => {
    for (const b of list) {
      if (STRIP.has(b.type)) {
        buf.write('free', b.start + 4, 'latin1')
        buf.fill(0, b.start + b.header, b.end)
        n++
      } else if (CONTAINERS.has(b.type)) walk(boxes(buf, b.start + b.header, b.end))
    }
  }
  walk(top)
  return n
}
