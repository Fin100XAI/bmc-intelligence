import { onAfterRebuild } from '@/data/runtime'
import { AI_REQUESTS, HUMAN_OVERSIGHT } from '@/data/ai.data'
import { ROAD_DEFECTS } from '@/data/city.data'
import { REVENUE_ANOMALIES } from '@/data/finance.data'
import { AUDIT_EVENTS, SECURITY_EVENTS } from '@/data/governance.data'
import { ALERTS, INTELLIGENCE_ITEMS, NOTIFICATIONS } from '@/data/intelligence.data'
import { ACTION_ITEMS, COMPLAINTS, DECISION_CASES, INCIDENTS } from '@/data/operations.data'
import type { AIRequestRecord, AIResponse, AIUseCase, HumanOversightRecord } from '@/types/ai'
import type { IsoDateTime, Severity, TenantId } from '@/types/common'
import type { RoadDefect } from '@/types/city-domains'
import type { RevenueAnomaly } from '@/types/finance'
import type { AuditEvent, SecurityEvent } from '@/types/governance'
import type { Alert, IntelligenceItem, NotificationItem } from '@/types/intelligence'
import type { ActionItem, Complaint, DecisionCase, Incident } from '@/types/operations'
import type { AssessmentException } from '@/types/revenue-reconciliation'
import { buildAssessmentExceptions } from '@/domains/revenue/reconciliation'

/**
 * src/services/store.ts
 *
 * The mutable in-session store.
 *
 * `src/data/*` modules are immutable seeds - pure functions of their fixed
 * PRNG seed, computed once at module load. Workflow transitions, notes,
 * assignments and newly-created records raised through the service layer
 * must actually persist for the lifetime of the browser session, without
 * ever corrupting those seeds (a page a second tab opens, or a "reset demo"
 * action, must see the original picture again). This module is the small
 * mutable layer that sits between the two: every collection a service
 * mutates lives here, lazily cloned from its seed on first access.
 */

/** A saved AI response - e.g. an executive brief an officer chose to keep
 * for later reference. Populated by `ai.service.ts`. */
export interface SavedBrief {
  id: string
  tenantId: TenantId
  title: string
  useCase: AIUseCase
  response: AIResponse
  savedBy: string
  savedAt: IsoDateTime
}

/** A single entry in the city-wide Situation Room chronological feed -
 * a cross-incident, cross-ward log distinct from any one incident's own
 * `timeline`. Populated by `incident.service.ts`. */
export interface SituationLogEntry {
  id: string
  tenantId: TenantId
  at: IsoDateTime
  actorId: string
  actorName: string
  category: 'incident' | 'weather' | 'resource' | 'decision' | 'note'
  title: string
  detail: string
  severity?: Severity
  wardIds: string[]
  incidentId?: string
}

interface CollectionMap {
  intelligence: IntelligenceItem
  alerts: Alert
  incidents: Incident
  decisions: DecisionCase
  actions: ActionItem
  complaints: Complaint
  notifications: NotificationItem
  auditEvents: AuditEvent
  aiRequests: AIRequestRecord
  humanOversight: HumanOversightRecord
  savedBriefs: SavedBrief
  situationLog: SituationLogEntry
  /**
   * Beyond the collections every consumer touches directly, three more
   * required service methods persist a status change against records that
   * would otherwise be treated as read-only reference data:
   * `revenue.service.updateAnomalyStatus`, `roads.service.updateDefectStatus`
   * and `security.service.updateEventStatus`. They are modelled as their
   * own collections here - cloned from the same seeds - rather than
   * mutating `src/data/*` arrays directly, for exactly the reason every
   * other collection in this file exists: the seeds must stay pure and
   * replayable.
   */
  revenueAnomalies: RevenueAnomaly
  roadDefects: RoadDefect
  securityEvents: SecurityEvent
  /**
   * Assessment review candidates. Unlike every other collection here, these
   * are not cloned from a `src/data/*` array: they are COMPUTED, by joining
   * the four municipal registers in `reconciliation.data.ts` through the
   * matching and rule engine in `domains/revenue/reconciliation.ts`.
   *
   * Seeding them here rather than memoising inside the engine is deliberate.
   * The join is the expensive part of the platform - several thousand records
   * scored against every parcel in their ward - and this collection's
   * lifecycle is exactly the one it needs: built once on first access, rebuilt
   * on a municipal corporation switch (because `resetStore` is registered as
   * an after-rebuild hook), and mutable in between as officers assign, verify,
   * revise and close against it.
   */
  reconciliationExceptions: AssessmentException
}

export type CollectionKey = keyof CollectionMap

type StoreShape = { [K in CollectionKey]: CollectionMap[K][] }

/**
 * Created lazily, on first access, and deep-cloned from the seed arrays at
 * that point - deep enough (via `structuredClone`, over plain
 * JSON-shaped data with no functions, Dates or class instances) that
 * mutating a record inside the store can never reach back into a
 * `src/data/*` module's module-scoped singleton.
 */
