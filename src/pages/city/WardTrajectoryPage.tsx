import { useMemo } from 'react'
import { ArrowDownRight, CalendarClock, Gauge, TrendingDown, TrendingUp } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  StateBadge,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { CATEGORICAL_SERIES, CHART_COLOURS, CategoryBarChart, Sparkline, TrendChart } from '@/components/charts'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardTrajectoryService } from '@/services/ward-trajectory.service'
import type { WardTrajectory } from '@/services/ward-trajectory.service'
// Vocabulary only. Every figure on this page arrives through the service above;
// the direction labels come from the module that defines the classification so
// the two cannot drift apart.
import { TRAJECTORY_DIRECTION_LABEL } from '@/domains/wards/trajectory'
import { useFilterStore } from '@/stores/ui.store'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/city/WardTrajectoryPage.tsx
 *
 * Ward trajectory and early warning.
 *
 * Every other ward surface in this platform is a snapshot, and a snapshot can
 * only ever tell an officer where a ward already is. This one is about which
 * way it is going.
 *
 * The distinction is not academic. A ward at 72 falling four points a month is
 * a harder problem than a ward that has sat at 65 for a year, and a list sorted
 * by level puts the second one first. Rank by level alone and the corporation
 * arrives after the deterioration rather than before it - which is the ordinary
 * failure mode of municipal reporting, not an unusual one.
 *
 * The projection on this page is a straight-line extrapolation of recent
 * movement. It is not a forecast, and the page says so wherever it appears.
 */

const HIGHLIGHT_WARDS = 4
const PROJECTION_MONTHS = 6

const DIRECTION_TONE: Record<WardTrajectory['direction'], BadgeTone> = {
  deteriorating: 'critical',
  steady: 'neutral',
  improving: 'positive',
}

/** Slopes read as a rate, so the sign is always shown. */
function formatSlope(slope: number): string {
  return `${slope > 0 ? '+' : ''}${slope.toFixed(1)}`
}

function build$BREADCRUMBS() {
  return [{ label: t('Wards & Localities') }, { label: t('Ward Trajectory & Early Warning') }]
}
let BREADCRUMBS: ReturnType<typeof build$BREADCRUMBS> = build$BREADCRUMBS()
registerLayer(() => {
  BREADCRUMBS = build$BREADCRUMBS()
})
const EYEBROW = 'Wards & Localities'
const TITLE = 'Ward Trajectory & Early Warning'

