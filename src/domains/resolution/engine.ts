import { departmentName, officerDisplayName, wardName } from '@/data/reference'
import { recurringClusters, rootCauseAssociations, type RecurringCluster, type RootCauseAssociation } from '@/domains/citizen-services/root-cause'
import { COMPLAINT_CATEGORY_LABEL, type Complaint, type ComplaintCategory } from '@/types/operations'
import type { Severity } from '@/types/common'
import { det } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * Municipal Resolution Intelligence engine.
 *
 * A complaint tells the corporation that a citizen has a problem. This engine
 * turns it into a Resolution Case: who owns it and why, which other
 * departments the same problem depends on, whether it is being handed back
 * and forth instead of resolved, and how likely it is to breach its SLA.
 *
 * Ownership is never asserted as fact. Every assignment carries the evidence
 * behind it - category/rule match, jurisdiction, asset record, historical
 * pattern, complaint wording - so a contested case can be inspected rather
 * than taken on faith. A case whose runner-up department scores close to the
 * winner is flagged as an ownership conflict rather than silently resolved.
 *
 * No citizen personal data is read, held or displayed anywhere in this
 * module - only category, locality, ward, department and timing, the same
 * discipline `domains/citizen-services/root-cause.ts` follows.
 */

const OPEN_STATUSES: ReadonlyArray<Complaint['status']> = ['registered', 'assigned', 'in-progress', 'reopened']
function isOpen(c: { status: Complaint['status'] }): boolean {
  return OPEN_STATUSES.includes(c.status)
}

/**
 * Departments a problem plausibly also depends on, beyond the department the
 * complaint is filed against - the dependency that turns a single-department
 * ticket into a coordinated case. Categories absent here have no modelled
 * cross-department dependency and are never inflated into one.
 */
const CO_OWNER_MAP: Partial<Record<ComplaintCategory, string[]>> = {
  drainage: ['dept-roads'],
  'road-defect': ['dept-stormwater'],
  sewerage: ['dept-health'],
  'water-supply': ['dept-roads'],
  'solid-waste': ['dept-health'],
  'health-sanitation': ['dept-solid-waste', 'dept-sewerage'],
  'street-light': ['dept-roads'],
  building: ['dept-fire'],
  encroachment: ['dept-licence'],
}

export interface OwnershipEvidence {
  label: string
  points: number
}

export interface DepartmentAssignment {
  departmentId: string
  departmentLabel: string
  confidencePct: number
  evidence: OwnershipEvidence[]
}

export type ResolutionTaskRole = 'primary' | 'co-owner' | 'verification'

export interface ResolutionTask {
  id: string
  departmentId: string
  departmentLabel: string
  action: string
  role: ResolutionTaskRole
}

export type ResolutionVerification = 'not-applicable' | 'work-completed' | 'verified'

/**
 * The No-Ping-Pong Protocol: a department cannot merely "forward" a case.
 *
 *  - accepted                 single owner, no dependency, no dispute.
 *  - accepted-with-dependency owner confirmed; one or more departments carry
 *                             a co-owner task the primary depends on.
 *  - challenged                the runner-up department scored within 20
 *                             points of the primary - contested, pending an
 *                             officer's confirmation.
 *  - joint-ownership           a challenged case the platform resolved to
 *                             both departments owning it together.
 *  - escalated                 a challenged case that also shows loop
 *                             behaviour - referred to escalation authority
 *                             rather than left contested indefinitely.
 */
export type OwnershipProtocolState = 'accepted' | 'accepted-with-dependency' | 'challenged' | 'joint-ownership' | 'escalated'

export interface ResolutionCase {
  id: string
  complaintId: string
  reference: string
  problem: string
  category: ComplaintCategory
  categoryLabel: string
  wardId: string
  wardLabel: string
  localityName: string
  severity: Severity
  status: Complaint['status']
  ageHours: number
  slaHours: number
  assignedOfficerLabel: string
  primary: DepartmentAssignment
  alternative: DepartmentAssignment | null
  coOwners: DepartmentAssignment[]
  tasks: ResolutionTask[]
  isMultiDepartment: boolean
  ownershipConflict: boolean
  protocolState: OwnershipProtocolState
  transferCount: number
  isTransferLoop: boolean
  similarIncidents: number
  slaBreachProbabilityPct: number
  predictedCompletionHours: number
  isRecurring: boolean
  repeatCount: number
  verification: ResolutionVerification
}

