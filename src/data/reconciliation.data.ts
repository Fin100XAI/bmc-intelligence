import { TENANT_ID } from '@/config/municipality.config'
import type {
  AssessmentStatus,
  AssessmentUsage,
  PropertyParcel,
  RegistryRecord,
} from '@/types/revenue-reconciliation'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS } from './reference'
import { CITY_SCALE } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/reconciliation.data.ts
 *
 * THE MUNICIPAL REGISTERS, AND THE DISAGREEMENTS BETWEEN THEM.
 *
 * This layer seeds four registers a corporation genuinely holds - property
 * assessment, water connections, trade licences, and building permissions with
 * their occupancy certificates - and seeds them so that a realistic minority of
 * properties carry a disagreement ACROSS registers.
 *
 * Two design decisions matter more than any figure here.
 *
 * 1. The disagreements are planted in the SOURCE RECORDS, not in the output.
 *    Nothing in this file produces a review candidate. It produces registers.
 *    `src/domains/revenue/reconciliation.ts` then has to rediscover every
 *    disagreement by actually joining the registers on address, survey number,
 *    locality, owner label and coordinate - exactly as it would have to against
 *    real departmental extracts. If the engine's matching is wrong, the
 *    demonstration finds nothing, which is the correct failure mode.
 *
 * 2. The registers DO NOT SHARE A KEY. There is no `parcelId` on a water
 *    connection, because there is no such field in any municipal corporation
 *    in the country. Counterpart records carry the survey number only about
 *    two thirds of the time, and their address lines are independently typed
 *    and abbreviated. That imprecision is not laziness in the seed - it is the
 *    single most important property of the problem, and an engine demonstrated
 *    against clean keys would be demonstrating something that does not exist.
 *
 * The parcel register modelled here is a SAMPLE of each ward's assessment
 * register, not the whole of it. A real deployment reads the full register
 * through the connector layer; the sample exists so the demonstration carries
 * a believable working volume rather than a synthetic million rows.
 *
 * No personal data appears anywhere. Owners are institutional labels
 * ("Owner 4821"), never names, because an assessment review candidate is the
 * last place a demonstration environment should be holding a citizen's
 * identity.
 */

/* ---------------------------------------------------------------------------
 * Modelled locality naming
 *
 * Deliberately built from neutral Indian urban locality morphology rather than
 * a fixed list of Mumbai neighbourhoods: this platform renders any of
 * Maharashtra's municipal corporations, and a Bandra address shown under Nagpur
 * would discredit the screen it appears on.
 * ------------------------------------------------------------------------- */

const LOCALITY_STEMS = [
  'Shivaji', 'Gandhi', 'Ambedkar', 'Tilak', 'Shastri', 'Nehru', 'Sahyadri', 'Godavari',
  'Krishna', 'Vasant', 'Ganesh', 'Laxmi', 'Sai', 'Vishrant', 'Anand', 'Pragati',
  'Samarth', 'Deep', 'Mangal', 'Suryodaya',
] as const

const LOCALITY_SUFFIXES = ['Nagar', 'Peth', 'Colony', 'Wadi', 'Layout', 'Vihar', 'Puram', 'Park'] as const

const STREET_TYPES = ['Road', 'Marg', 'Cross Road', 'Street', 'Lane'] as const

/**
 * Abbreviations a clerk in another department would plausibly have typed.
 * Applied to counterpart records so the address signal degrades the way it
 * degrades in reality, and the match score has something real to measure.
 */
function build$ADDRESS_ABBREVIATIONS(): Array<[RegExp, string]> {
  return [
  [/\bRoad\b/g, t('Rd')],
  [/\bCross Road\b/g, t('Cr Rd')],
  [/\bStreet\b/g, t('St')],
  [/\bBuilding\b/g, t('Bldg')],
  [/\bNagar\b/g, t('Ngr')],
  [/\bColony\b/g, t('Cly')],
]
}
let ADDRESS_ABBREVIATIONS: Array<[RegExp, string]> = build$ADDRESS_ABBREVIATIONS()
registerLayer(() => {
  ADDRESS_ABBREVIATIONS = build$ADDRESS_ABBREVIATIONS()
})

