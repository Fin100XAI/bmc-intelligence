import { useMemo, useState } from 'react'
import { MessageSquareWarning, RefreshCcw, Repeat, ShieldAlert, Timer } from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { Badge, SeverityBadge } from '@/components/ui/badges'
import { Card, Label, MetricGrid, Select } from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { MetricCard } from '@/components/cards/MetricCard'
import { GovPanel } from '@/components/gov/GovPanel'
import { MiniBar } from '@/components/charts'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { citizenService } from '@/services'
import type { RecurringCluster } from '@/domains/citizen-services/root-cause'
import { usePageMasthead } from '@/stores/masthead.store'
import { activeCorporation } from '@/config/municipality.config'
import { WARDS } from '@/data/reference'
import { COMPLAINT_CATEGORY_LABEL, type ComplaintCategory, type ComplaintChannel } from '@/types/operations'
import { formatNumber, formatPercent } from '@/utils/format'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * The routes a citizen can reach the corporation on, named as the corporation
 * names them to the public rather than as the system stores them.
 */
function build$CHANNEL_LABEL(): Record<ComplaintChannel, string> {
  return {
  helpline: t('Helpline'),
  'citizen-portal': t('Citizen portal'),
  'mobile-app': t('Mobile app'),
  'ward-office': t('Ward office'),
  'social-media': t('Social media'),
  'field-inspection': t('Field inspection'),
}
}
let CHANNEL_LABEL: Record<ComplaintChannel, string> = build$CHANNEL_LABEL()
registerLayer(() => {
  CHANNEL_LABEL = build$CHANNEL_LABEL()
})

