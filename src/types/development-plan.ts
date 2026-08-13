import type { IsoDateTime, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/development-plan.ts
 *
 * The Development Plan's own ground truth - sanctioned land-use zoning, FSI
 * and TDR position, and reservation status - rather than the ward-level
 * pressure proxies Urban Planning Intelligence uses in its place.
 *
 * Urban Planning Intelligence says so itself: its adequacy model is
 * transparently a ward-level proxy, not integrated parcel-level land-use
 * data. For Brihanmumbai, the real document is the Development Plan 2034,
 * sanctioned by the state government on 8 May 2018, together with its
 * companion regulatory document - the Development Control and Promotion
 * Regulations, 2034 - which came into force that September. The DP is the
 * spatial blueprint: which zone a parcel falls in, and which parcels are
 * reserved for a public purpose. The DCPR is the rulebook for what may
 * actually be built in each zone - FSI, height, setbacks. A reservation
 * barring construction until the Corporation acquires or develops it is the
 * single most consequential fact this module adds: reported figures put
 * roughly half of the Corporation's own already-acquired reservation
 * properties without a clear title transfer, years after acquisition.
 */

export type DevelopmentPlanZoneType =
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'no-development-zone'
  | 'natural-area'
  | 'public-semi-public'
  | 'agricultural'
  | 'recreational-green'

function build$DP_ZONE_TYPE_LABEL(): Record<DevelopmentPlanZoneType, string> {
  return {
  residential: t('Residential'),
  commercial: t('Commercial'),
  industrial: t('Industrial'),
  'no-development-zone': t('No-Development Zone'),
  'natural-area': t('Natural Area (Forest / Coastal / Hill)'),
  'public-semi-public': t('Public / Semi-Public'),
  agricultural: t('Agricultural'),
  'recreational-green': t('Recreational / Green'),
}
}
export let DP_ZONE_TYPE_LABEL: Record<DevelopmentPlanZoneType, string> = build$DP_ZONE_TYPE_LABEL()
registerLayer(() => {
  DP_ZONE_TYPE_LABEL = build$DP_ZONE_TYPE_LABEL()
})

/** A ward's sanctioned land-use zone position under the Development Plan. */
export interface DevelopmentPlanZone {
  wardId: string
  zoneType: DevelopmentPlanZoneType
  areaHectares: number
  /** Base FSI the DCPR sanctions for this zone, before TDR loading. */
  sanctionedFSI: number
  /** Mean FSI actually built against, across permitted plots in the zone. */
  avgUtilisedFSI: number
  tdrGeneratedSqm: number
  tdrUtilisedSqm: number
}

export type ReservationType =
  | 'garden'
  | 'school'
  | 'hospital'
  | 'road-widening'
  | 'market'
  | 'affordable-housing'
  | 'parking-lot'
  | 'fire-station'

function build$RESERVATION_TYPE_LABEL(): Record<ReservationType, string> {
  return {
  garden: t('Garden / Open Space'),
  school: t('School Site'),
  hospital: t('Hospital Site'),
  'road-widening': t('Road Widening'),
  market: t('Market Site'),
  'affordable-housing': t('Affordable Housing'),
  'parking-lot': t('Parking Lot'),
  'fire-station': t('Fire Station Site'),
}
}
export let RESERVATION_TYPE_LABEL: Record<ReservationType, string> = build$RESERVATION_TYPE_LABEL()
registerLayer(() => {
  RESERVATION_TYPE_LABEL = build$RESERVATION_TYPE_LABEL()
})

export type ReservationStatus =
  | 'reserved-undeveloped'
  | 'land-acquisition-in-progress'
  | 'title-transferred'
  | 'developed'
  | 'reservation-lifted'

function build$RESERVATION_STATUS_LABEL(): Record<ReservationStatus, string> {
  return {
  'reserved-undeveloped': t('Reserved - Undeveloped'),
  'land-acquisition-in-progress': t('Land Acquisition in Progress'),
  'title-transferred': t('Title Transferred to Corporation'),
  developed: t('Developed for Reserved Purpose'),
  'reservation-lifted': t('Reservation Lifted'),
}
}
export let RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = build$RESERVATION_STATUS_LABEL()
registerLayer(() => {
  RESERVATION_STATUS_LABEL = build$RESERVATION_STATUS_LABEL()
})

/**
 * Land earmarked in the Development Plan for a public purpose - construction
 * is barred on it until the Corporation acquires or develops it, or the
 * reservation is formally lifted. No owner is named; `ownerType` is the
 * category the acquisition process depends on.
 */
export interface DPReservation {
  id: string
  tenantId: TenantId
  wardId: string
  reservationType: ReservationType
  areaSqm: number
  status: ReservationStatus
  reservedAt: IsoDateTime
  ownerType: 'private' | 'government' | 'corporation'
}

export interface DevelopmentPlanPosition {
  /** When the current Development Plan was sanctioned by the state government. */
  planSanctionedAt: IsoDateTime
  zonesMapped: number
  reservationsTotal: number
  reservationsUndeveloped: number
  /** Share of the Corporation's own acquired reservations still without a transferred title. */
  titleBacklogPct: number
  meanUtilisedFSIPct: number
}
