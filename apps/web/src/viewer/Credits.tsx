import { LICENSE_LABEL, SOURCE_LABEL } from '@hd/core'
import type { Credit, Snapshot } from '@hd/core'

/* V7 "Nguồn đồ & vật liệu" (item 03 lát R2, FR-13.17): nguồn, giấy phép, ghi công của đồ và vật liệu trong mẫu nhà. */

export interface CreditRow {
  kind: 'Đồ' | 'Vật liệu'
  name: string
  credit: Credit
}

/** Đồ + vật liệu có thông tin nguồn (snapshot cũ chưa có thì bỏ qua), sắp theo loại rồi tên. */
export const creditRows = (resolved: Snapshot['resolved']): CreditRow[] => [
  ...Object.values(resolved.libraryItems).filter((i) => i.credit).map((i) => ({ kind: 'Đồ' as const, name: i.name, credit: i.credit! })),
  ...Object.values(resolved.materials ?? {}).filter((m) => m.credit).map((m) => ({ kind: 'Vật liệu' as const, name: m.name, credit: m.credit! })),
].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'vi'))

/** Dòng ghi công gọn cho bảng chi tiết đồ: bắt buộc với CC BY, hiện khi có nội dung (FR-06.08). */
export const creditLine = (c: Credit | undefined) => {
  if (!c) return null
  if (c.attribution) return c.attribution
  return c.license === 'cc_by' ? [c.sourceName, 'CC BY'].filter(Boolean).join(' · ') : null
}

export const CreditsDialog = ({ rows, onClose }: { rows: CreditRow[]; onClose: () => void }) => (
  <div className="modal" role="dialog" aria-modal="true" aria-labelledby="credits-title" onClick={onClose}>
    <div className="modal-card credits" onClick={(e) => e.stopPropagation()}>
      <h3 id="credits-title">Nguồn đồ & vật liệu</h3>
      <p className="muted small">Mô hình đồ nội thất và vân vật liệu dùng trong mẫu nhà này, kèm giấy phép.</p>
      <div className="credits-list">
        {rows.map((r, i) => (
          <div key={i} className="credit-row">
            <div>
              <strong>{r.name}</strong>
              <span className="muted small"> · {r.kind}</span>
            </div>
            <div className="small">
              {r.credit.sourceUrl ? <a href={r.credit.sourceUrl} target="_blank" rel="noreferrer noopener">{r.credit.sourceName ?? SOURCE_LABEL[r.credit.sourceKind]}</a> : r.credit.sourceName ?? SOURCE_LABEL[r.credit.sourceKind]}
              {r.credit.license && <> · {LICENSE_LABEL[r.credit.license]}</>}
            </div>
            {r.credit.attribution && <div className="small muted">{r.credit.attribution}</div>}
          </div>
        ))}
      </div>
      <div className="row-actions">
        <button className="btn ghost" onClick={onClose}>Đóng</button>
      </div>
    </div>
  </div>
)
