import { useState } from 'react'
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  CloudRain,
  Droplets,
  Gauge,
  HeartPulse,
  MapPin,
  PlusCircle,
  Route,
  Send,
  ShieldAlert,
  Siren,
  SlidersHorizontal,
  Waves,
} from 'lucide-react'
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
  ScoreDial,
  SimulationBadge,
  StateBadge,
  type ScoreTone,
  toneForScore,
  SCORE_TONE_TEXT,
  type Column,
} from '@/components/ui'
import { MetricCard, IncidentCard } from '@/components/cards'
import { ChartFrame, ContributionBars, RankedBarChart, MiniBar } from '@/components/charts'
import { CityMap, jitteredWardPoint, type MapMarker } from '@/components/map/CityMap'
import { useServiceQuery, useServiceAction, useActivityLog } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { monsoonService, healthService, incidentService } from '@/services'
import type { DeployTeamInput, IncidentCreateInput, MonsoonScenarioPreset } from '@/services'
import { MONSOON_SCENARIO_PRESETS, DEFAULT_MONSOON_SCENARIO, SIMULATION_STATEMENT } from '@/domains'
import { useCurrentUser } from '@/stores/auth.store'
import { useActiveCorporation } from '@/stores/corporation.store'
import { useDrawerStore } from '@/stores/ui.store'
import { allowed } from '@/security'
import { wardName } from '@/data/reference'
import type {
  MonsoonScenarioInput,
  MonsoonScenarioResult,
  PumpingStation,
  StormWaterDrain,
  WardMonsoonReadiness,
  WeatherAlertColour,
} from '@/types/city-domains'
import type { ResponseTeam } from '@/types/operations'
import type { DataFreshness, Severity } from '@/types/common'
import { cn } from '@/utils/cn'
import { formatCompact, formatDateTime, formatNumber, formatPercent, formatRelative, formatShortDate, formatTime, titleCase } from '@/utils/format'
import { DEMO_NOW } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * The IMD colour scale, in the platform's own tone vocabulary.
 *
 * Four distinct badge tones so yellow and orange never collapse into the same
 * chip: the difference between "be updated" and "be prepared" is the
 * difference between a ward officer reading a bulletin and a ward officer
 * manning a pump.
 */
const ALERT_CARD_TONE: Record<WeatherAlertColour, 'positive' | 'warn' | 'critical'> = {
  green: 'positive',
  yellow: 'warn',
  orange: 'warn',
  red: 'critical',
}

const ALERT_BADGE_TONE: Record<WeatherAlertColour, ScoreTone> = {
  green: 'positive',
  yellow: 'warn',
  orange: 'risk',
  red: 'critical',
}

function build$ALERT_COLOUR_LABEL(): Record<WeatherAlertColour, string> {
  return {
  green: t('Green'),
  yellow: t('Yellow'),
  orange: t('Orange'),
  red: t('Red'),
}
}
let ALERT_COLOUR_LABEL: Record<WeatherAlertColour, string> = build$ALERT_COLOUR_LABEL()
registerLayer(() => {
  ALERT_COLOUR_LABEL = build$ALERT_COLOUR_LABEL()
})

/**
 * The active corporation's Monsoon Intelligence Centre.
 *
 * Preparedness, live-observed rainfall/tide/pump/drain position, and a
 * deterministic scenario tool for compound-event planning. Every scenario
 * output is clearly marked as a simulation - never a forecast.
 */

function avgBy<T>(items: T[], selector: (item: T) => number): number {
  if (items.length === 0) return 0
  return items.reduce((sum, item) => sum + selector(item), 0) / items.length
}

function groupAvgByWard<T>(items: T[], wardOf: (item: T) => string, valueOf: (item: T) => number): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>()
  for (const item of items) {
    const wardId = wardOf(item)
    const entry = sums.get(wardId) ?? { total: 0, count: 0 }
    entry.total += valueOf(item)
    entry.count += 1
    sums.set(wardId, entry)
  }
  const out = new Map<string, number>()
  for (const [wardId, entry] of sums) out.set(wardId, entry.count > 0 ? entry.total / entry.count : 0)
  return out
}

function responseTeamTypeFor(resource: string): ResponseTeam['type'] {
  const lower = resource.toLowerCase()
  if (lower.includes('dewatering')) return 'dewatering'
  if (lower.includes('desilting') || lower.includes('engineering')) return 'engineering'
  return 'disaster-response'
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit: string
  onChange: (v: number) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink-600">{label}</span>
        <span className="numeric text-xs font-semibold text-ink-800">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-100 accent-govt-600 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="mt-0.5 flex justify-between text-[0.625rem] text-ink-400">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  )
}

/* ==========================================================================
   Page
   ========================================================================== */

export function MonsoonIntelligencePage(): React.JSX.Element {
  const user = useCurrentUser()
  const corporation = useActiveCorporation()
  const [focusWardId, setFocusWardId] = useState<string | null>(null)
  const [committedInputs, setCommittedInputs] = useState<MonsoonScenarioInput>(DEFAULT_MONSOON_SCENARIO)
  const hasScenarioAccess = allowed(user, 'situation-room', 'edit', { domain: 'monsoon' })

  const scenarioQuery = useServiceQuery(
    ['bmc-mii', 'monsoon-scenario', JSON.stringify(committedInputs)],
    (u) => monsoonService.runScenario(u, committedInputs),
    { enabled: hasScenarioAccess },
  )
  const driverQuery = useServiceQuery(
    ['bmc-mii', 'monsoon-driver-breakdown', JSON.stringify(committedInputs)],
    (u) => monsoonService.driverBreakdown(u, committedInputs),
  )

  function toggleFocusWard(id: string): void {
    setFocusWardId((prev) => (prev === id ? null : id))
  }

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 15,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        title={t('{0} Monsoon Intelligence Centre', corporation.city)}
        description={t('City-wide preparedness posture, live-observed rainfall, tide and pumping position, and a deterministic scenario tool for compound flood-event planning. Scenario output is always a simulation, never a forecast.')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Monsoon Intelligence') }]}
        freshness={freshness}
      />

      <MonsoonPositionSection
        focusWardId={focusWardId}
        onSelectWard={toggleFocusWard}
        scenarioResult={scenarioQuery.data}
        hasScenarioAccess={hasScenarioAccess}
      />
      <PumpingStationSection focusWardId={focusWardId} />
      <DrainRiskSection focusWardId={focusWardId} />
      <HighTideSection />
      <RainfallSection focusWardId={focusWardId} />
      <CriticalRouteSection />
      <HospitalAccessSection />
      <WardPreparednessSection focusWardId={focusWardId} />
      <MonsoonScenarioCentre
        committedInputs={committedInputs}
        onRunScenario={setCommittedInputs}
        scenarioResult={scenarioQuery.data}
        scenarioLoading={scenarioQuery.isFetching}
        scenarioErrorMessage={scenarioQuery.error?.message ?? null}
        driverBreakdown={driverQuery.data}
        hasScenarioAccess={hasScenarioAccess}
      />
      <ActiveResponseSection />

      <DemonstrationNotice />
    </PageBody>
  )
}

