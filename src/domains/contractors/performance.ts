import { CONTRACTORS, CONTRACTS, CONTRACTOR_BY_ID, PROJECTS } from '@/data/finance.data'
import { departmentName, wardName } from '@/data/reference'
import type { Contract, Contractor, Project, ProjectCategory } from '@/types/finance'
import type { OperationalState, Severity } from '@/types/common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Contractor Performance Engine.
 *
 * Delivery performance is computed from the contract and project record, not
 * asserted. Every weight below is published so a supplier's standing can be
 * explained to the supplier - an index a corporation cannot justify is an
 * index it cannot defend.
 *
 * A risk indicator on this page describes DELIVERY exposure requiring
 * management attention. It is never an assertion of misconduct, and nothing
 * here is a finding, a penalty or a disqualification. Those are the outcome of
 * process, not of arithmetic.
 */

export const CONTRACTOR_PERFORMANCE_WEIGHTS = {
  onTimeDelivery: 0.3,
  milestoneAchievement: 0.25,
  costDiscipline: 0.2,
  inspectionCompliance: 0.15,
  complaintCorrelation: 0.1,
} as const

function build$CONTRACTOR_PERFORMANCE_LABELS(): Record<keyof typeof CONTRACTOR_PERFORMANCE_WEIGHTS, string> {
  return {
  onTimeDelivery: t('On-time delivery'),
  milestoneAchievement: t('Milestone achievement'),
  costDiscipline: t('Cost discipline'),
  inspectionCompliance: t('Inspection compliance'),
  complaintCorrelation: t('Complaint correlation'),
}
}
export let CONTRACTOR_PERFORMANCE_LABELS: Record<keyof typeof CONTRACTOR_PERFORMANCE_WEIGHTS, string> = build$CONTRACTOR_PERFORMANCE_LABELS()
registerLayer(() => {
  CONTRACTOR_PERFORMANCE_LABELS = build$CONTRACTOR_PERFORMANCE_LABELS()
})

/** A supplier's standing against one published criterion. */
export interface PerformanceComponent {
  id: keyof typeof CONTRACTOR_PERFORMANCE_WEIGHTS
  label: string
  weight: number
  /** Normalised 0–100, higher is better. */
  score: number
  contribution: number
  explanation: string
}

export interface ContractorRiskIndicator {
  id: string
  label: string
  detail: string
  severity: Severity
}

