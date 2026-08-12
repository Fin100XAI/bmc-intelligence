import type { IsoDateTime, OperationalState, SeriesPoint, Trend } from '@/types/common'
import { WARDS, WARD_BY_ID, wardName, wardShortName } from '@/data/reference'
import { stateFrom } from '@/data/city.data'
import { DEMO_NOW, det, isoDaysFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/domains/wards/trajectory.ts
 *
 * Ward trajectory and early warning.
 *
 * Every other ward surface in this platform is a snapshot. A snapshot can only
 * ever tell an officer where a ward already is, and level is not the same thing
 * as direction: a ward sitting at 72 and falling four points a month needs
 * attention before a ward that has sat at 65 for a year without moving. Rank by
 * level alone and the corporation reliably arrives after the deterioration
 * rather than before it, because by the time a ward is worst on the list the
 * damage that put it there is already done.
 *
 * This module is DERIVED, exactly as `./profile.ts` is derived. It registers no
 * layer, exports no seed array and holds no state of its own. It reads `WARDS`
 * and reconstructs how each ward arrived at the figure it currently carries.
 *
 * THE CURRENT MONTH IS NOT MODELLED. The final point of every series is the
 * ward's live `healthScore` from `@/data/reference`, unmodified and unrounded
 * by anything here. Earlier months are back-cast from it. Were the newest point
 * allowed to drift by even a tenth of a point, this page and Ward Intelligence
 * would quietly disagree about the same ward on the same morning, and an
 * officer who noticed would be right to distrust both.
 *
 * WHAT THE PROJECTION IS. A straight-line extrapolation of recent movement.
 * It is not a forecast. It carries no model of monsoon seasonality, no
 * knowledge of works already sanctioned and no allowance for anything the
 * corporation is about to do. It assumes nothing changes - which is precisely
 * the assumption an intervention exists to break. Its purpose is to put an
 * approximate date on a deterioration so that the decision to act can be taken
 * against a horizon rather than against a feeling.
 */

/* ==========================================================================
   Stated parameters - every one of these is surfaced on the page
   ========================================================================== */

/** Months of history reconstructed behind the current figure. */
export const OBSERVATION_MONTHS = 6

/**
 * The health score at which a ward is treated as requiring intervention rather
 * than monitoring. 55 sits inside the `at-risk` band of `stateFrom` (45-61) -
 * deliberately above the `critical` boundary, because a threshold that only
 * trips once a ward is already critical is not an early warning.
 */
export const INTERVENTION_THRESHOLD = 55

/**
 * The dead band, in points of health score per month, inside which a fitted
 * slope is reported as `steady` rather than as movement.
 *
 * Chosen against the noise this module itself introduces. Back-cast months
 * carry an independent uniform disturbance of +/-0.8 points, which over a
 * six-point least-squares fit produces a standard error on the slope of about
 * 0.11 points per month. A band of 0.6 therefore sits roughly five standard
 * errors clear of pure noise: a ward reported as moving is moving.
 *
 * It also holds the two ward surfaces consistent. The data layer marks a ward's
 * 30-day trend `flat` whenever its change is within +/-0.4%, and 0.4% of the
 * highest health score any ward carries (94) is 0.38 points - comfortably
 * inside this band. A ward described as flat on Ward Intelligence can therefore
 * never be described as moving here.
 *
 * The converse is intended rather than accidental. A ward carrying a slight
 * 30-day movement may still be reported steady on this page, because a few
 * tenths of a point a month is not a trend and treating it as one would fill
 * the early-warning list with wards that need nothing - which is how an early
 * warning stops being read.
 */
export const STEADY_BAND_PER_MONTH = 0.6

/** The horizon the "projected to cross" count is taken over. */
export const PROJECTION_HORIZON_MONTHS = 6

/** Beyond this the extrapolation is too long to be worth stating as a date. */
export const MAX_PROJECTION_MONTHS = 36

/** Amplitude of the back-cast disturbance, in points of health score. */
const BACKCAST_NOISE_POINTS = 0.8

/**
 * The range a reconstructed month is permitted to occupy. A health index has
 * no meaning outside it, so a back-cast that would leave it is describing a
 * history that could not have happened.
 */
const SCORE_FLOOR = 18
const SCORE_CEILING = 99

/* ==========================================================================
   Types
   ========================================================================== */

export type TrajectoryDirection = 'improving' | 'steady' | 'deteriorating'

function build$TRAJECTORY_DIRECTION_LABEL(): Record<TrajectoryDirection, string> {
  return {
  improving: t('Improving'),
  steady: t('Steady'),
  deteriorating: t('Deteriorating'),
}
}
export let TRAJECTORY_DIRECTION_LABEL: Record<TrajectoryDirection, string> = build$TRAJECTORY_DIRECTION_LABEL()
registerLayer(() => {
  TRAJECTORY_DIRECTION_LABEL = build$TRAJECTORY_DIRECTION_LABEL()
})

export interface TrajectoryPoint {
  /** Short axis label, e.g. "Feb 26". */
  month: string
  /** Sortable calendar key, e.g. "2026-02" - also the deterministic seed. */
  monthKey: string
  observedAt: IsoDateTime
  score: number
  /** True for extrapolated months, false for reconstructed observation. */
  projected: boolean
}

export interface WardTrajectory {
  wardId: string
  wardName: string
  wardShortName: string
  wardCode: string
  region: string
  /** The ward's live figure. The last observed point equals this exactly. */
  currentScore: number
  riskScore: number
  state: OperationalState
  /** The ward's own 30-day trend, carried so both surfaces can be compared. */
  liveTrend: Trend
  series: TrajectoryPoint[]
  /** Points of health score per month. Negative is deterioration. */
  slopePerMonth: number
  /** Last observed month minus first observed month, in points. */
  changeOverWindow: number
  direction: TrajectoryDirection
  /** Months until the fitted slope carries the ward below the threshold. */
  monthsToThreshold: number | null
  /** Calendar month of the projected crossing, where one is within horizon. */
  crossingMonth: string | null
  /** True where the ward is already at or below the intervention threshold. */
  alreadyBelowThreshold: boolean
  /** 1 is the fastest-falling ward in the cohort. */
  deteriorationRank: number
}

export interface WardTrajectoryBoard {
  generatedAt: IsoDateTime
  /** Ordered observation month labels, shared by every ward on the board. */
  months: string[]
  interventionThreshold: number
  steadyBandPerMonth: number
  observationMonths: number
  projectionHorizonMonths: number
  wards: WardTrajectory[]
  summary: {
    wardsAssessed: number
    deteriorating: number
    steady: number
    improving: number
    crossingWithinHorizon: number
    alreadyBelowThreshold: number
    fastestFalling: WardTrajectory | null
    /** Mean slope across the cohort, in points per month. */
    meanSlopePerMonth: number
  }
}

/* ==========================================================================
   Calendar - resolved from the demonstration anchor, never the wall clock
   ========================================================================== */

const MONTH_ABBREVIATION = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/**
 * Resolves a calendar month at an offset from the demonstration anchor.
 *
 * Month arithmetic is done on an absolute month index rather than by
 * constructing dates, so no `new Date` is involved and the result cannot drift
 * with the machine's clock or timezone. UTC accessors are read off the frozen
 * anchor for the same reason.
 */
function monthAt(offsetMonths: number): { key: string; label: string } {
  const index = DEMO_NOW.getUTCFullYear() * 12 + DEMO_NOW.getUTCMonth() + offsetMonths
  const year = Math.floor(index / 12)
  const month = index - year * 12
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: `${MONTH_ABBREVIATION[month]} ${String(year).slice(2)}`,
  }
}

