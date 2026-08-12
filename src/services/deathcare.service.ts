import { BURIAL_GROUNDS, DEATHCARE_TREND } from '@/data/deathcare.data'
import { filterByScope } from '@/security/access'
import type { BurialGround, DeathcareTrendPoint } from '@/types/deathcare'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/deathcare.service.ts
 *
 * Cemeteries, burial grounds and crematoria - Twelfth Schedule function 14 -
 * gated on `resource: 'ward'` + `domain: 'deathcare'`.
 *
 * Land for the dead is finite and non-renewable. A burial ground that fills
 * does not refill, and a crematorium reaching capacity is a crisis that
 * arrives without warning and cannot be solved quickly, because acquiring land
 * for a burial ground is among the hardest things a corporation ever does.
 * This service exists so the warning arrives years early instead.
 *
 * The unit of record is the FACILITY - its remaining capacity, the years it
 * has left at the current rate, the volumes it carries and the hours a
 * grieving family waits at its gate. That last figure is the dignity measure
 * and the reason the rest of it is worth holding.
 *
 * NO REGISTER OF THE DEAD IS SERVED FROM HERE. There is no interment record,
 * no name, no plot allotment and no family detail behind any method below.
 * Registers of the dead sit with the Registrar and with each ground's own
 * managing trust or committee; this platform reports on whether there is room
 * and how long the wait is, and never reproduces the register itself.
 */

/** Facilities within the caller's authorised ward scope. */
async function facilities(user: User | null, wardId?: string): Promise<BurialGround[]> {
  await simulateLatency(`deathcare.facilities:${wardId ?? 'all'}`)
  const base = wardId ? BURIAL_GROUNDS.filter((f) => f.wardId === wardId) : BURIAL_GROUNDS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (f) => ({ wardId: f.wardId, domain: 'deathcare' }), 'ward')
  return deepClone(visible)
}

/**
 * Facilities with the shortest planning horizon left, city-wide - the
 * replacement-site pipeline stated as a list. Ward-scoped like everything
 * else, so a ward officer sees the grounds they are answerable for.
 */
async function exhaustionRisk(user: User | null, thresholdYears = 10): Promise<BurialGround[]> {
  const visible = await facilities(user)
  return visible
    .filter((f) => f.estimatedYearsRemaining <= thresholdYears)
    .sort((a, b) => a.estimatedYearsRemaining - b.estimatedYearsRemaining)
}

/** City-wide monthly volumes. Aggregate by construction - there is no
 *  individual behind any figure on this series, and no ward dimension to
 *  scope. */
async function trend(user: User | null): Promise<DeathcareTrendPoint[]> {
  await simulateLatency('deathcare.trend')
  if (!user) return []
  return deepClone(DEATHCARE_TREND)
}

export const deathcareService = {
  facilities,
  exhaustionRisk,
  trend,
}
