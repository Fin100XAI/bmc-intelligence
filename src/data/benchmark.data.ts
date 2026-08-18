import { CORPORATIONS, cityName, corporationName, type CorporationRef } from '@/config/corporations'
import { Deterministic } from '@/utils/deterministic'
import type {
  BenchmarkMetric,
  BenchmarkValue,
  CorporationBenchmark,
  PopulationBand,
} from '@/types/benchmark'
import { t } from '@/i18n'
import { registerLayer } from './runtime'

/**
 * src/data/benchmark.data.ts
 *
 * The comparative layer - all twenty-nine Maharashtra municipal corporations
 * measured on one basis.
 *
 * WHY THIS MODULE DOES NOT CALL `registerLayer`, when every other data module
 * does. The rest of the data layer describes whichever corporation is active
 * and must be rebuilt when that changes. This module describes ALL of them at
 * once, and its figures are therefore identical no matter which corporation
 * the operator is currently looking at. Rebuilding it on a switch would
 * recompute twenty-nine identical results and discard them. The active
 * corporation is used only to HIGHLIGHT a row, which the page does at render
 * time. This is a deliberate exemption, not an oversight.
 *
 * For the same reason the modelled indicators here are seeded through
 * `new Deterministic(...)` directly rather than through `det()`. `det()`
 * prefixes the active corporation's id onto the namespace, which is exactly
 * right for single-corporation data and exactly wrong here: it would make
 * Nashik's collection efficiency change every time the operator switched to
 * Nagpur. Seeding on the SUBJECT corporation's id instead makes every row
 * stable and every comparison reproducible.
 */

/* ==========================================================================
   Metric catalogue
   ========================================================================== */

/**
 * `published` metrics are arithmetic on figures the corporations themselves
 * publish. `modelled` metrics are generated for this demonstration because no
 * comparable state-wide operational return exists in the public domain. The
 * interface labels every modelled figure as such.
 */
