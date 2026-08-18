import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/app/App'
import { setNarrator } from '@/ai/narrator'
import { narrate } from '@/services/copilot.service'
import { USER_BY_ID } from '@/auth/demo-users'
import { useAuthStore } from '@/stores/auth.store'
import { hydrateStore } from '@/services/store'
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

/**
 * Restores persisted alert, incident, decision and audit state before the
 * store's first access - see `hydrateStore` in `src/services/store.ts`. Only
 * relevant when a session is already persisted (a returning visitor
 * reloading mid-session): a fresh, signed-out visitor has nothing to
 * hydrate, so this resolves immediately and adds no delay to the common
 * first-visit path. Raced against a short timeout so an unreachable or
 * missing dev-only persistence plugin (e.g. a production build) never
 * blocks startup - the app renders against the deterministic seed exactly
 * as it always has.
 */
async function hydrateBeforeFirstRender(): Promise<void> {
  const { userId } = useAuthStore.getState()
  const user = userId ? USER_BY_ID.get(userId) : null
  if (!user) return
  await Promise.race([hydrateStore(user.tenantId), new Promise<void>((resolve) => setTimeout(resolve, 800))])
}

await hydrateBeforeFirstRender()

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
