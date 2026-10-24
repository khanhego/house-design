import { useEffect, useRef, useState } from 'react'
import { normalizePhoneVN } from '@hd/core'
import type { AntiBot, Branding, PublicProjectInfo, PublicProjectPayload } from '@hd/core'
import { api, ApiError } from '../lib/api.ts'

export interface LeadContext {
  houseSlug?: string
  houseName?: string
  floorId?: string
  roomId?: string
  /** đang xem tour ảnh thật (item 02) */
  sceneId?: string
}

const INTERESTS = [
  ['live', 'Mua để ở'],
  ['invest', 'Đầu tư'],
  ['interior', 'Tư vấn nội thất'],
  ['other', 'Khác'],
] as const

// token hợp lệ 2 giờ; làm mới khi đã quá 1 giờ 50 phút (N-08)
const TOKEN_REFRESH_MS = 110 * 60_000

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void }) => string; remove: (id: string) => void }
  }
}

const loadTurnstile = () =>
  new Promise<void>((resolve, reject) => {
    if (window.turnstile) return resolve()
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('turnstile'))
    document.head.appendChild(s)
  })

/** V3 — form lead (FR-10.01–10.06, SRS §10.4). */
export const LeadDrawer = ({ project, branding, antiBot, context, source, deviceId, onClose, onSent }: {
  project: PublicProjectInfo
  branding: Branding
  antiBot: AntiBot
  context: LeadContext
  source: 'link' | 'qr' | 'embed'
  deviceId: string
  onClose: () => void
  onSent: () => void
}) => {
  const [f, setF] = useState({ name: '', phone: '', email: '', interest: '', message: '', consent: false, website: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'network' | 'blocked'>('idle')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [needCaptcha, setNeedCaptcha] = useState(false)
  const token = useRef({ value: antiBot.formToken, at: Date.now() })
  const box = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    first.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [onClose])

  useEffect(() => {
    if (!needCaptcha || !antiBot.turnstileSiteKey || !box.current) return
    let id: string | null = null
    void loadTurnstile().then(() => {
      if (box.current && window.turnstile) id = window.turnstile.render(box.current, { sitekey: antiBot.turnstileSiteKey!, callback: setCaptcha })
    }).catch(() => setState('blocked'))
    return () => {
      if (id) window.turnstile?.remove(id)
    }
  }, [needCaptcha, antiBot.turnstileSiteKey])

  const set = (k: keyof typeof f, v: string | boolean) => {
    setF((x) => ({ ...x, [k]: v }))
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest)
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!normalizePhoneVN(f.phone)) e.phone = 'Số điện thoại cần 10 chữ số, bắt đầu bằng 0 (ví dụ 0912 345 678).'
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Email chưa đúng định dạng.'
    if (!f.consent) e.consent = 'Bạn cần đồng ý để chúng tôi liên hệ.'
    return e
  }

  const freshToken = async () => {
    if (Date.now() - token.current.at < TOKEN_REFRESH_MS) return token.current.value
    const p = await api<PublicProjectPayload>('GET', `/api/v1/public/projects/${project.slug}`)
    token.current = { value: p.antiBot.formToken, at: Date.now() }
    return token.current.value
  }

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return
    if (needCaptcha && !captcha) return
    setState('sending')
    try {
      await api('POST', '/api/v1/public/leads', {
        projectSlug: project.slug, houseSlug: context.houseSlug ?? null, name: f.name.trim() || null, phone: f.phone, email: f.email.trim() || null,
        interest: f.interest || null, message: f.message.trim() || null, consent: true,
        context: context.sceneId ? { sceneId: context.sceneId } : context.floorId ? { floorId: context.floorId, roomId: context.roomId } : null,
        source, deviceId, website: f.website, formToken: await freshToken(), captchaToken: captcha,
      })
      setState('done')
      onSent()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setErrors(err.fields)
        setState('idle')
      } else if (err instanceof ApiError && err.code === 'CAPTCHA_REQUIRED') {
        if (!antiBot.turnstileSiteKey) setState('blocked')
        else {
          setCaptcha(null)
          setNeedCaptcha(true)
          setState('idle')
        }
      } else if (err instanceof ApiError && err.status === 410) setState('blocked')
      else setState('network')
    }
  }

  const title = `Nhận tư vấn ${context.houseName ?? project.name}`
  return (
    <div className="lead-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="lead" role="dialog" aria-modal="true" aria-label={title}>
        <header className="lead-head">
          <h2>{title}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="Đóng">✕</button>
        </header>
        {state === 'done' ? (
          <div className="lead-done">
            <p>Cảm ơn {f.name.trim() || 'bạn'}! {branding.name} sẽ liên hệ bạn sớm.</p>
            <button className="btn primary" onClick={onClose}>Tiếp tục xem nhà</button>
          </div>
        ) : (
          <form className="lead-form" onSubmit={(e) => void submit(e)} noValidate>
            <label>Họ và tên<input ref={first} value={f.name} maxLength={100} autoComplete="name" onChange={(e) => set('name', e.target.value)} /></label>
            <label>Số điện thoại *<input value={f.phone} inputMode="tel" autoComplete="tel" maxLength={20} aria-invalid={!!errors.phone} onChange={(e) => set('phone', e.target.value)} />{errors.phone && <em className="err">{errors.phone}</em>}</label>
            <label>Email<input value={f.email} type="email" autoComplete="email" maxLength={200} aria-invalid={!!errors.email} onChange={(e) => set('email', e.target.value)} />{errors.email && <em className="err">{errors.email}</em>}</label>
            <fieldset>
              <legend>Bạn quan tâm</legend>
              <div className="chips">
                {INTERESTS.map(([k, l]) => (
                  <label key={k} className={`chip ${f.interest === k ? 'on' : ''}`}><input type="radio" name="interest" value={k} checked={f.interest === k} onChange={() => set('interest', k)} />{l}</label>
                ))}
              </div>
            </fieldset>
            <label>Lời nhắn<textarea rows={3} maxLength={1000} value={f.message} onChange={(e) => set('message', e.target.value)} /></label>
            <label className="hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website', e.target.value)} /></label>
            <label className="consent">
              <input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} />
              <span>Tôi đồng ý để {branding.name} liên hệ và xử lý thông tin theo <a href={project.privacyPolicyUrl} target="_blank" rel="noreferrer">chính sách dữ liệu</a> *</span>
            </label>
            {errors.consent && <em className="err">{errors.consent}</em>}
            {needCaptcha && <div ref={box} className="captcha" />}
            {state === 'network' && <p className="err">Chưa gửi được. Thông tin của bạn vẫn còn, bấm Gửi lại.</p>}
            {state === 'blocked' && <p className="err">Bạn đã gửi quá nhiều lần. Thử lại sau ít phút.</p>}
            <button className="btn primary" disabled={state === 'sending' || (needCaptcha && !captcha)}>
              {state === 'sending' ? 'Đang gửi…' : state === 'network' ? 'Gửi lại' : 'Gửi'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
