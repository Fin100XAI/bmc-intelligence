import { filterByScope } from '@/security/access'
import type { AccessContext } from '@/security/model'
import type { ConfidenceLevel, IntelligenceDomain, Paged, Severity } from '@/types/common'
import type { AuditAction } from '@/types/governance'
import type { Alert, AlertStatus } from '@/types/intelligence'
import type { User } from '@/types/organisation'
import { isoFromAnchor } from '@/utils/deterministic'
import { findTransition } from '@/workflows/engine'
import { alertWorkflow } from '@/workflows/machines'
import { ServiceError, assertAccess, deepClone, paginate, recordAudit, scopeToTenant, simulateLatency } from './client'
import { emitChange, getCollection, setCollection } from './store'
import { t } from '@/i18n'

/**
 * src/services/alert.service.ts
 *
 * The operational escalation surface derived from intelligence. Every
 * status change validates against `alertWorkflow` in
 * `src/workflows/machines.ts` before mutating the in-session store.
 */

export interface AlertFilters {
  severity?: Severity[]
  wardId?: string
  departmentId?: string
  domain?: IntelligenceDomain
  status?: AlertStatus[]
  confidence?: ConfidenceLevel[]
  search?: string
  page?: number
  pageSize?: number
}

export interface AlertSlaSummary {
  total: number
  withinSla: number
  approachingBreach: number
  breached: number
  byDomain: Array<{ domain: IntelligenceDomain; open: number; breached: number }>
}

function contextFor(alert: Alert): AccessContext {
  return { wardIds: alert.wardIds, departmentId: alert.departmentId, domain: alert.domain, classification: alert.classification }
}

function meta(alert: Alert): { resourceType: string; resourceId: string; resourceLabel: string } {
  return { resourceType: 'Alert', resourceId: alert.id, resourceLabel: alert.title }
}

function findOrThrow(user: User | null, id: string): Alert {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const alert = getCollection('alerts').find((a) => a.id === id && a.tenantId === user.tenantId)
  if (!alert) throw new ServiceError('not-found', `Alert "${id}" was not found.`)
  return alert
}

function persist(updated: Alert): void {
  setCollection('alerts', getCollection('alerts').map((a) => (a.id === updated.id ? updated : a)))
}

function auditActionForStatus(to: AlertStatus): AuditAction {
  if (to === 'acknowledged') return 'acknowledge'
  if (to === 'escalated') return 'escalate'
  if (to === 'assigned') return 'assign'
  return 'status-change'
}

function matchesFilters(alert: Alert, filters: AlertFilters): boolean {
  if (filters.severity && filters.severity.length > 0 && !filters.severity.includes(alert.severity)) return false
  if (filters.wardId && !alert.wardIds.includes(filters.wardId)) return false
  if (filters.departmentId && alert.departmentId !== filters.departmentId) return false
  if (filters.domain && alert.domain !== filters.domain) return false
  if (filters.status && filters.status.length > 0 && !filters.status.includes(alert.status)) return false
  if (filters.confidence && filters.confidence.length > 0 && !filters.confidence.includes(alert.confidence)) return false
  if (filters.search) {
    const q = filters.search.toLowerCase()
    if (!alert.title.toLowerCase().includes(q) && !alert.description.toLowerCase().includes(q)) return false
  }
  return true
}

