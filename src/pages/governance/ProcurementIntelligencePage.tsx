import { useMemo, useState } from 'react'
import { AlertTriangle, HardHat, Info } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { procurementService } from '@/services'
import type { CategoryConcentration } from '@/services'
import { useDrawerStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { ROUTES } from '@/config/navigation'
import {
  PROJECT_CATEGORY_LABEL,
  TENDER_STAGE_LABEL,
  type Contract,
  type Contractor,
  type TenderStage,
} from '@/types/finance'
import { departmentName } from '@/data/reference'
import { contractorName } from '@/data/finance.data'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatCrore, formatDate, formatPercent } from '@/utils/format'
import {
  Badge,
  Card,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  MetricGrid,
  type Column,
} from '@/components/ui'
import { GovPanel } from '@/components/gov/GovPanel'
import { MetricCard } from '@/components/cards'
import { CategoryBarChart, ChartFrame, ContributionBars, DonutChart, MiniBar } from '@/components/charts'
import { t } from '@/i18n'

/**
 * Procurement Intelligence - flagship tenders, contracts and vendor surface.
 *
 * Reads entirely through `procurementService`: `contracts` for the bulk,
 * correctly access-scoped contract set; `vendors` for the real `Contractor`
 * roster (registration reference, activity, value, delivery index, on-time
 * delivery, open observations, risk flags, state, empanelment date); and
 * `concentration` for the published category-level concentration analysis,
 * whose institutional-register `note` is rendered verbatim per category.
 * `contractorName` (from `@/data/finance.data`) is still used for the
 * contract table's "Contractor" column, since `Contract` itself carries only
 * `contractorId` - that remains a pure display-label resolver, identical in
 * kind to the sanctioned `wardName`/`departmentName` helpers.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-90),
  refreshIntervalMinutes: 1440,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const STAGE_ORDER: TenderStage[] = ['draft', 'published', 'bidding', 'evaluation', 'awarded', 'cancelled']

export function ProcurementIntelligencePage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(t('Procurement Intelligence'))

  const openDrawer = useDrawerStore((s) => s.open)
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null)

  const contractsQuery = useServiceQuery(queryKeys.finance('all-contracts'), (user) =>
    procurementService.contracts(user, { pageSize: 500 }),
  )
  const vendorsQuery = useServiceQuery(queryKeys.finance('vendors'), (user) => procurementService.vendors(user))
  const concentrationQuery = useServiceQuery(queryKeys.finance('concentration'), (user) => procurementService.concentration(user))

  const contracts = contractsQuery.data?.items ?? []
  const vendors = vendorsQuery.data ?? []
  const concentration = concentrationQuery.data ?? []
  const selectedContract = contracts.find((c) => c.id === selectedContractId) ?? null

  const summary = useMemo(() => {
    const active = contracts.filter((c) => c.stage === 'awarded').length
    const totalValue = contracts.reduce((s, c) => s + c.valueCrore, 0)
    const paid = contracts.reduce((s, c) => s + c.paidCrore, 0)
    const avgPerformance = vendors.length > 0 ? vendors.reduce((s, v) => s + v.performanceIndex, 0) / vendors.length : 0
    const repeatedExtensions = contracts.filter((c) => c.extensions >= 2).length
    const topConcentration: CategoryConcentration | undefined = concentration[0]
    return {
      active,
      totalValue: Math.round(totalValue * 10) / 10,
      paid: Math.round(paid * 10) / 10,
      avgPerformance: Math.round(avgPerformance * 10) / 10,
      repeatedExtensions,
      topConcentration,
    }
  }, [contracts, vendors, concentration])

  const categoryComposition = useMemo(
    () => concentration.map((c) => ({ label: PROJECT_CATEGORY_LABEL[c.category], value: c.totalValueCrore })),
    [concentration],
  )

  const stageFunnel = useMemo(
    () => STAGE_ORDER.map((stage) => ({ label: TENDER_STAGE_LABEL[stage], count: contracts.filter((c) => c.stage === stage).length })),
    [contracts],
  )

  const contractColumns: Array<Column<Contract>> = [
    {
      id: 'reference',
      header: t('Reference'),
      cell: (row) => <span className="font-mono text-[0.6875rem] text-ink-500">{row.reference}</span>,
      sortValue: (row) => row.reference,
      searchValue: (row) => `${row.reference} ${row.tenderReference} ${row.title}`,
      width: '9rem',
    },
    {
      id: 'title',
      header: t('Contract'),
      cell: (row) => <span className="line-clamp-2 font-medium text-ink-800">{row.title}</span>,
      sortValue: (row) => row.title,
      width: '18rem',
    },
    {
      id: 'tender',
      header: t('Tender reference'),
      cell: (row) => <span className="font-mono text-[0.6875rem] text-ink-400">{row.tenderReference}</span>,
      sortValue: (row) => row.tenderReference,
      optional: true,
    },
    {
      id: 'category',
      header: t('Category'),
      cell: (row) => <Badge tone="neutral">{PROJECT_CATEGORY_LABEL[row.category]}</Badge>,
      sortValue: (row) => PROJECT_CATEGORY_LABEL[row.category],
      hideBelow: 'lg',
    },
    {
      id: 'department',
      header: t('Department'),
      cell: (row) => departmentName(row.departmentId),
      sortValue: (row) => departmentName(row.departmentId),
      optional: true,
    },
    {
      id: 'contractor',
      header: t('Contractor'),
      cell: (row) => <span className="truncate text-ink-600">{contractorName(row.contractorId)}</span>,
      sortValue: (row) => contractorName(row.contractorId),
      searchValue: (row) => contractorName(row.contractorId),
    },
    {
      id: 'value',
      header: t('Value'),
      cell: (row) => <span className="numeric">{formatCrore(row.valueCrore)}</span>,
      sortValue: (row) => row.valueCrore,
      align: 'right',
    },
    {
      id: 'paid',
      header: t('Paid'),
      cell: (row) => <span className="numeric font-medium">{formatCrore(row.paidCrore)}</span>,
      sortValue: (row) => row.paidCrore,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'award',
      header: t('Award date'),
      cell: (row) => <span className="text-[0.6875rem] text-ink-500">{formatDate(row.awardDate)}</span>,
      sortValue: (row) => row.awardDate,
      optional: true,
    },
    {
      id: 'end-dates',
      header: t('Original → current end'),
      cell: (row) => (
        <span className="text-[0.6875rem] text-ink-500">
          {formatDate(row.originalEndDate)} → <span className={row.endDate !== row.originalEndDate ? 'font-medium text-warn-700' : ''}>{formatDate(row.endDate)}</span>
        </span>
      ),
      sortValue: (row) => row.endDate,
      hideBelow: 'xl',
    },
    {
      id: 'extensions',
      header: t('Extensions'),
      cell: (row) => <span className={`numeric ${row.extensions >= 2 ? 'font-semibold text-warn-700' : ''}`}>{row.extensions}</span>,
      sortValue: (row) => row.extensions,
      align: 'right',
    },
    {
      id: 'variation',
      header: t('Variation'),
      cell: (row) => <span className="numeric">{formatPercent(row.variationPct)}</span>,
      sortValue: (row) => row.variationPct,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'milestones',
      header: t('Milestones'),
      cell: (row) => (
        <span className="numeric text-ink-600">
          {row.milestonesAchieved}/{row.milestonesTotal}
        </span>
      ),
      sortValue: (row) => (row.milestonesTotal > 0 ? row.milestonesAchieved / row.milestonesTotal : 0),
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'performance',
      header: t('Performance'),
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <MiniBar value={row.performanceScore} />
          <span className="numeric w-8 text-right">{row.performanceScore}</span>
        </div>
      ),
      sortValue: (row) => row.performanceScore,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'stage',
      header: t('Stage'),
      cell: (row) => <Badge tone={row.stage === 'cancelled' ? 'critical' : row.stage === 'awarded' ? 'positive' : 'neutral'}>{TENDER_STAGE_LABEL[row.stage]}</Badge>,
      sortValue: (row) => row.stage,
    },
    {
      id: 'risk',
      header: t('Risk indicator'),
      cell: (row) => <Badge tone={row.riskScore >= 60 ? 'critical' : row.riskScore >= 42 ? 'warn' : 'positive'}>{row.riskScore}/100</Badge>,
      sortValue: (row) => row.riskScore,
      align: 'right',
    },
  ]

  const vendorColumns: Array<Column<Contractor>> = [
    {
      id: 'name',
      header: t('Contractor'),
      cell: (row) => <span className="font-medium text-ink-800">{row.name}</span>,
      sortValue: (row) => row.name,
      searchValue: (row) => `${row.name} ${row.registrationRef}`,
      width: '16rem',
    },
    {
      id: 'registration',
      header: t('Registration'),
      cell: (row) => <span className="font-mono text-[0.6875rem] text-ink-400">{row.registrationRef}</span>,
      sortValue: (row) => row.registrationRef,
      optional: true,
    },
    {
      id: 'category',
      header: t('Category'),
      cell: (row) => <span className="truncate text-[0.6875rem] text-ink-500">{row.category.map((c) => PROJECT_CATEGORY_LABEL[c]).join(', ')}</span>,
      sortValue: (row) => row.category.length,
      optional: true,
    },
    {
      id: 'active',
      header: t('Active contracts'),
      cell: (row) => <span className="numeric">{row.activeContracts}</span>,
      sortValue: (row) => row.activeContracts,
      align: 'right',
    },
    {
      id: 'value',
      header: t('Total value'),
      cell: (row) => <span className="numeric font-medium">{formatCrore(row.totalValueCrore)}</span>,
      sortValue: (row) => row.totalValueCrore,
      align: 'right',
    },
    {
      id: 'delivery',
      header: t('Delivery index'),
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <MiniBar value={row.performanceIndex} />
          <span className="numeric w-8 text-right">{row.performanceIndex}</span>
        </div>
      ),
      sortValue: (row) => row.performanceIndex,
      align: 'right',
    },
    {
      id: 'ontime',
      header: t('On-time delivery'),
      cell: (row) => <span className="numeric">{formatPercent(row.onTimeDeliveryPct)}</span>,
      sortValue: (row) => row.onTimeDeliveryPct,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'observations',
      header: t('Open observations'),
      cell: (row) => <span className={`numeric ${row.openObservations > 0 ? 'font-semibold text-warn-700' : 'text-ink-400'}`}>{row.openObservations}</span>,
      sortValue: (row) => row.openObservations,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'flags',
      header: t('Risk flags'),
      cell: (row) =>
        row.riskFlags.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-warn-700" title={row.riskFlags.join('; ')}>
            <AlertTriangle className="h-3 w-3" />
            <span className="numeric">{row.riskFlags.length}</span>
          </span>
        ) : (
          <span className="numeric text-ink-300">0</span>
        ),
      sortValue: (row) => row.riskFlags.length,
      align: 'right',
    },
    {
      id: 'since',
      header: t('Empanelled since'),
      cell: (row) => <span className="text-[0.6875rem] text-ink-500">{formatDate(row.empanelledSince)}</span>,
      sortValue: (row) => row.empanelledSince,
      optional: true,
    },
    {
      id: 'state',
      header: t('State'),
      cell: (row) => (
        <Badge tone={row.state === 'operational' ? 'positive' : row.state === 'degraded' ? 'warn' : row.state === 'at-risk' ? 'risk' : 'critical'}>
          {row.state.replace('-', ' ')}
        </Badge>
      ),
      sortValue: (row) => row.state,
    },
  ]

  const anyLoading = contractsQuery.isLoading || vendorsQuery.isLoading || concentrationQuery.isLoading
  const anyError = contractsQuery.error ?? vendorsQuery.error ?? concentrationQuery.error

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Procurement Intelligence') }]}
        freshness={FRESHNESS}
        actions={
          <LinkButton to={ROUTES.projects} variant="outline" icon={<HardHat className="h-3.5 w-3.5" />}>
            {t('Open Project Intelligence')}
          </LinkButton>
        }
      />

      {anyLoading ? <LoadingState variant="metrics" /> : null}
      {anyError ? (
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void contractsQuery.refetch()
            void vendorsQuery.refetch()
            void concentrationQuery.refetch()
          }}
        />
      ) : null}

      {!anyLoading && !anyError && contracts.length === 0 ? (
        <EmptyState title={t('No contracts available')} detail="No contract records are available within your authorised scope." />
      ) : null}

      {!anyLoading && !anyError && contracts.length > 0 ? (
        <>
          <GovPanel title={t('Procurement summary')} tone="primary">
            <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Across every contract within your authorised scope.')}</p>
            <MetricGrid columns={5}>
              <MetricCard label={t('Active contracts')} value={String(summary.active)} support={t('of {0} on record', contracts.length)} />
              <MetricCard label={t('Total contract value')} value={formatCrore(summary.totalValue)} support={t('{0} paid to date', formatCrore(summary.paid))} />
              <MetricCard label={t('Average performance index')} value={String(summary.avgPerformance)} support={t('{0} vendors, 0–100, higher is better', vendors.length)} />
              <MetricCard
                label={t('Repeated extensions')}
                value={String(summary.repeatedExtensions)}
                support={t('Contracts with two or more extensions')}
                tone={summary.repeatedExtensions > 0 ? 'warn' : 'default'}
              />
              <MetricCard
                label={t('Category concentration')}
                value={summary.topConcentration ? formatPercent(summary.topConcentration.topVendorSharePct) : '-'}
                support={summary.topConcentration ? `${PROJECT_CATEGORY_LABEL[summary.topConcentration.category]} - ${summary.topConcentration.topVendorName}` : 'No data'}
                tone={summary.topConcentration?.aboveThreshold ? 'warn' : 'default'}
              />
            </MetricGrid>
          </GovPanel>

          {/* Two columns. The three registers an officer works through —
              contracts, the concentration each category carries, then the
              vendors behind both — read down the wide column; the indicator
              breakdown for the selected contract and the two compositions
              stand beside them, where the breakdown can be read against the
              row that produced it. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <GovPanel title={t('Contracts')} tone="red" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Sortable, filterable and paginated. Row click selects the contract for the risk-indicator breakdown below and opens its full record.')}
            </p>
            <DataTable
              rows={contracts}
              columns={contractColumns}
              rowKey={(row) => row.id}
              pageSize={10}
              stickyHeader
              maxHeight="30rem"
              searchPlaceholder="Search contracts"
              onRowClick={(row) => {
                setSelectedContractId(row.id)
                openDrawer({ kind: 'contract', id: row.id })
              }}
              activeRowKey={selectedContractId ?? undefined}
              rowAccent={(row) => (
                <span className={`w-[3px] rounded-full ${row.riskScore >= 60 ? 'bg-crit-500' : row.riskScore >= 42 ? 'bg-warn-500' : 'bg-ok-500'}`} />
              )}
            />
          </GovPanel>

          <GovPanel title={t('Category concentration detail')} tone="amber" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Top vendor\'s share of contracted value within each category against the published departmental concentration threshold. Each note is the platform\'s institutional statement for that category, shown verbatim.')}
            </p>
            <div className="divide-y divide-ink-50">
              {concentration.map((c) => (
                <div key={c.category} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink-800">{PROJECT_CATEGORY_LABEL[c.category]}</span>
                    <Badge tone="muted">{c.contractCount} contracts</Badge>
                    <Badge tone="muted">{formatCrore(c.totalValueCrore)}</Badge>
                    <span className="text-xs text-ink-500">
                      {t('Top vendor:')}{' '}<span className="font-medium text-ink-700">{c.topVendorName}</span> - {formatPercent(c.topVendorSharePct)}
                    </span>
                    {c.aboveThreshold ? <Badge tone="warn">{t('Above threshold')}</Badge> : <Badge tone="positive">{t('Within threshold')}</Badge>}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{c.note}</p>
                </div>
              ))}
            </div>
          </GovPanel>

          <GovPanel title={t('Vendors')} tone="green" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Every empanelled contractor holding at least one contract within your authorised scope, ranked by delivery index (lowest first).')}
            </p>
            <DataTable
              rows={vendors}
              columns={vendorColumns}
              rowKey={(row) => row.id}
              pageSize={10}
              stickyHeader
              maxHeight="26rem"
              searchPlaceholder="Search vendors"
            />
          </GovPanel>
          </div>

          <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <GovPanel title={t('Procurement risk indicators')} tone="red">
            <p className="mb-3 text-xs leading-relaxed text-ink-500">
              {t('Every contract\'s risk score is the weighted sum of five published indicators: category concentration, repeated extensions, unusual variation magnitude, milestone delivery delay and supplier performance deterioration. Select a contract in the table above to see its breakdown.')}
            </p>
            {!selectedContract ? (
              <EmptyState title={t('Select a contract')} detail="Choose a contract from the table above to see its risk-indicator breakdown." compact />
            ) : (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral" className="font-mono">{selectedContract.reference}</Badge>
                  <span className="text-sm font-semibold text-ink-800">{selectedContract.title}</span>
                  <Badge tone={selectedContract.riskScore >= 60 ? 'critical' : selectedContract.riskScore >= 42 ? 'warn' : 'positive'}>
                    {t('Risk indicator {0}/100', selectedContract.riskScore)}
                  </Badge>
                </div>
                <ContributionBars items={selectedContract.riskIndicators} />
                <p className="mt-3 flex items-start gap-1.5 rounded-md bg-ink-50 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-ink-500">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  {t('These indicators identify delivery and continuity risk for management attention. They are not, and must not be characterised as, a finding against the contractor or any officer involved in the award or administration of this contract.')}
                </p>
              </div>
            )}
          </GovPanel>

            <Card>
              <ChartFrame title={t('Concentration by category - value composition')} unit={t('₹ crore')} timeframe="Current contract set" freshness={FRESHNESS} height={240}>
                <DonutChart data={categoryComposition} unit={t('₹ Cr')} centreValue={formatCrore(summary.totalValue, 0)} centreLabel="Total value" />
              </ChartFrame>
            </Card>
            <Card>
              <ChartFrame
                title={t('Stage funnel')}
                unit="contracts"
                timeframe="Current contract set"
                description={t('Contract count at each stage of the procurement lifecycle, in natural progression order.')}
                freshness={FRESHNESS}
                height={240}
              >
                <CategoryBarChart data={stageFunnel} categoryKey="label" layout="horizontal" series={[{ key: 'count', label: t('Contracts'), colour: '#2f6feb' }]} />
              </ChartFrame>
            </Card>
          </div>
          </div>
        </>
      ) : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

export default ProcurementIntelligencePage
