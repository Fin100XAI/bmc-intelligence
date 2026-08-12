import { LIGHTING_CIRCUITS, LIGHTING_FAULTS } from '@/data/civic.data'
import { filterByScope } from '@/security/access'
import type { LightingCircuit, LightingFault } from '@/types/civic-services'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/streetlight.service.ts
 *
 * Street lighting circuits and open faults, gated on `resource: 'ward'` +
 * `domain: 'street-lighting'`.
 *
 * The unit is the FEEDER CIRCUIT rather than the individual pole, because that
 * is the unit a corporation actually manages: circuits are switched, billed
 * and maintained together, and an energy figure per pole is an average rather
 * than a meter reading.
 */

async function circuits(user: User | null, wardId?: string): Promise<LightingCircuit[]> {
  await simulateLatency(`streetlight.circuits:${wardId ?? 'all'}`)
  const base = wardId ? LIGHTING_CIRCUITS.filter((c) => c.wardId === wardId) : LIGHTING_CIRCUITS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (c) => ({ wardId: c.wardId, domain: 'street-lighting' }), 'ward')
  return deepClone(visible)
}

async function faults(user: User | null, wardId?: string): Promise<LightingFault[]> {
  await simulateLatency(`streetlight.faults:${wardId ?? 'all'}`)
  const base = wardId ? LIGHTING_FAULTS.filter((f) => f.wardId === wardId) : LIGHTING_FAULTS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (f) => ({ wardId: f.wardId, domain: 'street-lighting' }), 'ward')
  return deepClone(visible)
}

export const streetLightService = {
  circuits,
  faults,
}
