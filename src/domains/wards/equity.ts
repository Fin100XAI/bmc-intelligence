import type { IsoDateTime, OperationalState } from '@/types/common'
import { WARDS, wardName } from '@/data/reference'
import { settlementsInWard } from '@/data/civic.data'
import { stateFrom } from '@/data/city.data'
import { buildWardProfile } from '@/domains/wards/profile'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/domains/wards/equity.ts
 *
 * Ward equity and allocation.
 *
 * Every other ward surface in this platform reports a ward's CONDITION. This
 * module asks a different question, and a harder one: is the corporation's own
 * capital money going where the corporation's own data says the need is?
 *
 * The distinction matters because the two explanations for a failing ward call
 * for entirely different remedies. A ward can be performing badly because it is
 * genuinely hard - low-lying, dense, ageing beyond what any budget cycle can
 * repair - or because it has been allocated less than its condition warranted,
 * year after year. Only the second is something a budget can fix, and at
 * present nothing in this platform separates the two.
 *
 * NOTHING HERE IS NEW DATA. Need is derived from the ward's existing composite
 * risk and health indices, its existing complaint and SLA record, and the
 * corporation's own settlement survey. Provision is the ward's existing capital
 * position - the same `wardBudgetPosition` figures Budget Intelligence reports
 * and `buildWardProfile` already carries - divided by the ward's recorded
 * population. Introducing a fresh set of allocation figures here would produce
 * a page that disagrees with Budget Intelligence about the same ward, and
 * reconciliation between the two is the entire point of the exercise.
 *
 * ON TONE. This module names gaps between allocation and need. It does not
 * assert why a gap exists. A ward may sit low on provision for wholly proper
 * reasons - works completed in an earlier cycle, a scheme funded from state or
 * central heads that never touches the municipal capital budget, land that
 * cannot be built on. The output is a question for the record, not a finding
 * against anyone.
 */

/* ==========================================================================
   Need - a 0-100 service-deficit score
   ========================================================================== */

/**
 * How the need score is formed.
 *
 * Five components, each expressed on a 0-100 scale where HIGHER MEANS GREATER
 * DEFICIT, combined on the fixed weights below. The weights are stated here and
 * exported so that a reader - or a standing committee - can see exactly how the
 * number was assembled and argue with the weighting rather than with the score.
 *
 *   compositeRisk        0.30  The ward's own composite risk index, the
 *                              platform's broadest single statement of how
 *                              exposed a ward is. It carries the largest share
 *                              because it already aggregates flood exposure,
 *                              infrastructure condition and delivery risk.
 *   healthDeficit        0.22  The inverse of the ward's operational health
 *                              index. Condition today, as against exposure.
 *   complaintPressure    0.20  Open complaints per 100,000 residents, indexed
 *                              to the worst ward in the cohort. This is the
 *                              only component sourced from what residents
 *                              themselves reported rather than from an
 *                              officer's assessment.
 *   settlementDependence 0.15  Share of the ward's residents living in
 *                              recorded informal settlements. Settlements
 *                              depend almost entirely on municipal provision -
 *                              standposts, community toilet seats, collection
 *                              rounds - so a high share raises the service
 *                              burden the corporation itself must carry.
 *   slaBreachPressure    0.13  SLA-breached complaints per 100,000 residents,
 *                              indexed to the worst ward in the cohort.
 *                              Separated from raw complaint volume because a
 *                              breach is a failure of the corporation, whereas
 *                              a complaint is only a report of a condition.
 *
 * The two "pressure" components are indexed to the cohort maximum rather than
 * to an absolute rate, because no defensible absolute standard exists for
 * complaints per head. Everything else is already on an absolute 0-100 scale.
 */
export const NEED_WEIGHTS = {
  compositeRisk: 0.3,
  healthDeficit: 0.22,
  complaintPressure: 0.2,
  settlementDependence: 0.15,
  slaBreachPressure: 0.13,
} as const

export type NeedComponentId = keyof typeof NEED_WEIGHTS

