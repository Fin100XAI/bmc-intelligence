import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { CaseAction, CaseFeedback, CaseOutcome, CaseRecord, DecisionProvenance } from '@/domains/decision/case'
import { DEFAULT_WEIGHTS, type PriorityFactor } from '@/domains/decision/engines'
import type { ActionStatus } from '@/domains/actions/verified-action'

/**
 * Officer decisions, actions, outcomes and feedback on Intelligence Cases,
 * and the Decision Room's priority weights.
 *
 * Held in this browser for the demonstration; a deployment writes the same
 * records to the decision service, where they are append-only and audited.
 */

interface CaseState {
  records: Record<string, CaseRecord>
  weights: Record<PriorityFactor, number>
  decide: (caseId: string, provenance: DecisionProvenance) => void
  addAction: (caseId: string, action: CaseAction) => void
  /** Replaces an action with its next state, already moved by `transition`. */
  updateAction: (caseId: string, action: CaseAction) => void
  recordOutcome: (caseId: string, outcome: CaseOutcome) => void
  addFeedback: (caseId: string, feedback: CaseFeedback) => void
  setWeights: (weights: Record<PriorityFactor, number>) => void
  resetWeights: () => void
  resetCase: (caseId: string) => void
}

const empty = (): CaseRecord => ({ actions: [], feedback: [] })

/** The shape actions had before verification existed (store version 0). */
interface LegacyAction {
  id: string
  description: string
  owner: string
  dueOn: string
  status: 'assigned' | 'in-progress' | 'done'
  createdAt: string
}

/**
 * An action saved before verification existed. "Done" was the owner's own
 * word, so it becomes REPORTED - claimed, not yet checked - never verified.
 */
export function migrateLegacyAction(caseId: string, a: LegacyAction): CaseAction {
  const status: ActionStatus = a.status === 'done' ? 'reported' : a.status
  const by = { id: 'legacy', name: a.owner, role: a.owner }
  return {
    id: a.id,
    source: { kind: 'case', ref: caseId, label: caseId },
    description: a.description,
    ownerRole: a.owner,
    dueOn: a.dueOn,
    createdAt: a.createdAt,
    status,
    evidence: a.status === 'done' ? 'Recorded as done before verification was introduced' : undefined,
    history: [
      { status: 'assigned', at: a.createdAt, by },
      ...(status !== 'assigned' ? [{ status, at: a.createdAt, by, note: status === 'reported' ? 'Marked done before verification was introduced' : undefined }] : []),
    ],
  }
}

export const useCaseStore = create<CaseState>()(
  persist(
    (set) => ({
      records: {},
      weights: { ...DEFAULT_WEIGHTS },
      decide: (caseId, provenance) =>
        set((s) => ({ records: { ...s.records, [caseId]: { ...(s.records[caseId] ?? empty()), decision: provenance } } })),
      addAction: (caseId, action) =>
        set((s) => {
          const r = s.records[caseId] ?? empty()
          return { records: { ...s.records, [caseId]: { ...r, actions: [...r.actions, action] } } }
        }),
      updateAction: (caseId, action) =>
        set((s) => {
          const r = s.records[caseId] ?? empty()
          return { records: { ...s.records, [caseId]: { ...r, actions: r.actions.map((a) => (a.id === action.id ? action : a)) } } }
        }),
      recordOutcome: (caseId, outcome) =>
        set((s) => ({ records: { ...s.records, [caseId]: { ...(s.records[caseId] ?? empty()), outcome } } })),
      addFeedback: (caseId, feedback) =>
        set((s) => {
          const r = s.records[caseId] ?? empty()
          return { records: { ...s.records, [caseId]: { ...r, feedback: [...r.feedback, feedback] } } }
        }),
      setWeights: (weights) => set({ weights }),
      resetWeights: () => set({ weights: { ...DEFAULT_WEIGHTS } }),
      resetCase: (caseId) =>
        set((s) => {
          const next = { ...s.records }
          delete next[caseId]
          return { records: next }
        }),
    }),
    {
      name: 'bmc-mii.cases',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as { records?: Record<string, { actions?: unknown[] }> }
        if (version < 1 && state.records) {
          for (const [caseId, r] of Object.entries(state.records)) {
            r.actions = (r.actions ?? []).map((a) => ('history' in (a as object) ? a : migrateLegacyAction(caseId, a as LegacyAction)))
          }
        }
        return state as unknown as CaseState
      },
    },
  ),
)

export function useCaseRecord(caseId: string): CaseRecord {
  return useCaseStore((s) => s.records[caseId]) ?? empty()
}
