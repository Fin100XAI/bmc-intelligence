import type { OperationalState, SeriesPoint, Severity } from '@/types/common'
import type { IntelligenceItem } from '@/types/intelligence'
import { WARDS, wardName } from '@/data/reference'
import { ALERTS, INTELLIGENCE_ITEMS } from '@/data/intelligence.data'
import { DECISION_CASES, SERVICE_HEALTH, activeIncidents, wardComplaintSummary } from '@/data/operations.data'
import { PROJECTS, budgetTotals, projectsAtRisk, revenueTotals } from '@/data/finance.data'
import { WARD_MONSOON_READINESS, WASTE_WARD_PERFORMANCE, WATER_ZONES } from '@/data/city.data'
import { EMERGENCY_STATIONS, HEALTH_INDICATORS, HOSPITALS } from '@/data/social.data'
import { det } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * City-level executive position.
 *
 * A single composite assembled from every domain, with the weights of the
 * headline City Health Score published so that the figure is explainable
 * rather than merely authoritative-looking.
 */

const CITY_HEALTH_WEIGHTS = {
  wardHealth: 0.26,
  serviceDelivery: 0.22,
  infrastructure: 0.18,
  monsoonReadiness: 0.14,
  deliveryPerformance: 0.12,
  financePosition: 0.08,
} as const

export interface CityHealthComponent {
  id: string
  label: string
  score: number
  weight: number
  contribution: number
  explanation: string
}

function averageSlaCompliance(): number {
  if (SERVICE_HEALTH.length === 0) return 0
  return SERVICE_HEALTH.reduce((s, r) => s + r.slaCompliancePct, 0) / SERVICE_HEALTH.length
}

function averageWardHealth(): number {
  return WARDS.reduce((s, w) => s + w.healthScore, 0) / Math.max(WARDS.length, 1)
}

function infrastructureScore(): number {
  const waterScore =
    WATER_ZONES.reduce((s, z) => s + Math.max(0, 100 - (z.deficitMld / Math.max(z.demandMld, 1)) * 130 - Math.max(0, z.nrwPct - 20)), 0) /
    Math.max(WATER_ZONES.length, 1)
  const wasteScore =
    WASTE_WARD_PERFORMANCE.reduce((s, w) => s + w.coveragePct * 0.7 + w.segregationPct * 0.3, 0) /
    Math.max(WASTE_WARD_PERFORMANCE.length, 1)
  return (waterScore + wasteScore) / 2
}

function monsoonReadinessScore(): number {
  return (
    WARD_MONSOON_READINESS.reduce((s, r) => s + r.readinessScore, 0) / Math.max(WARD_MONSOON_READINESS.length, 1)
  )
}

function deliveryPerformanceScore(): number {
  const active = PROJECTS.filter((p) => p.status !== 'completed' && p.status !== 'closed')
  if (active.length === 0) return 70
  const onTrack = active.filter((p) => p.riskScore < 55).length
  return (onTrack / active.length) * 100
}

function financePositionScore(): number {
  const budget = budgetTotals()
  const revenue = revenueTotals()
  // 31% of the financial year has elapsed at the reference date.
  const budgetAlignment = 100 - Math.min(100, Math.abs(budget.utilisationPct - 31) * 2.4)
  const revenueAlignment = Math.min(100, (revenue.efficiencyPct / 40) * 100)
  return budgetAlignment * 0.5 + revenueAlignment * 0.5
}

export function cityHealthComponents(): CityHealthComponent[] {
  const wardHealth = averageWardHealth()
  const sla = averageSlaCompliance()
  const infra = infrastructureScore()
  const monsoon = monsoonReadinessScore()
  const delivery = deliveryPerformanceScore()
  const finance = financePositionScore()

  const raw = {
    wardHealth,
    serviceDelivery: sla,
    infrastructure: infra,
    monsoonReadiness: monsoon,
    deliveryPerformance: delivery,
    financePosition: finance,
  }

  const labels: Record<keyof typeof raw, string> = {
    wardHealth: 'Ward operational health',
    serviceDelivery: 'Citizen service delivery',
    infrastructure: 'Infrastructure service condition',
    monsoonReadiness: 'Monsoon preparedness',
    deliveryPerformance: 'Capital delivery performance',
    financePosition: 'Financial position',
  }

  const explanations: Record<keyof typeof raw, string> = {
    wardHealth: `Mean operational health across all ${WARDS.length} wards is ${wardHealth.toFixed(1)}/100. Ward health is itself a composite of density pressure, flood exposure and service condition.`,
    serviceDelivery: `Mean SLA compliance across every service category in every ward is ${sla.toFixed(1)}%.`,
    infrastructure: `Water supply reliability and solid waste coverage combine to ${infra.toFixed(1)}/100 across the network.`,
    monsoonReadiness: `Mean ward monsoon readiness is ${monsoon.toFixed(1)}/100, computed from desilting completion, pump readiness, chronic-location mitigation and resource allocation.`,
    deliveryPerformance: `${delivery.toFixed(0)}% of active capital works carry a composite risk score below the 55-point attention threshold.`,
    financePosition: `Budget utilisation alignment against the phased plan and year-to-date collection efficiency combine to ${finance.toFixed(1)}/100.`,
  }

  return (Object.keys(raw) as Array<keyof typeof raw>).map((key) => ({
    id: key,
    label: labels[key],
    score: Math.round(raw[key] * 10) / 10,
    weight: CITY_HEALTH_WEIGHTS[key],
    contribution: Math.round(raw[key] * CITY_HEALTH_WEIGHTS[key] * 10) / 10,
    explanation: explanations[key],
  }))
}

