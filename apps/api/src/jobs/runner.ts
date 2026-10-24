import { newId } from '@hd/core'
import { nowIso } from '../db/sqlite.ts'
import type { Ctx } from '../context.ts'
import { render } from '../email/templates.ts'
import type { Transport } from '../email/transport.ts'
import type { Template } from '../services/mail.ts'

/** Job runner hai làn + cron (02a §7). Làn mail độc lập với làn model để E5 ≤ 5 phút. */

const MAIL_BACKOFF_MIN = [1, 5, 15, 60, 240]

export const sendQueuedMail = async (ctx: Ctx, transport: Transport, limit = 20) => {
  const rows = ctx.db.all<{ id: string; to_addr: string; template: Template; data_json: string; attempts: number }>(
    "SELECT id, to_addr, template, data_json, attempts FROM outbox_emails WHERE status='queued' AND run_at <= ? ORDER BY created_at LIMIT ?",
    nowIso(), limit,
  )
  for (const r of rows) {
    try {
      await transport.send(r.to_addr, render(r.template, JSON.parse(r.data_json), ctx.cfg.publicBaseUrl))
      ctx.db.run("UPDATE outbox_emails SET status='sent', sent_at=?, attempts=attempts+1 WHERE id=?", nowIso(), r.id)
    } catch (e) {
      const attempts = r.attempts + 1
      if (attempts >= MAIL_BACKOFF_MIN.length) {
        ctx.db.run("UPDATE outbox_emails SET status='failed', attempts=?, last_error=? WHERE id=?", attempts, String((e as Error).message).slice(0, 500), r.id)
      } else {
        const next = new Date(Date.now() + MAIL_BACKOFF_MIN[attempts - 1] * 60_000).toISOString()
        ctx.db.run('UPDATE outbox_emails SET attempts=?, last_error=?, run_at=? WHERE id=?', attempts, String((e as Error).message).slice(0, 500), next, r.id)
      }
    }
  }
  return rows.length
}

export type JobHandler = (ctx: Ctx, payload: Record<string, unknown>) => Promise<void>

export const enqueueJob = (ctx: Ctx, lane: 'model' | 'cron', kind: string, payload: Record<string, unknown>) => {
  const t = nowIso()
  ctx.db.run('INSERT INTO jobs (id, lane, kind, payload_json, run_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', newId('job'), lane, kind, JSON.stringify(payload), t, t, t)
  ctx.kick(lane)
}

const JOB_BACKOFF_MIN = [1, 5]

/** Chạy một job đang chờ của làn; trả true nếu có chạy. */
export const runOneJob = async (ctx: Ctx, lane: 'model' | 'cron', handlers: Record<string, JobHandler>) => {
  const j = ctx.db.get<{ id: string; kind: string; payload_json: string; attempts: number }>(
    "SELECT id, kind, payload_json, attempts FROM jobs WHERE lane=? AND status='queued' AND run_at <= ? ORDER BY run_at LIMIT 1", lane, nowIso(),
  )
  if (!j) return false
  if (!ctx.db.run("UPDATE jobs SET status='running', updated_at=? WHERE id=? AND status='queued'", nowIso(), j.id).changes) return true
  const h = handlers[j.kind]
  try {
    if (!h) throw new Error(`no handler for ${j.kind}`)
    await h(ctx, JSON.parse(j.payload_json))
    ctx.db.run("UPDATE jobs SET status='done', attempts=attempts+1, updated_at=? WHERE id=?", nowIso(), j.id)
  } catch (e) {
    const attempts = j.attempts + 1
    const msg = String((e as Error).message).slice(0, 500)
    if (attempts > JOB_BACKOFF_MIN.length) ctx.db.run("UPDATE jobs SET status='failed', attempts=?, last_error=?, updated_at=? WHERE id=?", attempts, msg, nowIso(), j.id)
    else ctx.db.run("UPDATE jobs SET status='queued', attempts=?, last_error=?, run_at=?, updated_at=? WHERE id=?", attempts, msg, new Date(Date.now() + JOB_BACKOFF_MIN[attempts - 1] * 60_000).toISOString(), nowIso(), j.id)
    console.error(`[job] ${j.kind} ${j.id} lỗi (lần ${attempts}): ${msg}`)
  }
  return true
}

export interface Runner {
  stop: () => void
}

/** Vòng lặp nền: mail mỗi 5 giây, model và cron khi có việc (kick) hoặc mỗi 10 giây; cron theo giờ. */
export const startRunner = (ctx: Ctx, transport: Transport, handlers: { model: Record<string, JobHandler>; cron: Record<string, JobHandler>; hourly: () => void }): Runner => {
  ctx.db.run("UPDATE jobs SET status='queued' WHERE status='running'")
  let stopped = false
  const busy = { mail: false, model: false, cron: false }
  const loop = async (lane: 'mail' | 'model' | 'cron') => {
    if (stopped || busy[lane]) return
    busy[lane] = true
    try {
      if (lane === 'mail') await sendQueuedMail(ctx, transport)
      else while (!stopped && (await runOneJob(ctx, lane, handlers[lane]))) { /* xử lý hết hàng đợi */ }
    } catch (e) {
      console.error(`[runner] ${lane}:`, e)
    } finally {
      busy[lane] = false
    }
  }
  ctx.kick = (lane) => setImmediate(() => void loop(lane))
  const t1 = setInterval(() => void loop('mail'), 5000)
  const t2 = setInterval(() => (void loop('model'), void loop('cron')), 10_000)
  const t3 = setInterval(() => handlers.hourly(), 3600_000)
  setImmediate(() => (handlers.hourly(), void loop('mail'), void loop('model')))
  return {
    stop: () => {
      stopped = true
      clearInterval(t1)
      clearInterval(t2)
      clearInterval(t3)
    },
  }
}
