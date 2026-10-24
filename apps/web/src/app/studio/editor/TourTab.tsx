import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { floorHasContent, MAX_TOUR_SCENES, newId, sortedFloors } from '@hd/core'
import type { TourScene } from '@hd/core'
import { api, upload } from '../../../lib/api.ts'
import { Button, copyText, errMsg, toast } from '../../ui.tsx'
import { useEditor } from './store.ts'
import { TourPlayer } from '../../../tour/TourPlayer.tsx'
import type { PlayerScene, TourPlayerHandle } from '../../../tour/TourPlayer.tsx'
import { orderPhotos, sceneTitle } from '../../../tour/order.ts'
import { AI_CLIP_PROMPT, exportGuidePdf, GUIDE, GUIDE_INTRO } from '../../../tour/guide.ts'
import type { FileOut } from '../../types.ts'

interface Uploaded {
  image: { id: string; url: string; width: number; height: number }
  small: { id: string; url: string }
  takenAt: string | null
  originalName: string
}

const CLIP_MAX_SEC = 15
const CLIP_MAX_BYTES = 20 * 2 ** 20

const clipDuration = (file: File) =>
  new Promise<number>((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => (resolve(v.duration), URL.revokeObjectURL(v.src))
    v.onerror = () => resolve(Number.NaN)
    v.src = URL.createObjectURL(file)
  })

