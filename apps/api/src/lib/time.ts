const VN_OFFSET_MS = 7 * 3600 * 1000

/** Ngày (YYYY-MM-DD) theo giờ Việt Nam. */
export const vnDate = (d: Date = new Date()) => new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10)

/** Mốc UTC của 00:00 giờ VN ngày `ymd`. */
export const vnStartOfDay = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) - VN_OFFSET_MS)

export const addDays = (ymd: string, days: number) => {
  const d = new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86400000)
  return d.toISOString().slice(0, 10)
}

/** Số ngày làm việc (T2–T6, giờ VN) đã trọn vẹn trôi qua từ `from` tới `to`. */
export const businessDaysBetween = (from: Date, to: Date) => {
  let count = 0
  const cur = new Date(from.getTime() + VN_OFFSET_MS)
  const end = new Date(to.getTime() + VN_OFFSET_MS)
  while (true) {
    cur.setUTCDate(cur.getUTCDate() + 1)
    if (cur > end) break
    const dow = cur.getUTCDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}
