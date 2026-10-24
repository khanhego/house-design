import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import nodemailer from 'nodemailer'
import type { Config } from '../config.ts'
import type { Rendered } from './templates.ts'

export interface Transport {
  send(to: string, m: Rendered): Promise<void>
}

/** SMTP khi có SMTP_URL; local ghi ra DATA_DIR/mail/outbox.log (02a §9). */
export const makeTransport = (cfg: Config): Transport => {
  if (cfg.smtpUrl) {
    const url = new URL(cfg.smtpUrl)
    url.searchParams.set('connectionTimeout', '20000')
    url.searchParams.set('socketTimeout', '20000')
    const t = nodemailer.createTransport(url.toString())
    return { send: async (to, m) => void (await t.sendMail({ from: cfg.mailFrom, to, subject: m.subject, text: m.text, html: m.html })) }
  }
  const dir = join(cfg.dataDir, 'mail')
  mkdirSync(dir, { recursive: true })
  return {
    send: async (to, m) => {
      appendFileSync(join(dir, 'outbox.log'), `--- ${new Date().toISOString()} → ${to}\n${m.subject}\n${m.text}\n\n`)
      if (cfg.env === 'development') console.log(`[mail] → ${to}: ${m.subject}`)
    },
  }
}
