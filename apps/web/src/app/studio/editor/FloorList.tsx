import { useState } from 'react'
import { duplicateFloor, emptyFloor, MAX_FLOORS, sortedFloors } from '@hd/core'
import { useEditor } from './store.ts'
import { Button, Confirm } from '../../ui.tsx'

/** Danh sách tầng (FR-03.02, FR-03.09): thêm, sao chép, xoá; sắp theo cao độ. */
export const FloorList = () => {
  const doc = useEditor((s) => s.doc)
  const floorId = useEditor((s) => s.floorId)
  const locked = useEditor((s) => s.state !== 'draft')
  const { edit, setFloor } = useEditor.getState()
  const [del, setDel] = useState<string | null>(null)
  if (!doc) return null
  const floors = [...sortedFloors(doc)].reverse()
  const full = doc.floors.length >= MAX_FLOORS
  const add = () => {
    const top = doc.floors.reduce((m, f) => Math.max(m, f.elevation + f.height), 0)
    const order = Math.max(0, ...doc.floors.map((f) => f.order)) + 1
    const f = emptyFloor(`Tầng ${doc.floors.length + 1}`, order, top)
    edit((d) => void d.floors.push(f))
    setFloor(f.id)
  }
  const dup = () => {
    const f = duplicateFloor(doc, floorId, `${doc.floors.find((x) => x.id === floorId)?.name ?? 'Tầng'} (bản sao)`)
    edit((d) => void d.floors.push(f))
    setFloor(f.id)
  }
  return (
    <div className="floors">
      <h3>Tầng</h3>
      <ul>
        {floors.map((f) => (
          <li key={f.id}>
            <button className={f.id === floorId ? 'on' : ''} onClick={() => setFloor(f.id)}>
              <span>{f.name}</span>
              <em>{(f.elevation / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 2 })} m{f.calibrated ? '' : ' · chưa tỷ lệ'}</em>
            </button>
          </li>
        ))}
      </ul>
      <div className="floors-actions">
        <Button small onClick={add} disabled={locked || full} title={full ? `Tối đa ${MAX_FLOORS} tầng` : ''}>+ Tầng</Button>
        <Button small onClick={dup} disabled={locked || full}>Sao chép</Button>
        <Button small kind="ghost" onClick={() => setDel(floorId)} disabled={locked || doc.floors.length <= 1}>Xoá</Button>
      </div>
      {del && (
        <Confirm
          title="Xoá tầng?"
          message={<p>Xoá <b>{doc.floors.find((f) => f.id === del)?.name}</b> cùng tường, phòng, đồ trên tầng. Có thể hoàn tác (Ctrl+Z).</p>}
          confirmLabel="Xoá tầng"
          danger
          onConfirm={() => {
            edit((d) => {
              d.floors = d.floors.filter((f) => f.id !== del)
              d.floors.forEach((f) => f.stairs.forEach((s) => s.toFloorId === del && (s.toFloorId = undefined)))
              d.viewpoints = d.viewpoints.filter((v) => v.floorId !== del)
            })
            setFloor(sortedFloors(useEditor.getState().doc!)[0].id)
            setDel(null)
          }}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  )
}
