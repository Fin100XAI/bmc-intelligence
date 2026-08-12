import { RESERVOIRS, WATER_ASSETS, WATER_ZONES, wardWaterZone } from '@/data/city.data'
import { filterByScope } from '@/security/access'
import type { Reservoir, WaterAsset, WaterZone } from '@/types/city-domains'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/water.service.ts
 *
 * Water supply intelligence. There is no dedicated `'water'` `ResourceType`
 * in `src/security/model.ts`, so reads are gated on `resource: 'ward'`
 * (every institutional role holds at least a `view` grant on it) combined
 * with `domain: 'water'` in the access context - `AccessScope.domains` is
 * what actually excludes roles such as Finance Officer or Health Officer,
 * whose domain lists do not include `'water'`. `Reservoir` and `WaterAsset`
 * carry no `tenantId` in the domain model (they are city-wide bulk-source
 * records), so they are gated by role/domain/ward only, not tenant.
 */

export interface WaterDrilldownParams {
  wardId?: string
  zoneId?: string
}

export interface WaterDrilldownResult {
  zone?: WaterZone
  assets: WaterAsset[]
  reservoirs: Reservoir[]
}

export interface WaterZoneAnomalies {
  zoneId: string
  zoneName: string
  wardIds: string[]
  issues: string[]
}

async function zones(user: User | null): Promise<WaterZone[]> {
  await simulateLatency('water.zones')
  const scoped = scopeToTenant(user, WATER_ZONES)
  const visible = filterByScope(user, scoped, (z) => ({ wardIds: z.wardIds, domain: 'water' }), 'ward')
  return deepClone(visible)
}

async function reservoirs(user: User | null): Promise<Reservoir[]> {
  await simulateLatency('water.reservoirs')
  assertAccess(user, 'ward', 'view', { domain: 'water' }, {
    resourceType: 'Reservoir',
    resourceId: 'all',
    resourceLabel: 'City reservoirs',
  })
  return deepClone(RESERVOIRS)
}

async function assets(user: User | null, zoneId?: string): Promise<WaterAsset[]> {
  await simulateLatency(`water.assets:${zoneId ?? 'all'}`)
  const base = zoneId ? WATER_ASSETS.filter((a) => a.zoneId === zoneId) : WATER_ASSETS
  const visible = filterByScope(user, base, (a) => ({ wardId: a.wardId, domain: 'water' }), 'ward')
  return deepClone(visible)
}

async function drilldown(user: User | null, params: WaterDrilldownParams): Promise<WaterDrilldownResult> {
  await simulateLatency(`water.drilldown:${params.wardId ?? ''}:${params.zoneId ?? ''}`)
  const zone = params.zoneId
    ? WATER_ZONES.find((z) => z.id === params.zoneId)
    : params.wardId
      ? wardWaterZone(params.wardId)
      : undefined

  if (zone) {
    assertAccess(user, 'ward', 'view', { wardIds: zone.wardIds, domain: 'water' }, {
      resourceType: 'Water Zone',
      resourceId: zone.id,
      resourceLabel: zone.name,
    })
  } else {
    assertAccess(user, 'ward', 'view', { wardId: params.wardId, domain: 'water' }, {
      resourceType: 'Water Zone',
      resourceId: params.wardId ?? 'city',
      resourceLabel: params.wardId ? 'Ward water position' : 'City water position',
    })
  }

  const relatedAssets = zone
    ? WATER_ASSETS.filter((a) => a.zoneId === zone.id)
    : params.wardId
      ? WATER_ASSETS.filter((a) => a.wardId === params.wardId)
      : []

  return deepClone({ zone, assets: relatedAssets, reservoirs: RESERVOIRS })
}

async function anomalies(user: User | null): Promise<WaterZoneAnomalies[]> {
  await simulateLatency('water.anomalies')
  const scoped = scopeToTenant(user, WATER_ZONES.filter((z) => z.anomalies.length > 0))
  const visible = filterByScope(user, scoped, (z) => ({ wardIds: z.wardIds, domain: 'water' }), 'ward')
  const rows: WaterZoneAnomalies[] = visible.map((z) => ({
    zoneId: z.id,
    zoneName: z.name,
    wardIds: z.wardIds,
    issues: z.anomalies,
  }))
  return deepClone(rows)
}

export const waterService = {
  zones,
  reservoirs,
  assets,
  drilldown,
  anomalies,
}
