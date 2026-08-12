import { HOUSING_SCHEMES, SETTLEMENTS } from '@/data/civic.data'
import { filterByScope } from '@/security/access'
import type { HousingScheme, Settlement } from '@/types/civic-services'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/housing.service.ts
 *
 * Settlements and rehousing schemes, gated on `resource: 'ward'` +
 * `domain: 'housing'`.
 *
 * THE BOUNDARY THIS SERVICE ENFORCES. It returns the service coverage a
 * settlement receives - water points, toilet seats, collection rounds, lighting
 * - and nothing about the people who live there. There is no household lookup,
 * no resident record, no eligibility determination, and no method that takes a
 * person as an argument. That is not an oversight to be filled in later: an
 * intelligence platform capable of enumerating residents of informal
 * settlements is a surveillance instrument regardless of the intent of whoever
 * commissioned it, and the interface must not be able to ask the question.
 */

async function settlements(user: User | null, wardId?: string): Promise<Settlement[]> {
  await simulateLatency(`housing.settlements:${wardId ?? 'all'}`)
  const base = wardId ? SETTLEMENTS.filter((s) => s.wardId === wardId) : SETTLEMENTS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (s) => ({ wardId: s.wardId, domain: 'housing' }), 'ward')
  return deepClone(visible)
}

async function schemes(user: User | null): Promise<HousingScheme[]> {
  await simulateLatency('housing.schemes')
  const scoped = scopeToTenant(user, HOUSING_SCHEMES)
  const visible = filterByScope(user, scoped, (s) => ({ wardIds: s.wardIds, domain: 'housing' }), 'ward')
  return deepClone(visible)
}

export const housingService = {
  settlements,
  schemes,
}
