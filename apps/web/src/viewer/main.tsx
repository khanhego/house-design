import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/tokens.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p style={{ padding: 24 }}>Đang tải…</p>
  </StrictMode>,
)
