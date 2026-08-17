import { useMemo } from 'react'
import { ArrowDownRight, Coins, Scale, Users } from 'lucide-react'
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
import { RankedBarChart } from '@/components/charts'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardEquityService } from '@/services/ward-equity.service'
import { QUADRANT_DESCRIPTION, QUADRANT_LABEL } from '@/domains/wards/equity'
import type { EquityQuadrant, WardEquityRow } from '@/domains/wards/equity'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCrore, formatDelta, formatNumber, formatPercent, formatRupees } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/city/WardEquityPage.tsx
 *
 * Ward Equity & Allocation.
 *
 * Every other ward surface on this platform reports a ward's condition. This
 * one asks whether the corporation's own money is going where the
 * corporation's own data says the need is.
 *
 * The question matters because a ward can be failing for two quite different
 * reasons. It can be hard - low-lying, dense, carrying assets older than any
 * single budget cycle can replace - or it can have been allocated less than its
 * condition warranted, repeatedly. Only the second is something the budget can
 * fix, and until now nothing on this platform told the two apart. The finding
 * is the ward sitting in the high-need, low-provision quadrant: it is precisely
 * what a Commissioner is asked in the General Body, and precisely what this
 * platform has not until now been able to answer.
 *
 * THE PAGE NAMES GAPS. IT DOES NOT ALLEGE MOTIVE. A ward can sit low on
 * provision for entirely proper reasons - its works were completed in an
 * earlier cycle, its major scheme is funded from a state or central head that
 * never enters the municipal capital budget, its land is not buildable. The
 * output is a question that deserves an answer on the record, not a conclusion
 * about anybody's conduct.
 *
 * NO FIGURE ON THIS PAGE IS NEW. Need is assembled from the ward's existing
 * risk and health indices, its existing complaint and service-standard record
 * and the corporation's own settlement survey. Provision is the same capital
 * allocation Budget Intelligence reports, divided by the ward's recorded
 * population. This page and Ward Intelligence will always agree about the same
 * ward, which is the only basis on which either can be relied upon.
 */

const QUADRANT_TONE: Record<EquityQuadrant, BadgeTone> = {
  underserved: 'critical',
  prioritised: 'positive',
  'over-provisioned': 'warn',
  steady: 'neutral',
}

/** Reading order of the quadrant grid: need rises upward, provision rightward. */
const QUADRANT_GRID: Array<{ id: EquityQuadrant; axis: string }> = [
  { id: 'underserved', axis: 'High need · low provision' },
  { id: 'prioritised', axis: 'High need · high provision' },
  { id: 'steady', axis: 'Low need · low provision' },
  { id: 'over-provisioned', axis: 'Low need · high provision' },
]

function build$BREADCRUMBS() {
  return [{ label: t('Wards & Localities') }, { label: t('Ward Equity & Allocation') }]
}
let BREADCRUMBS: ReturnType<typeof build$BREADCRUMBS> = build$BREADCRUMBS()
registerLayer(() => {
  BREADCRUMBS = build$BREADCRUMBS()
})
const EYEBROW = 'Wards & Localities'
const TITLE = 'Ward Equity & Allocation'

