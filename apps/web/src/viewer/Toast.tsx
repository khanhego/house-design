import { useCallback, useRef, useState } from 'react'

export const useToast = () => {
  const [msg, setMsg] = useState<string | null>(null)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((m: string) => {
    setMsg(m)
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => setMsg(null), 2600)
  }, [])
  const node = msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null
  return { show, node }
}
