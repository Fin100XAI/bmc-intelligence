import { REGISTRATION_CENTRES, REGISTRATION_TREND } from '@/data/civic.data'
import { filterByScope } from '@/security/access'
import type { RegistrationCentre, RegistrationTrendPoint } from '@/types/civic-services'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/registration.service.ts
 *
 * Statutory registration of births and deaths, gated on `resource: 'ward'` +
 * `domain: 'registration'`.
 *
 * This is the highest-volume counter service a corporation runs and the one
 * where a delay is felt most directly: a certificate that takes three weeks
 * holds up a school admission, a pension claim or an insurance settlement.
 *
 * The unit of record is the REGISTRATION CENTRE - volumes, statutory-period
 * compliance, issue time and backlog. No registered event, no name, no date of
 * birth and no certificate content is held. Vital records are the registrar's
 * statutory register; this platform reports on the administration of that
 * register and never reproduces it.
 */

async function centres(user: User | null, wardId?: string): Promise<RegistrationCentre[]> {
  await simulateLatency(`registration.centres:${wardId ?? 'all'}`)
  const base = wardId ? REGISTRATION_CENTRES.filter((c) => c.wardId === wardId) : REGISTRATION_CENTRES
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (c) => ({ wardId: c.wardId, domain: 'registration' }), 'ward')
  return deepClone(visible)
}

/** City-wide monthly volumes. Aggregate by construction - there is no ward
 *  dimension to scope, and no event-level record behind it. */
async function trend(user: User | null): Promise<RegistrationTrendPoint[]> {
  await simulateLatency('registration.trend')
  if (!user) return []
  return deepClone(REGISTRATION_TREND)
}

export const registrationService = {
  centres,
  trend,
}
