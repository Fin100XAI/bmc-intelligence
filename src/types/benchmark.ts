import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'
/**
 * src/types/benchmark.ts
 *
 * Cross-corporation benchmarking.
 *
 * Every other type in this platform describes ONE corporation. These describe
 * the twenty-nine of them together, because a figure on its own answers almost
 * nothing. A collection efficiency of sixty-eight per cent is neither good nor
 * bad until you know what the corporation down the road manages on the same
 * measure, and a Commissioner asked to improve a number is entitled to know
 * who has already improved it.
 *
 * THE BASIS OF EACH METRIC IS PART OF THE METRIC. Some indicators here are
 * arithmetic on figures the corporations themselves publish - budget outlay,
 * census population, sanctioned water supply, notified area. Those are marked
 * `published` and are as reliable as their sources. Others are modelled for
 * this demonstration, because no comparable state-wide operational return
 * exists in the public domain. Those are marked `modelled` and are labelled as
 * such wherever they appear. Mixing the two silently would be the single most
 * misleading thing this platform could do, so the distinction is carried in
 * the type rather than left to a footnote.
 */

/** Whether an indicator is arithmetic on published figures, or modelled. */
export type BenchmarkBasis = 'published' | 'modelled'

export type BenchmarkCategory = 'finance' | 'service' | 'infrastructure' | 'governance'

function build$BENCHMARK_CATEGORY_LABEL(): Record<BenchmarkCategory, string> {
  return {
  finance: t('Finance'),
  service: t('Service Delivery'),
  infrastructure: t('Infrastructure'),
  governance: t('Governance'),
}
}
export let BENCHMARK_CATEGORY_LABEL: Record<BenchmarkCategory, string> = build$BENCHMARK_CATEGORY_LABEL()
registerLayer(() => {
  BENCHMARK_CATEGORY_LABEL = build$BENCHMARK_CATEGORY_LABEL()
})

function build$BENCHMARK_BASIS_LABEL(): Record<BenchmarkBasis, string> {
  return {
  published: t('Published'),
  modelled: t('Modelled'),
}
}
export let BENCHMARK_BASIS_LABEL: Record<BenchmarkBasis, string> = build$BENCHMARK_BASIS_LABEL()
registerLayer(() => {
  BENCHMARK_BASIS_LABEL = build$BENCHMARK_BASIS_LABEL()
})

/**
 * Comparison cohort. Ranking Mumbai against Parbhani on a per-capita measure
 * tells a Commissioner nothing actionable, so every table can be narrowed to
 * corporations of a comparable size.
 */
export type PopulationBand = 'mega' | 'large' | 'medium' | 'small'

function build$POPULATION_BAND_LABEL(): Record<PopulationBand, string> {
  return {
  mega: t('Above 50 lakh'),
  large: t('10 - 50 lakh'),
  medium: t('5 - 10 lakh'),
  small: t('Below 5 lakh'),
}
}
export let POPULATION_BAND_LABEL: Record<PopulationBand, string> = build$POPULATION_BAND_LABEL()
registerLayer(() => {
  POPULATION_BAND_LABEL = build$POPULATION_BAND_LABEL()
})

export interface BenchmarkMetric {
  id: string
  label: string
  /** Column heading where the full label will not fit. */
  shortLabel: string
  unit: string
  decimals: number
  /** Direction of merit. Drives ranking, tone and the peer strip's verdict. */
  higherIsBetter: boolean
  basis: BenchmarkBasis
  category: BenchmarkCategory
  description: string
  /** What the published figure is computed from, shown on the provenance rail. */
  derivation?: string
}

export interface BenchmarkValue {
  metricId: string
  /** `null` where a corporation does not publish the underlying figure. */
  value: number | null
  /** 1 is best. `null` where the value is unavailable. */
  rank: number | null
  /** Count of corporations actually ranked for this metric. */
  rankedOf: number
  /** 0 - 100, where 100 is best. */
  percentile: number | null
}

export interface CorporationBenchmark {
  corporationId: string
  name: string
  shortName: string
  city: string
  district: string
  division: string
  grade: 'A' | 'B' | 'C' | 'D' | null
  population: number
  areaSqKm: number
  band: PopulationBand
  values: Record<string, BenchmarkValue>
}

/** One corporation's standing on one metric, relative to a chosen cohort. */
export interface PeerPosition {
  metric: BenchmarkMetric
  value: number | null
  rank: number | null
  rankedOf: number
  /** Median across the cohort. */
  median: number | null
  /** Best value in the cohort, and who holds it. */
  bestValue: number | null
  bestCorporation: string | null
  /** Signed difference from the cohort median, in the metric's own unit. */
  deltaFromMedian: number | null
  /** True where the corporation is at or better than the cohort median. */
  atOrAboveMedian: boolean | null
}
