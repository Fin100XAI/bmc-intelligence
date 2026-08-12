import { TENANT_ID, activeCorporation, hasCoastalJurisdiction } from '@/config/municipality.config'
import type { MarketInspectionTrendPoint, MarketKind, MunicipalMarket } from '@/types/markets'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS } from './reference'
import { stateFrom } from './city.data'
import { landmarkName, localityFor } from './naming'
import { CITY_SCALE, scaled, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/markets.data.ts
 *
 * The municipal market estate and the regulated trades - retail markets,
 * wholesale yards, fish markets, slaughter houses and tanneries.
 *
 * Function 18 of the Twelfth Schedule assigns the corporation "regulation of
 * slaughter houses and tanneries". The market estate is modelled alongside it
 * because the corporation is the landlord there, but the seed keeps the two
 * apart in tone as well as in kind: THIS IS A FOOD-SAFETY FUNCTION BEFORE IT
 * IS A REVENUE ONE. An uninspected slaughter house is a public-health exposure
 * inside the city's meat supply regardless of whether its fee has been paid,
 * so `lastInspectedAt` is seeded as a genuine distribution with a real overdue
 * tail rather than as a tidy field that always reads "last month". The
 * INSPECTION INTERVAL, not the inspection count, is the control this layer
 * exists to make visible.
 *
 * `effluentCompliant` is the point where a slaughter house or a tannery
 * becomes an environmental matter as well as a hygiene one. Both trades
 * discharge high-load effluent; untreated it reaches a nullah and from there a
 * creek. It is modelled as a live question for those two kinds and for fish
 * markets, and recorded as compliant elsewhere because a vegetable market has
 * no trade effluent worth the Pollution Control Board's attention.
 *
 * Same discipline as every other seed layer: counts track the active
 * corporation through `CITY_SCALE`, place names are built from the
 * corporation's own published localities, every figure comes from a seeded
 * PRNG so the picture is identical on every reload, and both exports are LIVE
 * BINDINGS rebuilt on a corporation switch.
 */

/* ==========================================================================
   Live bindings
   ========================================================================== */

export let MUNICIPAL_MARKETS: MunicipalMarket[] = []
export let MARKET_INSPECTION_TREND: MarketInspectionTrendPoint[] = []

/* ==========================================================================
   Vocabulary
   ========================================================================== */

/** How each trade is named on the ground. A municipal retail market is a
 *  "mandai" or a "bazaar" as often as it is a "market", and the register
 *  should read the way the ward office reads it. */
function build$MARKET_PLACE_KINDS(): Record<MarketKind, string[]> {
  return {
  'retail-market': [t('Market'), t('Mandai'), t('Bazaar'), t('Municipal Market'), t('Vegetable Market')],
  'wholesale-market': [t('Wholesale Market'), t('Agricultural Produce Market'), t('Grain Market')],
  'fish-market': [t('Fish Market'), t('Machhi Market')],
  slaughterhouse: [t('Abattoir')],
  tannery: [t('Tannery'), t('Tanning Unit')],
}
}
let MARKET_PLACE_KINDS: Record<MarketKind, string[]> = build$MARKET_PLACE_KINDS()
registerLayer(() => {
  MARKET_PLACE_KINDS = build$MARKET_PLACE_KINDS()
})

function build$MONTH_LABELS() {
  return [t('Feb'), t('Mar'), t('Apr'), t('May'), t('Jun'), t('Jul')]
}
let MONTH_LABELS: ReturnType<typeof build$MONTH_LABELS> = build$MONTH_LABELS()
registerLayer(() => {
  MONTH_LABELS = build$MONTH_LABELS()
})

/* ==========================================================================
   Rebuild
   ========================================================================== */

registerLayer(() => {
  const scale = CITY_SCALE
  // A corporation on the coast runs a materially larger fish market estate,
  // and inherits the effluent question that comes with it.
  const coastal = hasCoastalJurisdiction(activeCorporation)

  /* ------------------------------------------------- The facility estate */

  // Brihanmumbai's reference estate: roughly seventy-odd municipal retail
  // markets, a small number of wholesale yards, the fish markets its coastline
  // supports, a handful of licensed slaughter houses dominated by one large
  // abattoir, and the few tanneries still operating inside city limits. Every
  // floor keeps the smallest corporation's register populated rather than
  // empty - a corporation with no slaughter house on its books is not a
  // corporation with no meat trade, it is a corporation that has stopped
  // looking.
  const composition: Array<{ kind: MarketKind; count: number }> = [
    { kind: 'retail-market', count: scaledCount(74, scale.population, 5) },
    { kind: 'wholesale-market', count: scaledCount(9, scale.population, 1) },
    { kind: 'fish-market', count: scaledCount(coastal ? 17 : 6, scale.population, 1) },
    { kind: 'slaughterhouse', count: scaledCount(5, scale.population, 1) },
    { kind: 'tannery', count: scaledCount(4, scale.population, 1) },
  ]

  // Rent is set as a share of the estate's total monthly demand rather than
  // per stall in isolation. Brihanmumbai's market estate raises on the order of
  // ₹115 crore a year in stall rent and fees - about 960 lakh a month - and
  // what a corporation can raise tracks its budget, while how many stalls it
  // has already tracks its population above. Applying the budget ratio a
  // second time at stall level would scale the same thing twice and leave a
  // smaller corporation's markets reading as though they were let for nothing.
  const estateMonthlyRentLakh = scaled(960, scale.budget, 4)

  const facilities: MunicipalMarket[] = []
  const rentWeights: number[] = []
  let wardCursor = 0

  for (const { kind, count } of composition) {
    for (let n = 0; n < count; n += 1) {
      const seed = `market:${kind}:${n}`
      const r = det(seed)
      // Dealt round the wards rather than picked at random, so a ward-scoped
      // officer always has an estate to look at instead of an empty register.
      const ward = WARDS[wardCursor % WARDS.length]!
      wardCursor += 1

      // Capacity. For a slaughter house or a tannery this is licensed
      // operating bays, not retail stalls.
      const stalls =
        kind === 'wholesale-market'
          ? r.int(120, 860)
          : kind === 'retail-market'
            ? r.int(42, 380)
            : kind === 'fish-market'
              ? r.int(24, 190)
              : kind === 'slaughterhouse'
                ? r.int(6, 44)
                : r.int(4, 26)

      // Municipal retail markets carry real vacancy - traders have moved to
      // the street outside, where there is no rent and no inspection. That
      // migration is the finding, not the vacancy figure itself.
      const occupancy = kind === 'retail-market' ? r.float(0.34, 0.96) : r.float(0.52, 0.99)
      const stallsOccupied = Math.max(1, Math.min(stalls, Math.round(stalls * occupancy)))

      const licensedTradersPct = r.round(kind === 'wholesale-market' ? 62 : 48, 99.5, 1)

      const hygieneScore =
        kind === 'slaughterhouse' || kind === 'tannery'
          ? r.round(26, 84, 0)
          : kind === 'fish-market'
            ? r.round(32, 88, 0)
            : r.round(44, 96, 0)

      // The inspection interval, seeded as a distribution with a genuine
      // overdue tail. A register in which nothing is ever overdue is a
      // register nobody is keeping.
      const band = r.weighted([
        ['recent', 5],
        ['due', 4],
        ['overdue', 2],
        ['long-overdue', 1],
      ] as const)
      const daysSinceInspection =
        band === 'recent'
          ? r.int(2, 30)
          : band === 'due'
            ? r.int(31, 90)
            : band === 'overdue'
              ? r.int(91, 200)
              : r.int(201, 430)

      // Violations track hygiene rather than floating free of it, so the two
      // columns corroborate each other the way an inspection file would.
      const violationPressure = Math.max(0, (78 - hygieneScore) / 78)
      const openViolations = Math.round(r.float(0, 2.4) + violationPressure * r.float(2, 13))

      // What this facility commands relative to the rest of the estate. A
      // wholesale yard earns several times a retail market of the same
      // footprint; a slaughter house earns on throughput fees rather than on
      // stall rent, which is why its small bay count still carries weight.
      const kindPremium =
        kind === 'wholesale-market'
          ? 2.4
          : kind === 'slaughterhouse'
            ? 1.8
            : kind === 'tannery'
              ? 1.5
              : kind === 'fish-market'
                ? 1.3
                : 1
      rentWeights.push(stalls * kindPremium * r.float(0.8, 1.25))

      const coldStorage = r.chance(
        kind === 'fish-market'
          ? 0.58
          : kind === 'slaughterhouse'
            ? 0.66
            : kind === 'wholesale-market'
              ? 0.44
              : kind === 'retail-market'
                ? 0.19
                : 0.05,
      )

      // Only meaningful where the trade actually produces effluent.
      const effluentCompliant =
        kind === 'tannery'
          ? r.chance(0.48)
          : kind === 'slaughterhouse'
            ? r.chance(0.62)
            : kind === 'fish-market'
              ? r.chance(0.74)
              : true

      // Condition is hygiene first, then how long ago anybody last checked,
      // then whether the discharge is lawful - weighted in that order because
      // that is the order in which they harm somebody.
      const intervalScore = Math.max(0, 100 - daysSinceInspection * 0.55)
      const composite =
        hygieneScore * 0.55 + intervalScore * 0.3 + (effluentCompliant ? 100 : 38) * 0.15 - openViolations * 1.6

      facilities.push({
        id: `mkt-${String(facilities.length + 1).padStart(3, '0')}`,
        tenantId: TENANT_ID,
        // The abattoir reads as one named municipal institution rather than as
        // an estate entry, because that is what it is.
        name:
          kind === 'slaughterhouse'
            ? t('Municipal Abattoir, {0}', localityFor(seed))
            : landmarkName(seed, r.pick(MARKET_PLACE_KINDS[kind])),
        wardId: ward.id,
        kind,
        stalls,
        stallsOccupied,
        licensedTradersPct,
        hygieneScore,
        lastInspectedAt: isoDaysFromAnchor(-daysSinceInspection),
        openViolations,
        // Filled in below, once the whole estate is known and the monthly
        // demand can be apportioned across it.
        monthlyRentLakh: 0,
        state: stateFrom(Math.max(0, Math.min(100, composite))),
        coldStorage,
        effluentCompliant,
      })
    }
  }

  const rentWeightTotal = rentWeights.reduce((s, w) => s + w, 0) || 1
  for (const [i, facility] of facilities.entries()) {
    const share = (rentWeights[i] ?? 0) / rentWeightTotal
    facility.monthlyRentLakh = Math.max(0.05, Math.round(estateMonthlyRentLakh * share * 100) / 100)
  }

  MUNICIPAL_MARKETS = facilities

  /* --------------------------------------------- The monthly enforcement record */

  const facilityCount = MUNICIPAL_MARKETS.length
  const totalStalls = MUNICIPAL_MARKETS.reduce((s, m) => s + m.stalls, 0)

  MARKET_INSPECTION_TREND = MONTH_LABELS.map((month, i) => {
    const r = det(`markettrend:${month}`)
    // Inspection effort climbs into the monsoon, when food-borne illness
    // presents fastest and the interval matters most.
    const seasonal = 0.82 + i * 0.06
    const inspections = Math.max(1, Math.round(facilityCount * seasonal * r.float(0.7, 1.25)))
    return {
      month,
      inspections,
      violationsFound: Math.round(inspections * r.float(0.14, 0.42)),
      licencesIssued: Math.max(1, Math.round(totalStalls * r.float(0.004, 0.02))),
    }
  })
})
