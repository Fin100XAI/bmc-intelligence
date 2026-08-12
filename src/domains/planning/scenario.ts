import type { OperationalState } from '@/types/common'
import type { PlanningScenarioInput } from '@/types/city-domains'
import { PLANNING_INDICATORS } from '@/data/social.data'
import { WARDS, WARD_BY_ID, wardName } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Urban planning scenario engine.
 *
 * Deterministic and pure. Projects infrastructure adequacy under stated
 * changes to population, capital investment, transport demand and extreme
 * rainfall. Every output is a SIMULATION, not a forecast.
 */

export const DEFAULT_PLANNING_SCENARIO: PlanningScenarioInput = {
  populationDeltaPct: 0,
  capitalInvestmentDeltaPct: 0,
  transportDemandDeltaPct: 0,
  extremeRainfallDeltaPct: 0,
}

function build$PLANNING_SCENARIO_PRESETS(): Array<{
  id: string
  label: string
  description: string
  inputs: PlanningScenarioInput
}> {
  return [
  {
    id: 'baseline',
    label: t('Current position'),
    description: t('Infrastructure adequacy as presently assessed, with no adjustment applied.'),
    inputs: DEFAULT_PLANNING_SCENARIO,
  },
  {
    id: 'population-growth',
    label: t('Population +10%'),
    description: t('Population growth of 10% with no corresponding capital increase - the pure demand-pressure case.'),
    inputs: { ...DEFAULT_PLANNING_SCENARIO, populationDeltaPct: 10 },
  },
  {
    id: 'investment',
    label: t('Capital investment +25%'),
    description: t('A 25% increase in committed capital investment against unchanged demand.'),
    inputs: { ...DEFAULT_PLANNING_SCENARIO, capitalInvestmentDeltaPct: 25 },
  },
  {
    id: 'transport-shift',
    label: t('Transport demand shift'),
    description: t('Transport demand rising 20% with population and investment unchanged.'),
    inputs: { ...DEFAULT_PLANNING_SCENARIO, transportDemandDeltaPct: 20 },
  },
  {
    id: 'climate-pressure',
    label: t('Population growth with extreme rainfall'),
    description:
      t('Population +10% combined with a 40% increase in extreme rainfall frequency and a modest 10% investment increase.'),
    inputs: {
      populationDeltaPct: 10,
      capitalInvestmentDeltaPct: 10,
      transportDemandDeltaPct: 12,
      extremeRainfallDeltaPct: 40,
    },
  },
]
}
export let PLANNING_SCENARIO_PRESETS: Array<{
  id: string
  label: string
  description: string
  inputs: PlanningScenarioInput
}> = build$PLANNING_SCENARIO_PRESETS()
registerLayer(() => {
  PLANNING_SCENARIO_PRESETS = build$PLANNING_SCENARIO_PRESETS()
})

export interface PlanningScenarioWardRow {
  wardId: string
  label: string
  baselineAdequacy: number
  scenarioAdequacy: number
  delta: number
  projectedDensity: number
  newServiceGaps: string[]
  state: OperationalState
}

export interface PlanningScenarioResult {
  inputs: PlanningScenarioInput
  city: {
    baselineAdequacy: number
    scenarioAdequacy: number
    delta: number
    wardsBelowThreshold: number
    projectedPopulation: number
    newGapCount: number
  }
  byWard: PlanningScenarioWardRow[]
  narrative: string
  generatedAt: string
  isSimulation: true
}

function stateFromAdequacy(score: number): OperationalState {
  if (score >= 75) return 'operational'
  if (score >= 60) return 'degraded'
  if (score >= 44) return 'at-risk'
  return 'critical'
}