/** The observation window's month labels, oldest first. */
export function trajectoryMonths(): string[] {
  return Array.from({ length: OBSERVATION_MONTHS }, (_, i) => monthAt(i - (OBSERVATION_MONTHS - 1)).label)
}

/* ==========================================================================
   Fitting
   ========================================================================== */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Ordinary least-squares slope of `values` against their index, in units of
 * value per step.
 *
 * LEAST SQUARES, NOT FIRST-TO-LAST. A first-to-last difference divided by the
 * number of months is decided entirely by two observations, either of which may
 * be the noisiest reading in the window - one bad month at either end and a
 * steady ward is reported as falling. The fitted slope uses all six months and
 * is what every figure downstream of it is derived from.
 */
export function leastSquaresSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const meanX = (n - 1) / 2
  const meanY = values.reduce((sum, v) => sum + v, 0) / n
  let covariance = 0
  let variance = 0
  for (let i = 0; i < n; i += 1) {
    covariance += (i - meanX) * (values[i] - meanY)
    variance += (i - meanX) ** 2
  }
  return variance === 0 ? 0 : covariance / variance
}

function directionFrom(slope: number): TrajectoryDirection {
  if (slope > STEADY_BAND_PER_MONTH) return 'improving'
  if (slope < -STEADY_BAND_PER_MONTH) return 'deteriorating'
  return 'steady'
}

/* ==========================================================================
   Back-cast
   ========================================================================== */

/**
 * The monthly movement implied by the ward's own published trend.
 *
 * `healthTrend.changePct` is a percentage change against the previous thirty
 * days and `polarity` is `positive` for ward health, meaning a rising score is
 * the favourable direction - so the sign of the movement in points is the sign
 * of `changePct` itself. Where a ward's polarity were ever inverted the
 * favourable direction flips with it, which is why the polarity is read here
 * rather than assumed.
 */
