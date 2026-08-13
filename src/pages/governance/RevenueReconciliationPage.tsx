import { useMemo, useState } from 'react'
import { AlertTriangle, ListChecks, ScrollText } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { usePageMasthead } from '@/stores/masthead.store'
import { queryKeys } from '@/app/queryClient'
import { reconciliationService } from '@/services'
import { ROUTES } from '@/config/navigation'
import { WARDS } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatNumber, formatPercent, formatRupees } from '@/utils/format'
import type { ReconciliationRule, RulePrecision } from '@/types/revenue-reconciliation'
import { REGISTRY_LABEL, RULE_TIER_LABEL } from '@/types/revenue-reconciliation'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  ErrorState,
  LinkButton,
  LoadingState,
  MetricGrid,
  ProgressBar,
  Select,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { CompositionBar } from '@/components/charts'
import { t } from '@/i18n'

/**
 * src/pages/governance/RevenueReconciliationPage.tsx
 *
 * The rule catalogue, the observed precision of every rule, and the one number
 * a corporation actually needs: how much its own registers disagree about.
 *
 * The headline figure on this screen is an EXTRAPOLATION from a sample, and it
 * is never rendered without the sample size beside it. That restraint is the
 * whole argument. An assessment department that is shown a number it cannot
 * reconcile to a method stops believing the screen, and there is no recovering
 * from that inside a procurement cycle.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-2880),
  refreshIntervalMinutes: 1440,
  origin: 'derived-metric' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const TIER_COLOUR: Record<number, string> = { 1: '#e5484d', 2: '#f59e0b', 3: '#8195ac' }

export function RevenueReconciliationPage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(
    t('Registry Reconciliation'),
    t('Where the corporation\'s own registers disagree about the same property. Every rule in the catalogue is published in full - its condition, why it matters, and the lawful reasons it fires on a property where nothing is wrong - because an assessment the corporation cannot explain is an assessment it cannot defend at a hearing.'),
  )

  const [wardFilter, setWardFilter] = useState('all')

  const summaryQuery = useServiceQuery(queryKeys.reconciliation(`summary:${wardFilter}`), (user) =>
    reconciliationService.summary(user, wardFilter === 'all' ? undefined : wardFilter),
  )
  const rulesQuery = useServiceQuery(queryKeys.reconciliation('rules'), (user) => reconciliationService.rules(user))
  const precisionQuery = useServiceQuery(queryKeys.reconciliation('precision'), (user) =>
    reconciliationService.precision(user),
  )

  const summary = summaryQuery.data
  const rules = rulesQuery.data ?? []
  const precision = precisionQuery.data ?? []

  const wardOptions = useMemo(
    () => [{ value: 'all', label: t('All wards in scope') }, ...WARDS.map((w) => ({ value: w.id, label: w.name }))],
    [],
  )

  const tierSegments = useMemo(
    () =>
      (summary?.byTier ?? [])
        .filter((entry) => entry.raised > 0)
        .map((entry) => ({
          id: `tier-${entry.tier}`,
          label: t('Tier {0}', entry.tier),
          value: entry.indicativeValue,
          colour: TIER_COLOUR[entry.tier] ?? '#8195ac',
        })),
    [summary],
  )

  const precisionColumns: Array<Column<RulePrecision>> = [
    {
      id: 'rule',
      header: t('Rule'),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink-800">{r.title}</p>
          <p className="mt-0.5 text-[0.625rem] text-ink-500">{t('Tier {0}', r.tier)}</p>
        </div>
      ),
      sortValue: (r) => r.title,
      searchValue: (r) => r.title,
      width: '22rem',
    },
    {
      id: 'raised',
      header: t('Raised'),
      cell: (r) => <span className="numeric">{formatNumber(r.raised)}</span>,
      sortValue: (r) => r.raised,
      align: 'right',
    },
    {
      id: 'resolved',
      header: t('Decided'),
      cell: (r) => <span className="numeric">{formatNumber(r.resolved)}</span>,
      sortValue: (r) => r.resolved,
      align: 'right',
    },
    {
      id: 'upheld',
      header: t('Upheld'),
      cell: (r) => <span className="numeric text-ok-700">{formatNumber(r.upheld)}</span>,
      sortValue: (r) => r.upheld,
      align: 'right',
    },
    {
      id: 'lawful',
      header: t('Closed - lawful'),
      cell: (r) => <span className="numeric text-ink-600">{formatNumber(r.lawfullyClosed)}</span>,
      sortValue: (r) => r.lawfullyClosed,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'adverse',
      header: t('Rule was wrong'),
      cell: (r) => <span className={`numeric ${r.adverse > 0 ? 'text-crit-700' : 'text-ink-500'}`}>{formatNumber(r.adverse)}</span>,
      sortValue: (r) => r.adverse,
      align: 'right',
    },
    {
      id: 'precision',
      header: t('Observed precision'),
      cell: (r) =>
        r.precisionPct === null ? (
          <span className="text-[0.6875rem] text-ink-400">{t('Nothing decided yet')}</span>
        ) : (
          <div className="flex items-center gap-2">
            <ProgressBar value={r.precisionPct} className="w-16" size="xs" />
            <span className="numeric text-xs font-semibold text-ink-800">{formatPercent(r.precisionPct, 0)}</span>
          </div>
        ),
      sortValue: (r) => r.precisionPct ?? -1,
      width: '12rem',
    },
    {
      id: 'value',
      header: t('Indicative value'),
      cell: (r) => <span className="numeric">{formatRupees(r.indicativeValue)}</span>,
      sortValue: (r) => r.indicativeValue,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'revised',
      header: t('Demand revised'),
      cell: (r) => <span className="numeric text-ok-700">{formatRupees(r.revisedValue)}</span>,
      sortValue: (r) => r.revisedValue,
      align: 'right',
      hideBelow: 'lg',
    },
  ]

  const isLoading = summaryQuery.isLoading || rulesQuery.isLoading || precisionQuery.isLoading
  const error = summaryQuery.error ?? rulesQuery.error ?? precisionQuery.error

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Registry Reconciliation') }]}
        freshness={FRESHNESS}
        actions={
          <>
            <LinkButton to={ROUTES.recoveryWorklist} variant="primary" icon={<ListChecks className="h-3.5 w-3.5" />}>
              {t('Open the worklist')}
            </LinkButton>
            <LinkButton to={ROUTES.recoveryPilot} variant="outline" icon={<ScrollText className="h-3.5 w-3.5" />}>
              {t('Pilot & statutory return')}
            </LinkButton>
          </>
        }
        controls={
          <Select
            aria-label={t('Filter by ward')}
            value={wardFilter}
            onChange={(e) => setWardFilter(e.target.value)}
            options={wardOptions}
            className="w-auto"
          />
        }
      />

      {isLoading ? <LoadingState variant="metrics" /> : null}
      {error ? (
        <ErrorState
          detail={error.message}
          onRetry={() => {
            void summaryQuery.refetch()
            void rulesQuery.refetch()
            void precisionQuery.refetch()
          }}
        />
      ) : null}

      {!isLoading && !error && summary ? (
        <>
          {/* --- The one number, with its method attached ----------------- */}
          <Card tone="critical">
            <CardHeader
              icon={<AlertTriangle className="h-4 w-4" />}
              title={t('The corporation\'s registers disagree with each other')}
              description={t('An extrapolation from the reconciled sample to the full assessment register. It is an indicative estimate for deciding whether this work is worth commissioning - not an amount owed by anybody, and not a figure any demand is raised from.')}
            />
            <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-4">
              <div>
                <p className="text-[0.625rem] tracking-wide text-ink-500 uppercase">
                  {t('Extrapolated annual value, full register')}
                </p>
                <p className="numeric mt-1 text-metric-lg font-semibold text-crit-700">
                  {formatRupees(summary.extrapolatedIndicativeValue)}
                </p>
                <p className="mt-1 text-[0.6875rem] text-ink-500">
                  {t('{0} parcels on the register', formatNumber(summary.registerParcels))}
                </p>
              </div>
              <div>
                <p className="text-[0.625rem] tracking-wide text-ink-500 uppercase">{t('Demonstrated in the sample')}</p>
                <p className="numeric mt-1 text-metric font-semibold text-ink-800">
                  {formatRupees(summary.indicativeValue)}
                </p>
                <p className="mt-1 text-[0.6875rem] text-ink-500">
                  {t('across {0} parcels actually reconciled', formatNumber(summary.sampledParcels))}
                </p>
              </div>
              <div>
                <p className="text-[0.625rem] tracking-wide text-ink-500 uppercase">{t('Method')}</p>
                <p className="mt-1 max-w-md text-[0.6875rem] leading-relaxed text-ink-600">
                  {t('Indicative value per sampled parcel, applied to the parcel count on the corporation\'s full assessment register. It assumes the sampled defect rate holds across the register, which a ward-scoped pilot is the correct way to test.')}
                </p>
              </div>
            </div>
          </Card>

          {/* Two columns. What the rules actually did — their observed
              precision, then the catalogue itself — reads down the wide
              column; the candidate position those rules produced stands
              beside it as the running count. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-4 xl:order-2 xl:col-span-4">
          <Card>
            <CardHeader title={t('Candidate position')} description={t('Scoped to the ward filter above.')} />
            <MetricGrid columns={2} className="mt-4">
              <MetricCard label={t('Candidates raised')} value={formatNumber(summary.raised)} />
              <MetricCard
                label={t('Tier 1 candidates')}
                value={formatNumber(summary.tierOneRaised)}
                support={`${formatRupees(summary.tierOneIndicativeValue)} indicative`}
                explanation="Tier 1 rules reconcile two records the corporation issued itself. They convert at a materially higher rate than any other tier, which is why a pilot should be scoped on them alone."
              />
              <MetricCard
                label={t('Awaiting a match decision')}
                value={formatNumber(summary.inMatchQueue)}
                support={t('Below the confidence floor')}
                explanation="Records the engine could not match to a parcel confidently enough to raise a candidate on its own. An officer decides, and the decision is recorded against their name."
              />
              <MetricCard label={t('Open on the worklist')} value={formatNumber(summary.onWorklist)} />
              <MetricCard
                label={t('Conversion rate')}
                value={summary.conversionPct === null ? 'No data yet' : formatPercent(summary.conversionPct)}
                support={t('of {0} decided', formatNumber(summary.terminal))}
              />
            </MetricGrid>

            {tierSegments.length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-ink-600">{t('Indicative value by rule tier')}</p>
                <CompositionBar segments={tierSegments} />
              </div>
            ) : null}
          </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-4 xl:order-1 xl:col-span-8">
          {/* --- Observed precision -------------------------------------- */}
          <Card flush>
            <CardHeader
              bordered
              title={t('Observed rule precision')}
              description={t('Computed from what officers actually found, not asserted. Precision counts a candidate against a rule only where the officer established that the rule was wrong about the property - a candidate correctly surfaced and then closed for a lawful reason is the engine working, not failing.')}
            />
            <DataTable
              rows={precision}
              columns={precisionColumns}
              rowKey={(r) => r.ruleId}
              exportName="reconciliation-rule-precision"
              searchable={false}
              emptyTitle={t('No rules have produced a decided candidate yet')}
              initialSort={{ columnId: 'raised', direction: 'desc' }}
              ariaLabel="Observed rule precision"
            />
          </Card>

          {/* --- The published catalogue --------------------------------- */}
          <div>
            <h2 className="text-sm font-semibold text-ink-800">{t('The published rule catalogue')}</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-500">
              {t('Every condition the engine applies, stated in full. An officer, a ratepayer\'s advocate and an auditor should all be able to read exactly what put a property on the worklist - and the lawful explanations that may mean it should come straight back off again.')}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {rules.map((rule) => (
                <RuleCard key={rule.id} rule={rule} precision={precision.find((p) => p.ruleId === rule.id)} />
              ))}
            </div>
          </div>
          </div>
          </div>
        </>
      ) : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

