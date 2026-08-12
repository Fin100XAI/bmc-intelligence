import { TENANT_ID, municipality } from '@/config/municipality.config'
import { DEMO_USERS } from '@/auth/demo-users'
import { PROPERTY_SEGMENTS } from '@/data/finance.data'
import { PROPERTY_PARCELS, REGISTRY_RECORDS } from '@/data/reconciliation.data'
import { WARDS, wardName } from '@/data/reference'
import { canAccess } from '@/security/access'
import type { ConfidenceLevel, Severity } from '@/types/common'
import type { User } from '@/types/organisation'
import type {
  AssessmentException,
  ExceptionEvent,
  MatchAssessment,
  MatchEvidence,
  MatchSignal,
  NoActionReason,
  PilotMetrics,
  PropertyParcel,
  ReconciliationRule,
  ReconciliationRuleId,
  RegistryRecord,
  RulePrecision,
  RuleTier,
  StatutoryReturn,
} from '@/types/revenue-reconciliation'
import {
  MATCH_CONFIDENCE_FLOOR,
  MATCH_SIGNAL_WEIGHTS,
  OPEN_EXCEPTION_STATUSES,
  PRECISION_ADVERSE_REASONS,
} from '@/types/revenue-reconciliation'
import { DEMO_NOW, det, isoDaysFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/domains/revenue/reconciliation.ts
 *
 * THE REGISTRY RECONCILIATION ENGINE.
 *
 * Given the municipal registers in `src/data/reconciliation.data.ts`, this
 * module does three things and refuses to do a fourth.
 *
 *   1. MATCHES records across registers that share no key, probabilistically,
 *      publishing every signal that contributed to the decision.
 *   2. APPLIES a published rule catalogue to matched pairs, raising an
 *      assessment REVIEW CANDIDATE where two registers disagree.
 *   3. MEASURES its own rules against what officers actually found, so the
 *      catalogue can be defended with an observed precision rather than an
 *      assertion.
 *
 * What it will not do is revise a demand, compute an amount owed, or state
 * that anybody has under-declared anything. It produces a candidate for a named
 * officer to verify, and the statutory assessment process - notice, hearing,
 * appeal - runs exactly as it does without this platform. Every candidate
 * carries `RECONCILIATION_CAVEAT` and the interface is required to render it.
 *
 * ON MATCHING, AND WHY IT IS PROBABILISTIC
 *
 * There is no common property identifier across municipal registers. The water
 * department, the assessment department and the building proposal department
 * each recorded the same building independently, on different days, in
 * different formats, and nobody reconciled them. Any engine that assumes a
 * foreign key is describing a corporation that does not exist.
 *
 * So a match here is a weighted score over five published signals, and a score
 * below `MATCH_CONFIDENCE_FLOOR` does not raise a candidate at all - it goes to
 * a human matching queue. Acting on a low-confidence match means issuing a
 * notice against the wrong property, which is the single fastest way to
 * discredit an assessment drive and the officer who authorised it.
 */

export const RECONCILIATION_CAVEAT =
  'This is an assessment review candidate raised where two municipal registers disagree. It is not a finding, not an allegation, and makes no assertion that any person or organisation has under-declared, evaded or misrepresented anything. There are lawful explanations for every rule in this catalogue, which are listed against the rule and offered as closure reasons. No demand is revised by this platform: a named officer verifies the candidate and the statutory assessment process, with notice and hearing, follows unchanged.'

/* ---------------------------------------------------------------------------
 * The published rule catalogue
 * ------------------------------------------------------------------------- */

/**
 * Every rule the engine will apply, stated in full.
 *
 * Published for the same reason the contractor performance weights are
 * published: an assessment the corporation cannot explain is an assessment it
 * cannot defend at a hearing. An officer, a ratepayer's advocate and an auditor
 * should all be able to read the condition that put a property on this list.
 */
function build$RECONCILIATION_RULES(): ReconciliationRule[] {
  return [
  {
    id: 'oc-issued-still-under-construction',
    title: t('Occupancy certificate issued, assessment still at the construction rate'),
    tier: 1,
    sources: ['occupancy-certificate', 'property-assessment'],
    definition:
      t('An occupancy certificate has been issued against the property, and the assessment register still carries it as under construction more than 90 days later.'),
    rationale:
      t('The corporation issued both documents itself. An occupancy certificate is the corporation stating that the building is fit for occupation; the construction-rate assessment is the corporation simultaneously stating that it is not yet complete. One of the two is out of date, and the register can say which without asking anybody anything.'),
    legitimateExplanations: [
      t('A part occupancy certificate was issued and the remainder of the building genuinely remains under construction.'),
      t('The assessment revision is already in the departmental queue and has not yet been posted.'),
      t('The occupancy certificate is under challenge and the assessment has been held pending the outcome.'),
      t('The property was assessed afresh under a different account number after completion.'),
    ],
    minimumAgeDays: 90,
    worklistEligible: true,
    severity: 'high',
    classification: 'confidential',
  },
  {
    id: 'approved-area-exceeds-assessed-area',
    title: t('Sanctioned built-up area materially exceeds the assessed area'),
    tier: 1,
    sources: ['building-approval', 'property-assessment'],
    definition:
      t('The built-up area sanctioned on the building permission exceeds the area the assessment is raised on by 25% or more, and the permission was granted more than a year ago.'),
    rationale:
      t('Both figures are the corporation’s own. A sanctioned plan is a statement of what was permitted to be built; the assessed area is a statement of what is being billed. A sustained divergence between them is the most common single cause of under-recovery on the property tax head, and it is visible without visiting the site.'),
    legitimateExplanations: [
      t('The sanctioned area was never fully constructed.'),
      t('Only the completed portion has been brought to assessment, correctly.'),
      t('Part of the sanctioned area is common area or parking that is not separately assessable.'),
      t('The additional area is assessed under a separate account number.'),
    ],
    minimumAgeDays: 365,
    worklistEligible: true,
    severity: 'high',
    classification: 'confidential',
  },
  {
    id: 'water-connection-without-assessment',
    title: t('Live water connection against a property carrying no current demand'),
    tier: 2,
    sources: ['water-connection', 'property-assessment'],
    definition:
      t('A water connection is live and billing, and the assessment register either holds no matching property at all, holds it as not assessed, or holds an exemption that has not been revalidated in five years.'),
    rationale:
      t('A corporation does not supply water to a property that does not exist. Where a live connection has no corresponding demand, either the property never reached the assessment register or an exemption has outlived the circumstances that justified it. Both are answerable from the corporation’s own records.'),
    legitimateExplanations: [
      t('A statutory exemption applies and remains valid - places of religious worship, government property, recognised aided schools, registered charitable institutions.'),
      t('The connection serves several units that are each separately assessed under their own account numbers.'),
      t('The property sits in a settlement covered by a standing policy decision not to assess.'),
      t('The assessment is under appeal and demand has been stayed.'),
      t('The connection record relates to a different property and the match is wrong.'),
    ],
    minimumAgeDays: 180,
    worklistEligible: true,
    severity: 'critical',
    classification: 'confidential',
  },
  {
    id: 'commercial-licence-residential-assessment',
    title: t('Commercial trade licence at an address assessed as residential'),
    tier: 2,
    sources: ['trade-licence', 'property-assessment'],
    definition:
      t('A current trade licence for commercial activity is registered at a property the assessment register carries as residential, and the licence has been in force for more than 180 days.'),
    rationale:
      t('Commercial usage attracts a materially higher rate than residential. Where the corporation has licensed a trade at an address it is billing at the residential rate, the two departments hold different views of the same premises.'),
    legitimateExplanations: [
      t('The licence is registered at the proprietor’s residential address rather than at the trading premises.'),
      t('The activity is a permitted home occupation that does not change the assessment category.'),
      t('The premises are already assessed as mixed use with the commercial portion apportioned correctly.'),
      t('The licence has lapsed and the register has not been updated.'),
    ],
    minimumAgeDays: 180,
    worklistEligible: true,
    severity: 'medium',
    classification: 'confidential',
  },
  {
    id: 'high-consumption-residential-assessment',
    title: t('Water consumption inconsistent with a residential assessment'),
    tier: 3,
    sources: ['water-connection', 'property-assessment'],
    definition:
      t('Average monthly water consumption exceeds 80 kilolitres against a property assessed as residential.'),
    rationale:
      t('Consumption is a behavioural signal, not a record. It is useful for directing where a survey or an inspection would be worth commissioning, and it is deliberately excluded from officer worklists: issuing a notice on a consumption pattern with no corroborating record is exactly the practice that makes an assessment indefensible on appeal.'),
    legitimateExplanations: [
      t('A large household, a housing society drawing on a single bulk connection, or a shared borewell arrangement.'),
      t('A leak on the internal plumbing that has inflated the meter reading.'),
      t('A meter fault or an estimated reading carried forward.'),
      t('Construction activity temporarily drawing on the domestic connection.'),
    ],
    minimumAgeDays: 0,
    worklistEligible: false,
    severity: 'low',
    classification: 'internal',
  },
]
}
export let RECONCILIATION_RULES: ReconciliationRule[] = build$RECONCILIATION_RULES()
registerLayer(() => {
  RECONCILIATION_RULES = build$RECONCILIATION_RULES()
})

export const RULE_BY_ID: Map<ReconciliationRuleId, ReconciliationRule> = new Map(
  RECONCILIATION_RULES.map((r) => [r.id, r]),
)

/** The closure reasons offered against each rule, in the order shown. */
export const RULE_NO_ACTION_REASONS: Record<ReconciliationRuleId, NoActionReason[]> = {
  'oc-issued-still-under-construction': [
    'part-occupancy-only',
    'assessment-update-in-progress',
    'already-assessed-separately',
    'appeal-pending',
    'record-relates-to-different-property',
    'registry-data-error',
  ],
  'approved-area-exceeds-assessed-area': [
    'already-assessed-separately',
    'assessment-update-in-progress',
    'record-relates-to-different-property',
    'property-demolished',
    'registry-data-error',
  ],
  'water-connection-without-assessment': [
    'statutory-exemption',
    'already-assessed-separately',
    'appeal-pending',
    'record-relates-to-different-property',
    'registry-data-error',
    'property-demolished',
  ],
  'commercial-licence-residential-assessment': [
    'record-relates-to-different-property',
    'already-assessed-separately',
    'assessment-update-in-progress',
    'registry-data-error',
  ],
  'high-consumption-residential-assessment': [
    'registry-data-error',
    'record-relates-to-different-property',
    'already-assessed-separately',
  ],
}

/* ---------------------------------------------------------------------------
 * Matching
 * ------------------------------------------------------------------------- */

/** Expanded back out so an abbreviated counterpart address can still match. */
/**
 * Address abbreviations expanded to a canonical form before tokenising.
 *
 * These are NOT display text and must never be translated. Two registers are
 * matched by comparing token sets, so both sides have to normalise to the same
 * word: if one expansion produced Marathi and the rest produced English, the
 * tokeniser - which keeps only `[a-z0-9]` - would drop the Marathi one
 * entirely and the match would quietly weaken. The addresses themselves are
 * held as recorded in the source register, in the script they were recorded in.
 */
function build$ADDRESS_EXPANSIONS(): Array<[RegExp, string]> {
  return [
  [/\bcr rd\b/g, t('cross road')],
  [/\brd\b/g, 'road'],
  [/\bst\b/g, 'street'],
  [/\bbldg\b/g, 'building'],
  [/\bngr\b/g, 'nagar'],
  [/\bcly\b/g, 'colony'],
]
}
let ADDRESS_EXPANSIONS: Array<[RegExp, string]> = build$ADDRESS_EXPANSIONS()
registerLayer(() => {
  ADDRESS_EXPANSIONS = build$ADDRESS_EXPANSIONS()
})

function addressTokens(address: string): Set<string> {
  let normalised = address.toLowerCase()
  for (const [pattern, replacement] of ADDRESS_EXPANSIONS) {
    normalised = normalised.replace(pattern, replacement)
  }
  return new Set(
    normalised
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection += 1
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** Equirectangular approximation - ample at municipal distances. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const meanLat = ((a.lat + b.lat) / 2) * (Math.PI / 180)
  const dx = (b.lng - a.lng) * Math.cos(meanLat) * 111.32
  const dy = (b.lat - a.lat) * 110.57
  return Math.sqrt(dx * dx + dy * dy)
}

function normaliseSurvey(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

interface IndexedParcel {
  parcel: PropertyParcel
  tokens: Set<string>
  survey: string
}

function confidenceForScore(score: number): ConfidenceLevel {
  if (score >= 85) return 'high'
  if (score >= 70) return 'medium'
  return 'low'
}

/**
 * Scores one counterpart record against one parcel, returning the full
 * evidence trail rather than only the number.
 *
 * A signal the counterpart record does not carry at all - most often the
 * survey number, which about a third of records omit - is left out of the
 * calculation entirely and its weight is redistributed, rather than being
 * scored as a disagreement. Treating a missing field as evidence AGAINST a
 * match would systematically penalise exactly the registers that are worst
 * maintained, which are the ones the corporation most needs reconciled.
 */
function scorePair(record: RegistryRecord, indexed: IndexedParcel, recordTokens: Set<string>): MatchAssessment {
  const evidence: MatchEvidence[] = []
  const push = (signal: MatchSignal, agreement: number, parcelValue: string, counterpartValue: string): void => {
    const weight = MATCH_SIGNAL_WEIGHTS[signal]
    evidence.push({
      signal,
      agreement: Math.round(agreement * 100) / 100,
      weight,
      contribution: Math.round(agreement * weight * 100) / 100,
      parcelValue,
      counterpartValue,
    })
  }

  const counterpartSurvey = normaliseSurvey(record.surveyNumber)
  if (counterpartSurvey.length > 0) {
    push(
      'survey-number',
      counterpartSurvey === indexed.survey ? 1 : 0,
      indexed.parcel.surveyNumber,
      record.surveyNumber ?? '',
    )
  }

  push('address', jaccard(indexed.tokens, recordTokens), indexed.parcel.addressLine, record.addressLine)
  push('locality', indexed.parcel.locality === record.locality ? 1 : 0, indexed.parcel.locality, record.locality)
  push('owner-label', indexed.parcel.ownerLabel === record.ownerLabel ? 1 : 0, indexed.parcel.ownerLabel, record.ownerLabel)

  const km = distanceKm(indexed.parcel.geo, record.geo)
  push(
    'proximity',
    Math.exp(-km / 0.25),
    `${indexed.parcel.geo.lat.toFixed(5)}, ${indexed.parcel.geo.lng.toFixed(5)}`,
    `${record.geo.lat.toFixed(5)}, ${record.geo.lng.toFixed(5)}`,
  )

  const weightSum = evidence.reduce((sum, e) => sum + e.weight, 0)
  const score = weightSum === 0 ? 0 : Math.round((evidence.reduce((sum, e) => sum + e.contribution, 0) / weightSum) * 1000) / 10

  return {
    score,
    confidence: confidenceForScore(score),
    evidence,
    belowFloor: score < MATCH_CONFIDENCE_FLOOR,
  }
}

export interface ParcelMatch {
  parcel?: PropertyParcel
  match: MatchAssessment
}

/**
 * The best parcel the engine can find for a counterpart record.
 *
 * Candidates are drawn from the record's own ward. That is a real constraint
 * rather than an optimisation: municipal registers are maintained ward-wise,
 * and a water connection recorded in one ward against a property assessed in
 * another is a data-quality question for the two departments, not a candidate
 * for a revised demand.
 */
export function bestParcelMatch(record: RegistryRecord, index: Map<string, IndexedParcel[]>): ParcelMatch {
  const candidates = index.get(record.wardId) ?? []
  const recordTokens = addressTokens(record.addressLine)

  let best: ParcelMatch = {
    match: { score: 0, confidence: 'low', evidence: [], belowFloor: true },
  }

  for (const candidate of candidates) {
    const match = scorePair(record, candidate, recordTokens)
    if (match.score > best.match.score) best = { parcel: candidate.parcel, match }
  }

  // A candidate below the floor is reported, but never as a matched parcel: the
  // record goes to the matching queue with the best rejected candidate shown so
  // an officer can confirm or dismiss the association themselves.
  return best.match.belowFloor ? { match: best.match } : best
}

function buildParcelIndex(): Map<string, IndexedParcel[]> {
  const index = new Map<string, IndexedParcel[]>()
  for (const parcel of PROPERTY_PARCELS) {
    const entry: IndexedParcel = {
      parcel,
      tokens: addressTokens(parcel.addressLine),
      survey: normaliseSurvey(parcel.surveyNumber),
    }
    const bucket = index.get(parcel.wardId)
    if (bucket) bucket.push(entry)
    else index.set(parcel.wardId, [entry])
  }
  return index
}

/* ---------------------------------------------------------------------------
 * Rule application
 * ------------------------------------------------------------------------- */

/** Nominal annual rate applied to rateable value. Modelled, and stated as such. */
const NOMINAL_RATE = 0.0155

/** Uplift from a residential to a commercial assessment, as a multiple. */
const COMMERCIAL_UPLIFT = 2.1

function ageDays(iso: string): number {
  return Math.max(0, Math.round((DEMO_NOW.getTime() - new Date(iso).getTime()) / 86_400_000))
}

function fullDemandFor(parcel: PropertyParcel): number {
  return Math.round(parcel.rateableValue * NOMINAL_RATE)
}

function attributeNumber(record: RegistryRecord, label: string): number | undefined {
  const found = record.attributes.find((a) => a.label === label)
  if (!found) return undefined
  const parsed = Number.parseFloat(found.value.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

/** A rule's verdict on one matched pair, before scoring and seeding. */
interface RawCandidate {
  ruleId: ReconciliationRuleId
  record: RegistryRecord
  parcel?: PropertyParcel
  match: MatchAssessment
  indicativeAnnualValue: number
  persistedYears: number
}

/**
 * Median assessed demand in a ward, used as the indicative value where the
 * engine could not match a parcel at all and therefore has no rateable value to
 * work from. Stated on the candidate as an estimate at the ward median, never
 * as an amount owed.
 */
function wardMedianDemand(wardId: string): number {
  const demands = PROPERTY_PARCELS.filter((p) => p.wardId === wardId && p.annualDemand > 0)
    .map((p) => p.annualDemand)
    .sort((a, b) => a - b)
  if (demands.length === 0) return 0
  return demands[Math.floor(demands.length / 2)] ?? 0
}

function evaluate(record: RegistryRecord, { parcel, match }: ParcelMatch): RawCandidate | null {
  switch (record.source) {
    case 'occupancy-certificate': {
      if (!parcel || parcel.status !== 'under-construction') return null
      const age = ageDays(record.issuedAt)
      if (age < 90) return null
      return {
        ruleId: 'oc-issued-still-under-construction',
        record,
        parcel,
        match,
        indicativeAnnualValue: Math.max(0, fullDemandFor(parcel) - parcel.annualDemand),
        persistedYears: Math.max(1, Math.round(age / 365)),
      }
    }

    case 'building-approval': {
      if (!parcel || !record.statedAreaSqm || parcel.assessedAreaSqm <= 0) return null
      // The construction-rate case belongs to the occupancy-certificate rule;
      // raising both against one property would put the same money on an
      // officer's list twice and overstate the corporation's exposure.
      if (parcel.status !== 'assessed') return null
      const ratio = record.statedAreaSqm / parcel.assessedAreaSqm
      const age = ageDays(record.issuedAt)
      if (ratio < 1.25 || age < 365) return null
      const base = parcel.annualDemand > 0 ? parcel.annualDemand : fullDemandFor(parcel)
      return {
        ruleId: 'approved-area-exceeds-assessed-area',
        record,
        parcel,
        match,
        indicativeAnnualValue: Math.round(base * (ratio - 1)),
        persistedYears: Math.max(1, Math.round(age / 365)),
      }
    }

    case 'trade-licence': {
      if (!parcel || parcel.usage !== 'residential' || parcel.status !== 'assessed') return null
      const age = ageDays(record.issuedAt)
      if (age < 180) return null
      const base = parcel.annualDemand > 0 ? parcel.annualDemand : fullDemandFor(parcel)
      const areaShare = Math.min(1, (record.statedAreaSqm ?? parcel.assessedAreaSqm) / parcel.assessedAreaSqm)
      return {
        ruleId: 'commercial-licence-residential-assessment',
        record,
        parcel,
        match,
        indicativeAnnualValue: Math.round(base * areaShare * COMMERCIAL_UPLIFT),
        persistedYears: Math.max(1, Math.round(age / 365)),
      }
    }

    case 'water-connection': {
      const age = ageDays(record.issuedAt)
      const consumption = attributeNumber(record, 'Average monthly consumption') ?? 0

      // No parcel matched above the floor at all: the property may never have
      // reached the assessment register. Raised, but into the matching queue.
      if (!parcel) {
        if (age < 180) return null
        return {
          ruleId: 'water-connection-without-assessment',
          record,
          match,
          indicativeAnnualValue: wardMedianDemand(record.wardId),
          persistedYears: Math.max(1, Math.round(age / 365)),
        }
      }

      if (age >= 180) {
        const exemptionStale = parcel.status === 'exempt' && ageDays(parcel.lastAssessedAt) > 1825
        if (parcel.status === 'not-assessed' || exemptionStale) {
          return {
            ruleId: 'water-connection-without-assessment',
            record,
            parcel,
            match,
            indicativeAnnualValue: parcel.rateableValue > 0 ? fullDemandFor(parcel) : wardMedianDemand(record.wardId),
            persistedYears: Math.max(1, Math.round(age / 365)),
          }
        }
      }

      // Tier 3. Directional only, and never placed on a worklist.
      if (consumption > 80 && parcel.usage === 'residential' && parcel.status === 'assessed') {
        const base = parcel.annualDemand > 0 ? parcel.annualDemand : fullDemandFor(parcel)
        return {
          ruleId: 'high-consumption-residential-assessment',
          record,
          parcel,
          match,
          indicativeAnnualValue: Math.round(base * 0.6),
          persistedYears: 1,
        }
      }

      return null
    }

    default:
      return null
  }
}

/* ---------------------------------------------------------------------------
 * Candidate construction
 * ------------------------------------------------------------------------- */

/**
 * The officers a candidate may be assigned to.
 *
 * Derived from the permission engine rather than from a list of role names.
 * An earlier version named the roles that "plausibly" do assessment work, and
 * half of them - ward officers, deputy commissioners, operators - do not hold
 * `revenue:edit` in this platform's model at all. Assigning work to an officer
 * who cannot open the record is worse than not assigning it: the candidate
 * leaves the unassigned queue, nobody can act on it, and it is never seen
 * again. Reading the model directly means this can never drift from it.
 */
export function assignableOfficers(): User[] {
  return DEMO_USERS.filter(
    (u) => u.tenantId === TENANT_ID && canAccess(u, 'revenue', 'edit', { domain: 'revenue' }).allowed,
  )
}

/**
 * Severity is assigned by where a candidate's indicative value falls against
 * every other candidate raised in this corporation, not against a fixed rupee
 * threshold. A ₹40,000 exposure is routine in Brihanmumbai and significant in
 * Jalna; a hard band would have been wrong in one of them by construction.
 */
function severityByQuantile(rank: number, total: number, tier: RuleTier): Severity {
  if (tier === 3) return 'low'
  const percentile = total <= 1 ? 0 : rank / (total - 1)
  if (percentile < 0.1) return 'critical'
  if (percentile < 0.3) return 'high'
  if (percentile < 0.7) return 'medium'
  return 'low'
}

function candidateConfidence(match: MatchAssessment, tier: RuleTier): ConfidenceLevel {
  if (tier === 3) return 'low'
  if (tier === 2) return match.confidence === 'high' ? 'medium' : 'low'
  return match.confidence
}

/**
 * Outcome distribution used to seed a realistic worked history.
 *
 * A demonstration in which nothing has been worked cannot show rule precision,
 * and rule precision is the whole basis on which an assessment department is
 * asked to trust the queue. The weights differ by tier deliberately: Tier 1
 * candidates reconcile the corporation's own paperwork and convert at a much
 * higher rate than Tier 2 candidates, which is exactly the case a pilot should
 * be scoped on and exactly what the resulting figures should show.
 */
const OUTCOME_WEIGHTS: Record<RuleTier, ReadonlyArray<readonly [AssessmentException['status'], number]>> = {
  1: [
    ['raised', 55],
    ['assigned', 12],
    ['field-verification', 8],
    ['demand-revised', 14],
    ['recovered', 6],
    ['closed-no-action', 5],
  ],
  2: [
    ['raised', 52],
    ['assigned', 13],
    ['field-verification', 9],
    ['demand-revised', 9],
    ['recovered', 4],
    ['closed-no-action', 10],
    ['disputed', 3],
  ],
  3: [['raised', 100]],
}

/**
 * Builds every assessment review candidate for the active corporation.
 *
 * Called once from the in-session store's seed, so the join runs on a
 * corporation switch and not on every request. The output is the initial state
 * of a mutable collection: officers then assign, verify, revise and close
 * against it for the rest of the session.
 */
export function buildAssessmentExceptions(): AssessmentException[] {
  const index = buildParcelIndex()
  const raw: RawCandidate[] = []

  for (const record of REGISTRY_RECORDS) {
    const candidate = evaluate(record, bestParcelMatch(record, index))
    if (candidate) raw.push(candidate)
  }

  // Severity is relative, so the whole set has to exist before any one
  // candidate can be graded.
  const byValue = [...raw].sort((a, b) => b.indicativeAnnualValue - a.indicativeAnnualValue)
  const rankById = new Map(byValue.map((c, i) => [c.record.id, i]))
  const users = assignableOfficers()

  const exceptions = raw.map((candidate, i) => {
    const rule = RULE_BY_ID.get(candidate.ruleId)!
    const r = det(`recon:exception:${candidate.record.id}`)
    const raisedAt = isoDaysFromAnchor(-r.int(4, 96))
    const reference = `RCN/${municipality.financialYear.replace(/[^0-9]/g, '').slice(0, 4)}/${String(i + 1).padStart(5, '0')}`

    const base: AssessmentException = {
      id: `exc-${candidate.record.id}`,
      tenantId: TENANT_ID,
      reference,
      ruleId: candidate.ruleId,
      tier: rule.tier,
      wardId: candidate.record.wardId,
      parcelId: candidate.parcel?.id,
      parcelAssessmentNumber: candidate.parcel?.assessmentNumber,
      counterpartId: candidate.record.id,
      counterpartSource: candidate.record.source,
      counterpartReference: candidate.record.reference,
      locality: candidate.record.locality,
      addressLine: candidate.record.addressLine,
      match: candidate.match,
      indicativeAnnualValue: candidate.indicativeAnnualValue,
      persistedYears: candidate.persistedYears,
      severity: severityByQuantile(rankById.get(candidate.record.id) ?? 0, raw.length, rule.tier),
      confidence: candidateConfidence(candidate.match, rule.tier),
      status: 'raised',
      raisedAt,
      dueAt: rule.worklistEligible ? isoDaysFromAnchor(r.int(3, 45)) : undefined,
      history: [
        {
          id: `exc-ev-${candidate.record.id}-0`,
          at: raisedAt,
          actorId: 'system-reconciliation',
          actorName: 'Registry Reconciliation Engine',
          status: 'raised',
          note: t('Raised on rule "{0}". Match score {1}% across {2} published signals.', rule.title, candidate.match.score, candidate.match.evidence.length),
        },
      ],
      caveat: RECONCILIATION_CAVEAT,
    }

    // A candidate the engine could not match with confidence is never given a
    // worked history: it has not reached a worklist and no officer has seen it.
    if (!rule.worklistEligible || candidate.match.belowFloor || users.length === 0) return base

    return applySeededOutcome(base, rule.tier, r, users)
  })

  return exceptions.sort((a, b) => b.indicativeAnnualValue - a.indicativeAnnualValue)
}

function applySeededOutcome(
  exception: AssessmentException,
  tier: RuleTier,
  r: ReturnType<typeof det>,
  users: User[],
): AssessmentException {
  const status = r.weighted(OUTCOME_WEIGHTS[tier])
  if (status === 'raised') return exception

  const assignee = r.pick(users)
  const history: ExceptionEvent[] = [...exception.history]
  const raisedDay = ageDays(exception.raisedAt)

  const event = (dayOffset: number, next: AssessmentException['status'], note: string): void => {
    history.push({
      id: `exc-ev-${exception.counterpartId}-${history.length}`,
      at: isoDaysFromAnchor(-Math.max(0, raisedDay - dayOffset)),
      actorId: assignee.id,
      actorName: assignee.name,
      status: next,
      note,
    })
  }

  event(1, 'assigned', `Assigned to ${assignee.name}, ${assignee.designation}, for verification against the source registers.`)

  const result: AssessmentException = {
    ...exception,
    status: 'assigned',
    assigneeId: assignee.id,
    assigneeName: assignee.name,
    history,
  }

  if (status === 'assigned') return result

  event(3, 'field-verification', 'Both source records retrieved. Field verification of the premises requested.')
  result.status = 'field-verification'

  if (status === 'field-verification') return result

  if (status === 'disputed') {
    event(6, 'disputed', 'The occupier has contested the review candidate. Referred for hearing under the assessment rules.')
    result.status = 'disputed'
    return result
  }

  if (status === 'closed-no-action') {
    const reasons = RULE_NO_ACTION_REASONS[exception.ruleId]
    // Weighted towards the lawful explanations rather than towards the engine
    // having been wrong - which is what an assessment department actually
    // finds, and what keeps published precision honest in both directions.
    const adverse = r.chance(tier === 1 ? 0.2 : 0.42)
    const pool = adverse
      ? reasons.filter((reason) => PRECISION_ADVERSE_REASONS.includes(reason))
      : reasons.filter((reason) => !PRECISION_ADVERSE_REASONS.includes(reason))
    const reason = pool.length > 0 ? r.pick(pool) : r.pick(reasons)
    event(7, 'closed-no-action', 'Verified. The candidate is not carried forward; the reason is recorded against the rule.')
    result.status = 'closed-no-action'
    result.noActionReason = reason
    return result
  }

  const revised = Math.round(exception.indicativeAnnualValue * r.float(0.58, 1.06))
  event(8, 'demand-revised', 'Verified and upheld. Revised demand raised through the assessment register under the statutory process.')
  result.status = 'demand-revised'
  result.revisedAnnualValue = revised

  if (status === 'demand-revised') return result

  const recovered = Math.round(revised * r.float(0.32, 0.94))
  event(12, 'recovered', 'Payment received against the revised demand.')
  result.status = 'recovered'
  result.recoveredValue = recovered
  return result
}

/* ---------------------------------------------------------------------------
 * Measurement
 * ------------------------------------------------------------------------- */

/** Statuses at which a candidate has been decided one way or the other. */
const TERMINAL_STATUSES: ReadonlySet<AssessmentException['status']> = new Set([
  'demand-revised',
  'recovered',
  'closed-no-action',
])

export function isOpenException(exception: AssessmentException): boolean {
  return OPEN_EXCEPTION_STATUSES.includes(exception.status)
}

export function isTerminalException(exception: AssessmentException): boolean {
  return TERMINAL_STATUSES.has(exception.status)
}

/**
 * Observed precision per rule, computed from closure outcomes.
 *
 * This is the figure that lets a corporation be told "Tier 1 candidates were
 * upheld in 84% of the cases an officer could decide" instead of "the engine
 * found 40,000 exceptions". The second sentence is the one that ends
 * deployments: an assessor working a queue that is mostly noise stops opening
 * the queue within a fortnight, and no dashboard recovers from that.
 */
export function computeRulePrecision(exceptions: AssessmentException[]): RulePrecision[] {
  return RECONCILIATION_RULES.map((rule) => {
    const mine = exceptions.filter((e) => e.ruleId === rule.id)
    const terminal = mine.filter(isTerminalException)
    const upheld = terminal.filter((e) => e.status === 'demand-revised' || e.status === 'recovered').length
    const closures = terminal.filter((e) => e.status === 'closed-no-action')
    const adverse = closures.filter((e) => e.noActionReason && PRECISION_ADVERSE_REASONS.includes(e.noActionReason)).length
    const lawfullyClosed = closures.length - adverse
    const scoreable = upheld + adverse

    return {
      ruleId: rule.id,
      title: rule.title,
      tier: rule.tier,
      raised: mine.length,
      resolved: terminal.length,
      upheld,
      adverse,
      lawfullyClosed,
      precisionPct: scoreable === 0 ? null : Math.round((upheld / scoreable) * 1000) / 10,
      indicativeValue: mine.reduce((sum, e) => sum + e.indicativeAnnualValue, 0),
      revisedValue: mine.reduce((sum, e) => sum + (e.revisedAnnualValue ?? 0), 0),
      recoveredValue: mine.reduce((sum, e) => sum + (e.recoveredValue ?? 0), 0),
    }
  })
}

/**
 * The four measures a single-ward, 90-day pilot is judged on.
 *
 * Deliberately the whole of the scorecard. A pilot that reports twelve numbers
 * reports none of them, and these four are what a corporation carries into the
 * business case for anything larger.
 */
export function computePilotMetrics(exceptions: AssessmentException[], wardId: string): PilotMetrics {
  const scoped = exceptions.filter((e) => e.wardId === wardId)
  const terminal = scoped.filter(isTerminalException)
  const verified = scoped.filter((e) => e.status !== 'raised' && e.status !== 'assigned').length
  const upheld = terminal.filter((e) => e.status === 'demand-revised' || e.status === 'recovered').length

  return {
    wardId,
    wardLabel: wardName(wardId),
    raised: scoped.length,
    verified,
    demandsRevised: upheld,
    indicativeValue: scoped.reduce((sum, e) => sum + e.indicativeAnnualValue, 0),
    revisedValue: scoped.reduce((sum, e) => sum + (e.revisedAnnualValue ?? 0), 0),
    recoveredValue: scoped.reduce((sum, e) => sum + (e.recoveredValue ?? 0), 0),
    precisionPct: terminal.length === 0 ? null : Math.round((upheld / terminal.length) * 1000) / 10,
    completionPct: scoped.length === 0 ? 0 : Math.round((terminal.length / scoped.length) * 1000) / 10,
  }
}

/**
 * Parcels held on the corporation's full assessment register, from the
 * property segment book in `finance.data.ts`.
 *
 * The reconciliation register is a SAMPLE. Reporting what a sample found
 * without also reporting how much of the city it covered is the single most
 * misleading thing this module could do, so both numbers travel together
 * everywhere and the extrapolation between them is labelled as one.
 */
export function assessedUnitsOnRegister(wardId?: string): number {
  return PROPERTY_SEGMENTS.filter((s) => (wardId ? s.wardId === wardId : true)).reduce(
    (sum, s) => sum + s.assessedUnits,
    0,
  )
}

/** Parcels in the reconciliation sample, for the same scope. */
export function sampledParcelCount(wardId?: string): number {
  return PROPERTY_PARCELS.filter((p) => (wardId ? p.wardId === wardId : true)).length
}

/** Every ward that carries at least one candidate, ranked by exposure. */
export function pilotCandidateWards(exceptions: AssessmentException[]): PilotMetrics[] {
  return WARDS.map((ward) => computePilotMetrics(exceptions, ward.id))
    .filter((m) => m.raised > 0)
    .sort((a, b) => b.indicativeValue - a.indicativeValue)
}

/**
 * The statutory property tax return.
 *
 * Central Finance Commission grants to urban local bodies have carried entry
 * conditions tied to property tax - published accounts, notified floor rates,
 * and demonstrated growth in collection - which means a corporation has to
 * produce a return of this shape whether or not it holds a platform.
 *
 * Generating it here is a deliberate strategic choice rather than a feature. A
 * dashboard is opened when somebody remembers it exists. A system that produces
 * a filing the corporation is obliged to make becomes load-bearing, and
 * load-bearing systems survive the transfer of the officer who commissioned
 * them.
 *
 * Figures are modelled demonstration values, and the operative conditions of
 * the current Finance Commission award period must be verified against the
 * published guidelines before anything here is filed. That caveat travels on
 * the return itself, not in a footnote somebody can drop.
 */
export function buildStatutoryReturn(exceptions: AssessmentException[]): StatutoryReturn {
  const terminal = exceptions.filter(isTerminalException)
  const upheld = terminal.filter((e) => e.status === 'demand-revised' || e.status === 'recovered')
  const revisedValue = exceptions.reduce((sum, e) => sum + (e.revisedAnnualValue ?? 0), 0)
  const recoveredValue = exceptions.reduce((sum, e) => sum + (e.recoveredValue ?? 0), 0)
  const indicativeValue = exceptions.reduce((sum, e) => sum + e.indicativeAnnualValue, 0)
  const assessedParcels = PROPERTY_PARCELS.filter((p) => p.status === 'assessed').length
  const notAssessed = PROPERTY_PARCELS.filter((p) => p.status === 'not-assessed').length

  return {
    id: 'statutory-return-property-tax',
    tenantId: TENANT_ID,
    title: t('Property tax reform and collection improvement return'),
    financialYear: municipality.financialYear,
    generatedAt: isoDaysFromAnchor(0),
    basisNote:
      'Modelled demonstration figures. Finance Commission award conditions for urban local bodies change between award periods; the operative conditions of the current period must be verified against the published guidelines, and the underlying figures reconciled against the corporation’s audited accounts, before any return is filed on this basis.',
    lines: [
      {
        id: 'properties-on-register',
        label: t('Properties on the assessment register (sampled)'),
        value: PROPERTY_PARCELS.length,
        unit: 'count',
        derivation: 'Count of parcels held on the property assessment register within the reconciliation sample.',
      },
      {
        id: 'properties-assessed',
        label: t('Properties carrying a current assessment'),
        value: assessedParcels,
        unit: 'count',
        derivation: 'Parcels with assessment status "assessed", excluding exempt, not-assessed, under-construction and under-appeal records.',
      },
      {
        id: 'properties-not-assessed',
        label: t('Properties on the register carrying no demand'),
        value: notAssessed,
        unit: 'count',
        derivation: 'Parcels held on the register with assessment status "not assessed".',
      },
      {
        id: 'candidates-raised',
        label: t('Assessment review candidates raised'),
        value: exceptions.length,
        unit: 'count',
        derivation: 'Cross-register disagreements raised by the published reconciliation rule catalogue.',
      },
      {
        id: 'candidates-upheld',
        label: t('Review candidates verified and upheld'),
        value: upheld.length,
        unit: 'count',
        derivation: 'Candidates a named officer verified and carried into a revised demand under the statutory process.',
      },
      {
        id: 'indicative-value',
        label: t('Indicative annual value identified'),
        value: indicativeValue,
        unit: 'rupees',
        derivation: 'Sum of the modelled annual value of every review candidate raised. An estimate for prioritisation, not an amount owed.',
      },
      {
        id: 'revised-demand',
        label: t('Annual demand added by revision'),
        value: revisedValue,
        unit: 'rupees',
        derivation: 'Sum of the revised annual demand actually raised against verified candidates.',
      },
      {
        id: 'recovered',
        label: t('Amount collected against revised demand'),
        value: recoveredValue,
        unit: 'rupees',
        derivation: 'Sum of receipts recorded against demands revised through this process.',
      },
      {
        id: 'conversion',
        label: t('Verification conversion rate'),
        value: terminal.length === 0 ? 0 : Math.round((upheld.length / terminal.length) * 1000) / 10,
        unit: 'percent',
        derivation: 'Upheld candidates as a share of every candidate an officer has decided either way.',
      },
    ],
  }
}
