import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import './tour.css'

/* Trình xem tour ảnh thật (item 02, V6 · FR-12.05–12.09). Thuần DOM/CSS — không cần WebGL. */

export interface PlayerScene {
  id: string
  title: string
  description?: string
  highlights: string[]
  /** điểm đi tiếp, tỷ lệ trên ảnh */
  next?: [number, number]
  src: string
  srcSmall: string
  /** clip chuyển cảnh từ cảnh này sang cảnh kế */
  clip?: string | null
  /** nhãn phòng liên kết, có thì hiện nút "Xem phòng này 3D" */
  roomLabel?: string | null
}

export interface TourPlayerHandle {
  next: () => void
  prev: () => void
  go: (i: number) => void
}

interface Props {
  scenes: PlayerScene[]
  startIndex?: number
  autoplaySec: number
  /** gọi khi đã hiện xong một cảnh */
  onIndex?: (i: number) => void
  onSceneAction?: (i: number, action: '3d' | 'plan') => void
  /** nút phụ ở màn kết và thẻ cảnh (vd. Để lại SĐT) */
  extra?: React.ReactNode
  /** dùng trong A7: nhỏ gọn, không bắt phím toàn trang */
  compact?: boolean
}

const DUR = 1100
const EASE = 'cubic-bezier(.45,0,.2,1)'

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const bigScreen = () => typeof window !== 'undefined' && window.innerWidth * (window.devicePixelRatio || 1) > 1600
const srcOf = (s: PlayerScene) => (bigScreen() ? s.src : s.srcSmall)

const loaded = new Map<string, Promise<void>>()
const preload = (url: string) => {
  if (!loaded.has(url))
    loaded.set(
      url,
      new Promise<void>((resolve) => {
        const im = new Image()
        im.onload = () => resolve()
        im.onerror = () => resolve()
        im.src = url
      }),
    )
  return loaded.get(url)!
}

/** Điểm đi tiếp (tỷ lệ trên ảnh) → toạ độ px trong khung khi ảnh phủ kín (object-fit: cover). */
const originPx = (img: HTMLImageElement, box: DOMRect, p: [number, number] | undefined) => {
  const [nx, ny] = p ?? [0.5, 0.5]
  const w = img.naturalWidth || box.width
  const h = img.naturalHeight || box.height
  const s = Math.max(box.width / w, box.height / h)
  const dw = w * s
  const dh = h * s
  return `${(box.width - dw) / 2 + nx * dw}px ${(box.height - dh) / 2 + ny * dh}px`
}

