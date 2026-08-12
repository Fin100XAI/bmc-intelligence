import type {
  ConfidenceLevel,
  DataClassification,
  IsoDateTime,
  OperationalState,
  Severity,
  TenantId,
} from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/** ---------------------------------------------------------------------
 * Budget intelligence
 * ------------------------------------------------------------------- */

export type BudgetHead = 'revenue' | 'capital' | 'establishment' | 'debt-service'

function build$BUDGET_HEAD_LABEL(): Record<BudgetHead, string> {
  return {
  revenue: t('Revenue Expenditure'),
  capital: t('Capital Expenditure'),
  establishment: t('Establishment'),
  'debt-service': t('Debt Service'),
}
}
export let BUDGET_HEAD_LABEL: Record<BudgetHead, string> = build$BUDGET_HEAD_LABEL()
registerLayer(() => {
  BUDGET_HEAD_LABEL = build$BUDGET_HEAD_LABEL()
})

export interface BudgetLine {
  id: string
  tenantId: TenantId
  financialYear: string
  departmentId: string
  head: BudgetHead
  /** All monetary values in INR crore. */
  approvedCrore: number
  revisedCrore: number
  committedCrore: number
  actualCrore: number
  utilisationPct: number
  /** Positive = under-spend against phased plan, negative = over-spend. */
  variancePct: number
  forecastYearEndCrore: number
  state: OperationalState
  riskNote?: string
  wardId?: string
}

export interface BudgetScenarioInput {
  /** Percentage change applied to capital allocation. */
  capitalAllocationDeltaPct: number
  /** Percentage change applied to revenue expenditure. */
  revenueExpenditureDeltaPct: number
  /** Percentage change applied to expected collection. */
  collectionEfficiencyDeltaPct: number
  /** Additional contingency reserve in INR crore. */
  contingencyCrore: number
}

/** ---------------------------------------------------------------------
 * Revenue & property intelligence
 * ------------------------------------------------------------------- */

export type RevenueStream =
  | 'property-tax'
  | 'water-charges'
  | 'development-charges'
  | 'licence-fees'
  | 'advertisement'
  | 'rentals'
  | 'octroi-compensation'
  | 'other'

function build$REVENUE_STREAM_LABEL(): Record<RevenueStream, string> {
  return {
  'property-tax': t('Property Tax'),
  'water-charges': t('Water Charges'),
  'development-charges': t('Development Charges'),
  'licence-fees': t('Licence Fees'),
  advertisement: t('Advertisement'),
  rentals: t('Municipal Rentals'),
  'octroi-compensation': t('Octroi Compensation (GST)'),
  other: t('Other Receipts'),
}
}
export let REVENUE_STREAM_LABEL: Record<RevenueStream, string> = build$REVENUE_STREAM_LABEL()
registerLayer(() => {
  REVENUE_STREAM_LABEL = build$REVENUE_STREAM_LABEL()
})

export interface RevenueRecord {
  id: string
  tenantId: TenantId
  financialYear: string
  stream: RevenueStream
  wardId?: string
  /** INR crore. */
  assessedCrore: number
  targetCrore: number
  collectedCrore: number
  arrearsCrore: number
  collectionEfficiencyPct: number
  /** Positive means ahead of target. */
  targetVariancePct: number
  forecastCrore: number
  state: OperationalState
}

/**
 * A pattern requiring reconciliation. Deliberately never described as fraud -
 * anomaly does not mean fraud and risk does not mean guilt.
 */
export type AnomalyDisposition =
  | 'anomaly'
  | 'unusual-pattern'
  | 'investigation-candidate'
  | 'reconciliation-required'

function build$ANOMALY_DISPOSITION_LABEL(): Record<AnomalyDisposition, string> {
  return {
  anomaly: t('Anomaly'),
  'unusual-pattern': t('Unusual Pattern'),
  'investigation-candidate': t('Investigation Candidate'),
  'reconciliation-required': t('Reconciliation Required'),
}
}
export let ANOMALY_DISPOSITION_LABEL: Record<AnomalyDisposition, string> = build$ANOMALY_DISPOSITION_LABEL()
registerLayer(() => {
  ANOMALY_DISPOSITION_LABEL = build$ANOMALY_DISPOSITION_LABEL()
})

export interface RevenueAnomaly {
  id: string
  tenantId: TenantId
  title: string
  description: string
  disposition: AnomalyDisposition
  stream: RevenueStream
  wardId: string
  /** Indicative magnitude in INR crore - modelled, not adjudicated. */
  indicativeValueCrore: number
  detectedAt: IsoDateTime
  confidence: ConfidenceLevel
  severity: Severity
  evidenceIds: string[]
  status: 'open' | 'under-review' | 'reconciled' | 'referred' | 'closed'
  ownerId?: string
  /** Explicit statement of what the platform is and is not asserting. */
  interpretationNote: string
}

export interface PropertySegment {
  id: string
  tenantId: TenantId
  wardId: string
  segment: 'residential' | 'commercial' | 'industrial' | 'institutional' | 'mixed'
  assessedUnits: number
  assessedValueCrore: number
  collectedCrore: number
  arrearsCrore: number
  collectionEfficiencyPct: number
  reassessmentDue: number
}

/** ---------------------------------------------------------------------
 * Projects
 * ------------------------------------------------------------------- */

