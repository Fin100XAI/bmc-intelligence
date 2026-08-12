import { PROPERTY_SEGMENTS, REVENUE_RECORDS, revenueTotals as cityRevenueTotals } from '@/data/finance.data'
import { filterByScope } from '@/security/access'
import type { ConfidenceLevel, OperationalState, Paged, Severity } from '@/types/common'
import type { PropertySegment, RevenueAnomaly, RevenueRecord, RevenueStream } from '@/types/finance'
import type { User } from '@/types/organisation'
import { ServiceError, assertAccess, deepClone, paginate, recordAudit, scopeToTenant, simulateLatency } from './client'
import { emitChange, getCollection, setCollection } from './store'
import { t } from '@/i18n'

/**
 * src/services/revenue.service.ts
 *
 * Revenue and property intelligence. Anomalies are read from the mutable
 * `revenueAnomalies` store collection (not the `REVENUE_ANOMALIES` seed)
 * because `updateAnomalyStatus` persists a reconciliation status change for
 * the session. Neither `RevenueRecord` nor `RevenueAnomaly` carries a
 * per-record `classification` field in the domain model, so access is
 * gated on `resource: 'revenue'` (there is no dedicated `'property'`
 * `ResourceType`) plus ward and domain scope.
 */

export interface RevenueRecordFilters {
  stream?: RevenueStream[]
  wardId?: string
  state?: OperationalState[]
  page?: number
  pageSize?: number
}

export interface RevenueAnomalyFilters {
  stream?: RevenueStream[]
  wardId?: string
  status?: Array<RevenueAnomaly['status']>
  severity?: Severity[]
  confidence?: ConfidenceLevel[]
  page?: number
  pageSize?: number
}

function matchesRecordFilters(record: RevenueRecord, filters: RevenueRecordFilters): boolean {
  if (filters.stream && filters.stream.length > 0 && !filters.stream.includes(record.stream)) return false
  if (filters.wardId && record.wardId !== filters.wardId) return false
  if (filters.state && filters.state.length > 0 && !filters.state.includes(record.state)) return false
  return true
}

function matchesAnomalyFilters(anomaly: RevenueAnomaly, filters: RevenueAnomalyFilters): boolean {
  if (filters.stream && filters.stream.length > 0 && !filters.stream.includes(anomaly.stream)) return false
  if (filters.wardId && anomaly.wardId !== filters.wardId) return false
  if (filters.status && filters.status.length > 0 && !filters.status.includes(anomaly.status)) return false
  if (filters.severity && filters.severity.length > 0 && !filters.severity.includes(anomaly.severity)) return false
  if (filters.confidence && filters.confidence.length > 0 && !filters.confidence.includes(anomaly.confidence)) return false
  return true
}

function findAnomalyOrThrow(user: User | null, id: string): RevenueAnomaly {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const anomaly = getCollection('revenueAnomalies').find((a) => a.id === id && a.tenantId === user.tenantId)
  if (!anomaly) throw new ServiceError('not-found', `Revenue anomaly "${id}" was not found.`)
  return anomaly
}

async function records(user: User | null, filters: RevenueRecordFilters = {}): Promise<Paged<RevenueRecord>> {
  await simulateLatency(`revenue.records:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, REVENUE_RECORDS)
  const visible = filterByScope(user, scoped, (r) => ({ wardId: r.wardId, domain: 'revenue' }), 'revenue')
  const filtered = visible.filter((r) => matchesRecordFilters(r, filters))
  const sorted = [...filtered].sort((a, b) => a.targetVariancePct - b.targetVariancePct)
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 30)
  return { ...page, items: deepClone(page.items) }
}

async function totals(user: User | null): Promise<ReturnType<typeof cityRevenueTotals>> {
  await simulateLatency('revenue.totals')
  assertAccess(user, 'revenue', 'view', { domain: 'revenue' }, {
    resourceType: 'Revenue',
    resourceId: 'city-totals',
    resourceLabel: 'City-wide revenue totals',
  })
  return deepClone(cityRevenueTotals())
}

async function anomalies(user: User | null, filters: RevenueAnomalyFilters = {}): Promise<Paged<RevenueAnomaly>> {
  await simulateLatency(`revenue.anomalies:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, getCollection('revenueAnomalies'))
  const visible = filterByScope(user, scoped, (a) => ({ wardId: a.wardId, domain: 'revenue' }), 'revenue')
  const filtered = visible.filter((a) => matchesAnomalyFilters(a, filters))
  const sorted = [...filtered].sort((a, b) => b.indicativeValueCrore - a.indicativeValueCrore)
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 20)
  return { ...page, items: deepClone(page.items) }
}

async function propertySegments(user: User | null, wardId?: string): Promise<PropertySegment[]> {
  await simulateLatency(`revenue.propertySegments:${wardId ?? 'all'}`)
  const scoped = scopeToTenant(user, wardId ? PROPERTY_SEGMENTS.filter((s) => s.wardId === wardId) : PROPERTY_SEGMENTS)
  const visible = filterByScope(user, scoped, (s) => ({ wardId: s.wardId, domain: 'property' }), 'revenue')
  return deepClone(visible)
}

async function updateAnomalyStatus(
  user: User | null,
  id: string,
  status: RevenueAnomaly['status'],
  reason: string,
): Promise<RevenueAnomaly> {
  await simulateLatency(`revenue.updateAnomalyStatus:${id}`)
  const anomaly = findAnomalyOrThrow(user, id)
  const authed = assertAccess(user, 'revenue', 'edit', { wardId: anomaly.wardId, domain: 'revenue' }, {
    resourceType: 'Revenue Anomaly',
    resourceId: anomaly.id,
    resourceLabel: anomaly.title,
  })
  const updated: RevenueAnomaly = { ...anomaly, status, ownerId: anomaly.ownerId ?? authed.id }
  setCollection('revenueAnomalies', getCollection('revenueAnomalies').map((a) => (a.id === updated.id ? updated : a)))
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Revenue Anomaly',
    resourceId: anomaly.id,
    resourceLabel: anomaly.title,
    classification: 'restricted',
    outcome: 'success',
    reason,
    detail: t('Status changed to "{0}".', status),
  })
  emitChange()
  return deepClone(updated)
}

export const revenueService = {
  records,
  totals,
  anomalies,
  propertySegments,
  updateAnomalyStatus,
}
