import { describe, expect, it } from 'vitest'
import { canTransition, findTransition, nextTransitions, progressPct, stageIndex } from './engine'
import { alertWorkflow } from './machines'

/**
 * The workflow engine is the one gate every status change in the platform
 * passes through (`alert.service.ts` and every sibling `*.service.ts` call
 * `findTransition` before mutating anything) - a bug here silently lets an
 * illegal transition through, or silently blocks a legal one. Exercised
 * against the real `alertWorkflow` machine rather than a synthetic fixture,
 * so a change to that machine's shape is caught here too.
 */
describe('workflow engine', () => {
  it('finds a declared transition', () => {
    const transition = findTransition(alertWorkflow, 'open', 'acknowledged')
    expect(transition).toBeDefined()
    expect(transition?.label).toBeTruthy()
  })

  it('returns undefined for an undeclared transition', () => {
    // 'resolved' -> 'open' is not a legal move for an alert.
    expect(findTransition(alertWorkflow, 'resolved', 'open')).toBeUndefined()
  })

  it('canTransition agrees with findTransition', () => {
    expect(canTransition(alertWorkflow, 'open', 'acknowledged')).toBe(true)
    expect(canTransition(alertWorkflow, 'closed', 'open')).toBe(false)
  })

  it('lists every transition out of a state, and none from a state with no outgoing edges', () => {
    const fromOpen = nextTransitions(alertWorkflow, 'open')
    expect(fromOpen.length).toBeGreaterThan(0)
    expect(fromOpen.every((t) => t.from === 'open')).toBe(true)

    const fromClosed = nextTransitions(alertWorkflow, 'closed')
    expect(fromClosed).toEqual([])
  })

  it('a transition requiring a reason is marked as such (escalate)', () => {
    const escalate = findTransition(alertWorkflow, 'open', 'escalated')
    expect(escalate?.requiresReason).toBe(true)
  })

  it('stageIndex and progressPct move monotonically along the declared order', () => {
    const first = stageIndex(alertWorkflow, alertWorkflow.order[0]!)
    const last = stageIndex(alertWorkflow, alertWorkflow.order[alertWorkflow.order.length - 1]!)
    expect(first).toBe(0)
    expect(last).toBe(alertWorkflow.order.length - 1)
    expect(progressPct(alertWorkflow, alertWorkflow.order[0]!)).toBe(0)
    expect(progressPct(alertWorkflow, alertWorkflow.order[alertWorkflow.order.length - 1]!)).toBe(100)
  })

  it('every terminal state has no outgoing transitions', () => {
    for (const state of alertWorkflow.terminal) {
      expect(nextTransitions(alertWorkflow, state)).toEqual([])
    }
  })
})
