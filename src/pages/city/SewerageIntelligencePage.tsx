import { AlertTriangle, Factory, Waves } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  StateBadge,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { CategoryBarChart, CHART_COLOURS, ChartFrame, MiniBar } from '@/components/charts'
import { CityMap, jitteredWardPoint, type MapMarker } from '@/components/map/CityMap'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { sewerageService, TREATMENT_COMPLIANCE_NORM } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { wardName, wardShortName } from '@/data/reference'
import type { SewerageNode } from '@/types/city-domains'
import type { DataFreshness } from '@/types/common'
import { cn } from '@/utils/cn'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatNumber, formatPercent } from '@/utils/format'
import { t } from '@/i18n'

/**
 * Sewerage Intelligence - built on `sewerageService`, the dedicated
 * sewerage connector. Treatment facilities carry a real discharge-compliance
 * figure; trunk-sewer reaches do not (their compliance field is a fixed
 * zero), so every compliance figure on this page is computed over treatment
 * facilities only - `summary()` already excludes trunk reaches correctly,
 * and the page-level chart/callout below do the same.
 */

const FRESHNESS: DataFreshness = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-210),
  refreshIntervalMinutes: 1440,
  origin: 'demonstration',
  sourceState: 'operational',
  stale: false,
}

function shortNodeLabel(n: SewerageNode): string {
  return n.type === 'treatment-facility' ? n.name.replace(' Sewage Treatment Facility', '') : wardShortName(n.wardId)
}