let store: StoreShape | null = null

/**
 * The collections `scripts/state-persistence-plugin.ts` (dev-server only)
 * will read and write - the four both most visible in a demonstration and
 * named on `PlatformReadinessPage.tsx` as resetting on reload today: escalated
 * alerts, incident status, decision cases and the audit trail itself (every
 * mutation across every service ultimately calls `appendAudit`, which routes
 * through `setCollection('auditEvents', …)` below - so this one whitelist
 * covers the whole platform's audit trail, not just these four collections'
 * own state).
 */
const PERSISTED_COLLECTIONS = new Set<CollectionKey>(['alerts', 'incidents', 'decisions', 'auditEvents'])

/**
 * Populated by `hydrateStore()` before the store is first built. `seedStore`
 * substitutes a persisted collection wholesale in place of the deterministic
 * clone when one was found - `setCollection` always writes the FULL current
 * array (never a delta), so whatever was last persisted for a collection
 * already reflects every mutation made against it, not just the latest one.
 * An empty persisted array is treated the same as "nothing persisted yet":
 * these collections are never legitimately emptied by the app itself, so
 * emptiness is a reliable signal that hydration found no file, not that the
 * collection was cleared.
 */
let pendingHydration: Partial<StoreShape> | null = null

/**
 * The dev-only persistence plugin is reachable only as a same-origin path
 * under a real browser - `fetch('/api/state/…')` throws `ERR_INVALID_URL` in
 * a bare Node context (the smoke harnesses run application code exactly that
 * way, via Vite's module runner, with no page origin to resolve a relative
 * URL against). Neither `hydrateStore` nor `persistCollectionAsync` attempt
 * the request outside a browser, rather than attempting it and relying on
 * the existing catch/warn to hide the failure - a caught error is still
 * console noise a Node harness has no reason to print.
 */
const inBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined'

/**
 * Fetches whatever this tenant has persisted for each whitelisted collection
 * and stages it for the next `seedStore()` call. Must be awaited (racing a
 * short timeout is the caller's job - see `src/main.tsx`) before the first
 * `getCollection`/`setCollection` call, or it has no effect: the store is
 * built lazily, once, on first access.
 *
 * Failures (dev server not running this plugin, e.g. under `vite preview`,
 * or a production build where `configureServer` never runs at all) are
 * swallowed - the store falls back to the deterministic seed exactly as it
 * always has, so this is additive, never a new way for the app to break.
 */
export async function hydrateStore(tenantId: string): Promise<void> {
  if (!inBrowser) return
  // Built loosely-typed and cast once at the end: a `Partial<StoreShape>`
  // written through a `CollectionKey`-typed loop variable would require each
  // write to satisfy every collection's type at once (an intersection), which
  // defeats the whole point of iterating a small fixed whitelist. The cast is
  // safe because every key written here is one `hydrateStore` itself chose
  // from `PERSISTED_COLLECTIONS`, immediately after fetching that same key.
  const overlay: Record<string, unknown[]> = {}
  await Promise.all(
    Array.from(PERSISTED_COLLECTIONS).map(async (key) => {
      try {
        const res = await fetch(`/api/state/${key}?tenantId=${encodeURIComponent(tenantId)}`)
        if (!res.ok) return
        const { records } = (await res.json()) as { records?: unknown[] }
        if (Array.isArray(records) && records.length > 0) overlay[key] = records
      } catch {
        // No persistence plugin available - fall back to the seed.
      }
    }),
  )
  if (Object.keys(overlay).length > 0) pendingHydration = overlay as Partial<StoreShape>
}

/** Fire-and-forget write-through for a whitelisted collection. Never throws
 * and never blocks the caller - a mutation must always succeed against the
 * in-session store regardless of whether the dev-only persistence plugin is
 * reachable. */
