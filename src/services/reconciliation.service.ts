import { PARCEL_BY_ID, REGISTRY_BY_ID } from '@/data/reconciliation.data'
import {
  RECONCILIATION_RULES,
  RULE_BY_ID,
  RULE_NO_ACTION_REASONS,
  assessedUnitsOnRegister,
  assignableOfficers,
  buildStatutoryReturn,
  computePilotMetrics,
  computeRulePrecision,
  isOpenException,
  isTerminalException,
  pilotCandidateWards,
  sampledParcelCount,
} from '@/domains/revenue/reconciliation'
import { filterByScope } from '@/security/access'
import type { ConfidenceLevel, Paged, Severity } from '@/types/common'
import type { User } from '@/types/organisation'
import type {
  AssessmentException,
  ExceptionStatus,
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
import { isoDaysFromAnchor } from '@/utils/deterministic'
import { ServiceError, assertAccess, deepClone, paginate, recordAudit, scopeToTenant, simulateLatency } from './client'
import { emitChange, getCollection, setCollection } from './store'
import { t } from '@/i18n'

/**
 * src/services/reconciliation.service.ts
 *
 * Registry reconciliation and assessment recovery.
 *
 * Every method here is gated on `resource: 'revenue'` plus ward and domain
 * scope, which is what makes the worklist genuinely per-officer: an assistant
 * assessor with a single ward in scope sees their ward's candidates, and the
 * Commissioner sees the city, without either screen knowing that is happening.
 *
 * Two properties of this service are non-negotiable and are enforced here
 * rather than in the interface.
 *
 * FIRST - no method revises a demand. `recordRevision` records that an officer
 * revised a demand through the assessment register under the statutory
 * process. The platform is the record of the decision, never the instrument of
 * it, and `amend-official-record` is on the platform's standing list of actions
 * that always require a named human authority.
 *
 * SECOND - closing a candidate without action is a first-class outcome with its
 * own reason code, not a discard. Those codes are the sole input to published
 * rule precision, which is the only reason an assessment department has to
 * trust the queue at all.
 */

export interface ExceptionFilters {
  ruleId?: ReconciliationRuleId[]
  tier?: RuleTier[]
  wardId?: string
  status?: ExceptionStatus[]
  severity?: Severity[]
  confidence?: ConfidenceLevel[]
  assigneeId?: string
  /** Restrict to candidates that have reached an officer worklist. */
  worklistOnly?: boolean
  /** Restrict to candidates awaiting a human match decision. */
  matchQueueOnly?: boolean
  /** Restrict to candidates still open. */
  openOnly?: boolean
  search?: string
  page?: number
  pageSize?: number
}

export interface ReconciliationSummary {
  raised: number
  open: number
  onWorklist: number
  inMatchQueue: number
  terminal: number
  upheld: number
  indicativeValue: number
  revisedValue: number
  recoveredValue: number
  /** Indicative value carried by Tier 1 candidates alone. */
  tierOneIndicativeValue: number
  tierOneRaised: number
  /** Upheld as a share of every candidate decided either way. */
  conversionPct: number | null
  /** Parcels the reconciliation sample covers, within this scope. */
  sampledParcels: number
  /** Parcels the corporation's full assessment register holds, same scope. */
  registerParcels: number
  /**
   * `indicativeValue` scaled from the sample to the full register.
   *
   * An EXTRAPOLATION, and the interface is required to label it as one wherever
   * it appears. It is the number a corporation needs in order to decide whether
   * this is worth doing at all - and precisely the number that would be
   * indefensible if it were ever shown without the sample size beside it.
   */
  extrapolatedIndicativeValue: number
  byTier: Array<{ tier: RuleTier; raised: number; indicativeValue: number }>
  byStatus: Array<{ status: ExceptionStatus; count: number }>
}

/** An officer a review candidate may lawfully be assigned to. */
export interface AssignableOfficer {
  id: string
  name: string
  designation: string
  /** True for the acting principal - a candidate taken on rather than delegated. */
  isSelf: boolean
}

/** Everything the candidate detail view needs, resolved in one call. */
export interface ExceptionDetail {
  exception: AssessmentException
  rule: ReconciliationRule
  /** The parcel on the assessment register, where one was matched. */
  parcel?: PropertyParcel
  /** The counterpart record that disagrees with it. */
  counterpart: RegistryRecord
  /** Closure reasons this rule offers, in the order they should be shown. */
  noActionReasons: NoActionReason[]
}

/* ---------------------------------------------------------------------------
 * Scoping and filtering
 * ------------------------------------------------------------------------- */

function visibleExceptions(user: User | null): AssessmentException[] {
  const scoped = scopeToTenant(user, getCollection('reconciliationExceptions'))
  return filterByScope(user, scoped, (e) => ({ wardId: e.wardId, domain: 'revenue' }), 'revenue')
}

function worklistEligible(exception: AssessmentException): boolean {
  const rule = RULE_BY_ID.get(exception.ruleId)
  return Boolean(rule?.worklistEligible) && !exception.match.belowFloor
}

function inMatchQueue(exception: AssessmentException): boolean {
  return exception.match.belowFloor && isOpenException(exception)
}

function matchesFilters(exception: AssessmentException, filters: ExceptionFilters): boolean {
  if (filters.ruleId && filters.ruleId.length > 0 && !filters.ruleId.includes(exception.ruleId)) return false
  if (filters.tier && filters.tier.length > 0 && !filters.tier.includes(exception.tier)) return false
  if (filters.wardId && exception.wardId !== filters.wardId) return false
  if (filters.status && filters.status.length > 0 && !filters.status.includes(exception.status)) return false
  if (filters.severity && filters.severity.length > 0 && !filters.severity.includes(exception.severity)) return false
  if (filters.confidence && filters.confidence.length > 0 && !filters.confidence.includes(exception.confidence)) return false
  if (filters.assigneeId && exception.assigneeId !== filters.assigneeId) return false
  if (filters.worklistOnly && !worklistEligible(exception)) return false
  if (filters.matchQueueOnly && !inMatchQueue(exception)) return false
  if (filters.openOnly && !isOpenException(exception)) return false
  if (filters.search) {
    const needle = filters.search.trim().toLowerCase()
    const haystack = `${exception.reference} ${exception.addressLine} ${exception.locality} ${exception.counterpartReference} ${exception.parcelAssessmentNumber ?? ''}`.toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}

function findOrThrow(user: User | null, id: string): AssessmentException {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const found = getCollection('reconciliationExceptions').find((e) => e.id === id && e.tenantId === user.tenantId)
  if (!found) throw new ServiceError('not-found', `Assessment review candidate "${id}" was not found.`)
  return found
}

/**
 * The transitions the lifecycle permits.
 *
 * Enforced in the service rather than by disabling buttons, because a
 * transition the interface forgot to disable must still be refused - and
 * because the refusal has to be auditable. A terminal candidate is terminal:
 * reopening one is a new candidate, not an edit of the closed record.
 */
const ALLOWED_TRANSITIONS: Record<ExceptionStatus, ExceptionStatus[]> = {
  raised: ['assigned', 'closed-no-action'],
  assigned: ['field-verification', 'demand-revised', 'closed-no-action', 'disputed', 'assigned'],
  'field-verification': ['demand-revised', 'closed-no-action', 'disputed'],
  disputed: ['demand-revised', 'closed-no-action'],
  'demand-revised': ['recovered'],
  recovered: [],
  'closed-no-action': [],
}

function assertTransition(exception: AssessmentException, next: ExceptionStatus): void {
  if (!ALLOWED_TRANSITIONS[exception.status].includes(next)) {
    throw new ServiceError(
      'invalid',
      `A candidate at "${exception.status}" cannot move to "${next}". ${
        isTerminalException(exception)
          ? 'This candidate has been decided and its record is closed; a fresh candidate would have to be raised.'
          : 'The lifecycle does not permit that transition.'
      }`,
    )
  }
}

/**
 * Applies a transition, appends the history entry, writes the audit event and
 * notifies subscribers - the whole of a mutation in one place, so no call site
 * can persist a change without also recording who made it and why.
 */
function transition(
  user: User | null,
  id: string,
  next: ExceptionStatus,
  reason: string,
  note: string,
  patch: Partial<AssessmentException> = {},
): AssessmentException {
  const exception = findOrThrow(user, id)
  const authed = assertAccess(user, 'revenue', 'edit', { wardId: exception.wardId, domain: 'revenue' }, {
    resourceType: 'Assessment Review Candidate',
    resourceId: exception.id,
    resourceLabel: exception.reference,
  })
  assertTransition(exception, next)

  const updated: AssessmentException = {
    ...exception,
    ...patch,
    status: next,
    history: [
      ...exception.history,
      {
        id: `${exception.id}-ev-${exception.history.length}`,
        at: isoDaysFromAnchor(0),
        actorId: authed.id,
        actorName: authed.name,
        status: next,
        note,
      },
    ],
  }

  setCollection(
    'reconciliationExceptions',
    getCollection('reconciliationExceptions').map((e) => (e.id === updated.id ? updated : e)),
  )
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Assessment Review Candidate',
    resourceId: exception.id,
    resourceLabel: exception.reference,
    classification: RULE_BY_ID.get(exception.ruleId)?.classification ?? 'confidential',
    outcome: 'success',
    reason,
    detail: note,
  })
  emitChange()
  return deepClone(updated)
}

