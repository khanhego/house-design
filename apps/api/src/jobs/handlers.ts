import type { Ctx } from '../context.ts'
import type { JobHandler } from './runner.ts'
import { enqueueJob } from './runner.ts'
import { modelOptimizeHandler } from './modelJob.ts'
import { remindDue } from '../services/workflow.ts'

/** Đăng ký handler theo làn (model: T-19; cron: nhắc duyệt T-22). */
export const jobHandlers = (ctx: Ctx): { model: Record<string, JobHandler>; cron: Record<string, JobHandler>; hourly: () => void } => ({
  model: { 'model.optimize': modelOptimizeHandler },
  cron: { 'review.remind': async (c) => void remindDue(c) },
  hourly: () => enqueueJob(ctx, 'cron', 'review.remind', {}),
})
