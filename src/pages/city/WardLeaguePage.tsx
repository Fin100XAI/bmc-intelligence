import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownUp, Award, ListOrdered, Scale, Users2 } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  MetricGrid,
  SegmentedControl,
  StateBadge,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { RankedBarChart } from '@/components/charts'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardService, type WardRankMetric, type WardRankRow } from '@/services/ward.service'
import { useDrawerStore } from '@/stores/ui.store'
import type { DataFreshness } from '@/types/common'
import type { Ward } from '@/types/organisation'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatNumber, formatPercent } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/city/WardLeaguePage.tsx
 *
 * Which ward first?
 *
 * Ward Intelligence answers "how is this ward?" one ward at a time, which means
 * an officer wanting to know where to send a crew this week must open
 * twenty-four pages and hold twenty-four figures in their head. That is a
 * reasonable way to brief a ward officer and an unreasonable way to allocate a
 * city's attention. This page answers the other question - which ward first -
 * by putting every ward on one indicator, in one order, on one screen.
 *
 * THE NUMBER THAT MATTERS HERE IS NOT ANY SINGLE WARD'S SCORE. It is the SPREAD
 * across wards. A city where the best ward scores 82 and the worst 41 is not
 * one city being served unevenly at the margins; it is two cities under one
 * corporation, and the gap between them is the finding a commissioner is
 * entitled to see without assembling it by hand.
 *
 * EVERY FIGURE ON THIS PAGE IS THE SAME FIGURE WARD INTELLIGENCE REPORTS. The
 * page derives entirely from `wardService.rank()` and `wardService.list()` and
 * computes nothing of its own beyond ordering, the median and the spread. A
 * league table that quietly recalculated its inputs would let two pages
 * disagree about the same ward, and the officer would have no way to tell which
 * one to believe.
 *
 * THE ORDER IS ATTENTION ORDER, NOT MERIT ORDER. `rankWards` returns every one
 * of the five indicators worst-first - highest risk, lowest health, most open
 * complaints, lowest monsoon readiness, lowest collection efficiency - because
 * the ward at position one is the ward that needs the crew. Direction of merit
 * is therefore stated explicitly on every indicator rather than left to the
 * reader to infer from the ordering, and the table can be re-sorted on any
 * column for anyone who wants to read it the other way round.
 *
 * There is no ward filter. The league is inherently all-wards: narrowing it to
 * three wards would leave a median computed from three wards and a spread that
 * means nothing. Ward scope is already applied where it belongs - inside the
 * service, against the acting officer's authorised wards.
 */

interface LeagueMetric {
  id: WardRankMetric
  label: string
  shortLabel: string
  /** What the figure is, in one sentence an officer can act on. */
  description: string
  /** Stated direction of merit - never left to the reader to infer. */
  merit: string
  higherIsBetter: boolean
  /** Suffix appended to a formatted value. Percentages format themselves. */
  unit: string
  decimals: number
  /** True where the figure is a raw count rather than a 0-100 index. */
  isCount: boolean
}

function build$METRICS(): LeagueMetric[] {
  return [
  {
    id: 'risk',
    label: t('Composite risk index'),
    shortLabel: 'Risk',
    description:
      t('The ward’s composite risk index, assembled from service delivery, infrastructure condition, flood exposure, public health signal, capital delivery and revenue realisation.'),
    merit: 'Lower is better - the index counts what is going wrong.',
    higherIsBetter: false,
    unit: ' / 100',
    decimals: 0,
    isCount: false,
  },
  {
    id: 'health',
    label: t('Operational health index'),
    shortLabel: 'Health',
    description:
      t('The ward’s composite operational health index across every service the corporation delivers there, expressed as a single 0-100 reading.'),
    merit: 'Higher is better.',
    higherIsBetter: true,
    unit: ' / 100',
    decimals: 0,
    isCount: false,
  },
  {
    id: 'complaints',
    label: t('Open citizen complaints'),
    shortLabel: 'Complaints',
    description:
      t('Citizen complaints currently open in the ward, counted as a standing workload rather than as a rate against population.'),
    merit:
      'Lower is better - though a ward with very few complaints may be under-reporting rather than well served, and should be read beside its health index.',
    higherIsBetter: false,
    unit: '',
    decimals: 0,
    isCount: true,
  },
  {
    id: 'monsoon',
    label: t('Monsoon readiness'),
    shortLabel: 'Monsoon',
    description:
      t('Pre-monsoon readiness: desilting completed, pump availability and preparation measured against the waterlogging locations recorded in the ward.'),
    merit: 'Higher is better.',
    higherIsBetter: true,
    unit: ' / 100',
    decimals: 0,
    isCount: false,
  },
  {
    id: 'revenue',
    label: t('Collection efficiency'),
    shortLabel: 'Revenue',
    description:
      t('Own-revenue collection efficiency for the ward - what has been collected against what was targeted for the year.'),
    merit: 'Higher is better.',
    higherIsBetter: true,
    unit: '%',
    decimals: 1,
    isCount: false,
  },
]
}
let METRICS: LeagueMetric[] = build$METRICS()
registerLayer(() => {
  METRICS = build$METRICS()
})

