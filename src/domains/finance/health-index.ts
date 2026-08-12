import { departmentName } from '@/data/reference'
import type { BudgetLine, Project, RevenueAnomaly, RevenueRecord } from '@/types/finance'
import type { OperationalState, Severity } from '@/types/common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Municipal Financial Health Index.
 *
 * A corporation's financial position is not one number, and a single headline
 * score that cannot be decomposed is worse than no score at all - it invites
 * confidence without understanding. This engine publishes six components, the
 * weight of each, and the arithmetic that produced them, so the Commissioner
 * can see not just that the position moved but which part of it moved.
 *
 * Every input is a record the corporation already holds. Nothing here is a
 * forecast of revenue the corporation will receive; the forecast component
 * measures the DIVERGENCE between departmental year-end forecasts and the
 * approved position, which is a governance signal, not a prediction.
 */

export const FINANCIAL_HEALTH_WEIGHTS = {
  revenuePerformance: 0.22,
  collectionEfficiency: 0.2,
  budgetUtilisation: 0.18,
  committedLiability: 0.15,
  projectSpend: 0.15,
  forecastVariance: 0.1,
} as const

export type FinancialComponentId = keyof typeof FINANCIAL_HEALTH_WEIGHTS

function build$FINANCIAL_HEALTH_LABELS(): Record<FinancialComponentId, string> {
  return {
  revenuePerformance: t('Revenue performance'),
  collectionEfficiency: t('Collection efficiency'),
  budgetUtilisation: t('Budget utilisation'),
  committedLiability: t('Committed liability headroom'),
  projectSpend: t('Project spend discipline'),
  forecastVariance: t('Forecast variance'),
}
}
export let FINANCIAL_HEALTH_LABELS: Record<FinancialComponentId, string> = build$FINANCIAL_HEALTH_LABELS()
registerLayer(() => {
  FINANCIAL_HEALTH_LABELS = build$FINANCIAL_HEALTH_LABELS()
})

export interface FinancialComponent {
  id: FinancialComponentId
  label: string
  weight: number
  /** Normalised 0–100, higher is healthier. */
  score: number
  contribution: number
  /** The underlying figure, in its own units, for the reader who wants it. */
  measure: string
  explanation: string
  direction: 'positive' | 'negative' | 'neutral'
}

export interface FinancialPosition {
  /** INR crore. */
  approvedCrore: number
  revisedCrore: number
  committedCrore: number
  actualCrore: number
  forecastYearEndCrore: number
  targetRevenueCrore: number
  collectedRevenueCrore: number
  assessedRevenueCrore: number
  arrearsCrore: number
  /** Collected revenue less actual expenditure - an indicative position only. */
  netPositionCrore: number
  capexApprovedCrore: number
  capexActualCrore: number
  projectSanctionedCrore: number
  projectPaidCrore: number
  projectCompletionPct: number
}

export interface FinancialHealthResult {
  index: number
  state: OperationalState
  components: FinancialComponent[]
  position: FinancialPosition
  /** Plain-language account of what moved the index. */
  narrative: string
  leakageIndicators: LeakageIndicator[]
}

