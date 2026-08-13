import type { DataClassification, IsoDateTime, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/legal.ts
 *
 * The Law Department's own docket - court matters, RTI applications and
 * contractor arbitration.
 *
 * Every other register in this platform reports on a decision the
 * administration itself initiated and can itself close: a decision case, a
 * council resolution, a recovery worklist entry. Litigation is not that shape.
 * A writ petition is filed by a citizen or a company against the Corporation;
 * a PIL is filed in the public interest; an arbitration is invoked by a
 * contractor under a clause the Corporation signed. The Corporation is
 * frequently the RESPONDENT, not the party in control of the timeline - which
 * is precisely why a Commissioner needs a register of it distinct from every
 * other screen here, all of which describe the administration acting on its
 * own initiative.
 *
 * Figures are modelled demonstration data, as everywhere else in this
 * platform. Nothing here is drawn from a live case-management or e-Courts
 * system.
 */

/* ==========================================================================
   Court matters
   ========================================================================== */

export type CourtForum =
  | 'bombay-high-court'
  | 'supreme-court'
  | 'city-civil-court'
  | 'small-causes-court'
  | 'consumer-forum'
  | 'maharera'
  | 'ngt'
  | 'state-information-commission'

function build$COURT_FORUM_LABEL(): Record<CourtForum, string> {
  return {
  'bombay-high-court': t('Bombay High Court'),
  'supreme-court': t('Supreme Court of India'),
  'city-civil-court': t('City Civil Court'),
  'small-causes-court': t('Court of Small Causes'),
  'consumer-forum': t('District Consumer Disputes Redressal Commission'),
  maharera: t('MahaRERA'),
  ngt: t('National Green Tribunal'),
  'state-information-commission': t('State Information Commission'),
}
}
export let COURT_FORUM_LABEL: Record<CourtForum, string> = build$COURT_FORUM_LABEL()
registerLayer(() => {
  COURT_FORUM_LABEL = build$COURT_FORUM_LABEL()
})

export type CaseType =
  | 'writ-petition'
  | 'pil'
  | 'civil-appeal'
  | 'consumer-complaint'
  | 'service-matter'
  | 'land-acquisition-dispute'

function build$CASE_TYPE_LABEL(): Record<CaseType, string> {
  return {
  'writ-petition': t('Writ Petition'),
  pil: t('Public Interest Litigation'),
  'civil-appeal': t('Civil Appeal'),
  'consumer-complaint': t('Consumer Complaint'),
  'service-matter': t('Service Matter'),
  'land-acquisition-dispute': t('Land Acquisition Dispute'),
}
}
export let CASE_TYPE_LABEL: Record<CaseType, string> = build$CASE_TYPE_LABEL()
registerLayer(() => {
  CASE_TYPE_LABEL = build$CASE_TYPE_LABEL()
})

export type CorporationRole = 'petitioner' | 'respondent' | 'appellant' | 'intervenor'

function build$CORPORATION_ROLE_LABEL(): Record<CorporationRole, string> {
  return {
  petitioner: t('Petitioner'),
  respondent: t('Respondent'),
  appellant: t('Appellant'),
  intervenor: t('Intervenor'),
}
}
export let CORPORATION_ROLE_LABEL: Record<CorporationRole, string> = build$CORPORATION_ROLE_LABEL()
registerLayer(() => {
  CORPORATION_ROLE_LABEL = build$CORPORATION_ROLE_LABEL()
})

export type CaseStatus =
  | 'filed'
  | 'pending-hearing'
  | 'interim-order'
  | 'stayed'
  | 'disposed-favourable'
  | 'disposed-adverse'
  | 'remanded'

function build$CASE_STATUS_LABEL(): Record<CaseStatus, string> {
  return {
  filed: t('Filed'),
  'pending-hearing': t('Pending Hearing'),
  'interim-order': t('Interim Order in Force'),
  stayed: t('Stayed'),
  'disposed-favourable': t('Disposed - Favourable'),
  'disposed-adverse': t('Disposed - Adverse'),
  remanded: t('Remanded'),
}
}
export let CASE_STATUS_LABEL: Record<CaseStatus, string> = build$CASE_STATUS_LABEL()
registerLayer(() => {
  CASE_STATUS_LABEL = build$CASE_STATUS_LABEL()
})

/**
 * A court matter the Corporation is party to.
 *
 * No litigant, applicant or opposing individual is named - `opposingParty`
 * holds a category ("Resident welfare association", "Contracting firm",
 * "State government"), never a person. The subject and the forum are what an
 * officer preparing a brief needs; who exactly is suing the Corporation over
 * what is a matter for the case file the Law Department already holds, not
 * for this platform to reproduce.
 */
export interface LegalCase {
  id: string
  tenantId: TenantId
  reference: string
  caseType: CaseType
  court: CourtForum
  corporationRole: CorporationRole
  subject: string
  summary: string
  /** The subject-matter domain the case bears on, e.g. "coastal", "revenue". */
  domain: string
  wardIds: string[]
  departmentId: string
  opposingParty: string
  filedAt: IsoDateTime
  lastHearingAt?: IsoDateTime
  nextHearingAt?: IsoDateTime
  status: CaseStatus
  /** Financial exposure if decided adversely, INR crore. Not a provision. */
  financialExposureCrore?: number
  counselAssigned: string
  classification: DataClassification
}

/* ==========================================================================
   RTI applications
   ========================================================================== */

export type RtiStatus = 'pending' | 'responded' | 'first-appeal' | 'second-appeal' | 'closed'

function build$RTI_STATUS_LABEL(): Record<RtiStatus, string> {
  return {
  pending: t('Pending Response'),
  responded: t('Responded'),
  'first-appeal': t('First Appeal'),
  'second-appeal': t('Second Appeal - State Information Commission'),
  closed: t('Closed'),
}
}
export let RTI_STATUS_LABEL: Record<RtiStatus, string> = build$RTI_STATUS_LABEL()
registerLayer(() => {
  RTI_STATUS_LABEL = build$RTI_STATUS_LABEL()
})

/**
 * An RTI application under the Right to Information Act, 2005.
 *
 * No applicant is named - the Act itself protects the applicant's purpose
 * from being demanded, and a platform that recorded who was asking would be
 * working against the statute it is modelling. What is held is the subject
 * category, the department it was routed to, and the statutory clock: a
 * Public Information Officer has thirty days to respond (thirty-five where
 * the application first reached an Assistant PIO), a first appeal is decided
 * within thirty days of the response falling due, and a second appeal lies to
 * the State Information Commission within ninety days of that.
 */
export interface RtiApplication {
  id: string
  tenantId: TenantId
  reference: string
  subjectCategory: string
  departmentId: string
  wardId?: string
  receivedAt: IsoDateTime
  /** Statutory response deadline - thirty days from receipt. */
  dueAt: IsoDateTime
  status: RtiStatus
  respondedAt?: IsoDateTime
  firstAppealFiledAt?: IsoDateTime
  firstAppealDecidedAt?: IsoDateTime
  secondAppealFiledAt?: IsoDateTime
  /** True once the statutory response deadline has passed unmet. */
  breached: boolean
  classification: DataClassification
}

/* ==========================================================================
   Contractor arbitration
   ========================================================================== */

export type ArbitrationDisputeType =
  | 'payment-dispute'
  | 'extension-of-time'
  | 'liquidated-damages'
  | 'termination'
  | 'quality-dispute'

function build$ARBITRATION_DISPUTE_TYPE_LABEL(): Record<ArbitrationDisputeType, string> {
  return {
  'payment-dispute': t('Payment / Final Bill Dispute'),
  'extension-of-time': t('Extension of Time Claim'),
  'liquidated-damages': t('Liquidated Damages Dispute'),
  termination: t('Contract Termination Dispute'),
  'quality-dispute': t('Quality / Rework Dispute'),
}
}
export let ARBITRATION_DISPUTE_TYPE_LABEL: Record<ArbitrationDisputeType, string> = build$ARBITRATION_DISPUTE_TYPE_LABEL()
registerLayer(() => {
  ARBITRATION_DISPUTE_TYPE_LABEL = build$ARBITRATION_DISPUTE_TYPE_LABEL()
})

export type ArbitrationStage =
  | 'notice-invoked'
  | 'tribunal-constituted'
  | 'pleadings'
  | 'hearings'
  | 'award-reserved'
  | 'award-passed'
  | 'award-challenged'

function build$ARBITRATION_STAGE_LABEL(): Record<ArbitrationStage, string> {
  return {
  'notice-invoked': t('Arbitration Notice Invoked'),
  'tribunal-constituted': t('Tribunal Constituted'),
  pleadings: t('Pleadings'),
  hearings: t('Hearings'),
  'award-reserved': t('Award Reserved'),
  'award-passed': t('Award Passed'),
  'award-challenged': t('Award Challenged (Section 34)'),
}
}
export let ARBITRATION_STAGE_LABEL: Record<ArbitrationStage, string> = build$ARBITRATION_STAGE_LABEL()
registerLayer(() => {
  ARBITRATION_STAGE_LABEL = build$ARBITRATION_STAGE_LABEL()
})

/**
 * A contract dispute referred to arbitration under the Arbitration and
 * Conciliation Act, 1996.
 *
 * `awardDueBy` carries the statutory clock the Act itself sets: a tribunal
 * must render its award within twelve months of pleadings closing, extendable
 * by the parties' consent by a further six. A matter running past that
 * without a recorded extension is the finding this register exists to
 * surface - not the claim amount, which a tribunal decides, but whether the
 * Corporation's own process is keeping statutory time.
 */
export interface ArbitrationMatter {
  id: string
  tenantId: TenantId
  reference: string
  contractReference: string
  contractorName: string
  disputeType: ArbitrationDisputeType
  stage: ArbitrationStage
  departmentId: string
  wardIds: string[]
  claimedCrore: number
  counterClaimCrore?: number
  awardAmountCrore?: number
  invokedAt: IsoDateTime
  pleadingsClosedAt?: IsoDateTime
  awardDueBy?: IsoDateTime
  extensionGranted: boolean
  status: 'active' | 'awarded' | 'award-challenged' | 'closed'
  classification: DataClassification
}

/* ==========================================================================
   Roll-up
   ========================================================================== */

export interface LegalPosition {
  casesActive: number
  casesFiledYtd: number
  casesDisposedYtd: number
  /** Share of disposed matters resolved in the Corporation's favour. */
  favourableSharePct: number
  /** Exposure carried across every undisposed matter, INR crore. */
  financialExposureCrore: number
  rtiPending: number
  rtiOverdue: number
  rtiSecondAppeals: number
  arbitrationActive: number
  arbitrationExposureCrore: number
  /** Matters past the twelve-month statutory award timeline with no recorded extension. */
  arbitrationOverdue: number
}
