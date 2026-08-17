import { useState } from 'react'
import { AlertTriangle, Construction, TrafficCone } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, Card, DataTable, DemonstrationNotice, EmptyState, ErrorState, LoadingState, MetricGrid, StateBadge, type Column } from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { CategoryBarChart, CHART_COLOURS, ChartFrame, MiniBar } from '@/components/charts'
import { CityMap, type MapPath } from '@/components/map/CityMap'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { roadsService } from '@/services'
import { activeCorporation } from '@/config/municipality.config'
import { wardShortName } from '@/data/reference'
import { usePageMasthead } from '@/stores/masthead.store'
import { useFilterStore } from '@/stores/ui.store'
import type { RoadSegment, TrafficCorridor } from '@/types/city-domains'
import type { DataFreshness } from '@/types/common'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * Traffic & Mobility Intelligence - corridor congestion, incidents and
 * closures, with a cross-domain panel connecting corridor degradation to
 * road condition and planned works. That connection is presented strictly
 * as a shared-ward correlation requiring field assessment, never as a
 * claim that one causes the other.
 */

const DEGRADED_CONGESTION_THRESHOLD = 40

const FRESHNESS: DataFreshness = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-45),
  refreshIntervalMinutes: 30,
  origin: 'demonstration',
  sourceState: 'operational',
  stale: false,
}

function congestionTone(index: number): 'primary' | 'warn' | 'critical' {
  if (index >= 55) return 'critical'
  if (index >= DEGRADED_CONGESTION_THRESHOLD) return 'warn'
  return 'primary'
}

