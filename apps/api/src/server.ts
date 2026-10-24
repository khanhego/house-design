import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import type { Config } from './config.ts'
import { createCtx } from './context.ts'
import type { Ctx } from './context.ts'
import { Db } from './db/sqlite.ts'
import { migrate } from './db/migrate.ts'
import { AppError } from './lib/errors.ts'
import { localDiskStorage } from './storage/storage.ts'
import { registerWeb } from './routes/web.ts'
import { registerRoutes } from './routes/index.ts'
import { makeTransport } from './email/transport.ts'
import type { Transport } from './email/transport.ts'
import { startRunner } from './jobs/runner.ts'
import type { Runner } from './jobs/runner.ts'
import { jobHandlers } from './jobs/handlers.ts'

import { MAX_UPLOAD_BYTES } from './lib/limits.ts'

export interface App {
  app: FastifyInstance
  ctx: Ctx
  transport: Transport
  close: () => Promise<void>
}

const CSRF_SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

export const buildApp = async (cfg: Config, opts: { dbFile?: string; logger?: boolean } = {}): Promise<App> => {
  mkdirSync(cfg.dataDir, { recursive: true })
  const db = new Db(opts.dbFile ?? join(cfg.dataDir, 'app.db'))
  migrate(db)
  const storage = localDiskStorage(join(cfg.dataDir, 'files'))
  const ctx = createCtx(cfg, db, storage)

  const app = Fastify({
    trustProxy: cfg.trustProxyHops > 0 ? (_addr: string, hop: number) => hop < cfg.trustProxyHops : false,
    bodyLimit: 6 * 1024 * 1024,
    logger:
      opts.logger === false
        ? false
        : {
            level: cfg.env === 'production' ? 'info' : 'warn',
            redact: ['req.headers.cookie', 'body.password', 'body.token', 'body.phone', 'body.email', 'body.name', 'body.message'],
            serializers: {
              // bỏ query string và fragment khỏi log (R-28)
              req: (req) => ({ method: req.method, url: req.url.split('?')[0], reqId: req.id }),
            },
          },
  })
  await app.register(cookie)
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 } })

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}), ...err.extra } })
    }
    const e = err as { statusCode?: number; code?: string; message: string; validation?: unknown }
    if (e.code === 'FST_REQ_FILE_TOO_LARGE' || e.code === 'FST_FILES_LIMIT') {
      return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: 'Tệp vượt quá 200 MB' } })
    }
    if (e.statusCode === 413) return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: 'Dữ liệu gửi lên quá lớn' } })
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: { code: 'BAD_REQUEST', message: e.message } })
    }
    req.log.error(err)
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Đã có lỗi, thử lại sau' } })
  })

  // CSRF (02 §6): request đổi dữ liệu vào /api (trừ /api/v1/public) phải có X-Requested-With và Origin hợp lệ.
  app.addHook('onRequest', async (req) => {
    if (CSRF_SAFE.has(req.method) || !req.url.startsWith('/api/') || req.url.startsWith('/api/v1/public/')) return
    if (req.headers['x-requested-with'] !== 'fetch') throw new AppError(403, 'CSRF', 'Phiên làm việc đã thay đổi. Tải lại trang.')
    const origin = req.headers.origin
    if (origin) {
      const allowed = new Set([new URL(cfg.publicBaseUrl).origin, `${req.protocol}://${req.headers.host}`])
      if (!allowed.has(origin)) throw new AppError(403, 'CSRF', 'Nguồn yêu cầu không hợp lệ')
    }
  })
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
  })

  app.get('/healthz', async () => {
    const failed = db.get<{ n: number }>("SELECT COUNT(*) n FROM jobs WHERE status='failed' AND updated_at > ?", new Date(Date.now() - 864e5).toISOString())?.n ?? 0
    const outboxQueued = db.get<{ n: number }>("SELECT COUNT(*) n FROM outbox_emails WHERE status='queued'")?.n ?? 0
    const modelQueue = db.get<{ n: number }>("SELECT COUNT(*) n FROM jobs WHERE lane='model' AND status IN ('queued','running')")?.n ?? 0
    return { db: 'ok', jobsFailed24h: failed, outboxQueued, modelQueue }
  })

  await registerRoutes(app, ctx)
  await registerWeb(app, ctx)

  const transport = makeTransport(cfg)
  let runner: Runner | null = null
  if (cfg.runJobs) runner = startRunner(ctx, transport, jobHandlers(ctx))

  return {
    app,
    ctx,
    transport,
    close: async () => {
      runner?.stop()
      await app.close()
      db.close()
    },
  }
}