function formatValue(value: number, metric: LeagueMetric): string {
  if (metric.id === 'revenue') return formatPercent(value, metric.decimals)
  return `${formatNumber(value, metric.decimals)}${metric.unit}`
}

export function WardLeaguePage(): React.JSX.Element {
  usePageMasthead(
    t('Ward League Table'),
    t('Every ward on one indicator, in one order. Ward Intelligence answers how a ward is doing; this page answers which ward to attend to first.'),
  )

  const [metricId, setMetricId] = useState<WardRankMetric>('risk')
  const openDrawer = useDrawerStore((s) => s.open)

  const rankQuery = useServiceQuery(queryKeys.wardLeague(`rank:${metricId}`), (u) =>
    wardService.rank(u, metricId),
  )
  const wardsQuery = useServiceQuery(queryKeys.wardLeague('wards'), (u) => wardService.list(u))

  const metric = useMemo(
    () => METRICS.find((m) => m.id === metricId) ?? METRICS[0]!,
    [metricId],
  )

  /** Rows arrive from the service in attention order and are left in it. */
  const rows = useMemo(() => rankQuery.data ?? [], [rankQuery.data])

  /** Ward establishment detail - region, population, state - joined on to the
   *  ranked rows so the table can say who a bad score is happening to. Both
   *  reads are scoped by the same service, so the two sets agree. */
  const wardById = useMemo(() => {
    const map = new Map<string, Ward>()
    for (const ward of wardsQuery.data ?? []) map.set(ward.id, ward)
    return map
  }, [wardsQuery.data])

  const stats = useMemo(() => {
    if (rows.length === 0) return null
    const ascending = [...rows].sort((a, b) => a.value - b.value)
    const lowest = ascending[0]!
    const highest = ascending[ascending.length - 1]!
    const values = ascending.map((r) => r.value)
    const mid = Math.floor(values.length / 2)
    const median = values.length % 2 === 0 ? (values[mid - 1]! + values[mid]!) / 2 : values[mid]!

    // Direction of merit decides which end is the best ward. This agrees with
    // the service's own worst-first ordering for all five indicators; deriving
    // it from merit rather than from position keeps the two independent.
    const best = metric.higherIsBetter ? highest : lowest
    const worst = metric.higherIsBetter ? lowest : highest
    const spread = Math.abs(highest.value - lowest.value)

    // Scale-free, so one threshold reads sensibly on a 0-100 index and on a
    // raw complaint count alike.
    const spreadRatio = median === 0 ? 0 : spread / Math.abs(median)

    return { best, worst, median, spread, spreadRatio, count: rows.length }
  }, [rows, metric])

  const isLoading = rankQuery.isLoading || wardsQuery.isLoading
  const error = rankQuery.error ?? wardsQuery.error

  if (isLoading) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('Wards & Localities')}
          breadcrumbs={[{ label: t('Wards & Localities') }, { label: t('Ward League Table') }]}
        />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={10} />
      </PageBody>
    )
  }

  if (error) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('Wards & Localities')}
          breadcrumbs={[{ label: t('Wards & Localities') }, { label: t('Ward League Table') }]}
        />
        <ErrorState
          detail={error.message}
          onRetry={() => {
            void rankQuery.refetch()
            void wardsQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const spreadTone = !stats
    ? 'default'
    : stats.spreadRatio >= 0.6
      ? 'critical'
      : stats.spreadRatio >= 0.3
        ? 'warn'
        : 'positive'

  const columns: Array<Column<WardRankRow>> = [
    {
      id: 'position',
      header: '#',
      cell: (r) => {
        const position = rows.indexOf(r) + 1
        return <span className="numeric text-ink-500">{position}</span>
      },
      sortValue: (r) => rows.indexOf(r) + 1,
      exportValue: (r) => rows.indexOf(r) + 1,
      width: '3rem',
      align: 'right',
    },
    {
      id: 'ward',
      header: t('Ward'),
      cell: (r) => {
        const ward = wardById.get(r.wardId)
        return (
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{r.label}</p>
            {ward ? <p className="mt-0.5 truncate text-[0.6875rem] text-ink-500">{ward.region}</p> : null}
          </div>
        )
      },
      sortValue: (r) => r.label,
      searchValue: (r) => `${r.label} ${wardById.get(r.wardId)?.region ?? ''}`,
      exportValue: (r) => r.label,
      width: 'minmax(11rem,1.6fr)',
    },
    {
      id: 'value',
      header: metric.shortLabel,
      cell: (r) => <span className="numeric font-semibold text-ink-900">{formatValue(r.value, metric)}</span>,
      sortValue: (r) => r.value,
      exportValue: (r) => r.value,
      align: 'right',
    },
    {
      id: 'vsMedian',
      header: t('vs city median'),
      cell: (r) => {
        if (!stats) return <span className="text-ink-400">-</span>
        const delta = r.value - stats.median
        if (delta === 0) return <span className="numeric text-ink-500">level</span>
        const good = metric.higherIsBetter ? delta > 0 : delta < 0
        return (
          <span className={good ? 'numeric text-ok-700' : 'numeric text-crit-600'}>
            {delta > 0 ? '+' : ''}
            {formatNumber(delta, metric.decimals === 0 ? 1 : metric.decimals)}
          </span>
        )
      },
      sortValue: (r) => (stats ? r.value - stats.median : 0),
      exportValue: (r) => (stats ? Math.round((r.value - stats.median) * 10) / 10 : 0),
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'population',
      header: t('Residents'),
      cell: (r) => {
        const ward = wardById.get(r.wardId)
        return ward ? (
          <span className="numeric text-ink-700">{formatNumber(ward.population)}</span>
        ) : (
          <span className="text-ink-400">-</span>
        )
      },
      sortValue: (r) => wardById.get(r.wardId)?.population ?? 0,
      exportValue: (r) => wardById.get(r.wardId)?.population ?? null,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'state',
      header: t('State'),
      cell: (r) => {
        const ward = wardById.get(r.wardId)
        return ward ? <StateBadge state={ward.state} /> : <span className="text-ink-400">-</span>
      },
      sortValue: (r) => wardById.get(r.wardId)?.state ?? 'zz',
      exportValue: (r) => wardById.get(r.wardId)?.state ?? null,
      hideBelow: 'sm',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Wards & Localities')}
        breadcrumbs={[{ label: t('Wards & Localities') }, { label: t('Ward League Table') }]}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <Card className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <Label htmlFor="league-metric">{t('Indicator')}</Label>
          <div id="league-metric" className="scrollbar-slim overflow-x-auto">
            <SegmentedControl<WardRankMetric>
              value={metricId}
              onChange={setMetricId}
              ariaLabel="Indicator the ward league is ranked on"
              options={METRICS.map((m) => ({ value: m.id, label: m.shortLabel }))}
            />
          </div>
        </div>
        <div className="min-w-[18rem] flex-1">
          <p className="text-[0.8125rem] font-semibold text-ink-900">
            {metric.label}{' '}
            <Badge tone={metric.higherIsBetter ? 'positive' : 'warn'} size="sm">
              {metric.higherIsBetter ? 'Higher is better' : 'Lower is better'}
            </Badge>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">{metric.description}</p>
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">
            <span className="label-institutional">{t('Direction of merit')}</span> · {metric.merit}
          </p>
        </div>
      </Card>

      {!stats || rows.length === 0 ? (
        <EmptyState
          title={t('No wards are within your authorised scope')}
          detail="The league is drawn from the wards your role is authorised to see. An officer scoped to a single ward has no cohort to rank against."
        />
      ) : (
        <>
          <MetricGrid columns={4}>
            <MetricCard
              label={t('Best ward')}
              value={formatValue(stats.best.value, metric)}
              support={stats.best.label}
              tone="positive"
              icon={<Award className="h-4 w-4" />}
              origin="demonstration"
            />
            <MetricCard
              label={t('Worst ward')}
              value={formatValue(stats.worst.value, metric)}
              support={stats.worst.label}
              tone="critical"
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <MetricCard
              label={t('City median')}
              value={formatValue(Math.round(stats.median * 10) / 10, metric)}
              support={t('Across {0} wards in scope', formatNumber(stats.count))}
              icon={<Users2 className="h-4 w-4" />}
            />
            <MetricCard
              label={t('Spread, best to worst')}
              value={
                metric.id === 'revenue'
                  ? `${formatNumber(stats.spread, 1)} pp`
                  : formatNumber(stats.spread, metric.decimals)
              }
              unit={metric.isCount ? ' complaints' : metric.id === 'revenue' ? '' : ' points'}
              support={t('The worst ward sits {0} of the city median away from the best', formatPercent(stats.spreadRatio * 100, 0))}
              tone={spreadTone}
              icon={<ArrowDownUp className="h-4 w-4" />}
              explanation="The spread is the distance between the best-performing and worst-performing ward on this indicator. It is the measure of whether the city is being served evenly. A city-wide average conceals it entirely."
            />
          </MetricGrid>

          {/* Two columns. The league table is the answer to the question the
              page asks and carries the width; the spread reading, the ranked
              bars and the standing note on how to read them run beside it. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
            <Card flush>
              <CardHeader
                bordered
                icon={<Scale className="h-4 w-4" />}
                title={t('League table')}
                description={t('Position one is the ward most in need of attention on the selected indicator, not the leader. Sort on any column to read it the other way round. Select a ward to open its full profile.')}
              />
              <DataTable
                rows={rows}
                columns={columns}
                rowKey={(r) => r.wardId}
                searchable
                searchPlaceholder="Search wards"
                onRowClick={(r) => openDrawer({ kind: 'ward', id: r.wardId })}
                pageSize={15}
                exportName={`ward-league-${metric.id}`}
                exportFilters={{ Indicator: metric.label, Order: 'Worst first' }}
              />
            </Card>
            </div>

            <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
            <Card tone={spreadTone === 'positive' ? 'default' : spreadTone} className="flex items-start gap-3">
              <ArrowDownUp className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold text-ink-900">
                  {spreadTone === 'critical'
                    ? 'The city is not being served evenly on this indicator'
                    : spreadTone === 'warn'
                      ? 'A material gap separates the best and worst wards'
                      : 'Wards are closely grouped on this indicator'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  {t('{0} stands at {1} and {2} at {3} - a spread of {4} against a city median of {5}. {6}', stats.best.label, formatValue(stats.best.value, metric), stats.worst.label, formatValue(stats.worst.value, metric), formatNumber(stats.spread, metric.decimals), formatValue(Math.round(stats.median * 10) / 10, metric), spreadTone === 'positive'
                    ? 'A narrow spread means the indicator is a city-wide condition rather than a ward-specific one, and city-wide action is the proportionate response.'
                    : 'Where the spread is this wide, allocating uniformly across wards leaves the worst-served wards no better off. The wards at the head of this table are where a marginal crew, a marginal rupee or a marginal inspection buys the most.')}
                </p>
              </div>
            </Card>

            <Card flush className="flex flex-col">
              <CardHeader
                bordered
                icon={<ListOrdered className="h-4 w-4" />}
                title={t('Every ward · {0}', metric.shortLabel)}
                description={t('All {0} wards in scope, worst first. {1}', formatNumber(stats.count), metric.merit)}
              />
              <div className="px-4 py-4" style={{ height: Math.max(240, rows.length * 24) }}>
                <RankedBarChart
                  data={rows.map((r) => ({ label: r.label.slice(0, 22), value: r.value }))}
                  unit={metric.unit}
                  higherIsWorse={!metric.higherIsBetter}
                />
              </div>
              {metric.isCount ? (
                <p className="px-4 pb-4 text-[0.6875rem] leading-relaxed text-ink-500">
                  {t('Bar colour is banded for 0-100 indices, so on a raw complaint count the bars carry length only. Read the order and the length, not the hue.')}
                </p>
              ) : null}
            </Card>

            <Card tone="info" className="flex items-start gap-3">
              <Scale className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold text-govt-800">{t('Read the spread, not the leader')}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  {t('The finding on this page is not any single ward&apos;s score. It is the distance between the best ward and the worst. A city where the best ward scores 82 and the worst 41 is not one city being served - it is two, and no city-wide average will show that. Every figure here is the figure Ward Intelligence reports for the same ward: this page orders and compares them, and computes nothing of its own beyond the median and the spread.')}
                </p>
              </div>
            </Card>
            </div>
          </div>
        </>
      )}
    </PageBody>
  )
}

export default WardLeaguePage
