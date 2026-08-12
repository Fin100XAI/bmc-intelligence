import type { OperationalState } from '@/types/common'
import type { BudgetScenarioInput } from '@/types/finance'
import { BUDGET_LINES, budgetTotals, revenueTotals } from '@/data/finance.data'
import { DEPARTMENTS, departmentName } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Budget scenario engine.
 *
 * Deterministic and pure. Every output is a SIMULATION produced by applying
 * the stated deltas to the current position - it is not a forecast and must
 * not be represented as one.
 */

/** Proportion of the financial year elapsed at the reference date. */
const YEAR_ELAPSED = 0.31

export const DEFAULT_BUDGET_SCENARIO: BudgetScenarioInput = {
  capitalAllocationDeltaPct: 0,
  revenueExpenditureDeltaPct: 0,
  collectionEfficiencyDeltaPct: 0,
  contingencyCrore: 0,
}

function build$BUDGET_SCENARIO_PRESETS(): Array<{
  id: string
  label: string
  description: string
  inputs: BudgetScenarioInput
}> {
  return [
  {
    id: 'baseline',
    label: t('Current position'),
    description: t('The approved and revised position as currently booked, with no adjustment applied.'),
    inputs: DEFAULT_BUDGET_SCENARIO,
  },
  {
    id: 'capital-push',
    label: t('Capital acceleration'),
    description:
      t('Capital allocation increased by 12% with revenue expenditure held, testing whether delivery capacity can absorb it.'),
    inputs: { ...DEFAULT_BUDGET_SCENARIO, capitalAllocationDeltaPct: 12 },
  },
  {
    id: 'revenue-shortfall',
    label: t('Collection shortfall'),
    description:
      t('Collection efficiency falling 8 percentage points, testing the headroom available before commitments are affected.'),
    inputs: { ...DEFAULT_BUDGET_SCENARIO, collectionEfficiencyDeltaPct: -8 },
  },
  {
    id: 'monsoon-contingency',
    label: t('Monsoon contingency reserve'),
    description:
      t('A ₹450 crore contingency reserve established for monsoon response, with revenue expenditure trimmed by 4%.'),
    inputs: { ...DEFAULT_BUDGET_SCENARIO, contingencyCrore: 450, revenueExpenditureDeltaPct: -4 },
  },
  {
    id: 'compound-pressure',
    label: t('Compound pressure'),
    description:
      t('Collection efficiency down 10 percentage points with capital allocation up 8% - the case that most strains the year-end position.'),
    inputs: {
      capitalAllocationDeltaPct: 8,
      revenueExpenditureDeltaPct: 3,
      collectionEfficiencyDeltaPct: -10,
      contingencyCrore: 200,
    },
  },
]
}
export let BUDGET_SCENARIO_PRESETS: Array<{
  id: string
  label: string
  description: string
  inputs: BudgetScenarioInput
}> = build$BUDGET_SCENARIO_PRESETS()
registerLayer(() => {
  BUDGET_SCENARIO_PRESETS = build$BUDGET_SCENARIO_PRESETS()
})

export interface BudgetScenarioDepartmentRow {
  departmentId: string
  name: string
  baselineUtilisationPct: number
  scenarioUtilisationPct: number
  delta: number
  revisedCrore: number
  projectedActualCrore: number
  state: OperationalState
}

export interface BudgetScenarioResult {
  inputs: BudgetScenarioInput
  totals: {
    approvedCrore: number
    revisedCrore: number
    projectedActualCrore: number
    projectedUtilisationPct: number
    headroomCrore: number
    contingencyCrore: number
    projectedRevenueCrore: number
  }
  byDepartment: BudgetScenarioDepartmentRow[]
  risks: string[]
  generatedAt: string
  isSimulation: true
}

function stateFromUtilisation(utilisation: number): OperationalState {
  const gap = Math.abs(utilisation - 100)
  if (gap <= 8) return 'operational'
  if (gap <= 18) return 'degraded'
  if (gap <= 32) return 'at-risk'
  return 'review-required'
}

