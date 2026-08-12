import { TENANT_ID } from '@/config/municipality.config'
import type {
  DesiltingProgramme,
  DesiltingWorkOrder,
  PumpFleetPosition,
  PumpUnit,
  WeatherAlert,
  WeatherAlertColour,
  WorkVerification,
} from '@/types/city-domains'
import {
  desiltingState,
  emptyDesiltingProgramme,
  summariseDesiltingProgramme,
} from '@/domains/monsoon/desilting'
import { det, isoDaysFromAnchor, isoFromAnchor } from '@/utils/deterministic'
import { WARD_BY_ID } from './reference'
import { PUMPING_STATIONS, RAINFALL_OBSERVATIONS, STORM_DRAINS, TIDE_WINDOWS } from './city.data'
import { CONTRACTORS } from './finance.data'
import { CITY_SCALE } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * MONSOON OPERATIONS
 *
 * The two things a municipal control room actually runs on when it rains: what
 * the weather is doing to the city right now, and whether the work that was
 * supposed to protect the city from it was done.
 *
 * This layer is deployment-neutral. It is modelled on how a large corporation
 * runs a monsoon operations room - a colour-coded city alert, a seasonal
 * desilting programme tracked reach by reach, and a contractor named against
 * every reach - but nothing in it is specific to any one corporation. Every
 * magnitude derives from the ACTIVE corporation's own scale, its own wards and
 * its own drain register, so a corporation of three hundred thousand people
 * gets a programme sized for three hundred thousand people, with the same
 * accountability structure a corporation of twelve million gets.
 *
 * The single idea worth stating plainly, because it is what the surface is
 * for: completion and verification are different questions. A reach can be
 * reported ninety per cent desilted and have none of that quantum
 * corroborated. Carrying the two separately is what lets an officer ask the
 * second question at all.
 *
 * Every export is a LIVE BINDING, rebuilt on a corporation switch.
 */

/* ==========================================================================
   The city alert
   ========================================================================== */

/**
 * India Meteorological Department 24-hour rainfall bands, in millimetres.
 *
 * These are IMD's published thresholds, not ours. `src/data/city.data.ts`
 * already classifies observations on the same boundaries, so the alert colour
 * and the station intensity labels can never disagree.
 */
const IMD_HEAVY_MM = 64.5
const IMD_VERY_HEAVY_MM = 115.6
const IMD_EXTREMELY_HEAVY_MM = 204.5

function alertColour(peakMm: number): WeatherAlertColour {
  if (peakMm >= IMD_EXTREMELY_HEAVY_MM) return 'red'
  if (peakMm >= IMD_VERY_HEAVY_MM) return 'orange'
  if (peakMm >= IMD_HEAVY_MM) return 'yellow'
  return 'green'
}

/** IMD's own action word against each colour. */
function alertAction(colour: WeatherAlertColour): string {
  if (colour === 'red') return t('Take action')
  if (colour === 'orange') return t('Be prepared')
  if (colour === 'yellow') return t('Be updated')
  return t('No warning')
}

function alertBandLabel(colour: WeatherAlertColour): string {
  if (colour === 'red') return t('Extremely heavy rainfall - above 204.5 mm in 24 hours')
  if (colour === 'orange') return t('Very heavy rainfall - 115.6 to 204.4 mm in 24 hours')
  if (colour === 'yellow') return t('Heavy rainfall - 64.5 to 115.5 mm in 24 hours')
  return t('No rainfall warning in force - below 64.5 mm in 24 hours')
}

function alertAdvisory(colour: WeatherAlertColour, dischargeBlocked: boolean): string {
  if (colour === 'red') {
    return t(
      'Disaster management cell on continuous watch. Field teams deployed at all chronic waterlogging locations. Movement advisories in force.',
    )
  }
  if (colour === 'orange') {
    return dischargeBlocked
      ? t(
          'Dewatering sets to be manned through the high-tide window, when outfalls cannot discharge under gravity. Ward control rooms staffed.',
        )
      : t('Ward control rooms staffed and dewatering sets manned at chronic locations. Field teams on call.')
  }
  if (colour === 'yellow') {
    return t('Ward control rooms to remain reachable. Chronic waterlogging locations to be checked before the next observation round.')
  }
  return t('Routine monsoon watch. No additional deployment in force.')
}

export let CURRENT_WEATHER_ALERT: WeatherAlert = emptyAlert()

