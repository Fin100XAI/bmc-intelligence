import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import type {
  DPReservation,
  DevelopmentPlanPosition,
  DevelopmentPlanZone,
  DevelopmentPlanZoneType,
  ReservationStatus,
  ReservationType,
} from '@/types/development-plan'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS } from './reference'
import { CITY_SCALE, scaledCount } from './scale'
import { registerLayer } from './runtime'

/**
 * src/data/development-plan.data.ts
 *
 * Real, dated facts ground this module for the Brihanmumbai deployment only:
 * the Development Plan 2034 was sanctioned by the state government on 8 May
 * 2018, its companion Development Control and Promotion Regulations, 2034
 * came into force that September, and reported figures put roughly 52 per
 * cent of the Corporation's own 5,409 already-acquired reservation
 * properties still without a transferred title. Every other corporation
 * shows its own plan under a generic, undated sanction placeholder rather
 * than an invented year - it will hold a Development Plan of its own, but
 * this demonstration environment does not know when it was sanctioned.
 *
 * The zone and reservation REGISTERS beneath that fact, for every
 * corporation including Brihanmumbai, remain modelled demonstration data -
 * this file does not hold DP 2034's actual parcel-level zoning.
 */

export let DP_ZONES: DevelopmentPlanZone[] = []
export let DP_RESERVATIONS: DPReservation[] = []
export let DEVELOPMENT_PLAN_POSITION: DevelopmentPlanPosition = {
  planSanctionedAt: isoDaysFromAnchor(-2800),
  zonesMapped: 0,
  reservationsTotal: 0,
  reservationsUndeveloped: 0,
  titleBacklogPct: 0,
  meanUtilisedFSIPct: 0,
}

/** 8 May 2018 - the Development Plan 2034's real sanction date. */
const DP_2034_SANCTIONED_AT = '2018-05-08T00:00:00+05:30'

const ZONE_TYPES: DevelopmentPlanZoneType[] = [
  'residential', 'commercial', 'industrial', 'no-development-zone', 'natural-area', 'public-semi-public', 'agricultural', 'recreational-green',
]

const RESERVATION_TYPES: ReservationType[] = [
  'garden', 'school', 'hospital', 'road-widening', 'market', 'affordable-housing', 'parking-lot', 'fire-station',
]

registerLayer(() => {
  const scale = CITY_SCALE
  const isBmc = activeCorporation.id === 'bmc'

  /* ---------------------------------------------------------------- Zones */

  DP_ZONES = WARDS.map((ward) => {
    const r = det(`dpzone:${ward.id}`)
    const zoneType = r.pick(ZONE_TYPES)
    const sanctionedFSI = zoneType === 'commercial' ? r.float(2.5, 4.0)
      : zoneType === 'residential' ? r.float(1.8, 3.3)
      : zoneType === 'industrial' ? r.float(1.2, 2.0)
      : r.float(0.5, 1.2)
    const utilisation = r.float(0.42, 0.94)

    return {
      wardId: ward.id,
      zoneType,
      areaHectares: Math.round(ward.areaSqKm * 100 * r.float(0.55, 0.9) * 100) / 100,
      sanctionedFSI: Math.round(sanctionedFSI * 100) / 100,
      avgUtilisedFSI: Math.round(sanctionedFSI * utilisation * 100) / 100,
      tdrGeneratedSqm: r.int(scaledCount(4000, scale.area, 200), scaledCount(48000, scale.area, 2000)),
      tdrUtilisedSqm: 0,
    }
  }).map((zone) => ({
    ...zone,
    tdrUtilisedSqm: Math.round(zone.tdrGeneratedSqm * det(`dptdr:${zone.wardId}`).float(0.35, 0.88)),
  }))

  /* --------------------------------------------------------- Reservations */

  const reservationCount = scaledCount(340, scale.population, 24)
  DP_RESERVATIONS = Array.from({ length: reservationCount }, (_, i) => {
    const r = det(`dpres:${i}`)
    const ward = r.pick(WARDS)
    const reservationType = RESERVATION_TYPES[i % RESERVATION_TYPES.length]!
    const yearsSinceReservation = r.int(1, 34)
    // The real, reported finding this register exists to carry: acquisition
    // backlog compounds with age rather than clearing over time.
    const status = r.weighted(
      yearsSinceReservation > 15
        ? ([['reserved-undeveloped', 3], ['land-acquisition-in-progress', 2], ['title-transferred', 2], ['developed', 2], ['reservation-lifted', 1]] as const)
        : ([['reserved-undeveloped', 5], ['land-acquisition-in-progress', 3], ['title-transferred', 1], ['developed', 1]] as const),
    ) as ReservationStatus

    return {
      id: `dpr-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      wardId: ward.id,
      reservationType,
      areaSqm: r.int(180, 24000),
      status,
      reservedAt: isoDaysFromAnchor(-yearsSinceReservation * 365 - r.int(0, 300)),
      ownerType: r.weighted([['private', 5], ['government', 2], ['corporation', 3]] as const),
    }
  })

  /* --------------------------------------------------------------- Roll-up */

  const acquired = DP_RESERVATIONS.filter((r) => r.status === 'title-transferred' || r.status === 'developed' || r.status === 'land-acquisition-in-progress')
  const acquiredNotTitled = DP_RESERVATIONS.filter((r) => r.status === 'land-acquisition-in-progress')
  const undeveloped = DP_RESERVATIONS.filter((r) => r.status === 'reserved-undeveloped' || r.status === 'land-acquisition-in-progress')
  const meanUtilisation = DP_ZONES.length
    ? Math.round((DP_ZONES.reduce((s, z) => s + (z.sanctionedFSI > 0 ? z.avgUtilisedFSI / z.sanctionedFSI : 0), 0) / DP_ZONES.length) * 1000) / 10
    : 0

  DEVELOPMENT_PLAN_POSITION = {
    planSanctionedAt: isBmc ? DP_2034_SANCTIONED_AT : isoDaysFromAnchor(-2800),
    zonesMapped: DP_ZONES.length,
    reservationsTotal: DP_RESERVATIONS.length,
    reservationsUndeveloped: undeveloped.length,
    titleBacklogPct: acquired.length > 0 ? Math.round((acquiredNotTitled.length / acquired.length) * 1000) / 10 : 0,
    meanUtilisedFSIPct: meanUtilisation,
  }
})