async function list(user: User | null, filters: AlertFilters = {}): Promise<Paged<Alert>> {
  await simulateLatency(`alert.list:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, getCollection('alerts'))
  const visible = filterByScope(user, scoped, contextFor, 'alert')
  const filtered = visible.filter((alert) => matchesFilters(alert, filters))
  const sorted = [...filtered].sort((a, b) => a.slaRemainingHours - b.slaRemainingHours)
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 20)
  return { ...page, items: deepClone(page.items) }
}

async function get(user: User | null, id: string): Promise<Alert> {
  await simulateLatency(`alert.get:${id}`)
  const alert = findOrThrow(user, id)
  assertAccess(user, 'alert', 'view', contextFor(alert), meta(alert))
  return deepClone(alert)
}

async function transition(user: User | null, id: string, to: AlertStatus, reason?: string): Promise<Alert> {
  await simulateLatency(`alert.transition:${id}:${to}`)
  const alert = findOrThrow(user, id)
  const definition = findTransition(alertWorkflow, alert.status, to)
  if (!definition) {
    throw new ServiceError('invalid', `No transition from "${alert.status}" to "${to}" is defined for the alert workflow.`)
  }
  if (definition.requiresReason && !reason) {
    throw new ServiceError('invalid', `A reason is required to ${definition.label.toLowerCase()}.`)
  }
  const authed = assertAccess(user, definition.requires.resource, definition.requires.action, contextFor(alert), meta(alert))
  const updated: Alert = { ...alert, status: to, updatedAt: isoFromAnchor(0) }
  persist(updated)
  recordAudit(authed, {
    action: auditActionForStatus(to),
    resourceType: 'Alert',
    resourceId: alert.id,
    resourceLabel: alert.title,
    classification: alert.classification,
    outcome: 'success',
    reason,
    detail: `${definition.label}: ${alert.status} → ${to}.`,
  })
  emitChange()
  return deepClone(updated)
}

async function acknowledge(user: User | null, id: string, reason?: string): Promise<Alert> {
  return transition(user, id, 'acknowledged', reason)
}

async function escalate(user: User | null, id: string, reason: string): Promise<Alert> {
  return transition(user, id, 'escalated', reason)
}

async function close(user: User | null, id: string, reason?: string): Promise<Alert> {
  return transition(user, id, 'closed', reason)
}

async function assign(user: User | null, id: string, ownerId: string, reason?: string): Promise<Alert> {
  await simulateLatency(`alert.assign:${id}`)
  const alert = findOrThrow(user, id)
  const definition = findTransition(alertWorkflow, alert.status, 'assigned')
  if (definition?.requiresReason && !reason) {
    throw new ServiceError('invalid', 'A reason is required to reassign this alert.')
  }
  const authed = assertAccess(user, 'alert', 'assign', contextFor(alert), meta(alert))
  const updated: Alert = {
    ...alert,
    ownerId,
    status: definition ? 'assigned' : alert.status,
    updatedAt: isoFromAnchor(0),
  }
  persist(updated)
  recordAudit(authed, {
    action: 'assign',
    resourceType: 'Alert',
    resourceId: alert.id,
    resourceLabel: alert.title,
    classification: alert.classification,
    outcome: 'success',
    reason,
    detail: t('Assigned to {0}.', ownerId),
  })
  emitChange()
  return deepClone(updated)
}

async function slaSummary(user: User | null): Promise<AlertSlaSummary> {
  await simulateLatency('alert.slaSummary')
  const scoped = scopeToTenant(user, getCollection('alerts'))
  const visible = filterByScope(user, scoped, contextFor, 'alert')
  const open = visible.filter((a) => a.status !== 'closed' && a.status !== 'resolved')
  const breached = open.filter((a) => a.slaRemainingHours < 0)
  const approaching = open.filter((a) => a.slaRemainingHours >= 0 && a.slaRemainingHours <= 2)
  const withinSla = open.length - breached.length - approaching.length

  const byDomainMap = new Map<IntelligenceDomain, { open: number; breached: number }>()
  for (const alert of open) {
    const entry = byDomainMap.get(alert.domain) ?? { open: 0, breached: 0 }
    entry.open += 1
    if (alert.slaRemainingHours < 0) entry.breached += 1
    byDomainMap.set(alert.domain, entry)
  }
  const byDomain = Array.from(byDomainMap.entries()).map(([domain, v]) => ({ domain, ...v }))

  return deepClone({
    total: open.length,
    withinSla: Math.max(0, withinSla),
    approachingBreach: approaching.length,
    breached: breached.length,
    byDomain,
  })
}

export const alertService = {
  list,
  get,
  acknowledge,
  assign,
  escalate,
  close,
  transition,
  slaSummary,
}