export function runBudgetScenario(inputs: BudgetScenarioInput): BudgetScenarioResult {
  const base = budgetTotals()
  const revenue = revenueTotals()

  const byDepartment: BudgetScenarioDepartmentRow[] = DEPARTMENTS.map((dept) => {
    const lines = BUDGET_LINES.filter((b) => b.departmentId === dept.id)
    const revised = lines.reduce((s, l) => s + l.revisedCrore, 0)
    const actual = lines.reduce((s, l) => s + l.actualCrore, 0)
    const capitalShare =
      revised > 0 ? lines.filter((l) => l.head === 'capital').reduce((s, l) => s + l.revisedCrore, 0) / revised : 0
    const revenueShare =
      revised > 0 ? lines.filter((l) => l.head === 'revenue').reduce((s, l) => s + l.revisedCrore, 0) / revised : 0

    // Full-year projection from the year-to-date run rate.
    const baselineProjected = actual / YEAR_ELAPSED
    const baselineUtilisation = revised > 0 ? (baselineProjected / revised) * 100 : 0

    // Apply the scenario deltas in proportion to each department's head mix.
    const scenarioRevised =
      revised *
      (1 + (inputs.capitalAllocationDeltaPct / 100) * capitalShare + (inputs.revenueExpenditureDeltaPct / 100) * revenueShare)

    // Reduced collection constrains realisable spend rather than allocation.
    const collectionConstraint = 1 + (inputs.collectionEfficiencyDeltaPct / 100) * 0.55
    const scenarioProjected = baselineProjected * collectionConstraint
    const scenarioUtilisation = scenarioRevised > 0 ? (scenarioProjected / scenarioRevised) * 100 : 0

    return {
      departmentId: dept.id,
      name: departmentName(dept.id),
      baselineUtilisationPct: Math.round(baselineUtilisation * 10) / 10,
      scenarioUtilisationPct: Math.round(scenarioUtilisation * 10) / 10,
      delta: Math.round((scenarioUtilisation - baselineUtilisation) * 10) / 10,
      revisedCrore: Math.round(scenarioRevised * 10) / 10,
      projectedActualCrore: Math.round(scenarioProjected * 10) / 10,
      state: stateFromUtilisation(scenarioUtilisation),
    }
  }).sort((a, b) => a.scenarioUtilisationPct - b.scenarioUtilisationPct)

  const scenarioRevised = byDepartment.reduce((s, d) => s + d.revisedCrore, 0)
  const scenarioProjected = byDepartment.reduce((s, d) => s + d.projectedActualCrore, 0)
  const projectedRevenue = (revenue.collected / YEAR_ELAPSED) * (1 + inputs.collectionEfficiencyDeltaPct / 100)
  const headroom = projectedRevenue - scenarioProjected - inputs.contingencyCrore

  const risks: string[] = []
  if (headroom < 0)
    risks.push(
      t('Projected expenditure plus the contingency reserve exceeds projected receipts by ₹{0} crore. The position does not balance without either a receipts improvement or an expenditure reduction.', Math.abs(headroom).toFixed(0)),
    )
  if (inputs.collectionEfficiencyDeltaPct < -5)
    risks.push(
      t('A collection efficiency reduction of this magnitude constrains realisable expenditure irrespective of allocation. Allocation is not the binding constraint in this scenario.'),
    )
  if (inputs.capitalAllocationDeltaPct > 10)
    risks.push(
      t('Capital allocation is being increased faster than observed delivery capacity. Without a corresponding delivery capacity assessment, the increase is likely to appear as under-utilisation rather than as delivered works.'),
    )
  const materiallyBehind = byDepartment.filter((d) => d.scenarioUtilisationPct < 70).length
  if (materiallyBehind > 0)
    risks.push(
      t('{0} department(s) fall below 70% projected utilisation under this scenario, which would require re-phasing rather than a recovery assumption.', materiallyBehind),
    )
  const overCommitted = byDepartment.filter((d) => d.scenarioUtilisationPct > 108).length
  if (overCommitted > 0)
    risks.push(
      t('{0} department(s) exceed 108% projected utilisation, which would require a revised sanction before commitments are entered into.', overCommitted),
    )
  if (inputs.contingencyCrore > 0)
    risks.push(
      t('A contingency reserve of ₹{0} crore is held outside departmental allocation and is therefore unavailable for programmed works.', inputs.contingencyCrore.toFixed(0)),
    )
  if (risks.length === 0)
    risks.push(t('No material risk is raised by this scenario against the declared thresholds.'))

  return {
    inputs,
    totals: {
      approvedCrore: base.approved,
      revisedCrore: Math.round(scenarioRevised * 10) / 10,
      projectedActualCrore: Math.round(scenarioProjected * 10) / 10,
      projectedUtilisationPct: scenarioRevised > 0 ? Math.round((scenarioProjected / scenarioRevised) * 1000) / 10 : 0,
      headroomCrore: Math.round(headroom * 10) / 10,
      contingencyCrore: inputs.contingencyCrore,
      projectedRevenueCrore: Math.round(projectedRevenue * 10) / 10,
    },
    byDepartment,
    risks,
    generatedAt: isoFromAnchor(0),
    isSimulation: true,
  }
}

export const BUDGET_SIMULATION_STATEMENT =
  'This is a simulation produced by applying the stated deltas to the current booked position and projecting the year-to-date run rate forward. It is not a forecast and must not be used as one. Departmental estimation is required before any sanction.'
