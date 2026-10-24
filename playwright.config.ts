import { defineConfig } from '@playwright/test'

/* E2E-01, E2E-02 (02b §13) chạy qua server thật: web build + API phục vụ dist, CSP thật (N-01). Dữ liệu ở data-e2e/ (xoá mỗi lần chạy). */
const PORT = 8790
const env = `NODE_ENV=development DATA_DIR=data-e2e PORT=${PORT} WEB_DIST=apps/web/dist PUBLIC_BASE_URL=http://localhost:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, channel: 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: `npm run build && rm -rf data-e2e && ${env} node apps/api/src/seed/seed.ts && ${env} node apps/api/src/main.ts`,
    url: `http://localhost:${PORT}/healthz`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