function emptyAlert(): WeatherAlert {
  return {
    colour: 'green',
    action: t('No warning'),
    headline: t('No rainfall warning in force'),
    advisory: t('Routine monsoon watch. No additional deployment in force.'),
    bandLabel: alertBandLabel('green'),
    peakRainfallMm: 0,
    peakWardId: null,
    wardsInBand: 0,
    dischargeBlocked: false,
    issuedAt: isoFromAnchor(-120),
    validUntil: isoFromAnchor(600),
    drivers: [],
  }
}

function buildWeatherAlert(): WeatherAlert {
  if (RAINFALL_OBSERVATIONS.length === 0) return emptyAlert()

  let peak = RAINFALL_OBSERVATIONS[0] as (typeof RAINFALL_OBSERVATIONS)[number]
  for (const obs of RAINFALL_OBSERVATIONS) if (obs.last24hMm > peak.last24hMm) peak = obs

  const colour = alertColour(peak.last24hMm)
  const wardsInBand = RAINFALL_OBSERVATIONS.filter((o) => o.last24hMm >= IMD_HEAVY_MM).length

  // A high tide inside the validity window is what turns heavy rain into
  // standing water: the outfalls cannot discharge under gravity against it, so
  // whatever the drains carry has to be pumped.
  const blockingTide = TIDE_WINDOWS.find((w) => w.blocksDischarge)
  const dischargeBlocked = blockingTide !== undefined

  const drivers: string[] = []
  drivers.push(t('Heaviest 24-hour observation {0} mm at {1}', peak.last24hMm.toFixed(1), peak.stationName))
  if (wardsInBand > 0) {
    drivers.push(t('{0} ward station(s) observing rainfall in the heavy band or above', wardsInBand))
  }
  if (blockingTide) {
    drivers.push(t('High tide of {0} m blocks gravity discharge from outfalls', blockingTide.heightM.toFixed(2)))
  }

  const r = det('alert:city')
  return {
    colour,
    action: alertAction(colour),
    headline:
      colour === 'green'
        ? t('No rainfall warning in force')
        : t('{0} warning in force for the corporation area', alertAction(colour)),
    advisory: alertAdvisory(colour, dischargeBlocked),
    bandLabel: alertBandLabel(colour),
    peakRainfallMm: peak.last24hMm,
    peakWardId: peak.wardId,
    wardsInBand,
    dischargeBlocked,
    issuedAt: isoFromAnchor(-r.int(45, 210)),
    validUntil: isoFromAnchor(r.int(360, 1080)),
    drivers,
  }
}

/* ==========================================================================
   The seasonal desilting programme
   ========================================================================== */

/**
 * City-wide silt quantum for one pre-monsoon cycle, at Brihanmumbai scale,
 * in metric tonnes. Distributed across the active corporation's own reaches
 * and scaled by the ground it actually drains.
 */
const REFERENCE_CYCLE_QUANTUM_MT = 900_000

/** Modelled cost of removal, transport and disposal, in rupees per tonne. */
const RATE_PER_TONNE = 700

/** A tipper load. Trips are the unit the work is measured and paid in. */
const TONNES_PER_TRIP = 9

/**
 * Reaches carrying a desilting order. Culverts are cleared under a separate
 * maintenance head and are deliberately out of the programme, so that the
 * programme total means the same thing here as it does in a corporation's own
 * pre-monsoon return.
 */
const PROGRAMME_TYPES = new Set(['major-nallah', 'minor-nallah', 'closed-drain'])

function quantumWeight(type: string, lengthKm: number): number {
  const typeWeight = type === 'major-nallah' ? 3.1 : type === 'minor-nallah' ? 1.6 : 1
  return Math.max(0.1, lengthKm) * typeWeight
}

/**
 * Share of orders whose trip count can be corroborated by something other
 * than the contractor's own record - a weighbridge, vehicle tracking on the
 * disposal route, or gated site photography.
 *
 * Modelled from deployment scale rather than asserted per corporation: the
 * larger corporations have generally procured that instrumentation and the
 * smaller ones still record trips on paper. This is the honest reason two
 * corporations show very different verified shares, and it is visible on the
 * surface rather than buried here.
 */
function telemetryShare(): number {
  return Math.min(0.62, Math.max(0.06, 0.62 * Math.sqrt(CITY_SCALE.population)))
}

