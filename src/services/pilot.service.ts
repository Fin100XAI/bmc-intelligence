import { assertAccess, ServiceError } from './client'
import type { User } from '@/types/organisation'

/**
 * src/services/pilot.service.ts
 *
 * The one exception to this codebase's rule that services never contact a
 * real endpoint (see the note at the top of `connector.service.ts`, and the
 * "Swapping in a real backend" recipe at the foot of `client.ts`). This
 * module talks to `scripts/pilot-api-plugin.ts`, a small dev-server-only
 * backend registered in `vite.config.ts` - real, but deliberately narrow:
 * one connector (a property/revenue CSV export), one file on disk, no
 * database. It exists to make a specific claim demonstrable rather than
 * merely asserted: that this platform can ingest a genuine export from a
 * system BMC already runs, not only ever read its own deterministic demo
 * data. It is not wired into the production build - the plugin only
 * registers `configureServer` middleware, which `vite build` never runs.
 */

export interface PilotDataset {
  uploadedAt: string
  sourceFilename: string
  columns: string[]
  rows: Array<Record<string, string>>
}

const ENDPOINT = '/api/pilot/revenue'

function accessContext(): { departmentId: string; domain: 'revenue'; classification: 'internal' } {
  return { departmentId: 'dept-assessment', domain: 'revenue', classification: 'internal' }
}

function meta(): { resourceType: string; resourceId: string; resourceLabel: string } {
  return { resourceType: 'PilotConnector', resourceId: 'pilot-revenue-csv', resourceLabel: 'Pilot revenue CSV ingestion' }
}

async function parseResponse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as T | { error?: string } | null
  if (!res.ok) {
    const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : undefined
    throw new ServiceError('invalid', detail ?? `Pilot ingestion request failed (${res.status}).`)
  }
  return body as T
}

/** The currently ingested pilot dataset, or `null` if nothing has been uploaded. */
async function get(user: User | null): Promise<PilotDataset | null> {
  assertAccess(user, 'connector', 'view', accessContext(), meta())
  let res: Response
  try {
    res = await fetch(ENDPOINT)
  } catch {
    // The pilot API is dev-server-only middleware; a production build (or
    // `vite preview`) has no backend at this path, so absence of the route
    // reads as "no pilot data available" rather than as an application error.
    return null
  }
  if (res.status === 404) return null
  return parseResponse<PilotDataset | null>(res)
}

/** Uploads a CSV export, replacing any previously ingested pilot dataset. */
async function upload(user: User | null, filename: string, content: string): Promise<PilotDataset> {
  assertAccess(user, 'connector', 'administer', accessContext(), meta())
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, content }),
  })
  return parseResponse<PilotDataset>(res)
}

/** Clears the ingested pilot dataset, reverting the connector to unconfigured. */
async function clear(user: User | null): Promise<void> {
  assertAccess(user, 'connector', 'administer', accessContext(), meta())
  const res = await fetch(ENDPOINT, { method: 'DELETE' })
  await parseResponse<{ ok: true }>(res)
}

export const pilotService = {
  get,
  upload,
  clear,
}
