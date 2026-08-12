import type { ConfidenceLevel, IntelligenceDomain, Severity } from '@/types/common'
import { WARDS, WARD_BY_ID, departmentName, wardName } from '@/data/reference'
import {
  READINESS_BY_WARD,
  ROAD_SEGMENTS,
  TRAFFIC_CORRIDORS,
  WASTE_WARD_PERFORMANCE,
  WATER_ZONES,
  wardDrainageRisk,
  wardRoadCondition,
} from '@/data/city.data'
import { HEALTH_INDICATORS, HOSPITALS } from '@/data/social.data'
import { BUDGET_LINES, CONTRACTOR_BY_ID, PROJECTS } from '@/data/finance.data'
import { MUNICIPAL_ASSETS, wardComplaintSummary } from '@/data/operations.data'
import { CITY_SCALE, scaledCount } from '@/data/scale'
import { formatCompact, formatCrore } from '@/utils/format'
import { t } from '@/i18n'

/**
 * Cross-domain correlation engine.
 *
 * These insights are the platform's central claim: exposures that no single
 * departmental view reveals. Every insight carries an explicit caveat, because
 * a correlation identifies a review candidate - never a cause, and never a
 * finding against any person or organisation.
 */

export interface CrossDomainInsight {
  id: string
  title: string
  narrative: string
  inputs: Array<{ domain: IntelligenceDomain; signal: string; value: string }>
  conclusion: string
  severity: Severity
  confidence: ConfidenceLevel
  wardIds: string[]
  caveat: string
}

const CORRELATION_CAVEAT =
  'This insight combines independent signals observed on the same geography. Correlation does not establish causation. It identifies a review candidate requiring assessment by the accountable departments - it is not a finding, and makes no assertion about the conduct of any person or organisation.'

/**
 * Normalises an absolute count or money figure against the volume a corporation
 * of this size actually carries, returning 0-100.
 *
 * The ceilings this replaces - `open complaints × 1.4`, `hotspots × 9`,
 * `exposure ÷ 24` - were written when every collection in the platform was
 * Brihanmumbai-sized, and they saturate at a Brihanmumbai burden. Left alone
 * they read a small corporation's genuinely serious exposure as mild: its worst
 * ward might carry four open complaints where Brihanmumbai's carries four
 * hundred, score eight points where Brihanmumbai scores a hundred, and the
 * severity stamped on the insight would follow the arithmetic rather than the
 * situation. `referenceCeiling` is the Brihanmumbai figure at which the term
 * saturated; it is scaled by the same ratio the data layer used to build the
 * collection, so both sides are measured on the same footing. Brihanmumbai's
 * own ratios are 1, so its scores are unchanged.
 */
function pressure(count: number, referenceCeiling: number, ratio: number, floor: number): number {
  return Math.min(100, (count / scaledCount(referenceCeiling, ratio, floor)) * 100)
}

function severityFrom(score: number): Severity {
  if (score >= 78) return 'critical'
  if (score >= 62) return 'high'
  if (score >= 44) return 'medium'
  return 'low'
}

