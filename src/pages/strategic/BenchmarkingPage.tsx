import { useMemo, useState } from 'react'
import { Award, Scale, TrendingUp, Users2 } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  MetricGrid,
  SegmentedControl,
  Select,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { RankedBarChart } from '@/components/charts'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { benchmarkService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { activeCorporation } from '@/config/municipality.config'
import {
  BENCHMARK_BASIS_LABEL,
  BENCHMARK_CATEGORY_LABEL,
  POPULATION_BAND_LABEL,
  type BenchmarkMetric,
  type CorporationBenchmark,
  type PopulationBand,
} from '@/types/benchmark'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/strategic/BenchmarkingPage.tsx
 *
 * Where this corporation stands among the twenty-nine.
 *
 * Every other page in this platform reports one corporation to itself. That is
 * necessary and it is also insufficient, because a figure without a comparison
 * cannot be judged. Sixty-eight per cent collection efficiency is a number; it
 * becomes a finding only when the officer knows the state median is
 * seventy-one and that four corporations of comparable size clear eighty.
 *
 * TWO KINDS OF FIGURE APPEAR HERE AND THEY ARE NOT INTERCHANGEABLE. Indicators
 * marked "Published" are arithmetic on figures the corporations themselves
 * publish - budget outlay, census population, sanctioned supply, notified
 * area. Indicators marked "Modelled" are generated for this demonstration,
 * because no comparable state-wide operational return exists in the public
 * domain. The distinction is shown on every metric and never collapsed,
 * because presenting a modelled figure as a published one is the most
 * damaging thing a comparative page could do.
 *
 * The peer band matters as much as the metric. Ranking a corporation of four
 * lakh residents against Brihanmumbai on a per-capita measure yields a true
 * number and a worthless one, so the cohort is a control rather than a
 * footnote.
 */

function build$BANDS(): Array<{ value: PopulationBand | 'all'; label: string }> {
  return [
  { value: 'all', label: t('All bands') },
  { value: 'mega', label: POPULATION_BAND_LABEL.mega },
  { value: 'large', label: POPULATION_BAND_LABEL.large },
  { value: 'medium', label: POPULATION_BAND_LABEL.medium },
  { value: 'small', label: POPULATION_BAND_LABEL.small },
]
}
let BANDS: Array<{ value: PopulationBand | 'all'; label: string }> = build$BANDS()
registerLayer(() => {
  BANDS = build$BANDS()
})

function formatValue(value: number | null, metric: BenchmarkMetric): string {
  if (value === null) return 'Not published'
  const prefix = metric.unit === '₹' ? '₹' : ''
  const suffix = metric.unit === '₹' ? '' : metric.unit
  return `${prefix}${formatNumber(value, metric.decimals)}${suffix}`
}

export function BenchmarkingPage(): React.JSX.Element {
  const [metricId, setMetricId] = useState('collection-efficiency')
  const [band, setBand] = useState<PopulationBand | 'all'>('all')

  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(t('State Benchmarking'))

  const metricsQuery = useServiceQuery(queryKeys.benchmark('metrics'), (u) => benchmarkService.metrics(u))
  const allQuery = useServiceQuery(queryKeys.benchmark('all'), (u) => benchmarkService.all(u))

  const metrics = useMemo(() => metricsQuery.data ?? [], [metricsQuery.data])
  const rows = useMemo(() => allQuery.data ?? [], [allQuery.data])

  const metric = useMemo(
    () => metrics.find((m) => m.id === metricId) ?? metrics[0],
    [metrics, metricId],
  )

  const cohort = useMemo(
    () => (band === 'all' ? rows : rows.filter((r) => r.band === band)),
    [rows, band],
  )

  /** Ranked within the chosen cohort - the stored rank is against all 29 and
   *  would be wrong the moment the operator narrows the peer group. */
  const ranked = useMemo(() => {
    if (!metric) return []
    return [...cohort]
      .filter((c) => typeof c.values[metric.id]?.value === 'number')
      .sort((a, b) => {
        const av = a.values[metric.id]!.value!
        const bv = b.values[metric.id]!.value!
        return metric.higherIsBetter ? bv - av : av - bv
      })
  }, [cohort, metric])

  const subjectIndex = ranked.findIndex((r) => r.corporationId === activeCorporation.id)
  const subject = subjectIndex >= 0 ? ranked[subjectIndex] : undefined
  const subjectValue = metric && subject ? (subject.values[metric.id]?.value ?? null) : null

  const cohortMedian = useMemo(() => {
    if (!metric) return null
    const values = ranked.map((r) => r.values[metric.id]!.value!).sort((a, b) => a - b)
    if (values.length === 0) return null
    const mid = Math.floor(values.length / 2)
    return values.length % 2 === 0 ? (values[mid - 1]! + values[mid]!) / 2 : values[mid]!
  }, [ranked, metric])

  if (metricsQuery.isLoading || allQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('Strategic Intelligence')}
          breadcrumbs={[{ label: t('Strategic Intelligence') }, { label: t('State Benchmarking') }]}
        />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={10} />
      </PageBody>
    )
  }

  if (metricsQuery.error || allQuery.error) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('Strategic Intelligence')}
          breadcrumbs={[{ label: t('Strategic Intelligence') }, { label: t('State Benchmarking') }]}
        />
        <ErrorState
          detail={(metricsQuery.error ?? allQuery.error)?.message}
          onRetry={() => {
            void metricsQuery.refetch()
            void allQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 10080,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const best = ranked[0]
  const publishedCount = metrics.filter((m) => m.basis === 'published').length

  const columns: Array<Column<CorporationBenchmark>> = [
    {
      id: 'rank',
      header: '#',
      cell: (r) => {
        const position = ranked.findIndex((x) => x.corporationId === r.corporationId) + 1
        return <span className="numeric text-ink-500">{position}</span>
      },
      sortValue: (r) => ranked.findIndex((x) => x.corporationId === r.corporationId) + 1,
      width: '3rem',
      align: 'right',
    },
    {
      id: 'corporation',
      header: t('Corporation'),
      cell: (r) => (
        <div className="min-w-0">
          <p
            className={
              r.corporationId === activeCorporation.id
                ? 'truncate font-semibold text-govt-700'
                : 'truncate font-medium text-ink-900'
            }
          >
            {r.shortName}
            {r.corporationId === activeCorporation.id ? (
              <span className="ml-1.5 text-[0.6875rem] font-normal text-govt-600">{t('(you)')}</span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-[0.6875rem] text-ink-500">{r.city}</p>
        </div>
      ),
      sortValue: (r) => r.shortName,
      searchValue: (r) => `${r.shortName} ${r.name} ${r.city} ${r.district}`,
      width: 'minmax(11rem,1.6fr)',
    },
    {
      id: 'value',
      header: metric ? metric.shortLabel : 'Value',
      cell: (r) => (
        <span className="numeric font-semibold text-ink-900">
          {metric ? formatValue(r.values[metric.id]?.value ?? null, metric) : '-'}
        </span>
      ),
      sortValue: (r) => (metric ? (r.values[metric.id]?.value ?? 0) : 0),
      align: 'right',
    },
    {
      id: 'vsMedian',
      header: t('vs cohort median'),
      cell: (r) => {
        if (!metric || cohortMedian === null) return <span className="text-ink-400">-</span>
        const value = r.values[metric.id]?.value
        if (typeof value !== 'number') return <span className="text-ink-400">-</span>
        const delta = value - cohortMedian
        const good = metric.higherIsBetter ? delta >= 0 : delta <= 0
        const sign = delta > 0 ? '+' : ''
        return (
          <span className={good ? 'numeric text-ok-700' : 'numeric text-crit-600'}>
            {sign}
            {formatNumber(delta, metric.decimals)}
          </span>
        )
      },
      sortValue: (r) => {
        if (!metric || cohortMedian === null) return 0
        return (r.values[metric.id]?.value ?? 0) - cohortMedian
      },
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'band',
      header: t('Size band'),
      cell: (r) => (
        <Badge tone="neutral" size="sm">
          {POPULATION_BAND_LABEL[r.band]}
        </Badge>
      ),
      sortValue: (r) => r.population,
      hideBelow: 'lg',
    },
    {
      id: 'grade',
      header: t('Grade'),
      cell: (r) => (r.grade ? <Badge tone="neutral" size="sm">{r.grade}</Badge> : <span className="text-ink-400">-</span>),
      sortValue: (r) => r.grade ?? 'Z',
      align: 'center',
      hideBelow: 'xl',
    },
    {
      id: 'population',
      header: t('Population'),
      cell: (r) => <span className="numeric text-ink-700">{formatNumber(r.population)}</span>,
      sortValue: (r) => r.population,
      align: 'right',
      hideBelow: 'xl',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Strategic Intelligence')}
        breadcrumbs={[{ label: t('Strategic Intelligence') }, { label: t('State Benchmarking') }]}
        freshness={freshness}
      />

      <Card className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <Label htmlFor="metric-select">{t('Indicator')}</Label>
          <Select
            id="metric-select"
            value={metricId}
            onChange={(e) => setMetricId(e.target.value)}
            options={metrics.map((m) => ({
              value: m.id,
              label: `${m.label} · ${BENCHMARK_CATEGORY_LABEL[m.category]}`,
            }))}
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor="band-control">{t('Peer group')}</Label>
          <div id="band-control" className="scrollbar-slim overflow-x-auto">
            <SegmentedControl<PopulationBand | 'all'>
              value={band}
              onChange={setBand}
              ariaLabel="Peer group by population band"
              options={BANDS.map((b) => ({ value: b.value, label: b.label }))}
            />
          </div>
        </div>
      </Card>

      {/* ── Two columns ─────────────────────────────────────────────
          The comparison itself — what the indicator means, who leads on it,
          and the full league — reads down the wide column. The corporation's
          own standing and the disclosure of what kind of figure this is sit
          beside it, where they can be checked against the table without
          scrolling the table away. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          {!metric ? (
            <EmptyState title={t('No indicator selected')} detail="Choose an indicator to compare." />
          ) : ranked.length === 0 ? (
            <EmptyState
              title={t('No corporation in this peer group publishes this indicator')}
              detail="Widen the peer group, or choose a different indicator."
            />
          ) : (
            <>
              <Card tone="default" className="flex items-start gap-3">
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-semibold text-ink-900">
                    {metric.label}{' '}
                    <Badge tone={metric.basis === 'published' ? 'positive' : 'info'} size="sm">
                      {BENCHMARK_BASIS_LABEL[metric.basis]}
                    </Badge>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-600">{metric.description}</p>
                  {metric.derivation ? (
                    <p className="mt-1.5 text-[0.6875rem] text-ink-500">
                      <span className="label-institutional">{t('Derivation')}</span> · {metric.derivation}
                    </p>
                  ) : null}
                </div>
              </Card>

              <GovPanel dense tone="amber" title={t('Leaders · {0}', metric.shortLabel)}>
                <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                  {metric.higherIsBetter
                    ? 'Highest performers in the selected peer group.'
                    : 'Lowest - and therefore best - performers in the selected peer group.'}
                </p>
                <div className="px-3 pb-3" style={{ height: Math.max(200, Math.min(ranked.length, 12) * 26) }}>
                  <RankedBarChart
                    data={ranked.slice(0, 12).map((r) => ({
                      // The operator's own corporation is marked in the label -
                      // this chart colours by value, not by row, so the bar itself
                      // cannot carry the distinction.
                      label: r.corporationId === activeCorporation.id ? `${r.shortName} ◂ you` : r.shortName,
                      value: r.values[metric.id]!.value!,
                    }))}
                    unit={metric.unit === '₹' ? '' : metric.unit}
                    higherIsWorse={!metric.higherIsBetter}
                  />
                </div>
              </GovPanel>

              <GovPanel dense tone="red" title={t('League table')}>
                <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                  {t('All {0} corporations in the selected peer group, ranked on {1}.', ranked.length, metric.label.toLowerCase())}
                </p>
                <DataTable
                  rows={ranked}
                  columns={columns}
                  rowKey={(r) => r.corporationId}
                  searchable
                  searchPlaceholder="Search corporation, city or district"
                  activeRowKey={activeCorporation.id}
                  pageSize={15}
                />
              </GovPanel>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
          {metric && ranked.length > 0 ? (
            <MetricGrid columns={2}>
              <MetricCard
                label={`${activeCorporation.shortName} position`}
                value={subject && subjectIndex >= 0 ? `${subjectIndex + 1}` : '-'}
                support={subject ? `of ${ranked.length} in this peer group` : 'Not ranked in this peer group'}
                tone={
                  subjectIndex < 0
                    ? 'default'
                    : subjectIndex < ranked.length / 3
                      ? 'positive'
                      : subjectIndex > (ranked.length * 2) / 3
                        ? 'critical'
                        : 'warn'
                }
                icon={<Award className="h-4 w-4" />}
                origin="demonstration"
              />
              <MetricCard
                label={`${activeCorporation.shortName} value`}
                value={formatValue(subjectValue, metric)}
                support={metric.label}
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <MetricCard
                label={t('Peer group median')}
                value={cohortMedian === null ? '-' : formatValue(Number(cohortMedian.toFixed(metric.decimals)), metric)}
                support={t('Across {0} corporations', ranked.length)}
                icon={<Users2 className="h-4 w-4" />}
              />
              <MetricCard
                label={t('Best in peer group')}
                value={best && metric ? formatValue(best.values[metric.id]?.value ?? null, metric) : '-'}
                support={best ? `${best.shortName} · ${best.city}` : undefined}
                tone="positive"
              />
            </MetricGrid>
          ) : null}

          <Card tone="info" className="flex items-start gap-3">
            <Scale className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-govt-800">{t('Two kinds of figure appear here')}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                <strong>{t('Published')}</strong>{' '}{t('indicators (')}{publishedCount} of {metrics.length}{t(') are arithmetic on figures the corporations themselves publish - budget outlay, census population, sanctioned water supply, notified area. They are as reliable as their sources.')}{' '}<strong>{t('Modelled')}</strong>{' '}{t('indicators are generated for this demonstration, because no comparable state-wide operational return exists in the public domain. Every metric carries its basis, and the two are never combined into a single composite score - a ranking that mixed them would look authoritative and mean nothing.')}
              </p>
            </div>
          </Card>

          <DemonstrationNotice />
        </div>
      </div>
    </PageBody>
  )
}

export default BenchmarkingPage
