import { escapeXml } from '@hd/core'
import type { Template } from '../services/mail.ts'

export interface Rendered {
  subject: string
  text: string
  html: string
}

const layout = (title: string, body: string, cta?: { label: string; url: string }) =>
  `<!doctype html><html lang="vi"><body style="font-family:Arial,sans-serif;color:#26221f;background:#f5f3ef;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:24px">
<h2 style="margin-top:0">${escapeXml(title)}</h2>${body}
${cta ? `<p><a href="${escapeXml(cta.url)}" style="display:inline-block;background:#1f4fa3;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">${escapeXml(cta.label)}</a></p><p style="font-size:12px;color:#736c64">Nếu nút không bấm được, dán đường dẫn này vào trình duyệt: ${escapeXml(cta.url)}</p>` : ''}
</div></body></html>`

const p = (s: string) => `<p>${escapeXml(s)}</p>`

/** E1–E5 (SRS §10.4 bảng màn phụ). `base` = PUBLIC_BASE_URL. */
export const render = (template: Template, d: Record<string, any>, base: string): Rendered => {
  switch (template) {
    case 'E1': {
      const url = `${base}/${d.role === 'approver' ? 'portal' : 'studio'}/set-password#token=${d.token}`
      return {
        subject: 'Mời bạn tham gia Nhà mẫu online',
        text: `Chào ${d.name},\nBạn được mời dùng Nhà mẫu online. Đặt mật khẩu (hết hạn sau 72 giờ): ${url}`,
        html: layout('Mời bạn tham gia Nhà mẫu online', p(`Chào ${d.name},`) + p('Bạn được mời dùng Nhà mẫu online. Liên kết đặt mật khẩu hết hạn sau 72 giờ.'), { label: 'Đặt mật khẩu', url }),
      }
    }
    case 'E2': {
      const url = `${base}/${d.role === 'approver' ? 'portal' : 'studio'}/set-password#token=${d.token}`
      return {
        subject: 'Đặt lại mật khẩu',
        text: `Chào ${d.name},\nĐặt lại mật khẩu (hết hạn sau 1 giờ): ${url}\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
        html: layout('Đặt lại mật khẩu', p(`Chào ${d.name},`) + p('Liên kết hết hạn sau 1 giờ. Nếu bạn không yêu cầu, hãy bỏ qua email này.'), { label: 'Đặt lại mật khẩu', url }),
      }
    }
    case 'E3':
    case 'E4': {
      const url = `${base}/portal/review/${d.versionId}`
      const title = template === 'E3' ? `${d.houseName} phiên bản ${d.versionNumber} cần bạn duyệt` : `Nhắc: ${d.houseName} phiên bản ${d.versionNumber} đang chờ bạn duyệt`
      return {
        subject: title,
        text: `Chào ${d.name},\n${title} (dự án ${d.projectName}). Xem và duyệt: ${url}`,
        html: layout(title, p(`Chào ${d.name},`) + p(`Dự án ${d.projectName}: mẫu nhà ${d.houseName} đang chờ bạn xem trước và duyệt trước khi công khai.`), { label: 'Xem & duyệt', url }),
      }
    }
    case 'E5': {
      const url = `${base}/portal/leads?project=${d.projectId}`
      const title = `Lead mới: ${d.name || 'Khách'} · ${d.phone}${d.contactCount > 1 ? ` (liên hệ lần ${d.contactCount})` : ''}`
      const lines = [
        `Dự án: ${d.projectName}`,
        d.houseName ? `Mẫu nhà: ${d.houseName}` : '',
        d.roomName ? `Đang xem: ${[d.floorName, d.roomName].filter(Boolean).join(' · ')}` : '',
        d.interest ? `Quan tâm: ${d.interest}` : '',
        d.message ? `Lời nhắn: ${d.message}` : '',
      ].filter(Boolean)
      return {
        subject: title,
        text: `${title}\n${lines.join('\n')}\nXem lead: ${url}`,
        html: layout(title, lines.map(p).join(''), { label: 'Xem lead', url }),
      }
    }
  }
}
