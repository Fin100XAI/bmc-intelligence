import { AMENITY_TREND, PUBLIC_AMENITIES, WARD_AMENITY_GAPS } from '@/data/amenities.data'
import { filterByScope } from '@/security/access'
import type { AmenityTrendPoint, PublicAmenity, WardAmenityGap } from '@/types/amenities'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/amenities.service.ts
 *
 * Parking lots, public conveniences, bus shelters, drinking water posts and
 * community halls - function 17 of the Twelfth Schedule, less street lighting,
 * which has its own service. Gated on `resource: 'ward'` + `domain:
 * 'amenities'`, the same pattern every ward-distributed service in this
 * platform uses, so a ward-scoped principal sees their own estate and nobody
 * else's.
 *
 * The unit of record is the FACILITY, and the facility is only ever returned
 * with its condition attached. That is deliberate. A public convenience that
 * exists but has no water supply is not a working amenity, so there is no
 * method here that returns a count of facilities without the condition that
 * qualifies it - the shape refuses the flattering number rather than trusting
 * each screen to ask for the honest one.
 *
 * Nothing in this service reaches a resident. There is no user of an amenity
 * anywhere in the model, no ticket holder, no vehicle registration and no
 * complainant identity - only the facility, its condition and the volume of
 * grievances raised against it.
 */

/** The amenity estate within the principal's authorised ward scope. */
async function amenities(user: User | null, wardId?: string): Promise<PublicAmenity[]> {
  await simulateLatency(`amenities.list:${wardId ?? 'all'}`)
  const base = wardId ? PUBLIC_AMENITIES.filter((a) => a.wardId === wardId) : PUBLIC_AMENITIES
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (a) => ({ wardId: a.wardId, domain: 'amenities' }), 'ward')
  return deepClone(visible)
}

/**
 * Provision against the people served - residents per usable public toilet
 * seat, parking bays per thousand registered vehicles, and how much of the
 * ward's estate is standing in need of repair.
 */
async function wardGaps(user: User | null): Promise<WardAmenityGap[]> {
  await simulateLatency('amenities.wardGaps')
  const visible = filterByScope(user, WARD_AMENITY_GAPS, (g) => ({ wardId: g.wardId, domain: 'amenities' }), 'ward')
  return deepClone(visible)
}

/** City-wide monthly movement. Aggregate by construction - there is no ward
 *  dimension to scope, and no grievance-level record behind it. */
async function trend(user: User | null): Promise<AmenityTrendPoint[]> {
  await simulateLatency('amenities.trend')
  if (!user) return []
  return deepClone(AMENITY_TREND)
}

export const amenitiesService = {
  amenities,
  wardGaps,
  trend,
}
