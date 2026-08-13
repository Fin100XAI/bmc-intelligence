import { useMemo, useState } from 'react'
import { AlertCircle, Building, FileSearch, Info, ShieldQuestion } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery, useServiceAction } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { revenueService } from '@/services'
import { useCurrentUser } from '@/stores/auth.store'
import { useDrawerStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { allowed } from '@/security'
import { ROUTES } from '@/config/navigation'
import type { DataFreshness } from '@/types/common'
import {
  ANOMALY_DISPOSITION_LABEL,
  REVENUE_STREAM_LABEL,
  type AnomalyDisposition,
  type PropertySegment,
  type RevenueAnomaly,
  type RevenueRecord,
  type RevenueStream,
} from '@/types/finance'
import { wardName, wardShortName } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatCrore, formatDelta, formatPercent } from '@/utils/format'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  MetricGrid,
  Tabs,
  type Column,
} from '@/components/ui'
import { ConfidenceBadge, DeltaBadge, SeverityBadge, SeverityRail, StateBadge } from '@/components/ui/badges'
import { MetricCard } from '@/components/cards'
import { CategoryBarChart, ChartFrame, CompositionBar, MiniBar, RankedBarChart } from '@/components/charts'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Revenue Intelligence - the city's revenue command centre.
 *
 * Reads through `revenueService` only: `records` (city-wide and ward-level
 * property-tax positions), `anomalies` (reconciliation candidates) and
 * `propertySegments` (payer-segment mix). The financial year is treated as
 * ~31% elapsed throughout - the same phasing assumption the demonstration
 * data service itself uses - so every "vs target" figure is stated against a
 * pro-rated, year-to-date target rather than the full annual target.
 */

const FY_ELAPSED_FRACTION = 0.31

const FRESHNESS: DataFreshness = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-260),
  refreshIntervalMinutes: 1440,
  origin: 'demonstration',
  sourceState: 'operational',
  stale: false,
}

const DISPOSITION_TONE: Record<AnomalyDisposition, 'warn' | 'risk' | 'info'> = {
  anomaly: 'warn',
  'unusual-pattern': 'info',
  'investigation-candidate': 'risk',
  'reconciliation-required': 'warn',
}

const STATUS_TONE: Record<RevenueAnomaly['status'], 'warn' | 'info' | 'positive' | 'risk' | 'neutral'> = {
  open: 'warn',
  'under-review': 'info',
  reconciled: 'positive',
  referred: 'risk',
  closed: 'neutral',
}

function build$STATUS_LABEL(): Record<RevenueAnomaly['status'], string> {
  return {
  open: t('Open'),
  'under-review': t('Under Review'),
  reconciled: t('Reconciled'),
  referred: t('Referred'),
  closed: t('Closed'),
}
}
let STATUS_LABEL: Record<RevenueAnomaly['status'], string> = build$STATUS_LABEL()
registerLayer(() => {
  STATUS_LABEL = build$STATUS_LABEL()
})

function nextStatuses(status: RevenueAnomaly['status']): Array<RevenueAnomaly['status']> {
  if (status === 'open') return ['under-review']
  if (status === 'under-review') return ['reconciled', 'referred', 'closed']
  return []
}

function build$SEGMENT_LABEL(): Record<PropertySegment['segment'], string> {
  return {
  residential: t('Residential'),
  commercial: t('Commercial'),
  industrial: t('Industrial'),
  institutional: t('Institutional'),
  mixed: t('Mixed'),
}
}
let SEGMENT_LABEL: Record<PropertySegment['segment'], string> = build$SEGMENT_LABEL()
registerLayer(() => {
  SEGMENT_LABEL = build$SEGMENT_LABEL()
})

