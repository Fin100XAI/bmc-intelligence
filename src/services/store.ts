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

function seedStore(): StoreShape {
  return {
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
