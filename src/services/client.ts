import { canAccess } from '@/security/access'
import type { AccessContext, ActionType, ResourceType } from '@/security/model'
import type { Paged } from '@/types/common'
import type { AuditEvent } from '@/types/governance'
import type { User } from '@/types/organisation'
import { det, isoFromAnchor } from '@/utils/deterministic'
import { appendAudit } from './store'

/**
 * src/services/client.ts
 *
 * The transport seam.
 *
 * This module - together with `store.ts` and the individual
 * `*.service.ts` files - is the ONLY place in the application that knows
 * the backend is a deterministic, in-memory demonstration. Every hook,
 * component, and route imports service objects from `src/services/index.ts`
 * and calls their methods; nothing above this layer imports `src/data/*` or
 * `src/workflows/*` directly. That import discipline is what makes the seam
 * real: replace the body of the methods below and everything above keeps
 * working unmodified.
 */

/** ---------------------------------------------------------------------
 * Request plumbing
 * ------------------------------------------------------------------- */

/**
 * Passed by callers into service methods that support cancellation. In the
 * demonstration transport it is accepted where relevant but not consulted;
 * once a real adapter lands, `signal` threads straight through to
 * `fetch`/the GraphQL client/the subscription teardown so TanStack Query
 * cancellation keeps working without any hook rewrite.
 */
export interface ServiceRequestOptions {
  signal?: AbortSignal
}

/**
 * The single flag every "Demonstration Environment" badge in the interface
 * keys off, and the value every service object re-exports itself against.
 * A real deployment sets this literal to something else (e.g.
 * `'production'`) and every demonstration-only affordance disappears at the
 * type level rather than by a runtime string comparison scattered through
 * the component tree.
 */
export const TRANSPORT_MODE = 'demonstration' as const

/**
 * Deterministic, seeded network-latency simulation. Every service method
 * awaits this before doing anything else, so the interface always exercises
 * its loading states - and because the delay is seeded (never
 * `Math.random()`), repeated calls with the same seed produce the same
 * delay, keeping the demonstration environment reproducible end to end.
 */
export async function simulateLatency(seed: string, min = 120, max = 420): Promise<void> {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const delayMs = det(`latency:${seed}`).int(lo, hi)
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

/** ---------------------------------------------------------------------
 * Errors
 * ------------------------------------------------------------------- */

export type ServiceErrorCode = 'not-found' | 'forbidden' | 'invalid' | 'unavailable'

const DEFAULT_SERVICE_ERROR_DETAIL: Record<ServiceErrorCode, string> = {
  'not-found': 'The requested record could not be found.',
  forbidden: 'Access to this record or action is not permitted for the current principal.',
  invalid: 'The request could not be processed as submitted.',
  unavailable: 'The service is temporarily unavailable.',
}

/**
 * The one error type every service throws. Hooks and error boundaries key
 * off `code`, never off a transport-specific status (HTTP status code,
 * GraphQL error extension, WebSocket close code) - that translation happens
 * once, inside the real adapter, at the point this seam is replaced.
 */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode
  readonly detail: string

  constructor(code: ServiceErrorCode, detail?: string) {
    const resolvedDetail = detail ?? DEFAULT_SERVICE_ERROR_DETAIL[code]
    super(resolvedDetail)
    this.name = 'ServiceError'
    this.code = code
    this.detail = resolvedDetail
  }
}

/** ---------------------------------------------------------------------
 * Pagination
 * ------------------------------------------------------------------- */

/** Slices `items` into the `Paged<T>` envelope every list-style method returns. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): Paged<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize) || 1)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / safePageSize))
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages)
  const start = (safePage - 1) * safePageSize
  return {
    items: items.slice(start, start + safePageSize),
    total,
    page: safePage,
    pageSize: safePageSize,
  }
}

/** ---------------------------------------------------------------------
 * Multi-tenant isolation
 * ------------------------------------------------------------------- */

/**
 * The single choke point for tenant isolation. Every demonstration record
 * carries a `tenantId`; every service method runs its source collection
 * through this before anything else - before ABAC, before pagination - so
 * that a principal from one municipal tenant can never see another
 * tenant's records. In this build every seed record shares the tenant
 * configured in `src/config/municipality.config.ts` ('bmc'), so the filter
 * is a no-op today. A second tenant's data would be silently excluded here,
 * not left to each screen (or each service method) to remember.
 */
export function scopeToTenant<T extends { tenantId: string }>(user: User | null, items: readonly T[]): T[] {
  if (!user) return []
  return items.filter((item) => item.tenantId === user.tenantId)
}

/** ---------------------------------------------------------------------
 * Defensive cloning
 * ------------------------------------------------------------------- */

/**
 * Every value that leaves a service method is passed through this first, so
 * callers receive a value - never a live reference into the in-session
 * store or a `src/data/*` seed module. A component holding a returned
 * record and mutating it directly can never corrupt platform state.
 */
export function deepClone<T>(value: T): T {
  return structuredClone(value)
}

/** ---------------------------------------------------------------------
 * Access control + audit
 * ------------------------------------------------------------------- */

/** Placeholder only - no real network identifier is ever recorded, in
 * keeping with every other audit-shaped record in this demonstration. */
export const DEMO_SOURCE_IP_PLACEHOLDER = '••••:••••:••••::•• (not recorded in demonstration)'

/** A session identifier stable for the lifetime of a signed-in demo user. */
export function demoSessionId(userId: string): string {
  return `sess-${det(`session:${userId}`).int(100000, 999999)}`
}

