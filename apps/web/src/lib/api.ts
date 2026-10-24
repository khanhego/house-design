/** Lớp gọi API dùng chung (02b §4): cookie, header CSRF, lỗi chuẩn 02 §6. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string>
  readonly body: Record<string, unknown>

  constructor(status: number, body: { error?: { code?: string; message?: string; fields?: Record<string, string> } & Record<string, unknown> }) {
    super(body.error?.message ?? 'Đã có lỗi, thử lại sau.')
    this.status = status
    this.code = body.error?.code ?? (status === 0 ? 'NETWORK' : 'INTERNAL')
    this.fields = body.error?.fields ?? {}
    this.body = body.error ?? {}
  }
}

export interface ApiOptions {
  ifMatch?: number
  signal?: AbortSignal
  keepalive?: boolean
}

export const api = async <T>(method: string, path: string, body?: unknown, opts: ApiOptions = {}): Promise<T> => {
  const headers: Record<string, string> = { 'X-Requested-With': 'fetch' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.ifMatch !== undefined) headers['If-Match'] = String(opts.ifMatch)
  let res: Response
  try {
    res = await fetch(path.startsWith('/') ? path : `/api/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal: opts.signal,
      keepalive: opts.keepalive,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, { error: { code: 'NETWORK', message: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.' } })
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) throw new ApiError(res.status, json)
  return json as T
}

/** Upload có tiến trình (XHR tự gắn header CSRF và cookie — N-3). */
export const upload = <T>(path: string, file: File | Blob, fields: Record<string, string> = {}, onProgress?: (ratio: number) => void): Promise<T> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', path.startsWith('/') ? path : `/api/v1/${path}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('X-Requested-With', 'fetch')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onload = () => {
      let json: any = {}
      try {
        json = JSON.parse(xhr.responseText || '{}')
      } catch {
        json = {}
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(json as T)
      else reject(new ApiError(xhr.status, json))
    }
    xhr.onerror = () => reject(new ApiError(0, { error: { code: 'NETWORK', message: 'Không kết nối được máy chủ.' } }))
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.append(k, v)
    fd.append('file', file, (file as File).name ?? 'file')
    xhr.send(fd)
  })
