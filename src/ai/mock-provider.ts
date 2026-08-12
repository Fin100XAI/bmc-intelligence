import type { ConfidenceLevel, IntelligenceDomain, Severity } from '@/types/common'
import { DOMAIN_LABEL } from '@/types/common'
import type { AICitation, AIRecommendationBlock, AIResponse, AIUseCase, GroundingMode } from '@/types/ai'
import type { DecisionCase, Incident } from '@/types/operations'
import type { MonsoonScenarioInput, MonsoonScenarioResult } from '@/types/city-domains'
import type { EvidenceItem } from '@/types/intelligence'
import type { User } from '@/types/organisation'
import { canAccess } from '@/security/access'
import { getRole } from '@/security/roles'
import { EVIDENCE_BY_ID, EVIDENCE_ITEMS } from '@/data/evidence.data'
import { ALERTS, INTELLIGENCE_ITEMS } from '@/data/intelligence.data'
import { DECISION_CASES, activeIncidents, wardComplaintSummary } from '@/data/operations.data'
import { BUDGET_LINES, budgetTotals, projectsAtRisk, revenueTotals } from '@/data/finance.data'
import { LINEAGE_BY_ID, LINEAGE_GRAPHS } from '@/data/governance.data'
import { WARDS, WARD_BY_ID, departmentName, wardName } from '@/data/reference'
import { CITY_NAME } from '@/data/naming'
import { activeCorporation, municipality } from '@/config/municipality.config'
import { buildCityPosition } from '@/domains/executive/city-position'
import { buildCrossDomainInsights } from '@/domains/cross-domain/correlations'
import { DEMO_NOW, det, isoFromAnchor } from '@/utils/deterministic'
import { formatCompact, formatCrore, formatPercent, formatRelative } from '@/utils/format'
import {
  evaluateGatewayPolicy,
  type AIProvider,
  type AIRequestContext,
  type ExecutiveBrief,
  type ExecutiveBriefSection,
  type MetricExplanation,
  type RiskAnalysisResult,
} from './provider'
import { runQuery } from './query-engine'
import { t } from '@/i18n'

/**
 * MockMunicipalAIProvider - the demonstration implementation of AIProvider.
 *
 * It retrieves REAL structured platform records, filters them through the
 * permission engine BEFORE generation, and composes deterministic responses
 * that cite only evidence identifiers that actually exist.
 *
 * Every string it produces observes the platform's language rules: anomaly is
 * not fraud, risk is not guilt, correlation is not causation, simulation is
 * not forecast, and the conduct of no person or organisation is characterised.
 *
 * Replacing this with an approved sovereign, on-premise or hosted model behind
 * a governed AI gateway requires implementing this one interface. No component
 * changes.
 */
export class MockMunicipalAIProvider implements AIProvider {
  readonly id = 'mock-municipal-ai'
  readonly displayName = 'Municipal Analysis Model (demonstration)'
  readonly modelId = 'model-municipal-analysis-v1'

  /* ------------------------------------------------------------------ */
  /* Internal helpers                                                    */
  /* ------------------------------------------------------------------ */

  private async latency(seed: string): Promise<void> {
    const ms = det(`ai-latency:${seed}`).int(180, 900)
    await new Promise<void>((resolve) => setTimeout(resolve, ms))
  }

  /** Evidence the acting principal is actually authorised to read. */
  private scopedEvidence(user: User, ids: string[]): EvidenceItem[] {
    return ids
      .map((id) => EVIDENCE_BY_ID.get(id))
      .filter((e): e is EvidenceItem => Boolean(e))
      .filter(
        (e) =>
          canAccess(user, 'evidence', 'view', {
            wardIds: e.wardIds,
            departmentId: e.departmentId,
            classification: e.classification,
          }).allowed,
      )
  }

  /** Intelligence within the principal's ward, department and domain scope. */
  private scopedIntelligence(user: User, domain?: IntelligenceDomain) {
    return INTELLIGENCE_ITEMS.filter((item) => {
      if (domain && item.domain !== domain) return false
      if (item.status === 'closed') return false
      return canAccess(user, 'intelligence', 'view', {
        wardIds: item.wardIds,
        departmentId: item.departmentId,
        domain: item.domain,
        classification: item.classification,
      }).allowed
    })
  }

  /** Wards the principal may read. */
  private scopedWards(user: User) {
    return WARDS.filter((w) => canAccess(user, 'ward', 'view', { wardId: w.id }).allowed)
  }

  private citationsFrom(evidence: EvidenceItem[]): AICitation[] {
    return evidence.map((e) => ({
      id: `cit-${e.id}`,
      label: e.title,
      reference: e.sourceRecordRef,
      sourceSystem: e.sourceSystem,
      observedAt: e.observedAt,
      evidenceId: e.id,
      classification: e.classification,
    }))
  }

