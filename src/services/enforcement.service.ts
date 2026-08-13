import { ENFORCEMENT_CASES, ENFORCEMENT_DRIVES, ENFORCEMENT_POSITION } from '@/data/enforcement.data'
import { filterByScope } from '@/security/access'
import type { EncroachmentCategory, EnforcementCase, EnforcementDrive, EnforcementPosition, EnforcementStatus } from '@/types/enforcement'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/enforcement.service.ts
 *
 * Removal of Encroachments and unauthorised-development action. Read-only:
 * this platform records the notice and its outcome, not the act of issuing
 * or executing one.
 */

export interface EnforcementFilters {
  category?: EncroachmentCategory[]
  status?: EnforcementStatus[]
  wardId?: string
  search?: string
}

async function cases(user: User | null, filters: EnforcementFilters = {}): Promise<EnforcementCase[]> {
  await simulateLatency(`enforcement.cases:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, ENFORCEMENT_CASES)
  const visible = filterByScope(
    user,
    scoped,
    (c) => ({ wardIds: [c.wardId], domain: 'enforcement', classification: c.classification, departmentId: c.departmentId }),
    'intelligence',
  )
  const filtered = visible.filter((c) => {
    if (filters.category && filters.category.length > 0 && !filters.category.includes(c.category)) return false
    if (filters.status && filters.status.length > 0 && !filters.status.includes(c.status)) return false
    if (filters.wardId && c.wardId !== filters.wardId) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!c.locationDescription.toLowerCase().includes(q) && !c.reference.toLowerCase().includes(q)) return false
    }
    return true
  })
  const sorted = [...filtered].sort((a, b) => (a.noticeIssuedAt < b.noticeIssuedAt ? 1 : -1))
  return deepClone(sorted)
}

async function drives(user: User | null): Promise<EnforcementDrive[]> {
  await simulateLatency('enforcement.drives')
  const scoped = scopeToTenant(user, ENFORCEMENT_DRIVES)
  const visible = filterByScope(user, scoped, (d) => ({ wardIds: d.wardIds, domain: 'enforcement' }), 'intelligence')
  const sorted = [...visible].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
  return deepClone(sorted)
}

async function position(user: User | null): Promise<EnforcementPosition> {
  await simulateLatency('enforcement.position')
  assertAccess(user, 'intelligence', 'view', { domain: 'enforcement' }, {
    resourceType: 'EnforcementPosition',
    resourceId: 'position',
    resourceLabel: 'Encroachment & enforcement position',
  })
  return deepClone(ENFORCEMENT_POSITION)
}

export const enforcementService = {
  cases,
  drives,
  position,
}
