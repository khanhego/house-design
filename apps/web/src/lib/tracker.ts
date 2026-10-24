/** Tracker sự kiện xem (02b §5 F5, FR-11.01, BR-10): hàng đợi bộ nhớ, gửi lô mỗi 5 giây hoặc khi đủ 20, `pagehide` → keepalive. */

export type EventType =
  | 'project_open' | 'house_open' | 'floor_select' | 'room_select' | 'walk_mode' | 'item_open'
  | 'plan_open' | 'pdf_download' | 'contact_click' | 'lead_submit' | 'fallback_shown'
  | 'tour_open' | 'tour_scene' | 'tour_complete'

interface KV {
  get(k: string): string | null
  set(k: string, v: string): void
}

const SESSION_IDLE_MS = 30 * 60_000
const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`

/** Bộ nhớ an toàn: storage bị chặn (ẩn danh, iframe) → giữ trong bộ nhớ. */
const safe = (get: () => Storage): KV => {
  const mem = new Map<string, string>()
  return {
    get: (k) => {
      try {
        return get().getItem(k)
      } catch {
        return mem.get(k) ?? null
      }
    },
    set: (k, v) => {
      try {
        get().setItem(k, v)
      } catch {
        mem.set(k, v)
      }
    },
  }
}

/** Phiên mới khi chưa có hoặc > 30 phút không tương tác (BR-10). Gọi mỗi lần có sự kiện. */
export const sessionFor = (store: KV, now = Date.now()) => {
  const id = store.get('hd_sid')
  const last = Number(store.get('hd_sid_at') ?? 0)
  const sid = id && now - last <= SESSION_IDLE_MS ? id : rid('s')
  store.set('hd_sid', sid)
  store.set('hd_sid_at', String(now))
  return sid
}

export const deviceIdOf = (store: KV) => {
  let d = store.get('hd_did')
  if (!d) store.set('hd_did', (d = rid('d')))
  return d
}

export interface Tracker {
  track: (type: EventType, o?: { houseSlug?: string; targetId?: string }) => void
  flush: (keepalive?: boolean) => void
  deviceId: string
  /** bật gửi định kỳ + pagehide; trả hàm dừng (gọi trong useEffect) */
  start: () => () => void
}

export const createTracker = (o: { projectSlug: string; source: 'link' | 'qr' | 'embed'; deviceClass: 'mobile' | 'desktop' | 'fallback'; send?: (body: string, keepalive: boolean) => void }): Tracker => {
  const local = safe(() => localStorage)
  const sess = safe(() => sessionStorage)
  const deviceId = deviceIdOf(local)
  let queue: { type: EventType; houseSlug?: string; targetId?: string; ts: string; sid: string }[] = []
  const send = o.send ?? ((body, keepalive) => {
    void fetch('/api/v1/public/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body, keepalive }).catch(() => {})
  })
  const flush = (keepalive = false) => {
    if (!queue.length) return
    // một lô chỉ thuộc một phiên
    const bySid = new Map<string, typeof queue>()
    for (const e of queue) bySid.set(e.sid, [...(bySid.get(e.sid) ?? []), e])
    queue = []
    for (const [sid, evs] of bySid) {
      for (let i = 0; i < evs.length; i += 50) {
        send(JSON.stringify({
          projectSlug: o.projectSlug, sessionId: sid, deviceId, source: o.source, deviceClass: o.deviceClass,
          events: evs.slice(i, i + 50).map(({ sid: _s, ...e }) => e),
        }), keepalive)
      }
    }
  }
  return {
    deviceId,
    flush,
    track: (type, x = {}) => {
      queue.push({ type, ...x, ts: new Date().toISOString(), sid: sessionFor(sess) })
      if (queue.length >= 20) flush()
    },
    start: () => {
      const timer = setInterval(() => flush(), 5000)
      const onHide = () => flush(true)
      addEventListener('pagehide', onHide)
      return () => {
        clearInterval(timer)
        removeEventListener('pagehide', onHide)
        flush(true)
      }
    },
  }
}

/** Trang không gửi gì (xem trước C3/A3). */
export const noopTracker: Tracker = { track: () => {}, flush: () => {}, deviceId: 'd_preview', start: () => () => {} }
