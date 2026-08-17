import { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { monsoonService, roadsService, wardService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { useContextStore } from '@/stores/ui.store'
import {
  DEFAULT_PLANNING_SCENARIO,
  PLANNING_SCENARIO_PRESETS,
  PLANNING_SIMULATION_STATEMENT,
  runPlanningScenario,
  type PlanningScenarioResult,
} from '@/domains'
import type { PlanningScenarioInput, RoadSegment, TrafficCorridor, WardMonsoonReadiness } from '@/types/city-domains'
import type { OperationalState } from '@/types/common'
import type { Ward } from '@/types/organisation'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatCompact, formatDelta } from '@/utils/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  InfoHint,
  Label,
  LoadingState,
  MetricGrid,
  SimulationBadge,
  StateBadge,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { CityMap } from '@/components/map/CityMap'
import { ChartFrame, DonutChart, MiniBar, RankedBarChart } from '@/components/charts'
import { t } from '@/i18n'

/**
 * Urban Planning Intelligence.
 *
 * Population pressure, infrastructure adequacy, transport access and
 * capital planning across every ward, built from ward, road-network and
 * monsoon-readiness records rather than a single bespoke planning feed -
 * every figure shown is traceable to a service call, and every composite
 * metric states its formula rather than presenting an unexplained number.
 * Parcel-level land-use classification (residential / commercial /
 * industrial / open) is not yet integrated into this service layer; the
 * composition views below are built from what is: ward planning region and
 * infrastructure-adequacy band.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-360),
  refreshIntervalMinutes: 1440,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const ADEQUACY_THRESHOLD = 55
const DENSITY_DESIGN_ASSUMPTION = 45_000

interface WardExtras {
  transportAccessIndex: number
  planningPressureIndex: number
  floodProne: boolean
  baselineGaps: string[]
}

function transportAccessIndexFor(wardId: string, segments: RoadSegment[], corridors: TrafficCorridor[]): number {
  const wardSegments = segments.filter((s) => s.wardId === wardId)
  const roadComponent = wardSegments.length > 0 ? wardSegments.reduce((s, r) => s + r.conditionIndex, 0) / wardSegments.length : 55
  const wardCorridors = corridors.filter((c) => c.wardIds.includes(wardId))
  const corridorComponent =
    wardCorridors.length > 0
      ? wardCorridors.reduce((s, c) => s + Math.min(100, (c.peakSpeedKmph / Math.max(c.freeFlowSpeedKmph, 1)) * 100), 0) / wardCorridors.length
      : roadComponent
  return Math.round(roadComponent * 0.6 + corridorComponent * 0.4)
}

function planningPressureFor(ward: Ward): number {
  const densityPressure = Math.min(1, ward.population / ward.areaSqKm / DENSITY_DESIGN_ASSUMPTION) * 55
  const floodPressure = ward.floodProne ? 26 : 6
  const spotsPressure = Math.min(19, ward.waterloggingSpots * 1.3)
  return Math.round(Math.min(100, densityPressure + floodPressure + spotsPressure))
}

function baselineGapsFor(ward: Ward, adequacy: number, transportIndex: number, readiness: WardMonsoonReadiness | undefined): string[] {
  const gaps: string[] = []
  if (adequacy < ADEQUACY_THRESHOLD) gaps.push('Water and sewerage capacity assessed below the adequacy threshold')
  if (transportIndex < 50) gaps.push('Transport access index below the operational standard')
  if (ward.floodProne && (readiness?.readinessScore ?? 100) < 70) gaps.push('Monsoon readiness insufficient for a flood-prone ward')
  if (ward.population / ward.areaSqKm > DENSITY_DESIGN_ASSUMPTION) gaps.push('Population density exceeds the infrastructure design assumption')
  return gaps
}

function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  unit: string
}): React.JSX.Element {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <Label className="mb-0">{label}</Label>
        <span className="numeric text-xs font-semibold text-ink-800">{value > 0 ? '+' : ''}{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-govt-600" aria-label={label} />
    </div>
  )
}

export function UrbanPlanningPage(): React.JSX.Element {
  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(t('Urban Planning'))

  const wardsQuery = useServiceQuery(queryKeys.wards(), (u) => wardService.list(u))
  const segmentsQuery = useServiceQuery(queryKeys.roads('segments-planning'), (u) => roadsService.segments(u))
  const corridorsQuery = useServiceQuery(queryKeys.roads('corridors-planning'), (u) => roadsService.corridors(u))
  const readinessQuery = useServiceQuery(queryKeys.monsoon('readiness-planning'), (u) => monsoonService.readiness(u))

  /**
   * The ward selected in the command bar governs this page.
   *
   * The scenario engine is corporation-wide by construction - it walks every
   * planning indicator - so nothing it returns is narrowed on its own. The
   * page read the shared selection nowhere at all, which left the register,
   * the rankings, the map and the city position identical for all wards while
   * the command bar said otherwise.
   *
   * Scope is taken from `wardService.list`, which is already filtered through
   * the tenant and ward-scope helpers, so a ward the principal may not read is
   * absent from `wards` and therefore absent from every figure below - the
   * shared selection can narrow the page but never widen it.
   */
  const contextWardId = useContextStore((s) => s.wardId)

  const [selectedWardId, setSelectedWardId] = useState<string | null>(null)
  const [scenarioInputs, setScenarioInputs] = useState<PlanningScenarioInput>(DEFAULT_PLANNING_SCENARIO)
  const [scenarioResult, setScenarioResult] = useState<PlanningScenarioResult | null>(null)

  const baseline = useMemo(() => runPlanningScenario(DEFAULT_PLANNING_SCENARIO), [])
  const active = scenarioResult ?? baseline
  const isScenario = scenarioResult !== null

  const authorisedWards = wardsQuery.data ?? []
  const wards = useMemo(
    () => (contextWardId ? authorisedWards.filter((w) => w.id === contextWardId) : authorisedWards),
    [authorisedWards, contextWardId],
  )
  const wardIdsInScope = useMemo(() => new Set(wards.map((w) => w.id)), [wards])
  const readinessByWard = useMemo(() => new Map((readinessQuery.data ?? []).map((r) => [r.wardId, r])), [readinessQuery.data])

  /**
   * The scenario engine returns every ward in the corporation. Everything the
   * page renders reads this narrowed set instead, so the shared selection
   * reaches the register, the rankings, the map shading and the city position
   * together rather than one of them.
   */
  const scopedWardRows = useMemo(() => active.byWard.filter((r) => wardIdsInScope.has(r.wardId)), [active, wardIdsInScope])

  const extrasByWard = useMemo(() => {
    const map = new Map<string, WardExtras>()
    if (!segmentsQuery.data || !corridorsQuery.data) return map
    for (const ward of wards) {
      const transportAccessIndex = transportAccessIndexFor(ward.id, segmentsQuery.data, corridorsQuery.data)
      const baselineRow = baseline.byWard.find((w) => w.wardId === ward.id)
      map.set(ward.id, {
        transportAccessIndex,
        planningPressureIndex: planningPressureFor(ward),
        floodProne: ward.floodProne,
        baselineGaps: baselineGapsFor(ward, baselineRow?.baselineAdequacy ?? ward.healthScore, transportAccessIndex, readinessByWard.get(ward.id)),
      })
    }
    return map
  }, [wards, segmentsQuery.data, corridorsQuery.data, baseline, readinessByWard])

  const rows = useMemo(
    () =>
      scopedWardRows.map((row) => {
        const extras = extrasByWard.get(row.wardId)
        const gaps = Array.from(new Set([...(extras?.baselineGaps ?? []), ...row.newServiceGaps]))
        return { ...row, ...extras, gaps }
      }),
    [scopedWardRows, extrasByWard],
  )

  /**
   * The city position summarises the wards in view. At full scope this is the
   * same arithmetic the engine performs across every ward, so an unnarrowed
   * page reads exactly as it did; with a ward selected it states that ward's
   * position rather than a corporation figure the operator did not ask for.
   */
  const position = useMemo(() => {
    const count = Math.max(scopedWardRows.length, 1)
    const baselineAdequacy = scopedWardRows.reduce((s, w) => s + w.baselineAdequacy, 0) / count
    const scenarioAdequacy = scopedWardRows.reduce((s, w) => s + w.scenarioAdequacy, 0) / count
    return {
      baselineAdequacy: Math.round(baselineAdequacy * 10) / 10,
      scenarioAdequacy: Math.round(scenarioAdequacy * 10) / 10,
      delta: Math.round((scenarioAdequacy - baselineAdequacy) * 10) / 10,
      wardsBelowThreshold: scopedWardRows.filter((w) => w.scenarioAdequacy < ADEQUACY_THRESHOLD).length,
      newGapCount: scopedWardRows.reduce((s, w) => s + w.newServiceGaps.length, 0),
      projectedPopulation: Math.round(
        wards.reduce((s, w) => s + w.population, 0) * (1 + active.inputs.populationDeltaPct / 100),
      ),
    }
  }, [scopedWardRows, wards, active])

  const anyLoading = wardsQuery.isLoading || segmentsQuery.isLoading || corridorsQuery.isLoading || readinessQuery.isLoading
  const anyError = wardsQuery.error ?? segmentsQuery.error ?? corridorsQuery.error ?? readinessQuery.error

  const regionComposition = useMemo(() => {
    const counts = new Map<string, number>()
    for (const w of wards) counts.set(w.region, (counts.get(w.region) ?? 0) + 1)
    return Array.from(counts.entries()).map(([label, value]) => ({ label, value }))
  }, [wards])

  const landAreaByAdequacyBand = useMemo(() => {
    const bands: Record<OperationalState, number> = { operational: 0, degraded: 0, 'at-risk': 0, critical: 0, simulation: 0, 'adapter-ready': 0, 'not-connected': 0, 'review-required': 0, planned: 0 }
    for (const row of scopedWardRows) {
      const ward = wards.find((w) => w.id === row.wardId)
      if (!ward) continue
      bands[row.state] += ward.areaSqKm
    }
    const colour: Partial<Record<OperationalState, string>> = { operational: '#10b981', degraded: '#f59e0b', 'at-risk': '#f97316', critical: '#e5484d' }
    return (['operational', 'degraded', 'at-risk', 'critical'] as OperationalState[])
      .filter((s) => bands[s] > 0)
      .map((s) => ({ label: s.replace('-', ' '), value: Math.round(bands[s] * 10) / 10, colour: colour[s] }))
  }, [scopedWardRows, wards])

  const rankedAdequacy = useMemo(
    () => [...scopedWardRows].sort((a, b) => a.scenarioAdequacy - b.scenarioAdequacy).slice(0, 12).map((r) => ({ label: r.label, value: r.scenarioAdequacy })),
    [scopedWardRows],
  )

  const columns: Array<Column<(typeof rows)[number]>> = [
    { id: 'ward', header: t('Ward'), cell: (row) => <span className="font-medium text-ink-900">{row.label}</span>, sortValue: (row) => row.label, searchValue: (row) => row.label, width: '11rem' },
    {
      id: 'density',
      header: t('Population density'),
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={Math.min(100, (row.projectedDensity / 60_000) * 100)} width={48} />
          <span className="numeric w-16 text-right">{formatCompact(row.projectedDensity)}/km²</span>
        </div>
      ),
      sortValue: (row) => row.projectedDensity,
      align: 'right',
    },
    {
      id: 'adequacy',
      header: t('Infrastructure adequacy'),
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={row.scenarioAdequacy} width={48} />
          <span className="numeric w-9 text-right font-semibold">{row.scenarioAdequacy}</span>
          {row.delta !== 0 ? <Badge tone={row.delta < 0 ? 'critical' : 'positive'} size="xs">{formatDelta(row.delta, '', 0)}</Badge> : null}
        </div>
      ),
      sortValue: (row) => row.scenarioAdequacy,
      align: 'right',
    },
    {
      id: 'transport',
      header: t('Transport access index'),
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={row.transportAccessIndex ?? 0} width={40} />
          <span className="numeric w-7 text-right">{row.transportAccessIndex ?? '-'}</span>
        </div>
      ),
      sortValue: (row) => row.transportAccessIndex ?? 0,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'pressure',
      header: (
        <span className="inline-flex items-center gap-1">
          {t('Growth &amp; space pressure')}
          <InfoHint>
            {t('Composite proxy (0–100, higher = more pressure) from population density against the design assumption, flood exposure and chronic waterlogging locations. Not a survey-grade open-space inventory - that dataset is not yet integrated into this service layer.')}
          </InfoHint>
        </span>
      ),
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={row.planningPressureIndex ?? 0} width={40} tone={(row.planningPressureIndex ?? 0) >= 60 ? 'critical' : undefined} />
          <span className="numeric w-7 text-right">{row.planningPressureIndex ?? '-'}</span>
        </div>
      ),
      sortValue: (row) => row.planningPressureIndex ?? 0,
      align: 'right',
      hideBelow: 'xl',
    },
    { id: 'state', header: t('State'), cell: (row) => <StateBadge state={row.state} />, sortValue: (row) => row.state },
    {
      id: 'gaps',
      header: t('Service gaps'),
      cell: (row) =>
        row.gaps.length === 0 ? (
          <span className="text-ink-300">{t('None recorded')}</span>
        ) : (
          <span className="text-crit-700" title={row.gaps.join(' · ')}>
            {row.gaps.length} - {row.gaps[0]}
          </span>
        ),
      sortValue: (row) => row.gaps.length,
      hideBelow: 'xl',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Strategic Urban Intelligence')}
        breadcrumbs={[{ label: t('Strategic Urban Intelligence') }, { label: t('Urban Planning') }]}
        freshness={FRESHNESS}
        actions={isScenario ? <SimulationBadge /> : undefined}
      />

      {anyLoading ? <LoadingState variant="metrics" /> : null}
      {anyError ? (
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void wardsQuery.refetch()
            void segmentsQuery.refetch()
            void corridorsQuery.refetch()
            void readinessQuery.refetch()
          }}
        />
      ) : null}

      {!anyLoading && !anyError ? (
        wards.length === 0 ? (
          <EmptyState title={t('No wards available')} detail="No ward records are visible within your authorised scope." />
        ) : (
          /* ── Two columns ───────────────────────────────────────────
             The city position, the ward register and the scenario engine that
             recomputes them read down the wide column, in the order an officer
             works: what the position is, ward by ward, then what a stated
             change would do to it. The map and the two compositions stand
             beside the register they shade. */
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
              <GovPanel
                title={isScenario ? 'City position - scenario applied' : 'City position - current'}
                tone="amber"
              >
                <p className="mb-3 text-xs leading-relaxed text-ink-500">
                  {isScenario ? PLANNING_SIMULATION_STATEMENT : 'Infrastructure adequacy as presently assessed, computed from the published planning scenario engine at zero adjustment.'}
                </p>
                <MetricGrid columns={5} className="mt-3">
                  <MetricCard label={t('Mean adequacy')} value={`${position.scenarioAdequacy}/100`} support={isScenario ? `Baseline ${position.baselineAdequacy}/100` : undefined} />
                  <MetricCard label={t('Movement')} value={formatDelta(position.delta)} tone={position.delta < 0 ? 'critical' : 'default'} />
                  <MetricCard label={t('Wards below threshold')} value={position.wardsBelowThreshold} tone={position.wardsBelowThreshold > 0 ? 'warn' : 'default'} />
                  <MetricCard label={t('New service gaps')} value={position.newGapCount} tone={position.newGapCount > 0 ? 'warn' : 'default'} />
                  <MetricCard label={t('Projected population')} value={formatCompact(position.projectedPopulation)} />
                </MetricGrid>
              </GovPanel>

              <GovPanel title={t('Ward planning table')} tone="red" dense>
                <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('Sortable and searchable. Selecting a row highlights the ward on the map.')}</p>
                <DataTable
                  rows={rows}
                  columns={columns}
                  rowKey={(row) => row.wardId}
                  pageSize={9}
                  stickyHeader
                  maxHeight="26rem"
                  searchPlaceholder="Search wards"
                  onRowClick={(row) => setSelectedWardId(row.wardId === selectedWardId ? null : row.wardId)}
                  activeRowKey={selectedWardId ?? undefined}
                  initialSort={{ columnId: 'adequacy', direction: 'asc' }}
                />
              </GovPanel>

              <GovPanel
                title={t('Scenario modelling')}
                tone="amber"
                actions={<SimulationBadge />}
              >
                <p className="mb-3 text-xs leading-relaxed text-ink-500">
                  {t('Project infrastructure adequacy under a stated change to population, capital investment, transport demand and extreme rainfall frequency. This recomputes the table, map and rankings above.')}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {PLANNING_SCENARIO_PRESETS.map((preset) => (
                    <Button key={preset.id} size="xs" variant="outline" title={preset.description} onClick={() => setScenarioInputs(preset.inputs)}>
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <RangeField label={t('Population growth')} value={scenarioInputs.populationDeltaPct} onChange={(v) => setScenarioInputs((s) => ({ ...s, populationDeltaPct: v }))} min={-10} max={30} unit="%" />
                  <RangeField label={t('Capital investment')} value={scenarioInputs.capitalInvestmentDeltaPct} onChange={(v) => setScenarioInputs((s) => ({ ...s, capitalInvestmentDeltaPct: v }))} min={-20} max={50} unit="%" />
                  <RangeField label={t('Transport demand')} value={scenarioInputs.transportDemandDeltaPct} onChange={(v) => setScenarioInputs((s) => ({ ...s, transportDemandDeltaPct: v }))} min={-10} max={40} unit="%" />
                  <RangeField label={t('Extreme rainfall frequency')} value={scenarioInputs.extremeRainfallDeltaPct} onChange={(v) => setScenarioInputs((s) => ({ ...s, extremeRainfallDeltaPct: v }))} min={-20} max={60} unit="%" />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="primary" onClick={() => setScenarioResult(runPlanningScenario(scenarioInputs))}>
                    {t('Run scenario')}
                  </Button>
                  {isScenario ? (
                    <Button variant="ghost" icon={<RotateCcw className="h-3 w-3" />} onClick={() => { setScenarioResult(null); setScenarioInputs(DEFAULT_PLANNING_SCENARIO) }}>
                      {t('Reset to current position')}
                    </Button>
                  ) : null}
                </div>
                {isScenario ? <p className="mt-3 text-xs leading-relaxed text-ink-700">{active.narrative}</p> : null}
              </GovPanel>
            </div>

            <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
              <GovPanel title={t('Map - adequacy and density')} tone="amber">
                <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Toggle the layer selector to switch between infrastructure adequacy and population density shading.')}</p>
                <div className="mt-3">
                  <CityMap
                    layers={[
                      {
                        id: 'adequacy',
                        label: t('Infrastructure Adequacy'),
                        valueFor: (wardId) => rows.find((r) => r.wardId === wardId)?.scenarioAdequacy,
                        higherIsWorse: false,
                        unit: '/100',
                        description: t('Composite infrastructure adequacy against projected demand, from the planning scenario engine.'),
                      },
                      {
                        id: 'density',
                        label: t('Population Density'),
                        valueFor: (wardId) => {
                          const v = rows.find((r) => r.wardId === wardId)?.projectedDensity
                          return v === undefined ? undefined : Math.min(100, (v / 60_000) * 100)
                        },
                        higherIsWorse: true,
                        unit: ' (scaled /60,000 per km²)',
                        description: t('Population density scaled to a 0–100 band for shading; hover a ward for the underlying figure.'),
                      },
                    ]}
                    selectedWardId={selectedWardId}
                    onWardSelect={(id) => setSelectedWardId(id === selectedWardId ? null : id)}
                    height={340}
                  />
                </div>
              </GovPanel>

              <Card>
                <ChartFrame title={t('Adequacy ranking - lowest first')} unit="/100" timeframe="Current view" height={280}>
                  <RankedBarChart data={rankedAdequacy} higherIsWorse={false} unit="/100" />
                </ChartFrame>
              </Card>

              <GovPanel title={t('Land composition')} tone="red">
                <p className="mb-3 text-xs leading-relaxed text-ink-500">
                  {t('Parcel-level land-use classification is not yet integrated into this service layer. These views are built from ward planning region and infrastructure-adequacy band instead.')}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="h-40">
                    <DonutChart data={regionComposition} centreValue={String(wards.length)} centreLabel="Wards" />
                  </div>
                  <div className="h-40">
                    <DonutChart data={landAreaByAdequacyBand} unit={t('km²')} centreValue={`${Math.round(wards.reduce((s, w) => s + w.areaSqKm, 0))}`} centreLabel="km² total" />
                  </div>
                </div>
                <div className="mt-2 flex justify-around text-[0.625rem] text-ink-400">
                  <span>{t('By planning region')}</span>
                  <span>{t('By adequacy band (land area)')}</span>
                </div>
              </GovPanel>
            </div>
          </div>
        )
      ) : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

export default UrbanPlanningPage