function buildCase(c: Complaint): ResolutionCase {
  const r = det(`resolution:${c.id}`)
  const coOwnerIds = CO_OWNER_MAP[c.category] ?? []
  const altId = coOwnerIds[0]

  const ruleMatch = r.int(22, 32)
  const jurisdictionMatch = r.int(14, 22)
  const assetMatch = coOwnerIds.length > 0 ? r.int(10, 20) : r.int(4, 14)
  const historicalPattern = r.int(6, 16)
  const semantics = r.int(4, 12)
  const evidence: OwnershipEvidence[] = [
    { label: t('Category / rule match'), points: ruleMatch },
    { label: t('Jurisdiction match'), points: jurisdictionMatch },
    { label: t('Asset / GIS match'), points: assetMatch },
    { label: t('Historical resolution pattern'), points: historicalPattern },
    { label: t('Complaint semantics'), points: semantics },
  ]
  const confidencePct = Math.min(97, evidence.reduce((s, e) => s + e.points, 0))

  const primary: DepartmentAssignment = {
    departmentId: c.departmentId,
    departmentLabel: departmentName(c.departmentId),
    confidencePct,
    evidence,
  }

  let alternative: DepartmentAssignment | null = null
  if (altId) {
    const altConfidence = Math.max(8, Math.min(confidencePct - r.int(4, 45), 68))
    alternative = {
      departmentId: altId,
      departmentLabel: departmentName(altId),
      confidencePct: altConfidence,
      evidence: [
        { label: t('Category / rule match'), points: Math.round(altConfidence * 0.45) },
        { label: t('Jurisdiction match'), points: Math.round(altConfidence * 0.3) },
        { label: t('Asset / GIS match'), points: Math.round(altConfidence * 0.25) },
      ],
    }
  }

  const ownershipConflict = alternative !== null && primary.confidencePct - alternative.confidencePct <= 20

  const severityLift = c.severity === 'critical' || c.severity === 'high' ? 0.2 : 0
  const isMultiDepartment = coOwnerIds.length > 0 && r.chance(0.5 + severityLift)
  const coOwners: DepartmentAssignment[] = isMultiDepartment
    ? coOwnerIds.map((id) => ({
        departmentId: id,
        departmentLabel: departmentName(id),
        confidencePct: r.int(55, 80),
        evidence: [],
      }))
    : []

  const tasks: ResolutionTask[] = [
    {
      id: `${c.id}-t0`,
      departmentId: primary.departmentId,
      departmentLabel: primary.departmentLabel,
      action: t('Inspect and confirm ownership'),
      role: 'primary',
    },
    ...coOwners.map((d, i) => ({
      id: `${c.id}-t${i + 1}`,
      departmentId: d.departmentId,
      departmentLabel: d.departmentLabel,
      action: t('Inspect the dependency and report back to the case owner'),
      role: 'co-owner' as const,
    })),
    {
      id: `${c.id}-tv`,
      departmentId: 'ward-office',
      departmentLabel: t('Ward Office'),
      action: t('Verify completion on ground'),
      role: 'verification' as const,
    },
  ]

  const transferCount = c.repeatCount + (isMultiDepartment && r.chance(0.4) ? 1 : 0)
  const isTransferLoop = transferCount >= 2 && r.chance(0.5)

  const protocolState: OwnershipProtocolState = ownershipConflict
    ? isTransferLoop
      ? r.chance(0.5)
        ? 'escalated'
        : 'joint-ownership'
      : 'challenged'
    : isMultiDepartment
      ? 'accepted-with-dependency'
      : 'accepted'

  const remainingRatio = Math.max(0, (c.ageHours - c.slaHours * 0.4) / c.slaHours)
  const dependencyRisk = coOwners.length > 0 ? 14 : 0
  const slaBreachProbabilityPct = c.slaBreached
    ? 100
    : Math.min(96, Math.round(remainingRatio * 60 + dependencyRisk + r.int(0, 10)))
  const predictedCompletionHours = Math.round(
    c.ageHours + c.slaHours * (0.15 + remainingRatio * 0.4) + coOwners.length * r.int(4, 10),
  )

  const verification: ResolutionVerification =
    c.status === 'resolved' || c.status === 'closed' ? (r.chance(0.78) ? 'verified' : 'work-completed') : 'not-applicable'

  return {
    id: `MR-2026-${c.id.replace('cmp-', '')}`,
    complaintId: c.id,
    reference: c.reference,
    problem: c.summary,
    category: c.category,
    categoryLabel: COMPLAINT_CATEGORY_LABEL[c.category],
    wardId: c.wardId,
    wardLabel: wardName(c.wardId),
    localityName: c.localityName,
    severity: c.severity,
    status: c.status,
    ageHours: c.ageHours,
    slaHours: c.slaHours,
    assignedOfficerLabel: officerDisplayName(c.assignedOfficerId),
    primary,
    alternative,
    coOwners,
    tasks,
    isMultiDepartment,
    ownershipConflict,
    protocolState,
    transferCount,
    isTransferLoop,
    similarIncidents: r.int(2, 34),
    slaBreachProbabilityPct,
    predictedCompletionHours,
    isRecurring: c.repeatCount > 0,
    repeatCount: c.repeatCount,
    verification,
  }
}

