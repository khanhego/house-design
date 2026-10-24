import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import './tour.css'
import { bringFront, pointPx, rest, setFrame, walk } from './frame.ts'

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

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const bigScreen = () => typeof window !== 'undefined' && window.innerWidth * (window.devicePixelRatio || 1) > 1600
const srcOf = (s: PlayerScene) => (bigScreen() ? s.src : s.srcSmall)

const loaded = new Map<string, Promise<void>>()
const preload = (url: string) => {
  if (loaded.size > 200) loaded.clear()
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

export const TourPlayer = forwardRef<TourPlayerHandle, Props>(({ scenes, startIndex = 0, autoplaySec, onIndex, onSceneAction, extra, compact }, ref) => {
  const box = useRef<HTMLDivElement>(null)
  const layers = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
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
  // còn hiển thị không — chuyển tab giữa lúc tải ảnh thì dừng, không đụng DOM đã gỡ (R-T-04)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      layers.forEach((l) => l.current?.getAnimations().forEach((a) => a.cancel()))
      video.current?.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // gọi lại mới nhất, không làm đổi `go` mỗi lần cha vẽ lại (R-T-05)
  const onIndexRef = useRef(onIndex)
  onIndexRef.current = onIndex
  const skipClip = useRef<(() => void) | null>(null)
  // dấu "đi tiếp" trên ảnh (CR-4): tính lại khi đổi cảnh, khi ảnh giải mã xong và khi khung đổi cỡ
  const [mark, setMark] = useState<[number, number] | null>(null)
  const [frameTick, setFrameTick] = useState(0)
  const bump = () => setFrameTick((x) => x + 1)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(bump)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => {
    const s = scenes[cur]
    const layer = layers[front.current].current
    if (!s?.next || cur >= scenes.length - 1 || !layer || !box.current) return setMark(null)
    setMark(pointPx(layer, box.current.getBoundingClientRect(), s.next))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, frameTick, scenes])

  /** Chạy chuyển cảnh theo khung hình; tự dừng khi trình xem đã gỡ. */
  const run = (step: (t: number) => void, dur: number, done: () => void) => {
    const t0 = performance.now()
    const tick = (now: number) => {
      if (!alive.current) return
      const t = Math.min(1, (now - t0) / dur)
      step(t)
      if (t < 1) requestAnimationFrame(tick)
      else done()
    }
    requestAnimationFrame(tick)
  }

  // ảnh đầu
  useEffect(() => {
    const s = scenes[cur]
    const a = layers[front.current].current
    if (s && a) void setFrame(a, srcOf(s)).then(() => (bringFront(a, null), alive.current && bump()))
    onIndexRef.current?.(cur)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // tải trước cảnh kế, kế nữa và cảnh trước (FR-12.09)
  useEffect(() => {
    for (const k of [cur + 1, cur + 2, cur - 1]) if (scenes[k]) void preload(srcOf(scenes[k]))
    // nạp sẵn clip của cặp kế tiếp vào thẻ video (thẻ <link preload as=video> không được hỗ trợ)
    const v = video.current
    const clip = scenes[cur]?.clip
    if (v && clip && v.getAttribute('src') !== clip && !busyRef.current) {
      v.src = clip
      v.load()
    }
  }, [cur, scenes])

  const finish = useCallback((target: number) => {
    busyRef.current = false
    if (!alive.current) return
    setCur(target)
    setBusy(false)
    onIndexRef.current?.(target)
  }, [])

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
      if (!alive.current) return void (busyRef.current = false)
      setWaiting(false)
      const A = layers[front.current].current
      const B = layers[1 - front.current].current
      if (!A || !B || !box.current) return void (busyRef.current = false)
      await setFrame(B, url)
      if (!alive.current) return void (busyRef.current = false)
      const rect = box.current.getBoundingClientRect()
      const forward = target === from + 1
      const backward = target === from - 1
      const swap = () => {
        A.getAnimations().forEach((x) => x.cancel())
        B.getAnimations().forEach((x) => x.cancel())
        rest(A, 0)
        rest(B, 1)
        A.style.zIndex = '1'
        B.style.zIndex = '2'
        front.current = 1 - front.current
        bringFront(B, A)
        finish(target)
        bump()
      }

      // clip chuyển cảnh (FR-12.06): chỉ khi đi tới
      if (forward && sFrom.clip && video.current && !reducedMotion()) {
        const v = video.current
        if (v.getAttribute('src') !== sFrom.clip) v.src = sFrom.clip
        v.currentTime = 0
        // clip nghẽn mạng không được làm kẹt trình xem (R-T-01): hết giờ / nghẽn / chạm → bỏ clip, sang cảnh sau
        let finished = false
        let watchdog: ReturnType<typeof setTimeout>
        const done = () => {
          if (finished) return
          finished = true
          clearTimeout(watchdog)
          v.onended = v.onerror = v.onstalled = null
          v.pause()
          skipClip.current = null
          setWaiting(false)
          swap()
          setShowVideo(false)
        }
        skipClip.current = done
        v.onended = done
        v.onerror = done
        v.onstalled = done
        watchdog = setTimeout(done, 8000) // chưa phát được trong 8 giây
        setWaiting(true)
        try {
          await v.play()
          if (finished) return
          setWaiting(false)
          setShowVideo(true)
          clearTimeout(watchdog)
          const total = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 15
          watchdog = setTimeout(done, (total + 3) * 1000)
        } catch {
          done()
        }
        return
      }

      B.style.zIndex = '2'
      A.style.zIndex = '1'
      if (reducedMotion() || (!forward && !backward)) {
        // giảm chuyển động / nhảy cảnh: mờ dần (EX-T5)
        B.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 300 : 380, easing: 'ease', fill: 'forwards' }).onfinish = swap
        return
      }
      // "bước tới" về điểm đi tiếp; "lùi lại" là cùng chuyển động đó chạy ngược (CR-4)
      if (forward) run((t) => walk(A, B, rect, sFrom.next, t), DUR, swap)
      else run((t) => walk(B, A, rect, sTo.next, 1 - t), DUR * 0.9, swap)
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
    const tick = () => {
      // đang mở hộp thoại (vd. form để lại SĐT) → chờ, không tự chuyển cảnh (R-T-05)
      if (document.querySelector('[aria-modal="true"]')) return void (t = setTimeout(tick, 1000))
      void go(curRef.current + 1)
    }
    let t = setTimeout(tick, autoplaySec * 1000)
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
      {[0, 1].map((k) => (
        <div key={k} ref={layers[k]} className="tour-layer" style={{ opacity: k ? 0 : 1, zIndex: k ? 1 : 2 }}>
          <img className="tour-bg" alt="" draggable={false} />
          <div className="tour-drift"><img className="tour-fg" alt="" draggable={false} /></div>
        </div>
      ))}
      <video ref={video} className="tour-video" muted playsInline preload="auto" style={{ display: showVideo ? 'block' : 'none' }} />
      {showVideo && <button className="tour-skip" onClick={() => skipClip.current?.()}>Bỏ qua clip ›</button>}

      {mark && !busy && !ended && (
        <button className="tour-mark" style={{ left: mark[0], top: mark[1] }} onClick={user(next)} aria-label={`Đi tới: ${scenes[cur + 1]?.title}`}>
          <i />
          <span>{scenes[cur + 1]?.title || 'Đi tiếp'}</span>
        </button>
      )}

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
        {!compact && typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && <button className="tour-pill" onClick={fullscreen} aria-label="Toàn màn hình">⤢</button>}
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