/**
 * src/pages/city/CitizenServiceIntelligencePage.tsx
 *
 * Citizen Service Intelligence.
 *
 * A complaint count tells the corporation how loud a problem is. This screen
 * answers the question a department actually needs answered: which complaints
 * keep coming back, where, and what infrastructure the corporation already
 * holds a record of at that location.
 *
 * The association between a recurring cluster and an infrastructure record is
 * by ward and service category. It is a place to send an inspection, not a
 * finding of cause - and the page says so wherever it makes one.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-45),
  refreshIntervalMinutes: 360,
  origin: 'derived-metric' as const,
  sourceState: 'operational' as const,
  stale: false,
}

export function CitizenServiceIntelligencePage(): React.JSX.Element {
  const [wardId, setWardId] = useState<string>('')
  const [category, setCategory] = useState<string>('')

  usePageMasthead(t('Citizen Service Intelligence'))

  const filters = useMemo(
    () => ({
      ...(wardId ? { wardId } : {}),
      ...(category ? { category: category as ComplaintCategory } : {}),
    }),
    [wardId, category],
  )

  const summaryQuery = useServiceQuery(queryKeys.citizen(`summary:${wardId}:${category}`), (u) =>
    citizenService.summary(u, filters),
  )
  const clustersQuery = useServiceQuery(queryKeys.citizen(`clusters:${wardId}:${category}`), (u) =>
    citizenService.clusters(u, filters),
  )
  const rootCauseQuery = useServiceQuery(queryKeys.citizen(`root:${wardId}:${category}`), (u) =>
    citizenService.rootCauses(u, filters),
  )
  const categoryQuery = useServiceQuery(queryKeys.citizen(`categories:${wardId}:${category}`), (u) =>
    citizenService.categories(u, filters),
  )
  const deptQuery = useServiceQuery(queryKeys.citizen(`departments:${wardId}:${category}`), (u) =>
    citizenService.departments(u, filters),
  )
  const channelQuery = useServiceQuery(queryKeys.citizen(`channels:${wardId}:${category}`), (u) =>
    citizenService.channels(u, filters),
  )

  if (summaryQuery.isLoading) return <LoadingState variant="metrics" />
  if (summaryQuery.error) {
    return <ErrorState detail={summaryQuery.error.message} onRetry={() => summaryQuery.refetch()} />
  }

  const summary = summaryQuery.data
  const clusters = clustersQuery.data ?? []
  const associations = rootCauseQuery.data ?? []
  const postures = categoryQuery.data ?? []
  const channels = channelQuery.data ?? []
  const handoffs = deptQuery.data ?? []

  const clusterColumns: Array<Column<RecurringCluster>> = [
    {
      id: 'locality',
      header: t('Locality'),
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-800">{c.localityName}</p>
          <p className="truncate text-[0.625rem] text-ink-400">{c.wardLabel}</p>
        </div>
      ),
      sortValue: (c) => c.localityName,
      searchValue: (c) => `${c.localityName} ${c.wardLabel} ${c.categoryLabel}`,
      width: 'minmax(11rem,1.3fr)',
    },
    {
      id: 'category',
      header: t('Service'),
      cell: (c) => <Badge tone="muted">{c.categoryLabel}</Badge>,
      sortValue: (c) => c.categoryLabel,
    },
    {
      id: 'complaints',
      header: t('Reports'),
      align: 'right',
      cell: (c) => <span className="numeric">{c.complaints}</span>,
      sortValue: (c) => c.complaints,
    },
    {
      id: 'recurring',
      header: t('Repeat'),
      align: 'right',
      cell: (c) => (
        <span className="numeric font-semibold text-ink-800">
          {c.recurring}
          <span className="ml-1 text-[0.625rem] font-normal text-ink-400">
            {Math.round((c.recurring / c.complaints) * 100)}%
          </span>
        </span>
      ),
      sortValue: (c) => c.recurring,
    },
    {
      id: 'sla',
      header: t('SLA breached'),
      align: 'right',
      cell: (c) => <span className="numeric">{c.slaBreached}</span>,
      sortValue: (c) => c.slaBreached,
      hideBelow: 'md',
    },
    {
      id: 'severity',
      header: t('Worst severity'),
      cell: (c) => <SeverityBadge severity={c.severity} />,
      sortValue: (c) => c.severity,
      hideBelow: 'lg',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Citizen Service Intelligence') }]}
        freshness={FRESHNESS}
        controls={
          <>
            <div className="w-full max-w-[14rem]">
              <Label htmlFor="cs-ward">{t('Ward')}</Label>
              <Select
                id="cs-ward"
                value={wardId}
                onChange={(e) => setWardId(e.target.value)}
                aria-label={t('Filter by ward')}
                options={[
                  { value: '', label: t('All authorised wards') },
                  ...WARDS.map((w) => ({ value: w.id, label: `${w.code} - ${w.name.split(' · ')[0]}` })),
                ]}
              />
            </div>
            <div className="w-full max-w-[14rem]">
              <Label htmlFor="cs-category">{t('Service category')}</Label>
              <Select
                id="cs-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label={t('Filter by service category')}
                options={[
                  { value: '', label: t('All categories') },
                  ...Object.entries(COMPLAINT_CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
                ]}
              />
            </div>
          </>
        }
      />

      <DemonstrationNotice />

      {/* Service position ---------------------------------------------- */}
      <MetricGrid columns={4}>
        <MetricCard
          label={t('Open service requests')}
          value={summary?.open ?? 0}
          support={t('of {0} in your authorised scope', summary?.total ?? 0)}
          icon={<MessageSquareWarning className="h-4 w-4" />}
          background="red"
          footer={
            activeCorporation.id === 'bmc' && activeCorporation.annualCivicComplaintsReported ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('For context: ~{0} complaints were logged via BMC\'s Central Complaint Registration System in 2024, a 70% increase since 2015, per Praja Foundation\'s RTI-based report (May 2025). That figure covers only water, waste, sewage, pollution and toilets - not every complaint category modelled on this page.', formatNumber(activeCorporation.annualCivicComplaintsReported))}
              </span>
            ) : undefined
          }
        />
        <MetricCard
          label={t('Repeat reports')}
          value={formatPercent(summary?.recurringPct ?? 0)}
          tone={(summary?.recurringPct ?? 0) >= 30 ? 'warn' : 'default'}
          support={t('{0} reports at a location that has reported before', summary?.recurring ?? 0)}
          icon={<Repeat className="h-4 w-4" />}
          explanation={
            <span>
              {t('A repeat report means the same locality and service category has been reported before. It is the clearest available signal that a request was closed without its underlying cause being resolved.')}
            </span>
          }
          background="amber"
        />
        <MetricCard
          label={t('Reopening rate')}
          value={formatPercent(summary?.reopeningPct ?? 0)}
          tone={(summary?.reopeningPct ?? 0) >= 8 ? 'warn' : 'default'}
          support={t('{0} reopened after being marked resolved', summary?.reopened ?? 0)}
          icon={<RefreshCcw className="h-4 w-4" />}
          background="green"
        />
        <MetricCard
          label={t('SLA compliance')}
          value={formatPercent(summary?.slaCompliancePct ?? 0)}
          tone={
            (summary?.slaCompliancePct ?? 0) >= 90
              ? 'positive'
              : (summary?.slaCompliancePct ?? 0) >= 75
                ? 'default'
                : 'critical'
          }
          support={t('{0} beyond the category SLA', summary?.slaBreached ?? 0)}
          icon={<Timer className="h-4 w-4" />}
        />
      </MetricGrid>

      <SplitLayout
        asideWidth="lg"
        main={
          <>
            {/* Root cause intelligence ------------------------------- */}
            <GovPanel
              title={t('Root Cause Intelligence')}
              tone="amber"
              dense
              actions={<Badge tone="intel">{t('Association, not attribution')}</Badge>}
            >
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('Recurring clusters associated with the infrastructure the corporation already holds a record of in that ward.')}
              </p>
              {associations.length === 0 ? (
                <EmptyState
                  className="mx-3 mb-3"
                  title={t('No recurring cluster reaches the reporting threshold')}
                  detail="A cluster needs at least three reports at one locality in one service category before it is shown."
                />
              ) : (
                <ul className="divide-y divide-ink-50">
                  {associations.map((a) => (
                    <li key={a.cluster.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[0.8125rem] font-semibold text-ink-900">
                            {a.cluster.localityName} · {a.cluster.categoryLabel}
                          </p>
                          <p className="mt-0.5 text-[0.6875rem] text-ink-500">
                            {a.cluster.wardLabel} · {a.cluster.departmentLabel}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <SeverityBadge severity={a.cluster.severity} />
                          <Badge tone={a.issues.length > 0 ? 'warn' : 'muted'}>
                            {t('{0} linked record(s)', a.issues.length)}
                          </Badge>
                        </div>
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-ink-600">{a.statement}</p>

                      {a.issues.length > 0 ? (
                        <ul className="mt-2.5 space-y-1.5">
                          {a.issues.map((issue) => (
                            <li
                              key={`${a.cluster.id}-${issue.id}`}
                              className="flex items-start gap-2 rounded-md border border-ink-100 bg-surface-sunken px-2.5 py-1.5"
                            >
                              <SeverityBadge severity={issue.severity} />
                              <div className="min-w-0">
                                <p className="truncate text-[0.75rem] font-medium text-ink-800">{issue.label}</p>
                                <p className="text-[0.6875rem] leading-relaxed text-ink-500">{issue.detail}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </GovPanel>

            {/* Clusters table ---------------------------------------- */}
            <GovPanel title={t('Recurring complaint clusters')} tone="red" dense className="mt-4">
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('Grouped by locality and service category - the unit a department can act on.')}
              </p>
              {clusters.length === 0 ? (
                <EmptyState className="mx-3 mb-3" title={t('No clusters in scope')} detail="No locality reaches the reporting threshold." />
              ) : (
                <DataTable
                  rows={clusters}
                  columns={clusterColumns}
                  rowKey={(c) => c.id}
                  pageSize={12}
                  stickyHeader
                  maxHeight="28rem"
                  searchPlaceholder="Search locality, ward or service"
                />
              )}
            </GovPanel>
          </>
        }
        aside={
          <>
            <GovPanel title={t('Where service is deteriorating')} tone="amber">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                {t('By category, ranked on the share of reports that are repeats.')}
              </p>
              <ul className="mt-3 space-y-2.5">
                {postures.map((p) => (
                  <li key={p.category}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-medium text-ink-700">{p.label}</span>
                      <span className="numeric shrink-0 text-[0.6875rem] text-ink-500">
                        <span className="font-semibold text-ink-800">{formatPercent(p.recurringPct)}</span> repeat
                      </span>
                    </div>
                    <MiniBar value={p.recurringPct} className="mt-1" />
                    <p className="mt-1 text-[0.6875rem] text-ink-500">
                      {t('{0} open · {1} reopened · SLA {2}', p.open, p.reopened, formatPercent(p.slaCompliancePct))}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[0.625rem] leading-snug text-ink-400">
                {t('Praja Foundation\'s RTI-based analysis counted an estimated {0} complaints for water supply, solid waste, sewerage, pollution and public conveniences combined, via BMC\'s Central Complaint Registration System in 2024 — a published cross-check for those five categories only, not the total shown here across every category.', formatNumber(activeCorporation.annualCivicComplaintsReported ?? 0))}
              </p>
            </GovPanel>

            <GovPanel title={t('Departmental handoff')} tone="green">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                {t('Where the work lands, ranked by weakest SLA position.')}
              </p>
              <ul className="mt-3 space-y-2">
                {handoffs.map((d) => (
                  <li key={d.departmentId} className="rounded-lg border border-ink-100 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[0.8125rem] font-medium text-ink-800">{d.label}</p>
                      <Badge tone={d.slaCompliancePct >= 90 ? 'positive' : d.slaCompliancePct >= 75 ? 'warn' : 'critical'}>
                        {formatPercent(d.slaCompliancePct)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[0.6875rem] text-ink-500">
                      {t('{0} open of {1} · {2} service categories · mean age {3}h', d.open, d.total, d.categories, Math.round(d.meanAgeHours))}
                    </p>
                  </li>
                ))}
              </ul>
            </GovPanel>

            {/* --------------------------------------------------------------
                Where complaints actually arrive.
                Reporting one resolution rate across every route hides which
                route is failing the people using it - the counter and the
                helpline do not behave like the app, and the SLA position is
                where that shows.
               -------------------------------------------------------------- */}
            {channels.length > 0 ? (
              <GovPanel title={t('How complaints reached the corporation')} tone="amber">
                <p className="mb-3 text-xs leading-relaxed text-ink-500">
                  {t('Volume share and SLA position for every route in use, busiest first.')}
                </p>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {channels.map((c) => (
                    <li key={c.channel} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[0.8125rem] font-medium text-ink-800">{CHANNEL_LABEL[c.channel]}</span>
                        <span className="numeric shrink-0 text-[0.6875rem] text-ink-500">
                          {t('{0} of complaints', formatPercent(c.sharePct, 0))}
                        </span>
                      </div>
                      <MiniBar value={c.sharePct} />
                      <p className="text-[0.6875rem] leading-relaxed text-ink-500">
                        {t('{0} received, {1} open · SLA compliance {2} · mean age {3}h', c.total, c.open, formatPercent(c.slaCompliancePct, 0), Math.round(c.averageAgeHours))}
                      </p>
                    </li>
                  ))}
                </ul>
              </GovPanel>
            ) : null}

            <Card tone="sunken">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-semibold text-ink-800">{t('No citizen personal data')}</p>
                  <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">
                    {t('The complaint record modelled here holds no name, contact detail, address or citizen identifier. Only service category, locality, ward, department and timing are held - which is what service intelligence requires and no more.')}
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

export default CitizenServiceIntelligencePage
