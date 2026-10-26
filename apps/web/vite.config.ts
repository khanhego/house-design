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
  // bản demo tĩnh trên GitHub Pages chạy dưới /<tên repo>/ (VITE_BASE); máy chủ thật chạy ở gốc
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), spaFallback()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/files': 'http://localhost:8787',
    },
  },
  // tối ưu sẵn mọi dependency lúc khởi động — tránh Vite gói muộn tạo bản React thứ hai (lỗi hook null ở dev)
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-dom/client', 'react-router', '@tanstack/react-query', 'zustand', 'three',
      '@react-three/fiber', '@react-three/drei', 'qrcode', 'jspdf', 'svg2pdf.js', 'pdfjs-dist',
    ],
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
