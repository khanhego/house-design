import { useEffect, useRef } from 'react'
import { api, ApiError } from '../../../lib/api.ts'
import { useEditor } from './store.ts'
import type { Check } from '@hd/core'

/** Autosave (02b §3.1): debounce 1,5 giây, If-Match revision; 409 → xung đột/khoá; mất mạng → thử lại sau 5 giây. */
export const useAutosave = (onChecks: (c: Check[]) => void) => {
  const doc = useEditor((s) => s.doc)
  const dirty = useEditor((s) => s.dirty)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef(false)

  useEffect(() => {
    if (!dirty || !doc) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(function save() {
      const s = useEditor.getState()
      if (!s.doc || s.saveState === 'conflict' || s.saveState === 'locked') return
      if (inflight.current) {
        timer.current = setTimeout(save, 500)
        return
      }
      inflight.current = true
      const sent = s.doc
      useEditor.setState({ saveState: 'saving', dirty: false })
      api<{ revision: number; checks: Check[] }>('PUT', `versions/${s.versionId}/document`, { document: sent }, { ifMatch: s.revision })
        .then((r) => {
          useEditor.getState().saved(r.revision)
          onChecks(r.checks)
          if (useEditor.getState().doc !== sent) useEditor.setState({ dirty: true })
        })
        .catch((e) => {
          if (e instanceof ApiError && e.code === 'REVISION_CONFLICT') useEditor.setState({ saveState: 'conflict' })
          else if (e instanceof ApiError && e.code === 'VERSION_LOCKED') useEditor.setState({ saveState: 'locked' })
          else if (e instanceof ApiError && e.code === 'DOCUMENT_INVALID') {
            useEditor.setState({ saveState: 'error' })
            console.error('DOCUMENT_INVALID', e.fields)
          } else {
            useEditor.setState({ saveState: 'error', dirty: true })
            timer.current = setTimeout(save, 5000)
          }
        })
        .finally(() => (inflight.current = false))
    }, 1500)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [doc, dirty, onChecks])

  // rời trình dựng trong app (không unload trang) khi còn thay đổi chưa lưu → gửi ngay (R-G3-05)
  useEffect(() => () => {
    const s = useEditor.getState()
    if (!s.doc || !s.dirty || s.saveState === 'conflict' || s.saveState === 'locked' || inflight.current) return
    void api('PUT', `versions/${s.versionId}/document`, { document: s.doc }, { ifMatch: s.revision }).catch(() => {})
    useEditor.setState({ dirty: false })
  }, [])

  // chặn rời trang khi còn thay đổi chưa lưu
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState()
      if (s.dirty || s.saveState === 'saving') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])
}
