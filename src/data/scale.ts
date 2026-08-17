import { activeCorporation } from '@/config/municipality.config'
import { corporationById } from '@/config/corporations'
import { registerLayer } from './runtime'

/**
 * src/data/scale.ts
 *
 * CORPORATION SCALE
 *
 * Every magnitude in `src/data/*` was originally written for Brihanmumbai: a
 * ₹74,427 crore budget, 12.4 million residents, 3,850 MLD of water, 6,300
 * tonnes of waste a day. Those numbers are not transferable. Showing Jalna -
 * a corporation of about 285,000 people on a ₹463 crore budget - a ₹4,310
 * crore hydraulic department would destroy the platform's credibility in one
 * glance, and would do it on the very screen a commissioner looks at first.
 *
 * This module is the single place that answers "how big is the corporation we
 * are currently rendering, relative to the one these figures were written
 * for". Data layers multiply their Brihanmumbai-scale constants by the ratio
 * that matches what they are describing:
 *
 *   - `population` for anything that scales with residents served - staff
 *     counts, complaints, patients, hospital beds, ration of field crews.
 *   - `budget` for money - departmental allocations, contract values, revenue.
 *   - `area` for anything that scales with ground covered - road length,
 *     drain length, sweeping beats, asset counts.
 *   - `wards` for anything counted per administrative unit.
 *
 * The ratios are exact where the corporation publishes the figure. Where it
 * does not, the fallback is stated in the comment beside it rather than hidden
 * inside an expression - a modelled ratio is honest, a modelled ratio nobody
 * can find is not.
 *
 * All of this is deployment scale, not time: it never touches `DEMO_NOW`.
 */

/**
 * The reference corporation every constant in `src/data/*` was written for.
 *
 * Read off Brihanmumbai's own record rather than restated as literals, so that
 * correcting a BMC figure in `corporations.ts` cannot silently leave every
 * other corporation's ratios computed against a stale denominator - and so
 * that Brihanmumbai's own scale ratios stay exactly 1.
 */
const BMC = corporationById('bmc')

export const REFERENCE_SCALE = {
  populationTotal: BMC.population2011,
  areaSqKm: BMC.areaSqKm,
  budgetCrore: BMC.budgetCrore ?? 80952,
  wards: BMC.administrativeWards ?? 24,
  waterSupplyMLD: BMC.waterSupplyMLD ?? 3850,
  sewageTreatmentMLD: BMC.sewageTreatmentMLD ?? 1226,
  solidWasteTPD: BMC.solidWasteTPD ?? 6300,
  roadLengthKm: BMC.roadLengthKm ?? 2055,
  gardenPlotsCount: BMC.gardenPlotsCount ?? 1068,
  gardensCount: BMC.gardensCount ?? 254,
  municipalMarketsCount: BMC.municipalMarketsCount ?? 136,
} as const

export interface CorporationScale {
  /** Ratio of residents served, against Brihanmumbai. */
  population: number
  /** Ratio of area covered. */
  area: number
  /** Ratio of annual budget outlay. */
  budget: number
  /** Ratio of administrative unit count. */
  wards: number
  /** Absolute anchors, for layers that need the real figure rather than a ratio. */
  populationTotal: number
  areaSqKm: number
  budgetCrore: number
  wardCount: number
  waterSupplyMLD: number
  /** Currently operational sewage-treatment capacity - published or modelled. */
  sewageTreatmentMLD: number
  solidWasteTPD: number
  roadLengthKm: number
  /** All BMC-held open-space plots (gardens, playgrounds, recreation grounds) - published or modelled. */
  gardenPlotsCount: number
  /** The subset of `gardenPlotsCount` that are gardens specifically - published or modelled. */
  gardensCount: number
  /** Municipal markets - published or modelled. */
  municipalMarketsCount: number
  /** True where the corporation publishes its own budget rather than it being modelled. */
  budgetIsPublished: boolean
  waterSupplyIsPublished: boolean
  sewageTreatmentIsPublished: boolean
  solidWasteIsPublished: boolean
  roadLengthIsPublished: boolean
  gardenPlotsIsPublished: boolean
  municipalMarketsIsPublished: boolean
}

/**
 * Rounds a scaled magnitude to a number of significant figures appropriate to
 * its size, so a scaled-down figure reads like a budget line rather than like
 * a floating-point artefact: 4310 × 0.0202 becomes 87, not 87.062.
 */
