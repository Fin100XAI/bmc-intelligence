import { OPEN_SPACES, TREE_WARD_POSITIONS } from '@/data/civic.data'
import { filterByScope } from '@/security/access'
import type { OpenSpace, TreeWardPosition } from '@/types/civic-services'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/gardens.service.ts
 *
 * Gardens, open space and the Tree Authority's position, gated on
 * `resource: 'ward'` + `domain: 'gardens'`.
 *
 * Open space per thousand residents is the figure a development plan is
 * actually judged against, and felling permissions are a statutory function of
 * a constituted Tree Authority rather than an administrative convenience -
 * which is why this service reports permissions granted and compensatory
 * planting completed together. Either figure alone is misleading.
 */

async function openSpaces(user: User | null, wardId?: string): Promise<OpenSpace[]> {
  await simulateLatency(`gardens.openSpaces:${wardId ?? 'all'}`)
  const base = wardId ? OPEN_SPACES.filter((o) => o.wardId === wardId) : OPEN_SPACES
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (o) => ({ wardId: o.wardId, domain: 'gardens' }), 'ward')
  return deepClone(visible)
}

async function treePositions(user: User | null): Promise<TreeWardPosition[]> {
  await simulateLatency('gardens.treePositions')
  const visible = filterByScope(user, TREE_WARD_POSITIONS, (t) => ({ wardId: t.wardId, domain: 'gardens' }), 'ward')
  return deepClone(visible)
}

export const gardensService = {
  openSpaces,
  treePositions,
}
