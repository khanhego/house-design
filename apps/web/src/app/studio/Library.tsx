import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FALLBACK_SHAPES, ITEM_BUDGET, ITEM_CATEGORIES, SIZE_MUST_CHOOSE_PCT, SIZE_WARN_PCT, itemLevel, sizeDeviation } from '@hd/core'
import type { ModelReport } from '@hd/core'
import { ApiError, api, upload } from '../../lib/api.ts'
import { fmtInt } from '../../i18n/vi.ts'
import { PageHead } from '../layout.tsx'
import { Badge, Button, Confirm, EmptyState, ErrorState, Field, Modal, Skeleton, errMsg, fieldErrors, toast } from '../ui.tsx'
import type { Me } from '../auth.tsx'
import type { LibraryRow, ModelOut } from '../types.ts'
import { LICENSE_LABEL, SOURCE_LABEL, STATUS_LABEL } from './materialsData.ts'
import type { Capture } from './ModelPreview.tsx'

const ModelPreview = lazy(() => import('./ModelPreview.tsx'))

export const CATEGORY: Record<string, string> = {
  sofa: 'Sofa', chair: 'Ghế', table: 'Bàn', bed: 'Giường', storage: 'Tủ, kệ', kitchen: 'Bếp', appliance: 'Thiết bị',
  bath: 'Vệ sinh', lighting: 'Đèn', decor: 'Trang trí', plant: 'Cây', rug: 'Thảm', other: 'Khác',
}
const SHAPE: Record<string, string> = {
  sofa: 'Sofa băng', sofaL: 'Sofa góc L', armchair: 'Ghế bành', coffeeTable: 'Bàn trà', tvStand: 'Kệ TV', rug: 'Thảm', floorLamp: 'Đèn cây',
  plant: 'Chậu cây', bookshelf: 'Kệ sách', diningTable: 'Bàn ăn', chair: 'Ghế ăn', kitchen: 'Tủ bếp', fridge: 'Tủ lạnh', bed: 'Giường',
  nightstand: 'Tab đầu giường', wardrobe: 'Tủ áo', desk: 'Bàn làm việc', officeChair: 'Ghế văn phòng', vanity: 'Tủ lavabo', toilet: 'Bồn cầu', shower: 'Cabin tắm',
}
const UNIT_LABEL = { auto: 'Tự nhận', m: 'Mét', cm: 'Xăng-ti-mét', mm: 'Mi-li-mét', in: 'Inch' } as const
const AXIS_LABEL = { auto: 'Tự nhận', y: 'Y hướng lên (Blender glTF, SketchUp xuất GLB)', z: 'Z hướng lên (3ds Max, SketchUp, Rhino)' } as const
const statusTone = (s: LibraryRow['status']) => (s === 'ready' ? 'ok' : s === 'draft' ? 'warn' : 'neutral')

/** Thư viện đồ theo phạm vi: kho chung + của khách `clientId` (BR-R3); `all` = QTV xem mọi khách. */
export const useLibrary = (q = '', category = '', opts: { clientId?: string | null; all?: boolean; includeRetired?: boolean } = {}) =>
  useQuery({
    queryKey: ['library', q, category, opts.clientId ?? '', !!opts.all, !!opts.includeRetired],
    queryFn: () =>
      api<{ items: LibraryRow[] }>('GET', `library/items?${new URLSearchParams({
        q, category, ...(opts.clientId ? { clientId: opts.clientId } : {}), ...(opts.all ? { all: '1' } : {}), ...(opts.includeRetired ? { includeRetired: '1' } : {}),
      })}`),
  })

const useClients = (enabled: boolean) => useQuery({ queryKey: ['clients'], queryFn: () => api<{ items: { id: string; name: string }[] }>('GET', 'clients'), enabled })

