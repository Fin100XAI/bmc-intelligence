import { DEMO_USERS } from '@/auth/demo-users'
import { ACCESS_POLICIES, SECURITY_POSTURE } from '@/data/governance.data'
import { filterByScope } from '@/security/access'
import type { AccessContext } from '@/security/model'
import { ROLE_LIST } from '@/security/roles'
import type { Severity } from '@/types/common'
import type { AccessPolicy, SecurityEvent, SecurityEventType, SecurityPosture } from '@/types/governance'
import type { Role, Session, User } from '@/types/organisation'
import { listLiveSessions } from './auth.service'
import { ServiceError, assertAccess, deepClone, recordAudit, scopeToTenant, simulateLatency } from './client'
import { emitChange, getCollection, setCollection } from './store'
import { t } from '@/i18n'

/**
 * src/services/security.service.ts
 *
 * The Security Command Centre. `security-administrator` holds
 * `allActions('security')`; `municipal-commissioner` and
 * `ai-governance-officer` hold read visibility; every other role is denied
 * - this is deliberate (`src/security/roles.ts` is not modified by this
 * service layer). `events` reads the mutable `securityEvents` store
 * collection so `updateEventStatus` persists for the session.
 */

export interface SecurityEventFilters {
  type?: SecurityEventType[]
  severity?: Severity[]
  status?: Array<SecurityEvent['status']>
  search?: string
}

function contextForEvent(event: SecurityEvent): AccessContext {
  return { classification: event.classification, domain: 'security' }
}

function meta(event: SecurityEvent): { resourceType: string; resourceId: string; resourceLabel: string } {
  return { resourceType: 'Security Event', resourceId: event.id, resourceLabel: event.reference }
}

function findEventOrThrow(user: User | null, id: string): SecurityEvent {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const event = getCollection('securityEvents').find((e) => e.id === id && e.tenantId === user.tenantId)
  if (!event) throw new ServiceError('not-found', `Security event "${id}" was not found.`)
  return event
}

function matchesFilters(event: SecurityEvent, filters: SecurityEventFilters): boolean {
  if (filters.type && filters.type.length > 0 && !filters.type.includes(event.type)) return false
  if (filters.severity && filters.severity.length > 0 && !filters.severity.includes(event.severity)) return false
  if (filters.status && filters.status.length > 0 && !filters.status.includes(event.status)) return false
  if (filters.search) {
    const q = filters.search.toLowerCase()
    if (!event.description.toLowerCase().includes(q) && !event.subjectUserName.toLowerCase().includes(q)) return false
  }
  return true
}

async function posture(user: User | null): Promise<SecurityPosture> {
  await simulateLatency('security.posture')
  assertAccess(user, 'security', 'view', { domain: 'security' }, {
    resourceType: 'Security Posture',
    resourceId: 'posture',
    resourceLabel: 'Security posture',
  })
  return deepClone(SECURITY_POSTURE)
}

async function events(user: User | null, filters: SecurityEventFilters = {}): Promise<SecurityEvent[]> {
  await simulateLatency(`security.events:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, getCollection('securityEvents'))
  const visible = filterByScope(user, scoped, contextForEvent, 'security')
  const filtered = visible.filter((e) => matchesFilters(e, filters))
  const sorted = [...filtered].sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1))
  return deepClone(sorted)
}

async function event(user: User | null, id: string): Promise<SecurityEvent> {
  await simulateLatency(`security.event:${id}`)
  const found = findEventOrThrow(user, id)
  assertAccess(user, 'security', 'view', contextForEvent(found), meta(found))
  return deepClone(found)
}

async function updateEventStatus(
  user: User | null,
  id: string,
  status: SecurityEvent['status'],
  reason: string,
): Promise<SecurityEvent> {
  await simulateLatency(`security.updateEventStatus:${id}`)
  const found = findEventOrThrow(user, id)
  const authed = assertAccess(user, 'security', 'edit', contextForEvent(found), meta(found))
  const updated: SecurityEvent = { ...found, status }
  setCollection('securityEvents', getCollection('securityEvents').map((e) => (e.id === updated.id ? updated : e)))
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Security Event',
    resourceId: found.id,
    resourceLabel: found.reference,
    classification: found.classification,
    outcome: 'success',
    reason,
    detail: t('Status changed to "{0}".', status),
  })
  emitChange()
  return deepClone(updated)
}

async function policies(user: User | null): Promise<AccessPolicy[]> {
  await simulateLatency('security.policies')
  const scoped = scopeToTenant(user, ACCESS_POLICIES)
  const visible = filterByScope(user, scoped, (p) => ({ classification: p.maxClassification, domain: 'security' }), 'security')
  return deepClone(visible)
}

async function users(user: User | null): Promise<User[]> {
  await simulateLatency('security.users')
  const authed = assertAccess(user, 'security', 'view', { domain: 'security' }, {
    resourceType: 'Identity Roster',
    resourceId: 'all',
    resourceLabel: 'Identity roster',
  })
  return deepClone(scopeToTenant(authed, DEMO_USERS))
}

async function roles(user: User | null): Promise<Role[]> {
  await simulateLatency('security.roles')
  assertAccess(user, 'security', 'view', { domain: 'security' }, {
    resourceType: 'Role Catalogue',
    resourceId: 'all',
    resourceLabel: 'Role catalogue',
  })
  return deepClone(ROLE_LIST)
}

async function sessions(user: User | null): Promise<Session[]> {
  await simulateLatency('security.sessions')
  const authed = assertAccess(user, 'security', 'view', { domain: 'security' }, {
    resourceType: 'Session',
    resourceId: 'all',
    resourceLabel: 'Active sessions',
  })
  return deepClone(listLiveSessions().filter((s) => s.tenantId === authed.tenantId))
}

export const securityService = {
  posture,
  events,
  event,
  updateEventStatus,
  policies,
  users,
  roles,
  sessions,
}
