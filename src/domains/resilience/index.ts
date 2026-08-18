import { activeCorporation, hasCoastalJurisdiction } from '@/config/municipality.config'
import { CITY_SCALE, scaledCount } from '@/data/scale'
import {
  STORM_DRAINS,
  WARD_MONSOON_READINESS,
  WATERLOGGING_SPOTS,
} from '@/data/city.data'
import { AIR_QUALITY_STATIONS, COASTAL_SEGMENTS, EMERGENCY_STATIONS, HOSPITALS } from '@/data/social.data'
import { BUILDING_RECORDS } from '@/data/social.data'
import { PLATFORM_SERVICES } from '@/data/governance.data'
import { det } from '@/utils/deterministic'
import type { OperationalState } from '@/types/common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Urban Resilience Index.
 *
 * Resilience is the city's capacity to absorb a shock and keep functioning.
 * This index reads that capacity across the hazards the active corporation
 * actually faces - ten where it holds a shoreline, nine where it does not -
 * each computed from that corporation's own preparedness records rather than
 * from an event that has occurred. See `assessedWeights` for why a hazard a
 * city cannot experience is dropped rather than scored.
 *
 * A resilience score is a statement about PREPAREDNESS, never a forecast that a
 * hazard will or will not occur. A high flood-resilience score does not predict
 * a dry monsoon; it says the corporation's drains, pumps and ward readiness are
 * in a state to cope if the monsoon is heavy. The page holds that distinction
 * throughout.
 */

export type ResilienceDimensionId =
  | 'flood'
  | 'extremeRain'
  | 'heat'
  | 'coastal'
  | 'fire'
  | 'buildingRisk'
  | 'publicHealth'
  | 'infrastructure'
  | 'utilityFailure'
  | 'emergencyResponse'

function build$RESILIENCE_LABELS(): Record<ResilienceDimensionId, string> {
  return {
  flood: t('Flood'),
  extremeRain: t('Extreme Rainfall'),
  heat: t('Heat'),
  coastal: t('Coastal'),
  fire: t('Fire'),
  buildingRisk: t('Building Risk'),
  publicHealth: t('Public Health'),
  infrastructure: t('Infrastructure'),
  utilityFailure: t('Utility Failure'),
  emergencyResponse: t('Emergency Response'),
}
}
export let RESILIENCE_LABELS: Record<ResilienceDimensionId, string> = build$RESILIENCE_LABELS()
registerLayer(() => {
  RESILIENCE_LABELS = build$RESILIENCE_LABELS()
})

export const RESILIENCE_WEIGHTS: Record<ResilienceDimensionId, number> = {
  flood: 0.16,
  extremeRain: 0.14,
  coastal: 0.1,
  emergencyResponse: 0.12,
  infrastructure: 0.1,
  buildingRisk: 0.1,
  publicHealth: 0.09,
  utilityFailure: 0.08,
  fire: 0.07,
  heat: 0.04,
}

export interface ResilienceDimension {
  id: ResilienceDimensionId
  label: string
  /** 0–100 preparedness; higher is more resilient. */
  score: number
  weight: number
  contribution: number
  state: OperationalState
  /** The single most material weakness pulling this score down. */
  primaryGap: string
  drivers: Array<{ label: string; value: string }>
  explanation: string
}

export interface UrbanResilienceIndex {
  score: number
  state: OperationalState
  trendPoints: number
  dimensions: ResilienceDimension[]
  narrative: string
  weakest: ResilienceDimension | null
  strongest: ResilienceDimension | null
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10))
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

function stateFor(score: number): OperationalState {
  if (score >= 78) return 'operational'
  if (score >= 62) return 'degraded'
  if (score >= 48) return 'at-risk'
  return 'review-required'
}

/**
 * The hazards actually assessed for the active corporation, with weights
 * rescaled to sum to exactly 1.
 *
 * Twenty-three of Maharashtra's twenty-nine municipal corporations are
 * landlocked. Scoring coastal resilience for one of them would put a tenth of
 * its composite index - the weight coastal carries - on a hazard the city
 * cannot experience and a shoreline register it does not hold. The dimension is
 * therefore dropped rather than scored.
 *
 * Dropping it leaves the remaining weights summing to 0.9, which would cap the
 * composite at 90 and make every landlocked corporation look permanently less
 * resilient than a coastal one for no reason connected to its preparedness. The
 * remaining weights are rescaled in proportion instead: each hazard keeps its
 * rank and its relative importance against the others, and the composite stays
 * on the same 0-100 basis. `RESILIENCE_WEIGHTS` itself is the published set and
 * is never modified - it is what the interface cites, and it sums to 1.000.
 */