export function WardTrajectoryPage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)

  const boardQuery = useServiceQuery(queryKeys.wardTrajectory('board'), (u) => wardTrajectoryService.board(u))

  const board = boardQuery.data ?? null

  // The standfirst quotes the threshold the board itself publishes, so it can
  // only be stated once the board has resolved. Until then the masthead keeps
  // the route's own description rather than printing a placeholder figure.
  usePageMasthead(TITLE)
  const fastestId = board?.summary.fastestFalling?.wardId ?? null

  // The projection line is fetched for whichever ward is falling fastest, which
  // is not known until the board resolves. It is deliberately a second read
  // through the service rather than arithmetic done here: the straight-line
  // extension belongs to the domain module that fitted the slope, and a page
  // that recomputed it could drift away from the figure in the table beside it.
  const projectionQuery = useServiceQuery(
    queryKeys.wardTrajectory(`projection:${fastestId ?? 'none'}`),
    (u) => wardTrajectoryService.projection(u, fastestId ?? '', PROJECTION_MONTHS),
    { enabled: Boolean(fastestId) },
  )

  const wards = useMemo(() => board?.wards ?? [], [board])

  const filtered = useMemo(
    () =>
      wards.filter((w) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(w.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!w.wardName.toLowerCase().includes(q) && !w.wardCode.toLowerCase().includes(q)) return false
        }
        return true
      }),
    [wards, filters],
  )

  /** The worst few wards, as one row per month with a column per ward. */
  const highlight = useMemo(() => filtered.slice(0, HIGHLIGHT_WARDS), [filtered])

  const highlightSeries = useMemo(
    () =>
      highlight.map((w, i) => ({
        key: w.wardId,
        label: w.wardShortName,
        colour: CATEGORICAL_SERIES[i % CATEGORICAL_SERIES.length],
      })),
    [highlight],
  )

  const highlightData = useMemo(() => {
    if (highlight.length === 0) return []
    const months = highlight[0].series.map((p) => p.month)
    return months.map((month, monthIndex) => {
      const row: Record<string, string | number> = { month }
      for (const w of highlight) {
        row[w.wardId] = w.series[monthIndex]?.score ?? 0
      }
      return row
    })
  }, [highlight])

  if (boardQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={EYEBROW} breadcrumbs={BREADCRUMBS} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }

  if (boardQuery.error || !board) {
    return (
      <PageBody>
        <PageHeader eyebrow={EYEBROW} breadcrumbs={BREADCRUMBS} />
        <ErrorState
          detail={boardQuery.error?.message}
          onRetry={() => {
            void boardQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const { summary, interventionThreshold, steadyBandPerMonth, observationMonths, projectionHorizonMonths } = board
  const fastest = summary.fastestFalling

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: board.generatedAt,
    refreshIntervalMinutes: 1440,
    origin: 'derived-metric',
    sourceState: 'operational',
    stale: false,
  }

  const columns: Array<Column<WardTrajectory>> = [
    {
      id: 'ward',
      header: t('Ward'),
      cell: (r) => (
        <div className="min-w-0">
          <span className="font-medium text-ink-900">{r.wardName}</span>
          <span className="mt-0.5 block text-[0.6875rem] text-ink-400">{r.region}</span>
        </div>
      ),
      sortValue: (r) => r.wardName,
      searchValue: (r) => `${r.wardName} ${r.wardCode} ${r.region}`,
      width: 'minmax(11rem,1.5fr)',
    },
    {
      id: 'rank',
      header: t('Rank'),
      cell: (r) => <span className="numeric text-ink-500">{r.deteriorationRank}</span>,
      sortValue: (r) => r.deteriorationRank,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'current',
      header: t('Current score'),
      cell: (r) => (
        <span
          className={
            r.currentScore <= interventionThreshold ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-800'
          }
        >
          {r.currentScore}
        </span>
      ),
      sortValue: (r) => r.currentScore,
      exportValue: (r) => r.currentScore,
      align: 'right',
    },
    {
      id: 'shape',
      header: t('{0}-month shape', observationMonths),
      cell: (r) => (
        <Sparkline
          points={r.series.map((p) => p.score)}
          colour={r.direction === 'deteriorating' ? CHART_COLOURS.critical : r.direction === 'improving' ? CHART_COLOURS.positive : CHART_COLOURS.neutral}
        />
      ),
      exportExclude: true,
      align: 'center',
      hideBelow: 'xl',
    },
    {
      id: 'change',
      header: t('{0}-month change', observationMonths),
      cell: (r) => (
        <span className={r.changeOverWindow < 0 ? 'numeric text-crit-600' : 'numeric text-ink-700'}>
          {formatSlope(r.changeOverWindow)} pts
        </span>
      ),
      sortValue: (r) => r.changeOverWindow,
      exportValue: (r) => r.changeOverWindow,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'slope',
      header: t('Rate per month'),
      cell: (r) => (
        <span
          className={
            r.direction === 'deteriorating'
              ? 'numeric font-semibold text-crit-600'
              : r.direction === 'improving'
                ? 'numeric text-ok-700'
                : 'numeric text-ink-500'
          }
        >
          {formatSlope(r.slopePerMonth)} pts
        </span>
      ),
      sortValue: (r) => r.slopePerMonth,
      exportValue: (r) => r.slopePerMonth,
      align: 'right',
    },
    {
      id: 'direction',
      header: t('Direction'),
      cell: (r) => (
        <Badge tone={DIRECTION_TONE[r.direction]} size="sm" dot>
          {TRAJECTORY_DIRECTION_LABEL[r.direction]}
        </Badge>
      ),
      sortValue: (r) => r.direction,
      exportValue: (r) => TRAJECTORY_DIRECTION_LABEL[r.direction],
    },
    {
      id: 'crossing',
      header: t('Months to {0}', interventionThreshold),
      cell: (r) => {
        if (r.alreadyBelowThreshold) {
          return <span className="text-[0.6875rem] font-semibold text-crit-600">{t('Already below')}</span>
        }
        if (r.monthsToThreshold === null) {
          return <span className="text-ink-300">-</span>
        }
        return (
          <span className="numeric text-ink-800">
            {r.monthsToThreshold.toFixed(1)}
            {r.crossingMonth ? <span className="ml-1 text-[0.6875rem] font-normal text-ink-400">{r.crossingMonth}</span> : null}
          </span>
        )
      },
      // Wards with no projected crossing sort to the far end rather than to the
      // top, so the table never opens on the wards that need nothing.
      sortValue: (r) => (r.alreadyBelowThreshold ? -1 : (r.monthsToThreshold ?? 9999)),
      exportValue: (r) => (r.alreadyBelowThreshold ? 'Already below' : (r.monthsToThreshold ?? null)),
      align: 'right',
    },
    {
      id: 'state',
      header: t('State'),
      cell: (r) => <StateBadge state={r.state} />,
      sortValue: (r) => r.state,
      hideBelow: 'lg',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={EYEBROW}
        breadcrumbs={BREADCRUMBS}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search wards by name or code" />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Wards deteriorating')}
          value={summary.deteriorating}
          support={t('Of {0} assessed · {1} steady', summary.wardsAssessed, summary.steady)}
          tone={summary.deteriorating > 0 ? 'critical' : 'positive'}
          icon={<TrendingDown className="h-4 w-4" />}
          origin="derived-metric"
          explanation={`A ward is reported as moving only where its fitted slope exceeds ${steadyBandPerMonth} points per month in either direction. Anything inside that band is reported as steady, so ordinary month-to-month variation is not read as a trend.`}
          background="red"
        />
        <MetricCard
          label={t('Fastest-falling ward')}
          value={fastest ? fastest.wardShortName : 'None'}
          support={
            fastest
              ? `${formatSlope(fastest.slopePerMonth)} points per month · now at ${fastest.currentScore}`
              : 'No ward is falling faster than the steady band'
          }
          tone={fastest ? 'critical' : 'positive'}
          icon={<ArrowDownRight className="h-4 w-4" />}
          origin="derived-metric"
          background="amber"
        />
        <MetricCard
          label={t('Projected to cross within {0} months', projectionHorizonMonths)}
          value={summary.crossingWithinHorizon}
          support={t('{0} ward{1} already below {2}', summary.alreadyBelowThreshold, summary.alreadyBelowThreshold === 1 ? '' : 's', interventionThreshold)}
          tone={summary.crossingWithinHorizon > 0 ? 'warn' : 'positive'}
          icon={<CalendarClock className="h-4 w-4" />}
          origin="model-output"
          explanation="A straight-line extension of the fitted slope, not a forecast. It assumes nothing changes, which is precisely the assumption an intervention is meant to break."
          background="green"
        />
        <MetricCard
          label={t('Wards improving')}
          value={summary.improving}
          support={t('Cohort mean {0} points per month', formatSlope(summary.meanSlopePerMonth))}
          tone={summary.improving > 0 ? 'positive' : 'warn'}
          icon={<TrendingUp className="h-4 w-4" />}
          origin="derived-metric"
        />
      </MetricGrid>

      {filtered.length === 0 ? (
        <GovPanel title={t('Ward trajectories')} tone="amber" dense>
          <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
            {t('No ward within your authorised scope matches the current filters.')}
          </p>
          <EmptyState
            className="mx-3 mb-3"
            title={t('No wards match the current filters')}
            detail="Clear a ward or search filter to widen the cohort. Ranks and counts are computed across the wards you are authorised to see, so a narrower scope produces a smaller cohort rather than a partial one."
          />
        </GovPanel>
      ) : (
        <>
          {/* Two columns. The ranked register and the trajectories behind it
              carry the width; the single extended ward, why direction is read
              before level and what the extension does not claim stand
              beside. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
            <GovPanel title={t('Ward trajectories')} tone="amber" dense>
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('Ranked by rate of deterioration across the {0} wards within your authorised scope. Rank 1 is the fastest-falling.', summary.wardsAssessed)}
              </p>
              <DataTable rows={filtered} columns={columns} rowKey={(r) => r.wardId} pageSize={12} />
            </GovPanel>

              <GovPanel
                title={t('Trajectories of the {0} fastest-falling wards', highlight.length)}
                tone="red"
                dense
              >
                <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                  {t('Health score by month over the last {0} months, against the {1}-point intervention threshold. The rightmost month is each ward\'s live figure, unchanged from Ward Intelligence.', observationMonths, interventionThreshold)}
                </p>
                <div className="px-3 pb-4" style={{ height: 264 }}>
                  <CategoryBarChart
                    data={highlightData}
                    categoryKey="month"
                    series={highlightSeries}
                    showLegend
                    referenceValue={interventionThreshold}
                    referenceLabel={`Intervention threshold ${interventionThreshold}`}
                  />
                </div>
                <p className="px-3 pb-4 text-[0.6875rem] leading-relaxed text-ink-500">
                  {t('Months before the current one are reconstructed from each ward&apos;s published movement against the previous thirty days. They are a modelled history, not a retained record - the figure that is authoritative is the last one.')}
                </p>
              </GovPanel>
            </div>

            <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
              <GovPanel
                title={fastest ? `${fastest.wardName} - observed and extended` : 'No ward is deteriorating'}
                tone="amber"
                dense
              >
                <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                  {fastest
                    ? `${observationMonths} reconstructed months followed by ${projectionHorizonMonths} months of straight-line extension at ${formatSlope(fastest.slopePerMonth)} points per month.`
                    : 'Every ward in the current cohort is steady or improving, so there is no falling trajectory to extend.'}
                </p>
                {fastest ? (
                  <>
                    <div className="px-3 pb-2" style={{ height: 218 }}>
                      {projectionQuery.isLoading ? (
                        <LoadingState variant="chart" />
                      ) : projectionQuery.error ? (
                        <ErrorState
                          compact
                          title={t('The projection could not be retrieved')}
                          detail={projectionQuery.error.message}
                          onRetry={() => {
                            void projectionQuery.refetch()
                          }}
                        />
                      ) : (
                        <TrendChart
                          points={projectionQuery.data ?? []}
                          variant="line"
                          unit=" pts"
                          seriesLabel="Health score"
                          colour={CHART_COLOURS.critical}
                          referenceValue={interventionThreshold}
                          referenceLabel={`Threshold ${interventionThreshold}`}
                          domain={['auto', 'auto']}
                        />
                      )}
                    </div>
                    <div className="border-t border-ink-100 px-3 py-3">
                      <p className="text-[0.6875rem] leading-relaxed text-ink-500">
                        {t('Points beyond {0} are marked as simulated in the tooltip. {1}', fastest.series[fastest.series.length - 1]?.month, fastest.alreadyBelowThreshold
                          ? `${fastest.wardShortName} is already below ${interventionThreshold}, so no crossing is projected - the question is no longer when to intervene.`
                          : fastest.crossingMonth
                            ? `On this rate the ward reaches ${interventionThreshold} in ${fastest.monthsToThreshold?.toFixed(1)} months, around ${fastest.crossingMonth}.`
                            : `The rate does not carry the ward below ${interventionThreshold} inside a horizon worth stating as a date.`)}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="px-3 pb-3">
                    <EmptyState
                      compact
                      title={t('No falling trajectory to extend')}
                      detail={`Every ward in the current cohort sits inside the ${steadyBandPerMonth}-point steady band or above it.`}
                    />
                  </div>
                )}
              </GovPanel>


            <Card tone="info" className="flex items-start gap-3">
              <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold text-govt-800">{t('Level is not the same as direction')}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  {t('A ward at 72 falling four points a month needs attention before a ward that has sat at 65 for a year. The first will be the worse of the two within five months; the second has already found its floor. Ward rankings sorted by level put the settled ward first and the falling one further down, which is why acting on level alone guarantees arriving after the deterioration rather than before it. This page exists to make the second ward visible while there is still time to change its direction.')}
                </p>
              </div>
            </Card>

            <Card tone="warn" className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-warn-700" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold text-warn-700">{t('What the projection is, and what it is not')}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  {t('The months-to-threshold figure is a straight-line extrapolation of recent movement. It is not a forecast. It carries no model of monsoon seasonality, no knowledge of works already sanctioned in the ward and no allowance for anything the corporation is about to do. It assumes nothing changes - which is precisely the assumption an intervention is meant to break. Read it as an approximate horizon for a decision, never as a date the ward is expected to reach.')}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-ink-600">
                  {t('Direction is a least-squares slope fitted across all {0} months, and a ward is called moving only where that slope exceeds {1} points per month. The band is deliberately wider than the noise in the reconstruction, so a ward described as steady here is steady and not merely quiet - and wider than the dead band behind a flat 30-day trend on Ward Intelligence, so a ward flat there is always steady here. The reverse is intended rather than accidental: a ward showing a slight 30-day movement may still be reported steady on this page, because a few tenths of a point a month is not a trend and calling it one would fill this list with wards that need nothing.', observationMonths, steadyBandPerMonth)}
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

export default WardTrajectoryPage