  /**
   * Confidence is derived from evidence volume and staleness, never chosen.
   * The derivation is returned so the interface can state it.
   */
  private deriveConfidence(evidence: EvidenceItem[]): { confidence: ConfidenceLevel; rationale: string } {
    if (evidence.length === 0) {
      return {
        confidence: 'low',
        rationale:
          t('No evidence records within your authorised scope back this response. It is presented as general reasoning, not as an evidence-backed assertion.'),
      }
    }

    const avgQuality = evidence.reduce((s, e) => s + e.dataQuality, 0) / evidence.length
    const anchor = DEMO_NOW.getTime()
    const staleCount = evidence.filter((e) => anchor - new Date(e.observedAt).getTime() > 48 * 60 * 60 * 1000).length
    const stalePct = (staleCount / evidence.length) * 100

    let confidence: ConfidenceLevel
    if (evidence.length >= 4 && avgQuality >= 82 && stalePct < 25) confidence = 'high'
    else if (evidence.length >= 2 && avgQuality >= 68 && stalePct < 55) confidence = 'medium'
    else confidence = 'low'

    return {
      confidence,
      rationale:
        `Derived from ${evidence.length} authorised evidence record${evidence.length === 1 ? '' : 's'} ` +
        `with a mean data quality of ${avgQuality.toFixed(0)}/100; ` +
        `${staleCount} record${staleCount === 1 ? '' : 's'} (${stalePct.toFixed(0)}%) ${staleCount === 1 ? 'is' : 'are'} older than 48 hours. ` +
        `Confidence is computed from evidence volume, quality and staleness - it is not asserted.`,
    }
  }

  private freshnessLabel(evidence: EvidenceItem[]): string {
    if (evidence.length === 0) return t('No underlying source observation is attached to this response.')
    const newest = evidence.reduce((a, b) => (a.observedAt > b.observedAt ? a : b))
    const oldest = evidence.reduce((a, b) => (a.observedAt < b.observedAt ? a : b))
    return t('Newest source observation {0}; oldest {1}. Figures are modelled demonstration data, not live departmental readings.', formatRelative(newest.observedAt), formatRelative(oldest.observedAt))
  }

  private recommendation(
    id: string,
    title: string,
    why: string,
    expectedImpact: string,
    departmentId: string,
    humanOwnerRole: string,
    confidence: ConfidenceLevel,
    dependencies: string[],
    risks: string[],
    evidenceRefs: string[],
  ): AIRecommendationBlock {
    return {
      id,
      title,
      why,
      evidenceRefs,
      expectedImpact,
      confidence,
      dependencies,
      risks,
      humanOwnerRole,
      departmentId,
      requiresHumanApproval: true,
    }
  }

  private baseResponse(input: {
    requestId: string
    useCase: AIUseCase
    answer: string
    keyFindings: string[]
    evidence: EvidenceItem[]
    recommendedActions: AIRecommendationBlock[]
    risksAndLimitations: string[]
    sources: string[]
    grounding?: GroundingMode
    domains: IntelligenceDomain[]
    supportingTable?: AIResponse['supportingTable']
  }): AIResponse {
    const { confidence, rationale } = this.deriveConfidence(input.evidence)
    return {
      id: `air-live-${input.requestId}`,
      requestId: input.requestId,
      useCase: input.useCase,
      answer: input.answer,
      keyFindings: input.keyFindings,
      evidence: this.citationsFrom(input.evidence),
      confidence,
      confidenceRationale: rationale,
      recommendedActions: input.recommendedActions,
      risksAndLimitations: input.risksAndLimitations,
      sources: input.sources,
      generatedAt: isoFromAnchor(0),
      dataFreshnessLabel: this.freshnessLabel(input.evidence),
      grounding: input.grounding ?? (input.evidence.length > 0 ? 'evidence-backed' : 'general-reasoning'),
      modelId: this.modelId,
      supportingTable: input.supportingTable,
      domains: input.domains,
    }
  }

  /**
   * A getter rather than a field: the provider is constructed once at module
   * load (`src/ai/index.ts`), so a field would freeze the provenance statement
   * to whichever corporation happened to be active then, and every answer the
   * Copilot gave afterwards would disclaim against the wrong corporation's
   * departmental systems. Read at call time it always names the active one.
   */
  private get STANDARD_LIMITATIONS(): string[] {
    return [
      municipality.dataProvenanceStatement,
      t('Retrieval is limited to records within your authorised ward, department, domain and classification scope. Records outside that scope are not summarised and their absence is not indicated.'),
      t('This response analyses and recommends. It does not decide, and it cannot transition any municipal record.'),
    ]
  }

  /* ------------------------------------------------------------------ */
  /* Executive brief                                                     */
  /* ------------------------------------------------------------------ */