export function TrafficIntelligencePage(): React.JSX.Element {
  usePageMasthead(t('Traffic & Mobility'))

  const [selectedCorridorId, setSelectedCorridorId] = useState<string | null>(null)

  /**
   * The ward selected in the command bar is the operator's statement about
   * what they are looking at. This page used to ignore it entirely: every
   * corridor, every metric and the whole cross-domain panel read corporation-
   * wide no matter which of the twenty-four wards was in force, which tells an
   * operator something untrue about the figures in front of them.
   *
   * The selection is narrowed here, above the permission layer rather than
   * around it - the service has already returned only the corridors the
   * principal may read (`filterByScope` on `mobility`), so this can subtract
   * from that set and can never add to it.
   */
  const wardScope = useFilterStore((s) => s.filters.wardIds)

  const corridorsQuery = useServiceQuery(queryKeys.roads('corridors'), (u) => roadsService.corridors(u))
  const segmentsQuery = useServiceQuery(queryKeys.roads('segments'), (u) => roadsService.segments(u))

  const breadcrumbs = [{ label: t('City Intelligence') }, { label: t('Traffic & Mobility') }]

  if (corridorsQuery.isLoading || segmentsQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={breadcrumbs} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }

  const anyError = corridorsQuery.error ?? segmentsQuery.error
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={breadcrumbs} />
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void corridorsQuery.refetch()
            void segmentsQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  // A corridor is in scope when it serves at least one ward in the selection;
  // with no ward selected the corporation-wide position stands.
  const servesScope = (wardIds: string[]): boolean =>
    wardScope.length === 0 || wardIds.some((w) => wardScope.includes(w))

  const corridors = (corridorsQuery.data ?? []).filter((c) => servesScope(c.wardIds))
  const segments = (segmentsQuery.data ?? []).filter((s) => servesScope([s.wardId]))

  if (corridors.length === 0) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={breadcrumbs} />
        <EmptyState title={t('No corridor data available')} detail="No traffic corridor records were returned for the current scope." />
        <DemonstrationNotice />
      </PageBody>
    )
  }

  // --- Summary --------------------------------------------------------------
  const avgCongestion = corridors.reduce((s, c) => s + c.congestionIndex, 0) / corridors.length
  const corridorsDegraded = corridors.filter((c) => c.state !== 'operational')
  const incidents30d = corridors.reduce((s, c) => s + c.incidents30d, 0)
  const activeClosures = corridors.reduce((s, c) => s + c.closures, 0)
  const isBmc = activeCorporation.id === 'bmc'

  const selectedCorridor = corridors.find((c) => c.id === selectedCorridorId) ?? null

  // --- Map --------------------------------------------------------------------
  const congestionByWard = new Map<string, number[]>()
  for (const c of corridors) {
    for (const w of c.wardIds) {
      const list = congestionByWard.get(w) ?? []
      list.push(c.congestionIndex)
      congestionByWard.set(w, list)
    }
  }
  const average = (values: number[] | undefined): number | undefined =>
    values && values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined

  const paths: MapPath[] = corridors.map((c) => ({
    id: c.id,
    points: c.path,
    label: t('{0} · Congestion {1}/100', c.name, c.congestionIndex),
    tone: selectedCorridorId ? (c.id === selectedCorridorId ? 'intel' : congestionTone(c.congestionIndex)) : congestionTone(c.congestionIndex),
    dashed: selectedCorridorId ? c.id !== selectedCorridorId : false,
  }))

  // --- Congestion profile chart ------------------------------------------------
  const profileData = [...corridors]
    .sort((a, b) => b.congestionIndex - a.congestionIndex)
    .map((c) => ({ label: c.name.length > 22 ? `${c.name.slice(0, 21)}…` : c.name, freeFlow: c.freeFlowSpeedKmph, peak: c.peakSpeedKmph }))

  // --- Closure impact -----------------------------------------------------------
  const closureImpact = [...corridors].filter((c) => c.closures > 0).sort((a, b) => b.closures - a.closures)

  // --- Cross-domain: corridor degradation vs road condition & planned works ----
  const segmentsByWard = new Map<string, RoadSegment[]>()
  for (const s of segments) {
    const list = segmentsByWard.get(s.wardId) ?? []
    list.push(s)
    segmentsByWard.set(s.wardId, list)
  }
  const crossDomainRows = corridors.map((c) => {
    const relevant = c.wardIds.flatMap((w) => segmentsByWard.get(w) ?? [])
    const avgCondition = relevant.length > 0 ? relevant.reduce((s, x) => s + x.conditionIndex, 0) / relevant.length : undefined
    const plannedClosures = relevant.filter((s) => s.closurePlanned).length
    return { corridor: c, avgCondition, plannedClosures }
  })

  const corridorColumns: Array<Column<TrafficCorridor>> = [
    { id: 'name', header: t('Corridor'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name, width: '15rem' },
    { id: 'freeflow', header: t('Free-flow speed'), cell: (r) => `${formatNumber(r.freeFlowSpeedKmph, 0)} km/h`, sortValue: (r) => r.freeFlowSpeedKmph, align: 'right', hideBelow: 'lg' },
    { id: 'peak', header: t('Peak-hour speed'), cell: (r) => `${formatNumber(r.peakSpeedKmph, 0)} km/h`, sortValue: (r) => r.peakSpeedKmph, align: 'right' },
    {
      id: 'congestion',
      header: t('Congestion index'),
      cell: (r) => (
        <div className="flex items-center gap-2">
          <MiniBar value={r.congestionIndex} />
          <span className="numeric text-xs font-semibold text-ink-700">{r.congestionIndex}</span>
        </div>
      ),
      sortValue: (r) => r.congestionIndex,
    },
    { id: 'incidents', header: t('Incidents (30d)'), cell: (r) => r.incidents30d, sortValue: (r) => r.incidents30d, align: 'right', hideBelow: 'md' },
    { id: 'closures', header: t('Closures'), cell: (r) => (r.closures > 0 ? <Badge tone="warn">{r.closures}</Badge> : <span className="text-ink-300">0</span>), sortValue: (r) => r.closures },
    { id: 'wards', header: t('Wards served'), cell: (r) => r.wardIds.map((w) => wardShortName(w)).join(', '), sortValue: (r) => r.wardIds.length, hideBelow: 'xl' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={breadcrumbs}
        freshness={FRESHNESS}
      />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Average congestion index')}
          value={Math.round(avgCongestion)}
          unit="/100"
          icon={<TrafficCone className="h-4 w-4" />}
          tone={avgCongestion >= DEGRADED_CONGESTION_THRESHOLD ? 'warn' : 'default'}
          background="red"
          footer={
            isBmc && activeCorporation.vehiclePopulationCount ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('For context: BMC\'s own Environment Status Report counts {0} registered vehicles citywide as of March {1} — ~2.94 lakh new registrations that year, +6.2% on the year before.', formatNumber(activeCorporation.vehiclePopulationCount), activeCorporation.vehiclePopulationAsOfYear ?? '-')}
              </span>
            ) : undefined
          }
        />
        <MetricCard label={t('Corridors degraded')} value={corridorsDegraded.length} support={t('of {0} corridors', corridors.length)} tone={corridorsDegraded.length > 0 ? 'warn' : 'default'} background="amber" />
        <MetricCard
          label={t('Incidents (30d)')}
          value={formatNumber(incidents30d)}
          tone={incidents30d > 0 ? 'warn' : 'default'}
          background="green"
          footer={
            isBmc && activeCorporation.roadAccidentFatalities ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('For context: Mumbai Traffic Police\'s official road-safety report recorded {0} road-accident fatalities citywide in {1} — a ~39-40% reduction versus 2015. Two/three-wheeler occupants and pedestrians are the largest victim categories.', activeCorporation.roadAccidentFatalities, activeCorporation.roadAccidentFatalitiesYear ?? '-')}
              </span>
            ) : undefined
          }
        />
        <MetricCard label={t('Active closures')} value={activeClosures} tone={activeClosures > 0 ? 'critical' : 'default'} icon={<Construction className="h-4 w-4" />} />
      </MetricGrid>

      {/* Two columns, read downward. The corridor register and the
          cross-domain reference carry the width; the map, the closures
          currently in force and the speed profile read beside them. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
        <GovPanel title={t('Corridor register')} tone="amber" dense>
          <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
            {t('Sortable and searchable. Select a row to highlight the corridor on the map.')}
          </p>
          <DataTable
            rows={corridors}
            columns={corridorColumns}
            rowKey={(r) => r.id}
            pageSize={10}
            searchPlaceholder="Search corridor or ward"
            onRowClick={(r) => setSelectedCorridorId(r.id === selectedCorridorId ? null : r.id)}
            activeRowKey={selectedCorridorId ?? undefined}
            initialSort={{ columnId: 'congestion', direction: 'desc' }}
            ariaLabel="Traffic corridor register"
          />
        </GovPanel>

        <GovPanel title={t('Cross-domain panel - corridor degradation, road condition and planned works')} tone="red" dense>
          <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
            {t('Average pavement condition and count of planned closures across the road segments in each corridor\'s served wards, set alongside the corridor\'s own congestion index.')}
          </p>
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-warn-200 bg-warn-50/70 px-3 py-2">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warn-700" aria-hidden />
            <p className="text-[0.6875rem] leading-relaxed text-warn-700">
              <span className="font-semibold">{t('Correlation, not causation.')}</span>{' '}{t('These figures share a ward, not a demonstrated cause. A corridor may be congested for reasons unrelated to pavement condition or planned works - junction geometry, signal timing, trip demand and enforcement all contribute. Any relationship shown here requires field assessment before it is treated as an explanation.')}
            </p>
          </div>
          <DataTable
            rows={crossDomainRows}
            rowKey={(r) => r.corridor.id}
            pageSize={10}
            searchable={false}
            initialSort={{ columnId: 'congestion', direction: 'desc' }}
            ariaLabel="Corridor degradation and road condition cross-reference"
            columns={[
              { id: 'corridor', header: t('Corridor'), cell: (r) => <span className="font-medium text-ink-900">{r.corridor.name}</span>, sortValue: (r) => r.corridor.name, width: '15rem' },
              {
                id: 'congestion',
                header: t('Congestion index'),
                cell: (r) => <Badge tone={r.corridor.congestionIndex >= 55 ? 'critical' : r.corridor.congestionIndex >= DEGRADED_CONGESTION_THRESHOLD ? 'warn' : 'positive'}>{r.corridor.congestionIndex}/100</Badge>,
                sortValue: (r) => r.corridor.congestionIndex,
              },
              {
                id: 'condition',
                header: t('Avg road condition (wards served)'),
                cell: (r) => (typeof r.avgCondition === 'number' ? `${Math.round(r.avgCondition)}/100` : <span className="text-ink-300">{t('No data')}</span>),
                sortValue: (r) => r.avgCondition ?? -1,
                align: 'right',
              },
              {
                id: 'works',
                header: t('Planned closures (wards served)'),
                cell: (r) => (r.plannedClosures > 0 ? <Badge tone="warn">{t('{0} segment(s)', r.plannedClosures)}</Badge> : <span className="text-ink-300">{t('None')}</span>),
                sortValue: (r) => r.plannedClosures,
                align: 'right',
              },
              { id: 'wardsServed', header: t('Wards served'), cell: (r) => r.corridor.wardIds.map((w) => wardShortName(w)).join(', '), sortValue: (r) => r.corridor.wardIds.length, hideBelow: 'lg' },
            ]}
          />
        </GovPanel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
        <GovPanel title={t('Corridor map')} tone="amber">
          <p className="mb-3 text-xs leading-relaxed text-ink-500">
            {t('Corridor geometry toned by congestion. Click a corridor row, or a ward the corridor serves, to highlight it - selection syncs between the map and the table.')}
          </p>
          <div className="mt-3">
            <CityMap
              layers={[
                {
                  id: 'congestion',
                  label: t('Corridor Congestion (ward average)'),
                  valueFor: (wardId) => average(congestionByWard.get(wardId)),
                  higherIsWorse: true,
                  unit: '/100 congestion',
                  description: t('Average congestion index of corridors serving the ward.'),
                },
              ]}
              paths={paths}
              selectedWardId={selectedCorridor?.wardIds[0] ?? null}
              onWardSelect={(wardId) => {
                const match = corridors.find((c) => c.wardIds.includes(wardId))
                if (match) setSelectedCorridorId(match.id === selectedCorridorId ? null : match.id)
              }}
              height={420}
            />
          </div>
          {selectedCorridor ? (
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
              <span className="font-semibold text-ink-700">{selectedCorridor.name}</span>{' '}{t('highlighted · congestion')}{' '}{selectedCorridor.congestionIndex}/100 ·{' '}
              {selectedCorridor.incidents30d}{' '}{t('incident(s) in 30 days ·')}{' '}{selectedCorridor.closures}{' '}{t('closure(s).')}
            </p>
          ) : null}
        </GovPanel>

          <GovPanel title={t('Junction & closure impact')} tone="green" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Corridors currently carrying one or more closures, ranked by count.')}
            </p>
            {closureImpact.length === 0 ? (
              <EmptyState compact className="m-4" title={t('No active closures')} detail="No corridor currently reports a closure." />
            ) : (
              <ul className="divide-y divide-ink-50">
                {closureImpact.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink-800">{c.name}</p>
                      <p className="mt-0.5 truncate text-[0.6875rem] text-ink-400">{c.wardIds.map((w) => wardShortName(w)).join(', ')}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge tone="warn">{t('{0} closure(s)', c.closures)}</Badge>
                      <Badge tone="muted">{t('Congestion {0}', c.congestionIndex)}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </GovPanel>


          <Card>
            <ChartFrame
              title={t('Congestion profile - free-flow vs peak-hour speed')}
              unit={'km/h'}
              timeframe="Current reporting position"
              description={t('Ranked by congestion index, highest first. The gap between free-flow and peak-hour speed is the corridor\'s congestion.')}
              height={Math.max(280, corridors.length * 26)}
            >
              <CategoryBarChart
                data={profileData}
                categoryKey="label"
                layout="horizontal"
                series={[
                  { key: 'freeFlow', label: t('Free-flow speed'), colour: CHART_COLOURS.neutral },
                  { key: 'peak', label: t('Peak-hour speed'), colour: CHART_COLOURS.primary },
                ]}
                showLegend
              />
            </ChartFrame>
          </Card>
        </div>
      </div>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default TrafficIntelligencePage
