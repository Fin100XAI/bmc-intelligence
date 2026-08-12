import {
  BENCHMARK_METRICS,
  BENCHMARK_METRIC_BY_ID,
  CORPORATION_BENCHMARKS,
  median,
} from '@/data/benchmark.data'
import type {
  BenchmarkMetric,
  CorporationBenchmark,
  PeerPosition,
  PopulationBand,
} from '@/types/benchmark'
import type { User } from '@/types/organisation'
import { deepClone, simulateLatency } from './client'

/**
 * src/services/benchmark.service.ts
 *
 * Cross-corporation benchmarking.
 *
 * This service is deliberately NOT ward-scoped or tenant-scoped, and that is
 * the one place in this platform where that is the correct answer. Every other
 * service narrows to the operator's own corporation and their own wards within
 * it, because operational data about a ward belongs to the officers
 * accountable for it. Comparative standing between municipal corporations is a
 * different kind of fact: it is derived from published state and corporation
 * returns, it is what a Commissioner is asked about in front of the General
 * Body, and withholding it from an officer of one corporation because the
 * figure concerns another would serve no protective purpose at all.
 *
 * Authentication is still required - an unauthenticated caller receives
 * nothing - and the route itself sits behind the permission engine.
 */

async function all(user: User | null): Promise<CorporationBenchmark[]> {
  await simulateLatency('benchmark.all')
  if (!user) return []
  return deepClone(CORPORATION_BENCHMARKS)
}

async function metrics(user: User | null): Promise<BenchmarkMetric[]> {
  await simulateLatency('benchmark.metrics')
  if (!user) return []
  return deepClone(BENCHMARK_METRICS)
}

/**
 * One corporation's standing on every metric, against a chosen cohort.
 *
 * `band` narrows the cohort to corporations of comparable size. Ranking a
 * corporation of four lakh residents against Brihanmumbai on a per-capita
 * measure produces a true number and a useless one, so the peer group is a
 * first-class argument rather than an afterthought.
 */
async function position(
  user: User | null,
  corporationId: string,
  band?: PopulationBand,
): Promise<PeerPosition[]> {
  await simulateLatency(`benchmark.position:${corporationId}:${band ?? 'all'}`)
  if (!user) return []

  const subject = CORPORATION_BENCHMARKS.find((b) => b.corporationId === corporationId)
  if (!subject) return []

  const cohort = band ? CORPORATION_BENCHMARKS.filter((b) => b.band === band) : CORPORATION_BENCHMARKS

  const positions: PeerPosition[] = BENCHMARK_METRICS.map((metric) => {
    const values = cohort
      .map((c) => c.values[metric.id]?.value)
      .filter((v): v is number => typeof v === 'number')

    const subjectValue = subject.values[metric.id]?.value ?? null
    const cohortMedian = median(values)

    // Rank within the cohort, recomputed - the stored rank is against all
    // twenty-nine and would be wrong for a narrowed peer group.
    const ordered = cohort
      .map((c) => ({ id: c.corporationId, shortName: c.shortName, value: c.values[metric.id]?.value ?? null }))
      .filter((x): x is { id: string; shortName: string; value: number } => x.value !== null)
      .sort((a, b) => (metric.higherIsBetter ? b.value - a.value : a.value - b.value))

    const rankIndex = ordered.findIndex((x) => x.id === corporationId)
    const best = ordered[0] ?? null

    const atOrAboveMedian =
      subjectValue === null || cohortMedian === null
        ? null
        : metric.higherIsBetter
          ? subjectValue >= cohortMedian
          : subjectValue <= cohortMedian

    return {
      metric,
      value: subjectValue,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      rankedOf: ordered.length,
      median: cohortMedian === null ? null : Number(cohortMedian.toFixed(metric.decimals)),
      bestValue: best?.value ?? null,
      bestCorporation: best?.shortName ?? null,
      deltaFromMedian:
        subjectValue === null || cohortMedian === null
          ? null
          : Number((subjectValue - cohortMedian).toFixed(metric.decimals)),
      atOrAboveMedian,
    }
  })

  return deepClone(positions)
}

/** A single metric's league table, best first. */
async function league(
  user: User | null,
  metricId: string,
  band?: PopulationBand,
): Promise<CorporationBenchmark[]> {
  await simulateLatency(`benchmark.league:${metricId}:${band ?? 'all'}`)
  if (!user) return []

  const metric = BENCHMARK_METRIC_BY_ID[metricId]
  if (!metric) return []

  const cohort = band ? CORPORATION_BENCHMARKS.filter((b) => b.band === band) : CORPORATION_BENCHMARKS

  const ranked = [...cohort]
    .filter((c) => typeof c.values[metricId]?.value === 'number')
    .sort((a, b) => {
      const av = a.values[metricId]!.value!
      const bv = b.values[metricId]!.value!
      return metric.higherIsBetter ? bv - av : av - bv
    })

  return deepClone(ranked)
}

export const benchmarkService = {
  all,
  metrics,
  position,
  league,
}
