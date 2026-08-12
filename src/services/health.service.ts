import { AIR_QUALITY_STATIONS, EMERGENCY_STATIONS, HEALTH_INDICATORS, HOSPITALS, NOISE_READINGS } from '@/data/social.data'
import { filterByScope } from '@/security/access'
import type { AirQualityStation, EmergencyStation, HealthIndicator, Hospital, NoiseReading } from '@/types/city-domains'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/health.service.ts
 *
 * Aggregate-only public health, hospital and environmental intelligence -
 * no patient-level data of any kind is modelled anywhere in this platform.
 * Each read method is tagged with the domain closest to what it actually
 * returns (`'health'`, `'hospitals'`, `'emergency'`, `'environment'`)
 * rather than a single blanket `'health'` domain, so `AccessScope.domains`
 * partitions correctly - e.g. the Executive Health Officer's scope includes
 * `'health' | 'hospitals' | 'environment'` but not `'emergency'`, so
 * `emergencyStations` is correctly the Disaster Management Officer's / Fire
 * Brigade's view, not the EHO's.
 */

async function indicators(user: User | null, wardId?: string): Promise<HealthIndicator[]> {
  await simulateLatency(`health.indicators:${wardId ?? 'all'}`)
  const base = wardId ? HEALTH_INDICATORS.filter((h) => h.wardId === wardId) : HEALTH_INDICATORS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (h) => ({ wardId: h.wardId, domain: 'health' }), 'ward')
  return deepClone(visible)
}

async function hospitals(user: User | null, wardId?: string): Promise<Hospital[]> {
  await simulateLatency(`health.hospitals:${wardId ?? 'all'}`)
  const base = wardId ? HOSPITALS.filter((h) => h.wardId === wardId) : HOSPITALS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (h) => ({ wardId: h.wardId, domain: 'hospitals' }), 'ward')
  return deepClone(visible)
}

async function outbreakSignals(user: User | null): Promise<HealthIndicator[]> {
  await simulateLatency('health.outbreakSignals')
  const scoped = scopeToTenant(user, HEALTH_INDICATORS.filter((h) => h.outbreakSignal >= 50))
  const visible = filterByScope(user, scoped, (h) => ({ wardId: h.wardId, domain: 'health' }), 'ward')
  const sorted = [...visible].sort((a, b) => b.outbreakSignal - a.outbreakSignal)
  return deepClone(sorted)
}

async function emergencyStations(user: User | null): Promise<EmergencyStation[]> {
  await simulateLatency('health.emergencyStations')
  const scoped = scopeToTenant(user, EMERGENCY_STATIONS)
  const visible = filterByScope(user, scoped, (s) => ({ wardId: s.wardId, domain: 'emergency' }), 'ward')
  return deepClone(visible)
}

async function airQuality(user: User | null): Promise<AirQualityStation[]> {
  await simulateLatency('health.airQuality')
  const visible = filterByScope(user, AIR_QUALITY_STATIONS, (s) => ({ wardId: s.wardId, domain: 'environment' }), 'ward')
  return deepClone(visible)
}

async function noise(user: User | null): Promise<NoiseReading[]> {
  await simulateLatency('health.noise')
  const visible = filterByScope(user, NOISE_READINGS, (n) => ({ wardId: n.wardId, domain: 'environment' }), 'ward')
  return deepClone(visible)
}

export const healthService = {
  indicators,
  hospitals,
  outbreakSignals,
  emergencyStations,
  airQuality,
  noise,
}
