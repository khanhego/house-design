import { useEffect, useState } from 'react'

/* Ảnh nền mặt bằng (FR-03.03): ảnh dùng trực tiếp; PDF render trang thành ảnh bằng pdfjs (nạp động). */

const cache = new Map<string, Promise<{ url: string; w: number; h: number }>>()

const imageSize = (url: string) =>
  new Promise<{ url: string; w: number; h: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ url, w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = reject
    img.src = url
  })

const renderPdf = async (url: string, page: number) => {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await pdfjs.getDocument({ url, withCredentials: true }).promise
  const p = await pdf.getPage(Math.min(page, pdf.numPages))
  const viewport = p.getViewport({ scale: 2.5 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await p.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
  return { url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }
}

export const loadUnderlay = (url: string, isPdf: boolean, page = 1) => {
  const key = `${url}#${page}`
  if (!cache.has(key)) cache.set(key, isPdf ? renderPdf(url, page) : imageSize(url))
  return cache.get(key)!
}

export const useUnderlay = (src: { url: string; isPdf: boolean; page?: number } | null) => {
  const [img, setImg] = useState<{ url: string; w: number; h: number } | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    setImg(null)
    setErr(false)
    if (!src) return
    let alive = true
    loadUnderlay(src.url, src.isPdf, src.page).then((r) => alive && setImg(r)).catch(() => alive && setErr(true))
    return () => void (alive = false)
  }, [src?.url, src?.isPdf, src?.page])
  return { img, err }
}