export const LibraryPage = ({ me }: { me: Me }) => {
  const isAdmin = me.role === 'admin'
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [status, setStatus] = useState('')
  // '' = mọi khách (QTV) · 'shared' = kho chung · id khách
  const [scope, setScope] = useState('')
  const clients = useClients(isAdmin)
  const list = useLibrary(q, cat, { all: isAdmin, includeRetired: true })
  const [edit, setEdit] = useState<LibraryRow | 'new' | null>(null)
  const items = (list.data?.items ?? []).filter((it) => (!status || it.status === status) && (!scope || (scope === 'shared' ? !it.clientId : it.clientId === scope)))
  return (
    <>
      <PageHead
        title="Thư viện đồ"
        sub="Đồ dùng cho mẫu nhà: mô hình 3D chân thực (bản đầy đủ + bản nhẹ) hoặc khối dựng sẵn; mỗi món có nguồn và giấy phép, QTV duyệt trước khi dùng"
        actions={<Button kind="primary" onClick={() => setEdit('new')}>Thêm đồ</Button>}
      />
      <div className="filters">
        <input type="search" placeholder="Tìm theo tên, thương hiệu…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm đồ" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Lọc loại">
          <option value="">Tất cả loại</option>
          {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY[c]}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
          <option value="">Mọi trạng thái</option>
          {(['draft', 'ready', 'retired'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        {isAdmin && (
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Lọc phạm vi">
            <option value="">Mọi phạm vi</option>
            <option value="shared">Kho chung</option>
            {clients.data?.items.map((c) => <option key={c.id} value={c.id}>Của {c.name}</option>)}
          </select>
        )}
      </div>
      {list.isLoading ? <Skeleton rows={6} /> : list.error ? <ErrorState error={list.error} retry={() => list.refetch()} /> : !items.length ? (
        <EmptyState action={<Button kind="primary" onClick={() => setEdit('new')}>Thêm đồ</Button>}>{q || cat || status || scope ? 'Không có đồ phù hợp.' : 'Thư viện trống.'}</EmptyState>
      ) : (
        <div className="lib-grid">
          {items.map((it) => (
            <button key={it.id} className="lib-card" onClick={() => setEdit(it)}>
              <div className="lib-img">{it.imageUrls[0] ? <img src={it.imageUrls[0]} alt="" /> : <span>{SHAPE[it.fallbackShape ?? ''] ?? CATEGORY[it.category]}</span>}</div>
              <strong>{it.name}</strong>
              <span className="muted small">{CATEGORY[it.category]} · {it.sizeMm.map(fmtInt).join(' × ')} mm</span>
              {it.clientName && <span className="muted small">Sản phẩm của {it.clientName}</span>}
              <span className="dots">{it.variants.map((v) => <i key={v.id} style={{ background: v.color }} title={v.name} />)}</span>
              <span className="lib-badges">
                <Badge tone={statusTone(it.status)}>{STATUS_LABEL[it.status]}</Badge>
                {it.model && <Badge tone={it.model.status === 'ready' ? 'ok' : it.model.status === 'failed' ? 'danger' : 'warn'}>3D</Badge>}
              </span>
            </button>
          ))}
        </div>
      )}
      {edit && <ItemForm me={me} initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

const kb = (n: number) => (n >= 2 ** 20 ? `${(n / 2 ** 20).toFixed(1)} MB` : `${fmtInt(Math.round(n / 1024))} KB`)

/** Số liệu hai bản + mức theo BR-R2. */
const ReportTable = ({ full, light }: { full: ModelReport; light: ModelReport | null | undefined }) => {
  const rows: [string, ModelReport, keyof typeof ITEM_BUDGET][] = [['Bản đầy đủ (máy tính)', full, 'full']]
  if (light) rows.push(['Bản nhẹ (điện thoại)', light, 'light'])
  return (
    <table className="tbl small model-report">
      <thead>
        <tr><th>Bản</th><th>Tam giác</th><th>Texture</th><th>Dung lượng</th><th>Mức</th></tr>
      </thead>
      <tbody>
        {rows.map(([label, r, v]) => {
          const lv = itemLevel(r, v)
          return (
            <tr key={v}>
              <td>{label}</td>
              <td>{fmtInt(r.triangles)} <span className="muted">/ {fmtInt(ITEM_BUDGET[v].triangles)}</span></td>
              <td>{r.maxTexturePx ? `${fmtInt(r.maxTexturePx)} px` : 'không có'}</td>
              <td>{kb(r.fileBytes)} <span className="muted">/ {kb(ITEM_BUDGET[v].fileBytes)}</span></td>
              <td><Badge tone={lv.level === 'ok' ? 'ok' : lv.level === 'warn' ? 'warn' : 'danger'}>{lv.level === 'ok' ? 'Đạt' : lv.level === 'warn' ? 'Cảnh báo' : 'Chặn'}</Badge></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const ItemForm = ({ me, initial, onClose }: { me: Me; initial?: LibraryRow; onClose: () => void }) => {
  const qc = useQueryClient()
  const isAdmin = me.role === 'admin'
  const clients = useClients(isAdmin)
  const [cur, setCur] = useState<LibraryRow | undefined>(initial)
  const [f, setF] = useState({
    name: initial?.name ?? '', category: initial?.category ?? 'sofa',
    w: String(initial?.sizeMm[0] ?? ''), h: String(initial?.sizeMm[1] ?? ''), d: String(initial?.sizeMm[2] ?? ''),
    material: initial?.material ?? '', brand: initial?.brand ?? '', description: initial?.description ?? '', productCode: initial?.productCode ?? '',
    fallbackShape: initial?.fallbackShape ?? 'sofa', imageFileIds: initial?.imageFileIds ?? [], imageUrls: initial?.imageUrls ?? [],
    modelAssetId: initial?.modelAssetId ?? null, variants: initial?.variants ?? [{ id: 'mac-dinh', name: 'Mặc định', color: '#b9b2a8' }],
    sourceKind: initial?.sourceKind ?? 'free_library', sourceName: initial?.sourceName ?? '', sourceUrl: initial?.sourceUrl ?? '',
    license: initial?.license ?? '', attribution: initial?.attribution ?? '', clientId: initial?.clientId ?? '',
    acceptSizeMismatch: initial?.sizeAccepted ?? false,
  })
  const [model, setModel] = useState<ModelOut | null>(null)
  const [unit, setUnit] = useState<keyof typeof UNIT_LABEL>('auto')
  const [axis, setAxis] = useState<keyof typeof AXIS_LABEL>('auto')
  const [variant, setVariant] = useState<'full' | 'light'>('full')
  const [progress, setProgress] = useState<number | null>(null)
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [del, setDel] = useState(false)
  const capture = useRef<Capture | null>(null)

  useEffect(() => {
    if (!f.modelAssetId) return setModel(null)
    let stop = false
    const poll = async () => {
      const r = await api<{ model: ModelOut }>('GET', `models/${f.modelAssetId}`).catch(() => null)
      if (stop || !r) return
      setModel(r.model)
      if (r.model.status === 'processing') setTimeout(poll, 1500)
    }
    void poll()
    return () => void (stop = true)
  }, [f.modelAssetId, model?.status === 'processing' && model.id])

  const sizeMm = [Number(f.w), Number(f.h), Number(f.d)] as [number, number, number]
  const sizeOk = sizeMm.every((v) => v > 0)
  const measured = model?.status === 'ready' ? model.normalize?.result?.measuredMm ?? null : null
  const dev = measured && sizeOk ? sizeDeviation(sizeMm, measured) : null

  const refresh = (it: LibraryRow) => (setCur(it), void qc.invalidateQueries({ queryKey: ['library'] }))
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name, category: f.category, sizeMm, material: f.material || null, brand: f.brand || null, description: f.description || null,
        productCode: f.productCode || null, fallbackShape: f.fallbackShape || null, imageFileIds: f.imageFileIds, modelAssetId: f.modelAssetId, variants: f.variants,
        sourceKind: f.sourceKind, sourceName: f.sourceName || null, sourceUrl: f.sourceUrl || null, license: f.license || null, attribution: f.attribution || null,
        ...(isAdmin ? { clientId: f.clientId || null } : {}), acceptSizeMismatch: f.acceptSizeMismatch,
      }
      return cur ? api<{ item: LibraryRow }>('PATCH', `library/items/${cur.id}`, body) : api<{ item: LibraryRow }>('POST', 'library/items', body)
    },
    onSuccess: (r) => {
      const wasReady = cur?.status === 'ready'
      refresh(r.item)
      setErrs({})
      toast(!cur ? 'Đã tạo đồ nháp — khai đủ nguồn & giấy phép rồi nhờ QTV duyệt' : wasReady && r.item.status === 'draft' ? 'Đã lưu — đồ về Nháp, chờ QTV duyệt lại' : 'Đã lưu')
    },
    onError: (e) => {
      setErrs(fieldErrors(e))
      if (e instanceof ApiError && e.code === 'SIZE_MISMATCH') setErrs({ sizeMm: e.message })
      toast(errMsg(e), 'danger')
    },
  })
  const act = useMutation({
    mutationFn: (a: 'approve' | 'retire') => api<{ item: LibraryRow }>('POST', `library/items/${cur!.id}/${a}`),
    onSuccess: (r) => (refresh(r.item), toast(r.item.status === 'ready' ? 'Đã duyệt — đồ sẵn dùng' : 'Đã ngừng dùng')),
    onError: (e) => toast(errMsg(e), 'danger'),
  })
  const remove = useMutation({
    mutationFn: () => api('DELETE', `library/items/${cur!.id}`),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ['library'] }), toast('Đã xoá đồ khỏi thư viện'), onClose()),
    onError: (e) => (setDel(false), toast(errMsg(e), 'danger')),
  })
  const reprocess = useMutation({
    mutationFn: () => api<{ model: ModelOut }>('POST', `models/${f.modelAssetId}/reprocess`, { unit, upAxis: axis, declaredMm: sizeOk ? sizeMm : null }),
    onSuccess: (r) => (setModel(r.model), toast('Đang xử lý lại mô hình')),
    onError: (e) => toast(errMsg(e), 'danger'),
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const setVar = (i: number, k: 'id' | 'name' | 'color', v: string) => setF((s) => ({ ...s, variants: s.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }))

  const sendModel = async (file: File) => {
    setProgress(0)
    try {
      const r = await upload<{ model: ModelOut }>('library/models', file, { unit, upAxis: axis, ...(sizeOk ? { declaredMm: sizeMm.join(',') } : {}) }, setProgress)
      setModel(r.model)
      setF((s) => ({ ...s, modelAssetId: r.model.id, acceptSizeMismatch: false }))
      toast('Đã tải lên — đang chuẩn hoá và tạo bản nhẹ')
    } catch (err) {
      toast(errMsg(err), 'danger')
    } finally {
      setProgress(null)
    }
  }
  const addImage = async (file: Blob) => {
    try {
      const r = await upload<{ file: { id: string; url: string } }>('files', file, { kind: 'library_image' })
      setF((s) => ({ ...s, imageFileIds: [...s.imageFileIds, r.file.id], imageUrls: [...s.imageUrls, r.file.url] }))
    } catch (err) {
      toast(errMsg(err), 'danger')
    }
  }
  const snap = async () => {
    const blob = await capture.current?.()
    if (!blob) return toast('Chưa chụp được — đợi mô hình hiện xong', 'danger')
    await addImage(new File([blob], `${f.name || 'do'}-3d.jpg`, { type: 'image/jpeg' }))
    toast('Đã thêm ảnh đại diện từ mô hình 3D')
  }
  const previewUrl = model?.status === 'ready' ? (variant === 'light' ? model.lightUrl ?? model.url : model.url) : null

  return (
    <Modal title={cur ? `Sửa ${cur.name}` : 'Thêm đồ'} onClose={onClose} wide>
      <form className="form am-body grid2" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <Field label="Tên" error={errs.name}>{(id) => <input id={id} required value={f.name} onChange={set('name')} />}</Field>
        <Field label="Loại">{(id) => <select id={id} value={f.category} onChange={set('category')}>{ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY[c]}</option>)}</select>}</Field>
        <div className="grid3">
          <Field label="Rộng (mm)" error={errs['sizeMm.0'] ?? errs.sizeMm}>{(id) => <input id={id} required type="number" min="1" value={f.w} onChange={set('w')} />}</Field>
          <Field label="Cao (mm)" error={errs['sizeMm.1']}>{(id) => <input id={id} required type="number" min="1" value={f.h} onChange={set('h')} />}</Field>
          <Field label="Sâu (mm)" error={errs['sizeMm.2']}>{(id) => <input id={id} required type="number" min="1" value={f.d} onChange={set('d')} />}</Field>
        </div>
        <Field label="Khối dựng sẵn" hint="Hiện khi chưa có mô hình 3D, hoặc trong lúc mô hình đang tải">{(id) => <select id={id} value={f.fallbackShape ?? ''} onChange={set('fallbackShape')}>{FALLBACK_SHAPES.map((s) => <option key={s} value={s}>{SHAPE[s]}</option>)}</select>}</Field>
        <Field label="Chất liệu">{(id) => <input id={id} value={f.material} onChange={set('material')} />}</Field>
        <Field label="Thương hiệu">{(id) => <input id={id} value={f.brand} onChange={set('brand')} />}</Field>
        <Field label="Mã sản phẩm" hint="Mã trong catalog của hãng / khách">{(id) => <input id={id} value={f.productCode} onChange={set('productCode')} />}</Field>
        <Field label="Mô tả">{(id) => <textarea id={id} rows={2} value={f.description} onChange={set('description')} />}</Field>

        <div className="span2 model-box">
          <h3>Mô hình 3D <span className="muted small">(tuỳ chọn — GLB, glTF, FBX, OBJ; OBJ/glTF kèm ảnh thì nén chung một tệp .zip)</span></h3>
          <div className="grid3">
            <Field label="Đơn vị trong tệp">{(id) => <select id={id} value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>{Object.entries(UNIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
            <Field label="Trục hướng lên">{(id) => <select id={id} value={axis} onChange={(e) => setAxis(e.target.value as typeof axis)}>{Object.entries(AXIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
            <Field label="Tệp mô hình" hint={sizeOk ? 'Dùng kích thước khai báo để nhận đúng đơn vị và trục' : 'Nhập kích thước trước để tự nhận trục chính xác hơn'}>{(id) => (
              <input id={id} type="file" accept=".glb,.gltf,.fbx,.obj,.zip" disabled={progress !== null} onChange={(e) => e.target.files?.[0] && void sendModel(e.target.files[0])} />
            )}</Field>
          </div>
          {progress !== null && <div className="bar" aria-label="Đang tải lên"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
          {model?.status === 'processing' && <p className="small">Đang chuẩn hoá đơn vị, trục, tạo bản đầy đủ và bản nhẹ…</p>}
          {model?.status === 'failed' && <p className="small danger">{model.error}</p>}
          {model?.status === 'ready' && model.report && (
            <div className="model-ready">
              <div className="model-view">
                {previewUrl && (
                  <Suspense fallback={<div className="model-preview"><Skeleton rows={3} /></div>}>
                    <ModelPreview url={previewUrl} sizeMm={sizeOk ? sizeMm : measured} normalized={!!model.normalize?.result} onCapture={(fn) => (capture.current = fn)} />
                  </Suspense>
                )}
                <div className="row-actions">
                  <div className="seg" role="group" aria-label="Bản xem">
                    <button type="button" className={variant === 'full' ? 'on' : ''} onClick={() => setVariant('full')}>Đầy đủ</button>
                    <button type="button" className={variant === 'light' ? 'on' : ''} onClick={() => setVariant('light')} disabled={!model.lightUrl}>Nhẹ</button>
                  </div>
                  <Button type="button" small onClick={() => void snap()}>Chụp làm ảnh đại diện</Button>
                </div>
              </div>
              <div className="model-info">
                <ReportTable full={model.report} light={model.lightReport} />
                {model.normalize?.result && (
                  <p className="small">
                    Tệp {model.normalize.result.format.toUpperCase()} · đơn vị {UNIT_LABEL[model.normalize.result.unit].toLowerCase()} · trục {model.normalize.result.upAxis.toUpperCase()} hướng lên ·
                    đo được <strong>{model.normalize.result.measuredMm.map(fmtInt).join(' × ')} mm</strong>
                  </p>
                )}
                {model.reasons.length > 0 && <ul className="small muted">{model.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                {dev !== null && measured && dev > SIZE_WARN_PCT && (
                  <div className={dev > SIZE_MUST_CHOOSE_PCT ? 'size-notice is-danger' : 'size-notice'}>
                    <p className="small">Mô hình lệch {dev.toFixed(1)}% so với kích thước khai báo.{dev > SIZE_MUST_CHOOSE_PCT ? ' Chọn một cách trước khi lưu:' : ''}</p>
                    <div className="row-actions">
                      <Button type="button" small kind={f.acceptSizeMismatch ? 'primary' : 'default'} onClick={() => setF((s) => ({ ...s, acceptSizeMismatch: true }))}>Co giãn mô hình theo khai báo</Button>
                      <Button type="button" small onClick={() => setF((s) => ({ ...s, w: String(measured[0]), h: String(measured[1]), d: String(measured[2]), acceptSizeMismatch: false }))}>Lấy kích thước mô hình</Button>
                    </div>
                  </div>
                )}
                <p className="small muted">Mô hình nằm ngửa hay sai cỡ? Chọn đơn vị / trục ở trên rồi <button type="button" className="link-sm" disabled={reprocess.isPending} onClick={() => reprocess.mutate()}>xử lý lại</button>.</p>
              </div>
            </div>
          )}
        </div>

        <Field label="Ảnh">{(id) => (
          <div className="logo-row">
            {f.imageUrls.map((u) => <img key={u} src={u} alt="" />)}
            <input id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && void addImage(e.target.files[0])} />
          </div>
        )}</Field>

        <h3 className="span2">Nguồn & giấy phép <span className="muted small">(bắt buộc trước khi duyệt — BR-R1; giấy phép phi thương mại không dùng được)</span></h3>
        <Field label="Nguồn">{(id) => <select id={id} value={f.sourceKind} onChange={set('sourceKind')}>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
        <Field label="Giấy phép" error={errs.license}>{(id) => (
          <select id={id} value={f.license} onChange={set('license')}>
            <option value="">— chưa chọn —</option>
            {Object.entries(LICENSE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}</Field>
        <Field label="Tên kho / nhà cung cấp">{(id) => <input id={id} value={f.sourceName} onChange={set('sourceName')} placeholder="vd. Poly Haven, Nội thất An Phát" />}</Field>
        <Field label="Đường dẫn gốc" error={errs.sourceUrl}>{(id) => <input id={id} type="url" value={f.sourceUrl} onChange={set('sourceUrl')} placeholder="https://…" />}</Field>
        <Field label="Ghi công" hint="Bắt buộc với CC BY — hiện trong chi tiết đồ và trang Nguồn đồ & vật liệu">{(id) => <input id={id} value={f.attribution} onChange={set('attribution')} />}</Field>
        {isAdmin && (
          <Field label="Phạm vi" hint="Sản phẩm của khách chỉ dùng trong dự án của khách đó">{(id) => (
            <select id={id} value={f.clientId} onChange={set('clientId')}>
              <option value="">Kho chung</option>
              {clients.data?.items.map((c) => <option key={c.id} value={c.id}>Của {c.name}</option>)}
            </select>
          )}</Field>
        )}

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
          {cur && <Badge tone={statusTone(cur.status)}>{STATUS_LABEL[cur.status]}</Badge>}
          {cur && isAdmin && cur.status !== 'ready' && <Button type="button" kind="primary" disabled={act.isPending} onClick={() => act.mutate('approve')}>Duyệt giấy phép</Button>}
          {cur && isAdmin && cur.status !== 'retired' && <Button type="button" kind="ghost" disabled={act.isPending} onClick={() => act.mutate('retire')}>Ngừng dùng</Button>}
          {cur && <Button type="button" kind="danger" onClick={() => setDel(true)}>Xoá</Button>}
          <span className="grow" />
          <Button type="button" onClick={onClose}>Đóng</Button>
          <Button kind="primary" type="submit" disabled={save.isPending || model?.status === 'processing' || (dev !== null && dev > SIZE_MUST_CHOOSE_PCT && !f.acceptSizeMismatch)}>{cur ? 'Lưu' : 'Tạo nháp'}</Button>
        </footer>
      </form>
      {del && <Confirm title="Xoá đồ khỏi thư viện?" message={<p>Đồ đang dùng ở mẫu nhà nào thì không xoá được.</p>} confirmLabel="Xoá" danger busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDel(false)} />}
    </Modal>
  )
}