/* ---------------------------------------------------------------------------
 * Money scale
 * ------------------------------------------------------------------------- */

/**
 * Rateable value carried by a square metre of ordinary residential floor area,
 * in rupees, written for Brihanmumbai.
 *
 * Every other magnitude in this file is derived from it, so there is exactly
 * one number to correct if the assumption is wrong - and it is stated as an
 * assumption rather than buried inside an expression, because a rateable value
 * is the output of a policy instrument (the capital value rules, the ready
 * reckoner, the user-category factors) that no demonstration should imply it
 * has reproduced.
 */
const BASE_RATEABLE_PER_SQM = 5200

/**
 * Rupees per resident against Brihanmumbai. A demand is a RATE against a
 * quantity (the parcel) that is not itself scaled, so only the rate moves - the
 * same reasoning `finance.data.ts` applies to its per-property demand figures.
 */
function demandRate(): number {
  return CITY_SCALE.budget / Math.max(CITY_SCALE.population, 1e-6)
}

/* ---------------------------------------------------------------------------
 * Planted conditions
 * ------------------------------------------------------------------------- */

/**
 * The condition a parcel carries in the seed. Each one is expressed purely as
 * a state of the underlying registers - never as a flag the engine could read
 * directly.
 */
type PlantedCondition =
  | 'clean'
  /** Occupancy certificate issued; assessment left at the construction rate. */
  | 'oc-not-reflected'
  /** Sanctioned built-up area materially exceeds the assessed area. */
  | 'area-variance'
  /** Water connection live against a parcel never brought to assessment. */
  | 'connection-without-assessment'
  /** Water connection live where no assessment record exists at all. */
  | 'connection-without-parcel'
  /** Commercial trade licence at an address assessed as residential. */
  | 'usage-mismatch'
  /** Consumption pattern inconsistent with a residential assessment. */
  | 'consumption-signal'
  /**
   * A disagreement with an entirely lawful explanation. Seeded deliberately so
   * the worklist contains candidates that SHOULD be closed with no action - a
   * demonstration in which every candidate converts teaches an assessor to
   * trust the engine more than it has earned.
   */
  | 'lawful-exemption'

/**
 * How often each condition is planted.
 *
 * Four fifths of the register is clean, and that proportion is load-bearing.
 * An earlier calibration carried a defect on nearly two properties in five,
 * which produced a longer worklist and a far more impressive headline - and
 * an extrapolation to the full register that no assessment department would
 * have believed for a moment. A demonstration that overstates the size of the
 * prize does not win a larger contract; it loses the only audience that could
 * award one.
 */
const CONDITION_WEIGHTS: ReadonlyArray<readonly [PlantedCondition, number]> = [
  ['clean', 80],
  ['oc-not-reflected', 3],
  ['area-variance', 3.5],
  ['connection-without-assessment', 2.5],
  ['connection-without-parcel', 1.5],
  ['usage-mismatch', 3],
  ['consumption-signal', 3],
  ['lawful-exemption', 3.5],
]

const USAGE_WEIGHTS: ReadonlyArray<readonly [AssessmentUsage, number]> = [
  ['residential', 62],
  ['commercial', 18],
  ['mixed', 10],
  ['industrial', 6],
  ['institutional', 4],
]

const EXEMPTION_GROUNDS = [
  'Place of public religious worship - exempt under the assessment rules',
  'Property vested in the State Government',
  'Registered charitable institution providing free public service',
  'Building used exclusively as a recognised aided school',
] as const

/* ---------------------------------------------------------------------------
 * Register construction
 * ------------------------------------------------------------------------- */

export let PROPERTY_PARCELS: PropertyParcel[] = []
export let REGISTRY_RECORDS: RegistryRecord[] = []

/** Index by id, so the engine and services need not re-scan the register. */
export let PARCEL_BY_ID: Map<string, PropertyParcel> = new Map()
export let REGISTRY_BY_ID: Map<string, RegistryRecord> = new Map()

