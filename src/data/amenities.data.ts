import { TENANT_ID } from '@/config/municipality.config'
import type {
  AmenityKind,
  AmenityOperator,
  AmenityTrendPoint,
  PublicAmenity,
  WardAmenityGap,
} from '@/types/amenities'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS } from './reference'
import { stateFrom } from './city.data'
import { landmarkName } from './naming'
import { CITY_SCALE, scaled, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/amenities.data.ts
 *
 * PARKING & PUBLIC AMENITIES - function 17 of the Twelfth Schedule, less
 * street lighting, which is modelled on its own surface with its own fault and
 * energy record.
 *
 * What is seeded here is the amenity estate a resident meets on foot: parking
 * lots, public conveniences, bus shelters, drinking water posts and community
 * halls. Two disciplines govern the shape of it.
 *
 * FIRST, existence and condition are seeded together and never apart. A public
 * convenience with no water supply is not a working amenity - it is a locked
 * room with a signboard - so the water flag suppresses the condition score
 * rather than sitting beside it as decoration, and the ward gap counts such a
 * facility as needing repair however recently it was built. A corporation that
 * reports a bare count of facilities is reporting the one number that survives
 * every failure on the ground.
 *
 * SECOND, the denominator is seats, not blocks. Residents per public toilet
 * SEAT is the Swachh Bharat measure and the honest one: forty blocks of four
 * seats do not serve a ward better than ten blocks of twenty, and only the
 * seat ratio says so. It is also the figure that determines whether a woman
 * can be out of her home for a full working day, which is why it is carried at
 * ward level and ranked rather than averaged into a city total and forgotten.
 *
 * Parking follows the same logic from the other side. Bays per thousand
 * registered vehicles is a demand-management ratio; the monthly collection is
 * what falls out of pricing that ratio correctly. Revenue is modelled from
 * bays and occupancy, never the reverse.
 *
 * Everything obeys the platform's seed discipline: volumes track the active
 * corporation through `CITY_SCALE`, place names are built from the
 * corporation's own localities, every figure comes from a seeded PRNG so the
 * picture is identical on every reload, and the whole layer is rebuilt on a
 * corporation switch.
 */

/* ==========================================================================
   Live bindings
   ========================================================================== */

export let PUBLIC_AMENITIES: PublicAmenity[] = []
export let WARD_AMENITY_GAPS: WardAmenityGap[] = []
export let AMENITY_TREND: AmenityTrendPoint[] = []

/* ==========================================================================
   Vocabulary
   ========================================================================== */

/** Place-kind suffixes, so an amenity reads like something a resident would
 *  ask directions to rather than like an asset-register row. */
function build$AMENITY_PLACE_KINDS(): Record<AmenityKind, string[]> {
  return {
  'parking-lot': [t('Parking Lot'), t('Pay and Park'), t('Public Parking'), t('Multi-Storey Parking')],
  'public-toilet': [t('Public Convenience'), t('Shauchalaya'), t('Sanitation Block'), t('Community Toilet Block')],
  'bus-shelter': [t('Bus Shelter'), t('Bus Stop'), t('Passenger Shelter')],
  'drinking-water-post': [t('Piyau'), t('Drinking Water Post'), t('Water Kiosk')],
  'community-hall': [t('Samaj Mandir'), t('Community Hall'), t('Nagrik Sabhagruha'), t('Welfare Centre')],
}
}
let AMENITY_PLACE_KINDS: Record<AmenityKind, string[]> = build$AMENITY_PLACE_KINDS()
registerLayer(() => {
  AMENITY_PLACE_KINDS = build$AMENITY_PLACE_KINDS()
})

/** How likely each class is to have a working water connection. Meaningful
 *  chiefly for conveniences, where it decides whether the facility works at
 *  all; carried for the rest because a shelter or a lot with a tap is a
 *  materially better amenity than one without. */
const WATER_SUPPLY_LIKELIHOOD: Record<AmenityKind, number> = {
  'parking-lot': 0.34,
  'public-toilet': 0.71,
  'bus-shelter': 0.11,
  'drinking-water-post': 0.89,
  'community-hall': 0.85,
}

/** Step-free approach, grab rails, usable entrance width. Conveniences and
 *  shelters are the worst served, which is the finding rather than an
 *  accident of the model. */
const ACCESSIBILITY_LIKELIHOOD: Record<AmenityKind, number> = {
  'parking-lot': 0.44,
  'public-toilet': 0.29,
  'bus-shelter': 0.26,
  'drinking-water-post': 0.21,
  'community-hall': 0.58,
}

function build$MONTH_LABELS() {
  return [t('Feb'), t('Mar'), t('Apr'), t('May'), t('Jun'), t('Jul')]
}
let MONTH_LABELS: ReturnType<typeof build$MONTH_LABELS> = build$MONTH_LABELS()
registerLayer(() => {
  MONTH_LABELS = build$MONTH_LABELS()
})

/** Months when the monsoon breaks. Complaint volumes rise, resolution slows
 *  and paid parking collections fall - all three at once, every year. */
function build$MONSOON_MONTHS() {
  return new Set([t('Jun'), t('Jul')])
}
let MONSOON_MONTHS: ReturnType<typeof build$MONSOON_MONTHS> = build$MONSOON_MONTHS()
registerLayer(() => {
  MONSOON_MONTHS = build$MONSOON_MONTHS()
})

/* ==========================================================================
   Rebuild
   ========================================================================== */

registerLayer(() => {
  const scale = CITY_SCALE

  /* ------------------------------------------------------------ Amenities */

  // Roughly sixteen hundred amenities across Brihanmumbai's five classes,
  // scaled by residents served. The floor keeps the smallest corporation's
  // estate populated rather than leaving a ward without a single facility.
  const amenityCount = scaledCount(1600, scale.population, 36)

  PUBLIC_AMENITIES = Array.from({ length: amenityCount }, (_, i) => {
    const r = det(`amenity:${i}`)
    // Cycled rather than sampled so every ward carries part of the estate.
    // The inequality that matters then comes from ward POPULATION against a
    // comparable number of facilities, which is exactly the finding.
    const ward = WARDS[i % WARDS.length]!
    const kind = r.weighted([
      ['public-toilet', 8], ['bus-shelter', 6], ['drinking-water-post', 3],
      ['parking-lot', 2], ['community-hall', 1],
    ] as const) as AmenityKind

    const capacity =
      kind === 'parking-lot' ? r.int(28, 420)
      : kind === 'public-toilet' ? r.int(4, 32)
      : kind === 'bus-shelter' ? r.int(3, 12)
      : kind === 'drinking-water-post' ? r.int(1, 6)
      : r.int(60, 400)

    const meanOccupancyPct =
      kind === 'parking-lot' ? r.round(38, 99, 1)
      : kind === 'public-toilet' ? r.round(46, 98, 1)
      : kind === 'bus-shelter' ? r.round(19, 92, 1)
      : kind === 'drinking-water-post' ? r.round(31, 96, 1)
      : r.round(11, 74, 1)

    const waterSupplyAvailable = r.chance(WATER_SUPPLY_LIKELIHOOD[kind])

    // Condition, then the water penalty. A convenience standing without a
    // supply cannot be described as operational whatever its brickwork looks
    // like, so the penalty is applied to the score the state is read from
    // rather than reported as a separate footnote nobody reaches.
    const built = r.round(36, 98, 0)
    const condition = Math.max(
      4,
      Math.round(built - (kind === 'public-toilet' && !waterSupplyAvailable ? 28 : 0)),
    )

    // Complaints follow condition, and rise again where a facility is worked
    // hard: a well-kept lot at ninety-eight per cent occupancy still generates
    // grievances, because the queue itself is the grievance.
    const pressure = Math.max(0, meanOccupancyPct - 82) / 18
    const openComplaints30d = Math.max(
      0,
      Math.round(r.int(0, Math.max(1, Math.round((100 - condition) / 5))) + pressure * r.float(0, 5)),
    )

    // Servicing intervals are the cause, not the symptom: the worst-conditioned
    // facilities are the ones nobody has been sent to.
    const lastServicedAt = isoDaysFromAnchor(-r.int(1, condition >= 70 ? 45 : condition >= 50 ? 130 : 320))

    const operatedBy = (
      kind === 'public-toilet'
        ? r.weighted([['contractor', 6], ['community', 5], ['corporation', 4]] as const)
        : kind === 'community-hall'
          ? r.weighted([['community', 6], ['corporation', 4], ['contractor', 1]] as const)
          : r.weighted([['corporation', 6], ['contractor', 5], ['community', 1]] as const)
    ) as AmenityOperator

    // Collections are derived from bays and how full they run, then carried
    // into the active corporation's money scale. Parking only - nothing else
    // in this estate is charged for, and pretending otherwise would put a
    // revenue line against a drinking water post.
    const monthlyRevenueLakh =
      kind === 'parking-lot'
        ? scaled(capacity * (meanOccupancyPct / 100) * r.float(0.016, 0.052), scale.budget, 0.1)
        : undefined

    return {
      id: `amn-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      name: landmarkName(`amenity:${i}`, r.pick(AMENITY_PLACE_KINDS[kind])),
      wardId: ward.id,
      kind,
      capacity,
      meanOccupancyPct,
      state: stateFrom(condition),
      accessibleToPwD: r.chance(ACCESSIBILITY_LIKELIHOOD[kind]),
      waterSupplyAvailable,
      openComplaints30d,
      lastServicedAt,
      ...(monthlyRevenueLakh === undefined ? {} : { monthlyRevenueLakh }),
      operatedBy,
    }
  })

  /* ----------------------------------------------------------- Ward gaps */

  WARD_AMENITY_GAPS = WARDS.map((ward) => {
    const r = det(`amenity:gap:${ward.id}`)
    const rows = PUBLIC_AMENITIES.filter((a) => a.wardId === ward.id)

    // Only seats a resident could actually use are counted. A block with no
    // water supply, or one in critical condition, is not a seat available to
    // anybody, and including it would flatter the ratio in precisely the wards
    // where it is worst.
    const usableSeats = rows
      .filter((a) => a.kind === 'public-toilet' && a.waterSupplyAvailable && a.state !== 'critical')
      .reduce((s, a) => s + a.capacity, 0)
    const populationPerPublicToilet = usableSeats > 0 ? Math.round(ward.population / usableSeats) : ward.population

    // Registered vehicles per resident. Motorisation varies across a city -
    // an office district holds vehicles that sleep elsewhere - so the rate is
    // seeded per ward rather than applied flat.
    const vehicles = Math.max(500, Math.round(ward.population * r.float(0.19, 0.36)))
    const bays = rows.filter((a) => a.kind === 'parking-lot').reduce((s, a) => s + a.capacity, 0)
    const parkingBaysPer1000Vehicles = Math.round((bays / vehicles) * 1000 * 10) / 10

    const amenitiesNeedingRepair = rows.filter(
      (a) =>
        a.state === 'at-risk' ||
        a.state === 'critical' ||
        (a.kind === 'public-toilet' && !a.waterSupplyAvailable),
    ).length

    const toiletScore = Math.max(0, Math.min(100, 100 - (populationPerPublicToilet / 2500) * 100))
    const parkingScore = Math.max(0, Math.min(100, (parkingBaysPer1000Vehicles / 25) * 100))
    const repairScore = rows.length > 0 ? 100 - (amenitiesNeedingRepair / rows.length) * 100 : 0

    return {
      wardId: ward.id,
      amenities: rows.length,
      populationPerPublicToilet,
      parkingBaysPer1000Vehicles,
      amenitiesNeedingRepair,
      state: stateFrom(toiletScore * 0.45 + repairScore * 0.35 + parkingScore * 0.2),
    }
  })

  /* -------------------------------------------------------- Monthly trend */

  const openComplaints = PUBLIC_AMENITIES.reduce((s, a) => s + a.openComplaints30d, 0)
  const monthlyRevenue = PUBLIC_AMENITIES.reduce((s, a) => s + (a.monthlyRevenueLakh ?? 0), 0)

  AMENITY_TREND = MONTH_LABELS.map((month, i) => {
    const r = det(`amenity:trend:${month}`)
    const monsoon = MONSOON_MONTHS.has(month)
    // Complaints rise through the monsoon and resolution falls at the same
    // time, which is why the two are charted together rather than as a single
    // net figure that conceals the gap.
    const raised = Math.max(
      1,
      Math.round(openComplaints * (0.88 + i * 0.035) * (monsoon ? r.float(1.24, 1.52) : r.float(0.92, 1.08))),
    )
    const resolved = Math.round(raised * (monsoon ? r.float(0.61, 0.79) : r.float(0.79, 0.97)))
    return {
      month,
      complaintsRaised: raised,
      complaintsResolved: resolved,
      // Paid parking collections fall in the monsoon: fewer discretionary
      // trips, and less enforcement on the ground to collect what is due.
      parkingRevenueLakh:
        Math.round(monthlyRevenue * (0.9 + i * 0.03) * (monsoon ? r.float(0.74, 0.9) : r.float(0.95, 1.09)) * 10) / 10,
    }
  })
})
