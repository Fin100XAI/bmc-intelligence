import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/app/App'
import '@/styles/index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root container not found. The application cannot start.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
