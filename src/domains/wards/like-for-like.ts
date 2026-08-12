import type { OperationalState } from '@/types/common'
import { WARDS, wardName, wardShortName } from '@/data/reference'
import { settlementsInWard } from '@/data/civic.data'
import { stateFrom } from '@/data/city.data'
import { buildWardProfile } from '@/domains/wards/profile'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/domains/wards/like-for-like.ts
 *
 * Like-for-like ward performance.
 *
 * A raw ward league table is easy to produce and easy to dismiss. The officer
 * holding the densest, most flood-exposed ward in the corporation can always
 * say - and is usually right - that being last on a raw ranking says more about
 * the ward than about the administration of it. Once that objection is made and
 * not answered, the table stops being used.
 *
 * This module answers it by separating two things a single score conflates:
 *
 *   1. HOW HARD THE WARD IS. A difficulty score built only from structural
 *      conditions no ward officer controls - how many people live on each
 *      square kilometre, what share of them live in informal settlements, how
 *      exposed the ward is to flooding, and how crowded its households are.
 *      None of these move because a ward office works well or badly.
 *
 *   2. HOW WELL IT IS BEING RUN. The observed operational health score for the
 *      ward, taken unchanged from `buildWardProfile` so that every figure here
 *      reconciles with what Ward Intelligence shows for the same ward.
 *
 * The bridge between them is an expectation line fitted across the wards: what
 * a ward of that difficulty typically achieves. The residual - observed minus
 * expected - is the part of the score the conditions do not explain, and it is
 * the only part worth discussing with the officer who holds the ward.
 *
 * A positive residual is not a prize and a negative one is not a charge. A ward
 * well above its line is running a practice the rest of the corporation has not
 * copied yet, and it should be asked what it is doing. A ward well below its
 * line is carrying an obstruction that has not been named, and it should be
 * asked what is in the way.
 *
 * THE DIFFICULTY MODEL BELOW IS ILLUSTRATIVE. Its weights are stated openly so
 * a reader can reconstruct every figure by hand, but they are a reasonable
 * prior rather than a finding. A real deployment would fit both the difficulty
 * weighting and the expectation line on the corporation's own historic record,
 * and would revise them each year.
 */

/* ==========================================================================
   1. Difficulty - the conditions an officer inherits
   ========================================================================== */

/**
 * Weights of the four structural conditions, summing to 1.00.
 *
 * Density carries the most because it drives everything downstream at once:
 * collection rounds, drain loading, complaint volume and the physical
 * difficulty of getting a vehicle down a lane. Settlement share follows,
 * because service delivery into an unrecognised settlement is materially
 * harder per resident than into a surveyed layout. Flood exposure is third and
 * is seasonal rather than continuous. Household crowding is last: it
 * compounds the others rather than acting on its own.
 */
export const DIFFICULTY_WEIGHTS = {
  density: 0.3,
  settlementShare: 0.26,
  floodExposure: 0.24,
  householdCrowding: 0.2,
} as const

export type DifficultyComponentId = keyof typeof DIFFICULTY_WEIGHTS

/**
 * Reference bands. Each raw condition is mapped onto 0-100 by linear
 * interpolation between a floor (a ward at the floor scores 0 on that
 * component) and a ceiling (at or above the ceiling it scores 100). The bands
 * are fixed constants rather than the observed minimum and maximum, so a ward's
 * difficulty does not change when a different corporation is loaded or when one
 * outlier ward is added or removed.
 *
 *   Density            5,000 -> 60,000 residents per km²
 *   Settlement share   0% -> 55% of ward population in informal settlements
 *   Waterlogging       0 -> 14 recorded chronic waterlogging locations
 *   Crowding           4.0 -> 5.2 residents per household
 *
 * Flood exposure is the one composite: the flood-prone classification is a
 * standing structural fact and carries 35 of its 100 points, and the count of
 * recorded waterlogging locations - which measures how much of the ward is
 * actually affected - carries the remaining 65.
 */
const DENSITY_FLOOR = 5_000
const DENSITY_CEILING = 60_000
const SETTLEMENT_SHARE_FLOOR = 0
const SETTLEMENT_SHARE_CEILING = 55
const WATERLOGGING_FLOOR = 0
const WATERLOGGING_CEILING = 14
const CROWDING_FLOOR = 4
const CROWDING_CEILING = 5.2
const FLOOD_FLAG_SHARE = 0.35

