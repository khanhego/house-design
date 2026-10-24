import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { sceneChapters, TOUR_CHAPTER_LABEL } from '@hd/core'
import type { HouseMeta, TourChapter } from '@hd/core'
import { originFor, setFrame } from './frame.ts'
import { TourFacts } from './TourFacts.tsx'
import type { PlayerScene } from './TourPlayer.tsx'
import './tour.css'

/*
 * Chế độ "Phim" (CR-3, FR-12.16–12.19): một hành trình liên tục điều khiển bằng cuộn.
 * Mỗi cảnh chiếm STEP chiều cao cuộn: phần đầu (DWELL) dừng ở cảnh cho đọc chữ, phần sau là chuyển cảnh
 * gắn theo vị trí cuộn — cuộn nửa chừng thì đang "đi" nửa đường. Cuối hành trình là màn "lộ".
 * Hai khung ảnh luân phiên theo chẵn/lẻ của cảnh để không bao giờ phải đổi ảnh của khung đang hiện.
 */

const STEP = 1.1 // chiều cao cuộn mỗi cảnh, theo chiều cao khung
const DWELL = 0.4
const REVEAL = 1.0

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const bigScreen = () => typeof window !== 'undefined' && window.innerWidth * (window.devicePixelRatio || 1) > 1600

export interface FilmScene extends PlayerScene {
  chapter?: TourChapter
}

interface Props {
  scenes: FilmScene[]
  house: HouseMeta
  location?: string | null
  floors?: number
  onIndex?: (i: number) => void
  onLead?: () => void
  onSceneAction?: (i: number, action: '3d' | 'plan') => void
}

