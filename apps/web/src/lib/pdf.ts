import { jsPDF } from 'jspdf'
import 'svg2pdf.js'
import { planSvg, sortedFloors, floorGrossArea, formatArea } from '@hd/core'
import type { PublicHousePayload } from '@hd/core'
import { DRAW, pickScale } from './pdfScale.ts'
import { PDF_FONT, registerPdfFonts } from './pdfFonts.ts'

/* Xuất PDF mặt bằng trong trình duyệt (FR-07.04, 02 §9): A3 ngang, mỗi tầng một trang, font tiếng Việt nhúng (R-10). */

const FONT = PDF_FONT
const PAGE = { w: 420, h: 297 }

const imageData = async (url: string) => {
  const blob = await fetch(url).then((r) => r.blob())
  return new Promise<{ data: string; w: number; h: number }>((resolve, reject) => {
    const img = new Image()
    const fr = new FileReader()
    fr.onload = () => {
      img.onload = () => resolve({ data: fr.result as string, w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = reject
      img.src = fr.result as string
    }
    fr.onerror = reject
    fr.readAsDataURL(blob)
  })
}


export const exportPlanPdf = async (data: PublicHousePayload) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  await registerPdfFonts(doc)
  doc.setFont(FONT, 'normal')

  const logo = data.branding.logoUrl ? await imageData(data.branding.logoUrl).catch(() => null) : null
  const floors = sortedFloors(data.document)
  const date = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(data.version.publishedAt ? new Date(data.version.publishedAt) : new Date())
  let page = 0

  for (const floor of floors) {
    const probe = planSvg(floor, { scaleDenominator: 100 })
    if (probe.empty) continue
    const vb = probe.viewBox
    const k = pickScale(vb.maxX - vb.minX, vb.maxY - vb.minY)
    const plan = planSvg(floor, { scaleDenominator: k, style: { font: FONT } })
    if (page++ > 0) doc.addPage('a3', 'landscape')

    const w = (plan.viewBox.maxX - plan.viewBox.minX) / k
    const h = (plan.viewBox.maxY - plan.viewBox.minY) / k
    const x = DRAW.x + (DRAW.w - w) / 2
    const y = DRAW.y + (DRAW.h - h) / 2
    const el = new DOMParser().parseFromString(plan.svg, 'image/svg+xml').documentElement
    await doc.svg(el, { x, y, width: w, height: h })

    // khung bản vẽ + khung thông tin
    doc.setDrawColor(40)
    doc.setLineWidth(0.5)
    doc.rect(6, 6, PAGE.w - 12, PAGE.h - 12)
    const ty = 254
    doc.setLineWidth(0.35)
    doc.line(6, ty, PAGE.w - 6, ty)
    doc.line(150, ty, 150, PAGE.h - 6)
    doc.line(300, ty, 300, PAGE.h - 6)
    if (logo) {
      const lh = 14
      const lw = Math.min(60, (logo.w / logo.h) * lh)
      doc.addImage(logo.data, 12, ty + 6, lw, lh)
    }
    doc.setFont(FONT, 'bold')
    doc.setFontSize(11)
    doc.text(data.branding.name, 12, ty + 29)
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    doc.text(doc.splitTextToSize(data.project.disclaimer, 132), 12, ty + 34)

    doc.setFont(FONT, 'bold')
    doc.setFontSize(14)
    doc.text(data.project.name, 156, ty + 10)
    doc.setFontSize(12)
    doc.text(data.house.name, 156, ty + 18)
    doc.setFont(FONT, 'normal')
    doc.setFontSize(10)
    doc.text(`MẶT BẰNG ${floor.name.toUpperCase()}`, 156, ty + 27)
    doc.text(`Diện tích sàn: ${formatArea(floorGrossArea(floor).m2)}`, 156, ty + 34)

    doc.setFontSize(9)
    const rows: [string, string][] = [
      ['Tỷ lệ', `1:${k} (khổ A3)`],
      ['Phiên bản', `${data.version.number} · ${date}`],
      ['Đơn vị', 'mm; diện tích m²'],
      ['Trang', `${page}`],
    ]
    rows.forEach(([a, b], i) => {
      doc.setTextColor(110)
      doc.text(a, 306, ty + 9 + i * 7.5)
      doc.setTextColor(20)
      doc.text(b, 336, ty + 9 + i * 7.5)
    })
    // thước tỷ lệ 0–5 m
    const bar = 5000 / k
    const sx = 306
    const sy = ty + 35
    doc.setLineWidth(0.3)
    for (let i = 0; i < 5; i++) {
      if (i % 2) doc.setFillColor(255, 255, 255)
      else doc.setFillColor(30, 30, 30)
      doc.rect(sx + (bar / 5) * i, sy, bar / 5, 1.6, 'FD')
    }
    doc.setFontSize(7)
    doc.text('0', sx, sy + 4.5)
    doc.text('5 m', sx + bar - 2, sy + 4.5)
  }
  if (page === 0) throw new Error('no plans')
  doc.save(`${data.project.slug}-${data.house.slug}-mat-bang.pdf`)
}
