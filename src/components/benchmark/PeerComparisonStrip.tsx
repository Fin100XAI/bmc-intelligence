import { useMemo } from 'react'
import { Scale } from 'lucide-react'
import { Badge, Card } from '@/components/ui'
import { activeCorporation } from '@/config/municipality.config'
import { BENCHMARK_METRIC_BY_ID, CORPORATION_BENCHMARKS, median } from '@/data/benchmark.data'
import { BENCHMARK_BASIS_LABEL, POPULATION_BAND_LABEL, type PopulationBand } from '@/types/benchmark'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/components/benchmark/PeerComparisonStrip.tsx
 *
 * "Where do we stand" - a single line of comparative context, droppable onto
 * any domain page.
 *
 * A domain page reports a corporation to itself, which is necessary and
 * insufficient: an officer looking at a non-revenue-water figure of thirty-two
 * per cent cannot tell from that page alone whether it is a crisis or an
 * achievement. This strip answers that question in one line without sending
 * them to another screen, and links to the full league table when it is not
 * enough.
 *
 * It reads the comparative layer directly rather than through the service
 * seam, because it renders inline beside data the page has already loaded and
 * a second async boundary here would make every host page flicker. The
 * comparative layer is a static computation over the corporation registry -
 * there is nothing to await and nothing to scope.
 */

export interface PeerComparisonStripProps {
  /** Metric id from `BENCHMARK_METRICS`. */
  metricId: string
  /**
   * Restrict the cohort to corporations of comparable size. Strongly
   * recommended for per-capita measures, where a state-wide ranking is true
   * and useless.
   */
  band?: PopulationBand | 'all'
  /** Override the value shown for this corporation - pass the page's own live
   *  figure where the page computes it more precisely than the comparative
   *  layer does. */
  valueOverride?: number
  className?: string
}

export function PeerComparisonStrip({
  metricId,
  band = 'all',
  valueOverride,
  className,
}: PeerComparisonStripProps): React.JSX.Element | null {
  const metric = BENCHMARK_METRIC_BY_ID[metricId]

  const cohort = useMemo(
    () => (band === 'all' ? CORPORATION_BENCHMARKS : CORPORATION_BENCHMARKS.filter((c) => c.band === band)),
    [band],
  )

  const standing = useMemo(() => {
    if (!metric) return null

    const ordered = cohort
      .map((c) => ({ id: c.corporationId, shortName: c.shortName, value: c.values[metric.id]?.value ?? null }))
      .filter((x): x is { id: string; shortName: string; value: number } => x.value !== null)
      .sort((a, b) => (metric.higherIsBetter ? b.value - a.value : a.value - b.value))

    if (ordered.length === 0) return null

    const own = valueOverride ?? ordered.find((x) => x.id === activeCorporation.id)?.value ?? null
    const rank = ordered.findIndex((x) => x.id === activeCorporation.id) + 1
    const mid = median(ordered.map((x) => x.value))

    return {
      own,
      rank: rank > 0 ? rank : null,
      of: ordered.length,
      median: mid,
      best: ordered[0]!,
      better: own === null || mid === null ? null : metric.higherIsBetter ? own >= mid : own <= mid,
    }
  }, [cohort, metric, valueOverride])

  if (!metric || !standing) return null

  const suffix = metric.unit === '₹' ? '' : metric.unit
  const prefix = metric.unit === '₹' ? '₹' : ''
  const show = (v: number | null): string =>
    v === null ? '-' : `${prefix}${formatNumber(v, metric.decimals)}${suffix}`

  return (
    <Card tone="default" className={className}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">
          <Scale className="h-3.5 w-3.5" aria-hidden />
          {t('Where we stand')}
        </span>

        <span className="text-xs text-ink-700">
          <strong className="numeric text-ink-900">{show(standing.own)}</strong>{' '}
          <span className="text-ink-500">{metric.label.toLowerCase()}</span>
        </span>

        {standing.rank ? (
          <Badge tone={standing.better ? 'positive' : 'warn'} size="sm">
            {t('Rank {0} of {1}', standing.rank, standing.of)}
          </Badge>
        ) : null}

        <span className="text-xs text-ink-600">
          {t('Peer median')}{' '}<strong className="numeric text-ink-800">{show(standing.median)}</strong>
        </span>

        <span className="text-xs text-ink-600">
          {t('Best')}{' '}<strong className="numeric text-ink-800">{show(standing.best.value)}</strong>{' '}
          <span className="text-ink-500">({standing.best.shortName})</span>
        </span>

        <span className="ml-auto flex items-center gap-2">
          <Badge tone="neutral" size="sm">
            {band === 'all' ? t('All bands') : POPULATION_BAND_LABEL[band]}
          </Badge>
          <Badge tone={metric.basis === 'published' ? 'positive' : 'info'} size="sm">
            {BENCHMARK_BASIS_LABEL[metric.basis]}
          </Badge>
        </span>
      </div>
    </Card>
  )
}

export default PeerComparisonStrip
