import { useState } from 'react'
import { DEFAULT_FINISH, DEFAULT_SHARED_FINISH, MATERIAL_CATEGORY_LABEL, roomArea, formatArea } from '@hd/core'
import type { MaterialCategory, Room } from '@hd/core'
import { Button, toast } from '../../ui.tsx'
import type { MaterialRow } from '../../types.ts'
import { Swatch } from '../Materials.tsx'
import { currentFloor, useEditor } from './store.ts'
import { EditorScene, useResolved } from './EditorScene.tsx'

/*
 * Tab "Vật liệu & ánh sáng" (item 03 lát R1, FR-13.11, 13.12): gán vật liệu thật cho sàn / tường / trần từng phòng,
 * cửa đi / bậc thang / mặt ngoài; hướng nhà và giờ cho nắng. Chỉ vật liệu Sẵn dùng mới gửi duyệt được (MATERIAL_NOT_READY).
 */

type Surface = 'floor' | 'wall' | 'ceiling'
const SURFACE: Record<Surface, { label: string; cats: MaterialCategory[] }> = {
  floor: { label: 'Sàn', cats: ['wood', 'tile', 'stone', 'concrete', 'other'] },
  wall: { label: 'Tường', cats: ['paint', 'plaster', 'tile', 'stone', 'brick', 'wood', 'other'] },
  ceiling: { label: 'Trần', cats: ['paint', 'plaster', 'wood', 'other'] },
}
const DIRS = ['Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc']
/** Hướng mặt tiền (phía y nhỏ của mặt bằng) theo `northDeg` — xem scene/sun.ts. */
export const frontFacing = (northDeg: number) => DIRS[Math.round((((360 - northDeg) % 360) + 360) % 360 / 45) % 8]

const Picker = ({ rows, value, cats, onPick }: { rows: MaterialRow[]; value?: string; cats: MaterialCategory[]; onPick: (id: string | undefined) => void }) => {
  const list = rows.filter((m) => cats.includes(m.category) && (m.status !== 'retired' || m.id === value))
  return (
    <div className="mat-pick" role="listbox">
      <button className={!value ? 'on' : ''} onClick={() => onPick(undefined)} title="Hiển thị mặc định của hệ thống">
        <span className="mat-swatch" style={{ width: 44, height: 44, background: 'repeating-linear-gradient(45deg,#eee,#eee 6px,#ddd 6px,#ddd 12px)' }} />
        Không gán
      </button>
      {list.map((m) => (
        <button key={m.id} className={value === m.id ? 'on' : ''} onClick={() => onPick(m.id)} title={`${m.name} · ${MATERIAL_CATEGORY_LABEL[m.category]}${m.status === 'draft' ? ' · chưa duyệt giấy phép' : ''}`} role="option" aria-selected={value === m.id}>
          <Swatch m={m} size={44} />
          {m.name}{m.status === 'draft' ? ' ⚠' : ''}
        </button>
      ))}
    </div>
  )
}

