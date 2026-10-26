import type { jsPDF } from 'jspdf'

/* Font tiếng Việt nhúng cho PDF (R-10) — dùng chung cho PDF mặt bằng và kịch bản chụp. */

export const PDF_FONT = 'BeVietnamPro'

const toBase64 = (buf: ArrayBuffer) => {
  let s = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

let fontCache: { regular: string; bold: string } | null = null

/** Nạp (một lần) và đăng ký font Be Vietnam Pro thường + đậm vào tài liệu jsPDF. */
export const registerPdfFonts = async (doc: jsPDF) => {
  if (!fontCache) {
    const [r, b] = await Promise.all([`${import.meta.env.BASE_URL}fonts/BeVietnamPro-Regular.ttf`, `${import.meta.env.BASE_URL}fonts/BeVietnamPro-SemiBold.ttf`].map((u) => fetch(u).then((x) => x.arrayBuffer())))
    fontCache = { regular: toBase64(r), bold: toBase64(b) }
  }
  doc.addFileToVFS('BeVietnamPro-Regular.ttf', fontCache.regular)
  doc.addFileToVFS('BeVietnamPro-SemiBold.ttf', fontCache.bold)
  doc.addFont('BeVietnamPro-Regular.ttf', PDF_FONT, 'normal')
  doc.addFont('BeVietnamPro-SemiBold.ttf', PDF_FONT, 'bold')
}