/** A7 — Tour ảnh thật (item 02, FR-12.01–12.06, 12.12, 12.13). */
export const TourTab = ({ projectId }: { projectId: string }) => {
  const qc = useQueryClient()
  const doc = useEditor((s) => s.doc)!
  const locked = useEditor((s) => s.state !== 'draft')
  const { edit } = useEditor.getState()
  const scenes = doc.tour?.scenes ?? []
  const [selId, setSelId] = useState<string | null>(scenes[0]?.id ?? null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [preview, setPreview] = useState<{ key: number; start: number; play: boolean }>({ key: 0, start: 0, play: false })
  const [showGuide, setShowGuide] = useState(scenes.length === 0)
  const [drag, setDrag] = useState<string | null>(null)
  const player = useRef<TourPlayerHandle>(null)
  const sel = scenes.find((s) => s.id === selId) ?? scenes[0]
  const selIdx = sel ? scenes.indexOf(sel) : -1

  const files = useQuery({
    queryKey: ['files', projectId, 'tour'],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        api<{ items: FileOut[] }>('GET', `projects/${projectId}/files?kind=tour_image`),
        api<{ items: FileOut[] }>('GET', `projects/${projectId}/files?kind=tour_clip`),
      ])
      return Object.fromEntries([...a.items, ...b.items].map((f) => [f.id, f.url]))
    },
  })
  const url = (id?: string) => (id ? files.data?.[id] : undefined)
  const floors = useMemo(() => sortedFloors(doc).filter(floorHasContent), [doc])

  const setTour = (fn: (list: TourScene[]) => TourScene[], coalesce?: string) =>
    edit((d) => void (d.tour = { autoplaySec: d.tour?.autoplaySec ?? 4, scenes: fn(d.tour?.scenes ?? []) }), coalesce ? { coalesce } : undefined)
  const setScene = (id: string, fn: (s: TourScene) => void, k: string) => setTour((list) => list.map((s) => (s.id === id ? (fn(s), s) : s)), `${id}:${k}`)

  // tải nhiều ảnh: tuần tự, rồi xếp theo tên tệp / giờ chụp (FR-12.02, EX-T2)
  const addPhotos = async (list: FileList | null) => {
    const all = Array.from(list ?? [])
    if (!all.length) return
    const room = MAX_TOUR_SCENES - scenes.length
    if (all.length > room) toast(`Tour tối đa ${MAX_TOUR_SCENES} cảnh — chỉ thêm ${room} ảnh đầu`, 'danger')
    const picked = all.slice(0, Math.max(0, room))
    const done: (Uploaded & { index: number; name: string })[] = []
    const warn: string[] = []
    setProgress({ done: 0, total: picked.length })
    for (const [index, f] of picked.entries()) {
      try {
        const r = await upload<Uploaded>(`projects/${projectId}/tour-images`, f)
        done.push({ ...r, index, name: f.name })
        if (r.image.width < r.image.height) warn.push(`${f.name}: ảnh dọc sẽ bị cắt khi xem toàn màn hình`)
        else if (r.image.width < 1600) warn.push(`${f.name}: ảnh nhỏ (${r.image.width} px) sẽ mờ khi xem toàn màn hình`)
      } catch (e) {
        toast(`${f.name}: ${errMsg(e)}`, 'danger')
      }
      setProgress({ done: index + 1, total: picked.length })
    }
    setProgress(null)
    if (!done.length) return
    const { items, by } = orderPhotos(done.map((d) => ({ ...d, takenAt: d.takenAt })))
    qc.setQueryData<Record<string, string>>(['files', projectId, 'tour'], (m) => ({ ...(m ?? {}), ...Object.fromEntries(items.flatMap((d) => [[d.image.id, d.image.url], [d.small.id, d.small.url]])) }))
    const base = scenes.length
    const added: TourScene[] = items.map((d, i) => ({ id: newId('scn'), fileId: d.image.id, smallFileId: d.small.id, title: sceneTitle(d.name, base + i + 1), highlights: [] }))
    setTour((l) => [...l, ...added])
    setSelId(added[0].id)
    toast(`Đã thêm ${added.length} cảnh${by === 'name' ? ' (xếp theo số trong tên tệp)' : by === 'time' ? ' — tên tệp không có số, đã xếp theo giờ chụp: kiểm lại thứ tự' : ' — kiểm lại thứ tự'}`, by === 'name' ? undefined : 'danger')
    if (warn.length) toast(warn.slice(0, 3).join(' · '), 'danger')
  }

  // đổi thứ tự: cặp cảnh đổi thì gỡ clip của cặp đó (BR-T3)
  const move = (fromId: string, toId: string) => {
    if (fromId === toId) return
    let dropped = 0
    setTour((list) => {
      const nextOf = new Map(list.map((s, i) => [s.id, list[i + 1]?.id]))
      const out = [...list]
      const from = out.findIndex((s) => s.id === fromId)
      const [it] = out.splice(from, 1)
      out.splice(out.findIndex((s) => s.id === toId) + (from <= out.findIndex((s) => s.id === toId) ? 1 : 0), 0, it)
      return out.map((s, i) => {
        if (s.clipFileId && nextOf.get(s.id) !== out[i + 1]?.id) {
          dropped++
          const { clipFileId: _c, clipSource: _s, ...rest } = s
          return rest
        }
        return s
      })
    })
    if (dropped) toast(`Đã gỡ ${dropped} clip chuyển cảnh vì thứ tự cảnh thay đổi`, 'danger')
  }

  const remove = (id: string) => {
    setTour((list) => {
      const i = list.findIndex((s) => s.id === id)
      return list
        .filter((s) => s.id !== id)
        .map((s, k) => (k === i - 1 && s.clipFileId ? (({ clipFileId: _c, clipSource: _s, ...rest }) => rest)(s) : s))
    })
    setSelId(null)
  }

  const replaceImage = async (id: string, f: File | undefined) => {
    if (!f) return
    try {
      const r = await upload<Uploaded>(`projects/${projectId}/tour-images`, f)
      qc.setQueryData<Record<string, string>>(['files', projectId, 'tour'], (m) => ({ ...(m ?? {}), [r.image.id]: r.image.url, [r.small.id]: r.small.url }))
      setScene(id, (s) => ((s.fileId = r.image.id), (s.smallFileId = r.small.id), delete s.next), 'img')
      toast('Đã thay ảnh — đặt lại điểm đi tiếp')
    } catch (e) {
      toast(errMsg(e), 'danger')
    }
  }

  const addClip = async (id: string, f: File | undefined) => {
    if (!f) return
    if (f.size > CLIP_MAX_BYTES) return toast('Clip vượt 20 MB', 'danger')
    const d = await clipDuration(f)
    if (!(d > 0)) return toast('Không đọc được clip — dùng MP4 (H.264)', 'danger')
    if (d > CLIP_MAX_SEC + 0.5) return toast(`Clip dài ${Math.round(d)} giây — tối đa ${CLIP_MAX_SEC} giây`, 'danger')
    try {
      const r = await upload<{ file: { id: string; url: string } }>('files', f, { kind: 'tour_clip', projectId })
      qc.setQueryData<Record<string, string>>(['files', projectId, 'tour'], (m) => ({ ...(m ?? {}), [r.file.id]: r.file.url }))
      setScene(id, (s) => ((s.clipFileId = r.file.id), (s.clipSource = s.clipSource ?? 'upload')), 'clip')
      toast('Đã gắn clip chuyển cảnh')
    } catch (e) {
      toast(errMsg(e), 'danger')
    }
  }

  // ảnh xem thử
  const playerScenes: PlayerScene[] = scenes
    .filter((s) => url(s.fileId))
    .map((s) => ({ id: s.id, title: s.title, description: s.description, highlights: s.highlights, next: s.next, src: url(s.fileId)!, srcSmall: url(s.smallFileId) ?? url(s.fileId)!, clip: url(s.clipFileId) ?? null }))
  const previewPair = (i: number) => {
    setPreview((p) => ({ key: p.key + 1, start: i, play: true }))
    setTimeout(() => player.current?.next(), 700)
  }

  const missingNext = scenes.slice(0, -1).filter((s) => !s.next).length

  return (
    <div className="tour-tab">
      <div className="tour-top">
        <label className={`tour-drop${locked ? ' off' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), !locked && void addPhotos(e.dataTransfer.files))}>
          <input type="file" hidden multiple accept="image/jpeg,image/png,image/webp" disabled={locked || !!progress} onChange={(e) => (void addPhotos(e.target.files), (e.target.value = ''))} />
          {progress ? `Đang xử lý ảnh ${progress.done}/${progress.total}…` : 'Kéo thả ảnh vào đây hoặc bấm để chọn (JPG, PNG, WebP · tối đa 60 cảnh)'}
        </label>
        <div className="tour-top-actions">
          <Button small onClick={() => setShowGuide((v) => !v)}>{showGuide ? 'Ẩn kịch bản chụp' : 'Kịch bản chụp'}</Button>
          <Button small onClick={() => void exportGuidePdf()}>Tải PDF kịch bản</Button>
          <Button small kind="primary" disabled={playerScenes.length < 2} onClick={() => setPreview((p) => ({ key: p.key + 1, start: 0, play: true }))}>Xem thử cả tour ▶</Button>
        </div>
      </div>

      {showGuide && (
        <section className="tour-guide card">
          <p>{GUIDE_INTRO}</p>
          <div className="tour-guide-cols">
            {GUIDE.map((g) => (
              <div key={g.title}>
                <h4>{g.title}</h4>
                {g.ordered ? <ol>{g.items.map((x) => <li key={x}>{x}</li>)}</ol> : <ul>{g.items.map((x) => <li key={x}>{x}</li>)}</ul>}
              </div>
            ))}
          </div>
          <div className="tour-prompt">
            <h4>Câu lệnh mẫu cho AI tạo clip chuyển cảnh</h4>
            <code>{AI_CLIP_PROMPT}</code>
            <Button small onClick={async () => toast((await copyText(AI_CLIP_PROMPT)) ? 'Đã sao chép câu lệnh' : 'Không sao chép được')}>Sao chép</Button>
          </div>
        </section>
      )}

      {scenes.length > 0 && (
        <>
          <div className="tour-strip" role="list" aria-label="Thứ tự cảnh — kéo để đổi">
            {scenes.map((s, i) => (
              <button
                key={s.id}
                role="listitem"
                draggable={!locked}
                onDragStart={() => setDrag(s.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => (drag && move(drag, s.id), setDrag(null))}
                className={`tour-thumb${s.id === sel?.id ? ' on' : ''}`}
                onClick={() => setSelId(s.id)}
                title={s.title}
              >
                {url(s.smallFileId) ? <img src={url(s.smallFileId)} alt="" /> : <span />}
                <em>{i + 1}</em>
                {i < scenes.length - 1 && !s.next && <b className="warn" title="Chưa đặt điểm đi tiếp">!</b>}
                {s.clipFileId && <b className="clip" title="Có clip chuyển cảnh">▶</b>}
              </button>
            ))}
          </div>
          <p className="muted small">
            {scenes.length} cảnh{missingNext ? ` · ${missingNext} cảnh chưa đặt điểm đi tiếp (chấm "!")` : ' · đủ điểm đi tiếp'} · kéo ảnh trong dải để đổi thứ tự
          </p>
        </>
      )}

      <div className="tour-main">
        <div className="tour-left">
          {preview.play && playerScenes.length >= 2 ? (
            <div className="tour-preview">
              <TourPlayer key={preview.key} ref={player} scenes={playerScenes} startIndex={preview.start} autoplaySec={doc.tour?.autoplaySec ?? 4} compact />
              <Button small onClick={() => setPreview((p) => ({ ...p, play: false }))}>Đóng xem thử</Button>
            </div>
          ) : sel && url(sel.fileId) ? (
            <div className="tour-pick">
              <div
                className="tour-pick-img"
                onClick={(e) => {
                  if (locked || selIdx === scenes.length - 1) return
                  const r = e.currentTarget.getBoundingClientRect()
                  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
                  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
                  setScene(sel.id, (s) => (s.next = [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]), 'next')
                }}
              >
                <img src={url(sel.fileId)} alt={sel.title} draggable={false} />
                {sel.next && <span className="tour-marker" style={{ left: `${sel.next[0] * 100}%`, top: `${sel.next[1] * 100}%` }} />}
              </div>
              <p className="muted small">
                {selIdx === scenes.length - 1
                  ? 'Cảnh cuối — không cần điểm đi tiếp.'
                  : 'Bấm lên ảnh tại chỗ người chụp đã bước tới để chụp cảnh sau (cửa, lối đi). Chuyển cảnh sẽ "đi" vào điểm này.'}
              </p>
            </div>
          ) : (
            <p className="muted">{scenes.length ? 'Đang tải ảnh…' : 'Chưa có ảnh. Gửi kịch bản chụp cho người chụp, rồi kéo thả cả thư mục ảnh vào ô phía trên.'}</p>
          )}
        </div>

        <aside className="tour-side">
          {sel ? (
            <div className="ins">
              <h3>Cảnh {selIdx + 1}</h3>
              <label className="ins-field"><span>Tên cảnh</span><input disabled={locked} maxLength={80} value={sel.title} onChange={(e) => setScene(sel.id, (s) => (s.title = e.target.value || ' '), 't')} /></label>
              <label className="ins-field"><span>Mô tả</span><textarea rows={2} disabled={locked} maxLength={300} value={sel.description ?? ''} onChange={(e) => setScene(sel.id, (s) => (s.description = e.target.value || undefined), 'd')} /></label>
              {[0, 1, 2].map((k) => (
                <label key={k} className="ins-field"><span>Điểm nổi bật {k + 1}</span>
                  <input disabled={locked} maxLength={60} value={sel.highlights[k] ?? ''} placeholder={k === 0 ? 'vd. Trần cao 3,6 m' : ''} onChange={(e) => setScene(sel.id, (s) => {
                    const h = [...s.highlights]
                    h[k] = e.target.value
                    s.highlights = h.map((x) => (x ?? '').trim()).filter(Boolean).slice(0, 3)
                  }, `h${k}`)} />
                </label>
              ))}
              {floors.length > 0 && (
                <label className="ins-field"><span>Phòng trong mẫu 3D</span>
                  <select disabled={locked} value={sel.roomId ? `${sel.floorId}/${sel.roomId}` : ''} onChange={(e) => setScene(sel.id, (s) => {
                    const [f, r] = e.target.value.split('/')
                    s.floorId = f || undefined
                    s.roomId = r || undefined
                  }, 'room')}>
                    <option value="">— Không liên kết —</option>
                    {floors.map((f) => <optgroup key={f.id} label={f.name}>{f.rooms.map((r) => <option key={r.id} value={`${f.id}/${r.id}`}>{r.name}</option>)}</optgroup>)}
                  </select>
                </label>
              )}
              <div className="ins-row">
                <label className="ab ab-sm" aria-disabled={locked}>Thay ảnh<input type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={(e) => void replaceImage(sel.id, e.target.files?.[0])} /></label>
                <Button small kind="danger" disabled={locked} onClick={() => remove(sel.id)}>Xoá cảnh</Button>
              </div>

              {selIdx < scenes.length - 1 && (
                <>
                  <h3>Chuyển sang cảnh {selIdx + 2}</h3>
                  <p className="muted small">{sel.clipFileId ? 'Đang dùng clip.' : 'Đang dùng chuyển cảnh mô phỏng.'} Clip MP4 ≤ 15 giây, ≤ 20 MB; khung cuối nên trùng ảnh cảnh sau.</p>
                  <div className="ins-row">
                    <Button small onClick={() => previewPair(selIdx)} disabled={playerScenes.length < 2}>Xem thử {selIdx + 1} → {selIdx + 2}</Button>
                    {sel.clipFileId ? (
                      <Button small kind="ghost" disabled={locked} onClick={() => setScene(sel.id, (s) => (delete s.clipFileId, delete s.clipSource), 'clip')}>Gỡ clip</Button>
                    ) : (
                      <label className="ab ab-sm" aria-disabled={locked}>Tải clip<input type="file" hidden accept="video/mp4" disabled={locked} onChange={(e) => (void addClip(sel.id, e.target.files?.[0]), (e.target.value = ''))} /></label>
                    )}
                  </div>
                  {sel.clipFileId && (
                    <label className="check small"><input type="checkbox" disabled={locked} checked={sel.clipSource === 'ai'} onChange={(e) => setScene(sel.id, (s) => (s.clipSource = e.target.checked ? 'ai' : 'upload'), 'cs')} /> Clip do AI tạo (trang xem sẽ ghi "Chuyển cảnh minh hoạ do AI dựng")</label>
                  )}
                </>
              )}

              <h3>Tour</h3>
              <label className="ins-field"><span>Tự chạy (giây mỗi cảnh)</span><input type="number" min={2} max={15} disabled={locked} value={doc.tour?.autoplaySec ?? 4} onChange={(e) => edit((d) => void (d.tour = { autoplaySec: Math.min(15, Math.max(2, Number(e.target.value) || 4)), scenes: d.tour?.scenes ?? [] }), { coalesce: 'autoplay' })} /></label>
              {scenes[0] && doc.coverFileId !== scenes[0].fileId && (
                <Button small disabled={locked} onClick={() => edit((d) => void (d.coverFileId = scenes[0].fileId))}>Dùng ảnh cảnh 1 làm ảnh đại diện</Button>
              )}
            </div>
          ) : (
            <p className="muted small">Chọn một cảnh trong dải ảnh để sửa.</p>
          )}
        </aside>
      </div>
    </div>
  )
}
