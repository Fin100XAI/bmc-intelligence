import { TENANT_ID } from '@/config/municipality.config'
import type { BurialGround, BurialGroundCommunity, BurialGroundKind, DeathcareTrendPoint } from '@/types/deathcare'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS, wardName } from './reference'
import { stateFrom } from './city.data'
import { landmarkName, localityFor } from './naming'
import { CITY_SCALE, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/deathcare.data.ts
 *
 * Cemeteries, burial grounds and crematoria - Twelfth Schedule function 14.
 *
 * Land for the dead is finite and non-renewable. Every interment consumes
 * ground that is not returned, and a burial ground that fills does not refill.
 * That single property makes this duty unlike every other estate the platform
 * models: a road can be resurfaced, a pump can be replaced, a ward can be
 * re-staffed, but a full burial ground can only be replaced by acquiring more
 * land - and acquiring land for a burial ground is among the hardest things a
 * municipal corporation ever does. It needs a willing seller, a consenting
 * neighbourhood and a community that accepts the site, and the lead time is
 * measured in years, not budget cycles.
 *
 * So a crematorium reaching capacity is a crisis that arrives without warning
 * and cannot be solved quickly. The purpose of this layer is to make it arrive
 * with warning instead - by holding years-remaining against every facility,
 * years before the number becomes urgent.
 *
 * The measure that carries the most weight here is the family's wait at the
 * gate. It is stated in hours because that is how it is experienced, and it is
 * the dignity of the service expressed as a figure a commissioner can act on.
 *
 * NO REGISTER OF THE DEAD IS HELD HERE. These are facilities and their
 * capacity. There is no interment record, no name, no plot allotment and no
 * family detail anywhere in this layer, and there must never be one. The
 * register belongs to the Registrar and to the ground's own managing trust or
 * committee, which is where it should stay.
 *
 * Everything follows the platform's seeding discipline: counts and volumes
 * track the active corporation through `CITY_SCALE`, names are built from the
 * corporation's own published localities, every figure is drawn from a seeded
 * PRNG so the picture is identical on every reload, and the whole layer is
 * rebuilt on a corporation switch.
 */

/* ==========================================================================
   Live bindings
   ========================================================================== */

export let BURIAL_GROUNDS: BurialGround[] = []
export let DEATHCARE_TREND: DeathcareTrendPoint[] = []

/* ==========================================================================
   Vocabulary
   ========================================================================== */

/**
 * Facility labels as Maharashtra corporations actually name them on their own
 * ward lists. A crematorium is a "Smashan Bhoomi" on the board at the gate,
 * and a platform that renders it as "Facility 12" is not describing the city
 * anyone lives in.
 */
function build$HINDU_CREMATORIUM_LABELS() {
  return [t('Smashan Bhoomi'), t('Vaikunth Dham'), t('Amrutdham'), t('Cremation Ground')]
}
let HINDU_CREMATORIUM_LABELS: ReturnType<typeof build$HINDU_CREMATORIUM_LABELS> = build$HINDU_CREMATORIUM_LABELS()
registerLayer(() => {
  HINDU_CREMATORIUM_LABELS = build$HINDU_CREMATORIUM_LABELS()
})
function build$BUDDHIST_CREMATORIUM_LABELS() {
  return [t('Smashan Bhoomi'), t('Buddha Vihar Cremation Ground')]
}
let BUDDHIST_CREMATORIUM_LABELS: ReturnType<typeof build$BUDDHIST_CREMATORIUM_LABELS> = build$BUDDHIST_CREMATORIUM_LABELS()
registerLayer(() => {
  BUDDHIST_CREMATORIUM_LABELS = build$BUDDHIST_CREMATORIUM_LABELS()
})
function build$CHRISTIAN_LABELS() {
  return [t('Christian Cemetery'), t('Christian Burial Ground')]
}
let CHRISTIAN_LABELS: ReturnType<typeof build$CHRISTIAN_LABELS> = build$CHRISTIAN_LABELS()
registerLayer(() => {
  CHRISTIAN_LABELS = build$CHRISTIAN_LABELS()
})

function build$MONTH_LABELS() {
  return [t('Feb'), t('Mar'), t('Apr'), t('May'), t('Jun'), t('Jul')]
}
let MONTH_LABELS: ReturnType<typeof build$MONTH_LABELS> = build$MONTH_LABELS()
registerLayer(() => {
  MONTH_LABELS = build$MONTH_LABELS()
})

/**
 * Mortality is seasonal in western Maharashtra - a winter respiratory tail
 * through February, the pre-monsoon heat in May and the monsoon's own burden
 * through June and July. Facility load follows it, which is why a crematorium
 * that copes in March can queue in July.
 */
const MONTH_SEASONALITY = [0.97, 0.94, 1.01, 1.09, 1.13, 1.07]

/**
 * Ground consumed by one interment, in square metres, inclusive of the walking
 * space between plots. Used to convert an interment rate into a land
 * consumption rate, which is the only honest way to state years remaining.
 */
const SQ_METRES_PER_INTERMENT = 3.2

/** Thirty-day periods in a year, converting a monthly volume to an annual one. */
const THIRTY_DAY_PERIODS_PER_YEAR = 12.17

/**
 * Crude death rate per thousand residents a year. Maharashtra's urban
 * districts report close to seven, and it is the anchor for every volume on
 * this layer - the city's mortality determines how many rites its grounds
 * hold, not the other way round.
 */
const URBAN_DEATH_RATE_PER_1000 = 7

/* ==========================================================================
   Rebuild
   ========================================================================== */

registerLayer(() => {
  const scale = CITY_SCALE

  /* ------------------------------------------------- Facilities in the city */

  // Brihanmumbai maintains roughly 220 burial grounds, cemeteries and
  // crematoria across its wards. The floor holds at one facility per
  // administrative unit, because a ward with no provision at all is a
  // condition no corporation is permitted to be in.
  const facilityCount = scaledCount(220, scale.population, WARDS.length)

  // Pass one establishes what each facility IS. Volumes are allocated in pass
  // two, because the number of rites a city holds in a month is set by its
  // mortality, not by how many grounds it happens to have - deriving each
  // facility's load independently would have a large city's total rise with
  // the square of its size, which is a figure no registrar would recognise.
  const specs = Array.from({ length: facilityCount }, (_, i) => {
    const r = det(`deathcare:${i}`)
    // Distributed round-robin rather than picked at random, so every ward
    // carries provision - the distribution question this page exists to
    // answer is about adequacy, not about presence.
    const ward = WARDS[i % WARDS.length]!

    const kind = r.weighted([
      ['burial-ground', 7],
      ['crematorium', 6],
      ['cemetery', 4],
      ['electric-crematorium', 3],
    ] as const) as BurialGroundKind

    // Provision is designated by community because the rites differ and are
    // not substitutable. Weightings follow the shape of an average
    // Maharashtra corporation's own facility list.
    const community: BurialGroundCommunity =
      kind === 'burial-ground'
        ? (r.weighted([['muslim', 7], ['christian', 3], ['common', 3], ['hindu', 1]] as const) as BurialGroundCommunity)
        : kind === 'cemetery'
          ? (r.weighted([['christian', 6], ['common', 3], ['parsi', 2]] as const) as BurialGroundCommunity)
          : (r.weighted([['hindu', 8], ['common', 4], ['buddhist', 2]] as const) as BurialGroundCommunity)

    // Burial consumes land permanently; cremation consumes fuel and time.
    // Almost every figure below turns on that distinction.
    const buries = kind === 'burial-ground' || kind === 'cemetery'

    // Electric crematoria are sited and named by locality; a common municipal
    // ground carries the ward it was allotted to; a community-designated
    // ground carries the locality it stands in. All three are how a
    // corporation's own facility list actually reads.
    const suffix = buildSuffix(r, kind, community)
    const name =
      kind === 'electric-crematorium'
        ? `${localityFor(`deathcare-electric:${i}`)} ${suffix}`
        : community === 'common'
          ? `${wardName(ward.id)} ${suffix}`
          : landmarkName(`deathcare:${i}`, suffix)

    // Most burial grounds in an Indian city are small plots hemmed in by what
    // grew around them; a handful are the large historic grounds that carry a
    // disproportionate share of the city's interments. Modelled as both,
    // because the small hemmed-in ones are where exhaustion actually happens.
    const areaHectares = buries
      ? r.chance(0.15)
        ? r.round(3.2, 8.6, 2)
        : r.round(0.15, 3.1, 2)
      : kind === 'electric-crematorium'
        ? r.round(0.12, 1.15, 2)
        : r.round(0.25, 3.4, 2)

    // Burial grounds sit under far heavier pressure than crematoria, because
    // what they consume does not come back. The ranges say so.
    const capacityRemainingPct = buries ? r.round(3, 61, 1) : r.round(17, 94, 1)

    // How much of the city's load this facility draws. A large ground on a
    // main road takes many times what a small one on a lane does, and a city's
    // rites are never spread evenly across its estate.
    const load = r.float(0.4, 2.2)

    return { i, r, ward, kind, community, buries, name, areaHectares, capacityRemainingPct, load }
  })

  /* ------------------------------------------------ Volumes the city carries */

  // Maharashtra's urban districts report a crude death rate close to seven per
  // thousand residents a year. That, not facility capacity, is what sets how
  // many rites the estate holds in a month.
  const monthlyDeaths = Math.max(
    WARDS.length,
    Math.round(scale.populationTotal * (URBAN_DEATH_RATE_PER_1000 / 1000) / THIRTY_DAY_PERIODS_PER_YEAR),
  )
  const cremationShare = det('deathcare:split').round(0.7, 0.8, 3)
  const monthlyCremations = Math.round(monthlyDeaths * cremationShare)
  const monthlyBurials = monthlyDeaths - monthlyCremations

  const cremationLoad = specs.reduce((s, spec) => s + (spec.buries ? 0 : spec.load), 0) || 1
  const burialLoad = specs.reduce((s, spec) => s + (spec.buries ? spec.load : 0), 0) || 1

  BURIAL_GROUNDS = specs.map((spec) => {
    const { r, buries } = spec

    const burials30d = buries ? Math.max(1, Math.round((monthlyBurials * spec.load) / burialLoad)) : 0
    const cremations30d = buries ? 0 : Math.max(1, Math.round((monthlyCremations * spec.load) / cremationLoad))

    // On a burial ground the horizon is a land calculation; on a crematorium it
    // is furnace and platform life against a rising load, which is a slower and
    // far more recoverable problem.
    const estimatedYearsRemaining = buries
      ? yearsFromLandConsumption(spec.areaHectares, spec.capacityRemainingPct, burials30d, r.float(0.55, 0.92), r.float(0.004, 0.013))
      : Math.min(95, Math.round((spec.capacityRemainingPct / r.float(1.8, 6.4)) * 10) / 10)

    const electricGasSharePct =
      spec.kind === 'electric-crematorium' ? r.round(81, 100, 1) : spec.kind === 'crematorium' ? r.round(0, 57, 1) : 0

    // The wait is not independent of capacity: a ground running out of room
    // and a crematorium running out of furnace hours both queue the family at
    // the gate. Modelled as a floor plus a pressure term so the two figures
    // tell one coherent story rather than two unrelated ones.
    const pressure = (100 - spec.capacityRemainingPct) / 100
    const meanWaitHours = Math.round((r.float(0.3, 1.5) + pressure * r.float(0.7, 4.1)) * 10) / 10

    // Condition describes the facility itself - boundary wall and grounds,
    // furnace and pyre platforms, the shelter and water a family waiting there
    // needs. Held separately from capacity, because a well-kept ground can be
    // nearly full and a neglected one can have room to spare, and reporting
    // them as one figure would let each conceal the other. The wait still
    // weighs on it: a facility that queues families is not operating well,
    // whatever its grounds look like.
    const upkeep = r.round(38, 96, 0)
    const condition = Math.max(0, Math.min(100, upkeep * 0.7 + Math.max(0, 100 - meanWaitHours * 14) * 0.3))

    return {
      id: `dcf-${String(spec.i + 1).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      name: spec.name,
      wardId: spec.ward.id,
      kind: spec.kind,
      community: spec.community,
      areaHectares: spec.areaHectares,
      capacityRemainingPct: spec.capacityRemainingPct,
      estimatedYearsRemaining,
      cremations30d,
      burials30d,
      electricGasSharePct,
      meanWaitHours,
      state: stateFrom(condition),
      lastUpgradedAt: isoDaysFromAnchor(-r.int(70, 4200)),
    }
  })

  /* ------------------------------------------------------- Monthly volumes */

  const cremationBase = BURIAL_GROUNDS.reduce((s, f) => s + f.cremations30d, 0)
  const burialBase = BURIAL_GROUNDS.reduce((s, f) => s + f.burials30d, 0)

  DEATHCARE_TREND = MONTH_LABELS.map((month, i) => {
    const r = det(`deathcare-trend:${month}`)
    const seasonal = MONTH_SEASONALITY[i] ?? 1
    return {
      month,
      cremations: Math.round(cremationBase * seasonal * r.float(0.95, 1.05)),
      burials: Math.round(burialBase * seasonal * r.float(0.94, 1.06)),
    }
  })
})

/* ==========================================================================
   Helpers
   ========================================================================== */

/**
 * Years a burial ground can continue at its current rate before the ground it
 * has left is consumed.
 *
 * Stated from land rather than from a percentage, because that is the physical
 * fact underneath: an interment takes about three square metres and does not
 * give them back. Reuse of plots after the statutory interval recovers a share
 * of the ground, so gross consumption is netted against a recovery factor -
 * a ground with an active reuse cycle genuinely lasts longer than one without,
 * and modelling it otherwise would overstate the crisis.
 *
 * Interments are not the only thing that eats a ground. Paths widen, structures
 * go up, boundaries are encroached, and a share of usable land is lost every
 * year whether anyone is buried there or not - which is why even a quiet ground
 * has a horizon rather than an indefinite future.
 */
function yearsFromLandConsumption(
  areaHectares: number,
  capacityRemainingPct: number,
  burials30d: number,
  recoveryShare: number,
  attritionShare: number,
): number {
  const totalSqM = areaHectares * 10_000
  const remainingSqM = totalSqM * (capacityRemainingPct / 100)
  const annualInterments = burials30d * THIRTY_DAY_PERIODS_PER_YEAR
  const intermentSqM = annualInterments * SQ_METRES_PER_INTERMENT * (1 - recoveryShare)
  const attritionSqM = totalSqM * attritionShare
  const annualSqM = intermentSqM + attritionSqM
  if (annualSqM <= 0) return 95
  return Math.max(0.3, Math.min(95, Math.round((remainingSqM / annualSqM) * 10) / 10))
}

/**
 * The label the facility carries at its own gate. Built rather than borrowed:
 * a real ground's name carried from one city into another is the kind of error
 * that is noticed immediately and forgiven slowly, and on this duty of all
 * duties it would be unforgivable.
 */
function buildSuffix(
  r: ReturnType<typeof det>,
  kind: BurialGroundKind,
  community: BurialGroundCommunity,
): string {
  if (kind === 'electric-crematorium') return t('Electric Crematorium')
  if (kind === 'crematorium') {
    if (community === 'buddhist') return r.pick(BUDDHIST_CREMATORIUM_LABELS)
    if (community === 'common') return t('Municipal Crematorium')
    return r.pick(HINDU_CREMATORIUM_LABELS)
  }
  if (kind === 'cemetery') {
    if (community === 'parsi') return t('Parsi Aramgah')
    if (community === 'christian') return r.pick(CHRISTIAN_LABELS)
    return t('Municipal Cemetery')
  }
  if (community === 'muslim') return t('Kabrastan')
  if (community === 'christian') return t('Christian Burial Ground')
  if (community === 'common') return t('Municipal Burial Ground')
  return t('Burial Ground')
}
