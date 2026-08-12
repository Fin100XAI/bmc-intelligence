import {
  departmentFinancialRows,
  financialHealth,
  type DepartmentFinancialRow,
  type FinancialHealthResult,
} from '@/domains/finance/health-index'
import { financeService } from './finance.service'
import { revenueService } from './revenue.service'
import { projectService } from './project.service'
import type { RevenueAnomaly, RevenueRecord } from '@/types/finance'
import type { User } from '@/types/organisation'
import { deepClone, simulateLatency } from './client'

/**
 * src/services/financial-intelligence.service.ts
 *
 * Consolidated financial position.
 *
 * This service composes the budget, revenue and project services rather than
 * reading the datasets directly. That is deliberate: each of those services
 * already applies its own permission gate, so a principal who may read budget
 * but not revenue receives an index computed from budget alone - and the
 * result says which components were unavailable rather than scoring a missing
 * component as healthy.
 */

async function safeRevenue(user: User | null): Promise<{ records: RevenueRecord[]; anomalies: RevenueAnomaly[] }> {
  try {
    const [records, anomalies] = await Promise.all([
      revenueService.records(user, { pageSize: 1000 }),
      revenueService.anomalies(user, {}),
    ])
    return { records: records.items, anomalies: anomalies.items }
  } catch {
    // A revenue permission denial is an expected state, not a failure of the
    // financial position - the index is computed without that component.
    return { records: [], anomalies: [] }
  }
}

export interface FinancialIntelligenceResult extends FinancialHealthResult {
  departments: DepartmentFinancialRow[]
  /** Components that could not be computed at this principal's access level. */
  unavailableComponents: string[]
}

async function position(user: User | null): Promise<FinancialIntelligenceResult> {
  await simulateLatency('financialIntelligence.position')

  const [budgetPage, projectPage, revenue] = await Promise.all([
    financeService.budgetLines(user, { pageSize: 1000 }),
    projectService.list(user, { pageSize: 1000 }),
    safeRevenue(user),
  ])

  const health = financialHealth(budgetPage.items, revenue.records, projectPage.items, revenue.anomalies)

  const unavailableComponents: string[] = []
  if (revenue.records.length === 0) {
    unavailableComponents.push('Revenue performance', 'Collection efficiency')
  }
  if (budgetPage.items.length === 0) {
    unavailableComponents.push('Budget utilisation', 'Committed liability headroom', 'Forecast variance')
  }
  if (projectPage.items.length === 0) unavailableComponents.push('Project spend discipline')

  return deepClone({
    ...health,
    departments: departmentFinancialRows(budgetPage.items),
    unavailableComponents,
  })
}

export const financialIntelligenceService = {
  position,
}
