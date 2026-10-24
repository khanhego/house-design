import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'

export type Param = SQLInputValue | boolean | undefined
export type Row = Record<string, unknown>

/** Bọc `node:sqlite` (ADR-002): WAL, khoá ngoại, transaction lồng bằng savepoint. */
export class Db {
  readonly raw: DatabaseSync
  private depth = 0

  constructor(file: string) {
    this.raw = new DatabaseSync(file)
    this.raw.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    if (file !== ':memory:') this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
  }

  private norm(params: Param[]): SQLInputValue[] {
    return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p))
  }

  all<T = Row>(sql: string, ...params: Param[]): T[] {
    return this.raw.prepare(sql).all(...this.norm(params)) as T[]
  }

  get<T = Row>(sql: string, ...params: Param[]): T | undefined {
    return this.raw.prepare(sql).get(...this.norm(params)) as T | undefined
  }

  run(sql: string, ...params: Param[]): { changes: number; lastInsertRowid: number | bigint } {
    const r = this.raw.prepare(sql).run(...this.norm(params))
    return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid }
  }

  exec(sql: string) {
    this.raw.exec(sql)
  }

  /** Transaction ghi (`BEGIN IMMEDIATE`); gọi lồng dùng SAVEPOINT. */
  tx<T>(fn: () => T): T {
    const name = `sp${this.depth}`
    if (this.depth === 0) this.raw.exec('BEGIN IMMEDIATE')
    else this.raw.exec(`SAVEPOINT ${name}`)
    this.depth++
    try {
      const out = fn()
      this.depth--
      if (this.depth === 0) this.raw.exec('COMMIT')
      else this.raw.exec(`RELEASE ${name}`)
      return out
    } catch (e) {
      this.depth--
      if (this.depth === 0) this.raw.exec('ROLLBACK')
      else this.raw.exec(`ROLLBACK TO ${name}; RELEASE ${name}`)
      throw e
    }
  }

  close() {
    this.raw.close()
  }
}

export const nowIso = () => new Date().toISOString()
export const parseJson = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string' || !s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