/**
 * Records an audit event on behalf of an authenticated principal, filling
 * in the fields every event shares (`tenantId`, `actorId`, `actorName`,
 * `actorRole`, `sourceIpPlaceholder`, `sessionId`, `at`) so individual
 * service methods only ever have to state what happened. Every mutating
 * method in every service calls this exactly once, at the point the
 * mutation succeeds - and `assertAccess` below calls it once more, with
 * `outcome: 'denied'`, at the point a mutation is refused.
 */
export function recordAudit(
  user: User,
  event: Omit<
    AuditEvent,
    'id' | 'tenantId' | 'actorId' | 'actorName' | 'actorRole' | 'sourceIpPlaceholder' | 'sessionId' | 'at'
  > &
    Partial<Pick<AuditEvent, 'at'>>,
): AuditEvent {
  return appendAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    actorName: user.name,
    actorRole: user.roleId,
    sourceIpPlaceholder: DEMO_SOURCE_IP_PLACEHOLDER,
    sessionId: demoSessionId(user.id),
    at: isoFromAnchor(0),
    ...event,
  })
}

/**
 * The single enforcement point every mutating method - and every read of a
 * single sensitive record - calls before touching the store. Evaluates
 * `canAccess`; when denied, records an `access-denied` audit event (so the
 * denial itself is part of the permanent record, not just a rejected
 * promise) and throws `ServiceError('forbidden')` carrying the same
 * institutional reason that would be shown to the principal. Returns the
 * narrowed, non-null `User` on success so call sites do not need a second
 * null check.
 */
export function assertAccess(
  user: User | null,
  resource: ResourceType,
  action: ActionType,
  context: AccessContext,
  resourceMeta: { resourceType: string; resourceId: string; resourceLabel: string },
): User {
  if (!user) {
    throw new ServiceError('forbidden', 'No authenticated principal.')
  }
  const decision = canAccess(user, resource, action, context)
  if (!decision.allowed) {
    recordAudit(user, {
      action: 'access-denied',
      resourceType: resourceMeta.resourceType,
      resourceId: resourceMeta.resourceId,
      resourceLabel: resourceMeta.resourceLabel,
      classification: context.classification ?? 'internal',
      outcome: 'denied',
      detail: decision.reason,
    })
    throw new ServiceError('forbidden', decision.reason)
  }
  return user
}

/** ---------------------------------------------------------------------
 * Swapping in a real backend
 * ---------------------------------------------------------------------
 *
 * Every consumer in this application - hooks, components, workflow screens
 * - talks to the service objects exported from `src/services/index.ts`,
 * never to `src/data/*` or `src/workflows/*` directly. That is the seam. To
 * move this platform onto a real backend, only the *implementation* of the
 * methods on those service objects changes; their signatures, return types
 * and the errors they throw must stay identical so that nothing above this
 * layer needs to change.
 *
 * Recipe, by transport:
 *
 *  - REST / GraphQL (most service methods):
 *      Replace the body of each method with a `fetch`/GraphQL client call.
 *      `ServiceRequestOptions.signal` is designed to be threaded through
 *      every method so TanStack Query cancellation continues to work
 *      unmodified - pass it straight to `fetch(url, { signal })`.
 *      `simulateLatency` disappears; latency becomes real network latency.
 *      `paginate` disappears; pagination becomes a query parameter and the
 *      server returns the `Paged<T>` envelope directly.
 *
 *  - WebSocket / Server-Sent Events (alert.service, notification.service,
 *    the Situation Room feed, security.service events):
 *      Replace `subscribe`/`emitChange` in `store.ts` with a socket or
 *      `EventSource` listener that calls the *same* `emitChange()` -
 *      TanStack Query invalidation on the hook side is transport-agnostic
 *      and does not change. `list`/`get` keep a REST fallback for the
 *      initial page load; the socket only pushes invalidation signals.
 *
 *  - GIS (ward polygons, asset/incident/waterlogging locations):
 *      `ward.service`, `water.service`, `monsoon.service`, `roads.service`
 *      and others currently return illustrative `GeoPoint` and polygon
 *      fields sourced from `src/data/geography.ts`. Point those fields at a
 *      GIS service (WFS/WMS/vector tiles) response instead; the domain
 *      types (`GeoPoint`, `polygon: Array<[number, number]>`) already ARE
 *      the contract hooks and map components render against.
 *
 *  - Event stream / IoT telemetry (water.service, monsoon.service pump and
 *    rainfall readings, platform.service pipeline jobs):
 *      Replace the deterministic generation with a consumer that folds the
 *      latest stream message into the store via `setCollection`, then calls
 *      `emitChange()`. Same seam as WebSocket/SSE above.
 *
 * What must NOT change when a real adapter lands:
 *   - Method names, parameter order and return types on every service
 *     object - the hooks layer is written against these exact signatures.
 *   - The `User | null` first parameter and the `canAccess`/`filterByScope`
 *     enforcement point. Access control moves to the server too, but the
 *     client-side check stays as defence in depth and keeps the interface
 *     honest while a request is in flight.
 *   - `ServiceError` codes (`not-found` | `forbidden` | `invalid` |
 *     `unavailable`) - hooks and error boundaries key off these, not off
 *     HTTP status codes or transport-specific error shapes.
 *   - The audit contract: every mutating call still produces exactly one
 *     audit event, now written by the server rather than by `appendAudit`
 *     in `store.ts`.
 * ------------------------------------------------------------------- */
