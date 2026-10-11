import type { AlertTier, PriorityResult } from './engines'
import type { TrackedAction } from '@/domains/actions/verified-action'

/**
 * src/domains/decision/case.ts
 *
 * The Intelligence Case - the operational object of the decision layer
 * (spec §89). See `docs/architecture/08-decision-intelligence.md` §6.
 */

export type CaseOrigin = 'coordination' | 'milestone' | 'stale-status' | 'evidence-gap' | 'funding' | 'resilience' | 'contradiction' | 'revenue'

export interface CaseRelationship {
  label: string
  /** Project id, source id or route the relationship points at. */
  ref: string
  kind: 'project' | 'source' | 'place' | 'scheme' | 'department'
}

export interface IntelligenceCase {
  id: string
  origin: CaseOrigin
  title: string
  /** One-paragraph statement of what was observed - no conclusion beyond the evidence. */
  context: string
  /** Why the engine raised it, line by line. */
  reasons: string[]
  evidenceIds: string[]
  projectIds: string[]
  relationships: CaseRelationship[]
  /** Risk or opportunity, stated as a signal. */
  signal: string
  priority: PriorityResult
  tier: AlertTier
  recommendation: string
  /** The post that must decide. */
  responsibleRole: string
  departments: string[]
  /** What would show the action worked - set before the decision, so it cannot drift after. */
  expectedOutcome: string
  /** What public evidence cannot establish, stated plainly (spec §92). */
  evidenceLimits: string[]
  engine: string
}

export type DecisionChoice = 'coordination-required' | 'monitor' | 'no-action' | 'request-evidence'

export type FeedbackVerdict = 'VALID' | 'INVALID' | 'PARTIALLY_VALID' | 'DUPLICATE' | 'INSUFFICIENT_EVIDENCE' | 'ALREADY_RESOLVED'

/** Everything known at the moment of decision, frozen (spec §108). */
export interface DecisionProvenance {
  decidedAt: string
  decidedBy: string
  role: string
  choice: DecisionChoice
  rationale: string
  evidenceIds: string[]
  engine: string
  priorityScore: number
  contributions: Record<string, number>
  confidence: string
  recommendation: string
}

/**
 * An action on a case is a verified action: its owner reports it done with
 * evidence, and someone else verifies it. See `domains/actions/verified-action.ts`.
 */
export type CaseAction = TrackedAction

export interface CaseOutcome {
  recordedAt: string
  recordedBy: string
  /** Did the action produce the expected outcome? */
  result: 'achieved' | 'partly-achieved' | 'not-achieved'
  note: string
}

export interface CaseFeedback {
  verdict: FeedbackVerdict
  reason: string
  by: string
  at: string
}

/** The officer-side record of a case - what people decided and did. */
export interface CaseRecord {
  decision?: DecisionProvenance
  actions: CaseAction[]
  outcome?: CaseOutcome
  feedback: CaseFeedback[]
}

/**
 * Action Yield (spec §107): of the cases with a recorded outcome, the share
 * whose action achieved what was expected - partly-achieved counts half.
 */
export function actionYield(records: CaseRecord[]): { measured: number; yieldPct: number | null } {
  const measured = records.filter((r) => r.outcome)
  if (measured.length === 0) return { measured: 0, yieldPct: null }
  const points = measured.reduce((s, r) => s + (r.outcome?.result === 'achieved' ? 1 : r.outcome?.result === 'partly-achieved' ? 0.5 : 0), 0)
  return { measured: measured.length, yieldPct: Math.round((points / measured.length) * 100) }
}
