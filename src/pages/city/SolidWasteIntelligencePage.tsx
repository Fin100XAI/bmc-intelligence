import { useState } from 'react'
import { AlertTriangle, Recycle, Route as RouteIcon, Truck } from 'lucide-react'
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
  ObservationSourceBadge,
} from '@/components/ui'
import { SeverityBadge } from '@/components/ui/badges'
import { MetricCard } from '@/components/cards'
import { CHART_COLOURS, ChartFrame, DonutChart, MiniBar } from '@/components/charts'
import { CityMap, jitteredWardPoint, type MapMarker, type MapPath } from '@/components/map/CityMap'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { wasteService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardName } from '@/data/reference'
import type { WasteFacility, WasteHotspot, WasteRoute, WasteWardPerformance } from '@/types/city-domains'
import type { DataFreshness } from '@/types/common'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatNumber, formatPercent, formatRelative } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/** Solid Waste Intelligence - collection coverage, routes, processing capacity and recurring hotspots. */

function build$FACILITY_TYPE_LABEL(): Record<WasteFacility['type'], string> {
  return {
  'transfer-station': t('Transfer Station'),
  'processing-plant': t('Processing Plant'),
  composting: t('Composting Unit'),
  landfill: t('Landfill'),
  biogas: 'Bio-methanation',
}
}
let FACILITY_TYPE_LABEL: Record<WasteFacility['type'], string> = build$FACILITY_TYPE_LABEL()
registerLayer(() => {
  FACILITY_TYPE_LABEL = build$FACILITY_TYPE_LABEL()
})
const DIVERSION_TYPES: Array<WasteFacility['type']> = ['processing-plant', 'composting', 'biogas']
const COVERAGE_STANDARD = 90
const RECURRING_MISSED_THRESHOLD = 3
const LOW_REMAINING_LIFE_YEARS = 2

const FRESHNESS: DataFreshness = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-140),
  refreshIntervalMinutes: 240,
  origin: 'demonstration',
  sourceState: 'operational',
  stale: false,
}

