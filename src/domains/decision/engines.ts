import type { EvidenceRecord } from '@/domains/evidence/model'
import { VERIFICATION_RANK } from '@/domains/evidence/model'
import { headlineMoney, type PublicProject } from '@/domains/public-money/model'

/**
 * src/domains/decision/engines.ts
 *
 * The decision engines - see `docs/architecture/08-decision-intelligence.md` §5.
 * Deterministic and documented: no language model ranks or decides anything,
 * and every output carries the reasons it was produced from.
 */

export const ENGINE_VERSION = 'decision-engines/1.0.0'

/* ------------------------------------------------------------------------ */
/* Geometry and time                                                        */
/* ------------------------------------------------------------------------ */

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

function day(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 86_400_000)
}

/** Overlap of two implementation windows in days, or null where either is unknown. */
export function windowOverlapDays(a: PublicProject, b: PublicProject): number | null {
  if (!a.window || !b.window) return null
  const start = Math.max(day(a.window.start), day(b.window.start))
  const end = Math.min(day(a.window.end), day(b.window.end))
  return Math.max(0, end - start)
}

/* ------------------------------------------------------------------------ */
/* Coordination engine (spec §66-67)                                        */
/* ------------------------------------------------------------------------ */

/** Sectors whose works open the ground - the build, dig, rebuild cycle. */
const EXCAVATING = new Set(['water', 'sewerage', 'drainage', 'roads', 'flood'])

/** Buffer within which two located works are treated as sharing ground. */
export const COORDINATION_BUFFER_KM = 0.8

export type CoordinationReason =
  | { kind: 'shared-corridor'; name: string }
  | { kind: 'shared-locality'; name: string }
  | { kind: 'buffer-overlap'; km: number }
  | { kind: 'timeline-overlap'; days: number }
  | { kind: 'timeline-unknown' }
  | { kind: 'both-excavate' }
  | { kind: 'different-agencies' }

export interface CoordinationSignal {
  id: string
  a: PublicProject
  b: PublicProject
  reasons: CoordinationReason[]
  /** 0-1: how much of the case for coordination rests on evidence rather than inference. */
  strength: number
}

/**
 * Pairs of works that share ground and whose implementation windows overlap.
 *
 * A pair qualifies only when it shares a named corridor or locality, or both
 * are located within the buffer distance - AND the windows overlap, or a
 * window is unknown (in which case the signal says so and is weaker). The
 * output is a request for interdepartmental verification of the execution
 * sequence; no rework or financial loss is asserted.
 */
export function detectCoordination(all: PublicProject[]): CoordinationSignal[] {
  const projects = all.filter((p) => p.phase !== 'completed')
  const signals: CoordinationSignal[] = []
  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const a = projects[i] as PublicProject
      const b = projects[j] as PublicProject
      const reasons: CoordinationReason[] = []

      const corridors = a.location.corridors.filter((c) => b.location.corridors.includes(c))
      for (const name of corridors) reasons.push({ kind: 'shared-corridor', name })
      const localities = a.location.localities.filter((l) => b.location.localities.includes(l))
      for (const name of localities) reasons.push({ kind: 'shared-locality', name })
      if (a.location.point && b.location.point) {
        const km = distanceKm(a.location.point, b.location.point)
        if (km <= COORDINATION_BUFFER_KM && corridors.length === 0 && localities.length === 0) {
          reasons.push({ kind: 'buffer-overlap', km: Math.round(km * 10) / 10 })
        }
      }
      if (reasons.length === 0) continue

      const overlap = windowOverlapDays(a, b)
      if (overlap === 0) continue
      reasons.push(overlap === null ? { kind: 'timeline-unknown' } : { kind: 'timeline-overlap', days: overlap })
      if (EXCAVATING.has(a.sector) && EXCAVATING.has(b.sector)) reasons.push({ kind: 'both-excavate' })
      if (a.agency !== b.agency) reasons.push({ kind: 'different-agencies' })

      const spatial = corridors.length > 0 ? 1 : localities.length > 0 ? 0.8 : 0.55
      const temporal = overlap === null ? 0.4 : 1
      const dig = EXCAVATING.has(a.sector) && EXCAVATING.has(b.sector) ? 1 : 0.6
      signals.push({ id: `coord:${a.id}:${b.id}`, a, b, reasons, strength: Math.round(spatial * temporal * dig * 100) / 100 })
    }
  }
  return signals.sort((x, y) => y.strength - x.strength)
}

/* ------------------------------------------------------------------------ */
/* Priority model (spec §87-88, §115-116)                                   */
/* ------------------------------------------------------------------------ */

export type PriorityFactor = 'financial' | 'deadline' | 'critical' | 'dependency' | 'service' | 'evidence'

/**
 * Default weights, in percent, summing to 100. Documented and configurable:
 * an authorised user can change them in the Decision Room and every ranking
 * is recomputed from the stored factor values, never re-asked of a model.
 */
export const DEFAULT_WEIGHTS: Record<PriorityFactor, number> = {
  financial: 22,
  deadline: 18,
  critical: 20,
  dependency: 17,
  service: 13,
  evidence: 10,
}

export type FactorValues = Record<PriorityFactor, number>