  async generateExecutiveBrief(ctx: AIRequestContext): Promise<ExecutiveBrief> {
    await this.latency(`brief:${ctx.user.id}`)
    const { user } = ctx
    const role = getRole(user.roleId)
    const wardScoped = user.scope.wardIds !== '*'
    const wards = this.scopedWards(user)
    const intel = this.scopedIntelligence(user)
    const position = buildCityPosition()

    const scopeLabel = wardScoped
      ? `${wards.map((w) => wardName(w.id)).join(', ')}`
      : t('{0} - all {1} {2}', activeCorporation.name, wards.length, municipality.terminology.primaryUnitPlural.toLowerCase())

    const evidenceFor = (items: typeof intel, n: number): EvidenceItem[] =>
      this.scopedEvidence(user, items.flatMap((i) => i.evidenceIds).slice(0, n))

    const critical = intel.filter((i) => i.severity === 'critical')
    const high = intel.filter((i) => i.severity === 'high')
    const openAlerts = ALERTS.filter(
      (a) =>
        a.status !== 'closed' &&
        a.status !== 'resolved' &&
        canAccess(user, 'alert', 'view', { wardIds: a.wardIds, classification: a.classification }).allowed,
    )
    const breached = openAlerts.filter((a) => a.slaRemainingHours < 0)
    const pendingDecisions = DECISION_CASES.filter(
      (d) =>
        (d.status === 'under-review' || d.status === 'draft') &&
        canAccess(user, 'decision', 'view', { wardIds: d.wardIds, classification: d.classification }).allowed,
    )
    const incidents = activeIncidents().filter(
      (i) => canAccess(user, 'incident', 'view', { wardId: i.wardId, classification: i.classification }).allowed,
    )
    const atRisk = projectsAtRisk(60).filter(
      (p) => canAccess(user, 'project', 'view', { wardIds: p.wardIds, classification: p.classification }).allowed,
    )
    const worstWards = [...wards].sort((a, b) => b.riskScore - a.riskScore).slice(0, 3)
    const insights = buildCrossDomainInsights()
    const financeVisible = canAccess(user, 'budget', 'view').allowed
    const budget = budgetTotals()
    const revenue = revenueTotals()

    const sections: ExecutiveBriefSection[] = [
      {
        id: 'current-situation',
        heading: t('Current Situation'),
        body: wardScoped
          ? t('Operational position for {0} at {1}. {2} open intelligence items fall within your scope, of which {3} are critical and {4} are high severity.', scopeLabel, formatRelative(isoFromAnchor(0)), intel.length, critical.length, high.length)
          : t('{0} city health score stands at {1}/100, assessed as {2}. {3} open intelligence items are recorded across all domains, {4} of them critical. {5} incidents are currently active.', CITY_NAME, position.healthScore, position.state.replace('-', ' '), intel.length, critical.length, incidents.length),
        bullets: [
          t('{0} open alerts, {1} of which have breached their response SLA.', openAlerts.length, breached.length),
          t('{0} active incidents across {1} wards.', incidents.length, new Set(incidents.map((i) => i.wardId)).size),
          wardScoped
            ? t('Open complaints in scope: {0}.', wards.reduce((s, w) => s + wardComplaintSummary(w.id).open, 0))
            : t('{0} ward service categories are below the 65% SLA compliance threshold.', position.servicesAtRisk),
          t('Monsoon readiness averages {0}/100, with {1} wards below the 70-point threshold.', position.monsoon.readinessScore, position.monsoon.wardsBelowThreshold),
        ],
        severity: critical.length > 0 ? 'critical' : high.length > 3 ? 'high' : 'medium',
        evidenceIds: evidenceFor(intel.slice(0, 4), 4).map((e) => e.id),
        domains: ['executive', 'wards'],
      },
      {
        id: 'critical-risks',
        heading: t('Critical Risks'),
        body:
          critical.length === 0 && high.length === 0
            ? t('No critical or high-severity intelligence is currently open within your authorised scope. This states the position within your scope only; it is not a statement about the corporation as a whole.')
            : t('{0} critical and {1} high-severity items require attention. The items below are ranked by severity, then by confidence, then by recency.', critical.length, high.length),
        bullets: [...critical, ...high].slice(0, 5).map(
          (i) =>
            t('{0} - {1} severity, {2} confidence, {3}{4}.', i.title, i.severity, i.confidence, departmentName(i.departmentId), i.citizensAffected ? t(', approximately {0} residents in the modelled exposure area', formatCompact(i.citizensAffected)) : ''),
        ),
        severity: critical.length > 0 ? 'critical' : 'high',
        evidenceIds: evidenceFor([...critical, ...high].slice(0, 5), 5).map((e) => e.id),
        domains: Array.from(new Set([...critical, ...high].slice(0, 5).map((i) => i.domain))),
      },
      {
        id: 'major-exceptions',
        heading: t('Major Exceptions'),
        body: t('Exceptions are conditions departing materially from their expected position. {0} cross-domain exposures have been identified by correlating signals across independent domains.', insights.length),
        bullets: [
          ...insights.slice(0, 3).map((ins) => t('{0} - {1} severity, {2} confidence.', ins.title, ins.severity, ins.confidence)),
          ...(worstWards[0]
            ? [t('Highest ward risk: {0} at {1}/100 composite risk.', wardName(worstWards[0].id), worstWards[0].riskScore)]
            : []),
          ...(atRisk.length > 0
            ? [t('{0} capital works carry a composite risk score at or above 60.', atRisk.length)]
            : []),
        ],
        severity: insights.some((i) => i.severity === 'critical') ? 'critical' : 'high',
        evidenceIds: evidenceFor(intel.filter((i) => i.type === 'cross-domain'), 3).map((e) => e.id),
        domains: Array.from(new Set(insights.flatMap((i) => i.inputs.map((x) => x.domain)))).slice(0, 6),
      },
      {
        id: 'decisions-required',
        heading: t('Decisions Required'),
        body:
          pendingDecisions.length === 0
            ? t('No decision case is currently awaiting a determination within your authorised scope.')
            : t('{0} decision cases are awaiting determination by a competent authority. Each carries declared alternatives with a published comparison basis; the platform does not select among them.', pendingDecisions.length),
        bullets: pendingDecisions
          .slice(0, 4)
          .map(
            (d) =>
              t('{0} - {1}. {2} financial impact, {3} alternatives, due {4}.', d.reference, d.title, formatCrore(d.financialImpactCrore), d.alternatives.length, formatRelative(d.dueDate)),
          ),
        severity: pendingDecisions.some((d) => d.severity === 'critical') ? 'critical' : 'high',
        evidenceIds: this.scopedEvidence(user, pendingDecisions.flatMap((d) => d.evidenceIds).slice(0, 4)).map((e) => e.id),
        domains: Array.from(new Set(pendingDecisions.map((d) => d.domain))),
      },
      {
        id: 'operational-actions',
        heading: t('Operational Actions'),
        body: t('Actions recommended for the current operating period. Every recommendation names an accountable role and requires approval before it is acted upon.'),
        bullets: [
          ...(breached.length > 0
            ? [t('Resolve or reassign {0} SLA-breached alerts, prioritising critical severity first.', breached.length)]
            : []),
          ...(position.monsoon.wardsBelowThreshold > 0
            ? [
                t('Complete outstanding pre-monsoon desilting in the {0} wards below the readiness threshold.', position.monsoon.wardsBelowThreshold),
              ]
            : []),
          ...(incidents.length > 0
            ? [t('Confirm response resourcing across {0} active incidents and review escalation status.', incidents.length)]
            : []),
          ...(atRisk.length > 0
            ? [t('Convene milestone recovery reviews for the {0} highest-risk capital works.', Math.min(atRisk.length, 5))]
            : []),
        ],
        severity: 'high',
        evidenceIds: evidenceFor(intel.slice(0, 3), 3).map((e) => e.id),
        domains: ['wards', 'monsoon', 'projects'],
      },
      {
        id: 'financial-position',
        heading: t('Financial Position'),
        body: financeVisible
          ? t('Year-to-date position with approximately 31% of the financial year elapsed. Utilisation and collection should be read against that proportion, not against the full-year target.')
          : t('The financial position is outside your authorised scope and has not been retrieved. Its absence here is a scope constraint, not an indication that no exception exists.'),
        bullets: financeVisible
          ? [
              t('Budget utilisation {0} of the revised allocation of {1}.', formatPercent(budget.utilisationPct), formatCrore(budget.revised, 0)),
              t('Committed but unspent: {0}.', formatCrore(budget.committed, 0)),
              t('Revenue collected {0} against an annual target of {1} - {2} collection efficiency.', formatCrore(revenue.collected, 0), formatCrore(revenue.target, 0), formatPercent(revenue.efficiencyPct)),
              t('Arrears position {0}.', formatCrore(revenue.arrears, 0)),
              t('{0} budget lines show variance beyond 25 percentage points against the phased plan.', BUDGET_LINES.filter((b) => Math.abs(b.variancePct) > 25).length),
            ]
          : [t('Not retrieved - outside authorised scope.')],
        severity: financeVisible && budget.utilisationPct < 22 ? 'high' : 'medium',
        evidenceIds: financeVisible
          ? this.scopedEvidence(
              user,
              EVIDENCE_ITEMS.filter((e) => e.kind === 'financial-record')
                .slice(0, 3)
                .map((e) => e.id),
            ).map((e) => e.id)
          : [],
        domains: ['budget', 'revenue'],
      },
      {
        id: 'upcoming-risks',
        heading: t('Upcoming Risks'),
        body: t('Conditions modelled as likely to require attention in the period ahead. These are projections from current indicators, not forecasts.'),
        bullets: [
          t('Monsoon: {0} chronic waterlogging locations recorded city-wide; a heavy-rain and high-tide coincidence is the binding scenario for preparedness.', position.monsoon.chronicLocations),
          t('Public health: highest aggregate outbreak signal at {0}/100 across {1} wards.', position.health.highestSignal, position.health.wardsWithSignal),
          t('Hospital capacity: mean occupancy {0}, constraining surge headroom.', formatPercent(position.health.hospitalOccupancyPct)),
          t('Emergency response: mean response time {0} minutes, with {1} catchments above the service standard.', position.emergency.avgResponseMinutes, position.emergency.stationsBelowStandard),
        ],
        severity: 'medium',
        evidenceIds: evidenceFor(this.scopedIntelligence(user, 'monsoon'), 3).map((e) => e.id),
        domains: ['monsoon', 'health', 'hospitals', 'emergency'],
      },
    ]

    const allEvidence = this.scopedEvidence(user, sections.flatMap((s) => s.evidenceIds))
    const { confidence } = this.deriveConfidence(allEvidence)

    return {
      id: `brief-${user.id}-${DEMO_NOW.getTime()}`,
      title: wardScoped ? t('Ward Operational Brief - {0}', scopeLabel) : t('{0} Executive Brief', CITY_NAME),
      generatedAt: isoFromAnchor(0),
      generatedForRole: role?.name ?? user.designation,
      scopeLabel,
      sections,
      confidence,
      dataFreshnessLabel: this.freshnessLabel(allEvidence),
      modelId: this.modelId,
      limitations: [
        ...this.STANDARD_LIMITATIONS,
        t('This brief is a working document. It becomes an institutional position only when a named officer releases it.'),
      ],
    }
  }