function build$NEED_LABELS(): Record<NeedComponentId, string> {
  return {
  compositeRisk: t('Composite ward risk'),
  healthDeficit: t('Operational health deficit'),
  complaintPressure: t('Citizen complaint pressure'),
  settlementDependence: t('Settlement service dependence'),
  slaBreachPressure: t('Service standard breaches'),
}
}
let NEED_LABELS: Record<NeedComponentId, string> = build$NEED_LABELS()
registerLayer(() => {
  NEED_LABELS = build$NEED_LABELS()
})

/**
 * A ward in which two residents in five live in a recorded settlement carries
 * the maximum settlement burden this component can express. Beyond that share
 * the component is capped: it is a weighting for municipal dependence, not a
 * measure of deprivation, and it should not be allowed to swamp the other four.
 */
const SETTLEMENT_SATURATION_PCT = 40

export interface WardNeedComponent {
  id: NeedComponentId
  label: string
  /** 0-100, higher means greater deficit. */
  score: number
  weight: number
  contribution: number
  explanation: string
}

export type EquityQuadrant = 'underserved' | 'prioritised' | 'over-provisioned' | 'steady'

function build$QUADRANT_LABEL(): Record<EquityQuadrant, string> {
  return {
  underserved: t('Underserved'),
  prioritised: t('Prioritised'),
  'over-provisioned': 'Over-provisioned',
  steady: t('Steady'),
}
}
export let QUADRANT_LABEL: Record<EquityQuadrant, string> = build$QUADRANT_LABEL()
registerLayer(() => {
  QUADRANT_LABEL = build$QUADRANT_LABEL()
})

function build$QUADRANT_DESCRIPTION(): Record<EquityQuadrant, string> {
  return {
  underserved:
    t('Need above the cohort median, capital provision below it. The ward where the corporation is asked in the General Body why the money did not follow the condition.'),
  prioritised:
    t('Need above the cohort median and capital provision above it. Allocation is tracking condition, which is what the budget is meant to do.'),
  'over-provisioned':
    t('Need below the cohort median, capital provision above it. Frequently proper - a trunk asset, a scheme serving wards beyond this one - but it should be stated rather than left implicit.'),
  steady:
    t('Need below the cohort median and provision below it. No allocation question arises on the present figures.'),
}
}
export let QUADRANT_DESCRIPTION: Record<EquityQuadrant, string> = build$QUADRANT_DESCRIPTION()
registerLayer(() => {
  QUADRANT_DESCRIPTION = build$QUADRANT_DESCRIPTION()
})

export interface WardEquityRow {
  wardId: string
  /** Institutional ward label, e.g. "K/W - Andheri West". */
  label: string
  code: string
  region: string
  population: number
  /* Need ---------------------------------------------------------------- */
  needScore: number
  needComponents: WardNeedComponent[]
  riskScore: number
  healthScore: number
  openComplaints: number
  slaBreached: number
  settlementPopulation: number
  settlementSharePct: number
  /* Provision ------------------------------------------------------------ */
  allocatedCrore: number
  spentCrore: number
  utilisationPct: number
  /** Capital allocated per resident, in rupees. */
  allocatedPerResident: number
  /** Capital actually paid out per resident, in rupees. */
  spentPerResident: number
  /* Equity --------------------------------------------------------------- */
  needPercentile: number
  provisionPercentile: number
  /** Provision percentile less need percentile. Negative = served below need. */
  equityGap: number
  /** 0-100 restatement of the gap for banding. Higher means better aligned. */
  alignmentScore: number
  quadrant: EquityQuadrant
  state: OperationalState
}

