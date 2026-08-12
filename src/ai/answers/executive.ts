import type { ConfidenceLevel, IntelligenceDomain, Severity } from '@/types/common'
import { DOMAIN_LABEL, OPERATIONAL_STATE_LABEL, SEVERITY_LABEL, SEVERITY_ORDER } from '@/types/common'
import type { AIVisual } from '@/types/ai'
import type { Alert, IntelligenceItem } from '@/types/intelligence'
import { ALERT_STATUS_LABEL } from '@/types/intelligence'
import type { DecisionCase, Incident } from '@/types/operations'
import { DECISION_STATUS_LABEL, INCIDENT_STATUS_LABEL, INCIDENT_TYPE_LABEL } from '@/types/operations'
import type { QueryIntentId } from '@/ai/nlu'
import type { AnswerContext, AnswerHandler, ComposedAnswer } from '@/ai/answer-kit'
import {
  VISUAL_COLOUR,
  anyInScope,
  bestEvidence,
  compositionVisual,
  deniedAnswer,
  emptyAnswer,
  fullWard,
  metricsVisual,
  rankedBarVisual,
  recommend,
  scopeSentence,
  scopedIntelligence,
  shortWard,
  sourcesOf,
  standardLimitations,
  toneFor,
} from '@/ai/answer-kit'
import { canAccess } from '@/security/access'
import { ALERTS } from '@/data/intelligence.data'
import { DECISION_CASES, INCIDENTS, SERVICE_HEALTH, activeIncidents, wardComplaintSummary } from '@/data/operations.data'
import { DEPARTMENTS, WARDS, departmentName } from '@/data/reference'
import { budgetTotals, projectsAtRisk, revenueTotals } from '@/data/finance.data'
import { buildCityPosition } from '@/domains/executive/city-position'
import { buildCrossDomainInsights } from '@/domains/cross-domain/correlations'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCompact, formatCrore, formatDelta, formatNumber, formatPercent, formatRelative, truncate } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/ai/answers/executive.ts
 *
 * The executive and cross-cutting retrieval routes: the corporation-wide
 * position, the ranked risk register, the acting officer's own desk, the alert
 * and SLA surface, active incidents, the decision queue, and the cross-domain
 * correlations.
 *
 * Each route computes every figure from a record the acting principal is
 * authorised to read. Nothing is estimated to fill a gap: where a register is
 * empty within scope the route says so rather than producing a plausible
 * number, and where the whole domain sits outside scope it declines rather than
 * hinting at what it withheld.
 *
 * The language rules here are load-bearing rather than stylistic. A risk score
 * states where attention is warranted, not who is at fault. An anomaly is a
 * divergence, not a finding. A correlation identifies where to look, never why.
 * Every one of these routes is read by officers who may act on it, so the
 * distinction between what the records show and what they would imply is
 * maintained in the prose itself.
 */

/* ==========================================================================
   Shared internals
   ========================================================================== */

const HOUR_MS = 3_600_000

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 0, medium: 1, low: 2 }

const SEVERITY_COLOUR: Record<Severity, string> = {
  critical: VISUAL_COLOUR.crit,
  high: VISUAL_COLOUR.warn,
  medium: VISUAL_COLOUR.govt,
  low: VISUAL_COLOUR.govtSoft,
  info: VISUAL_COLOUR.muted,
}

const SERIES_COLOURS = [
  VISUAL_COLOUR.govt,
  VISUAL_COLOUR.intel,
  VISUAL_COLOUR.ok,
  VISUAL_COLOUR.warn,
  VISUAL_COLOUR.govtSoft,
  VISUAL_COLOUR.crit,
  VISUAL_COLOUR.muted,
]

/** Hours elapsed since an instant, measured against the demonstration anchor. */
function hoursSince(iso: string): number {
  return (DEMO_NOW.getTime() - new Date(iso).getTime()) / HOUR_MS
}

/**
 * Stable identifier for the request log.
 *
 * Scope forms part of it deliberately: the same question asked by a ward
 * officer and by the Commissioner retrieves different records and is therefore
 * a different request, and the audit trail should be able to tell them apart.
 */
function requestIdFor(ctx: AnswerContext, route: string): string {
  const scope = ctx.narrowed ? ctx.scopeWards.map((w) => w.id).join('+') : `all-${ctx.scopeWards.length}`
  return `q-${route}-${ctx.user.id}-${scope}`
}

/**
 * True where a record's geography falls inside the answer's scope.
 *
 * A record carrying no ward is corporation-wide, so it belongs in a
 * corporation-wide answer but not in one the operator narrowed to a named ward.
 */
function covered(ctx: AnswerContext, wardIds: string[]): boolean {
  if (wardIds.length === 0) return !ctx.narrowed
  return anyInScope(ctx, wardIds)
}

/** Honours an explicit severity the operator bound in the question. */
function severityMatches(ctx: AnswerContext, severity: Severity): boolean {
  const bound = ctx.understanding.entities.severity
  return bound === null || bound === severity
}

/** States the severity filter in the prose, so a narrowed answer is visibly narrowed. */
function severityClause(ctx: AnswerContext): string {
  const bound = ctx.understanding.entities.severity
  if (!bound) return ''
  return t(' Filtered to records recorded at {0} severity, because the question named it.', SEVERITY_LABEL[bound].toLowerCase())
}

/** The department that owns a domain, used so a recommendation names a real one. */
function departmentForDomain(domain: IntelligenceDomain): string {
  return DEPARTMENTS.find((d) => d.domain === domain)?.id ?? 'dept-commissioner'
}

/** Geography label for a record that may span several wards. */
function geographyLabel(wardIds: string[]): string {
  if (wardIds.length === 0) return t('Corporation-wide')
  if (wardIds.length <= 2) return wardIds.map((w) => fullWard(w)).join(', ')
  return t('{0} and {1} further wards', fullWard(wardIds[0]), wardIds.length - 1)
}

/** Distinct entries in a list with their counts, most frequent first. */
function tallyBy<T>(values: T[]): Array<{ value: T; count: number }> {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
}

