import {
  ROAD_DEFECTS,
  ROAD_SEGMENTS,
  SEWERAGE_NODES,
  TRAFFIC_CORRIDORS,
  WARD_MONSOON_READINESS,
  WASTE_WARD_PERFORMANCE,
  WATER_ZONES,
} from '@/data/city.data'
import { AIR_QUALITY_STATIONS, EMERGENCY_STATIONS, HEALTH_INDICATORS } from '@/data/social.data'
import { SERVICE_HEALTH, COMPLAINTS } from '@/data/operations.data'
import { AUDIT_EVENTS, SECURITY_POSTURE } from '@/data/governance.data'
import { PROJECTS, budgetTotals, revenueTotals } from '@/data/finance.data'
import { WARDS } from '@/data/reference'
import { CITY_SCALE, scaledCount } from '@/data/scale'
import { activeCorporation } from '@/config/municipality.config'
import { det } from '@/utils/deterministic'
import type { ConfidenceLevel, OperationalState } from '@/types/common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * City Intelligence Index.
 *
 * Twelve dimensions, each computed from the corporation's own records, each
 * carrying its own weight, drivers, confidence and the sentence that explains
 * what moved it.
 *
 * The governing rule of this module: NEVER show a score without explaining it.
 * A composite that cannot be decomposed invites confidence without
 * understanding, which is worse than showing nothing. Every dimension
 * therefore publishes what raised it and what lowered it, in the corporation's
 * own units, before the number is displayed anywhere.
 *
 * Trend is computed against a deterministic prior-period baseline held in this
 * module. It is a demonstration comparison, not an observed historical series
 * - the platform holds no time-series store in this environment, and the page
 * says so rather than implying one.
 */

export type IndexDimensionId =
  | 'governance'
  | 'citizenServices'
  | 'infrastructure'
  | 'water'
  | 'sanitation'
  | 'mobility'
  | 'publicHealth'
  | 'environment'
  | 'financialHealth'
  | 'projectDelivery'
  | 'emergencyPreparedness'
  | 'urbanResilience'

export const INDEX_WEIGHTS: Record<IndexDimensionId, number> = {
  governance: 0.08,
  citizenServices: 0.11,
  infrastructure: 0.09,
  water: 0.1,
  sanitation: 0.09,
  mobility: 0.07,
  publicHealth: 0.09,
  environment: 0.06,
  financialHealth: 0.09,
  projectDelivery: 0.08,
  emergencyPreparedness: 0.07,
  urbanResilience: 0.07,
}

function build$INDEX_LABELS(): Record<IndexDimensionId, string> {
  return {
  governance: t('Governance'),
  citizenServices: t('Citizen Services'),
  infrastructure: t('Infrastructure'),
  water: t('Water'),
  sanitation: t('Sanitation'),
  mobility: t('Mobility'),
  publicHealth: t('Public Health'),
  environment: t('Environment'),
  financialHealth: t('Financial Health'),
  projectDelivery: t('Project Delivery'),
  emergencyPreparedness: t('Emergency Preparedness'),
  urbanResilience: t('Urban Resilience'),
}
}
export let INDEX_LABELS: Record<IndexDimensionId, string> = build$INDEX_LABELS()
registerLayer(() => {
  INDEX_LABELS = build$INDEX_LABELS()
})

export interface IndexContributor {
  label: string
  /** Signed effect on the dimension score, in points. */
  effect: number
  detail: string
}

export interface IndexDimension {
  id: IndexDimensionId
  label: string
  score: number
  weight: number
  contribution: number
  /** Change against the prior-period baseline, in points. */
  trendPoints: number
  direction: 'improving' | 'stable' | 'deteriorating'
  confidence: ConfidenceLevel
  state: OperationalState
  positiveContributors: IndexContributor[]
  negativeContributors: IndexContributor[]
  explanation: string
  /** The datasets this dimension is computed from. */
  sources: string[]
}

