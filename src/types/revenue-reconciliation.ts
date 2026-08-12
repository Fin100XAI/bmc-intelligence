import type {
  ConfidenceLevel,
  DataClassification,
  IsoDateTime,
  Severity,
  TenantId,
} from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/revenue-reconciliation.ts
 *
 * REGISTRY RECONCILIATION - the assessment review candidate model.
 *
 * A municipal corporation's largest recoverable revenue exposure is not
 * uncollected demand. It is demand that was never raised, because the
 * corporation's own registers disagree with one another: a property drawing a
 * metered water connection that carries no assessment record; a completion
 * certificate the corporation itself issued against a parcel still assessed at
 * the under-construction rate; a trade licence for commercial activity at an
 * address assessed as residential.
 *
 * Every one of those disagreements is visible in records the corporation
 * already holds. None of them requires a new survey, a sensor or a citizen
 * interaction to detect. That is the whole basis of this module.
 *
 * THE LANGUAGE RULE THIS MODULE EXISTS UNDER
 *
 * A disagreement between two registers is a REVIEW CANDIDATE. It is never a
 * finding, never an allegation, and never an assertion that anybody has
 * under-declared, evaded or misrepresented anything. There are many entirely
 * lawful reasons for every rule in this catalogue to fire - a statutory
 * exemption, a pending appeal, a part-occupancy certificate, one connection
 * serving several separately assessed units, an assessment update legitimately
 * still in the departmental queue.
 *
 * Those explanations are therefore modelled as first-class data on the rule
 * itself (`legitimateExplanations`), shown to the officer before they act, and
 * `closed-no-action` is a first-class outcome carrying its own reason code -
 * not a failure of the engine. A platform that treats every exception as
 * recoverable money teaches its users to distrust it within a fortnight.
 *
 * Nothing in this module revises a demand. It produces a candidate; a named
 * officer verifies it; the statutory assessment process with notice and
 * hearing runs exactly as it does today.
 */

/* ---------------------------------------------------------------------------
 * Registers
 * ------------------------------------------------------------------------- */

/**
 * The municipal registers this engine reconciles. Every one of these is a
 * record the corporation itself creates and holds - which is what makes a
 * disagreement between two of them a question the corporation can answer
 * without going to any external authority.
 */
export type RegistrySource =
  | 'property-assessment'
  | 'water-connection'
  | 'trade-licence'
  | 'building-approval'
  | 'occupancy-certificate'

function build$REGISTRY_LABEL(): Record<RegistrySource, string> {
  return {
  'property-assessment': t('Property Assessment Register'),
  'water-connection': t('Water Connection Register'),
  'trade-licence': t('Trade Licence Register'),
  'building-approval': t('Building Permission Register'),
  'occupancy-certificate': t('Occupancy Certificate Register'),
}
}
export let REGISTRY_LABEL: Record<RegistrySource, string> = build$REGISTRY_LABEL()
registerLayer(() => {
  REGISTRY_LABEL = build$REGISTRY_LABEL()
})

/** Short form used in table cells and match evidence rows. */
function build$REGISTRY_SHORT_LABEL(): Record<RegistrySource, string> {
  return {
  'property-assessment': t('Assessment'),
  'water-connection': t('Water'),
  'trade-licence': t('Trade licence'),
  'building-approval': t('Building permission'),
  'occupancy-certificate': t('Occupancy certificate'),
}
}
export let REGISTRY_SHORT_LABEL: Record<RegistrySource, string> = build$REGISTRY_SHORT_LABEL()
registerLayer(() => {
  REGISTRY_SHORT_LABEL = build$REGISTRY_SHORT_LABEL()
})

/** How a parcel is presently assessed. Drives which rules can apply to it. */
export type AssessmentUsage = 'residential' | 'commercial' | 'industrial' | 'institutional' | 'mixed'

function build$ASSESSMENT_USAGE_LABEL(): Record<AssessmentUsage, string> {
  return {
  residential: t('Residential'),
  commercial: t('Commercial'),
  industrial: t('Industrial'),
  institutional: t('Institutional'),
  mixed: t('Mixed use'),
}
}
export let ASSESSMENT_USAGE_LABEL: Record<AssessmentUsage, string> = build$ASSESSMENT_USAGE_LABEL()
registerLayer(() => {
  ASSESSMENT_USAGE_LABEL = build$ASSESSMENT_USAGE_LABEL()
})

/**
 * Assessment lifecycle state on the parcel record itself. `under-construction`
 * matters disproportionately: it carries a materially lower rate, and it is
 * the state a parcel is most often left in long after the corporation has
 * issued the very certificate that should have ended it.
 */
