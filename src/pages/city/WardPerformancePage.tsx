import { useMemo, useState } from 'react'
import { Award, LifeBuoy, Ruler, Scale, Sigma } from 'lucide-react'
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
  StateBadge,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { ContributionBars, MiniBar, RankedBarChart } from '@/components/charts'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardPerformanceService } from '@/services/ward-performance.service'
import {
  QUARTILE_SHORT_LABEL,
  VERDICT_LABEL,
  type ExpectationVerdict,
  type WardLikeForLikeRow,
} from '@/domains/wards/like-for-like'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/city/WardPerformancePage.tsx
 *
 * Like-for-Like Ward Performance.
 *
 * Every corporation that has ever published a ward league table has watched the
 * same thing happen to it. The table is circulated, the ward at the bottom
 * points out that it holds the densest, most flood-exposed ground in the city,
 * everybody in the room privately agrees, and the table is never mentioned
 * again. The objection is not obstruction. It is usually correct, and a ranking
 * that cannot answer it has no standing with the people it ranks.
 *
 * This page answers it by holding two questions apart. HOW HARD IS THE WARD is
 * answered from structural conditions no ward office controls. HOW WELL IS IT
 * BEING RUN is answered by the residual: the gap between what the ward actually
 * achieves and what a ward of that difficulty typically achieves. Only the
 * residual belongs in a conversation with the officer holding the ward.
 *
 * WHAT THIS IS FOR. It is a list of places to look and things to learn, not a
 * list of people to blame. A large positive residual is the most valuable thing
 * on the page: a ward getting more out of harder ground than the line predicts
 * is running a practice nobody has written down, and the corporation's job is
 * to go and find out what it is. A large negative residual is a question, not a
 * verdict - something is in the way, and the ward has not been asked what.
 *
 * The difficulty model is illustrative. Its weights are stated in full on the
 * page so any reader can reconstruct the arithmetic, but a real deployment
 * would fit both the weighting and the expectation line on the corporation's
 * own historic record rather than on a reasonable prior.
 */

const VERDICT_TONE: Record<ExpectationVerdict, BadgeTone> = {
  above: 'positive',
  at: 'neutral',
  below: 'warn',
}

/** The quartile filter is carried as a string because the segmented control,
 *  like every other tab-style control in the platform, keys on string values. */
type CohortFilter = 'all' | '1' | '2' | '3' | '4'

function build$COHORT_OPTIONS(): Array<{ value: CohortFilter; label: string }> {
  return [
  { value: 'all', label: t('All wards') },
  { value: '1', label: 'Q1' },
  { value: '2', label: 'Q2' },
  { value: '3', label: 'Q3' },
  { value: '4', label: 'Q4' },
]
}
let COHORT_OPTIONS: Array<{ value: CohortFilter; label: string }> = build$COHORT_OPTIONS()
registerLayer(() => {
  COHORT_OPTIONS = build$COHORT_OPTIONS()
})

