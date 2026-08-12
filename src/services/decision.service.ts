import { wardName } from '@/data/reference'
import { filterByScope } from '@/security/access'
import type { AccessContext } from '@/security/model'
import type { DataClassification, IntelligenceDomain, Paged, Severity } from '@/types/common'
import type { AuditAction } from '@/types/governance'
import type { DecisionAlternative, DecisionCase, DecisionOutcome, DecisionStatus } from '@/types/operations'
import type { User } from '@/types/organisation'
import { isoDaysFromAnchor, isoFromAnchor } from '@/utils/deterministic'
import { findTransition } from '@/workflows/engine'
import { decisionWorkflow } from '@/workflows/machines'
import { ServiceError, assertAccess, deepClone, paginate, recordAudit, scopeToTenant, simulateLatency } from './client'
import { emitChange, getCollection, setCollection } from './store'
import { t } from '@/i18n'

/**
 * src/services/decision.service.ts
 *
 * The Decision Centre - the platform's differentiator. Every decision case
 * carries a named human decision with a recorded rationale; the platform's
 * own comparative analysis (`aiAnalysis`) is always advisory, never
 * dispositive. Status changes validate against `decisionWorkflow`.
 */

export interface DecisionFilters {
  status?: DecisionStatus[]
  domain?: IntelligenceDomain
  departmentId?: string
  wardId?: string
  severity?: Severity[]
  search?: string
  page?: number
  pageSize?: number
}

export interface DecisionCreateInput {
  title: string
  problemStatement: string
  background: string
  domain: IntelligenceDomain
  departmentIds: string[]
  wardIds: string[]
  financialImpactCrore: number
  citizenImpact: string
  recommendationSummary: string
  sourceIntelligenceIds?: string[]
  evidenceIds?: string[]
  alternatives?: DecisionAlternative[]
  risks?: string[]
  dueInDays?: number
  severity: Severity
  classification: DataClassification
}

function contextFor(item: DecisionCase): AccessContext {
  return { wardIds: item.wardIds, departmentIds: item.departmentIds, domain: item.domain, classification: item.classification }
}

function meta(item: DecisionCase): { resourceType: string; resourceId: string; resourceLabel: string } {
  return { resourceType: 'Decision Case', resourceId: item.id, resourceLabel: item.title }
}

function findOrThrow(user: User | null, id: string): DecisionCase {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const item = getCollection('decisions').find((d) => d.id === id && d.tenantId === user.tenantId)
  if (!item) throw new ServiceError('not-found', `Decision case "${id}" was not found.`)
  return item
}

function persist(updated: DecisionCase): void {
  setCollection('decisions', getCollection('decisions').map((d) => (d.id === updated.id ? updated : d)))
}

function auditActionForStatus(to: DecisionStatus): AuditAction {
  if (to === 'approved') return 'approve'
  if (to === 'rejected') return 'reject'
  if (to === 'assigned') return 'assign'
  return 'status-change'
}

function matchesFilters(item: DecisionCase, filters: DecisionFilters): boolean {
  if (filters.status && filters.status.length > 0 && !filters.status.includes(item.status)) return false
  if (filters.domain && item.domain !== filters.domain) return false
  if (filters.departmentId && !item.departmentIds.includes(filters.departmentId)) return false
  if (filters.wardId && !item.wardIds.includes(filters.wardId)) return false
  if (filters.severity && filters.severity.length > 0 && !filters.severity.includes(item.severity)) return false
  if (filters.search) {
    const q = filters.search.toLowerCase()
    if (!item.title.toLowerCase().includes(q) && !item.problemStatement.toLowerCase().includes(q)) return false
  }
  return true
}

