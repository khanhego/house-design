import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { emptyDocument } from '@hd/core'
import { makeApp } from './helpers.ts'
import type { TestApp } from './helpers.ts'
import { formTokens } from '../src/lib/formToken.ts'
import { toCsv } from '../src/lib/csv.ts'
import { businessDaysBetween } from '../src/lib/time.ts'
import { loadConfig } from '../src/config.ts'

let t: TestApp
beforeAll(async () => {
  t = await makeApp()
})
afterAll(async () => t.close())

const now = () => new Date().toISOString()
const seedHouse = () => {
  const db = t.ctx.db
  db.run("INSERT INTO clients (id, name, created_at, updated_at) VALUES ('cli_1', 'KH', ?, ?)", now(), now())
  db.run("INSERT INTO projects (id, client_id, slug, name, created_at, updated_at) VALUES ('prj_1', 'cli_1', 'du-an-a', 'Dự án', ?, ?)", now(), now())
  db.run("INSERT INTO houses (id, project_id, slug, name, house_type, declared_area, created_at, updated_at) VALUES ('hou_1', 'prj_1', 'mau-a', 'Mẫu A', 'villa', 200, ?, ?)", now(), now())
}

describe('T-3 hạ tầng', () => {
  it('healthz', async () => {
    const r = await t.call('GET', '/healthz')
    expect(r.status).toBe(200)
    expect(r.json).toEqual({ db: 'ok', jobsFailed24h: 0, outboxQueued: 0, modelQueue: 0 })
  })

  it('migration tạo đủ bảng', () => {
    const tables = t.ctx.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name)
    expect(tables).toEqual([
      'clients', 'files', 'houses', 'jobs', 'leads', 'library_items', 'materials', 'model_assets', 'outbox_emails', 'projects', 'reviews',
      'schema_migrations', 'sessions', 'submission_files', 'submissions', 'tokens', 'users', 'versions', 'view_events',
    ])
  })

  it('CHECK slug chặn ký tự lạ (R-21)', () => {
    seedHouse()
    const ins = (slug: string) => () =>
      t.ctx.db.run("INSERT INTO projects (id, client_id, slug, name, created_at, updated_at) VALUES (?, 'cli_1', ?, 'x', ?, ?)", `prj_${slug}`, slug, now(), now())
    expect(ins('a_B! x')).toThrow()
    expect(ins('-abc')).toThrow()
    expect(ins('ab--c')).toThrow()
    expect(ins('ab')).toThrow()
    expect(ins('sunrise-garden-2')).not.toThrow()
  })

  it('mỗi mẫu nhà tối đa 1 phiên bản mở và 1 phiên bản đã phát hành (BR-02)', () => {
    const doc = JSON.stringify(emptyDocument())
    const ins = (id: string, n: number, state: string) => () =>
      t.ctx.db.run('INSERT INTO versions (id, house_id, number, state, document, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, 'hou_1', n, state, doc, now(), now())
    expect(ins('v1', 1, 'draft')).not.toThrow()
    expect(ins('v2', 2, 'pending_review')).toThrow()
    expect(ins('v3', 3, 'published')).not.toThrow()
    expect(ins('v4', 4, 'published')).toThrow()
  })

  it('submission và review bất biến (BR-03)', () => {
    const db = t.ctx.db
    db.run("INSERT INTO submissions (id, version_id, seq, snapshot, snapshot_hash, submitted_at, submitted_by) VALUES ('sub_1', 'v1', 1, '{}', 'h', ?, 'usr')", now())
    db.run("INSERT INTO reviews (id, submission_id, version_id, decision, user_id, snapshot_hash, created_at) VALUES ('rev_1', 'sub_1', 'v1', 'approved', 'usr', 'h', ?)", now())
    expect(() => db.run("UPDATE submissions SET snapshot='{\"x\":1}' WHERE id='sub_1'")).toThrow(/immutable/)
    expect(() => db.run("DELETE FROM submissions WHERE id='sub_1'")).toThrow(/immutable/)
    expect(() => db.run("UPDATE reviews SET note='x' WHERE id='rev_1'")).toThrow(/immutable/)
    expect(() => db.run("DELETE FROM reviews WHERE id='rev_1'")).toThrow(/immutable/)
    // cột ngoài danh sách bất biến vẫn sửa được
    expect(() => db.run("UPDATE submissions SET withdrawn_at=? WHERE id='sub_1'", now())).not.toThrow()
    // một quyết định mỗi lần gửi
    expect(() => db.run("INSERT INTO reviews (id, submission_id, version_id, decision, user_id, snapshot_hash, created_at) VALUES ('rev_2', 'sub_1', 'v1', 'approved', 'usr', 'h', ?)", now())).toThrow()
  })

  it('transaction lồng rollback đúng phạm vi', () => {
    const db = t.ctx.db
    db.tx(() => {
      db.run("INSERT INTO clients (id, name, created_at, updated_at) VALUES ('cli_outer', 'o', ?, ?)", now(), now())
      expect(() =>
        db.tx(() => {
          db.run("INSERT INTO clients (id, name, created_at, updated_at) VALUES ('cli_inner', 'i', ?, ?)", now(), now())
          throw new Error('boom')
        }),
      ).toThrow('boom')
    })
    expect(db.get("SELECT id FROM clients WHERE id='cli_outer'")).toBeTruthy()
    expect(db.get("SELECT id FROM clients WHERE id='cli_inner'")).toBeUndefined()
  })

  it('CSRF: thiếu X-Requested-With hoặc Origin lạ → 403', async () => {
    const a = await makeApp()
    a.app.post('/api/v1/_probe', async () => ({ ok: true }))
    const noHeader = await a.app.inject({ method: 'POST', url: '/api/v1/_probe', payload: {} })
    expect(noHeader.statusCode).toBe(403)
    expect(JSON.parse(noHeader.body).error.code).toBe('CSRF')
    const badOrigin = await a.call('POST', '/api/v1/_probe', { body: {}, headers: { origin: 'https://evil.example' } })
    expect(badOrigin.status).toBe(403)
    const ok = await a.call('POST', '/api/v1/_probe', { body: {}, headers: { origin: 'http://localhost:5173' } })
    expect(ok.status).toBe(200)
    await a.close()
  })
})

