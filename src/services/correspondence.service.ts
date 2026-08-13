import { CORRESPONDENCE_POSITION, GOVERNMENT_RESOLUTIONS } from '@/data/correspondence.data'
import { filterByScope } from '@/security/access'
import type {
  CorrespondencePosition,
  CorrespondenceStatus,
  CorrespondenceSubject,
  GovernmentResolution,
  IssuingDepartment,
} from '@/types/correspondence'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/correspondence.service.ts
 *
 * Government Resolutions, circulars and notifications directed to the
 * Corporation. Read-only - the state issues these, the Corporation does not.
 */

export interface CorrespondenceFilters {
  issuingDepartment?: IssuingDepartment[]
  subjectCategory?: CorrespondenceSubject[]
  status?: CorrespondenceStatus[]
  search?: string
}

async function resolutions(user: User | null, filters: CorrespondenceFilters = {}): Promise<GovernmentResolution[]> {
  await simulateLatency(`correspondence.resolutions:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, GOVERNMENT_RESOLUTIONS)
  const visible = filterByScope(
    user,
    scoped,
    (g) => ({ wardIds: g.wardIds, domain: 'correspondence', classification: g.classification }),
    'intelligence',
  )
  const filtered = visible.filter((g) => {
    if (filters.issuingDepartment && filters.issuingDepartment.length > 0 && !filters.issuingDepartment.includes(g.issuingDepartment)) return false
    if (filters.subjectCategory && filters.subjectCategory.length > 0 && !filters.subjectCategory.includes(g.subjectCategory)) return false
    if (filters.status && filters.status.length > 0 && !filters.status.includes(g.status)) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!g.subject.toLowerCase().includes(q) && !g.reference.toLowerCase().includes(q)) return false
    }
    return true
  })
  const sorted = [...filtered].sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1))
  return deepClone(sorted)
}

async function position(user: User | null): Promise<CorrespondencePosition> {
  await simulateLatency('correspondence.position')
  assertAccess(user, 'intelligence', 'view', { domain: 'correspondence' }, {
    resourceType: 'CorrespondencePosition',
    resourceId: 'position',
    resourceLabel: 'Government correspondence position',
  })
  return deepClone(CORRESPONDENCE_POSITION)
}

export const correspondenceService = {
  resolutions,
  position,
}
