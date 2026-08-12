import { COMMITTEES, COUNCIL_POSITION, COUNCIL_RESOLUTIONS } from '@/data/civic.data'
import { filterByScope } from '@/security/access'
import type { Committee, CouncilPosition, CouncilResolution, ResolutionStatus } from '@/types/civic-services'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/council.service.ts
 *
 * The deliberative wing - the Corporation in session and its committees.
 *
 * Every other service in this platform reports on the EXECUTIVE side of a
 * municipal corporation: the Commissioner, the departments, the officers who
 * administer. But a corporation is a two-wing institution. The Standing
 * Committee sanctions expenditure within its financial limit; the General Body
 * approves the budget estimates and everything reserved to the whole house. A
 * decision case in the Decision Centre that commits money above the
 * administrative limit cannot take effect until the Corporation has resolved
 * on it, and until now the platform had no record of that step at all.
 *
 * `resolutionsForDecision` is where the two records meet, and it is the reason
 * this service exists rather than the resolution register being a static page.
 */

export interface ResolutionFilters {
  committeeId?: string
  status?: ResolutionStatus[]
  domain?: string
  search?: string
}

async function committees(user: User | null): Promise<Committee[]> {
  await simulateLatency('council.committees')
  return deepClone(scopeToTenant(user, COMMITTEES))
}

async function resolutions(user: User | null, filters: ResolutionFilters = {}): Promise<CouncilResolution[]> {
  await simulateLatency(`council.resolutions:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, COUNCIL_RESOLUTIONS)
  // A resolution carrying no ward is a city-wide matter and is visible to any
  // principal holding the domain; one tagged to wards is scoped like every
  // other ward-bearing record in the platform.
  const visible = filterByScope(
    user,
    scoped,
    (r) => ({ wardIds: r.wardIds, domain: 'council', classification: r.classification }),
    'intelligence',
  )
  const filtered = visible.filter((r) => {
    if (filters.committeeId && r.committeeId !== filters.committeeId) return false
    if (filters.status && filters.status.length > 0 && !filters.status.includes(r.status)) return false
    if (filters.domain && r.domain !== filters.domain) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!r.subject.toLowerCase().includes(q) && !r.reference.toLowerCase().includes(q)) return false
    }
    return true
  })
  const sorted = [...filtered].sort((a, b) => (a.tabledAt < b.tabledAt ? 1 : -1))
  return deepClone(sorted)
}

async function position(user: User | null): Promise<CouncilPosition> {
  await simulateLatency('council.position')
  assertAccess(user, 'intelligence', 'view', { domain: 'council' }, {
    resourceType: 'Council',
    resourceId: 'position',
    resourceLabel: 'Council position',
  })
  return deepClone(COUNCIL_POSITION)
}

/**
 * The resolutions bearing on one executive decision case.
 *
 * This is the join the platform was missing. An officer looking at a decision
 * can now see whether the Corporation has in fact sanctioned it, is still to
 * take it, or has declined it - which is the difference between a decision
 * that can be acted on and one that cannot.
 */
async function resolutionsForDecision(user: User | null, decisionCaseId: string): Promise<CouncilResolution[]> {
  await simulateLatency(`council.forDecision:${decisionCaseId}`)
  const scoped = scopeToTenant(user, COUNCIL_RESOLUTIONS).filter((r) => r.decisionCaseId === decisionCaseId)
  return deepClone(scoped)
}

export const councilService = {
  committees,
  resolutions,
  position,
  resolutionsForDecision,
}