export const TourPlayer = forwardRef<TourPlayerHandle, Props>(({ scenes, startIndex = 0, autoplaySec, onIndex, onSceneAction, extra, compact }, ref) => {
  const box = useRef<HTMLDivElement>(null)
  const layers = [useRef<HTMLImageElement>(null), useRef<HTMLImageElement>(null)]
  const front = useRef(0)
  const video = useRef<HTMLVideoElement>(null)
  const [cur, setCur] = useState(Math.min(startIndex, Math.max(0, scenes.length - 1)))
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const curRef = useRef(cur)
  curRef.current = cur
  const busyRef = useRef(false)

  // ảnh đầu
  useEffect(() => {
    const s = scenes[cur]
    const a = layers[front.current].current
    if (s && a && !a.src) a.src = srcOf(s)
    onIndex?.(cur)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // tải trước cảnh kế, kế nữa và cảnh trước (FR-12.09)
  useEffect(() => {
    for (const k of [cur + 1, cur + 2, cur - 1]) if (scenes[k]) void preload(srcOf(scenes[k]))
    if (scenes[cur]?.clip) {
      const l = document.createElement('link')
      l.rel = 'preload'
      l.as = 'video'
      l.href = scenes[cur].clip!
      document.head.appendChild(l)
      return () => l.remove()
    }
  }, [cur, scenes])

  const finish = useCallback(
    (target: number) => {
      setCur(target)
      busyRef.current = false
      setBusy(false)
      onIndex?.(target)
    },
    [onIndex],
  )

  const go = useCallback(
    async (target: number) => {
      if (busyRef.current || target === curRef.current || !scenes[target]) return
      busyRef.current = true
      setBusy(true)
      setEnded(false)
      const from = curRef.current
      const sFrom = scenes[from]
      const sTo = scenes[target]
      const url = srcOf(sTo)
      setWaiting(true)
      await preload(url)
      setWaiting(false)
      const A = layers[front.current].current!
      const B = layers[1 - front.current].current!
      B.src = url
      try {
        await B.decode()
      } catch {
        /* ảnh hỏng vẫn chuyển */
      }
      const rect = box.current!.getBoundingClientRect()
      const forward = target === from + 1
      const backward = target === from - 1
      const swap = () => {
        A.getAnimations().forEach((x) => x.cancel())
        B.getAnimations().forEach((x) => x.cancel())
        A.style.opacity = '0'
        A.style.zIndex = '1'
        B.style.opacity = '1'
        B.style.zIndex = '2'
        front.current = 1 - front.current
        finish(target)
      }

      // clip chuyển cảnh (FR-12.06): chỉ khi đi tới
      if (forward && sFrom.clip && video.current && !reducedMotion()) {
        const v = video.current
        v.src = sFrom.clip
        setShowVideo(true)
        const done = () => {
          v.onended = null
          v.onerror = null
          swap()
          setShowVideo(false)
        }
        v.onended = done
        v.onerror = done
        try {
          await v.play()
          return
        } catch {
          done()
          return
        }
      }

      B.style.zIndex = '2'
      A.style.zIndex = '1'
      if (reducedMotion() || (!forward && !backward)) {
        // giảm chuyển động / nhảy cảnh: mờ dần (EX-T5)
        B.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 300 : 380, easing: 'ease', fill: 'forwards' }).onfinish = swap
        return
      }
      if (forward) {
        // "bước tới": ảnh hiện tại phóng vào điểm đi tiếp, ảnh sau thu từ gần về
        A.style.transformOrigin = originPx(A, rect, sFrom.next)
        A.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 1, offset: 0.45 }, { transform: 'scale(2.3)', opacity: 0 }], { duration: DUR, easing: EASE, fill: 'forwards' })
        B.style.transformOrigin = '50% 50%'
        B.animate([{ transform: 'scale(1.35)', opacity: 0 }, { transform: 'scale(1.22)', opacity: 0, offset: 0.35 }, { transform: 'scale(1)', opacity: 1 }], { duration: DUR, easing: EASE, fill: 'forwards' }).onfinish = swap
      } else {
        // "lùi lại": ảnh hiện tại thu nhỏ mờ đi, ảnh trước lùi ra từ điểm đi tiếp của nó
        A.style.transformOrigin = '50% 50%'
        A.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.82)', opacity: 0 }], { duration: DUR * 0.9, easing: EASE, fill: 'forwards' })
        B.style.transformOrigin = originPx(B, rect, sTo.next)
        B.animate([{ transform: 'scale(2.3)', opacity: 0 }, { transform: 'scale(1.6)', opacity: 1, offset: 0.55 }, { transform: 'scale(1)', opacity: 1 }], { duration: DUR, easing: EASE, fill: 'forwards' }).onfinish = swap
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenes, finish],
  )

  const next = useCallback(() => {
    if (curRef.current >= scenes.length - 1) return setEnded(true)
    void go(curRef.current + 1)
  }, [go, scenes.length])
  const prev = useCallback(() => void go(curRef.current - 1), [go])
  useImperativeHandle(ref, () => ({ next, prev, go: (i: number) => void go(i) }), [next, prev, go])

  // người dùng thao tác → dừng tự chạy
  const user = (fn: () => void) => () => (setPlaying(false), fn())

  // tự chạy (FR-12.07)
  useEffect(() => {
    if (!playing || busy) return
    if (cur >= scenes.length - 1) {
      setPlaying(false)
      setEnded(true)
      return
    }
    const t = setTimeout(() => void go(curRef.current + 1), autoplaySec * 1000)
    return () => clearTimeout(t)
  }, [playing, busy, cur, autoplaySec, scenes.length, go])

  // phím ←/→ (không bắt khi đang gõ; bản gọn chỉ bắt khi con trỏ trong khung)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (compact && !box.current?.matches(':hover, :focus-within')) return
      if (e.key === 'ArrowRight') (setPlaying(false), next())
      else if (e.key === 'ArrowLeft') (setPlaying(false), prev())
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [next, prev, compact])

  // vuốt trái/phải (Pointer Events, ngưỡng 50 px)
  const down = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return
    down.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = down.current
    down.current = null
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) (setPlaying(false), dx < 0 ? next() : prev())
  }

  const fullscreen = () => {
    const el = box.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.().catch(() => {})
  }

  const s = scenes[cur]
  if (!s) return null
  const many = scenes.length > 30

  return (
    <div ref={box} className={`tour${compact ? ' tour-compact' : ''}`} onPointerDown={onPointerDown} onPointerUp={onPointerUp} tabIndex={-1} aria-roledescription="tham quan ảnh" aria-label={`Cảnh ${cur + 1}/${scenes.length}: ${s.title}`}>
      <img ref={layers[0]} className="tour-img" alt="" draggable={false} style={{ opacity: 1, zIndex: 2 }} />
      <img ref={layers[1]} className="tour-img" alt="" draggable={false} style={{ opacity: 0, zIndex: 1 }} />
      <video ref={video} className="tour-video" muted playsInline preload="auto" style={{ display: showVideo ? 'block' : 'none' }} />

      {waiting && <div className="tour-wait" aria-live="polite"><span className="tour-spin" />Đang tải ảnh…</div>}

      <div className="tour-card" key={s.id}>
        <span className="tour-step">Cảnh {cur + 1} / {scenes.length}</span>
        <h2>{s.title}</h2>
        {s.description && <p>{s.description}</p>}
        {s.highlights.length > 0 && <ul>{s.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>}
        {s.roomLabel && onSceneAction && (
          <div className="tour-card-actions">
            <button onClick={() => onSceneAction(cur, '3d')}>Xem {s.roomLabel} 3D</button>
            <button onClick={() => onSceneAction(cur, 'plan')}>Mặt bằng</button>
          </div>
        )}
      </div>

      <button className="tour-nav prev" onClick={user(prev)} disabled={cur === 0 || busy} aria-label="Cảnh trước">‹</button>
      <button className="tour-nav next" onClick={user(next)} disabled={busy} aria-label="Cảnh tiếp">{waiting ? <span className="tour-spin" /> : '›'}</button>

      <div className="tour-bar">
        {many ? (
          <span className="tour-count">{cur + 1} / {scenes.length}</span>
        ) : (
          <div className="tour-dots" role="tablist" aria-label="Các cảnh">
            {scenes.map((x, i) => (
              <button key={x.id} role="tab" aria-selected={i === cur} aria-label={`Cảnh ${i + 1}: ${x.title}`} className={i === cur ? 'on' : i < cur ? 'seen' : ''} onClick={user(() => void go(i))} />
            ))}
          </div>
        )}
        <button className="tour-pill" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? '❚❚ Dừng' : '▶ Tự chạy'}</button>
        {!compact && <button className="tour-pill" onClick={fullscreen} aria-label="Toàn màn hình">⤢</button>}
      </div>

      {ended && (
        <div className="tour-end" role="dialog" aria-label="Hết tour">
          <p>Bạn đã xem hết {scenes.length} cảnh</p>
          <div className="tour-card-actions">
            <button onClick={() => (setEnded(false), void go(0))}>↺ Xem lại từ đầu</button>
            {extra}
          </div>
        </div>
      )}
    </div>
  )
})
TourPlayer.displayName = 'TourPlayer'