function build$BENCHMARK_METRICS(): BenchmarkMetric[] {
  return [
  {
    id: 'budget-per-capita',
    label: t('Budget per resident'),
    shortLabel: 'Budget / resident',
    unit: '₹',
    decimals: 0,
    higherIsBetter: true,
    basis: 'published',
    category: 'finance',
    description:
      t('Annual budget outlay divided by census population. The broadest available measure of what a corporation is able to spend on each resident it serves.'),
    derivation: 'Published annual budget outlay ÷ Census 2011 population',
  },
  {
    id: 'residents-per-corporator',
    label: t('Residents per corporator'),
    shortLabel: 'Residents / corporator',
    unit: '',
    decimals: 0,
    higherIsBetter: false,
    basis: 'published',
    category: 'governance',
    description:
      t('Census population divided by elected corporator seats. How many residents each elected member answers for, and therefore how close the deliberative wing sits to the people it represents.'),
    derivation: 'Census 2011 population ÷ elected corporator seats',
  },
  {
    id: 'water-supply-lpcd',
    label: t('Water supplied per resident'),
    shortLabel: 'Water LPCD',
    unit: ' LPCD',
    decimals: 0,
    higherIsBetter: true,
    basis: 'published',
    category: 'infrastructure',
    description:
      t('Sanctioned water supply divided by population, in litres per capita per day. The national service-level benchmark is 135 LPCD. This is supply into the system, not what reaches a tap.'),
    derivation: 'Published water supply (MLD) ÷ Census 2011 population',
  },
  {
    id: 'waste-per-capita',
    label: t('Waste generated per resident'),
    shortLabel: 'Waste g/day',
    unit: ' g/day',
    decimals: 0,
    higherIsBetter: false,
    basis: 'published',
    category: 'service',
    description:
      t('Solid waste generated daily divided by population, in grams per resident per day. A lower figure means less to collect, transport and process.'),
    derivation: 'Published solid waste (TPD) ÷ Census 2011 population',
  },
  {
    id: 'road-density',
    label: t('Road density'),
    shortLabel: 'Road km / sq km',
    unit: ' km/km²',
    decimals: 2,
    higherIsBetter: true,
    basis: 'published',
    category: 'infrastructure',
    description:
      t('Road length divided by notified area. A measure of how completely the corporation has built out its street network across the land it administers.'),
    derivation: 'Published road length (km) ÷ notified area (sq km)',
  },
  {
    id: 'population-density',
    label: t('Population density'),
    shortLabel: 'Persons / sq km',
    unit: '',
    decimals: 0,
    higherIsBetter: false,
    basis: 'published',
    category: 'infrastructure',
    description:
      t('Census population divided by notified area. Not a performance measure - it is the service pressure every other measure is delivered against, and it belongs beside them for that reason.'),
    derivation: 'Census 2011 population ÷ notified area (sq km)',
  },
  {
    id: 'collection-efficiency',
    label: t('Property tax collection efficiency'),
    shortLabel: 'Collection eff.',
    unit: '%',
    decimals: 1,
    higherIsBetter: true,
    basis: 'modelled',
    category: 'finance',
    description:
      t('Property tax collected as a share of current demand raised. The single most-watched measure of a corporation’s own financial strength.'),
  },
  {
    id: 'own-revenue-share',
    label: t('Own revenue share'),
    shortLabel: 'Own revenue',
    unit: '%',
    decimals: 1,
    higherIsBetter: true,
    basis: 'modelled',
    category: 'finance',
    description:
      t('Revenue the corporation raises itself, as a share of total receipts. The remainder is grant and devolution, over which it has no control.'),
  },
  {
    id: 'capital-utilisation',
    label: t('Capital budget utilisation'),
    shortLabel: 'Capital util.',
    unit: '%',
    decimals: 1,
    higherIsBetter: true,
    basis: 'modelled',
    category: 'finance',
    description:
      t('Capital budget actually spent against capital budget sanctioned. Persistent under-utilisation is a delivery failure that presents itself as prudence.'),
  },
  {
    id: 'complaint-sla',
    label: t('Complaint SLA compliance'),
    shortLabel: 'Complaint SLA',
    unit: '%',
    decimals: 1,
    higherIsBetter: true,
    basis: 'modelled',
    category: 'service',
    description:
      t('Citizen complaints closed within their published service standard. The measure a resident experiences directly.'),
  },
  {
    id: 'non-revenue-water',
    label: t('Non-revenue water'),
    shortLabel: 'NRW',
    unit: '%',
    decimals: 1,
    higherIsBetter: false,
    basis: 'modelled',
    category: 'infrastructure',
    description:
      t('Water produced but never billed - physical leakage plus commercial loss. Every point of NRW is treated water paid for and not recovered.'),
  },
  {
    id: 'waste-processed',
    label: t('Waste processed'),
    shortLabel: 'Waste processed',
    unit: '%',
    decimals: 1,
    higherIsBetter: true,
    basis: 'modelled',
    category: 'service',
    description:
      t('Share of collected waste processed rather than sent to landfill. Landfill capacity is finite and, once exhausted, extremely hard to replace.'),
  },
]
}
export let BENCHMARK_METRICS: BenchmarkMetric[] = build$BENCHMARK_METRICS()
registerLayer(() => {
  BENCHMARK_METRICS = build$BENCHMARK_METRICS()
})

export const BENCHMARK_METRIC_BY_ID: Record<string, BenchmarkMetric> = Object.fromEntries(
  BENCHMARK_METRICS.map((m) => [m.id, m]),
)

/* ==========================================================================
   Derivation
   ========================================================================== */

function bandFor(population: number): PopulationBand {
  if (population >= 5_000_000) return 'mega'
  if (population >= 1_000_000) return 'large'
  if (population >= 500_000) return 'medium'
  return 'small'
}

/** Grade is the state's own assessment of a corporation, so it is a defensible
 *  anchor for a modelled operational indicator: better-graded corporations
 *  trend better, without the ordering being fixed. */
