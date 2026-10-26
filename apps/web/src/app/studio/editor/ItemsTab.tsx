import { useMemo, useState } from 'react'
import { assignItemsToRooms, ITEM_CATEGORIES, newId } from '@hd/core'
import type { ItemCategory, PlacedItem } from '@hd/core'
import { Button } from '../../ui.tsx'
import { CATEGORY } from '../Library.tsx'
import { currentFloor, useEditor } from './store.ts'
import { EditorScene, useResolved } from './EditorScene.tsx'

/** Tab Đồ (FR-05.02–05.04): đặt đồ thư viện bằng cách bấm sàn; gắn thông tin cho node `item_*` của mô hình. */
export const ItemsTab = () => {
  const doc = useEditor((s) => s.doc)!
  const floorId = useEditor((s) => s.floorId)
  const locked = useEditor((s) => s.state !== 'draft')
  const sel = useEditor((s) => s.selection)
  const { editFloor, select } = useEditor.getState()
  const floor = currentFloor({ doc, floorId })!
  const { resolved, library } = useResolved(doc)
  const [placing, setPlacing] = useState<string | null>(null)
  const [pickMode, setPickMode] = useState(false)
  const [q, setQ] = useState('')
  const selectedId = sel?.kind === 'item' ? sel.id : null
  const item = floor.items.find((i) => i.id === selectedId) ?? null
  const rooms = useMemo(() => assignItemsToRooms(floor), [floor])

  const place = (p: [number, number]) => {
    if (!placing || locked) return
    const id = newId('itm')
    editFloor((f) => void f.items.push({ id, source: { libraryItemId: placing }, position: p, elevation: 0, rotation: 0 }))
    select({ kind: 'item', id })
  }
  const pick = (modelAssetId: string, nodeName: string) => {
    if (!pickMode || locked) return
    const existing = floor.items.find((i) => 'modelNode' in i.source && i.source.modelNode.nodeName === nodeName)
    if (existing) return select({ kind: 'item', id: existing.id })
    const id = newId('itm')
    editFloor((f) => void f.items.push({ id, source: { modelNode: { modelAssetId, nodeName } }, info: { name: nodeName.replace(/^item_/i, '').replace(/[_-]+/g, ' '), category: 'other' }, position: [0, 0], elevation: 0, rotation: 0 }))
    select({ kind: 'item', id })
    setPickMode(false)
  }
  const setItem = (fn: (it: PlacedItem) => void, k: string) => editFloor((f) => fn(f.items.find((i) => i.id === selectedId)!), { coalesce: `${selectedId}:${k}` })
  const libFiltered = library.filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()))
  const lib = item && 'libraryItemId' in item.source ? resolved.libraryItems[item.source.libraryItemId] : null

  return (
    <div className="ed-3d">
      <div className="ed-3d-view">
        <EditorScene doc={doc} floorId={floorId} resolved={resolved} selectedItemId={selectedId} onSelectItem={(id) => select(id ? { kind: 'item', id } : null)} onFloorPoint={placing ? place : undefined} onPickNode={pickMode ? pick : undefined} />
        {(placing || pickMode) && (
          <div className="ed-float">
            {placing ? `Bấm lên sàn để đặt "${library.find((l) => l.id === placing)?.name}"` : 'Bấm vào một đồ (node item_…) trong mô hình'}
            <Button small onClick={() => (setPlacing(null), setPickMode(false))}>Xong</Button>
          </div>
        )}
      </div>
      <aside className="ed-right">
        {item ? (
          <div className="ins">
            <h3>{'modelNode' in item.source ? 'Đồ trong mô hình' : 'Đồ thư viện'}</h3>
            <p className="ins-big" style={{ fontSize: 16 }}>{item.info?.name ?? lib?.name}</p>
            <p className="muted small">Phòng: {floor.rooms.find((r) => r.id === rooms[item.id])?.name ?? 'ngoài phòng'}</p>
            {'libraryItemId' in item.source && (
              <>
                <label className="ins-field"><span>X</span><span className="ins-num"><input type="number" step={10} disabled={locked} value={item.position[0]} onChange={(e) => setItem((it) => (it.position = [Number(e.target.value), it.position[1]]), 'x')} /><em>mm</em></span></label>
                <label className="ins-field"><span>Y</span><span className="ins-num"><input type="number" step={10} disabled={locked} value={item.position[1]} onChange={(e) => setItem((it) => (it.position = [it.position[0], Number(e.target.value)]), 'y')} /><em>mm</em></span></label>
                <label className="ins-field"><span>Xoay</span><span className="ins-num"><input type="number" step={15} disabled={locked} value={item.rotation} onChange={(e) => setItem((it) => (it.rotation = Number(e.target.value)), 'r')} /><em>°</em></span></label>
                <div className="ins-row">{[0, 90, 180, 270].map((a) => <Button key={a} small disabled={locked} onClick={() => setItem((it) => (it.rotation = a), 'r')}>{a}°</Button>)}</div>
                <label className="ins-field"><span>Cao độ đặt</span><span className="ins-num"><input type="number" step={10} disabled={locked} value={item.elevation} onChange={(e) => setItem((it) => (it.elevation = Number(e.target.value)), 'e')} /><em>mm</em></span></label>
                {lib && lib.variants.length > 1 && (
                  <label className="ins-field"><span>Biến thể mặc định</span>
                    <select disabled={locked} value={item.variantId ?? lib.variants[0].id} onChange={(e) => setItem((it) => (it.variantId = e.target.value), 'v')}>{lib.variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
                  </label>
                )}
              </>
            )}
            {'modelNode' in item.source && (
              <>
                <label className="ins-field"><span>Tên hiển thị</span><input disabled={locked} value={item.info?.name ?? ''} onChange={(e) => setItem((it) => (it.info = { ...it.info, name: e.target.value || ' ' }), 'n')} /></label>
                <label className="ins-field"><span>Loại</span>
                  <select disabled={locked} value={item.info?.category ?? 'other'} onChange={(e) => setItem((it) => (it.info = { ...it.info, category: e.target.value as ItemCategory }), 'c')}>{ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY[c]}</option>)}</select>
                </label>
                {(['Rộng', 'Cao', 'Sâu'] as const).map((l, i) => (
                  <label key={l} className="ins-field"><span>{l}</span><span className="ins-num"><input type="number" min={1} disabled={locked} value={item.info?.sizeMm?.[i] ?? ''} onChange={(e) => setItem((it) => {
                    const s = [...(it.info?.sizeMm ?? [1000, 1000, 1000])] as [number, number, number]
                    s[i] = Math.max(1, Number(e.target.value))
                    it.info = { ...it.info, sizeMm: s }
                  }, `s${i}`)} /><em>mm</em></span></label>
                ))}
                <label className="ins-field"><span>Chất liệu</span><input disabled={locked} value={item.info?.material ?? ''} onChange={(e) => setItem((it) => (it.info = { ...it.info, material: e.target.value }), 'm')} /></label>
                <label className="ins-field"><span>Thương hiệu</span><input disabled={locked} value={item.info?.brand ?? ''} onChange={(e) => setItem((it) => (it.info = { ...it.info, brand: e.target.value }), 'b')} /></label>
                <label className="ins-field"><span>Mô tả</span><textarea rows={3} disabled={locked} value={item.info?.description ?? ''} onChange={(e) => setItem((it) => (it.info = { ...it.info, description: e.target.value }), 'd')} /></label>
              </>
            )}
            <Button small kind="danger" disabled={locked} onClick={() => (editFloor((f) => void (f.items = f.items.filter((i) => i.id !== item.id))), select(null))}>Xoá đồ</Button>
            <Button small kind="ghost" onClick={() => select(null)}>← Danh sách</Button>
          </div>
        ) : (
          <div className="ins">
            <h3>Thêm đồ</h3>
            <Button small onClick={() => (setPickMode(true), setPlacing(null))} disabled={locked}>Chọn từ mô hình (item_…)</Button>
            <input placeholder="Tìm trong thư viện…" value={q} onChange={(e) => setQ(e.target.value)} className="ins-search" />
            <ul className="lib-list">
              {libFiltered.map((l) => (
                <li key={l.id}>
                  <span className="dot" style={{ background: l.variants[0]?.color ?? '#ccc' }} />
                  <span className="grow">{l.name}<em>{CATEGORY[l.category]}{l.model?.status === 'ready' ? ' · 3D' : ''}{l.clientName ? ` · của ${l.clientName}` : ''}</em></span>
                  {l.status === 'draft' && <span className="badge badge-warn" title="Đặt thử được; chưa gửi duyệt được tới khi QTV duyệt giấy phép">Nháp</span>}
                  <Button small kind={placing === l.id ? 'primary' : 'default'} disabled={locked} onClick={() => (setPlacing(l.id), setPickMode(false))}>Đặt</Button>
                </li>
              ))}
            </ul>
            <h3>Trên {floor.name} ({floor.items.length})</h3>
            <ul className="lib-list">
              {floor.items.map((it) => (
                <li key={it.id}>
                  <button className="link-row" onClick={() => select({ kind: 'item', id: it.id })}>
                    {it.info?.name ?? ('libraryItemId' in it.source ? resolved.libraryItems[it.source.libraryItemId]?.name : it.source.modelNode.nodeName)}
                    <em>{floor.rooms.find((r) => r.id === rooms[it.id])?.name ?? 'ngoài phòng'}</em>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  )
}
