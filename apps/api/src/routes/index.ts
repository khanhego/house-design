import type { FastifyInstance } from 'fastify'
import type { Ctx } from '../context.ts'

/** Đăng ký mọi nhóm API dưới /api/v1 (thêm dần theo task trong 03-plan). */
export const registerRoutes = async (_app: FastifyInstance, _ctx: Ctx) => {}
