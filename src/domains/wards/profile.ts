import type { ConfidenceLevel, OperationalState } from '@/types/common'
import type { Ward } from '@/types/organisation'
import type { Project } from '@/types/finance'
import type { Complaint, Incident, MunicipalAsset, ServiceHealth, WorkforceUnit } from '@/types/operations'
import type { HealthIndicator } from '@/types/city-domains'
import { WARDS, WARD_BY_ID, wardName } from '@/data/reference'
import {
  READINESS_BY_WARD,
  wardDrainageRisk,
  wardRoadCondition,
  wardWastePerformance,
  wardWaterZone,
  topDefectsForWard,
} from '@/data/city.data'
import { wardHealthSignals } from '@/data/social.data'
import { CONTRACTOR_BY_ID, wardBudgetPosition, wardProjects, wardRevenue } from '@/data/finance.data'
import {
  COMPLAINTS,
  INCIDENTS,
  MUNICIPAL_ASSETS,
  SERVICE_HEALTH,
  WORKFORCE_UNITS,
  wardComplaintSummary,
} from '@/data/operations.data'
import { INTELLIGENCE_ITEMS } from '@/data/intelligence.data'
import { DEMO_NOW } from '@/utils/deterministic'
import type { IntelligenceItem } from '@/types/intelligence'
import { t } from '@/i18n'

/**
 * Ward composite profile.
 *
 * The single structure a Ward Intelligence surface needs, assembled from every
 * domain so that one ward is presented as a coherent operational picture rather
 * than a set of disconnected departmental readings.
 */

export interface WardProfile {
  ward: Ward
  healthScore: number
  riskScore: number
  state: OperationalState
  services: {
    complaints: { open: number; slaBreached: number; resolvedRate: number; repeatRate: number }
    byCategory: ServiceHealth[]
    worstCategory: ServiceHealth | undefined
  }
  water: {
    zoneName: string
    supplyMld: number
    demandMld: number
    deficitMld: number
    pressureM: number
    supplyHours: number
    nrwPct: number
    qualityCompliancePct: number
    tankerTripsPerDay: number
    reliabilityScore: number
    anomalies: string[]
    state: OperationalState
  } | null
  waste: {
    coveragePct: number
    segregationPct: number
    missedCollections7d: number
    hotspots: number
    vehiclesDeployed: number
    state: OperationalState
  } | null
  roads: {
    conditionIndex: number
    topDefects: ReturnType<typeof topDefectsForWard>
    openDefects: number
  }
  drainage: {
    riskScore: number
    readinessScore: number
    desiltingPct: number
    pumpReadiness: number
    floodSpots: number
    gaps: string[]
  }
  health: {
    topSignals: HealthIndicator[]
    highestSignal: number
  }
  projects: {
    total: number
    atRisk: number
    delayed: number
    sanctionedCrore: number
    paidCrore: number
    items: Project[]
  }
  finance: {
    revenueTargetCrore: number
    revenueCollectedCrore: number
    collectionEfficiencyPct: number
    arrearsCrore: number
    budgetAllocatedCrore: number
    budgetSpentCrore: number
    budgetUtilisationPct: number
  }
  assets: {
    total: number
    poorCondition: number
    pastDesignLife: number
    inspectionsOverdue: number
    replacementValueCrore: number
    items: MunicipalAsset[]
  }
  workforce: WorkforceUnit[]
  contractors: Array<{ id: string; name: string; performanceIndex: number; activeContracts: number }>
  incidents: Incident[]
  openIntelligence: IntelligenceItem[]
  recentComplaints: Complaint[]
}

