import {
  buildLikeForLikeAssessment,
  describeExpectationLine,
  type DifficultyCohort,
  type ExpectationFit,
  type LikeForLikeAssessment,
  type WardLikeForLikeRow,
} from '@/domains/wards/like-for-like'
import { WARDS } from '@/data/reference'
import { filterByScope } from '@/security/access'
import type { User } from '@/types/organisation'
import { ServiceError, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/ward-performance.service.ts
 *
 * Like-for-like ward performance.
 *
 * Reads are scoped exactly as `ward.service.ts` scopes them - `resource:
 * 'ward'`, with a `domain: 'wards'` attribute so `AccessScope.domains` still
 * decides who sees ward composites at all, and a `wardId` attribute so
 * `AccessScope.wardIds` decides which wards. A principal restricted to two
 * wards gets two rows here, exactly as they get two wards from
 * `wardService.list`.
 *
 * ONE DELIBERATE ASYMMETRY. The expectation line and the difficulty quartiles
 * are always fitted across every ward in the tenant, and only the returned rows
 * are narrowed to the principal's scope. The line is a statement about the
 * corporation, not about whoever is looking at it: refitting it on one
 * officer's own wards would hand every officer a private, and flattering,
 * expectation to be measured against. No ward-level figure for an out-of-scope
 * ward leaves this module - `outOfScopeCount` reports only how many wards
 * contributed to the line without being shown.
 *
 * The computation itself lives in `@/domains/wards/like-for-like` and is a pure
 * function with no awareness of the acting principal, so access control stays
 * here.
 */

export type {
  DifficultyCohort,
  ExpectationFit,
  LikeForLikeAssessment,
  WardLikeForLikeRow,
}

/** Ward identifiers the principal is entitled to see, in reference order. */
function visibleWardIds(user: User | null): string[] {
  const scoped = scopeToTenant(user, WARDS)
  return filterByScope(user, scoped, (w) => ({ wardId: w.id, domain: 'wards' }), 'ward').map((w) => w.id)
}

/**
 * The full assessment: one row per ward in scope, the fitted expectation line,
 * the difficulty cohorts and the corporation-mean difficulty model.
 */
async function assessment(user: User | null): Promise<LikeForLikeAssessment> {
  await simulateLatency('wardPerformance.assessment', 220, 600)
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const ids = visibleWardIds(user)
  if (ids.length === 0) {
    throw new ServiceError(
      'forbidden',
      'No ward falls within your authorised scope, so no like-for-like comparison can be produced.',
    )
  }
  return deepClone(buildLikeForLikeAssessment(ids))
}

/** The like-for-like reading for a single ward, or `not-found` if out of scope. */
async function ward(user: User | null, wardId: string): Promise<WardLikeForLikeRow> {
  await simulateLatency(`wardPerformance.ward:${wardId}`)
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  if (!visibleWardIds(user).includes(wardId)) {
    throw new ServiceError('not-found', `Ward "${wardId}" was not found within your authorised scope.`)
  }
  const row = buildLikeForLikeAssessment([wardId]).rows[0]
  if (!row) throw new ServiceError('not-found', `Ward "${wardId}" was not found.`)
  return deepClone(row)
}

/** Wards in one difficulty quartile, so an officer can be read against peers. */
async function cohort(user: User | null, quartile: 1 | 2 | 3 | 4): Promise<WardLikeForLikeRow[]> {
  await simulateLatency(`wardPerformance.cohort:${quartile}`)
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const rows = buildLikeForLikeAssessment(visibleWardIds(user)).rows.filter((r) => r.quartile === quartile)
  return deepClone(rows)
}

/**
 * The fitted line stated in words, for the method panel. Kept on the service
 * rather than computed in the page so that the sentence a reader is shown and
 * the coefficients the residuals were built from can never drift apart.
 */
async function method(user: User | null): Promise<{ fit: ExpectationFit; statement: string }> {
  await simulateLatency('wardPerformance.method')
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const { fit } = buildLikeForLikeAssessment(visibleWardIds(user))
  return deepClone({ fit, statement: describeExpectationLine(fit) })
}

export const wardPerformanceService = {
  assessment,
  ward,
  cohort,
  method,
}