export const TourFilm = ({ scenes, house, location, floors, onIndex, onLead, onSceneAction }: Props) => {
  const scroller = useRef<HTMLDivElement>(null)
  const layers = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  const video = useRef<HTMLVideoElement>(null)
  const hero = useRef<HTMLDivElement>(null)
  const chapterCard = useRef<HTMLDivElement>(null)
  const sceneCard = useRef<HTMLDivElement>(null)
  const reveal = useRef<HTMLDivElement>(null)
  const hint = useRef<HTMLDivElement>(null)
  const [H, setH] = useState(800)
  const [idx, setIdx] = useState(0)
  const idxRef = useRef(-1)
  const holds = useRef<[number, number]>([-1, -1]) // cảnh đang nằm trong mỗi khung
  const onIndexRef = useRef(onIndex)
  onIndexRef.current = onIndex
  const chapters = useMemo(() => sceneChapters(scenes), [scenes])
  const src = useCallback((i: number) => (bigScreen() ? scenes[i].src : scenes[i].srcSmall), [scenes])
  const n = scenes.length
  const total = H + (n - 1) * STEP * H + REVEAL * H

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setH(Math.max(320, e.contentRect.height)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** Bảo đảm khung (j % 2) đang chứa ảnh cảnh j. */
  const ensure = useCallback(
    (j: number) => {
      if (j < 0 || j >= n) return
      const k = j % 2
      const layer = layers[k].current
      if (!layer || holds.current[k] === j) return
      holds.current[k] = j
      void setFrame(layer, src(j))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, src],
  )

  const render = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const y = el.scrollTop
    const step = STEP * H
    const s = y / step
    const i = Math.min(n - 1, Math.floor(s))
    const k = i < n - 1 ? s - i : 0
    const r = i === n - 1 ? clamp((y - (n - 1) * step) / (REVEAL * H)) : 0
    const t = reducedMotion() ? (k > DWELL + 0.3 ? 1 : 0) : smooth(DWELL, 1, k)

    if (i !== idxRef.current) {
      idxRef.current = i
      setIdx(i)
      onIndexRef.current?.(i)
    }
    ensure(i)
    ensure(i + 1)

    const cur = layers[i % 2].current
    const nxt = layers[(i + 1) % 2].current
    if (!cur || !nxt) return
    const box = cur.getBoundingClientRect()
    const scene = scenes[i]
    // ảnh hiện tại: trôi nhẹ khi dừng, rồi "bước" vào điểm đi tiếp; màn lộ: lùi chậm ra toàn cảnh
    const drift = cur.querySelector<HTMLElement>('.tour-drift')!
    drift.style.transform = `scale(${1 + 0.05 * clamp(k / DWELL)})`
    cur.style.transformOrigin = originFor(cur, box, scene.next)
    cur.style.transform = i === n - 1 ? `scale(${1.14 - 0.14 * r})` : `scale(${1 + 1.3 * t})`
    cur.style.opacity = String(1 - smooth(0.45, 1, t))
    cur.style.zIndex = '2'
    if (i < n - 1) {
      nxt.style.transformOrigin = '50% 50%'
      nxt.style.transform = `scale(${1.35 - 0.35 * t})`
      nxt.style.opacity = String(smooth(0.3, 1, t))
      nxt.style.zIndex = t > 0.5 ? '3' : '1'
      nxt.querySelector<HTMLElement>('.tour-drift')!.style.transform = 'scale(1)'
    } else nxt.style.opacity = '0'

    // clip chuyển cảnh: tua theo cuộn
    const v = video.current
    if (v) {
      const clip = i < n - 1 ? scene.clip : null
      if (clip && v.getAttribute('src') !== clip) (v.src = clip), v.load()
      const on = !!clip && t > 0.001 && t < 0.999 && v.readyState >= 1 && !reducedMotion()
      v.style.opacity = on ? '1' : '0'
      if (on && Number.isFinite(v.duration)) {
        const want = clamp((k - DWELL) / (1 - DWELL)) * v.duration
        if (Math.abs(v.currentTime - want) > 0.04) v.currentTime = want
      }
    }

    // chữ: mở đầu → tiêu đề chương → thẻ cảnh → màn lộ
    const first = i === 0 || chapters[i] !== chapters[i - 1]
    if (hero.current) hero.current.style.opacity = String(1 - smooth(0.02, 0.22, s))
    if (hint.current) hint.current.style.opacity = String(1 - smooth(0, 0.05, s))
    if (chapterCard.current) {
      const op = !first || i === n - 1 ? 0 : i === 0 ? smooth(0.18, 0.26, k) * (1 - smooth(0.32, 0.4, k)) : 1 - smooth(0.12, 0.26, k)
      chapterCard.current.style.opacity = String(op)
    }
    if (sceneCard.current) {
      const enter = first ? (i === 0 ? 0.36 : 0.22) : 0.04
      const op = i === n - 1 ? 1 - smooth(0.15, 0.4, r) : smooth(enter, enter + 0.1, k) * (1 - smooth(DWELL + 0.05, DWELL + 0.2, k))
      sceneCard.current.style.opacity = String(op)
    }
    if (reveal.current) {
      reveal.current.style.opacity = String(smooth(0.35, 0.8, r))
      reveal.current.style.pointerEvents = r > 0.6 ? 'auto' : 'none'
    }
  }, [H, n, scenes, chapters, ensure])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(render)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    render()
    return () => (el.removeEventListener('scroll', onScroll), cancelAnimationFrame(raf))
  }, [render])

  // phím ↓ ↑ / Space / Page: mỗi lần một cảnh
  const go = useCallback((j: number) => scroller.current?.scrollTo({ top: Math.max(0, j) * STEP * H + (j > 0 ? DWELL * 0.5 * H : 0), behavior: 'smooth' }), [H])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return
      if (document.querySelector('[aria-modal="true"]')) return
      const down = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey) || e.key === 'ArrowRight'
      const up = e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey) || e.key === 'ArrowLeft'
      if (!down && !up) return
      e.preventDefault()
      go(idxRef.current + (down ? 1 : idxRef.current === 0 ? 0 : -1))
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [go])

  const s = scenes[idx]
  const chapterOrder = useMemo(() => {
    const out: { chapter: TourChapter; from: number }[] = []
    chapters.forEach((c, i) => (i === 0 || c !== chapters[i - 1]) && out.push({ chapter: c, from: i }))
    return out
  }, [chapters])
  const chapterNo = chapterOrder.findIndex((c) => c.chapter === chapters[idx] && c.from <= idx) + 1

  return (
    <div ref={scroller} className="film" tabIndex={0} aria-label={`Hành trình ${n} cảnh — cuộn để đi`}>
      <div className="film-track" style={{ height: total }}>
        <div className="film-stage" style={{ height: H }}>
          {[0, 1].map((k) => (
            <div key={k} ref={layers[k]} className="tour-layer film-layer" style={{ opacity: k ? 0 : 1 }}>
              <img className="tour-bg" alt="" draggable={false} />
              <div className="tour-drift"><img className="tour-fg" alt="" draggable={false} /></div>
            </div>
          ))}
          <video ref={video} className="film-video" muted playsInline preload="auto" />
          <div className="film-shade" />

          <div ref={hero} className="film-hero">
            <p className="film-kicker">{location ?? 'Tham quan ảnh thật'}</p>
            <h1>{house.name}</h1>
            <TourFacts house={house} floors={floors} compact />
          </div>
          <div ref={hint} className="film-hint">Cuộn để bắt đầu hành trình<span>↓</span></div>

          <div ref={chapterCard} className="film-chapter" aria-hidden="true">
            <span>Chương {Math.max(1, chapterNo)}</span>
            <h2>{TOUR_CHAPTER_LABEL[chapters[idx]]}</h2>
          </div>

          {s && (
            <div ref={sceneCard} className="film-scene" key={s.id}>
              <h3>{s.title}</h3>
              {s.description && <p>{s.description}</p>}
              {s.highlights.length > 0 && <ul>{s.highlights.map((h, j) => <li key={j}>{h}</li>)}</ul>}
              {s.roomLabel && onSceneAction && (
                <div className="tour-card-actions">
                  <button onClick={() => onSceneAction(idx, '3d')}>Xem {s.roomLabel} 3D</button>
                  <button onClick={() => onSceneAction(idx, 'plan')}>Mặt bằng</button>
                </div>
              )}
            </div>
          )}

          <div ref={reveal} className="film-reveal">
            <p className="film-kicker">{location ?? ''}</p>
            <h2>{house.name}</h2>
            <TourFacts house={house} floors={floors} />
            <div className="tour-card-actions">
              {onLead && <button className="primary" onClick={onLead}>Đặt lịch xem nhà · Để lại SĐT</button>}
              <button onClick={() => scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })}>↺ Xem lại hành trình</button>
            </div>
          </div>

          <nav className="film-rail" aria-label="Các chương">
            {chapterOrder.map((c, ci) => (
              <div key={c.from} className={chapters[idx] === c.chapter && idx >= c.from ? 'on' : ''}>
                <button className="film-rail-label" onClick={() => go(c.from)}>{TOUR_CHAPTER_LABEL[c.chapter]}</button>
                <div className="film-rail-dots">
                  {scenes.map((x, j) =>
                    j >= c.from && j < (chapterOrder[ci + 1]?.from ?? n) ? (
                      <button key={x.id} aria-label={`Cảnh ${j + 1}: ${x.title}`} className={j === idx ? 'on' : j < idx ? 'seen' : ''} onClick={() => go(j)} />
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}