export type ProjectCategory =
  | 'roads'
  | 'stormwater'
  | 'water-supply'
  | 'sewerage'
  | 'health'
  | 'education'
  | 'solid-waste'
  | 'coastal'
  | 'buildings'
  | 'mobility'
  | 'environment'

function build$PROJECT_CATEGORY_LABEL(): Record<ProjectCategory, string> {
  return {
  roads: t('Roads & Bridges'),
  stormwater: t('Storm Water Drainage'),
  'water-supply': t('Water Supply'),
  sewerage: t('Sewerage'),
  health: t('Health Infrastructure'),
  education: t('Education Infrastructure'),
  'solid-waste': t('Solid Waste'),
  coastal: t('Coastal Protection'),
  buildings: t('Municipal Buildings'),
  mobility: t('Mobility & Transport'),
  environment: t('Environment'),
}
}
export let PROJECT_CATEGORY_LABEL: Record<ProjectCategory, string> = build$PROJECT_CATEGORY_LABEL()
registerLayer(() => {
  PROJECT_CATEGORY_LABEL = build$PROJECT_CATEGORY_LABEL()
})

export type ProjectStatus =
  | 'planned'
  | 'tendered'
  | 'awarded'
  | 'in-progress'
  | 'delayed'
  | 'on-hold'
  | 'completed'
  | 'closed'

function build$PROJECT_STATUS_LABEL(): Record<ProjectStatus, string> {
  return {
  planned: t('Planned'),
  tendered: t('Tendered'),
  awarded: t('Awarded'),
  'in-progress': t('In Progress'),
  delayed: t('Delayed'),
  'on-hold': t('On Hold'),
  completed: t('Completed'),
  closed: t('Closed'),
}
}
export let PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = build$PROJECT_STATUS_LABEL()
registerLayer(() => {
  PROJECT_STATUS_LABEL = build$PROJECT_STATUS_LABEL()
})

export interface ProjectMilestone {
  id: string
  name: string
  plannedDate: IsoDateTime
  actualDate?: IsoDateTime
  status: 'pending' | 'achieved' | 'slipped' | 'at-risk'
  slippageDays: number
}

/** A single explainable contributor to the composite project risk score. */
export interface RiskDriver {
  id: string
  label: string
  /** Contribution to the composite score, 0–100. */
  contribution: number
  /** Weight applied to this driver in the engine. */
  weight: number
  /** Raw normalised driver value 0–100. */
  rawScore: number
  explanation: string
  severity: Severity
}

export interface Project {
  id: string
  tenantId: TenantId
  reference: string
  name: string
  description: string
  wardIds: string[]
  departmentId: string
  category: ProjectCategory
  contractorId: string
  /** INR crore. */
  sanctionedCostCrore: number
  currentCostCrore: number
  paidCrore: number
  plannedStart: IsoDateTime
  plannedEnd: IsoDateTime
  actualStart?: IsoDateTime
  actualEnd?: IsoDateTime
  completionPct: number
  /** Expected completion at this point per the phased plan. */
  plannedCompletionPct: number
  milestones: ProjectMilestone[]
  status: ProjectStatus
  /** 0–100 composite risk score; higher is worse. */
  riskScore: number
  riskDrivers: RiskDriver[]
  openIssues: number
  complaintsLinked: number
  inspectionObservationsOpen: number
  lastInspectedAt: IsoDateTime
  classification: DataClassification
  updatedAt: IsoDateTime
}

/** ---------------------------------------------------------------------
 * Procurement, contracts & vendors
 * ------------------------------------------------------------------- */

export interface Contractor {
  id: string
  tenantId: TenantId
  name: string
  registrationRef: string
  category: ProjectCategory[]
  activeContracts: number
  totalValueCrore: number
  /** 0–100 delivery performance index; higher is better. */
  performanceIndex: number
  onTimeDeliveryPct: number
  openObservations: number
  /** Institutional risk flags - never an assertion of wrongdoing. */
  riskFlags: string[]
  state: OperationalState
  empanelledSince: IsoDateTime
}

export type TenderStage =
  | 'draft'
  | 'published'
  | 'bidding'
  | 'evaluation'
  | 'awarded'
  | 'cancelled'

function build$TENDER_STAGE_LABEL(): Record<TenderStage, string> {
  return {
  draft: t('Draft'),
  published: t('Published'),
  bidding: t('Bidding'),
  evaluation: t('Under Evaluation'),
  awarded: t('Awarded'),
  cancelled: t('Cancelled'),
}
}
export let TENDER_STAGE_LABEL: Record<TenderStage, string> = build$TENDER_STAGE_LABEL()
registerLayer(() => {
  TENDER_STAGE_LABEL = build$TENDER_STAGE_LABEL()
})

export interface Contract {
  id: string
  tenantId: TenantId
  reference: string
  title: string
  tenderReference: string
  category: ProjectCategory
  departmentId: string
  wardIds: string[]
  contractorId: string
  valueCrore: number
  paidCrore: number
  awardDate: IsoDateTime
  startDate: IsoDateTime
  endDate: IsoDateTime
  originalEndDate: IsoDateTime
  extensions: number
  variationValueCrore: number
  variationPct: number
  milestonesTotal: number
  milestonesAchieved: number
  /** 0–100 supplier performance index. */
  performanceScore: number
  stage: TenderStage
  projectId?: string
  /** Explainable procurement risk indicators. */
  riskIndicators: RiskDriver[]
  riskScore: number
  classification: DataClassification
}
