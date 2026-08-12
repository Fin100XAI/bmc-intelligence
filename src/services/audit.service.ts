import { filterByScope } from '@/security/access'
import type { AccessContext } from '@/security/model'
import type { DataClassification, IsoDateTime, Paged } from '@/types/common'
import type { AuditAction, AuditEvent } from '@/types/governance'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, paginate, recordAudit, scopeToTenant, simulateLatency } from './client'
import { getCollection } from './store'
import { t } from '@/i18n'

/**
 * src/services/audit.service.ts
 *
 * The institutional audit trail - read-only from this service's point of
 * view (every entry is written by `appendAudit`/`recordAudit` from every
 * *other* mutating service call, never by a method here). `export` is
 * itself a consequential act and records its own `export` audit event
 * before returning.
 */

export interface AuditFilters {
  actorId?: string
  action?: AuditAction[]
  resourceType?: string
  dateFrom?: IsoDateTime
  dateTo?: IsoDateTime
  classification?: DataClassification[]
  search?: string
  page?: number
  pageSize?: number
}

function contextFor(event: AuditEvent): AccessContext {
  return { classification: event.classification }
}

function matchesFilters(event: AuditEvent, filters: AuditFilters): boolean {
  if (filters.actorId && event.actorId !== filters.actorId) return false
  if (filters.action && filters.action.length > 0 && !filters.action.includes(event.action)) return false
  if (filters.resourceType && event.resourceType !== filters.resourceType) return false
  if (filters.dateFrom && event.at < filters.dateFrom) return false
  if (filters.dateTo && event.at > filters.dateTo) return false
  if (filters.classification && filters.classification.length > 0 && !filters.classification.includes(event.classification)) return false
  if (filters.search) {
    const q = filters.search.toLowerCase()
    if (!event.resourceLabel.toLowerCase().includes(q) && !event.actorName.toLowerCase().includes(q)) return false
  }
  return true
}

async function list(user: User | null, filters: AuditFilters = {}): Promise<Paged<AuditEvent>> {
  await simulateLatency(`audit.list:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, getCollection('auditEvents'))
  const visible = filterByScope(user, scoped, contextFor, 'audit')
  const filtered = visible.filter((e) => matchesFilters(e, filters))
  const sorted = [...filtered].sort((a, b) => (a.at < b.at ? 1 : -1))
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 50)
  return { ...page, items: deepClone(page.items) }
}

async function forResource(user: User | null, resourceId: string): Promise<AuditEvent[]> {
  await simulateLatency(`audit.forResource:${resourceId}`)
  const scoped = scopeToTenant(user, getCollection('auditEvents'))
  const visible = filterByScope(user, scoped, contextFor, 'audit')
  const filtered = visible.filter((e) => e.resourceId === resourceId)
  const sorted = [...filtered].sort((a, b) => (a.at < b.at ? 1 : -1))
  return deepClone(sorted)
}

async function exportAudit(user: User | null, filters: AuditFilters = {}): Promise<AuditEvent[]> {
  await simulateLatency('audit.export', 260, 620)
  const authed = assertAccess(user, 'audit', 'export', {}, {
    resourceType: 'Audit Export',
    resourceId: 'export',
    resourceLabel: 'Audit trail export',
  })
  const scoped = scopeToTenant(user, getCollection('auditEvents'))
  const visible = filterByScope(user, scoped, contextFor, 'audit')
  const filtered = visible.filter((e) => matchesFilters(e, filters))
  const sorted = [...filtered].sort((a, b) => (a.at < b.at ? 1 : -1))
  recordAudit(authed, {
    action: 'export',
    resourceType: 'Audit Export',
    resourceId: 'export',
    resourceLabel: 'Audit trail export',
    classification: 'restricted',
    outcome: 'success',
    detail: t('Exported {0} record(s) matching the applied filters.', sorted.length),
  })
  return deepClone(sorted)
}

/**
 * Records an access denial from a surface that is not itself a service call -
 * principally the route guard, which re-evaluates the permission engine on
 * every navigation. Denials are recorded as carefully as grants, because an
 * audit trail that only shows successful access is not an audit trail.
 */
function recordAccessDenied(
  user: User | null,
  input: { resourceType: string; resourceId: string; resourceLabel: string; reason: string },
): void {
  if (!user) return
  recordAudit(user, {
    action: 'access-denied',
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    resourceLabel: input.resourceLabel,
    classification: 'restricted',
    outcome: 'denied',
    detail: input.reason,
  })
}

export const auditService = {
  list,
  forResource,
  export: exportAudit,
  recordAccessDenied,
}
