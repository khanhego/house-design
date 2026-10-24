import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatPriceVnd } from '@hd/core'
import { api } from '../../../lib/api.ts'
import { Button, Field, Modal, errMsg, fieldErrors, toast } from '../../ui.tsx'
import type { HouseRow } from '../../types.ts'

/**
 * Thông tin bán hàng của mẫu nhà (CR-3, FR-12.20–12.21): diện tích, phòng, giá, diện tích đất, điểm nổi bật.
 * Giá nằm trong bản duyệt — sửa sau khi phát hành thì trang công khai đổi khi phát hành phiên bản mới (BR-T7).
 */
export const HouseInfoDialog = ({ house, onClose }: { house: HouseRow; onClose: () => void }) => {
  const qc = useQueryClient()
  const [f, setF] = useState({
    name: house.name,
    declaredArea: String(house.declaredArea),
    landArea: house.landArea ? String(house.landArea) : '',
    bedrooms: String(house.bedrooms),
    bathrooms: String(house.bathrooms),
    priceTy: house.price ? String(house.price / 1e9).replace('.', ',') : '',
    features: (house.features ?? []).join('\n'),
    description: house.description ?? '',
  })
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'))
  const price = f.priceTy.trim() ? Math.round(num(f.priceTy) * 1e9) : null

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const features = f.features.split('\n').map((x) => x.trim()).filter(Boolean)
    const er: Record<string, string> = {}
    if (features.length > 6) er.features = 'Tối đa 6 điểm nổi bật'
    if (f.priceTy.trim() && !(num(f.priceTy) > 0)) er.price = 'Giá không hợp lệ — nhập số tỷ, ví dụ 12,5'
    setErrs(er)
    if (Object.keys(er).length) return
    setBusy(true)
    try {
      await api('PATCH', `houses/${house.id}`, {
        name: f.name.trim(),
        declaredArea: num(f.declaredArea),
        landArea: f.landArea.trim() ? num(f.landArea) : null,
        bedrooms: Math.round(num(f.bedrooms) || 0),
        bathrooms: Math.round(num(f.bathrooms) || 0),
        price,
        features,
        description: f.description.trim() || null,
      })
      await qc.invalidateQueries({ queryKey: ['house', house.id] })
      toast('Đã lưu thông tin mẫu nhà')
      onClose()
    } catch (err) {
      setErrs(fieldErrors(err))
      if (!Object.keys(fieldErrors(err)).length) toast(errMsg(err), 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Thông tin & giá" onClose={onClose} wide>
      <form className="form am-body grid2" onSubmit={(e) => void save(e)}>
        <div className="span2"><Field label="Tên mẫu nhà" error={errs.name}>{(id) => <input id={id} required maxLength={200} value={f.name} onChange={set('name')} />}</Field></div>
        <Field label="Giá bán (tỷ ₫)" error={errs.price} hint={price ? `Hiển thị: ${formatPriceVnd(price)}` : 'Để trống: hiện "Giá: liên hệ"'}>{(id) => <input id={id} inputMode="decimal" placeholder="vd. 12,5" value={f.priceTy} onChange={set('priceTy')} />}</Field>
        <Field label="Diện tích sàn (m²)" error={errs.declaredArea}>{(id) => <input id={id} required inputMode="decimal" value={f.declaredArea} onChange={set('declaredArea')} />}</Field>
        <Field label="Diện tích đất (m²)" error={errs.landArea}>{(id) => <input id={id} inputMode="decimal" placeholder="tuỳ chọn" value={f.landArea} onChange={set('landArea')} />}</Field>
        <Field label="Phòng ngủ">{(id) => <input id={id} type="number" min={0} value={f.bedrooms} onChange={set('bedrooms')} />}</Field>
        <Field label="Phòng tắm">{(id) => <input id={id} type="number" min={0} value={f.bathrooms} onChange={set('bathrooms')} />}</Field>
        <div className="span2"><Field label="Điểm nổi bật (mỗi dòng một ý, tối đa 6)" error={errs.features}>{(id) => <textarea id={id} rows={4} placeholder={'Hồ bơi tràn bờ\nView toàn thành phố'} value={f.features} onChange={set('features')} />}</Field></div>
        <div className="span2"><Field label="Mô tả">{(id) => <textarea id={id} rows={3} value={f.description} onChange={set('description')} />}</Field></div>
        <p className="span2 muted small">Giá và thông số nằm trong bản gửi khách duyệt. Đã phát hành thì cần tạo phiên bản mới và duyệt lại để trang công khai đổi theo.</p>
        <footer className="am-foot span2">
          <Button type="button" onClick={onClose}>Huỷ</Button>
          <Button kind="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</Button>
        </footer>
      </form>
    </Modal>
  )
}
