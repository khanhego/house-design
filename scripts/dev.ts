import { spawn } from 'node:child_process'

/** `npm run dev`: API (8787, tự seed lần đầu) + Vite (5173, proxy /api /files). */
const run = (cmd: string, args: string[], name: string) => {
  const p = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '1' } })
  p.on('exit', (code) => {
    console.log(`[${name}] thoát (${code})`)
    process.exit(code ?? 0)
  })
  return p
}

const seed = spawn('npm', ['run', 'seed', '-w', 'apps/api'], { stdio: 'inherit' })
seed.on('exit', () => {
  const api = run('npm', ['run', 'dev', '-w', 'apps/api'], 'api')
  const web = run('npm', ['run', 'dev', '-w', 'apps/web'], 'web')
  const stop = () => (api.kill(), web.kill())
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
})