export interface CityIntelligenceIndex {
  score: number
  state: OperationalState
  trendPoints: number
  direction: 'improving' | 'stable' | 'deteriorating'
  dimensions: IndexDimension[]
  /** Plain-language account of what moved the composite. */
  narrative: string
  strongest: IndexDimension | null
  weakest: IndexDimension | null
  mostImproved: IndexDimension | null
  mostDeteriorated: IndexDimension | null
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

function confidenceFor(sampleSize: number, sources: number): ConfidenceLevel {
  if (sampleSize >= 40 && sources >= 2) return 'high'
  if (sampleSize >= 12) return 'medium'
  return 'low'
}

/**
 * Deterministic prior-period baseline.
 *
 * The demonstration environment holds no time-series store, so the comparison
 * point is generated from a fixed seed per dimension. It is stable across
 * reloads and identical for every viewer, but it is a modelled baseline and
 * must never be presented as an observed history.
 */
function priorBaseline(id: IndexDimensionId, current: number): number {
  return clamp(current - det(`cii-baseline:${id}`).float(-7.5, 7.5))
}

interface DimensionInput {
  id: IndexDimensionId
  score: number
  positives: IndexContributor[]
  negatives: IndexContributor[]
  explanation: string
  sources: string[]
  sampleSize: number
}

function buildDimension(input: DimensionInput): IndexDimension {
  const score = clamp(input.score)
  const baseline = priorBaseline(input.id, score)
  const trendPoints = Math.round((score - baseline) * 10) / 10
  const weight = INDEX_WEIGHTS[input.id]

  return {
    id: input.id,
    label: INDEX_LABELS[input.id],
    score,
    weight,
    contribution: Math.round(score * weight * 10) / 10,
    trendPoints,
    direction: trendPoints > 1.5 ? 'improving' : trendPoints < -1.5 ? 'deteriorating' : 'stable',
    confidence: confidenceFor(input.sampleSize, input.sources.length),
    state: stateFor(score),
    positiveContributors: input.positives,
    negativeContributors: input.negatives,
    explanation: input.explanation,
    sources: input.sources,
  }
}

/** Builds all twelve dimensions from the corporation's records. */
export function cityIntelligenceIndex(): CityIntelligenceIndex {
  const dimensions: IndexDimension[] = []

  // --- Governance --------------------------------------------------------
  // 250 events was the volume a Brihanmumbai-sized audit trail was expected to
  // carry, and it was the right denominator while every collection in the
  // platform was Brihanmumbai-sized. The audit trail is now built to the
  // corporation's population, so a fixed denominator would score audit
  // completeness near zero for every smaller corporation - Jalna would read 8%,
  // not because its trail is thin but because Jalna is small. The target moves
  // with the corporation; Brihanmumbai's ratio is 1, so its figure is unchanged.
  const auditTarget = scaledCount(250, CITY_SCALE.population, 20)
  const auditCoverage = Math.min(100, (AUDIT_EVENTS.length / auditTarget) * 100)
  const deniedShare = (AUDIT_EVENTS.filter((e) => e.outcome === 'denied').length / Math.max(AUDIT_EVENTS.length, 1)) * 100
  const postureScore = SECURITY_POSTURE.authenticationHealth
  const governanceScore = auditCoverage * 0.5 + postureScore * 0.5
  dimensions.push(
    buildDimension({
      id: 'governance',
      score: governanceScore,
      sampleSize: AUDIT_EVENTS.length,
      sources: [t('Audit trail'), t('Security posture')],
      positives: [
        {
          label: t('Audit trail completeness'),
          effect: Math.round(auditCoverage * 0.5 * 10) / 10,
          detail: t('{0} audit events recorded, including denials - an audit trail showing only successful access is not an audit trail.', AUDIT_EVENTS.length),
        },
        {
          label: t('Security posture'),
          effect: Math.round(postureScore * 0.5 * 10) / 10,
          detail: t('Platform authentication and access health stands at {0}/100.', postureScore),
        },
      ],
      negatives:
        deniedShare > 12
          ? [
              {
                label: t('Elevated access denial rate'),
                effect: -Math.round(deniedShare * 10) / 10,
                detail: t('{0}% of recorded access attempts were denied. A high rate may indicate role assignments that do not match how officers actually work.', deniedShare.toFixed(1)),
              },
            ]
          : [],
      explanation: `Governance combines audit completeness with platform security posture. ${AUDIT_EVENTS.length} events are on record and posture stands at ${postureScore}/100.`,
    }),
  )

  // --- Citizen services --------------------------------------------------
  const sla = mean(SERVICE_HEALTH.map((s) => s.slaCompliancePct))
  const recurringPct = (COMPLAINTS.filter((c) => c.repeatCount > 0).length / Math.max(COMPLAINTS.length, 1)) * 100
  const reopenedPct = (COMPLAINTS.filter((c) => c.status === 'reopened').length / Math.max(COMPLAINTS.length, 1)) * 100
  const citizenScore = sla * 0.6 + (100 - recurringPct) * 0.25 + (100 - reopenedPct * 4) * 0.15
  dimensions.push(
    buildDimension({
      id: 'citizenServices',
      score: citizenScore,
      sampleSize: COMPLAINTS.length,
      sources: [t('Grievance register'), t('Service health')],
      positives: [
        {
          label: t('SLA compliance'),
          effect: Math.round(sla * 0.6 * 10) / 10,
          detail: t('Mean SLA compliance across every service category in every ward is {0}%.', sla.toFixed(1)),
        },
      ],
      negatives: [
        {
          label: t('Repeat reporting'),
          effect: -Math.round(recurringPct * 0.25 * 10) / 10,
          detail: t('{0}% of reports come from a locality that has reported the same service before - the clearest signal of closure without resolution.', recurringPct.toFixed(1)),
        },
        {
          label: t('Reopening rate'),
          effect: -Math.round(reopenedPct * 0.6 * 10) / 10,
          detail: t('{0}% of reports were reopened after being marked resolved.', reopenedPct.toFixed(1)),
        },
      ],
      explanation: `Citizen services weighs SLA compliance most heavily, then penalises repeat reporting and reopening - the two signals that a request was closed without its cause being fixed.`,
    }),
  )

  // --- Infrastructure ----------------------------------------------------
  const roadCondition = mean(ROAD_SEGMENTS.map((r) => r.conditionIndex))
  const openDefects = ROAD_DEFECTS.filter((d) => d.status !== 'repaired' && d.status !== 'verified-closed').length
  const defectPenalty = Math.min(30, (openDefects / Math.max(ROAD_SEGMENTS.length, 1)) * 60)
  const infraScore = roadCondition - defectPenalty
  dimensions.push(
    buildDimension({
      id: 'infrastructure',
      score: infraScore,
      sampleSize: ROAD_SEGMENTS.length,
      sources: [t('Road asset register'), t('Defect register')],
      positives: [
        {
          label: t('Mean road condition'),
          effect: Math.round(roadCondition * 10) / 10,
          detail: t('Mean condition index across {0} recorded road segments is {1}/100.', ROAD_SEGMENTS.length, roadCondition.toFixed(1)),
        },
      ],
      negatives: [
        {
          label: t('Open defect load'),
          effect: -Math.round(defectPenalty * 10) / 10,
          detail: t('{0} road defects remain open against {1} segments.', openDefects, ROAD_SEGMENTS.length),
        },
      ],
      explanation: `Infrastructure takes mean recorded road condition and subtracts the open defect load - condition alone would ignore work the corporation already knows is outstanding.`,
    }),
  )

  // --- Water -------------------------------------------------------------
  const deficitPct = mean(WATER_ZONES.map((z) => (z.deficitMld / Math.max(z.demandMld, 1)) * 100))
  const nrw = mean(WATER_ZONES.map((z) => z.nrwPct))
  const waterScore = 100 - deficitPct * 1.6 - Math.max(0, nrw - 20) * 1.2
  dimensions.push(
    buildDimension({
      id: 'water',
      score: waterScore,
      sampleSize: WATER_ZONES.length,
      sources: [t('Water zone register')],
      positives:
        deficitPct < 8
          ? [{ label: t('Supply meeting demand'), effect: 20, detail: t('Mean zonal deficit is {0}% of demand.', deficitPct.toFixed(1)) }]
          : [],
      negatives: [
        {
          label: t('Supply deficit'),
          effect: -Math.round(deficitPct * 1.6 * 10) / 10,
          detail: t('Mean supply deficit across {0} zones is {1}% of assessed demand.', WATER_ZONES.length, deficitPct.toFixed(1)),
        },
        {
          label: t('Non-revenue water'),
          effect: -Math.round(Math.max(0, nrw - 20) * 1.2 * 10) / 10,
          detail: t('Mean non-revenue water is {0}%, against a 20% reference threshold. NRW includes both physical loss and metering gaps.', nrw.toFixed(1)),
        },
      ],
      explanation: `Water penalises supply deficit against assessed demand and non-revenue water above the 20% reference threshold.`,
    }),
  )

  // --- Sanitation --------------------------------------------------------
  const wasteCoverage = mean(WASTE_WARD_PERFORMANCE.map((w) => w.coveragePct))
  const segregation = mean(WASTE_WARD_PERFORMANCE.map((w) => w.segregationPct))
  const treatment = mean(SEWERAGE_NODES.map((n) => n.treatmentCompliancePct))
  const sanitationScore = wasteCoverage * 0.4 + segregation * 0.25 + treatment * 0.35
  dimensions.push(
    buildDimension({
      id: 'sanitation',
      score: sanitationScore,
      sampleSize: WASTE_WARD_PERFORMANCE.length + SEWERAGE_NODES.length,
      sources: [t('Waste performance'), t('Sewerage register')],
      positives: [
        {
          label: t('Collection coverage'),
          effect: Math.round(wasteCoverage * 0.4 * 10) / 10,
          detail: t('Mean waste collection coverage is {0}%.', wasteCoverage.toFixed(1)),
        },
        {
          label: t('Treatment compliance'),
          effect: Math.round(treatment * 0.35 * 10) / 10,
          detail: t('Mean sewage treatment compliance is {0}%.', treatment.toFixed(1)),
        },
      ],
      negatives:
        segregation < 60
          ? [
              {
                label: t('Segregation at source'),
                effect: -Math.round((60 - segregation) * 0.25 * 10) / 10,
                detail: t('Mean segregation at source is {0}%, below the 60% operating expectation.', segregation.toFixed(1)),
              },
            ]
          : [],
      explanation: `Sanitation combines waste collection coverage, segregation at source and sewage treatment compliance.`,
    }),
  )

  // --- Mobility ----------------------------------------------------------
  const congestion = mean(TRAFFIC_CORRIDORS.map((c) => c.congestionIndex))
  const mobilityScore = 100 - congestion
  dimensions.push(
    buildDimension({
      id: 'mobility',
      score: mobilityScore,
      sampleSize: TRAFFIC_CORRIDORS.length,
      sources: [t('Traffic corridor register')],
      positives: [],
      negatives: [
        {
          label: t('Corridor congestion'),
          effect: -Math.round(congestion * 10) / 10,
          detail: t('Mean congestion index across {0} monitored corridors is {1}/100.', TRAFFIC_CORRIDORS.length, congestion.toFixed(1)),
        },
      ],
      explanation: `Mobility is the inverse of mean corridor congestion across the monitored network. It covers arterial corridors only and does not represent the whole road network.`,
    }),
  )

  // --- Public health -----------------------------------------------------
  const outbreakSignal = mean(HEALTH_INDICATORS.map((h) => h.outbreakSignal))
  const risingIndicators = HEALTH_INDICATORS.filter((h) => h.changePct > 15).length
  const healthScore = 100 - outbreakSignal * 0.8 - Math.min(25, risingIndicators * 0.8)
  dimensions.push(
    buildDimension({
      id: 'publicHealth',
      score: healthScore,
      sampleSize: HEALTH_INDICATORS.length,
      sources: [t('Aggregate health indicators')],
      positives: [],
      negatives: [
        {
          label: t('Outbreak signal'),
          effect: -Math.round(outbreakSignal * 0.8 * 10) / 10,
          detail: t('Mean outbreak signal across ward-level aggregate indicators is {0}/100. These are aggregate indicators only - no patient-level data is held.', outbreakSignal.toFixed(1)),
        },
        {
          label: t('Rising indicators'),
          effect: -Math.round(Math.min(25, risingIndicators * 0.8) * 10) / 10,
          detail: t('{0} ward-level indicators rose more than 15% against the prior period.', risingIndicators),
        },
      ],
      explanation: `Public health is computed from aggregate ward-level indicators only. It is a service-planning signal for the corporation, never a clinical or diagnostic statement.`,
    }),
  )

  // --- Environment -------------------------------------------------------
  const aqi = mean(AIR_QUALITY_STATIONS.map((s) => s.aqi))
  const environmentScore = 100 - Math.min(100, (aqi / 300) * 100)
  dimensions.push(
    buildDimension({
      id: 'environment',
      score: environmentScore,
      sampleSize: AIR_QUALITY_STATIONS.length,
      sources: [t('Air quality stations')],
      positives: aqi < 100 ? [{ label: t('Air quality within moderate band'), effect: 15, detail: t('Mean AQI is {0}.', aqi.toFixed(0)) }] : [],
      negatives: [
        {
          label: t('Ambient air quality'),
          effect: -Math.round(Math.min(100, (aqi / 300) * 100) * 10) / 10,
          detail: t('Mean AQI across {0} monitoring locations is {1}, normalised against a 300 reference ceiling.', AIR_QUALITY_STATIONS.length, aqi.toFixed(0)),
        },
      ],
      explanation: `Environment is currently driven by ambient air quality. Air quality is strongly seasonal, so a movement here is often meteorological rather than a change in municipal performance.`,
    }),
  )

  // --- Financial health --------------------------------------------------
  const budget = budgetTotals()
  const revenue = revenueTotals()
  const budgetAlignment = 100 - Math.min(100, Math.abs(budget.utilisationPct - 31) * 2.4)
  const revenueAlignment = Math.min(100, (revenue.efficiencyPct / 40) * 100)
  const financialScore = budgetAlignment * 0.5 + revenueAlignment * 0.5
  dimensions.push(
    buildDimension({
      id: 'financialHealth',
      score: financialScore,
      sampleSize: 60,
      sources: [t('Budget ledger'), t('Revenue ledger')],
      positives: [
        {
          label: t('Collection efficiency'),
          effect: Math.round(revenueAlignment * 0.5 * 10) / 10,
          detail: t('Year-to-date collection efficiency is {0}%.', revenue.efficiencyPct.toFixed(1)),
        },
      ],
      negatives: [
        {
          label: t('Budget alignment against phased plan'),
          effect: -Math.round((100 - budgetAlignment) * 0.5 * 10) / 10,
          detail: t('Utilisation stands at {0}% against roughly 31% of the financial year elapsed.', budget.utilisationPct.toFixed(1)),
        },
      ],
      explanation: `Financial health weighs budget alignment against the phased plan equally with year-to-date collection efficiency. The full decomposition is on the Financial Intelligence screen.`,
    }),
  )

  // --- Project delivery --------------------------------------------------
  const active = PROJECTS.filter((p) => p.status !== 'completed' && p.status !== 'closed')
  const onTrack = active.filter((p) => p.riskScore < 55).length
  const deliveryScore = active.length > 0 ? (onTrack / active.length) * 100 : 70
  dimensions.push(
    buildDimension({
      id: 'projectDelivery',
      score: deliveryScore,
      sampleSize: active.length,
      sources: [t('Project register')],
      positives: [
        {
          label: t('Works within risk threshold'),
          effect: Math.round(deliveryScore * 10) / 10,
          detail: t('{0} of {1} active capital works carry a composite risk score below the 55-point attention threshold.', onTrack, active.length),
        },
      ],
      negatives: [
        {
          label: t('Works above threshold'),
          effect: -Math.round((100 - deliveryScore) * 10) / 10,
          detail: t('{0} active works sit at or above the attention threshold.', active.length - onTrack),
        },
      ],
      explanation: `Project delivery is the share of active capital works whose composite risk score sits below the 55-point attention threshold.`,
    }),
  )

  // --- Emergency preparedness --------------------------------------------
  const emergencyReadiness = mean(EMERGENCY_STATIONS.map((s) => s.readinessIndex))
  const responseMinutes = mean(EMERGENCY_STATIONS.map((s) => s.avgResponseMinutes))
  const emergencyScore = emergencyReadiness * 0.7 + Math.max(0, 100 - responseMinutes * 6) * 0.3
  dimensions.push(
    buildDimension({
      id: 'emergencyPreparedness',
      score: emergencyScore,
      sampleSize: EMERGENCY_STATIONS.length,
      sources: [t('Emergency station register')],
      positives: [
        {
          label: t('Station readiness'),
          effect: Math.round(emergencyReadiness * 0.7 * 10) / 10,
          detail: t('Mean readiness index across {0} stations is {1}/100.', EMERGENCY_STATIONS.length, emergencyReadiness.toFixed(1)),
        },
      ],
      negatives: [
        {
          label: t('Mean response time'),
          effect: -Math.round(Math.min(100, responseMinutes * 6) * 0.3 * 10) / 10,
          detail: t('Mean recorded response time is {0} minutes.', responseMinutes.toFixed(1)),
        },
      ],
      explanation: `Emergency preparedness weighs station readiness against recorded mean response time.`,
    }),
  )

  // --- Urban resilience --------------------------------------------------
  const monsoonReadiness = mean(WARD_MONSOON_READINESS.map((r) => r.readinessScore))
  const wardsBelow = WARD_MONSOON_READINESS.filter((r) => r.readinessScore < 60).length
  // The penalty is taken as the SHARE of wards below the threshold, not the
  // count. A flat 1.2 points per ward was sized against Brihanmumbai's
  // twenty-four; applied unchanged to a six-ward corporation it would cap the
  // penalty at 7 points where Brihanmumbai carries 29, so half of a small
  // corporation's wards failing would cost it less than a fifth of
  // Brihanmumbai's. At twenty-four wards this is exactly the original figure.
  const wardShareBelow = wardsBelow / Math.max(WARD_MONSOON_READINESS.length, 1)
  const resilienceScore = monsoonReadiness - wardShareBelow * 28.8
  dimensions.push(
    buildDimension({
      id: 'urbanResilience',
      score: resilienceScore,
      sampleSize: WARD_MONSOON_READINESS.length,
      sources: [t('Ward monsoon readiness')],
      positives: [
        {
          label: t('Mean ward readiness'),
          effect: Math.round(monsoonReadiness * 10) / 10,
          detail: t('Mean ward monsoon readiness is {0}/100.', monsoonReadiness.toFixed(1)),
        },
      ],
      negatives: [
        {
          label: t('Wards below threshold'),
          effect: -Math.round(wardsBelow * 1.2 * 10) / 10,
          detail: t('{0} of {1} wards sit below the 60-point readiness threshold.', wardsBelow, WARDS.length),
        },
      ],
      explanation: t(
        "Urban resilience currently reflects monsoon readiness, which is {0}'s dominant recurring hazard. The full multi-hazard picture is on the Urban Resilience screen.",
        t(activeCorporation.city),
      ),
    }),
  )

  // --- Composite ----------------------------------------------------------
  const score = clamp(dimensions.reduce((s, d) => s + d.contribution, 0))
  const trendPoints =
    Math.round(dimensions.reduce((s, d) => s + d.trendPoints * d.weight, 0) * 10) / 10

  const sorted = [...dimensions].sort((a, b) => b.score - a.score)
  const byTrend = [...dimensions].sort((a, b) => b.trendPoints - a.trendPoints)
  const strongest = sorted[0] ?? null
  const weakest = sorted[sorted.length - 1] ?? null
  const mostImproved = byTrend[0] ?? null
  const mostDeteriorated = byTrend[byTrend.length - 1] ?? null

  const narrative =
    strongest && weakest && mostImproved && mostDeteriorated
      ? t('The index stands at {0}/100, {1} {2} points against the prior-period baseline. It is held up chiefly by {3} ({4}/100) and held back chiefly by {5} ({6}/100). {7} improved most ({8}{9} points); {10} weakened most ({11} points).', score, trendPoints >= 0 ? 'up' : 'down', Math.abs(trendPoints).toFixed(1), strongest.label.toLowerCase(), strongest.score, weakest.label.toLowerCase(), weakest.score, mostImproved.label, mostImproved.trendPoints >= 0 ? '+' : '', mostImproved.trendPoints, mostDeteriorated.label.toLowerCase(), mostDeteriorated.trendPoints)
      : t('The index stands at {0}/100.', score)

  return {
    score,
    state: stateFor(score),
    trendPoints,
    direction: trendPoints > 1 ? 'improving' : trendPoints < -1 ? 'deteriorating' : 'stable',
    dimensions,
    narrative,
    strongest,
    weakest,
    mostImproved,
    mostDeteriorated,
  }
}