/* ---------------------------------------------------------------------------
 * Reads
 * ------------------------------------------------------------------------- */

async function exceptions(user: User | null, filters: ExceptionFilters = {}): Promise<Paged<AssessmentException>> {
  await simulateLatency(`reconciliation.exceptions:${JSON.stringify(filters)}`)
  const filtered = visibleExceptions(user).filter((e) => matchesFilters(e, filters))
  const sorted = [...filtered].sort((a, b) => b.indicativeAnnualValue - a.indicativeAnnualValue)
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 25)
  return { ...page, items: deepClone(page.items) }
}

async function detail(user: User | null, id: string): Promise<ExceptionDetail> {
  await simulateLatency(`reconciliation.detail:${id}`)
  const exception = findOrThrow(user, id)
  assertAccess(user, 'revenue', 'view', { wardId: exception.wardId, domain: 'revenue' }, {
    resourceType: 'Assessment Review Candidate',
    resourceId: exception.id,
    resourceLabel: exception.reference,
  })

  const rule = RULE_BY_ID.get(exception.ruleId)
  const counterpart = REGISTRY_BY_ID.get(exception.counterpartId)
  if (!rule || !counterpart) {
    throw new ServiceError('not-found', 'The source records behind this candidate could not be resolved.')
  }

  return deepClone({
    exception,
    rule,
    parcel: exception.parcelId ? PARCEL_BY_ID.get(exception.parcelId) : undefined,
    counterpart,
    noActionReasons: RULE_NO_ACTION_REASONS[exception.ruleId],
  })
}