export function SolidWasteIntelligencePage(): React.JSX.Element {
  usePageMasthead(
    t('Solid Waste Intelligence'),
    t('Collection coverage and segregation by ward, live route adherence, processing and disposal facility capacity, and recurring hotspots across the solid waste management network.'),
  )

  const filters = useFilterStore((s) => s.filters)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)

  const wardRouteFilter = filters.wardIds.length === 1 ? filters.wardIds[0] : undefined

  const performanceQuery = useServiceQuery(queryKeys.waste('ward-performance'), (u) => wasteService.wardPerformance(u))
  const routesQuery = useServiceQuery(queryKeys.waste(`routes:${wardRouteFilter ?? 'all'}`), (u) => wasteService.routes(u, wardRouteFilter))
  const facilitiesQuery = useServiceQuery(queryKeys.waste('facilities'), (u) => wasteService.facilities(u))
  const hotspotsQuery = useServiceQuery(queryKeys.waste('hotspots'), (u) => wasteService.hotspots(u))

  const breadcrumbs = [{ label: t('City Intelligence') }, { label: t('Solid Waste Intelligence') }]

  if (performanceQuery.isLoading || routesQuery.isLoading || facilitiesQuery.isLoading || hotspotsQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={breadcrumbs} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }

  const anyError = performanceQuery.error ?? routesQuery.error ?? facilitiesQuery.error ?? hotspotsQuery.error
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={breadcrumbs} />
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void performanceQuery.refetch()
            void routesQuery.refetch()
            void facilitiesQuery.refetch()
            void hotspotsQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const performance = performanceQuery.data ?? []
  const routes = routesQuery.data ?? []
  const facilities = facilitiesQuery.data ?? []
  const hotspots = hotspotsQuery.data ?? []

  if (performance.length === 0) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={breadcrumbs} />
        <EmptyState title={t('No solid waste data available')} detail="No ward performance records were returned for the current scope." />
        <DemonstrationNotice />
      </PageBody>
    )
  }

  // --- City summary -------------------------------------------------------
  const generationTpd = performance.reduce((s, p) => s + p.generationTpd, 0)
  const collectedTpd = performance.reduce((s, p) => s + p.collectedTpd, 0)
  const coveragePct = generationTpd > 0 ? (collectedTpd / generationTpd) * 100 : 0
  const segregationPct = collectedTpd > 0 ? performance.reduce((s, p) => s + p.segregationPct * p.collectedTpd, 0) / collectedTpd : 0
  const missedCollections7d = performance.reduce((s, p) => s + p.missedCollections7d, 0)
  const complaints30d = performance.reduce((s, p) => s + p.complaints30d, 0)
  const vehiclesDeployed = performance.reduce((s, p) => s + p.vehiclesDeployed, 0)

  // The page-level filter bar offers ward and free-text search, so every table
  // below it must honour both. Applying them to the route list alone would
  // leave the operator reading an unfiltered ward, facility and hotspot table
  // while the bar reports the view as narrowed.
  const query = filters.search.trim().toLowerCase()
  const inWard = (wardId: string): boolean => filters.wardIds.length === 0 || filters.wardIds.includes(wardId)
  const matches = (...fields: string[]): boolean =>
    query.length === 0 || fields.some((f) => f.toLowerCase().includes(query))

  const filteredPerformance = performance.filter((p) => inWard(p.wardId) && matches(wardName(p.wardId)))
  const filteredRoutes = routes.filter((r) => inWard(r.wardId) && matches(r.name, r.vehicleId, wardName(r.wardId)))
  const filteredFacilities = facilities.filter((f) => inWard(f.wardId) && matches(f.name, wardName(f.wardId)))
  const filteredHotspots = hotspots.filter((hs) => inWard(hs.wardId) && matches(hs.name, hs.cause, wardName(hs.wardId)))
  const selectedRoute = routes.find((r) => r.id === selectedRouteId) ?? null

  // --- Route map ------------------------------------------------------------
  const paths: MapPath[] = filteredRoutes.map((r) => ({
    id: r.id,
    points: r.path,
    label: t('{0} · {1} adherence', r.name, formatPercent(r.adherencePct, 0)),
    tone: selectedRouteId ? (r.id === selectedRouteId ? 'primary' : 'neutral') : 'primary',
    dashed: selectedRouteId ? r.id !== selectedRouteId : false,
  }))

  const coverageByWard = new Map(performance.map((p) => [p.wardId, p.coveragePct]))

  const wardMarkerIndex = new Map<string, number>()
  // Markers follow the same filter as the route paths drawn beside them, so the
  // map and the facility table below it never disagree about what is in scope.
  const facilityMarkers: MapMarker[] = filteredFacilities.map((f) => {
    const idx = wardMarkerIndex.get(f.wardId) ?? 0
    wardMarkerIndex.set(f.wardId, idx + 1)
    const point = jitteredWardPoint(f.wardId, idx)
    return {
      id: f.id,
      x: point.x,
      y: point.y,
      label: f.name,
      detail: t('{0} · {1} utilisation · {2}', FACILITY_TYPE_LABEL[f.type], formatPercent(f.utilisationPct, 0), wardName(f.wardId)),
      kind: 'facility',
    }
  })

  // --- Diversion from landfill ----------------------------------------------
  const diversionLoad = facilities.filter((f) => DIVERSION_TYPES.includes(f.type)).reduce((s, f) => s + f.currentLoadTpd, 0)
  const landfillLoad = facilities.filter((f) => f.type === 'landfill').reduce((s, f) => s + f.currentLoadTpd, 0)
  const totalModelledLoad = diversionLoad + landfillLoad
  const diversionPct = totalModelledLoad > 0 ? (diversionLoad / totalModelledLoad) * 100 : 0

  // --- Columns --------------------------------------------------------------
  const performanceColumns: Array<Column<WasteWardPerformance>> = [
    { id: 'ward', header: t('Ward'), cell: (r) => <span className="font-medium text-ink-900">{wardName(r.wardId)}</span>, sortValue: (r) => wardName(r.wardId), searchValue: (r) => wardName(r.wardId), width: '13rem' },
    { id: 'generation', header: t('Generation'), cell: (r) => `${formatNumber(r.generationTpd, 1)} TPD`, sortValue: (r) => r.generationTpd, align: 'right', hideBelow: 'lg' },
    { id: 'collected', header: t('Collected'), cell: (r) => `${formatNumber(r.collectedTpd, 1)} TPD`, sortValue: (r) => r.collectedTpd, align: 'right', hideBelow: 'md' },
    {
      id: 'coverage',
      header: t('Coverage'),
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={r.coveragePct} />
          <span className="numeric w-10 text-right text-xs font-semibold text-ink-700">{formatNumber(r.coveragePct, 0)}%</span>
        </div>
      ),
      sortValue: (r) => r.coveragePct,
    },
    {
      id: 'segregation',
      header: t('Segregation'),
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={r.segregationPct} />
          <span className="numeric w-10 text-right text-xs font-semibold text-ink-700">{formatNumber(r.segregationPct, 0)}%</span>
        </div>
      ),
      sortValue: (r) => r.segregationPct,
    },
    { id: 'missed', header: t('Missed (7d)'), cell: (r) => r.missedCollections7d, sortValue: (r) => r.missedCollections7d, align: 'right', hideBelow: 'lg' },
    {
      id: 'pattern',
      header: t('Shortfall pattern'),
      cell: (r) => {
        if (r.coveragePct >= COVERAGE_STANDARD) return <Badge tone="positive">{t('Meets standard')}</Badge>
        if (r.missedCollections7d >= RECURRING_MISSED_THRESHOLD) return <Badge tone="critical">{t('Recurring shortfall')}</Badge>
        return <Badge tone="warn">{t('Isolated disruption')}</Badge>
      },
      sortValue: (r) => (r.coveragePct >= COVERAGE_STANDARD ? 0 : r.missedCollections7d >= RECURRING_MISSED_THRESHOLD ? 2 : 1),
    },
    { id: 'complaints', header: t('Complaints (30d)'), cell: (r) => r.complaints30d, sortValue: (r) => r.complaints30d, align: 'right', hideBelow: 'xl' },
    { id: 'vehicles', header: t('Vehicles'), cell: (r) => r.vehiclesDeployed, sortValue: (r) => r.vehiclesDeployed, align: 'right', hideBelow: 'lg' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  const routeColumns: Array<Column<WasteRoute>> = [
    { id: 'name', header: t('Route'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => `${r.name} ${r.vehicleId}` },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'vehicle', header: t('Vehicle'), cell: (r) => <span className="font-mono text-[0.6875rem] text-ink-600">{r.vehicleId}</span>, sortValue: (r) => r.vehicleId, hideBelow: 'md' },
    {
      id: 'coverage',
      header: t('Coverage'),
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={r.coveragePct} />
          <span className="numeric w-9 text-right text-xs font-semibold text-ink-700">{formatNumber(r.coveragePct, 0)}%</span>
        </div>
      ),
      sortValue: (r) => r.coveragePct,
    },
    {
      id: 'adherence',
      header: t('Schedule adherence'),
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={r.adherencePct} />
          <span className="numeric w-9 text-right text-xs font-semibold text-ink-700">{formatNumber(r.adherencePct, 0)}%</span>
        </div>
      ),
      sortValue: (r) => r.adherencePct,
    },
    { id: 'missed', header: t('Missed points'), cell: (r) => r.missedPoints, sortValue: (r) => r.missedPoints, align: 'right', hideBelow: 'lg' },
    {
      id: 'start',
      header: t('Scheduled vs actual start'),
      cell: (r) => (
        <span className={r.actualStart > r.scheduledStart ? 'font-semibold text-crit-600' : 'text-ink-700'}>
          {r.scheduledStart} <span className="text-ink-300">→</span> {r.actualStart}
        </span>
      ),
      sortValue: (r) => r.scheduledStart,
      hideBelow: 'xl',
    },
    { id: 'tonnage', header: t('Tonnage'), cell: (r) => `${formatNumber(r.tonnesCollected, 1)} t`, sortValue: (r) => r.tonnesCollected, align: 'right' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  const facilityColumns: Array<Column<WasteFacility>> = [
    { id: 'name', header: t('Facility'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name, width: '15rem' },
    { id: 'type', header: t('Type'), cell: (r) => <Badge tone="neutral">{FACILITY_TYPE_LABEL[r.type]}</Badge>, sortValue: (r) => r.type },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'capacity', header: t('Capacity'), cell: (r) => `${formatNumber(r.capacityTpd, 0)} TPD`, sortValue: (r) => r.capacityTpd, align: 'right', hideBelow: 'md' },
    { id: 'load', header: t('Current load'), cell: (r) => `${formatNumber(r.currentLoadTpd, 0)} TPD`, sortValue: (r) => r.currentLoadTpd, align: 'right' },
    {
      id: 'utilisation',
      header: t('Utilisation'),
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={r.utilisationPct} />
          <span className="numeric w-10 text-right text-xs font-semibold text-ink-700">{formatNumber(r.utilisationPct, 0)}%</span>
        </div>
      ),
      sortValue: (r) => r.utilisationPct,
    },
    {
      id: 'life',
      header: t('Remaining life'),
      cell: (r) =>
        typeof r.remainingLifeYears === 'number' ? (
          <Badge tone={r.remainingLifeYears <= LOW_REMAINING_LIFE_YEARS ? 'critical' : 'neutral'}>{r.remainingLifeYears} yr</Badge>
        ) : (
          <span className="text-ink-300">-</span>
        ),
      sortValue: (r) => r.remainingLifeYears ?? 999,
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  const hotspotColumns: Array<Column<WasteHotspot>> = [
    { id: 'name', header: t('Location'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name, width: '16rem' },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'recurrence', header: t('Recurrence count'), cell: (r) => <span className="numeric font-semibold text-ink-800">{r.recurrenceCount}</span>, sortValue: (r) => r.recurrenceCount, align: 'right' },
    { id: 'lastReported', header: t('Last reported'), cell: (r) => formatRelative(r.lastReportedAt), sortValue: (r) => r.lastReportedAt, hideBelow: 'md' },
    { id: 'severity', header: t('Severity'), cell: (r) => <SeverityBadge severity={r.severity} />, sortValue: (r) => r.severity },
    { id: 'cause', header: t('Recorded cause'), cell: (r) => <span className="text-xs text-ink-600">{r.cause}</span>, sortValue: (r) => r.cause, hideBelow: 'lg' },
    {
      id: 'detected',
      header: t('How detected'),
      cell: (r) => <ObservationSourceBadge provenance={r.provenance} />,
      sortValue: (r) => r.provenance.detectedBy,
      hideBelow: 'lg',
    },
  ]

  const recurringShortfallWards = performance.filter((p) => p.coveragePct < COVERAGE_STANDARD && p.missedCollections7d >= RECURRING_MISSED_THRESHOLD)
  const isolatedDisruptionWards = performance.filter((p) => p.coveragePct < COVERAGE_STANDARD && p.missedCollections7d < RECURRING_MISSED_THRESHOLD)

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={breadcrumbs}
        freshness={FRESHNESS}
        controls={<FilterBar show={['ward', 'search']} searchPlaceholder="Search ward, route or facility" />}
      />

      <MetricGrid columns={4}>
        <MetricCard label={t('Generation')} value={formatNumber(generationTpd, 0)} unit="TPD" icon={<Recycle className="h-4 w-4" />} />
        <MetricCard label={t('Collected')} value={formatNumber(collectedTpd, 0)} unit="TPD" support={t('{0} of generation', formatPercent(coveragePct, 0))} />
        <MetricCard label={t('Coverage')} value={formatPercent(coveragePct, 0)} tone={coveragePct < COVERAGE_STANDARD ? 'warn' : 'positive'} progress={{ value: coveragePct, max: 100 }} />
        <MetricCard label={t('Segregation at source')} value={formatPercent(segregationPct, 0)} tone={segregationPct < 50 ? 'warn' : 'default'} />
        <MetricCard label={t('Missed collections (7d)')} value={missedCollections7d} tone={missedCollections7d > 0 ? 'warn' : 'default'} />
        <MetricCard label={t('Complaints (30d)')} value={formatNumber(complaints30d)} tone={complaints30d > 0 ? 'warn' : 'default'} />
        <MetricCard label={t('Recurring hotspots')} value={hotspots.length} tone={hotspots.length > 0 ? 'warn' : 'default'} />
        <MetricCard label={t('Vehicles deployed')} value={vehiclesDeployed} icon={<Truck className="h-4 w-4" />} />
      </MetricGrid>

      {/* Two columns, read downward. Ward performance, the route surface and
          the facility register are the working record and carry the width;
          the shortfall reading, the recurring hotspots and the diversion
          position stand beside them. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
        <Card flush>
            <CardHeader className="px-4 pt-4 pb-3" title={t('Ward performance')} description={t('Sortable; coverage and segregation shown as bars against the 100% standard.')} />
          <DataTable
            rows={filteredPerformance}
            columns={performanceColumns}
            rowKey={(r) => r.wardId}
            pageSize={12}
            searchPlaceholder="Search ward"
            initialSort={{ columnId: 'coverage', direction: 'asc' }}
            ariaLabel="Ward collection performance"
          />
        </Card>

        <Card>
          <CardHeader
            icon={<RouteIcon className="h-4 w-4" />}
            title={t('Collection routes')}
            description={t('Route geometry on the map at left; selecting a route in the table highlights it on the map. Filter by ward to reduce map density.')}
          />
          <div className="mt-3 grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <CityMap
              layers={[
                {
                  id: 'coverage',
                  label: t('Ward Collection Coverage'),
                  valueFor: (wardId) => coverageByWard.get(wardId),
                  higherIsWorse: false,
                  unit: '% coverage',
                  description: t('Scheduled collection points serviced, by ward.'),
                },
              ]}
              paths={paths}
              markers={facilityMarkers}
              height={420}
            />
            <div className="min-w-0">
              {filteredRoutes.length === 0 ? (
                <EmptyState title={t('No routes match the current filters')} detail="Select a single ward, or clear the ward filter, to see routes." />
              ) : (
                <DataTable
                  rows={filteredRoutes}
                  columns={routeColumns}
                  rowKey={(r) => r.id}
                  pageSize={8}
                  searchable={false}
                  onRowClick={(r) => setSelectedRouteId(r.id === selectedRouteId ? null : r.id)}
                  activeRowKey={selectedRouteId ?? undefined}
                  initialSort={{ columnId: 'adherence', direction: 'asc' }}
                  ariaLabel="Collection routes"
                  maxHeight="26rem"
                  stickyHeader
                />
              )}
              {selectedRoute ? (
                <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
                  <span className="font-semibold text-ink-700">{selectedRoute.name}</span>{' '}{t('highlighted on the map · vehicle')}{' '}
                  {selectedRoute.vehicleId} · {selectedRoute.missedPoints}{' '}{t('missed point(s) this cycle.')}
                </p>
              ) : null}
            </div>
          </div>
        </Card>

        <Card flush>
          <CardHeader className="px-4 pt-4 pb-3" title={t('Processing, transfer and disposal facilities')} description={t('Capacity and utilisation across transfer stations, processing plants, composting units, bio-methanation and landfills. Low remaining life is flagged for landfill sites.')} />
          <DataTable
            rows={filteredFacilities}
            columns={facilityColumns}
            rowKey={(r) => r.id}
            pageSize={10}
            searchPlaceholder="Search facility"
            initialSort={{ columnId: 'utilisation', direction: 'desc' }}
            ariaLabel="Processing and disposal facilities"
          />
        </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
        {recurringShortfallWards.length > 0 || isolatedDisruptionWards.length > 0 ? (
          <Card tone="warn" className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-700" aria-hidden />
            <p className="text-xs leading-relaxed text-ink-700">
              <span className="font-semibold">{t('{0} ward(s)', recurringShortfallWards.length)}</span>{' '}{t('show coverage below the')}{' '}{COVERAGE_STANDARD}{t('% standard with')}{' '}{RECURRING_MISSED_THRESHOLD}{' '}{t('or more missed collections in the last 7 days - a recurring pattern rather than a single-day disruption. A further')}{' '}<span className="font-semibold">{t('{0} ward(s)', isolatedDisruptionWards.length)}</span>{' '}{t('read below standard with few missed collections, consistent with an isolated, single-day disruption rather than a systemic shortfall.')}
            </p>
          </Card>
        ) : null}

          <Card flush>
            <CardHeader className="px-4 pt-4 pb-3" title={t('Recurring hotspots')} description={t('Locations with repeated dumping or accumulation, ranked by recurrence count.')} />
            {filteredHotspots.length === 0 ? (
              <EmptyState className="m-4" title={t('No recurring hotspots match the current filters')} detail="No hotspot records were returned for the selected ward or search term." />
            ) : (
              <DataTable
                rows={filteredHotspots}
                columns={hotspotColumns}
                rowKey={(r) => r.id}
                pageSize={10}
                searchPlaceholder="Search location or ward"
                initialSort={{ columnId: 'recurrence', direction: 'desc' }}
                ariaLabel="Recurring hotspots"
              />
            )}
          </Card>

          <Card>
            <ChartFrame title={t('Diversion from landfill')} unit={t('Tonnes per day')} timeframe="Current modelled load" description={t('Processing, composting and bio-methanation load against landfill load. Transfer-station throughput is excluded as it passes onward to another facility.')} height={220}>
              <DonutChart
                data={[
                  { label: t('Diverted (processing, composting, biogas)'), value: diversionLoad, colour: CHART_COLOURS.positive },
                  { label: t('Landfilled'), value: landfillLoad, colour: CHART_COLOURS.critical },
                ]}
                centreValue={`${Math.round(diversionPct)}%`}
                centreLabel="diverted"
              />
            </ChartFrame>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-400">
              {t('{0} TPD diverted against {1} TPD landfilled, across facilities with a non-zero modelled load.', formatNumber(diversionLoad, 0), formatNumber(landfillLoad, 0))}
            </p>
          </Card>

        </div>
      </div>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default SolidWasteIntelligencePage
