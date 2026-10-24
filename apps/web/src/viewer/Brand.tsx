import { useEffect } from 'react'
import type { Branding } from '@hd/core'

/** Màu chữ tương phản trên màu thương hiệu (02b §9). */
export const inkFor = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.62 ? '#1d1a17' : '#ffffff'
}

export const useBrand = (b: Branding | null | undefined) => {
  useEffect(() => {
    if (!b) return
    const root = document.documentElement
    root.style.setProperty('--brand', b.brandColor)
    root.style.setProperty('--brand-ink', inkFor(b.brandColor))
  }, [b])
}

export const BrandMark = ({ b, compact = false }: { b: Branding; compact?: boolean }) =>
  b.logoUrl ? (
    <img className={compact ? 'brand-logo compact' : 'brand-logo'} src={b.logoUrl} alt={b.name} />
  ) : (
    <span className="brand-name">{b.name}</span>
  )

export const Disclaimer = ({ text, branding }: { text: string; branding: Branding }) => (
  <footer className="v-disclaimer">
    <span>{text}</span>
    {branding.showPoweredBy && <span className="powered">Nhà mẫu online</span>}
  </footer>
)