async function summary(user: User | null, wardId?: string): Promise<ReconciliationSummary> {
  await simulateLatency(`reconciliation.summary:${wardId ?? 'all'}`)
  assertAccess(user, 'revenue', 'view', { wardId, domain: 'revenue' }, {
    resourceType: 'Revenue',
    resourceId: 'reconciliation-summary',
    resourceLabel: 'Registry reconciliation position',
  })

  const all = visibleExceptions(user).filter((e) => (wardId ? e.wardId === wardId : true))
  const terminal = all.filter(isTerminalException)
  const upheld = terminal.filter((e) => e.status === 'demand-revised' || e.status === 'recovered').length
  const sampledParcels = sampledParcelCount(wardId)
  const registerParcels = assessedUnitsOnRegister(wardId)
  const indicativeValue = all.reduce((sum, e) => sum + e.indicativeAnnualValue, 0)
  const tiers: RuleTier[] = [1, 2, 3]
  const statuses: ExceptionStatus[] = [
    'raised', 'assigned', 'field-verification', 'disputed', 'demand-revised', 'recovered', 'closed-no-action',
  ]

  return {
    raised: all.length,
    open: all.filter(isOpenException).length,
    onWorklist: all.filter((e) => worklistEligible(e) && isOpenException(e)).length,
    inMatchQueue: all.filter(inMatchQueue).length,
    terminal: terminal.length,
    upheld,
    indicativeValue,
    revisedValue: all.reduce((sum, e) => sum + (e.revisedAnnualValue ?? 0), 0),
    recoveredValue: all.reduce((sum, e) => sum + (e.recoveredValue ?? 0), 0),
    sampledParcels,
    registerParcels,
    extrapolatedIndicativeValue:
      sampledParcels === 0 ? 0 : Math.round((indicativeValue / sampledParcels) * registerParcels),
    tierOneIndicativeValue: all.filter((e) => e.tier === 1).reduce((sum, e) => sum + e.indicativeAnnualValue, 0),
    tierOneRaised: all.filter((e) => e.tier === 1).length,
    conversionPct: terminal.length === 0 ? null : Math.round((upheld / terminal.length) * 1000) / 10,
    byTier: tiers.map((tier) => {
      const mine = all.filter((e) => e.tier === tier)
      return { tier, raised: mine.length, indicativeValue: mine.reduce((s, e) => s + e.indicativeAnnualValue, 0) }
    }),
    byStatus: statuses.map((status) => ({ status, count: all.filter((e) => e.status === status).length })),
  }
}

