import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FALLBACK_SHAPES, ITEM_CATEGORIES } from '@hd/core'
import { api, upload } from '../../lib/api.ts'
import { fmtInt } from '../../i18n/vi.ts'
import { PageHead } from '../layout.tsx'
import { Badge, Button, Confirm, EmptyState, ErrorState, Field, Modal, Skeleton, errMsg, fieldErrors, toast } from '../ui.tsx'
import type { LibraryRow, ModelOut } from '../types.ts'

export const CATEGORY: Record<string, string> = {
  sofa: 'Sofa', chair: 'Ghế', table: 'Bàn', bed: 'Giường', storage: 'Tủ, kệ', kitchen: 'Bếp', appliance: 'Thiết bị',
  bath: 'Vệ sinh', lighting: 'Đèn', decor: 'Trang trí', plant: 'Cây', rug: 'Thảm', other: 'Khác',
}
const SHAPE: Record<string, string> = {
  sofa: 'Sofa băng', sofaL: 'Sofa góc L', armchair: 'Ghế bành', coffeeTable: 'Bàn trà', tvStand: 'Kệ TV', rug: 'Thảm', floorLamp: 'Đèn cây',
  plant: 'Chậu cây', bookshelf: 'Kệ sách', diningTable: 'Bàn ăn', chair: 'Ghế ăn', kitchen: 'Tủ bếp', fridge: 'Tủ lạnh', bed: 'Giường',
  nightstand: 'Tab đầu giường', wardrobe: 'Tủ áo', desk: 'Bàn làm việc', officeChair: 'Ghế văn phòng', vanity: 'Tủ lavabo', toilet: 'Bồn cầu', shower: 'Cabin tắm',
}

export const useLibrary = (q = '', category = '') =>
  useQuery({
    queryKey: ['library', q, category],
    queryFn: () => api<{ items: LibraryRow[] }>('GET', `library/items?q=${encodeURIComponent(q)}&category=${category}`),
  })

