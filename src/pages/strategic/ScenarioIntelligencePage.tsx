import { useRef, useState } from 'react'
import { Bookmark, CloudRain, Landmark, Layers3, RotateCcw } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { financeService, monsoonService } from '@/services'
import { useCurrentUser } from '@/stores/auth.store'
import { allowed } from '@/security'
import {
  BUDGET_SCENARIO_PRESETS,
  DEFAULT_BUDGET_SCENARIO,
  DEFAULT_PLANNING_SCENARIO,
  PLANNING_SCENARIO_PRESETS,
  PLANNING_SIMULATION_STATEMENT,
  runPlanningScenario,
  type PlanningScenarioResult,
} from '@/domains'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatCrore, formatDelta, formatPercent, formatRelative } from '@/utils/format'
import type { BudgetScenarioInput } from '@/types/finance'
import type { MonsoonScenarioInput, MonsoonScenarioResult } from '@/types/city-domains'
import type { PlanningScenarioInput } from '@/types/city-domains'
import type { BudgetScenarioResult } from '@/services'
import {
  Badge,
  Button,
  Card,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  MetricGrid,
  SimulationBadge,
  Tabs,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { ContributionBars } from '@/components/charts'
import { usePageMasthead } from '@/stores/masthead.store'
import { t } from '@/i18n'

/**
 * Scenario Intelligence - the studio for all three deterministic scenario
 * engines the platform publishes: monsoon and flood risk, budget allocation
 * and collection, and urban planning infrastructure adequacy. Every result
 * is a simulation produced by a declared, published rule model - never a
 * forecast, and never applied to a live record without a separate, explicit
 * action elsewhere in the platform.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-20),
  refreshIntervalMinutes: 15,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

type EngineId = 'monsoon' | 'budget' | 'planning'

interface SavedScenario {
  id: string
  engine: EngineId
  label: string
  summary: string
  savedAt: string
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
        <span className="numeric text-xs font-semibold text-ink-800">
          {value > 0 ? '+' : ''}
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
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-govt-600"
        aria-label={label}
      />
      <div className="mt-0.5 flex justify-between text-[0.625rem] text-ink-300">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  )
}

export function ScenarioIntelligencePage(): React.JSX.Element {
  const user = useCurrentUser()

  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(t('Scenario Intelligence'))

  const [engine, setEngine] = useState<EngineId>('monsoon')
  const [saved, setSaved] = useState<SavedScenario[]>([])
  const nextSaveId = useRef(0)

  /* --------------------------- Monsoon engine --------------------------- */
  const [monsoonInputs, setMonsoonInputs] = useState<MonsoonScenarioInput>({
    rainfallMm24h: 65,
    tideHeightM: 3.6,
    pumpAvailabilityPct: 85,
    desiltingCompletionPct: 85,
    durationHours: 12,
  })
  const monsoonPresetsQuery = useServiceQuery(queryKeys.monsoon('presets'), () => monsoonService.presets())
  const monsoonDriverQuery = useServiceQuery(queryKeys.monsoon(`driver:${JSON.stringify(monsoonInputs)}`), (u) =>
    monsoonService.driverBreakdown(u, monsoonInputs),
  )
  const runMonsoon = useServiceAction((u, inputs: MonsoonScenarioInput) => monsoonService.runScenario(u, inputs), [])
  const [monsoonResult, setMonsoonResult] = useState<MonsoonScenarioResult | null>(null)
  const [monsoonPending, setMonsoonPending] = useState(false)
  const [monsoonError, setMonsoonError] = useState<string | null>(null)
  const canRunMonsoon = allowed(user, 'situation-room', 'edit')

  /* ---------------------------- Budget engine ---------------------------- */
  const [budgetInputs, setBudgetInputs] = useState<BudgetScenarioInput>(DEFAULT_BUDGET_SCENARIO)
  const runBudget = useServiceAction((u, inputs: BudgetScenarioInput) => financeService.runScenario(u, inputs), [])
  const [budgetResult, setBudgetResult] = useState<BudgetScenarioResult | null>(null)
  const [budgetPending, setBudgetPending] = useState(false)
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const canRunBudget = allowed(user, 'budget', 'edit')

  /* --------------------------- Planning engine --------------------------- */
  const [planningInputs, setPlanningInputs] = useState<PlanningScenarioInput>(DEFAULT_PLANNING_SCENARIO)
  const [planningResult, setPlanningResult] = useState<PlanningScenarioResult | null>(null)

  function saveScenario(label: string, summary: string): void {
    nextSaveId.current += 1
    setSaved((prev) => [{ id: `scn-${nextSaveId.current}`, engine, label, summary, savedAt: isoFromAnchor(0) }, ...prev])
  }

  const tabs = [
    { id: 'monsoon', label: t('Monsoon & Flood'), icon: <CloudRain className="h-3.5 w-3.5" /> },
    { id: 'budget', label: t('Budget'), icon: <Landmark className="h-3.5 w-3.5" /> },
    { id: 'planning', label: t('Urban Planning'), icon: <Layers3 className="h-3.5 w-3.5" /> },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Strategic Urban Intelligence')}
        breadcrumbs={[{ label: t('Strategic Urban Intelligence') }, { label: t('Scenario Intelligence') }]}
        freshness={FRESHNESS}
        actions={<SimulationBadge />}
      />

      {/* ── Two columns ─────────────────────────────────────────────
          The studio holds the wide column — inputs on one side of it, the
          modelled result on the other — and the session's saved runs stand
          beside it as a register, so a scenario can be compared against the
          ones already kept without leaving the engine. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-9">
          <Card flush>
            <div className="border-b border-ink-100 px-4 pt-4 pb-3">
              <Tabs items={tabs} value={engine} onChange={(id) => setEngine(id as EngineId)} />
            </div>

            {engine === 'monsoon' ? (
              <div className="p-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                  <div>
                    <p className="label-institutional mb-2">{t('Presets')}</p>
                    {monsoonPresetsQuery.isLoading ? (
                      <LoadingState variant="inline" />
                    ) : (
                      <div className="mb-4 flex flex-wrap gap-1.5">
                        {(monsoonPresetsQuery.data ?? []).map((preset) => (
                          <Button key={preset.id} size="xs" variant="outline" title={preset.description} onClick={() => setMonsoonInputs(preset.inputs)}>
                            {preset.label}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="space-y-3">
                      <RangeField label={t('Rainfall (24h)')} value={monsoonInputs.rainfallMm24h} onChange={(v) => setMonsoonInputs((s) => ({ ...s, rainfallMm24h: v }))} min={0} max={300} step={5} unit=" mm" />
                      <RangeField label={t('Tide height')} value={monsoonInputs.tideHeightM} onChange={(v) => setMonsoonInputs((s) => ({ ...s, tideHeightM: v }))} min={2.5} max={5.2} step={0.1} unit=" m" />
                      <RangeField label={t('Pump availability')} value={monsoonInputs.pumpAvailabilityPct} onChange={(v) => setMonsoonInputs((s) => ({ ...s, pumpAvailabilityPct: v }))} min={30} max={100} step={1} unit="%" />
                      <RangeField label={t('Desilting completion')} value={monsoonInputs.desiltingCompletionPct} onChange={(v) => setMonsoonInputs((s) => ({ ...s, desiltingCompletionPct: v }))} min={30} max={100} step={1} unit="%" />
                      <RangeField label={t('Rainfall duration')} value={monsoonInputs.durationHours} onChange={(v) => setMonsoonInputs((s) => ({ ...s, durationHours: v }))} min={2} max={48} step={1} unit=" h" />
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="primary"
                        disabled={!canRunMonsoon || monsoonPending}
                        title={canRunMonsoon ? undefined : 'Your role does not hold situation-room:edit.'}
                        onClick={() => {
                          setMonsoonPending(true)
                          setMonsoonError(null)
                          runMonsoon(monsoonInputs)
                            .then(setMonsoonResult)
                            .catch((e: unknown) => setMonsoonError(e instanceof Error ? e.message : 'The scenario could not be run.'))
                            .finally(() => setMonsoonPending(false))
                        }}
                      >
                        {monsoonPending ? 'Running…' : 'Run scenario'}
                      </Button>
                      <Button variant="ghost" icon={<RotateCcw className="h-3 w-3" />} onClick={() => setMonsoonResult(null)}>
                        {t('Reset')}
                      </Button>
                    </div>
                    {monsoonError ? <ErrorState className="mt-2" detail={monsoonError} compact /> : null}

                    <div className="mt-4 border-t border-ink-100 pt-3">
                      <p className="label-institutional mb-2">{t('Driver weights (published)')}</p>
                      {monsoonDriverQuery.data ? (
                        <ContributionBars
                          items={monsoonDriverQuery.data.map((d) => ({ id: d.id, label: d.label, contribution: d.contribution, weight: d.weight, rawScore: d.rawScore, explanation: d.explanation }))}
                        />
                      ) : (
                        <LoadingState variant="inline" />
                      )}
                    </div>
                  </div>

                  <div>
                    {monsoonResult ? (
                      <>
                        <div className="mb-3 flex flex-wrap items-center gap-1.5">
                          <SimulationBadge />
                          <Badge tone="warn">{t('Simulation - not forecast')}</Badge>
                          <Badge tone={monsoonResult.confidence === 'high' ? 'positive' : monsoonResult.confidence === 'medium' ? 'warn' : 'risk'}>{monsoonResult.confidence} confidence</Badge>
                          <div className="flex-1" />
                          <Button size="xs" variant="outline" icon={<Bookmark className="h-3 w-3" />} onClick={() => saveScenario('Monsoon scenario', `City risk ${monsoonResult.cityRisk}/100 · readiness ${monsoonResult.readinessScore}/100 · ${monsoonResult.spotsAtRisk} spots at risk`)}>
                            {t('Save scenario')}
                          </Button>
                        </div>
                        <p className="mb-3 text-xs leading-relaxed text-ink-500">
                          {t('This is a simulation produced by a deterministic rule model using the inputs shown. It is not a forecast, not a meteorological product, and must never be represented as either.')}
                        </p>
                        <MetricGrid columns={2}>
                          <MetricCard label={t('City flood risk')} value={`${monsoonResult.cityRisk}/100`} tone={monsoonResult.cityRisk >= 65 ? 'critical' : monsoonResult.cityRisk >= 45 ? 'warn' : 'default'} />
                          <MetricCard label={t('Readiness score')} value={`${monsoonResult.readinessScore}/100`} />
                          <MetricCard label={t('Chronic spots at risk')} value={monsoonResult.spotsAtRisk} />
                          <MetricCard label={t('Critical routes at risk')} value={monsoonResult.criticalRoutesAtRisk} />
                          <MetricCard label={t('Hospitals with access risk')} value={monsoonResult.hospitalsWithAccessRisk} />
                          <MetricCard label={t('Population exposed (modelled)')} value={monsoonResult.estimatedPopulationExposed.toLocaleString('en-IN')} />
                        </MetricGrid>
                        <div className="mt-3">
                          <p className="label-institutional mb-1.5">{t('Wards most affected - baseline → scenario')}</p>
                          <div className="scrollbar-slim max-h-56 space-y-1 overflow-y-auto">
                            {monsoonResult.wardRisks.slice(0, 8).map((w) => (
                              <div key={w.wardId} className="flex items-center justify-between rounded bg-surface-sunken px-2 py-1.5 text-xs">
                                <span className="text-ink-600">{w.wardId}</span>
                                <span className="numeric">
                                  {w.baselineRisk} → <span className="font-semibold text-ink-800">{w.scenarioRisk}</span>{' '}
                                  <span className={w.delta > 0 ? 'text-crit-600' : w.delta < 0 ? 'text-ok-600' : 'text-ink-400'}>({formatDelta(w.delta, '', 0)})</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {monsoonResult.recommendedDeployments.length > 0 ? (
                          <div className="mt-3 border-t border-ink-100 pt-3">
                            <p className="label-institutional mb-1.5">{t('Advisory pre-positioning (requires named officer approval)')}</p>
                            <ul className="space-y-1.5">
                              {monsoonResult.recommendedDeployments.slice(0, 4).map((d, i) => (
                                <li key={i} className="text-xs leading-relaxed text-ink-600">
                                  <span className="font-semibold text-ink-800">{d.quantity}× {d.resource}</span> - {d.rationale}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <EmptyState title={t('No scenario run yet')} detail="Adjust the inputs and select Run scenario to see the modelled city and ward-level result." />
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {engine === 'budget' ? (
              <div className="p-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                  <div>
                    <p className="label-institutional mb-2">{t('Presets')}</p>
                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {BUDGET_SCENARIO_PRESETS.map((preset) => (
                        <Button key={preset.id} size="xs" variant="outline" title={preset.description} onClick={() => setBudgetInputs(preset.inputs)}>
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <RangeField label={t('Capital allocation delta')} value={budgetInputs.capitalAllocationDeltaPct} onChange={(v) => setBudgetInputs((s) => ({ ...s, capitalAllocationDeltaPct: v }))} min={-30} max={30} step={1} unit="%" />
                      <RangeField label={t('Revenue expenditure delta')} value={budgetInputs.revenueExpenditureDeltaPct} onChange={(v) => setBudgetInputs((s) => ({ ...s, revenueExpenditureDeltaPct: v }))} min={-30} max={30} step={1} unit="%" />
                      <RangeField label={t('Collection efficiency delta')} value={budgetInputs.collectionEfficiencyDeltaPct} onChange={(v) => setBudgetInputs((s) => ({ ...s, collectionEfficiencyDeltaPct: v }))} min={-20} max={20} step={1} unit="%" />
                      <RangeField label={t('Contingency reserve')} value={budgetInputs.contingencyCrore} onChange={(v) => setBudgetInputs((s) => ({ ...s, contingencyCrore: v }))} min={0} max={1000} step={25} unit={t(' Cr')} />
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="primary"
                        disabled={!canRunBudget || budgetPending}
                        title={canRunBudget ? undefined : 'Your role does not hold budget:edit.'}
                        onClick={() => {
                          setBudgetPending(true)
                          setBudgetError(null)
                          runBudget(budgetInputs)
                            .then(setBudgetResult)
                            .catch((e: unknown) => setBudgetError(e instanceof Error ? e.message : 'The scenario could not be run.'))
                            .finally(() => setBudgetPending(false))
                        }}
                      >
                        {budgetPending ? 'Running…' : 'Run scenario'}
                      </Button>
                      <Button variant="ghost" icon={<RotateCcw className="h-3 w-3" />} onClick={() => setBudgetResult(null)}>
                        {t('Reset')}
                      </Button>
                    </div>
                    {budgetError ? <ErrorState className="mt-2" detail={budgetError} compact /> : null}

                    <div className="mt-4 border-t border-ink-100 pt-3">
                      <p className="label-institutional mb-2">{t('What is driving this scenario')}</p>
                      <ul className="space-y-1 text-xs leading-relaxed text-ink-600">
                        <li>{t('Capital allocation delta scales capital-head lines by the stated percentage.')}</li>
                        <li>{t('Revenue expenditure delta scales revenue-head lines by the stated percentage.')}</li>
                        <li>{t('Collection efficiency delta scales realised (actual) expenditure - it constrains spend rather than allocation.')}</li>
                        <li>{t('The contingency reserve adds directly to revised allocation, outside departmental heads.')}</li>
                      </ul>
                    </div>
                  </div>

                  <div>
                    {budgetResult ? (
                      <>
                        <div className="mb-3 flex flex-wrap items-center gap-1.5">
                          <SimulationBadge />
                          <Badge tone="warn">{t('Simulation - not forecast')}</Badge>
                          <Badge tone={budgetResult.confidence === 'high' ? 'positive' : budgetResult.confidence === 'medium' ? 'warn' : 'risk'}>{budgetResult.confidence} confidence</Badge>
                          <div className="flex-1" />
                          <Button size="xs" variant="outline" icon={<Bookmark className="h-3 w-3" />} onClick={() => saveScenario('Budget scenario', `Utilisation ${formatPercent(budgetResult.scenario.utilisationPct)} · Δ ${formatCrore(budgetResult.deltaCrore)}`)}>
                            {t('Save scenario')}
                          </Button>
                        </div>
                        <p className="mb-2 text-xs font-medium text-ink-500">{t('Baseline vs scenario')}</p>
                        <div className="scrollbar-slim overflow-x-auto">
                          <table className="w-full min-w-[26rem] border-collapse text-left text-xs">
                            <thead>
                              <tr className="border-b border-ink-100 text-ink-400">
                                <th className="label-institutional py-1.5 pr-2 font-semibold">{t('Measure')}</th>
                                <th className="label-institutional py-1.5 px-2 text-right font-semibold">{t('Baseline')}</th>
                                <th className="label-institutional py-1.5 pl-2 text-right font-semibold">{t('Scenario')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-50">
                              <tr>
                                <td className="py-1.5 pr-2 text-ink-600">{t('Revised allocation')}</td>
                                <td className="numeric py-1.5 px-2 text-right">{formatCrore(budgetResult.baseline.revisedCrore)}</td>
                                <td className="numeric py-1.5 pl-2 text-right font-semibold text-ink-800">{formatCrore(budgetResult.scenario.revisedCrore)}</td>
                              </tr>
                              <tr>
                                <td className="py-1.5 pr-2 text-ink-600">{t('Actual expenditure')}</td>
                                <td className="numeric py-1.5 px-2 text-right">{formatCrore(budgetResult.baseline.actualCrore)}</td>
                                <td className="numeric py-1.5 pl-2 text-right font-semibold text-ink-800">{formatCrore(budgetResult.scenario.actualCrore)}</td>
                              </tr>
                              <tr>
                                <td className="py-1.5 pr-2 text-ink-600">{t('Utilisation')}</td>
                                <td className="numeric py-1.5 px-2 text-right">{formatPercent(budgetResult.baseline.utilisationPct)}</td>
                                <td className="numeric py-1.5 pl-2 text-right font-semibold text-ink-800">{formatPercent(budgetResult.scenario.utilisationPct)}</td>
                              </tr>
                              <tr>
                                <td className="py-1.5 pr-2 text-ink-600">{t('Forecast year-end')}</td>
                                <td className="py-1.5 px-2 text-right text-ink-300">-</td>
                                <td className="numeric py-1.5 pl-2 text-right font-semibold text-ink-800">{formatCrore(budgetResult.scenario.forecastYearEndCrore)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <MetricGrid columns={2} className="mt-3">
                          <MetricCard label={t('Net movement')} value={formatCrore(budgetResult.deltaCrore)} tone={budgetResult.deltaCrore < 0 ? 'critical' : 'default'} />
                          <MetricCard label={t('Confidence')} value={budgetResult.confidence} />
                        </MetricGrid>
                      </>
                    ) : (
                      <EmptyState title={t('No scenario run yet')} detail="Adjust the inputs and select Run scenario to see the modelled city budget position." />
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {engine === 'planning' ? (
              <div className="p-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                  <div>
                    <p className="label-institutional mb-2">{t('Presets')}</p>
                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {PLANNING_SCENARIO_PRESETS.map((preset) => (
                        <Button key={preset.id} size="xs" variant="outline" title={preset.description} onClick={() => setPlanningInputs(preset.inputs)}>
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <RangeField label={t('Population growth')} value={planningInputs.populationDeltaPct} onChange={(v) => setPlanningInputs((s) => ({ ...s, populationDeltaPct: v }))} min={-10} max={30} step={1} unit="%" />
                      <RangeField label={t('Capital investment')} value={planningInputs.capitalInvestmentDeltaPct} onChange={(v) => setPlanningInputs((s) => ({ ...s, capitalInvestmentDeltaPct: v }))} min={-20} max={50} step={1} unit="%" />
                      <RangeField label={t('Transport demand')} value={planningInputs.transportDemandDeltaPct} onChange={(v) => setPlanningInputs((s) => ({ ...s, transportDemandDeltaPct: v }))} min={-10} max={40} step={1} unit="%" />
                      <RangeField label={t('Extreme rainfall frequency')} value={planningInputs.extremeRainfallDeltaPct} onChange={(v) => setPlanningInputs((s) => ({ ...s, extremeRainfallDeltaPct: v }))} min={-20} max={60} step={1} unit="%" />
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button variant="primary" onClick={() => setPlanningResult(runPlanningScenario(planningInputs))}>
                        {t('Run scenario')}
                      </Button>
                      <Button variant="ghost" icon={<RotateCcw className="h-3 w-3" />} onClick={() => setPlanningResult(null)}>
                        {t('Reset')}
                      </Button>
                    </div>
                    <p className="mt-2 text-[0.6875rem] text-ink-400">
                      {t('The planning engine is deterministic and computes instantly - no gated service call is required to run it, only to persist its output against a decision.')}
                    </p>
                  </div>

                  <div>
                    {planningResult ? (
                      <>
                        <div className="mb-3 flex flex-wrap items-center gap-1.5">
                          <SimulationBadge />
                          <Badge tone="warn">{t('Simulation - not forecast')}</Badge>
                          <div className="flex-1" />
                          <Button size="xs" variant="outline" icon={<Bookmark className="h-3 w-3" />} onClick={() => saveScenario('Planning scenario', `Adequacy ${planningResult.city.scenarioAdequacy}/100 (Δ ${formatDelta(planningResult.city.delta)}) · ${planningResult.city.newGapCount} new gaps`)}>
                            {t('Save scenario')}
                          </Button>
                        </div>
                        <p className="mb-3 text-xs leading-relaxed text-ink-700">{planningResult.narrative}</p>
                        <MetricGrid columns={2}>
                          <MetricCard label={t('City adequacy')} value={`${planningResult.city.scenarioAdequacy}/100`} support={t('Baseline {0}/100', planningResult.city.baselineAdequacy)} />
                          <MetricCard label={t('Movement')} value={formatDelta(planningResult.city.delta)} tone={planningResult.city.delta < 0 ? 'critical' : 'default'} />
                          <MetricCard label={t('Wards below threshold')} value={planningResult.city.wardsBelowThreshold} />
                          <MetricCard label={t('New service gaps')} value={planningResult.city.newGapCount} tone={planningResult.city.newGapCount > 0 ? 'warn' : 'default'} />
                        </MetricGrid>
                        <p className="mt-3 numeric text-xs text-ink-500">
                          {t('Projected population:')}{' '}<span className="font-semibold text-ink-800">{planningResult.city.projectedPopulation.toLocaleString('en-IN')}</span>
                        </p>
                        <div className="mt-3 border-t border-ink-100 pt-3">
                          <p className="label-institutional mb-1.5">{t('Wards most affected')}</p>
                          <div className="scrollbar-slim max-h-56 space-y-1 overflow-y-auto">
                            {planningResult.byWard.slice(0, 8).map((w) => (
                              <div key={w.wardId} className="rounded bg-surface-sunken px-2 py-1.5 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-ink-600">{w.label}</span>
                                  <span className="numeric">
                                    {w.baselineAdequacy} → <span className="font-semibold text-ink-800">{w.scenarioAdequacy}</span>
                                  </span>
                                </div>
                                {w.newServiceGaps.length > 0 ? (
                                  <p className="mt-0.5 text-[0.6875rem] text-crit-600">{w.newServiceGaps[0]}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                        <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-400">{PLANNING_SIMULATION_STATEMENT}</p>
                      </>
                    ) : (
                      <EmptyState title={t('No scenario run yet')} detail="Adjust the inputs and select Run scenario to see the modelled per-ward and city-wide adequacy position." />
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:col-span-3">
          <GovPanel title={t('Saved scenarios')} tone="amber" dense>
            <p className="px-4 pt-4 pb-3 text-xs leading-relaxed text-ink-500">{t('Held in this session only, across all three engines.')}</p>
            {saved.length === 0 ? (
              <EmptyState className="m-4" compact title={t('No scenarios saved yet')} detail="Run a scenario above and select Save scenario to keep a reference here." />
            ) : (
              <ul className="divide-y divide-ink-50 px-4 pb-4">
                {saved.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-800">
                        <Badge tone="intel" size="xs">{s.engine}</Badge>
                        {s.label}
                      </p>
                      <p className="mt-0.5 truncate text-[0.6875rem] text-ink-500">{s.summary}</p>
                    </div>
                    <span className="shrink-0 text-[0.625rem] text-ink-400">{formatRelative(s.savedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </GovPanel>

          <DemonstrationNotice />
        </div>
      </div>
    </PageBody>
  )
}

export default ScenarioIntelligencePage