export interface WardEquityAssessment {
  rows: WardEquityRow[]
  /** Number of wards the comparison was drawn across. */
  cohortSize: number
  /**
   * The two axis splits. Both are MEDIANS of the cohort, never fixed
   * constants - see `buildWardEquity` for why.
   */
  medians: { needScore: number; allocatedPerResident: number }
  quadrantCounts: Record<EquityQuadrant, number>
  /** The widest negative gap in the cohort - the ward served furthest below its need. */
  widestGap: { wardId: string; label: string; equityGap: number } | null
  /**
   * The headline inequity figure: mean capital spend per resident in the
   * highest-need quarter of the cohort set against the lowest-need quarter.
   */
  quartileSpend: {
    quartileSize: number
    highestNeedPerResident: number
    lowestNeedPerResident: number
    /** Highest-need spend as a multiple of lowest-need spend. */
    ratio: number
    /** Signed rupees per resident. Negative = the neediest quarter receives less. */
    differencePerResident: number
  }
  totals: { allocatedCrore: number; spentCrore: number; populationCovered: number }
  generatedAt: IsoDateTime
}

/* ==========================================================================
   Statistics - kept local, deliberately simple, and stated
   ========================================================================== */

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Mid-rank percentile: the share of the cohort below the value, plus half the
 * share equal to it. Ties therefore share a position rather than one of them
 * being arbitrarily promoted, which matters when several wards record the same
 * figure.
 */
function percentileOf(values: number[], value: number): number {
  if (values.length === 0) return 0
  let below = 0
  let equal = 0
  for (const v of values) {
    if (v < value) below += 1
    else if (v === value) equal += 1
  }
  return Math.round(((below + equal / 2) / values.length) * 1000) / 10
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, value))
}

/** One crore of rupees. Capital is carried in crore throughout the platform. */
const RUPEES_PER_CRORE = 1_00_00_000

/** Mean capital actually paid out per resident across a group of wards. */
function meanSpendPerResident(group: WardEquityRow[]): number {
  if (group.length === 0) return 0
  return Math.round(group.reduce((s, r) => s + r.spentPerResident, 0) / group.length)
}

/* ==========================================================================
   Assessment
   ========================================================================== */

/**
 * Builds the equity assessment across a cohort of wards.
 *
 * COHORT. Equity is a comparison, so every percentile, median and quartile
 * below is computed across the wards actually passed in - which is the set the
 * acting principal is authorised to see, decided in the service layer. A
 * principal scoped to two wards therefore gets a two-ward comparison, and the
 * page is required to say so. The alternative - computing against all wards and
 * showing a filtered subset - would produce a page whose summary figures did
 * not match its own table.
 *
 * AXIS SPLITS. The quadrant boundaries are the cohort MEDIANS of the two axes,
 * not fixed thresholds. A fixed rupees-per-resident line would mean something
 * different in every corporation this platform is deployed into, and would go
 * stale the moment the capital budget was revised. The median splits the cohort
 * into halves that are true by construction, and it is the split a standing
 * committee can check with nothing more than the table in front of it.
 *
 * PROVISION AXIS. Provision is measured on capital ALLOCATED per resident, not
 * capital spent. Allocation is the decision the corporation makes and the thing
 * a budget can correct; under-spend against an allocation is a delivery failure,
 * which is a different question already answered by capital utilisation. Both
 * figures are carried on every row so the two are never confused.
 */