export const LibraryPage = () => {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const list = useLibrary(q, cat)
  const [edit, setEdit] = useState<LibraryRow | 'new' | null>(null)
  return (
    <>
      <PageHead title="Thư viện đồ" sub="Đồ dùng chung cho mọi mẫu nhà; khối dựng sẵn dùng khi chưa có mô hình GLB" actions={<Button kind="primary" onClick={() => setEdit('new')}>Thêm đồ</Button>} />
      <div className="filters">
        <input type="search" placeholder="Tìm theo tên, thương hiệu…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm đồ" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Lọc loại">
          <option value="">Tất cả loại</option>
          {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY[c]}</option>)}
        </select>
      </div>
      {list.isLoading ? <Skeleton rows={6} /> : list.error ? <ErrorState error={list.error} retry={() => list.refetch()} /> : !list.data!.items.length ? (
        <EmptyState action={<Button kind="primary" onClick={() => setEdit('new')}>Thêm đồ</Button>}>{q || cat ? 'Không có đồ phù hợp.' : 'Thư viện trống.'}</EmptyState>
      ) : (
        <div className="lib-grid">
          {list.data!.items.map((it) => (
            <button key={it.id} className="lib-card" onClick={() => setEdit(it)}>
              <div className="lib-img">{it.imageUrls[0] ? <img src={it.imageUrls[0]} alt="" /> : <span>{SHAPE[it.fallbackShape ?? ''] ?? CATEGORY[it.category]}</span>}</div>
              <strong>{it.name}</strong>
              <span className="muted small">{CATEGORY[it.category]} · {it.sizeMm.map(fmtInt).join(' × ')} mm</span>
              <span className="dots">{it.variants.map((v) => <i key={v.id} style={{ background: v.color }} title={v.name} />)}</span>
              {it.model && <Badge tone={it.model.status === 'ready' ? 'ok' : it.model.status === 'failed' ? 'danger' : 'warn'}>GLB</Badge>}
            </button>
          ))}
        </div>
      )}
      {edit && <ItemForm initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

const ItemForm = ({ initial, onClose }: { initial?: LibraryRow; onClose: () => void }) => {
  const qc = useQueryClient()
  const [f, setF] = useState({
    name: initial?.name ?? '', category: initial?.category ?? 'sofa',
    w: String(initial?.sizeMm[0] ?? ''), h: String(initial?.sizeMm[1] ?? ''), d: String(initial?.sizeMm[2] ?? ''),
    material: initial?.material ?? '', brand: initial?.brand ?? '', description: initial?.description ?? '',
    fallbackShape: initial?.fallbackShape ?? 'sofa', imageFileIds: initial?.imageFileIds ?? [], imageUrls: initial?.imageUrls ?? [],
    modelAssetId: initial?.modelAssetId ?? null, variants: initial?.variants ?? [{ id: 'mac-dinh', name: 'Mặc định', color: '#b9b2a8' }],
  })
  const [model, setModel] = useState<ModelOut | null>(null)
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [del, setDel] = useState(false)

  useEffect(() => {
    if (!f.modelAssetId) return
    let stop = false
    const poll = async () => {
      const r = await api<{ model: ModelOut }>('GET', `models/${f.modelAssetId}`).catch(() => null)
      if (stop || !r) return
      setModel(r.model)
      if (r.model.status === 'processing') setTimeout(poll, 2000)
    }
    void poll()
    return () => void (stop = true)
  }, [f.modelAssetId])

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name, category: f.category, sizeMm: [Number(f.w), Number(f.h), Number(f.d)], material: f.material || null, brand: f.brand || null,
        description: f.description || null, fallbackShape: f.fallbackShape || null, imageFileIds: f.imageFileIds, modelAssetId: f.modelAssetId, variants: f.variants,
      }
      return initial ? api('PATCH', `library/items/${initial.id}`, body) : api('POST', 'library/items', body)
    },
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ['library'] }), toast('Đã lưu'), onClose()),
    onError: (e) => (setErrs(fieldErrors(e)), toast(errMsg(e), 'danger')),
  })
  const remove = useMutation({
    mutationFn: () => api('DELETE', `library/items/${initial!.id}`),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ['library'] }), toast('Đã xoá đồ khỏi thư viện'), onClose()),
    onError: (e) => (setDel(false), toast(errMsg(e), 'danger')),
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const setVar = (i: number, k: 'id' | 'name' | 'color', v: string) => setF((s) => ({ ...s, variants: s.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }))

  return (
    <Modal title={initial ? `Sửa ${initial.name}` : 'Thêm đồ'} onClose={onClose} wide>
      <form className="form am-body grid2" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <Field label="Tên" error={errs.name}>{(id) => <input id={id} required value={f.name} onChange={set('name')} />}</Field>
        <Field label="Loại">{(id) => <select id={id} value={f.category} onChange={set('category')}>{ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY[c]}</option>)}</select>}</Field>
        <div className="grid3">
          <Field label="Rộng (mm)" error={errs['sizeMm.0']}>{(id) => <input id={id} required type="number" min="1" value={f.w} onChange={set('w')} />}</Field>
          <Field label="Cao (mm)" error={errs['sizeMm.1']}>{(id) => <input id={id} required type="number" min="1" value={f.h} onChange={set('h')} />}</Field>
          <Field label="Sâu (mm)" error={errs['sizeMm.2']}>{(id) => <input id={id} required type="number" min="1" value={f.d} onChange={set('d')} />}</Field>
        </div>
        <Field label="Khối dựng sẵn" hint="Hiển thị khi chưa có GLB">{(id) => <select id={id} value={f.fallbackShape ?? ''} onChange={set('fallbackShape')}>{FALLBACK_SHAPES.map((s) => <option key={s} value={s}>{SHAPE[s]}</option>)}</select>}</Field>
        <Field label="Chất liệu">{(id) => <input id={id} value={f.material} onChange={set('material')} />}</Field>
        <Field label="Thương hiệu">{(id) => <input id={id} value={f.brand} onChange={set('brand')} />}</Field>
        <Field label="Mô tả">{(id) => <textarea id={id} rows={2} value={f.description} onChange={set('description')} />}</Field>
        <Field label="Ảnh">{(id) => (
          <div className="logo-row">
            {f.imageUrls.map((u) => <img key={u} src={u} alt="" />)}
            <input id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const r = await upload<{ file: { id: string; url: string } }>('files', file, { kind: 'library_image' })
                setF((s) => ({ ...s, imageFileIds: [...s.imageFileIds, r.file.id], imageUrls: [...s.imageUrls, r.file.url] }))
              } catch (err) {
                toast(errMsg(err), 'danger')
              }
            }} />
          </div>
        )}</Field>
        <Field label="Mô hình GLB (tuỳ chọn)" hint="Gốc toạ độ ở đáy, mét; quá 100 MB nên giảm chi tiết">{(id) => (
          <div>
            <input id={id} type="file" accept=".glb,.gltf" onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const r = await upload<{ model: ModelOut }>('library/models', file)
                setModel(r.model)
                setF((s) => ({ ...s, modelAssetId: r.model.id }))
              } catch (err) {
                toast(errMsg(err), 'danger')
              }
            }} />
            {model && <p className="small">{model.status === 'processing' ? 'Đang tối ưu mô hình…' : model.status === 'failed' ? <span className="danger">{model.error}</span> : `Sẵn sàng · ${fmtInt(model.report?.triangles ?? 0)} tam giác`}</p>}
          </div>
        )}</Field>
        <div className="span2">
          <h3>Biến thể màu / hoàn thiện</h3>
          {errs.variants && <p className="field-error">{errs.variants}</p>}
          {f.variants.map((v, i) => (
            <div key={i} className="variant-row">
              <input type="color" value={v.color} onChange={(e) => setVar(i, 'color', e.target.value)} aria-label="Màu" />
              <input value={v.name} onChange={(e) => setVar(i, 'name', e.target.value)} placeholder="Tên (vd Xám đá)" aria-label="Tên biến thể" />
              <input value={v.id} onChange={(e) => setVar(i, 'id', e.target.value)} placeholder="mã (vd xam-da)" aria-label="Mã biến thể" />
              <Button type="button" small kind="ghost" onClick={() => setF((s) => ({ ...s, variants: s.variants.filter((_, j) => j !== i) }))}>Xoá</Button>
            </div>
          ))}
          <Button type="button" small onClick={() => setF((s) => ({ ...s, variants: [...s.variants, { id: `bien-the-${s.variants.length + 1}`, name: '', color: '#999999' }] }))}>Thêm biến thể</Button>
        </div>
        <footer className="am-foot span2">
          {initial && <Button type="button" kind="danger" onClick={() => setDel(true)}>Xoá</Button>}
          <span className="grow" />
          <Button type="button" onClick={onClose}>Huỷ</Button>
          <Button kind="primary" type="submit" disabled={save.isPending}>Lưu</Button>
        </footer>
      </form>
      {del && <Confirm title="Xoá đồ khỏi thư viện?" message={<p>Đồ đang dùng ở mẫu nhà nào thì không xoá được.</p>} confirmLabel="Xoá" danger busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDel(false)} />}
    </Modal>
  )
}