export interface ContractorProfile {
  contractor: Contractor
  activeContracts: Contract[]
  closedContracts: Contract[]
  projects: Project[]
  departments: string[]
  wards: string[]
  categories: ProjectCategory[]
  totalContractedCrore: number
  totalPaidCrore: number
  /** Paid as a share of contracted value. */
  paymentRatioPct: number
  /** Weighted mean completion across this supplier's projects. */
  deliveryProgressPct: number
  totalExtensions: number
  meanVariationPct: number
  openObservations: number
  complaintsLinked: number
  components: PerformanceComponent[]
  /** Recomputed from the published weights above. */
  performanceIndex: number
  state: OperationalState
  riskIndicators: ContractorRiskIndicator[]
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Builds the full institutional picture of one supplier.
 *
 * `contracts` and `projects` are passed in rather than read from the dataset
 * so the service can hand in only what the acting principal is entitled to
 * see - a profile assembled from records a principal may not read would leak
 * through its own totals.
 */
export function buildContractorProfile(
  contractor: Contractor,
  contracts: Contract[],
  projects: Project[],
): ContractorProfile {
  const own = contracts.filter((c) => c.contractorId === contractor.id)
  const ownProjects = projects.filter((p) => p.contractorId === contractor.id)

  const activeContracts = own.filter((c) => c.stage === 'awarded' || c.stage === 'evaluation')
  const closedContracts = own.filter((c) => c.stage !== 'awarded' && c.stage !== 'evaluation')

  const totalContractedCrore = own.reduce((s, c) => s + c.valueCrore, 0)
  const totalPaidCrore = own.reduce((s, c) => s + c.paidCrore, 0)
  const paymentRatioPct = totalContractedCrore > 0 ? (totalPaidCrore / totalContractedCrore) * 100 : 0

  const totalExtensions = own.reduce((s, c) => s + c.extensions, 0)
  const meanVariationPct = mean(own.map((c) => c.variationPct))
  const openObservations = ownProjects.reduce((s, p) => s + p.inspectionObservationsOpen, 0)
  const complaintsLinked = ownProjects.reduce((s, p) => s + p.complaintsLinked, 0)

  const deliveryProgressPct = mean(ownProjects.map((p) => p.completionPct))
  const plannedProgressPct = mean(ownProjects.map((p) => p.plannedCompletionPct))

  /**
   * Portfolio-normalised rates.
   *
   * Extensions, open observations and linked complaints are portfolio TOTALS,
   * and totals grow with the size of the portfolio. Assessed against a fixed
   * threshold - or subtracted from a score at a fixed rate per event - they
   * measure how much work a supplier holds rather than how well it delivers,
   * and a supplier holding twelve contracts is condemned for holding twelve
   * contracts. Every count-based judgement below is therefore made on the rate,
   * not the total: extensions per contract, observations per project,
   * complaints per project. The totals are still reported, because the total is
   * what an officer has to act on; the rate is what makes two suppliers of
   * different size comparable.
   */
  const extensionsPerContract = own.length > 0 ? totalExtensions / own.length : 0
  const observationsPerProject = ownProjects.length > 0 ? openObservations / ownProjects.length : 0
  const complaintsPerProject = ownProjects.length > 0 ? complaintsLinked / ownProjects.length : 0

  const milestonesTotal = own.reduce((s, c) => s + c.milestonesTotal, 0)
  const milestonesAchieved = own.reduce((s, c) => s + c.milestonesAchieved, 0)

  // --- The five published criteria ---------------------------------------
  const onTimeScore = clamp(contractor.onTimeDeliveryPct)
  const milestoneScore = clamp(milestonesTotal > 0 ? (milestonesAchieved / milestonesTotal) * 100 : 100)
  // Variation is measured either side of plan; over-run is what erodes the score.
  const costScore = clamp(100 - Math.max(0, meanVariationPct) * 3)
  const inspectionScore = clamp(100 - observationsPerProject * 11)
  const complaintScore = clamp(100 - complaintsPerProject * 2.2)

  const rawComponents: Array<Omit<PerformanceComponent, 'contribution'>> = [
    {
      id: 'onTimeDelivery',
      label: CONTRACTOR_PERFORMANCE_LABELS.onTimeDelivery,
      weight: CONTRACTOR_PERFORMANCE_WEIGHTS.onTimeDelivery,
      score: onTimeScore,
      explanation: `${contractor.onTimeDeliveryPct}% of this supplier's completed work was delivered within the contracted period.`,
    },
    {
      id: 'milestoneAchievement',
      label: CONTRACTOR_PERFORMANCE_LABELS.milestoneAchievement,
      weight: CONTRACTOR_PERFORMANCE_WEIGHTS.milestoneAchievement,
      score: milestoneScore,
      explanation:
        milestonesTotal > 0
          ? t('{0} of {1} contracted milestones recorded as achieved.', milestonesAchieved, milestonesTotal)
          : t('No milestones are recorded against this supplier in the readable contract set.'),
    },
    {
      id: 'costDiscipline',
      label: CONTRACTOR_PERFORMANCE_LABELS.costDiscipline,
      weight: CONTRACTOR_PERFORMANCE_WEIGHTS.costDiscipline,
      score: costScore,
      explanation: `Mean contract variation of ${meanVariationPct.toFixed(1)}% against awarded value. A variation is a recorded contractual change, not an irregularity.`,
    },
    {
      id: 'inspectionCompliance',
      label: CONTRACTOR_PERFORMANCE_LABELS.inspectionCompliance,
      weight: CONTRACTOR_PERFORMANCE_WEIGHTS.inspectionCompliance,
      score: inspectionScore,
      explanation:
        ownProjects.length > 0
          ? t('{0} inspection observation(s) remain open beyond the rectification window across {1} project(s) - {2} per project.', openObservations, ownProjects.length, observationsPerProject.toFixed(1))
          : t('No projects are recorded against this supplier in the readable set, so no inspection position is assessed.'),
    },
    {
      id: 'complaintCorrelation',
      label: CONTRACTOR_PERFORMANCE_LABELS.complaintCorrelation,
      weight: CONTRACTOR_PERFORMANCE_WEIGHTS.complaintCorrelation,
      score: complaintScore,
      explanation:
        ownProjects.length > 0
          ? t('{0} citizen complaint(s) are linked to works delivered by this supplier across {1} project(s) - {2} per project. Correlation with a work site is not attribution of cause.', complaintsLinked, ownProjects.length, complaintsPerProject.toFixed(1))
          : t('{0} citizen complaint(s) are linked to works delivered by this supplier. Correlation with a work site is not attribution of cause.', complaintsLinked),
    },
  ]

  const components: PerformanceComponent[] = rawComponents.map((c) => ({
    ...c,
    contribution: Math.round(c.score * c.weight * 10) / 10,
  }))

  const performanceIndex = clamp(components.reduce((s, c) => s + c.contribution, 0))

  const state: OperationalState =
    performanceIndex >= 78
      ? 'operational'
      : performanceIndex >= 62
        ? 'degraded'
        : performanceIndex >= 50
          ? 'at-risk'
          : 'review-required'

  // --- Risk indicators ----------------------------------------------------
  const riskIndicators: ContractorRiskIndicator[] = []

  if (own.length > 0 && extensionsPerContract >= 1.6) {
    riskIndicators.push({
      id: 'extensions',
      label: t('Repeated time extensions'),
      detail: t('{0} time extension(s) recorded across {1} contract(s) - an average of {2} per contract. Extensions are granted through process and may be entirely justified; the rate is a delivery-continuity signal for management attention.', totalExtensions, own.length, extensionsPerContract.toFixed(1)),
      severity: extensionsPerContract >= 2.4 ? 'high' : 'medium',
    })
  }

  if (meanVariationPct >= 12) {
    riskIndicators.push({
      id: 'variation',
      label: t('Cost variation above departmental norm'),
      detail: t('Mean variation of {0}% against awarded value. This requires reconciliation against the sanctioned scope; it is not an assertion that any variation was improper.', meanVariationPct.toFixed(1)),
      severity: meanVariationPct >= 20 ? 'high' : 'medium',
    })
  }

  if (paymentRatioPct - deliveryProgressPct >= 15 && ownProjects.length > 0) {
    riskIndicators.push({
      id: 'payment-progress',
      label: t('Payment ahead of recorded progress'),
      detail: t('{0}% of contracted value has been released against {1}% recorded delivery progress. This is a reconciliation candidate - the two figures are maintained by different systems and may legitimately diverge.', paymentRatioPct.toFixed(0), deliveryProgressPct.toFixed(0)),
      severity: 'high',
    })
  }

  if (ownProjects.length > 0 && observationsPerProject >= 5) {
    riskIndicators.push({
      id: 'observations',
      label: t('Open inspection observations'),
      detail: t('{0} observation(s) remain open beyond the rectification window across {1} project(s) - {2} per project. Each requires departmental closure on its own merits.', openObservations, ownProjects.length, observationsPerProject.toFixed(1)),
      severity: observationsPerProject >= 7.5 ? 'high' : 'medium',
    })
  }

  if (deliveryProgressPct + 12 < plannedProgressPct && ownProjects.length > 0) {
    riskIndicators.push({
      id: 'schedule',
      label: t('Delivery behind phased plan'),
      detail: t('Recorded progress of {0}% against a phased plan expecting {1}% at this point.', deliveryProgressPct.toFixed(0), plannedProgressPct.toFixed(0)),
      severity: 'medium',
    })
  }

  const categoryShare = new Map<ProjectCategory, number>()
  for (const c of own) categoryShare.set(c.category, (categoryShare.get(c.category) ?? 0) + c.valueCrore)
  const topCategory = [...categoryShare.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topCategory && totalContractedCrore > 0 && topCategory[1] / totalContractedCrore > 0.7 && own.length >= 3) {
    riskIndicators.push({
      id: 'concentration',
      label: t('Single-category concentration'),
      detail: t('{0}% of this supplier\'s contracted value sits in one category. This is a continuity exposure for the corporation if the supplier underperforms, not a comment on the supplier.', Math.round((topCategory[1] / totalContractedCrore) * 100)),
      severity: 'low',
    })
  }

  return {
    contractor,
    activeContracts,
    closedContracts,
    projects: ownProjects,
    departments: [...new Set(own.map((c) => c.departmentId))],
    wards: [...new Set(own.flatMap((c) => c.wardIds))],
    categories: [...new Set(own.map((c) => c.category))],
    totalContractedCrore: Math.round(totalContractedCrore * 10) / 10,
    totalPaidCrore: Math.round(totalPaidCrore * 10) / 10,
    paymentRatioPct: Math.round(paymentRatioPct * 10) / 10,
    deliveryProgressPct: Math.round(deliveryProgressPct * 10) / 10,
    totalExtensions,
    meanVariationPct: Math.round(meanVariationPct * 10) / 10,
    openObservations,
    complaintsLinked,
    components,
    performanceIndex,
    state,
    riskIndicators,
  }
}

/** Every supplier profile, computed from the records supplied. */
export function buildAllContractorProfiles(contracts: Contract[], projects: Project[]): ContractorProfile[] {
  return CONTRACTORS.map((c) => buildContractorProfile(c, contracts, projects)).sort(
    (a, b) => a.performanceIndex - b.performanceIndex,
  )
}

export interface PerformanceBand {
  band: string
  min: number
  max: number
  count: number
  description: string
  tone: 'critical' | 'risk' | 'warn' | 'info' | 'positive'
}

/** The banded distribution used when reporting supplier standing. */
export function contractorPerformanceBands(profiles: ContractorProfile[]): PerformanceBand[] {
  const bands: Array<Omit<PerformanceBand, 'count'>> = [
    {
      band: 'Review required',
      min: 0,
      max: 49,
      description: t('Delivery standing below empanelment expectation. Departmental review of active work is warranted.'),
      tone: 'critical',
    },
    {
      band: 'At risk',
      min: 50,
      max: 61,
      description: t('Delivery exposure present across more than one criterion. Closer supervision indicated.'),
      tone: 'risk',
    },
    {
      band: 'Degraded',
      min: 62,
      max: 77,
      description: t('Delivering, with identified weaknesses on specific criteria.'),
      tone: 'warn',
    },
    {
      band: 'Meeting expectation',
      min: 78,
      max: 100,
      description: t('Delivery standing at or above empanelment expectation across the published criteria.'),
      tone: 'positive',
    },
  ]

  return bands.map((b) => ({
    ...b,
    count: profiles.filter((p) => p.performanceIndex >= b.min && p.performanceIndex <= b.max).length,
  }))
}

/** Convenience for surfaces that only need the whole unfiltered picture. */
export function allContractorProfiles(): ContractorProfile[] {
  return buildAllContractorProfiles(CONTRACTS, PROJECTS)
}

export { CONTRACTOR_BY_ID, departmentName, wardName }
