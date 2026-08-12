import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import type {
  AnimalWelfareOperator,
  AnimalWelfareTrendPoint,
  AnimalWelfareUnit,
  AnimalWelfareUnitKind,
  WardAnimalSignal,
} from '@/types/animal-welfare'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS } from './reference'
import { stateFrom } from './city.data'
import { landmarkName } from './naming'
import { CITY_SCALE, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/animal-welfare.data.ts
 *
 * Cattle pounds and prevention of cruelty to animals - Twelfth Schedule
 * function 15.
 *
 * THE MODELLING DECISION THAT MATTERS HERE IS THE LINK BETWEEN INPUT AND
 * OUTCOME. The Animal Birth Control (Dogs) Rules make sterilisation - not
 * removal - the lawful method of controlling the free-roaming dog population,
 * so the sterilisation rate is what the corporation does and the dog bite rate
 * is what residents actually feel. This layer refuses to draw those two
 * independently: a ward's bite rate is DERIVED from its sterilised share, so
 * the wards that have done the work show the outcome, and the chart on the page
 * above shows a real relationship rather than two unrelated seeded series
 * placed side by side and asserted to be connected.
 *
 * Cattle pounds are modelled in the same estate because they are the same
 * statutory function, though what the public wants from them is different:
 * loose cattle on a carriageway are a traffic-safety and nuisance problem
 * before they are a welfare case, which is why impoundings are counted per
 * pound rather than folded into a single animal-handling total.
 *
 * Scale discipline: the SIZE OF THE ESTATE tracks the active corporation
 * through `CITY_SCALE.population`, while per-facility throughput does not - a
 * birth control centre in a small corporation does roughly what one in a large
 * corporation does, there are simply fewer of them. City totals therefore move
 * linearly with population rather than as its square, which is what would
 * happen if both the count and the throughput were scaled.
 *
 * Every export below is a LIVE BINDING, rebuilt on a corporation switch.
 */

/* ==========================================================================
   Live bindings
   ========================================================================== */

export let ANIMAL_WELFARE_UNITS: AnimalWelfareUnit[] = []
export let WARD_ANIMAL_SIGNALS: WardAnimalSignal[] = []
export let ANIMAL_WELFARE_TREND: AnimalWelfareTrendPoint[] = []

/* ==========================================================================
   Vocabulary
   ========================================================================== */

/**
 * One of each kind is placed before the estate is weighted, so that even the
 * smallest corporation is shown running a pound, a clinic and a birth control
 * centre. That is not a generosity of the model - it is the statutory minimum:
 * the duty does not scale away with population.
 */
const GUARANTEED_KINDS: AnimalWelfareUnitKind[] = [
  'sterilisation-centre',
  'veterinary-hospital',
  'cattle-pound',
  'rabies-clinic',
  'animal-shelter',
]

/** The one unit that carries the corporation's own name rather than a locality. */
const CENTRAL_VETERINARY_INDEX = GUARANTEED_KINDS.indexOf('veterinary-hospital')

const KIND_MIX: ReadonlyArray<readonly [AnimalWelfareUnitKind, number]> = [
  ['sterilisation-centre', 5],
  ['rabies-clinic', 4],
  ['animal-shelter', 3],
  ['cattle-pound', 2],
  ['veterinary-hospital', 1],
]

const UNIT_PLACE_KIND: Record<AnimalWelfareUnitKind, string> = {
  'sterilisation-centre': 'Animal Birth Control Centre',
  'cattle-pound': 'Cattle Pound',
  'veterinary-hospital': 'Veterinary Hospital',
  'animal-shelter': 'Animal Shelter',
  'rabies-clinic': 'Anti-Rabies Clinic',
}

function build$MONTH_LABELS() {
  return [t('Feb'), t('Mar'), t('Apr'), t('May'), t('Jun'), t('Jul')]
}
let MONTH_LABELS: ReturnType<typeof build$MONTH_LABELS> = build$MONTH_LABELS()
registerLayer(() => {
  MONTH_LABELS = build$MONTH_LABELS()
})

/**
 * Programme ramp and outcome decline over the six months shown. Sterilisation
 * capacity was built up over the period and the bite rate followed it down -
 * with the lag a real programme has, because a sterilised dog reduces the
 * population it would otherwise have produced rather than removing itself.
 */
const STERILISATION_RAMP = [0.66, 0.73, 0.8, 0.87, 0.94, 1]
const VACCINATION_RAMP = [0.71, 0.83, 0.78, 0.91, 0.96, 1]
const BITE_DECLINE = [1.36, 1.29, 1.21, 1.13, 1.06, 1]

/* ==========================================================================
   Rebuild
   ========================================================================== */

registerLayer(() => {
  const corp = activeCorporation
  const scale = CITY_SCALE

  /* ------------------------------------------------------------- The estate */

  // Brihanmumbai operates on the order of twenty-eight units of this kind
  // across its birth control centres, pounds, shelters and clinics. The floor
  // holds the five statutory minimums in place for the smallest corporation.
  const unitCount = scaledCount(28, scale.population, GUARANTEED_KINDS.length)

  ANIMAL_WELFARE_UNITS = Array.from({ length: unitCount }, (_, i) => {
    const r = det(`animal-unit:${i}`)
    const ward = r.pick(WARDS)
    const kind: AnimalWelfareUnitKind = GUARANTEED_KINDS[i] ?? r.weighted(KIND_MIX)

    const capacity =
      kind === 'animal-shelter'
        ? r.int(80, 340)
        : kind === 'sterilisation-centre'
          ? r.int(60, 220)
          : kind === 'cattle-pound'
            ? r.int(40, 180)
            : kind === 'veterinary-hospital'
              ? r.int(30, 120)
              : r.int(10, 40)

    // Shelters and pounds routinely hold more animals than they were built for.
    // The occupancy factor is allowed above 1 because suppressing that is
    // exactly how an overcrowding finding disappears from a report.
    const occupancy =
      kind === 'rabies-clinic'
        ? r.float(0.08, 0.44)
        : kind === 'animal-shelter' || kind === 'cattle-pound'
          ? r.float(0.62, 1.34)
          : r.float(0.45, 1.02)
    const animalsInCare = Math.max(0, Math.round(capacity * occupancy))

    const sterilisations30d =
      kind === 'sterilisation-centre'
        ? r.int(180, 620)
        : kind === 'veterinary-hospital'
          ? r.int(60, 240)
          : kind === 'animal-shelter'
            ? r.int(0, 90)
            : 0

    // A dog on the table for sterilisation is vaccinated in the same visit,
    // which is why birth control centres carry a vaccination count at all.
    const rabiesVaccinations30d =
      kind === 'rabies-clinic'
        ? r.int(400, 1400)
        : kind === 'veterinary-hospital'
          ? r.int(150, 600)
          : kind === 'sterilisation-centre'
            ? r.int(120, 520)
            : kind === 'animal-shelter'
              ? r.int(40, 260)
              : 0

    const cattleImpounded30d = kind === 'cattle-pound' ? r.int(12, 140) : 0

    const operatedBy: AnimalWelfareOperator =
      kind === 'cattle-pound' || kind === 'veterinary-hospital'
        ? 'corporation'
        : kind === 'rabies-clinic'
          ? r.weighted([['corporation', 6], ['ngo-partner', 4]] as const)
          : r.weighted([['ngo-partner', 8], ['corporation', 2]] as const)

    // Condition falls with overcrowding and with the age of the last
    // inspection - the two things that actually degrade a holding facility.
    const daysSinceInspection = r.int(2, 240)
    const overcrowdingPenalty = Math.max(0, occupancy - 1) * 42
    const inspectionPenalty = Math.max(0, daysSinceInspection - 90) * 0.09
    const condition = Math.max(12, Math.min(98, r.round(52, 97, 0) - overcrowdingPenalty - inspectionPenalty))

    // The corporation runs one central veterinary hospital carrying the city's
    // own name; everything else takes the name of the locality it stands in,
    // drawn from the active corporation's own published localities.
    const name =
      i === CENTRAL_VETERINARY_INDEX
        ? t('{0} Municipal Veterinary Hospital', corp.city)
        : landmarkName(`animal-unit:${i}`, UNIT_PLACE_KIND[kind])

    return {
      id: `awu-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      name,
      wardId: ward.id,
      kind,
      capacity,
      animalsInCare,
      sterilisations30d,
      rabiesVaccinations30d,
      cattleImpounded30d,
      operatedBy,
      state: stateFrom(condition),
      lastInspectedAt: isoDaysFromAnchor(-daysSinceInspection),
    }
  })

  /* ------------------------------------------------------------ The outcome */

  WARD_ANIMAL_SIGNALS = WARDS.map((ward) => {
    const r = det(`animal-ward:${ward.id}`)

    // Free-roaming dog population is modelled at one dog per 95-150 residents,
    // the band Indian municipal dog censuses have repeatedly landed in. It is
    // an estimate and is labelled as one on the page: nobody counts strays
    // exactly, and a platform that presented this as a census would be lying.
    const estimatedStrayPopulation = Math.max(120, Math.round(ward.population / r.int(95, 150)))
    const sterilisedPct = r.round(34, 89, 1)

    // The outcome is derived from the input rather than drawn beside it. A ward
    // that has sterilised most of its dogs shows the lower bite rate it has
    // earned; the residual term is the floor no programme removes, because
    // sterilisation reduces the population and its aggression, it does not
    // empty the street.
    const untreatedRate = r.float(3.6, 7.8)
    const suppression = 1 - (sterilisedPct / 100) * 0.62
    const bitesPer10kPopulation =
      Math.round(Math.max(0.6, untreatedRate * suppression + r.float(-0.35, 0.35)) * 10) / 10
    const dogBites30d = Math.max(1, Math.round((bitesPer10kPopulation * ward.population) / 10_000))

    return {
      wardId: ward.id,
      tenantId: TENANT_ID,
      estimatedStrayPopulation,
      sterilisedPct,
      dogBites30d,
      bitesPer10kPopulation,
    }
  })

  /* ------------------------------------------------------- Movement in time */

  // The current month is the sum of what the estate and the wards actually
  // report, so the trend's last point reconciles with the tables on the page.
  // Earlier months are back-cast from it along the programme ramp.
  const currentSterilisations = ANIMAL_WELFARE_UNITS.reduce((s, u) => s + u.sterilisations30d, 0)
  const currentVaccinations = ANIMAL_WELFARE_UNITS.reduce((s, u) => s + u.rabiesVaccinations30d, 0)
  const currentBites = WARD_ANIMAL_SIGNALS.reduce((s, w) => s + w.dogBites30d, 0)

  ANIMAL_WELFARE_TREND = MONTH_LABELS.map((month, i) => {
    const r = det(`animal-trend:${i}`)
    return {
      month,
      sterilisations: Math.max(1, Math.round(currentSterilisations * (STERILISATION_RAMP[i] ?? 1) * r.float(0.97, 1.03))),
      vaccinations: Math.max(1, Math.round(currentVaccinations * (VACCINATION_RAMP[i] ?? 1) * r.float(0.95, 1.05))),
      dogBites: Math.max(1, Math.round(currentBites * (BITE_DECLINE[i] ?? 1) * r.float(0.97, 1.03))),
    }
  })
})

/* ==========================================================================
   Roll-ups
   ========================================================================== */

export function animalWelfareUnitsInWard(wardId: string): AnimalWelfareUnit[] {
  return ANIMAL_WELFARE_UNITS.filter((u) => u.wardId === wardId)
}

export function animalSignalForWard(wardId: string): WardAnimalSignal | undefined {
  return WARD_ANIMAL_SIGNALS.find((s) => s.wardId === wardId)
}