async function rules(user: User | null): Promise<ReconciliationRule[]> {
  await simulateLatency('reconciliation.rules')
  assertAccess(user, 'revenue', 'view', { domain: 'revenue' }, {
    resourceType: 'Revenue',
    resourceId: 'reconciliation-rules',
    resourceLabel: 'Reconciliation rule catalogue',
  })
  return deepClone(RECONCILIATION_RULES)
}

async function precision(user: User | null): Promise<RulePrecision[]> {
  await simulateLatency('reconciliation.precision')
  assertAccess(user, 'revenue', 'view', { domain: 'revenue' }, {
    resourceType: 'Revenue',
    resourceId: 'reconciliation-precision',
    resourceLabel: 'Observed rule precision',
  })
  return deepClone(computeRulePrecision(visibleExceptions(user)))
}

async function pilotWards(user: User | null): Promise<PilotMetrics[]> {
  await simulateLatency('reconciliation.pilotWards')
  assertAccess(user, 'revenue', 'view', { domain: 'revenue' }, {
    resourceType: 'Revenue',
    resourceId: 'reconciliation-pilot',
    resourceLabel: 'Pilot ward candidates',
  })
  return deepClone(pilotCandidateWards(visibleExceptions(user)))
}

async function pilot(user: User | null, wardId: string): Promise<PilotMetrics> {
  await simulateLatency(`reconciliation.pilot:${wardId}`)
  assertAccess(user, 'revenue', 'view', { wardId, domain: 'revenue' }, {
    resourceType: 'Revenue',
    resourceId: `reconciliation-pilot-${wardId}`,
    resourceLabel: 'Pilot scorecard',
  })
  return deepClone(computePilotMetrics(visibleExceptions(user), wardId))
}

/**
 * Generates the statutory return.
 *
 * Gated on `export` rather than `view`: producing a return that leaves the
 * corporation is a different act from reading a screen, and the audit trail
 * should be able to answer who generated a filing and when.
 */
async function statutoryReturn(user: User | null): Promise<StatutoryReturn> {
  await simulateLatency('reconciliation.statutoryReturn')
  const authed = assertAccess(user, 'revenue', 'export', { domain: 'revenue' }, {
    resourceType: 'Revenue',
    resourceId: 'statutory-return-property-tax',
    resourceLabel: 'Property tax reform and collection return',
  })
  const generated = buildStatutoryReturn(visibleExceptions(user))
  recordAudit(authed, {
    action: 'export',
    resourceType: 'Statutory Return',
    resourceId: generated.id,
    resourceLabel: generated.title,
    classification: 'confidential',
    outcome: 'success',
    reason: t('Statutory property tax return generated.'),
    detail: t('Return generated for {0} across {1} declared lines.', generated.financialYear, generated.lines.length),
  })
  emitChange()
  return deepClone(generated)
}

/* ---------------------------------------------------------------------------
 * Mutations
 * ------------------------------------------------------------------------- */

/**
 * The officers a candidate can actually be assigned to.
 *
 * Read from the permission engine, not from a role list, so the dropdown can
 * never offer somebody who would be refused the moment they opened the record.
 * The acting principal is included and listed first: an assessor taking a
 * candidate on their own name is ordinary practice, not an edge case.
 */
