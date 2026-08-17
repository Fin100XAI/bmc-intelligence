import { useMemo, useState } from 'react'
import { AlertTriangle, Building2, HardHat, Info, ShieldQuestion, TrendingDown } from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { Badge, SeverityBadge, StateBadge } from '@/components/ui/badges'
import {
  Card,
  DefinitionList,
  DefinitionRow,
  Label,
  MetricGrid,
  ProgressBar,
  Select,
} from '@/components/ui/primitives'
import { GovPanel } from '@/components/gov/GovPanel'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState, PartialDataWarning } from '@/components/ui/states'
import { MetricCard } from '@/components/cards/MetricCard'
import { ContributionBars, MiniBar } from '@/components/charts'
import { useServiceQuery } from '@/hooks'
import { usePageMasthead } from '@/stores/masthead.store'
import { queryKeys } from '@/app/queryClient'
import { contractorService } from '@/services'
import type { ContractorProfile } from '@/domains/contractors/performance'
import { CONTRACTOR_PERFORMANCE_WEIGHTS } from '@/domains/contractors/performance'
import { departmentName, wardName } from '@/data/reference'
import { formatCrore, formatPercent } from '@/utils/format'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * src/pages/governance/ContractorIntelligencePage.tsx
 *
 * Supplier delivery intelligence.
 *
 * The corporation contracts out most of what it builds, so how a supplier is
 * delivering is BMC intelligence in its own right. Every figure on this
 * page is computed from the contract and project record through published
 * weights, and the page states plainly what it is not: a risk indicator here
 * describes delivery exposure, never misconduct. Findings against a supplier
 * are the outcome of process, and this screen is not that process.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-180),
  refreshIntervalMinutes: 1440,
  origin: 'derived-metric' as const,
  sourceState: 'operational' as const,
  stale: false,
}