export function SewerageIntelligencePage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)
  const setFilter = useFilterStore((s) => s.setFilter)

  const summaryQuery = useServiceQuery(queryKeys.water('sewerage-summary'), (u) => sewerageService.summary(u))
  const facilitiesQuery = useServiceQuery(queryKeys.water('sewerage-facilities'), (u) => sewerageService.facilities(u))
  const trunkQuery = useServiceQuery(queryKeys.water('sewerage-trunk'), (u) => sewerageService.trunkNetwork(u))
  const clustersQuery = useServiceQuery(queryKeys.water('sewerage-clusters'), (u) => sewerageService.overflowClusters(u))
  const nodesQuery = useServiceQuery(queryKeys.water('sewerage-nodes'), (u) => sewerageService.nodes(u))

  const breadcrumbs = [{ label: t('City Intelligence') }, { label: t('Sewerage Intelligence') }]

  if (summaryQuery.isLoading || facilitiesQuery.isLoading || trunkQuery.isLoading || clustersQuery.isLoading || nodesQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={t('Sewerage Intelligence')} breadcrumbs={breadcrumbs} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }

  const anyError = summaryQuery.error ?? facilitiesQuery.error ?? trunkQuery.error ?? clustersQuery.error ?? nodesQuery.error
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={t('Sewerage Intelligence')} breadcrumbs={breadcrumbs} />
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void summaryQuery.refetch()
            void facilitiesQuery.refetch()
            void trunkQuery.refetch()
            void clustersQuery.refetch()
            void nodesQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const summary = summaryQuery.data
  const facilities = facilitiesQuery.data ?? []
  const trunkNodes = trunkQuery.data ?? []
  const clusters = clustersQuery.data ?? []
  const allNodes = nodesQuery.data ?? []

  if (!summary || (facilities.length === 0 && trunkNodes.length === 0)) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={t('Sewerage Intelligence')} breadcrumbs={breadcrumbs} />
        <EmptyState title={t('No sewerage network data available')} detail="No treatment facility or trunk-sewer records were returned for the current scope." />
        <DemonstrationNotice />
      </PageBody>
    )
  }

  const facilitiesBelowNorm = facilities.filter((f) => f.treatmentCompliancePct < TREATMENT_COMPLIANCE_NORM)

  const filteredFacilities = facilities.filter((n) => {
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(n.wardId)) return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      if (!n.name.toLowerCase().includes(q) && !wardName(n.wardId).toLowerCase().includes(q)) return false
    }
    return true
  })
  const filteredTrunk = trunkNodes.filter((n) => {
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(n.wardId)) return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      if (!n.name.toLowerCase().includes(q) && !wardName(n.wardId).toLowerCase().includes(q)) return false
    }
    return true
  })
  const filteredClusters = clusters.filter((c) => filters.wardIds.length === 0 || filters.wardIds.includes(c.wardId))

  // --- Map --------------------------------------------------------------
  const utilisationByWard = new Map<string, number[]>()
  for (const n of allNodes) {
    const list = utilisationByWard.get(n.wardId) ?? []
    list.push(n.utilisationPct)
    utilisationByWard.set(n.wardId, list)
  }
  const average = (values: number[] | undefined): number | undefined =>
    values && values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined

  const wardMarkerIndex = new Map<string, number>()
  const facilityMarkers: MapMarker[] = facilities.map((f) => {
    const idx = wardMarkerIndex.get(f.wardId) ?? 0
    wardMarkerIndex.set(f.wardId, idx + 1)
    const point = jitteredWardPoint(f.wardId, idx)
    return {
      id: f.id,
      x: point.x,
      y: point.y,
      label: f.name,
      detail: t('{0}% utilisation · {1}% compliance · {2}', formatNumber(f.utilisationPct, 0), formatNumber(f.treatmentCompliancePct, 0), wardName(f.wardId)),
      kind: 'facility',
    }
  })

  // --- Charts -------------------------------------------------------------
  const utilisationChartData = [...allNodes]
    .sort((a, b) => b.utilisationPct - a.utilisationPct)
    .map((n) => ({ label: shortNodeLabel(n), value: Math.round(n.utilisationPct * 10) / 10 }))

  const complianceChartData = [...facilities]
    .sort((a, b) => a.treatmentCompliancePct - b.treatmentCompliancePct)
    .map((f) => ({ label: shortNodeLabel(f), value: f.treatmentCompliancePct }))

  // --- Columns --------------------------------------------------------------
  const facilityColumns: Array<Column<SewerageNode>> = [
    { id: 'name', header: t('Facility'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name, width: '15rem' },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'capacity', header: t('Design capacity'), cell: (r) => `${formatNumber(r.designCapacityMld, 0)} MLD`, sortValue: (r) => r.designCapacityMld, align: 'right', hideBelow: 'md' },
    { id: 'load', header: t('Current load'), cell: (r) => `${formatNumber(r.currentLoadMld, 0)} MLD`, sortValue: (r) => r.currentLoadMld, align: 'right' },
    {
      id: 'utilisation',
      header: t('Utilisation'),
      cell: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <span className={cn('numeric text-xs font-semibold', r.utilisationPct > 100 ? 'text-crit-600' : 'text-ink-700')}>{formatNumber(r.utilisationPct, 0)}%</span>
          {r.utilisationPct > 100 ? <Badge tone="critical">{t('Over capacity')}</Badge> : null}
        </div>
      ),
      sortValue: (r) => r.utilisationPct,
      align: 'right',
    },
    {
      id: 'compliance',
      header: t('Compliance'),
      cell: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <span className={cn('numeric text-xs font-semibold', r.treatmentCompliancePct < TREATMENT_COMPLIANCE_NORM ? 'text-crit-600' : 'text-ink-700')}>
            {formatNumber(r.treatmentCompliancePct, 0)}%
          </span>
          {r.treatmentCompliancePct < TREATMENT_COMPLIANCE_NORM ? <Badge tone="critical">{t('Below norm')}</Badge> : null}
        </div>
      ),
      sortValue: (r) => r.treatmentCompliancePct,
      align: 'right',
    },
    {
      id: 'condition',
      header: t('Condition index'),
      cell: (r) => (
        <div className="flex items-center gap-2">
          <MiniBar value={r.conditionIndex} />
          <span className="numeric text-xs font-semibold text-ink-700">{r.conditionIndex}</span>
        </div>
      ),
      sortValue: (r) => r.conditionIndex,
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  const trunkColumns: Array<Column<SewerageNode>> = [
    {
      id: 'ward',
      header: t('Ward'),
      cell: (r) => <span className="font-medium text-ink-900">{wardName(r.wardId)}</span>,
      sortValue: (r) => wardName(r.wardId),
      searchValue: (r) => wardName(r.wardId),
      width: '14rem',
    },
    { id: 'name', header: t('Reach'), cell: (r) => r.name, sortValue: (r) => r.name, hideBelow: 'md' },
    {
      id: 'utilisation',
      header: t('Utilisation'),
      cell: (r) => (
        <div className="flex items-center gap-2">
          <MiniBar value={Math.min(100, r.utilisationPct)} />
          <span className="numeric text-xs font-semibold text-ink-700">{formatNumber(r.utilisationPct, 0)}%</span>
        </div>
      ),
      sortValue: (r) => r.utilisationPct,
    },
    { id: 'blockages', header: t('Blockages (30d)'), cell: (r) => r.blockages30d, sortValue: (r) => r.blockages30d, align: 'right' },
    {
      id: 'overflow',
      header: t('Overflow events (30d)'),
      cell: (r) => (r.overflowEvents30d > 0 ? <Badge tone="critical">{r.overflowEvents30d}</Badge> : <span className="text-ink-300">0</span>),
      sortValue: (r) => r.overflowEvents30d,
    },
    {
      id: 'condition',
      header: t('Condition index'),
      cell: (r) => (
        <div className="flex items-center gap-2">
          <MiniBar value={r.conditionIndex} />
          <span className="numeric text-xs font-semibold text-ink-700">{r.conditionIndex}</span>
        </div>
      ),
      sortValue: (r) => r.conditionIndex,
      hideBelow: 'lg',
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        title={t('Sewerage Intelligence')}
        description={t('Treatment facility capacity, loading and discharge compliance, trunk-sewer network condition by ward, and the wards where overflow events concentrate.')}
        breadcrumbs={breadcrumbs}
        freshness={FRESHNESS}
        controls={<FilterBar show={['ward', 'search']} searchPlaceholder="Search facility, reach or ward" />}
      />

      <MetricGrid columns={4}>
        <MetricCard label={t('Design capacity')} value={formatNumber(summary.designCapacityMld, 0)} unit="MLD" icon={<Waves className="h-4 w-4" />} />
        <MetricCard
          label={t('Current load')}
          value={formatNumber(summary.currentLoadMld, 0)}
          unit="MLD"
          support={summary.designCapacityMld > 0 ? `${formatPercent((summary.currentLoadMld / summary.designCapacityMld) * 100, 0)} of design capacity` : undefined}
        />
        <MetricCard label={t('Mean utilisation')} value={formatPercent(summary.meanUtilisationPct, 0)} tone={summary.meanUtilisationPct > 100 ? 'critical' : summary.meanUtilisationPct > 90 ? 'warn' : 'default'} />
        <MetricCard
          label={t('Treatment compliance')}
          value={formatPercent(summary.meanTreatmentCompliancePct, 0)}
          support={t('Against {0}% discharge norm', TREATMENT_COMPLIANCE_NORM)}
          tone={summary.meanTreatmentCompliancePct < TREATMENT_COMPLIANCE_NORM ? 'critical' : 'positive'}
        />
        <MetricCard
          label={t('Facilities over capacity')}
          value={summary.facilitiesOverCapacity}
          support={t('of {0} treatment facilities', facilities.length)}
          tone={summary.facilitiesOverCapacity > 0 ? 'critical' : 'default'}
          icon={<Factory className="h-4 w-4" />}
        />
        <MetricCard label={t('Blockages (30d)')} value={summary.blockages30d} tone={summary.blockages30d > 0 ? 'warn' : 'default'} />
        <MetricCard label={t('Overflow events (30d)')} value={summary.overflowEvents30d} tone={summary.overflowEvents30d > 0 ? 'critical' : 'default'} />
        <MetricCard label={t('Nodes requiring attention')} value={summary.nodesRequiringAttention} support={t('At-risk or critical state')} tone={summary.nodesRequiringAttention > 0 ? 'warn' : 'default'} />
      </MetricGrid>

      <Card flush>
        <CardHeader className="px-4 pt-4 pb-3" title={t('Treatment facility register')} description={t('Facilities over capacity and compliance below the discharge norm are flagged directly.')} />
        {filteredFacilities.length === 0 ? (
          <EmptyState className="m-4" title={t('No facilities match the current filters')} detail="Adjust the ward or search term above." />
        ) : (
          <DataTable
            rows={filteredFacilities}
            columns={facilityColumns}
            rowKey={(r) => r.id}
            pageSize={10}
            searchable={false}
            initialSort={{ columnId: 'utilisation', direction: 'desc' }}
            ariaLabel="Treatment facility register"
          />
        )}
      </Card>

      {facilitiesBelowNorm.length > 0 ? (
        <Card tone="critical" className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-crit-600" aria-hidden />
          <p className="text-xs leading-relaxed text-ink-700">
            <span className="font-semibold">{t('Compliance shortfall.')}</span> {facilitiesBelowNorm.length} of {facilities.length}{' '}{t('treatment facilit')}{facilitiesBelowNorm.length === 1 ? 'y' : 'ies'}{' '}{t('currently read below the')}{' '}{TREATMENT_COMPLIANCE_NORM}{t('% discharge-compliance norm:')}{' '}{facilitiesBelowNorm.map((f) => shortNodeLabel(f)).join(', ')}{t('. This is a compliance shortfall against the departmental norm, not a data anomaly, and is stated here without qualification.')}
          </p>
        </Card>
      ) : null}

      <Card flush>
        <CardHeader className="px-4 pt-4 pb-3" title={t('Ward trunk-network position')} description={t('Trunk-sewer reach condition, loading and blockage/overflow volume - one reach per ward.')} />
        {filteredTrunk.length === 0 ? (
          <EmptyState className="m-4" title={t('No trunk reaches match the current filters')} detail="Adjust the ward or search term above." />
        ) : (
          <DataTable
            rows={filteredTrunk}
            columns={trunkColumns}
            rowKey={(r) => r.id}
            pageSize={10}
            searchable={false}
            initialSort={{ columnId: 'overflow', direction: 'desc' }}
            ariaLabel="Ward trunk-network position"
          />
        )}
      </Card>

      <Card flush>
        <CardHeader
          className="px-4 pt-4 pb-3"
          title={t('Overflow-event concentration')}
          description={t('Wards ranked by overflow events in the last 30 days. A structural pattern - repeat events across fixed nodes - is distinguished from volume handled by routine maintenance.')}
        />
        {filteredClusters.length === 0 ? (
          <EmptyState compact className="m-4" title={t('No overflow events in scope')} detail="No ward in the current filter reports an overflow event in the last 30 days." />
        ) : (
          <ul className="divide-y divide-ink-50">
            {filteredClusters.map((c) => (
              <li key={c.wardId} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-800">{wardName(c.wardId)}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={c.structuralPattern ? 'critical' : 'neutral'}>{c.structuralPattern ? 'Structural pattern' : 'Routine maintenance volume'}</Badge>
                    <Badge tone="muted">{t('{0} overflow event(s)', c.overflowEvents30d)}</Badge>
                    <Badge tone="muted">{t('{0} blockage(s)', c.blockages30d)}</Badge>
                    <Badge tone="muted">{t('Condition {0}', c.meanConditionIndex)}</Badge>
                  </span>
                </div>
                <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-600">{c.note}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={t('Network map')} description={t('Sewerage-load layer (mean node utilisation by ward) with treatment-facility markers. Click a ward to focus the filter above.')} />
        <div className="mt-3">
          <CityMap
            layers={[
              {
                id: 'sewerage-load',
                label: t('Sewerage Network Load'),
                valueFor: (wardId) => average(utilisationByWard.get(wardId)),
                higherIsWorse: true,
                unit: '% utilisation',
                description: t('Mean utilisation across treatment and trunk nodes located in the ward.'),
              },
            ]}
            markers={facilityMarkers}
            selectedWardId={filters.wardIds.length === 1 ? filters.wardIds[0] : null}
            onWardSelect={(wardId) => setFilter('wardIds', filters.wardIds.length === 1 && filters.wardIds[0] === wardId ? [] : [wardId])}
            height={400}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <ChartFrame
            title={t('Utilisation distribution')}
            unit={t('% of design capacity')}
            timeframe="Current reporting position"
            description={t('Every treatment facility and trunk-sewer reach ranked by utilisation. Nodes above the 100% reference line are running above design capacity.')}
            height={Math.max(320, utilisationChartData.length * 11)}
          >
            <CategoryBarChart
              data={utilisationChartData}
              categoryKey="label"
              layout="horizontal"
              series={[{ key: 'value', label: t('Utilisation %'), colour: CHART_COLOURS.primary }]}
              referenceValue={100}
              referenceLabel="Design capacity"
            />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame
            title={t('Treatment compliance against the discharge norm')}
            unit={t('% compliant')}
            timeframe="Current reporting position"
            description={t('Treatment facilities only - trunk reaches carry no compliance figure. Ranked from lowest to highest against the departmental norm.')}
            height={260}
            footnote={
              facilitiesBelowNorm.length > 0
                ? `${facilitiesBelowNorm.length} of ${facilities.length} facilit${facilitiesBelowNorm.length === 1 ? 'y' : 'ies'} read below the ${TREATMENT_COMPLIANCE_NORM}% norm: ${facilitiesBelowNorm.map((f) => shortNodeLabel(f)).join(', ')}.`
                : `All ${facilities.length} treatment facilities meet or exceed the ${TREATMENT_COMPLIANCE_NORM}% norm.`
            }
          >
            <CategoryBarChart
              data={complianceChartData}
              categoryKey="label"
              layout="horizontal"
              series={[{ key: 'value', label: t('Compliance %'), colour: CHART_COLOURS.intel }]}
              referenceValue={TREATMENT_COMPLIANCE_NORM}
              referenceLabel={`${TREATMENT_COMPLIANCE_NORM}% norm`}
            />
          </ChartFrame>
        </Card>
      </div>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default SewerageIntelligencePage