async function list(user: User | null, filters: DecisionFilters = {}): Promise<Paged<DecisionCase>> {
  await simulateLatency(`decision.list:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, getCollection('decisions'))
  const visible = filterByScope(user, scoped, contextFor, 'decision')
  const filtered = visible.filter((item) => matchesFilters(item, filters))
  const sorted = [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 20)
  return { ...page, items: deepClone(page.items) }
}

async function get(user: User | null, id: string): Promise<DecisionCase> {
  await simulateLatency(`decision.get:${id}`)
  const item = findOrThrow(user, id)
  assertAccess(user, 'decision', 'view', contextFor(item), meta(item))
  return deepClone(item)
}

async function create(user: User | null, input: DecisionCreateInput): Promise<DecisionCase> {
  await simulateLatency('decision.create', 220, 560)
  const context: AccessContext = {
    wardIds: input.wardIds,
    departmentIds: input.departmentIds,
    domain: input.domain,
    classification: input.classification,
  }
  const authed = assertAccess(user, 'decision', 'create', context, {
    resourceType: 'Decision Case',
    resourceId: 'new',
    resourceLabel: input.title,
  })
  const decisions = getCollection('decisions')
  const seq = decisions.length + 1
  const newCase: DecisionCase = {
    id: `dc-live-${String(seq).padStart(4, '0')}`,
    tenantId: authed.tenantId,
    reference: `DC-LIVE-${String(seq).padStart(4, '0')}`,
    title: input.title,
    problemStatement: input.problemStatement,
    background: input.background,
    sourceIntelligenceIds: input.sourceIntelligenceIds ?? [],
    evidenceIds: input.evidenceIds ?? [],
    alternatives: input.alternatives ?? [],
    risks: input.risks ?? [],
    financialImpactCrore: input.financialImpactCrore,
    geographicImpact: input.wardIds.map((w) => wardName(w)),
    citizenImpact: input.citizenImpact,
    departmentIds: input.departmentIds,
    wardIds: input.wardIds,
    domain: input.domain,
    recommendationSummary: input.recommendationSummary,
    ownerId: authed.id,
    approvals: [],
    dueDate: isoDaysFromAnchor(input.dueInDays ?? 21),
    actionIds: [],
    status: 'draft',
    severity: input.severity,
    classification: input.classification,
    createdAt: isoFromAnchor(0),
    updatedAt: isoFromAnchor(0),
    createdBy: authed.id,
  }
  setCollection('decisions', [newCase, ...decisions])
  recordAudit(authed, {
    action: 'create-decision',
    resourceType: 'Decision Case',
    resourceId: newCase.id,
    resourceLabel: newCase.title,
    classification: newCase.classification,
    outcome: 'success',
  })
  emitChange()
  return deepClone(newCase)
}

async function transition(user: User | null, id: string, to: DecisionStatus, reason?: string): Promise<DecisionCase> {
  await simulateLatency(`decision.transition:${id}:${to}`)
  const item = findOrThrow(user, id)
  const definition = findTransition(decisionWorkflow, item.status, to)
  if (!definition) {
    throw new ServiceError('invalid', `No transition from "${item.status}" to "${to}" is defined for the decision workflow.`)
  }
  if (definition.requiresReason && !reason) {
    throw new ServiceError('invalid', `A reason is required to ${definition.label.toLowerCase()}.`)
  }
  const authed = assertAccess(user, definition.requires.resource, definition.requires.action, contextFor(item), meta(item))
  const updated: DecisionCase = { ...item, status: to, updatedAt: isoFromAnchor(0) }
  persist(updated)
  recordAudit(authed, {
    action: auditActionForStatus(to),
    resourceType: 'Decision Case',
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

async function recordDecision(user: User | null, id: string, alternativeId: string, rationale: string): Promise<DecisionCase> {
  await simulateLatency(`decision.recordDecision:${id}`)
  const item = findOrThrow(user, id)
  const alternative = item.alternatives.find((a) => a.id === alternativeId)
  if (!alternative) {
    throw new ServiceError('invalid', `Alternative "${alternativeId}" is not declared on this decision case.`)
  }
  const authed = assertAccess(user, 'decision', 'approve', contextFor(item), meta(item))
  const updated: DecisionCase = {
    ...item,
    humanDecision: { selectedAlternativeId: alternativeId, rationale, decidedBy: authed.id, decidedAt: isoFromAnchor(0) },
    updatedAt: isoFromAnchor(0),
  }
  persist(updated)
  recordAudit(authed, {
    action: 'approve',
    resourceType: 'Decision Case',
    resourceId: item.id,
    resourceLabel: item.title,
    classification: item.classification,
    outcome: 'success',
    reason: rationale,
    detail: t('Human decision recorded: "{0}" selected.', alternative.title),
  })
  emitChange()
  return deepClone(updated)
}

async function approve(user: User | null, id: string, reason: string): Promise<DecisionCase> {
  return transition(user, id, 'approved', reason)
}

async function reject(user: User | null, id: string, reason: string): Promise<DecisionCase> {
  return transition(user, id, 'rejected', reason)
}

async function assignImplementation(user: User | null, id: string, reason?: string): Promise<DecisionCase> {
  return transition(user, id, 'assigned', reason)
}

async function addAction(user: User | null, id: string, actionId: string): Promise<DecisionCase> {
  await simulateLatency(`decision.addAction:${id}`)
  const item = findOrThrow(user, id)
  const authed = assertAccess(user, 'decision', 'edit', contextFor(item), meta(item))
  if (item.actionIds.includes(actionId)) return deepClone(item)
  const updated: DecisionCase = { ...item, actionIds: [...item.actionIds, actionId], updatedAt: isoFromAnchor(0) }
  persist(updated)
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Decision Case',
    resourceId: item.id,
    resourceLabel: item.title,
    classification: item.classification,
    outcome: 'success',
    detail: t('Action {0} linked to this decision case.', actionId),
  })
  emitChange()
  return deepClone(updated)
}

async function recordOutcome(user: User | null, id: string, outcome: DecisionOutcome): Promise<DecisionCase> {
  await simulateLatency(`decision.recordOutcome:${id}`)
  const item = findOrThrow(user, id)
  const authed = assertAccess(user, 'decision', 'approve', contextFor(item), meta(item))
  const updated: DecisionCase = { ...item, outcome, updatedAt: isoFromAnchor(0) }
  persist(updated)
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Decision Case',
    resourceId: item.id,
    resourceLabel: item.title,
    classification: item.classification,
    outcome: 'success',
    detail: t('Outcome recorded: {0}.', outcome.effectiveness),
  })
  emitChange()
  return deepClone(updated)
}

export const decisionService = {
  list,
  get,
  create,
  transition,
  recordDecision,
  approve,
  reject,
  assignImplementation,
  addAction,
  recordOutcome,
}
