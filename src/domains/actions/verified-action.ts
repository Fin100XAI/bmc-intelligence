/**
 * src/domains/actions/verified-action.ts
 *
 * VERIFIED ACTIONS - the difference between "marked complete" and "done".
 *
 * Raised in a corporation review: how would anyone know field work was actually
 * completed? So an action here is never closed by the person who did it. The
 * owner REPORTS it done, with what was done and the evidence for it; a
 * different principal, holding the authority to approve, VERIFIES it or
 * RETURNS it with a reason. Every step is kept, with who and when, so a
 * review can see not only the state but how it got there.
 *
 * Generic: an action can belong to an Intelligence Case, a property lifecycle
 * task or a review brief. Permission (who may verify) is decided by the
 * caller through the permission engine; this module enforces the rules that
 * hold whoever the caller is.
 */

export type ActionStatus =
  /** Given to an owner; nothing reported yet. */
  | 'assigned'
  /** The owner has started. */
  | 'in-progress'
  /** The owner says it is done, with a note and evidence. Not yet checked. */
  | 'reported'
  /** A different, authorised person confirmed it. Closed. */
  | 'verified'
  /** A verifier sent it back, with the reason. Open again. */
  | 'returned'

export interface Actor {
  id: string
  name: string
  role: string
}

export interface ActionEvent {
  status: ActionStatus
  at: string
  by: Actor
  /** Required when reporting, verifying or returning. */
  note?: string
}

export interface ActionSource {
  kind: 'case' | 'lifecycle' | 'brief'
  /** The case or lifecycle record it belongs to. */
  ref: string
  /** What a reader sees for the source. */
  label: string
}

export interface TrackedAction {
  id: string
  source: ActionSource
  description: string
  /** The post that owns it. */
  ownerRole: string
  /** Department responsible, where the source names one. */
  department?: string
  dueOn: string
  createdAt: string
  status: ActionStatus
  history: ActionEvent[]
  /** What the verifier should be able to see: a photo reference, a file number, a site-visit note. */
  evidence?: string
}

export const OPEN_STATUSES: ActionStatus[] = ['assigned', 'in-progress', 'reported', 'returned']

/** Which moves are allowed from each state. */
const NEXT: Record<ActionStatus, ActionStatus[]> = {
  assigned: ['in-progress', 'reported'],
  'in-progress': ['reported'],
  reported: ['verified', 'returned'],
  returned: ['in-progress', 'reported'],
  verified: [],
}

export function allowedNext(status: ActionStatus): ActionStatus[] {
  return NEXT[status]
}

export function createAction(input: {
  id: string
  source: ActionSource
  description: string
  ownerRole: string
  department?: string
  dueOn: string
  by: Actor
  at: string
}): TrackedAction {
  return {
    id: input.id,
    source: input.source,
    description: input.description,
    ownerRole: input.ownerRole,
    department: input.department,
    dueOn: input.dueOn,
    createdAt: input.at,
    status: 'assigned',
    history: [{ status: 'assigned', at: input.at, by: input.by }],
  }
}

export type TransitionError = 'not-allowed' | 'note-required' | 'evidence-required' | 'self-verification'

/** The person who last reported the action done. */
export function reporterOf(action: TrackedAction): Actor | undefined {
  return [...action.history].reverse().find((e) => e.status === 'reported')?.by
}

/**
 * Moves an action to its next state, or says why it cannot move.
 *
 *  - reporting needs a note of what was done and an evidence reference;
 *  - verifying and returning need a note;
 *  - nobody verifies their own report.
 */
export function transition(
  action: TrackedAction,
  to: ActionStatus,
  by: Actor,
  at: string,
  detail: { note?: string; evidence?: string } = {},
): TrackedAction | TransitionError {
  if (!NEXT[action.status].includes(to)) return 'not-allowed'
  const note = detail.note?.trim()
  if ((to === 'reported' || to === 'verified' || to === 'returned') && !note) return 'note-required'
  if (to === 'reported' && !detail.evidence?.trim() && !action.evidence) return 'evidence-required'
  if (to === 'verified' && reporterOf(action)?.id === by.id) return 'self-verification'
  return {
    ...action,
    status: to,
    evidence: to === 'reported' ? detail.evidence?.trim() || action.evidence : action.evidence,
    history: [...action.history, { status: to, at, by, note }],
  }
}

/** Days past due for an open action; 0 when not overdue or closed. */
export function daysOverdue(action: TrackedAction, now: Date): number {
  if (!OPEN_STATUSES.includes(action.status) || action.status === 'reported') return 0
  const due = new Date(`${action.dueOn}T23:59:59+05:30`).getTime()
  return Math.max(0, Math.floor((now.getTime() - due) / 86_400_000))
}

/** When it entered its current state. */
export function since(action: TrackedAction): string {
  return action.history[action.history.length - 1]?.at ?? action.createdAt
}

export interface ReviewDigest {
  /** Verified since the last review. */
  closed: TrackedAction[]
  /** Reported done, waiting for someone to check. */
  awaitingVerification: TrackedAction[]
  /** Sent back since the last review. */
  returned: TrackedAction[]
  overdue: TrackedAction[]
  open: TrackedAction[]
  /** Of everything reported, the share that verified rather than returned. */
  verificationRate: number | null
}

/**
 * What a weekly review opens with: what closed since the last one, what is
 * claimed but unchecked, what bounced, what is late.
 */
export function reviewDigest(actions: TrackedAction[], lastReview: string, now: Date): ReviewDigest {
  const after = (a: TrackedAction, s: ActionStatus) => a.history.some((e) => e.status === s && e.at >= lastReview)
  const verifiedEver = actions.filter((a) => a.history.some((e) => e.status === 'verified')).length
  const returnedEver = actions.filter((a) => a.history.some((e) => e.status === 'returned')).length
  return {
    closed: actions.filter((a) => a.status === 'verified' && after(a, 'verified')),
    awaitingVerification: actions.filter((a) => a.status === 'reported'),
    returned: actions.filter((a) => a.status === 'returned' && after(a, 'returned')),
    overdue: actions.filter((a) => daysOverdue(a, now) > 0).sort((x, y) => daysOverdue(y, now) - daysOverdue(x, now)),
    open: actions.filter((a) => OPEN_STATUSES.includes(a.status)),
    verificationRate: verifiedEver + returnedEver > 0 ? verifiedEver / (verifiedEver + returnedEver) : null,
  }
}