export interface PriorityResult {
  /** 0-100. */
  score: number
  /** Each factor's contribution in points, summing to `score`. */
  contributions: Record<PriorityFactor, number>
  /** Kept separate from priority (spec §115). */
  confidence: 'high' | 'medium' | 'low'
  impact: 'high' | 'medium' | 'low'
  urgency: 'high' | 'medium' | 'low'
}

/** Financial materiality on a log scale: ₹1 cr ≈ 0.1, ₹10 cr ≈ 0.35, ₹100 cr ≈ 0.67, ₹1,000 cr = 1. */
export function materiality(crore: number | null): number {
  if (crore === null || crore <= 0) return 0.05
  return Math.min(1, Math.log10(crore + 1) / 3)
}

/** Deadline proximity from days remaining; overdue and unknown are both stated, not guessed. */
export function deadlineFactor(daysToMilestone: number | null): number {
  if (daysToMilestone === null) return 0.1
  if (daysToMilestone < 0) return 0.6
  if (daysToMilestone <= 30) return 1
  if (daysToMilestone <= 60) return 0.75
  if (daysToMilestone <= 90) return 0.5
  return 0.2
}

export function evidenceFactor(evidence: EvidenceRecord[]): number {
  if (evidence.length === 0) return 0
  return evidence.reduce((s, e) => s + VERIFICATION_RANK[e.state], 0) / (evidence.length * 3)
}

export function scorePriority(values: FactorValues, weights: Record<PriorityFactor, number> = DEFAULT_WEIGHTS): PriorityResult {
  const total = Object.values(weights).reduce((s, w) => s + w, 0) || 1
  const contributions = {} as Record<PriorityFactor, number>
  let score = 0
  for (const factor of Object.keys(weights) as PriorityFactor[]) {
    const points = (weights[factor] / total) * 100 * Math.max(0, Math.min(1, values[factor]))
    contributions[factor] = Math.round(points * 10) / 10
    score += points
  }
  const band = (v: number): 'high' | 'medium' | 'low' => (v >= 0.66 ? 'high' : v >= 0.33 ? 'medium' : 'low')
  return {
    score: Math.round(score),
    contributions,
    confidence: band(values.evidence),
    impact: band(Math.max(values.financial, values.critical, values.service)),
    urgency: band(values.deadline),
  }
}

/* ------------------------------------------------------------------------ */
/* Alert tiers (spec §124)                                                  */
/* ------------------------------------------------------------------------ */

export type AlertTier = 'INFORMATION' | 'WATCH' | 'REVIEW' | 'PRIORITY' | 'CRITICAL'

/**
 * Tier from priority, materiality and actionability - not from confidence.
 * CRITICAL needs critical infrastructure or a deadline inside 7 days on top
 * of a high score; a duplicate of an open case drops to INFORMATION.
 */
export function alertTier(
  priority: PriorityResult,
  opts: { criticalInfrastructure: boolean; daysToDeadline: number | null; actionable: boolean; duplicate: boolean },
): AlertTier {
  if (opts.duplicate) return 'INFORMATION'
  const urgent = opts.daysToDeadline !== null && opts.daysToDeadline >= 0 && opts.daysToDeadline <= 7
  if (priority.score >= 70 && opts.actionable && (opts.criticalInfrastructure || urgent)) return 'CRITICAL'
  if (priority.score >= 52 && opts.actionable) return 'PRIORITY'
  if (priority.score >= 38) return 'REVIEW'
  if (priority.score >= 22) return 'WATCH'
  return 'INFORMATION'
}

/* ------------------------------------------------------------------------ */
/* Milestones and freshness (spec §80-81)                                   */
/* ------------------------------------------------------------------------ */

export type MilestoneWindow = 'next-30' | 'next-60' | 'next-90' | 'later' | 'passed-unconfirmed' | 'no-date'

export function milestoneDate(p: PublicProject): string | null {
  return p.revisedCompletion?.date ?? p.scheduledCompletion?.date ?? null
}

export function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000)
}

/**
 * Where a project's next milestone falls. A date that has passed is
 * "passed - completion unconfirmed", never "overdue": public sources lag, and
 * only a source saying the work is late makes it late.
 */
export function milestoneWindow(p: PublicProject, now: Date): MilestoneWindow {
  const d = daysUntil(milestoneDate(p), now)
  if (d === null) return 'no-date'
  if (d < 0) return 'passed-unconfirmed'
  if (d <= 30) return 'next-30'
  if (d <= 60) return 'next-60'
  if (d <= 90) return 'next-90'
  return 'later'
}

/** Expected interval between public status updates for a live works project. */
export const STATUS_REFRESH_DAYS = 120

/** Status age in days, or null where no status has been published. */
export function statusAgeDays(p: PublicProject, now: Date): number | null {
  if (!p.status) return null
  return Math.floor((now.getTime() - new Date(p.status.asOf).getTime()) / 86_400_000)
}

/** A status older than the expected update interval is stale - not "delayed". */
export function isStatusStale(p: PublicProject, now: Date): boolean {
  const age = statusAgeDays(p, now)
  return age === null || age > STATUS_REFRESH_DAYS
}

/** Headline money in crore, for materiality - the single largest stated fact, never a sum. */
export function projectCrore(p: PublicProject): number | null {
  return headlineMoney(p)?.fact.crore ?? null
}