export function scaled(base: number, ratio: number, minimum = 1): number {
  const value = base * ratio
  if (value >= 1000) return Math.round(value / 10) * 10
  if (value >= 100) return Math.round(value)
  if (value >= 10) return Math.round(value * 10) / 10
  return Math.max(minimum, Math.round(value * 100) / 100)
}

/** Scales an integer count, never below `minimum`. */
export function scaledCount(base: number, ratio: number, minimum = 1): number {
  return Math.max(minimum, Math.round(base * ratio))
}

function build(): CorporationScale {
  const corp = activeCorporation
  const population = corp.population2011 / REFERENCE_SCALE.populationTotal
  const area = corp.areaSqKm / REFERENCE_SCALE.areaSqKm

  // Where the corporation does not publish a budget, model it from population
  // at a per-capita rate typical of a mid-sized Maharashtra corporation rather
  // than at Brihanmumbai's - BMC's per-capita outlay is roughly four times the
  // state norm and would inflate every derived figure downstream.
  const budgetIsPublished = corp.budgetCrore !== null
  const budgetCrore = corp.budgetCrore ?? Math.round(population * REFERENCE_SCALE.budgetCrore * 0.28)

  // Service volumes fall back to per-capita norms used in Maharashtra urban
  // planning: roughly 135 litres per person per day supplied, and about 450
  // grams of municipal solid waste generated per person per day.
  const waterSupplyIsPublished = corp.waterSupplyMLD !== null
  const waterSupplyMLD = corp.waterSupplyMLD ?? Math.round((corp.population2011 * 135) / 1_000_000)

  // Sewage generated is conventionally taken at around 80% of water supplied;
  // installed treatment capacity where the corporation does not publish its
  // own figure is modelled a little under that.
  const sewageTreatmentIsPublished = corp.sewageTreatmentMLD !== null
  const sewageTreatmentMLD = corp.sewageTreatmentMLD ?? Math.round(waterSupplyMLD * 0.72)

  const solidWasteIsPublished = corp.solidWasteTPD !== null
  const solidWasteTPD = corp.solidWasteTPD ?? Math.round((corp.population2011 * 0.45) / 1000)

  const roadLengthIsPublished = corp.roadLengthKm !== null
  const roadLengthKm = corp.roadLengthKm ?? Math.round(area * REFERENCE_SCALE.roadLengthKm)

  // Open-space plots and municipal markets scale with ground covered and
  // residents served respectively, exactly like road length and water supply
  // above - published where the corporation states it, modelled by the same
  // ratio otherwise.
  const gardenPlotsIsPublished = corp.gardenPlotsCount !== null
  const gardenPlotsCount = corp.gardenPlotsCount ?? Math.round(area * REFERENCE_SCALE.gardenPlotsCount)
  // Gardens are the published SHARE of the plot total, so a corporation with
  // no share of its own inherits Brihanmumbai's - about a quarter of every
  // plot it holds.
  const gardensCount =
    corp.gardensCount ?? Math.round(gardenPlotsCount * (REFERENCE_SCALE.gardensCount / REFERENCE_SCALE.gardenPlotsCount))

  const municipalMarketsIsPublished = corp.municipalMarketsCount !== null
  const municipalMarketsCount = corp.municipalMarketsCount ?? Math.round(population * REFERENCE_SCALE.municipalMarketsCount)

  const wardCount = Math.max(3, corp.divisions.length || corp.administrativeWards || corp.electoralWards || 8)

  return {
    population,
    area,
    budget: budgetCrore / REFERENCE_SCALE.budgetCrore,
    wards: wardCount / REFERENCE_SCALE.wards,
    populationTotal: corp.population2011,
    areaSqKm: corp.areaSqKm,
    budgetCrore,
    wardCount,
    waterSupplyMLD,
    sewageTreatmentMLD,
    solidWasteTPD,
    roadLengthKm,
    gardenPlotsCount,
    gardensCount,
    municipalMarketsCount,
    budgetIsPublished,
    waterSupplyIsPublished,
    sewageTreatmentIsPublished,
    solidWasteIsPublished,
    roadLengthIsPublished,
    gardenPlotsIsPublished,
    municipalMarketsIsPublished,
  }
}

/** Live binding - rebuilt on every corporation switch. */
export let CITY_SCALE: CorporationScale = build()

registerLayer(() => {
  CITY_SCALE = build()
})
