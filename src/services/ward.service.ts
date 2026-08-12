import { buildWardProfile, buildWardRiskIndex, compareWards, rankWards } from '@/domains/wards/profile'
import type { ComparisonRow, WardProfile } from '@/domains/wards/profile'
import { WARDS } from '@/data/reference'
import { filterByScope } from '@/security/access'
import type { User, Ward } from '@/types/organisation'
import { ServiceError, assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/ward.service.ts
 *
 * Every read is scoped to `resource: 'ward'` - the one `ResourceType` every
 * institutional role in `src/security/roles.ts` holds at least a `view`
 * grant on, with a `domain: 'wards'` attribute so `AccessScope.domains`
 * still partitions who sees ward composites at all, and a `wardId`
 * attribute so `AccessScope.wardIds` restricts *which* wards.
 *
 * `profile`, `compare` and `rank` delegate their composite computation to
 * `@/domains/wards/profile` (built in parallel by another agent; it now
 * exists - see the module for `buildWardProfile` / `buildWardRiskIndex` /
 * `compareWards` / `rankWards`). That module is a pure function of a ward
 * id with no awareness of the acting principal, so access control stays
 * here: every method still validates the ward exists and is in scope
 * before delegating.
 */

export type WardRankMetric = 'risk' | 'health' | 'complaints' | 'monsoon' | 'revenue'

export interface WardRankRow {
  wardId: string
  label: string
  value: number
}

export type { ComparisonRow, WardProfile }

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

async function list(user: User | null): Promise<Ward[]> {
  await simulateLatency('ward.list')
  const scoped = scopeToTenant(user, WARDS)
  const visible = filterByScope(user, scoped, (w) => ({ wardId: w.id, domain: 'wards' }), 'ward')
  return deepClone(visible)
}

async function get(user: User | null, wardId: string): Promise<Ward> {
  await simulateLatency(`ward.get:${wardId}`)
  return deepClone(requireWard(user, wardId))
}

async function profile(user: User | null, wardId: string): Promise<WardProfile> {
  await simulateLatency(`ward.profile:${wardId}`, 200, 560)
  requireWard(user, wardId)
  const result = buildWardProfile(wardId)
  if (!result) throw new ServiceError('not-found', `Ward "${wardId}" was not found.`)
  return deepClone(result)
}

/** The explainable Ward Risk & Performance Index - a natural companion to
 * `profile`, exposed for the "why is this ward at risk" breakdown panel. */
async function riskIndex(user: User | null, wardId: string): Promise<ReturnType<typeof buildWardRiskIndex>> {
  await simulateLatency(`ward.riskIndex:${wardId}`)
  requireWard(user, wardId)
  return deepClone(buildWardRiskIndex(wardId))
}

async function compare(user: User | null, wardIds: string[]): Promise<ComparisonRow[]> {
  await simulateLatency(`ward.compare:${wardIds.join(',')}`)
  const scoped = scopeToTenant(user, WARDS).filter((w) => wardIds.includes(w.id))
  const visible = filterByScope(user, scoped, (w) => ({ wardId: w.id, domain: 'wards' }), 'ward')
  return deepClone(compareWards(visible.map((w) => w.id)))
}

async function rank(user: User | null, metric: WardRankMetric): Promise<WardRankRow[]> {
  await simulateLatency(`ward.rank:${metric}`)
  const scoped = scopeToTenant(user, WARDS)
  const visibleIds = new Set(
    filterByScope(user, scoped, (w) => ({ wardId: w.id, domain: 'wards' }), 'ward').map((w) => w.id),
  )
  const ranked = rankWards(metric).filter((row) => visibleIds.has(row.wardId))
  return deepClone(ranked)
}

export const wardService = {
  list,
  get,
  profile,
  riskIndex,
  compare,
  rank,
}
