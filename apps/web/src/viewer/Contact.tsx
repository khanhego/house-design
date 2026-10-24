import type { PublicProjectInfo } from '@hd/core'
import { useState } from 'react'

const zaloLink = (zalo: string) => `https://zalo.me/${zalo.replace(/\D/g, '')}`

/** Nút liên hệ (FR-10.01). Số điện thoại luôn hiện dạng chữ để người xem tự gọi nếu link tel: không chạy. */
export const ContactButtons = ({ project, onLead, onClick, layout }: {
  project: PublicProjectInfo
  onLead?: () => void
  onClick?: (kind: 'call' | 'zalo' | 'form') => void
  layout: 'bar' | 'menu'
}) => {
  const { phone, zalo } = project.contact
  return (
    <div className={layout === 'bar' ? 'contact-bar' : 'contact-menu'}>
      {phone && (
        <a className="btn ghost" href={`tel:${phone}`} onClick={() => onClick?.('call')}>
          Gọi {layout === 'menu' ? phone : ''}
        </a>
      )}
      {zalo && (
        <a className="btn ghost" href={zaloLink(zalo)} target="_blank" rel="noreferrer" onClick={() => onClick?.('zalo')}>
          Zalo
        </a>
      )}
      {onLead && (
        <button className="btn primary" onClick={() => (onClick?.('form'), onLead())}>
          Để lại SĐT
        </button>
      )}
    </div>
  )
}

export const ContactMenu = ({ project, onLead, onClick }: { project: PublicProjectInfo; onLead?: () => void; onClick?: (k: 'call' | 'zalo' | 'form') => void }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="contact-wrap">
      <button className="btn primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Liên hệ tư vấn
      </button>
      {open && (
        <div className="popover" role="menu">
          <ContactButtons project={project} onLead={onLead && (() => (setOpen(false), onLead()))} onClick={onClick} layout="menu" />
          {project.contact.phone && <p className="muted small">Hotline: <b>{project.contact.phone}</b></p>}
        </div>
      )}
    </div>
  )
}
