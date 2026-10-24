import { floorGrossArea, formatArea, OUTDOOR_KINDS, ROOM_FUNCTIONS, roomArea, sortedFloors } from '@hd/core'
import type { Floor } from '@hd/core'
import { currentFloor, useEditor } from './store.ts'
import type { FileInfo } from './PlanCanvas.tsx'
import { Button } from '../../ui.tsx'

export const ROOM_FN: Record<string, string> = {
  living: 'Phòng khách', kitchen: 'Bếp', dining: 'Phòng ăn', bedroom: 'Phòng ngủ', bathroom: 'Phòng tắm', wc: 'WC', study: 'Phòng làm việc',
  worship: 'Phòng thờ', laundry: 'Giặt phơi', storage: 'Kho', garage: 'Gara', hall: 'Sảnh / hành lang', stair: 'Cầu thang', other: 'Khác',
}
const AREA_KIND: Record<string, string> = { yard: 'Sân', garden: 'Vườn', pool: 'Hồ bơi', terrace: 'Sân thượng', balcony: 'Ban công', loggia: 'Lô gia' }

const Num = ({ label, value, onChange, step = 10, min = 0, unit = 'mm', disabled }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; unit?: string; disabled?: boolean }) => (
  <label className="ins-field">
    <span>{label}</span>
    <span className="ins-num">
      <input type="number" value={Math.round(value)} step={step} min={min} disabled={disabled} onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))} />
      <em>{unit}</em>
    </span>
  </label>
)

const Text = ({ label, value, onChange, disabled }: { label: string; value: string; onChange: (s: string) => void; disabled?: boolean }) => (
  <label className="ins-field">
    <span>{label}</span>
    <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
  </label>
)

