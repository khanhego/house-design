import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { INTERESTS } from '@hd/core'
import type { Ctx } from '../context.ts'
import { AppError } from '../lib/errors.ts'
import { requireUser } from '../lib/auth.ts'
import { toCsv } from '../lib/csv.ts'
import { slidingWindow } from '../lib/rateLimit.ts'
import { verifyTurnstile } from '../lib/turnstile.ts'
import { parse } from '../lib/validate.ts'
import { LEADS_CSV_HEADER, deleteLead, leadsCsvRows, listLeads, setLeadStatus, submitLead } from '../services/leads.ts'
import { recordEvents, stats } from '../services/stats.ts'

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const id = z.string().max(40)

const LeadBody = z.object({
  projectSlug: z.string().max(60),
  houseSlug: z.string().max(60).nullable().optional(),
  name: z.string().trim().max(100).nullable().optional(),
  phone: z.string().max(30),
  email: z.string().trim().max(200).nullable().optional(),
  interest: z.enum(INTERESTS).nullable().optional(),
  message: z.string().trim().max(1000).nullable().optional(),
  consent: z.boolean(),
  context: z.object({ floorId: id.optional(), roomId: id.optional(), sceneId: id.optional() }).nullable().optional(),
  source: z.enum(['link', 'qr', 'embed']).optional(),
  deviceId: z.string().max(64).nullable().optional(),
  website: z.string().max(500).optional(),
  formToken: z.string().max(200).nullable().optional(),
  captchaToken: z.string().max(4000).nullable().optional(),
})

const EventsBody = z.object({
  projectSlug: z.string().max(60),
  sessionId: z.string().min(1).max(64),
  deviceId: z.string().min(1).max(64),
  source: z.string().max(10),
  deviceClass: z.string().max(10),
  events: z.array(z.object({ type: z.string().max(30), houseSlug: z.string().max(60).optional(), targetId: z.string().max(64).optional(), ts: z.string().max(40) })).max(50),
})

const LeadQuery = z.object({
  clientId: id.optional(), projectId: id.optional(), houseId: id.optional(), from: DATE.optional(), to: DATE.optional(),
  status: z.enum(['new', 'contacted']).optional(), limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().max(200).optional(),
})
const StatsQuery = z.object({ projectId: id.optional(), clientId: id.optional(), houseId: id.optional(), from: DATE.optional(), to: DATE.optional() })

const captcha = () => new AppError(429, 'CAPTCHA_REQUIRED', 'Vui lòng xác minh bạn không phải máy để gửi tiếp.')

/** API-62, 63 (công khai) · 70…72 lead · 80, 81 thống kê. */
export const registerLeads = async (app: FastifyInstance, ctx: Ctx) => {
  const byDevice = slidingWindow(3, 10 * 60_000)
  const byIp = slidingWindow(20, 10 * 60_000)
  const eventsByIp = slidingWindow(120, 60_000)

  app.post('/api/v1/public/leads', { bodyLimit: 16 * 1024 }, async (req, reply) => {
    const b = parse(LeadBody, req.body)
    // honeypot: trả như thành công để bot không nhận ra, không lưu
    if (b.website) return reply.status(201).send({ lead: { id: 'led_ignored' }, merged: false })
    const passed = b.captchaToken ? await verifyTurnstile(ctx.cfg.turnstileSecret, b.captchaToken, req.ip) : false
    if (!passed) {
      if (!ctx.forms.verify(b.formToken)) throw captcha()
      const okDevice = b.deviceId ? byDevice.hit(b.deviceId) : true
      const okIp = byIp.hit(req.ip)
      if (!okDevice || !okIp) throw captcha()
    }
    const r = submitLead(ctx, { ...b, phone: b.phone, consent: b.consent })
    return reply.status(r.merged ? 200 : 201).send(r)
  })

  app.post('/api/v1/public/events', { bodyLimit: 64 * 1024 }, async (req, reply) => {
    if (!eventsByIp.hit(req.ip)) throw new AppError(429, 'RATE_LIMITED', 'Quá nhiều yêu cầu')
    const b = parse(EventsBody, req.body)
    recordEvents(ctx, b)
    return reply.status(204).send()
  })

  app.get('/api/v1/leads', async (req) => {
    const u = requireUser(ctx, req, ['admin', 'approver'])
    const q = parse(LeadQuery, req.query)
    return listLeads(ctx, u, q, { limit: q.limit, cursor: q.cursor })
  })

  app.get('/api/v1/leads.csv', async (req, reply) => {
    const u = requireUser(ctx, req, ['admin', 'approver'])
    const q = parse(LeadQuery, req.query)
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="lead.csv"').header('cache-control', 'private, no-store')
    return toCsv(LEADS_CSV_HEADER, leadsCsvRows(ctx, u, q))
  })

  app.patch<{ Params: { id: string } }>('/api/v1/leads/:id', async (req) => {
    const u = requireUser(ctx, req, ['admin', 'approver'])
    const b = parse(z.object({ status: z.enum(['new', 'contacted']) }).strict(), req.body)
    return { lead: setLeadStatus(ctx, u, req.params.id, b.status) }
  })

  app.delete<{ Params: { id: string } }>('/api/v1/leads/:id', async (req, reply) => {
    const u = requireUser(ctx, req, ['admin', 'approver'])
    deleteLead(ctx, u, req.params.id)
    return reply.status(204).send()
  })

  app.get('/api/v1/stats', async (req) => {
    const u = requireUser(ctx, req, ['admin', 'approver'])
    return stats(ctx, u, parse(StatsQuery, req.query))
  })

  app.get('/api/v1/stats.csv', async (req, reply) => {
    const u = requireUser(ctx, req, ['admin', 'approver'])
    const s = stats(ctx, u, parse(StatsQuery, req.query))
    const rows: (string | number)[][] = s.daily.map((d) => [d.date, d.views, d.leads])
    rows.push(['Tổng', s.totals.views, s.totals.leads])
    rows.push([])
    rows.push(['Người xem', s.totals.uniqueViewers, ''])
    rows.push(['Thời gian xem TB (giây)', s.totals.avgDurationSec, ''])
    rows.push(['Tỉ lệ lead/lượt xem', s.totals.leadRate, ''])
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="thong-ke-${s.range.from}-${s.range.to}.csv"`).header('cache-control', 'private, no-store')
    return toCsv(['Ngày', 'Lượt xem', 'Lead'], rows)
  })
}
