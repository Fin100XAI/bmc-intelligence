import { municipality } from '@/config/municipality.config'
import { referencePrefix } from '@/data/naming'
import { WARD_BY_ID, wardName } from '@/data/reference'
import { filterByScope } from '@/security/access'
import type { AccessContext } from '@/security/model'
import type { ConfidenceLevel, IntelligenceDomain, IsoDateTime, Paged, Severity } from '@/types/common'
import type { IntelligenceItem, IntelligenceStatus, IntelligenceType } from '@/types/intelligence'
import type { DecisionCase, Incident } from '@/types/operations'
import type { User } from '@/types/organisation'
import { isoDaysFromAnchor, isoFromAnchor } from '@/utils/deterministic'
import { findTransition } from '@/workflows/engine'
import { intelligenceWorkflow } from '@/workflows/machines'
import { ServiceError, assertAccess, deepClone, paginate, recordAudit, scopeToTenant, simulateLatency } from './client'
import { emitChange, getCollection, setCollection } from './store'
import { t } from '@/i18n'

/**
 * src/services/intelligence.service.ts
 *
 * The intelligence feed - the head of the evidence → metric → intelligence
 * → recommendation → human decision → action → outcome chain. Every read
 * scopes by ward/department/domain/classification through `canAccess` /
 * `filterByScope`; every workflow transition validates against
 * `intelligenceWorkflow` in `src/workflows/machines.ts` before mutating.
 */

export interface IntelligenceFilters {
  severity?: Severity[]
  wardId?: string
  departmentId?: string
  domain?: IntelligenceDomain
  status?: IntelligenceStatus[]
  confidence?: ConfidenceLevel[]
  type?: IntelligenceType[]
  dateFrom?: IsoDateTime
  dateTo?: IsoDateTime
  search?: string
  page?: number
  pageSize?: number
}

export interface IntelligenceFeedCounts {
  total: number
  bySeverity: Record<Severity, number>
  byStatus: Record<IntelligenceStatus, number>
  unassigned: number
}

function contextFor(item: IntelligenceItem): AccessContext {
  return { wardIds: item.wardIds, departmentId: item.departmentId, domain: item.domain, classification: item.classification }
}

function meta(item: IntelligenceItem): { resourceType: string; resourceId: string; resourceLabel: string } {
  return { resourceType: 'Intelligence', resourceId: item.id, resourceLabel: item.title }
}

function findOrThrow(user: User | null, id: string): IntelligenceItem {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const item = getCollection('intelligence').find((i) => i.id === id && i.tenantId === user.tenantId)
  if (!item) throw new ServiceError('not-found', `Intelligence item "${id}" was not found.`)
  return item
}

function persist(updated: IntelligenceItem): void {
  setCollection('intelligence', getCollection('intelligence').map((i) => (i.id === updated.id ? updated : i)))
}

function matchesFilters(item: IntelligenceItem, filters: IntelligenceFilters): boolean {
  if (filters.severity && filters.severity.length > 0 && !filters.severity.includes(item.severity)) return false
  if (filters.wardId && !item.wardIds.includes(filters.wardId)) return false
  if (filters.departmentId && item.departmentId !== filters.departmentId) return false
  if (filters.domain && item.domain !== filters.domain) return false
  if (filters.status && filters.status.length > 0 && !filters.status.includes(item.status)) return false
  if (filters.confidence && filters.confidence.length > 0 && !filters.confidence.includes(item.confidence)) return false
  if (filters.type && filters.type.length > 0 && !filters.type.includes(item.type)) return false
  if (filters.dateFrom && item.createdAt < filters.dateFrom) return false
  if (filters.dateTo && item.createdAt > filters.dateTo) return false
  if (filters.search) {
    const q = filters.search.toLowerCase()
    if (!item.title.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) return false
  }
  return true
}