export interface CityPosition {
  healthScore: number
  healthComponents: CityHealthComponent[]
  state: OperationalState
  criticalAlerts: number
  highAlerts: number
  priorityDecisions: number
  servicesAtRisk: number
  activeIncidents: number
  citizensAffected: number
  revenue: { targetCrore: number; collectedCrore: number; efficiencyPct: number; arrearsCrore: number }
  budget: { approvedCrore: number; revisedCrore: number; actualCrore: number; utilisationPct: number }
  projects: { total: number; atRisk: number; delayed: number; sanctionedCrore: number }
  water: { supplyMld: number; demandMld: number; deficitMld: number; zonesAtRisk: number }
  waste: { generationTpd: number; coveragePct: number; hotspots: number }
  health: { highestSignal: number; wardsWithSignal: number; hospitalOccupancyPct: number }
  monsoon: { readinessScore: number; wardsBelowThreshold: number; chronicLocations: number }
  emergency: { readinessScore: number; avgResponseMinutes: number; stationsBelowStandard: number }
  topRisks: IntelligenceItem[]
  wardPerformance: Array<{
    wardId: string
    label: string
    health: number
    risk: number
    openComplaints: number
    slaBreached: number
    state: OperationalState
  }>
  operationalTrend: SeriesPoint[]
}

function stateFromScore(score: number): OperationalState {
  if (score >= 78) return 'operational'
  if (score >= 64) return 'degraded'
  if (score >= 50) return 'at-risk'
  return 'critical'
}

