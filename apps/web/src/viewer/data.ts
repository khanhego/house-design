import { useEffect, useState } from 'react'
import type { PublicHousePayload, PublicProjectPayload } from '@hd/core'
import { api, ApiError } from '../lib/api.ts'

export type Load<T> =
  | { state: 'loading' }
  | { state: 'ok'; data: T }
  | { state: 'unavailable'; contact: { name: string; phone: string | null; email: string | null } | null }
  | { state: 'notfound' }
  | { state: 'error'; message: string }

const toLoad = <T,>(e: unknown): Load<T> => {
  if (e instanceof ApiError) {
    if (e.status === 410) return { state: 'unavailable', contact: (e.body.contact as never) ?? null }
    if (e.status === 404) return { state: 'notfound' }
    return { state: 'error', message: e.message }
  }
  return { state: 'error', message: 'Đã có lỗi, thử lại sau.' }
}

const useLoad = <T,>(path: string | null, reloadKey = 0): Load<T> => {
  const [s, setS] = useState<Load<T>>({ state: 'loading' })
  useEffect(() => {
    if (!path) return
    const ctl = new AbortController()
    setS({ state: 'loading' })
    api<T>('GET', path, undefined, { signal: ctl.signal })
      .then((data) => setS({ state: 'ok', data }))
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setS(toLoad<T>(e))
      })
    return () => ctl.abort()
  }, [path, reloadKey])
  return s
}

export const useProject = (slug: string, reloadKey = 0) => useLoad<PublicProjectPayload>(`/api/v1/public/projects/${slug}`, reloadKey)
export const useHouse = (slug: string, house: string, reloadKey = 0) =>
  useLoad<PublicHousePayload>(`/api/v1/public/projects/${slug}/houses/${house}`, reloadKey)

/** WebGL2 bắt buộc cho 3D (02b §10). */
export const hasWebGL2 = () => {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

/** Trình duyệt trong app Zalo / Facebook (R-10). */
export const isInAppBrowser = () => /Zalo|FBAN|FBAV|FB_IAB|Instagram/i.test(navigator.userAgent)

export const sourceFromUrl = (): 'link' | 'qr' | 'embed' => {
  const src = new URLSearchParams(location.search).get('src')
  if (src === 'qr') return 'qr'
  if (src === 'embed') return 'embed'
  try {
    if (window.self !== window.top) return 'embed'
  } catch {
    return 'embed'
  }
  return 'link'
}