/** (a) Integrated urban flood risk affecting hospital access. */
function integratedFloodAccess(): CrossDomainInsight | null {
  const candidates = WARDS.filter((w) => w.floodProne)
    .map((ward) => {
      const readiness = READINESS_BY_WARD.get(ward.id)
      const drainage = wardDrainageRisk(ward.id)
      const roads = wardRoadCondition(ward.id)
      const wardHospitals = HOSPITALS.filter((h) => h.wardId === ward.id && (h.type === 'major' || h.type === 'peripheral'))
      const corridor = TRAFFIC_CORRIDORS.find((c) => c.wardIds.includes(ward.id))
      const emergencyRoutes = ROAD_SEGMENTS.filter((r) => r.wardId === ward.id && r.emergencyRoute && r.hospitalAccess)
      if (wardHospitals.length === 0 || emergencyRoutes.length === 0) return null

      const score =
        drainage * 0.3 +
        (100 - roads) * 0.2 +
        (100 - (readiness?.readinessScore ?? 60)) * 0.2 +
        (corridor?.congestionIndex ?? 40) * 0.15 +
        ward.riskScore * 0.15
      return { ward, score, drainage, roads, readiness, corridor, wardHospitals, emergencyRoutes }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score)

  const top = candidates[0]
  if (!top) return null

  const hospital = top.wardHospitals[0]
  const route = top.emergencyRoutes[0]

  return {
    id: 'xd-flood-hospital-access',
    title: t('Integrated urban risk - hospital approach exposure in {0}', wardName(top.ward.id)),
    narrative:
      `Six independent signals converge on ${wardName(top.ward.id)}. The ward is classified as flood-prone with ${top.ward.waterloggingSpots} chronic waterlogging locations. ` +
      `Drain blockage risk stands at ${top.drainage}/100 against a monsoon readiness score of ${top.readiness?.readinessScore ?? 0}/100. ` +
      `The primary approach to ${hospital?.name ?? t('the ward hospital')} runs over ${route?.name ?? t('a designated emergency corridor')}, whose condition index is ${route?.conditionIndex ?? 0}/100 with ${route?.openDefects ?? 0} open defects. ` +
      `${top.corridor ? t('Peak-hour speed on {0} has degraded to {1} km/h against a free-flow speed of {2} km/h. ', top.corridor.name, top.corridor.peakSpeedKmph, top.corridor.freeFlowSpeedKmph) : ''}` +
      `Under a heavy-rain and high-tide coincidence, the modelled result is that the single primary approach becomes impassable while gravity discharge is simultaneously obstructed.`,
    inputs: [
      { domain: 'monsoon', signal: 'Chronic waterlogging locations', value: String(top.ward.waterloggingSpots) },
      { domain: 'stormwater', signal: 'Drain blockage risk', value: `${top.drainage}/100` },
      { domain: 'roads', signal: 'Emergency corridor condition', value: `${route?.conditionIndex ?? 0}/100` },
      { domain: 'hospitals', signal: 'Facility accessibility index', value: `${hospital?.accessibilityIndex ?? 0}/100` },
      { domain: 'mobility', signal: 'Corridor peak speed', value: `${top.corridor?.peakSpeedKmph ?? 0} km/h` },
      { domain: 'wards', signal: 'Ward composite risk', value: `${top.ward.riskScore}/100` },
    ],
    conclusion:
      'The exposure is a single-route dependency, not a drainage problem or a road problem in isolation. Designating and pre-clearing an alternate ambulance approach removes the dependency; dewatering capacity at the constraint point shortens the loss-of-access window.',
    severity: severityFrom(top.score),
    confidence: 'medium',
    wardIds: [top.ward.id],
    caveat: CORRELATION_CAVEAT,
  }
}

/** (b) Service-delivery review candidate. */
function serviceDeliveryReview(): CrossDomainInsight | null {
  const candidates = PROJECTS.filter((p) => p.status === 'delayed' || p.riskScore >= 60)
    .map((project) => {
      const wardId = project.wardIds[0]
      if (!wardId) return null
      const ward = WARD_BY_ID.get(wardId)
      if (!ward) return null
      const complaints = wardComplaintSummary(wardId)
      const roadDefects = ROAD_SEGMENTS.filter((r) => r.wardId === wardId).reduce((s, r) => s + r.repeatFailures, 0)
      const paymentLead = Math.max(0, (project.paidCrore / Math.max(project.currentCostCrore, 0.1)) * 100 - project.completionPct)
      const contractor = CONTRACTOR_BY_ID.get(project.contractorId)
      const score =
        project.riskScore * 0.32 +
        pressure(complaints.open, 71, CITY_SCALE.population, 4) * 0.2 +
        pressure(roadDefects, 7, CITY_SCALE.population, 2) * 0.16 +
        Math.min(100, paymentLead * 2.6) * 0.2 +
        (100 - (contractor?.performanceIndex ?? 70)) * 0.12
      return { project, ward, complaints, roadDefects, paymentLead, contractor, score }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score)

  const top = candidates[0]
  if (!top) return null

  return {
    id: 'xd-service-delivery-review',
    title: t('Service-delivery review candidate - {0}', wardName(top.ward.id)),
    narrative:
      `Five signals coincide on ${top.project.reference} in ${wardName(top.ward.id)}. ` +
      `Composite project risk is ${top.project.riskScore}/100 with physical progress at ${top.project.completionPct}% against a phased plan of ${top.project.plannedCompletionPct}%. ` +
      `Financial progress leads physical progress by ${top.paymentLead.toFixed(0)} percentage points. ` +
      `${top.complaints.open} citizen complaints are open in the ward with a repeat rate of ${top.complaints.repeatRate.toFixed(0)}%, and ${top.roadDefects} repeat surface failures are recorded on the same alignment. ` +
      `The executing agency carries a delivery index of ${top.contractor?.performanceIndex ?? 0}/100 across all its active contracts.`,
    inputs: [
      { domain: 'projects', signal: 'Composite project risk', value: `${top.project.riskScore}/100` },
      { domain: 'budget', signal: 'Payment / progress lead', value: `${top.paymentLead.toFixed(0)} pp` },
      { domain: 'wards', signal: 'Open complaints', value: String(top.complaints.open) },
      { domain: 'roads', signal: 'Repeat surface failures', value: String(top.roadDefects) },
      { domain: 'procurement', signal: 'Executing agency delivery index', value: `${top.contractor?.performanceIndex ?? 0}/100` },
    ],
    conclusion:
      'The signals span engineering and finance. A joint technical and financial review avoids each function assessing only its own fragment. Payment release should be verified against physical measurement before the review concludes - a control step, not a finding.',
    severity: severityFrom(top.score),
    confidence: 'medium',
    wardIds: [top.ward.id],
    caveat: CORRELATION_CAVEAT,
  }
}

/** (c) Water supply reliability exposure. */
function waterReliabilityExposure(): CrossDomainInsight | null {
  const candidates = WATER_ZONES.map((zone) => {
    const wardIds = zone.wardIds
    const complaints = wardIds.reduce((s, id) => s + wardComplaintSummary(id).open, 0)
    const score =
      Math.min(100, (zone.deficitMld / Math.max(zone.demandMld, 1)) * 300) * 0.34 +
      Math.max(0, 100 - zone.pressureM * 5.2) * 0.26 +
      pressure(zone.tankerTripsPerDay, 71, CITY_SCALE.population, 4) * 0.22 +
      pressure(complaints, 111, CITY_SCALE.population, 6) * 0.18
    return { zone, complaints, score }
  }).sort((a, b) => b.score - a.score)

  const top = candidates[0]
  if (!top) return null

  return {
    id: 'xd-water-reliability',
    title: t('Supply reliability exposure - {0}', top.zone.name),
    narrative:
      `${top.zone.name} shows a supply deficit of ${top.zone.deficitMld.toFixed(1)} MLD against assessed demand of ${top.zone.demandMld.toFixed(1)} MLD. ` +
      `Tail-end network pressure averages ${top.zone.pressureM.toFixed(1)} m over a supply window of ${top.zone.supplyHours.toFixed(1)} hours, and tanker dependency has reached ${top.zone.tankerTripsPerDay} trips per day. ` +
      `Non-revenue water stands at ${top.zone.nrwPct.toFixed(1)}%, and ${top.complaints} service complaints are currently open across the wards the zone serves. ` +
      `Structural loss and operational shortfall are therefore presenting together rather than independently.`,
    inputs: [
      { domain: 'water', signal: 'Supply deficit', value: `${top.zone.deficitMld.toFixed(1)} MLD` },
      { domain: 'water', signal: 'Tail-end pressure', value: `${top.zone.pressureM.toFixed(1)} m` },
      { domain: 'water', signal: 'Non-revenue water', value: `${top.zone.nrwPct.toFixed(1)}%` },
      { domain: 'water', signal: 'Tanker dependency', value: `${top.zone.tankerTripsPerDay} trips/day` },
      { domain: 'wards', signal: 'Open service complaints', value: String(top.complaints) },
    ],
    conclusion:
      'Operational rebalancing addresses the immediate pressure shortfall; a district metered area survey localises the network loss. Meeting the shortfall through additional tanker provision alone converts a network problem into a recurring operating cost without resolving it.',
    severity: severityFrom(top.score),
    confidence: 'medium',
    wardIds: top.zone.wardIds,
    caveat: CORRELATION_CAVEAT,
  }
}

/** (d) Sanitation and vector-borne health exposure. */
function sanitationHealthExposure(): CrossDomainInsight | null {
  const candidates = WARDS.map((ward) => {
    const waste = WASTE_WARD_PERFORMANCE.find((w) => w.wardId === ward.id)
    const vector = HEALTH_INDICATORS.filter(
      (h) => h.wardId === ward.id && (h.disease === 'dengue' || h.disease === 'leptospirosis' || h.disease === 'malaria'),
    ).sort((a, b) => b.outbreakSignal - a.outbreakSignal)[0]
    if (!waste || !vector) return null
    const score =
      Math.min(100, (100 - waste.coveragePct) * 3.4) * 0.28 +
      pressure(waste.hotspots, 11, CITY_SCALE.population, 3) * 0.26 +
      vector.outbreakSignal * 0.34 +
      (ward.floodProne ? 60 : 20) * 0.12
    return { ward, waste, vector, score }
  })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score)

  const top = candidates[0]
  if (!top) return null

  return {
    id: 'xd-sanitation-health',
    title: t('Sanitation and vector-borne exposure - {0}', wardName(top.ward.id)),
    narrative:
      `In ${wardName(top.ward.id)}, solid waste collection coverage stands at ${top.waste.coveragePct.toFixed(1)}% with ${top.waste.hotspots} recurring accumulation hotspots and ${top.waste.missedCollections7d} missed collections in the last seven days. ` +
      `Over the same period the aggregate ${top.vector.disease} signal has moved to ${top.vector.outbreakSignal}/100, a ${top.vector.changePct.toFixed(0)}% change against the previous reporting period. ` +
      `${top.ward.floodProne ? t('The ward is flood-prone, and water stagnation reports are elevated in the same locality cluster. ') : ''}` +
      `These are aggregate indicators only; no individual-level health information exists anywhere in the platform.`,
    inputs: [
      { domain: 'waste', signal: 'Collection coverage', value: `${top.waste.coveragePct.toFixed(1)}%` },
      { domain: 'waste', signal: 'Recurring hotspots', value: String(top.waste.hotspots) },
      { domain: 'health', signal: `${top.vector.disease} outbreak signal`, value: `${top.vector.outbreakSignal}/100` },
      { domain: 'health', signal: 'Period-on-period change', value: `${top.vector.changePct.toFixed(0)}%` },
      { domain: 'monsoon', signal: 'Ward flood exposure', value: top.ward.floodProne ? t('Flood-prone') : t('Limited') },
    ],
    conclusion:
      'Intensifying vector control in the specific locality cluster is more effective than uniform ward-wide activity. Clearing the co-located accumulation points addresses a plausible contributing factor while the epidemiological assessment proceeds independently.',
    severity: severityFrom(top.score),
    confidence: 'low',
    wardIds: [top.ward.id],
    caveat: `${CORRELATION_CAVEAT} Health indicators are aggregate ward-level counts. No causal relationship between sanitation condition and case counts is asserted here.`,
  }
}

/** (e) Capital under-utilisation and delivery slippage. */
function capitalUnderUtilisation(): CrossDomainInsight | null {
  const trailing = BUDGET_LINES.filter((b) => b.head === 'capital' && b.variancePct > 18).sort(
    (a, b) => b.variancePct - a.variancePct,
  )
  const worst = trailing[0]
  if (!worst) return null

  const deptProjects = PROJECTS.filter((p) => p.departmentId === worst.departmentId)
  const delayed = deptProjects.filter((p) => p.status === 'delayed')
  const exposure = deptProjects.reduce((s, p) => s + p.sanctionedCostCrore, 0)
  const affectedWards = Array.from(new Set(deptProjects.flatMap((p) => p.wardIds))).slice(0, 6)

  const score =
    Math.min(100, worst.variancePct * 1.7) * 0.45 +
    Math.min(100, (delayed.length / Math.max(deptProjects.length, 1)) * 160) * 0.35 +
    pressure(exposure, 2400, CITY_SCALE.budget, 40) * 0.2

  return {
    id: 'xd-capital-under-utilisation',
    title: t('Capital under-utilisation with delivery slippage - {0}', departmentName(worst.departmentId)),
    narrative:
      `${departmentName(worst.departmentId)} capital expenditure trails the phased plan by ${worst.variancePct.toFixed(1)} percentage points at the reporting date, with utilisation at ${worst.utilisationPct.toFixed(1)}% of the revised allocation. ` +
      `Across the same department, ${delayed.length} of ${deptProjects.length} capital works are recorded as delayed, carrying a combined sanctioned exposure of ${formatCrore(exposure)}. ` +
      `The under-spend therefore appears to reflect delivery capacity rather than accounting lag - which means the phasing itself, not merely the reporting, requires correction.`,
    inputs: [
      { domain: 'budget', signal: 'Variance against phased plan', value: `${worst.variancePct.toFixed(1)} pp` },
      { domain: 'budget', signal: 'Utilisation', value: `${worst.utilisationPct.toFixed(1)}%` },
      { domain: 'projects', signal: 'Delayed works', value: `${delayed.length} of ${deptProjects.length}` },
      { domain: 'projects', signal: 'Sanctioned exposure', value: formatCrore(exposure) },
      { domain: 'wards', signal: 'Wards affected', value: String(affectedWards.length) },
    ],
    conclusion:
      'Re-phasing realistically and advancing works that already hold clearances and appointed agencies recovers part of the annual position. Retaining a phasing already known to be unachievable weakens the value of the reporting itself.',
    severity: severityFrom(score),
    confidence: 'high',
    wardIds: affectedWards,
    caveat: CORRELATION_CAVEAT,
  }
}

/** (f) Asset lifecycle exposure with no programme entry. */
function assetLifecycleExposure(): CrossDomainInsight | null {
  const exposed = MUNICIPAL_ASSETS.filter(
    (a) =>
      2026 - a.installedYear > a.designLifeYears &&
      a.conditionIndex < 45 &&
      (a.criticality === 'critical' || a.criticality === 'high'),
  )
  if (exposed.length === 0) return null

  const totalValue = exposed.reduce((s, a) => s + a.replacementValueCrore, 0)
  const wardIds = Array.from(new Set(exposed.map((a) => a.wardId))).slice(0, 8)
  const byCategory = new Map<string, number>()
  for (const asset of exposed) byCategory.set(asset.category, (byCategory.get(asset.category) ?? 0) + 1)
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]

  const score =
    pressure(exposed.length, 42, CITY_SCALE.area, 4) * 0.4 +
    pressure(totalValue, 600, CITY_SCALE.budget, 15) * 0.3 +
    62 * 0.3

  return {
    id: 'xd-asset-lifecycle',
    title: t('Asset lifecycle exposure without a funded replacement programme'),
    narrative:
      `${exposed.length} municipal assets satisfy all three exposure conditions simultaneously: past design life, condition index below 45 and criticality assessed as high or critical. ` +
      `Their combined replacement value is ${formatCrore(totalValue)}, spread across ${wardIds.length} wards. ` +
      `${topCategory ? t('The largest concentration is in {0} assets ({1} records). ', topCategory[0].replace('-', ' '), topCategory[1] as number) : ''}` +
      `Assets meeting all three conditions accumulate unquantified failure risk each year they remain outside the capital programme, and that risk is not visible in any single departmental view.`,
    inputs: [
      { domain: 'assets', signal: 'Assets past design life', value: String(exposed.length) },
      { domain: 'assets', signal: 'Condition below threshold', value: 'All exposed assets' },
      { domain: 'assets', signal: 'Combined replacement value', value: formatCrore(totalValue) },
      { domain: 'budget', signal: 'Capital programme entry', value: 'Absent' },
      { domain: 'wards', signal: 'Wards affected', value: String(wardIds.length) },
    ],
    conclusion:
      'Entering the cohort into the next capital programme cycle converts an unquantified failure exposure into a funded, sequenced replacement pipeline. Programme competition may defer lower-criticality assets, which is a decision for the competent authority rather than an engine output.',
    severity: severityFrom(score),
    confidence: 'high',
    wardIds,
    caveat: CORRELATION_CAVEAT,
  }
}

