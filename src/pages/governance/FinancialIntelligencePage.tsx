import { Banknote, Coins, Landmark, PiggyBank, Scale, TrendingUp } from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { Badge, SeverityBadge, StateBadge } from '@/components/ui/badges'
import { Card, CardHeader, DefinitionList, DefinitionRow, MetricGrid, ScoreDial } from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DemonstrationNotice, ErrorState, LoadingState, PartialDataWarning } from '@/components/ui/states'
import { MetricCard } from '@/components/cards/MetricCard'
import { ContributionBars } from '@/components/charts'
import { useServiceQuery } from '@/hooks'
import { usePageMasthead } from '@/stores/masthead.store'
import { queryKeys } from '@/app/queryClient'
import { financialIntelligenceService } from '@/services'
import type { DepartmentFinancialRow } from '@/domains/finance/health-index'
import { FINANCIAL_HEALTH_WEIGHTS } from '@/domains/finance/health-index'
import { formatCrore, formatPercent } from '@/utils/format'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * src/pages/governance/FinancialIntelligencePage.tsx
 *
 * Municipal Financial Intelligence.
 *
 * The corporation's consolidated financial position in one place - revenue,
 * budget, commitments, capital and project spend - expressed as one index that
 * can always be taken apart. Every component publishes its weight, its raw
 * measure and the sentence explaining what it means, because a headline
 * financial score a Commissioner cannot decompose is a score they cannot use.
 *
 * The page never calls a variance an irregularity. Exceptions are described as
 * reconciliation candidates, which is what they are.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-720),
  refreshIntervalMinutes: 1440,
  origin: 'derived-metric' as const,
  sourceState: 'operational' as const,
  stale: false,
}

