import { MONSOON_SCENARIO_PRESETS, monsoonDriverBreakdown, runMonsoonScenario } from '@/domains/monsoon/scenario'
import { summariseDesiltingProgramme } from '@/domains/monsoon/desilting'
import { CURRENT_WEATHER_ALERT, DESILTING_WORK_ORDERS, PUMP_UNITS, summarisePumpFleet } from '@/data/monsoon-ops.data'
import {
  PUMPING_STATIONS,
  RAINFALL_OBSERVATIONS,
  STORM_DRAINS,
  TIDE_WINDOWS,
  WARD_MONSOON_READINESS,
  WATERLOGGING_SPOTS,
} from '@/data/city.data'
import { filterByScope } from '@/security/access'
import type {
  DesiltingProgramme,
  DesiltingWorkOrder,
  MonsoonScenarioInput,
  MonsoonScenarioResult,
  PumpFleetPosition,
  PumpingStation,
  PumpUnit,
  RainfallObservation,
  StormWaterDrain,
  TideWindow,
  WardMonsoonReadiness,
  WaterloggingSpot,
  WeatherAlert,
} from '@/types/city-domains'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, recordAudit, scopeToTenant, simulateLatency } from './client'
import { t } from '@/i18n'

/**
 * src/services/monsoon.service.ts
 *
 * Monsoon and flood intelligence. Reads use `resource: 'ward'` +
 * `domain: 'monsoon'` (see `water.service.ts` for why: there is no
 * dedicated `ResourceType` per operational domain). `runScenario` is gated
 * on `resource: 'situation-room'` instead - the roles holding
 * `situation-room` permissions (Disaster Management Officer, Control Room
 * Operator, and the executive band) are exactly the roles that operate the
 * Situation Room's scenario tool; a Ward Officer can read monsoon data but
 * not run a city-wide scenario.
 *
 * The scenario engine itself delegates to `@/domains/monsoon/scenario`
 * (built in parallel by another agent; it now exists - see
 * `runMonsoonScenario`, deterministic and pure). This service's job is
 * strictly the access gate and the audit trail around calling it; the
 * modelling itself lives in exactly one place so every caller - this
 * service, and anything the domains module is used from directly - always
 * gets the same number for the same inputs.
 */

export interface MonsoonScenarioPreset {
  id: string
  label: string
  description: string
  inputs: MonsoonScenarioInput
}

async function readiness(user: User | null): Promise<WardMonsoonReadiness[]> {
  await simulateLatency('monsoon.readiness')
  const visible = filterByScope(user, WARD_MONSOON_READINESS, (r) => ({ wardId: r.wardId, domain: 'monsoon' }), 'ward')
  return deepClone(visible)
}

async function rainfall(user: User | null): Promise<RainfallObservation[]> {
  await simulateLatency('monsoon.rainfall')
  const visible = filterByScope(user, RAINFALL_OBSERVATIONS, (r) => ({ wardId: r.wardId, domain: 'monsoon' }), 'ward')
  return deepClone(visible)
}

async function tides(user: User | null): Promise<TideWindow[]> {
  await simulateLatency('monsoon.tides')
  assertAccess(user, 'ward', 'view', { domain: 'monsoon' }, {
    resourceType: 'Tide Window',
    resourceId: 'all',
    resourceLabel: 'Tide windows',
  })
  return deepClone(TIDE_WINDOWS)
}

async function pumpingStations(user: User | null): Promise<PumpingStation[]> {
  await simulateLatency('monsoon.pumpingStations')
  const scoped = scopeToTenant(user, PUMPING_STATIONS)
  const visible = filterByScope(user, scoped, (p) => ({ wardId: p.wardId, domain: 'monsoon' }), 'ward')
  return deepClone(visible)
}

async function drains(user: User | null, wardId?: string): Promise<StormWaterDrain[]> {
  await simulateLatency(`monsoon.drains:${wardId ?? 'all'}`)
  const base = wardId ? STORM_DRAINS.filter((d) => d.wardId === wardId) : STORM_DRAINS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (d) => ({ wardId: d.wardId, domain: 'monsoon' }), 'ward')
  return deepClone(visible)
}

async function waterloggingSpots(user: User | null, wardId?: string): Promise<WaterloggingSpot[]> {
  await simulateLatency(`monsoon.waterloggingSpots:${wardId ?? 'all'}`)
  const base = wardId ? WATERLOGGING_SPOTS.filter((s) => s.wardId === wardId) : WATERLOGGING_SPOTS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (s) => ({ wardId: s.wardId, domain: 'monsoon' }), 'ward')
  return deepClone(visible)
}

/**
 * The seasonal desilting programme, reach by reach.
 *
 * Ward-scoped like every other operational register here: a Ward Officer sees
 * the orders raised against their own wards and nobody else's.
 */
async function desiltingOrders(user: User | null, wardId?: string): Promise<DesiltingWorkOrder[]> {
  await simulateLatency(`monsoon.desiltingOrders:${wardId ?? 'all'}`)
  const base = wardId ? DESILTING_WORK_ORDERS.filter((o) => o.wardId === wardId) : DESILTING_WORK_ORDERS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (o) => ({ wardId: o.wardId, domain: 'monsoon' }), 'ward')
  return deepClone(visible)
}