/** Linear interpolation onto 0-100, clamped at both ends. */
function band(value: number, floor: number, ceiling: number): number {
  if (ceiling <= floor) return 0
  return Math.max(0, Math.min(100, ((value - floor) / (ceiling - floor)) * 100))
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export interface DifficultyComponent {
  id: DifficultyComponentId
  label: string
  /** Share of the difficulty score this condition carries. */
  weight: number
  /** The condition normalised onto 0-100. */
  score: number
  /** `score × weight` - the points this condition puts on the board. */
  contribution: number
  explanation: string
}

function build$DIFFICULTY_COMPONENT_LABEL(): Record<DifficultyComponentId, string> {
  return {
  density: t('Population density'),
  settlementShare: t('Informal settlement share'),
  floodExposure: t('Flood and waterlogging exposure'),
  householdCrowding: t('Household crowding'),
}
}
export let DIFFICULTY_COMPONENT_LABEL: Record<DifficultyComponentId, string> = build$DIFFICULTY_COMPONENT_LABEL()
registerLayer(() => {
  DIFFICULTY_COMPONENT_LABEL = build$DIFFICULTY_COMPONENT_LABEL()
})

/** What each condition stands for, stated once for the method panel. */
export const DIFFICULTY_MODEL_NOTE: Record<DifficultyComponentId, string> = {
  density: `Residents per square kilometre, banded from ${DENSITY_FLOOR.toLocaleString('en-IN')} to ${DENSITY_CEILING.toLocaleString('en-IN')}. It sets how much service has to move down how little road, and no ward office can change it.`,
  settlementShare: `Share of ward residents living in a recorded informal settlement, banded from 0% to ${SETTLEMENT_SHARE_CEILING}%. Delivery into an unsurveyed layout costs more per resident, at any standard of administration.`,
  floodExposure: `The flood-prone classification (${Math.round(FLOOD_FLAG_SHARE * 100)}% of the component) together with recorded chronic waterlogging locations, banded from 0 to ${WATERLOGGING_CEILING}. Topography is inherited, not managed.`,
  householdCrowding: `Residents per household, banded from ${CROWDING_FLOOR.toFixed(1)} to ${CROWDING_CEILING.toFixed(1)}. Crowding multiplies the load on every shared connection and collection point in the ward.`,
}

/* ==========================================================================
   2. Structural readings per ward
   ========================================================================== */

export interface WardStructuralReading {
  wardId: string
  densityPerSqKm: number
  settlementPopulation: number
  settlementSharePct: number
  settlementCount: number
  personsPerHousehold: number
  waterloggingSpots: number
  floodProne: boolean
}

function readStructure(wardId: string): WardStructuralReading | null {
  const ward = WARDS.find((w) => w.id === wardId)
  if (!ward) return null

  const settlements = settlementsInWard(wardId)
  const settlementPopulation = settlements.reduce((sum, s) => sum + s.estimatedPopulation, 0)

  return {
    wardId,
    densityPerSqKm: ward.population / Math.max(ward.areaSqKm, 0.1),
    settlementPopulation,
    // Settlement populations come from the corporation's own settlement survey
    // and the ward figure from the census, and in the most tightly packed wards
    // the two do not reconcile - the survey can total more residents than the
    // census records for the ward. The share is held at 100% so the reading
    // stays interpretable. In a real deployment that gap is itself a finding
    // for the survey team, not something to be quietly averaged away.
    settlementSharePct: Math.min(100, (settlementPopulation / Math.max(ward.population, 1)) * 100),
    settlementCount: settlements.length,
    personsPerHousehold: ward.population / Math.max(ward.households, 1),
    waterloggingSpots: ward.waterloggingSpots,
    floodProne: ward.floodProne,
  }
}

function difficultyComponents(reading: WardStructuralReading): DifficultyComponent[] {
  const densityScore = band(reading.densityPerSqKm, DENSITY_FLOOR, DENSITY_CEILING)
  const settlementScore = band(reading.settlementSharePct, SETTLEMENT_SHARE_FLOOR, SETTLEMENT_SHARE_CEILING)
  const waterloggingScore = band(reading.waterloggingSpots, WATERLOGGING_FLOOR, WATERLOGGING_CEILING)
  const floodScore = FLOOD_FLAG_SHARE * (reading.floodProne ? 100 : 0) + (1 - FLOOD_FLAG_SHARE) * waterloggingScore
  const crowdingScore = band(reading.personsPerHousehold, CROWDING_FLOOR, CROWDING_CEILING)

  const raw: Record<DifficultyComponentId, number> = {
    density: densityScore,
    settlementShare: settlementScore,
    floodExposure: floodScore,
    householdCrowding: crowdingScore,
  }

  const explanations: Record<DifficultyComponentId, string> = {
    density: `${Math.round(reading.densityPerSqKm).toLocaleString('en-IN')} residents per km², placed on a band running from ${DENSITY_FLOOR.toLocaleString('en-IN')} to ${DENSITY_CEILING.toLocaleString('en-IN')}. Density sets how much of every service has to be delivered down how little road.`,
    settlementShare: `${round(reading.settlementSharePct)}% of residents live in one of ${reading.settlementCount} recorded informal settlements, against a band ceiling of ${SETTLEMENT_SHARE_CEILING}%. Delivering water, collection and drainage into an unsurveyed layout costs more per resident and always has.`,
    floodExposure: `${reading.waterloggingSpots} recorded chronic waterlogging locations${reading.floodProne ? t(', in a ward classified as flood-prone') : t(', in a ward not classified as flood-prone')}. The classification carries ${Math.round(FLOOD_FLAG_SHARE * 100)}% of this component and the recorded locations the remainder.`,
    householdCrowding: `${round(reading.personsPerHousehold, 2)} residents per household, against a band of ${CROWDING_FLOOR.toFixed(1)} to ${CROWDING_CEILING.toFixed(1)}. Crowding raises the load on every shared connection, seat and collection point in the ward.`,
  }

  return (Object.keys(DIFFICULTY_WEIGHTS) as DifficultyComponentId[]).map((id) => ({
    id,
    label: DIFFICULTY_COMPONENT_LABEL[id],
    weight: DIFFICULTY_WEIGHTS[id],
    score: round(raw[id]),
    contribution: round(raw[id] * DIFFICULTY_WEIGHTS[id]),
    explanation: explanations[id],
  }))
}

/* ==========================================================================
   3. The expectation line
   ========================================================================== */

export interface ExpectationFit {
  /** Health points gained or lost per point of difficulty. Expected to be negative. */
  slope: number
  /** Fitted score of a hypothetical ward with a difficulty of zero. */
  intercept: number
  /** Share of the variation in observed scores the line accounts for, 0-1. */
  rSquared: number
  /** Standard error of the estimate - the typical size of a residual. */
  residualSd: number
  /** Half a standard error: inside this band a ward is read as on its line. */
  toleranceBand: number
  meanDifficulty: number
  meanObserved: number
  /** How many wards the line was fitted on. */
  fittedOn: number
  /** False where there were too few wards to fit a line at all. */
  fitted: boolean
}

/**
 * Ordinary least squares of observed health score (y) against difficulty (x).
 *
 * This is the plainest fit there is and it is chosen deliberately: an officer
 * being ranked is entitled to reconstruct the expectation applied to them with
 * a spreadsheet and twenty minutes. The two coefficients are
 *
 *     slope     = Σ (x - x̄)(y - ȳ) / Σ (x - x̄)²
 *     intercept = ȳ - slope · x̄
 *
 * and the expectation for any ward is `intercept + slope × difficulty`. R² is
 * reported alongside so a reader can see how much of the difference between
 * wards the conditions actually account for; if R² is low, most of the spread
 * is something other than difficulty and the residuals are the whole story.
 * `residualSd` is the standard error of the estimate, computed on n - 2 degrees
 * of freedom because two coefficients were spent fitting the line.
 *
 * With fewer than three wards no line can be fitted. In that case the
 * expectation falls back to the mean observed score, `fitted` is reported as
 * false, and the page says so rather than presenting a flat line as a finding.
 */
function fitExpectation(points: Array<{ x: number; y: number }>): ExpectationFit {
  const n = points.length
  const meanObserved = n > 0 ? points.reduce((s, p) => s + p.y, 0) / n : 0
  const meanDifficulty = n > 0 ? points.reduce((s, p) => s + p.x, 0) / n : 0

  if (n < 3) {
    return {
      slope: 0,
      intercept: meanObserved,
      rSquared: 0,
      residualSd: 0,
      toleranceBand: 0,
      meanDifficulty: round(meanDifficulty),
      meanObserved: round(meanObserved),
      fittedOn: n,
      fitted: false,
    }
  }

  let covariance = 0
  let variance = 0
  for (const p of points) {
    covariance += (p.x - meanDifficulty) * (p.y - meanObserved)
    variance += (p.x - meanDifficulty) ** 2
  }

  const slope = variance === 0 ? 0 : covariance / variance
  const intercept = meanObserved - slope * meanDifficulty

  let residualSumSquares = 0
  let totalSumSquares = 0
  for (const p of points) {
    residualSumSquares += (p.y - (intercept + slope * p.x)) ** 2
    totalSumSquares += (p.y - meanObserved) ** 2
  }

  const rSquared = totalSumSquares === 0 ? 0 : Math.max(0, 1 - residualSumSquares / totalSumSquares)
  const residualSd = Math.sqrt(residualSumSquares / Math.max(1, n - 2))

  return {
    slope: round(slope, 3),
    intercept: round(intercept, 2),
    rSquared: round(rSquared, 3),
    residualSd: round(residualSd, 2),
    toleranceBand: round(residualSd * 0.5, 2),
    meanDifficulty: round(meanDifficulty),
    meanObserved: round(meanObserved),
    fittedOn: n,
    fitted: variance > 0,
  }
}

/* ==========================================================================
   4. Cohorts - genuine peers, not the whole city
   ========================================================================== */

export type DifficultyQuartile = 1 | 2 | 3 | 4

function build$QUARTILE_LABEL(): Record<DifficultyQuartile, string> {
  return {
  1: t('Q1 · Least demanding conditions'),
  2: t('Q2 · Below-median difficulty'),
  3: t('Q3 · Above-median difficulty'),
  4: t('Q4 · Most demanding conditions'),
}
}
export let QUARTILE_LABEL: Record<DifficultyQuartile, string> = build$QUARTILE_LABEL()
registerLayer(() => {
  QUARTILE_LABEL = build$QUARTILE_LABEL()
})

function build$QUARTILE_SHORT_LABEL(): Record<DifficultyQuartile, string> {
  return {
  1: t('Q1 · Easiest quarter'),
  2: t('Q2 · Below median'),
  3: t('Q3 · Above median'),
  4: t('Q4 · Hardest quarter'),
}
}
export let QUARTILE_SHORT_LABEL: Record<DifficultyQuartile, string> = build$QUARTILE_SHORT_LABEL()
registerLayer(() => {
  QUARTILE_SHORT_LABEL = build$QUARTILE_SHORT_LABEL()
})

export interface DifficultyCohort {
  quartile: DifficultyQuartile
  label: string
  shortLabel: string
  wardCount: number
  meanDifficulty: number
  meanObserved: number
  /** How the cohort's mean structural pressure reads as an operational state. */
  pressureState: OperationalState
  aboveExpectation: number
  belowExpectation: number
  difficultyFrom: number
  difficultyTo: number
}

/* ==========================================================================
   5. The assessment
   ========================================================================== */

export type ExpectationVerdict = 'above' | 'at' | 'below'

function build$VERDICT_LABEL(): Record<ExpectationVerdict, string> {
  return {
  above: t('Above expectation'),
  at: t('On its line'),
  below: t('Below expectation'),
}
}
export let VERDICT_LABEL: Record<ExpectationVerdict, string> = build$VERDICT_LABEL()
registerLayer(() => {
  VERDICT_LABEL = build$VERDICT_LABEL()
})

export interface WardLikeForLikeRow {
  wardId: string
  wardLabel: string
  wardCode: string
  region: string
  population: number
  areaSqKm: number
  structure: WardStructuralReading
  difficulty: number
  difficultyComponents: DifficultyComponent[]
  quartile: DifficultyQuartile
  cohortLabel: string
  cohortShortLabel: string
  /** Operational health index, taken unchanged from the ward profile. */
  observed: number
  /** What a ward of this difficulty typically achieves. */
  expected: number
  /** Observed minus expected. Positive is above the line. */
  residual: number
  verdict: ExpectationVerdict
  /** Rank on residual across the assessed wards, 1 = furthest above its line. */
  residualRank: number
  /** How the ward's own structural pressure reads as an operational state. */
  pressureState: OperationalState
  /** The ward's operational state, as Ward Intelligence reports it. */
  state: OperationalState
  riskScore: number
  openComplaints: number
  /** Mean observed score across the ward's own difficulty cohort. */
  cohortMeanObserved: number
  /** Observed minus the cohort mean - the like-for-like reading against peers. */
  vsCohortMean: number
}

export interface LikeForLikeAssessment {
  rows: WardLikeForLikeRow[]
  fit: ExpectationFit
  cohorts: DifficultyCohort[]
  /** Corporation-mean component scores, for explaining the difficulty model. */
  modelSummary: DifficultyComponent[]
  aboveExpectation: number
  onLine: number
  belowExpectation: number
  /** The ward furthest above its line - where the practice worth copying is. */
  bestPractice: WardLikeForLikeRow | null
  /** The ward furthest below its line - where the obstruction has not been named. */
  needsSupport: WardLikeForLikeRow | null
  /** Wards the line was fitted on but which the principal may not see. */
  outOfScopeCount: number
}

/**
 * Builds the like-for-like assessment.
 *
 * The expectation line and the quartile cut points are always computed across
 * every ward in the corporation, because the line is a property of the
 * corporation rather than of whoever happens to be looking at it - narrowing it
 * to one officer's own wards would give each officer a different, and flattering,
 * expectation. Only the returned rows are narrowed: pass `visibleWardIds` and
 * the assessment reports on those wards alone while still measuring them
 * against the whole city's line.
 */
export function buildLikeForLikeAssessment(visibleWardIds?: string[]): LikeForLikeAssessment {
  const visible = visibleWardIds ? new Set(visibleWardIds) : null

  interface Working {
    wardId: string
    structure: WardStructuralReading
    components: DifficultyComponent[]
    difficulty: number
    observed: number
    riskScore: number
    openComplaints: number
    state: OperationalState
  }

  const working: Working[] = []
  for (const ward of WARDS) {
    const structure = readStructure(ward.id)
    const profile = buildWardProfile(ward.id)
    if (!structure || !profile) continue
    const components = difficultyComponents(structure)
    working.push({
      wardId: ward.id,
      structure,
      components,
      difficulty: round(components.reduce((sum, c) => sum + c.contribution, 0)),
      observed: profile.healthScore,
      riskScore: profile.riskScore,
      openComplaints: profile.services.complaints.open,
      state: profile.state,
    })
  }

  const fit = fitExpectation(working.map((w) => ({ x: w.difficulty, y: w.observed })))

  // Equal-count quartiles over the difficulty ordering. Equal counts rather than
  // equal difficulty ranges, because the point of the cohort is to give every
  // ward a comparable number of genuine peers to be read against.
  const byDifficulty = [...working].sort((a, b) => a.difficulty - b.difficulty)
  const quartileOf = new Map<string, DifficultyQuartile>()
  byDifficulty.forEach((w, index) => {
    const q = Math.min(4, Math.floor((index * 4) / Math.max(byDifficulty.length, 1)) + 1)
    quartileOf.set(w.wardId, q as DifficultyQuartile)
  })

  const cohortMeanObserved = new Map<DifficultyQuartile, number>()
  for (const q of [1, 2, 3, 4] as DifficultyQuartile[]) {
    const members = working.filter((w) => quartileOf.get(w.wardId) === q)
    cohortMeanObserved.set(
      q,
      members.length > 0 ? round(members.reduce((s, w) => s + w.observed, 0) / members.length) : 0,
    )
  }

  const assessed = working.map((w) => {
    const expected = fit.intercept + fit.slope * w.difficulty
    const residual = w.observed - expected
    const quartile = quartileOf.get(w.wardId) ?? 1
    const cohortMean = cohortMeanObserved.get(quartile) ?? 0
    const verdict: ExpectationVerdict =
      residual > fit.toleranceBand ? 'above' : residual < -fit.toleranceBand ? 'below' : 'at'
    return { working: w, expected: round(expected), residual: round(residual), quartile, cohortMean, verdict }
  })

  // Residual rank is assigned across every ward the line was fitted on, so a
  // ward's position does not improve simply because a colleague's ward is out
  // of the reader's scope.
  const residualOrder = [...assessed].sort((a, b) => b.residual - a.residual)
  const rankOf = new Map<string, number>(residualOrder.map((a, i) => [a.working.wardId, i + 1]))

  const rows: WardLikeForLikeRow[] = assessed
    .filter((a) => (visible ? visible.has(a.working.wardId) : true))
    .map((a) => {
      const ward = WARDS.find((w) => w.id === a.working.wardId)
      return {
        wardId: a.working.wardId,
        wardLabel: wardName(a.working.wardId),
        wardCode: wardShortName(a.working.wardId),
        region: ward?.region ?? '-',
        population: ward?.population ?? 0,
        areaSqKm: ward?.areaSqKm ?? 0,
        structure: a.working.structure,
        difficulty: a.working.difficulty,
        difficultyComponents: a.working.components,
        quartile: a.quartile,
        cohortLabel: QUARTILE_LABEL[a.quartile],
        cohortShortLabel: QUARTILE_SHORT_LABEL[a.quartile],
        observed: a.working.observed,
        expected: a.expected,
        residual: a.residual,
        verdict: a.verdict,
        residualRank: rankOf.get(a.working.wardId) ?? 0,
        // Inverted: a high difficulty score is a severe condition, so it reads
        // across as a critical state. It is a statement about the ward, never
        // about the people running it.
        pressureState: stateFrom(a.working.difficulty, true),
        state: a.working.state,
        riskScore: a.working.riskScore,
        openComplaints: a.working.openComplaints,
        cohortMeanObserved: a.cohortMean,
        vsCohortMean: round(a.working.observed - a.cohortMean),
      }
    })
    .sort((a, b) => b.residual - a.residual)

  const cohorts: DifficultyCohort[] = ([1, 2, 3, 4] as DifficultyQuartile[])
    .map((q) => {
      const members = assessed.filter((a) => a.quartile === q)
      const difficulties = members.map((m) => m.working.difficulty)
      return {
        quartile: q,
        label: QUARTILE_LABEL[q],
        shortLabel: QUARTILE_SHORT_LABEL[q],
        wardCount: members.length,
        meanDifficulty:
          members.length > 0 ? round(difficulties.reduce((s, d) => s + d, 0) / members.length) : 0,
        meanObserved: cohortMeanObserved.get(q) ?? 0,
        pressureState: stateFrom(
          members.length > 0 ? difficulties.reduce((s, d) => s + d, 0) / members.length : 0,
          true,
        ),
        aboveExpectation: members.filter((m) => m.verdict === 'above').length,
        belowExpectation: members.filter((m) => m.verdict === 'below').length,
        difficultyFrom: difficulties.length > 0 ? Math.min(...difficulties) : 0,
        difficultyTo: difficulties.length > 0 ? Math.max(...difficulties) : 0,
      }
    })
    .filter((c) => c.wardCount > 0)

  const modelSummary: DifficultyComponent[] = (Object.keys(DIFFICULTY_WEIGHTS) as DifficultyComponentId[]).map(
    (id) => {
      const scores = working.map((w) => w.components.find((c) => c.id === id)?.score ?? 0)
      const mean = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0
      return {
        id,
        label: DIFFICULTY_COMPONENT_LABEL[id],
        weight: DIFFICULTY_WEIGHTS[id],
        score: round(mean),
        contribution: round(mean * DIFFICULTY_WEIGHTS[id]),
        explanation: DIFFICULTY_MODEL_NOTE[id],
      }
    },
  )

  return {
    rows,
    fit,
    cohorts,
    modelSummary,
    aboveExpectation: rows.filter((r) => r.verdict === 'above').length,
    onLine: rows.filter((r) => r.verdict === 'at').length,
    belowExpectation: rows.filter((r) => r.verdict === 'below').length,
    // Rows are ordered by residual, so the first positive one is the largest
    // and the last negative one the smallest. Both are null rather than
    // misleading where no ward falls on that side of its line.
    bestPractice: rows.find((r) => r.residual > 0) ?? null,
    needsSupport: rows.findLast((r) => r.residual < 0) ?? null,
    outOfScopeCount: Math.max(0, working.length - rows.length),
  }
}

/** Restates the fitted line in the form a reader can check by hand. */
export function describeExpectationLine(fit: ExpectationFit): string {
  if (!fit.fitted) {
    return t('Too few wards were in view to fit an expectation line. Every ward is being read against the mean observed score of {0}, which is a placeholder and not a finding.', fit.meanObserved.toFixed(1))
  }
  const direction = fit.slope < 0 ? 'falls' : 'rises'
  return t('Expected score = {0} {1} {2} × difficulty. Across the {3} wards the line was fitted on, observed health {4} by {5} points for every ten points of additional difficulty, and the conditions account for {6}% of the variation between wards. A typical residual is {7} points.', fit.intercept.toFixed(2), fit.slope < 0 ? '-' : '+', Math.abs(fit.slope).toFixed(3), fit.fittedOn, direction, Math.abs(fit.slope * 10).toFixed(1), (fit.rSquared * 100).toFixed(0), fit.residualSd.toFixed(1))
}