/** Signed residual, always shown with its sign so the direction cannot be missed. */
function signed(value: number, decimals = 1): string {
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(value).toFixed(decimals)}`
}

/**
 * Most wards the residual chart will label legibly. Beyond this the extremes at
 * either end are shown and the middle - where residuals are small and there is
 * nothing to learn from them - is left to the register below.
 */
const CHART_LIMIT = 18

export function WardPerformancePage(): React.JSX.Element {
  usePageMasthead(t('Like-for-Like Ward Performance'))

  const [cohort, setCohort] = useState<CohortFilter>('all')

  const assessmentQuery = useServiceQuery(queryKeys.wardPerformance('assessment'), (u) =>
    wardPerformanceService.assessment(u),
  )
  const methodQuery = useServiceQuery(queryKeys.wardPerformance('method'), (u) =>
    wardPerformanceService.method(u),
  )

  const assessment = assessmentQuery.data
  const rows = useMemo(() => assessment?.rows ?? [], [assessment])

  const filtered = useMemo(
    () => (cohort === 'all' ? rows : rows.filter((r) => String(r.quartile) === cohort)),
    [rows, cohort],
  )

  /**
   * `RankedBarChart` plots a numeric axis whose domain is taken from the data
   * and from the bar baseline at zero, so a negative residual renders as a bar
   * running left of the axis rather than being clipped. It colours bars by
   * absolute magnitude on a 0-100 severity scale, which residuals never reach,
   * so every bar arrives in the same neutral hue - direction, not colour, is
   * what carries the meaning here, and the caption says so.
   */
  const chartRows = useMemo(() => {
    if (filtered.length <= CHART_LIMIT) return filtered
    const half = CHART_LIMIT / 2
    return [...filtered.slice(0, half), ...filtered.slice(-half)]
  }, [filtered])

  const isLoading = assessmentQuery.isLoading || methodQuery.isLoading
  const error = assessmentQuery.error ?? methodQuery.error

  const header = (
    <PageHeader
      eyebrow={t('Wards & Localities')}
      breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Like-for-Like Ward Performance') }]}
      freshness={{
        generatedAt: DEMO_NOW.toISOString(),
        sourceObservedAt: DEMO_NOW.toISOString(),
        refreshIntervalMinutes: 1440,
        origin: 'demonstration',
        sourceState: 'operational',
        stale: false,
      } satisfies DataFreshness}
    />
  )

  if (isLoading) {
    return (
      <PageBody>
        {header}
        <LoadingState variant="metrics" />
        <LoadingState variant="chart" />
        <LoadingState variant="table" rows={10} />
      </PageBody>
    )
  }

  if (error || !assessment || !methodQuery.data) {
    return (
      <PageBody>
        {header}
        <ErrorState
          detail={
            error?.message ??
            'The like-for-like assessment could not be assembled for the wards in your authorised scope.'
          }
          onRetry={() => {
            void assessmentQuery.refetch()
            void methodQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const { fit, cohorts, modelSummary, bestPractice, needsSupport } = assessment
  const { statement } = methodQuery.data

  const columns: Array<Column<WardLikeForLikeRow>> = [
    {
      id: 'ward',
      header: t('Ward'),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{r.wardLabel}</p>
          <p className="mt-0.5 truncate text-[0.6875rem] text-ink-500">
            {t('{0} · {1} residents', r.region, formatNumber(r.population))}
          </p>
        </div>
      ),
      sortValue: (r) => r.wardLabel,
      searchValue: (r) => `${r.wardLabel} ${r.wardCode} ${r.region}`,
      exportValue: (r) => r.wardLabel,
      width: 'minmax(12rem,1.6fr)',
    },
    {
      id: 'difficulty',
      header: t('Difficulty'),
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-2">
          <MiniBar value={r.difficulty} higherIsWorse width={42} />
          <span className="numeric font-semibold text-ink-900">{r.difficulty.toFixed(1)}</span>
        </span>
      ),
      sortValue: (r) => r.difficulty,
      exportValue: (r) => r.difficulty,
      align: 'right',
    },
    {
      id: 'quartile',
      header: t('Cohort'),
      cell: (r) => (
        <Badge tone="neutral" size="sm" title={r.cohortLabel}>
          {QUARTILE_SHORT_LABEL[r.quartile]}
        </Badge>
      ),
      sortValue: (r) => r.quartile,
      exportValue: (r) => r.cohortLabel,
      hideBelow: 'lg',
    },
    {
      id: 'observed',
      header: t('Observed'),
      cell: (r) => <span className="numeric font-semibold text-ink-900">{r.observed.toFixed(1)}</span>,
      sortValue: (r) => r.observed,
      align: 'right',
    },
    {
      id: 'expected',
      header: t('Expected'),
      cell: (r) => <span className="numeric text-ink-600">{r.expected.toFixed(1)}</span>,
      sortValue: (r) => r.expected,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'residual',
      header: t('Residual'),
      cell: (r) => (
        <span
          className={
            r.verdict === 'above'
              ? 'numeric font-semibold text-ok-700'
              : r.verdict === 'below'
                ? 'numeric font-semibold text-warn-700'
                : 'numeric text-ink-600'
          }
        >
          {signed(r.residual)}
        </span>
      ),
      sortValue: (r) => r.residual,
      exportValue: (r) => r.residual,
      align: 'right',
    },
    {
      id: 'verdict',
      header: t('Against its line'),
      cell: (r) => (
        <Badge tone={VERDICT_TONE[r.verdict]} size="sm">
          {VERDICT_LABEL[r.verdict]}
        </Badge>
      ),
      sortValue: (r) => r.residual,
      exportValue: (r) => VERDICT_LABEL[r.verdict],
    },
    {
      id: 'state',
      header: t('Ward state'),
      cell: (r) => <StateBadge state={r.state} />,
      sortValue: (r) => r.state,
      hideBelow: 'xl',
    },
  ]

  return (
    <PageBody>
      {header}

      <DemonstrationNotice />

      {rows.length === 0 ? (
        <EmptyState
          title={t('No ward falls within your authorised scope')}
          detail="A like-for-like comparison needs at least one ward you are entitled to see."
        />
      ) : (
        <>
          <MetricGrid columns={4}>
            <MetricCard
              label={t('Wards above expectation')}
              value={assessment.aboveExpectation}
              support={t('of {0} assessed · {1} sitting on their line', rows.length, assessment.onLine)}
              tone="positive"
              icon={<Award className="h-4 w-4" />}
              origin="demonstration"
              explanation={`A ward counts as above expectation when its residual exceeds the tolerance band of ${fit.toleranceBand.toFixed(1)} points, which is half a typical residual.`}
              background="red"
            />
            <MetricCard
              label={t('Wards below expectation')}
              value={assessment.belowExpectation}
              support={t('of {0} assessed · each one is a question, not a verdict', rows.length)}
              tone="warn"
              icon={<LifeBuoy className="h-4 w-4" />}
              background="amber"
            />
            <MetricCard
              label={t('Furthest above its line')}
              value={bestPractice ? signed(bestPractice.residual) : '-'}
              unit=" pts"
              support={
                bestPractice
                  ? `${bestPractice.wardLabel} · difficulty ${bestPractice.difficulty.toFixed(0)} · go and see what it is doing`
                  : 'No ward in scope sits above its line'
              }
              tone="positive"
              icon={<Sigma className="h-4 w-4" />}
              background="green"
            />
            <MetricCard
              label={t('Furthest below its line')}
              value={needsSupport ? signed(needsSupport.residual) : '-'}
              unit=" pts"
              support={
                needsSupport
                  ? `${needsSupport.wardLabel} · difficulty ${needsSupport.difficulty.toFixed(0)} · ask what is in the way`
                  : 'No ward in scope sits below its line'
              }
              tone="warn"
            />
          </MetricGrid>

          {/* Two columns. What the cohort filter selects, the register it
              produces and the cohort bands read down the wide column; how
              difficulty is scored, how the expectation line is set and what
              the model does not claim read beside them. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
            <GovPanel title={t('Difficulty cohorts')} tone="amber" dense>
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('Wards banded into difficulty quartiles, so each one can be read against genuine peers as well as against the line.')}
              </p>
              <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
                {cohorts.map((c) => (
                  <div key={c.quartile} className="rounded-lg border border-ink-100 bg-surface-sunken p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[0.8125rem] font-semibold text-ink-900">{c.shortLabel}</p>
                      <StateBadge state={c.pressureState} />
                    </div>
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">
                      {t('{0} ward{1} · difficulty {2} to {3}', c.wardCount, c.wardCount === 1 ? '' : 's', c.difficultyFrom.toFixed(0), c.difficultyTo.toFixed(0))}
                    </p>
                    <dl className="mt-2 space-y-1 text-[0.6875rem]">
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-ink-500">{t('Mean observed')}</dt>
                        <dd className="numeric font-semibold text-ink-800">{c.meanObserved.toFixed(1)}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-ink-500">{t('Above their line')}</dt>
                        <dd className="numeric font-semibold text-ok-700">{c.aboveExpectation}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-ink-500">{t('Below their line')}</dt>
                        <dd className="numeric font-semibold text-warn-700">{c.belowExpectation}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
              <p className="border-t border-ink-100 px-4 py-3 text-[0.6875rem] leading-relaxed text-ink-500">
                {t('The state chip on each band describes the')}{' '}<strong>conditions</strong>{' '}{t('in that quartile, not the administration of it. A band marked critical is the hardest ground in the corporation to run, which is a statement about the ward and never about the people running it.')}
              </p>
            </GovPanel>

            <Card className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="cohort-control">{t('Difficulty cohort')}</Label>
                <div id="cohort-control">
                  <SegmentedControl<CohortFilter>
                    value={cohort}
                    onChange={setCohort}
                    ariaLabel="Filter wards by difficulty quartile"
                    options={COHORT_OPTIONS}
                  />
                </div>
              </div>
              <p className="min-w-[16rem] flex-1 text-[0.6875rem] leading-relaxed text-ink-500">
                {t('Narrowing to a cohort changes which wards are listed, never the line they are measured against. The expectation is fitted across every ward in the corporation, because an expectation refitted on a smaller group would hand each group a private and flattering standard.')}
              </p>
            </Card>

            {filtered.length === 0 ? (
              <EmptyState
                title={t('No ward in this difficulty cohort')}
                detail="Widen the cohort filter to see the wards in your authorised scope."
              />
            ) : (
              <>
                <GovPanel title={t('Residual against the expectation line')} tone="red" dense className="flex flex-col">
                  <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                    {t('Bars to the right of zero are wards doing better than their conditions predict. Bars to the left are wards doing worse.')}
                  </p>
                  <div className="px-4 py-4" style={{ height: Math.max(220, chartRows.length * 26) }}>
                    <RankedBarChart
                      data={chartRows.map((r) => ({ label: r.wardCode, value: r.residual }))}
                      unit=" pts"
                    />
                  </div>
                  <p className="border-t border-ink-100 px-4 py-3 text-[0.6875rem] leading-relaxed text-ink-500">
                    {t('Every bar carries the same hue deliberately: the residuals are small numbers on a scale built for severity, and colouring them by magnitude would imply a seriousness the arithmetic does not support. Direction is the whole reading.{0}', filtered.length > chartRows.length
                      ? ` The ${filtered.length - chartRows.length} wards nearest the line are omitted from this chart - where the residual is small there is nothing to learn - and all ${filtered.length} appear in the register below.`
                      : '')}
                  </p>
                </GovPanel>

                <GovPanel title={t('Ward register, adjusted for difficulty')} tone="amber" dense>
                  <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                    {t('{0} ward{1} in your authorised scope, ordered by how far each sits from the expectation set by its own conditions.', filtered.length, filtered.length === 1 ? '' : 's')}
                  </p>
                  <DataTable
                    rows={filtered}
                    columns={columns}
                    rowKey={(r) => r.wardId}
                    searchable
                    searchPlaceholder="Search ward, code or region"
                    pageSize={15}
                  />
                </GovPanel>
              </>
            )}
            </div>

            <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
            <Card tone="info" className="flex items-start gap-3">
              <Scale className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold text-govt-800">
                  {t('Why a raw league table gets argued with, and then ignored')}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  {t('The officer holding the densest, most flood-exposed ward in the city can always say that a straight ranking is unfair to them, and they are usually right. Once that objection has been made and not answered, the table stops being used. Adjusting for difficulty is what allows a ranking to survive contact with the people it ranks: the conditions are set aside first, and only the part of the result the conditions do not explain is put to the ward.')}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
                  <strong>{t('This is a list of places to look, not a list of people to blame.')}</strong>{' '}{t('A ward well above its line is running a practice nobody has written down yet and should be asked what it is doing. A ward well below its line is carrying an obstruction that has not been named and should be asked what is in the way.')}
                </p>
              </div>
            </Card>

              <GovPanel title={t('How difficulty is scored')} tone="amber" dense className="flex flex-col">
                <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                  {t('Four structural conditions, weighted to one hundred. None of them moves because a ward office works well or badly.')}
                </p>
                <div className="px-4 py-4">
                  <ContributionBars
                    items={modelSummary.map((c) => ({
                      id: c.id,
                      label: c.label,
                      contribution: c.contribution,
                      weight: c.weight,
                      rawScore: c.score,
                      explanation: c.explanation,
                    }))}
                  />
                  <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-500">
                    {t('Bars show the corporation-mean score on each condition and the points it puts on the board once weighted. Each condition is placed on a fixed 0-100 band rather than on the observed spread, so a ward&apos;s difficulty does not move when a different ward is added or removed.')}
                  </p>
                </div>
              </GovPanel>

              <GovPanel title={t('How expectation is set')} tone="red" dense className="flex flex-col">
                <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                  {t('A least-squares line of observed health against difficulty, fitted across the wards.')}
                </p>
                <div className="px-4 py-4">
                  <p className="text-xs leading-relaxed text-ink-600">{statement}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    {[
                      { term: 'Slope', value: fit.slope.toFixed(3), note: t('per difficulty point') },
                      { term: 'Intercept', value: fit.intercept.toFixed(1), note: t('at zero difficulty') },
                      { term: 'R²', value: fit.rSquared.toFixed(2), note: t('variation explained') },
                      { term: 'Typical residual', value: fit.residualSd.toFixed(1), note: t('standard error') },
                    ].map((item) => (
                      <div key={item.term}>
                        <dt className="label-institutional">{item.term}</dt>
                        <dd className="numeric mt-0.5 text-sm font-semibold text-ink-900">{item.value}</dd>
                        <dd className="text-[0.625rem] text-ink-400">{item.note}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-500">
                    {t('The fit is deliberately the plainest one available: an officer being measured against a line is entitled to reconstruct it with a spreadsheet. A ward is read as sitting on its line while its residual stays within {0} points, which is half a typical residual.{1}', fit.toleranceBand.toFixed(1), fit.fitted
                      ? ''
                      : ' Too few wards were in view to fit a line, so every ward is being read against the mean observed score - a placeholder, not a finding.')}
                  </p>
                </div>
              </GovPanel>


            <Card tone="warn" className="flex items-start gap-3">
              <Ruler className="mt-0.5 h-4 w-4 shrink-0 text-warn-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold text-warn-700">{t('The difficulty model is illustrative')}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  {t('The four weights above are a reasonable prior, not a finding. They were chosen so that a reader can reconstruct every figure on this page by hand, which matters more at this stage than being precisely right. A real deployment would fit both the difficulty weighting and the expectation line on the corporation&apos;s own historic record - several years of ward returns - and would revise them each year as the ground itself changes. Until that is done, treat the residuals as a way of choosing where to send the next visit, and not as a settled judgement on any ward office.{0}', assessment.outOfScopeCount > 0
                    ? ` The line was fitted on ${fit.fittedOn} wards, of which ${assessment.outOfScopeCount} fall outside your authorised scope and are not listed here.`
                    : '')}
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

export default WardPerformancePage
