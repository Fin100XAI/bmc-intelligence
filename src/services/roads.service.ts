import { ROAD_SEGMENTS, TRAFFIC_CORRIDORS } from '@/data/city.data'
import { filterByScope } from '@/security/access'
import type { Severity } from '@/types/common'
import type { RoadDefect, RoadSegment, TrafficCorridor } from '@/types/city-domains'
import type { User } from '@/types/organisation'
import { ServiceError, assertAccess, deepClone, scopeToTenant, simulateLatency, recordAudit } from './client'
import { emitChange, getCollection, setCollection } from './store'
import { t } from '@/i18n'

/**
 * src/services/roads.service.ts
 *
 * Roads intelligence and the Road Defect Priority Engine's published
 * output. Defects are read from the mutable `roadDefects` store collection
 * (not the `ROAD_DEFECTS` seed) because `updateDefectStatus` persists a
 * rectification status change for the session. That mutation is gated on
 * `resource: 'project'` - there is no dedicated `'roads'` `ResourceType`,
 * and defect rectification sits within the Chief Engineer's project /
 * infrastructure-delivery authority in `src/security/roles.ts` (Ward
 * Officer holds only `project:view`, not `project:edit`).
 */

export interface RoadDefectFilters {
  wardId?: string
  severity?: Severity[]
  status?: Array<RoadDefect['status']>
  type?: Array<RoadDefect['type']>
}

function findDefectOrThrow(user: User | null, id: string): RoadDefect {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const defect = getCollection('roadDefects').find((d) => d.id === id && d.tenantId === user.tenantId)
  if (!defect) throw new ServiceError('not-found', `Road defect "${id}" was not found.`)
  return defect
}

function matchesFilters(defect: RoadDefect, filters: RoadDefectFilters): boolean {
  if (filters.wardId && defect.wardId !== filters.wardId) return false
  if (filters.severity && filters.severity.length > 0 && !filters.severity.includes(defect.severity)) return false
  if (filters.status && filters.status.length > 0 && !filters.status.includes(defect.status)) return false
  if (filters.type && filters.type.length > 0 && !filters.type.includes(defect.type)) return false
  return true
}

async function segments(user: User | null, wardId?: string): Promise<RoadSegment[]> {
  await simulateLatency(`roads.segments:${wardId ?? 'all'}`)
  const base = wardId ? ROAD_SEGMENTS.filter((s) => s.wardId === wardId) : ROAD_SEGMENTS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (s) => ({ wardId: s.wardId, domain: 'roads' }), 'ward')
  return deepClone(visible)
}

async function defects(user: User | null, filters: RoadDefectFilters = {}): Promise<RoadDefect[]> {
  await simulateLatency(`roads.defects:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, getCollection('roadDefects'))
  const visible = filterByScope(user, scoped, (d) => ({ wardId: d.wardId, domain: 'roads' }), 'ward')
  const filtered = visible.filter((d) => matchesFilters(d, filters))
  return deepClone(filtered)
}

async function rankedDefects(user: User | null, limit = 10): Promise<RoadDefect[]> {
  await simulateLatency(`roads.rankedDefects:${limit}`)
  const scoped = scopeToTenant(user, getCollection('roadDefects'))
  const visible = filterByScope(user, scoped, (d) => ({ wardId: d.wardId, domain: 'roads' }), 'ward')
  const ranked = [...visible].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, limit)
  return deepClone(ranked)
}

async function corridors(user: User | null): Promise<TrafficCorridor[]> {
  await simulateLatency('roads.corridors')
  const visible = filterByScope(user, TRAFFIC_CORRIDORS, (c) => ({ wardIds: c.wardIds, domain: 'mobility' }), 'ward')
  return deepClone(visible)
}

async function updateDefectStatus(
  user: User | null,
  id: string,
  status: RoadDefect['status'],
  reason: string,
): Promise<RoadDefect> {
  await simulateLatency(`roads.updateDefectStatus:${id}`)
  const defect = findDefectOrThrow(user, id)
  const authed = assertAccess(user, 'project', 'edit', { wardId: defect.wardId, domain: 'roads' }, {
    resourceType: 'Road Defect',
    resourceId: defect.id,
    resourceLabel: `Defect ${defect.id} (${defect.type})`,
  })
  const updated: RoadDefect = { ...defect, status }
  setCollection('roadDefects', getCollection('roadDefects').map((d) => (d.id === updated.id ? updated : d)))
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Road Defect',
    resourceId: defect.id,
    resourceLabel: `Defect ${defect.id} (${defect.type})`,
    classification: 'internal',
    outcome: 'success',
    reason,
    detail: t('Status changed to "{0}".', status),
  })
  emitChange()
  return deepClone(updated)
}

export const roadsService = {
  segments,
  defects,
  rankedDefects,
  corridors,
  updateDefectStatus,
}