export type AssessmentStatus =
  | 'assessed'
  | 'under-construction'
  | 'exempt'
  | 'not-assessed'
  | 'under-appeal'

function build$ASSESSMENT_STATUS_LABEL(): Record<AssessmentStatus, string> {
  return {
  assessed: t('Assessed'),
  'under-construction': t('Under construction'),
  exempt: t('Exempt'),
  'not-assessed': t('Not assessed'),
  'under-appeal': t('Under appeal'),
}
}
export let ASSESSMENT_STATUS_LABEL: Record<AssessmentStatus, string> = build$ASSESSMENT_STATUS_LABEL()
registerLayer(() => {
  ASSESSMENT_STATUS_LABEL = build$ASSESSMENT_STATUS_LABEL()
})

/**
 * A parcel on the property assessment register.
 *
 * `ownerName` is a modelled institutional label ("Owner 4821 (name withheld)")
 * and never a citizen's name - this platform holds no personal data anywhere,
 * and an assessment review candidate is exactly the place where holding it
 * would be least defensible.
 */
export interface PropertyParcel {
  id: string
  tenantId: TenantId
  /** Property tax account number as printed on the demand notice. */
  assessmentNumber: string
  /** City survey / CTS number - the closest thing to a common land key. */
  surveyNumber: string
  wardId: string
  /** Modelled locality label, used as one of the match signals. */
  locality: string
  addressLine: string
  ownerLabel: string
  usage: AssessmentUsage
  status: AssessmentStatus
  /** Built-up area the assessment is presently raised on. */
  assessedAreaSqm: number
  /** Rateable value carried by the current assessment, in rupees. */
  rateableValue: number
  /** Annual demand raised against the parcel, in rupees. */
  annualDemand: number
  lastAssessedAt: IsoDateTime
  /** Set where the parcel carries a statutory exemption. */
  exemptionGround?: string
  geo: { lat: number; lng: number }
}

/**
 * A record on any register other than the assessment register.
 *
 * One shape covers water connections, trade licences, building permissions and
 * occupancy certificates because the engine only ever needs four things from
 * a counterpart record: where it is, who holds it, what it says, and when it
 * was issued. Register-specific detail lives in `attributes`, which the
 * interface renders verbatim so an officer sees the source record rather than
 * the engine's summary of it.
 */
export interface RegistryRecord {
  id: string
  tenantId: TenantId
  source: RegistrySource
  /** The reference the issuing department knows this record by. */
  reference: string
  wardId: string
  locality: string
  addressLine: string
  ownerLabel: string
  /** Present on most but not all registers - absence is itself a match signal. */
  surveyNumber?: string
  issuedAt: IsoDateTime
  /** Register-specific fields, rendered as a definition list in the interface. */
  attributes: Array<{ label: string; value: string }>
  /**
   * Where the counterpart record itself states an area or a usage, it is
   * lifted out so a rule can compare it against the assessment without
   * parsing `attributes`.
   */
  statedAreaSqm?: number
  statedUsage?: AssessmentUsage
  geo: { lat: number; lng: number }
}

/* ---------------------------------------------------------------------------
 * Matching
 * ------------------------------------------------------------------------- */

/**
 * The signals used to decide that a counterpart record and a parcel describe
 * the same property.
 *
 * This is the part of the engine that must never overstate itself. Municipal
 * registers have no common property identifier - that absence IS the problem
 * the platform exists to work around, and any design that assumes a clean
 * foreign key is describing a corporation that does not exist. Matching is
 * therefore probabilistic, every contributing signal is published, and a match
 * below the confidence floor goes to a human matching queue instead of raising
 * a review candidate.
 */
export type MatchSignal = 'survey-number' | 'address' | 'locality' | 'owner-label' | 'proximity'

function build$MATCH_SIGNAL_LABEL(): Record<MatchSignal, string> {
  return {
  'survey-number': t('City survey number'),
  address: t('Address line'),
  locality: t('Locality'),
  'owner-label': t('Owner label'),
  proximity: t('Geographic proximity'),
}
}
export let MATCH_SIGNAL_LABEL: Record<MatchSignal, string> = build$MATCH_SIGNAL_LABEL()
registerLayer(() => {
  MATCH_SIGNAL_LABEL = build$MATCH_SIGNAL_LABEL()
})

/**
 * Published weights for the match score. These are stated here rather than
 * buried in the scoring function for the same reason the contractor
 * performance weights are published: a corporation cannot defend a match it
 * cannot explain, and the officer reviewing a candidate is entitled to see
 * exactly why the engine believes two records are the same property.
 */