function assessedWeights(): Array<{ id: ResilienceDimensionId; weight: number }> {
  const coastalApplies = hasCoastalJurisdiction(activeCorporation)
  const ids = (Object.keys(RESILIENCE_WEIGHTS) as ResilienceDimensionId[]).filter(
    (id) => id !== 'coastal' || coastalApplies,
  )
  const total = ids.reduce((s, id) => s + RESILIENCE_WEIGHTS[id], 0)
  const rescaled = ids.map((id) => ({
    id,
    weight: Math.round((RESILIENCE_WEIGHTS[id] / total) * 1000) / 1000,
  }))

  // Nine weights rounded to three places will not land on exactly 1.000 by
  // themselves. The residual is carried by the heaviest dimension, where a
  // thousandth is least material. The set must sum to exactly one: a weighted
  // index whose weights fall short cannot reach its own ceiling, and one whose
  // weights overshoot reports a score it has not earned.
  const residual = Math.round((1 - rescaled.reduce((s, r) => s + r.weight, 0)) * 1000) / 1000
  if (residual !== 0) {
    const heaviest = rescaled.reduce((a, b) => (b.weight > a.weight ? b : a))
    heaviest.weight = Math.round((heaviest.weight + residual) * 1000) / 1000
  }
  return rescaled
}

