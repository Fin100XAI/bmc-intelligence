import type { IsoDateTime } from './common'

/**
 * src/types/transparency.ts
 *
 * The public Transparency Portal's own, deliberately narrow data shape.
 *
 * Every other type in this platform is read behind `RequirePermission` and
 * scoped by `canAccess` to a signed-in principal. This module is read by
 * nobody in particular - an anonymous visitor - so it cannot lean on that
 * engine at all; there is no principal for it to evaluate a decision against.
 * The safety property here is therefore architectural rather than a runtime
 * check: this type can only ever hold city-wide aggregates and the specific
 * categories of record that are public by law or established practice in
 * India regardless of viewer (sanctioned budgets, tender awards, Government
 * Resolutions, RTI turnaround statistics, passed council resolutions) - it
 * has no field for anything ward-scoped, individually identifying, or
 * classified above `public`. See `src/services/transparency.service.ts` for
 * why this is a hand-curated view rather than a filter over the officer-facing
 * services.
 */

export interface PublicBudgetSummary {
  financialYear: string
  approvedCrore: number
  revisedCrore: number
  actualCrore: number
  utilisationPct: number
}

export interface PublicContractAward {
  reference: string
  title: string
  contractorName: string
  valueCrore: number
  awardDate: IsoDateTime
  departmentName: string
}

export interface PublicGovernmentResolution {
  reference: string
  subject: string
  issuingDepartment: string
  documentType: string
  issuedAt: IsoDateTime
  status: string
}

export interface PublicCouncilResolution {
  reference: string
  subject: string
  committee: string
  status: string
  tabledAt: IsoDateTime
  financialImplicationCrore?: number
}

export interface PublicRtiPerformance {
  received12m: number
  respondedWithinStatutoryPeriodPct: number
  pendingBacklog: number
  secondAppeals12m: number
}

export interface TransparencyOverview {
  municipalityName: string
  city: string
  generatedAt: IsoDateTime
  budget: PublicBudgetSummary
  recentContracts: PublicContractAward[]
  recentResolutions: PublicGovernmentResolution[]
  recentCouncilResolutions: PublicCouncilResolution[]
  rti: PublicRtiPerformance
}