/**
 * The programme roll-up.
 *
 * Deliberately recomputed from the caller's OWN visible orders rather than
 * returning the city-wide binding: a principal scoped to three wards is not
 * entitled to the city's sanctioned quantum or the city's uncorroborated
 * value, and handing it to them because it happened to be pre-aggregated is
 * exactly the kind of leak scope filtering exists to prevent. The arithmetic
 * is the same function the city binding is built with, so the scoped figure
 * and the city figure can never disagree about the same set of orders.
 */
async function desiltingProgramme(user: User | null): Promise<DesiltingProgramme> {
  await simulateLatency('monsoon.desiltingProgramme')
  const scoped = scopeToTenant(user, DESILTING_WORK_ORDERS)
  const visible = filterByScope(user, scoped, (o) => ({ wardId: o.wardId, domain: 'monsoon' }), 'ward')
  return deepClone(summariseDesiltingProgramme(visible))
}

/**
 * The city's current colour-coded weather warning.
 *
 * City-level and not ward-scoped, because the warning itself is: IMD issues it
 * against the district, every control room in the corporation operates to the
 * same colour, and a ward officer needs to see the same one the Commissioner
 * is seeing. The read is still gated - it is operational information, not a
 * public page - but it is not filtered down to the principal's wards.
 */
async function weatherAlert(user: User | null): Promise<WeatherAlert> {
  await simulateLatency('monsoon.weatherAlert')
  assertAccess(user, 'ward', 'view', { domain: 'monsoon' }, {
    resourceType: 'Weather Alert',
    resourceId: 'current',
    resourceLabel: 'Current weather alert',
  })
  return deepClone(CURRENT_WEATHER_ALERT)
}

/**
 * Individual dewatering sets, ward-scoped like the stations they sit at.
 */
async function pumpUnits(user: User | null, wardId?: string): Promise<PumpUnit[]> {
  await simulateLatency(`monsoon.pumpUnits:${wardId ?? 'all'}`)
  const base = wardId ? PUMP_UNITS.filter((u) => u.wardId === wardId) : PUMP_UNITS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (u) => ({ wardId: u.wardId, domain: 'monsoon' }), 'ward')
  return deepClone(visible)
}

/** Fleet roll-up over the caller's own visible units, for the same reason the
 *  desilting programme is recomputed rather than served pre-aggregated. */
async function pumpFleet(user: User | null): Promise<PumpFleetPosition> {
  await simulateLatency('monsoon.pumpFleet')
  const scoped = scopeToTenant(user, PUMP_UNITS)
  const visible = filterByScope(user, scoped, (u) => ({ wardId: u.wardId, domain: 'monsoon' }), 'ward')
  return deepClone(summarisePumpFleet(visible))
}

async function runScenario(user: User | null, inputs: MonsoonScenarioInput): Promise<MonsoonScenarioResult> {
  await simulateLatency('monsoon.runScenario', 320, 760)
  const authed = assertAccess(user, 'situation-room', 'edit', { domain: 'monsoon' }, {
    resourceType: 'Monsoon Scenario',
    resourceId: 'scenario',
    resourceLabel: 'Monsoon scenario',
  })
  const result = runMonsoonScenario(inputs)
  recordAudit(authed, {
    action: 'run-scenario',
    resourceType: 'Monsoon Scenario',
    resourceId: 'scenario',
    resourceLabel: 'Monsoon scenario',
    classification: 'internal',
    outcome: 'success',
    detail: t('Rainfall {0}mm/24h, tide {1}m, pump availability {2}%, desilting {3}%, duration {4}h.', inputs.rainfallMm24h, inputs.tideHeightM, inputs.pumpAvailabilityPct, inputs.desiltingCompletionPct, inputs.durationHours),
  })
  return deepClone(result)
}

/** Driver-by-driver explainability breakdown for a scenario's inputs -
 * the natural companion to `runScenario` for the "why did the risk move"
 * panel. Read-only, so it uses the broader `'ward'` read gate rather than
 * the `'situation-room'` gate `runScenario` itself requires. */
async function driverBreakdown(user: User | null, inputs: MonsoonScenarioInput): Promise<ReturnType<typeof monsoonDriverBreakdown>> {
  await simulateLatency('monsoon.driverBreakdown')
  assertAccess(user, 'ward', 'view', { domain: 'monsoon' }, {
    resourceType: 'Monsoon Scenario',
    resourceId: 'driver-breakdown',
    resourceLabel: 'Monsoon scenario driver breakdown',
  })
  return deepClone(monsoonDriverBreakdown(inputs))
}

async function presets(): Promise<MonsoonScenarioPreset[]> {
  await simulateLatency('monsoon.presets')
  return deepClone(MONSOON_SCENARIO_PRESETS)
}

export const monsoonService = {
  readiness,
  rainfall,
  tides,
  pumpingStations,
  drains,
  waterloggingSpots,
  desiltingOrders,
  desiltingProgramme,
  pumpUnits,
  pumpFleet,
  weatherAlert,
  runScenario,
  driverBreakdown,
  presets,
}
