import type { FastifyInstance } from 'fastify'
import type { Ctx } from '../context.ts'
import { currentUser } from '../lib/auth.ts'
import { canReadFile } from '../services/fileAccess.ts'

/** GET /files/:storageKey — quyền theo 02 §6.2; không tiết lộ file tồn tại hay không (404). */
export const registerFiles = async (app: FastifyInstance, ctx: Ctx) => {
  app.get('/files/*', async (req, reply) => {
    const key = decodeURIComponent((req.params as { '*': string })['*'] ?? '')
    const file = key ? ctx.repos.files.byKey(key) : undefined
    const nf = () => reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy' } })
    if (!file || !ctx.storage.exists(file.storageKey)) return nf()
    const access = canReadFile(ctx, currentUser(ctx, req), file)
    if (!access.ok) return nf()
    reply
      .header('Cache-Control', access.public ? 'public, max-age=31536000, immutable' : 'private, no-store')
      .header('Content-Type', file.mime)
      .header('Content-Length', String(ctx.storage.size(file.storageKey)))
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`)
    return reply.send(ctx.storage.stream(file.storageKey))
  })
}