export function ContractorIntelligencePage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(t('Contractor Intelligence'))

  const portfolioQuery = useServiceQuery(queryKeys.contractors('portfolio'), (u) => contractorService.portfolio(u))
  const profilesQuery = useServiceQuery(queryKeys.contractors('profiles'), (u) => contractorService.profiles(u))
  const bandsQuery = useServiceQuery(queryKeys.contractors('bands'), (u) => contractorService.bands(u))

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [riskOnly, setRiskOnly] = useState<'' | 'risk'>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data])

  const categories = useMemo(
    () => [...new Set(profiles.flatMap((p) => p.categories))].sort(),
    [profiles],
  )

  const filtered = useMemo(
    () =>
      profiles.filter((p) => {
        if (riskOnly === 'risk' && p.riskIndicators.length === 0) return false
        if (categoryFilter && !p.categories.includes(categoryFilter as never)) return false
        return true
      }),
    [profiles, riskOnly, categoryFilter],
  )

  const selected = useMemo(
    () => filtered.find((p) => p.contractor.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  )

  if (portfolioQuery.isLoading || profilesQuery.isLoading) return <LoadingState variant="table" />
  if (portfolioQuery.error) {
    return <ErrorState detail={portfolioQuery.error.message} onRetry={() => portfolioQuery.refetch()} />
  }
  if (profilesQuery.error) {
    return <ErrorState detail={profilesQuery.error.message} onRetry={() => profilesQuery.refetch()} />
  }

  const portfolio = portfolioQuery.data

  const columns: Array<Column<ContractorProfile>> = [
    {
      id: 'name',
      header: t('Supplier'),
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-800">{p.contractor.name}</p>
          <p className="numeric mt-0.5 truncate text-[0.625rem] text-ink-400">{p.contractor.registrationRef}</p>
        </div>
      ),
      sortValue: (p) => p.contractor.name,
      searchValue: (p) => `${p.contractor.name} ${p.contractor.registrationRef}`,
      width: 'minmax(12rem,1.4fr)',
    },
    {
      id: 'performance',
      header: t('Performance index'),
      cell: (p) => (
        <div className="flex items-center gap-2">
          <MiniBar value={p.performanceIndex} />
          <span className="numeric w-8 shrink-0 text-right font-semibold text-ink-800">{p.performanceIndex}</span>
        </div>
      ),
      sortValue: (p) => p.performanceIndex,
      width: 'minmax(9rem,1fr)',
    },
    {
      id: 'state',
      header: t('Standing'),
      cell: (p) => <StateBadge state={p.state} />,
      sortValue: (p) => p.performanceIndex,
    },
    {
      id: 'contracts',
      header: t('Active'),
      align: 'right',
      cell: (p) => <span className="numeric">{p.activeContracts.length}</span>,
      sortValue: (p) => p.activeContracts.length,
      hideBelow: 'md',
    },
    {
      id: 'value',
      header: t('Contracted'),
      align: 'right',
      cell: (p) => <span className="numeric">{formatCrore(p.totalContractedCrore)}</span>,
      sortValue: (p) => p.totalContractedCrore,
      hideBelow: 'md',
    },
    {
      id: 'extensions',
      header: t('Extensions'),
      align: 'right',
      cell: (p) => <span className="numeric">{p.totalExtensions}</span>,
      sortValue: (p) => p.totalExtensions,
      hideBelow: 'lg',
      optional: true,
    },
    {
      id: 'risk',
      header: t('Indicators'),
      cell: (p) =>
        p.riskIndicators.length > 0 ? (
          <Badge tone={p.riskIndicators.some((r) => r.severity === 'high') ? 'critical' : 'warn'}>
            {p.riskIndicators.length}
          </Badge>
        ) : (
          <span className="text-ink-300">-</span>
        ),
      sortValue: (p) => p.riskIndicators.length,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Contractor Intelligence') }]}
        freshness={FRESHNESS}
        controls={
          <>
            <div className="w-full max-w-[13rem]">
              <Label htmlFor="ctr-category">{t('Category')}</Label>
              <Select
                id="ctr-category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label={t('Filter by category')}
                options={[
                  { value: '', label: t('All categories') },
                  ...categories.map((c) => ({ value: String(c), label: String(c).replace(/-/g, ' ') })),
                ]}
              />
            </div>
            <div className="w-full max-w-[13rem]">
              <Label htmlFor="ctr-risk">{t('Indicators')}</Label>
              <Select
                id="ctr-risk"
                value={riskOnly}
                onChange={(e) => setRiskOnly(e.target.value as '' | 'risk')}
                aria-label={t('Filter by risk indicators')}
                options={[
                  { value: '', label: t('All suppliers') },
                  { value: 'risk', label: t('Carrying at least one indicator') },
                ]}
              />
            </div>
          </>
        }
      />

      <DemonstrationNotice />

      {portfolio && portfolio.suppliersOutsideScope > 0 ? (
        <PartialDataWarning
          available={portfolio.suppliers}
          expected={portfolio.suppliers + portfolio.suppliersOutsideScope}
          detail={`${portfolio.suppliersOutsideScope} empanelled supplier(s) hold no contract or project you are authorised to read, so they are not shown and the totals below cover only your authorised scope.`}
        />
      ) : null}

      {/* Portfolio position ------------------------------------------- */}
      <MetricGrid columns={4}>
        <MetricCard
          label={t('Suppliers in scope')}
          value={portfolio?.suppliers ?? 0}
          support={t('With at least one readable contract or project')}
          icon={<HardHat className="h-4 w-4" />}
          background="red"
        />
        <MetricCard
          label={t('Contracted value')}
          value={formatCrore(portfolio?.totalContractedCrore ?? 0)}
          support={t('{0} released to date', formatCrore(portfolio?.totalPaidCrore ?? 0))}
          icon={<Building2 className="h-4 w-4" />}
          background="amber"
        />
        <MetricCard
          label={t('Mean performance index')}
          value={portfolio?.meanPerformanceIndex ?? 0}
          unit="/100"
          tone={
            (portfolio?.meanPerformanceIndex ?? 0) >= 78
              ? 'positive'
              : (portfolio?.meanPerformanceIndex ?? 0) >= 62
                ? 'default'
                : 'warn'
          }
          support={t('Weighted across five published criteria')}
          icon={<TrendingDown className="h-4 w-4" />}
          background="green"
        />
        <MetricCard
          label={t('Carrying indicators')}
          value={portfolio?.suppliersWithRiskIndicators ?? 0}
          tone={(portfolio?.suppliersUnderReview ?? 0) > 0 ? 'warn' : 'default'}
          support={t('{0} below empanelment expectation', portfolio?.suppliersUnderReview ?? 0)}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </MetricGrid>

      {/* What this page is not ---------------------------------------- */}
      <Card tone="sunken" className="flex items-start gap-3">
        <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-ink-800">
            {t('A risk indicator is not evidence of misconduct')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {t('Everything on this page is computed from records the corporation already holds - awarded value, released payment, recorded milestones, inspection observations and linked complaints. Time extensions and cost variations are granted through process and are frequently justified. An indicator means a figure warrants departmental attention and reconciliation; it does not mean a supplier has done anything wrong, and this screen cannot and does not make that determination.')}
          </p>
        </div>
      </Card>

      <SplitLayout
        asideWidth="lg"
        main={
          <GovPanel title={t('Suppliers by delivery standing')} tone="amber" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Ranked lowest performance index first - the suppliers whose active work most warrants supervision.')}
            </p>
            {filtered.length === 0 ? (
              <EmptyState
                title={t('No suppliers match this filter')}
                detail="Relax the category or indicator filter to widen the set."
              />
            ) : (
              <DataTable
                rows={filtered}
                columns={columns}
                rowKey={(p) => p.contractor.id}
                pageSize={12}
                stickyHeader
                maxHeight="32rem"
                searchPlaceholder="Search supplier or registration reference"
                onRowClick={(p) => setSelectedId(p.contractor.id)}
                activeRowKey={selected?.contractor.id}
              />
            )}
          </GovPanel>
        }
        aside={
          selected ? (
            <>
              <GovPanel title={selected.contractor.name} tone="amber" actions={<StateBadge state={selected.state} />}>
                <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Empanelment {0}', selected.contractor.registrationRef)}</p>
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="label-institutional">{t('Performance index')}</span>
                    <span className="numeric text-metric-sm font-semibold text-ink-900">
                      {selected.performanceIndex}
                      <span className="ml-0.5 text-sm font-normal text-ink-400">/100</span>
                    </span>
                  </div>
                  <ProgressBar value={selected.performanceIndex} className="mt-2" />
                </div>

                <DefinitionList className="mt-4">
                  <DefinitionRow label={t('Active contracts')}>{selected.activeContracts.length}</DefinitionRow>
                  <DefinitionRow label={t('Closed contracts')}>{selected.closedContracts.length}</DefinitionRow>
                  <DefinitionRow label={t('Projects')}>{selected.projects.length}</DefinitionRow>
                  <DefinitionRow label={t('Contracted value')}>{formatCrore(selected.totalContractedCrore)}</DefinitionRow>
                  <DefinitionRow label={t('Released to date')}>
                    {`${formatCrore(selected.totalPaidCrore)} · ${formatPercent(selected.paymentRatioPct)}`}
                  </DefinitionRow>
                  <DefinitionRow label={t('Recorded progress')}>{formatPercent(selected.deliveryProgressPct)}</DefinitionRow>
                  <DefinitionRow label={t('Time extensions')}>{selected.totalExtensions}</DefinitionRow>
                  <DefinitionRow label={t('Mean variation')}>{formatPercent(selected.meanVariationPct)}</DefinitionRow>
                  <DefinitionRow label={t('Open observations')}>{selected.openObservations}</DefinitionRow>
                  <DefinitionRow label={t('Linked complaints')}>{selected.complaintsLinked}</DefinitionRow>
                  <DefinitionRow label={t('Departments')}>
                    {selected.departments.map((d) => departmentName(d)).join(', ') || '-'}
                  </DefinitionRow>
                  <DefinitionRow label={t('Wards')}>
                    {selected.wards.length > 4
                      ? `${selected.wards.length} wards`
                      : selected.wards.map((w) => wardName(w)).join(', ') || '-'}
                  </DefinitionRow>
                </DefinitionList>
              </GovPanel>

              <GovPanel title={t('How this index is computed')} tone="red">
                <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Published weights. The same arithmetic is applied to every supplier.')}</p>
                <ContributionBars
                  className="mt-3"
                  items={selected.components.map((c) => ({
                    id: c.id,
                    label: c.label,
                    contribution: c.contribution,
                    weight: c.weight,
                    rawScore: c.score,
                    explanation: c.explanation,
                  }))}
                />
                <p className="mt-3 border-t border-ink-100 pt-2.5 text-[0.6875rem] leading-relaxed text-ink-500">
                  {t('Weights sum to {0}. A supplier may ask how their standing was reached, and this is the answer.', Object.values(CONTRACTOR_PERFORMANCE_WEIGHTS).reduce((s, w) => s + w, 0).toFixed(2))}
                </p>
              </GovPanel>

              <GovPanel title={t('Delivery risk indicators')} tone="amber">
                <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Exposure requiring departmental attention - not findings.')}</p>
                {selected.riskIndicators.length === 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-ink-500">
                    {t('No delivery risk indicator is raised against this supplier on the records in your scope.')}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    {selected.riskIndicators.map((r) => (
                      <li key={r.id} className="rounded-lg border border-ink-100 bg-surface-sunken p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[0.8125rem] font-medium text-ink-800">{r.label}</p>
                          <SeverityBadge severity={r.severity} />
                        </div>
                        <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">{r.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 flex items-start gap-1.5 border-t border-ink-100 pt-2.5 text-[0.6875rem] leading-relaxed text-ink-500">
                  <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
                  {t('Any action against a supplier follows the corporation\'s contract-management process. This page informs that process; it does not substitute for it.')}
                </p>
              </GovPanel>
            </>
          ) : (
            <Card>
              <EmptyState title={t('No supplier selected')} detail="Select a supplier to read its delivery profile." />
            </Card>
          )
        }
      />

      {/* Distribution -------------------------------------------------- */}
      <GovPanel title={t('Delivery standing across the supplier base')} tone="green">
        <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Banded distribution used when reporting supplier standing to the corporation.')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(bandsQuery.data ?? []).map((band) => (
            <div key={band.band} className="rounded-lg border border-ink-100 p-3">
              <div className="flex items-baseline justify-between">
                <p className="text-[0.8125rem] font-semibold text-ink-800">{band.band}</p>
                <span className="numeric text-metric-sm font-semibold text-ink-900">{band.count}</span>
              </div>
              <p className="numeric mt-0.5 text-[0.625rem] text-ink-400">
                {t('Index {0}–{1}', band.min, band.max)}
              </p>
              <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-500">{band.description}</p>
            </div>
          ))}
        </div>
      </GovPanel>
    </PageBody>
  )
}

export default ContractorIntelligencePage
