import { useState } from 'react'
import { Activity, AlertTriangle, ChevronRight, Database, Droplets, Gauge, Layers, MapPin, Truck } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  DeltaBadge,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  StateBadge,
  toneForScore,
  SCORE_TONE_TEXT,
  type Column,
  type ScoreTone,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { ChartFrame, CategoryBarChart, RankedBarChart, CHART_COLOURS } from '@/components/charts'
import { CityMap } from '@/components/map/CityMap'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { usePageMasthead } from '@/stores/masthead.store'
import { waterService } from '@/services'
import { useContextStore, useDrawerStore } from '@/stores/ui.store'
import { wardName } from '@/data/reference'
import type { WaterAsset, WaterZone } from '@/types/city-domains'
import type { DataFreshness } from '@/types/common'
import { cn } from '@/utils/cn'
import { formatDate, formatNumber, formatPercent } from '@/utils/format'
import { DEMO_NOW } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Water Intelligence - city water position, reservoir status, zone register,
 * anomaly indicators and a City → Ward → Zone → Asset drilldown.
 */

function build$WATER_ASSET_TYPE_LABEL(): Record<WaterAsset['type'], string> {
  return {
  reservoir: t('Reservoir'),
  'pumping-station': t('Pumping Station'),
  'trunk-main': t('Trunk Main'),
  'service-reservoir': t('Service Reservoir'),
  'treatment-plant': t('Treatment Plant'),
}
}
let WATER_ASSET_TYPE_LABEL: Record<WaterAsset['type'], string> = build$WATER_ASSET_TYPE_LABEL()
registerLayer(() => {
  WATER_ASSET_TYPE_LABEL = build$WATER_ASSET_TYPE_LABEL()
})

function avgBy<T>(items: T[], selector: (item: T) => number): number {
  if (items.length === 0) return 0
  return items.reduce((sum, item) => sum + selector(item), 0) / items.length
}

function weightedAvg<T>(items: T[], weightOf: (item: T) => number, valueOf: (item: T) => number): number {
  const totalWeight = items.reduce((sum, item) => sum + weightOf(item), 0)
  if (totalWeight <= 0) return 0
  return items.reduce((sum, item) => sum + valueOf(item) * weightOf(item), 0) / totalWeight
}

const TANK_FILL_COLOUR: Record<ScoreTone, string> = {
  positive: 'var(--color-ok-500)',
  neutral: 'var(--color-govt-500)',
  warn: 'var(--color-warn-500)',
  risk: 'var(--color-risk-500)',
  critical: 'var(--color-crit-500)',
}

function ReservoirTank({ fillPct }: { fillPct: number }): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, fillPct))
  const tone = toneForScore(clamped)
  const width = 44
  const height = 68
  const fillHeight = (clamped / 100) * (height - 4)
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0">
      <rect x={1} y={1} width={width - 2} height={height - 2} rx={5} fill="var(--color-surface-sunken)" stroke="var(--color-ink-200)" strokeWidth={1} />
      <rect x={2} y={height - 2 - fillHeight} width={width - 4} height={fillHeight} rx={4} fill={TANK_FILL_COLOUR[tone]} opacity={0.88} />
      {[25, 50, 75].map((pct) => (
        <line
          key={pct}
          x1={1}
          x2={width - 1}
          y1={height - (pct / 100) * (height - 2) - 1}
          y2={height - (pct / 100) * (height - 2) - 1}
          stroke="var(--color-surface)"
          strokeWidth={0.75}
          opacity={0.6}
        />
      ))}
    </svg>
  )
}

/* ==========================================================================
   Page
   ========================================================================== */

