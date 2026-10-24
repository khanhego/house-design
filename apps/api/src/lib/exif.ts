/*
 * Đọc DateTimeOriginal (thẻ 0x9003) từ khối EXIF sharp trả về — để xếp ảnh tour theo giờ chụp (EX-T2, R-T-07).
 * Không có thì lấy DateTime (0x0132) của IFD0.
 */

const fmt = (s: string) => {
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null
}

export const exifDate = (exif?: Buffer): string | null => {
  if (!exif || exif.length < 14) return null
  try {
    const t = exif.toString('latin1', 0, 6) === 'Exif\0\0' ? 6 : 0
    const le = exif.toString('latin1', t, t + 2) === 'II'
    const u16 = (o: number) => (le ? exif.readUInt16LE(t + o) : exif.readUInt16BE(t + o))
    const u32 = (o: number) => (le ? exif.readUInt32LE(t + o) : exif.readUInt32BE(t + o))
    const readIfd = (off: number) => {
      const tags = new Map<number, { type: number; count: number; value: number }>()
      const n = u16(off)
      for (let i = 0; i < n; i++) {
        const e = off + 2 + i * 12
        tags.set(u16(e), { type: u16(e + 2), count: u32(e + 4), value: u32(e + 8) })
      }
      return tags
    }
    const ascii = (tag?: { type: number; count: number; value: number }) =>
      tag && tag.type === 2 && tag.count >= 19 ? exif.toString('latin1', t + tag.value, t + tag.value + 19) : null
    const ifd0 = readIfd(u32(4))
    const exifPtr = ifd0.get(0x8769)
    const original = exifPtr ? ascii(readIfd(exifPtr.value).get(0x9003)) : null
    return fmt(original ?? ascii(ifd0.get(0x0132)) ?? '')
  } catch {
    return null
  }
}