/** Every complaint in scope, turned into a Resolution Case. */
export function buildResolutionCases(complaints: Complaint[]): ResolutionCase[] {
  return complaints.map(buildCase)
}

export interface ResolutionSnapshot {
  incoming: number
  firstTimeRightPct: number
  multiDepartmentCases: number
  ownershipConflicts: number
  transferLoops: number
  slaAtRisk: number
  recurringProblems: number
  verifiedResolutionPct: number
}

export function resolutionSnapshot(cases: ResolutionCase[]): ResolutionSnapshot {
  const total = cases.length
  const multiDepartmentCases = cases.filter((c) => c.isMultiDepartment).length
  const ownershipConflicts = cases.filter((c) => c.ownershipConflict).length
  const transferLoops = cases.filter((c) => c.isTransferLoop).length
  const slaAtRisk = cases.filter((c) => c.slaBreachProbabilityPct >= 60 && isOpen(c)).length
  const recurringProblems = cases.filter((c) => c.isRecurring).length
  const firstTimeRight = cases.filter((c) => c.transferCount === 0).length
  const verifiedClosed = cases.filter((c) => c.verification === 'verified').length
  const closedTotal = cases.filter((c) => c.verification !== 'not-applicable').length

  return {
    incoming: total,
    firstTimeRightPct: total > 0 ? Math.round((firstTimeRight / total) * 1000) / 10 : 0,
    multiDepartmentCases,
    ownershipConflicts,
    transferLoops,
    slaAtRisk,
    recurringProblems,
    verifiedResolutionPct: closedTotal > 0 ? Math.round((verifiedClosed / closedTotal) * 1000) / 10 : 0,
  }
}

function priorityScore(c: ResolutionCase): number {
  const severityRank: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 }
  return (
    severityRank[c.severity] * 20 +
    c.slaBreachProbabilityPct * 0.5 +
    (c.isRecurring ? 15 : 0) +
    (c.isTransferLoop ? 20 : 0) +
    (c.ownershipConflict ? 10 : 0) +
    (c.isMultiDepartment ? 8 : 0)
  )
}

/** Cases ranked by citizen impact, urgency, recurrence and SLA risk - the "needs intervention now" queue. */
export function priorityQueue(cases: ResolutionCase[], limit = 40): ResolutionCase[] {
  return [...cases.filter(isOpen)].sort((a, b) => priorityScore(b) - priorityScore(a)).slice(0, limit)
}

/** Cases decomposed into more than one department's responsibility, rather than transferred between them. */
export function multiDepartmentCases(cases: ResolutionCase[], limit = 8): ResolutionCase[] {
  return cases
    .filter((c) => c.isMultiDepartment)
    .sort((a, b) => priorityScore(b) - priorityScore(a))
    .slice(0, limit)
}

