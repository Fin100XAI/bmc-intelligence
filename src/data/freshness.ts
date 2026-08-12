import type { DataFreshness, DataOrigin, OperationalState } from '@/types/common'
import { det, isoFromAnchor } from '@/utils/deterministic'

/**
 * Freshness envelopes. Every intelligence surface states when it was
 * generated, how old the underlying observation is and whether it is stale -
 * so that old information is never presented as if it were current.
 */
export function buildFreshness(
  seed: string,
  options: {
    refreshIntervalMinutes: number
    origin?: DataOrigin
    sourceState?: OperationalState
    /** Force a specific observation age, in minutes. */
    observedMinutesAgo?: number
  },
): DataFreshness {
  const r = det(`freshness:${seed}`)
  const { refreshIntervalMinutes, origin = 'demonstration', sourceState = 'simulation' } = options
  const observedMinutesAgo =
    options.observedMinutesAgo ?? r.int(2, Math.max(6, Math.round(refreshIntervalMinutes * 1.6)))
  const generatedMinutesAgo = Math.max(1, Math.round(observedMinutesAgo * r.float(0.15, 0.6)))

  return {
    generatedAt: isoFromAnchor(-generatedMinutesAgo),
    sourceObservedAt: isoFromAnchor(-observedMinutesAgo),
    refreshIntervalMinutes,
    origin,
    sourceState,
    stale: observedMinutesAgo > refreshIntervalMinutes,
  }
}

/** Freshness for values produced by a scenario run rather than observation. */
export function simulationFreshness(seed: string): DataFreshness {
  return {
    generatedAt: isoFromAnchor(0),
    sourceObservedAt: isoFromAnchor(-15),
    refreshIntervalMinutes: 60,
    origin: 'simulated-scenario',
    sourceState: 'simulation',
    stale: false,
    ...(seed ? {} : {}),
  }
}

/** Standard refresh cadences by domain, in minutes. */
export const REFRESH_CADENCE = {
  realtime: 5,
  operational: 30,
  daily: 24 * 60,
  weekly: 7 * 24 * 60,
  monthly: 30 * 24 * 60,
} as const
