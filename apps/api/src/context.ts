import type { Config } from './config.ts'
import type { Db } from './db/sqlite.ts'
import type { Storage } from './storage/storage.ts'
import { formTokens } from './lib/formToken.ts'
import { makeRepos } from './repos/repos.ts'
import type { Repos } from './repos/repos.ts'

export interface OgData {
  title: string
  description: string
  image: string | null
  url: string
}

export interface Ctx {
  cfg: Config
  db: Db
  repos: Repos
  storage: Storage
  forms: ReturnType<typeof formTokens>
  /** Thẻ OG cho đường dẫn `/v/*` (gán bởi module public). */
  og: (path: string) => OgData | null
  /** Đánh thức job runner khi có việc mới. */
  kick: (lane: 'model' | 'mail' | 'cron') => void
}

export const createCtx = (cfg: Config, db: Db, storage: Storage): Ctx => ({
  cfg,
  db,
  repos: makeRepos(db),
  storage,
  forms: formTokens(cfg.formTokenSecret),
  og: () => null,
  kick: () => {},
})