async function assignableOfficerList(user: User | null): Promise<AssignableOfficer[]> {
  await simulateLatency('reconciliation.assignableOfficers')
  const authed = assertAccess(user, 'revenue', 'assign', { domain: 'revenue' }, {
    resourceType: 'Revenue',
    resourceId: 'assignable-officers',
    resourceLabel: 'Officers who may be assigned an assessment review candidate',
  })
  return assignableOfficers()
    .filter((u) => u.tenantId === authed.tenantId)
    .map((u) => ({ id: u.id, name: u.name, designation: u.designation, isSelf: u.id === authed.id }))
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf))
}

async function assign(user: User | null, id: string, assigneeId: string, note: string): Promise<AssessmentException> {
  await simulateLatency(`reconciliation.assign:${id}`)
  const exception = findOrThrow(user, id)
  if (!worklistEligible(exception)) {
    throw new ServiceError(
      'invalid',
      exception.match.belowFloor
        ? 'This candidate has not cleared the match confidence floor. Confirm the property match before assigning it to an officer.'
        : 'Candidates from a directional rule are not placed on an officer worklist.',
    )
  }
  // Checked against the permission engine rather than against the roster,
  // because assigning work to an officer who cannot open the record removes it
  // from the unassigned queue and buries it.
  const assignee = assignableOfficers().find((u) => u.id === assigneeId && u.tenantId === exception.tenantId)
  if (!assignee) {
    throw new ServiceError(
      'invalid',
      'The nominated officer could not be resolved, or does not hold the authority to act on an assessment record.',
    )
  }

  return transition(
    user,
    id,
    'assigned',
    'Assessment review candidate assigned for verification.',
    `Assigned to ${assignee.name}, ${assignee.designation}.${note ? ` ${note}` : ''}`,
    { assigneeId: assignee.id, assigneeName: assignee.name },
  )
}

async function beginVerification(user: User | null, id: string, note: string): Promise<AssessmentException> {
  await simulateLatency(`reconciliation.beginVerification:${id}`)
  return transition(
    user,
    id,
    'field-verification',
    'Field verification commenced against the source registers.',
    note || 'Both source records retrieved; field verification of the premises requested.',
  )
}

/**
 * Records that a demand was revised.
 *
 * The wording matters and is enforced by it: this platform does not revise
 * demands. An officer revises the demand in the assessment register under the
 * statutory process, with notice and hearing, and records here that they did.
 */
async function recordRevision(
  user: User | null,
  id: string,
  revisedAnnualValue: number,
  note: string,
): Promise<AssessmentException> {
  await simulateLatency(`reconciliation.recordRevision:${id}`)
  if (!Number.isFinite(revisedAnnualValue) || revisedAnnualValue <= 0) {
    throw new ServiceError('invalid', 'A revised annual demand greater than zero is required.')
  }
  return transition(
    user,
    id,
    'demand-revised',
    'Revised demand recorded against a verified candidate.',
    note || 'Verified and upheld. Revised demand raised through the assessment register under the statutory process.',
    { revisedAnnualValue: Math.round(revisedAnnualValue) },
  )
}

async function recordRecovery(
  user: User | null,
  id: string,
  recoveredValue: number,
  note: string,
): Promise<AssessmentException> {
  await simulateLatency(`reconciliation.recordRecovery:${id}`)
  if (!Number.isFinite(recoveredValue) || recoveredValue <= 0) {
    throw new ServiceError('invalid', 'A recovered amount greater than zero is required.')
  }
  return transition(
    user,
    id,
    'recovered',
    'Receipt recorded against a revised demand.',
    note || 'Payment received against the revised demand.',
    { recoveredValue: Math.round(recoveredValue) },
  )
}

/**
 * Closes a candidate without action.
 *
 * Not a discard, and deliberately not styled as one anywhere in the interface.
 * The reason code recorded here is the only input to published rule precision,
 * which is what allows the catalogue to be defended to the department that has
 * to work it.
 */