export const MATCH_SIGNAL_WEIGHTS: Record<MatchSignal, number> = {
  'survey-number': 0.42,
  address: 0.24,
  proximity: 0.16,
  locality: 0.1,
  'owner-label': 0.08,
}

/** One signal's contribution to a match, shown to the reviewing officer. */
export interface MatchEvidence {
  signal: MatchSignal
  /** 0-1. How strongly this signal agrees across the two records. */
  agreement: number
  weight: number
  contribution: number
  /** The value seen on the assessment register. */
  parcelValue: string
  /** The value seen on the counterpart register. */
  counterpartValue: string
}

/**
 * The engine's assessment of whether two records describe the same property.
 * `score` is 0-100 and `evidence` always explains it in full.
 */
export interface MatchAssessment {
  score: number
  confidence: ConfidenceLevel
  evidence: MatchEvidence[]
  /**
   * True where the score falls below the floor at which the engine is willing
   * to raise a review candidate on its own. These go to the matching queue.
   */
  belowFloor: boolean
}

/** Score at or above which a match may support a review candidate. */
export const MATCH_CONFIDENCE_FLOOR = 62

/* ---------------------------------------------------------------------------
 * Rules
 * ------------------------------------------------------------------------- */

export type ReconciliationRuleId =
  | 'oc-issued-still-under-construction'
  | 'approved-area-exceeds-assessed-area'
  | 'water-connection-without-assessment'
  | 'commercial-licence-residential-assessment'
  | 'high-consumption-residential-assessment'

/**
 * Rule tiers, and what a tier actually commits the platform to.
 *
 * Tier 1 rules reconcile two records the corporation ISSUED ITSELF. When one
 * fires, the corporation is disagreeing with its own paperwork, which is why
 * these convert to a revised demand at a far higher rate and why a pilot
 * should be scoped on them alone.
 *
 * Tier 2 rules join across departments that never shared a key. They are
 * where the largest recoverable value sits and where the legitimate
 * explanations matter most.
 *
 * Tier 3 rules are directional only. They are surfaced for analysis and are
 * deliberately NOT placed on an officer's worklist: acting on a consumption
 * pattern without a corroborating record is precisely the behaviour that makes
 * a corporation's assessment process indefensible on appeal.
 */
export type RuleTier = 1 | 2 | 3

function build$RULE_TIER_LABEL(): Record<RuleTier, string> {
  return {
  1: t('Tier 1 - corporation records disagree with each other'),
  2: t('Tier 2 - cross-departmental reconciliation'),
  3: t('Tier 3 - directional signal, analysis only'),
}
}
export let RULE_TIER_LABEL: Record<RuleTier, string> = build$RULE_TIER_LABEL()
registerLayer(() => {
  RULE_TIER_LABEL = build$RULE_TIER_LABEL()
})

/**
 * A published reconciliation rule.
 *
 * Everything an officer, a supplier of the data, or an auditor would need in
 * order to challenge the rule is on this object. A rule whose definition is
 * not readable is a rule the corporation cannot defend at a hearing.
 */
export interface ReconciliationRule {
  id: ReconciliationRuleId
  title: string
  tier: RuleTier
  /** The registers this rule reconciles. */
  sources: [RegistrySource, RegistrySource]
  /** Plain-language statement of the condition, shown in the rule catalogue. */
  definition: string
  /** Why this disagreement matters to the corporation's revenue position. */
  rationale: string
  /**
   * The lawful reasons this rule fires on a property where nothing is wrong.
   * Rendered to the officer BEFORE they act on a candidate, and offered as
   * closure reason codes. This is the most important field on the type.
   */
  legitimateExplanations: string[]
  /**
   * Minimum age of the triggering condition before a candidate is raised, in
   * days. Guards against flagging work that is legitimately still in the
   * departmental queue.
   */
  minimumAgeDays: number
  /** Whether candidates from this rule reach an officer worklist at all. */
  worklistEligible: boolean
  severity: Severity
  classification: DataClassification
}

/* ---------------------------------------------------------------------------
 * Review candidates
 * ------------------------------------------------------------------------- */

/**
 * The lifecycle of a review candidate.
 *
 * Both terminal states are legitimate outcomes and the interface treats them
 * as equals. `closed-no-action` is not a miss - it is the engine being told
 * something true about the property that no register recorded, and it is the
 * signal that drives published rule precision.
 */