/** (g) Emergency response drift against corridor degradation. */
function emergencyResponseDrift(): CrossDomainInsight | null {
  const corridor = [...TRAFFIC_CORRIDORS].sort((a, b) => b.congestionIndex - a.congestionIndex)[0]
  if (!corridor) return null
  const wardId = corridor.wardIds[0]
  if (!wardId) return null
  const roads = wardRoadCondition(wardId)
  const populationExposed = corridor.wardIds.reduce((s, id) => s + (WARD_BY_ID.get(id)?.population ?? 0), 0)

  const score =
    corridor.congestionIndex * 0.42 +
    (100 - roads) * 0.28 +
    pressure(corridor.incidents30d, 45, CITY_SCALE.population, 4) * 0.3

  return {
    id: 'xd-emergency-corridor',
    title: t('Emergency access degradation along {0}', corridor.name),
    narrative:
      `Peak-hour speed on ${corridor.name} has fallen to ${corridor.peakSpeedKmph} km/h against a free-flow speed of ${corridor.freeFlowSpeedKmph} km/h, a congestion index of ${corridor.congestionIndex}. ` +
      `Mean road condition across the wards it serves is ${roads}/100, and ${corridor.incidents30d} traffic incidents plus ${corridor.closures} closures have been recorded in the last 30 days. ` +
      `The corridor serves ${formatCompact(populationExposed)} residents across ${corridor.wardIds.length} wards and forms part of the emergency access network for those wards.`,
    inputs: [
      { domain: 'mobility', signal: 'Congestion index', value: String(corridor.congestionIndex) },
      { domain: 'mobility', signal: 'Peak-hour speed', value: `${corridor.peakSpeedKmph} km/h` },
      { domain: 'roads', signal: 'Mean road condition', value: `${roads}/100` },
      { domain: 'emergency', signal: 'Incidents (30 days)', value: String(corridor.incidents30d) },
      { domain: 'wards', signal: 'Population served', value: formatCompact(populationExposed) },
    ],
    conclusion:
      'Corridor degradation affects emergency response time independently of station readiness. Signal restoration and compression of active works are the directly controllable contributions; utility agency programmes are outside municipal control and require coordination rather than instruction.',
    severity: severityFrom(score),
    confidence: 'medium',
    wardIds: corridor.wardIds,
    caveat: CORRELATION_CAVEAT,
  }
}

export function buildCrossDomainInsights(): CrossDomainInsight[] {
  return [
    integratedFloodAccess(),
    serviceDeliveryReview(),
    waterReliabilityExposure(),
    sanitationHealthExposure(),
    capitalUnderUtilisation(),
    assetLifecycleExposure(),
    emergencyResponseDrift(),
  ]
    .filter((x): x is CrossDomainInsight => x !== null)
    .sort((a, b) => {
      const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
      return rank[a.severity] - rank[b.severity]
    })
}

export { CORRELATION_CAVEAT }