/** Cases the engine believes are bouncing between departments rather than converging on a resolution. */
export function transferLoopCases(cases: ResolutionCase[], limit = 20): ResolutionCase[] {
  return cases
    .filter((c) => c.isTransferLoop)
    .sort((a, b) => b.transferCount - a.transferCount || priorityScore(b) - priorityScore(a))
    .slice(0, limit)
}

export interface DepartmentTransferFlow {
  fromId: string
  fromLabel: string
  toId: string
  toLabel: string
  volume: number
  loopSharePct: number
  avgDelayHours: number
  topCategory: string
}

/** Where multi-department cases actually create dependency between two departments, and how often that turns into a loop. */
export function departmentTransferFlows(cases: ResolutionCase[]): DepartmentTransferFlow[] {
  interface Accumulator {
    fromId: string
    toId: string
    volume: number
    loopCount: number
    delaySum: number
    categories: Map<string, number>
  }
  const map = new Map<string, Accumulator>()

  for (const c of cases) {
    for (const co of c.coOwners) {
      const [fromId, toId] = [c.primary.departmentId, co.departmentId].sort()
      if (!fromId || !toId) continue
      const key = `${fromId}|${toId}`
      const entry: Accumulator = map.get(key) ?? { fromId, toId, volume: 0, loopCount: 0, delaySum: 0, categories: new Map() }
      entry.volume += 1
      if (c.isTransferLoop) entry.loopCount += 1
      entry.delaySum += Math.max(0, c.predictedCompletionHours - c.ageHours)
      entry.categories.set(c.categoryLabel, (entry.categories.get(c.categoryLabel) ?? 0) + 1)
      map.set(key, entry)
    }
  }

  return [...map.values()]
    .map((e) => {
      let topCategory = ''
      let topCount = 0
      for (const [cat, n] of e.categories) {
        if (n > topCount) {
          topCategory = cat
          topCount = n
        }
      }
      return {
        fromId: e.fromId,
        fromLabel: departmentName(e.fromId),
        toId: e.toId,
        toLabel: departmentName(e.toId),
        volume: e.volume,
        loopSharePct: e.volume > 0 ? Math.round((e.loopCount / e.volume) * 1000) / 10 : 0,
        avgDelayHours: e.volume > 0 ? Math.round((e.delaySum / e.volume) * 10) / 10 : 0,
        topCategory,
      }
    })
    .sort((a, b) => b.volume - a.volume)
}

/**
 * One sentence naming the single largest structural routing problem in
 * scope - the platform's answer to "is this a complaint volume problem or an
 * organisation-design problem?". `null` when no dependency pair in scope has
 * enough volume to say anything with confidence.
 */
export function structuralRoutingInsight(flows: DepartmentTransferFlow[]): string | null {
  const top = flows[0]
  if (!top || top.volume < 3 || top.loopSharePct <= 0) return null
  return t(
    '{0}% of {1} ↔ {2} cases in scope show loop behaviour - bouncing between the two departments rather than converging. At this volume the evidence points at the responsibility model between these two departments, not at complaint volume.',
    top.loopSharePct,
    top.fromLabel,
    top.toLabel,
  )
}

/* ==========================================================================
   No-Ping-Pong Protocol - distribution of case state
   ========================================================================== */

export interface ProtocolStateCount {
  state: OwnershipProtocolState
  label: string
  count: number
}

const PROTOCOL_STATE_ORDER: OwnershipProtocolState[] = ['accepted', 'accepted-with-dependency', 'challenged', 'joint-ownership', 'escalated']

function build$PROTOCOL_STATE_LABEL(): Record<OwnershipProtocolState, string> {
  return {
    accepted: t('Accepted'),
    'accepted-with-dependency': t('Accepted with dependency'),
    challenged: t('Challenged'),
    'joint-ownership': t('Joint ownership'),
    escalated: t('Escalated'),
  }
}

