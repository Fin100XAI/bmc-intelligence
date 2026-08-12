import type { IsoDateTime, OperationalState, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/amenities.ts
 *
 * PARKING & PUBLIC AMENITIES
 *
 * Function 17 of the Twelfth Schedule - "public amenities including street
 * lighting, parking lots, bus stops and public conveniences". Street lighting
 * is modelled separately because it carries its own fault and energy record;
 * what remains here is the estate a resident actually stands in front of:
 * parking lots, public conveniences, bus shelters, drinking water posts and
 * community halls.
 *
 * The shape of this module encodes one institutional argument. A public
 * convenience that exists but has no water supply is NOT a working amenity,
 * and a bus shelter recorded on an asset register but broken on the ground is
 * a liability rather than a service. That is why availability and CONDITION
 * are carried on the same record and must be reported together - a bare count
 * of facilities is the single most misleading figure a corporation can publish
 * about its amenities, and it is the figure most often published.
 *
 * The second argument is about the denominator. RESIDENTS PER PUBLIC TOILET
 * SEAT is the honest measure, not the number of toilet blocks: it is the
 * Swachh Bharat measure, it is what a facility count conceals, and it is the
 * figure that decides whether a woman can move through the city for a full day
 * without planning her route around where she can relieve herself. A ward with
 * forty blocks of four seats is not better served than a ward with ten blocks
 * of twenty, and only the seat denominator says so.
 *
 * The third is about parking. Parking is a DEMAND-MANAGEMENT instrument before
 * it is a revenue line. Bays per thousand registered vehicles governs whether
 * a carriageway is a road or a car park; the monthly collection is a by-product
 * of pricing that instrument correctly, and reading it the other way round is
 * how a corporation ends up building parking it cannot afford to police.
 *
 * Figures are modelled demonstration data, as everywhere else in this platform.
 * No municipal amenity register is contacted.
 */

/* ==========================================================================
   Vocabulary
   ========================================================================== */

/**
 * The classes of public amenity this module holds. Street lighting is
 * deliberately absent - it has its own surface, its own fault register and its
 * own energy accounting, and duplicating it here would report the same estate
 * twice under two different totals.
 */
export type AmenityKind =
  | 'parking-lot'
  | 'public-toilet'
  | 'bus-shelter'
  | 'drinking-water-post'
  | 'community-hall'

function build$AMENITY_KIND_LABEL(): Record<AmenityKind, string> {
  return {
  'parking-lot': t('Parking Lot'),
  'public-toilet': t('Public Convenience'),
  'bus-shelter': t('Bus Shelter'),
  'drinking-water-post': t('Drinking Water Post'),
  'community-hall': t('Community Hall'),
}
}
export let AMENITY_KIND_LABEL: Record<AmenityKind, string> = build$AMENITY_KIND_LABEL()
registerLayer(() => {
  AMENITY_KIND_LABEL = build$AMENITY_KIND_LABEL()
})

/** What `capacity` counts for each class, so a single column can be read. */
export const AMENITY_CAPACITY_UNIT: Record<AmenityKind, string> = {
  'parking-lot': 'bays',
  'public-toilet': 'seats',
  'bus-shelter': 'seats',
  'drinking-water-post': 'taps',
  'community-hall': 'persons',
}

/**
 * Who runs the amenity day to day. This matters more than it looks: a
 * contractor-run convenience and a corporation-run one fail in different ways
 * and are corrected through different instruments - a penalty clause in one
 * case, a departmental instruction in the other.
 */
export type AmenityOperator = 'corporation' | 'contractor' | 'community'

function build$AMENITY_OPERATOR_LABEL(): Record<AmenityOperator, string> {
  return {
  corporation: t('Corporation'),
  contractor: t('Contractor'),
  community: t('Community Body'),
}
}
export let AMENITY_OPERATOR_LABEL: Record<AmenityOperator, string> = build$AMENITY_OPERATOR_LABEL()
registerLayer(() => {
  AMENITY_OPERATOR_LABEL = build$AMENITY_OPERATOR_LABEL()
})

/* ==========================================================================
   Design benchmarks
   ========================================================================== */

/**
 * Residents a single public toilet seat is expected to serve. Drawn from the
 * URDPFI provision norms for public conveniences at public places rather than
 * from anything this corporation has adopted, and stated here so that every
 * surface which quotes the ratio quotes it against the same standard.
 */
export const RESIDENTS_PER_TOILET_SEAT_BENCHMARK = 500

/**
 * Public parking bays a corporation should hold for every thousand registered
 * vehicles before on-street demand begins to consume carriageway. A planning
 * benchmark, not a statutory one.
 */
export const PARKING_BAYS_PER_1000_VEHICLES_BENCHMARK = 25

/* ==========================================================================
   The amenity itself
   ========================================================================== */

export interface PublicAmenity {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  kind: AmenityKind
  /** Bays for a parking lot, seats for a convenience or shelter, taps for a
   *  water post, persons for a hall. See `AMENITY_CAPACITY_UNIT`. */
  capacity: number
  /** Mean utilisation across the reporting month. Sustained figures above the
   *  high nineties are a capacity finding, not a success. */
  meanOccupancyPct: number
  /** Condition of the facility, on the platform's standard operational bands.
   *  Reported alongside existence, never in place of it. */
  state: OperationalState
  /** Step-free approach, grab rails and a usable entrance width. An amenity
   *  that a wheelchair user cannot enter is not available to them, however it
   *  is counted on the asset register. */
  accessibleToPwD: boolean
  /** Meaningful chiefly for public conveniences, where it is the difference
   *  between a working amenity and a locked room with a signboard. */
  waterSupplyAvailable: boolean
  openComplaints30d: number
  lastServicedAt: IsoDateTime
  /** Parking lots only. Collections, in INR lakh for the reporting month. */
  monthlyRevenueLakh?: number
  operatedBy: AmenityOperator
}

/* ==========================================================================
   The ward gap - what the estate looks like against the people it serves
   ========================================================================== */

export interface WardAmenityGap {
  wardId: string
  /** Every amenity of every class recorded in the ward. */
  amenities: number
  /**
   * Ward residents for every public toilet SEAT available to them - not per
   * block. A block of four seats and a block of twenty are not the same
   * amenity, and reporting blocks is how an inadequate estate is made to look
   * adequate. This is the Swachh Bharat denominator and the figure that
   * decides whether a resident can move through the city.
   */
  populationPerPublicToilet: number
  /**
   * Public parking bays for every thousand registered vehicles in the ward.
   * The demand-management ratio: where it collapses, the shortfall does not
   * disappear, it moves onto the carriageway and becomes a traffic finding.
   */
  parkingBaysPer1000Vehicles: number
  /** Amenities in `at-risk` or `critical` condition, or standing without the
   *  water supply that would make them usable. */
  amenitiesNeedingRepair: number
  state: OperationalState
}

/* ==========================================================================
   Monthly movement
   ========================================================================== */

export interface AmenityTrendPoint {
  month: string
  complaintsRaised: number
  complaintsResolved: number
  /** Parking collections for the month, in INR lakh. */
  parkingRevenueLakh: number
}