async function closeNoAction(
  user: User | null,
  id: string,
  reason: NoActionReason,
  note: string,
): Promise<AssessmentException> {
  await simulateLatency(`reconciliation.closeNoAction:${id}`)
  const exception = findOrThrow(user, id)
  if (!RULE_NO_ACTION_REASONS[exception.ruleId].includes(reason)) {
    throw new ServiceError('invalid', 'That closure reason is not offered against this rule.')
  }
  return transition(
    user,
    id,
    'closed-no-action',
    'Candidate closed without action, with a recorded reason.',
    note || 'Verified. The candidate is not carried forward; the reason is recorded against the rule.',
    { noActionReason: reason },
  )
}

async function raiseDispute(user: User | null, id: string, note: string): Promise<AssessmentException> {
  await simulateLatency(`reconciliation.raiseDispute:${id}`)
  return transition(
    user,
    id,
    'disputed',
    'Candidate contested by the occupier.',
    note || 'The occupier has contested the review candidate. Referred for hearing under the assessment rules.',
  )
}

/**
 * Confirms, by human judgement, that a below-floor match is in fact the same
 * property - promoting the candidate onto the worklist.
 *
 * This is the release valve for the one thing the engine cannot do on its own.
 * Municipal registers share no key; where the published signals do not agree
 * strongly enough, an officer who knows the locality decides, and their
 * decision is recorded against their name rather than absorbed into a score.
 */
async function confirmMatch(user: User | null, id: string, note: string): Promise<AssessmentException> {
  await simulateLatency(`reconciliation.confirmMatch:${id}`)
  const exception = findOrThrow(user, id)
  const authed = assertAccess(user, 'revenue', 'edit', { wardId: exception.wardId, domain: 'revenue' }, {
    resourceType: 'Assessment Review Candidate',
    resourceId: exception.id,
    resourceLabel: exception.reference,
  })
  if (!exception.match.belowFloor) {
    throw new ServiceError('invalid', 'This candidate already clears the match confidence floor.')
  }
  if (isTerminalException(exception)) {
    throw new ServiceError('invalid', 'This candidate has been decided and its record is closed.')
  }

  const updated: AssessmentException = {
    ...exception,
    match: { ...exception.match, belowFloor: false, confidence: 'medium' },
    // Confirmed by a person, so the candidate's own confidence is no longer
    // bounded by what the signals alone could support.
    confidence: exception.tier === 3 ? 'low' : 'medium',
    history: [
      ...exception.history,
      {
        id: `${exception.id}-ev-${exception.history.length}`,
        at: isoDaysFromAnchor(0),
        actorId: authed.id,
        actorName: authed.name,
        status: exception.status,
        note: t('Property match confirmed by {0} against a score of {1}%.{2}', authed.name, exception.match.score, note ? ` ${note}` : ''),
      },
    ],
  }

  setCollection(
    'reconciliationExceptions',
    getCollection('reconciliationExceptions').map((e) => (e.id === updated.id ? updated : e)),
  )
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Assessment Review Candidate',
    resourceId: exception.id,
    resourceLabel: exception.reference,
    classification: RULE_BY_ID.get(exception.ruleId)?.classification ?? 'confidential',
    outcome: 'success',
    reason: t('Below-floor property match confirmed by a named officer.'),
    detail: t('Match score {0}% confirmed manually and promoted to the officer worklist.', exception.match.score),
  })
  emitChange()
  return deepClone(updated)
}

/** Dismisses a below-floor match: the two records are different properties. */
async function dismissMatch(user: User | null, id: string, note: string): Promise<AssessmentException> {
  await simulateLatency(`reconciliation.dismissMatch:${id}`)
  return transition(
    user,
    id,
    'closed-no-action',
    'Below-floor property match dismissed by a named officer.',
    note || 'The counterpart record relates to a different property. No candidate is carried forward.',
    { noActionReason: 'record-relates-to-different-property' },
  )
}

export const reconciliationService = {
  exceptions,
  assignableOfficers: assignableOfficerList,
  detail,
  summary,
  rules,
  precision,
  pilotWards,
  pilot,
  statutoryReturn,
  assign,
  beginVerification,
  recordRevision,
  recordRecovery,
  closeNoAction,
  raiseDispute,
  confirmMatch,
  dismissMatch,
}