export function FinancialIntelligencePage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(
    t('Municipal Financial Intelligence'),
    t('The corporation\'s consolidated financial position - revenue, budget, commitments, capital and project spend - as one index that can always be taken apart into the six components that produced it.'),
  )

  const query = useServiceQuery(queryKeys.finance('intelligence'), (u) => financialIntelligenceService.position(u))

  if (query.isLoading) return <LoadingState variant="metrics" />
  if (query.error) return <ErrorState detail={query.error.message} onRetry={() => query.refetch()} />

  const result = query.data
  if (!result) return <LoadingState variant="metrics" />

  const { position, components, leakageIndicators, departments } = result

  const deptColumns: Array<Column<DepartmentFinancialRow>> = [
    {
      id: 'department',
      header: t('Department'),
      cell: (d) => <span className="font-medium text-ink-800">{d.label}</span>,
      sortValue: (d) => d.label,
      searchValue: (d) => d.label,
      width: 'minmax(12rem,1.6fr)',
    },
    {
      id: 'revised',
      header: t('Revised'),
      align: 'right',
      cell: (d) => <span className="numeric">{formatCrore(d.revisedCrore)}</span>,
      sortValue: (d) => d.revisedCrore,
    },
    {
      id: 'actual',
      header: t('Actual'),
      align: 'right',
      cell: (d) => <span className="numeric">{formatCrore(d.actualCrore)}</span>,
      sortValue: (d) => d.actualCrore,
    },
    {
      id: 'committed',
      header: t('Committed'),
      align: 'right',
      cell: (d) => <span className="numeric">{formatCrore(d.committedCrore)}</span>,
      sortValue: (d) => d.committedCrore,
      hideBelow: 'md',
      optional: true,
    },
    {
      id: 'utilisation',
      header: t('Utilisation'),
      align: 'right',
      cell: (d) => <span className="numeric">{formatPercent(d.utilisationPct)}</span>,
      sortValue: (d) => d.utilisationPct,
      hideBelow: 'md',
    },
    {
      id: 'variance',
      header: t('Variance vs plan'),
      align: 'right',
      cell: (d) => (
        <span className={`numeric font-medium ${d.variancePct < 0 ? 'text-crit-600' : 'text-ink-800'}`}>
          {d.variancePct > 0 ? '+' : ''}
          {formatPercent(d.variancePct)}
        </span>
      ),
      sortValue: (d) => Math.abs(d.variancePct),
    },
    {
      id: 'state',
      header: t('Standing'),
      cell: (d) => <StateBadge state={d.state} />,
      sortValue: (d) => Math.abs(d.variancePct),
      hideBelow: 'lg',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Financial Intelligence') }]}
        freshness={FRESHNESS}
      />

      <DemonstrationNotice />

      {result.unavailableComponents.length > 0 ? (
        <PartialDataWarning
          available={components.length - result.unavailableComponents.length}
          expected={components.length}
          detail={`${result.unavailableComponents.join(', ')} could not be computed at your access level. Those components are shown at zero rather than assumed healthy, so the index you are reading is lower than the corporation's true position.`}
        />
      ) : null}

      {/* Headline position -------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={t('Financial Health Index')} description={t('Weighted across six published components.')} />
          <div className="mt-3 flex items-center gap-4">
            <ScoreDial score={result.index} label={t('Index')} caption={`${result.index}/100`} />
            <div className="min-w-0">
              <StateBadge state={result.state} />
              <p className="mt-2 text-xs leading-relaxed text-ink-600">{result.narrative}</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t('How the index is composed')}
            description={t('Published weights. Each bar is the component\'s contribution to the index.')}
          />
          <ContributionBars
            className="mt-3"
            items={components.map((c) => ({
              id: c.id,
              label: `${c.label} - ${c.measure}`,
              contribution: c.contribution,
              weight: c.weight,
              rawScore: c.score,
              explanation: c.explanation,
            }))}
          />
          <p className="mt-3 border-t border-ink-100 pt-2.5 text-[0.6875rem] leading-relaxed text-ink-500">
            {t('Weights sum to {0}. Budget utilisation scores highest near the phased plan rather than at 100% spend - both under- and over-spend are unhealthy positions.', Object.values(FINANCIAL_HEALTH_WEIGHTS).reduce((s, w) => s + w, 0).toFixed(2))}
          </p>
        </Card>
      </div>

      {/* Position figures ---------------------------------------------- */}
      <MetricGrid columns={4}>
        <MetricCard
          label={t('Revenue collected')}
          value={formatCrore(position.collectedRevenueCrore)}
          support={t('of {0} target', formatCrore(position.targetRevenueCrore))}
          icon={<Coins className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Expenditure')}
          value={formatCrore(position.actualCrore)}
          support={t('of {0} revised budget', formatCrore(position.revisedCrore))}
          icon={<Banknote className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Indicative net position')}
          value={formatCrore(position.netPositionCrore)}
          tone={position.netPositionCrore >= 0 ? 'positive' : 'warn'}
          support={t('Collected revenue less recorded expenditure')}
          icon={<Scale className="h-4 w-4" />}
          explanation={
            <span>
              {t('An indicative figure only. It is collected revenue less recorded expenditure across the readable set, not a treasury cash position - the corporation\'s actual cash position is held in the financial system of record.')}
            </span>
          }
        />
        <MetricCard
          label={t('Receivables')}
          value={formatCrore(position.arrearsCrore)}
          tone={position.arrearsCrore > position.assessedRevenueCrore * 0.25 ? 'warn' : 'default'}
          support={t('Assessed but not yet collected')}
          icon={<PiggyBank className="h-4 w-4" />}
        />
      </MetricGrid>

      <SplitLayout
        asideWidth="lg"
        main={
          <Card flush>
            <CardHeader
              bordered
              title={t('Departmental position')}
              description={t('Ranked by the widest variance against the phased plan, either direction.')}
            />
            <DataTable
              rows={departments}
              columns={deptColumns}
              rowKey={(d) => d.departmentId}
              pageSize={14}
              stickyHeader
              maxHeight="30rem"
              searchPlaceholder="Search department"
            />
          </Card>
        }
        aside={
          <>
            <Card>
              <CardHeader
                title={t('Capital and project spend')}
                description={t('Where the corporation\'s capital programme actually stands.')}
              />
              <DefinitionList className="mt-2">
                <DefinitionRow label={t('Capital approved')}>{formatCrore(position.capexApprovedCrore)}</DefinitionRow>
                <DefinitionRow label={t('Capital spent')}>{formatCrore(position.capexActualCrore)}</DefinitionRow>
                <DefinitionRow label={t('Project sanctioned')}>{formatCrore(position.projectSanctionedCrore)}</DefinitionRow>
                <DefinitionRow label={t('Project released')}>{formatCrore(position.projectPaidCrore)}</DefinitionRow>
                <DefinitionRow label={t('Mean completion')}>{formatPercent(position.projectCompletionPct)}</DefinitionRow>
                <DefinitionRow label={t('Committed, unspent')}>{formatCrore(position.committedCrore)}</DefinitionRow>
                <DefinitionRow label={t('Forecast year-end')}>{formatCrore(position.forecastYearEndCrore)}</DefinitionRow>
                <DefinitionRow label={t('Approved')}>{formatCrore(position.approvedCrore)}</DefinitionRow>
              </DefinitionList>
            </Card>

            <Card>
              <CardHeader
                title={t('Leakage indicators')}
                description={t('Reconciliation candidates - never assertions of irregularity.')}
                actions={<Badge tone="intel">{leakageIndicators.length}</Badge>}
              />
              {leakageIndicators.length === 0 ? (
                <p className="mt-2 text-xs leading-relaxed text-ink-500">
                  {t('No leakage indicator is raised on the records in your scope.')}
                </p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {leakageIndicators.map((l) => (
                    <li key={l.id} className="rounded-lg border border-ink-100 bg-surface-sunken p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-[0.8125rem] font-medium text-ink-800">{l.label}</p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="numeric text-[0.6875rem] font-semibold text-ink-700">
                            {formatCrore(l.exposureCrore)}
                          </span>
                          <SeverityBadge severity={l.severity} />
                        </div>
                      </div>
                      <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">{l.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card tone="sunken">
              <div className="flex items-start gap-2.5">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-semibold text-ink-800">{t('On the forecast component')}</p>
                  <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">
                    {t('Forecast variance measures how far departmental year-end forecasts sit from the approved position. It is a measure of how well the corporation forecasts itself - a governance signal. It is not a prediction of the year-end outturn and must not be read as one.')}
                  </p>
                </div>
              </div>
            </Card>

            <Card tone="sunken">
              <div className="flex items-start gap-2.5">
                <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-semibold text-ink-800">{t('Source of record')}</p>
                  <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">
                    {t('Every figure here is derived from the corporation\'s budget, revenue and project records. Where this page and the financial system of record disagree, the system of record is authoritative. This is an intelligence layer, not a ledger.')}
                  </p>
                </div>
              </div>
            </Card>
          </>
        }
      />
    </PageBody>
  )
}

export default FinancialIntelligencePage
