import {
  buildWardTrajectory,
  buildWardTrajectoryBoard,
  projectTrajectory,
} from '@/domains/wards/trajectory'
import type { WardTrajectory, WardTrajectoryBoard } from '@/domains/wards/trajectory'
import { WARDS } from '@/data/reference'
import { filterByScope } from '@/security/access'
import type { SeriesPoint } from '@/types/common'
import type { User, Ward } from '@/types/organisation'
import { ServiceError, assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/ward-trajectory.service.ts
 *
 * Reads for the Ward Trajectory & Early Warning surface.
 *
 * Scoped exactly as `ward.service.ts` is scoped, and for the same reason: every
 * read is `resource: 'ward'`, the one `ResourceType` every institutional role
 * holds at least a `view` grant on, carrying a `domain: 'wards'` attribute so
 * `AccessScope.domains` still partitions who sees ward composites at all and a
 * `wardId` attribute so `AccessScope.wardIds` restricts which wards.
 *
 * `@/domains/wards/trajectory` is a pure function of the ward register with no
 * awareness of the acting principal, so access control stays here.
 *
 * ONE THING THIS SERVICE DOES THAT MATTERS. The cohort is narrowed to the
 * caller's authorised wards BEFORE the board is built, never after. A ward
 * officer with two wards is shown a deterioration rank of 1 of 2, computed
 * across the two wards they hold. Ranking across all twenty-four and then
 * hiding the rows they may not see would hand that officer a position in a
 * league table whose other entries they cannot inspect, cannot verify and
 * cannot act on - which is a worse answer than a smaller one.
 */

export type { WardTrajectory, WardTrajectoryBoard }

function authorisedWards(user: User | null): Ward[] {
  const scoped = scopeToTenant(user, WARDS)
  return filterByScope(user, scoped, (w) => ({ wardId: w.id, domain: 'wards' }), 'ward')
}

function requireWard(user: User | null, wardId: string): Ward {
  const ward = scopeToTenant(user, WARDS).find((w) => w.id === wardId)
  if (!ward) throw new ServiceError('not-found', `Ward "${wardId}" was not found.`)
  assertAccess(user, 'ward', 'view', { wardId, domain: 'wards' }, {
    resourceType: 'Ward',
    resourceId: ward.id,
    resourceLabel: ward.name,
  })
  return ward
}

/** The full cohort board - every authorised ward, ranked by deterioration. */
async function board(user: User | null): Promise<WardTrajectoryBoard> {
  await simulateLatency('wardTrajectory.board', 220, 620)
  const visible = authorisedWards(user)
  return deepClone(buildWardTrajectoryBoard(visible.map((w) => w.id)))
}

/** One ward's trajectory, for a drilldown or a drawer. */
async function trajectory(user: User | null, wardId: string): Promise<WardTrajectory> {
  await simulateLatency(`wardTrajectory.ward:${wardId}`)
  requireWard(user, wardId)
  const result = buildWardTrajectory(wardId)
  if (!result) throw new ServiceError('not-found', `Ward "${wardId}" was not found.`)
  return deepClone(result)
}

/**
 * The straight-line extension of one ward's fitted slope, observed months
 * first and projected months marked `simulated` so no caller can render a
 * projection as though it were an observation.
 */
async function projection(user: User | null, wardId: string, months?: number): Promise<SeriesPoint[]> {
  await simulateLatency(`wardTrajectory.projection:${wardId}`)
  requireWard(user, wardId)
  const result = buildWardTrajectory(wardId)
  if (!result) throw new ServiceError('not-found', `Ward "${wardId}" was not found.`)
  return deepClone(projectTrajectory(result, months))
}

export const wardTrajectoryService = {
  board,
  trajectory,
  projection,
}