function impliedMonthlyDrift(current: number, trend: Trend): number {
  const favourableIsUp = trend.polarity !== 'negative'
  const factor = 1 + trend.changePct / 100
  // The seeded range of `changePct` is +/-6.5, so the divisor cannot approach
  // zero; the guard is here so a future widening of that range degrades to a
  // flat back-cast rather than to an infinity.
  if (Math.abs(factor) < 0.5) return 0
  const previousMonth = current / factor
  const drift = current - previousMonth
  return boundDrift(current, favourableIsUp ? drift : -drift)
}

/**
 * Bounds the drift so the reconstruction cannot leave the index range.
 *
 * A ward now at 82 whose published rate is -6% a month would, sustained across
 * the whole window, have stood at 107 in February. Nothing was ever at 107.
 * Clipping the offending months at the ceiling instead would leave a flat top
 * on the series and quietly shallow the fitted slope, so the bound is applied
 * to the RATE rather than to the points: the steepest history the range admits
 * is used, and every month then lands inside the range by construction.
 *
 * The ward's current figure and the DIRECTION of its movement are untouched -
 * only the depth of the reconstructed history is reduced. That the direction
 * survives is a property of the numbers rather than a hope: the tightest bound
 * this can produce is at the extremes of the seeded health range (38 to 94),
 * where it still permits 0.84 and 3.84 points per month respectively, both
 * clear of the steady band. A ward the register calls moving is never bounded
 * into standing still.
 */
function boundDrift(current: number, drift: number): number {
  const span = OBSERVATION_MONTHS - 1
  // Walking back, an improving ward's oldest month is its lowest and a
  // deteriorating ward's oldest month is its highest.
  const headroom =
    drift >= 0
      ? (current - (SCORE_FLOOR + BACKCAST_NOISE_POINTS)) / span
      : (SCORE_CEILING - BACKCAST_NOISE_POINTS - current) / span
  const cap = Math.max(0, headroom)
  return drift >= 0 ? Math.min(drift, cap) : Math.max(drift, -cap)
}

/**
 * Reconstructs a ward's health score over the observation window.
 *
 * The window is walked backwards from the ward's live figure: each month
 * earlier is one month of the implied drift removed, plus an independent
 * disturbance so the reconstruction reads as an operational record rather than
 * as a ruled line.
 *
 * The disturbance is drawn from `det('wardtraj:<wardId>:<monthKey>')` - one
 * generator per ward per calendar month. `Deterministic.series` would produce a
 * smoother walk from a single ward-level generator, but every month's value
 * would then depend on the length of the window: extend the history to nine
 * months and all six months an officer had already seen would silently change.
 * A per-month seed makes each reconstructed month reproducible on its own
 * terms, which is the property that matters for a figure anyone may quote.
 *
 * The current month is exempt from all of it and carries the ward's live score
 * exactly.
 */
function backcastSeries(wardId: string, current: number, drift: number): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = []
  for (let back = OBSERVATION_MONTHS - 1; back >= 0; back -= 1) {
    const { key, label } = monthAt(-back)
    const isCurrentMonth = back === 0
    const noise = isCurrentMonth
      ? 0
      : det(`wardtraj:${wardId}:${key}`).round(-BACKCAST_NOISE_POINTS, BACKCAST_NOISE_POINTS, 1)
    points.push({
      month: label,
      monthKey: key,
      // Thirty-day steps off the frozen anchor - never the wall clock.
      observedAt: isoDaysFromAnchor(-back * 30),
      // The clamp is a guard, not a mechanism: `boundDrift` has already made it
      // arithmetically impossible for a reconstructed month to reach either
      // bound, so it never fires and never flattens the head of a series.
      score: isCurrentMonth ? current : round1(clamp(current - drift * back + noise, SCORE_FLOOR, SCORE_CEILING)),
      projected: false,
    })
  }
  return points
}

/* ==========================================================================
   Public API
   ========================================================================== */

/**
 * Builds one ward's trajectory. `deteriorationRank` is left at 0 here because a
 * rank is a statement about a cohort and cannot be made about a ward on its
 * own; `buildWardTrajectoryBoard` assigns it.
 */
