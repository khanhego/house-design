/** CSV an toàn (R-27): BOM UTF-8, escape dấu nháy, chặn công thức (= + - @). */
export const toCsv = (header: string[], rows: (string | number | null | undefined)[][]) => {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