export function runPlanningScenario(inputs: PlanningScenarioInput): PlanningScenarioResult {
  const byWard: PlanningScenarioWardRow[] = PLANNING_INDICATORS.map((indicator) => {
    const ward = WARD_BY_ID.get(indicator.wardId)
    const baselineAdequacy = indicator.infraAdequacy

    // Demand pressure erodes adequacy; investment restores it, with
    // diminishing returns above a 30% increase.
    const populationPressure = inputs.populationDeltaPct * 0.85
    const transportPressure = inputs.transportDemandDeltaPct * 0.28
    const rainfallPressure = (ward?.floodProne ? 0.42 : 0.16) * inputs.extremeRainfallDeltaPct
    const investmentRelief =
      inputs.capitalInvestmentDeltaPct <= 30
        ? inputs.capitalInvestmentDeltaPct * 0.52
        : 30 * 0.52 + (inputs.capitalInvestmentDeltaPct - 30) * 0.24

    const scenarioAdequacy = Math.round(
      Math.max(0, Math.min(100, baselineAdequacy - populationPressure - transportPressure - rainfallPressure + investmentRelief)),
    )

    const projectedDensity = Math.round(indicator.populationDensity * (1 + inputs.populationDeltaPct / 100))

    const newServiceGaps: string[] = []
    if (scenarioAdequacy < 55 && baselineAdequacy >= 55)
      newServiceGaps.push(t('Water and sewerage capacity falls below projected demand under this scenario'))
    if (projectedDensity > 45_000 && indicator.populationDensity <= 45_000)
      newServiceGaps.push(t('Density exceeds the infrastructure design assumption under this scenario'))
    if (inputs.transportDemandDeltaPct > 15 && indicator.transportAccessIndex < 60)
      newServiceGaps.push(t('Transport access index insufficient for the projected demand increase'))
    if (inputs.extremeRainfallDeltaPct > 25 && ward?.floodProne)
      newServiceGaps.push(t('Drainage capacity inadequate for the increased extreme-rainfall frequency'))
    if (
      inputs.populationDeltaPct > 5 &&
      indicator.openSpacePerCapitaSqm < 2 &&
      !newServiceGaps.includes('Open space per capita falls further below the planning norm')
    )
      newServiceGaps.push(t('Open space per capita falls further below the planning norm'))

    return {
      wardId: indicator.wardId,
      label: wardName(indicator.wardId),
      baselineAdequacy,
      scenarioAdequacy,
      delta: scenarioAdequacy - baselineAdequacy,
      projectedDensity,
      newServiceGaps,
      state: stateFromAdequacy(scenarioAdequacy),
    }
  }).sort((a, b) => a.scenarioAdequacy - b.scenarioAdequacy)

  const baselineAdequacy =
    byWard.reduce((s, w) => s + w.baselineAdequacy, 0) / Math.max(byWard.length, 1)
  const scenarioAdequacy = byWard.reduce((s, w) => s + w.scenarioAdequacy, 0) / Math.max(byWard.length, 1)
  const projectedPopulation = Math.round(
    WARDS.reduce((s, w) => s + w.population, 0) * (1 + inputs.populationDeltaPct / 100),
  )
  const newGapCount = byWard.reduce((s, w) => s + w.newServiceGaps.length, 0)

  const worst = byWard[0]
  const narrative =
    inputs.populationDeltaPct === 0 &&
    inputs.capitalInvestmentDeltaPct === 0 &&
    inputs.transportDemandDeltaPct === 0 &&
    inputs.extremeRainfallDeltaPct === 0
      ? t('No adjustment has been applied. This is the current assessed position rather than a projection.')
      : `Under this scenario, mean infrastructure adequacy moves from ${baselineAdequacy.toFixed(1)} to ${scenarioAdequacy.toFixed(1)} out of 100, and ${byWard.filter((w) => w.scenarioAdequacy < 55).length} wards fall below the 55-point adequacy threshold. ` +
        `${newGapCount} new service gaps appear that are not present in the current position. ` +
        `${worst ? t('{0} is most affected, moving {1} points to {2}/100. ', worst.label, worst.delta, worst.scenarioAdequacy) : ''}` +
        `Capacity lead times exceed the horizon at which a shortfall becomes operationally visible, so a gap identified here requires capital consideration now rather than when it presents.`

  return {
    inputs,
    city: {
      baselineAdequacy: Math.round(baselineAdequacy * 10) / 10,
      scenarioAdequacy: Math.round(scenarioAdequacy * 10) / 10,
      delta: Math.round((scenarioAdequacy - baselineAdequacy) * 10) / 10,
      wardsBelowThreshold: byWard.filter((w) => w.scenarioAdequacy < 55).length,
      projectedPopulation,
      newGapCount,
    },
    byWard,
    narrative,
    generatedAt: isoFromAnchor(0),
    isSimulation: true,
  }
}

export const PLANNING_SIMULATION_STATEMENT =
  'This is a simulation projecting infrastructure adequacy under the stated changes. It is not a forecast. Projection sensitivity to the growth assumption is material, and any capital consequence requires a validated demand study.'