/** The seeded condition per parcel, retained only for the register builders. */
interface SeededParcel {
  parcel: PropertyParcel
  condition: PlantedCondition
  /** Sanctioned area on the building permission, where one exists. */
  sanctionedAreaSqm?: number
}

function localityFor(wardIndex: number, n: number): string {
  const r = det(`recon:locality:${wardIndex}:${n}`)
  return `${r.pick(LOCALITY_STEMS)} ${r.pick(LOCALITY_SUFFIXES)}`
}

/**
 * Counterpart coordinate for the same property.
 *
 * Deliberately NOT the parcel's own coordinate. Two departments geocode a
 * property independently - off a plan, off a meter location, off a doorstep
 * capture - and land within a few dozen metres of one another, not on the same
 * point. Copying the coordinate across would have made proximity a perfect
 * discriminator and turned the whole matching problem into a lookup, which is
 * precisely the false comfort this engine must not be demonstrated under.
 */
function nearby(geo: PropertyParcel['geo'], r: ReturnType<typeof det>): PropertyParcel['geo'] {
  return {
    lat: Math.round((geo.lat + r.float(-0.0004, 0.0004)) * 1e5) / 1e5,
    lng: Math.round((geo.lng + r.float(-0.0004, 0.0004)) * 1e5) / 1e5,
  }
}

/**
 * The owner label as the OTHER department recorded it.
 *
 * Registers disagree about people at least as often as they disagree about
 * buildings. A property changes hands and only one department is told; a trade
 * licence is held by the occupier rather than the owner; a water connection
 * stays in the name of the person who applied for it two decades ago. Copying
 * the owner across every register would have handed the matcher a signal it
 * does not get in reality.
 */
function counterpartOwner(parcel: PropertyParcel, r: ReturnType<typeof det>): string {
  if (r.chance(0.62)) return parcel.ownerLabel
  return t('Owner {0} (name withheld)', r.int(1000, 9999))
}

/**
 * The locality as the other department wrote it. Municipal locality naming is
 * not controlled vocabulary - a minority of records carry a neighbouring or
 * historic name for the same ground.
 */
function counterpartLocality(parcel: PropertyParcel, r: ReturnType<typeof det>): string {
  if (r.chance(0.84)) return parcel.locality
  return `${r.pick(LOCALITY_STEMS)} ${r.pick(LOCALITY_SUFFIXES)}`
}

function abbreviate(address: string, r: ReturnType<typeof det>): string {
  // Counterpart registers were typed by a different department on a different
  // day. Roughly half abbreviate; a minority also drop the unit prefix.
  let out = address
  if (r.chance(0.55)) {
    for (const [pattern, replacement] of ADDRESS_ABBREVIATIONS) {
      out = out.replace(pattern, replacement)
    }
  }
  if (r.chance(0.22)) {
    out = out.replace(/^(Plot|Unit|Shop|Flat)\s\d+,\s/, '')
  }
  return out
}