function verificationRatio(verification: WorkVerification, r: ReturnType<typeof det>): number {
  if (verification === 'machine-verified') return r.float(0.94, 1)
  if (verification === 'photo-verified') return r.float(0.68, 0.9)
  if (verification === 'disputed') return r.float(0.22, 0.58)
  return 0
}

export let DESILTING_WORK_ORDERS: DesiltingWorkOrder[] = []
export let DESILTING_PROGRAMME: DesiltingProgramme = emptyDesiltingProgramme()

function buildWorkOrders(): DesiltingWorkOrder[] {
  const reaches = STORM_DRAINS.filter((d) => PROGRAMME_TYPES.has(d.type))
  if (reaches.length === 0) return []

  // Contractors empanelled for drainage work. Falling back to the full roster
  // keeps a small corporation - which may have no storm-water-only vendor on
  // the register - from producing a programme with nobody named against it.
  const drainageContractors = CONTRACTORS.filter((c) => c.category.includes('stormwater'))
  const roster = drainageContractors.length > 0 ? drainageContractors : CONTRACTORS

  // The city total is fixed first and then distributed, so the headline
  // quantum is a function of the ground the corporation drains rather than an
  // accident of how many reaches its ward geometry happened to produce.
  const cycleTotal = Math.max(5_000, Math.round(REFERENCE_CYCLE_QUANTUM_MT * CITY_SCALE.area))
  const weights = reaches.map((d) => quantumWeight(d.type, d.lengthKm))
  const weightTotal = weights.reduce((s, w) => s + w, 0)
  const share = telemetryShare()

  return reaches.map((drain, i) => {
    const r = det(`desilt:${drain.id}`)
    const ward = WARD_BY_ID.get(drain.wardId)

    const contractor = r.pick(roster) ?? roster[0]

    const sanctioned = Math.max(40, Math.round((cycleTotal * (weights[i] as number)) / weightTotal))

    // Completion is carried straight off the reach rather than drawn again, so
    // the programme and the drain register can never report different figures
    // for the same reach.
    const completionPct = drain.desiltingCompletionPct
    const removed = Math.round((sanctioned * completionPct) / 100)

    const verification = r.weighted([
      ['machine-verified', Math.round(share * 100)],
      ['photo-verified', 30],
      ['claimed-unverified', 26],
      ['disputed', 7],
    ] as const) as WorkVerification

    const tripsRecorded = Math.max(1, Math.round(removed / TONNES_PER_TRIP))
    const ratio = verificationRatio(verification, r)
    const tripsVerified = Math.min(tripsRecorded, Math.round(tripsRecorded * ratio))

    const valueLakh = Math.round((removed * RATE_PER_TONNE) / 100_000 / 0.01) * 0.01
    const verifiedFraction = tripsRecorded === 0 ? 0 : tripsVerified / tripsRecorded
    const unverifiedValueLakh = Math.round(valueLakh * (1 - verifiedFraction) * 100) / 100

    return {
      id: `dsw-${String(i + 1).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      reference: `${ward?.code ?? 'W'}/SWD/${String(i + 1).padStart(3, '0')}`,
      drainId: drain.id,
      drainName: drain.name,
      wardId: drain.wardId,
      zoneId: ward?.zoneId ?? '',
      contractorId: contractor?.id ?? '',
      contractorName: contractor?.name ?? t('Contractor not on the register'),
      sanctionedQuantumMt: sanctioned,
      removedQuantumMt: removed,
      completionPct,
      tripsRecorded,
      tripsVerified,
      verification,
      valueLakh: Math.round(valueLakh * 100) / 100,
      unverifiedValueLakh,
      state: desiltingState(completionPct, verification),
      lastUpdatedAt: isoDaysFromAnchor(-r.int(1, 46)),
    }
  })
}

/* ==========================================================================
   The dewatering fleet
   ========================================================================== */

export let PUMP_UNITS: PumpUnit[] = []

/**
 * Individual sets, expanded from each station's own installed and operational
 * counts.
 *
 * The station says "9 of 12 operational". This turns that into twelve named
 * sets of which exactly three are not available - so the two surfaces are
 * arithmetically the same statement, and a flooding incident can name the set
 * that is down instead of quoting a percentage at the ward.
 */
function buildPumpUnits(): PumpUnit[] {
  const units: PumpUnit[] = []
  // Telemetry is procured, not universal. The share follows deployment scale
  // for the same reason the desilting verification share does: the larger
  // corporations have instrumented their fleets and the smaller ones still
  // send somebody to look.
  const telemetryReach = Math.min(0.92, Math.max(0.08, Math.sqrt(CITY_SCALE.population)))

  for (const station of PUMPING_STATIONS) {
    const unavailable = Math.max(0, station.pumpsTotal - station.pumpsOperational)
    // Capacity is shared across the sets at the site, so the fleet's installed
    // capacity sums back to the station register's.
    const perUnitLps = Math.round(((station.capacityCumecs * 1000) / Math.max(1, station.pumpsTotal)) * 10) / 10

    for (let i = 0; i < station.pumpsTotal; i += 1) {
      const r = det(`pumpunit:${station.id}:${i}`)
      // The first `unavailable` sets carry the station's shortfall; which set
      // is down is arbitrary but stable, and the count is not.
      const down = i < unavailable
      const status: PumpUnit['status'] = down
        ? r.chance(0.62)
          ? 'fault'
          : 'maintenance'
        : r.chance(0.55)
          ? 'running'
          : 'standby'
      const telemetry = r.chance(telemetryReach)

      units.push({
        id: `pu-${station.id}-${String(i + 1).padStart(2, '0')}`,
        tenantId: TENANT_ID,
        stationId: station.id,
        stationName: station.name,
        wardId: station.wardId,
        designation: `DWP-${String(i + 1).padStart(2, '0')}`,
        capacityLps: perUnitLps,
        status,
        hoursRun30d: status === 'running' ? r.int(40, 260) : status === 'standby' ? r.int(0, 60) : r.int(0, 24),
        lastFaultAt: status === 'fault' ? isoDaysFromAnchor(-r.int(0, 21)) : r.chance(0.3) ? isoDaysFromAnchor(-r.int(22, 180)) : null,
        telemetry,
        state: status === 'fault' ? 'critical' : status === 'maintenance' ? 'at-risk' : 'operational',
      })
    }
  }
  return units
}

/** Fleet roll-up. Pure, so a scoped caller can recompute it over its own units. */
export function summarisePumpFleet(units: PumpUnit[]): PumpFleetPosition {
  const running = units.filter((u) => u.status === 'running').length
  const standby = units.filter((u) => u.status === 'standby').length
  const fault = units.filter((u) => u.status === 'fault').length
  const maintenance = units.filter((u) => u.status === 'maintenance').length
  const available = units.filter((u) => u.status === 'running' || u.status === 'standby')
  const telemetryUnits = units.filter((u) => u.telemetry).length

  const byStation = new Map<string, PumpUnit[]>()
  for (const u of units) {
    const list = byStation.get(u.stationId) ?? []
    list.push(u)
    byStation.set(u.stationId, list)
  }
  let stranded = 0
  for (const list of byStation.values()) {
    if (!list.some((u) => u.status === 'running' || u.status === 'standby')) stranded += 1
  }

  return {
    unitsTotal: units.length,
    running,
    standby,
    fault,
    maintenance,
    telemetryUnits,
    telemetrySharePct: units.length === 0 ? 0 : Math.round((telemetryUnits / units.length) * 1000) / 10,
    availabilityPct: units.length === 0 ? 0 : Math.round((available.length / units.length) * 1000) / 10,
    availableCapacityLps: Math.round(available.reduce((sum, u) => sum + u.capacityLps, 0)),
    installedCapacityLps: Math.round(units.reduce((sum, u) => sum + u.capacityLps, 0)),
    stationsWithNoWorkingUnit: stranded,
  }
}

/** Work orders for one ward, heaviest uncorroborated value first. */
export function desiltingOrdersForWard(wardId: string): DesiltingWorkOrder[] {
  return DESILTING_WORK_ORDERS.filter((o) => o.wardId === wardId).sort(
    (a, b) => b.unverifiedValueLakh - a.unverifiedValueLakh,
  )
}

registerLayer(() => {
  CURRENT_WEATHER_ALERT = buildWeatherAlert()
  DESILTING_WORK_ORDERS = buildWorkOrders()
  DESILTING_PROGRAMME = summariseDesiltingProgramme(DESILTING_WORK_ORDERS)
  PUMP_UNITS = buildPumpUnits()
})
