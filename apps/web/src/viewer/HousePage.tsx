import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useProgress } from '@react-three/drei'
import { assignItemsToRooms, floorHasContent, formatArea, hasModel3d, hasTour, roomArea, sortedFloors } from '@hd/core'
import type { Floor, PublicHousePayload } from '@hd/core'
import { fmtArea, vi } from '../i18n/vi.ts'
import type { CameraApi, StairOption, ViewMode, WallMode } from '../scene/HouseScene.tsx'
import { BrandMark, Disclaimer, useBrand } from './Brand.tsx'
import { ContactButtons, ContactMenu } from './Contact.tsx'
import { ItemPanel } from './ItemPanel.tsx'
import type { ItemView } from './ItemPanel.tsx'
import { MiniPlan } from './MiniPlan.tsx'
import { isInAppBrowser } from './data.ts'
import { PlanTab } from './PlanTab.tsx'

import { TourStage } from '../tour/TourStage.tsx'

const HouseScene = lazy(() => import('../scene/HouseScene.tsx').then((m) => ({ default: m.HouseScene })))

export interface ViewerEvents {
  floor?: (floorId: string) => void
  room?: (roomId: string) => void
  walk?: (roomId: string | null) => void
  item?: (itemId: string) => void
  plan?: () => void
  pdf?: () => void
  contact?: (k: 'call' | 'zalo' | 'form') => void
  ready?: () => void
  /** tour ảnh thật (item 02) */
  tourOpen?: () => void
  tourScene?: (sceneId: string) => void
  tourComplete?: () => void
}

interface Props {
  data: PublicHousePayload
  /** mở form lead kèm tầng/phòng hoặc cảnh tour đang xem (FR-10.02, FR-12.11) */
  onLead?: (ctx: { floorId?: string; roomId?: string; sceneId?: string }) => void
  /** thiết bị không chạy 3D: chỉ tour (+ mặt bằng) */
  no3d?: boolean
  events?: ViewerEvents
  /** dải "BẢN XEM TRƯỚC" (C3/A3) */
  previewBanner?: React.ReactNode
  backTo?: string | null
  toast: (msg: string) => void
}

const WALL_MODES: { id: WallMode; label: string }[] = [
  { id: 'auto', label: 'Tự cắt' },
  { id: 'low', label: 'Tường thấp' },
  { id: 'full', label: 'Đầy đủ' },
]

const readQuery = () => new URLSearchParams(location.search)

