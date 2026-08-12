import type { IsoDateTime, OperationalState } from '@/types/common'
import { RESOLUTION_STATUS_LABEL } from '@/types/civic-services'
import { PROJECT_STATUS_LABEL } from '@/types/finance'
import { DECISION_STATUS_LABEL } from '@/types/operations'
import { municipality } from '@/config/municipality.config'
import { FINANCIAL_YEAR_START, WARD_BY_ID, wardName } from '@/data/reference'
import { COUNCIL_RESOLUTIONS } from '@/data/civic.data'
import { PROJECTS, wardBudgetPosition } from '@/data/finance.data'
import { DECISION_CASES } from '@/data/operations.data'
import { DEMO_NOW } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/domains/wards/commitments.ts
 *
 * The ward commitments ledger.
 *
 * The Council register already establishes the sharpest accountability figure
 * this platform holds: a matter the house has passed and the administration
 * has not acted on belongs to neither wing on its own. But it is stated
 * city-wide, and city-wide is not the unit anybody is actually asked about. A
 * corporator rises in the General Body and asks one question - "what did you
 * promise MY ward, and what happened to it?" - and until this module there was
 * no single place that answered it.
 *
 * Answering it means joining the DELIBERATIVE record to the DELIVERY record.
 * Four registers already carry a commitment to a named ward, and each one has
 * been reported separately by a different department:
 *
 *   - Council resolutions the house has carried  (`COUNCIL_RESOLUTIONS`)
 *   - Capital works sanctioned against the ward  (`PROJECTS`)
 *   - Executive decision cases taken to a ward   (`DECISION_CASES`)
 *   - The ward's own capital allocation position (`wardBudgetPosition`)
 *
 * NOTHING IS SEEDED HERE. Every row below is a normalisation of a record that
 * already exists, into one `WardCommitment` shape with one derived `standing`.
 * Where a source register offers no signal, this module says so rather than
 * inventing one.
 *
 * ONE LIMIT, STATED HONESTLY. A commitment reaches this ledger only where its
 * source record NAMES a ward. A resolution carried for the whole corporation,
 * or a decision case taken city-wide, is excluded by construction - not
 * overlooked. `cityWideCommitmentCount` reports how many such records exist so
 * the exclusion is visible on the surface rather than buried here.
 */

/* ==========================================================================
   Shape
   ========================================================================== */

export type CommitmentKind = 'resolution' | 'project' | 'decision' | 'budget-line'

function build$COMMITMENT_KIND_LABEL(): Record<CommitmentKind, string> {
  return {
  resolution: t('Resolution'),
  project: t('Capital Work'),
  decision: t('Decision Case'),
  'budget-line': t('Budget Line'),
}
}
export let COMMITMENT_KIND_LABEL: Record<CommitmentKind, string> = build$COMMITMENT_KIND_LABEL()
registerLayer(() => {
  COMMITMENT_KIND_LABEL = build$COMMITMENT_KIND_LABEL()
})

/**
 * What actually became of the commitment.
 *
 * `unactioned` is the figure this whole module exists to produce: the matter
 * was carried or sanctioned, the time in which something should have started
 * has passed, and nothing has started at all. It is deliberately kept distinct
 * from `overdue`, where work did begin and is simply late. Collapsing the two
 * would hide the difference between an administration that is behind and an
 * administration that never began.
 */
export type CommitmentStanding = 'delivered' | 'in-progress' | 'overdue' | 'unactioned'

function build$COMMITMENT_STANDING_LABEL(): Record<CommitmentStanding, string> {
  return {
  delivered: t('Delivered'),
  'in-progress': t('In Progress'),
  overdue: t('Overdue'),
  unactioned: t('Unactioned'),
}
}
export let COMMITMENT_STANDING_LABEL: Record<CommitmentStanding, string> = build$COMMITMENT_STANDING_LABEL()
registerLayer(() => {
  COMMITMENT_STANDING_LABEL = build$COMMITMENT_STANDING_LABEL()
})

/** Ledger order: what has gone wrong is read before what has gone right. */
export const COMMITMENT_STANDING_RANK: Record<CommitmentStanding, number> = {
  unactioned: 0,
  overdue: 1,
  'in-progress': 2,
  delivered: 3,
}

