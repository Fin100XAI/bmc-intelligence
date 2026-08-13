import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/app/App'
import { setNarrator } from '@/ai/narrator'
import { narrate } from '@/services/copilot.service'
import '@/styles/index.css'

/**
 * Install the model narrator.
 *
 * Done here, in the browser entry point, rather than inside the AI layer:
 * `src/ai/*` is also loaded by the API server and by the Node smoke harnesses,
 * and it must stay free of anything that needs a browser. See
 * `src/ai/narrator.ts` for why the indirection exists.
 *
 * `narrate` is itself a no-op when no API base URL is configured, so this call
 * is safe in every deployment — including the pure demonstration one, where it
 * changes nothing.
 */
setNarrator(narrate)

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root container not found. The application cannot start.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
