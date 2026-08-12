import { BUDGET_LINES, budgetTotals as cityBudgetTotals, wardBudgetPosition } from '@/data/finance.data'
import { WARDS } from '@/data/reference'
import { filterByScope } from '@/security/access'
import type { AccessContext } from '@/security/model'
import type { ConfidenceLevel, IsoDateTime, OperationalState, Paged } from '@/types/common'
import type { BudgetHead, BudgetLine, BudgetScenarioInput } from '@/types/finance'
import type { User } from '@/types/organisation'
import { isoFromAnchor } from '@/utils/deterministic'
import { assertAccess, deepClone, paginate, recordAudit, scopeToTenant, simulateLatency } from './client'
import { t } from '@/i18n'

/**
 * src/services/finance.service.ts
 *
 * Budget intelligence. `BudgetLine` carries no per-record `classification`
 * field in the domain model, so access is gated on `resource: 'budget'`
 * plus ward/department scope only - matching the roster in
 * `src/security/roles.ts`, where budget visibility is restricted to
 * executive, finance and engineering roles (ward-officer, health-officer,
 * disaster-management-officer, operator, security-administrator and
 * ai-governance-officer hold no `budget:view` grant at all).
 */

export interface BudgetLineFilters {
  departmentId?: string
  head?: BudgetHead[]
  state?: OperationalState[]
  wardId?: string
  page?: number
  pageSize?: number
}

export interface DepartmentVarianceRow {
  departmentId: string
  approvedCrore: number
  revisedCrore: number
  actualCrore: number
  variancePct: number
  state: OperationalState
}

export interface WardBudgetVarianceRow {
  wardId: string
  allocatedCrore: number
  spentCrore: number
  utilisationPct: number
}

export interface BudgetScenarioResult {
  inputs: BudgetScenarioInput
  baseline: { revisedCrore: number; actualCrore: number; utilisationPct: number }
  scenario: { revisedCrore: number; actualCrore: number; utilisationPct: number; forecastYearEndCrore: number }
  deltaCrore: number
  generatedAt: IsoDateTime
  isSimulation: true
  confidence: ConfidenceLevel
}

function contextFor(line: BudgetLine): AccessContext {
  return { wardId: line.wardId, departmentId: line.departmentId, domain: 'budget' }
}

function matchesFilters(line: BudgetLine, filters: BudgetLineFilters): boolean {
  if (filters.departmentId && line.departmentId !== filters.departmentId) return false
  if (filters.head && filters.head.length > 0 && !filters.head.includes(line.head)) return false
  if (filters.state && filters.state.length > 0 && !filters.state.includes(line.state)) return false
  if (filters.wardId && line.wardId !== filters.wardId) return false
  return true
}

/** Worst-first ordering among the states `BudgetLine.state` actually uses. */
function worstState(lines: BudgetLine[]): OperationalState {
  const order: OperationalState[] = ['review-required', 'at-risk', 'degraded', 'operational']
  for (const state of order) {
    if (lines.some((l) => l.state === state)) return state
  }
  return 'operational'
}