export function WaterIntelligencePage(): React.JSX.Element {
  usePageMasthead(
    t('Water Intelligence'),
    t('City-wide supply and demand position, reservoir storage, zone-level service quality and a drilldown from the city, through ward and zone, to individual water assets.'),
  )

  /**
   * The drilldown answers to two things: the ward selected across the platform
   * in the command bar, and the ward or zone the operator drills into on this
   * page. Holding the drilldown purely locally made this the one ward-aware
   * screen that ignored the shared selection - an operator could narrow the
   * whole interface to Ward K/E and read city-wide water figures underneath.
   *
   * `from` records which shared selection the local drill was made against, so
   * the two compose without an effect and without either silently winning: a
   * new selection in the command bar governs the page, and drilling on the
   * page overrides it until the command bar moves again.
   */
  const contextWardId = useContextStore((s) => s.wardId)
  const [drillWardSelection, setDrillWardSelection] = useState<{ wardId: string | null; zoneId: string | null; from: string | null }>({
    wardId: null,
    zoneId: null,
    from: null,
  })

  const localIsCurrent = drillWardSelection.from === contextWardId
  const drillWardId = localIsCurrent ? drillWardSelection.wardId : contextWardId
  const drillZoneId = localIsCurrent ? drillWardSelection.zoneId : null

  function selectWard(id: string): void {
    setDrillWardSelection({ wardId: id, zoneId: null, from: contextWardId })
  }
  function selectZone(id: string): void {
    setDrillWardSelection({ wardId: null, zoneId: id, from: contextWardId })
  }
  function resetDrill(): void {
    setDrillWardSelection({ wardId: null, zoneId: null, from: contextWardId })
  }

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 30,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Water Intelligence') }]}
        freshness={freshness}
      />

      <CityPositionSection />

      {/* Two columns, read downward. The zone register, the drilldown it feeds
          and the zone charts are the working surface and carry the width; the
          reservoir position and the anomalies currently open read beside. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <ZoneSection onSelectWard={selectWard} onSelectZone={selectZone} activeZoneId={drillZoneId} />
          <DrilldownSection wardId={drillWardId} zoneId={drillZoneId} onReset={resetDrill} />
          <WaterChartsSection />
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <ReservoirSection />
          <AnomalySection />
        </div>
      </div>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default WaterIntelligencePage

/* ==========================================================================
   City Water Position
   ========================================================================== */

function CityPositionSection(): React.JSX.Element {
  const q = useServiceQuery(queryKeys.water('zones'), (u) => waterService.zones(u))
  if (q.isLoading) {
    return (
      <Card>
        <LoadingState variant="metrics" />
      </Card>
    )
  }
  if (q.error) {
    return (
      <Card>
        <ErrorState detail={q.error.message} onRetry={() => q.refetch()} />
      </Card>
    )
  }
  const zones = q.data ?? []
  if (zones.length === 0) {
    return (
      <Card>
        <EmptyState title={t('No water zones')} detail="No water distribution zone record is currently available." />
      </Card>
    )
  }

  const totalSupply = zones.reduce((s, z) => s + z.supplyMld, 0)
  const totalDemand = zones.reduce((s, z) => s + z.demandMld, 0)
  const totalDeficit = zones.reduce((s, z) => s + z.deficitMld, 0)
  const avgPressure = weightedAvg(zones, (z) => z.supplyMld, (z) => z.pressureM)
  const avgSupplyHours = weightedAvg(zones, (z) => z.supplyMld, (z) => z.supplyHours)
  const avgNrw = weightedAvg(zones, (z) => z.supplyMld, (z) => z.nrwPct)
  const avgQuality = weightedAvg(zones, (z) => z.supplyMld, (z) => z.qualityCompliancePct)
  const totalTankers = zones.reduce((s, z) => s + z.tankerTripsPerDay, 0)
  const totalInterruptions = zones.reduce((s, z) => s + z.interruptions30d, 0)
  const totalComplaints = zones.reduce((s, z) => s + z.complaints30d, 0)

  return (
    <Card>
      <CardHeader
        icon={<Activity className="h-4 w-4" />}
        title={t('City Water Position')}
        description={t('Aggregate supply-demand balance, network pressure and service reliability across every distribution zone.')}
      />
      <MetricGrid columns={5} className="mt-3">
        <MetricCard label={t('Supply')} value={formatNumber(totalSupply)} unit="MLD" icon={<Droplets className="h-4 w-4" />} />
        <MetricCard label={t('Demand')} value={formatNumber(totalDemand)} unit="MLD" />
        <MetricCard label={t('Deficit')} value={formatNumber(totalDeficit)} unit="MLD" tone={totalDeficit > 0 ? 'warn' : 'default'} />
        <MetricCard label={t('Average pressure')} value={formatNumber(avgPressure, 1)} unit="m" icon={<Gauge className="h-4 w-4" />} />
        <MetricCard label={t('Average supply hours')} value={formatNumber(avgSupplyHours, 1)} unit={'h/day'} />
      </MetricGrid>
      <MetricGrid columns={4} className="mt-3">
        <MetricCard size="sm" label={t('Non-revenue water')} value={formatPercent(avgNrw)} tone={avgNrw > 25 ? 'warn' : 'default'} />
        <MetricCard size="sm" label={t('Quality compliance')} value={formatPercent(avgQuality)} tone={avgQuality < 95 ? 'warn' : 'default'} />
        <MetricCard size="sm" label={t('Tanker dependency')} value={totalTankers} unit={'trips/day'} icon={<Truck className="h-4 w-4" />} />
        <MetricCard size="sm" label={t('Interruptions / complaints (30d)')} value={`${totalInterruptions} / ${totalComplaints}`} />
      </MetricGrid>
    </Card>
  )
}

/* ==========================================================================
   Reservoir Status
   ========================================================================== */

function ReservoirSection(): React.JSX.Element {
  const q = useServiceQuery(queryKeys.water('reservoirs'), (u) => waterService.reservoirs(u))
  if (q.isLoading) {
    return (
      <Card>
        <LoadingState variant="metrics" />
      </Card>
    )
  }
  if (q.error) {
    return (
      <Card>
        <ErrorState detail={q.error.message} onRetry={() => q.refetch()} />
      </Card>
    )
  }
  const reservoirs = q.data ?? []
  if (reservoirs.length === 0) {
    return (
      <Card>
        <EmptyState title={t('No reservoir data')} detail="No reservoir record is currently available." />
      </Card>
    )
  }

  const totalUseful = reservoirs.reduce((s, r) => s + r.usefulStorageMl, 0)
  const totalCurrent = reservoirs.reduce((s, r) => s + r.currentStorageMl, 0)
  const overallFillPct = totalUseful > 0 ? (totalCurrent / totalUseful) * 100 : 0
  const avgDaysOfSupply = avgBy(reservoirs, (r) => r.daysOfSupply)

  return (
    <Card>
      <CardHeader icon={<Database className="h-4 w-4" />} title={t('Reservoir Status')} description={t('Combined lake system storage - the position leadership asks for first.')} />
      <MetricGrid columns={2} className="mt-3">
        <MetricCard label={t('Combined fill')} value={formatPercent(overallFillPct)} tone={overallFillPct < 40 ? 'critical' : overallFillPct < 60 ? 'warn' : 'default'} />
        <MetricCard label={t('Useful storage')} value={formatNumber(totalCurrent)} unit={t('of {0} ML', formatNumber(totalUseful))} />
        <MetricCard label={t('Days of supply (avg)')} value={formatNumber(avgDaysOfSupply, 0)} unit="days" />
      </MetricGrid>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-2">
        {reservoirs.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border border-ink-100 p-3">
            <ReservoirTank fillPct={r.fillPct} />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink-900">{r.name}</p>
              <p className={cn('numeric text-lg font-semibold', SCORE_TONE_TEXT[toneForScore(r.fillPct)])}>{r.fillPct}%</p>
              <p className="text-[0.6875rem] text-ink-500">{t('{0} days supply', r.daysOfSupply)}</p>
              <div className="mt-1">
                <DeltaBadge value={r.fillPct - r.lastYearFillPct} unit=" pp" comparisonLabel="vs same period last year" />
              </div>
              <div className="mt-1">
                <StateBadge state={r.state} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ==========================================================================
   Zone map + register
   ========================================================================== */

function ZoneSection({
  onSelectWard,
  onSelectZone,
  activeZoneId,
}: {
  onSelectWard: (wardId: string) => void
  onSelectZone: (zoneId: string) => void
  activeZoneId: string | null
}): React.JSX.Element {
  const q = useServiceQuery(queryKeys.water('zones'), (u) => waterService.zones(u))
  if (q.isLoading) {
    return (
      <Card>
        <LoadingState variant="table" rows={8} />
      </Card>
    )
  }
  if (q.error) {
    return (
      <Card>
        <ErrorState detail={q.error.message} onRetry={() => q.refetch()} />
      </Card>
    )
  }
  const zones = q.data ?? []
  if (zones.length === 0) {
    return (
      <Card>
        <EmptyState title={t('No water zones')} detail="No water distribution zone record is currently available." />
      </Card>
    )
  }

  const nrwByWard = new Map<string, number>()
  for (const z of zones) {
    for (const w of z.wardIds) nrwByWard.set(w, z.nrwPct)
  }

  const columns: Array<Column<WaterZone>> = [
    { id: 'name', header: t('Zone'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name },
    { id: 'wards', header: t('Wards'), cell: (r) => r.wardIds.map((w) => wardName(w)).join(', '), searchValue: (r) => r.wardIds.map((w) => wardName(w)).join(' '), hideBelow: 'lg' },
    { id: 'supply', header: t('Supply'), cell: (r) => `${r.supplyMld} MLD`, sortValue: (r) => r.supplyMld, align: 'right' },
    { id: 'demand', header: t('Demand'), cell: (r) => `${r.demandMld} MLD`, sortValue: (r) => r.demandMld, align: 'right', hideBelow: 'md' },
    {
      id: 'deficit',
      header: t('Deficit'),
      cell: (r) => <span className={r.deficitMld > 0 ? 'font-semibold text-crit-700' : ''}>{r.deficitMld} MLD</span>,
      sortValue: (r) => r.deficitMld,
      align: 'right',
    },
    { id: 'pressure', header: t('Pressure'), cell: (r) => `${r.pressureM} m`, sortValue: (r) => r.pressureM, align: 'right', hideBelow: 'lg' },
    { id: 'hours', header: t('Supply hours'), cell: (r) => `${r.supplyHours} h`, sortValue: (r) => r.supplyHours, align: 'right', hideBelow: 'lg' },
    { id: 'nrw', header: 'NRW', cell: (r) => <Badge tone={toneForScore(r.nrwPct, false)}>{formatPercent(r.nrwPct)}</Badge>, sortValue: (r) => r.nrwPct },
    { id: 'leakage', header: t('Leakage index'), cell: (r) => r.leakageIndex, sortValue: (r) => r.leakageIndex, align: 'right', hideBelow: 'xl' },
    { id: 'quality', header: t('Quality compliance'), cell: (r) => formatPercent(r.qualityCompliancePct), sortValue: (r) => r.qualityCompliancePct, align: 'right', hideBelow: 'md' },
    { id: 'tankers', header: t('Tanker trips'), cell: (r) => r.tankerTripsPerDay, sortValue: (r) => r.tankerTripsPerDay, align: 'right', hideBelow: 'xl' },
    { id: 'complaints', header: t('Complaints (30d)'), cell: (r) => r.complaints30d, sortValue: (r) => r.complaints30d, align: 'right', hideBelow: 'lg' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <Card flush>
      <CardHeader
        className="px-4 pt-4 pb-3"
        icon={<Layers className="h-4 w-4" />}
        title={t('Water Distribution Zones')}
        description={t('Every zone\'s supply-demand balance and service quality. Click a zone row, or a ward on the map, to drill down to assets.')}
      />
      <div className="px-4 pb-3">
        <CityMap
          layers={[
            {
              id: 'nrw',
              label: t('Non-Revenue Water'),
              valueFor: (id) => nrwByWard.get(id),
              higherIsWorse: true,
              unit: '%',
              description: t('Non-revenue water percentage for the zone serving this ward.'),
            },
          ]}
          onWardSelect={onSelectWard}
          height={340}
        />
      </div>
      <DataTable
        rows={zones}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={(r) => onSelectZone(r.id)}
        activeRowKey={activeZoneId ?? undefined}
        pageSize={10}
        searchPlaceholder="Search zones or wards"
        initialSort={{ columnId: 'deficit', direction: 'desc' }}
        ariaLabel="Water distribution zone register"
      />
    </Card>
  )
}

/* ==========================================================================
   Anomaly indicators
   ========================================================================== */

function AnomalySection(): React.JSX.Element {
  const q = useServiceQuery(queryKeys.water('anomalies'), (u) => waterService.anomalies(u))
  if (q.isLoading) {
    return (
      <Card>
        <LoadingState variant="block" rows={3} />
      </Card>
    )
  }
  if (q.error) {
    return (
      <Card>
        <ErrorState detail={q.error.message} onRetry={() => q.refetch()} />
      </Card>
    )
  }
  const anomalies = q.data ?? []

  return (
    <Card>
      <CardHeader
        icon={<AlertTriangle className="h-4 w-4" />}
        title={t('Anomaly Indicators')}
        description={t('Zones with a data pattern flagged for review. An anomaly is a statistical departure from the expected pattern - it is not evidence of fraud, and no individual\'s or contractor\'s conduct is characterised by this indicator.')}
      />
      {anomalies.length === 0 ? (
        <EmptyState compact className="mt-3" title={t('No anomalies flagged')} detail="No water zone currently carries a flagged anomaly." />
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {anomalies.map((a) => (
            <div key={a.zoneId} className="rounded-lg border border-warn-200 bg-warn-50/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-ink-900">{a.zoneName}</p>
                <Badge tone="warn">{a.issues.length} flagged</Badge>
              </div>
              <p className="mt-0.5 text-[0.6875rem] text-ink-500">{a.wardIds.map((w) => wardName(w)).join(', ')}</p>
              <ul className="mt-2 space-y-1">
                {a.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-warn-700">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ==========================================================================
   Drilldown - City → Ward → Zone → Asset
   ========================================================================== */

function DrilldownSection({
  wardId,
  zoneId,
  onReset,
}: {
  wardId: string | null
  zoneId: string | null
  onReset: () => void
}): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const q = useServiceQuery(
    ['bmc-mii', 'water-drilldown', wardId ?? '', zoneId ?? ''],
    (u) => waterService.drilldown(u, { wardId: wardId ?? undefined, zoneId: zoneId ?? undefined }),
    { enabled: Boolean(wardId || zoneId) },
  )

  const breadcrumb: Array<{ label: string; onClick?: () => void }> = [{ label: t('City'), onClick: wardId || zoneId ? onReset : undefined }]
  if (wardId) breadcrumb.push({ label: wardName(wardId) })
  if (q.data?.zone) breadcrumb.push({ label: q.data.zone.name })
  if (selectedAssetId) {
    const asset = q.data?.assets.find((a) => a.id === selectedAssetId)
    if (asset) breadcrumb.push({ label: asset.name })
  }

  let content: React.ReactNode
  if (!wardId && !zoneId) {
    content = <EmptyState compact className="mx-4 mb-4" title={t('Nothing selected')} detail="Select a ward on the map, or a zone in the table above, to begin drilling down." />
  } else if (q.isLoading) {
    content = (
      <div className="px-4 pb-4">
        <LoadingState variant="table" rows={4} />
      </div>
    )
  } else if (q.error) {
    content = (
      <div className="px-4 pb-4">
        <ErrorState detail={q.error.message} onRetry={() => q.refetch()} />
      </div>
    )
  } else if (!q.data) {
    content = null
  } else {
    const result = q.data
    content = (
      <div className="px-4 pb-4">
        {result.zone ? (
          <MetricGrid columns={4} className="mb-3">
            <MetricCard size="sm" label={t('Supply')} value={`${result.zone.supplyMld} MLD`} />
            <MetricCard size="sm" label={t('Deficit')} value={`${result.zone.deficitMld} MLD`} tone={result.zone.deficitMld > 0 ? 'warn' : 'default'} />
            <MetricCard size="sm" label={t('Pressure')} value={`${result.zone.pressureM} m`} />
            <MetricCard size="sm" label="NRW" value={formatPercent(result.zone.nrwPct)} />
          </MetricGrid>
        ) : null}
        {result.assets.length === 0 ? (
          <EmptyState compact title={t('No assets recorded')} detail="No water asset record is mapped to this selection." />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {result.assets.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setSelectedAssetId(a.id)
                  openDrawer({ kind: 'asset', id: a.id })
                }}
                className={cn(
                  'rounded-lg border p-3 text-left transition-shadow hover:shadow-raised',
                  selectedAssetId === a.id ? 'border-govt-300 shadow-raised' : 'border-ink-100',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-ink-900">{a.name}</span>
                  <StateBadge state={a.state} />
                </div>
                <p className="mt-1 text-[0.6875rem] text-ink-500">
                  {WATER_ASSET_TYPE_LABEL[a.type]} · {wardName(a.wardId)}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[0.6875rem]">
                  <div>
                    <span className="text-ink-400">{t('Capacity')}</span>
                    <p className="numeric font-semibold text-ink-800">{a.capacityMld} MLD</p>
                  </div>
                  <div>
                    <span className="text-ink-400">{t('Condition')}</span>
                    <p className={cn('numeric font-semibold', SCORE_TONE_TEXT[toneForScore(a.conditionIndex)])}>{a.conditionIndex}/100</p>
                  </div>
                </div>
                <p className="mt-1.5 text-[0.625rem] text-ink-400">{t('Last maintained {0}', formatDate(a.lastMaintenanceAt))}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Card flush>
      <CardHeader
        className="px-4 pt-4 pb-3"
        icon={<MapPin className="h-4 w-4" />}
        title={t('Drilldown - City → Ward → Zone → Asset')}
        description={t('Select a ward on the map or a zone in the table above to inspect the water assets serving it.')}
      />
      <div className="flex flex-wrap items-center gap-1 px-4 pb-3 text-xs">
        {breadcrumb.map((b, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 ? <ChevronRight className="h-3 w-3 text-ink-300" /> : null}
            {b.onClick ? (
              <Button size="xs" variant="ghost" onClick={b.onClick}>
                {b.label}
              </Button>
            ) : (
              <span className={i === breadcrumb.length - 1 ? 'font-semibold text-ink-800' : 'text-ink-500'}>{b.label}</span>
            )}
          </span>
        ))}
      </div>
      {content}
    </Card>
  )
}

/* ==========================================================================
   Charts - supply vs demand, NRW distribution, pressure profile
   ========================================================================== */

function WaterChartsSection(): React.JSX.Element {
  const q = useServiceQuery(queryKeys.water('zones'), (u) => waterService.zones(u))
  if (q.isLoading) {
    return (
      <Card>
        <LoadingState variant="chart" />
      </Card>
    )
  }
  if (q.error) {
    return (
      <Card>
        <ErrorState detail={q.error.message} onRetry={() => q.refetch()} />
      </Card>
    )
  }
  const zones = q.data ?? []
  if (zones.length === 0) {
    return (
      <Card>
        <EmptyState title={t('No zone data')} detail="No water distribution zone record is currently available." />
      </Card>
    )
  }

  const avgPressure = avgBy(zones, (z) => z.pressureM)
  const avgNrw = avgBy(zones, (z) => z.nrwPct)

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="xl:col-span-2">
        <ChartFrame
          title={t('Supply vs demand by zone')}
          unit="MLD"
          timeframe="Current reporting period, by zone"
          description={t('A cross-sectional comparison across zones for the current period - not a time series.')}
        >
          <CategoryBarChart
            data={zones.map((z) => ({ label: z.name.length > 14 ? `${z.name.slice(0, 12)}…` : z.name, supply: z.supplyMld, demand: z.demandMld }))}
            series={[
              { key: 'supply', label: t('Supply'), colour: CHART_COLOURS.primary },
              { key: 'demand', label: t('Demand'), colour: CHART_COLOURS.warn },
            ]}
            layout="vertical"
            unit="MLD"
            showLegend
          />
        </ChartFrame>
      </Card>
      <Card>
        <ChartFrame title={t('Non-revenue water by zone')} unit="%" timeframe="Current position, ranked" footnote={t('Citywide average: {0}.', formatPercent(avgNrw))}>
          <RankedBarChart data={[...zones].sort((a, b) => b.nrwPct - a.nrwPct).map((z) => ({ label: z.name.length > 16 ? `${z.name.slice(0, 14)}…` : z.name, value: z.nrwPct }))} unit="%" />
        </ChartFrame>
      </Card>
      <Card>
        <ChartFrame title={t('Pressure profile by zone')} unit="m" timeframe="Current position" footnote={t('Dashed line marks the citywide average of {0} m.', formatNumber(avgPressure, 1))}>
          <CategoryBarChart
            data={zones.map((z) => ({ label: z.name.length > 10 ? `${z.name.slice(0, 9)}…` : z.name, pressure: z.pressureM }))}
            series={[{ key: 'pressure', label: t('Pressure'), colour: CHART_COLOURS.intel }]}
            layout="horizontal"
            unit="m"
            referenceValue={avgPressure}
            referenceLabel="City average"
          />
        </ChartFrame>
      </Card>
    </div>
  )
}