export function buildWardProfile(wardId: string): WardProfile | null {
  const ward = WARD_BY_ID.get(wardId)
  if (!ward) return null

  const zone = wardWaterZone(wardId)
  const waste = wardWastePerformance(wardId)
  const readiness = READINESS_BY_WARD.get(wardId)
  const projects = wardProjects(wardId)
  const revenue = wardRevenue(wardId)
  const budget = wardBudgetPosition(wardId)
  const assets = MUNICIPAL_ASSETS.filter((a) => a.wardId === wardId)
  const serviceRows = SERVICE_HEALTH.filter((s) => s.wardId === wardId)
  const complaints = COMPLAINTS.filter((c) => c.wardId === wardId)

  const contractorIds = Array.from(new Set(projects.map((p) => p.contractorId)))
  const defects = topDefectsForWard(wardId, 5)

  return {
    ward,
    healthScore: ward.healthScore,
    riskScore: ward.riskScore,
    state: ward.state,
    services: {
      complaints: wardComplaintSummary(wardId),
      byCategory: serviceRows,
      worstCategory: [...serviceRows].sort((a, b) => a.slaCompliancePct - b.slaCompliancePct)[0],
    },
    water: zone
      ? {
          zoneName: zone.name,
          supplyMld: zone.supplyMld,
          demandMld: zone.demandMld,
          deficitMld: zone.deficitMld,
          pressureM: zone.pressureM,
          supplyHours: zone.supplyHours,
          nrwPct: zone.nrwPct,
          qualityCompliancePct: zone.qualityCompliancePct,
          tankerTripsPerDay: zone.tankerTripsPerDay,
          reliabilityScore: Math.round(
            Math.max(
              0,
              Math.min(
                100,
                100 - (zone.deficitMld / Math.max(zone.demandMld, 1)) * 140 - Math.max(0, zone.nrwPct - 20) * 1.1,
              ),
            ),
          ),
          anomalies: zone.anomalies,
          state: zone.state,
        }
      : null,
    waste: waste
      ? {
          coveragePct: waste.coveragePct,
          segregationPct: waste.segregationPct,
          missedCollections7d: waste.missedCollections7d,
          hotspots: waste.hotspots,
          vehiclesDeployed: waste.vehiclesDeployed,
          state: waste.state,
        }
      : null,
    roads: {
      conditionIndex: wardRoadCondition(wardId),
      topDefects: defects,
      openDefects: defects.length,
    },
    drainage: {
      riskScore: wardDrainageRisk(wardId),
      readinessScore: readiness?.readinessScore ?? 0,
      desiltingPct: readiness?.desiltingPct ?? 0,
      pumpReadiness: readiness?.pumpReadiness ?? 0,
      floodSpots: readiness?.floodSpots ?? 0,
      gaps: readiness?.gaps ?? [],
    },
    health: {
      topSignals: wardHealthSignals(wardId).slice(0, 3),
      highestSignal: wardHealthSignals(wardId)[0]?.outbreakSignal ?? 0,
    },
    projects: {
      total: projects.length,
      atRisk: projects.filter((p) => p.riskScore >= 60).length,
      delayed: projects.filter((p) => p.status === 'delayed').length,
      sanctionedCrore: Math.round(projects.reduce((s, p) => s + p.sanctionedCostCrore, 0) * 10) / 10,
      paidCrore: Math.round(projects.reduce((s, p) => s + p.paidCrore, 0) * 10) / 10,
      items: [...projects].sort((a, b) => b.riskScore - a.riskScore),
    },
    finance: {
      revenueTargetCrore: revenue?.targetCrore ?? 0,
      revenueCollectedCrore: revenue?.collectedCrore ?? 0,
      collectionEfficiencyPct: revenue?.collectionEfficiencyPct ?? 0,
      arrearsCrore: revenue?.arrearsCrore ?? 0,
      budgetAllocatedCrore: budget.allocatedCrore,
      budgetSpentCrore: budget.spentCrore,
      budgetUtilisationPct: budget.utilisationPct,
    },
    assets: {
      total: assets.length,
      poorCondition: assets.filter((a) => a.conditionIndex < 45).length,
      pastDesignLife: assets.filter((a) => 2026 - a.installedYear > a.designLifeYears).length,
      // Measured against the demonstration anchor, not the wall clock: an
      // overdue count that moves between two renders of the same ward profile
      // is not a figure anyone can act on.
      inspectionsOverdue: assets.filter((a) => new Date(a.nextInspectionDue).getTime() < DEMO_NOW.getTime()).length,
      replacementValueCrore: Math.round(assets.reduce((s, a) => s + a.replacementValueCrore, 0) * 10) / 10,
      items: [...assets].sort((a, b) => a.conditionIndex - b.conditionIndex),
    },
    workforce: WORKFORCE_UNITS.filter((w) => w.wardId === wardId || !w.wardId).slice(0, 8),
    contractors: contractorIds
      .map((id) => CONTRACTOR_BY_ID.get(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => ({
        id: c.id,
        name: c.name,
        performanceIndex: c.performanceIndex,
        activeContracts: c.activeContracts,
      })),
    incidents: INCIDENTS.filter((i) => i.wardId === wardId && i.status !== 'reviewed'),
    openIntelligence: INTELLIGENCE_ITEMS.filter(
      (i) => i.wardIds.includes(wardId) && i.status !== 'closed',
    ).slice(0, 12),
    recentComplaints: [...complaints]
      .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1))
      .slice(0, 10),
  }
}

