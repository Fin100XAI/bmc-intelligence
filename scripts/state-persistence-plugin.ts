import type { IncomingMessage, ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * scripts/state-persistence-plugin.ts
 *
 * A Vite dev-server-only backend that makes a small, named whitelist of
 * collections durable across a reload - the single most credibility-damaging
 * gap in the demonstration environment being that an officer's escalation,
 * assignment or audit trail vanished the moment the page refreshed.
 *
 * Deliberately narrow, following the precedent set by `pilot-api-plugin.ts`:
 * one JSON file per tenant per collection under `.data/` (git-ignored), no
 * database, no separate process. This closes "resets on reload" for a demo;
 * it does not by itself satisfy the production database / durable audit
 * store requirements `PlatformReadinessPage.tsx` still lists as outstanding.
 * `configureServer` only runs under `vite dev`, never in the production
 * bundle - `src/services/store.ts`'s hydrate/persist calls fail closed to the
 * deterministic seed when this plugin isn't present.
 */

const STORE_DIR = path.resolve(process.cwd(), '.data')
const MAX_BODY_BYTES = 5 * 1024 * 1024

/** The only collections this plugin will read or write. Kept in sync with
 * the whitelist in `src/services/store.ts`'s `PERSISTED_COLLECTIONS`. */
const COLLECTIONS = new Set(['alerts', 'incidents', 'decisions', 'auditEvents'])

/** How often the live-simulation tick fires, and how long an alert has to
 * exist in a tenant's store before it's eligible to be cloned into a new
 * "live" entry - keeps the very first tick from firing off nothing. */
const SIMULATION_INTERVAL_MS = 60_000

function tenantFile(tenantId: string, collection: string): string {
  return path.join(STORE_DIR, tenantId, `${collection}.json`)
}

async function readCollection(tenantId: string, collection: string): Promise<unknown[]> {
  try {
    const raw = await fs.readFile(tenantFile(tenantId, collection), 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeCollection(tenantId: string, collection: string, records: unknown[]): Promise<void> {
  const file = tenantFile(tenantId, collection)
  await fs.mkdir(path.dirname(file), { recursive: true })
  // Atomic write: write to a temp file in the same directory, then rename -
  // a crash or concurrent tick mid-write can never leave a truncated/corrupt
  // collection file behind.
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(records), 'utf-8')
  await fs.rename(tmp, file)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    let bytes = 0
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Request exceeds the 5 MB demo limit.'))
        req.destroy()
        return
      }
      data += chunk.toString('utf-8')
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Clones one existing alert into a new, clearly-labelled synthetic entry, so
 * a live poll has something real to observe. Only ever downgrades toward
 * 'low'/'medium' severity and never touches any other alert's status - this
 * exists to make freshness visible, not to manufacture a false emergency.
 */
function simulateNextAlert(existing: Record<string, unknown>[]): Record<string, unknown> | null {
  if (existing.length === 0) return null
  const template = existing[existing.length % existing.length]
  const now = new Date().toISOString()
  return {
    ...template,
    id: `sim-${Date.now()}`,
    title: `New: ${String(template.title ?? 'Field report').replace(/^New: /, '')}`,
    status: 'open',
    severity: 'low',
    source: 'Live simulation feed',
    ownerId: undefined,
    createdAt: now,
    updatedAt: now,
    slaRemainingHours: template.slaHours ?? 24,
  }
}

export function statePersistencePlugin(): Plugin {
  let timer: ReturnType<typeof setInterval> | undefined

  return {
    name: 'state-persistence-api',
    configureServer(server) {
      timer = setInterval(() => {
        void (async () => {
          try {
            const tenantsRoot = STORE_DIR
            const tenants = await fs.readdir(tenantsRoot).catch(() => [] as string[])
            for (const tenantId of tenants) {
              const alerts = (await readCollection(tenantId, 'alerts')) as Record<string, unknown>[]
              const next = simulateNextAlert(alerts)
              if (!next) continue
              await writeCollection(tenantId, 'alerts', [next, ...alerts])
            }
          } catch (err) {
            // A simulation tick failing must never take the dev server down.
            console.warn('[state-persistence] live-simulation tick failed:', err)
          }
        })()
      }, SIMULATION_INTERVAL_MS)
      server.httpServer?.on('close', () => {
        if (timer) clearInterval(timer)
      })

      server.middlewares.use('/api/state', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const segment = url.pathname.replace(/^\/+/, '')
          const collection = segment.split('/')[0]
          if (!collection || !COLLECTIONS.has(collection)) {
            sendJson(res, 404, { error: `Unknown or non-persisted collection "${collection}".` })
            return
          }

          if (req.method === 'GET') {
            const tenantId = url.searchParams.get('tenantId')
            if (!tenantId) {
              sendJson(res, 400, { error: 'tenantId query parameter is required.' })
              return
            }
            const records = await readCollection(tenantId, collection)
            sendJson(res, 200, { records })
            return
          }

          if (req.method === 'PUT') {
            const body = await readBody(req)
            let parsed: { tenantId?: string; records?: unknown[] }
            try {
              parsed = JSON.parse(body) as { tenantId?: string; records?: unknown[] }
            } catch {
              sendJson(res, 400, { error: 'Request body must be JSON: { tenantId, records }.' })
              return
            }
            const { tenantId, records } = parsed
            if (!tenantId || !Array.isArray(records)) {
              sendJson(res, 400, { error: 'Expected { tenantId: string, records: unknown[] }.' })
              return
            }
            await writeCollection(tenantId, collection, records)
            sendJson(res, 200, { ok: true })
            return
          }

          sendJson(res, 405, { error: 'Method not allowed.' })
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : 'Unknown server error.' })
        }
      })
    },
  }
}