export function buildWardTrajectory(wardId: string): WardTrajectory | null {
  const ward = WARD_BY_ID.get(wardId)
  if (!ward) return null

  const current = ward.healthScore
  const drift = impliedMonthlyDrift(current, ward.healthTrend)
  const series = backcastSeries(ward.id, current, drift)
  const scores = series.map((p) => p.score)

  const slope = round1(leastSquaresSlope(scores))
  const direction = directionFrom(slope)
  const alreadyBelowThreshold = current <= INTERVENTION_THRESHOLD

  // A crossing is only projected where the ward is both above the threshold and
  // falling faster than the steady band. An improving or steady ward has no
  // date to state, and a ward already below the threshold does not need a
  // projection to tell the corporation it has a problem.
  const monthsToThreshold =
    direction === 'deteriorating' && !alreadyBelowThreshold
      ? round1((current - INTERVENTION_THRESHOLD) / -slope)
      : null

  const crossingMonth =
    monthsToThreshold !== null && monthsToThreshold <= MAX_PROJECTION_MONTHS
      ? monthAt(Math.ceil(monthsToThreshold)).label
      : null

  return {
    wardId: ward.id,
    wardName: wardName(ward.id),
    wardShortName: wardShortName(ward.id),
    wardCode: ward.code,
    region: ward.region,
    currentScore: current,
    riskScore: ward.riskScore,
    state: stateFrom(current),
    liveTrend: ward.healthTrend,
    series,
    slopePerMonth: slope,
    changeOverWindow: round1(scores[scores.length - 1] - scores[0]),
    direction,
    monthsToThreshold,
    crossingMonth,
    alreadyBelowThreshold,
    deteriorationRank: 0,
  }
}

/**
 * Extends a trajectory forward along its fitted slope.
 *
 * Every point returned is marked `simulated` so the chart tooltip states it as
 * such. This is arithmetic on a straight line, not a forecast.
 */
export function projectTrajectory(trajectory: WardTrajectory, months = PROJECTION_HORIZON_MONTHS): SeriesPoint[] {
  const observed: SeriesPoint[] = trajectory.series.map((p) => ({ label: p.month, value: p.score }))
  const projected: SeriesPoint[] = Array.from({ length: months }, (_, i) => {
    const step = i + 1
    return {
      label: monthAt(step).label,
      value: round1(clamp(trajectory.currentScore + trajectory.slopePerMonth * step, SCORE_FLOOR, SCORE_CEILING)),
      simulated: true,
    }
  })
  return [...observed, ...projected]
}

/**
 * Builds the cohort board.
 *
 * `wardIds` is optional so the module stays usable on its own; the service
 * passes the caller's authorised wards, and every rank and count below is
 * therefore computed over what that principal may actually see rather than over
 * a cohort they are then shown a position within.
 */
export function buildWardTrajectoryBoard(wardIds?: string[]): WardTrajectoryBoard {
  const source = wardIds ? wardIds : WARDS.map((w) => w.id)

  const trajectories = source
    .map((id) => buildWardTrajectory(id))
    .filter((wardTrajectory): wardTrajectory is WardTrajectory => wardTrajectory !== null)

  // Deterioration rank: most negative slope first. Ties are broken on the
  // current score so the lower ward ranks ahead, then on ward id so the order
  // is total and stable across renders.
  const ranked = [...trajectories].sort(
    (a, b) =>
      a.slopePerMonth - b.slopePerMonth ||
      a.currentScore - b.currentScore ||
      a.wardId.localeCompare(b.wardId),
  )
  ranked.forEach((wardTrajectory, i) => {
    wardTrajectory.deteriorationRank = i + 1
  })

  const deteriorating = ranked.filter((wardTrajectory) => wardTrajectory.direction === 'deteriorating')
  const fastestFalling = deteriorating[0] ?? null

  return {
    generatedAt: isoDaysFromAnchor(0),
    months: trajectoryMonths(),
    interventionThreshold: INTERVENTION_THRESHOLD,
    steadyBandPerMonth: STEADY_BAND_PER_MONTH,
    observationMonths: OBSERVATION_MONTHS,
    projectionHorizonMonths: PROJECTION_HORIZON_MONTHS,
    wards: ranked,
    summary: {
      wardsAssessed: ranked.length,
      deteriorating: deteriorating.length,
      steady: ranked.filter((wardTrajectory) => wardTrajectory.direction === 'steady').length,
      improving: ranked.filter((wardTrajectory) => wardTrajectory.direction === 'improving').length,
      crossingWithinHorizon: ranked.filter(
        (wardTrajectory) => wardTrajectory.monthsToThreshold !== null && wardTrajectory.monthsToThreshold <= PROJECTION_HORIZON_MONTHS,
      ).length,
      alreadyBelowThreshold: ranked.filter((wardTrajectory) => wardTrajectory.alreadyBelowThreshold).length,
      fastestFalling,
      meanSlopePerMonth:
        ranked.length > 0 ? round1(ranked.reduce((s, wardTrajectory) => s + wardTrajectory.slopePerMonth, 0) / ranked.length) : 0,
    },
  }
}