/* ==========================================================================
   Ward Risk & Performance Index - explainable, never a bare number
   ========================================================================== */

export interface WardIndexComponent {
  id: string
  label: string
  score: number
  weight: number
  contribution: number
  explanation: string
  trendPct: number
}

const WARD_INDEX_WEIGHTS = {
  serviceDelivery: 0.24,
  infrastructureCondition: 0.2,
  floodExposure: 0.18,
  publicHealth: 0.14,
  deliveryPerformance: 0.13,
  revenuePerformance: 0.11,
} as const

export function buildWardRiskIndex(wardId: string): {
  score: number
  trendPct: number
  confidence: ConfidenceLevel
  components: WardIndexComponent[]
  deteriorationReasons: string[]
} | null {
  const profile = buildWardProfile(wardId)
  if (!profile) return null

  const { ward, services, roads, drainage, health, projects, finance, waste } = profile

  const slaCompliance =
    services.byCategory.length > 0
      ? services.byCategory.reduce((s, c) => s + c.slaCompliancePct, 0) / services.byCategory.length
      : 60

  // Each component is expressed as risk: higher is worse.
  const raw = {
    serviceDelivery: Math.max(0, Math.min(100, 100 - slaCompliance + services.complaints.repeatRate * 0.4)),
    infrastructureCondition: Math.max(0, Math.min(100, 100 - roads.conditionIndex * 0.6 - (waste?.coveragePct ?? 70) * 0.4)),
    floodExposure: Math.max(0, Math.min(100, drainage.riskScore * 0.6 + (100 - drainage.readinessScore) * 0.4)),
    publicHealth: Math.max(0, Math.min(100, health.highestSignal)),
    deliveryPerformance: Math.max(
      0,
      Math.min(100, projects.total > 0 ? (projects.atRisk / projects.total) * 100 : 25),
    ),
    revenuePerformance: Math.max(0, Math.min(100, 100 - finance.collectionEfficiencyPct * 1.4)),
  }

  const labels: Record<keyof typeof raw, string> = {
    serviceDelivery: 'Citizen service delivery',
    infrastructureCondition: 'Infrastructure condition',
    floodExposure: 'Flood and drainage exposure',
    publicHealth: 'Public health signal',
    deliveryPerformance: 'Capital delivery performance',
    revenuePerformance: 'Revenue realisation',
  }

  const explanations: Record<keyof typeof raw, string> = {
    serviceDelivery: `SLA compliance across service categories averages ${slaCompliance.toFixed(0)}%, with ${services.complaints.repeatRate.toFixed(0)}% of complaints recorded as repeats. Repeat complaints indicate the underlying condition was not resolved.`,
    infrastructureCondition: `Road network condition index is ${roads.conditionIndex}/100 and waste collection coverage is ${(waste?.coveragePct ?? 0).toFixed(0)}%. Both are weighted into physical service condition.`,
    floodExposure: `Drain blockage risk is ${drainage.riskScore}/100 against a monsoon readiness score of ${drainage.readinessScore}/100, with ${drainage.floodSpots} chronic waterlogging locations recorded. ${ward.floodProne ? t('The ward is classified as flood-prone.') : t('The ward has limited low-lying exposure.')}`,
    publicHealth: `The strongest aggregate outbreak signal in the ward stands at ${health.highestSignal}/100${health.topSignals[0] ? ` (${health.topSignals[0].disease})` : ''}. Aggregate indicators only - no individual-level data is held.`,
    deliveryPerformance: `${projects.atRisk} of ${projects.total} capital works carry a composite risk score at or above 60. Delivery risk affects the ward's future service condition, not its present one.`,
    revenuePerformance: `Collection efficiency stands at ${finance.collectionEfficiencyPct.toFixed(1)}% with ₹${finance.arrearsCrore.toFixed(1)} Cr in arrears. Revenue performance constrains what the ward can be allocated.`,
  }

  const components: WardIndexComponent[] = (Object.keys(raw) as Array<keyof typeof raw>).map((key) => ({
    id: key,
    label: labels[key],
    score: Math.round(raw[key]),
    weight: WARD_INDEX_WEIGHTS[key],
    contribution: Math.round(raw[key] * WARD_INDEX_WEIGHTS[key] * 10) / 10,
    explanation: explanations[key],
    trendPct: Math.round(ward.healthTrend.changePct * (key === 'serviceDelivery' ? 1 : 0.6) * 10) / 10,
  }))

  const score = Math.round(components.reduce((s, c) => s + c.contribution, 0))

  const deteriorationReasons: string[] = []
  if (raw.serviceDelivery >= 45)
    deteriorationReasons.push(
      t('Service delivery is the largest contributor: SLA compliance at {0}% with {1} breached complaints currently open.', slaCompliance.toFixed(0), services.complaints.slaBreached),
    )
  if (raw.floodExposure >= 55)
    deteriorationReasons.push(
      t('Flood exposure is elevated: {0}.', drainage.gaps.length > 0 ? drainage.gaps[0] : `drain risk at ${drainage.riskScore}/100`),
    )
  if (raw.infrastructureCondition >= 50)
    deteriorationReasons.push(
      t('Physical condition is below standard: road condition index {0}/100 with {1} high-priority defects recorded.', roads.conditionIndex, roads.openDefects),
    )
  if (raw.publicHealth >= 50 && health.topSignals[0])
    deteriorationReasons.push(
      t('Aggregate {0} signal has moved to {1}/100 with a {2}% period-on-period change.', health.topSignals[0].disease, health.topSignals[0].outbreakSignal, health.topSignals[0].changePct.toFixed(0)),
    )
  if (raw.deliveryPerformance >= 50)
    deteriorationReasons.push(
      t('{0} capital works are at risk, which will affect service condition in subsequent periods.', projects.atRisk),
    )
  if (raw.revenuePerformance >= 55)
    deteriorationReasons.push(
      t('Collection efficiency at {0}% is materially below the ward cohort.', finance.collectionEfficiencyPct.toFixed(1)),
    )
  if (deteriorationReasons.length === 0)
    deteriorationReasons.push(
      t('No component currently exceeds its attention threshold. The composite reflects ordinary operational variation rather than a specific deterioration.'),
    )

  // Confidence falls where the ward has thin underlying data.
  const dataPoints = services.byCategory.length + projects.total + profile.assets.total
  const confidence: ConfidenceLevel = dataPoints > 40 ? 'high' : dataPoints > 18 ? 'medium' : 'low'

  return {
    score,
    trendPct: ward.healthTrend.changePct,
    confidence,
    components,
    deteriorationReasons,
  }
}