/** Bảng thuộc tính (02b §3.1 Inspector). */
export const Inspector = ({ files, inputFiles }: { files: Record<string, FileInfo>; inputFiles: { id: string; name: string; mime: string }[] }) => {
  const doc = useEditor((s) => s.doc)
  const floorId = useEditor((s) => s.floorId)
  const sel = useEditor((s) => s.selection)
  const locked = useEditor((s) => s.state !== 'draft')
  const { editFloor, edit, select } = useEditor.getState()
  const floor = currentFloor({ doc, floorId })
  if (!doc || !floor) return null
  const key = (k: string) => ({ coalesce: `${sel?.id ?? floor.id}:${k}` })

  if (sel?.kind === 'wall') {
    const w = floor.walls.find((x) => x.id === sel.id)
    if (!w) return null
    const set = (fn: (x: NonNullable<typeof w>) => void, k: string) => editFloor((f) => fn(f.walls.find((x) => x.id === sel.id)!), key(k))
    return (
      <div className="ins">
        <h3>Tường</h3>
        <Num label="Độ dày" value={w.thickness} onChange={(n) => set((x) => (x.thickness = Math.max(20, n)), 't')} disabled={locked} />
        <Num label="Chiều cao" value={w.height ?? floor.height} onChange={(n) => set((x) => (x.height = n), 'h')} disabled={locked} />
        <p className="muted small">Dài {Math.round(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])).toLocaleString('vi-VN')} mm · {floor.openings.filter((o) => o.wallId === w.id).length} lỗ cửa</p>
        <p className="muted small">Kéo ô vuông ở hai đầu để sửa. Phím Delete để xoá.</p>
      </div>
    )
  }
  if (sel?.kind === 'opening') {
    const o = floor.openings.find((x) => x.id === sel.id)
    if (!o) return null
    const set = (fn: (x: NonNullable<typeof o>) => void, k: string) => editFloor((f) => fn(f.openings.find((x) => x.id === sel.id)!), key(k))
    return (
      <div className="ins">
        <h3>{o.kind === 'door' ? 'Cửa đi' : 'Cửa sổ'}</h3>
        <label className="ins-field"><span>Loại</span>
          <select value={o.kind} disabled={locked} onChange={(e) => set((x) => { x.kind = e.target.value as 'door' | 'window'; x.sill = x.kind === 'door' ? 0 : 900 }, 'k')}>
            <option value="door">Cửa đi</option><option value="window">Cửa sổ</option>
          </select>
        </label>
        <Num label="Cách đầu tường" value={o.offset} onChange={(n) => set((x) => (x.offset = Math.max(0, n)), 'o')} disabled={locked} />
        <Num label="Rộng" value={o.width} onChange={(n) => set((x) => (x.width = Math.max(300, n)), 'w')} disabled={locked} />
        <Num label="Cao" value={o.height} onChange={(n) => set((x) => (x.height = Math.max(300, n)), 'hh')} disabled={locked} />
        {o.kind === 'window' && <Num label="Cao độ bậu" value={o.sill} onChange={(n) => set((x) => (x.sill = n), 's')} disabled={locked} />}
        {o.kind === 'door' && (
          <div className="ins-row">
            <Button small disabled={locked} onClick={() => set((x) => (x.hinge = x.hinge === 'start' ? 'end' : 'start'), 'hg')}>Đổi bản lề</Button>
            <Button small disabled={locked} onClick={() => set((x) => (x.swing = x.swing === 'left' ? 'right' : 'left'), 'sw')}>Đổi hướng mở</Button>
          </div>
        )}
      </div>
    )
  }
  if (sel?.kind === 'room') {
    const r = floor.rooms.find((x) => x.id === sel.id)
    if (!r) return null
    const set = (fn: (x: NonNullable<typeof r>) => void, k: string) => editFloor((f) => fn(f.rooms.find((x) => x.id === sel.id)!), key(k))
    return (
      <div className="ins">
        <h3>Phòng</h3>
        <Text label="Tên" value={r.name} onChange={(s) => set((x) => (x.name = s.slice(0, 80) || ' '), 'n')} disabled={locked} />
        <label className="ins-field"><span>Công năng</span>
          <select value={r.function} disabled={locked} onChange={(e) => set((x) => {
            const fn = e.target.value as NonNullable<typeof r>["function"]
            if (/^Phòng \d+$|^(Phòng|Khác)( \d+)?$/.test(x.name) || x.name === ROOM_FN[x.function]) x.name = ROOM_FN[fn]
            x.function = fn
          }, 'f')}>
            {ROOM_FUNCTIONS.map((f) => <option key={f} value={f}>{ROOM_FN[f]}</option>)}
          </select>
        </label>
        {floor.calibrated && <p className="ins-big">{formatArea(roomArea(r.polygon))}</p>}
        <p className="muted small">Diện tích tính theo lòng tường (BR-04). Vẽ đa giác theo mặt trong tường.</p>
      </div>
    )
  }
  if (sel?.kind === 'stair') {
    const s = floor.stairs.find((x) => x.id === sel.id)
    if (!s) return null
    const set = (fn: (x: NonNullable<typeof s>) => void, k: string) => editFloor((f) => fn(f.stairs.find((x) => x.id === sel.id)!), key(k))
    const others = sortedFloors(doc).filter((f) => f.id !== floor.id)
    return (
      <div className="ins">
        <h3>Cầu thang</h3>
        <label className="ins-field"><span>Hướng lên</span>
          <select value={((s.upDirection % 360) + 360) % 360} disabled={locked} onChange={(e) => set((x) => (x.upDirection = Number(e.target.value)), 'u')}>
            <option value={0}>→ Phải</option><option value={90}>↓ Xuống</option><option value={180}>← Trái</option><option value={270}>↑ Lên</option>
          </select>
        </label>
        <label className="ins-field"><span>Lên tới tầng</span>
          <select value={s.toFloorId ?? ''} disabled={locked} onChange={(e) => set((x) => (x.toFloorId = e.target.value || undefined), 't')}>
            <option value="">—</option>
            {others.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
      </div>
    )
  }
  if (sel?.kind === 'area') {
    const a = floor.areas.find((x) => x.id === sel.id)
    if (!a) return null
    const set = (fn: (x: NonNullable<typeof a>) => void, k: string) => editFloor((f) => fn(f.areas.find((x) => x.id === sel.id)!), key(k))
    return (
      <div className="ins">
        <h3>Khu vực ngoài nhà</h3>
        <Text label="Tên" value={a.name} onChange={(v) => set((x) => (x.name = v.slice(0, 80) || ' '), 'n')} disabled={locked} />
        <label className="ins-field"><span>Loại</span>
          <select value={a.kind} disabled={locked} onChange={(e) => set((x) => (x.kind = e.target.value as NonNullable<typeof a>["kind"], x.name = AREA_KIND[x.kind]), 'k')}>
            {OUTDOOR_KINDS.map((k) => <option key={k} value={k}>{AREA_KIND[k]}</option>)}
          </select>
        </label>
        {floor.calibrated && <p className="ins-big">{formatArea(roomArea(a.polygon))}</p>}
      </div>
    )
  }
  if (sel?.kind === 'outline') {
    return (
      <div className="ins">
        <h3>Đường bao tầng</h3>
        {floor.calibrated && <p className="ins-big">{formatArea(floorGrossArea(floor).m2)}</p>}
        <p className="muted small">Dùng để tính diện tích sàn theo mép ngoài tường bao (BR-04).</p>
      </div>
    )
  }

  // không chọn gì: thuộc tính tầng + ảnh nền
  return <FloorPanel floor={floor} files={files} inputFiles={inputFiles} locked={locked} onEdit={(fn, k) => editFloor(fn, key(k))} onDocEdit={edit} onDeselect={() => select(null)} />
}