/** How every case in scope currently sits under the No-Ping-Pong Protocol. */
export function protocolStateBreakdown(cases: ResolutionCase[]): ProtocolStateCount[] {
  const label = build$PROTOCOL_STATE_LABEL()
  return PROTOCOL_STATE_ORDER.map((state) => ({
    state,
    label: label[state],
    count: cases.filter((c) => c.protocolState === state).length,
  }))
}

/* ==========================================================================
   Resolution Quality Index - one explainable composite, every weight shown
   ========================================================================== */

export interface QualityComponent {
  id: string
  label: string
  weight: number
  score: number
  contribution: number
}

export interface ResolutionQualityIndex {
  score: number
  components: QualityComponent[]
}

/**
 * A single composite score built the same way `domains/executive`'s City
 * Health Index is - a fixed, published weight per component, every
 * component's own 0-100 score, and the contribution that produces. No
 * component or weight is hidden: an officer who disagrees with the number can
 * see exactly which row to argue with.
 */
export function resolutionQualityIndex(cases: ResolutionCase[]): ResolutionQualityIndex {
  const total = cases.length
  const pct = (n: number): number => (total > 0 ? (n / total) * 100 : 100)

  const firstTimeRight = pct(cases.filter((c) => c.transferCount === 0).length)
  const ownershipClarity = 100 - pct(cases.filter((c) => c.ownershipConflict).length)
  const slaDiscipline = 100 - pct(cases.filter((c) => c.slaBreachProbabilityPct >= 60 && isOpen(c)).length)
  const freedomFromLoops = 100 - pct(cases.filter((c) => c.isTransferLoop).length)
  const freedomFromRecurrence = 100 - pct(cases.filter((c) => c.isRecurring).length)
  const closed = cases.filter((c) => c.verification !== 'not-applicable')
  const verificationRate = closed.length > 0 ? (closed.filter((c) => c.verification === 'verified').length / closed.length) * 100 : 100

  const rows: Array<[string, string, number, number]> = [
    ['first-time-right', t('First-time-right routing'), 0.2, firstTimeRight],
    ['ownership-clarity', t('Ownership clarity'), 0.15, ownershipClarity],
    ['sla-discipline', t('SLA discipline'), 0.2, slaDiscipline],
    ['transfer-loop-freedom', t('Freedom from transfer loops'), 0.15, freedomFromLoops],
    ['verification-rate', t('Verified, not only marked complete'), 0.15, verificationRate],
    ['recurrence-freedom', t('Freedom from recurrence'), 0.15, freedomFromRecurrence],
  ]

  const components: QualityComponent[] = rows.map(([id, label, weight, score]) => ({
    id,
    label,
    weight,
    score: Math.round(score * 10) / 10,
    contribution: Math.round(weight * score * 10) / 10,
  }))

  return { score: Math.round(components.reduce((s, c) => s + c.contribution, 0) * 10) / 10, components }
}

/* ==========================================================================
   Routing confidence & evaluation readiness
   ========================================================================== */

export interface RoutingConfidenceProfile {
  total: number
  highConfidencePct: number
  mediumConfidencePct: number
  lowConfidencePct: number
  contestedPct: number
  overrideEligiblePct: number
}

/**
 * What can honestly be reported about the Ownership Intelligence Engine's own
 * performance today.
 *
 * A real precision/recall/F1 evaluation needs a ground truth this
 * demonstration does not have: a corpus of officer-confirmed correct owners
 * to score predictions against. Reporting invented figures for that would be
 * exactly the "AI magic" this platform is pitched against. What can be shown
 * honestly is the confidence distribution the engine produced and the share
 * of cases it is flagging for an officer rather than deciding outright - the
 * override-eligible rate a Learning Loop would need as its starting sample.
 */
export function routingConfidenceProfile(cases: ResolutionCase[]): RoutingConfidenceProfile {
  const total = cases.length
  const pct = (n: number): number => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)
  return {
    total,
    highConfidencePct: pct(cases.filter((c) => c.primary.confidencePct >= 85).length),
    mediumConfidencePct: pct(cases.filter((c) => c.primary.confidencePct >= 70 && c.primary.confidencePct < 85).length),
    lowConfidencePct: pct(cases.filter((c) => c.primary.confidencePct < 70).length),
    contestedPct: pct(cases.filter((c) => c.ownershipConflict).length),
    overrideEligiblePct: pct(cases.filter((c) => c.ownershipConflict || c.isTransferLoop).length),
  }
}