function persistCollectionAsync<K extends CollectionKey>(key: K, items: CollectionMap[K][]): void {
  if (!inBrowser) return
  if (!PERSISTED_COLLECTIONS.has(key)) return
  const tenantId = (items[0] as { tenantId?: string } | undefined)?.tenantId
  if (!tenantId) return // Nothing to scope the write to - and nothing worth persisting.
  fetch(`/api/state/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, records: items }),
  }).catch((err: unknown) => {
    console.warn(`[store] failed to persist "${key}" (continuing with in-session state only):`, err)
  })
}

function seedStore(): StoreShape {
  const seeded: StoreShape = {
    intelligence: structuredClone(INTELLIGENCE_ITEMS),
    alerts: structuredClone(ALERTS),
    incidents: structuredClone(INCIDENTS),
    decisions: structuredClone(DECISION_CASES),
    actions: structuredClone(ACTION_ITEMS),
    complaints: structuredClone(COMPLAINTS),
    notifications: structuredClone(NOTIFICATIONS),
    auditEvents: structuredClone(AUDIT_EVENTS),
    aiRequests: structuredClone(AI_REQUESTS),
    humanOversight: structuredClone(HUMAN_OVERSIGHT),
    savedBriefs: [],
    situationLog: [],
    revenueAnomalies: structuredClone(REVENUE_ANOMALIES),
    roadDefects: structuredClone(ROAD_DEFECTS),
    securityEvents: structuredClone(SECURITY_EVENTS),
    // Computed rather than cloned - see the note on the collection above. The
    // engine already returns freshly-constructed objects, so there is nothing
    // shared with a seed module to clone away from.
    reconciliationExceptions: buildAssessmentExceptions(),
  }
  if (pendingHydration) applyHydrationOverlay(seeded, pendingHydration)
  return seeded
}

/**
 * Written out per-key rather than as a loop over `PERSISTED_COLLECTIONS`:
 * iterating a `Set<CollectionKey>` widens each `key` to the full union, which
 * defeats TypeScript's ability to prove `seeded[key]` and `overlay[key]`
 * agree on which member of the union they are - four keys is little enough
 * that spelling them out is clearer than a generic workaround.
 */
function applyHydrationOverlay(seeded: StoreShape, overlay: Partial<StoreShape>): void {
  if (overlay.alerts) seeded.alerts = overlay.alerts
  if (overlay.incidents) seeded.incidents = overlay.incidents
  if (overlay.decisions) seeded.decisions = overlay.decisions
  if (overlay.auditEvents) seeded.auditEvents = overlay.auditEvents
}

function ensureStore(): StoreShape {
  if (!store) store = seedStore()
  return store
}

/**
 * Drops the in-session store so the next access re-seeds it from whatever the
 * `src/data/*` layers now hold.
 *
 * Called on a municipal corporation switch (`src/data/runtime.ts` rebuilds
 * every seed layer, then this runs). Without it the store would keep serving
 * the previous corporation's incidents, decisions and audit trail against the
 * new corporation's wards - records whose `tenantId` no longer matches the
 * signed-in principal, and whose ward references no longer resolve. Workflow
 * state raised in the previous corporation is deliberately not carried across:
 * a decision case belongs to the corporation that raised it.
 */
export function resetStore(): void {
  store = null
  auditSequence = 0
  // A corporation switch changes the tenant `pendingHydration` was fetched
  // for - carrying it over would apply one corporation's persisted alerts,
  // decisions and audit trail onto another's seed. The demonstration has
  // always reset to a fresh seed on corporation switch; persistence is
  // scoped to the tenant active at boot, not re-fetched mid-session.
  pendingHydration = null
  emitChange()
}

onAfterRebuild(resetStore)

/** Typed accessor for a single in-session collection. Internal to the
 * services layer - callers outside `src/services/*.service.ts` should never
 * need this directly; they call a service method instead. */
export function getCollection<K extends CollectionKey>(key: K): CollectionMap[K][] {
  return ensureStore()[key]
}

/**
 * Replaces a collection wholesale. Callers build a new array
 * (immutable-update style - `map`/`filter`/spread) rather than mutating the
 * array returned by `getCollection` in place, so referential identity
 * changes exactly when the data does and `subscribe` listeners never have
 * to guess whether something changed.
 */
export function setCollection<K extends CollectionKey>(key: K, items: CollectionMap[K][]): void {
  // `StoreShape[K]` is structurally identical to `CollectionMap[K][]`, but TS
  // cannot prove that through a generic mapped-type index - the cast is safe.
  ensureStore()[key] = items as StoreShape[K]
  persistCollectionAsync(key, items)
}

/** ---------------------------------------------------------------------
 * Change notification
 * ------------------------------------------------------------------- */

type Listener = () => void

const listeners = new Set<Listener>()

/**
 * Subscribes to store changes; returns an unsubscribe function. The
 * intended listener body is `queryClient.invalidateQueries(...)` - this
 * module has no opinion on, and no dependency on, TanStack Query itself.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Notifies every subscriber that the store changed. Every service method
 * that mutates a collection calls this exactly once, after the mutation and
 * after the audit event for it has been recorded.
 */
export function emitChange(): void {
  for (const listener of listeners) listener()
}

/** ---------------------------------------------------------------------
 * Audit
 * ------------------------------------------------------------------- */

let auditSequence = 0

/**
 * Assigns a sequential id and prepends the event to the audit collection.
 * This is the only way an audit event enters the store - every mutating
 * service call routes through this, almost always via `recordAudit` in
 * `client.ts`, which fills in the actor and session boilerplate first.
 */
export function appendAudit(event: Omit<AuditEvent, 'id'>): AuditEvent {
  auditSequence += 1
  const withId: AuditEvent = { ...event, id: `aud-live-${String(auditSequence).padStart(5, '0')}` }
  setCollection('auditEvents', [withId, ...getCollection('auditEvents')])
  return withId
}
