import { planSvg, sortedFloors } from '@hd/core'
import type { PublicHousePayload } from '@hd/core'
import { BrandMark, Disclaimer } from './Brand.tsx'
import { ContactButtons } from './Contact.tsx'

/** V4 — không khả dụng (EX-10). */
export const Unavailable = ({ contact }: { contact: { name: string; phone: string | null; email: string | null } | null }) => (
  <main className="v4">
    <div className="v4-card">
      <h1>Nội dung này hiện không còn hiển thị.</h1>
      {contact ? (
        <p>
          Vui lòng liên hệ <b>{contact.name}</b>
          {contact.phone && <> · <span className="selectable">{contact.phone}</span></>}
          {contact.email && <> · <span className="selectable">{contact.email}</span></>}
        </p>
      ) : (
        <p>Liên kết có thể đã hết hạn hoặc bị gỡ. Vui lòng liên hệ đơn vị đã gửi link cho bạn.</p>
      )}
    </div>
  </main>
)

/** V4 — dự phòng khi không chạy được 3D (FR-06.12, AC-15): ảnh + mặt bằng + liên hệ. */
export const No3D = ({ data, onPdf, onLead }: { data: PublicHousePayload; onPdf: () => void; onLead?: () => void }) => {
  const doc = data.document
  const imgs = [doc.coverFileId, ...doc.gallery].map((id) => (id ? data.resolved.files[id] : null)).filter((u): u is string => !!u)
  return (
    <main className="v4 no3d">
      <header className="v4-head">
        <BrandMark b={data.branding} />
        <div>
          <h1>{data.house.name}</h1>
          <p className="muted">Thiết bị của bạn chưa hiển thị được 3D. Bạn vẫn xem được ảnh và mặt bằng bên dưới.</p>
        </div>
      </header>
      <section className="v4-gallery">{imgs.map((u) => <img key={u} src={u} alt={data.house.name} />)}</section>
      {sortedFloors(doc).map((f) => {
        const p = planSvg(f, { scaleDenominator: 100 })
        if (p.empty) return null
        return (
          <section key={f.id} className="v4-plan">
            <h2>{f.name}</h2>
            <div className="plan-svg" dangerouslySetInnerHTML={{ __html: p.svg }} />
          </section>
        )
      })}
      <div className="v4-actions">
        <button className="btn ghost" onClick={onPdf}>Tải PDF mặt bằng</button>
        <ContactButtons project={data.project} onLead={onLead} layout="menu" />
      </div>
      <Disclaimer text={data.project.disclaimer} branding={data.branding} />
    </main>
  )
}
