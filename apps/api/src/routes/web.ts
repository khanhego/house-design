import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance, FastifyReply } from 'fastify'
import fastifyStatic from '@fastify/static'
import { escapeXml } from '@hd/core'
import type { Ctx } from '../context.ts'

/** CSP theo entry (02 §8). */
const CSP_BASE = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' blob: data:",
  // clip chuyển cảnh tour (item 02) + đọc thời lượng clip trước khi tải lên ở trình dựng
  "media-src 'self' blob:",
  "connect-src 'self' blob: https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
]
export const CSP_VIEWER = [...CSP_BASE, 'frame-ancestors *'].join('; ')
export const CSP_APP = [...CSP_BASE, "frame-ancestors 'none'"].join('; ')

const ogTags = (og: { title: string; description: string; image: string | null; url: string }) =>
  [
    `<title>${escapeXml(og.title)}</title>`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeXml(og.title)}">`,
    `<meta property="og:description" content="${escapeXml(og.description)}">`,
    `<meta property="og:url" content="${escapeXml(og.url)}">`,
    og.image ? `<meta property="og:image" content="${escapeXml(og.image)}">` : '',
    `<meta name="description" content="${escapeXml(og.description)}">`,
  ].join('\n    ')

/** Phục vụ web build (02a routes/web.ts): SPA fallback, CSP, OG cho /v/*. Không có WEB_DIST (dev) → bỏ qua. */
export const registerWeb = async (app: FastifyInstance, ctx: Ctx) => {
  const dist = ctx.cfg.webDist
  if (!dist || !existsSync(join(dist, 'viewer.html'))) return
  const viewerHtml = readFileSync(join(dist, 'viewer.html'), 'utf8')
  const appHtml = readFileSync(join(dist, 'app.html'), 'utf8')

  await app.register(fastifyStatic, {
    root: dist,
    index: false,
    wildcard: true,
    // @fastify/static 10 truyền FastifyReply (không phải http.ServerResponse)
    setHeaders: (res, path) => {
      const r = res as unknown as FastifyReply
      if (path.includes('/assets/')) r.header('Cache-Control', 'public, max-age=31536000, immutable')
    },
  })

  const sendViewer = (reply: FastifyReply, path: string) => {
    let og = null
    try {
      og = ctx.og(path)
    } catch {
      og = null
    }
    const html = viewerHtml.replace('<!--OG-->', og ? ogTags(og) : '')
    return reply
      .header('Content-Security-Policy', CSP_VIEWER)
      .header('Referrer-Policy', 'no-referrer')
      .header('Cache-Control', 'no-cache')
      .type('text/html; charset=utf-8')
      .send(html)
  }
  const sendApp = (reply: FastifyReply) =>
    reply
      .header('Content-Security-Policy', CSP_APP)
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Robots-Tag', 'noindex')
      .header('Cache-Control', 'no-cache')
      .type('text/html; charset=utf-8')
      .send(appHtml)

  app.get('/', (_req, reply) => reply.redirect('/studio'))
  app.get('/v', (req, reply) => sendViewer(reply, req.url))
  app.get('/v/*', (req, reply) => sendViewer(reply, req.url.split('?')[0]))
  app.get('/portal', (_req, reply) => sendApp(reply))
  app.get('/portal/*', (_req, reply) => sendApp(reply))
  app.get('/studio', (_req, reply) => sendApp(reply))
  app.get('/studio/*', (_req, reply) => sendApp(reply))
}
