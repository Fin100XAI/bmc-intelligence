import { describe, expect, it } from 'vitest'
import type { PublicProject } from '@/domains/public-money/model'
import {
  DEFAULT_WEIGHTS,
  alertTier,
  deadlineFactor,
  detectCoordination,
  isStatusStale,
  materiality,
  milestoneWindow,
  scorePriority,
} from './engines'
import { actionYield } from './case'

const NOW = new Date('2026-10-02T00:00:00Z')

function project(id: string, over: Partial<PublicProject> = {}): PublicProject {
  return {
    id,
    name: id,
    sector: 'water',
    scheme: 'AMRUT 2.0',
    agency: 'PHMED',
    money: { projectCost: { crore: 50, evidenceId: 'ev' } },
    status: { text: 'In progress', asOf: '2026-09-01', evidenceId: 'ev' },
    window: { start: '2026-01-01', end: '2027-06-30', basis: 'published' },
    location: { level: 'CORRIDOR', description: 'Trunk Road', corridors: ['Trunk Road'], localities: [] },
    departments: ['Engineering'],
    critical: false,
    evidenceIds: ['ev'],
    lastVerified: '2026-10-02',
    ...over,
  }
}

describe('coordination engine', () => {
  it('flags two excavating works on the same corridor with overlapping windows', () => {
    const a = project('water-main')
    const b = project('sewer', { sector: 'sewerage', agency: 'L&T for PHMED' })
    const [signal] = detectCoordination([a, b])
    expect(signal).toBeDefined()
    expect(signal?.reasons.map((r) => r.kind)).toEqual(
      expect.arrayContaining(['shared-corridor', 'timeline-overlap', 'both-excavate', 'different-agencies']),
    )
  })

  it('stays silent when the windows do not overlap', () => {
    const a = project('a', { window: { start: '2025-01-01', end: '2025-06-30', basis: 'published' } })
    const b = project('b', { window: { start: '2026-01-01', end: '2026-06-30', basis: 'published' } })
    expect(detectCoordination([a, b])).toHaveLength(0)
  })

  it('stays silent when the works share no ground', () => {
    const a = project('a')
    const b = project('b', { location: { level: 'LOCALITY', description: 'Allipuram', corridors: [], localities: ['Allipuram'] } })
    expect(detectCoordination([a, b])).toHaveLength(0)
  })

  it('raises a weaker signal when a window is unknown, and says so', () => {
    const a = project('a')
    const b = project('b', { window: undefined })
    const [signal] = detectCoordination([a, b])
    expect(signal?.reasons.some((r) => r.kind === 'timeline-unknown')).toBe(true)
    expect(signal?.strength).toBeLessThan(1)
  })
})

describe('priority model', () => {
  it('contributions sum to the score and confidence is independent of priority', () => {
    const high = scorePriority({ financial: 1, deadline: 1, critical: 1, dependency: 1, service: 1, evidence: 0.1 })
    const sum = Object.values(high.contributions).reduce((s, v) => s + v, 0)
    expect(Math.abs(sum - high.score)).toBeLessThanOrEqual(1)
    expect(high.confidence).toBe('low')
    expect(high.score).toBeGreaterThan(85)
  })

  it('default weights sum to 100', () => {
    expect(Object.values(DEFAULT_WEIGHTS).reduce((s, v) => s + v, 0)).toBe(100)
  })

  it('a ₹50 crore work is more material than a ₹50 lakh one, but not unboundedly', () => {
    expect(materiality(50)).toBeGreaterThan(materiality(0.5))
    expect(materiality(100_000)).toBe(1)
  })

  it('deadline factor treats unknown as low, never as urgent', () => {
    expect(deadlineFactor(null)).toBeLessThan(deadlineFactor(20))
  })
})

describe('alert tiers', () => {
  it('a duplicate is only information, however high its score', () => {
    const p = scorePriority({ financial: 1, deadline: 1, critical: 1, dependency: 1, service: 1, evidence: 1 })
    expect(alertTier(p, { criticalInfrastructure: true, daysToDeadline: 2, actionable: true, duplicate: true })).toBe('INFORMATION')
    expect(alertTier(p, { criticalInfrastructure: true, daysToDeadline: 2, actionable: true, duplicate: false })).toBe('CRITICAL')
  })
})

describe('milestones and freshness', () => {
  it('a passed date is unconfirmed, never overdue', () => {
    expect(milestoneWindow(project('a', { scheduledCompletion: { date: '2026-09-01', evidenceId: 'ev' } }), NOW)).toBe('passed-unconfirmed')
    expect(milestoneWindow(project('a', { scheduledCompletion: { date: '2026-10-20', evidenceId: 'ev' } }), NOW)).toBe('next-30')
  })

  it('an old status is stale; a missing status is stale too', () => {
    expect(isStatusStale(project('a', { status: { text: 'x', asOf: '2025-01-01', evidenceId: 'ev' } }), NOW)).toBe(true)
    expect(isStatusStale(project('a', { status: null }), NOW)).toBe(true)
    expect(isStatusStale(project('a'), NOW)).toBe(false)
  })
})

describe('action yield', () => {
  it('counts achieved fully and partly-achieved as half, over measured cases only', () => {
    const at = '2026-10-02'
    const r = actionYield([
      { actions: [], feedback: [], outcome: { recordedAt: at, recordedBy: 'x', result: 'achieved', note: '' } },
      { actions: [], feedback: [], outcome: { recordedAt: at, recordedBy: 'x', result: 'partly-achieved', note: '' } },
      { actions: [], feedback: [] },
    ])
    expect(r).toEqual({ measured: 2, yieldPct: 75 })
  })
})
