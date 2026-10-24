import type { Ctx } from '../context.ts'
import type { JobHandler } from './runner.ts'

/** Đăng ký handler theo làn (model: T-19; cron: nhắc duyệt T-22). */
export const jobHandlers = (_ctx: Ctx): { model: Record<string, JobHandler>; cron: Record<string, JobHandler>; hourly: () => void } => ({
  model: {},
  cron: {},
  hourly: () => {},
})