/** V2 — xem mẫu nhà (FR-06.*, SRS §10.4). */
export const HousePage = ({ data, onLead: onLeadCtx, events = {}, previewBanner, backTo, toast, no3d }: Props) => {
  useBrand(data.branding)
  const doc = data.document
  // chỉ tầng có nội dung dựng mới xem 3D; mẫu nhà chỉ có tour ảnh thật thì không có tầng (item 02)
  const floors = useMemo(() => sortedFloors(doc).filter(floorHasContent), [doc])
  // cùng điều kiện với nhãn "3D" ở trang dự án (R-T-03)
  const has3d = hasModel3d(doc) && !no3d
  const tourOk = hasTour(doc)
  const single = floors.length === 1
  const hasExterior = data.house.houseType !== 'apartment'

  const q = readQuery()
  const initialFloor = floors.find((f) => f.id === q.get('floor'))?.id ?? (single ? floors[0].id : 'all')
  const [sceneId, setSceneId] = useState<string | null>(null)
  const [floorId, setFloorId] = useState<string>(initialFloor)
  const [roomId, setRoomId] = useState<string | null>(q.get('room'))
  const onLead = onLeadCtx
    ? () => onLeadCtx(tab === 'tour' && sceneId ? { sceneId } : { floorId: floorId !== 'all' ? floorId : undefined, roomId: roomId ?? undefined })
    : undefined
  const [mode, setMode] = useState<ViewMode>('orbit')
  const cameraApi = useRef<CameraApi | null>(null)
  const [stairOpt, setStairOpt] = useState<StairOption>(null)
  const [wallMode, setWallMode] = useState<WallMode>('auto')
  const [night, setNight] = useState(false)
  const [tab, setTab] = useState<'3d' | 'plan' | 'tour'>(() => {
    const t = q.get('tab')
    if (tourOk && (t === 'tour' || !has3d)) return 'tour'
    return t === 'plan' && floors.length ? 'plan' : has3d ? '3d' : 'plan'
  })
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [hoverItemId, setHoverItemId] = useState<string | null>(null)
  const [variants, setVariants] = useState<Record<string, string>>({})
  const [sheet, setSheet] = useState(false)
  const [ready, setReady] = useState(false)
  const [slow, setSlow] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [inAppHint, setInAppHint] = useState(false)
  const { progress, active } = useProgress()

  const floor: Floor | null = floorId === 'all' ? null : floors.find((f) => f.id === floorId) ?? null
  const room = floor?.rooms.find((r) => r.id === roomId) ?? null

  // link sâu (FR-06.15)
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    floorId === 'all' || (single && floorId === floors[0].id) ? p.delete('floor') : p.set('floor', floorId)
    roomId ? p.set('room', roomId) : p.delete('room')
    tab === 'plan' || tab === 'tour' ? p.set('tab', tab) : p.delete('tab')
    const s = p.toString()
    history.replaceState(null, '', location.pathname + (s ? `?${s}` : ''))
  }, [floorId, roomId, tab, single, floors])

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 15000)
    return () => clearTimeout(t)
  }, [])

  const roomOfItem = useMemo(() => {
    const m: Record<string, { floor: Floor; roomName: string | null }> = {}
    for (const f of floors) {
      const a = assignItemsToRooms(f)
      for (const it of f.items) m[it.id] = { floor: f, roomName: f.rooms.find((r) => r.id === a[it.id])?.name ?? null }
    }
    return m
  }, [floors])

  const itemView = useCallback(
    (id: string | null): ItemView | null => {
      if (!id) return null
      for (const f of floors) {
        const it = f.items.find((i) => i.id === id)
        if (!it) continue
        const lib = 'libraryItemId' in it.source ? data.resolved.libraryItems[it.source.libraryItemId] ?? null : null
        const info = it.info ?? {}
        return {
          item: it,
          lib,
          name: info.name ?? lib?.name ?? 'Đồ nội thất',
          sizeMm: (info.sizeMm as [number, number, number] | undefined) ?? lib?.sizeMm ?? null,
          material: info.material ?? lib?.material,
          brand: info.brand ?? lib?.brand,
          description: info.description ?? lib?.description,
          imageUrls: [...(info.imageFileIds ?? []).map((fid) => data.resolved.files[fid]).filter(Boolean), ...(lib?.imageUrls ?? [])],
          roomName: roomOfItem[id]?.roomName ?? null,
        }
      }
      return null
    },
    [floors, data, roomOfItem],
  )
  const selected = itemView(selectedItemId)
  const hoverName = hoverItemId ? itemView(hoverItemId)?.name ?? null : null

  const chooseFloor = (id: string) => {
    setFloorId(id)
    setRoomId(null)
    setSelectedItemId(null)
    if (id === 'all' && mode === 'inside') setMode('orbit')
    if (id !== 'all') events.floor?.(id)
  }
  const chooseRoom = (fid: string, rid: string) => {
    if (fid !== floorId) setFloorId(fid)
    setRoomId(rid)
    if (mode === 'facade') setMode('orbit')
    events.room?.(rid)
  }
  const chooseItem = (id: string | null) => {
    setSelectedItemId(id)
    if (id) {
      events.item?.(id)
      setSheet(true)
    }
  }
  const enterInside = () => {
    if (floorId === 'all') setFloorId(floors[0].id)
    setMode('inside')
    events.walk?.(roomId)
  }

  const downloadPdf = async () => {
    if (isInAppBrowser()) {
      setInAppHint(true)
      return
    }
    setPdfBusy(true)
    try {
      const { exportPlanPdf } = await import('../lib/pdf.ts')
      await exportPlanPdf(data)
      events.pdf?.()
    } catch {
      toast('Không tạo được PDF. Thử lại sau.')
    } finally {
      setPdfBusy(false)
    }
  }

  const share = async () => {
    const url = location.href
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: data.house.name, url })
        return
      }
      await navigator.clipboard.writeText(url)
      toast(vi.common.copied)
    } catch {
      window.prompt?.('Sao chép link:', url)
    }
  }

  const fullscreen = () => {
    const el = document.documentElement
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.().catch(() => toast('Trình duyệt không hỗ trợ toàn màn hình.'))
  }

  const floorList = [...floors].reverse()
  const rooms = floor?.rooms ?? []
  const hint =
    mode === 'inside'
      ? matchMedia('(pointer: coarse)').matches
        ? 'Chạm sàn để đi tới · Kéo để nhìn quanh · Chụm để lại gần / lùi xa'
        : 'Bấm sàn để đi tới · W/S hoặc ↑/↓ đi tới–lùi, A/D hoặc ←/→ xoay người (Shift: đi nhanh) · Kéo để nhìn quanh · Cuộn để lại gần / lùi xa'
      : matchMedia('(pointer: coarse)').matches
        ? 'Kéo một ngón để xoay · Chụm để phóng to · Chạm sàn để vào phòng'
        : 'Kéo để xoay · Cuộn để phóng to đúng chỗ con trỏ · Chuột phải để kéo ngang · Nhấp đúp sàn để lại gần'

  return (
    <div className="v2">
      {previewBanner}
      <header className="v-top">
        {backTo && (
          <Link className="btn ghost back" to={backTo} aria-label="Mẫu khác">
            ← <span className="hide-sm">Mẫu khác</span>
          </Link>
        )}
        <BrandMark b={data.branding} compact />
        <div className="v-title">
          <strong>{data.house.name}</strong>
          <span className="muted">
            {vi.houseType[data.house.houseType]} · {fmtArea(data.house.declaredArea)} · {data.house.bedrooms} PN
          </span>
        </div>
        <div className="seg" role="tablist">
          {has3d && <button role="tab" aria-selected={tab === '3d'} className={tab === '3d' ? 'on' : ''} onClick={() => setTab('3d')}>3D</button>}
          {tourOk && <button role="tab" aria-selected={tab === 'tour'} className={tab === 'tour' ? 'on' : ''} onClick={() => setTab('tour')}>Ảnh thật</button>}
          {floors.length > 0 && <button role="tab" aria-selected={tab === 'plan'} className={tab === 'plan' ? 'on' : ''} onClick={() => (setTab('plan'), events.plan?.())}>Mặt bằng</button>}
        </div>
        <div className="hide-sm">
          <ContactMenu project={data.project} onLead={onLead} onClick={events.contact} />
        </div>
      </header>

      <div className="v-stage">
        {tab === 'tour' ? (
          <TourStage
            doc={doc}
            files={data.resolved.files}
            floors={floors}
            has3d={has3d}
            onLead={onLead}
            events={events}
            onScene={setSceneId}
            onAction={(sc, action) => {
              if (!sc.floorId) return
              if (action === '3d' && sc.roomId) (setTab('3d'), chooseRoom(sc.floorId, sc.roomId))
              else (setFloorId(sc.floorId), setTab('plan'))
            }}
          />
        ) : tab === '3d' ? (
          <>
            <div className="v-canvas">
              <Suspense fallback={null}>
                <HouseScene
                  data={data}
                  floorId={floorId}
                  roomId={roomId}
                  mode={mode}
                  wallMode={wallMode}
                  night={night}
                  selectedItemId={selectedItemId}
                  variants={variants}
                  hoverItemId={hoverItemId}
                  hoverLabel={hoverName}
                  onSelectItem={chooseItem}
                  onHoverItem={setHoverItemId}
                  onSelectRoom={chooseRoom}
                  onReady={() => (setReady(true), events.ready?.())}
                  cameraApi={cameraApi}
                  onStair={setStairOpt}
                />
              </Suspense>
            </div>

            {(!ready || active) && (
              <div className="v-loading" aria-live="polite">
                {data.document.coverFileId && data.resolved.files[data.document.coverFileId] && !ready && (
                  <img src={data.resolved.files[data.document.coverFileId]} alt="" />
                )}
                <div className="v-loading-box">
                  <div className="bar"><span style={{ width: `${Math.max(8, progress)}%` }} /></div>
                  <span>Đang tải mô hình… {Math.round(progress)}%</span>
                  {slow && (
                    <span className="small">
                      Mạng đang chậm. Bạn có thể <button className="link" onClick={() => setTab('plan')}>xem mặt bằng</button> trong lúc chờ.
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* chip tầng — mobile (DEC-13) */}
            {!single && (
              <nav className="floor-chips show-sm" aria-label="Chọn tầng">
                {floorList.map((f) => (
                  <button key={f.id} className={floorId === f.id ? 'chip active' : 'chip'} onClick={() => chooseFloor(f.id)}>{f.name}</button>
                ))}
                <button className={floorId === 'all' ? 'chip active' : 'chip'} onClick={() => chooseFloor('all')}>Cả nhà</button>
              </nav>
            )}

            <aside className="panel left hide-sm">
              {!single && (
                <section>
                  <h3>Tầng</h3>
                  <div className="floor-list">
                    {floorList.map((f) => (
                      <button key={f.id} className={floorId === f.id ? 'row active' : 'row'} onClick={() => chooseFloor(f.id)}>
                        {f.name}
                      </button>
                    ))}
                    <button className={floorId === 'all' ? 'row active' : 'row'} onClick={() => chooseFloor('all')}>Cả nhà</button>
                  </div>
                </section>
              )}
              <section>
                <h3>Phòng</h3>
                {floor ? (
                  <>
                    <div className="room-chips">
                      {rooms.map((r) => (
                        <button key={r.id} className={roomId === r.id ? 'chip active' : 'chip'} onClick={() => chooseRoom(floor.id, r.id)}>{r.name}</button>
                      ))}
                    </div>
                    <MiniPlan floor={floor} roomId={roomId} onRoom={(rid) => chooseRoom(floor.id, rid)} scale={110} />
                  </>
                ) : (
                  <p className="muted small">Chọn một tầng để xem các phòng.</p>
                )}
              </section>
            </aside>

            <aside className="panel right hide-sm">
              {selected ? (
                <ItemPanel view={selected} variantId={variants[selected.item.id]} onVariant={(v) => setVariants((s) => ({ ...s, [selected.item.id]: v }))} onClose={() => setSelectedItemId(null)} />
              ) : (
                <RoomItems floor={floor} roomId={roomId} itemView={itemView} roomOfItem={roomOfItem} onPick={chooseItem} />
              )}
            </aside>

            {/* đứng trên cầu thang: lên / xuống tầng */}
            {mode === 'inside' && stairOpt && (
              <div className="stair-prompt" role="group" aria-label="Cầu thang">
                <span>Cầu thang</span>
                {(['up', 'down'] as const).map((k) => {
                  const o = stairOpt[k]
                  if (!o) return null
                  return (
                    <button key={k} className="btn primary small" onClick={() => {
                      cameraApi.current?.arriveAt?.(o.arrive)
                      setStairOpt(null)
                      setFloorId(o.floorId)
                      setRoomId(null)
                      events.floor?.(o.floorId)
                    }}>{k === 'up' ? '↑ Lên' : '↓ Xuống'} {o.name}</button>
                  )
                })}
              </div>
            )}

            {/* nút zoom cứng: bấm = một nấc, giữ = zoom liên tục */}
            <div className="zoom-float" role="group" aria-label="Thu phóng">
              <ZoomButton dir={1} api={cameraApi} label="Phóng to">＋</ZoomButton>
              <ZoomButton dir={-1} api={cameraApi} label="Thu nhỏ">−</ZoomButton>
            </div>

            <div className="mode-bar">
              <div className="seg">
                <button className={mode === 'orbit' ? 'on' : ''} onClick={() => setMode('orbit')}>Toàn cảnh</button>
                {hasExterior && <button className={mode === 'facade' ? 'on' : ''} onClick={() => (setMode('facade'), setFloorId('all'), setRoomId(null))}>Mặt tiền</button>}
                <button className={mode === 'inside' ? 'on' : ''} onClick={enterInside}>Đứng trong phòng</button>
              </div>
              {mode === 'orbit' && floor && (
                <label className="sel">
                  <span className="hide-sm">Tường</span>
                  <select value={wallMode} onChange={(e) => setWallMode(e.target.value as WallMode)} aria-label="Hiển thị tường">
                    {WALL_MODES.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
                  </select>
                </label>
              )}
              {doc.lighting.night && (
                <button className={night ? 'icon-btn on' : 'icon-btn'} onClick={() => setNight((n) => !n)} aria-pressed={night} title="Ngày / Đêm">
                  {night ? 'Đêm' : 'Ngày'}
                </button>
              )}
              <button className="icon-btn" onClick={() => cameraApi.current?.reset()} title={mode === 'inside' ? 'Về sau lưng người mẫu' : 'Về góc nhìn ban đầu'} aria-label="Về góc nhìn ban đầu">⌂</button>
              <button className="icon-btn hide-sm" onClick={fullscreen} title="Toàn màn hình">⤢</button>
              <button className="icon-btn" onClick={share} title="Chia sẻ" aria-label="Chia sẻ">↗<span className="hide-sm"> Chia sẻ</span></button>
            </div>
            <p className="v-hint hide-sm">{hint}</p>

            {/* ngăn kéo mobile: phòng / đồ (DEC-13) */}
            <div className={sheet ? 'sheet show-sm open' : 'sheet show-sm'}>
              <button className="sheet-handle" onClick={() => setSheet((s) => !s)} aria-expanded={sheet}>
                <span />
                {selected ? selected.name : room ? `${room.name} · ${formatArea(roomArea(room.polygon))}` : floor ? `${floor.name} · ${rooms.length} phòng` : 'Chọn tầng để xem phòng'}
              </button>
              {sheet && (
                <div className="sheet-body">
                  {selected ? (
                    <ItemPanel view={selected} variantId={variants[selected.item.id]} onVariant={(v) => setVariants((s) => ({ ...s, [selected.item.id]: v }))} onClose={() => setSelectedItemId(null)} />
                  ) : floor ? (
                    <>
                      <div className="room-chips">
                        {rooms.map((r) => (
                          <button key={r.id} className={roomId === r.id ? 'chip active' : 'chip'} onClick={() => chooseRoom(floor.id, r.id)}>{r.name}</button>
                        ))}
                      </div>
                      <RoomItems floor={floor} roomId={roomId} itemView={itemView} roomOfItem={roomOfItem} onPick={chooseItem} />
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </>
        ) : (
          <PlanTab
            floors={floors}
            floorId={floor?.id ?? floors[0].id}
            onFloor={(id) => setFloorId(id)}
            onRoom={(fid, rid) => (setTab('3d'), chooseRoom(fid, rid))}
            onPdf={downloadPdf}
            pdfBusy={pdfBusy}
          />
        )}
      </div>

      {inAppHint && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Mở bằng trình duyệt để tải PDF</h3>
            <p>Ứng dụng bạn đang dùng (Zalo, Facebook…) không cho tải tệp. Hãy mở trang này bằng Chrome hoặc Safari.</p>
            <div className="row-actions">
              <button className="btn ghost" onClick={() => setInAppHint(false)}>Đóng</button>
              <button className="btn primary" onClick={() => (void share(), setInAppHint(false))}>Sao chép link</button>
            </div>
          </div>
        </div>
      )}

      <div className="show-sm">
        <ContactButtons project={data.project} onLead={onLead} onClick={events.contact} layout="bar" />
      </div>
      <Disclaimer text={data.project.disclaimer} branding={data.branding} />
    </div>
  )
}

/** Nút zoom: bấm một lần = một nấc; giữ quá 250 ms = zoom liên tục tới khi thả. */
const ZoomButton = ({ dir, api, label, children }: { dir: 1 | -1; api: React.RefObject<CameraApi | null>; label: string; children: React.ReactNode }) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stop = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    api.current?.hold(0)
  }
  return (
    <button
      className="zoom-btn"
      aria-label={label}
      title={`${label} (giữ để ${dir > 0 ? 'phóng' : 'thu'} liên tục)`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        api.current?.zoom(dir)
        timer.current = setTimeout(() => api.current?.hold(dir), 250)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

const RoomItems = ({ floor, roomId, itemView, roomOfItem, onPick }: {
  floor: Floor | null
  roomId: string | null
  itemView: (id: string) => ItemView | null
  roomOfItem: Record<string, { floor: Floor; roomName: string | null }>
  onPick: (id: string) => void
}) => {
  if (!floor) return <p className="muted small">Bấm vào một món đồ trong cảnh 3D để xem chi tiết.</p>
  const room = floor.rooms.find((r) => r.id === roomId)
  const assigned = assignItemsToRooms(floor)
  const items = floor.items.filter((it) => !roomId || assigned[it.id] === roomId)
  void roomOfItem
  return (
    <div className="room-items">
      <h3>{room ? room.name : floor.name}</h3>
      {room && <p className="muted small">{formatArea(roomArea(room.polygon))}</p>}
      {items.length === 0 ? (
        <p className="muted small">Phòng này chưa có thông tin đồ.</p>
      ) : (
        <ul>
          {items.map((it) => {
            const v = itemView(it.id)
            if (!v) return null
            const color = v.lib?.variants.find((x) => x.id === it.variantId)?.color ?? v.lib?.variants[0]?.color
            return (
              <li key={it.id}>
                <button onClick={() => onPick(it.id)}>
                  <span className="dot" style={{ background: color ?? '#ccc' }} />
                  <span className="name">{v.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