export { WARD_INDEX_WEIGHTS }

/* ==========================================================================
   Ward comparison
   ========================================================================== */

export interface ComparisonRow {
  id: string
  label: string
  unit: string
  higherIsBetter: boolean
  values: Record<string, number>
}

export function compareWards(wardIds: string[]): ComparisonRow[] {
  const profiles = wardIds
    .map((id) => buildWardProfile(id))
    .filter((p): p is WardProfile => p !== null)

  const row = (
    id: string,
    label: string,
    unit: string,
    higherIsBetter: boolean,
    pick: (p: WardProfile) => number,
  ): ComparisonRow => ({
    id,
    label,
    unit,
    higherIsBetter,
    values: Object.fromEntries(profiles.map((p) => [p.ward.id, Math.round(pick(p) * 10) / 10])),
  })

  return [
    row('health', 'Operational health index', '/100', true, (p) => p.healthScore),
    row('risk', 'Composite risk index', '/100', false, (p) => p.riskScore),
    row('sla', 'Service SLA compliance', '%', true, (p) =>
      p.services.byCategory.length > 0
        ? p.services.byCategory.reduce((s, c) => s + c.slaCompliancePct, 0) / p.services.byCategory.length
        : 0,
    ),
    row('complaints-open', 'Open complaints', '', false, (p) => p.services.complaints.open),
    row('complaints-breached', 'SLA-breached complaints', '', false, (p) => p.services.complaints.slaBreached),
    row('repeat', 'Repeat complaint rate', '%', false, (p) => p.services.complaints.repeatRate),
    row('water-reliability', 'Water supply reliability', '/100', true, (p) => p.water?.reliabilityScore ?? 0),
    row('water-pressure', 'Network pressure', 'm', true, (p) => p.water?.pressureM ?? 0),
    row('water-nrw', 'Non-revenue water', '%', false, (p) => p.water?.nrwPct ?? 0),
    row('roads', 'Road condition index', '/100', true, (p) => p.roads.conditionIndex),
    row('waste-coverage', 'Waste collection coverage', '%', true, (p) => p.waste?.coveragePct ?? 0),
    row('waste-segregation', 'Segregation at source', '%', true, (p) => p.waste?.segregationPct ?? 0),
    row('drainage', 'Drain blockage risk', '/100', false, (p) => p.drainage.riskScore),
    row('monsoon', 'Monsoon readiness', '/100', true, (p) => p.drainage.readinessScore),
    row('health-signal', 'Highest outbreak signal', '/100', false, (p) => p.health.highestSignal),
    row('projects', 'Capital works active', '', true, (p) => p.projects.total),
    row('projects-risk', 'Works at risk', '', false, (p) => p.projects.atRisk),
    row('revenue', 'Collection efficiency', '%', true, (p) => p.finance.collectionEfficiencyPct),
    row('budget', 'Capital utilisation', '%', true, (p) => p.finance.budgetUtilisationPct),
    row('assets-poor', 'Assets in poor condition', '', false, (p) => p.assets.poorCondition),
    row('incidents', 'Open incidents', '', false, (p) => p.incidents.length),
  ]
}

/** Ranks every ward by a headline metric. */
export function rankWards(
  metric: 'risk' | 'health' | 'complaints' | 'monsoon' | 'revenue',
): Array<{ wardId: string; label: string; value: number }> {
  const rows = WARDS.map((ward) => {
    let value = 0
    switch (metric) {
      case 'risk':
        value = ward.riskScore
        break
      case 'health':
        value = ward.healthScore
        break
      case 'complaints':
        value = wardComplaintSummary(ward.id).open
        break
      case 'monsoon':
        value = READINESS_BY_WARD.get(ward.id)?.readinessScore ?? 0
        break
      case 'revenue':
        value = wardRevenue(ward.id)?.collectionEfficiencyPct ?? 0
        break
    }
    return { wardId: ward.id, label: wardName(ward.id), value: Math.round(value * 10) / 10 }
  })

  const descending = metric === 'risk' || metric === 'complaints'
  return rows.sort((a, b) => (descending ? b.value - a.value : a.value - b.value))
}