export function urbanResilienceIndex(): UrbanResilienceIndex {
  const coastalApplies = hasCoastalJurisdiction(activeCorporation)
  const weights = new Map(assessedWeights().map((w) => [w.id, w.weight]))
  const dims: ResilienceDimension[] = []

  const build = (
    id: ResilienceDimensionId,
    score: number,
    primaryGap: string,
    drivers: Array<{ label: string; value: string }>,
    explanation: string,
  ): void => {
    // A hazard the corporation cannot experience carries no weight and is not
    // assessed at all - it is absent from the index rather than scored zero or
    // scored full, either of which would be a statement the records cannot
    // support.
    const weight = weights.get(id)
    if (weight === undefined) return
    const s = clamp(score)
    dims.push({
      id,
      label: RESILIENCE_LABELS[id],
      score: s,
      weight,
      contribution: Math.round(s * weight * 10) / 10,
      state: stateFor(s),
      primaryGap,
      drivers,
      explanation,
    })
  }

  // --- Flood -------------------------------------------------------------
  const meanReadiness = mean(WARD_MONSOON_READINESS.map((r) => r.readinessScore))
  const chronicCount = WATERLOGGING_SPOTS.length
  const drainReadiness = mean(STORM_DRAINS.map((d) => Math.max(0, 100 - d.blockageRisk)))
  // The chronic-waterlogging register is built to the corporation's own size, so
  // the penalty is taken against the volume a corporation of this size would
  // carry rather than against a flat count. A flat 0.4 points per location was
  // sized against Brihanmumbai's register; applied to a corporation a fortieth
  // of the size it would forgive a city whose every junction floods, purely
  // because there are fewer junctions. The share saturates the same 15-point
  // penalty at the same relative burden for every corporation.
  const chronicPressure = Math.min(1, chronicCount / scaledCount(38, CITY_SCALE.area, 8))
  build(
    'flood',
    meanReadiness * 0.55 + drainReadiness * 0.45 - chronicPressure * 15,
    `${chronicCount} chronic waterlogging locations remain on the register.`,
    [
      { label: t('Mean ward readiness'), value: `${meanReadiness.toFixed(0)}/100` },
      { label: t('Drain clearance'), value: `${drainReadiness.toFixed(0)}/100` },
      { label: t('Chronic locations'), value: `${chronicCount}` },
    ],
    'Flood resilience combines ward monsoon readiness with drain clearance, discounted by the chronic waterlogging locations still on the register. It measures the corporation’s state of preparation, not the likelihood of flooding.',
  )

  // --- Extreme rainfall --------------------------------------------------
  const pumpReadiness = mean(WARD_MONSOON_READINESS.map((r) => r.pumpReadiness))
  const desilting = mean(WARD_MONSOON_READINESS.map((r) => r.desiltingPct))
  build(
    'extremeRain',
    pumpReadiness * 0.5 + desilting * 0.5,
    `Desilting completion averages ${desilting.toFixed(0)}% across wards.`,
    [
      { label: t('Pump readiness'), value: `${pumpReadiness.toFixed(0)}%` },
      { label: t('Desilting complete'), value: `${desilting.toFixed(0)}%` },
    ],
    'Extreme-rainfall resilience reflects the two capacities that matter when rain exceeds drain design: pump availability and how much of the pre-monsoon desilting programme is complete.',
  )

  // --- Heat --------------------------------------------------------------
  const heatBase = det('resilience:heat').int(58, 72)
  build(
    'heat',
    heatBase,
    'A formal heat action plan is at target-architecture stage in this environment.',
    [
      { label: t('Cooling centres'), value: 'Target architecture' },
      { label: t('Heat action plan'), value: 'Demonstration status' },
    ],
    'Heat resilience is the least instrumented hazard in this environment. The score reflects a demonstration baseline; a production deployment would compute it from cooling-centre coverage, vulnerable-population mapping and a live heat action plan.',
  )

  // --- Coastal -----------------------------------------------------------
  // Skipped entirely for a landlocked corporation - `build` drops any dimension
  // that carries no weight for this deployment. See `assessedWeights`.
  const meanVulnerability = mean(COASTAL_SEGMENTS.map((c) => c.vulnerabilityIndex))
  build(
    'coastal',
    100 - meanVulnerability,
    `Mean coastal vulnerability index is ${meanVulnerability.toFixed(0)}/100.`,
    [
      { label: t('Segments monitored'), value: `${COASTAL_SEGMENTS.length}` },
      { label: t('Mean vulnerability'), value: `${meanVulnerability.toFixed(0)}/100` },
    ],
    t(
      "Coastal resilience is the inverse of the mean erosion and inundation vulnerability across monitored shoreline segments - {0}'s exposure to sea-level and storm-surge risk.",
      t(activeCorporation.city),
    ),
  )

  // --- Fire --------------------------------------------------------------
  const fireReadiness = mean(EMERGENCY_STATIONS.map((s) => s.readinessIndex))
  const vehicleAvailability =
    (EMERGENCY_STATIONS.reduce((s, x) => s + x.vehiclesAvailable, 0) /
      Math.max(EMERGENCY_STATIONS.reduce((s, x) => s + x.vehiclesTotal, 0), 1)) *
    100
  build(
    'fire',
    fireReadiness * 0.6 + vehicleAvailability * 0.4,
    `${vehicleAvailability.toFixed(0)}% of appliance fleet is currently available.`,
    [
      { label: t('Station readiness'), value: `${fireReadiness.toFixed(0)}/100` },
      { label: t('Appliance availability'), value: `${vehicleAvailability.toFixed(0)}%` },
    ],
    'Fire resilience combines station readiness with the share of the appliance fleet currently available for deployment.',
  )

  // --- Building risk -----------------------------------------------------
  const dangerous = BUILDING_RECORDS.filter(
    (b) => b.dilapidationCategory === 'C1' || b.severity === 'critical' || b.severity === 'high',
  ).length
  const buildingPenalty = Math.min(45, (dangerous / Math.max(BUILDING_RECORDS.length, 1)) * 220)
  build(
    'buildingRisk',
    100 - buildingPenalty,
    `${dangerous} structures carry a high or critical dilapidation classification.`,
    [
      { label: t('Structures on register'), value: `${BUILDING_RECORDS.length}` },
      { label: t('High / critical risk'), value: `${dangerous}` },
    ],
    'Building resilience is reduced by the share of structures on the register carrying a high or critical dilapidation classification - the C1 category being those requiring immediate evacuation.',
  )

  // --- Public health -----------------------------------------------------
  const hospitalHeadroom = mean(HOSPITALS.map((h) => Math.max(0, 100 - h.occupancyPct)))
  const staffing = mean(HOSPITALS.map((h) => h.staffingPct))
  build(
    'publicHealth',
    hospitalHeadroom * 0.55 + staffing * 0.45,
    `Mean hospital occupancy leaves ${hospitalHeadroom.toFixed(0)}% headroom.`,
    [
      { label: t('Bed headroom'), value: `${hospitalHeadroom.toFixed(0)}%` },
      { label: t('Staffing level'), value: `${staffing.toFixed(0)}%` },
    ],
    'Public-health resilience is the system’s surge capacity: available hospital bed headroom combined with current staffing levels. It is computed from facility aggregates only, with no patient-level data.',
  )

  // --- Infrastructure ----------------------------------------------------
  const platformHealthy = PLATFORM_SERVICES.filter((s) => s.state === 'operational').length
  const infraScore = (platformHealthy / Math.max(PLATFORM_SERVICES.length, 1)) * 60 + drainReadiness * 0.4
  build(
    'infrastructure',
    infraScore,
    'Continuity of the corporation’s own platform services is part of infrastructure resilience.',
    [
      { label: t('Platform services healthy'), value: `${platformHealthy}/${PLATFORM_SERVICES.length}` },
      { label: t('Drain network state'), value: `${drainReadiness.toFixed(0)}/100` },
    ],
    'Infrastructure resilience blends the operational state of the corporation’s own platform services with the condition of the drainage network - the systems the city depends on to keep functioning under stress.',
  )

  // --- Utility failure ---------------------------------------------------
  const aqiStress = mean(AIR_QUALITY_STATIONS.map((s) => Math.min(100, (s.aqi / 300) * 100)))
  const utilityScore = 100 - aqiStress * 0.4 - chronicPressure * 30
  build(
    'utilityFailure',
    utilityScore,
    'Utility-continuity telemetry is at adapter-ready stage for most feeds.',
    [
      { label: t('Environmental stress'), value: `${aqiStress.toFixed(0)}/100` },
      { label: t('Chronic disruption points'), value: `${chronicCount}` },
    ],
    'Utility-failure resilience is partially instrumented in this environment. It currently proxies continuity risk from environmental stress and chronic disruption points; a production deployment would read power, water and telecom continuity directly.',
  )

  // --- Emergency response ------------------------------------------------
  const responseMinutes = mean(EMERGENCY_STATIONS.map((s) => s.avgResponseMinutes))
  const responseScore = Math.max(0, 100 - responseMinutes * 6) * 0.5 + fireReadiness * 0.5
  build(
    'emergencyResponse',
    responseScore,
    `Mean recorded response time is ${responseMinutes.toFixed(1)} minutes.`,
    [
      { label: t('Mean response time'), value: `${responseMinutes.toFixed(1)} min` },
      { label: t('Station readiness'), value: `${fireReadiness.toFixed(0)}/100` },
    ],
    'Emergency-response resilience weighs recorded mean response time against station readiness - how quickly and how prepared the corporation’s response assets are.',
  )

  // --- Composite ----------------------------------------------------------
  const score = clamp(dims.reduce((s, d) => s + d.contribution, 0))
  const trendPoints = Math.round(det('resilience:trend').float(-4, 4) * 10) / 10

  const ranked = [...dims].sort((a, b) => b.score - a.score)
  const strongest = ranked[0] ?? null
  const weakest = ranked[ranked.length - 1] ?? null

  // The narrative states which hazards were assessed, because a landlocked
  // corporation's index is computed over nine and a coastal one's over ten. A
  // reader comparing two corporations' scores is entitled to know that without
  // having to count the rows.
  const assessedLine = coastalApplies
    ? t('Assessed across all {0} hazards on the register.', dims.length)
    : t('Assessed across {0} hazards. Coastal resilience is not assessed: no shoreline or tidal creek frontage falls within {1}\'s jurisdiction, so the remaining hazards carry proportionally rescaled weights that still sum to one.', dims.length, activeCorporation.name)

  const narrative =
    strongest && weakest
      ? t('{0}\'s composite urban resilience stands at {1}/100. {2} The city is best prepared for {3} ({4}/100) and least prepared for {5} ({6}/100). {7} Every score here describes preparedness, not the likelihood of any hazard occurring.', t(activeCorporation.city), score, assessedLine, strongest.label.toLowerCase(), strongest.score, weakest.label.toLowerCase(), weakest.score, weakest.primaryGap)
      : t('Composite urban resilience stands at {0}/100. {1}', score, assessedLine)

  return {
    score,
    state: stateFor(score),
    trendPoints,
    dimensions: dims.sort((a, b) => a.score - b.score),
    narrative,
    weakest,
    strongest,
  }
}