export const FinishTab = () => {
  const doc = useEditor((s) => s.doc)!
  const floorId = useEditor((s) => s.floorId)
  const locked = useEditor((s) => s.state !== 'draft')
  const { edit, editFloor } = useEditor.getState()
  const floor = currentFloor({ doc, floorId })!
  const { resolved, materials } = useResolved(doc)
  const [roomId, setRoomId] = useState<string | null>(floor.rooms[0]?.id ?? null)
  const [surface, setSurface] = useState<Surface>('floor')
  const room = floor.rooms.find((r) => r.id === roomId) ?? null
  const byKey = new Map(materials.map((m) => [m.key, m.id]))

  const setRoomFinish = (r: Room, s: Surface, id: string | undefined) =>
    editFloor((f) => {
      const x = f.rooms.find((y) => y.id === r.id)!
      x.finish = { ...x.finish, [s]: id }
    }, { coalesce: `finish:${r.id}:${s}` })
  const applyDefaults = () => {
    let n = 0
    editFloor((f) => {
      for (const r of f.rooms) {
        const d = DEFAULT_FINISH[r.function] ?? DEFAULT_FINISH.other
        r.finish = { floor: byKey.get(d.floor), wall: byKey.get(d.wall), ceiling: byKey.get(d.ceiling) }
        n++
      }
    })
    edit((d) => {
      d.finishes = { door: d.finishes?.door ?? byKey.get(DEFAULT_SHARED_FINISH.door), stair: d.finishes?.stair ?? byKey.get(DEFAULT_SHARED_FINISH.stair), facade: d.finishes?.facade ?? byKey.get('vua-trang') }
    })
    toast(`Đã gán vật liệu mặc định cho ${n} phòng của ${floor.name}`)
  }
  const sameFunction = room ? floor.rooms.filter((r) => r.function === room.function) : []
  const copyToSame = () =>
    editFloor((f) => {
      for (const r of f.rooms) if (room && r.function === room.function && r.id !== room.id) r.finish = { ...room.finish }
    })
  const setShared = (k: 'door' | 'stair' | 'facade', id: string | undefined) => edit((d) => void (d.finishes = { ...d.finishes, [k]: id }), { coalesce: `shared:${k}` })
  const north = doc.lighting.northDeg ?? 180
  const hour = doc.lighting.hour ?? 9

  return (
    <div className="ed-3d">
      <div className="ed-3d-view">
        <EditorScene doc={doc} floorId={floorId} resolved={resolved} wallMode="auto" selectedRoomId={roomId} onRoomPick={setRoomId} />
        <div className="ed-float">Bấm vào sàn một phòng để chọn phòng</div>
      </div>
      <aside className="ed-right">
        <div className="ins">
          <h3>Vật liệu</h3>
          <Button small disabled={locked || !materials.length} onClick={applyDefaults}>Gán mặc định theo công năng cho cả tầng</Button>
          <label className="ins-field"><span>Phòng</span>
            <select value={roomId ?? ''} onChange={(e) => setRoomId(e.target.value || null)}>
              {floor.rooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {formatArea(roomArea(r.polygon))}</option>)}
            </select>
          </label>
          {room && (
            <>
              <div className="seg small">
                {(Object.keys(SURFACE) as Surface[]).map((s) => (
                  <button key={s} className={surface === s ? 'on' : ''} onClick={() => setSurface(s)}>{SURFACE[s].label}</button>
                ))}
              </div>
              <Picker rows={materials} value={room.finish?.[surface]} cats={SURFACE[surface].cats} onPick={(id) => !locked && setRoomFinish(room, surface, id)} />
              {sameFunction.length > 1 && <Button small kind="ghost" disabled={locked} onClick={copyToSame}>Áp cho {sameFunction.length - 1} phòng cùng công năng</Button>}
            </>
          )}
          <h3>Dùng chung</h3>
          {([['door', 'Cửa đi', ['wood', 'metal', 'paint', 'other']], ['stair', 'Bậc cầu thang', ['wood', 'stone', 'tile', 'concrete']], ['facade', 'Mặt ngoài tường bao', ['paint', 'plaster', 'brick', 'stone', 'tile', 'concrete']]] as const).map(([k, label, cats]) => (
            <label key={k} className="ins-field"><span>{label}</span>
              <select value={doc.finishes?.[k] ?? ''} disabled={locked} onChange={(e) => setShared(k, e.target.value || undefined)}>
                <option value="">Mặc định hệ thống</option>
                {materials.filter((m) => (cats as readonly string[]).includes(m.category) && m.status !== 'retired').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          ))}

          <h3>Ánh sáng</h3>
          <div className="compass">
            <svg width="56" height="56" viewBox="-28 -28 56 56" aria-hidden="true">
              <circle r="26" fill="none" stroke="currentColor" opacity="0.25" />
              <g transform={`rotate(${north})`}><path d="M0 -24 L6 0 L0 -4 L-6 0 Z" fill="#c0392b" /><text y="-12" textAnchor="middle" fontSize="8" fill="#fff">B</text></g>
              <rect x="-10" y="16" width="20" height="4" fill="currentColor" opacity="0.6" />
            </svg>
            <span className="small">Mặt tiền (cạnh dưới mặt bằng) nhìn về hướng <b>{frontFacing(north)}</b></span>
          </div>
          <label className="ins-field"><span>Hướng Bắc {Math.round(north)}°</span>
            <input type="range" min="0" max="359" step="1" value={north} disabled={locked} onChange={(e) => edit((d) => void (d.lighting.northDeg = Number(e.target.value)), { coalesce: 'north' })} />
          </label>
          <label className="ins-field"><span>Giờ nắng {String(Math.floor(hour)).padStart(2, '0')}:{hour % 1 ? '30' : '00'}</span>
            <input type="range" min="6" max="18" step="0.5" value={hour} disabled={locked} onChange={(e) => edit((d) => void (d.lighting.hour = Number(e.target.value)), { coalesce: 'hour' })} />
          </label>
          <label className="ins-field row"><input type="checkbox" checked={doc.lighting.night} disabled={locked} onChange={(e) => edit((d) => void (d.lighting.night = e.target.checked))} /> <span>Cho người xem bật chế độ Đêm</span></label>
          {materials.some((m) => m.status === 'draft' && Object.values(floor.rooms.map((r) => r.finish)).some((f) => f && Object.values(f).includes(m.id))) && (
            <p className="small warn">⚠ Có vật liệu chưa được QTV duyệt giấy phép — chưa gửi duyệt được.</p>
          )}
        </div>
      </aside>
    </div>
  )
}