const FloorPanel = ({ floor, files, inputFiles, locked, onEdit }: {
  floor: Floor
  files: Record<string, FileInfo>
  inputFiles: { id: string; name: string; mime: string }[]
  locked: boolean
  onEdit: (fn: (f: Floor) => void, k: string) => void
  onDocEdit: unknown
  onDeselect: () => void
}) => {
  const area = floorGrossArea(floor)
  const u = floor.underlay
  const usable = inputFiles.filter((f) => /^image\/|application\/pdf/.test(f.mime))
  return (
    <div className="ins">
      <h3>Tầng</h3>
      <Text label="Tên tầng" value={floor.name} onChange={(s) => onEdit((f) => (f.name = s.slice(0, 60) || ' '), 'fn')} disabled={locked} />
      <Num label="Cao độ sàn" value={floor.elevation} onChange={(n) => onEdit((f) => (f.elevation = n), 'fe')} disabled={locked} min={-10000} />
      <Num label="Chiều cao tầng" value={floor.height} onChange={(n) => onEdit((f) => (f.height = Math.max(1800, n)), 'fh')} disabled={locked} />
      {floor.calibrated && <p className="muted small">Diện tích sàn {formatArea(area.m2)}{area.fromOutline ? '' : ' (chưa có đường bao)'}</p>}

      <h3>Ảnh nền mặt bằng</h3>
      <label className="ins-field"><span>Tệp</span>
        <select value={u?.fileId ?? ''} disabled={locked} onChange={(e) => onEdit((f) => {
          const id = e.target.value
          f.underlay = id ? { fileId: id, page: 1, mmPerPx: f.underlay?.mmPerPx ?? 10, offset: f.underlay?.offset ?? [0, 0], rotation: 0, opacity: 0.5 } : undefined
        }, 'uf')}>
          <option value="">— Không dùng —</option>
          {usable.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      {!usable.length && <p className="muted small">Tải ảnh/PDF mặt bằng ở tab Tài liệu của dự án.</p>}
      {u && (
        <>
          {files[u.fileId]?.mime === 'application/pdf' && <Num label="Trang PDF" value={u.page ?? 1} unit="" step={1} min={1} onChange={(n) => onEdit((f) => (f.underlay!.page = Math.max(1, n)), 'up')} disabled={locked} />}
          <label className="ins-field"><span>Độ mờ</span><input type="range" min={0.1} max={1} step={0.05} value={u.opacity} disabled={locked} onChange={(e) => onEdit((f) => (f.underlay!.opacity = Number(e.target.value)), 'uo')} /></label>
          <Num label="Xoay" value={u.rotation} unit="°" step={0.5} min={-180} onChange={(n) => onEdit((f) => (f.underlay!.rotation = n), 'ur')} disabled={locked} />
        </>
      )}
      <div className={floor.calibrated ? 'ins-status ok' : 'ins-status warn'}>
        {floor.calibrated ? 'Đã hiệu chỉnh tỷ lệ' : u ? 'Chưa hiệu chỉnh tỷ lệ. Chọn công cụ "Tỷ lệ", vẽ một đoạn trùng kích thước đã biết.' : 'Chưa hiệu chỉnh tỷ lệ.'}
      </div>
      {!u && !floor.calibrated && (
        <Button small disabled={locked} onClick={() => onEdit((f) => (f.calibrated = true), 'cal')}>Tôi vẽ theo mm thật (không dùng ảnh nền)</Button>
      )}
    </div>
  )
}