function buildParcels(): SeededParcel[] {
  const rate = demandRate()
  const out: SeededParcel[] = []

  WARDS.forEach((ward, wardIndex) => {
    const wr = det(`recon:ward:${ward.id}`)
    // A sample of the ward's register, not the whole of it. Held roughly
    // constant across corporations: the number of WARDS already varies, and
    // scaling the sample as well would leave a small corporation with too few
    // rows for any of the distributions below to read as real.
    const count = wr.int(55, 95)

    for (let i = 0; i < count; i += 1) {
      const r = det(`recon:parcel:${ward.id}:${i}`)
      const condition = r.weighted(CONDITION_WEIGHTS)
      const locality = localityFor(wardIndex, r.int(0, 11))
      const streetNo = r.int(1, 88)
      const street = `${r.pick(LOCALITY_STEMS)} ${r.pick(STREET_TYPES)}`
      const unitKind = r.pick(['Plot', 'Unit', 'Shop', 'Flat'] as const)
      const addressLine = `${unitKind} ${r.int(1, 240)}, ${streetNo} ${street}, ${locality}`

      // Usage. A usage-mismatch parcel is residential on the register by
      // construction - that disagreement is the whole point of the condition.
      const usage: AssessmentUsage =
        condition === 'usage-mismatch' || condition === 'consumption-signal'
          ? 'residential'
          : r.weighted(USAGE_WEIGHTS)

      const status: AssessmentStatus =
        condition === 'oc-not-reflected'
          ? 'under-construction'
          : condition === 'connection-without-assessment'
            ? 'not-assessed'
            : condition === 'lawful-exemption'
              ? 'exempt'
              : r.chance(0.04)
                ? 'under-appeal'
                : 'assessed'

      const assessedAreaSqm = Math.round(
        usage === 'industrial'
          ? r.float(320, 1800)
          : usage === 'commercial'
            ? r.float(38, 420)
            : usage === 'institutional'
              ? r.float(180, 1200)
              : r.float(32, 168),
      )

      // Rateable value tracks area and usage; the multipliers are modelled and
      // deliberately flat, because a believable capital-value formula is a
      // policy instrument and not something a demonstration should imply it
      // has reproduced.
      const usageMultiplier =
        usage === 'commercial' ? 3.1 : usage === 'industrial' ? 2.4 : usage === 'mixed' ? 1.8 : usage === 'institutional' ? 1.2 : 1
      const rateableValue = Math.round(
        assessedAreaSqm * usageMultiplier * r.float(0.7, 1.35) * BASE_RATEABLE_PER_SQM * rate,
      )

      const annualDemand =
        status === 'exempt' || status === 'not-assessed'
          ? 0
          : status === 'under-construction'
            ? Math.round(rateableValue * 0.0155 * r.float(0.25, 0.4))
            : Math.round(rateableValue * 0.0155 * r.float(0.86, 1.14))

      const parcel: PropertyParcel = {
        id: `parcel-${ward.id}-${i}`,
        tenantId: TENANT_ID,
        assessmentNumber: `${ward.code.replace(/[^A-Za-z0-9]/g, '')}-${String(r.int(10000, 99999))}-${r.int(1, 9)}`,
        surveyNumber: `CTS ${r.int(101, 4890)}/${r.int(1, 34)}`,
        wardId: ward.id,
        locality,
        addressLine,
        ownerLabel: `Owner ${r.int(1000, 9999)} (name withheld)`,
        usage,
        status,
        assessedAreaSqm,
        rateableValue,
        annualDemand,
        lastAssessedAt: isoDaysFromAnchor(-r.int(120, 3200)),
        exemptionGround: status === 'exempt' ? r.pick(EXEMPTION_GROUNDS) : undefined,
        geo: {
          lat: Math.round((ward.centroid.lat + r.float(-0.014, 0.014)) * 1e5) / 1e5,
          lng: Math.round((ward.centroid.lng + r.float(-0.014, 0.014)) * 1e5) / 1e5,
        },
      }

      // The sanctioned area on the building permission. Where the condition is
      // an area variance it materially exceeds the assessed area; otherwise it
      // agrees with it to within the tolerance an assessment would accept.
      const sanctionedAreaSqm =
        condition === 'area-variance'
          ? Math.round(assessedAreaSqm * r.float(1.55, 2.9))
          : Math.round(assessedAreaSqm * r.float(0.98, 1.06))

      out.push({ parcel, condition, sanctionedAreaSqm })
    }
  })

  return out
}

/**
 * Builds every counterpart register from the seeded parcels.
 *
 * The `connection-without-parcel` condition is the interesting one: it emits a
 * water connection and then DELETES nothing - the parcel simply never enters
 * the assessment register at all, so the engine has to discover that its best
 * candidate match falls below the confidence floor and route the record to a
 * human matching queue rather than raising a candidate against the wrong
 * property.
 */
