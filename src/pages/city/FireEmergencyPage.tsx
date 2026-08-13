import { useState } from 'react'
import { Flame, Gauge, Siren, Truck, Users } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  MetricGrid,
  Select,
  StateBadge,
  toneForScore,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { IncidentCard } from '@/components/cards/domain-cards'
import { CategoryBarChart, ChartFrame, MiniBar, CHART_COLOURS } from '@/components/charts'
import { CityMap, jitteredWardPoint, type MapMarker } from '@/components/map/CityMap'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { healthService } from '@/services/health.service'
import { incidentService } from '@/services/incident.service'
import { useDrawerStore, useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { useActiveCorporation } from '@/stores/corporation.store'
import { WARD_BY_ID, wardName } from '@/data/reference'
import type { DataFreshness } from '@/types/common'
import type { EmergencyStation } from '@/types/city-domains'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCompact } from '@/utils/format'
import { greatCircleKm } from '@/utils/geo'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Fire and emergency service readiness intelligence: station capacity,
 * response-time performance against the platform's modelled service
 * standard, coverage and current fire-related incidents.
 */

function build$STATION_TYPE_LABEL(): Record<EmergencyStation['type'], string> {
  return {
  'fire-station': t('Fire Station'),
  'disaster-control': t('Disaster Control'),
  'ambulance-base': t('Ambulance Base'),
}
}
let STATION_TYPE_LABEL: Record<EmergencyStation['type'], string> = build$STATION_TYPE_LABEL()
registerLayer(() => {
  STATION_TYPE_LABEL = build$STATION_TYPE_LABEL()
})
const STATION_TYPES = Object.keys(STATION_TYPE_LABEL) as Array<EmergencyStation['type']>

/** Modelled urban response-time service standard used throughout this page. */
const RESPONSE_STANDARD_MINUTES = 8

function build$RESPONSE_BANDS(): Array<{ id: string; label: string; test: (v: number) => boolean }> {
  return [
  { id: 'b1', label: t('< 6 min'), test: (v) => v < 6 },
  { id: 'b2', label: t('6–8 min'), test: (v) => v >= 6 && v < 8 },
  { id: 'b3', label: t('8–10 min'), test: (v) => v >= 8 && v < 10 },
  { id: 'b4', label: t('10–12 min'), test: (v) => v >= 10 && v < 12 },
  { id: 'b5', label: t('≥ 12 min'), test: (v) => v >= 12 },
]
}
let RESPONSE_BANDS: Array<{ id: string; label: string; test: (v: number) => boolean }> = build$RESPONSE_BANDS()
registerLayer(() => {
  RESPONSE_BANDS = build$RESPONSE_BANDS()
})

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