export interface WardCommitment {
  /** Unique per (source record, ward) pair - a matter naming three wards is a
   *  commitment to each of them and carries a row against each. */
  id: string
  /** The source record, so a city-wide reading can count a matter once. */
  sourceId: string
  wardId: string
  /** How many wards the source record names. 1 for a single-ward commitment. */
  wardCount: number
  kind: CommitmentKind
  reference: string
  subject: string
  /** When the commitment was made - carried, sanctioned or decided. */
  committedAt: IsoDateTime
  /** INR crore. Absent where the source record carries no financial figure. */
  valueCrore?: number
  /** Value recorded as actually paid or drawn, where the register holds one. */
  deliveredCrore?: number
  /** The status word the source register itself uses. */
  status: string
  /** The date by which the commitment should have been met, where one exists. */
  expectedBy?: IsoDateTime
  standing: CommitmentStanding
  /** Whole days since the commitment was made, against the demonstration anchor. */
  ageDays: number
  /** Why this standing, in one line, so no figure appears without its basis. */
  basis: string
}

export interface WardCommitmentSummary {
  wardId: string
  wardLabel: string
  made: number
  delivered: number
  inProgress: number
  overdue: number
  unactioned: number
  /** INR crore committed across commitments carrying a financial figure. */
  valueCommittedCrore: number
  /** INR crore of that figure recorded as delivered or paid. */
  valueDeliveredCrore: number
  /** Committed and not yet delivered - the ward's outstanding position. */
  valueOutstandingCrore: number
  /** Age in days of the oldest commitment on which nothing has started. */
  oldestUnactionedDays: number
  /** Reference of that oldest unactioned commitment, where there is one. */
  oldestUnactionedRef?: string
  /** Mean age in days across every unactioned commitment. */
  meanUnactionedAgeDays: number
  state: OperationalState
}

/* ==========================================================================
   Institutional windows
   ==========================================================================
   Neither the resolution register nor the decision register records the date
   by which administrative action was expected, so these two windows stand in
   for it. They are conventions of this module, declared here in the open, and
   are the only judgement calls in the file - every other input is read
   straight off a source record.
   ========================================================================== */

/** Days after the house carries a matter within which the administration is
 *  taken to be acting on it rather than sitting on it. */
export const RESOLUTION_ACTION_WINDOW_DAYS = 60

/** The equivalent window for an executive decision case once it is taken. */
export const DECISION_ACTION_WINDOW_DAYS = 30

/** Share of a ward's capital allocation drawn at which the allocation is read
 *  as delivered rather than merely under way. */
const CAPITAL_DELIVERED_THRESHOLD_PCT = 90

/**
 * Kinds whose money is counted into the ward's committed and outstanding
 * position. The ward budget line is deliberately excluded: it is an aggregate
 * over the very capital works listed individually beside it, and adding it to
 * a total would count the same rupee twice. It stays in the ledger because a
 * ward holding a sanctioned allocation against which nothing has been drawn is
 * exactly the position a corporator is entitled to see - but it is a standing
 * position, not another sum of money.
 */
const VALUED_KINDS: ReadonlySet<CommitmentKind> = new Set(['resolution', 'project', 'decision'])

/* ==========================================================================
   Date helpers - frozen to the demonstration anchor, never to the wall clock
   ========================================================================== */

const DAY_MS = 86_400_000

function ageInDays(at: IsoDateTime): number {
  const parsed = Date.parse(at)
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, Math.round((DEMO_NOW.getTime() - parsed) / DAY_MS))
}

