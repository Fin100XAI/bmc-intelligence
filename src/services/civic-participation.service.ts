import { CIVIC_ENGAGEMENTS, CIVIC_PARTICIPATION_POSITION } from '@/data/civic-participation.data'
import { filterByScope } from '@/security/access'
import type { CivicEngagementRecord, CivicParticipationPosition, EngagementStatus, EngagementTheme } from '@/types/civic-participation'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/civic-participation.service.ts
 *
 * Consultations, suggestions and public feedback the Corporation has run.
 */

export interface EngagementFilters {
  theme?: EngagementTheme[]
  status?: EngagementStatus[]
}

async function engagements(user: User | null, filters: EngagementFilters = {}): Promise<CivicEngagementRecord[]> {
  await simulateLatency(`civic-participation.engagements:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, CIVIC_ENGAGEMENTS)
  const visible = filterByScope(
    user,
    scoped,
    (e) => ({ wardIds: e.wardIds, domain: 'civic-participation', classification: e.classification, departmentId: e.departmentId }),
    'intelligence',
  )
  const filtered = visible.filter((e) => {
    if (filters.theme && filters.theme.length > 0 && !filters.theme.includes(e.theme)) return false
    if (filters.status && filters.status.length > 0 && !filters.status.includes(e.status)) return false
    return true
  })
  const sorted = [...filtered].sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1))
  return deepClone(sorted)
}

async function position(user: User | null): Promise<CivicParticipationPosition> {
  await simulateLatency('civic-participation.position')
  assertAccess(user, 'intelligence', 'view', { domain: 'civic-participation' }, {
    resourceType: 'CivicParticipationPosition',
    resourceId: 'position',
    resourceLabel: 'Civic participation position',
  })
  return deepClone(CIVIC_PARTICIPATION_POSITION)
}

export const civicParticipationService = {
  engagements,
  position,
}
