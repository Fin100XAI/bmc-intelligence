import { urbanResilienceIndex, type UrbanResilienceIndex } from '@/domains/resilience'
import { canAccess } from '@/security/access'
import { ServiceError } from './client'
import type { User } from '@/types/organisation'
import { deepClone, simulateLatency } from './client'

/**
 * src/services/resilience.service.ts
 *
 * The Urban Resilience Index - a city-wide preparedness composite.
 *
 * Gated on executive intelligence, like the City Intelligence Index: a
 * resilience score computed from one ward's records would misrepresent the
 * city's preparedness, so a principal without city-wide intelligence access
 * receives a denial rather than a partial index.
 */

async function index(user: User | null): Promise<UrbanResilienceIndex> {
  await simulateLatency('resilience.index')

  const decision = canAccess(user, 'intelligence', 'view', { domain: 'executive' })
  if (!decision.allowed) {
    throw new ServiceError('forbidden', decision.reason)
  }

  return deepClone(urbanResilienceIndex())
}

export const resilienceService = {
  index,
}