function buildRegistryRecords(seeded: SeededParcel[]): RegistryRecord[] {
  const out: RegistryRecord[] = []

  for (const { parcel, condition, sanctionedAreaSqm } of seeded) {
    const r = det(`recon:registry:${parcel.id}`)
    const carrySurvey = (chance: number): string | undefined => (r.chance(chance) ? parcel.surveyNumber : undefined)

    /* --- Water connection ------------------------------------------------ */
    const hasConnection =
      condition === 'connection-without-assessment' ||
      condition === 'connection-without-parcel' ||
      condition === 'consumption-signal' ||
      r.chance(0.72)

    if (hasConnection) {
      const sizeMm = r.pick([15, 20, 25, 40, 50, 80] as const)
      // Consumption is the Tier 3 signal. Where the condition is a consumption
      // pattern it sits far above what the assessed usage would imply.
      const baseConsumption = parcel.usage === 'residential' ? r.float(9, 26) : r.float(30, 180)
      const consumptionKl =
        condition === 'consumption-signal' ? Math.round(r.float(88, 240)) : Math.round(baseConsumption)

      out.push({
        id: `wc-${parcel.id}`,
        tenantId: TENANT_ID,
        source: 'water-connection',
        reference: `WC/${parcel.wardId.slice(-3).toUpperCase()}/${r.int(100000, 999999)}`,
        wardId: parcel.wardId,
        locality: counterpartLocality(parcel, r),
        addressLine: abbreviate(parcel.addressLine, r),
        ownerLabel: counterpartOwner(parcel, r),
        surveyNumber: carrySurvey(0.64),
        issuedAt: isoDaysFromAnchor(-r.int(200, 4200)),
        statedUsage: condition === 'usage-mismatch' ? 'commercial' : parcel.usage,
        attributes: [
          { label: t('Connection size'), value: `${sizeMm} mm` },
          { label: t('Connection category'), value: condition === 'usage-mismatch' ? t('Non-domestic') : parcel.usage === 'residential' ? t('Domestic') : t('Non-domestic') },
          { label: t('Average monthly consumption'), value: `${consumptionKl} kl` },
          { label: t('Metered'), value: r.chance(0.78) ? t('Yes') : t('No - assessed on flat rate') },
          { label: t('Billing status'), value: r.chance(0.86) ? t('Active') : t('Active - arrears outstanding') },
        ],
        geo: nearby(parcel.geo, r),
      })
    }

    /* --- Trade licence --------------------------------------------------- */
    const hasLicence =
      condition === 'usage-mismatch' || parcel.usage === 'commercial' || parcel.usage === 'mixed' || r.chance(0.06)

    if (hasLicence) {
      const trade = r.pick([
        'Retail provision store', 'Eating house', 'Bakery', 'Tailoring unit', 'Printing press',
        'Coaching class', 'Godown and storage', 'Motor repair workshop', 'Beauty parlour', 'Medical store',
      ] as const)
      out.push({
        id: `tl-${parcel.id}`,
        tenantId: TENANT_ID,
        source: 'trade-licence',
        reference: `TL/${r.int(2016, 2026)}/${r.int(10000, 99999)}`,
        wardId: parcel.wardId,
        locality: counterpartLocality(parcel, r),
        addressLine: abbreviate(parcel.addressLine, r),
        ownerLabel: counterpartOwner(parcel, r),
        surveyNumber: carrySurvey(0.38),
        issuedAt: isoDaysFromAnchor(-r.int(90, 2600)),
        statedUsage: 'commercial',
        statedAreaSqm: Math.round(parcel.assessedAreaSqm * r.float(0.4, 0.95)),
        attributes: [
          { label: t('Trade description'), value: trade },
          { label: t('Licence class'), value: r.pick(['A', 'B', 'C'] as const) },
          { label: t('Premises type'), value: r.chance(0.72) ? t('Own premises') : t('Leased premises') },
          { label: t('Validity'), value: r.chance(0.83) ? t('Current') : t('Renewal pending') },
        ],
        geo: nearby(parcel.geo, r),
      })
    }

    /* --- Building permission and occupancy certificate ------------------- */
    const hasApproval = condition === 'area-variance' || condition === 'oc-not-reflected' || r.chance(0.34)

    if (hasApproval && sanctionedAreaSqm) {
      const approvedAt = isoDaysFromAnchor(-r.int(700, 4400))
      out.push({
        id: `ba-${parcel.id}`,
        tenantId: TENANT_ID,
        source: 'building-approval',
        reference: `BP/${parcel.wardId.slice(-3).toUpperCase()}/${r.int(1000, 9999)}`,
        wardId: parcel.wardId,
        locality: counterpartLocality(parcel, r),
        addressLine: abbreviate(parcel.addressLine, r),
        ownerLabel: counterpartOwner(parcel, r),
        surveyNumber: carrySurvey(0.81),
        issuedAt: approvedAt,
        statedAreaSqm: sanctionedAreaSqm,
        statedUsage: parcel.usage,
        attributes: [
          { label: t('Sanctioned built-up area'), value: `${sanctionedAreaSqm} m²` },
          { label: t('Sanctioned floors'), value: String(r.int(1, 14)) },
          { label: t('Permission type'), value: r.pick(['New construction', 'Additions and alterations', 'Redevelopment'] as const) },
          { label: t('Commencement certificate'), value: r.chance(0.9) ? t('Issued') : t('Not on record') },
        ],
        geo: nearby(parcel.geo, r),
      })

      // The occupancy certificate. Issued for every `oc-not-reflected` parcel -
      // that is the disagreement - and for a majority of the rest.
      const ocIssued = condition === 'oc-not-reflected' || r.chance(0.62)
      if (ocIssued) {
        // Part occupancy is one of the lawful explanations for the assessment
        // still sitting at the construction rate, so a realistic minority
        // carry it and the closure path has something true to close against.
        const partOnly = condition === 'oc-not-reflected' ? r.chance(0.18) : r.chance(0.24)
        out.push({
          id: `oc-${parcel.id}`,
          tenantId: TENANT_ID,
          source: 'occupancy-certificate',
          reference: `OC/${parcel.wardId.slice(-3).toUpperCase()}/${r.int(1000, 9999)}`,
          wardId: parcel.wardId,
          locality: parcel.locality,
          addressLine: abbreviate(parcel.addressLine, r),
          ownerLabel: parcel.ownerLabel,
          surveyNumber: carrySurvey(0.76),
          // Always later than the permission it follows.
          issuedAt: isoDaysFromAnchor(-r.int(95, 690)),
          statedAreaSqm: partOnly ? Math.round(sanctionedAreaSqm * r.float(0.35, 0.6)) : sanctionedAreaSqm,
          statedUsage: parcel.usage,
          attributes: [
            { label: t('Certificate type'), value: partOnly ? t('Part occupancy certificate') : t('Full occupancy certificate') },
            { label: t('Area covered'), value: `${partOnly ? Math.round(sanctionedAreaSqm * 0.45) : sanctionedAreaSqm} m²` },
            { label: t('Issued by'), value: 'Building Proposal Department' },
          ],
          geo: parcel.geo,
        })
      }
    }
  }

  return out
}