/** A count with its noun correctly inflected: "1 ward" / "3 wards". */
function plural(count: number, singular: string, pluralForm?: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`
}

/** Chart-axis label for a long insight title, which carries its geography after a dash. */
function shortTitle(title: string): string {
  return truncate(title.split(' - ')[0] ?? title, 32)
}

/** Tone for a count where a higher figure is worse. */
function countTone(count: number, warnAt: number, criticalAt: number): 'default' | 'positive' | 'warn' | 'critical' {
  if (count >= criticalAt) return 'critical'
  if (count >= warnAt) return 'warn'
  if (count === 0) return 'positive'
  return 'default'
}

function drop(items: Array<AIVisual | null>): AIVisual[] {
  return items.filter((v): v is AIVisual => v !== null)
}

/* ==========================================================================
   Scoped retrieval over the registers the answer kit does not cover
   ========================================================================== */

/** Open alerts the principal may read, within the answer's geography. */
function scopedAlerts(ctx: AnswerContext): Alert[] {
  return ALERTS.filter((a) => {
    if (a.status === 'closed' || a.status === 'resolved') return false
    if (!severityMatches(ctx, a.severity)) return false
    if (!covered(ctx, a.wardIds)) return false
    return canAccess(ctx.user, 'alert', 'view', { wardIds: a.wardIds, classification: a.classification }).allowed
  })
}

/** Every decision case the principal may read, within the answer's geography. */
function scopedDecisions(ctx: AnswerContext): DecisionCase[] {
  return DECISION_CASES.filter((d) => {
    if (!severityMatches(ctx, d.severity)) return false
    if (!covered(ctx, d.wardIds)) return false
    return canAccess(ctx.user, 'decision', 'view', { wardIds: d.wardIds, classification: d.classification }).allowed
  })
}

/** Decision cases still awaiting a determination by a competent authority. */
function pendingDecisions(ctx: AnswerContext): DecisionCase[] {
  return scopedDecisions(ctx).filter((d) => d.status === 'under-review' || d.status === 'draft')
}

function scopedActiveIncidents(ctx: AnswerContext): Incident[] {
  return activeIncidents().filter((i) => {
    if (!severityMatches(ctx, i.severity)) return false
    if (!covered(ctx, [i.wardId])) return false
    return canAccess(ctx.user, 'incident', 'view', { wardId: i.wardId, classification: i.classification }).allowed
  })
}

/** Every incident in scope regardless of status, so a denominator can be stated. */
function scopedAllIncidents(ctx: AnswerContext): Incident[] {
  return INCIDENTS.filter((i) => {
    if (!covered(ctx, [i.wardId])) return false
    return canAccess(ctx.user, 'incident', 'view', { wardId: i.wardId, classification: i.classification }).allowed
  })
}

function scopedOpenIntelligence(ctx: AnswerContext): IntelligenceItem[] {
  return scopedIntelligence(ctx.user).filter((i) => severityMatches(ctx, i.severity) && covered(ctx, i.wardIds))
}

/** Severity, then confidence, then recency - the register's published ordering. */
function rankIntelligence(items: IntelligenceItem[]): IntelligenceItem[] {
  return [...items].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (bySeverity !== 0) return bySeverity
    const byConfidence = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]
    if (byConfidence !== 0) return byConfidence
    return a.createdAt < b.createdAt ? 1 : -1
  })
}

/* ==========================================================================
   Shared visuals
   ========================================================================== */

function severityComposition(id: string, caption: string, severities: Severity[]): AIVisual | null {
  if (severities.length === 0) return null
  const counts = new Map<Severity, number>()
  for (const s of severities) counts.set(s, (counts.get(s) ?? 0) + 1)
  const segments = (Object.keys(SEVERITY_ORDER) as Severity[])
    .filter((s) => (counts.get(s) ?? 0) > 0)
    .map((s) => ({ id: s, label: SEVERITY_LABEL[s], value: counts.get(s) ?? 0, colour: SEVERITY_COLOUR[s] }))
  if (segments.length === 0) return null
  return compositionVisual({ id, caption, segments })
}

function wardRiskVisual(ctx: AnswerContext, id: string, count: number): AIVisual | null {
  const rows = [...ctx.scopeWards].sort((a, b) => b.riskScore - a.riskScore).slice(0, Math.max(count, 1))
  if (rows.length === 0) return null
  return rankedBarVisual({
    id,
    caption: t('Wards in scope by composite risk index - higher is worse'),
    unit: '/100',
    higherIsBetter: false,
    data: rows.map((w) => ({ label: shortWard(w.id), value: w.riskScore })),
  })
}

/* ==========================================================================
   city-position - the corporation-wide executive position
   ========================================================================== */

const cityPositionHandler: AnswerHandler = (ctx): ComposedAnswer => {
  if (ctx.scopeWards.length === 0) {
    return deniedAnswer(
      ctx,
      'the corporation-wide operational position',
      'No ward within your authorised scope could be read, so no operational position can be assembled.',
    )
  }

  const position = buildCityPosition()
  const cityWide = !ctx.narrowed && ctx.scopeWards.length === WARDS.length
  const scopeIds = new Set(ctx.scopeWards.map((w) => w.id))
  const perf = position.wardPerformance.filter((p) => scopeIds.has(p.wardId))

  const meanHealth = perf.reduce((s, p) => s + p.health, 0) / Math.max(perf.length, 1)
  const meanRisk = perf.reduce((s, p) => s + p.risk, 0) / Math.max(perf.length, 1)
  const bestWard = [...perf].sort((a, b) => b.health - a.health)[0]
  const worstWard = [...perf].sort((a, b) => a.health - b.health)[0]
  const openComplaints = perf.reduce((s, p) => s + p.openComplaints, 0)
  const breachedComplaints = perf.reduce((s, p) => s + p.slaBreached, 0)
  const chronicLocations = ctx.scopeWards.reduce((s, w) => s + w.waterloggingSpots, 0)
  const floodProne = ctx.scopeWards.filter((w) => w.floodProne).length
  const residents = ctx.scopeWards.reduce((s, w) => s + w.population, 0)

  const intel = scopedOpenIntelligence(ctx)
  const critical = intel.filter((i) => i.severity === 'critical').length
  const high = intel.filter((i) => i.severity === 'high').length
  const medium = intel.filter((i) => i.severity === 'medium').length
  const remainder = intel.length - critical - high - medium

  const alerts = scopedAlerts(ctx)
  const breachedAlerts = alerts.filter((a) => a.slaRemainingHours < 0)
  const incidents = scopedActiveIncidents(ctx)
  const incidentWards = new Set(incidents.map((i) => i.wardId)).size
  const affectedResidents = incidents.reduce((s, i) => s + i.affectedPopulation, 0)
  const decisions = pendingDecisions(ctx)
  const decisionImpact = decisions.reduce((s, d) => s + d.financialImpactCrore, 0)
  const insights = buildCrossDomainInsights().filter((i) => covered(ctx, i.wardIds))
  const servicesBelow = SERVICE_HEALTH.filter((s) => scopeIds.has(s.wardId) && s.slaCompliancePct < 65).length

  const financeVisible = canAccess(ctx.user, 'budget', 'view').allowed
  const projectsVisible = canAccess(ctx.user, 'project', 'view').allowed
  const budget = budgetTotals()
  const revenue = revenueTotals()
  const atRisk = projectsAtRisk(60).filter(
    (p) =>
      covered(ctx, p.wardIds)
      && canAccess(ctx.user, 'project', 'view', { wardIds: p.wardIds, classification: p.classification }).allowed,
  )
  const atRiskExposure = atRisk.reduce((s, p) => s + p.sanctionedCostCrore, 0)

  const alertsByWard = new Map<string, number>()
  for (const a of alerts) {
    for (const w of a.wardIds) if (scopeIds.has(w)) alertsByWard.set(w, (alertsByWard.get(w) ?? 0) + 1)
  }
  const incidentsByWard = new Map<string, number>()
  for (const i of incidents) incidentsByWard.set(i.wardId, (incidentsByWard.get(i.wardId) ?? 0) + 1)

  const incidentClause =
    incidents.length === 0
      ? t('no incident is active')
      : t('{0} {1} active across {2}', plural(incidents.length, 'incident'), incidents.length === 1 ? 'is' : 'are', plural(incidentWards, 'ward'))
  const decisionClause =
    decisions.length === 0
      ? t('no decision case awaits determination')
      : `${plural(decisions.length, 'decision case')} ${decisions.length === 1 ? 'awaits' : 'await'} determination`

  const weightsText = position.healthComponents
    .map((c) => `${c.label.toLowerCase()} at ${formatPercent(c.weight * 100, 0)}`)
    .join(', ')

  const headline = cityWide
    ? `The City Health Score stands at ${position.healthScore}/100, assessed as ${OPERATIONAL_STATE_LABEL[position.state].toLowerCase()}. `
      + `It is a published weighted composite of six components - ${weightsText} - so the headline can be interrogated rather than merely accepted.`
    : `Across the ${plural(perf.length, 'ward')} in your authorised scope, serving approximately ${formatCompact(residents)} residents, mean ward operational health is `
      + `${formatNumber(meanHealth, 1)}/100 against a mean composite risk of ${formatNumber(meanRisk, 1)}/100. `
      + `The corporation-wide City Health Score is not presented here, because your scope does not cover every ward and a partial composite would misstate it.`

  const evidence = bestEvidence(ctx.user, {
    wardIds: ctx.scopeWards.map((w) => w.id),
    kinds: ['derived-metric', 'model-output', 'sensor-reading'],
    count: 6,
  })

  const tableRows = [...perf]
    .sort((a, b) => b.risk - a.risk)
    .slice(0, Math.max(ctx.limit, 1))
    .map((p) => [
      p.label,
      `${formatNumber(p.health, 0)}/100`,
      `${formatNumber(p.risk, 0)}/100`,
      formatNumber(p.openComplaints),
      formatNumber(p.slaBreached),
      formatNumber(alertsByWard.get(p.wardId) ?? 0),
      formatNumber(incidentsByWard.get(p.wardId) ?? 0),
      OPERATIONAL_STATE_LABEL[p.state],
    ])

  const metricItems: Array<{ label: string; value: string; support?: string; tone?: 'default' | 'positive' | 'warn' | 'critical' }> = [
    cityWide
      ? {
          label: t('City Health Score'),
          value: `${position.healthScore}/100`,
          support: `Assessed as ${OPERATIONAL_STATE_LABEL[position.state].toLowerCase()}`,
          tone: toneFor(position.healthScore, true),
        }
      : {
          label: t('Mean ward operational health'),
          value: `${formatNumber(meanHealth, 1)}/100`,
          support: `Across ${plural(perf.length, 'authorised ward')}`,
          tone: toneFor(meanHealth, true),
        },
    {
      label: t('Open intelligence'),
      value: formatNumber(intel.length),
      support: `${critical} critical, ${high} high`,
      tone: countTone(critical, 1, 4),
    },
    {
      label: t('Open alerts'),
      value: formatNumber(alerts.length),
      support: `${breachedAlerts.length} past their response SLA`,
      tone: countTone(breachedAlerts.length, 1, 5),
    },
    {
      label: t('Active incidents'),
      value: formatNumber(incidents.length),
      support: `${formatCompact(affectedResidents)} residents in modelled affected areas`,
      tone: countTone(incidents.length, 1, 4),
    },
    {
      label: t('Decisions awaiting determination'),
      value: formatNumber(decisions.length),
      support: `${formatCrore(decisionImpact, 0)} combined declared impact`,
      tone: countTone(decisions.length, 3, 8),
    },
    cityWide
      ? {
          label: t('Monsoon readiness'),
          value: `${position.monsoon.readinessScore}/100`,
          support: `${position.monsoon.wardsBelowThreshold} wards below the 70-point threshold`,
          tone: toneFor(position.monsoon.readinessScore, true),
        }
      : {
          label: t('Chronic waterlogging locations'),
          value: formatNumber(chronicLocations),
          support: `${floodProne} of ${plural(ctx.scopeWards.length, 'ward')} classified flood-prone`,
          tone: countTone(chronicLocations, 8, 20),
        },
  ]

  if (projectsVisible) {
    metricItems.push({
      label: t('Capital works at delivery risk'),
      value: formatNumber(atRisk.length),
      support: `${formatCrore(atRiskExposure, 0)} sanctioned exposure`,
      tone: countTone(atRisk.length, 3, 8),
    })
  }

  const recommendations = []
  if (breachedAlerts.length > 0) {
    recommendations.push(
      recommend({
        id: 'rec-city-position-sla',
        title: t('Clear the {0} SLA-breached alerts in scope, critical severity first', breachedAlerts.length),
        why:
          `${breachedAlerts.length} of ${alerts.length} open alerts have run past their recorded response target without a closing entry, `
          + 'so accountability for them is currently unestablished in the register.',
        expectedImpact:
          t('Restores a named owner against each breached alert and stops further erosion of the response position before it is reported upward.'),
        departmentId: 'dept-commissioner',
        humanOwnerRole: t('Deputy Municipal Commissioner (Zone)'),
        confidence: 'high',
        dependencies: [t('Ward and departmental officer availability'), t('Confirmation of current field position on each alert')],
        risks: [t('Reassignment without a capacity assessment moves the constraint rather than resolving it')],
        evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
      }),
    )
  }
  if (incidents.length > 0) {
    recommendations.push(
      recommend({
        id: 'rec-city-position-incidents',
        title: t('Confirm response resourcing across the {0} active incidents', incidents.length),
        why:
          `${incidents.length} incidents are active across ${incidentWards} ward${incidentWards === 1 ? '' : 's'} with `
          + `approximately ${formatCompact(affectedResidents)} residents in the modelled affected areas.`,
        expectedImpact:
          t('Establishes whether deployed strength matches the assessed affected area, and surfaces any incident running without an escalation position.'),
        departmentId: 'dept-disaster',
        humanOwnerRole: t('Director - Disaster Management Cell'),
        confidence: 'high',
        dependencies: [t('Emergency Operations Centre situation report'), t('Ward control room confirmation')],
        risks: [t('A resourcing review does not itself change deployed strength')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    )
  }
  if (recommendations.length < 2 && decisions.length > 0) {
    recommendations.push(
      recommend({
        id: 'rec-city-position-decisions',
        title: t('Table the {0} decision cases awaiting determination', decisions.length),
        why:
          `The queue carries ${formatCrore(decisionImpact, 0)} of declared financial impact and each case already holds its declared `
          + 'alternatives with a published comparison basis. What is outstanding is the determination itself.',
        expectedImpact:
          t('Converts a standing queue into recorded determinations with named approvers, which is the only step the platform cannot take.'),
        departmentId: 'dept-commissioner',
        humanOwnerRole: t('Municipal Commissioner'),
        confidence: 'high',
        dependencies: [t('Committee calendar slot'), t('Approver availability')],
        risks: [t('Cases carried forward without determination continue to accrue the exposure that raised them')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    )
  }
  if (recommendations.length < 2 && worstWard) {
    recommendations.push(
      recommend({
        id: 'rec-city-position-ward',
        title: t('Convene an operational review for {0}', worstWard.label),
        why:
          `${worstWard.label} records the lowest operational health in scope at ${formatNumber(worstWard.health, 0)}/100 against a `
          + `composite risk of ${formatNumber(worstWard.risk, 0)}/100, with ${worstWard.slaBreached} SLA-breached complaints open.`,
        expectedImpact:
          t('Establishes which of the contributing components is the binding constraint, so intervention is directed rather than general.'),
        departmentId: 'dept-commissioner',
        humanOwnerRole: t('Deputy Municipal Commissioner (Zone)'),
        confidence: 'medium',
        dependencies: [t('Ward Officer availability'), t('Departmental representation')],
        risks: [t('A review without a resource decision will not move the position')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    )
  }

  return {
    requestId: requestIdFor(ctx, 'city-position'),
    answer:
      `${headline} `
      + `Against that position, ${intel.length} intelligence items are open (${critical} critical, ${high} high), `
      + `${plural(alerts.length, 'alert')} ${alerts.length === 1 ? 'is' : 'are'} open with ${breachedAlerts.length} past their response SLA, `
      + `${incidentClause}, and ${decisionClause}. `
      + `${insights.length} cross-domain exposures touch this geography; each identifies where to look, not why.${severityClause(ctx)} `
      + scopeSentence(ctx),
    keyFindings: [
      worstWard && bestWard && perf.length > 1
        ? t('Ward operational health averages {0}/100 across the {1} in scope - lowest {2} at {3}/100, highest {4} at {5}/100.', formatNumber(meanHealth, 1), plural(perf.length, 'ward'), worstWard.label, formatNumber(worstWard.health, 0), bestWard.label, formatNumber(bestWard.health, 0))
        : t('Ward operational health stands at {0}/100 across the {1} in scope, against a composite risk of {2}/100.', formatNumber(meanHealth, 1), plural(perf.length, 'ward'), formatNumber(meanRisk, 1)),
      t('{0} open intelligence items: {1} critical, {2} high, {3} medium and {4} low or informational.', intel.length, critical, high, medium, remainder),
      breachedAlerts.length > 0
        ? t('{0} alerts are open, {1} of them past their response SLA - a {2} breach position against the targets recorded on each alert.', alerts.length, breachedAlerts.length, formatPercent((breachedAlerts.length / Math.max(alerts.length, 1)) * 100))
        : t('{0} alerts are open and none has yet breached the response target recorded against it.', alerts.length),
      incidents.length > 0
        ? t('{0} {1} active across {2}, with approximately {3} residents in the modelled affected areas and {4} response teams deployed or en route.', plural(incidents.length, 'incident'), incidents.length === 1 ? 'is' : 'are', plural(incidentWards, 'ward'), formatCompact(affectedResidents), incidents.reduce((s, i) => s + i.responseTeams.filter((responseTeam) => responseTeam.status === 'deployed' || responseTeam.status === 'en-route').length, 0))
        : t('No incident is currently active within your authorised scope.'),
      decisions.length > 0
        ? t('{0} {1} determination, carrying {2} of combined declared financial impact.', plural(decisions.length, 'decision case'), decisions.length === 1 ? 'awaits' : 'await', formatCrore(decisionImpact, 0))
        : t('No decision case is currently awaiting determination within your authorised scope.'),
      t('{0} {1} open in scope, {2} of them past their service SLA, and {3} {4} below the 65% SLA compliance threshold.', plural(openComplaints, 'citizen complaint'), openComplaints === 1 ? 'is' : 'are', formatNumber(breachedComplaints), plural(servicesBelow, 'ward service category', 'ward service categories'), servicesBelow === 1 ? 'sits' : 'sit'),
      cityWide
        ? t('Monsoon readiness averages {0}/100 with {1} wards below the 70-point threshold; {2} chronic waterlogging locations are recorded in scope.', position.monsoon.readinessScore, position.monsoon.wardsBelowThreshold, chronicLocations)
        : t('{0} {1} recorded across the {2} in scope, of which {3} {4} classified flood-prone.', plural(chronicLocations, 'chronic waterlogging location'), chronicLocations === 1 ? 'is' : 'are', plural(ctx.scopeWards.length, 'ward'), floodProne, floodProne === 1 ? 'is' : 'are'),
      financeVisible
        ? t('Budget utilisation stands at {0} of a revised allocation of {1}, with {2} committed but unspent; collection efficiency is {3} against arrears of {4}. Approximately 31% of the financial year has elapsed, and both figures should be read against that proportion.', formatPercent(budget.utilisationPct), formatCrore(budget.revised, 0), formatCrore(budget.committed, 0), formatPercent(revenue.efficiencyPct), formatCrore(revenue.arrears, 0))
        : t('The financial position is outside your authorised scope and was not retrieved. Its absence here is a scope constraint, not an indication that no exception exists.'),
    ],
    evidence,
    recommendedActions: recommendations.slice(0, 2),
    risksAndLimitations: [
      ...standardLimitations(),
      cityWide
        ? t('The City Health Score is a weighted composite. A single headline figure necessarily conceals the distribution beneath it, which is why each component and its contribution is stated rather than only the total.')
        : t('The corporation-wide City Health Score is deliberately withheld here. It is computed across every ward, and reproducing it against a partial scope would present a figure your retrieval did not support.'),
      t('Counts describe the registers as recorded. A ward that reports less will read as a quieter ward, which is a data-completeness question rather than an operational finding about that ward.'),
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - city health composite'),
    domains: Array.from(new Set<IntelligenceDomain>(['executive', 'wards', ...intel.slice(0, 6).map((i) => i.domain)])),
    supportingTable: {
      caption: t('Wards in scope by composite risk - worst first, {0} shown', tableRows.length),
      columns: [
        t('Ward'),
        t('Operational health'),
        t('Composite risk'),
        t('Open complaints'),
        t('SLA breached'),
        t('Open alerts'),
        t('Active incidents'),
        t('State'),
      ],
      rows: tableRows,
    },
    visuals: drop([
      metricsVisual('city-position-headline', metricItems, scopeSentence(ctx)),
      wardRiskVisual(ctx, 'city-position-wards', Math.max(ctx.limit, 6)),
      severityComposition(
        'city-position-severity',
        'Open intelligence in scope by recorded severity',
        intel.map((i) => i.severity),
      ),
      cityWide
        ? compositionVisual({
            id: 'city-position-composite',
            caption: t('City Health Score - contribution of each weighted component to the 100-point composite'),
            segments: position.healthComponents.map((c, idx) => ({
              id: c.id,
              label: `${c.label} (${formatPercent(c.weight * 100, 0)})`,
              value: c.contribution,
              colour: SERIES_COLOURS[idx % SERIES_COLOURS.length],
            })),
          })
        : null,
    ]),
    followUps: [
      t('What are the five highest operational risks right now?'),
      t('Which wards need the most attention?'),
      t('What cross-domain exposures are currently identified?'),
    ],
  }
}

/* ==========================================================================
   top-risks - the ranked operational risk register
   ========================================================================== */

const topRisksHandler: AnswerHandler = (ctx): ComposedAnswer => {
  const open = scopedOpenIntelligence(ctx)
  if (open.length === 0) {
    return emptyAnswer(
      ctx,
      'open intelligence',
      `${scopeSentence(ctx)}${severityClause(ctx)}`,
    )
  }

  const ranked = rankIntelligence(open)
  const top = ranked.slice(0, Math.max(ctx.limit, 1))
  const critical = open.filter((i) => i.severity === 'critical').length
  const high = open.filter((i) => i.severity === 'high').length
  const citizens = top.reduce((s, i) => s + (i.citizensAffected ?? 0), 0)
  const byDomain = tallyBy(open.map((i) => i.domain))
  const byWard = tallyBy(open.flatMap((i) => i.wardIds.filter((w) => ctx.scopeWards.some((s) => s.id === w))))
  const leadDomain = byDomain[0]
  const leadWard = byWard[0]

  const evidence = bestEvidence(ctx.user, {
    wardIds: Array.from(new Set(top.flatMap((i) => i.wardIds))),
    kinds: ['derived-metric', 'model-output', 'inspection'],
    count: 6,
  })

  const recommendations = top.slice(0, 2).map((item, idx) => {
    const action = item.recommendedActions[0]
    return recommend({
      id: `rec-top-risks-${idx + 1}`,
      title: action?.title ?? t('Assign ownership of "{0}"', item.title),
      why:
        action?.rationale
        ?? t('The item ranks {0} on the published ordering at {1} severity with {2} confidence, and carries no recorded owner.', idx === 0 ? 'highest' : `${idx + 1}${idx === 1 ? 'nd' : 'rd'}`, item.severity, item.confidence),
      expectedImpact:
        action?.expectedImpact
        ?? t('Establishes accountability for the condition, so it is addressed rather than repeatedly observed.'),
      departmentId: action?.departmentId ?? item.departmentId,
      humanOwnerRole: t('Accountable departmental officer'),
      confidence: action?.confidence ?? item.confidence,
      dependencies: action?.dependencies ?? [t('Departmental capacity confirmation')],
      risks: action?.risks ?? [t('Assignment without a resource decision will not move the position')],
      evidenceRefs: item.evidenceIds.slice(0, 3),
    })
  })

  return {
    requestId: requestIdFor(ctx, 'top-risks'),
    answer:
      `The ${top.length} highest-ranked operational risk${top.length === 1 ? '' : 's'} within your authorised scope ${top.length === 1 ? 'is' : 'are'} set out below, `
      + 'ordered by recorded severity, then by confidence, then by recency - the ordering the intelligence register itself publishes. '
      + `${critical} of the ${open.length} open items in scope ${critical === 1 ? 'is' : 'are'} critical and ${high} ${high === 1 ? 'is' : 'are'} high. `
      + 'A ranking states where attention is warranted on the evidence held; it attributes nothing to any officer, department or executing agency, '
      + `and an item's position reflects what the register records rather than an adjudicated view of its cause.${severityClause(ctx)} `
      + scopeSentence(ctx),
    keyFindings: [
      ...top.slice(0, 5).map(
        (i, idx) =>
          `${idx + 1}. ${i.title} - ${i.severity} severity, ${i.confidence} confidence, ${departmentName(i.departmentId)}, ${geographyLabel(i.wardIds)}. `
          + `Status ${i.status.replace('-', ' ')}, raised ${formatRelative(i.createdAt)}`
          + `${i.citizensAffected ? t(', approximately {0} residents in the modelled exposure area', formatCompact(i.citizensAffected)) : ''}.`,
      ),
      leadDomain
        ? t('Highest concentration by domain: {0}, carrying {1} of the {2} open items in scope.', DOMAIN_LABEL[leadDomain.value], leadDomain.count, open.length)
        : t('{0} open items are recorded in scope.', open.length),
      leadWard
        ? t('Highest concentration by geography: {0}, named on {1} open item{2}.', fullWard(leadWard.value), leadWard.count, leadWard.count === 1 ? '' : 's')
        : t('The open items in scope name {0} ward{1} between them.', byWard.length, byWard.length === 1 ? '' : 's'),
      citizens > 0
        ? t('Approximately {0} residents sit within the modelled exposure areas of the ranked items. The figure is modelled from ward density over the recorded exposure area; it is not a survey and not a count of affected persons.', formatCompact(citizens))
        : t('No ranked item carries a modelled exposure population, so no resident figure is stated rather than one being inferred.'),
    ],
    evidence,
    recommendedActions: recommendations,
    risksAndLimitations: [
      ...standardLimitations(),
      t('Ranking uses the severity and confidence recorded against each item. It does not model how two separate risks might compound if they present together, so a pair of medium items may in practice matter more than the ordering suggests.'),
      t('An item ranks highly because the register knows a great deal about it. Absence from this list is not assurance: it may equally reflect a domain that reports less frequently.'),
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - intelligence register'),
    domains: Array.from(new Set<IntelligenceDomain>(['executive', ...top.map((i) => i.domain)])),
    supportingTable: {
      caption: t('Ranked operational risks within your authorised scope - {0} of {1} open items', top.length, open.length),
      columns: [t('Rank'), t('Risk'), t('Severity'), t('Confidence'), t('Domain'), t('Department'), t('Geography'), t('Status')],
      rows: top.map((i, idx) => [
        String(idx + 1),
        i.title,
        SEVERITY_LABEL[i.severity],
        i.confidence,
        DOMAIN_LABEL[i.domain],
        departmentName(i.departmentId),
        geographyLabel(i.wardIds),
        i.status.replace('-', ' '),
      ]),
    },
    visuals: drop([
      metricsVisual(
        'top-risks-headline',
        [
          { label: t('Open items in scope'), value: formatNumber(open.length), support: `${top.length} returned` },
          { label: t('Critical'), value: formatNumber(critical), tone: countTone(critical, 1, 4) },
          { label: t('High'), value: formatNumber(high), tone: countTone(high, 3, 8) },
          {
            label: t('Residents in modelled exposure'),
            value: citizens > 0 ? formatCompact(citizens) : t('Not modelled'),
            support: 'Across the ranked items',
          },
          { label: t('Domains touched'), value: formatNumber(byDomain.length) },
        ],
        scopeSentence(ctx),
      ),
      severityComposition(
        'top-risks-severity',
        'Open intelligence in scope by recorded severity',
        open.map((i) => i.severity),
      ),
      byDomain.length > 0
        ? rankedBarVisual({
            id: 'top-risks-domains',
            caption: t('Open intelligence in scope by domain - higher is worse'),
            unit: 'items',
            higherIsBetter: false,
            data: byDomain.slice(0, 8).map((d) => ({ label: DOMAIN_LABEL[d.value], value: d.count })),
          })
        : null,
    ]),
    followUps: [
      t('What cross-domain exposures are currently identified?'),
      t('Which decision cases are awaiting determination?'),
      t('Which alerts have breached their response SLA?'),
    ],
  }
}

