import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MATERIAL_CATEGORIES, MATERIAL_CATEGORY_LABEL } from '@hd/core'
import type { MaterialMap } from '@hd/core'
import { api, upload } from '../../lib/api.ts'
import { fmtInt } from '../../i18n/vi.ts'
import { PageHead } from '../layout.tsx'
import { Badge, Button, EmptyState, ErrorState, Field, Modal, Skeleton, errMsg, fieldErrors, toast } from '../ui.tsx'
import type { Me } from '../auth.tsx'
import type { MaterialRow } from '../types.ts'
import { LICENSE_LABEL, SOURCE_LABEL, STATUS_LABEL, useMaterials } from './materialsData.ts'

/* Studio · Thư viện vật liệu (item 03 lát R1, FR-13.04, 13.05, 13.10): ảnh vân 2 cỡ, nguồn & giấy phép, phạm vi, QTV duyệt. */

const MAP_LABEL: Record<MaterialMap, string> = { color: 'Ảnh màu', normal: 'Pháp tuyến (normal, OpenGL)', rough: 'Độ nhám (roughness)' }

export const Swatch = ({ m, size = 72 }: { m: Pick<MaterialRow, 'maps' | 'color' | 'name'>; size?: number }) =>
  m.maps.color ? <img className="mat-swatch" src={m.maps.color.small} alt={m.name} width={size} height={size} /> : <span className="mat-swatch" style={{ background: m.color, width: size, height: size }} aria-label={m.name} />