export type ExceptionStatus =
  | 'raised'
  | 'assigned'
  | 'field-verification'
  | 'demand-revised'
  | 'recovered'
  | 'closed-no-action'
  | 'disputed'

function build$EXCEPTION_STATUS_LABEL(): Record<ExceptionStatus, string> {
  return {
  raised: t('Raised'),
  assigned: t('Assigned'),
  'field-verification': t('Field verification'),
  'demand-revised': t('Demand revised'),
  recovered: t('Recovered'),
  'closed-no-action': t('Closed - no action'),
  disputed: t('Under dispute'),
}
}
export let EXCEPTION_STATUS_LABEL: Record<ExceptionStatus, string> = build$EXCEPTION_STATUS_LABEL()
registerLayer(() => {
  EXCEPTION_STATUS_LABEL = build$EXCEPTION_STATUS_LABEL()
})

/** Statuses at which a candidate is still live work. */
export const OPEN_EXCEPTION_STATUSES: ReadonlyArray<ExceptionStatus> = [
  'raised',
  'assigned',
  'field-verification',
  'disputed',
]

/**
 * Why a candidate was closed without action.
 *
 * These are reason CODES rather than free text because they are the input to
 * published rule precision - and because "the assessor typed something" is not
 * a defensible basis for retiring a rule. Free-text detail is captured
 * alongside the code, never instead of it.
 */
export type NoActionReason =
  | 'statutory-exemption'
  | 'already-assessed-separately'
  | 'assessment-update-in-progress'
  | 'record-relates-to-different-property'
  | 'part-occupancy-only'
  | 'appeal-pending'
  | 'registry-data-error'
  | 'property-demolished'

function build$NO_ACTION_REASON_LABEL(): Record<NoActionReason, string> {
  return {
  'statutory-exemption': t('Statutory exemption applies'),
  'already-assessed-separately': t('Already assessed under a separate account'),
  'assessment-update-in-progress': t('Assessment update already in progress'),
  'record-relates-to-different-property': t('Counterpart record relates to a different property'),
  'part-occupancy-only': t('Part occupancy certificate only'),
  'appeal-pending': t('Assessment under appeal'),
  'registry-data-error': t('Error in the source register'),
  'property-demolished': t('Property demolished or no longer in existence'),
}
}
export let NO_ACTION_REASON_LABEL: Record<NoActionReason, string> = build$NO_ACTION_REASON_LABEL()
registerLayer(() => {
  NO_ACTION_REASON_LABEL = build$NO_ACTION_REASON_LABEL()
})

/**
 * Reason codes that indicate the RULE was wrong about this property, as
 * distinct from those where the rule was right and the property is simply not
 * recoverable. Only the former count against a rule's precision - closing a
 * genuinely exempt property is the engine working correctly, not failing.
 */
export const PRECISION_ADVERSE_REASONS: ReadonlyArray<NoActionReason> = [
  'record-relates-to-different-property',
  'registry-data-error',
  'already-assessed-separately',
]

/** One recorded step in a candidate's history. */
export interface ExceptionEvent {
  id: string
  at: IsoDateTime
  actorId: string
  actorName: string
  status: ExceptionStatus
  note: string
}

/**
 * A single assessment review candidate: the engine's output, and the unit of
 * work an officer is assigned.
 */
export interface AssessmentException {
  id: string
  tenantId: TenantId
  reference: string
  ruleId: ReconciliationRuleId
  tier: RuleTier
  wardId: string
  /** The parcel on the assessment register, where one was matched at all. */
  parcelId?: string
  parcelAssessmentNumber?: string
  /** The counterpart record that disagrees with it. */
  counterpartId: string
  counterpartSource: RegistrySource
  counterpartReference: string
  /** Human-readable locality, carried so the worklist need not join. */
  locality: string
  addressLine: string
  match: MatchAssessment
  /**
   * Modelled annual value the corporation would recover if the candidate is
   * verified and the demand revised, in rupees. An estimate, always described
   * as such in the interface, and never presented as an amount owed.
   */
  indicativeAnnualValue: number
  /**
   * Years the condition appears to have persisted, used only to give the
   * officer a sense of scale. Arrears recovery is bounded by statute and by
   * the corporation's own policy - the platform does not compute a claim.
   */
  persistedYears: number
  severity: Severity
  confidence: ConfidenceLevel
  status: ExceptionStatus
  /** The officer this candidate is assigned to, once assigned. */
  assigneeId?: string
  assigneeName?: string
  raisedAt: IsoDateTime
  dueAt?: IsoDateTime
  /** Set on closure without action. */
  noActionReason?: NoActionReason
  /** Value actually carried into a revised demand, once revised. */
  revisedAnnualValue?: number
  /** Value actually collected against the revised demand. */
  recoveredValue?: number
  history: ExceptionEvent[]
  /** The caveat this candidate must always be displayed with. */
  caveat: string
}

