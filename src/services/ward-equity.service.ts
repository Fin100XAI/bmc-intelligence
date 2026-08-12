import { buildWardEquity, underservedWards } from '@/domains/wards/equity'
import type { WardEquityAssessment, WardEquityRow } from '@/domains/wards/equity'
import { WARDS } from '@/data/reference'
import { filterByScope } from '@/security/access'
import type { User } from '@/types/organisation'
import { ServiceError, deepClone, simulateLatency, scopeToTenant } from './client'

/**
 * src/services/ward-equity.service.ts
 *
 * Ward equity and allocation.
 *
 * Reads are gated on `resource: 'ward'` with a `domain: 'wards'` attribute,
 * exactly as `src/services/ward.service.ts` gates the ward composite. That is
 * deliberate rather than lenient. Every figure this service returns is already
 * carried on the ward profile that `wardService.profile` serves to the same
 * principals - the ward's risk and health indices, its complaint record, and
 * its capital allocation and spend. Gating equity behind `resource: 'budget'`
 * instead would hide the comparison from ward officers while leaving each of
 * its inputs visible to them one ward at a time, which protects nothing and
 * simply makes the corporation harder to hold to account.
 *
 * `AccessScope.wardIds` still decides WHICH wards enter the comparison, and
 * this matters more here than on any other ward surface. Equity is a
 * comparison, so the cohort passed to `buildWardEquity` is the cohort the
 * percentiles, medians and quartiles are drawn against. A principal scoped to
 * three wards receives a genuine three-ward comparison, and
 * `WardEquityAssessment.cohortSize` is returned so the interface can state the
 * comparison's width rather than presenting a narrow cohort as a city-wide
 * finding.
 *
 * The domain module is a pure function of a list of ward identifiers with no
 * awareness of the acting principal, so scoping stays here.
 */

function visibleWardIds(user: User | null): string[] {
  const scoped = scopeToTenant(user, WARDS)
  return filterByScope(user, scoped, (w) => ({ wardId: w.id, domain: 'wards' }), 'ward').map((w) => w.id)
}

/** The full assessment across every ward in the principal's authorised scope. */
async function assessment(user: User | null): Promise<WardEquityAssessment> {
  await simulateLatency('wardEquity.assessment', 220, 620)
  const ids = visibleWardIds(user)
  if (ids.length === 0) {
    throw new ServiceError(
      'forbidden',
      'No ward falls within your authorised scope, so no allocation comparison can be drawn.',
    )
  }
  return deepClone(buildWardEquity(ids))
}

/**
 * The high-need / low-provision quadrant on its own, widest gap first.
 *
 * Exposed separately because this is the finding the page exists to surface,
 * and a briefing note or a committee paper wants it without the rest of the
 * cohort attached.
 */
async function underserved(user: User | null): Promise<WardEquityRow[]> {
  await simulateLatency('wardEquity.underserved')
  const ids = visibleWardIds(user)
  if (ids.length === 0) return []
  return deepClone(underservedWards(buildWardEquity(ids)))
}

export const wardEquityService = {
  assessment,
  underserved,
}
