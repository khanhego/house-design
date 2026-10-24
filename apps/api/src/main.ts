import { loadConfig } from './config.ts'
import { buildApp } from './server.ts'

const cfg = loadConfig()
const { app, ctx } = await buildApp(cfg)
await app.listen({ port: cfg.port, host: '0.0.0.0' })
console.log(`API đang chạy: http://localhost:${cfg.port} · dữ liệu: ${cfg.dataDir} · env: ${cfg.env}`)
void ctx