export function WardEquityPage(): React.JSX.Element {
  usePageMasthead(TITLE)

  const equityQuery = useServiceQuery(queryKeys.wardEquity('assessment'), (u) => wardEquityService.assessment(u))

  const assessment = equityQuery.data
  const rows = useMemo(() => assessment?.rows ?? [], [assessment])

  const shortfalls = useMemo(
    () =>
      rows
        .filter((r) => r.equityGap < 0)
        .slice(0, 10)
        .map((r) => ({ label: r.code, value: Math.abs(r.equityGap) })),
    [rows],
  )

  const byQuadrant = useMemo(() => {
    const grouped: Record<EquityQuadrant, WardEquityRow[]> = {
      underserved: [],
      prioritised: [],
      'over-provisioned': [],
      steady: [],
    }
    for (const row of rows) grouped[row.quadrant].push(row)
    return grouped
  }, [rows])

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  if (equityQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={EYEBROW} breadcrumbs={BREADCRUMBS} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={10} />
      </PageBody>
    )
  }

  if (equityQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={EYEBROW} breadcrumbs={BREADCRUMBS} />
        <ErrorState detail={equityQuery.error.message} onRetry={() => void equityQuery.refetch()} />
      </PageBody>
    )
  }

  if (!assessment || rows.length === 0) {
    return (
      <PageBody>
        <PageHeader eyebrow={EYEBROW} breadcrumbs={BREADCRUMBS} freshness={freshness} />
        <DemonstrationNotice />
        <EmptyState
          icon={<Scale className="h-4 w-4" aria-hidden />}
          title={t('No ward falls within your authorised scope')}
          detail="Equity is a comparison between wards. With no ward in scope there is nothing to compare, and no partial figure is shown in its place."
        />
      </PageBody>
    )
  }

  const { medians, quadrantCounts, widestGap, quartileSpend, totals, cohortSize } = assessment
  const cityUtilisation = totals.allocatedCrore > 0 ? (totals.spentCrore / totals.allocatedCrore) * 100 : 0
  const narrowCohort = cohortSize < 8

  const columns: Array<Column<WardEquityRow>> = [
    {
      id: 'ward',
      header: t('Ward'),
      cell: (r) => (
        <div className="min-w-0">
          <span className="font-medium text-ink-900">{r.label}</span>
          <span className="ml-1.5 text-[0.6875rem] text-ink-500">{r.region}</span>
        </div>
      ),
      sortValue: (r) => r.label,
      searchValue: (r) => `${r.label} ${r.code} ${r.region}`,
      width: 'minmax(13rem,1.6fr)',
    },
    {
      id: 'need',
      header: t('Need score'),
      cell: (r) => (
        <span className={r.needScore >= 60 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
          {r.needScore}
        </span>
      ),
      sortValue: (r) => r.needScore,
      exportValue: (r) => r.needScore,
      align: 'right',
    },
    {
      id: 'spend-per-resident',
      header: t('Spend / resident'),
      cell: (r) => <span className="numeric text-ink-700">{formatRupees(r.spentPerResident)}</span>,
      sortValue: (r) => r.spentPerResident,
      exportValue: (r) => r.spentPerResident,
      align: 'right',
    },
    {
      id: 'allocation-per-resident',
      header: t('Allocated / resident'),
      cell: (r) => <span className="numeric text-ink-700">{formatRupees(r.allocatedPerResident)}</span>,
      sortValue: (r) => r.allocatedPerResident,
      exportValue: (r) => r.allocatedPerResident,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'quadrant',
      header: t('Quadrant'),
      cell: (r) => (
        <Badge tone={QUADRANT_TONE[r.quadrant]} size="sm" title={QUADRANT_DESCRIPTION[r.quadrant]}>
          {QUADRANT_LABEL[r.quadrant]}
        </Badge>
      ),
      sortValue: (r) => QUADRANT_LABEL[r.quadrant],
      exportValue: (r) => QUADRANT_LABEL[r.quadrant],
      hideBelow: 'sm',
    },
    {
      id: 'gap',
      header: t('Equity gap'),
      cell: (r) => (
        <span
          className={
            r.equityGap <= -15
              ? 'numeric font-semibold text-crit-600'
              : r.equityGap < 0
                ? 'numeric font-semibold text-warn-700'
                : 'numeric text-ink-700'
          }
        >
          {formatDelta(r.equityGap, ' pp')}
        </span>
      ),
      sortValue: (r) => r.equityGap,
      exportValue: (r) => r.equityGap,
      align: 'right',
    },
    {
      id: 'utilisation',
      header: t('Utilisation'),
      cell: (r) => (
        <span className={r.utilisationPct < 45 ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
          {formatPercent(r.utilisationPct, 0)}
        </span>
      ),
      sortValue: (r) => r.utilisationPct,
      exportValue: (r) => r.utilisationPct,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'state',
      header: t('Alignment'),
      cell: (r) => <StateBadge state={r.state} />,
      sortValue: (r) => r.alignmentScore,
      exportValue: (r) => r.alignmentScore,
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

      {narrowCohort ? (
        <Card tone="warn" className="flex items-start gap-3">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-warn-600" aria-hidden />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-semibold text-warn-700">
              {t('The comparison is drawn across {0} {1}', cohortSize, cohortSize === 1 ? 'ward' : 'wards')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              {t('Equity is a comparison, so every median, percentile and quartile below is computed across the wards within your authorised scope and no others. A narrow scope narrows the comparison, and these figures should not be read as a corporation-wide finding.')}
            </p>
          </div>
        </Card>
      ) : null}

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Wards underserved')}
          value={quadrantCounts.underserved}
          support={t('Above median need, below median provision · {0} wards compared', cohortSize)}
          tone={quadrantCounts.underserved > 0 ? 'critical' : 'positive'}
          icon={<Scale className="h-4 w-4" />}
          origin="demonstration"
          explanation="Wards whose need score sits at or above the cohort median while their capital allocation per resident sits below it. Both splits are cohort medians, not fixed thresholds."
          background="red"
        />
        <MetricCard
          label={t('Widest allocation gap')}
          value={widestGap ? formatDelta(widestGap.equityGap, ' pp') : '-'}
          support={widestGap ? widestGap.label : 'No ward is provisioned below its need percentile'}
          tone={widestGap && widestGap.equityGap <= -15 ? 'critical' : 'warn'}
          icon={<ArrowDownRight className="h-4 w-4" />}
          explanation="The signed difference between a ward's provision percentile and its need percentile, in percentile points. Negative means the ward is served below what its own recorded condition indicates."
          background="amber"
        />
        <MetricCard
          label={t('Spend per resident, neediest quarter')}
          value={formatRupees(quartileSpend.highestNeedPerResident)}
          support={t('Against {0} in the least-needy quarter · {1} {2} per resident', formatRupees(quartileSpend.lowestNeedPerResident), formatRupees(Math.abs(quartileSpend.differencePerResident)), quartileSpend.differencePerResident < 0 ? 'less' : 'more')}
          tone={quartileSpend.differencePerResident < 0 ? 'critical' : 'positive'}
          icon={<Users className="h-4 w-4" />}
          explanation={`Mean capital spend per resident across the ${quartileSpend.quartileSize} highest-need wards set against the ${quartileSpend.quartileSize} lowest-need wards. This is the headline inequity figure: if the neediest quarter receives less per head than the least needy, allocation is running against condition.`}
          background="green"
        />
        <MetricCard
          label={t('Capital in play')}
          value={formatCrore(totals.allocatedCrore)}
          support={t('{0} paid · {1} utilised · {2} residents', formatCrore(totals.spentCrore), formatPercent(cityUtilisation, 0), formatNumber(totals.populationCovered))}
          icon={<Coins className="h-4 w-4" />}
          origin="demonstration"
        />
      </MetricGrid>

      {/* Two columns. The quadrant reading and the register beneath it are
          the finding and carry the width; what the page does and does not
          allege, the shortfall ranking and the method behind the need score
          read down the column beside. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <GovPanel title={t('Need against provision')} tone="amber" dense className="flex flex-col">
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Split on the cohort medians - need {0}/100, allocation {1} per resident - never on a fixed threshold, so the halves are true by construction.', medians.needScore, formatRupees(medians.allocatedPerResident))}
            </p>
            <div className="p-4">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">
                <span>{t('Need rises upward')}</span>
                <span>{t('Capital per resident rises rightward')}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {QUADRANT_GRID.map(({ id, axis }) => {
                  const members = byQuadrant[id]
                  return (
                    <div
                      key={id}
                      className={
                        id === 'underserved'
                          ? 'rounded-lg border border-crit-200 bg-crit-50/60 p-3'
                          : 'rounded-lg border border-ink-100 bg-surface-sunken p-3'
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge tone={QUADRANT_TONE[id]} size="sm">
                          {QUADRANT_LABEL[id]}
                        </Badge>
                        <span className="numeric text-[0.6875rem] font-semibold text-ink-500">
                          {members.length} {members.length === 1 ? 'ward' : 'wards'}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">{axis}</p>
                      <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">{QUADRANT_DESCRIPTION[id]}</p>
                      {members.length === 0 ? (
                        <p className="mt-2 text-[0.6875rem] text-ink-400">{t('No ward falls in this quadrant.')}</p>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {members.map((r) => (
                            <li key={r.wardId}>
                              <Badge
                                tone={id === 'underserved' ? 'critical' : 'neutral'}
                                size="sm"
                                title={t('{0} · need {1}/100 · {2} allocated per resident · gap {3}', r.label, r.needScore, formatRupees(r.allocatedPerResident), formatDelta(r.equityGap, ' pp'))}
                              >
                                {r.code}
                                <span className="numeric ml-1 opacity-70">{r.needScore}</span>
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-500">
                {t('Provision is measured on capital')}{' '}<span className="font-semibold">allocated</span>{' '}{t('per resident rather than capital spent. Allocation is the decision the corporation makes and the thing a budget can correct; under-spend against an allocation is a delivery failure, which the utilisation column answers separately.')}
              </p>
            </div>
          </GovPanel>

          <GovPanel title={t('Ward equity register')} tone="red" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Ordered by equity gap, most under-provisioned first. Every figure is carried from the ward\'s existing record - nothing on this register is computed for this page alone.')}
            </p>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.wardId}
            pageSize={14}
            exportName="ward-equity-and-allocation"
            ariaLabel="Ward equity and allocation register"
            searchPlaceholder="Search wards"
            initialSort={{ columnId: 'gap', direction: 'asc' }}
            emptyTitle={t('No ward matches the current search')}
            emptyDetail="Clear the search to restore the full cohort."
          />
        </GovPanel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
        <Card tone="info" className="flex items-start gap-3">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-semibold text-govt-800">{t('What this page asks, and what it does not say')}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              {t('A ward can be failing because it is genuinely hard, or because it has been under-funded for years. Only the second is something the budget can correct, and every other surface on this platform reports condition without separating the two. This page places each ward\'s assessed need against the capital it has actually been allocated per resident, and names the wards where the two do not line up. It does not allege motive. A ward may sit low on provision for entirely proper reasons - works completed in an earlier cycle, a scheme carried on a state or central head that never enters the municipal capital budget, land that cannot be built on. What is offered here is a question that deserves an answer on the record.')}
            </p>
          </div>
        </Card>

          <GovPanel title={t('Provision shortfall against need')} tone="green" dense className="flex flex-col">
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Percentile points by which a ward\'s capital provision sits below its assessed need. Wards provisioned at or above their need are not shown.')}
            </p>
            {shortfalls.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  compact
                  title={t('No ward is provisioned below its need')}
                  detail="Across this cohort, every ward's allocation percentile sits at or above its need percentile."
                />
              </div>
            ) : (
              <div className="px-4 pb-4" style={{ height: Math.max(210, shortfalls.length * 26) }}>
                <RankedBarChart data={shortfalls} unit=" pp" />
              </div>
            )}
          </GovPanel>


        <Card tone="sunken">
          <p className="label-institutional mb-2">{t('How the need score was formed')}</p>
          <p className="text-xs leading-relaxed text-ink-600">
            {t('Need is a 0-100 service-deficit score combining five components, each already held on the ward: its composite risk index at a weight of 0.30, its operational health deficit at 0.22, open complaints per 100,000 residents at 0.20, the share of residents living in recorded settlements at 0.15, and service-standard breaches per 100,000 residents at 0.13. The two rate-based components are indexed to the worst ward in the cohort, because no defensible absolute standard exists for complaints per head; the remaining three are already on an absolute scale. Settlement figures are aggregate survey totals - no household register, no individual record and no entitlement determination sits behind any figure on this page.')}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-600">
            {t('The equity gap is the difference between a ward\'s provision percentile and its need percentile, in percentile points. It is a statement about rank within this cohort, not about adequacy in absolute terms: a cohort in which every ward is under-provisioned would still produce gaps close to zero. Adequacy against a service standard is a separate question, and this page does not answer it.')}
          </p>
        </Card>
        </div>
      </div>
    </PageBody>
  )
}

export default WardEquityPage
