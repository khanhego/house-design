import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Button, copyText, toast } from './ui.tsx'

/** Link, mã nhúng, QR (FR-09.02, 09.03); QR kèm ?src=qr (FR-09.04). */
export const ShareBox = ({ path, label }: { path: string; label: string }) => {
  const origin = location.origin
  const link = `${origin}${path}`
  const qrLink = `${link}?src=qr`
  const embed = `<iframe src="${link}?src=embed" width="100%" height="640" style="border:0" allow="fullscreen" loading="lazy" title="${label}"></iframe>`
  const [png, setPng] = useState<string | null>(null)
  useEffect(() => {
    void QRCode.toDataURL(qrLink, { width: 512, margin: 2 }).then(setPng)
  }, [qrLink])
  const copy = async (s: string, what: string) => toast((await copyText(s)) ? `Đã sao chép ${what}` : 'Không sao chép được, hãy chọn và sao chép thủ công.')
  const download = async (kind: 'png' | 'svg') => {
    const data = kind === 'png' ? png! : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(await QRCode.toString(qrLink, { type: 'svg', margin: 2 }))
    const a = document.createElement('a')
    a.href = data
    a.download = `qr-${path.split('/').filter(Boolean).join('-')}.${kind}`
    a.click()
  }
  return (
    <div className="share">
      <div className="share-row">
        <label>Link</label>
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        <Button small onClick={() => void copy(link, 'link')}>Sao chép</Button>
        <a className="ab ab-sm" href={link} target="_blank" rel="noreferrer">Mở</a>
      </div>
      <div className="share-row">
        <label>Mã nhúng</label>
        <textarea readOnly rows={2} value={embed} onFocus={(e) => e.currentTarget.select()} />
        <Button small onClick={() => void copy(embed, 'mã nhúng')}>Sao chép mã</Button>
      </div>
      <div className="share-row qr">
        <label>QR</label>
        {png && <img src={png} alt={`QR ${label}`} width={120} height={120} />}
        <div className="qr-actions">
          <Button small onClick={() => void download('png')} disabled={!png}>Tải PNG</Button>
          <Button small onClick={() => void download('svg')}>Tải SVG</Button>
        </div>
      </div>
    </div>
  )
}
