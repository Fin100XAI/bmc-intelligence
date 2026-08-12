import { cityIntelligenceIndex, type CityIntelligenceIndex } from '@/domains/executive/intelligence-index'
import { canAccess } from '@/security/access'
import { ServiceError } from './client'
import type { User } from '@/types/organisation'
import { deepClone, simulateLatency } from './client'

/**
 * src/services/city-index.service.ts
 *
 * The City Intelligence Index for the active corporation.
 *
 * The index is a city-wide composite, so it is gated on the executive
 * intelligence permission rather than assembled per-ward. A principal without
 * that permission receives a denial, not a partial index - a citywide score
 * computed from one ward's data would misrepresent the city.
 */

async function index(user: User | null): Promise<CityIntelligenceIndex> {
  await simulateLatency('cityIndex.index')

  const decision = canAccess(user, 'intelligence', 'view', { domain: 'executive' })
  if (!decision.allowed) {
    throw new ServiceError('forbidden', decision.reason)
  }

  return deepClone(cityIntelligenceIndex())
}

export const cityIndexService = {
  index,
}