function gradeLift(grade: CorporationRef['grade'], span: number): number {
  switch (grade) {
    case 'A':
      return span
    case 'B':
      return span * 0.45
    case 'C':
      return -span * 0.2
    case 'D':
      return -span * 0.6
    default:
      return 0
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Modelled indicator for one corporation. Seeded on the SUBJECT corporation,
 * never on the active one, so a row does not move when the operator switches.
 */
function modelled(
  corp: CorporationRef,
  metricId: string,
  centre: number,
  spread: number,
  lift: number,
  bounds: [number, number],
  decimals: number,
): number {
  const r = new Deterministic(`${corp.id}::benchmark:${metricId}`)
  const raw = r.float(centre - spread, centre + spread) + gradeLift(corp.grade, lift)
  return round(clamp(raw, bounds[0], bounds[1]), decimals)
}

/** Raw value for one corporation on one metric, before ranking. */
function rawValue(corp: CorporationRef, metricId: string): number | null {
  const population = corp.population2011
  switch (metricId) {
    case 'budget-per-capita':
      return corp.budgetCrore && population ? round((corp.budgetCrore * 1e7) / population, 0) : null
    case 'residents-per-corporator':
      return corp.electoralWards && population ? round(population / corp.electoralWards, 0) : null
    case 'water-supply-lpcd':
      return corp.waterSupplyMLD && population ? round((corp.waterSupplyMLD * 1e6) / population, 0) : null
    case 'waste-per-capita':
      return corp.solidWasteTPD && population ? round((corp.solidWasteTPD * 1e6) / population, 0) : null
    case 'road-density':
      return corp.roadLengthKm && corp.areaSqKm ? round(corp.roadLengthKm / corp.areaSqKm, 2) : null
    case 'population-density':
      return population && corp.areaSqKm ? round(population / corp.areaSqKm, 0) : null

    case 'collection-efficiency':
      return modelled(corp, metricId, 68, 13, 9, [38, 96], 1)
    case 'own-revenue-share':
      return modelled(corp, metricId, 52, 16, 12, [18, 92], 1)
    case 'capital-utilisation':
      return modelled(corp, metricId, 64, 15, 8, [28, 97], 1)
    case 'complaint-sla':
      return modelled(corp, metricId, 71, 14, 8, [34, 97], 1)
    case 'non-revenue-water':
      return modelled(corp, metricId, 33, 11, -7, [12, 58], 1)
    case 'waste-processed':
      return modelled(corp, metricId, 56, 20, 11, [12, 98], 1)
    default:
      return null
  }
}

/* ==========================================================================
   Build
   ========================================================================== */

function build(): CorporationBenchmark[] {
  // Pass one: every raw value.
  const rows: CorporationBenchmark[] = CORPORATIONS.map((corp) => ({
    corporationId: corp.id,
    name: corporationName(corp),
    shortName: corp.shortName,
    city: cityName(corp),
    district: corp.district,
    division: corp.division,
    grade: corp.grade,
    population: corp.population2011,
    areaSqKm: corp.areaSqKm,
    band: bandFor(corp.population2011),
    values: {},
  }))

  // Pass two: rank each metric across every corporation that publishes it.
  for (const metric of BENCHMARK_METRICS) {
    const scored = CORPORATIONS.map((corp) => ({ id: corp.id, value: rawValue(corp, metric.id) })).filter(
      (x): x is { id: string; value: number } => x.value !== null,
    )

    scored.sort((a, b) => (metric.higherIsBetter ? b.value - a.value : a.value - b.value))

    const rankedOf = scored.length
    const rankById = new Map<string, number>()
    scored.forEach((entry, index) => rankById.set(entry.id, index + 1))

    for (const row of rows) {
      const value = rawValue(CORPORATIONS.find((c) => c.id === row.corporationId)!, metric.id)
      const rank = value === null ? null : (rankById.get(row.corporationId) ?? null)
      const percentile =
        rank === null || rankedOf <= 1 ? null : round(((rankedOf - rank) / (rankedOf - 1)) * 100, 0)

      const entry: BenchmarkValue = { metricId: metric.id, value, rank, rankedOf, percentile }
      row.values[metric.id] = entry
    }
  }

  return rows
}

/**
 * Every corporation, every metric. Computed once - see the note at the head of
 * this file for why this layer is not rebuilt on a corporation switch.
 */
export const CORPORATION_BENCHMARKS: CorporationBenchmark[] = build()

export function benchmarkFor(corporationId: string): CorporationBenchmark | undefined {
  return CORPORATION_BENCHMARKS.find((b) => b.corporationId === corporationId)
}

/** Median of a numeric set, or null where the set is empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}
