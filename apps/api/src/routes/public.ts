import type { FastifyInstance } from 'fastify'
import type { Ctx } from '../context.ts'
import { privacyPolicy, publicHouse, publicProject } from '../services/public.ts'

const SLUG = /^[a-z0-9-]{3,60}$/

/** API-60, API-61 (+ chính sách dữ liệu cho V5). */
export const registerPublic = async (app: FastifyInstance, ctx: Ctx) => {
  app.get<{ Params: { slug: string } }>('/api/v1/public/projects/:slug', async (req, reply) => {
    if (!SLUG.test(req.params.slug)) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy' } })
    reply.header('Cache-Control', 'public, max-age=60')
    return publicProject(ctx, req.params.slug)
  })
  app.get<{ Params: { slug: string; house: string } }>('/api/v1/public/projects/:slug/houses/:house', async (req, reply) => {
    if (!SLUG.test(req.params.slug) || !SLUG.test(req.params.house)) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy' } })
    reply.header('Cache-Control', 'public, max-age=60')
    return publicHouse(ctx, req.params.slug, req.params.house)
  })
  app.get<{ Params: { slug: string } }>('/api/v1/public/projects/:slug/privacy', async (req) => privacyPolicy(ctx, req.params.slug))
}
