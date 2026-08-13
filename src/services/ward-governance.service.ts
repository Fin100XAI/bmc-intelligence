import { CORPORATOR_CASEWORK, WARD_COMMITTEES, WARD_GOVERNANCE_POSITION } from '@/data/ward-governance.data'
import { filterByScope } from '@/security/access'
import type { CaseworkStatus, CorporatorCasework, WardCommitteeDetail, WardGovernancePosition } from '@/types/ward-governance'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/ward-governance.service.ts
 *
 * The statutory ward committees and the casework an elected corporator
 * carries directly. See `src/types/ward-governance.ts` for why this sits
 * beside, rather than inside, the council's own committee register.
 */

export interface CaseworkFilters {
  wardId?: string
  status?: CaseworkStatus[]
}

async function committees(user: User | null): Promise<WardCommitteeDetail[]> {
  await simulateLatency('ward-governance.committees')
  if (!user) return []
  // Ward committees carry no `tenantId` of their own - they are derived
  // one-per-ward, and the ward itself is what scoping resolves against.
  const visible = filterByScope(
    user,
    WARD_COMMITTEES,
    (c) => ({ wardIds: [c.wardId], domain: 'wards' }),
    'ward',
  )
  return deepClone(visible)
}

async function casework(user: User | null, filters: CaseworkFilters = {}): Promise<CorporatorCasework[]> {
  await simulateLatency(`ward-governance.casework:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, CORPORATOR_CASEWORK)
  const visible = filterByScope(user, scoped, (c) => ({ wardIds: [c.wardId], domain: 'wards' }), 'ward')
  const filtered = visible.filter((c) => {
    if (filters.wardId && c.wardId !== filters.wardId) return false
    if (filters.status && filters.status.length > 0 && !filters.status.includes(c.status)) return false
    return true
  })
  const sorted = [...filtered].sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1))
  return deepClone(sorted)
}

async function position(user: User | null): Promise<WardGovernancePosition> {
  await simulateLatency('ward-governance.position')
  assertAccess(user, 'ward', 'view', { domain: 'wards' }, {
    resourceType: 'WardGovernancePosition',
    resourceId: 'position',
    resourceLabel: 'Ward governance position',
  })
  return deepClone(WARD_GOVERNANCE_POSITION)
}

export const wardGovernanceService = {
  committees,
  casework,
  position,
}