export function FireEmergencyPage(): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)
  const filters = useFilterStore((s) => s.filters)
  const corporation = useActiveCorporation()
  const [typeFilter, setTypeFilter] = useState<'all' | EmergencyStation['type']>('all')

  /** The fire service's own name for this corporation - see `dept-fire`. */
  const fireBrigadeName = `${corporation.city} Fire Brigade`

  usePageMasthead(
    t('Fire & Emergency'),
    t('Station readiness, response-time performance against the modelled urban service standard, coverage and current fire-related incidents across the {0} and disaster control network.', fireBrigadeName),
  )

  const stationsQuery = useServiceQuery(queryKeys.health('emergency-stations'), (u) => healthService.emergencyStations(u))
  const incidentsQuery = useServiceQuery(queryKeys.incidents(), (u) => incidentService.list(u, { pageSize: 500 }))

  if (stationsQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Fire & Emergency') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (stationsQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Fire & Emergency') }]} />
        <ErrorState detail={stationsQuery.error.message} onRetry={() => stationsQuery.refetch()} />
      </PageBody>
    )
  }

  const stations = stationsQuery.data ?? []
  if (stations.length === 0) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Fire & Emergency') }]} />
        <EmptyState title={t('No stations available')} detail="No emergency station records were returned for the current scope." />
        <DemonstrationNotice />
      </PageBody>
    )
  }

  const filtered = stations.filter((s) => {
    if (typeFilter !== 'all' && s.type !== typeFilter) return false
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(s.wardId)) return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      if (!s.name.toLowerCase().includes(q) && !wardName(s.wardId).toLowerCase().includes(q)) return false
    }
    return true
  })

  /**
   * Every figure on this screen is computed over `filtered`, not over the full
   * register. They were computed over the full register, so narrowing to a ward
   * emptied the table and the map while the tiles above them went on reporting
   * the whole city's appliances, crews and mean response - an operator reading
   * "Ward 3" at the top of the shell was being shown Kalyan-Dombivli's numbers
   * underneath it.
   */
  const vehiclesAvailable = filtered.reduce((s, x) => s + x.vehiclesAvailable, 0)
  const vehiclesTotal = filtered.reduce((s, x) => s + x.vehiclesTotal, 0)
  const personnelOnDuty = filtered.reduce((s, x) => s + x.personnelOnDuty, 0)
  // Guarded: a ward with no station of its own divides by zero, and `NaN min`
  // is a worse answer than the honest absence handled below.
  const avgResponse =
    filtered.length > 0 ? round1(filtered.reduce((s, x) => s + x.avgResponseMinutes, 0) / filtered.length) : 0
  const aboveStandard = filtered.filter((s) => s.avgResponseMinutes > RESPONSE_STANDARD_MINUTES).sort((a, b) => b.avgResponseMinutes - a.avgResponseMinutes)

  const distribution = RESPONSE_BANDS.map((b) => ({
    label: b.label,
    count: filtered.filter((s) => b.test(s.avgResponseMinutes)).length,
  }))

  const fireIncidents = (incidentsQuery.data?.items ?? []).filter((i) => i.type === 'fire' || i.departmentId === 'dept-fire')
  const activeFireIncidents = fireIncidents.filter((i) => i.status !== 'resolved' && i.status !== 'reviewed')

  /**
   * The station covering a ward that holds none of its own, and how far away it
   * is. Straight-line distance between ward centroids - enough to name the
   * covering station honestly, and never presented as a routed drive distance.
   */
  const nearestCover = ((): { wardId: string; station: EmergencyStation; km: number } | null => {
    if (filtered.length > 0) return null
    if (filters.wardIds.length !== 1) return null
    const wardId = filters.wardIds[0] as string
    const ward = WARD_BY_ID.get(wardId)
    if (!ward || stations.length === 0) return null
    let best: { station: EmergencyStation; km: number } | null = null
    for (const station of stations) {
      const km = greatCircleKm(ward.centroid, station.location)
      if (!best || km < best.km) best = { station, km }
    }
    return best ? { wardId, station: best.station, km: best.km } : null
  })()

  // Response by ward stays over the FULL register: the map layer behind the
  // markers is the corporation's coverage picture, and blanking every ward but
  // the selected one would remove the context that makes the selection legible.
  const responseByWard = new Map<string, number>()
  for (const s of stations) {
    const existing = responseByWard.get(s.wardId)
    responseByWard.set(s.wardId, existing === undefined ? s.avgResponseMinutes : Math.min(existing, s.avgResponseMinutes))
  }

  const wardMarkerIndex = new Map<string, number>()
  const markers: MapMarker[] = filtered.map((s) => {
    const idx = wardMarkerIndex.get(s.wardId) ?? 0
    wardMarkerIndex.set(s.wardId, idx + 1)
    const point = jitteredWardPoint(s.wardId, idx)
    return {
      id: s.id,
      x: point.x,
      y: point.y,
      label: s.name,
      detail: t('{0} · {1} min avg response · {2}', STATION_TYPE_LABEL[s.type], s.avgResponseMinutes, wardName(s.wardId)),
      kind: 'station',
      onClick: () => openDrawer({ kind: 'ward', id: s.wardId }),
    }
  })

  const freshness: DataFreshness | undefined =
    fireIncidents.length > 0
      ? {
          generatedAt: DEMO_NOW.toISOString(),
          sourceObservedAt: fireIncidents.reduce((max, i) => (i.updatedAt > max ? i.updatedAt : max), fireIncidents[0]!.updatedAt),
          refreshIntervalMinutes: 10,
          origin: 'demonstration',
          sourceState: 'operational',
          stale: false,
        }
      : undefined

  const columns: Array<Column<EmergencyStation>> = [
    { id: 'name', header: t('Station'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name },
    { id: 'type', header: t('Type'), cell: (r) => <Badge tone="neutral">{STATION_TYPE_LABEL[r.type]}</Badge>, sortValue: (r) => r.type, hideBelow: 'md' },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    {
      id: 'vehicles',
      header: t('Vehicles (avail. / total)'),
      cell: (r) => (
        <div className="min-w-[6rem]">
          <span className="numeric text-xs font-semibold text-ink-800">
            {r.vehiclesAvailable} <span className="font-normal text-ink-400">/ {r.vehiclesTotal}</span>
          </span>
          <MiniBar value={(r.vehiclesAvailable / r.vehiclesTotal) * 100} width={72} className="mt-0.5" />
        </div>
      ),
      sortValue: (r) => r.vehiclesAvailable / r.vehiclesTotal,
    },
    { id: 'personnel', header: t('Personnel on duty'), cell: (r) => r.personnelOnDuty, sortValue: (r) => r.personnelOnDuty, align: 'right', hideBelow: 'lg' },
    {
      id: 'response',
      header: t('Avg. response'),
      cell: (r) => (
        <span className={r.avgResponseMinutes > RESPONSE_STANDARD_MINUTES ? 'font-semibold text-crit-600' : 'text-ink-700'}>
          {r.avgResponseMinutes} min
        </span>
      ),
      sortValue: (r) => r.avgResponseMinutes,
    },
    { id: 'radius', header: t('Coverage radius'), cell: (r) => `${r.coverageRadiusKm} km`, sortValue: (r) => r.coverageRadiusKm, align: 'right', hideBelow: 'xl' },
    { id: 'readiness', header: t('Readiness'), cell: (r) => <Badge tone={toneForScore(r.readinessIndex, true)}>{r.readinessIndex}</Badge>, sortValue: (r) => r.readinessIndex },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Fire & Emergency') }]}
        freshness={freshness}
      />

      <MetricGrid columns={5}>
        <MetricCard label={t('Stations')} value={stations.length} support={t('{0} fire stations', stations.filter((s) => s.type === 'fire-station').length)} icon={<Siren className="h-4 w-4" />} />
        <MetricCard label={t('Vehicles available')} value={vehiclesAvailable} unit={`/ ${vehiclesTotal}`} icon={<Truck className="h-4 w-4" />} tone={vehiclesAvailable / vehiclesTotal < 0.7 ? 'warn' : 'default'} />
        <MetricCard label={t('Personnel on duty')} value={formatCompact(personnelOnDuty)} icon={<Users className="h-4 w-4" />} />
        <MetricCard
          label={t('Average response time')}
          value={avgResponse}
          unit="min"
          support={t('Standard: {0} min', RESPONSE_STANDARD_MINUTES)}
          tone={avgResponse > RESPONSE_STANDARD_MINUTES ? 'critical' : avgResponse > RESPONSE_STANDARD_MINUTES - 1 ? 'warn' : 'positive'}
          icon={<Gauge className="h-4 w-4" />}
        />
        <MetricCard label={t('Catchments above standard')} value={aboveStandard.length} support={t('of {0} stations', filtered.length)} tone={aboveStandard.length > 0 ? 'warn' : 'default'} />
      </MetricGrid>

      {/* Two columns, read downward. The station register and the incidents
          currently attributed to the network carry the width; coverage, the
          catchments above standard and the response-time distribution are the
          supporting figures beside them. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
      <Card flush>
        <CardHeader className="px-4 pt-4 pb-3" icon={<Flame className="h-4 w-4" />} title={t('Station register')} description={t('Sortable and filterable by type and ward.')} />
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          <FilterBar show={['ward', 'search']} searchPlaceholder="Search station or ward" compact />
          <div className="flex items-center gap-1.5">
            <Label className="mb-0 whitespace-nowrap">{t('Type')}</Label>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | EmergencyStation['type'])}
              className="w-auto min-w-[9.5rem]"
              options={[{ value: 'all', label: t('All types') }, ...STATION_TYPES.map((entry) => ({ value: entry, label: STATION_TYPE_LABEL[entry] }))]}
              aria-label={t('Filter by station type')}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          /* A ward with no station of its own is a real answer, not a blank.
             Every such ward used to render the same generic message, so half
             the wards of a smaller corporation looked identical to each other -
             which reads as a filter that did not work. The nearest covering
             station is the fact that actually differs ward by ward: a ward is
             covered by the appliance that reaches it, wherever that appliance
             is stationed. */
          nearestCover ? (
            <EmptyState
              className="m-4"
              title={t('No station within {0}', wardName(nearestCover.wardId))}
              detail={t('The nearest covering station is {0} in {1}, about {2} km away, with a {3} min average response. Fire cover for this {4} is provided from there.', nearestCover.station.name, wardName(nearestCover.station.wardId), nearestCover.km.toFixed(1), nearestCover.station.avgResponseMinutes, corporation.wardTerminology.toLowerCase())}
            />
          ) : (
            <EmptyState className="m-4" title={t('No stations match the current filters')} detail="Adjust the type, ward or search term above." />
          )
        ) : (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id}
            pageSize={12}
            searchable={false}
            initialSort={{ columnId: 'response', direction: 'desc' }}
            ariaLabel="Emergency station register"
          />
        )}
      </Card>

          <Card flush>
            <CardHeader className="px-4 pt-4 pb-3" title={t('Current fire & emergency incidents')} description={t('Incidents of type Fire, or owned by the {0}, currently in the unified incident register.', fireBrigadeName)} />
            {incidentsQuery.isLoading ? (
              <LoadingState variant="block" rows={3} className="p-4" />
            ) : incidentsQuery.error ? (
              <ErrorState className="m-4" detail={incidentsQuery.error.message} onRetry={() => incidentsQuery.refetch()} />
            ) : activeFireIncidents.length === 0 ? (
              <EmptyState compact className="mx-4 mb-4" title={t('No active fire or emergency incidents')} detail="No open incident is currently attributed to the fire and emergency network." />
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
                {activeFireIncidents.map((incident) => (
                  <IncidentCard key={incident.id} incident={incident} onClick={() => openDrawer({ kind: 'incident', id: incident.id })} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <Card>
            <CardHeader title={t('Coverage map')} description={t('Station markers with a response-time coverage layer. Wards without a marker are not necessarily uncovered - a neighbouring station\'s radius may extend into them.')} />
            <div className="mt-3">
              <CityMap
                layers={[
                  {
                    id: 'response-coverage',
                    label: t('Response Time Coverage'),
                    valueFor: (wardId) => {
                      const minutes = responseByWard.get(wardId)
                      if (minutes === undefined) return undefined
                      return Math.min(100, Math.round((minutes / 15) * 100))
                    },
                    higherIsWorse: true,
                    unit: ' min (scaled; 15 min = 100)',
                    description: t('Average response time of the nearest station located in the ward, scaled 0–100. Wards with no local station show no data.'),
                  },
                ]}
                markers={markers}
                height={380}
              />
            </div>
          </Card>

          {aboveStandard.length > 0 ? (
            <Card tone="warn">
              <CardHeader title={t('Catchments above the response-time standard')} description={t('Average response time exceeds the modelled {0}-minute standard. The limiting availability constraint is named for each.', RESPONSE_STANDARD_MINUTES)} />
              <ul className="mt-2 divide-y divide-warn-200/60">
                {aboveStandard.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate text-xs font-medium text-ink-800">
                      {s.name} <span className="font-normal text-ink-500">· {wardName(s.wardId)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge tone="critical">{s.avgResponseMinutes} min</Badge>
                      <Badge tone={s.vehiclesAvailable < s.vehiclesTotal ? 'warn' : 'muted'}>
                        {t('{0} of {1} vehicles available', s.vehiclesAvailable, s.vehiclesTotal)}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t('Response-time distribution')} description={t('Count of stations by average response-time band.')} />
            <div className="mt-3">
              <ChartFrame
                title={t('Stations by response-time band')}
                unit={t('Number of stations')}
                timeframe="Trailing 30 days"
                footnote={t('The platform\'s modelled urban response-time standard is {0} minutes. Bands at or above this threshold are named in "Catchments above standard" below.', RESPONSE_STANDARD_MINUTES)}
              >
                <CategoryBarChart data={distribution} series={[{ key: 'count', label: t('Stations'), colour: CHART_COLOURS.primary }]} categoryKey="label" />
              </ChartFrame>
            </div>
          </Card>
        </div>
      </div>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default FireEmergencyPage