/* ---------------------------------------------------------------------------
 * Rule precision
 * ------------------------------------------------------------------------- */

/**
 * A rule's observed precision, computed from closure outcomes rather than
 * asserted.
 *
 * This is what allows the platform to say "Tier 1 candidates convert at 84%"
 * instead of "we found 40,000 exceptions". The second sentence loses the room:
 * an assessor who works a queue that is majority noise stops opening the queue,
 * and the deployment is over regardless of what the dashboard says.
 */
export interface RulePrecision {
  ruleId: ReconciliationRuleId
  title: string
  tier: RuleTier
  raised: number
  /** Candidates that reached a terminal state and can therefore be scored. */
  resolved: number
  /** Resolved candidates that produced a revised demand or a recovery. */
  upheld: number
  /** Resolved against the rule - the counterpart record was wrong or unrelated. */
  adverse: number
  /** Closed for a lawful reason that does not count against the rule. */
  lawfullyClosed: number
  /**
   * `upheld / (upheld + adverse)`, as a percentage - how often the rule was
   * RIGHT about the property when the officer could tell either way.
   *
   * Lawful closures are deliberately excluded from the denominator. A rule that
   * correctly surfaces an exempt temple for periodic revalidation has not made
   * a mistake, and scoring it as one would drive the catalogue towards rules
   * that find only money and never find the truth. Null until a candidate from
   * this rule has resolved one way or the other.
   */
  precisionPct: number | null
  /** Indicative value carried by candidates from this rule, in rupees. */
  indicativeValue: number
  /** Value actually carried into revised demands, in rupees. */
  revisedValue: number
  /** Value actually recovered, in rupees. */
  recoveredValue: number
}

/* ---------------------------------------------------------------------------
 * Pilot and statutory reporting
 * ------------------------------------------------------------------------- */

/**
 * The four measures a 90-day, single-ward pilot is judged on.
 *
 * Scoped deliberately small because a pilot of this size sits inside a
 * Commissioner's own administrative approval limit and needs no committee - and
 * because these four numbers are what a corporation carries into the business
 * case for anything larger.
 */
export interface PilotMetrics {
  wardId: string
  wardLabel: string
  /** Candidates raised within the pilot scope. */
  raised: number
  /** Candidates a named officer has verified either way. */
  verified: number
  /** Candidates that produced a revised demand. */
  demandsRevised: number
  /** Indicative annual value of everything raised, in rupees. */
  indicativeValue: number
  /** Annual value actually carried into revised demands, in rupees. */
  revisedValue: number
  /** Value actually collected, in rupees. */
  recoveredValue: number
  /**
   * Share of terminal candidates that produced a revised demand, as a
   * percentage. This is a CONVERSION rate, not the rule-correctness figure on
   * `RulePrecision` - a pilot is judged on how much of the work it generated
   * turned into money, including the candidates that lawfully did not.
   */
  precisionPct: number | null
  /** Share of raised candidates that have reached a terminal state. */
  completionPct: number
}

/**
 * A line on the statutory property tax return.
 *
 * Central Finance Commission grants to urban local bodies have carried entry
 * conditions tied to property tax - published accounts, notified floor rates,
 * and demonstrated growth in collection. A corporation therefore has to
 * produce this return whether or not it has a platform.
 *
 * Producing it here is deliberate. A dashboard is opened when somebody
 * remembers it exists; a system that generates a filing the corporation is
 * obliged to make becomes load-bearing, and load-bearing systems survive the
 * transfer of the officer who commissioned them.
 *
 * The figures are modelled demonstration values. The exact conditions of the
 * current Finance Commission award period must be verified against the
 * operative guidelines before any real return is filed - which is why this
 * type carries `basisNote` and the interface always renders it.
 */
export interface StatutoryReturnLine {
  id: string
  label: string
  /** Rupee or count value, formatted by the interface against `unit`. */
  value: number
  unit: 'rupees' | 'count' | 'percent'
  /** Where the figure came from, stated on the return itself. */
  derivation: string
}

export interface StatutoryReturn {
  id: string
  tenantId: TenantId
  title: string
  financialYear: string
  generatedAt: IsoDateTime
  lines: StatutoryReturnLine[]
  /** The standing caveat about verifying the operative award conditions. */
  basisNote: string
}
