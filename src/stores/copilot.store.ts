import { create } from 'zustand'
import { onAfterRebuild } from '@/data/runtime'
import type { AIResponse } from '@/types/ai'

/**
 * The Municipal Copilot session.
 *
 * The thread lived in component state until now, which meant an operator who
 * opened a decision case raised from an answer - or simply checked a ward page
 * to corroborate one - returned to an empty surface. That is a governance
 * defect rather than an inconvenience: the session ledger is the only place
 * the platform states what left this page and became a record elsewhere, and
 * an operator who cannot see it has no way to know what they already raised.
 *
 * It is deliberately NOT persisted to `localStorage`. Every figure in a thread
 * is read against the frozen demonstration clock, so a thread restored days
 * later would present a stale reading as a current one. The session survives
 * navigation; it does not survive a reload, and it must not.
 */

export interface CopilotMessage {
  id: string
  question: string
  askedAt: string
  status: 'loading' | 'done' | 'error'
  response?: AIResponse
  errorMessage?: string
  latencyMs?: number
}

/** Per-message record of what was raised from an answer, so it cannot be raised twice. */
export interface MessageActionState {
  decisionRef?: string
  decisionId?: string
  taskRef?: string
  taskId?: string
  escalated?: boolean
  inSituationRoom?: boolean
  saved?: boolean
}

export interface CopilotEscalation {
  id: string
  title: string
  reason: string
  at: string
}

export interface SituationRoomEntry {
  id: string
  title: string
  at: string
}

interface CopilotState {
  messages: CopilotMessage[]
  actionState: Record<string, MessageActionState>
  escalations: CopilotEscalation[]
  situationRoom: SituationRoomEntry[]
  /** The composer's contents, held here so a half-typed question survives navigation. */
  input: string
  /**
   * Message identifiers are allocated here rather than from a component ref.
   * A ref resets on remount while the thread does not, so the counter has to
   * live wherever the messages live - otherwise a returning operator's next
   * question is issued `msg-0` again and React reconciles two distinct turns
   * into one.
   */
  nextMessageId: number

  setInput: (value: string) => void
  takeMessageId: () => string
  appendMessage: (message: CopilotMessage) => void
  patchMessage: (id: string, patch: Partial<CopilotMessage>) => void
  patchActionState: (id: string, patch: Partial<MessageActionState>) => void
  pushEscalation: (entry: CopilotEscalation) => void
  pushSituationRoom: (entry: SituationRoomEntry) => void
  resetSession: () => void
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  messages: [],
  actionState: {},
  escalations: [],
  situationRoom: [],
  input: '',
  nextMessageId: 0,

  setInput: (value) => set({ input: value }),

  takeMessageId: () => {
    const next = get().nextMessageId
    set({ nextMessageId: next + 1 })
    return `msg-${next}`
  },

  appendMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),

  patchMessage: (id, patch) =>
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),

  patchActionState: (id, patch) =>
    set((s) => ({ actionState: { ...s.actionState, [id]: { ...s.actionState[id], ...patch } } })),

  // Newest first: both rails read as a running log of what has just happened.
  pushEscalation: (entry) => set((s) => ({ escalations: [entry, ...s.escalations] })),
  pushSituationRoom: (entry) => set((s) => ({ situationRoom: [entry, ...s.situationRoom] })),

  // The identifier counter resets with the thread it numbers - a new session
  // starts at `msg-0` because nothing from the old thread remains to collide.
  resetSession: () =>
    set({ messages: [], actionState: {}, escalations: [], situationRoom: [], input: '', nextMessageId: 0 }),
}))

/**
 * Every answer in a thread was retrieved from one corporation's records and
 * names that corporation's wards, departments and officers. Carrying it across
 * a switch to another corporation would present Mumbai's position under
 * Nagpur's masthead, which is precisely the misreading this Copilot exists to
 * prevent. The session is therefore cleared the moment the data layers rebuild.
 */
onAfterRebuild(() => {
  useCopilotStore.getState().resetSession()
})