export const MaterialsPage = ({ me }: { me: Me }) => {
  const [cat, setCat] = useState('')
  const [status, setStatus] = useState('')
  const list = useMaterials({ all: me.role === 'admin', includeRetired: true })
  const [edit, setEdit] = useState<MaterialRow | 'new' | null>(null)
  const items = (list.data?.items ?? []).filter((m) => (!cat || m.category === cat) && (!status || m.status === status))
  return (
    <>
      <PageHead title="Vật liệu" sub="Sàn, tường, trần, cửa: ảnh vân thật đúng kích thước; mỗi vật liệu có nguồn và giấy phép, QTV duyệt trước khi dùng" actions={<Button kind="primary" onClick={() => setEdit('new')}>Thêm vật liệu</Button>} />
      <div className="filters">
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Lọc loại">
          <option value="">Tất cả loại</option>
          {MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{MATERIAL_CATEGORY_LABEL[c]}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
          <option value="">Mọi trạng thái</option>
          {(['draft', 'ready', 'retired'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      {list.isLoading ? <Skeleton rows={6} /> : list.error ? <ErrorState error={list.error} retry={() => list.refetch()} /> : !items.length ? (
        <EmptyState action={<Button kind="primary" onClick={() => setEdit('new')}>Thêm vật liệu</Button>}>{cat || status ? 'Không có vật liệu phù hợp.' : 'Chưa có vật liệu.'}</EmptyState>
      ) : (
        <div className="lib-grid">
          {items.map((m) => (
            <button key={m.id} className="lib-card" onClick={() => setEdit(m)}>
              <div className="lib-img"><Swatch m={m} size={120} /></div>
              <strong>{m.name}</strong>
              <span className="muted small">{MATERIAL_CATEGORY_LABEL[m.category]} · ô vân {fmtInt(m.tileMm[0])} × {fmtInt(m.tileMm[1])} mm</span>
              <span className="muted small">{SOURCE_LABEL[m.sourceKind]}{m.license ? ` · ${LICENSE_LABEL[m.license]}` : ' · chưa có giấy phép'}</span>
              <Badge tone={m.status === 'ready' ? 'ok' : m.status === 'draft' ? 'warn' : 'neutral'}>{STATUS_LABEL[m.status]}</Badge>
            </button>
          ))}
        </div>
      )}
      {edit && <MaterialForm me={me} initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)

const MaterialForm = ({ me, initial, onClose }: { me: Me; initial?: MaterialRow; onClose: () => void }) => {
  const qc = useQueryClient()
  const [cur, setCur] = useState<MaterialRow | undefined>(initial)
  const clients = useQuery({ queryKey: ['clients'], queryFn: () => api<{ items: { id: string; name: string }[] }>('GET', 'clients'), enabled: me.role === 'admin' })
  const [f, setF] = useState({
    key: initial?.key ?? '', name: initial?.name ?? '', category: initial?.category ?? 'tile',
    w: String(initial?.tileMm[0] ?? 600), h: String(initial?.tileMm[1] ?? 600), color: initial?.color ?? '#d9d6d0',
    roughness: initial?.roughness ?? 0.6, metalness: initial?.metalness ?? 0,
    sourceKind: initial?.sourceKind ?? 'client_file', sourceName: initial?.sourceName ?? '', sourceUrl: initial?.sourceUrl ?? '',
    license: initial?.license ?? '', attribution: initial?.attribution ?? '', clientId: initial?.clientId ?? '',
  })
  const [errs, setErrs] = useState<Record<string, string>>({})
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const refresh = (m: MaterialRow) => (setCur(m), void qc.invalidateQueries({ queryKey: ['materials'] }))

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...(cur ? {} : { key: f.key || slug(f.name) }),
        name: f.name, category: f.category, tileMm: [Number(f.w), Number(f.h)], color: f.color, roughness: Number(f.roughness), metalness: Number(f.metalness),
        sourceKind: f.sourceKind, sourceName: f.sourceName || null, sourceUrl: f.sourceUrl || null, license: f.license || null, attribution: f.attribution || null,
        clientId: f.clientId || null,
      }
      return cur ? api<{ item: MaterialRow }>('PATCH', `materials/${cur.id}`, body) : api<{ item: MaterialRow }>('POST', 'materials', body)
    },
    onSuccess: (r) => (refresh(r.item), setErrs({}), toast(cur ? 'Đã lưu — vật liệu về Nháp, chờ QTV duyệt lại' : 'Đã tạo vật liệu nháp — tải ảnh vân rồi gửi QTV duyệt')),
    onError: (e) => (setErrs(fieldErrors(e)), toast(errMsg(e), 'danger')),
  })
  const act = useMutation({
    mutationFn: (a: 'approve' | 'retire') => api<{ item: MaterialRow }>('POST', `materials/${cur!.id}/${a}`),
    onSuccess: (r) => (refresh(r.item), toast(r.item.status === 'ready' ? 'Đã duyệt — vật liệu sẵn dùng' : 'Đã ngừng dùng')),
    onError: (e) => toast(errMsg(e), 'danger'),
  })
  const sendMap = async (map: MaterialMap, file: File) => {
    try {
      const r = await upload<{ item: MaterialRow }>(`materials/${cur!.id}/textures`, file, { map })
      refresh(r.item)
    } catch (e) {
      toast(errMsg(e), 'danger')
    }
  }

  return (
    <Modal title={cur ? `Vật liệu · ${cur.name}` : 'Thêm vật liệu'} onClose={onClose} wide>
      <form className="form am-body grid2" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <Field label="Tên" error={errs.name}>{(id) => <input id={id} required value={f.name} onChange={set('name')} placeholder="vd. Gạch men 600 × 600 xám" />}</Field>
        {!cur && <Field label="Mã (không dấu)" hint="Bỏ trống để tạo từ tên" error={errs.key}>{(id) => <input id={id} value={f.key} onChange={set('key')} placeholder={slug(f.name)} />}</Field>}
        <Field label="Loại">{(id) => <select id={id} value={f.category} onChange={set('category')}>{MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{MATERIAL_CATEGORY_LABEL[c]}</option>)}</select>}</Field>
        <div className="grid3">
          <Field label="Ô vân rộng (mm)" error={errs['tileMm.0']}>{(id) => <input id={id} required type="number" min="10" value={f.w} onChange={set('w')} />}</Field>
          <Field label="Ô vân cao (mm)" error={errs['tileMm.1']}>{(id) => <input id={id} required type="number" min="10" value={f.h} onChange={set('h')} />}</Field>
          <Field label="Màu nền">{(id) => <input id={id} type="color" value={f.color} onChange={set('color')} />}</Field>
        </div>
        <div className="grid3">
          <Field label={`Độ nhám ${Number(f.roughness).toFixed(2)}`} hint="0 = bóng gương, 1 = mờ">{(id) => <input id={id} type="range" min="0" max="1" step="0.05" value={f.roughness} onChange={set('roughness')} />}</Field>
          <Field label={`Kim loại ${Number(f.metalness).toFixed(2)}`}>{(id) => <input id={id} type="range" min="0" max="1" step="0.05" value={f.metalness} onChange={set('metalness')} />}</Field>
        </div>

        <h3 className="span2">Nguồn & giấy phép <span className="muted small">(bắt buộc trước khi duyệt — BR-R1)</span></h3>
        <Field label="Nguồn">{(id) => <select id={id} value={f.sourceKind} onChange={set('sourceKind')}>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
        <Field label="Giấy phép" error={errs.license}>{(id) => (
          <select id={id} value={f.license} onChange={set('license')}>
            <option value="">— chưa chọn —</option>
            {Object.entries(LICENSE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}</Field>
        <Field label="Tên kho / nhà cung cấp">{(id) => <input id={id} value={f.sourceName} onChange={set('sourceName')} placeholder="vd. Poly Haven, Catalog Viglacera" />}</Field>
        <Field label="Đường dẫn gốc" error={errs.sourceUrl}>{(id) => <input id={id} type="url" value={f.sourceUrl} onChange={set('sourceUrl')} placeholder="https://…" />}</Field>
        <Field label="Ghi công" hint="Bắt buộc với CC BY — hiện cho người xem">{(id) => <input id={id} value={f.attribution} onChange={set('attribution')} />}</Field>
        {me.role === 'admin' && (
          <Field label="Phạm vi" hint="Vật liệu của khách chỉ dùng trong dự án của khách đó">{(id) => (
            <select id={id} value={f.clientId} onChange={set('clientId')}>
              <option value="">Kho chung</option>
              {clients.data?.items.map((c) => <option key={c.id} value={c.id}>Của {c.name}</option>)}
            </select>
          )}</Field>
        )}

        {cur && (
          <div className="span2">
            <h3>Ảnh vân <span className="muted small">(tự tạo 2 cỡ 1024 + 256 px; ảnh vuông, liền mép)</span></h3>
            <div className="mat-maps">
              {(Object.keys(MAP_LABEL) as MaterialMap[]).map((k) => (
                <label key={k} className="mat-map">
                  {cur.maps[k] ? <img src={cur.maps[k]!.small} alt="" /> : <span className="mat-empty">Chưa có</span>}
                  <span className="small">{MAP_LABEL[k]}</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && void sendMap(k, e.target.files[0])} />
                </label>
              ))}
            </div>
          </div>
        )}

        <footer className="am-foot span2">
          {cur && <Badge tone={cur.status === 'ready' ? 'ok' : cur.status === 'draft' ? 'warn' : 'neutral'}>{STATUS_LABEL[cur.status]}</Badge>}
          {cur && me.role === 'admin' && cur.status !== 'ready' && <Button type="button" kind="primary" disabled={act.isPending} onClick={() => act.mutate('approve')}>Duyệt giấy phép</Button>}
          {cur && me.role === 'admin' && cur.status !== 'retired' && <Button type="button" kind="ghost" disabled={act.isPending} onClick={() => act.mutate('retire')}>Ngừng dùng</Button>}
          <span className="grow" />
          <Button type="button" onClick={onClose}>Đóng</Button>
          <Button kind="primary" type="submit" disabled={save.isPending}>{cur ? 'Lưu' : 'Tạo nháp'}</Button>
        </footer>
      </form>
    </Modal>
  )
}