/* ==========================================================================
   my-attention - the acting officer's desk
   ========================================================================== */

interface DeskRow {
  register: string
  reference: string
  title: string
  severity: Severity
  geography: string
  position: string
  timing: string
  /** Hours past the item's own clock. Negative means time remains. */
  overdueHours: number
}

const myAttentionHandler: AnswerHandler = (ctx): ComposedAnswer => {
  const alerts = scopedAlerts(ctx)
  const breachedAlerts = alerts.filter((a) => a.slaRemainingHours < 0)
  const approachingAlerts = alerts.filter((a) => a.slaRemainingHours >= 0 && a.slaRemainingHours < a.slaHours * 0.25)
  const incidents = scopedActiveIncidents(ctx)
  const pending = pendingDecisions(ctx)
  const personallyHeld = pending.filter(
    (d) => d.ownerId === ctx.user.id || d.approvals.some((a) => a.approverId === ctx.user.id && a.status === 'pending'),
  )
  const deskDecisions = personallyHeld.length > 0 ? personallyHeld : pending
  const urgentIntel = rankIntelligence(
    scopedOpenIntelligence(ctx).filter((i) => i.severity === 'critical' || i.severity === 'high'),
  )
  const complaints = ctx.scopeWards.map((w) => wardComplaintSummary(w.id))
  const breachedComplaints = complaints.reduce((s, c) => s + c.slaBreached, 0)
  const openComplaints = complaints.reduce((s, c) => s + c.open, 0)
  const scopeIds = new Set(ctx.scopeWards.map((w) => w.id))
  const servicesBelow = SERVICE_HEALTH.filter((s) => scopeIds.has(s.wardId) && s.slaCompliancePct < 65).sort(
    (a, b) => a.slaCompliancePct - b.slaCompliancePct,
  )
  const worstService = servicesBelow[0]

  const desk: DeskRow[] = [
    ...alerts
      .filter((a) => a.slaRemainingHours < a.slaHours * 0.25)
      .map((a) => ({
        register: 'Alert',
        reference: a.id.toUpperCase(),
        title: a.title,
        severity: a.severity,
        geography: geographyLabel(a.wardIds),
        position: ALERT_STATUS_LABEL[a.status],
        timing:
          a.slaRemainingHours < 0
            ? t('{0} h past a {1} h target', formatNumber(Math.abs(a.slaRemainingHours), 1), a.slaHours)
            : t('{0} h of a {1} h target remaining', formatNumber(a.slaRemainingHours, 1), a.slaHours),
        overdueHours: -a.slaRemainingHours,
      })),
    ...incidents.map((i) => ({
      register: 'Incident',
      reference: i.reference,
      title: i.title,
      severity: i.severity,
      geography: fullWard(i.wardId),
      position: INCIDENT_STATUS_LABEL[i.status],
      timing: `Unresolved for ${formatNumber(hoursSince(i.detectedAt), 1)} h since detection`,
      overdueHours: hoursSince(i.detectedAt),
    })),
    ...deskDecisions.map((d) => ({
      register: 'Decision',
      reference: d.reference,
      title: d.title,
      severity: d.severity,
      geography: geographyLabel(d.wardIds),
      position: `${DECISION_STATUS_LABEL[d.status]} - ${d.approvals.filter((a) => a.status === 'pending').length} of ${d.approvals.length} approvals pending`,
      timing: `Due ${formatRelative(d.dueDate)}`,
      overdueHours: hoursSince(d.dueDate),
    })),
    ...urgentIntel.slice(0, 6).map((i) => ({
      register: 'Intelligence',
      reference: i.id.toUpperCase(),
      title: i.title,
      severity: i.severity,
      geography: geographyLabel(i.wardIds),
      position: `${i.status.replace('-', ' ')} - ${departmentName(i.departmentId)}`,
      timing: `Open for ${formatNumber(hoursSince(i.createdAt) / 24, 1)} days`,
      overdueHours: hoursSince(i.createdAt),
    })),
  ].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (bySeverity !== 0) return bySeverity
    return b.overdueHours - a.overdueHours
  })

  if (desk.length === 0 && breachedComplaints === 0) {
    return emptyAnswer(
      ctx,
      'item awaiting your attention',
      `No alert is approaching or past its response target, no incident is active, no decision case awaits determination and no critical or high-severity intelligence is open. ${scopeSentence(ctx)}`,
    )
  }

  const worstAlert = [...breachedAlerts].sort((a, b) => a.slaRemainingHours - b.slaRemainingHours)[0]
  const oldestDecision = [...deskDecisions].sort((a, b) => hoursSince(b.dueDate) - hoursSince(a.dueDate))[0]
  const criticalRows = desk.filter((r) => r.severity === 'critical').length

  const evidence = bestEvidence(ctx.user, {
    wardIds: ctx.scopeWards.map((w) => w.id),
    kinds: ['derived-metric', 'field-report', 'complaint'],
    count: 6,
  })

  const recommendations = []
  if (breachedAlerts.length > 0) {
    recommendations.push(
      recommend({
        id: 'rec-attention-alerts',
        title: t('Acknowledge or reassign the {0} SLA-breached alerts on your desk', breachedAlerts.length),
        why:
          'A breached alert has passed its recorded response window without a closing entry, so the register currently shows no established accountability for it.',
        expectedImpact: t('Restores a named owner against each item and stops further erosion of the response position.'),
        departmentId: ctx.user.departmentId,
        humanOwnerRole: ctx.user.designation,
        confidence: 'high',
        dependencies: [t('Officer availability within the ward or department')],
        risks: [t('Reassignment without a capacity assessment simply moves the constraint')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    )
  }
  if (oldestDecision) {
    recommendations.push(
      recommend({
        id: 'rec-attention-decision',
        title: t('Record a determination on {0}', oldestDecision.reference),
        why:
          `${oldestDecision.reference} carries ${formatCrore(oldestDecision.financialImpactCrore)} of declared financial impact with `
          + `${oldestDecision.alternatives.length} declared alternatives already scored on the published comparison basis, and is due ${formatRelative(oldestDecision.dueDate)}. `
          + 'The comparison is prepared; the determination is not, and cannot be made by the platform.',
        expectedImpact: t('Closes the oldest item in the determination queue with a recorded rationale and a named approver.'),
        departmentId: 'dept-commissioner',
        humanOwnerRole: t('Municipal Commissioner'),
        confidence: 'high',
        dependencies: [t('Approver availability'), t('Departmental cost confirmation where sanction follows')],
        risks: [t('Deferral continues to accrue the exposure that raised the case')],
        evidenceRefs: oldestDecision.evidenceIds.slice(0, 3),
      }),
    )
  }
  if (recommendations.length < 2 && incidents.length > 0) {
    recommendations.push(
      recommend({
        id: 'rec-attention-incidents',
        title: t('Review the escalation position on {0} active incident{1}', incidents.length, incidents.length === 1 ? '' : 's'),
        why: 'Each active incident on the desk is unresolved at the reference instant and carries a recorded response deployment that may no longer match the assessed affected area.',
        expectedImpact: t('Confirms whether deployed strength remains proportionate and whether any incident should be escalated.'),
        departmentId: 'dept-disaster',
        humanOwnerRole: t('Director - Disaster Management Cell'),
        confidence: 'medium',
        dependencies: [t('Emergency Operations Centre situation report')],
        risks: [t('A review does not itself alter deployed strength')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    )
  }

  const registerTally = tallyBy(desk.map((r) => r.register))
  const deskRows = desk.slice(0, Math.max(ctx.limit, 1))

  return {
    requestId: requestIdFor(ctx, 'my-attention'),
    answer:
      `As ${ctx.user.designation}, ${desk.length} item${desk.length === 1 ? '' : 's'} require your attention at the reference instant, `
      + `${criticalRows} of them at critical severity. The desk is assembled from four registers - alerts at or past their response target, `
      + 'active incidents, decision cases awaiting determination, and open intelligence at critical or high severity - ordered by recorded '
      + 'severity and then by how far each has run past its own clock. '
      + `${personallyHeld.length > 0 ? t('{0} decision case{1} held in your name or await your approval; ', personallyHeld.length, personallyHeld.length === 1 ? ' is' : 's are') : t('No decision case is held in your name, so the queue shown is the one within your scope; ')}`
      + `alongside these, ${formatNumber(breachedComplaints)} citizen complaints in scope have exceeded their service SLA.${severityClause(ctx)} `
      + scopeSentence(ctx),
    keyFindings: [
      breachedAlerts.length > 0 && worstAlert
        ? t('{0} alerts have breached their response SLA. The furthest past target is "{1}" at {2} hours beyond a {3}-hour window, {4}.', breachedAlerts.length, worstAlert.title, formatNumber(Math.abs(worstAlert.slaRemainingHours), 1), worstAlert.slaHours, geographyLabel(worstAlert.wardIds))
        : t('No alert in scope has breached its response target; {0} sit within the final quarter of their response window.', approachingAlerts.length),
      t('{0} open alerts are within the final quarter of their response window and will breach without an entry against them.', approachingAlerts.length),
      incidents.length > 0
        ? t('{0} incidents are active, affecting approximately {1} residents in the modelled affected areas across {2} ward{3}.', incidents.length, formatCompact(incidents.reduce((s, i) => s + i.affectedPopulation, 0)), new Set(incidents.map((i) => i.wardId)).size, new Set(incidents.map((i) => i.wardId)).size === 1 ? '' : 's')
        : t('No incident is currently active within your authorised scope.'),
      deskDecisions.length > 0
        ? t('{0} decision case{1} await determination{2}, carrying {3} of declared financial impact.', deskDecisions.length, deskDecisions.length === 1 ? '' : 's', personallyHeld.length > 0 ? ' in your name or on your approval' : ' within your scope', formatCrore(deskDecisions.reduce((s, d) => s + d.financialImpactCrore, 0), 0))
        : t('No decision case awaits determination within your authorised scope.'),
      t('{0} intelligence items are open at critical or high severity, the oldest having stood for {1} days.', urgentIntel.length, urgentIntel.length > 0 ? formatNumber(Math.max(...urgentIntel.map((i) => hoursSince(i.createdAt))) / 24, 1) : '0'),
      t('{0} of {1} open citizen complaints in scope have exceeded their service SLA.', formatNumber(breachedComplaints), formatNumber(openComplaints)),
      worstService
        ? t('{0} {1} below the 65% SLA compliance threshold; the lowest is {2} in {3} at {4}.', plural(servicesBelow.length, 'ward service category', 'ward service categories'), servicesBelow.length === 1 ? 'sits' : 'sit', worstService.category.replace('-', ' '), fullWard(worstService.wardId), formatPercent(worstService.slaCompliancePct))
        : t('No ward service category in scope is currently below the 65% SLA compliance threshold.'),
    ],
    evidence,
    recommendedActions: recommendations.slice(0, 2),
    risksAndLimitations: [
      ...standardLimitations(),
      t('This desk reflects items within your authorised scope. Items outside it are neither retrieved nor counted, and their absence here is not evidence of their absence.'),
      t('Ordering is by recorded severity and elapsed time against each register’s own clock. It is not a judgement about which item matters most operationally, which remains yours.'),
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - operational registers'),
    domains: Array.from(new Set<IntelligenceDomain>(['executive', 'wards', ...urgentIntel.slice(0, 4).map((i) => i.domain)])),
    supportingTable: {
      caption: t('Items requiring your attention - {0} of {1}, most urgent first', deskRows.length, desk.length),
      columns: [t('Register'), t('Reference'), t('Item'), t('Severity'), t('Geography'), t('Position'), t('Timing')],
      rows: deskRows.map((r) => [
        r.register,
        r.reference,
        r.title,
        SEVERITY_LABEL[r.severity],
        r.geography,
        r.position,
        r.timing,
      ]),
    },
    visuals: drop([
      metricsVisual(
        'my-attention-headline',
        [
          { label: t('Items on your desk'), value: formatNumber(desk.length), support: `${criticalRows} critical`, tone: countTone(desk.length, 5, 12) },
          { label: t('SLA-breached alerts'), value: formatNumber(breachedAlerts.length), tone: countTone(breachedAlerts.length, 1, 5) },
          { label: t('Active incidents'), value: formatNumber(incidents.length), tone: countTone(incidents.length, 1, 4) },
          {
            label: t('Decisions awaiting determination'),
            value: formatNumber(deskDecisions.length),
            support: personallyHeld.length > 0 ? t('Held in your name or on your approval') : t('Within your authorised scope'),
            tone: countTone(deskDecisions.length, 3, 8),
          },
          { label: t('SLA-breached complaints'), value: formatNumber(breachedComplaints), tone: countTone(breachedComplaints, 20, 80) },
        ],
        scopeSentence(ctx),
      ),
      registerTally.length > 0
        ? compositionVisual({
            id: 'my-attention-registers',
            caption: t('Composition of your desk by originating register'),
            segments: registerTally.map((r, idx) => ({
              id: r.value.toLowerCase(),
              label: r.value,
              value: r.count,
              colour: SERIES_COLOURS[idx % SERIES_COLOURS.length],
            })),
          })
        : null,
      breachedAlerts.length > 0
        ? rankedBarVisual({
            id: 'my-attention-overdue',
            caption: t('Alerts furthest past their response target - hours beyond the recorded window'),
            unit: 'h',
            higherIsBetter: false,
            data: [...breachedAlerts]
              .sort((a, b) => a.slaRemainingHours - b.slaRemainingHours)
              .slice(0, 8)
              .map((a) => ({ label: truncate(a.title, 34), value: Math.round(Math.abs(a.slaRemainingHours) * 10) / 10 })),
          })
        : null,
    ]),
    followUps: [
      t('Which alerts have breached their response SLA?'),
      t('Which decision cases are awaiting determination?'),
      t('Which incidents are currently active?'),
    ],
  }
}

/* ==========================================================================
   alerts - the open alert and SLA position
   ========================================================================== */

const alertsHandler: AnswerHandler = (ctx): ComposedAnswer => {
  const open = scopedAlerts(ctx)
  if (open.length === 0) {
    return emptyAnswer(ctx, 'open alert', `${scopeSentence(ctx)}${severityClause(ctx)}`)
  }

  const breached = open.filter((a) => a.slaRemainingHours < 0)
  const approaching = open.filter((a) => a.slaRemainingHours >= 0 && a.slaRemainingHours < a.slaHours * 0.25)
  const unowned = open.filter((a) => !a.ownerId)
  const escalated = open.filter((a) => a.status === 'escalated')
  const breachFocus = /breach|overdue|escalat/.test(ctx.understanding.normalised) && breached.length > 0
  const rows = [...(breachFocus ? breached : open)].sort((a, b) => a.slaRemainingHours - b.slaRemainingHours)
  const shown = rows.slice(0, Math.max(ctx.limit, 1))

  const targets = new Map<Severity, number>()
  for (const a of open) if (!targets.has(a.severity)) targets.set(a.severity, a.slaHours)
  const targetText = [...targets.entries()]
    .sort((x, y) => SEVERITY_ORDER[x[0]] - SEVERITY_ORDER[y[0]])
    .map(([s, h]) => t('{0} hours at {1} severity', h, SEVERITY_LABEL[s].toLowerCase()))
    .join(', ')

  const byDomain = tallyBy(open.map((a) => a.domain))
  const byWard = tallyBy(open.flatMap((a) => a.wardIds.filter((w) => ctx.scopeWards.some((s) => s.id === w))))
  const meanRemaining = open.reduce((s, a) => s + a.slaRemainingHours, 0) / open.length
  const oldest = [...open].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0]
  const worst = [...breached].sort((a, b) => a.slaRemainingHours - b.slaRemainingHours)[0]

  const evidence = bestEvidence(ctx.user, {
    wardIds: Array.from(new Set(shown.flatMap((a) => a.wardIds))),
    kinds: ['sensor-reading', 'derived-metric', 'field-report'],
    count: 6,
  })

  const recommendations = [
    recommend({
      id: 'rec-alerts-breached',
      title:
        breached.length > 0
          ? t('Clear the {0} SLA-breached alerts, critical severity first', breached.length)
          : t('Close out the {0} alerts inside the final quarter of their response window', approaching.length),
      why:
        breached.length > 0
          ? t('{0} of {1} open alerts have passed the response target recorded against them, and {2} sit at escalated status. A breach records that a threshold was crossed; it does not record that any officer failed to act, and the review should establish which of the two it is.', breached.length, open.length, escalated.length)
          : t('{0} alerts remain inside their response window but within its final quarter, so they will breach without an entry against them.', approaching.length),
      expectedImpact:
        t('Returns the alert surface to a defensible position and distinguishes alerts genuinely awaiting field action from those awaiting only a register entry.'),
      departmentId: 'dept-commissioner',
      humanOwnerRole: t('Deputy Municipal Commissioner (Zone)'),
      confidence: 'high',
      dependencies: [t('Ward and departmental officer availability'), t('Current field position on each alert')],
      risks: [t('Closing alerts to restore the SLA position without verifying the underlying condition would defeat the control')],
      evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
    }),
  ]
  if (unowned.length > 0) {
    recommendations.push(
      recommend({
        id: 'rec-alerts-ownership',
        title: t('Assign a recorded owner to the {0} alerts currently held without one', unowned.length),
        why:
          `${unowned.length} of ${open.length} open alerts carry no owner in the register, which means no officer is currently accountable for their disposal `
          + 'and the SLA clock is running against no one.',
        expectedImpact:
          t('Establishes accountability at the point the alert is raised rather than at the point it breaches.'),
        departmentId: byDomain[0] ? departmentForDomain(byDomain[0].value) : 'dept-commissioner',
        humanOwnerRole: t('Accountable departmental officer'),
        confidence: 'high',
        dependencies: [t('Departmental duty roster')],
        risks: [t('Assignment without capacity confirmation records an owner without changing the disposal position')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    )
  }

  return {
    requestId: requestIdFor(ctx, 'alerts'),
    answer:
      `${open.length} alerts are open within your authorised scope. ${breached.length} have breached their response SLA - a `
      + `${formatPercent((breached.length / open.length) * 100)} breach position - and a further ${approaching.length} sit within the final quarter of their window. `
      + `Response targets are carried on each alert and are set by severity: ${targetText}. `
      + 'An alert records that a monitored threshold was crossed. It is not a finding, and a breached response target describes the disposal position '
      + `in the register rather than the conduct of any officer or department.${severityClause(ctx)} `
      + `${breachFocus ? t('The table is restricted to breached alerts, because the question asked for them. ') : ''}`
      + scopeSentence(ctx),
    keyFindings: [
      breached.length > 0 && worst
        ? t('{0} alerts are past their response target. The furthest is "{1}" at {2} hours beyond a {3}-hour window, {4}, currently {5}.', breached.length, worst.title, formatNumber(Math.abs(worst.slaRemainingHours), 1), worst.slaHours, geographyLabel(worst.wardIds), ALERT_STATUS_LABEL[worst.status].toLowerCase())
        : t('No open alert has passed the response target recorded against it.'),
      t('{0} alerts sit within the final quarter of their response window and will breach without an entry against them.', approaching.length),
      t('{0} alerts are at escalated status and {1} carry no recorded owner.', escalated.length, unowned.length),
      t('Mean remaining response time across all open alerts is {0} against their recorded targets.', formatDelta(meanRemaining, ' h', 1)),
      byDomain[0]
        ? t('Highest concentration by domain: {0} with {1} of {2} open alerts.', DOMAIN_LABEL[byDomain[0].value], byDomain[0].count, open.length)
        : t('{0} open alerts span {1} domains.', open.length, byDomain.length),
      byWard[0]
        ? t('Highest concentration by geography: {0} with {1} open alert{2}.', fullWard(byWard[0].value), byWard[0].count, byWard[0].count === 1 ? '' : 's')
        : t('The open alerts name {0} ward{1} between them.', byWard.length, byWard.length === 1 ? '' : 's'),
      oldest
        ? t('The oldest open alert was raised {0} at {1} severity and remains {2}.', formatRelative(oldest.createdAt), oldest.severity, ALERT_STATUS_LABEL[oldest.status].toLowerCase())
        : t('No creation timestamp could be read for the open alerts in scope.'),
    ],
    evidence,
    recommendedActions: recommendations.slice(0, 2),
    risksAndLimitations: [
      ...standardLimitations(),
      t('The SLA position measures process adherence against the response target recorded on each alert. It says nothing about whether the underlying condition was resolved, which the linked intelligence item and its evidence carry instead.'),
      t('Alerts are raised from the intelligence register. A domain that instruments less will raise fewer alerts, so a quiet domain here is not necessarily a quiet domain in the field.'),
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - alert register'),
    domains: Array.from(new Set<IntelligenceDomain>(['executive', 'wards', ...open.slice(0, 6).map((a) => a.domain)])),
    supportingTable: {
      caption: t('{0} within your authorised scope - {1} of {2}, nearest to or furthest past target first', breachFocus ? 'SLA-breached alerts' : 'Open alerts', shown.length, rows.length),
      columns: [t('Alert'), t('Severity'), t('Domain'), t('Geography'), t('Status'), t('Owner recorded'), t('SLA target'), t('Remaining')],
      rows: shown.map((a) => [
        a.title,
        SEVERITY_LABEL[a.severity],
        DOMAIN_LABEL[a.domain],
        geographyLabel(a.wardIds),
        ALERT_STATUS_LABEL[a.status],
        a.ownerId ? t('Yes') : t('Not recorded'),
        `${a.slaHours} h`,
        formatDelta(a.slaRemainingHours, ' h', 1),
      ]),
    },
    visuals: drop([
      metricsVisual(
        'alerts-headline',
        [
          { label: t('Open alerts'), value: formatNumber(open.length), support: scopeSentence(ctx) },
          {
            label: t('Past response SLA'),
            value: formatNumber(breached.length),
            support: formatPercent((breached.length / open.length) * 100),
            tone: countTone(breached.length, 1, 5),
          },
          { label: t('Inside final quarter of window'), value: formatNumber(approaching.length), tone: countTone(approaching.length, 2, 6) },
          { label: t('Escalated'), value: formatNumber(escalated.length), tone: countTone(escalated.length, 1, 4) },
          { label: t('No recorded owner'), value: formatNumber(unowned.length), tone: countTone(unowned.length, 2, 6) },
        ],
        `Response targets recorded on the alerts in scope: ${targetText}.`,
      ),
      compositionVisual({
        id: 'alerts-status',
        caption: t('Open alerts in scope by workflow status'),
        segments: tallyBy(open.map((a) => a.status)).map((s, idx) => ({
          id: s.value,
          label: ALERT_STATUS_LABEL[s.value],
          value: s.count,
          colour: SERIES_COLOURS[idx % SERIES_COLOURS.length],
        })),
      }),
      breached.length > 0
        ? rankedBarVisual({
            id: 'alerts-overdue',
            caption: t('Alerts furthest past their response target - hours beyond the recorded window'),
            unit: 'h',
            higherIsBetter: false,
            data: [...breached]
              .sort((a, b) => a.slaRemainingHours - b.slaRemainingHours)
              .slice(0, 8)
              .map((a) => ({ label: truncate(a.title, 34), value: Math.round(Math.abs(a.slaRemainingHours) * 10) / 10 })),
          })
        : severityComposition('alerts-severity', 'Open alerts in scope by recorded severity', open.map((a) => a.severity)),
    ]),
    followUps: [
      t('Which incidents are currently active?'),
      t('What are the five highest operational risks right now?'),
      t('What requires my attention today?'),
    ],
  }
}

/* ==========================================================================
   incidents - active response
   ========================================================================== */

const incidentsHandler: AnswerHandler = (ctx): ComposedAnswer => {
  const all = scopedAllIncidents(ctx)
  const active = scopedActiveIncidents(ctx)
  if (active.length === 0) {
    return emptyAnswer(
      ctx,
      'active incident',
      `${all.length > 0 ? t('{0} incidents are recorded in scope, all of them contained, resolved or reviewed. ', all.length) : ''}${scopeSentence(ctx)}${severityClause(ctx)}`,
    )
  }

  const ranked = [...active].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (bySeverity !== 0) return bySeverity
    return b.affectedPopulation - a.affectedPopulation
  })
  const shown = ranked.slice(0, Math.max(ctx.limit, 1))
  const affected = active.reduce((s, i) => s + i.affectedPopulation, 0)
  const area = active.reduce((s, i) => s + i.affectedAreaSqKm, 0)
  const deployed = active.reduce(
    (s, i) => s + i.responseTeams.filter((responseTeam) => responseTeam.status === 'deployed' || responseTeam.status === 'en-route').length,
    0,
  )
  const strength = active.reduce(
    (s, i) =>
      s + i.responseTeams.filter((responseTeam) => responseTeam.status === 'deployed' || responseTeam.status === 'en-route').reduce((n, responseTeam) => n + responseTeam.strength, 0),
    0,
  )
  const wardsTouched = new Set(active.map((i) => i.wardId)).size
  const roads = new Set(active.flatMap((i) => i.roadsImpacted)).size
  const hospitals = new Set(active.flatMap((i) => i.hospitalsImpacted)).size
  const contained = all.filter((i) => i.status === 'contained').length
  const settled = all.filter((i) => i.status === 'resolved' || i.status === 'reviewed').length
  const byType = tallyBy(active.map((i) => i.type))
  const byStatus = tallyBy(active.map((i) => i.status))
  const leadIncident = ranked[0]

  const evidence = bestEvidence(ctx.user, {
    wardIds: Array.from(new Set(active.map((i) => i.wardId))),
    kinds: ['field-report', 'sensor-reading', 'model-output'],
    count: 6,
  })

  const recommendations = [
    recommend({
      id: 'rec-incidents-resourcing',
      title: t('Confirm response resourcing and escalation posture across the {0} active incidents', active.length),
      why:
        `${active.length} incidents remain active across ${wardsTouched} ward${wardsTouched === 1 ? '' : 's'}, covering a modelled affected area of `
        + `${formatNumber(area, 1)} sq km with ${deployed} teams and ${formatNumber(strength)} personnel recorded as deployed or en route.`,
      expectedImpact:
        t('Establishes whether the deployment recorded against each incident remains proportionate to its assessed affected area, and identifies any incident running without an escalation position.'),
      departmentId: 'dept-disaster',
      humanOwnerRole: t('Director - Disaster Management Cell'),
      confidence: 'high',
      dependencies: [t('Emergency Operations Centre situation report'), t('Ward control room confirmation')],
      risks: [t('A resourcing review does not itself alter deployed strength')],
      evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
    }),
  ]
  if (roads > 0 || hospitals > 0) {
    recommendations.push(
      recommend({
        id: 'rec-incidents-access',
        title: t('Verify alternate access to the {0} health facilities and {1} road links recorded as impacted', hospitals, roads),
        why:
          `The active set records ${roads} road link${roads === 1 ? '' : 's'} and ${hospitals} health facilit${hospitals === 1 ? 'y' : 'ies'} as impacted. `
          + 'Where an approach is single-route, the loss of access is a dependency rather than a road condition on its own.',
        expectedImpact:
          t('Confirms a designated alternate approach for each affected facility so ambulance routing is decided before it is needed rather than during the event.'),
        departmentId: 'dept-roads',
        humanOwnerRole: t('Chief Engineer (Roads & Traffic)'),
        confidence: 'medium',
        dependencies: [t('Traffic police liaison'), t('Ward engineering confirmation of clearance width')],
        risks: [t('An alternate route confirmed on paper may be unusable under the same conditions that closed the primary')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    )
  }

  return {
    requestId: requestIdFor(ctx, 'incidents'),
    answer:
      `${active.length} incidents are currently active within your authorised scope - ${byStatus.map((s) => `${s.count} ${INCIDENT_STATUS_LABEL[s.value].toLowerCase()}`).join(', ')} - `
      + `across ${wardsTouched} ward${wardsTouched === 1 ? '' : 's'}. Approximately ${formatCompact(affected)} residents sit within the modelled affected areas, `
      + `covering ${formatNumber(area, 1)} sq km, and ${deployed} response teams totalling ${formatNumber(strength)} personnel are recorded as deployed or en route. `
      + 'Affected-population figures are modelled from ward density over the recorded affected area. They are neither a survey nor a casualty count, and must not be read as one.'
      + `${severityClause(ctx)} `
      + scopeSentence(ctx),
    keyFindings: [
      ...shown.slice(0, 5).map(
        (i) =>
          `${i.reference} - ${i.title}. ${INCIDENT_TYPE_LABEL[i.type]}, ${i.severity} severity, ${INCIDENT_STATUS_LABEL[i.status].toLowerCase()} at ${i.locationName}. `
          + `${formatCompact(i.affectedPopulation)} residents in the modelled affected area over ${formatNumber(i.affectedAreaSqKm, 2)} sq km, `
          + `${i.responseTeams.filter((responseTeam) => responseTeam.status === 'deployed' || responseTeam.status === 'en-route').length} teams engaged, detected ${formatRelative(i.detectedAt)}.`,
      ),
      t('{0} road link{1} and {2} health facilit{3} recorded as impacted across the active set.', roads, roads === 1 ? '' : 's', hospitals, hospitals === 1 ? 'y is' : 'ies are'),
      t('Of {0} incidents recorded within your scope, {1} remain active, {2} are contained and {3} are resolved or reviewed.', all.length, active.length, contained, settled),
      byType[0]
        ? t('The most frequent active incident type is {0}, accounting for {1} of {2}.', INCIDENT_TYPE_LABEL[byType[0].value].toLowerCase(), byType[0].count, active.length)
        : t('{0} active incidents are recorded in scope.', active.length),
    ],
    evidence,
    recommendedActions: recommendations.slice(0, 2),
    risksAndLimitations: [
      ...standardLimitations(),
      t('Affected population and affected area are modelled from the recorded incident geometry and ward density. They size the response; they do not establish who was affected, and no individual-level record exists anywhere in the platform.'),
      t('Response team status reflects the last entry made against the incident. A team recorded as deployed may have moved on without the register being updated, which is a reporting latency rather than an operational finding.'),
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - incident register'),
    domains: ['disaster', 'emergency', 'wards'],
    supportingTable: {
      caption: t('Active incidents within your authorised scope - {0} of {1}, most severe first', shown.length, active.length),
      columns: [
        t('Reference'),
        t('Incident'),
        t('Type'),
        t('Severity'),
        t('Status'),
        t('Geography'),
        t('Residents in modelled area'),
        t('Teams engaged'),
      ],
      rows: shown.map((i) => [
        i.reference,
        i.title,
        INCIDENT_TYPE_LABEL[i.type],
        SEVERITY_LABEL[i.severity],
        INCIDENT_STATUS_LABEL[i.status],
        i.locationName,
        formatCompact(i.affectedPopulation),
        String(i.responseTeams.filter((responseTeam) => responseTeam.status === 'deployed' || responseTeam.status === 'en-route').length),
      ]),
    },
    visuals: drop([
      metricsVisual(
        'incidents-headline',
        [
          { label: t('Active incidents'), value: formatNumber(active.length), support: `Across ${wardsTouched} ward${wardsTouched === 1 ? '' : 's'}`, tone: countTone(active.length, 1, 4) },
          { label: t('Residents in modelled affected area'), value: formatCompact(affected), support: `${formatNumber(area, 1)} sq km` },
          { label: t('Teams deployed or en route'), value: formatNumber(deployed), support: `${formatNumber(strength)} personnel` },
          { label: t('Road links impacted'), value: formatNumber(roads), tone: countTone(roads, 2, 6) },
          { label: t('Health facilities impacted'), value: formatNumber(hospitals), tone: countTone(hospitals, 1, 3) },
        ],
        scopeSentence(ctx),
      ),
      byType.length > 0
        ? compositionVisual({
            id: 'incidents-type',
            caption: t('Active incidents in scope by recorded type'),
            segments: byType.map((bucket, idx) => ({
              id: bucket.value,
              label: INCIDENT_TYPE_LABEL[bucket.value],
              value: bucket.count,
              colour: SERIES_COLOURS[idx % SERIES_COLOURS.length],
            })),
          })
        : null,
      leadIncident
        ? rankedBarVisual({
            id: 'incidents-affected',
            caption: t('Active incidents by residents in the modelled affected area - higher is worse'),
            unit: 'residents',
            higherIsBetter: false,
            data: [...active]
              .sort((a, b) => b.affectedPopulation - a.affectedPopulation)
              .slice(0, 8)
              .map((i) => ({ label: i.reference, value: i.affectedPopulation })),
          })
        : null,
    ]),
    followUps: [
      t('What requires my attention today?'),
      t('Which alerts have breached their response SLA?'),
      t('How prepared are we for this monsoon?'),
    ],
  }
}

/* ==========================================================================
   decisions - the determination queue
   ========================================================================== */

const decisionsHandler: AnswerHandler = (ctx): ComposedAnswer => {
  const readable = scopedDecisions(ctx)
  const pending = pendingDecisions(ctx)
  if (pending.length === 0) {
    return emptyAnswer(
      ctx,
      'decision case awaiting determination',
      `${readable.length > 0 ? t('{0} cases are readable within your scope, all of them already determined, in implementation or closed. ', readable.length) : ''}${scopeSentence(ctx)}${severityClause(ctx)}`,
    )
  }

  const ordered = [...pending].sort((a, b) => hoursSince(b.dueDate) - hoursSince(a.dueDate))
  const shown = ordered.slice(0, Math.max(ctx.limit, 1))
  const impact = pending.reduce((s, d) => s + d.financialImpactCrore, 0)
  const overdue = pending.filter((d) => hoursSince(d.dueDate) > 0)
  const oldest = ordered[0]
  const determined = readable.length - pending.length
  const alternativeCounts = pending.map((d) => d.alternatives.length)
  const minAlternatives = Math.min(...alternativeCounts)
  const maxAlternatives = Math.max(...alternativeCounts)
  const pendingApprovals = pending.reduce((s, d) => s + d.approvals.filter((a) => a.status === 'pending').length, 0)
  const byDomain = tallyBy(pending.map((d) => d.domain))
  const mostBlocked = [...pending].sort(
    (a, b) => b.approvals.filter((x) => x.status === 'pending').length - a.approvals.filter((x) => x.status === 'pending').length,
  )[0]

  const bestScored = pending
    .flatMap((d) => d.alternatives.map((a) => ({ decision: d, alternative: a })))
    .sort((a, b) => b.alternative.score - a.alternative.score)[0]

  const evidence = bestEvidence(ctx.user, {
    wardIds: Array.from(new Set(shown.flatMap((d) => d.wardIds))),
    kinds: ['document', 'derived-metric', 'model-output'],
    count: 6,
  })

  const recommendations = [
    recommend({
      id: 'rec-decisions-table',
      title:
        overdue.length > 0
          ? t('Table the {0} decision cases already past their recorded due date', overdue.length)
          : t('Table the {0} decision cases awaiting determination', pending.length),
      why:
        `The queue carries ${formatCrore(impact, 0)} of declared financial impact across ${pending.length} cases, each already holding its declared `
        + `alternatives scored against a published comparison basis. ${overdue.length > 0 ? t('{0} have passed their recorded due date, the oldest by {1} days.', overdue.length, formatNumber(hoursSince(oldest?.dueDate ?? '') / 24, 1)) : t('None has yet passed its due date, so the queue can be cleared before any case becomes late.')}`,
      expectedImpact:
        t('Converts a standing queue into recorded determinations with named approvers and a written rationale, which is the one step the platform cannot take on the corporation’s behalf.'),
      departmentId: 'dept-commissioner',
      humanOwnerRole: t('Municipal Commissioner'),
      confidence: 'high',
      dependencies: [t('Committee or standing committee calendar slot'), t('Approver availability')],
      risks: [t('Cases carried forward without determination continue to accrue the exposure that raised them')],
      evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
    }),
  ]
  if (mostBlocked && mostBlocked.approvals.some((a) => a.status === 'pending')) {
    recommendations.push(
      recommend({
        id: 'rec-decisions-approvals',
        title: t('Circulate {0} for the {1} outstanding approvals', mostBlocked.reference, mostBlocked.approvals.filter((a) => a.status === 'pending').length),
        why:
          `${mostBlocked.reference} holds the largest number of outstanding approvals in the queue at ${mostBlocked.approvals.filter((a) => a.status === 'pending').length} of ${mostBlocked.approvals.length}, `
          + `against ${formatCrore(mostBlocked.financialImpactCrore)} of declared financial impact. The case is complete; what is outstanding is signature, not analysis.`,
        expectedImpact:
          t('Removes the procedural block on the most-stalled case in the queue and records who is holding it.'),
        departmentId: 'dept-secretary',
        humanOwnerRole: t('Municipal Secretary'),
        confidence: 'high',
        dependencies: [t('Circulation through the secretariat'), t('Approver availability')],
        risks: [t('Circulation cannot substitute for a determination where an approver has a substantive objection to record')],
        evidenceRefs: mostBlocked.evidenceIds.slice(0, 3),
      }),
    )
  }

  return {
    requestId: requestIdFor(ctx, 'decisions'),
    answer:
      `${pending.length} decision cases are awaiting determination within your authorised scope, carrying ${formatCrore(impact, 0)} of combined declared financial impact `
      + `and ${pendingApprovals} outstanding approvals between them. Each case sets out ${minAlternatives === maxAlternatives ? `${minAlternatives}` : `${minAlternatives} to ${maxAlternatives}`} declared alternatives `
      + 'scored against a published comparison basis - modelled impact, indicative cost, time to effect and dependency risk. '
      + `${overdue.length === 0 ? t('None has yet passed the due date recorded on the case') : t('{0} {1} passed the due date recorded on the case', plural(overdue.length, 'case'), overdue.length === 1 ? 'has' : 'have')}. `
      + 'The comparison is advisory. The platform prepares the case and ranks the alternatives; the determination itself rests with a named competent authority '
      + `and cannot be made here.${severityClause(ctx)} `
      + scopeSentence(ctx),
    keyFindings: [
      ...shown.slice(0, 4).map(
        (d) =>
          `${d.reference} - ${d.title}. ${SEVERITY_LABEL[d.severity]} severity, ${DOMAIN_LABEL[d.domain]}, ${formatCrore(d.financialImpactCrore)} declared impact, `
          + `${d.alternatives.length} alternatives, ${d.approvals.filter((a) => a.status === 'pending').length} of ${d.approvals.length} approvals pending, due ${formatRelative(d.dueDate)}.`,
      ),
      overdue.length > 0 && oldest
        ? t('{0} cases have passed their recorded due date; the furthest is {1} at {2} days beyond it.', overdue.length, oldest.reference, formatNumber(hoursSince(oldest.dueDate) / 24, 1))
        : t('No case in the queue has yet passed the due date recorded against it.'),
      bestScored
        ? t('The highest-scoring alternative across the queue is "{0}" in {1} at {2}/100 on the published comparison basis, with an indicative cost of {3} and {4} days to effect. A score ranks alternatives; it does not select one.', bestScored.alternative.title, bestScored.decision.reference, bestScored.alternative.score, formatCrore(bestScored.alternative.indicativeCostCrore), bestScored.alternative.timeToEffectDays)
        : t('No alternative in the queue carries a comparison score, so none is ranked here.'),
      t('Of {0} decision cases readable within your scope, {1} await determination and {2} carry a recorded determination or have moved into implementation.', readable.length, pending.length, determined),
      byDomain[0]
        ? t('The queue concentrates in {0}, which accounts for {1} of the {2} pending cases.', DOMAIN_LABEL[byDomain[0].value], byDomain[0].count, pending.length)
        : t('The pending queue spans {0} domains.', byDomain.length),
    ],
    evidence,
    recommendedActions: recommendations.slice(0, 2),
    risksAndLimitations: [
      ...standardLimitations(),
      t('Alternative scores are produced from modelled demonstration data against a published comparison basis. They rank the declared options against each other; they do not establish that the best-scoring option is the correct one, and they cannot account for factors absent from the platform data model.'),
      t('Indicative costs are for comparison between alternatives. They are not departmental estimates and no sanction should follow from them without one.'),
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - decision register'),
    domains: Array.from(new Set<IntelligenceDomain>(['executive', ...pending.map((d) => d.domain)])),
    supportingTable: {
      caption: t('Decision cases awaiting determination - {0} of {1}, {2}', shown.length, pending.length, overdue.length > 0 ? 'furthest past its due date first' : 'earliest due date first'),
      columns: [t('Reference'), t('Case'), t('Severity'), t('Domain'), t('Declared impact'), t('Alternatives'), t('Approvals pending'), t('Due')],
      rows: shown.map((d) => [
        d.reference,
        d.title,
        SEVERITY_LABEL[d.severity],
        DOMAIN_LABEL[d.domain],
        formatCrore(d.financialImpactCrore),
        String(d.alternatives.length),
        `${d.approvals.filter((a) => a.status === 'pending').length} of ${d.approvals.length}`,
        formatRelative(d.dueDate),
      ]),
    },
    visuals: drop([
      metricsVisual(
        'decisions-headline',
        [
          { label: t('Awaiting determination'), value: formatNumber(pending.length), tone: countTone(pending.length, 3, 8) },
          { label: t('Combined declared impact'), value: formatCrore(impact, 0) },
          { label: t('Past their due date'), value: formatNumber(overdue.length), tone: countTone(overdue.length, 1, 4) },
          { label: t('Outstanding approvals'), value: formatNumber(pendingApprovals), tone: countTone(pendingApprovals, 4, 10) },
          { label: t('Already determined in scope'), value: formatNumber(determined), support: `Of ${readable.length} readable cases` },
        ],
        scopeSentence(ctx),
      ),
      byDomain.length > 0
        ? compositionVisual({
            id: 'decisions-domain',
            caption: t('Determination queue by domain'),
            segments: byDomain.map((d, idx) => ({
              id: d.value,
              label: DOMAIN_LABEL[d.value],
              value: d.count,
              colour: SERIES_COLOURS[idx % SERIES_COLOURS.length],
            })),
          })
        : null,
      rankedBarVisual({
        id: 'decisions-impact',
        caption: t('Cases awaiting determination by declared financial impact - INR crore'),
        unit: 'Cr',
        higherIsBetter: false,
        data: [...pending]
          .sort((a, b) => b.financialImpactCrore - a.financialImpactCrore)
          .slice(0, 8)
          .map((d) => ({ label: d.reference, value: Math.round(d.financialImpactCrore * 10) / 10 })),
      }),
    ]),
    followUps: [
      t('What are the five highest operational risks right now?'),
      t('What cross-domain exposures are currently identified?'),
      t('What requires my attention today?'),
    ],
  }
}

/* ==========================================================================
   cross-domain - correlations across independent domains
   ========================================================================== */

const crossDomainHandler: AnswerHandler = (ctx): ComposedAnswer => {
  const insights = buildCrossDomainInsights().filter(
    (i) => covered(ctx, i.wardIds) && severityMatches(ctx, i.severity),
  )
  if (insights.length === 0) {
    return emptyAnswer(
      ctx,
      'cross-domain exposure',
      `The correlation engine identified no exposure whose geography falls within your authorised scope. ${scopeSentence(ctx)}${severityClause(ctx)}`,
    )
  }

  const shown = insights.slice(0, Math.max(ctx.limit, 1))
  const domains = Array.from(new Set(insights.flatMap((i) => i.inputs.map((x) => x.domain))))
  const signals = insights.reduce((s, i) => s + i.inputs.length, 0)
  const serious = insights.filter((i) => i.severity === 'critical' || i.severity === 'high').length
  const wardsTouched = new Set(insights.flatMap((i) => i.wardIds.filter((w) => ctx.scopeWards.some((s) => s.id === w)))).size
  const domainTally = tallyBy(insights.flatMap((i) => i.inputs.map((x) => x.domain)))
  const leadDomain = domainTally[0]
  const lead = shown[0]
  const leadDepartment = lead?.inputs[0] ? departmentForDomain(lead.inputs[0].domain) : 'dept-commissioner'

  const evidence = bestEvidence(ctx.user, {
    wardIds: Array.from(new Set(shown.flatMap((i) => i.wardIds))),
    kinds: ['model-output', 'derived-metric', 'inspection'],
    count: 6,
  })

  const recommendations = [
    recommend({
      id: 'rec-cross-domain-verify',
      title: lead
        ? t('Commission a joint departmental verification of "{0}"', shortTitle(lead.title))
        : t('Commission a joint departmental verification of the highest-severity exposure'),
      why:
        lead
          ? `The exposure combines ${lead.inputs.length} independent signals observed on the same geography at ${lead.severity} severity with ${lead.confidence} confidence. `
            + 'Because the signals sit in different departments, no single departmental view holds all of them, and each function assessing only its own fragment is how the exposure persisted.'
          : t('Cross-domain exposures combine signals held by different departments, so no single departmental view holds all of them.'),
      expectedImpact:
        t('Establishes whether the co-occurrence reflects a shared underlying condition or is coincidental, and records that determination against the exposure either way.'),
      departmentId: leadDepartment,
      humanOwnerRole: t('Additional Municipal Commissioner'),
      confidence: lead?.confidence ?? 'medium',
      dependencies: [t('Attendance from each contributing department'), t('Field verification of the leading signal')],
      risks: [
        t('A verification that confirms only the co-occurrence, without testing an explanation, leaves the exposure exactly where it was'),
        t('Treating the correlation as an established cause before verification would be an error of causation, and the platform does not support that reading'),
      ],
      evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
    }),
    recommend({
      id: 'rec-cross-domain-record',
      title: t('Record a verification outcome against each of the {0} identified exposures', insights.length),
      why:
        'An exposure with no recorded outcome is indistinguishable from one nobody looked at. Recording the outcome - confirmed, explained or not substantiated - '
        + 'is what allows the correlation engine to be assessed rather than merely believed.',
      expectedImpact:
        t('Builds a verification history against which the engine’s precision can be measured, and prevents the same co-occurrence being re-raised as new.'),
      departmentId: 'dept-commissioner',
      humanOwnerRole: t('Municipal Commissioner’s Office - Intelligence Unit'),
      confidence: 'medium',
      dependencies: [t('Departmental responses to each verification request')],
      risks: [t('Recording an outcome without field verification would convert an unexamined correlation into an apparently settled one')],
      evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
    }),
  ]

  return {
    requestId: requestIdFor(ctx, 'cross-domain'),
    answer:
      `${insights.length} cross-domain exposures are currently identified across the geography in your authorised scope, combining ${signals} separate signals `
      + `drawn from ${domains.length} independent domains, and touching ${wardsTouched} ward${wardsTouched === 1 ? '' : 's'}. `
      + `${serious} of them are recorded at high or critical severity. Each exposure is produced by correlating signals that co-occur on the same geography in the same period. `
      + 'A correlation identifies where to look - it does not establish why. It is not a finding, it asserts nothing about the conduct of any person, department or organisation, '
      + `and it becomes an institutional position only when the accountable departments have verified it.${severityClause(ctx)} `
      + scopeSentence(ctx),
    keyFindings: [
      ...shown.slice(0, 5).map((i) => {
        const inputs = i.inputs.slice(0, 2).map((x) => `${x.signal} ${x.value}`).join('; ')
        const distinct = new Set(i.inputs.map((x) => x.domain)).size
        return (
          `${i.title} - ${SEVERITY_LABEL[i.severity]} severity, ${i.confidence} confidence, ${i.inputs.length} signals across ${distinct} domains in ${geographyLabel(i.wardIds)}. `
          + `Leading signals observed alongside one another: ${inputs}.`
        )
      }),
      t('{0} of the {1} exposures are recorded at high or critical severity; severity here reflects the combined signal strength, not an assessed likelihood of harm.', serious, insights.length),
      leadDomain
        ? t('The most frequently contributing domain is {0}, appearing in {1} of the {2} contributing signals.', DOMAIN_LABEL[leadDomain.value], leadDomain.count, signals)
        : t('The exposures draw on {0} domains between them.', domains.length),
      t('{0} ward{1} named by at least one exposure, and {2} individual signals were combined to produce them.', wardsTouched, wardsTouched === 1 ? ' in your scope is' : 's in your scope are', signals),
    ],
    evidence,
    recommendedActions: recommendations,
    risksAndLimitations: [
      ...standardLimitations(),
      t('Correlation does not establish causation. Every exposure here combines independent signals observed on the same geography and in the same period; each is a candidate for verification by the accountable departments, not a finding, and no causal relationship between the signals is asserted.'),
      t('The correlation engine tests the combinations it has been given. An exposure it does not raise is one it was not constructed to look for, which is not the same as one that does not exist.'),
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - cross-domain correlation engine'),
    domains: Array.from(new Set<IntelligenceDomain>(['executive', ...domains])).slice(0, 10),
    supportingTable: {
      caption: t('Cross-domain exposures within your authorised scope - {0} of {1}, most severe first', shown.length, insights.length),
      columns: [t('Exposure'), t('Severity'), t('Confidence'), t('Signals combined'), t('Contributing domains'), t('Geography'), t('Leading signal')],
      rows: shown.map((i) => [
        i.title,
        SEVERITY_LABEL[i.severity],
        i.confidence,
        String(i.inputs.length),
        Array.from(new Set(i.inputs.map((x) => DOMAIN_LABEL[x.domain]))).join(', '),
        geographyLabel(i.wardIds),
        i.inputs[0] ? `${i.inputs[0].signal}: ${i.inputs[0].value}` : t('Not recorded'),
      ]),
    },
    visuals: drop([
      metricsVisual(
        'cross-domain-headline',
        [
          { label: t('Exposures identified'), value: formatNumber(insights.length), tone: countTone(insights.length, 3, 6) },
          { label: t('High or critical severity'), value: formatNumber(serious), tone: countTone(serious, 1, 4) },
          { label: t('Independent domains combined'), value: formatNumber(domains.length) },
          { label: t('Signals combined'), value: formatNumber(signals) },
          { label: t('Wards in scope touched'), value: formatNumber(wardsTouched) },
        ],
        'A correlation identifies where to look, not why.',
      ),
      severityComposition(
        'cross-domain-severity',
        'Identified exposures by recorded severity',
        insights.map((i) => i.severity),
      ),
      rankedBarVisual({
        id: 'cross-domain-signals',
        caption: t('Independent signals combined into each exposure - higher means more corroboration, not more certainty of cause'),
        unit: 'signals',
        higherIsBetter: false,
        data: shown.slice(0, 8).map((i) => ({ label: shortTitle(i.title), value: i.inputs.length })),
      }),
    ]),
    followUps: [
      t('What are the five highest operational risks right now?'),
      t('Which wards need the most attention?'),
      t('Which decision cases are awaiting determination?'),
    ],
  }
}

/* ==========================================================================
   Registry
   ========================================================================== */

export const executiveHandlers: Partial<Record<QueryIntentId, AnswerHandler>> = {
  'city-position': cityPositionHandler,
  'top-risks': topRisksHandler,
  'my-attention': myAttentionHandler,
  alerts: alertsHandler,
  incidents: incidentsHandler,
  decisions: decisionsHandler,
  'cross-domain': crossDomainHandler,
}