export function buildWardEquity(wardIds?: string[]): WardEquityAssessment {
  const ids = wardIds ?? WARDS.map((w) => w.id)

  // Pass one: the raw facts per ward, all of them already held elsewhere.
  const base = ids
    .map((wardId) => {
      const profile = buildWardProfile(wardId)
      if (!profile) return null

      const ward = profile.ward
      const population = Math.max(1, ward.population)
      const settlements = settlementsInWard(wardId)
      const settlementPopulation = settlements.reduce((s, x) => s + x.estimatedPopulation, 0)

      return {
        wardId,
        ward,
        population,
        riskScore: profile.riskScore,
        healthScore: profile.healthScore,
        openComplaints: profile.services.complaints.open,
        slaBreached: profile.services.complaints.slaBreached,
        settlementPopulation,
        settlementSharePct: round1(Math.min(100, (settlementPopulation / population) * 100)),
        allocatedCrore: profile.finance.budgetAllocatedCrore,
        spentCrore: profile.finance.budgetSpentCrore,
        utilisationPct: profile.finance.budgetUtilisationPct,
        complaintsPer100k: (profile.services.complaints.open / population) * 100_000,
        breachesPer100k: (profile.services.complaints.slaBreached / population) * 100_000,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (base.length === 0) {
    return {
      rows: [],
      cohortSize: 0,
      medians: { needScore: 0, allocatedPerResident: 0 },
      quadrantCounts: { underserved: 0, prioritised: 0, 'over-provisioned': 0, steady: 0 },
      widestGap: null,
      quartileSpend: {
        quartileSize: 0,
        highestNeedPerResident: 0,
        lowestNeedPerResident: 0,
        ratio: 0,
        differencePerResident: 0,
      },
      totals: { allocatedCrore: 0, spentCrore: 0, populationCovered: 0 },
      generatedAt: DEMO_NOW.toISOString(),
    }
  }

  // Cohort maxima for the two rate-based components.
  const maxComplaintRate = Math.max(...base.map((b) => b.complaintsPer100k), 1)
  const maxBreachRate = Math.max(...base.map((b) => b.breachesPer100k), 1)

  // Pass two: need score and provision, per ward.
  const scored = base.map((b) => {
    const raw: Record<NeedComponentId, number> = {
      compositeRisk: clamp100(b.riskScore),
      healthDeficit: clamp100(100 - b.healthScore),
      complaintPressure: clamp100((b.complaintsPer100k / maxComplaintRate) * 100),
      settlementDependence: clamp100((b.settlementSharePct / SETTLEMENT_SATURATION_PCT) * 100),
      slaBreachPressure: clamp100((b.breachesPer100k / maxBreachRate) * 100),
    }

    const explanations: Record<NeedComponentId, string> = {
      compositeRisk: `The ward's composite risk index stands at ${Math.round(b.riskScore)}/100. It is carried across unchanged from Ward Intelligence, which is why the two surfaces agree on this ward.`,
      healthDeficit: `Operational health is ${Math.round(b.healthScore)}/100, leaving a condition deficit of ${Math.round(100 - b.healthScore)} points.`,
      complaintPressure: `${b.openComplaints} complaints are open against a population of ${formatNumber(b.population)}, a rate of ${round1(b.complaintsPer100k)} per 100,000 residents. The cohort's worst ward records ${round1(maxComplaintRate)}.`,
      settlementDependence: `An estimated ${formatNumber(b.settlementPopulation)} residents - ${b.settlementSharePct}% of the ward - live in recorded settlements, where municipal provision is the only provision. Aggregate survey figures only; no household or individual record is held.`,
      slaBreachPressure: `${b.slaBreached} complaints have breached their service standard, a rate of ${round1(b.breachesPer100k)} per 100,000 residents against a cohort worst of ${round1(maxBreachRate)}.`,
    }

    const needComponents: WardNeedComponent[] = (Object.keys(NEED_WEIGHTS) as NeedComponentId[]).map((id) => ({
      id,
      label: NEED_LABELS[id],
      score: Math.round(raw[id]),
      weight: NEED_WEIGHTS[id],
      contribution: round1(raw[id] * NEED_WEIGHTS[id]),
      explanation: explanations[id],
    }))

    const needScore = Math.round(clamp100(needComponents.reduce((s, c) => s + c.contribution, 0)))

    return {
      ...b,
      needComponents,
      needScore,
      allocatedPerResident: Math.round((b.allocatedCrore * RUPEES_PER_CRORE) / b.population),
      spentPerResident: Math.round((b.spentCrore * RUPEES_PER_CRORE) / b.population),
    }
  })

  // Pass three: percentiles, the two median splits, and the resulting quadrant.
  const needValues = scored.map((s) => s.needScore)
  const provisionValues = scored.map((s) => s.allocatedPerResident)
  const medianNeed = round1(median(needValues))
  const medianProvision = Math.round(median(provisionValues))

  const rows: WardEquityRow[] = scored.map((s) => {
    const needPercentile = percentileOf(needValues, s.needScore)
    const provisionPercentile = percentileOf(provisionValues, s.allocatedPerResident)
    const equityGap = round1(provisionPercentile - needPercentile)

    const highNeed = s.needScore >= medianNeed
    const highProvision = s.allocatedPerResident >= medianProvision
    const quadrant: EquityQuadrant = highNeed
      ? highProvision
        ? 'prioritised'
        : 'underserved'
      : highProvision
        ? 'over-provisioned'
        : 'steady'

    // A gap of fifty percentile points below need is total misalignment; a
    // ward at or above its need percentile is fully aligned. Banded through the
    // platform's shared `stateFrom` so an equity badge reads on the same scale
    // as every other state badge in the interface.
    const alignmentScore = Math.round(clamp100(100 + Math.min(0, equityGap) * 2))

    return {
      wardId: s.wardId,
      label: wardName(s.wardId),
      code: s.ward.code,
      region: s.ward.region,
      population: s.ward.population,
      needScore: s.needScore,
      needComponents: s.needComponents,
      riskScore: s.riskScore,
      healthScore: s.healthScore,
      openComplaints: s.openComplaints,
      slaBreached: s.slaBreached,
      settlementPopulation: s.settlementPopulation,
      settlementSharePct: s.settlementSharePct,
      allocatedCrore: s.allocatedCrore,
      spentCrore: s.spentCrore,
      utilisationPct: s.utilisationPct,
      allocatedPerResident: s.allocatedPerResident,
      spentPerResident: s.spentPerResident,
      needPercentile,
      provisionPercentile,
      equityGap,
      alignmentScore,
      quadrant,
      state: stateFrom(alignmentScore),
    }
  })

  rows.sort((a, b) => a.equityGap - b.equityGap)

  const quadrantCounts: Record<EquityQuadrant, number> = {
    underserved: 0,
    prioritised: 0,
    'over-provisioned': 0,
    steady: 0,
  }
  for (const row of rows) quadrantCounts[row.quadrant] += 1

  const negativeGaps = rows.filter((r) => r.equityGap < 0)
  const widest = negativeGaps.length > 0 ? negativeGaps[0] : null

  // Need quartiles. With a cohort of twenty-four wards the quartile is six
  // wards at each end; with a small cohort it collapses to a single ward, which
  // the page states rather than hides.
  const byNeed = [...rows].sort((a, b) => b.needScore - a.needScore)
  const quartileSize = Math.max(1, Math.round(byNeed.length / 4))
  const highestNeed = byNeed.slice(0, quartileSize)
  const lowestNeed = byNeed.slice(-quartileSize)
  const highestNeedPerResident = meanSpendPerResident(highestNeed)
  const lowestNeedPerResident = meanSpendPerResident(lowestNeed)

  return {
    rows,
    cohortSize: rows.length,
    medians: { needScore: medianNeed, allocatedPerResident: medianProvision },
    quadrantCounts,
    widestGap: widest ? { wardId: widest.wardId, label: widest.label, equityGap: widest.equityGap } : null,
    quartileSpend: {
      quartileSize,
      highestNeedPerResident,
      lowestNeedPerResident,
      ratio: lowestNeedPerResident > 0 ? round1(highestNeedPerResident / lowestNeedPerResident) : 0,
      differencePerResident: highestNeedPerResident - lowestNeedPerResident,
    },
    totals: {
      allocatedCrore: round1(rows.reduce((s, r) => s + r.allocatedCrore, 0)),
      spentCrore: round1(rows.reduce((s, r) => s + r.spentCrore, 0)),
      populationCovered: rows.reduce((s, r) => s + r.population, 0),
    },
    generatedAt: DEMO_NOW.toISOString(),
  }
}

/** The wards sitting in the high-need / low-provision quadrant, widest gap first. */
export function underservedWards(assessment: WardEquityAssessment): WardEquityRow[] {
  return assessment.rows.filter((r) => r.quadrant === 'underserved')
}
