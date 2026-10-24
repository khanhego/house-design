const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escape mọi chuỗi người dùng nhập trước khi đưa vào SVG/XML (R-16). */
export const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => MAP[c])
