import type { FastifyInstance } from 'fastify'
import type { Ctx } from '../context.ts'
import { ogFor } from '../services/public.ts'
import { registerFiles } from './files.ts'
import { registerPublic } from './public.ts'
import { registerAuth } from './auth.ts'
import { registerAdmin } from './admin.ts'
import { registerProjects } from './projects.ts'
import { registerLibrary } from './library.ts'
import { registerModels } from './models.ts'

/** Đăng ký mọi nhóm API (thêm dần theo task trong 03-plan). */
export const registerRoutes = async (app: FastifyInstance, ctx: Ctx) => {
  ctx.og = (path) => ogFor(ctx, path)
  await registerPublic(app, ctx)
  await registerFiles(app, ctx)
  await registerAuth(app, ctx)
  await registerAdmin(app, ctx)
  await registerProjects(app, ctx)
  await registerLibrary(app, ctx)
  await registerModels(app, ctx)
}
