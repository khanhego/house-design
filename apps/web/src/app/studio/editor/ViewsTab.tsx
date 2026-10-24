import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as THREE from 'three'
import { newId, sortedFloors } from '@hd/core'
import { api, upload } from '../../../lib/api.ts'
import { Button, errMsg, toast } from '../../ui.tsx'
import { currentFloor, useEditor } from './store.ts'
import { EditorScene, useResolved } from './EditorScene.tsx'
import type { FileOut } from '../../types.ts'

/** Tab Điểm nhìn & ảnh (FR-04.05–04.07): điểm nhìn, chế độ Đêm, ảnh đại diện, thư viện ảnh phối cảnh (V4). */
export const ViewsTab = ({ projectId }: { projectId: string }) => {
  const doc = useEditor((s) => s.doc)!
  const floorId = useEditor((s) => s.floorId)
  const locked = useEditor((s) => s.state !== 'draft')
  const { edit } = useEditor.getState()
  const floor = currentFloor({ doc, floorId })!
  const { resolved } = useResolved(doc)
  const cam = useRef<THREE.Camera | null>(null)
  const target = useRef(new THREE.Vector3())
  const wrap = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const imgs = useQuery({
    queryKey: ['files', projectId, 'images'],
    queryFn: async () => {
      const [c, g] = await Promise.all([api<{ items: FileOut[] }>('GET', `projects/${projectId}/files?kind=cover`), api<{ items: FileOut[] }>('GET', `projects/${projectId}/files?kind=gallery_image`)])
      return Object.fromEntries([...c.items, ...g.items].map((f) => [f.id, f.url]))
    },
  })

  const saveView = () => {
    const c = cam.current
    if (!c) return
    const p = c.position
    const t = target.current
    const name = `${floor.name} · góc ${doc.viewpoints.length + 1}`
    edit((d) => void d.viewpoints.push({
      id: newId('vpt'), name, kind: 'room', floorId, position: [Math.round(p.x * 1000), Math.round(p.z * 1000), Math.round(p.y * 1000)],
      target: [Math.round(t.x * 1000), Math.round(t.z * 1000), Math.round(t.y * 1000)], isDefault: d.viewpoints.length === 0,
    }))
    toast('Đã lưu góc nhìn')
  }

  const capture = async () => {
    const canvas = wrap.current?.querySelector('canvas')
    if (!canvas) return
    setBusy(true)
    try {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88))
      if (!blob) throw new Error('capture')
      const r = await upload<{ file: { id: string; url: string } }>('files', new File([blob], 'anh-dai-dien.jpg', { type: 'image/jpeg' }), { kind: 'cover', projectId })
      edit((d) => void (d.coverFileId = r.file.id))
      await imgs.refetch()
      toast('Đã đặt ảnh đại diện')
    } catch (e) {
      toast(errMsg(e), 'danger')
    } finally {
      setBusy(false)
    }
  }

  const addGallery = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (doc.gallery.length >= 12) return toast('Tối đa 12 ảnh phối cảnh', 'danger')
      try {
        const r = await upload<{ file: { id: string } }>('files', file, { kind: 'gallery_image', projectId })
        edit((d) => void d.gallery.push(r.file.id))
      } catch (e) {
        toast(errMsg(e), 'danger')
      }
    }
    void imgs.refetch()
  }

  const url = (id?: string) => (id ? imgs.data?.[id] : undefined)
  const floorName = (id?: string) => sortedFloors(doc).find((f) => f.id === id)?.name ?? 'Cả nhà'

  return (
    <div className="ed-3d">
      <div className="ed-3d-view" ref={wrap}>
        <EditorScene doc={doc} floorId={floorId} resolved={resolved} camRef={cam} targetRef={target} night={doc.lighting.night} />
      </div>
      <aside className="ed-right">
        <div className="ins">
          <h3>Điểm nhìn</h3>
          <Button small kind="primary" disabled={locked} onClick={saveView}>Lưu góc nhìn hiện tại</Button>
          {!doc.viewpoints.length && <p className="muted small">Chưa có điểm nhìn. Trang xem sẽ tự chọn góc toàn cảnh.</p>}
          <ul className="lib-list">
            {doc.viewpoints.map((v) => (
              <li key={v.id}>
                <input
                  className="grow"
                  value={v.name}
                  disabled={locked}
                  aria-label="Tên điểm nhìn"
                  onChange={(e) => edit((d) => void (d.viewpoints.find((x) => x.id === v.id)!.name = e.target.value || ' '), { coalesce: `vp:${v.id}` })}
                />
                <label className="small nowrap"><input type="radio" name="vdef" checked={v.isDefault} disabled={locked} onChange={() => edit((d) => d.viewpoints.forEach((x) => (x.isDefault = x.id === v.id)))} /> Mặc định</label>
                <Button small kind="ghost" disabled={locked} onClick={() => edit((d) => void (d.viewpoints = d.viewpoints.filter((x) => x.id !== v.id)))}>×</Button>
              </li>
            ))}
          </ul>
          <p className="muted small">{doc.viewpoints.length ? `Điểm nhìn gắn với tầng: ${[...new Set(doc.viewpoints.map((v) => floorName(v.floorId)))].join(', ')}` : ''}</p>

          <h3>Ánh sáng</h3>
          <label className="check"><input type="checkbox" checked={doc.lighting.night} disabled={locked} onChange={(e) => edit((d) => void (d.lighting.night = e.target.checked))} /> Có chế độ Đêm trên trang xem</label>

          <h3>Ảnh đại diện</h3>
          {url(doc.coverFileId) ? <img className="ins-cover" src={url(doc.coverFileId)} alt="Ảnh đại diện" /> : <p className="muted small">Chưa có ảnh đại diện (bắt buộc khi gửi duyệt).</p>}
          <div className="ins-row">
            <Button small disabled={locked || busy} onClick={() => void capture()}>{busy ? 'Đang chụp…' : 'Chụp từ góc hiện tại'}</Button>
            <label className="ab ab-sm">Tải ảnh lên<input type="file" hidden accept="image/png,image/jpeg,image/webp" disabled={locked} onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const r = await upload<{ file: { id: string } }>('files', file, { kind: 'cover', projectId })
                edit((d) => void (d.coverFileId = r.file.id))
                void imgs.refetch()
              } catch (err) {
                toast(errMsg(err), 'danger')
              }
            }} /></label>
          </div>

          <h3>Ảnh phối cảnh ({doc.gallery.length}/12)</h3>
          <p className="muted small">Hiện khi thiết bị không chạy được 3D (V4).</p>
          <div className="gallery">
            {doc.gallery.map((id) => (
              <figure key={id}>
                {url(id) ? <img src={url(id)} alt="" /> : <span />}
                {!locked && <button onClick={() => edit((d) => void (d.gallery = d.gallery.filter((x) => x !== id)))} aria-label="Bỏ ảnh">×</button>}
              </figure>
            ))}
          </div>
          <label className="ab ab-sm">Thêm ảnh phối cảnh<input type="file" hidden multiple accept="image/png,image/jpeg,image/webp" disabled={locked} onChange={(e) => void addGallery(e.target.files)} /></label>
        </div>
      </aside>
    </div>
  )
}