  /* ------------------------------------------------------------------ */
  /* Risk analysis                                                       */
  /* ------------------------------------------------------------------ */

  async analyseRisk(ctx: AIRequestContext, domain?: IntelligenceDomain): Promise<RiskAnalysisResult> {
    await this.latency(`risk:${ctx.user.id}:${domain ?? 'all'}`)
    const { user } = ctx
    const items = this.scopedIntelligence(user, domain)

    const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
    const confRank: Record<ConfidenceLevel, number> = { high: 0, medium: 1, low: 2 }

    const ranked = [...items]
      .sort((a, b) => {
        const bySeverity = severityRank[a.severity] - severityRank[b.severity]
        if (bySeverity !== 0) return bySeverity
        const byConfidence = confRank[a.confidence] - confRank[b.confidence]
        if (byConfidence !== 0) return byConfidence
        return a.createdAt < b.createdAt ? 1 : -1
      })
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        title: item.title,
        severity: item.severity,
        confidence: item.confidence,
        driver: `Ranked at ${item.severity} severity with ${item.confidence} confidence. ${item.explanation.split('.')[0]}.`,
        wardIds: item.wardIds,
        domain: item.domain,
        evidenceIds: item.evidenceIds,
      }))

    const evidence = this.scopedEvidence(user, ranked.flatMap((r) => r.evidenceIds).slice(0, 8))

    const response = this.baseResponse({
      requestId: `risk-${domain ?? 'all'}-${user.id}`,
      useCase: 'risk-analysis',
      answer:
        ranked.length === 0
          ? t('No open intelligence within your authorised scope{0}. This describes your scope only and is not a statement about the corporation as a whole.', domain ? ` for ${DOMAIN_LABEL[domain]}` : '')
          : t('{0} risks are ranked below{1}, ordered by severity, then confidence, then recency. {2} are critical.', ranked.length, domain ? ` within ${DOMAIN_LABEL[domain]}` : ' across all authorised domains', ranked.filter((r) => r.severity === 'critical').length),
      keyFindings: ranked
        .slice(0, 5)
        .map((r, i) => t('{0}. {1} - {2} severity, {3} confidence, {4}.', i + 1, r.title, r.severity, r.confidence, DOMAIN_LABEL[r.domain])),
      evidence,
      recommendedActions: ranked.slice(0, 2).map((r, i) => {
        const item = INTELLIGENCE_ITEMS.find((x) => x.id === r.id)
        const action = item?.recommendedActions[0]
        return this.recommendation(
          `rec-risk-${i}`,
          action?.title ?? t('Assign ownership of {0}', r.title),
          action?.rationale ?? t('The item is ranked highest on the published criteria and has no recorded owner.'),
          action?.expectedImpact ?? t('Establishes accountability so the condition is addressed rather than observed.'),
          item?.departmentId ?? 'dept-commissioner',
          'Accountable departmental officer',
          r.confidence,
          action?.dependencies ?? [t('Departmental capacity confirmation')],
          action?.risks ?? [t('None material')],
          r.evidenceIds,
        )
      }),
      risksAndLimitations: [
        ...this.STANDARD_LIMITATIONS,
        t('Ranking uses the recorded severity and confidence fields. It does not model interaction effects between separate risks.'),
        t('Correlation between ranked items is not asserted. Two items appearing together does not establish that one causes the other.'),
      ],
      sources: Array.from(new Set(evidence.map((e) => e.sourceSystem))),
      domains: Array.from(new Set(ranked.map((r) => r.domain))),
      supportingTable:
        ranked.length > 0
          ? {
              caption: t('Ranked operational risks within your authorised scope'),
              columns: [t('Rank'), t('Risk'), t('Severity'), t('Confidence'), t('Geography'), t('Domain')],
              rows: ranked.map((r, i) => [
                String(i + 1),
                r.title,
                r.severity,
                r.confidence,
                r.wardIds.map((w) => wardName(w)).join(', '),
                DOMAIN_LABEL[r.domain],
              ]),
            }
          : undefined,
    })

    return { response, ranked }
  }

  /* ------------------------------------------------------------------ */
  /* Metric explanation                                                  */
  /* ------------------------------------------------------------------ */

  async explainMetric(ctx: AIRequestContext, metricId: string): Promise<MetricExplanation> {
    await this.latency(`metric:${metricId}`)
    const graph =
      LINEAGE_GRAPHS.find((g) => g.metricId === metricId || g.id === metricId || g.domain === metricId) ??
      LINEAGE_GRAPHS[0]

    if (!graph) {
      const response = this.baseResponse({
        requestId: `metric-${metricId}`,
        useCase: 'metric-explanation',
        answer: t('No lineage record exists for "{0}". The platform does not explain a metric it cannot trace, and does not substitute a plausible explanation.', metricId),
        keyFindings: [],
        evidence: [],
        recommendedActions: [],
        risksAndLimitations: [t('The metric identifier could not be resolved against the lineage register.')],
        sources: [],
        grounding: 'general-reasoning',
        domains: [],
      })
      return { response, metricLabel: metricId, computation: 'Not traceable.', inputs: [], lineageId: '' }
    }

    const evidence = this.scopedEvidence(
      ctx.user,
      EVIDENCE_ITEMS.filter((e) => e.lineageId === graph.id)
        .slice(0, 4)
        .map((e) => e.id),
    )

    const inputs = graph.stages
      .filter((s) => s.kind !== 'dashboard' && s.kind !== 'decision')
      .map((stage) => ({
        label: stage.name,
        source: stage.owner,
        contribution: `${stage.transformations.join('; ')}. Quality at this stage: ${stage.quality}/100.`,
      }))

    const computation =
      `${graph.metricLabel} is computed by taking records from ${graph.stages[0]?.name ?? t('the source system')}, ` +
      `applying schema and volume checks at ingestion, validating against domain rules with failures quarantined rather than dropped, ` +
      `mapping onto the canonical domain model with ward and department resolution, and then applying the published weighted composite. ` +
      `The result is normalised to the published scale and assigned a confidence derived from input completeness.`

    const response = this.baseResponse({
      requestId: `metric-${graph.metricId}`,
      useCase: 'metric-explanation',
      answer: t('{0} is a derived indicator with {1} declared pipeline stages. {2}', graph.metricLabel, graph.stages.length, computation),
      keyFindings: [
        t('Source system: {0}.', graph.stages.find((s) => s.kind === 'source')?.name ?? 'not recorded'),
        t('Validation quality at the assessment stage: {0}/100.', graph.stages.find((s) => s.kind === 'validation')?.quality ?? 0),
        t('Lineage last validated {0}.', formatRelative(graph.lastValidatedAt)),
        t('A metric whose lineage has not been validated is not presented as evidence anywhere in the platform.'),
      ],
      evidence,
      recommendedActions: [],
      risksAndLimitations: [
        ...this.STANDARD_LIMITATIONS,
        t('This explanation is drawn strictly from the published lineage. It does not speculate about causes outside the declared inputs.'),
      ],
      sources: Array.from(new Set([...evidence.map((e) => e.sourceSystem), graph.stages[0]?.name ?? ''])).filter(Boolean),
      domains: [graph.domain],
    })

    return { response, metricLabel: graph.metricLabel, computation, inputs, lineageId: graph.id }
  }

  /* ------------------------------------------------------------------ */
  /* Municipal query - the Copilot's primary surface                     */
  /* ------------------------------------------------------------------ */

  async answerMunicipalQuery(ctx: AIRequestContext, question: string): Promise<AIResponse> {
    await this.latency(`query:${question.slice(0, 40)}`)

    // Gateway policy is evaluated BEFORE any retrieval or generation.
    const gate = evaluateGatewayPolicy(question)
    if (!gate.permitted) {
      return this.baseResponse({
        requestId: `query-blocked-${question.length}`,
        useCase: 'municipal-query',
        answer:
          `${gate.blockedReason}\n\n` +
          'What I can do instead: retrieve the relevant records, set out the position with its evidence, compare the declared alternatives against published criteria, and prepare a decision case for the competent authority to determine. The determination itself remains with a named officer.',
        keyFindings: [
          t('Blocked intent: {0}.', gate.blockedIntent),
          t('The request was stopped at the gateway and did not reach any model.'),
          t('This event is recorded in the AI governance record.'),
        ],
        evidence: [],
        recommendedActions: [],
        risksAndLimitations: [
          t('High-impact determinations are reserved to human authority and are technically prevented at the gateway, not merely discouraged by policy.'),
        ],
        sources: [t('BMC Intelligence Core - AI gateway policy')],
        grounding: 'general-reasoning',
        domains: [],
      })
    }

    // The gateway has permitted the request. Only now is the question read,
    // are entities bound and is a route chosen - the whole retrieval path sits
    // behind that check rather than beside it.
    const { understanding, composed } = runQuery(ctx.user, question)

    const response = this.baseResponse({
      requestId: composed.requestId,
      useCase: 'municipal-query',
      answer: composed.answer,
      keyFindings: composed.keyFindings,
      evidence: composed.evidence,
      recommendedActions: composed.recommendedActions,
      risksAndLimitations: composed.risksAndLimitations,
      sources: composed.sources,
      grounding: composed.grounding,
      domains: composed.domains,
      supportingTable: composed.supportingTable,
    })

    // The reading is returned with the answer, not kept internal. An assistant
    // that answers an adjacent question silently is worse than one that
    // declines, because the operator has no way to notice; publishing the route
    // it took, the terms that carried the match and the entities it bound makes
    // a misreading visible in a glance and gives a one-click correction path.
    return {
      ...response,
      interpretation: {
        intentId: understanding.intent.id,
        intentLabel: understanding.intent.label,
        matchStrength: understanding.matchStrength,
        matchedTerms: understanding.matchedTerms,
        entities: understanding.resolvedEntities,
        note: understanding.note,
        alternatives: understanding.alternatives.map((alt) => ({
          intentId: alt.intentId,
          label: alt.label,
          question: alt.question,
        })),
      },
      visuals: composed.visuals,
      followUps: composed.followUps,
    }
  }

  /* ------------------------------------------------------------------ */
  /* Recommendations, incident summary, decision options, scenario       */
  /* ------------------------------------------------------------------ */

  async recommendActions(ctx: AIRequestContext, subject: string): Promise<AIResponse> {
    await this.latency(`rec:${subject}`)
    const { user } = ctx
    const item = INTELLIGENCE_ITEMS.find((i) => i.id === subject || i.title === subject)
    const evidence = this.scopedEvidence(user, item?.evidenceIds ?? [])

    if (!item) {
      return this.baseResponse({
        requestId: `rec-${subject}`,
        useCase: 'action-recommendation',
        answer: t('No intelligence item matching "{0}" exists within your authorised scope. No recommendation is offered, because a recommendation without an underlying record would be unsupported.', subject),
        keyFindings: [],
        evidence: [],
        recommendedActions: [],
        risksAndLimitations: [t('The subject could not be resolved to a platform record.')],
        sources: [],
        grounding: 'general-reasoning',
        domains: [],
      })
    }

    return this.baseResponse({
      requestId: `rec-${item.id}`,
      useCase: 'action-recommendation',
      answer: t('{0} actions are recommended for "{1}". Each states its rationale, expected impact, dependencies and risks, and names the accountable role. None will be performed by the platform.', item.recommendedActions.length, item.title),
      keyFindings: item.recommendedActions.map((a) => t('{0} - {1} horizon, {2} effort, {3} confidence.', a.title, a.horizon.replace('-', ' '), a.effort, a.confidence)),
      evidence,
      recommendedActions: item.recommendedActions.map((a, i) =>
        this.recommendation(
          `rec-${item.id}-${i}`,
          a.title,
          a.rationale,
          a.expectedImpact,
          a.departmentId,
          'Accountable departmental officer',
          a.confidence,
          a.dependencies,
          a.risks,
          item.evidenceIds,
        ),
      ),
      risksAndLimitations: [
        ...this.STANDARD_LIMITATIONS,
        t('Recommendations are advisory. A named officer must approve before any deployment, expenditure or instruction follows.'),
      ],
      sources: Array.from(new Set(evidence.map((e) => e.sourceSystem))),
      domains: [item.domain, ...(item.contributingDomains ?? [])],
    })
  }

  async summariseIncident(ctx: AIRequestContext, incident: Incident): Promise<AIResponse> {
    await this.latency(`incident:${incident.id}`)
    const evidence = this.scopedEvidence(ctx.user, incident.evidenceIds)
    const deployed = incident.responseTeams.filter((responseTeam) => responseTeam.status === 'deployed').length
    const latest = incident.timeline[incident.timeline.length - 1]

    return this.baseResponse({
      requestId: `incident-${incident.id}`,
      useCase: 'incident-summary',
      answer:
        `${incident.reference} - ${incident.title}. Current status is ${incident.status}, severity ${incident.severity}, at ${incident.locationName} in ${wardName(incident.wardId)}. ` +
        `${incident.responseTeams.length} response teams are assigned, ${deployed} currently deployed. ` +
        `An estimated ${formatCompact(incident.affectedPopulation)} residents are within the affected area of ${incident.affectedAreaSqKm} km² - this is a modelled estimate, not a survey figure. ` +
        `${latest ? t('The most recent timeline entry is "{0}" recorded by {1} {2}.', latest.title, latest.actor, formatRelative(latest.at)) : ''}`,
      keyFindings: [
        t('Detected {0}; {1} timeline entries recorded.', formatRelative(incident.detectedAt), incident.timeline.length),
        t('Response: {0}.', incident.responseTeams.map((responseTeam) => `${responseTeam.name} (${responseTeam.type.replace('-', ' ')}, ${responseTeam.status.replace('-', ' ')})`).join('; ') || 'none assigned'),
        ...(incident.roadsImpacted.length > 0 ? [t('Roads impacted: {0}.', incident.roadsImpacted.join(', '))] : []),
        ...(incident.hospitalsImpacted.length > 0 ? [t('Hospital access: {0}.', incident.hospitalsImpacted.join('; '))] : []),
        t('Accountable owner: {0}.', departmentName(incident.departmentId)),
      ],
      evidence,
      recommendedActions: [],
      risksAndLimitations: [
        ...this.STANDARD_LIMITATIONS,
        t('This summary is drawn strictly from the recorded timeline and resource assignments. No inference is made about the cause of the incident.'),
        t('Affected population is a modelled estimate derived from ward density and affected area. It is not a headcount.'),
      ],
      sources: Array.from(new Set([...evidence.map((e) => e.sourceSystem), t('Emergency Operations Centre Log (simulated)')])),
      domains: ['disaster', 'emergency'],
    })
  }

  async generateDecisionOptions(ctx: AIRequestContext, decisionCase: DecisionCase): Promise<AIResponse> {
    await this.latency(`decision:${decisionCase.id}`)
    const evidence = this.scopedEvidence(ctx.user, decisionCase.evidenceIds)
    const ordered = [...decisionCase.alternatives].sort((a, b) => b.score - a.score)
    const best = ordered[0]

    return this.baseResponse({
      requestId: `decision-${decisionCase.id}`,
      useCase: 'decision-options',
      answer:
        `${decisionCase.reference} declares ${ordered.length} alternatives. They are ordered below on the published comparison basis - modelled impact, indicative cost, time to effect and dependency risk. ` +
        `${best ? t('"{0}" places first at {1}/100. ', best.title, best.score) : ''}` +
        `This ordering is advisory. The decision rests with the competent authority, who must record the selected alternative and the rationale. The platform will not select among them.`,
      keyFindings: ordered.map(
        (alt, i) =>
          t('{0}. {1} - score {2}/100, {3} indicative cost, {4} days to effect. Basis: {5}', i + 1, alt.title, alt.score, formatCrore(alt.indicativeCostCrore), alt.timeToEffectDays, alt.scoreRationale),
      ),
      evidence,
      recommendedActions: [],
      risksAndLimitations: [
        ...this.STANDARD_LIMITATIONS,
        t('Only the alternatives already declared on the case are compared. No alternative is invented.'),
        t('Scores are produced from modelled demonstration data. Cost figures are indicative and require departmental estimation before any sanction.'),
        t('The comparison cannot account for factors not represented in the platform data model, including political, legal and institutional considerations known to the deciding officer.'),
      ],
      sources: Array.from(new Set([...evidence.map((e) => e.sourceSystem), t('Decision Options Analysis Model')])),
      domains: [decisionCase.domain],
      supportingTable: {
        caption: t('Alternative comparison - {0}', decisionCase.reference),
        columns: [t('Rank'), t('Alternative'), t('Score'), t('Indicative cost'), t('Time to effect'), t('Principal risk')],
        rows: ordered.map((alt, i) => [
          String(i + 1),
          alt.title,
          `${alt.score}/100`,
          formatCrore(alt.indicativeCostCrore),
          `${alt.timeToEffectDays} days`,
          alt.risks[0] ?? '-',
        ]),
      },
    })
  }

  async interpretScenario(
    ctx: AIRequestContext,
    inputs: MonsoonScenarioInput,
    result: MonsoonScenarioResult,
  ): Promise<AIResponse> {
    await this.latency(`scenario:${inputs.rainfallMm24h}:${inputs.tideHeightM}`)
    const evidence = this.scopedEvidence(
      ctx.user,
      EVIDENCE_ITEMS.filter((e) => e.kind === 'model-output' || e.kind === 'sensor-reading')
        .slice(0, 4)
        .map((e) => e.id),
    )
    const movers = [...result.wardRisks].sort((a, b) => b.delta - a.delta).slice(0, 5)

    return this.baseResponse({
      requestId: `scenario-${inputs.rainfallMm24h}-${inputs.tideHeightM}`,
      useCase: 'scenario-interpretation',
      answer:
        `This is a SIMULATION, not a forecast. Under ${inputs.rainfallMm24h} mm of rainfall over 24 hours with a ${inputs.tideHeightM} m tide, ${inputs.pumpAvailabilityPct}% pumping availability and ${inputs.desiltingCompletionPct}% desilting completion sustained over ${inputs.durationHours} hours, modelled city-wide flood risk is ${result.cityRisk}/100 and readiness falls to ${result.readinessScore}/100. ` +
        `${result.spotsAtRisk} chronic locations cross the operational attention threshold, ${result.criticalRoutesAtRisk} of them on critical routes, and ${result.hospitalsWithAccessRisk} facilities show degraded approach access. ` +
        `An estimated ${formatCompact(result.estimatedPopulationExposed)} residents fall within the modelled exposure area.`,
      keyFindings: movers.map(
        (m) => t('{0} moves {1}{2} points to {3}/100. {4}', wardName(m.wardId), m.delta > 0 ? '+' : '', m.delta, m.scenarioRisk, m.driverSummary),
      ),
      evidence,
      recommendedActions: result.recommendedDeployments.slice(0, 3).map((d, i) =>
        this.recommendation(
          `rec-scenario-${i}`,
          `Pre-position ${d.quantity} × ${d.resource.toLowerCase()} in ${wardName(d.wardId)}`,
          d.rationale,
          'Addresses the binding constraint identified by the model at the location where modelled exposure is highest.',
          'dept-disaster',
          'Director, Disaster Management Cell',
          result.confidence,
          [t('Central resource pool availability'), t('Deployment crew')],
          [
            t('The resource is unavailable to other wards while deployed'),
            t('This is a simulation; actual rainfall distribution may differ materially from the modelled assumption'),
          ],
          evidence.map((e) => e.id).slice(0, 2),
        ),
      ),
      risksAndLimitations: [
        t('This output is a SIMULATION produced by a deterministic rule model using the inputs shown. It is not a forecast, not a meteorological product, and must never be represented as either.'),
        t('Ward movement is explained only through the five declared model drivers: rainfall intensity, tidal obstruction, desilting shortfall, pump availability and duration. No other mechanism is modelled.'),
        t('The model produces no probability. Any statement of likelihood would be unsupported by it.'),
        ...this.STANDARD_LIMITATIONS.slice(0, 2),
      ],
      sources: Array.from(new Set([...evidence.map((e) => e.sourceSystem), t('Urban Flood Risk Model (demonstration)')])),
      domains: ['monsoon', 'stormwater', 'hospitals'],
      supportingTable: {
        caption: t('Ward risk movement under the simulated scenario'),
        columns: [t('Ward'), t('Baseline'), t('Scenario'), t('Movement'), t('Dominant driver')],
        rows: movers.map((m) => [
          wardName(m.wardId),
          `${m.baselineRisk}/100`,
          `${m.scenarioRisk}/100`,
          `${m.delta > 0 ? '+' : ''}${m.delta}`,
          m.driverSummary.replace('Dominant driver: ', ''),
        ]),
      },
    })
  }
}

/** Convenience: the wards a principal may read, for interface scope hints. */
export function authorisedWardCount(user: User): number {
  return WARDS.filter((w) => canAccess(user, 'ward', 'view', { wardId: w.id }).allowed).length
}

export { WARD_BY_ID, LINEAGE_BY_ID }
