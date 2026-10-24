import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'

export interface Config {
  env: 'development' | 'test' | 'production'
  port: number
  dataDir: string
  publicBaseUrl: string
  webDist: string | null
  smtpUrl: string | null
  mailFrom: string
  formTokenSecret: string
  turnstileSiteKey: string | null
  turnstileSecret: string | null
  /** số proxy tin cậy phía trước (X-Forwarded-For); 0 = không tin header (R-G3-01) */
  trustProxyHops: number
  cookieSecure: boolean
  seedAdminEmail: string | null
  seedAdminPassword: string | null
  /** chạy job nền (tắt trong test để điều khiển tay) */
  runJobs: boolean
}

const repoRoot = resolve(import.meta.dirname, '../../..')

export const loadConfig = (env: NodeJS.ProcessEnv = process.env, overrides: Partial<Config> = {}): Config => {
  const mode = (env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development') as Config['env']
  const prod = mode === 'production'
  const cfg: Config = {
    env: mode,
    port: Number(env.PORT ?? 8787),
    dataDir: resolve(env.DATA_DIR ?? resolve(repoRoot, 'data')),
    publicBaseUrl: (env.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
    webDist: env.WEB_DIST ? resolve(env.WEB_DIST) : prod ? resolve(repoRoot, 'apps/web/dist') : null,
    smtpUrl: env.SMTP_URL || null,
    mailFrom: env.MAIL_FROM ?? 'Nhà mẫu online <no-reply@localhost>',
    formTokenSecret: env.FORM_TOKEN_SECRET || randomBytes(32).toString('hex'),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
    turnstileSecret: env.TURNSTILE_SECRET || null,
    trustProxyHops: Number(env.TRUST_PROXY_HOPS ?? 0) || 0,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : prod,
    seedAdminEmail: env.SEED_ADMIN_EMAIL ?? (mode === 'development' ? 'admin@local.test' : null),
    seedAdminPassword: env.SEED_ADMIN_PASSWORD ?? (mode === 'development' ? 'admin12345' : null),
    runJobs: mode !== 'test',
    ...overrides,
  }
  if (prod) {
    const missing = [
      ['SMTP_URL', cfg.smtpUrl],
      ['FORM_TOKEN_SECRET', env.FORM_TOKEN_SECRET],
      ['TURNSTILE_SITE_KEY', cfg.turnstileSiteKey],
      ['TURNSTILE_SECRET', cfg.turnstileSecret],
    ].filter(([, v]) => !v).map(([k]) => k)
    if (missing.length) throw new Error(`Thiếu cấu hình bắt buộc ở production: ${missing.join(', ')}`)
  }
  return cfg
}