async function budgetLines(user: User | null, filters: BudgetLineFilters = {}): Promise<Paged<BudgetLine>> {
  await simulateLatency(`finance.budgetLines:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, BUDGET_LINES)
  const visible = filterByScope(user, scoped, contextFor, 'budget')
  const filtered = visible.filter((line) => matchesFilters(line, filters))
  const sorted = [...filtered].sort((a, b) => a.variancePct - b.variancePct)
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 50)
  return { ...page, items: deepClone(page.items) }
}

async function budgetTotals(user: User | null): Promise<ReturnType<typeof cityBudgetTotals>> {
  await simulateLatency('finance.budgetTotals')
  assertAccess(user, 'budget', 'view', { domain: 'budget' }, {
    resourceType: 'Budget',
    resourceId: 'city-totals',
    resourceLabel: 'City-wide budget totals',
  })
  return deepClone(cityBudgetTotals())
}

async function departmentVariance(user: User | null): Promise<DepartmentVarianceRow[]> {
  await simulateLatency('finance.departmentVariance')
  const scoped = scopeToTenant(user, BUDGET_LINES)
  const visible = filterByScope(user, scoped, contextFor, 'budget')

  const byDepartment = new Map<string, BudgetLine[]>()
  for (const line of visible) {
    const bucket = byDepartment.get(line.departmentId) ?? []
    bucket.push(line)
    byDepartment.set(line.departmentId, bucket)
  }

  const rows: DepartmentVarianceRow[] = Array.from(byDepartment.entries()).map(([departmentId, lines]) => {
    const approved = lines.reduce((s, l) => s + l.approvedCrore, 0)
    const revised = lines.reduce((s, l) => s + l.revisedCrore, 0)
    const actual = lines.reduce((s, l) => s + l.actualCrore, 0)
    const phasedTarget = revised * 0.31
    const variancePct = phasedTarget > 0 ? Math.round(((phasedTarget - actual) / phasedTarget) * 1000) / 10 : 0
    return {
      departmentId,
      approvedCrore: Math.round(approved * 10) / 10,
      revisedCrore: Math.round(revised * 10) / 10,
      actualCrore: Math.round(actual * 10) / 10,
      variancePct,
      state: worstState(lines),
    }
  })
  return deepClone(rows)
}

async function wardVariance(user: User | null): Promise<WardBudgetVarianceRow[]> {
  await simulateLatency('finance.wardVariance')
  const scoped = scopeToTenant(user, WARDS)
  const visible = filterByScope(user, scoped, (w) => ({ wardId: w.id, domain: 'budget' }), 'budget')
  const rows: WardBudgetVarianceRow[] = visible.map((ward) => ({ wardId: ward.id, ...wardBudgetPosition(ward.id) }))
  return deepClone(rows)
}

async function runScenario(user: User | null, inputs: BudgetScenarioInput): Promise<BudgetScenarioResult> {
  await simulateLatency('finance.runScenario', 300, 700)
  const authed = assertAccess(user, 'budget', 'edit', { domain: 'budget' }, {
    resourceType: 'Budget Scenario',
    resourceId: 'scenario',
    resourceLabel: 'Budget scenario',
  })

  const totals = cityBudgetTotals()
  const capitalRevised = BUDGET_LINES.filter((l) => l.head === 'capital').reduce((s, l) => s + l.revisedCrore, 0)
  const revenueRevised = BUDGET_LINES.filter((l) => l.head === 'revenue').reduce((s, l) => s + l.revisedCrore, 0)

  const scenarioRevised =
    totals.revised +
    capitalRevised * (inputs.capitalAllocationDeltaPct / 100) +
    revenueRevised * (inputs.revenueExpenditureDeltaPct / 100) +
    inputs.contingencyCrore
  const scenarioActual = Math.round(totals.actual * (1 + inputs.collectionEfficiencyDeltaPct / 100) * 10) / 10
  const scenarioUtilisationPct = scenarioRevised > 0 ? Math.round((scenarioActual / scenarioRevised) * 1000) / 10 : 0
  const forecastYearEndCrore = Math.round((scenarioActual / 0.31) * 10) / 10

  const result: BudgetScenarioResult = {
    inputs,
    baseline: { revisedCrore: totals.revised, actualCrore: totals.actual, utilisationPct: totals.utilisationPct },
    scenario: {
      revisedCrore: Math.round(scenarioRevised * 10) / 10,
      actualCrore: scenarioActual,
      utilisationPct: scenarioUtilisationPct,
      forecastYearEndCrore,
    },
    deltaCrore: Math.round((scenarioRevised - totals.revised) * 10) / 10,
    generatedAt: isoFromAnchor(0),
    isSimulation: true,
    confidence:
      Math.abs(inputs.capitalAllocationDeltaPct) > 25 || Math.abs(inputs.revenueExpenditureDeltaPct) > 25 ? 'low' : 'medium',
  }

  recordAudit(authed, {
    action: 'run-scenario',
    resourceType: 'Budget Scenario',
    resourceId: 'scenario',
    resourceLabel: 'Budget scenario',
    classification: 'confidential',
    outcome: 'success',
    detail: t('Capital Δ{0}%, revenue Δ{1}%, collection Δ{2}%, contingency ₹{3} Cr.', inputs.capitalAllocationDeltaPct, inputs.revenueExpenditureDeltaPct, inputs.collectionEfficiencyDeltaPct, inputs.contingencyCrore),
  })
  return deepClone(result)
}

export const financeService = {
  budgetLines,
  budgetTotals,
  departmentVariance,
  wardVariance,
  runScenario,
}