export default MonsoonIntelligencePage

/* ==========================================================================
   Position + Waterlogging Risk Map
   ========================================================================== */

function MonsoonPositionSection({
  focusWardId,
  onSelectWard,
  scenarioResult,
  hasScenarioAccess,
}: {
  focusWardId: string | null
  onSelectWard: (id: string) => void
  scenarioResult: MonsoonScenarioResult | undefined
  hasScenarioAccess: boolean
}): React.JSX.Element {
  const readinessQuery = useServiceQuery(queryKeys.monsoon('readiness'), (u) => monsoonService.readiness(u))
  const rainfallQuery = useServiceQuery(queryKeys.monsoon('rainfall'), (u) => monsoonService.rainfall(u))
  const tidesQuery = useServiceQuery(queryKeys.monsoon('tides'), (u) => monsoonService.tides(u))
  const pumpsQuery = useServiceQuery(queryKeys.monsoon('pumping-stations'), (u) => monsoonService.pumpingStations(u))
  const drainsQuery = useServiceQuery(queryKeys.monsoon('drains'), (u) => monsoonService.drains(u))
  const spotsQuery = useServiceQuery(queryKeys.monsoon('waterlogging-spots'), (u) => monsoonService.waterloggingSpots(u))
  const hospitalsQuery = useServiceQuery(queryKeys.health('hospitals'), (u) => healthService.hospitals(u))
  const alertQuery = useServiceQuery(queryKeys.monsoon('weather-alert'), (u) => monsoonService.weatherAlert(u))

  const queries = [readinessQuery, rainfallQuery, tidesQuery, pumpsQuery, drainsQuery, spotsQuery, hospitalsQuery, alertQuery]
  if (queries.some((q) => q.isLoading)) {
    return (
      <div className="space-y-4">
        <LoadingState variant="metrics" />
        <LoadingState variant="chart" />
      </div>
    )
  }
  const failedQuery = queries.find((q) => q.error)
  if (failedQuery) {
    return <ErrorState detail={failedQuery.error?.message} onRetry={() => queries.forEach((q) => q.refetch())} />
  }

  const readiness = readinessQuery.data ?? []
  const rainfall = rainfallQuery.data ?? []
  const tides = tidesQuery.data ?? []
  const pumps = pumpsQuery.data ?? []
  const drains = drainsQuery.data ?? []
  const spots = spotsQuery.data ?? []
  const hospitals = hospitalsQuery.data ?? []
  const alert = alertQuery.data ?? null

  if (readiness.length === 0) {
    return <EmptyState title={t('No monsoon position data')} detail="No monsoon readiness record is currently available." />
  }

  const avgReadiness = avgBy(readiness, (r) => r.readinessScore)
  const avgRainfall24h = avgBy(rainfall, (r) => r.last24hMm)
  const peakStation = [...rainfall].sort((a, b) => b.last24hMm - a.last24hMm)[0]
  const nextHighTide = tides.filter((tideWindow) => tideWindow.type === 'high').sort((a, b) => a.at.localeCompare(b.at))[0]
  const pumpsOperational = pumps.reduce((s, p) => s + p.pumpsOperational, 0)
  const pumpsTotal = pumps.reduce((s, p) => s + p.pumpsTotal, 0)
  const pumpAvailabilityPct = pumpsTotal > 0 ? (pumpsOperational / pumpsTotal) * 100 : 0
  const avgDesilting = avgBy(drains, (d) => d.desiltingCompletionPct)
  const chronicAtRisk = spots.filter((s) => s.currentRisk >= 60).length

  const spotRiskByWard = groupAvgByWard(spots, (s) => s.wardId, (s) => s.currentRisk)
  const drainRiskByWard = groupAvgByWard(drains, (d) => d.wardId, (d) => d.blockageRisk)
  const pumpReadinessByWard = groupAvgByWard(pumps, (p) => p.wardId, (p) => p.readinessIndex)
  const wardReadinessByWard = new Map(readiness.map((r) => [r.wardId, r.readinessScore]))
  const scenarioRiskByWard = new Map((scenarioResult?.wardRisks ?? []).map((w) => [w.wardId, w.scenarioRisk]))

  const markerIndex = new Map<string, number>()
  const nextIdx = (wardId: string): number => {
    const idx = markerIndex.get(wardId) ?? 0
    markerIndex.set(wardId, idx + 1)
    return idx
  }
  const markers: MapMarker[] = [
    ...spots.map((s) => {
      const p = jitteredWardPoint(s.wardId, nextIdx(s.wardId))
      return {
        id: `spot-${s.id}`,
        x: p.x,
        y: p.y,
        label: s.name,
        detail: t('Waterlogging spot · chronic index {0} · current risk {1}/100{2}', s.chronicIndex, s.currentRisk, s.criticalRoute ? ' · critical route' : ''),
        severity: s.currentRisk >= 70 ? ('critical' as const) : s.currentRisk >= 50 ? ('high' as const) : undefined,
        kind: 'hotspot' as const,
        onClick: () => onSelectWard(s.wardId),
      }
    }),
    ...pumps.map((p) => {
      const pt = jitteredWardPoint(p.wardId, nextIdx(p.wardId))
      return {
        id: `pump-${p.id}`,
        x: pt.x,
        y: pt.y,
        label: p.name,
        detail: t('Pumping station · {0}/{1} operational · readiness {2}/100', p.pumpsOperational, p.pumpsTotal, p.readinessIndex),
        kind: 'station' as const,
        onClick: () => onSelectWard(p.wardId),
      }
    }),
    ...hospitals.map((h) => {
      const pt = jitteredWardPoint(h.wardId, nextIdx(h.wardId))
      return {
        id: `hosp-${h.id}`,
        x: pt.x,
        y: pt.y,
        label: h.name,
        detail: t('Hospital · accessibility {0}/100', h.accessibilityIndex),
        kind: 'hospital' as const,
        onClick: () => onSelectWard(h.wardId),
      }
    }),
  ]

  const layers = [
    { id: 'flood-risk', label: t('Flood Risk'), valueFor: (id: string) => spotRiskByWard.get(id), higherIsWorse: true, unit: '/100', description: t('Average modelled risk across the chronic waterlogging locations recorded in the ward.') },
    { id: 'ward-readiness', label: t('Ward Readiness'), valueFor: (id: string) => wardReadinessByWard.get(id), higherIsWorse: false, unit: '/100', description: t('Composite monsoon preparedness score for the ward.') },
    { id: 'drain-risk', label: t('Drain Risk'), valueFor: (id: string) => drainRiskByWard.get(id), higherIsWorse: true, unit: '/100', description: t('Average blockage risk across storm water drains in the ward.') },
    { id: 'pump-readiness', label: t('Pump Readiness'), valueFor: (id: string) => pumpReadinessByWard.get(id), higherIsWorse: false, unit: '/100', description: t('Average readiness index of pumping stations serving the ward.') },
    ...(scenarioResult
      ? [
          {
            id: 'scenario-risk',
            label: t('Scenario Risk (Simulated)'),
            valueFor: (id: string) => scenarioRiskByWard.get(id),
            higherIsWorse: true,
            unit: '/100 · simulated',
            description: SIMULATION_STATEMENT,
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------------
          The city's current warning, in the vocabulary the country's control
          rooms already run on. IMD issues warnings against the district on a
          four-step colour scale, and every escalation, deployment and school
          closure decision is taken against it - so the platform states the
          city's condition in that scale rather than in one of its own.
         ------------------------------------------------------------------ */}
      {alert ? (
        <Card tone={ALERT_CARD_TONE[alert.colour]} className="flex items-start gap-3">
          <Siren className={cn('mt-0.5 h-4 w-4 shrink-0', alert.colour === 'green' ? 'text-ok-700' : 'text-warn-700')} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ALERT_BADGE_TONE[alert.colour]}>{ALERT_COLOUR_LABEL[alert.colour]}</Badge>
              <p className="text-[0.8125rem] font-semibold text-ink-900">{alert.headline}</p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              {alert.bandLabel} - {alert.advisory}
            </p>
            {alert.drivers.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {alert.drivers.map((driver) => (
                  <li key={driver} className="text-[0.6875rem] leading-relaxed text-ink-500">
                    {driver}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-[0.6875rem] text-ink-400">
              {t('Issued {0}, in force until {1}. Classification follows the IMD 24-hour rainfall bands.', formatDateTime(alert.issuedAt), formatDateTime(alert.validUntil))}
            </p>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          icon={<Gauge className="h-4 w-4" />}
          title={t('Monsoon Readiness - City Position')}
          description={t('Preparedness posture, observed rainfall and tide conditions, and pumping and desilting position across every ward.')}
        />
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-center">
          <ScoreDial score={avgReadiness} size={104} label="/100" caption={t('Monsoon readiness')} />
          <MetricGrid columns={3} className="flex-1">
            <MetricCard
              label={t('Rainfall (24h)')}
              value={formatNumber(avgRainfall24h)}
              unit={t('mm avg')}
              support={peakStation ? `Peak ${peakStation.last24hMm} mm at ${peakStation.stationName}` : undefined}
              icon={<CloudRain className="h-4 w-4" />}
            />
            <MetricCard
              label={t('Next high tide')}
              value={nextHighTide ? `${nextHighTide.heightM} m` : '-'}
              support={nextHighTide ? `${formatTime(nextHighTide.at)}${nextHighTide.blocksDischarge ? ' · blocks discharge' : ''}` : 'No tide window recorded'}
              tone={nextHighTide?.blocksDischarge ? 'warn' : 'default'}
              icon={<Waves className="h-4 w-4" />}
            />
            <MetricCard
              label={t('Pump availability')}
              value={formatPercent(pumpAvailabilityPct)}
              support={t('{0} of {1} pumps operational', pumpsOperational, pumpsTotal)}
              tone={pumpAvailabilityPct < 75 ? 'warn' : 'default'}
            />
            <MetricCard label={t('Desilting completion')} value={formatPercent(avgDesilting)} tone={avgDesilting < 85 ? 'warn' : 'default'} />
            <MetricCard
              label={t('Chronic locations at risk')}
              value={chronicAtRisk}
              support={t('of {0} chronic locations', spots.length)}
              tone={chronicAtRisk > 0 ? 'warn' : 'default'}
            />
            <MetricCard
              label={
                <span className="inline-flex items-center gap-1">
                  {t('Population exposed')}{' '}<SimulationBadge />
                </span>
              }
              value={hasScenarioAccess ? (scenarioResult ? formatCompact(scenarioResult.estimatedPopulationExposed) : '-') : '-'}
              support={hasScenarioAccess ? 'Modelled - see Scenario Centre below' : 'Requires Situation Room scenario access'}
            />
          </MetricGrid>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t('Waterlogging Risk Map')}
          description={t('Layer between flood risk, ward readiness, drain risk and pump readiness. Markers show chronic waterlogging locations, pumping stations and hospitals. Click a ward or marker to filter the panels below.')}
        />
        {focusWardId ? (
          <div className="mt-2 flex items-center gap-2">
            <Badge tone="info" icon={<MapPin className="h-3 w-3" />}>
              {t('Filtered to {0}', wardName(focusWardId))}
            </Badge>
            <Button size="xs" variant="ghost" onClick={() => onSelectWard(focusWardId)}>
              {t('Clear filter')}
            </Button>
          </div>
        ) : null}
        <div className="mt-3">
          <CityMap layers={layers} selectedWardId={focusWardId} onWardSelect={onSelectWard} markers={markers} height={440} />
        </div>
      </Card>
    </div>
  )
}

/* ==========================================================================
   Pumping Station Status
   ========================================================================== */

function PumpingStationSection({ focusWardId }: { focusWardId: string | null }): React.JSX.Element {
  const q = useServiceQuery(queryKeys.monsoon('pumping-stations'), (u) => monsoonService.pumpingStations(u))

  if (q.isLoading) {
    return (
      <Card>
        <LoadingState variant="table" rows={6} />
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
  const all = q.data ?? []
  const rows = focusWardId ? all.filter((p) => p.wardId === focusWardId) : all

  const columns: Array<Column<PumpingStation>> = [
    { id: 'name', header: t('Station'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    {
      id: 'pumps',
      header: t('Pumps (op./total)'),
      cell: (r) => (
        <span className="numeric">
          {r.pumpsOperational}/{r.pumpsTotal}
        </span>
      ),
      sortValue: (r) => (r.pumpsTotal > 0 ? r.pumpsOperational / r.pumpsTotal : 0),
    },
    { id: 'capacity', header: t('Capacity'), cell: (r) => `${r.capacityCumecs} cumecs`, sortValue: (r) => r.capacityCumecs, align: 'right', hideBelow: 'lg' },
    {
      id: 'standby',
      header: t('Standby power'),
      cell: (r) => (r.standbyPowerAvailable ? <Badge tone="positive">{t('Available')}</Badge> : <Badge tone="critical">{t('Not available')}</Badge>),
      sortValue: (r) => (r.standbyPowerAvailable ? 1 : 0),
    },
    { id: 'readiness', header: t('Readiness index'), cell: (r) => <Badge tone={toneForScore(r.readinessIndex)}>{r.readinessIndex}</Badge>, sortValue: (r) => r.readinessIndex },
    { id: 'tested', header: t('Last tested'), cell: (r) => formatRelative(r.lastTestedAt), sortValue: (r) => r.lastTestedAt, hideBelow: 'lg' },
    { id: 'hours', header: t('Hours run (30d)'), cell: (r) => r.hoursRun30d, sortValue: (r) => r.hoursRun30d, align: 'right', hideBelow: 'xl' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <Card flush>
      <CardHeader
        className="px-4 pt-4 pb-3"
        icon={<Building2 className="h-4 w-4" />}
        title={t('Pumping Station Status')}
        description={t('Operational pump count, standby power, readiness and recent duty cycle for every dewatering station.')}
      />
      {focusWardId ? <p className="px-4 pb-2 text-[0.6875rem] text-ink-400">{t('Filtered to {0}.', wardName(focusWardId))}</p> : null}
      {rows.length === 0 ? (
        <EmptyState compact className="mx-4 mb-4" title={t('No pumping stations')} detail="No pumping station record matches the current filter." />
      ) : (
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} pageSize={8} searchPlaceholder="Search stations" initialSort={{ columnId: 'readiness', direction: 'asc' }} ariaLabel="Pumping station register" />
      )}
    </Card>
  )
}

/* ==========================================================================
   Drain Risk
   ========================================================================== */

function DrainRiskSection({ focusWardId }: { focusWardId: string | null }): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const q = useServiceQuery(queryKeys.monsoon('drains'), (u) => monsoonService.drains(u))

  if (q.isLoading) {
    return (
      <Card>
        <LoadingState variant="table" rows={6} />
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
  const all = q.data ?? []
  const rows = focusWardId ? all.filter((d) => d.wardId === focusWardId) : all
  const rankedByRisk = [...rows].sort((a, b) => b.blockageRisk - a.blockageRisk)
  const selected = rows.find((d) => d.id === selectedId) ?? rankedByRisk[0]

  const columns: Array<Column<StormWaterDrain>> = [
    { id: 'name', header: t('Drain'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'type', header: t('Type'), cell: (r) => <Badge tone="neutral">{titleCase(r.type)}</Badge>, sortValue: (r) => r.type, hideBelow: 'md' },
    { id: 'length', header: t('Length'), cell: (r) => `${r.lengthKm} km`, sortValue: (r) => r.lengthKm, align: 'right', hideBelow: 'lg' },
    {
      id: 'desilting',
      header: t('Desilting'),
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <MiniBar value={r.desiltingCompletionPct} width={56} />
          <span className="numeric text-[0.6875rem]">{r.desiltingCompletionPct}%</span>
        </span>
      ),
      sortValue: (r) => r.desiltingCompletionPct,
    },
    { id: 'risk', header: t('Blockage risk'), cell: (r) => <Badge tone={toneForScore(r.blockageRisk, false)}>{r.blockageRisk}</Badge>, sortValue: (r) => r.blockageRisk },
    { id: 'encroachment', header: t('Encroachment reports'), cell: (r) => r.encroachmentReports, sortValue: (r) => r.encroachmentReports, align: 'right', hideBelow: 'xl' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <Card flush>
      <CardHeader
        className="px-4 pt-4 pb-3"
        icon={<Droplets className="h-4 w-4" />}
        title={t('Drain Risk')}
        description={t('Storm water drains ranked by modelled blockage risk. Select a drain to see its risk drivers.')}
      />
      {focusWardId ? <p className="px-4 pb-2 text-[0.6875rem] text-ink-400">{t('Filtered to {0}.', wardName(focusWardId))}</p> : null}
      {rows.length === 0 ? (
        <EmptyState compact className="mx-4 mb-4" title={t('No drains recorded')} detail="No storm water drain record matches the current filter." />
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          onRowClick={(r) => setSelectedId(r.id)}
          activeRowKey={selected?.id}
          pageSize={8}
          searchPlaceholder="Search drains"
          initialSort={{ columnId: 'risk', direction: 'desc' }}
          ariaLabel="Storm water drain register"
        />
      )}
      {selected ? (
        <div className="border-t border-ink-100 p-4">
          <p className="label-institutional mb-2">
            {t('Risk drivers - {0} ({1})', selected.name, wardName(selected.wardId))}
          </p>
          <ContributionBars
            items={selected.riskDrivers.map((d) => ({ id: d.id, label: d.label, contribution: d.contribution, weight: d.weight, rawScore: d.rawScore, explanation: d.explanation }))}
          />
        </div>
      ) : null}
    </Card>
  )
}

/* ==========================================================================
   High Tide Intelligence
   ========================================================================== */

function HighTideSection(): React.JSX.Element {
  const tidesQuery = useServiceQuery(queryKeys.monsoon('tides'), (u) => monsoonService.tides(u))
  const rainfallQuery = useServiceQuery(queryKeys.monsoon('rainfall'), (u) => monsoonService.rainfall(u))

  if (tidesQuery.isLoading || rainfallQuery.isLoading) {
    return (
      <Card>
        <LoadingState variant="block" rows={4} />
      </Card>
    )
  }
  if (tidesQuery.error) {
    return (
      <Card>
        <ErrorState detail={tidesQuery.error.message} onRetry={() => tidesQuery.refetch()} />
      </Card>
    )
  }
  if (rainfallQuery.error) {
    return (
      <Card>
        <ErrorState detail={rainfallQuery.error.message} onRetry={() => rainfallQuery.refetch()} />
      </Card>
    )
  }

  const tides = [...(tidesQuery.data ?? [])].sort((a, b) => a.at.localeCompare(b.at))
  const rainfall = rainfallQuery.data ?? []
  if (tides.length === 0) {
    return (
      <Card>
        <EmptyState title={t('No tide data')} detail="No tide window record is currently available." />
      </Card>
    )
  }

  const blocking = tides.filter((tideWindow) => tideWindow.type === 'high' && tideWindow.blocksDischarge)
  const heavyStations = rainfall.filter((r) => r.intensity === 'heavy' || r.intensity === 'very-heavy' || r.intensity === 'extremely-heavy')
  const coincidence = blocking.length > 0 && heavyStations.length > 0 ? blocking[0] : null

  return (
    <Card>
      <CardHeader icon={<Waves className="h-4 w-4" />} title={t('High Tide Intelligence')} description={t('Tide windows and which of them block gravity discharge from storm water outfalls.')} />
      {coincidence ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-crit-200 bg-crit-50/70 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-crit-600" />
          <p className="text-xs leading-relaxed text-crit-700">
            <span className="font-semibold">{t('Coincidence:')}</span>
            {heavyStations.length}{' '}{t('station(s) currently reporting heavy or greater rainfall intensity coincide with a')}{' '}{coincidence.heightM}{' '}{t('m high tide at')}{' '}
            {formatTime(coincidence.at)} on {formatShortDate(coincidence.at)}{t(', which blocks gravity discharge. Pumped discharge is the only mechanism available at affected outfalls during this window.')}
          </p>
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-ok-200 bg-ok-50/60 px-3 py-2.5">
          <Waves className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" />
          <p className="text-xs leading-relaxed text-ok-700">{t('No current coincidence between heavy rainfall and a discharge-blocking high tide window is recorded.')}</p>
        </div>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tides.map((tideWindow) => (
          <div key={tideWindow.id} className={cn('rounded-lg border p-3', tideWindow.type === 'high' && tideWindow.blocksDischarge ? 'border-warn-200 bg-warn-50/50' : 'border-ink-100')}>
            <div className="flex items-center justify-between gap-2">
              <Badge tone={tideWindow.type === 'high' ? 'info' : 'muted'}>{titleCase(tideWindow.type)} tide</Badge>
              {tideWindow.blocksDischarge ? <Badge tone="warn">{t('Blocks discharge')}</Badge> : null}
            </div>
            <p className="numeric mt-1.5 text-lg font-semibold text-ink-900">{tideWindow.heightM} m</p>
            <p className="text-[0.6875rem] text-ink-500">{formatDateTime(tideWindow.at)}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ==========================================================================
   Rainfall observations
   ========================================================================== */

function RainfallSection({ focusWardId }: { focusWardId: string | null }): React.JSX.Element {
  const q = useServiceQuery(queryKeys.monsoon('rainfall'), (u) => monsoonService.rainfall(u))

  if (q.isLoading) {
    return (
      <Card>
        <LoadingState variant="table" rows={6} />
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
  const all = q.data ?? []
  const rows = focusWardId ? all.filter((r) => r.wardId === focusWardId) : all

  const intensityTone = { nil: 'muted', light: 'neutral', moderate: 'info', heavy: 'warn', 'very-heavy': 'risk', 'extremely-heavy': 'critical' } as const

  const columns: Array<Column<(typeof rows)[number]>> = [
    { id: 'station', header: t('Station'), cell: (r) => <span className="font-medium text-ink-900">{r.stationName}</span>, sortValue: (r) => r.stationName, searchValue: (r) => r.stationName },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'last1h', header: t('1h'), cell: (r) => `${r.last1hMm} mm`, sortValue: (r) => r.last1hMm, align: 'right', hideBelow: 'md' },
    { id: 'last24h', header: t('24h'), cell: (r) => `${r.last24hMm} mm`, sortValue: (r) => r.last24hMm, align: 'right' },
    {
      id: 'season',
      header: t('Season total vs normal'),
      cell: (r) => (
        <span className="numeric">
          {formatNumber(r.seasonTotalMm)} / {formatNumber(r.seasonNormalMm)} mm
        </span>
      ),
      sortValue: (r) => (r.seasonNormalMm > 0 ? r.seasonTotalMm / r.seasonNormalMm : 0),
      hideBelow: 'lg',
    },
    { id: 'intensity', header: t('Intensity'), cell: (r) => <Badge tone={intensityTone[r.intensity]}>{titleCase(r.intensity)}</Badge>, sortValue: (r) => r.intensity },
    { id: 'observed', header: t('Observed'), cell: (r) => formatRelative(r.observedAt), sortValue: (r) => r.observedAt, hideBelow: 'md' },
  ]

  return (
    <Card flush>
      <CardHeader
        className="px-4 pt-4 pb-3"
        icon={<CloudRain className="h-4 w-4" />}
        title={t('Rainfall Observations')}
        description={t('Rainfall by station against the seasonal normal, with intensity classification.')}
      />
      {focusWardId ? <p className="px-4 pb-2 text-[0.6875rem] text-ink-400">{t('Filtered to {0}.', wardName(focusWardId))}</p> : null}
      {rows.length === 0 ? (
        <EmptyState compact className="mx-4 mb-4" title={t('No rainfall observations')} detail="No rainfall observation matches the current filter." />
      ) : (
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} pageSize={8} searchPlaceholder="Search stations" initialSort={{ columnId: 'last24h', direction: 'desc' }} ariaLabel="Rainfall observation register" />
      )}
    </Card>
  )
}

/* ==========================================================================
   Critical Route Risk
   ========================================================================== */

function CriticalRouteSection(): React.JSX.Element {
  const q = useServiceQuery(queryKeys.monsoon('waterlogging-spots'), (u) => monsoonService.waterloggingSpots(u))

  if (q.isLoading) {
    return (
      <Card>
        <LoadingState variant="block" rows={4} />
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
  const spots = (q.data ?? []).filter((s) => s.criticalRoute)
  if (spots.length === 0) {
    return (
      <Card>
        <EmptyState title={t('No critical routes at risk')} detail="No chronic waterlogging location currently recorded is flagged as sitting on a critical route." />
      </Card>
    )
  }
  const ranked = [...spots].sort((a, b) => b.currentRisk - a.currentRisk)

  return (
    <Card>
      <CardHeader
        icon={<Route className="h-4 w-4" />}
        title={t('Critical Route Risk')}
        description={t('Chronic waterlogging locations sitting on a designated critical route - arterial roads whose closure materially affects city mobility or emergency access.')}
      />
      <div className="mt-3">
        <ChartFrame title={t('Current risk, critical-route locations')} unit="/100 · higher is worse" timeframe="Current position" height={Math.max(140, ranked.length * 26)}>
          <RankedBarChart data={ranked.map((s) => ({ label: s.name.length > 22 ? `${s.name.slice(0, 20)}…` : s.name, value: s.currentRisk }))} unit="/100" />
        </ChartFrame>
      </div>
      <ul className="mt-3 divide-y divide-ink-50">
        {ranked.slice(0, 8).map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
            <span className="min-w-0 truncate text-ink-700">
              {s.name} <span className="text-ink-400">· {wardName(s.wardId)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <Badge tone="muted">{t('Chronic {0}', s.chronicIndex)}</Badge>
              <Badge tone={s.mitigationStatus === 'completed' ? 'positive' : s.mitigationStatus === 'in-progress' ? 'warn' : 'neutral'}>{titleCase(s.mitigationStatus)}</Badge>
              <span className="numeric text-ink-500">{t('{0} km to nearest hospital', s.nearestHospitalKm)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/* ==========================================================================
   Hospital Accessibility Risk
   ========================================================================== */

function HospitalAccessSection(): React.JSX.Element {
  const q = useServiceQuery(queryKeys.health('hospitals'), (u) => healthService.hospitals(u))

  if (q.isLoading) {
    return (
      <Card>
        <LoadingState variant="block" rows={4} />
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
  const hospitals = q.data ?? []
  if (hospitals.length === 0) {
    return (
      <Card>
        <EmptyState title={t('No hospital records')} detail="No hospital accessibility record is currently available." />
      </Card>
    )
  }
  const ranked = [...hospitals].sort((a, b) => a.accessibilityIndex - b.accessibilityIndex).slice(0, 8)

  return (
    <Card>
      <CardHeader
        icon={<HeartPulse className="h-4 w-4" />}
        title={t('Hospital Accessibility Risk')}
        description={t('Facilities with the lowest current road accessibility index - the most exposed to approach disruption during flooding.')}
      />
      <div className="mt-3">
        <ChartFrame title={t('Lowest accessibility index')} unit="/100 · lower is worse" timeframe="Current position" height={Math.max(140, ranked.length * 26)}>
          <RankedBarChart data={ranked.map((h) => ({ label: h.name.length > 22 ? `${h.name.slice(0, 20)}…` : h.name, value: h.accessibilityIndex }))} higherIsWorse={false} unit="/100" />
        </ChartFrame>
      </div>
      <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-400">
        {t('Accessibility reflects current road condition and reported approach disruption, not a prediction of any specific closure. The scenario tool below models how many facilities would see access risk under a rainfall and tide scenario.')}
      </p>
    </Card>
  )
}

/* ==========================================================================
   Ward Preparedness
   ========================================================================== */

function WardPreparednessSection({ focusWardId }: { focusWardId: string | null }): React.JSX.Element {
  const q = useServiceQuery(queryKeys.monsoon('readiness'), (u) => monsoonService.readiness(u))

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
  const all = q.data ?? []
  const rows = focusWardId ? all.filter((r) => r.wardId === focusWardId) : all
  if (all.length === 0) {
    return (
      <Card>
        <EmptyState title={t('No readiness data')} detail="No ward monsoon readiness record is currently available." />
      </Card>
    )
  }

  const columns: Array<Column<WardMonsoonReadiness>> = [
    { id: 'ward', header: t('Ward'), cell: (r) => <span className="font-medium text-ink-900">{wardName(r.wardId)}</span>, sortValue: (r) => wardName(r.wardId), searchValue: (r) => wardName(r.wardId) },
    { id: 'readiness', header: t('Readiness'), cell: (r) => <Badge tone={toneForScore(r.readinessScore)}>{r.readinessScore}</Badge>, sortValue: (r) => r.readinessScore },
    { id: 'desilting', header: t('Desilting'), cell: (r) => formatPercent(r.desiltingPct), sortValue: (r) => r.desiltingPct, align: 'right' },
    { id: 'pump', header: t('Pump readiness'), cell: (r) => formatPercent(r.pumpReadiness), sortValue: (r) => r.pumpReadiness, align: 'right' },
    { id: 'spots', header: t('Flood spots (mitigated)'), cell: (r) => `${r.floodSpots} (${r.spotsMitigated})`, sortValue: (r) => r.floodSpots, hideBelow: 'md' },
    { id: 'teams', header: t('Teams allocated'), cell: (r) => r.teamsAllocated, sortValue: (r) => r.teamsAllocated, align: 'right', hideBelow: 'lg' },
    { id: 'pumps-deployed', header: t('Dewatering pumps'), cell: (r) => r.dewateringPumps, sortValue: (r) => r.dewateringPumps, align: 'right', hideBelow: 'lg' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
    {
      id: 'gaps',
      header: t('Declared gaps'),
      cell: (r) =>
        r.gaps.length === 0 ? (
          <span className="text-ink-400">{t('None declared')}</span>
        ) : (
          <span className="truncate text-ink-600" title={r.gaps.join('; ')}>
            {r.gaps[0]}
            {r.gaps.length > 1 ? ` +${r.gaps.length - 1} more` : ''}
          </span>
        ),
      hideBelow: 'xl',
      width: '16rem',
    },
  ]

  return (
    <Card flush>
      <CardHeader className="px-4 pt-4 pb-3" icon={<ClipboardList className="h-4 w-4" />} title={t('Ward Preparedness')} description={t('Declared monsoon readiness posture for every ward.')} />
      {focusWardId ? <p className="px-4 pb-2 text-[0.6875rem] text-ink-400">{t('Filtered to {0}.', wardName(focusWardId))}</p> : null}
      {rows.length === 0 ? (
        <EmptyState compact className="mx-4 mb-4" title={t('No ward matches')} detail="No ward matches the current filter." />
      ) : (
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.wardId} pageSize={12} searchPlaceholder="Search wards" initialSort={{ columnId: 'readiness', direction: 'asc' }} ariaLabel="Ward monsoon preparedness register" />
      )}
    </Card>
  )
}

/* ==========================================================================
   Scenario Centre - the centrepiece
   ========================================================================== */

type DriverBreakdown = Awaited<ReturnType<typeof monsoonService.driverBreakdown>>

function MonsoonScenarioCentre({
  committedInputs,
  onRunScenario,
  scenarioResult,
  scenarioLoading,
  scenarioErrorMessage,
  driverBreakdown,
  hasScenarioAccess,
}: {
  committedInputs: MonsoonScenarioInput
  onRunScenario: (inputs: MonsoonScenarioInput) => void
  scenarioResult: MonsoonScenarioResult | undefined
  scenarioLoading: boolean
  scenarioErrorMessage: string | null
  driverBreakdown: DriverBreakdown | undefined
  hasScenarioAccess: boolean
}): React.JSX.Element {
  const user = useCurrentUser()
  const openDrawer = useDrawerStore((s) => s.open)
  const activityLog = useActivityLog('Situation Room · Monsoon')
  const [draftInputs, setDraftInputs] = useState<MonsoonScenarioInput>(committedInputs)
  const [scenarioIncidentId, setScenarioIncidentId] = useState<string | null>(null)
  const [deploying, setDeploying] = useState(false)

  const createIncidentAction = useServiceAction((u, input: IncidentCreateInput) => incidentService.create(u, input), [queryKeys.incidents()])
  const deployTeamAction = useServiceAction(
    (u, incidentId: string, team: DeployTeamInput) => incidentService.deployTeam(u, incidentId, team),
    [queryKeys.incidents()],
  )

  const canCreateIncident = allowed(user, 'incident', 'create')

  function handleRunScenario(): void {
    onRunScenario(draftInputs)
    activityLog.record(
      'Scenario run',
      `Rainfall ${draftInputs.rainfallMm24h}mm/24h, tide ${draftInputs.tideHeightM}m, pump availability ${draftInputs.pumpAvailabilityPct}%, desilting ${draftInputs.desiltingCompletionPct}%, duration ${draftInputs.durationHours}h.`,
    )
  }

  function handlePreset(preset: MonsoonScenarioPreset): void {
    setDraftInputs(preset.inputs)
    onRunScenario(preset.inputs)
    activityLog.record('Preset scenario run', preset.label)
  }

  async function handleCreateIncident(): Promise<void> {
    if (!scenarioResult) return
    const topWard = scenarioResult.wardRisks[0]
    if (!topWard) return
    const severity: Severity = scenarioResult.cityRisk >= 78 ? 'critical' : scenarioResult.cityRisk >= 60 ? 'high' : scenarioResult.cityRisk >= 40 ? 'medium' : 'low'
    const created = await createIncidentAction({
      title: t('Simulated monsoon response - city risk {0}/100', scenarioResult.cityRisk),
      description: t('Raised from the Monsoon Intelligence Centre scenario tool. Inputs: rainfall {0}mm/24h, tide {1}m, pump availability {2}%, desilting {3}%, duration {4}h. {5}', committedInputs.rainfallMm24h, committedInputs.tideHeightM, committedInputs.pumpAvailabilityPct, committedInputs.desiltingCompletionPct, committedInputs.durationHours, SIMULATION_STATEMENT),
      type: 'flood',
      severity,
      wardId: topWard.wardId,
      locationName: `${wardName(topWard.wardId)} and adjoining wards under this scenario`,
      departmentId: 'dept-disaster',
      confidence: scenarioResult.confidence,
      classification: 'confidential',
    })
    setScenarioIncidentId(created.id)
    activityLog.record('Incident created', `${created.reference} - ${created.title}`)
    openDrawer({ kind: 'incident', id: created.id })
  }

  async function handleDeployResources(): Promise<void> {
    if (!scenarioIncidentId || !scenarioResult) return
    setDeploying(true)
    try {
      for (const d of scenarioResult.recommendedDeployments.slice(0, 5)) {
        await deployTeamAction(scenarioIncidentId, {
          name: `${d.resource} - ${wardName(d.wardId)}`,
          type: responseTeamTypeFor(d.resource),
          strength: Math.max(1, d.quantity),
        })
        activityLog.record('Resource deployed', `${d.quantity} × ${d.resource} to ${wardName(d.wardId)}`)
      }
    } finally {
      setDeploying(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<SlidersHorizontal className="h-4 w-4" />}
        eyebrow={t('Scenario Centre')}
        title={t('Compound Flood Scenario Tool')}
        description={t('Model rainfall, tide, pump availability, desilting completion and duration together, and see the modelled city and ward-level consequence recalculate.')}
      />

      <div className="mt-3 flex flex-wrap gap-1.5">
        {MONSOON_SCENARIO_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            size="xs"
            variant={JSON.stringify(committedInputs) === JSON.stringify(preset.inputs) ? 'primary' : 'outline'}
            onClick={() => handlePreset(preset)}
            title={preset.description}
            disabled={!hasScenarioAccess}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <RangeField label={t('Rainfall (24h)')} value={draftInputs.rainfallMm24h} min={0} max={600} step={5} unit=" mm" disabled={!hasScenarioAccess} onChange={(v) => setDraftInputs((p) => ({ ...p, rainfallMm24h: v }))} />
        <RangeField label={t('Tide height')} value={draftInputs.tideHeightM} min={0} max={6} step={0.1} unit=" m" disabled={!hasScenarioAccess} onChange={(v) => setDraftInputs((p) => ({ ...p, tideHeightM: Math.round(v * 10) / 10 }))} />
        <RangeField label={t('Pump availability')} value={draftInputs.pumpAvailabilityPct} min={0} max={100} step={1} unit="%" disabled={!hasScenarioAccess} onChange={(v) => setDraftInputs((p) => ({ ...p, pumpAvailabilityPct: v }))} />
        <RangeField label={t('Desilting completion')} value={draftInputs.desiltingCompletionPct} min={0} max={100} step={1} unit="%" disabled={!hasScenarioAccess} onChange={(v) => setDraftInputs((p) => ({ ...p, desiltingCompletionPct: v }))} />
        <RangeField label={t('Duration')} value={draftInputs.durationHours} min={1} max={96} step={1} unit=" h" disabled={!hasScenarioAccess} onChange={(v) => setDraftInputs((p) => ({ ...p, durationHours: v }))} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={handleRunScenario} disabled={!hasScenarioAccess || scenarioLoading}>
          {scenarioLoading ? 'Recalculating…' : 'Run Scenario'}
        </Button>
        {!hasScenarioAccess ? (
          <span className="text-[0.6875rem] text-ink-400">
            {t('Ward Officers and read-only roles can view monsoon data but do not hold Situation Room authority to run a city-wide scenario.')}
          </span>
        ) : null}
        {scenarioErrorMessage ? <span className="text-[0.6875rem] text-crit-600">{scenarioErrorMessage}</span> : null}
      </div>

      {scenarioResult ? (
        <>
          <MetricGrid columns={4} className="mt-5 border-t border-ink-100 pt-4">
            <MetricCard
              label={
                <span className="inline-flex items-center gap-1">
                  {t('City-wide flood risk')}{' '}<SimulationBadge />
                </span>
              }
              value={scenarioResult.cityRisk}
              unit="/100"
              tone={scenarioResult.cityRisk >= 70 ? 'critical' : scenarioResult.cityRisk >= 50 ? 'warn' : 'default'}
            />
            <MetricCard
              label={
                <span className="inline-flex items-center gap-1">
                  {t('Readiness under scenario')}{' '}<SimulationBadge />
                </span>
              }
              value={scenarioResult.readinessScore}
              unit="/100"
            />
            <MetricCard
              label={
                <span className="inline-flex items-center gap-1">
                  {t('Chronic spots at risk')}{' '}<SimulationBadge />
                </span>
              }
              value={scenarioResult.spotsAtRisk}
            />
            <MetricCard
              label={
                <span className="inline-flex items-center gap-1">
                  {t('Critical routes at risk')}{' '}<SimulationBadge />
                </span>
              }
              value={scenarioResult.criticalRoutesAtRisk}
            />
            <MetricCard
              label={
                <span className="inline-flex items-center gap-1">
                  {t('Hospitals with access risk')}{' '}<SimulationBadge />
                </span>
              }
              value={scenarioResult.hospitalsWithAccessRisk}
            />
            <MetricCard
              label={
                <span className="inline-flex items-center gap-1">
                  {t('Population exposed (estimate)')}{' '}<SimulationBadge />
                </span>
              }
              value={formatCompact(scenarioResult.estimatedPopulationExposed)}
            />
            <MetricCard label={t('Confidence')} value={titleCase(scenarioResult.confidence)} support={t('Falls where inputs sit outside the range the model was shaped on')} />
            <MetricCard label={t('Generated')} value={formatRelative(scenarioResult.generatedAt)} />
          </MetricGrid>

          {scenarioResult.wardRisks.length > 0 ? (
            <div className="mt-4 border-t border-ink-100 pt-3">
              <p className="label-institutional mb-2 flex items-center gap-1.5">
                {t('Ward risk under this scenario')}{' '}<SimulationBadge />
              </p>
              <ul className="scrollbar-slim max-h-80 divide-y divide-ink-50 overflow-y-auto">
                {scenarioResult.wardRisks.slice(0, 12).map((wr) => (
                  <li key={wr.wardId} className="py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink-800">{wardName(wr.wardId)}</span>
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="numeric text-ink-400">{wr.baselineRisk} →</span>
                        <span className={cn('numeric font-semibold', SCORE_TONE_TEXT[toneForScore(wr.scenarioRisk, false)])}>{wr.scenarioRisk}</span>
                        <DeltaBadge value={wr.delta} unit=" pts" higherIsBetter={false} />
                      </span>
                    </div>
                    <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-500">{wr.driverSummary}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 border-t border-ink-100 pt-3">
            <p className="label-institutional mb-2">{t('Driver breakdown')}</p>
            {driverBreakdown ? <ContributionBars items={driverBreakdown} /> : <p className="text-xs text-ink-400">{t('Driver breakdown unavailable.')}</p>}
          </div>

          <p className="mt-4 border-t border-ink-100 pt-3 text-[0.6875rem] leading-relaxed text-ink-500">{SIMULATION_STATEMENT}</p>

          <div className="mt-4 border-t border-ink-100 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="label-institutional flex items-center gap-1.5">
                {t('Recommended deployments')}{' '}<SimulationBadge />
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="xs"
                  variant="outline"
                  icon={<PlusCircle className="h-3.5 w-3.5" />}
                  onClick={() => void handleCreateIncident()}
                  disabled={!canCreateIncident || !scenarioResult}
                  title={!canCreateIncident ? 'Your role does not hold incident:create.' : undefined}
                >
                  {t('Create incident from this scenario')}
                </Button>
                <Button
                  size="xs"
                  variant="primary"
                  icon={<Send className="h-3.5 w-3.5" />}
                  onClick={() => void handleDeployResources()}
                  disabled={!scenarioIncidentId || deploying || scenarioResult.recommendedDeployments.length === 0}
                  title={!scenarioIncidentId ? 'Create an incident from this scenario first.' : undefined}
                >
                  {deploying ? 'Deploying…' : 'Deploy simulated resources'}
                </Button>
              </div>
            </div>
            {scenarioResult.recommendedDeployments.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {scenarioResult.recommendedDeployments.map((d, i) => (
                  <li key={i} className="rounded-md border border-ink-100 p-2.5 text-xs">
                    <span className="font-medium text-ink-800">
                      {d.quantity} × {d.resource} - {wardName(d.wardId)}
                    </span>
                    <p className="mt-1 leading-relaxed text-ink-500">{d.rationale}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-ink-400">{t('No deployment is recommended under the current scenario.')}</p>
            )}
          </div>

          <div className="mt-4 border-t border-ink-100 pt-3">
            <p className="label-institutional mb-2">{t('Timeline of this monsoon operation')}</p>
            {activityLog.entries.length === 0 ? (
              <p className="text-xs text-ink-400">
                {t('No action has been recorded in this session yet. Running a scenario, creating an incident or deploying resources will appear here.')}
              </p>
            ) : (
              <ul className="space-y-2">
                {activityLog.entries.map((e) => (
                  <li key={e.id} className="flex gap-2 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-govt-500" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-ink-700">
                        <span className="font-medium">{e.action}</span> - {e.detail}
                      </p>
                      <p className="text-[0.625rem] text-ink-400">
                        {e.actor} · {formatRelative(e.at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : hasScenarioAccess ? (
        <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-400">{t('Recalculating the current scenario…')}</p>
      ) : null}
    </Card>
  )
}

/* ==========================================================================
   Active Response
   ========================================================================== */

function ActiveResponseSection(): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)
  const q = useServiceQuery(queryKeys.incidents('active'), (u) => incidentService.active(u))

  if (q.isLoading) {
    return (
      <Card>
        <LoadingState variant="block" rows={4} />
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
  const floodIncidents = (q.data ?? []).filter((i) => i.type === 'flood')

  return (
    <Card flush>
      <CardHeader
        className="px-4 pt-4 pb-3"
        icon={<ShieldAlert className="h-4 w-4" />}
        title={t('Active Response')}
        description={t('Flood incidents currently detected, validated or active - including any raised from the scenario tool above.')}
      />
      {floodIncidents.length === 0 ? (
        <EmptyState compact className="mx-4 mb-4" title={t('No active flood response')} detail="No flood incident is currently detected, validated or active." />
      ) : (
        <div className="grid grid-cols-1 gap-2 p-4 pt-0 sm:grid-cols-2">
          {floodIncidents.map((i) => (
            <IncidentCard key={i.id} incident={i} onClick={() => openDrawer({ kind: 'incident', id: i.id })} />
          ))}
        </div>
      )}
    </Card>
  )
}