function hasPassed(at: IsoDateTime | undefined): boolean {
  if (!at) return false
  const parsed = Date.parse(at)
  if (Number.isNaN(parsed)) return false
  return parsed < DEMO_NOW.getTime()
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/* ==========================================================================
   Normalisation - one source register at a time
   ========================================================================== */

/**
 * Matters the house has carried.
 *
 * Only `passed` and `implemented` are commitments. A matter still tabled or
 * under discussion has not been promised to anybody yet, a deferred matter has
 * been explicitly held, and a rejected one was declined - reading any of them
 * as a broken promise would misrepresent the house.
 */
function resolutionCommitments(wardId: string): WardCommitment[] {
  return COUNCIL_RESOLUTIONS.filter(
    (r) => r.wardIds.includes(wardId) && (r.status === 'passed' || r.status === 'implemented'),
  ).map((r) => {
    const committedAt = r.decidedAt ?? r.tabledAt
    const ageDays = ageInDays(committedAt)
    const delivered = r.status === 'implemented'

    const standing: CommitmentStanding = delivered
      ? 'delivered'
      : ageDays > RESOLUTION_ACTION_WINDOW_DAYS
        ? 'unactioned'
        : 'in-progress'

    const basis = delivered
      ? t('Administrative action has been recorded against the resolution.')
      : standing === 'unactioned'
        ? t('Carried {0} days ago with no implementation recorded, beyond the {1}-day administrative window.', ageDays, RESOLUTION_ACTION_WINDOW_DAYS)
        : t('Carried {0} days ago and still within the {1}-day administrative window.', ageDays, RESOLUTION_ACTION_WINDOW_DAYS)

    return {
      id: `wc-res-${r.id}-${wardId}`,
      sourceId: r.id,
      wardId,
      wardCount: r.wardIds.length,
      kind: 'resolution' as const,
      reference: r.reference,
      subject: r.subject,
      committedAt,
      valueCrore: r.financialImplicationCrore,
      deliveredCrore: delivered ? r.financialImplicationCrore : 0,
      status: RESOLUTION_STATUS_LABEL[r.status],
      standing,
      ageDays,
      basis,
    }
  })
}

/**
 * Capital works sanctioned against the ward.
 *
 * This register carries what the resolution register does not: a planned start,
 * a planned end, an actual start and a completion percentage. A work that has
 * passed the date it was to begin on and has neither an actual start nor a
 * single percentage point of progress is the clearest `unactioned` commitment
 * the platform holds.
 */
function projectCommitments(wardId: string): WardCommitment[] {
  return PROJECTS.filter((p) => p.wardIds.includes(wardId)).map((p) => {
    const committedAt = p.plannedStart
    const ageDays = ageInDays(committedAt)
    const delivered = p.status === 'completed' || p.status === 'closed' || p.completionPct >= 100
    const started = Boolean(p.actualStart) || p.completionPct > 0
    const endPassed = hasPassed(p.plannedEnd)

    const standing: CommitmentStanding = delivered
      ? 'delivered'
      : !started
        ? hasPassed(committedAt)
          ? 'unactioned'
          : 'in-progress'
        : endPassed || p.status === 'delayed'
          ? 'overdue'
          : 'in-progress'

    const basis = delivered
      ? t('Recorded complete at {0}% against a sanction of {1} Cr.', p.completionPct, p.sanctionedCostCrore)
      : standing === 'unactioned'
        ? t('No commencement recorded and no progress registered, {0} days after the work was to begin.', ageDays)
        : standing === 'overdue'
          ? t('Progress stands at {0}% against a phased expectation of {1}%, past the planned completion date.', p.completionPct, p.plannedCompletionPct)
          : started
            ? t('Progress stands at {0}% against a phased expectation of {1}%, within the planned period.', p.completionPct, p.plannedCompletionPct)
            : t('Sanctioned and not yet due to commence.')

    return {
      id: `wc-prj-${p.id}-${wardId}`,
      sourceId: p.id,
      wardId,
      wardCount: p.wardIds.length,
      kind: 'project' as const,
      reference: p.reference,
      subject: p.name,
      committedAt,
      valueCrore: p.sanctionedCostCrore,
      deliveredCrore: p.paidCrore,
      status: PROJECT_STATUS_LABEL[p.status],
      expectedBy: p.plannedEnd,
      standing,
      ageDays,
      basis,
    }
  })
}

/**
 * Executive decision cases taken to a named ward.
 *
 * A case still in draft or under review has committed nothing, and a rejected
 * case was declined on the record - neither is a promise. A case that has been
 * decided and carries no action against it is the executive equivalent of a
 * resolution nobody implemented.
 */
const DECIDED_DECISION_STATUSES = new Set(['approved', 'assigned', 'implementing', 'verification', 'closed'])
const STARTED_DECISION_STATUSES = new Set(['assigned', 'implementing', 'verification', 'closed'])

function decisionCommitments(wardId: string): WardCommitment[] {
  return DECISION_CASES.filter(
    (d) => d.wardIds.includes(wardId) && (DECIDED_DECISION_STATUSES.has(d.status) || Boolean(d.humanDecision)),
  ).map((d) => {
    const committedAt = d.humanDecision?.decidedAt ?? d.createdAt
    const ageDays = ageInDays(committedAt)
    const delivered = d.status === 'closed'
    const started = STARTED_DECISION_STATUSES.has(d.status) || d.actionIds.length > 0
    const duePassed = hasPassed(d.dueDate)

    const standing: CommitmentStanding = delivered
      ? 'delivered'
      : !started
        ? duePassed || ageDays > DECISION_ACTION_WINDOW_DAYS
          ? 'unactioned'
          : 'in-progress'
        : duePassed
          ? 'overdue'
          : 'in-progress'

    const basis = delivered
      ? d.outcome
        ? t('Closed with a measured outcome: {0}', d.outcome.summary)
        : t('Closed on the decision register.')
      : standing === 'unactioned'
        ? t('Decided {0} days ago with no action raised against the case.', ageDays)
        : standing === 'overdue'
          ? t('{0} action{1} raised, past the date the case was due.', d.actionIds.length, d.actionIds.length === 1 ? '' : 's')
          : t('{0} action{1} raised and running within the date the case is due.', d.actionIds.length, d.actionIds.length === 1 ? '' : 's')

    return {
      id: `wc-dec-${d.id}-${wardId}`,
      sourceId: d.id,
      wardId,
      wardCount: d.wardIds.length,
      kind: 'decision' as const,
      reference: d.reference,
      subject: d.title,
      committedAt,
      valueCrore: d.financialImpactCrore,
      deliveredCrore: delivered ? d.financialImpactCrore : 0,
      status: DECISION_STATUS_LABEL[d.status],
      expectedBy: d.dueDate,
      standing,
      ageDays,
      basis,
    }
  })
}

/**
 * The ward's own capital allocation position.
 *
 * One standing line rather than a register: the capital attributed to the ward
 * for the financial year and how much of it has actually been drawn. A ward
 * carrying a sanctioned allocation against which nothing has been paid is the
 * most complete form of a promise nobody began on.
 */
function budgetLineCommitment(wardId: string): WardCommitment | null {
  const ward = WARD_BY_ID.get(wardId)
  if (!ward) return null

  const position = wardBudgetPosition(wardId)
  if (position.allocatedCrore <= 0) return null

  const committedAt = FINANCIAL_YEAR_START
  const ageDays = ageInDays(committedAt)

  const standing: CommitmentStanding =
    position.utilisationPct >= CAPITAL_DELIVERED_THRESHOLD_PCT
      ? 'delivered'
      : position.spentCrore > 0
        ? 'in-progress'
        : 'unactioned'

  return {
    id: `wc-cap-${wardId}`,
    sourceId: `cap-${wardId}`,
    wardId,
    wardCount: 1,
    kind: 'budget-line',
    reference: `CAP/${ward.code}`,
    subject: `Ward capital allocation, ${municipality.financialYear}`,
    committedAt,
    valueCrore: position.allocatedCrore,
    deliveredCrore: position.spentCrore,
    status: `${position.utilisationPct}% drawn`,
    standing,
    ageDays,
    basis:
      standing === 'unactioned'
        ? t('Capital of {0} Cr stands attributed to the ward with no payment recorded against it, {1} days into the financial year.', position.allocatedCrore, ageDays)
        : t('{0} Cr of {1} Cr drawn, {2}% of the ward\'s attributed capital.', position.spentCrore, position.allocatedCrore, position.utilisationPct),
  }
}

/* ==========================================================================
   Assembly
   ========================================================================== */

function sortLedger(rows: WardCommitment[]): WardCommitment[] {
  return [...rows].sort((a, b) => {
    const byStanding = COMMITMENT_STANDING_RANK[a.standing] - COMMITMENT_STANDING_RANK[b.standing]
    if (byStanding !== 0) return byStanding
    // Oldest first within a standing: the longest-standing failure leads.
    if (a.committedAt !== b.committedAt) return a.committedAt < b.committedAt ? -1 : 1
    return a.reference < b.reference ? -1 : 1
  })
}

/** Every commitment made to one ward, across all four registers. */
export function buildWardCommitments(wardId: string): WardCommitment[] {
  if (!WARD_BY_ID.has(wardId)) return []
  const capital = budgetLineCommitment(wardId)
  return sortLedger([
    ...resolutionCommitments(wardId),
    ...projectCommitments(wardId),
    ...decisionCommitments(wardId),
    ...(capital ? [capital] : []),
  ])
}

/**
 * The ledger across several wards, with each source record counted once.
 *
 * A matter naming three wards is a genuine commitment to each of them and
 * carries a row against each - which is correct when reading one ward, and
 * would treble the money when reading several. Across wards, the first row for
 * a source record stands for the matter and the rest are dropped.
 */
export function buildCommitmentsAcrossWards(wardIds: string[]): WardCommitment[] {
  const seen = new Set<string>()
  const rows: WardCommitment[] = []
  for (const wardId of wardIds) {
    for (const row of buildWardCommitments(wardId)) {
      if (seen.has(row.sourceId)) continue
      seen.add(row.sourceId)
      rows.push(row)
    }
  }
  return sortLedger(rows)
}

/** Summarises any set of commitment rows under a stated label. */
export function summariseCommitments(
  wardId: string,
  wardLabel: string,
  rows: WardCommitment[],
): WardCommitmentSummary {
  const valued = rows.filter((r) => VALUED_KINDS.has(r.kind) && typeof r.valueCrore === 'number')
  const unactioned = rows.filter((r) => r.standing === 'unactioned')
  const oldest = unactioned.reduce<WardCommitment | undefined>(
    (worst, r) => (worst === undefined || r.ageDays > worst.ageDays ? r : worst),
    undefined,
  )

  const valueCommitted = valued.reduce((s, r) => s + (r.valueCrore ?? 0), 0)
  const valueDelivered = valued.reduce((s, r) => s + Math.min(r.deliveredCrore ?? 0, r.valueCrore ?? 0), 0)

  const made = rows.length
  const overdue = rows.filter((r) => r.standing === 'overdue').length
  // A commitment nobody began on counts double against a commitment that
  // began and is late: the first is a failure of the institution to act at
  // all, the second a failure to keep to time.
  const gapShare = made > 0 ? ((unactioned.length * 2 + overdue) / made) * 100 : 0
  const state: OperationalState =
    made === 0
      ? 'operational'
      : gapShare >= 60
        ? 'critical'
        : gapShare >= 40
          ? 'at-risk'
          : gapShare >= 20
            ? 'degraded'
            : 'operational'

  return {
    wardId,
    wardLabel,
    made,
    delivered: rows.filter((r) => r.standing === 'delivered').length,
    inProgress: rows.filter((r) => r.standing === 'in-progress').length,
    overdue,
    unactioned: unactioned.length,
    valueCommittedCrore: round1(valueCommitted),
    valueDeliveredCrore: round1(valueDelivered),
    valueOutstandingCrore: round1(Math.max(0, valueCommitted - valueDelivered)),
    oldestUnactionedDays: oldest?.ageDays ?? 0,
    oldestUnactionedRef: oldest?.reference,
    meanUnactionedAgeDays:
      unactioned.length > 0
        ? Math.round(unactioned.reduce((s, r) => s + r.ageDays, 0) / unactioned.length)
        : 0,
    state,
  }
}

/** The commitment position of a single ward. */
export function summariseWardCommitments(wardId: string): WardCommitmentSummary | null {
  if (!WARD_BY_ID.has(wardId)) return null
  return summariseCommitments(wardId, wardName(wardId), buildWardCommitments(wardId))
}

/** One summary per ward, for ranking wards against one another. */
export function summariseWards(wardIds: string[]): WardCommitmentSummary[] {
  return wardIds
    .map((id) => summariseWardCommitments(id))
    .filter((s): s is WardCommitmentSummary => s !== null)
}

/**
 * Records that commit the corporation but name no ward, and are therefore
 * excluded from this ledger by construction.
 *
 * Reported so the exclusion is stated on the surface. A ledger that quietly
 * dropped a third of the resolution register would be worse than no ledger.
 */
export function cityWideCommitmentCount(): { resolutions: number; projects: number; decisions: number; total: number } {
  const resolutions = COUNCIL_RESOLUTIONS.filter(
    (r) => r.wardIds.length === 0 && (r.status === 'passed' || r.status === 'implemented'),
  ).length
  const projects = PROJECTS.filter((p) => p.wardIds.length === 0).length
  const decisions = DECISION_CASES.filter(
    (d) => d.wardIds.length === 0 && (DECIDED_DECISION_STATUSES.has(d.status) || Boolean(d.humanDecision)),
  ).length
  return { resolutions, projects, decisions, total: resolutions + projects + decisions }
}
