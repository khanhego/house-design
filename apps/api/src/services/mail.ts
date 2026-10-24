import { newId } from '@hd/core'
import { nowIso } from '../db/sqlite.ts'
import type { Ctx } from '../context.ts'

export type Template = 'E1' | 'E2' | 'E3' | 'E4' | 'E5'

/** Xếp email vào outbox; job `email.send` gửi (02a §7). */
export const enqueueEmail = (ctx: Ctx, to: string, template: Template, data: Record<string, unknown>, leadId: string | null = null) => {
  const t = nowIso()
  ctx.db.run(
    'INSERT INTO outbox_emails (id, to_addr, template, data_json, lead_id, run_at, created_at) VALUES (?,?,?,?,?,?,?)',
    newId('eml'), to, template, JSON.stringify(data), leadId, t, t,
  )
  ctx.kick('mail')
}
