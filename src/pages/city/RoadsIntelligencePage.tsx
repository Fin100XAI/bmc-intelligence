import { useState } from 'react'
import { Hammer, ShieldAlert, Wrench } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  Select,
  ObservationSourceBadge,
  SeverityBadge,
  toneForScore,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { CHART_COLOURS, CompositionBar, ContributionBars, MiniBar } from '@/components/charts'
import { CityMap, jitteredWardPoint, type MapMarker } from '@/components/map/CityMap'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { roadsService } from '@/services'
import {
  defectPriorityBands,
  defectStatusDistribution,
  PRIORITY_ENGINE_STATEMENT,
  ROAD_PRIORITY_LABELS,
  ROAD_PRIORITY_WEIGHTS,
  rankedDefects,
} from '@/domains'
import { allowed } from '@/security'
import { useCurrentUser } from '@/stores/auth.store'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardName } from '@/data/reference'
import type { RoadDefect, RoadSegment } from '@/types/city-domains'
import type { DataFreshness } from '@/types/common'
import { cn } from '@/utils/cn'
import { DEMO_NOW, isoFromAnchor } from '@/utils/deterministic'
import { formatDate, formatNumber, formatRelative } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Roads Intelligence - flagship module.
 *
 * Centrepiece: the Road Defect Priority Engine. Rectification capacity is
 * constrained; the engine directs it strictly by a published, weighted
 * score so the ordering can be defended and explained, ward by ward.
 */

const CONDITION_THRESHOLD = 50
const EMERGENCY_CONDITION_MINIMUM = 60

const STATUS_PIPELINE: Array<RoadDefect['status']> = ['reported', 'verified', 'work-order-issued', 'in-repair', 'repaired', 'verified-closed']
function build$STATUS_LABEL(): Record<RoadDefect['status'], string> {
  return {
  reported: t('Reported'),
  verified: t('Verified'),
  'work-order-issued': t('Work Order Issued'),
  'in-repair': t('In Repair'),
  repaired: t('Repaired'),
  'verified-closed': t('Verified Closed'),
}
}
let STATUS_LABEL: Record<RoadDefect['status'], string> = build$STATUS_LABEL()
registerLayer(() => {
  STATUS_LABEL = build$STATUS_LABEL()
})
function build$DEFECT_TYPE_LABEL(): Record<RoadDefect['type'], string> {
  return {
  pothole: t('Pothole'),
  crack: t('Crack'),
  depression: t('Depression'),
  'edge-failure': t('Edge Failure'),
  'utility-cut': t('Utility Cut'),
  manhole: t('Manhole'),
}
}
let DEFECT_TYPE_LABEL: Record<RoadDefect['type'], string> = build$DEFECT_TYPE_LABEL()
registerLayer(() => {
  DEFECT_TYPE_LABEL = build$DEFECT_TYPE_LABEL()
})
const DEFECT_TYPES = Object.keys(DEFECT_TYPE_LABEL) as Array<RoadDefect['type']>
function build$SURFACE_LABEL(): Record<RoadSegment['surface'], string> {
  return {
  asphalt: t('Asphalt'),
  concrete: t('Concrete'),
  'paver-block': t('Paver Block'),
  mastic: t('Mastic'),
}
}
let SURFACE_LABEL: Record<RoadSegment['surface'], string> = build$SURFACE_LABEL()
registerLayer(() => {
  SURFACE_LABEL = build$SURFACE_LABEL()
})
const RESURFACING_CYCLE_YEARS: Record<RoadSegment['surface'], number> = {
  asphalt: 6,
  concrete: 15,
  'paver-block': 10,
  mastic: 8,
}

function nextDefectStatus(status: RoadDefect['status']): RoadDefect['status'] | null {
  const idx = STATUS_PIPELINE.indexOf(status)
  if (idx === -1 || idx === STATUS_PIPELINE.length - 1) return null
  return STATUS_PIPELINE[idx + 1] ?? null
}