export function RevenueIntelligencePage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(
    t('Revenue Intelligence'),
    t('City revenue command centre across property tax, water charges, development charges, licence fees, advertisement, rentals, octroi compensation and other receipts. All collection and variance figures are year-to-date against a pro-rated phased target - the financial year is approximately 31% elapsed at this reporting date.'),
  )

  const user = useCurrentUser()
  const openDrawer = useDrawerStore((s) => s.open)
  const [anomalyStatusFilter, setAnomalyStatusFilter] = useState<'all' | RevenueAnomaly['status']>('all')
  const [expandedAnomalyId, setExpandedAnomalyId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<{ anomaly: RevenueAnomaly; nextStatus: RevenueAnomaly['status'] } | null>(null)

  const recordsQuery = useServiceQuery(queryKeys.revenue('records'), (u) => revenueService.records(u, { pageSize: 50 }))
  const anomaliesQuery = useServiceQuery(queryKeys.revenue('anomalies'), (u) => revenueService.anomalies(u, { pageSize: 30 }))
  const segmentsQuery = useServiceQuery(queryKeys.revenue('payer-segments'), (u) => revenueService.propertySegments(u))

  const updateAnomalyStatus = useServiceAction(
    (u, id: string, status: RevenueAnomaly['status'], reason: string) => revenueService.updateAnomalyStatus(u, id, status, reason),
    [queryKeys.revenue('anomalies')],
  )

  const allRecords: RevenueRecord[] = recordsQuery.data?.items ?? []
  const cityRecords = useMemo(() => allRecords.filter((r) => !r.wardId), [allRecords])
  const wardRecords = useMemo(() => allRecords.filter((r) => Boolean(r.wardId)), [allRecords])

  const cityPosition = useMemo(() => {
    const assessed = cityRecords.reduce((s, r) => s + r.assessedCrore, 0)
    const target = cityRecords.reduce((s, r) => s + r.targetCrore, 0)
    const collected = cityRecords.reduce((s, r) => s + r.collectedCrore, 0)
    const arrears = cityRecords.reduce((s, r) => s + r.arrearsCrore, 0)
    const forecast = cityRecords.reduce((s, r) => s + r.forecastCrore, 0)
    const phasedTarget = target * FY_ELAPSED_FRACTION
    return {
      assessed,
      target,
      collected,
      arrears,
      forecast,
      phasedTarget,
      efficiencyPct: assessed > 0 ? Math.round((collected / assessed) * 1000) / 10 : 0,
      targetVariancePct: phasedTarget > 0 ? Math.round(((collected - phasedTarget) / phasedTarget) * 1000) / 10 : 0,
      forecastVsAnnualPct: target > 0 ? Math.round(((forecast - target) / target) * 1000) / 10 : 0,
    }
  }, [cityRecords])

  const anomalies = anomaliesQuery.data?.items ?? []
  const filteredAnomalies = useMemo(
    () => (anomalyStatusFilter === 'all' ? anomalies : anomalies.filter((a) => a.status === anomalyStatusFilter)),
    [anomalies, anomalyStatusFilter],
  )
  const statusCounts = useMemo(() => {
    const counts: Record<RevenueAnomaly['status'], number> = { open: 0, 'under-review': 0, reconciled: 0, referred: 0, closed: 0 }
    for (const a of anomalies) counts[a.status] += 1
    return counts
  }, [anomalies])
  const expandedAnomaly = anomalies.find((a) => a.id === expandedAnomalyId) ?? null

  const segments = segmentsQuery.data ?? []
  const segmentTotals = useMemo(() => {
    const keys: PropertySegment['segment'][] = ['residential', 'commercial', 'industrial', 'institutional', 'mixed']
    return keys.map((key) => {
      const rows = segments.filter((s) => s.segment === key)
      const assessedValueCrore = rows.reduce((s, r) => s + r.assessedValueCrore, 0)
      const collectedCrore = rows.reduce((s, r) => s + r.collectedCrore, 0)
      return {
        id: key,
        label: SEGMENT_LABEL[key],
        assessedValueCrore: Math.round(assessedValueCrore * 10) / 10,
        collectedCrore: Math.round(collectedCrore * 10) / 10,
        efficiencyPct: assessedValueCrore > 0 ? Math.round((collectedCrore / assessedValueCrore) * 1000) / 10 : 0,
      }
    })
  }, [segments])

  const streamColumns: Array<Column<RevenueRecord>> = [
    {
      id: 'stream',
      header: t('Revenue stream'),
      cell: (row) => <span className="font-medium text-ink-800">{REVENUE_STREAM_LABEL[row.stream]}</span>,
      sortValue: (row) => REVENUE_STREAM_LABEL[row.stream],
      searchValue: (row) => REVENUE_STREAM_LABEL[row.stream],
    },
    {
      id: 'assessed',
      header: t('Assessed'),
      cell: (row) => <span className="numeric">{formatCrore(row.assessedCrore)}</span>,
      sortValue: (row) => row.assessedCrore,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'target',
      header: t('Annual target'),
      cell: (row) => <span className="numeric">{formatCrore(row.targetCrore)}</span>,
      sortValue: (row) => row.targetCrore,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'collected',
      header: t('Collected (YTD)'),
      cell: (row) => <span className="numeric font-medium">{formatCrore(row.collectedCrore)}</span>,
      sortValue: (row) => row.collectedCrore,
      align: 'right',
    },
    {
      id: 'arrears',
      header: t('Arrears'),
      cell: (row) => <span className="numeric text-warn-700">{formatCrore(row.arrearsCrore)}</span>,
      sortValue: (row) => row.arrearsCrore,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'efficiency',
      header: t('Efficiency'),
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={row.collectionEfficiencyPct} />
          <span className="numeric w-11 text-right font-semibold">{formatPercent(row.collectionEfficiencyPct)}</span>
        </div>
      ),
      sortValue: (row) => row.collectionEfficiencyPct,
      align: 'right',
    },
    {
      id: 'variance',
      header: t('Vs phased target'),
      cell: (row) => {
        const phased = row.targetCrore * FY_ELAPSED_FRACTION
        const variance = phased > 0 ? ((row.collectedCrore - phased) / phased) * 100 : 0
        return <DeltaBadge value={Math.round(variance * 10) / 10} />
      },
      sortValue: (row) => row.targetVariancePct,
      align: 'right',
    },
    {
      id: 'forecast',
      header: t('Forecast year-end'),
      cell: (row) => <span className="numeric">{formatCrore(row.forecastCrore)}</span>,
      sortValue: (row) => row.forecastCrore,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'state',
      header: t('State'),
      cell: (row) => <StateBadge state={row.state} />,
      sortValue: (row) => row.state,
    },
  ]

  const wardColumns: Array<Column<RevenueRecord>> = [
    {
      id: 'ward',
      header: t('Ward'),
      cell: (row) => <span className="font-medium text-ink-800">{wardName(row.wardId ?? '')}</span>,
      sortValue: (row) => wardName(row.wardId ?? ''),
      searchValue: (row) => wardName(row.wardId ?? ''),
      width: '16rem',
    },
    {
      id: 'assessed',
      header: t('Assessed'),
      cell: (row) => <span className="numeric">{formatCrore(row.assessedCrore)}</span>,
      sortValue: (row) => row.assessedCrore,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'collected',
      header: t('Collected (YTD)'),
      cell: (row) => <span className="numeric font-medium">{formatCrore(row.collectedCrore)}</span>,
      sortValue: (row) => row.collectedCrore,
      align: 'right',
    },
    {
      id: 'arrears',
      header: t('Arrears'),
      cell: (row) => <span className="numeric text-warn-700">{formatCrore(row.arrearsCrore)}</span>,
      sortValue: (row) => row.arrearsCrore,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'efficiency',
      header: t('Efficiency'),
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={row.collectionEfficiencyPct} />
          <span className="numeric w-11 text-right font-semibold">{formatPercent(row.collectionEfficiencyPct)}</span>
        </div>
      ),
      sortValue: (row) => row.collectionEfficiencyPct,
      align: 'right',
    },
    {
      id: 'variance',
      header: t('Vs phased target'),
      cell: (row) => <DeltaBadge value={row.targetVariancePct} />,
      sortValue: (row) => row.targetVariancePct,
      align: 'right',
      hideBelow: 'sm',
    },
    {
      id: 'state',
      header: t('State'),
      cell: (row) => <StateBadge state={row.state} />,
      sortValue: (row) => row.state,
    },
  ]

  const rankedWardData = useMemo(
    () =>
      [...wardRecords]
        .sort((a, b) => a.collectionEfficiencyPct - b.collectionEfficiencyPct)
        .map((r) => ({ label: wardShortName(r.wardId ?? ''), value: r.collectionEfficiencyPct })),
    [wardRecords],
  )

  const forecastVsTargetData = useMemo(
    () =>
      cityRecords.map((r) => ({
        label: REVENUE_STREAM_LABEL[r.stream],
        target: r.targetCrore,
        forecast: r.forecastCrore,
      })),
    [cityRecords],
  )

  const anomalyColumns: Array<Column<RevenueAnomaly>> = [
    {
      id: 'title',
      header: t('Anomaly'),
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-800">{row.title}</p>
          <p className="mt-0.5 truncate text-[0.6875rem] text-ink-400">
            {REVENUE_STREAM_LABEL[row.stream]} · {wardName(row.wardId)}
          </p>
        </div>
      ),
      sortValue: (row) => row.title,
      searchValue: (row) => `${row.title} ${row.description} ${wardName(row.wardId)}`,
      width: '22rem',
    },
    {
      id: 'disposition',
      header: t('Disposition'),
      cell: (row) => <Badge tone={DISPOSITION_TONE[row.disposition]}>{ANOMALY_DISPOSITION_LABEL[row.disposition]}</Badge>,
      sortValue: (row) => row.disposition,
    },
    {
      id: 'value',
      header: t('Indicative value'),
      cell: (row) => <span className="numeric font-medium">{formatCrore(row.indicativeValueCrore, 2)}</span>,
      sortValue: (row) => row.indicativeValueCrore,
      align: 'right',
    },
    {
      id: 'confidence',
      header: t('Confidence'),
      cell: (row) => <ConfidenceBadge confidence={row.confidence} />,
      sortValue: (row) => row.confidence,
      hideBelow: 'md',
    },
    {
      id: 'severity',
      header: t('Severity'),
      cell: (row) => <SeverityBadge severity={row.severity} />,
      sortValue: (row) => row.severity,
      hideBelow: 'sm',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (row) => <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>,
      sortValue: (row) => row.status,
    },
    {
      id: 'evidence',
      header: t('Evidence'),
      cell: (row) => <span className="numeric text-ink-500">{row.evidenceIds.length}</span>,
      sortValue: (row) => row.evidenceIds.length,
      align: 'right',
      hideBelow: 'lg',
    },
  ]

  const mayEditAnomalies = allowed(user, 'revenue', 'edit')

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Revenue Intelligence') }]}
        freshness={FRESHNESS}
        actions={
          <LinkButton to={ROUTES.property} variant="outline" icon={<Building className="h-3.5 w-3.5" />}>
            {t('Open Property Intelligence')}
          </LinkButton>
        }
      />

      {recordsQuery.isLoading ? <LoadingState variant="metrics" /> : null}
      {recordsQuery.error ? <ErrorState detail={recordsQuery.error.message} onRetry={() => recordsQuery.refetch()} /> : null}

      {!recordsQuery.isLoading && !recordsQuery.error && allRecords.length > 0 ? (
        <>
          <Card>
            <CardHeader
              eyebrow={t('FY 2026–27 · Year to date')}
              title={t('City revenue position')}
              description={t('Collected figures are year-to-date. Variance is measured against the phased (pro-rated) target for the elapsed portion of the financial year, not the full annual target.')}
            />
            <MetricGrid columns={5} className="mt-4">
              <MetricCard label={t('Assessed')} value={formatCrore(cityPosition.assessed)} support={t('{0} annual target', formatCrore(cityPosition.target))} />
              <MetricCard
                label={t('Collected - year to date')}
                value={formatCrore(cityPosition.collected)}
                support={t('{0} of assessed value', formatPercent(cityPosition.efficiencyPct))}
                progress={{ value: cityPosition.efficiencyPct, max: 100 }}
              />
              <MetricCard label={t('Arrears outstanding')} value={formatCrore(cityPosition.arrears)} tone="warn" />
              <MetricCard
                label={t('Variance vs phased target')}
                value={formatDelta(cityPosition.targetVariancePct)}
                support={t('Phased target {0} at 31% FY elapsed', formatCrore(cityPosition.phasedTarget))}
                tone={cityPosition.targetVariancePct < -10 ? 'critical' : cityPosition.targetVariancePct < 0 ? 'warn' : 'positive'}
              />
              <MetricCard
                label={t('Forecast - year end')}
                value={formatCrore(cityPosition.forecast)}
                support={t('{0} vs annual target', formatDelta(cityPosition.forecastVsAnnualPct))}
              />
            </MetricGrid>
          </Card>

          {/* Two columns. The three registers an officer reads in order —
              streams, wards, then the anomalies raised against both — hold the
              wide column; the target, ranking, segment and forecast figures
              drawn from those same rows read down beside them. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
            <Card flush>
              <CardHeader bordered title={t('Revenue by stream')} description={t('City-wide position for every revenue stream, sorted and searchable.')} />
              <DataTable
                rows={cityRecords}
                columns={streamColumns}
                rowKey={(row) => row.id}
                pageSize={8}
                searchPlaceholder="Search revenue streams"
              />
            </Card>

            <Card flush>
              <CardHeader
                bordered
                title={t('Ward revenue performance')}
                description={t('Property tax position by ward - the principal ward-attributable revenue stream. Row click opens the ward\'s full intelligence record.')}
              />
              <DataTable
                rows={wardRecords}
                columns={wardColumns}
                rowKey={(row) => row.id}
                pageSize={10}
                stickyHeader
                maxHeight="24rem"
                searchPlaceholder="Search wards"
                onRowClick={(row) => row.wardId && openDrawer({ kind: 'ward', id: row.wardId })}
                rowAccent={(row) => (
                  <SeverityRail severity={row.targetVariancePct < -25 ? 'high' : row.targetVariancePct < -10 ? 'medium' : 'low'} />
                )}
              />
            </Card>

          <Card flush>
            <CardHeader
              bordered
              icon={<ShieldQuestion className="h-4 w-4" />}
              title={t('Anomalies - reconciliation and review candidates')}
              description={t('Statistical patterns in revenue and assessment records that require assessment. An anomaly is not a finding, and disposition here never characterises the conduct of any person or organisation.')}
              actions={
                <Tabs
                  variant="pill"
                  value={anomalyStatusFilter}
                  onChange={(id) => setAnomalyStatusFilter(id as typeof anomalyStatusFilter)}
                  ariaLabel="Filter anomalies by status"
                  items={[
                    { id: 'all', label: t('All'), count: anomalies.length },
                    { id: 'open', label: STATUS_LABEL.open, count: statusCounts.open },
                    { id: 'under-review', label: STATUS_LABEL['under-review'], count: statusCounts['under-review'] },
                    { id: 'reconciled', label: STATUS_LABEL.reconciled, count: statusCounts.reconciled },
                    { id: 'referred', label: STATUS_LABEL.referred, count: statusCounts.referred },
                    { id: 'closed', label: STATUS_LABEL.closed, count: statusCounts.closed },
                  ]}
                />
              }
            />

            {anomaliesQuery.isLoading ? <LoadingState variant="table" className="p-4" /> : null}
            {anomaliesQuery.error ? (
              <ErrorState detail={anomaliesQuery.error.message} onRetry={() => anomaliesQuery.refetch()} className="m-4" />
            ) : null}
            {!anomaliesQuery.isLoading && !anomaliesQuery.error && filteredAnomalies.length === 0 ? (
              <EmptyState
                title={t('No anomalies in this status')}
                detail="No revenue anomaly records match the selected status filter."
                className="m-4"
                compact
              />
            ) : null}

            {!anomaliesQuery.isLoading && !anomaliesQuery.error && filteredAnomalies.length > 0 ? (
              <DataTable
                rows={filteredAnomalies}
                columns={anomalyColumns}
                rowKey={(row) => row.id}
                pageSize={8}
                searchPlaceholder="Search anomalies"
                onRowClick={(row) => setExpandedAnomalyId(row.id === expandedAnomalyId ? null : row.id)}
                activeRowKey={expandedAnomalyId ?? undefined}
                rowAccent={(row) => <SeverityRail severity={row.severity} />}
              />
            ) : null}

            {expandedAnomaly ? (
              <div className="border-t border-ink-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={DISPOSITION_TONE[expandedAnomaly.disposition]}>
                        {ANOMALY_DISPOSITION_LABEL[expandedAnomaly.disposition]}
                      </Badge>
                      <SeverityBadge severity={expandedAnomaly.severity} />
                      <ConfidenceBadge confidence={expandedAnomaly.confidence} />
                      <Badge tone={STATUS_TONE[expandedAnomaly.status]}>{STATUS_LABEL[expandedAnomaly.status]}</Badge>
                    </div>
                    <h4 className="mt-2 text-[0.9375rem] font-semibold text-ink-900">{expandedAnomaly.title}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-ink-600">{expandedAnomaly.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="label-institutional">{t('Indicative value')}</p>
                    <p className="numeric text-metric-sm font-semibold text-ink-900">
                      {formatCrore(expandedAnomaly.indicativeValueCrore, 2)}
                    </p>
                    <p className="text-[0.625rem] text-ink-400">{t('Modelled, not adjudicated')}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-start gap-2 rounded-md border border-govt-200 bg-govt-50/60 px-3 py-2.5">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-govt-600" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[0.6875rem] font-semibold tracking-wide text-govt-800 uppercase">
                      {t('Platform interpretation statement')}
                    </p>
                    <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-700">{expandedAnomaly.interpretationNote}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="label-institutional">{t('Evidence')}</span>
                  {expandedAnomaly.evidenceIds.map((eid) => (
                    <Button
                      key={eid}
                      size="xs"
                      variant="outline"
                      icon={<FileSearch className="h-3 w-3" />}
                      onClick={() => openDrawer({ kind: 'evidence', id: eid })}
                    >
                      {eid}
                    </Button>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
                  <span className="label-institutional">{t('Update status')}</span>
                  {nextStatuses(expandedAnomaly.status).length === 0 ? (
                    <span className="text-xs text-ink-400">{t('This record has reached a terminal status.')}</span>
                  ) : (
                    nextStatuses(expandedAnomaly.status).map((next) => (
                      <Button
                        key={next}
                        size="xs"
                        variant={next === 'closed' || next === 'reconciled' ? 'positive' : next === 'referred' ? 'critical' : 'primary'}
                        disabled={!mayEditAnomalies}
                        title={
                          mayEditAnomalies
                            ? `Move to ${STATUS_LABEL[next]}`
                            : 'Your role does not hold revenue:edit. This control is disabled by the permission engine.'
                        }
                        onClick={() => setPendingAction({ anomaly: expandedAnomaly, nextStatus: next })}
                      >
                        {t('Move to {0}', STATUS_LABEL[next])}
                      </Button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
            <Card>
              <ChartFrame
                title={t('Target vs realised - by stream')}
                unit={t('₹ crore')}
                timeframe="Phased year-to-date target vs collected"
                description={t('Compares the phased (year-to-date) target, not the full annual target, against actual collection for each stream.')}
                freshness={FRESHNESS}
                height={280}
              >
                <CategoryBarChart
                  data={cityRecords.map((r) => ({
                    label: wardShortNameForStream(r.stream),
                    'Phased target': Math.round(r.targetCrore * FY_ELAPSED_FRACTION * 10) / 10,
                    Collected: r.collectedCrore,
                  }))}
                  categoryKey="label"
                  layout="horizontal"
                  series={[
                    { key: 'Phased target', label: t('Phased target'), colour: '#8195ac' },
                    { key: 'Collected', label: t('Collected'), colour: '#2f6feb' },
                  ]}
                  showLegend
                />
              </ChartFrame>
            </Card>

            <Card>
              <ChartFrame
                title={t('Ranked collection efficiency - all wards')}
                unit="%"
                timeframe="FY 2026–27 to date"
                description={t('Wards ranked from lowest to highest property-tax collection efficiency. Lowest performers are flagged for attention.')}
                freshness={FRESHNESS}
                height={420}
              >
                <RankedBarChart data={rankedWardData} unit="%" higherIsWorse={false} />
              </ChartFrame>
            </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Card>
              <CardHeader title={t('Payer-segment breakdown')} description={t('Assessed value and collection by property use-class segment, city-wide.')} />
              {segmentsQuery.isLoading ? (
                <LoadingState variant="block" className="mt-4" />
              ) : segmentsQuery.error ? (
                <ErrorState detail={segmentsQuery.error.message} onRetry={() => segmentsQuery.refetch()} className="mt-4" />
              ) : (
                <div className="mt-4 space-y-3">
                  <CompositionBar
                    segments={segmentTotals.map((s, i) => ({
                      id: s.id,
                      label: s.label,
                      value: s.collectedCrore,
                      colour: ['#2f6feb', '#0ea5b7', '#f59e0b', '#10b981', '#8195ac'][i % 5] as string,
                    }))}
                  />
                  <ul className="divide-y divide-ink-50">
                    {segmentTotals.map((s) => (
                      <li key={s.id} className="flex items-center justify-between py-1.5 text-xs">
                        <span className="text-ink-600">{s.label}</span>
                        <span className="flex items-center gap-2">
                          <MiniBar value={s.efficiencyPct} width={44} />
                          <span className="numeric w-14 text-right text-ink-500">{formatPercent(s.efficiencyPct)}</span>
                          <span className="numeric w-20 text-right font-semibold text-ink-800">{formatCrore(s.collectedCrore)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
            <Card>
              <ChartFrame
                title={t('Forecast vs annual target - by stream')}
                unit={t('₹ crore')}
                timeframe="FY 2026–27 year-end forecast"
                description={t('Forward-looking: the modelled year-end forecast against the full annual target for each stream.')}
                freshness={FRESHNESS}
                height={260}
              >
                <CategoryBarChart
                  data={forecastVsTargetData}
                  categoryKey="label"
                  series={[
                    { key: 'target', label: t('Annual target'), colour: '#8195ac' },
                    { key: 'forecast', label: t('Forecast year-end'), colour: '#0ea5b7' },
                  ]}
                  showLegend
                />
              </ChartFrame>
            </Card>
          </div>

          <Card tone="warn">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-600">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn-600" />
              {t('Every record in the Anomalies section identifies a statistical pattern that requires assessment. Disposition labels - anomaly, unusual pattern, investigation candidate, reconciliation required - describe the pattern only. They are not, and must never be read as, a finding against any person, officer, contractor or organisation.')}
            </p>
          </Card>
          </div>
          </div>
        </>
      ) : null}

      {!recordsQuery.isLoading && !recordsQuery.error && allRecords.length === 0 ? (
        <EmptyState title={t('No revenue records available')} detail="The revenue service did not return any records for the current scope." />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingAction)}
        onClose={() => setPendingAction(null)}
        onConfirm={(reason) => {
          if (pendingAction) {
            void updateAnomalyStatus(pendingAction.anomaly.id, pendingAction.nextStatus, reason)
          }
        }}
        title={pendingAction ? `Move to ${STATUS_LABEL[pendingAction.nextStatus]}` : 'Update anomaly status'}
        description={
          pendingAction
            ? `"${pendingAction.anomaly.title}" will be moved from ${STATUS_LABEL[pendingAction.anomaly.status]} to ${STATUS_LABEL[pendingAction.nextStatus]}. This action and your reason are written to the permanent audit trail.`
            : undefined
        }
        confirmLabel={pendingAction ? `Move to ${STATUS_LABEL[pendingAction.nextStatus]}` : 'Confirm'}
        intent={pendingAction?.nextStatus === 'referred' ? 'critical' : 'primary'}
        requireReason
      />

      <DemonstrationNotice />
    </PageBody>
  )
}

/** Short chart-axis label for a revenue stream. */
function wardShortNameForStream(stream: RevenueStream): string {
  return REVENUE_STREAM_LABEL[stream]
}

export default RevenueIntelligencePage