export interface LeakageIndicator {
  id: string
  label: string
  detail: string
  severity: Severity
  exposureCrore: number
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function round(value: number, dp = 1): number {
  const f = 10 ** dp
  return Math.round(value * f) / f
}

/**
 * Computes the index from records already filtered to the acting principal's
 * scope. A principal who cannot read revenue receives a position computed
 * without it, and the narrative says which components were unavailable rather
 * than silently scoring them as healthy.
 */
export function financialHealth(
  budgetLines: BudgetLine[],
  revenue: RevenueRecord[],
  projects: Project[],
  anomalies: RevenueAnomaly[] = [],
): FinancialHealthResult {
  const approvedCrore = budgetLines.reduce((s, l) => s + l.approvedCrore, 0)
  const revisedCrore = budgetLines.reduce((s, l) => s + l.revisedCrore, 0)
  const committedCrore = budgetLines.reduce((s, l) => s + l.committedCrore, 0)
  const actualCrore = budgetLines.reduce((s, l) => s + l.actualCrore, 0)
  const forecastYearEndCrore = budgetLines.reduce((s, l) => s + l.forecastYearEndCrore, 0)

  const capexLines = budgetLines.filter((l) => l.head === 'capital')
  const capexApprovedCrore = capexLines.reduce((s, l) => s + l.approvedCrore, 0)
  const capexActualCrore = capexLines.reduce((s, l) => s + l.actualCrore, 0)

  const targetRevenueCrore = revenue.reduce((s, r) => s + r.targetCrore, 0)
  const collectedRevenueCrore = revenue.reduce((s, r) => s + r.collectedCrore, 0)
  const assessedRevenueCrore = revenue.reduce((s, r) => s + r.assessedCrore, 0)
  const arrearsCrore = revenue.reduce((s, r) => s + r.arrearsCrore, 0)

  const projectSanctionedCrore = projects.reduce((s, p) => s + p.sanctionedCostCrore, 0)
  const projectPaidCrore = projects.reduce((s, p) => s + p.paidCrore, 0)
  const projectCompletionPct =
    projects.length > 0 ? projects.reduce((s, p) => s + p.completionPct, 0) / projects.length : 0

  // --- Component scores --------------------------------------------------
  const revenueAchievementPct = targetRevenueCrore > 0 ? (collectedRevenueCrore / targetRevenueCrore) * 100 : 0
  const collectionEfficiencyPct = assessedRevenueCrore > 0 ? (collectedRevenueCrore / assessedRevenueCrore) * 100 : 0
  const utilisationPct = revisedCrore > 0 ? (actualCrore / revisedCrore) * 100 : 0
  const committedSharePct = revisedCrore > 0 ? ((committedCrore + actualCrore) / revisedCrore) * 100 : 0
  const projectSpendGap = projectSanctionedCrore > 0 ? (projectPaidCrore / projectSanctionedCrore) * 100 : 0
  const forecastDivergencePct = approvedCrore > 0 ? Math.abs((forecastYearEndCrore - approvedCrore) / approvedCrore) * 100 : 0

  const rawComponents: Array<Omit<FinancialComponent, 'contribution'>> = [
    {
      id: 'revenuePerformance',
      label: FINANCIAL_HEALTH_LABELS.revenuePerformance,
      weight: FINANCIAL_HEALTH_WEIGHTS.revenuePerformance,
      score: clamp(revenueAchievementPct),
      measure: `${round(collectedRevenueCrore)} of ${round(targetRevenueCrore)} crore target`,
      explanation:
        revenue.length === 0
          ? t('No revenue record is readable at your access level, so this component could not be computed and is excluded from the index.')
          : t('{0}% of the corporation\'s revenue target has been collected in the readable streams.', round(revenueAchievementPct)),
      direction: revenueAchievementPct >= 85 ? 'positive' : revenueAchievementPct >= 70 ? 'neutral' : 'negative',
    },
    {
      id: 'collectionEfficiency',
      label: FINANCIAL_HEALTH_LABELS.collectionEfficiency,
      weight: FINANCIAL_HEALTH_WEIGHTS.collectionEfficiency,
      score: clamp(collectionEfficiencyPct),
      measure: `${round(arrearsCrore)} crore in arrears`,
      explanation: `${round(collectionEfficiencyPct)}% of assessed revenue has been collected. The balance sits as receivable, which is a cash-timing exposure rather than a loss.`,
      direction: collectionEfficiencyPct >= 82 ? 'positive' : collectionEfficiencyPct >= 68 ? 'neutral' : 'negative',
    },
    {
      // Both under- and over-spend are unhealthy; the healthiest position is
      // spending close to the phased plan, so the score peaks in the middle.
      id: 'budgetUtilisation',
      label: FINANCIAL_HEALTH_LABELS.budgetUtilisation,
      weight: FINANCIAL_HEALTH_WEIGHTS.budgetUtilisation,
      score: clamp(100 - Math.abs(utilisationPct - 72) * 2.2),
      measure: `${round(actualCrore)} of ${round(revisedCrore)} crore revised`,
      explanation: `${round(utilisationPct)}% of the revised budget is spent. Material under-spend signals delivery that has not happened; material over-spend signals a position that will need revision. Both reduce this score.`,
      direction: Math.abs(utilisationPct - 72) <= 8 ? 'positive' : Math.abs(utilisationPct - 72) <= 16 ? 'neutral' : 'negative',
    },
    {
      id: 'committedLiability',
      label: FINANCIAL_HEALTH_LABELS.committedLiability,
      weight: FINANCIAL_HEALTH_WEIGHTS.committedLiability,
      score: clamp(100 - Math.max(0, committedSharePct - 80) * 4),
      measure: `${round(committedCrore)} crore committed but unspent`,
      explanation: `${round(committedSharePct)}% of the revised budget is either spent or contractually committed. The remainder is the corporation's discretionary headroom for the rest of the year.`,
      direction: committedSharePct <= 85 ? 'positive' : committedSharePct <= 95 ? 'neutral' : 'negative',
    },
    {
      id: 'projectSpend',
      label: FINANCIAL_HEALTH_LABELS.projectSpend,
      weight: FINANCIAL_HEALTH_WEIGHTS.projectSpend,
      score: clamp(100 - Math.abs(projectSpendGap - projectCompletionPct) * 2.5),
      measure: `${round(projectSpendGap)}% released against ${round(projectCompletionPct)}% delivered`,
      explanation: `Payment released across ${projects.length} project(s) is ${round(projectSpendGap)}% of sanctioned cost against ${round(projectCompletionPct)}% recorded completion. A wide gap either way is a reconciliation candidate, not a finding.`,
      direction:
        Math.abs(projectSpendGap - projectCompletionPct) <= 8
          ? 'positive'
          : Math.abs(projectSpendGap - projectCompletionPct) <= 16
            ? 'neutral'
            : 'negative',
    },
    {
      id: 'forecastVariance',
      label: FINANCIAL_HEALTH_LABELS.forecastVariance,
      weight: FINANCIAL_HEALTH_WEIGHTS.forecastVariance,
      score: clamp(100 - forecastDivergencePct * 3),
      measure: `${round(forecastDivergencePct)}% divergence from approved`,
      explanation: `Departmental year-end forecasts diverge from the approved position by ${round(forecastDivergencePct)}%. This measures how well the corporation is forecasting itself - it is not a prediction of the outturn.`,
      direction: forecastDivergencePct <= 6 ? 'positive' : forecastDivergencePct <= 14 ? 'neutral' : 'negative',
    },
  ]

  const components: FinancialComponent[] = rawComponents.map((c) => ({
    ...c,
    contribution: round(c.score * c.weight, 1),
  }))

  const index = clamp(components.reduce((s, c) => s + c.contribution, 0))
  const state: OperationalState =
    index >= 78 ? 'operational' : index >= 62 ? 'degraded' : index >= 48 ? 'at-risk' : 'review-required'

  const strongest = [...components].sort((a, b) => b.score - a.score)[0]
  const weakest = [...components].sort((a, b) => a.score - b.score)[0]
  const narrative =
    strongest && weakest
      ? t('The index stands at {0}/100. It is held up chiefly by {1} ({2}/100) and pulled down chiefly by {3} ({4}/100). {5}', index, strongest.label.toLowerCase(), strongest.score, weakest.label.toLowerCase(), weakest.score, weakest.explanation)
      : t('The index stands at {0}/100.', index)

  // --- Leakage indicators -------------------------------------------------
  const leakageIndicators: LeakageIndicator[] = []

  if (arrearsCrore > 0) {
    leakageIndicators.push({
      id: 'arrears',
      label: t('Uncollected assessed revenue'),
      detail: t('{0} crore assessed but not collected. This is a receivable requiring recovery action, not a loss and not an irregularity.', round(arrearsCrore)),
      severity: arrearsCrore > assessedRevenueCrore * 0.25 ? 'high' : 'medium',
      exposureCrore: round(arrearsCrore),
    })
  }

  const openAnomalies = anomalies.filter((a) => a.status === 'open' || a.status === 'under-review')
  if (openAnomalies.length > 0) {
    leakageIndicators.push({
      id: 'anomalies',
      label: t('Open revenue exceptions'),
      detail: t('{0} revenue exception(s) remain open for reconciliation. An exception is a figure that does not match an expected pattern; it is a reconciliation candidate and carries no implication of wrongdoing.', openAnomalies.length),
      severity: openAnomalies.length >= 8 ? 'high' : 'medium',
      exposureCrore: round(openAnomalies.reduce((s, a) => s + a.indicativeValueCrore, 0)),
    })
  }

  const overspent = budgetLines.filter((l) => l.variancePct < -10)
  if (overspent.length > 0) {
    leakageIndicators.push({
      id: 'overspend',
      label: t('Budget lines beyond phased plan'),
      detail: t('{0} budget line(s) are spending more than 10% ahead of the phased plan. Each requires either a revision or a departmental explanation.', overspent.length),
      severity: overspent.length >= 6 ? 'high' : 'medium',
      exposureCrore: round(overspent.reduce((s, l) => s + Math.max(0, l.actualCrore - l.revisedCrore), 0)),
    })
  }

  const paymentAhead = projects.filter((p) => {
    const paidPct = p.sanctionedCostCrore > 0 ? (p.paidCrore / p.sanctionedCostCrore) * 100 : 0
    return paidPct - p.completionPct >= 20
  })
  if (paymentAhead.length > 0) {
    leakageIndicators.push({
      id: 'payment-progress',
      label: t('Payment materially ahead of recorded progress'),
      detail: t('{0} project(s) show payment released more than 20 percentage points ahead of recorded completion. Progress and payment are maintained in different systems and may legitimately diverge; each case requires reconciliation on its own facts.', paymentAhead.length),
      severity: 'high',
      exposureCrore: round(
        paymentAhead.reduce((s, p) => s + Math.max(0, p.paidCrore - (p.sanctionedCostCrore * p.completionPct) / 100), 0),
      ),
    })
  }

  return {
    index,
    state,
    components,
    narrative,
    leakageIndicators,
    position: {
      approvedCrore: round(approvedCrore),
      revisedCrore: round(revisedCrore),
      committedCrore: round(committedCrore),
      actualCrore: round(actualCrore),
      forecastYearEndCrore: round(forecastYearEndCrore),
      targetRevenueCrore: round(targetRevenueCrore),
      collectedRevenueCrore: round(collectedRevenueCrore),
      assessedRevenueCrore: round(assessedRevenueCrore),
      arrearsCrore: round(arrearsCrore),
      netPositionCrore: round(collectedRevenueCrore - actualCrore),
      capexApprovedCrore: round(capexApprovedCrore),
      capexActualCrore: round(capexActualCrore),
      projectSanctionedCrore: round(projectSanctionedCrore),
      projectPaidCrore: round(projectPaidCrore),
      projectCompletionPct: round(projectCompletionPct),
    },
  }
}

export interface DepartmentFinancialRow {
  departmentId: string
  label: string
  approvedCrore: number
  revisedCrore: number
  actualCrore: number
  committedCrore: number
  utilisationPct: number
  variancePct: number
  state: OperationalState
}

/** Departmental position, ranked by the widest variance against plan. */
export function departmentFinancialRows(budgetLines: BudgetLine[]): DepartmentFinancialRow[] {
  const byDept = new Map<string, BudgetLine[]>()
  for (const l of budgetLines) {
    const list = byDept.get(l.departmentId) ?? []
    list.push(l)
    byDept.set(l.departmentId, list)
  }

  return [...byDept.entries()]
    .map(([departmentId, lines]) => {
      const approvedCrore = lines.reduce((s, l) => s + l.approvedCrore, 0)
      const revisedCrore = lines.reduce((s, l) => s + l.revisedCrore, 0)
      const actualCrore = lines.reduce((s, l) => s + l.actualCrore, 0)
      const committedCrore = lines.reduce((s, l) => s + l.committedCrore, 0)
      const utilisationPct = revisedCrore > 0 ? (actualCrore / revisedCrore) * 100 : 0
      const variancePct = lines.reduce((s, l) => s + l.variancePct, 0) / lines.length

      return {
        departmentId,
        label: departmentName(departmentId),
        approvedCrore: round(approvedCrore),
        revisedCrore: round(revisedCrore),
        actualCrore: round(actualCrore),
        committedCrore: round(committedCrore),
        utilisationPct: round(utilisationPct),
        variancePct: round(variancePct),
        state: (Math.abs(variancePct) <= 8
          ? 'operational'
          : Math.abs(variancePct) <= 16
            ? 'degraded'
            : Math.abs(variancePct) <= 25
              ? 'at-risk'
              : 'review-required') as OperationalState,
      }
    })
    .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct))
}
