import type { ActionType, ResourceType } from '@/security/model'

/**
 * Reusable workflow state machines.
 *
 * Dashboards must lead to workflows, workflows to accountable actions and
 * actions to measurable outcomes. Every status change in the platform is a
 * declared transition here - never an ad-hoc field assignment in a component.
 */

export interface Transition<S extends string> {
  from: S
  to: S
  /** Verb rendered on the action control. */
  label: string
  /** Permission required to perform the transition. */
  requires: { resource: ResourceType; action: ActionType }
  /** Institutional description of what the transition means. */
  description: string
  /** Transitions that materially change accountability need a reason. */
  requiresReason?: boolean
  /** Visual intent for the control. */
  intent?: 'primary' | 'neutral' | 'caution' | 'critical' | 'positive'
}

export interface StateMachine<S extends string> {
  id: string
  name: string
  /** Ordered lifecycle used to render progress rails. */
  order: S[]
  labels: Record<S, string>
  transitions: Transition<S>[]
  /** Terminal states - no further transitions are offered. */
  terminal: S[]
}

export function nextTransitions<S extends string>(machine: StateMachine<S>, current: S): Transition<S>[] {
  return machine.transitions.filter((t) => t.from === current)
}

export function canTransition<S extends string>(machine: StateMachine<S>, from: S, to: S): boolean {
  return machine.transitions.some((t) => t.from === from && t.to === to)
}

export function stageIndex<S extends string>(machine: StateMachine<S>, current: S): number {
  const idx = machine.order.indexOf(current)
  return idx === -1 ? 0 : idx
}

export function progressPct<S extends string>(machine: StateMachine<S>, current: S): number {
  if (machine.order.length <= 1) return 100
  return Math.round((stageIndex(machine, current) / (machine.order.length - 1)) * 100)
}

/** Find the transition definition connecting two states, if declared. */
export function findTransition<S extends string>(
  machine: StateMachine<S>,
  from: S,
  to: S,
): Transition<S> | undefined {
  return machine.transitions.find((t) => t.from === from && t.to === to)
}