export function buildCityPosition(): CityPosition {
  const components = cityHealthComponents()
  const healthScore = Math.round(components.reduce((s, c) => s + c.contribution, 0))

  const openAlerts = ALERTS.filter((a) => a.status !== 'closed' && a.status !== 'resolved')
  const criticalAlerts = openAlerts.filter((a) => a.severity === 'critical').length
  const highAlerts = openAlerts.filter((a) => a.severity === 'high').length

  const priorityDecisions = DECISION_CASES.filter(
    (d) => d.status === 'under-review' || d.status === 'draft',
  ).length

  const servicesAtRisk = SERVICE_HEALTH.filter((s) => s.slaCompliancePct < 65).length

  const revenue = revenueTotals()
  const budget = budgetTotals()

  const atRisk = projectsAtRisk(60)
  const activeProjects = PROJECTS.filter((p) => p.status !== 'completed' && p.status !== 'closed')

  const supplyMld = Math.round(WATER_ZONES.reduce((s, z) => s + z.supplyMld, 0) * 10) / 10
  const demandMld = Math.round(WATER_ZONES.reduce((s, z) => s + z.demandMld, 0) * 10) / 10

  const generationTpd = Math.round(WASTE_WARD_PERFORMANCE.reduce((s, w) => s + w.generationTpd, 0))
  const wasteCoverage =
    WASTE_WARD_PERFORMANCE.reduce((s, w) => s + w.coveragePct, 0) / Math.max(WASTE_WARD_PERFORMANCE.length, 1)

  const highestSignal = Math.max(...HEALTH_INDICATORS.map((h) => h.outbreakSignal), 0)
  const wardsWithSignal = new Set(HEALTH_INDICATORS.filter((h) => h.outbreakSignal >= 55).map((h) => h.wardId)).size
  const hospitalOccupancy =
    HOSPITALS.filter((h) => h.bedsTotal > 0).reduce((s, h) => s + h.occupancyPct, 0) /
    Math.max(HOSPITALS.filter((h) => h.bedsTotal > 0).length, 1)

  const monsoonScore = monsoonReadinessScore()
  const emergencyReadiness =
    EMERGENCY_STATIONS.reduce((s, e) => s + e.readinessIndex, 0) / Math.max(EMERGENCY_STATIONS.length, 1)
  const avgResponse =
    EMERGENCY_STATIONS.reduce((s, e) => s + e.avgResponseMinutes, 0) / Math.max(EMERGENCY_STATIONS.length, 1)

  const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  const topRisks = [...INTELLIGENCE_ITEMS]
    .filter((i) => i.status !== 'closed')
    .sort((a, b) => {
      const bySeverity = severityRank[a.severity] - severityRank[b.severity]
      if (bySeverity !== 0) return bySeverity
      const confRank = { high: 0, medium: 1, low: 2 } as const
      const byConfidence = confRank[a.confidence] - confRank[b.confidence]
      if (byConfidence !== 0) return byConfidence
      return a.createdAt < b.createdAt ? 1 : -1
    })
    .slice(0, 8)

  const citizensAffected = topRisks.reduce((s, i) => s + (i.citizensAffected ?? 0), 0)

  const wardPerformance = WARDS.map((ward) => {
    const summary = wardComplaintSummary(ward.id)
    return {
      wardId: ward.id,
      label: wardName(ward.id),
      health: ward.healthScore,
      risk: ward.riskScore,
      openComplaints: summary.open,
      slaBreached: summary.slaBreached,
      state: ward.state,
    }
  }).sort((a, b) => b.risk - a.risk)

  // 30-day operational trend, deterministic and anchored to the current score.
  const rng = det('city-trend')
  const days = 30
  const drift = (healthScore - (healthScore - rng.float(-4, 5))) / days
  const trendValues = rng.series(days, {
    start: healthScore - rng.float(2, 6),
    drift,
    volatility: 0.014,
    min: 20,
    max: 98,
    decimals: 1,
  })
  const operationalTrend: SeriesPoint[] = trendValues.map((value, i) => ({
    // Translated, unlike the other `X-{0}` shapes in this codebase: this is an
    // axis tick a reader sees on a chart ("दि-30"), not a record identifier
    // that anything resolves by.
    label: t('D-{0}', days - i),
    value,
    comparison: 75,
  }))
  // Anchor the final point to the computed score so the chart agrees with the tile.
  if (operationalTrend.length > 0) {
    operationalTrend[operationalTrend.length - 1] = {
      label: t('Today'),
      value: healthScore,
      comparison: 75,
    }
  }

  return {
    healthScore,
    healthComponents: components,
    state: stateFromScore(healthScore),
    criticalAlerts,
    highAlerts,
    priorityDecisions,
    servicesAtRisk,
    activeIncidents: activeIncidents().length,
    citizensAffected,
    revenue: {
      targetCrore: revenue.target,
      collectedCrore: revenue.collected,
      efficiencyPct: revenue.efficiencyPct,
      arrearsCrore: revenue.arrears,
    },
    budget: {
      approvedCrore: budget.approved,
      revisedCrore: budget.revised,
      actualCrore: budget.actual,
      utilisationPct: budget.utilisationPct,
    },
    projects: {
      total: activeProjects.length,
      atRisk: atRisk.length,
      delayed: PROJECTS.filter((p) => p.status === 'delayed').length,
      sanctionedCrore: Math.round(PROJECTS.reduce((s, p) => s + p.sanctionedCostCrore, 0)),
    },
    water: {
      supplyMld,
      demandMld,
      deficitMld: Math.round((demandMld - supplyMld) * 10) / 10,
      zonesAtRisk: WATER_ZONES.filter((z) => z.state === 'at-risk' || z.state === 'critical').length,
    },
    waste: {
      generationTpd,
      coveragePct: Math.round(wasteCoverage * 10) / 10,
      hotspots: WASTE_WARD_PERFORMANCE.reduce((s, w) => s + w.hotspots, 0),
    },
    health: {
      highestSignal,
      wardsWithSignal,
      hospitalOccupancyPct: Math.round(hospitalOccupancy * 10) / 10,
    },
    monsoon: {
      readinessScore: Math.round(monsoonScore),
      wardsBelowThreshold: WARD_MONSOON_READINESS.filter((r) => r.readinessScore < 70).length,
      chronicLocations: WARDS.reduce((s, w) => s + w.waterloggingSpots, 0),
    },
    emergency: {
      readinessScore: Math.round(emergencyReadiness),
      avgResponseMinutes: Math.round(avgResponse * 10) / 10,
      stationsBelowStandard: EMERGENCY_STATIONS.filter((e) => e.avgResponseMinutes > 8).length,
    },
    topRisks,
    wardPerformance,
    operationalTrend,
  }
}

export { CITY_HEALTH_WEIGHTS }