async function list(user: User | null, filters: IntelligenceFilters = {}): Promise<Paged<IntelligenceItem>> {
  await simulateLatency(`intelligence.list:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, getCollection('intelligence'))
  const visible = filterByScope(user, scoped, contextFor, 'intelligence')
  const filtered = visible.filter((item) => matchesFilters(item, filters))
  const sorted = [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 20)
  return { ...page, items: deepClone(page.items) }
}

async function get(user: User | null, id: string): Promise<IntelligenceItem> {
  await simulateLatency(`intelligence.get:${id}`)
  const item = findOrThrow(user, id)
  assertAccess(user, 'intelligence', 'view', contextFor(item), meta(item))
  return deepClone(item)
}

async function transition(
  user: User | null,
  id: string,
  to: IntelligenceStatus,
  reason?: string,
): Promise<IntelligenceItem> {
  await simulateLatency(`intelligence.transition:${id}:${to}`)
  const item = findOrThrow(user, id)
  const definition = findTransition(intelligenceWorkflow, item.status, to)
  if (!definition) {
    throw new ServiceError(
      'invalid',
      `No transition from "${item.status}" to "${to}" is defined for the intelligence workflow.`,
    )
  }
  if (definition.requiresReason && !reason) {
    throw new ServiceError('invalid', `A reason is required to ${definition.label.toLowerCase()}.`)
  }
  const authed = assertAccess(user, definition.requires.resource, definition.requires.action, contextFor(item), meta(item))
  const updated: IntelligenceItem = { ...item, status: to, updatedAt: isoFromAnchor(0) }
  persist(updated)
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Intelligence',
    resourceId: item.id,
    resourceLabel: item.title,
    classification: item.classification,
    outcome: 'success',
    reason,
    detail: `${definition.label}: ${item.status} → ${to}.`,
  })
  emitChange()
  return deepClone(updated)
}

async function assign(user: User | null, id: string, ownerId: string, reason?: string): Promise<IntelligenceItem> {
  await simulateLatency(`intelligence.assign:${id}`)
  const item = findOrThrow(user, id)
  const definition = findTransition(intelligenceWorkflow, item.status, 'assigned')
  if (definition?.requiresReason && !reason) {
    throw new ServiceError('invalid', 'A reason is required to reassign this item.')
  }
  const authed = assertAccess(user, 'intelligence', 'assign', contextFor(item), meta(item))
  const updated: IntelligenceItem = {
    ...item,
    ownerId,
    status: definition ? 'assigned' : item.status,
    updatedAt: isoFromAnchor(0),
  }
  persist(updated)
  recordAudit(authed, {
    action: 'assign',
    resourceType: 'Intelligence',
    resourceId: item.id,
    resourceLabel: item.title,
    classification: item.classification,
    outcome: 'success',
    reason,
    detail: t('Assigned to {0}.', ownerId),
  })
  emitChange()
  return deepClone(updated)
}

async function createDecisionFrom(user: User | null, id: string): Promise<DecisionCase> {
  await simulateLatency(`intelligence.createDecisionFrom:${id}`, 220, 560)
  const item = findOrThrow(user, id)
  const authed = assertAccess(user, 'decision', 'create', contextFor(item), meta(item))

  const decisions = getCollection('decisions')
  const seq = decisions.length + 1
  const newCase: DecisionCase = {
    id: `dc-live-${String(seq).padStart(4, '0')}`,
    tenantId: authed.tenantId,
    reference: `DC-LIVE-${String(seq).padStart(4, '0')}`,
    title: t('Decision case: {0}', item.title),
    problemStatement: item.description,
    background: item.explanation,
    sourceIntelligenceIds: [item.id],
    evidenceIds: item.evidenceIds,
    alternatives: [],
    risks: [],
    financialImpactCrore: 0,
    geographicImpact: item.wardIds.map((w) => wardName(w)),
    citizenImpact: item.citizensAffected
      ? `Approximately ${item.citizensAffected.toLocaleString('en-IN')} residents estimated within the affected area.`
      : 'Citizen impact not yet estimated.',
    departmentIds: [item.departmentId],
    wardIds: item.wardIds,
    domain: item.domain,
    recommendationSummary: item.recommendedActions[0]?.title ?? 'Recommendation pending analyst input.',
    ownerId: authed.id,
    approvals: [],
    dueDate: isoDaysFromAnchor(14),
    actionIds: [],
    status: 'draft',
    severity: item.severity,
    classification: item.classification,
    createdAt: isoFromAnchor(0),
    updatedAt: isoFromAnchor(0),
    createdBy: authed.id,
  }
  setCollection('decisions', [newCase, ...decisions])

  persist({ ...item, decisionCaseId: newCase.id, updatedAt: isoFromAnchor(0) })

  recordAudit(authed, {
    action: 'create-decision',
    resourceType: 'Decision Case',
    resourceId: newCase.id,
    resourceLabel: newCase.title,
    classification: newCase.classification,
    outcome: 'success',
    detail: t('Raised from intelligence item {0}.', item.id),
  })
  emitChange()
  return deepClone(newCase)
}

async function createIncidentFrom(user: User | null, id: string): Promise<Incident> {
  await simulateLatency(`intelligence.createIncidentFrom:${id}`, 220, 560)
  const item = findOrThrow(user, id)
  const authed = assertAccess(user, 'incident', 'create', contextFor(item), meta(item))

  const incidents = getCollection('incidents')
  const seq = incidents.length + 1
  const wardId = item.wardIds[0] ?? ''
  const ward = WARD_BY_ID.get(wardId)

  const newIncident: Incident = {
    id: `inc-live-${String(seq).padStart(4, '0')}`,
    tenantId: authed.tenantId,
    reference: `${referencePrefix('INC')}/LIVE/${String(seq).padStart(4, '0')}`,
    title: item.title,
    description: item.description,
    type: 'infrastructure-failure',
    severity: item.severity,
    status: 'detected',
    wardId,
    locationName: ward ? wardName(wardId) : 'Location pending confirmation',
    location: ward?.centroid ?? { ...municipality.mapConfiguration.centre },
    affectedPopulation: item.citizensAffected ?? 0,
    affectedAreaSqKm: 0,
    responseTeams: [],
    timeline: [
      {
        id: `inc-live-${seq}-tl-1`,
        at: isoFromAnchor(0),
        actor: authed.name,
        title: t('Incident raised from intelligence'),
        detail: t('Raised from intelligence item {0}: {1}.', item.id, item.title),
        kind: 'detection',
      },
    ],
    evidenceIds: item.evidenceIds,
    notes: [],
    decisionCaseIds: [],
    actionIds: [],
    ownerId: authed.id,
    departmentId: item.departmentId,
    detectedAt: isoFromAnchor(0),
    updatedAt: isoFromAnchor(0),
    roadsImpacted: [],
    hospitalsImpacted: [],
    classification: item.classification,
    confidence: item.confidence,
  }
  setCollection('incidents', [newIncident, ...incidents])

  persist({ ...item, incidentId: newIncident.id, updatedAt: isoFromAnchor(0) })

  recordAudit(authed, {
    action: 'create-incident',
    resourceType: 'Incident',
    resourceId: newIncident.id,
    resourceLabel: newIncident.title,
    classification: newIncident.classification,
    outcome: 'success',
    detail: t('Raised from intelligence item {0}.', item.id),
  })
  emitChange()
  return deepClone(newIncident)
}

async function feedCounts(user: User | null): Promise<IntelligenceFeedCounts> {
  await simulateLatency('intelligence.feedCounts')
  const scoped = scopeToTenant(user, getCollection('intelligence'))
  const visible = filterByScope(user, scoped, contextFor, 'intelligence')
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  const byStatus: Record<IntelligenceStatus, number> = {
    new: 0,
    reviewed: 0,
    assigned: 0,
    'in-progress': 0,
    resolved: 0,
    verified: 0,
    closed: 0,
  }
  let unassigned = 0
  for (const item of visible) {
    bySeverity[item.severity] += 1
    byStatus[item.status] += 1
    if (!item.ownerId) unassigned += 1
  }
  return deepClone({ total: visible.length, bySeverity, byStatus, unassigned })
}

export const intelligenceService = {
  list,
  get,
  transition,
  assign,
  createDecisionFrom,
  createIncidentFrom,
  feedCounts,
}
