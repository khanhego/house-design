import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from './sqlite.ts'

const DIR = join(import.meta.dirname, 'migrations')

/** Chạy các file `NNN_*.sql` chưa áp dụng, mỗi file một transaction. */
export const migrate = (db: Db) => {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const done = new Set(db.all<{ version: string }>('SELECT version FROM schema_migrations').map((r) => r.version))
  const files = readdirSync(DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f) && !f.endsWith('.down.sql')).sort()
  for (const f of files) {
    const version = f.slice(0, 3)
    if (done.has(version)) continue
    db.tx(() => {
      db.exec(readFileSync(join(DIR, f), 'utf8'))
      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', version, new Date().toISOString())
    })
  }
}
