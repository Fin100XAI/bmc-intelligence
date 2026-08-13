import { DEVELOPMENT_PLAN_POSITION, DP_RESERVATIONS, DP_ZONES } from '@/data/development-plan.data'
import { filterByScope } from '@/security/access'
import type { DPReservation, DevelopmentPlanPosition, DevelopmentPlanZone, ReservationStatus } from '@/types/development-plan'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/development-plan.service.ts
 *
 * The Development Plan's sanctioned ground truth - zoning, FSI/TDR and
 * reservation status - distinct from Urban Planning Intelligence's ward-level
 * pressure proxy.
 */

async function zones(user: User | null): Promise<DevelopmentPlanZone[]> {
  await simulateLatency('development-plan.zones')
  if (!user) return []
  const visible = filterByScope(user, DP_ZONES, (z) => ({ wardIds: [z.wardId], domain: 'planning' }), 'intelligence')
  return deepClone(visible)
}

async function reservations(user: User | null, status?: ReservationStatus[]): Promise<DPReservation[]> {
  await simulateLatency(`development-plan.reservations:${status?.join(',') ?? 'all'}`)
  const scoped = scopeToTenant(user, DP_RESERVATIONS)
  const visible = filterByScope(user, scoped, (r) => ({ wardIds: [r.wardId], domain: 'planning' }), 'intelligence')
  const filtered = status && status.length > 0 ? visible.filter((r) => status.includes(r.status)) : visible
  const sorted = [...filtered].sort((a, b) => (a.reservedAt < b.reservedAt ? 1 : -1))
  return deepClone(sorted)
}

async function position(user: User | null): Promise<DevelopmentPlanPosition> {
  await simulateLatency('development-plan.position')
  assertAccess(user, 'intelligence', 'view', { domain: 'planning' }, {
    resourceType: 'DevelopmentPlanPosition',
    resourceId: 'position',
    resourceLabel: 'Development plan position',
  })
  return deepClone(DEVELOPMENT_PLAN_POSITION)
}

export const developmentPlanService = {
  zones,
  reservations,
  position,
}
