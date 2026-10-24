import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/** Dev: /v/* → viewer.html, /portal/* và /studio/* → app.html (production do Fastify làm, 02a routes/web.ts). */
const spaFallback = (): Plugin => ({
  name: 'hd-spa-fallback',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url ?? '/'
      const path = url.split('?')[0]
      if (path === '/' ) req.url = '/app.html'
      else if (path === '/v' || path.startsWith('/v/')) req.url = '/viewer.html' + url.slice(path.length)
      else if (/^\/(portal|studio)(\/|$)/.test(path)) req.url = '/app.html' + url.slice(path.length)
      next()
    })
  },
})

export default defineConfig({
  plugins: [react(), spaFallback()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/files': 'http://localhost:8787',
    },
  },
  build: {
    rollupOptions: {
      input: {
        viewer: resolve(import.meta.dirname, 'viewer.html'),
        app: resolve(import.meta.dirname, 'app.html'),
      },
    },
    chunkSizeWarningLimit: 1500,
  },
})