function RuleCard({ rule, precision }: { rule: ReconciliationRule; precision?: RulePrecision }): React.JSX.Element {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[0.8125rem] font-semibold text-ink-800">{rule.title}</h3>
          <p className="mt-1 text-[0.625rem] text-ink-500">{RULE_TIER_LABEL[rule.tier]}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Badge tone={rule.tier === 1 ? 'critical' : rule.tier === 2 ? 'warn' : 'neutral'}>{t('Tier {0}', rule.tier)}</Badge>
          {rule.worklistEligible ? (
            <Badge tone="info">{t('On the worklist')}</Badge>
          ) : (
            <Badge tone="neutral">{t('Analysis only')}</Badge>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-700">{rule.definition}</p>
      <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">{rule.rationale}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {rule.sources.map((source) => (
          <Badge key={source} tone="neutral">
            {REGISTRY_LABEL[source]}
          </Badge>
        ))}
        {rule.minimumAgeDays > 0 ? (
          <Badge tone="neutral">{t('Not raised before {0} days', formatNumber(rule.minimumAgeDays))}</Badge>
        ) : null}
      </div>

      <div className="mt-3 rounded-lg border border-warn-200 bg-warn-50/50 p-2.5">
        <p className="text-[0.6875rem] font-semibold text-ink-700">
          {t('Lawful reasons this rule fires where nothing is wrong')}
        </p>
        <ul className="mt-1.5 space-y-1">
          {rule.legitimateExplanations.map((explanation) => (
            <li key={explanation} className="flex gap-2 text-[0.625rem] leading-relaxed text-ink-600">
              <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
              <span>{explanation}</span>
            </li>
          ))}
        </ul>
      </div>

      {precision ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-ink-100 pt-2.5 text-[0.625rem] text-ink-500">
          <span>
            {t('Raised')}{' '}<span className="numeric font-semibold text-ink-700">{formatNumber(precision.raised)}</span>
          </span>
          <span>
            {t('Decided')}{' '}<span className="numeric font-semibold text-ink-700">{formatNumber(precision.resolved)}</span>
          </span>
          <span>
            {t('Observed precision')}{' '}
            <span className="numeric font-semibold text-ink-700">
              {precision.precisionPct === null ? 'no data' : formatPercent(precision.precisionPct, 0)}
            </span>
          </span>
        </div>
      ) : null}
    </Card>
  )
}

export default RevenueReconciliationPage