describe('lib', () => {
  it('form token: quá nhanh, hợp lệ, hết hạn, sai chữ ký', () => {
    const f = formTokens('s')
    const tok = f.issue(1_000_000)
    expect(f.verify(tok, 1_001_000)).toBe(false)
    expect(f.verify(tok, 1_004_000)).toBe(true)
    expect(f.verify(tok, 1_000_000 + 2 * 3600 * 1000 + 1)).toBe(false)
    expect(f.verify(tok.slice(0, -1) + 'x', 1_004_000)).toBe(false)
    expect(formTokens('other').verify(tok, 1_004_000)).toBe(false)
  })
  it('CSV chặn công thức, escape dấu nháy (R-27)', () => {
    const csv = toCsv(['a', 'b'], [['=1+1', 'Nguyễn "A"']])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain("'=1+1")
    expect(csv).toContain('"Nguyễn ""A"""')
  })
  it('ngày làm việc: gửi Thứ 6 → Thứ 6 tuần sau = 5 ngày', () => {
    // 2026-10-23 là Thứ 6
    expect(businessDaysBetween(new Date('2026-10-23T03:00:00Z'), new Date('2026-10-30T04:00:00Z'))).toBe(5)
    expect(businessDaysBetween(new Date('2026-10-23T03:00:00Z'), new Date('2026-10-26T04:00:00Z'))).toBe(1)
  })
  it('production thiếu secret → không khởi động', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/TURNSTILE_SECRET/)
  })
})
