import type { FastifyInstance } from 'fastify'
import type { Ctx } from '../context.ts'
import { ogFor } from '../services/public.ts'
import { registerFiles } from './files.ts'
import { registerPublic } from './public.ts'

/** Đăng ký mọi nhóm API (thêm dần theo task trong 03-plan). */
export const registerRoutes = async (app: FastifyInstance, ctx: Ctx) => {
  ctx.og = (path) => ogFor(ctx, path)
  await registerPublic(app, ctx)
  await registerFiles(app, ctx)
}