/* ---------------------------------------------------------------------------
 * Layer registration
 * ------------------------------------------------------------------------- */

registerLayer(() => {
  const seeded = buildParcels()

  // A `connection-without-parcel` property is never entered on the assessment
  // register at all. Its counterpart records are built first and the parcel is
  // then withheld, which is what forces the engine to confront an unmatchable
  // record rather than a conveniently pre-joined one.
  const records = buildRegistryRecords(seeded)
  const withheld = new Set(seeded.filter((s) => s.condition === 'connection-without-parcel').map((s) => s.parcel.id))

  PROPERTY_PARCELS = seeded.filter((s) => !withheld.has(s.parcel.id)).map((s) => s.parcel)
  // Only the water connection survives for a withheld parcel; a property that
  // never reached assessment would not plausibly hold a trade licence and a
  // sanctioned plan on the corporation's own systems too.
  REGISTRY_RECORDS = records.filter((rec) => {
    const parcelId = rec.id.slice(3)
    if (!withheld.has(parcelId)) return true
    return rec.source === 'water-connection'
  })

  PARCEL_BY_ID = new Map(PROPERTY_PARCELS.map((p) => [p.id, p]))
  REGISTRY_BY_ID = new Map(REGISTRY_RECORDS.map((r) => [r.id, r]))
})