const PIPELINE_COLOUR: Record<RoadDefect['status'], string> = {
  reported: CHART_COLOURS.risk,
  verified: CHART_COLOURS.warn,
  'work-order-issued': CHART_COLOURS.primary,
  'in-repair': CHART_COLOURS.intel,
  repaired: CHART_COLOURS.positive,
  'verified-closed': CHART_COLOURS.neutral,
}

const BAND_COLOUR: Record<'critical' | 'risk' | 'warn' | 'info', string> = {
  critical: CHART_COLOURS.critical,
  risk: CHART_COLOURS.risk,
  warn: CHART_COLOURS.warn,
  info: CHART_COLOURS.primary,
}

const FRESHNESS: DataFreshness = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-160),
  refreshIntervalMinutes: 360,
  origin: 'demonstration',
  sourceState: 'operational',
  stale: false,
}

export function RoadsIntelligencePage(): React.JSX.Element {
  const user = useCurrentUser()
  const filters = useFilterStore((s) => s.filters)
  const setFilter = useFilterStore((s) => s.setFilter)
  const [selectedDefectId, setSelectedDefectId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | RoadDefect['type']>('all')
  const [emergencyOnly, setEmergencyOnly] = useState(false)
  const [pendingStatusChange, setPendingStatusChange] = useState<{ defect: RoadDefect; next: RoadDefect['status'] } | null>(null)

  usePageMasthead(
    t('Roads Intelligence'),
    t('Network condition and the explainable Road Defect Priority Engine that directs constrained rectification capacity, together with the asset-lifecycle position behind the resurfacing programme.'),
  )

  const segmentsQuery = useServiceQuery(queryKeys.roads('segments'), (u) => roadsService.segments(u))
  const defectsQuery = useServiceQuery(queryKeys.roads('defects'), (u) => roadsService.defects(u, {}))

  const updateDefectStatus = useServiceAction(
    (u, id: string, status: RoadDefect['status'], reason: string) => roadsService.updateDefectStatus(u, id, status, reason),
    [queryKeys.roads('defects')],
  )

  const breadcrumbs = [{ label: t('City Intelligence') }, { label: t('Roads Intelligence') }]

  if (segmentsQuery.isLoading || defectsQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={breadcrumbs} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={10} />
      </PageBody>
    )
  }

  const anyError = segmentsQuery.error ?? defectsQuery.error
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={breadcrumbs} />
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void segmentsQuery.refetch()
            void defectsQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const segments = segmentsQuery.data ?? []
  const defects = defectsQuery.data ?? []

  if (segments.length === 0) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={breadcrumbs} />
        <EmptyState title={t('No road network data available')} detail="No segment records were returned for the current scope." />
        <DemonstrationNotice />
      </PageBody>
    )
  }

  const segmentById = new Map(segments.map((s) => [s.id, s]))
  const bandWardId = filters.wardIds.length === 1 ? filters.wardIds[0] : undefined

  // --- Segment table --------------------------------------------------------
  const filteredSegments = segments.filter((s) => {
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(s.wardId)) return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      if (!s.name.toLowerCase().includes(q) && !wardName(s.wardId).toLowerCase().includes(q)) return false
    }
    return true
  })

  /**
   * The network summary describes the network IN SCOPE, so it is computed after
   * the filter rather than before it. Computed before, a ward selection left
   * "Network length" reporting the corporation's whole carriageway and "Segments
   * below threshold" counting defects in wards the operator had just filtered
   * out - the tiles and the table underneath them disagreed about which city
   * they were describing.
   */
  // --- Network summary ----------------------------------------------------
  const wardScopedDefects = defects.filter(
    (d) => filters.wardIds.length === 0 || filters.wardIds.includes(d.wardId),
  )
  const totalLengthKm = filteredSegments.reduce((s, x) => s + x.lengthKm, 0)
  const avgCondition =
    filteredSegments.length > 0 ? filteredSegments.reduce((s, x) => s + x.conditionIndex, 0) / filteredSegments.length : 0
  const belowThreshold = filteredSegments.filter((s) => s.conditionIndex < CONDITION_THRESHOLD)
  const openDefectsCount = wardScopedDefects.filter((d) => d.status !== 'repaired' && d.status !== 'verified-closed').length
  const emergencyBelowMinimum = filteredSegments.filter((s) => s.emergencyRoute && s.conditionIndex < EMERGENCY_CONDITION_MINIMUM)
  const complaints90d = filteredSegments.reduce((s, x) => s + x.complaints90d, 0)

  // --- Defect register (filtered) -------------------------------------------
  const filteredDefects = defects.filter((d) => {
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(d.wardId)) return false
    if (typeFilter !== 'all' && d.type !== typeFilter) return false
    if (filters.statuses.length > 0 && !filters.statuses.includes(d.status)) return false
    if (emergencyOnly && !segmentById.get(d.segmentId)?.emergencyRoute) return false
    return true
  })

  const rankedForBand = rankedDefects(20, bandWardId)
  const bands = defectPriorityBands(bandWardId)
  const pipeline = defectStatusDistribution(bandWardId)

  const weightItems = (Object.keys(ROAD_PRIORITY_WEIGHTS) as Array<keyof typeof ROAD_PRIORITY_WEIGHTS>).map((key) => ({
    id: key,
    label: ROAD_PRIORITY_LABELS[key],
    weight: ROAD_PRIORITY_WEIGHTS[key],
    contribution: Math.round(ROAD_PRIORITY_WEIGHTS[key] * 1000) / 10,
    rawScore: Math.round(ROAD_PRIORITY_WEIGHTS[key] * 100),
    explanation: `Weighted at ${(ROAD_PRIORITY_WEIGHTS[key] * 100).toFixed(0)}% of every open defect's published priority score.`,
  }))

  const selectedDefect = defects.find((d) => d.id === selectedDefectId) ?? null
  const selectedSegment = selectedDefect ? segmentById.get(selectedDefect.segmentId) : undefined

  // --- Map -------------------------------------------------------------------
  const conditionByWard = new Map<string, number[]>()
  for (const s of segments) {
    const list = conditionByWard.get(s.wardId) ?? []
    list.push(s.conditionIndex)
    conditionByWard.set(s.wardId, list)
  }
  const average = (values: number[] | undefined): number | undefined =>
    values && values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined

  const markerSource =
    filteredDefects.length > 150 ? [...filteredDefects].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 150) : filteredDefects
  const wardMarkerIndex = new Map<string, number>()
  const defectMarkers: MapMarker[] = markerSource.map((d) => {
    const idx = wardMarkerIndex.get(d.wardId) ?? 0
    wardMarkerIndex.set(d.wardId, idx + 1)
    const point = jitteredWardPoint(d.wardId, idx)
    return {
      id: d.id,
      x: point.x,
      y: point.y,
      label: t('{0} - priority {1}', DEFECT_TYPE_LABEL[d.type], d.priorityScore),
      detail: `${wardName(d.wardId)} · ${STATUS_LABEL[d.status]}`,
      kind: 'defect',
      severity: d.severity,
      onClick: () => setSelectedDefectId(d.id),
    }
  })

  // --- Resurfacing / asset lifecycle -----------------------------------------
  const currentYear = DEMO_NOW.getFullYear()
  const overdueSegments = segments
    .map((s) => {
      const cycle = RESURFACING_CYCLE_YEARS[s.surface]
      const yearsSince = currentYear - s.lastResurfacedYear
      return { segment: s, yearsSince, overdueBy: yearsSince - cycle }
    })
    .filter((r) => r.overdueBy > 0)
    .sort((a, b) => b.overdueBy - a.overdueBy)

  // --- Columns -----------------------------------------------------------------
  const segmentColumns: Array<Column<RoadSegment>> = [
    { id: 'name', header: t('Segment'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name, width: '14rem' },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'length', header: t('Length'), cell: (r) => `${formatNumber(r.lengthKm, 2)} km`, sortValue: (r) => r.lengthKm, align: 'right', hideBelow: 'lg' },
    { id: 'surface', header: t('Surface'), cell: (r) => <Badge tone="neutral">{SURFACE_LABEL[r.surface]}</Badge>, sortValue: (r) => r.surface, hideBelow: 'md' },
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
    { id: 'resurfaced', header: t('Last resurfaced'), cell: (r) => r.lastResurfacedYear, sortValue: (r) => r.lastResurfacedYear, align: 'right', hideBelow: 'lg' },
    { id: 'traffic', header: t('Traffic'), cell: (r) => `${formatNumber(r.trafficPcu)} PCU`, sortValue: (r) => r.trafficPcu, align: 'right', hideBelow: 'xl' },
    {
      id: 'access',
      header: t('Access'),
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.emergencyRoute ? <Badge tone="critical">{t('Emergency')}</Badge> : null}
          {r.hospitalAccess ? <Badge tone="warn">{t('Hospital')}</Badge> : null}
          {r.schoolAccess ? <Badge tone="info">{t('School')}</Badge> : null}
          {!r.emergencyRoute && !r.hospitalAccess && !r.schoolAccess ? <span className="text-ink-300">-</span> : null}
        </div>
      ),
      sortValue: (r) => (r.emergencyRoute ? 2 : 0) + (r.hospitalAccess ? 1 : 0),
    },
    { id: 'openDefects', header: t('Open defects'), cell: (r) => r.openDefects, sortValue: (r) => r.openDefects, align: 'right' },
    { id: 'repeats', header: t('Repeat failures'), cell: (r) => r.repeatFailures, sortValue: (r) => r.repeatFailures, align: 'right', hideBelow: 'lg' },
    { id: 'contractor', header: t('Contractor'), cell: (r) => r.contractorId ?? <span className="text-ink-300">{t('Unassigned')}</span>, sortValue: (r) => r.contractorId ?? '', hideBelow: 'xl' },
    { id: 'closure', header: t('Closure planned'), cell: (r) => (r.closurePlanned ? <Badge tone="warn">{t('Planned')}</Badge> : <span className="text-ink-300">{t('No')}</span>), sortValue: (r) => (r.closurePlanned ? 1 : 0) },
  ]

  const defectColumns: Array<Column<RoadDefect>> = [
    {
      id: 'type',
      header: t('Type'),
      cell: (r) => <span className="font-medium text-ink-900">{DEFECT_TYPE_LABEL[r.type]}</span>,
      sortValue: (r) => DEFECT_TYPE_LABEL[r.type],
      searchValue: (r) => `${DEFECT_TYPE_LABEL[r.type]} ${wardName(r.wardId)}`,
    },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'segment', header: t('Segment'), cell: (r) => segmentById.get(r.segmentId)?.name ?? r.segmentId, sortValue: (r) => segmentById.get(r.segmentId)?.name ?? '', hideBelow: 'lg' },
    { id: 'priority', header: t('Priority score'), cell: (r) => <Badge tone={toneForScore(r.priorityScore, false)}>{r.priorityScore}/100</Badge>, sortValue: (r) => r.priorityScore },
    { id: 'severity', header: t('Severity'), cell: (r) => <SeverityBadge severity={r.severity} />, sortValue: (r) => r.severity, hideBelow: 'md' },
    { id: 'status', header: t('Status'), cell: (r) => <Badge tone="neutral">{STATUS_LABEL[r.status]}</Badge>, sortValue: (r) => r.status },
    { id: 'complaints', header: t('Complaints'), cell: (r) => r.complaintCount, sortValue: (r) => r.complaintCount, align: 'right', hideBelow: 'lg' },
    {
      id: 'detected',
      header: t('How detected'),
      cell: (r) => <ObservationSourceBadge provenance={r.provenance} />,
      sortValue: (r) => r.provenance.detectedBy,
      hideBelow: 'lg',
    },
    { id: 'reported', header: t('Reported'), cell: (r) => formatRelative(r.reportedAt), sortValue: (r) => r.reportedAt, hideBelow: 'xl' },
    { id: 'target', header: t('Target repair date'), cell: (r) => formatDate(r.targetRepairDate), sortValue: (r) => r.targetRepairDate, hideBelow: 'lg' },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={breadcrumbs}
        freshness={FRESHNESS}
        controls={
          <FilterBar
            show={['ward', 'status', 'search']}
            statusOptions={STATUS_PIPELINE.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            searchPlaceholder="Search segment or ward"
          />
        }
      />

      <MetricGrid columns={6}>
        <MetricCard label={t('Network length')} value={formatNumber(totalLengthKm, 0)} unit="km" support={`${filteredSegments.length} segments`} />
        <MetricCard label={t('Average condition index')} value={Math.round(avgCondition)} unit="/100" tone={avgCondition < CONDITION_THRESHOLD ? 'critical' : avgCondition < 65 ? 'warn' : 'positive'} />
        <MetricCard label={t('Segments below threshold')} value={belowThreshold.length} support={t('of {0}, below {1}/100', filteredSegments.length, CONDITION_THRESHOLD)} tone={belowThreshold.length > 0 ? 'critical' : 'default'} />
        <MetricCard label={t('Open defects')} value={openDefectsCount} support={t('of {0} recorded', defects.length)} tone={openDefectsCount > 0 ? 'warn' : 'default'} />
        <MetricCard label={t('Emergency corridors below minimum')} value={emergencyBelowMinimum.length} support={t('Condition below {0}/100', EMERGENCY_CONDITION_MINIMUM)} tone={emergencyBelowMinimum.length > 0 ? 'critical' : 'default'} />
        <MetricCard label={t('Complaints (90d)')} value={formatNumber(complaints90d)} />
      </MetricGrid>

      {/* Two columns, read downward. The registers and the map an engineer
          works from carry the width; the published weights that order the
          queue, the driver breakdown for the defect currently open, and the
          band and pipeline composition read down the column beside them —
          the explanation next to the work rather than above it. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
        <Card flush>
            <CardHeader className="px-4 pt-4 pb-3" title={t('Road segment register')} description={t('Selecting a segment focuses the ward filter across the rest of this page.')} />
          {filteredSegments.length === 0 ? (
            <EmptyState className="m-4" title={t('No segments match the current filters')} detail="Adjust the ward or search term above." />
          ) : (
            <DataTable
              rows={filteredSegments}
              columns={segmentColumns}
              rowKey={(r) => r.id}
              pageSize={10}
              searchable={false}
              onRowClick={(r) => setFilter('wardIds', filters.wardIds.length === 1 && filters.wardIds[0] === r.wardId ? [] : [r.wardId])}
              initialSort={{ columnId: 'condition', direction: 'asc' }}
              ariaLabel="Road segment register"
            />
          )}
        </Card>

        <Card flush>
          <CardHeader
            className="px-4 pt-4 pb-3"
            title={t('Priority queue - top ranked defects')}
            description={t('Highest-priority open defects by published score, {0}. Excludes repaired and verified-closed defects.', bandWardId ? wardName(bandWardId) : 'city-wide')}
          />
          {rankedForBand.length === 0 ? (
            <EmptyState className="m-4" compact title={t('No open defects in the priority queue')} detail="Every defect in this scope has been repaired or verified closed." />
          ) : (
            <ol className="divide-y divide-ink-50">
              {rankedForBand.slice(0, 8).map((d, i) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedDefectId(d.id === selectedDefectId ? null : d.id)}
                    className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-govt-50/50', d.id === selectedDefectId && 'bg-govt-50')}
                  >
                    <span className="numeric w-5 shrink-0 text-xs font-semibold text-ink-400">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-800">
                      {DEFECT_TYPE_LABEL[d.type]} · {segmentById.get(d.segmentId)?.name ?? d.segmentId}
                    </span>
                    <span className="shrink-0 text-[0.6875rem] text-ink-400">{wardName(d.wardId)}</span>
                    <Badge tone={toneForScore(d.priorityScore, false)} className="shrink-0">
                      {d.priorityScore}/100
                    </Badge>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card flush>
          <CardHeader
            className="px-4 pt-4 pb-3"
            title={t('Defect register')}
            description={t('Ranked by priority score. Select a row to inspect its driver breakdown.')}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as 'all' | RoadDefect['type'])}
                  className="w-auto min-w-[9.5rem]"
                  options={[{ value: 'all', label: t('All defect types') }, ...DEFECT_TYPES.map((entry) => ({ value: entry, label: DEFECT_TYPE_LABEL[entry] }))]}
                  aria-label={t('Filter by defect type')}
                />
                <Checkbox checked={emergencyOnly} onChange={setEmergencyOnly} label={t('Emergency route only')} />
              </div>
            }
          />
          {filteredDefects.length === 0 ? (
            <EmptyState className="m-4" title={t('No defects match the current filters')} detail="Adjust the ward, type, status or emergency-route filter above." />
          ) : (
            <DataTable
              rows={filteredDefects}
              columns={defectColumns}
              rowKey={(r) => r.id}
              pageSize={10}
              searchable={false}
              onRowClick={(r) => setSelectedDefectId(r.id === selectedDefectId ? null : r.id)}
              activeRowKey={selectedDefectId ?? undefined}
              initialSort={{ columnId: 'priority', direction: 'desc' }}
              ariaLabel="Road defect register"
            />
          )}
        </Card>

        <Card>
          <CardHeader title={t('Network map')} description={t('Road-condition layer with defect markers. Click a marker to inspect its driver breakdown.')} />
          <div className="mt-3">
            <CityMap
              layers={[
                {
                  id: 'condition',
                  label: t('Road Condition Index'),
                  valueFor: (wardId) => average(conditionByWard.get(wardId)),
                  higherIsWorse: false,
                  unit: '/100 condition',
                  description: t('Average pavement condition index of segments mapped in the ward.'),
                },
              ]}
              markers={defectMarkers}
              height={420}
            />
          </div>
          {filteredDefects.length > markerSource.length ? (
            <p className="mt-2 text-[0.6875rem] text-ink-400">
              {t('Showing the {0} highest-priority markers of {1} defects in the current filter.', markerSource.length, filteredDefects.length)}
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            icon={<Hammer className="h-4 w-4" />}
            title={t('Resurfacing schedule - asset lifecycle position')}
            description={t('Segments overdue against an indicative departmental resurfacing cycle by surface type (asphalt 6 years, paver block 10 years, mastic 8 years, concrete 15 years), used here for planning purposes only.')}
          />
          {overdueSegments.length === 0 ? (
            <EmptyState compact className="mt-3" title={t('No segment overdue against its indicative cycle')} detail="Every segment has been resurfaced within its indicative surface-type cycle." />
          ) : (
            <ul className="mt-3 divide-y divide-ink-50">
              {overdueSegments.slice(0, 12).map((r) => (
                <li key={r.segment.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-xs font-medium text-ink-800">
                    {r.segment.name} <span className="font-normal text-ink-500">· {wardName(r.segment.wardId)} · {SURFACE_LABEL[r.segment.surface]}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Badge tone="muted">{t('Resurfaced {0}', r.segment.lastResurfacedYear)}</Badge>
                    <Badge tone="warn">{t('{0} yr overdue', r.overdueBy)}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          {/* --- Road Defect Priority Engine --------------------------------- */}
          <Card tone="info">
            <CardHeader
              icon={<Wrench className="h-4 w-4" />}
              title={t('Road Defect Priority Engine')}
              description={t('Constrained rectification capacity is directed strictly by a published, weighted score. The ordering is transparent so it can be defended, and so a ward receiving no treatment in a given window can be shown why.')}
            />
            <blockquote className="mt-3 border-l-2 border-govt-300 pl-3 text-xs leading-relaxed text-ink-700 italic">{PRIORITY_ENGINE_STATEMENT}</blockquote>
            <div className="mt-4">
              <p className="label-institutional mb-2">{t('Published priority weights')}</p>
              <ContributionBars items={weightItems} />
            </div>
          </Card>

          <Card className="min-w-0">
            <CardHeader title={t('Selected defect - driver breakdown')} description={t('Weight, raw score and contribution behind this defect\'s priority score.')} />
            {selectedDefect ? (
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">{DEFECT_TYPE_LABEL[selectedDefect.type]}</Badge>
                  <SeverityBadge severity={selectedDefect.severity} />
                  <Badge tone={toneForScore(selectedDefect.priorityScore, false)}>{selectedDefect.priorityScore}/100</Badge>
                </div>
                <p className="mt-2 text-xs text-ink-500">
                  {segmentById.get(selectedDefect.segmentId)?.name ?? selectedDefect.segmentId} · {wardName(selectedDefect.wardId)}
                </p>
                <div className="mt-3">
                  <ContributionBars items={selectedDefect.priorityDrivers} />
                </div>

                <div className="mt-3 border-t border-ink-100 pt-3">
                  <p className="label-institutional mb-1.5">{t('Update status')}</p>
                  {(() => {
                    const next = nextDefectStatus(selectedDefect.status)
                    if (!next) return <span className="text-xs text-ink-400">{t('This defect has reached its terminal status.')}</span>
                    const mayEdit = allowed(user, 'project', 'edit', { wardId: selectedDefect.wardId, domain: 'roads' })
                    return (
                      <Button
                        size="xs"
                        variant="primary"
                        disabled={!mayEdit}
                        title={mayEdit ? `Move to ${STATUS_LABEL[next]}` : 'Your role does not hold project:edit for this ward. This control is disabled by the permission engine.'}
                        onClick={() => setPendingStatusChange({ defect: selectedDefect, next })}
                      >
                        {t('Move to {0}', STATUS_LABEL[next])}
                      </Button>
                    )
                  })()}
                </div>

                {selectedSegment?.emergencyRoute || selectedSegment?.hospitalAccess ? (
                  <p className="mt-2.5 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-crit-700">
                    <ShieldAlert className="mt-px h-3 w-3 shrink-0" />
                    {t('This defect sits on a segment carrying')}{' '}{selectedSegment.emergencyRoute ? 'designated emergency-route' : 'hospital-access'}{' '}{t('status.')}
                  </p>
                ) : null}
              </div>
            ) : (
              <EmptyState compact className="mt-3" title={t('No defect selected')} detail="Select a row in the defect register, an entry in the priority queue, or a marker on the map." />
            )}
          </Card>

          <Card>
            <CardHeader title={t('Priority band distribution')} description={bandWardId ? `Filtered to ${wardName(bandWardId)}.` : 'City-wide, all wards.'} />
            <div className="mt-3">
              <CompositionBar segments={bands.map((b) => ({ id: b.band, label: b.band, value: b.count, colour: BAND_COLOUR[b.tone] }))} />
            </div>
            <ul className="mt-3 space-y-2">
              {bands.map((b) => (
                <li key={b.band} className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-ink-800">{b.band}</span>
                    <span className="ml-1.5 text-ink-400">
                      ({b.min}–{b.max})
                    </span>
                    <p className="mt-0.5 leading-relaxed text-ink-500">{b.description}</p>
                  </div>
                  <Badge tone={b.tone} className="shrink-0">
                    {b.count}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title={t('Work-order pipeline')} description={bandWardId ? `Filtered to ${wardName(bandWardId)}.` : 'City-wide, all wards.'} />
            <div className="mt-3">
              <CompositionBar segments={pipeline.map((p) => ({ id: p.id, label: p.label, value: p.value, colour: PIPELINE_COLOUR[p.id as RoadDefect['status']] }))} />
            </div>
          </Card>

        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingStatusChange)}
        onClose={() => setPendingStatusChange(null)}
        onConfirm={(reason) => {
          if (pendingStatusChange) {
            void updateDefectStatus(pendingStatusChange.defect.id, pendingStatusChange.next, reason)
          }
        }}
        title={pendingStatusChange ? `Move to ${STATUS_LABEL[pendingStatusChange.next]}` : 'Update defect status'}
        description={
          pendingStatusChange
            ? `Defect ${pendingStatusChange.defect.id} will move from ${STATUS_LABEL[pendingStatusChange.defect.status]} to ${STATUS_LABEL[pendingStatusChange.next]}. This action and your reason are written to the permanent audit trail.`
            : undefined
        }
        confirmLabel={pendingStatusChange ? `Move to ${STATUS_LABEL[pendingStatusChange.next]}` : 'Confirm'}
        requireReason
      />

      <DemonstrationNotice />
    </PageBody>
  )
}

export default RoadsIntelligencePage
