import { WASTE_FACILITIES, WASTE_HOTSPOTS, WASTE_ROUTES, WASTE_WARD_PERFORMANCE } from '@/data/city.data'
import { filterByScope } from '@/security/access'
import type { WasteFacility, WasteHotspot, WasteRoute, WasteWardPerformance } from '@/types/city-domains'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/waste.service.ts
 *
 * Solid waste intelligence, gated on `resource: 'ward'` + `domain: 'waste'`
 * for the same reason documented in `water.service.ts`.
 */

async function wardPerformance(user: User | null): Promise<WasteWardPerformance[]> {
  await simulateLatency('waste.wardPerformance')
  const visible = filterByScope(user, WASTE_WARD_PERFORMANCE, (p) => ({ wardId: p.wardId, domain: 'waste' }), 'ward')
  return deepClone(visible)
}

async function routes(user: User | null, wardId?: string): Promise<WasteRoute[]> {
  await simulateLatency(`waste.routes:${wardId ?? 'all'}`)
  const base = wardId ? WASTE_ROUTES.filter((r) => r.wardId === wardId) : WASTE_ROUTES
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (r) => ({ wardId: r.wardId, domain: 'waste' }), 'ward')
  return deepClone(visible)
}

async function facilities(user: User | null): Promise<WasteFacility[]> {
  await simulateLatency('waste.facilities')
  const scoped = scopeToTenant(user, WASTE_FACILITIES)
  const visible = filterByScope(user, scoped, (f) => ({ wardId: f.wardId, domain: 'waste' }), 'ward')
  return deepClone(visible)
}

async function hotspots(user: User | null, wardId?: string): Promise<WasteHotspot[]> {
  await simulateLatency(`waste.hotspots:${wardId ?? 'all'}`)
  const base = wardId ? WASTE_HOTSPOTS.filter((h) => h.wardId === wardId) : WASTE_HOTSPOTS
  const visible = filterByScope(user, base, (h) => ({ wardId: h.wardId, domain: 'waste' }), 'ward')
  return deepClone(visible)
}

export const wasteService = {
  wardPerformance,
  routes,
  facilities,
  hotspots,
}
