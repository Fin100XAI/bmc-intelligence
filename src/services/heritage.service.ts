import { HERITAGE_SITES, HERITAGE_TOURISM_POSITION } from '@/data/heritage.data'
import { filterByScope } from '@/security/access'
import type { HeritageSite, HeritageTourismPosition } from '@/types/heritage'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/heritage.service.ts
 *
 * Heritage structures and precincts, museums, the zoo and the tourism-facing
 * public realm.
 */

async function sites(user: User | null): Promise<HeritageSite[]> {
  await simulateLatency('heritage.sites')
  const scoped = scopeToTenant(user, HERITAGE_SITES)
  const visible = filterByScope(user, scoped, (s) => ({ wardIds: [s.wardId], domain: 'heritage' }), 'intelligence')
  return deepClone(visible)
}

async function position(user: User | null): Promise<HeritageTourismPosition> {
  await simulateLatency('heritage.position')
  assertAccess(user, 'intelligence', 'view', { domain: 'heritage' }, {
    resourceType: 'HeritageTourismPosition',
    resourceId: 'position',
    resourceLabel: 'Heritage & tourism position',
  })
  return deepClone(HERITAGE_TOURISM_POSITION)
}

export const heritageService = {
  sites,
  position,
}
