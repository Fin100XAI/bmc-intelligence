import { ANIMAL_WELFARE_TREND, ANIMAL_WELFARE_UNITS, WARD_ANIMAL_SIGNALS } from '@/data/animal-welfare.data'
import { filterByScope } from '@/security/access'
import type { AnimalWelfareTrendPoint, AnimalWelfareUnit, WardAnimalSignal } from '@/types/animal-welfare'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/animal-welfare.service.ts
 *
 * Cattle pounds and prevention of cruelty to animals - Twelfth Schedule
 * function 15 - gated on `resource: 'ward'` + `domain: 'animal-welfare'`.
 *
 * TWO COLLECTIONS, AND THE ORDER MATTERS. `units` returns the estate: birth
 * control centres, pounds, shelters, clinics and what each of them did in the
 * last thirty days. `wardSignals` returns the outcome: the sterilised share of
 * the free-roaming dog population and the bite rate residents experience
 * against it. The Animal Birth Control (Dogs) Rules make sterilisation - not
 * removal - the lawful method of population control, which fixes the method and
 * leaves only one honest question about performance: did the bite rate move?
 * A corporation that publishes throughput from the first collection without the
 * outcome from the second is reporting activity, not results, so both are
 * exposed through the same service and both are scoped the same way.
 *
 * Nothing here identifies a person. A dog bite case is counted, never
 * described: no complainant, no patient, no address and no incident narrative
 * exists behind these figures. The bite rate is an epidemiological signal about
 * a ward, and it must never become a record about the resident who was bitten.
 */

/** The estate the corporation operates, within the caller's ward scope. */
async function units(user: User | null, wardId?: string): Promise<AnimalWelfareUnit[]> {
  await simulateLatency(`animalWelfare.units:${wardId ?? 'all'}`)
  const base = wardId ? ANIMAL_WELFARE_UNITS.filter((u) => u.wardId === wardId) : ANIMAL_WELFARE_UNITS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (u) => ({ wardId: u.wardId, domain: 'animal-welfare' }), 'ward')
  return deepClone(visible)
}

/**
 * The outcome side, per ward. Scoped identically to the estate so that an
 * officer who can see a ward's birth control centre can also see whether it is
 * working - splitting the two behind different permissions would let the
 * throughput be reported without the result.
 */
async function wardSignals(user: User | null, wardId?: string): Promise<WardAnimalSignal[]> {
  await simulateLatency(`animalWelfare.wardSignals:${wardId ?? 'all'}`)
  const base = wardId ? WARD_ANIMAL_SIGNALS.filter((s) => s.wardId === wardId) : WARD_ANIMAL_SIGNALS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (s) => ({ wardId: s.wardId, domain: 'animal-welfare' }), 'ward')
  return deepClone(visible)
}

/** City-wide monthly totals. Aggregate by construction - there is no ward
 *  dimension to scope, and no case-level record behind it. */
async function trend(user: User | null): Promise<AnimalWelfareTrendPoint[]> {
  await simulateLatency('animalWelfare.trend')
  if (!user) return []
  return deepClone(ANIMAL_WELFARE_TREND)
}

export const animalWelfareService = {
  units,
  wardSignals,
  trend,
}