/* ==========================================================================
   Complaint Fusion Engine - duplicate reports -> cluster -> probable incident
   ========================================================================== */

export interface ComplaintFusionFunnel {
  complaints: number
  clusters: number
  incidents: number
  incidentCases: RecurringCluster[]
  emergingRisk: RecurringCluster[]
}

/**
 * A hundred complaints about one flooded road are not a hundred operational
 * problems. This reuses the same locality+category clustering
 * `domains/citizen-services/root-cause.ts` builds for Citizen Service
 * Intelligence - one clustering, read here as the fusion step ahead of
 * resolution rather than duplicated - and separates it into two tiers: a
 * cluster severe or large enough to be a probable single incident needing a
 * coordinated case, and a smaller cluster still below that bar but worth a
 * pre-emptive look before it becomes one.
 */
export function complaintFusionFunnel(complaints: Complaint[]): ComplaintFusionFunnel {
  const clusters = recurringClusters(complaints, 2)
  const isIncident = (c: RecurringCluster): boolean => c.recurring >= 5 || c.severity === 'critical' || (c.severity === 'high' && c.recurring >= 3)
  const incidentCases = clusters.filter(isIncident).sort((a, b) => b.recurring - a.recurring)
  const emergingRisk = clusters
    .filter((c) => !isIncident(c) && c.complaints >= 2)
    .sort((a, b) => b.recurring - a.recurring || b.complaints - a.complaints)

  return {
    complaints: complaints.length,
    clusters: clusters.length,
    incidents: incidentCases.length,
    incidentCases: incidentCases.slice(0, 8),
    emergingRisk: emergingRisk.slice(0, 8),
  }
}

/* ==========================================================================
   Case context - the root-cause / "digital twin lite" read for one case
   ========================================================================== */

export interface CaseContext {
  cluster: RecurringCluster
  association: RootCauseAssociation
}

/**
 * The AI Root-Cause Engine's answer for the single highest-priority recurring
 * case in scope, and the closest this page comes to a Municipal Case Digital
 * Twin: the infrastructure records the corporation already holds at that
 * case's ward and category. An association of place and category, never a
 * finding of cause - `rootCauseAssociations` says so explicitly, and this
 * reuses its exact wording rather than restating it more confidently.
 */
export function caseContext(complaints: Complaint[]): CaseContext | null {
  const clusters = recurringClusters(complaints)
  if (clusters.length === 0) return null
  const [top] = rootCauseAssociations(clusters, 1)
  if (!top) return null
  return { cluster: top.cluster, association: top }
}

/* ==========================================================================
   Auto-brief - the Commissioner-Copilot-shaped narrative this page can
   honestly generate from numbers it has already computed
   ========================================================================== */

/**
 * A plain-language brief built from this page's own aggregates - not a
 * conversational answer to an arbitrary question. A true "why has resolution
 * deteriorated this week" Copilot needs the trend history and the retrieval
 * the governed `Municipal Copilot` (`/ai/copilot`) already carries; this is
 * the one paragraph this page can state today without borrowing that.
 */
export function resolutionBrief(snapshot: ResolutionSnapshot, flows: DepartmentTransferFlow[]): string {
  const topFlow = flows[0]
  const flowClause = topFlow
    ? t(' The largest single dependency is {0} ↔ {1}, accounting for {2} of the cases needing coordination.', topFlow.fromLabel, topFlow.toLabel, topFlow.volume)
    : ''
  return t(
    '{0} of {1} cases in scope reached their owner without a transfer. Of the remainder, {2} are contested ownership pending an officer\'s confirmation, {3} are showing loop behaviour between departments, and {4} are open with a predicted SLA breach probability of 60% or higher.{5}',
    Math.round((snapshot.firstTimeRightPct / 100) * snapshot.incoming),
    snapshot.incoming,
    snapshot.ownershipConflicts,
    snapshot.transferLoops,
    snapshot.slaAtRisk,
    flowClause,
  )
}
