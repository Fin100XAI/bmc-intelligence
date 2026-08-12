import type { QueryIntentId } from '@/ai/nlu'
import type { AnswerContext, AnswerHandler, ComposedAnswer } from '@/ai/answer-kit'
import {
  VISUAL_COLOUR,
  bestEvidence,
  compositionVisual,
  emptyAnswer,
  fullWard,
  inScope,
  metricsVisual,
  rankedBarVisual,
  recommend,
  scopeSentence,
  shortWard,
  sourcesOf,
  standardLimitations,
  toneFor,
} from '@/ai/answer-kit'
import type { AIVisual } from '@/types/ai'
import type { Severity } from '@/types/common'
import type { Ward } from '@/types/organisation'
import type { Complaint, ServiceHealth } from '@/types/operations'
import { OPERATIONAL_STATE_LABEL, SEVERITY_LABEL } from '@/types/common'
import { COMPLAINT_CATEGORY_LABEL } from '@/types/operations'
import { departmentName } from '@/data/reference'
import { COMPLAINTS, SERVICE_HEALTH, wardComplaintSummary } from '@/data/operations.data'
import { WARD_MONSOON_READINESS, wardWastePerformance } from '@/data/city.data'
import { wardAirQuality, wardHospitals } from '@/data/social.data'
import { buildCrossDomainInsights } from '@/domains/cross-domain/correlations'
import type { ComparisonRow, WardIndexComponent } from '@/domains/wards/profile'
import { buildWardProfile, buildWardRiskIndex, compareWards } from '@/domains/wards/profile'
import {
  formatCompact,
  formatCrore,
  formatDelta,
  formatNumber,
  formatPercent,
  formatRelative,
} from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/ai/answers/wards.ts
 *
 * Retrieval routes for the ward group: a single ward's operational position,
 * wards ranked against each other, wards compared side by side, service
 * delivery against SLA, and complaint movement.
 *
 * The route these five exist to correct is `ward-profile`. A question naming a
 * ward used to return a corporation-wide table that answered a different
 * question convincingly. Every handler here reads `ctx.focusWards` and
 * `ctx.scopeWards` first and computes its figures from the wards actually
 * bound, so a ward-shaped question produces a ward-shaped answer or states
 * plainly that it could not.
 *
 * Two rules govern the prose. A composite index says where attention is
 * warranted; it never says who is at fault. And where two conditions appear on
 * the same geography in the same period they are reported as co-occurring and
 * as candidates for verification - never as one causing the other.
 */

/* ==========================================================================
   Shared vocabulary
   ========================================================================== */

/** The compliance level below which a service category is read as below SLA. */
const SLA_THRESHOLD = 70

/** Movement, in percentage points, at which a category counts as rising. */
const RISING_THRESHOLD = 4

/** Movement, in percentage points, at which a category counts as falling. */
const FALLING_THRESHOLD = -6

/** Wards placed side by side before the comparison table stops being readable. */
const MAX_COMPARE = 4

/**
 * The officer a recommendation is addressed to in each department.
 *
 * A recommendation without a named accountable role is a note to nobody, and
 * the platform will not raise one. Departments absent from this table fall back
 * to their published head through `departmentName`.
 */
const DEPARTMENT_ROLE: Record<string, string | undefined> = {
  'dept-commissioner': 'Deputy Municipal Commissioner (Zone)',
  'dept-hydraulic': 'Executive Engineer (Hydraulic)',
  'dept-sewerage': 'Executive Engineer (Sewerage)',
  'dept-stormwater': 'Executive Engineer (Storm Water Drains)',
  'dept-roads': 'Executive Engineer (Roads)',
  'dept-solid-waste': 'Assistant Municipal Commissioner (Solid Waste)',
  'dept-electrical': 'Executive Engineer (Electrical)',
  'dept-health': 'Medical Officer of Health',
  'dept-hospitals': 'Director (Medical Education & Major Hospitals)',
  'dept-building': 'Executive Engineer (Building Proposals)',
  'dept-estates': 'Estates Manager',
  'dept-gardens': 'Superintendent of Gardens',
  'dept-education': 'Education Officer',
  'dept-licence': 'Superintendent of Licences',
  'dept-registration': 'Registrar of Births & Deaths',
  'dept-projects': 'Chief Engineer (Projects)',
  'dept-procurement': 'Controller of Procurement',
  'dept-assessment': 'Assessor & Collector',
  'dept-finance': 'Chief Accountant (Finance)',
  'dept-disaster': 'Director (Disaster Management)',
  'dept-housing': 'Deputy Chief Engineer (Housing)',
}

function ownerRole(departmentId: string): string {
  return DEPARTMENT_ROLE[departmentId] ?? t('Head - {0}', departmentName(departmentId))
}

/** The department that owns each published component of the ward index. */
const COMPONENT_DEPARTMENT: Record<string, string | undefined> = {
  serviceDelivery: 'dept-commissioner',
  infrastructureCondition: 'dept-roads',
  floodExposure: 'dept-stormwater',
  publicHealth: 'dept-health',
  deliveryPerformance: 'dept-projects',
  revenuePerformance: 'dept-assessment',
}

/**
 * The index band a stated severity is read as.
 *
 * An operator who asks for the critical wards is asking for a band of the
 * published index, not for a separate register. Zero means the severity places
 * no floor at all, in which case no filter is applied and none is claimed.
 */
const SEVERITY_INDEX_FLOOR: Record<Severity, number> = {
  critical: 78,
  high: 62,
  medium: 44,
  low: 0,
  info: 0,
}

/** The recorded service states a stated severity is read as covering. */
const SEVERITY_STATES: Record<Severity, Array<ServiceHealth['state']>> = {
  critical: ['critical'],
  high: ['critical', 'at-risk'],
  medium: ['critical', 'at-risk', 'degraded'],
  low: [],
  info: [],
}

function categoryLabel(category: ServiceHealth['category']): string {
  return COMPLAINT_CATEGORY_LABEL[category]
}

/**
 * The department that owns a service category, read from the grievance register
 * itself rather than from a second copy of the routing table. Only records
 * already inside the answer's scope are consulted.
 */
function categoryDepartment(complaints: Complaint[], category: ServiceHealth['category']): string {
  return complaints.find((c) => c.category === category)?.departmentId ?? 'dept-commissioner'
}

function monsoonReadiness(wardId: string): number {
  return WARD_MONSOON_READINESS.find((r) => r.wardId === wardId)?.readinessScore ?? 0
}

/** "1 complaint" / "4 complaints" - a count and its noun in agreement. */
function countOf(value: number, singular: string, plural?: string): string {
  return `${formatNumber(value)} ${value === 1 ? singular : (plural ?? `${singular}s`)}`
}

/** Verb agreement for a counted subject. */
function isAre(value: number): string {
  return value === 1 ? 'is' : 'are'
}

/** A single ward's reading on a comparison row. */
function metricValue(row: ComparisonRow, wardId: string): number {
  return row.values[wardId] ?? 0
}

function meanSlaFor(rows: ServiceHealth[]): number {
  if (rows.length === 0) return 0
  return Math.round((rows.reduce((s, r) => s + r.slaCompliancePct, 0) / rows.length) * 10) / 10
}

/** Complaints inside the answer's geographic scope. */
function scopedComplaints(ctx: AnswerContext): Complaint[] {
  return COMPLAINTS.filter((c) => inScope(ctx, c.wardId))
}

/** Service health readings inside the answer's geographic scope. */
function scopedServiceHealth(ctx: AnswerContext): ServiceHealth[] {
  return SERVICE_HEALTH.filter((s) => inScope(ctx, s.wardId))
}

/** Segment colour reflects the component's own band, never its size. */
function bandColour(score: number): string {
  const tone = toneFor(score, false)
  if (tone === 'critical') return VISUAL_COLOUR.crit
  if (tone === 'warn') return VISUAL_COLOUR.warn
  if (tone === 'positive') return VISUAL_COLOUR.ok
  return VISUAL_COLOUR.govt
}

/** The published weights, written out so the method is stated, not implied. */
function weightSentence(components: WardIndexComponent[]): string {
  return components
    .map((c) => `${c.label.toLowerCase()} at ${formatPercent(c.weight * 100, 0)}`)
    .join(', ')
}

interface RankedWard {
  ward: Ward
  score: number
  trendPct: number
  components: WardIndexComponent[]
  leading: WardIndexComponent | undefined
  reasons: string[]
  health: number
  complaints: ReturnType<typeof wardComplaintSummary>
  readiness: number
  slaMean: number
  categoriesBelow: number
}

/**
 * Every ward in the given set placed on the published index, ordered highest
 * reading first. Wards whose profile cannot be assembled are dropped rather
 * than carried at a default score they did not earn.
 */
function rankWardsByIndex(wards: Ward[]): RankedWard[] {
  return wards
    .map((ward) => {
      const index = buildWardRiskIndex(ward.id)
      if (!index) return null
      const rows = SERVICE_HEALTH.filter((s) => s.wardId === ward.id)
      const leading = [...index.components].sort((a, b) => b.contribution - a.contribution).at(0)
      return {
        ward,
        score: index.score,
        trendPct: index.trendPct,
        components: index.components,
        leading,
        reasons: index.deteriorationReasons,
        health: ward.healthScore,
        complaints: wardComplaintSummary(ward.id),
        readiness: monsoonReadiness(ward.id),
        slaMean: meanSlaFor(rows),
        categoriesBelow: rows.filter((r) => r.slaCompliancePct < SLA_THRESHOLD).length,
      } satisfies RankedWard
    })
    .filter((r): r is RankedWard => r !== null)
    .sort((a, b) => b.score - a.score)
}

/* ==========================================================================
   ward-profile - a single ward's full operational position
   ========================================================================== */

function answerWardProfile(ctx: AnswerContext): ComposedAnswer {
  if (ctx.wards.length === 0) {
    return emptyAnswer(
      ctx,
      'ward',
      'Ward-level retrieval had nothing to scope against, so no position is set out and no substitute ward is offered in its place.',
    )
  }

  const named = ctx.focusWards
  const first = named.at(0)
  let ward: Ward | undefined = first
  let substitution = ''

  if (!first) {
    const fallback = rankWardsByIndex(ctx.wards).at(0)
    ward = fallback?.ward
    substitution = ward
      ? `No ward was named in the question, so nothing ward-specific could be bound from it. `
        + `${fullWard(ward.id)} - the highest reading on the index within your authorised scope - is set out instead, as a substitution rather than as the ward you asked about.`
      : ''
  } else if (named.length > 1) {
    substitution =
      `The question named ${named.length} wards; a profile covers one. ${fullWard(first.id)} is set out here, `
      + 'and the remaining named wards are best placed alongside it through a comparison.'
  }

  if (!ward) {
    return emptyAnswer(ctx, 'ward index', 'No ward could be placed on the published six-component index, so no position is stated.')
  }

  const profile = buildWardProfile(ward.id)
  const index = buildWardRiskIndex(ward.id)
  if (!profile || !index) {
    return emptyAnswer(
      ctx,
      'ward profile',
      `${fullWard(ward.id)} holds no assembled profile in the ward register, so no position can be stated for it.`,
    )
  }

  const components = [...index.components].sort((a, b) => b.contribution - a.contribution)
  const leading = components.at(0)
  const categories = [...profile.services.byCategory].sort((a, b) => a.slaCompliancePct - b.slaCompliancePct)
  const below = categories.filter((c) => c.slaCompliancePct < SLA_THRESHOLD)
  const worst = categories.at(0)
  const waste = wardWastePerformance(ward.id)
  const readiness = WARD_MONSOON_READINESS.find((r) => r.wardId === ward.id)
  const signal = profile.health.topSignals.at(0)
  const air = wardAirQuality(ward.id)
  const hospitals = wardHospitals(ward.id)
  const topDefect = profile.roads.topDefects.at(0)
  const water = profile.water
  const evidence = bestEvidence(ctx.user, {
    wardIds: [ward.id],
    kinds: ['derived-metric', 'field-report', 'inspection'],
    count: 5,
  })
  const freshest = evidence.at(0)

  const keyFindings: string[] = [
    `Ward Risk & Performance Index reads ${index.score}/100 against an operational health index of ${profile.healthScore}/100, `
    + `moving ${formatDelta(index.trendPct)} against the previous 30 days. The ward is recorded as ${OPERATIONAL_STATE_LABEL[profile.state].toLowerCase()} `
    + `and index confidence is rated ${index.confidence}.`,

    `${countOf(profile.services.complaints.open, 'complaint')} ${isAre(profile.services.complaints.open)} open on the ward register, ${formatNumber(profile.services.complaints.slaBreached)} `
    + `of them past the SLA window, a repeat rate of ${formatPercent(profile.services.complaints.repeatRate)} and ${formatPercent(profile.services.complaints.resolvedRate)} `
    + 'of the register resolved or closed.',

    below.length > 0 && worst
      ? `${below.length} of ${categories.length} service categories ${below.length === 1 ? 'sits' : 'sit'} below the ${SLA_THRESHOLD}% SLA compliance threshold. `
        + `The weakest is ${categoryLabel(worst.category)} at ${formatPercent(worst.slaCompliancePct)} with ${formatNumber(worst.open)} open `
        + `and a mean resolution of ${formatNumber(worst.avgResolutionHours)} hours, moving ${formatDelta(worst.trendPct)}.`
      : t('No service category in the ward sits below the {0}% SLA compliance threshold; mean compliance across {1} categories is {2}.', SLA_THRESHOLD, categories.length, formatPercent(meanSlaFor(categories))),

    `Monsoon readiness stands at ${profile.drainage.readinessScore}/100 - desilting ${formatPercent(profile.drainage.desiltingPct)}, `
    + `pump readiness ${profile.drainage.pumpReadiness}/100 - against a drain blockage risk of ${profile.drainage.riskScore}/100, `
    + `with ${countOf(profile.drainage.floodSpots, 'chronic waterlogging location')} recorded and ${formatNumber(readiness?.spotsMitigated ?? 0)} mitigated. `
    + `${ward.floodProne ? t('The ward is classified flood-prone.') : t('The ward carries limited low-lying exposure.')}`
    + `${profile.drainage.gaps.at(0) ? t(' Open gap: {0}.', profile.drainage.gaps.at(0)) : ''}`,

    water
      ? `Supply is drawn from ${water.zoneName}: ${formatNumber(water.supplyMld, 1)} MLD against ${formatNumber(water.demandMld, 1)} MLD assessed demand, `
        + `a deficit of ${formatNumber(water.deficitMld, 1)} MLD, tail-end pressure ${formatNumber(water.pressureM, 1)} m over ${formatNumber(water.supplyHours, 1)} supply hours, `
        + `non-revenue water ${formatPercent(water.nrwPct)} and a reliability reading of ${water.reliabilityScore}/100.`
      : t('No distribution zone is mapped to this ward in the water register, so no supply position is stated for it.'),

    `${waste ? t('Waste collection covers {0} of {1} TPD generated, with {2} segregated at source, {3} in seven days and {4}. ', formatPercent(waste.coveragePct), formatNumber(waste.generationTpd, 1), formatPercent(waste.segregationPct), countOf(waste.missedCollections7d, 'missed collection'), countOf(waste.hotspots, 'recorded hotspot')) : ''}`
    + `Road condition indexes ${profile.roads.conditionIndex}/100 with ${countOf(profile.roads.openDefects, 'high-priority defect')} on the register`
    + `${topDefect ? t(', the highest scoring {0}/100 and carrying {1}', topDefect.priorityScore, countOf(topDefect.complaintCount, 'linked complaint')) : ''}.`,

    signal
      ? `The strongest aggregate outbreak signal is ${signal.disease} at ${signal.outbreakSignal}/100 - ${formatNumber(signal.casesReported)} cases against `
        + `${formatNumber(signal.casesPrevPeriod)} in the previous period, ${formatDelta(signal.changePct)}. `
        + `${countOf(hospitals.length, 'municipal hospital')} ${isAre(hospitals.length)} recorded in the ward${air ? t(' and the air quality station reads AQI {0} ({1})', formatNumber(air.aqi), air.category) : ''}. `
        + 'Health figures are aggregate indicators only; no individual-level record is held.'
      : t('No aggregate health indicator is recorded for this ward{0}.', air ? `; the air quality station reads AQI ${formatNumber(air.aqi)} (${air.category})` : ''),

    `${countOf(profile.projects.total, 'capital work')} ${isAre(profile.projects.total)} attributed to the ward, ${formatNumber(profile.projects.atRisk)} at or above a composite risk of 60 `
    + `and ${formatNumber(profile.projects.delayed)} recorded as delayed, with ${formatCrore(profile.projects.sanctionedCrore)} sanctioned against `
    + `${formatCrore(profile.finance.budgetSpentCrore)} paid - ${formatPercent(profile.finance.budgetUtilisationPct)} utilisation. `
    + `Collection efficiency is ${formatPercent(profile.finance.collectionEfficiencyPct)} with ${formatCrore(profile.finance.arrearsCrore)} in arrears.`,
  ]

  const componentDept = COMPONENT_DEPARTMENT[leading?.id ?? ''] ?? 'dept-commissioner'

  const visuals: AIVisual[] = [
    metricsVisual(
      `ward-profile-headline-${ward.id}`,
      [
        { label: t('Risk & Performance Index'), value: `${index.score}/100`, support: formatDelta(index.trendPct), tone: toneFor(index.score, false) },
        { label: t('Operational health'), value: `${profile.healthScore}/100`, support: OPERATIONAL_STATE_LABEL[profile.state], tone: toneFor(profile.healthScore, true) },
        { label: t('Complaints open'), value: formatNumber(profile.services.complaints.open), support: `${formatNumber(profile.services.complaints.slaBreached)} past SLA`, tone: profile.services.complaints.slaBreached > 0 ? 'warn' : 'positive' },
        { label: t('Monsoon readiness'), value: `${profile.drainage.readinessScore}/100`, support: `${formatNumber(profile.drainage.floodSpots)} chronic locations`, tone: toneFor(profile.drainage.readinessScore, true) },
        { label: t('Road condition'), value: `${profile.roads.conditionIndex}/100`, support: `${formatNumber(profile.roads.openDefects)} priority defects`, tone: toneFor(profile.roads.conditionIndex, true) },
        { label: t('Capital works at risk'), value: `${formatNumber(profile.projects.atRisk)} of ${formatNumber(profile.projects.total)}`, support: formatCrore(profile.projects.sanctionedCrore), tone: profile.projects.atRisk > 0 ? 'warn' : 'positive' },
      ],
      `${fullWard(ward.id)} - ${formatCompact(ward.population)} residents over ${formatNumber(ward.areaSqKm, 1)} sq km.`,
    ),
    compositionVisual({
      id: `ward-profile-components-${ward.id}`,
      caption:
        'Weighted contribution of each published component to the Ward Risk & Performance Index. '
        + 'Segment colour reflects that component’s own band, not the size of its contribution.',
      segments: components.map((c) => ({
        id: c.id,
        label: `${c.label} (${formatPercent(c.weight * 100, 0)})`,
        value: c.contribution,
        colour: bandColour(c.score),
      })),
    }),
  ]

  if (categories.length > 0) {
    visuals.push(
      rankedBarVisual({
        id: `ward-profile-services-${ward.id}`,
        caption: t('Service categories in {0} by SLA compliance, weakest first', fullWard(ward.id)),
        unit: '%',
        higherIsBetter: true,
        data: categories.slice(0, 8).map((c) => ({ label: categoryLabel(c.category), value: c.slaCompliancePct })),
      }),
    )
  }

  return {
    requestId: `q-ward-profile-${ward.id}-${ctx.user.id}`,
    answer:
      `${substitution ? `${substitution} ` : ''}`
      + `${fullWard(ward.id)} reads ${index.score}/100 on the Ward Risk & Performance Index against an operational health index of `
      + `${profile.healthScore}/100, and is recorded as ${OPERATIONAL_STATE_LABEL[profile.state].toLowerCase()} serving ${formatCompact(ward.population)} residents. `
      + `The index is composed from six published components - ${weightSentence(index.components)} - and the largest single contributor here is `
      + `${leading ? t('{0} at {1} of the {2} points', leading.label.toLowerCase(), formatNumber(leading.contribution, 1), index.score) : t('not separable from the components held')}. `
      + `${index.deteriorationReasons.at(0) ?? ''} `
      + 'A reading at this level indicates where attention is warranted in the ward; it does not attribute the position to the Ward Officer, '
      + 'to any department or to any contractor engaged there.',
    keyFindings,
    evidence,
    recommendedActions: [
      recommend({
        id: `rec-ward-profile-component-${ward.id}`,
        title: t('Establish the binding constraint behind {0} in {1}', leading ? leading.label.toLowerCase() : 'the leading component', fullWard(ward.id)),
        why:
          `${leading ? t('{0} scores {1}/100 and contributes {2} points at a published weight of {3}, the largest single contribution to the ward\'s index. ', leading.label, leading.score, formatNumber(leading.contribution, 1), formatPercent(leading.weight * 100, 0)) : ''}`
          + `${leading?.explanation ?? ''}`,
        expectedImpact:
          t('Separates a resourcing constraint from a scheduling or data-capture one, so the intervention is directed at the component actually carrying the reading rather than at the ward in general.'),
        departmentId: componentDept,
        humanOwnerRole: ownerRole(componentDept),
        confidence: index.confidence,
        dependencies: [t('Ward field verification'), t('Departmental return from {0}', departmentName(componentDept))],
        risks: [
          t('A component score is computed from held records. Where the ward’s data is thin, the constraint may lie in capture rather than in delivery.'),
        ],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 3),
      }),
      recommend({
        id: `rec-ward-profile-review-${ward.id}`,
        title: t('Convene a ward review for {0} with the departments named above', fullWard(ward.id)),
        why:
          `${below.length} service categories sit below the ${SLA_THRESHOLD}% threshold, ${formatNumber(profile.services.complaints.slaBreached)} complaints are past their SLA window `
          + `and ${formatNumber(profile.projects.atRisk)} of ${formatNumber(profile.projects.total)} capital works carry a composite risk at or above 60. These sit with different departments and cannot be resolved singly.`,
        expectedImpact:
          t('Places the six components in front of the accountable departments together, so the ward position is treated as one picture rather than as separate departmental readings.'),
        departmentId: 'dept-commissioner',
        humanOwnerRole: ownerRole('dept-commissioner'),
        confidence: 'medium',
        dependencies: [t('Ward Officer availability'), t('Departmental representation at the review')],
        risks: [t('A review without a resource decision will not change the position it records.')],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('The index indicates where attention is warranted in {0}. It does not attribute the position to the Ward Officer, to any department or to any contractor, and no conduct of any person or organisation is characterised by it.', fullWard(ward.id)),
      `Index confidence is rated ${index.confidence}, derived from the number of contributing records held for this ward; a component with thin data carries a modelled default rather than a measured value.`
      + `${freshest ? t(' The most recent supporting record in scope was observed {0}.', formatRelative(freshest.observedAt)) : ''}`,
      ...(substitution ? [t('This answer covers {0} by substitution, not by selection from the question. Name a ward to scope the retrieval directly.', fullWard(ward.id))] : []),
    ],
    sources: sourcesOf(evidence, 'Ward Risk & Performance Index', 'BMC Intelligence Core - ward register'),
    domains: ['wards', 'citizen-services', 'monsoon', 'roads', 'projects'],
    supportingTable: {
      caption: t('Ward Risk & Performance Index components for {0}, with published weights', fullWard(ward.id)),
      columns: [t('Component'), t('Component score'), t('Published weight'), t('Weighted contribution'), t('Period movement'), t('Basis')],
      rows: [
        ...components.map((c) => [
          c.label,
          `${c.score}/100`,
          formatPercent(c.weight * 100, 0),
          formatNumber(c.contribution, 1),
          formatDelta(c.trendPct),
          c.explanation,
        ]),
        [
          t('Composite index'),
          `${index.score}/100`,
          formatPercent(100, 0),
          formatNumber(index.score, 1),
          formatDelta(index.trendPct),
          t('Sum of the weighted contributions above. No term is applied outside this table.'),
        ],
      ],
    },
    visuals,
    followUps: [
      t('Which services are below their SLA in {0}?', fullWard(ward.id)),
      t('Why are complaints increasing in {0}?', fullWard(ward.id)),
      t('Compare {0} and {1}.', fullWard(ward.id), fullWard(rankWardsByIndex(ctx.wards.filter((w) => w.id !== ward.id)).at(0)?.ward.id ?? ward.id)),
    ],
  }
}

/* ==========================================================================
   ward-ranking - wards ordered on the published index
   ========================================================================== */

function answerWardRanking(ctx: AnswerContext): ComposedAnswer {
  if (ctx.scopeWards.length === 0) {
    return emptyAnswer(ctx, 'ward', 'The geography this question scoped resolved to nothing readable, so no ordering is offered.')
  }

  const all = rankWardsByIndex(ctx.scopeWards)
  if (all.length === 0) {
    return emptyAnswer(ctx, 'ward index', 'No ward in scope could be placed on the published index, so no ordering is offered.')
  }

  const severity = ctx.understanding.entities.severity
  const floor = severity ? SEVERITY_INDEX_FLOOR[severity] : 0
  const banded = floor > 0 ? all.filter((r) => r.score >= floor) : all
  // A band that matches nothing is not an empty register. The ordering is still
  // real; what is absent is any ward in the band, and saying so is the answer.
  const bandEmpty = floor > 0 && banded.length === 0
  const filtered = bandEmpty ? all : banded

  const limit = Math.max(1, Math.min(ctx.limit, filtered.length))
  const ranked = filtered.slice(0, limit)
  const top = ranked.at(0)
  const last = ranked.at(-1)
  const mean = Math.round((all.reduce((s, r) => s + r.score, 0) / all.length) * 10) / 10
  const openTotal = ranked.reduce((s, r) => s + r.complaints.open, 0)
  const breachedTotal = ranked.reduce((s, r) => s + r.complaints.slaBreached, 0)
  const floodProne = ranked.filter((r) => r.ward.floodProne).length
  const lowReadiness = ranked.filter((r) => r.readiness < 70).length

  const leadCounts = new Map<string, { label: string; count: number; weight: number }>()
  for (const row of ranked) {
    if (!row.leading) continue
    const existing = leadCounts.get(row.leading.id)
    if (existing) existing.count += 1
    else leadCounts.set(row.leading.id, { label: row.leading.label, count: 1, weight: row.leading.weight })
  }
  const mostFrequentLead = [...leadCounts.entries()].sort((a, b) => b[1].count - a[1].count).at(0)
  const leadDept = COMPONENT_DEPARTMENT[mostFrequentLead?.[0] ?? ''] ?? 'dept-commissioner'

  const evidence = bestEvidence(ctx.user, {
    wardIds: ranked.map((r) => r.ward.id),
    kinds: ['derived-metric', 'field-report'],
    count: 5,
  })

  const keyFindings: string[] = [
    `Across ${countOf(all.length, 'ward')} in scope the index averages ${formatNumber(mean, 1)}/100, spanning ${all.at(-1)?.score ?? 0}/100 to ${all.at(0)?.score ?? 0}/100. `
    + `${countOf(all.filter((r) => r.score >= 60).length, 'ward')} ${all.filter((r) => r.score >= 60).length === 1 ? 'reads' : 'read'} at or above 60/100.`,

    mostFrequentLead
      ? `The component leading most often across the ranked set is ${mostFrequentLead[1].label.toLowerCase()} (published weight ${formatPercent(mostFrequentLead[1].weight * 100, 0)}), `
        + `carrying the largest contribution in ${mostFrequentLead[1].count} of the ${ranked.length} wards listed.`
      : t('No single component leads across the ranked set; contributions are distributed across the six published terms.'),

    `The ranked set holds ${countOf(openTotal, 'open complaint')} with ${formatNumber(breachedTotal)} past the SLA window, `
    + `${countOf(floodProne, 'ward')} classified flood-prone and ${lowReadiness} below a monsoon readiness of 70/100.`,

    ...ranked.slice(0, 5).map(
      (r) =>
        `${fullWard(r.ward.id)} - index ${r.score}/100, health ${r.health}/100, ${countOf(r.complaints.open, 'complaint')} open with ${formatNumber(r.complaints.slaBreached)} past SLA, `
        + `mean SLA compliance ${formatPercent(r.slaMean)}, monsoon readiness ${r.readiness}/100`
        + `${r.leading ? t(', led by {0} at {1} points', r.leading.label.toLowerCase(), formatNumber(r.leading.contribution, 1)) : ''}.`,
    ),
  ]

  return {
    requestId: `q-ward-ranking-${ctx.user.id}-${ctx.scopeWards.length}-${limit}-${severity ?? 'all'}`,
    answer:
      `${ranked.length} of ${countOf(all.length, 'ward')} in scope ${isAre(ranked.length)} set out in order of the Ward Risk & Performance Index. `
      + `${scopeSentence(ctx)} `
      + `${top ? t('{0} reads highest at {1}/100{2}. ', fullWard(top.ward.id), top.score, last && last.ward.id !== top.ward.id ? `, with ${fullWard(last.ward.id)} lowest in the listed set at ${last.score}/100` : '') : ''}`
      + `The index weights ${top ? weightSentence(top.components) : t('six published components')}`
      + `${floor > 0 && severity ? (bandEmpty ? t(', and no ward in scope reads at or above the {0} band ({1}/100 and above), so the highest readings are set out in its place', SEVERITY_LABEL[severity].toLowerCase(), floor) : t(', and the set is filtered to wards reading at or above the {0} band ({1}/100 and above)', SEVERITY_LABEL[severity].toLowerCase(), floor)) : ''}. `
      + 'An ordering places wards against each other on a published measure. It does not establish that any ward is failing, that any ward requires no attention, '
      + 'or that the position of any ward is attributable to its officer or to a department.',
    keyFindings,
    evidence,
    recommendedActions: [
      ...(top
        ? [
            recommend({
              id: `rec-ward-ranking-review-${top.ward.id}`,
              title: t('Convene a ward review for {0}', fullWard(top.ward.id)),
              why:
                `${fullWard(top.ward.id)} carries the highest index reading in scope at ${top.score}/100 with ${formatNumber(top.complaints.slaBreached)} complaints past their SLA window `
                + `and ${countOf(top.categoriesBelow, 'service category', 'service categories')} below the ${SLA_THRESHOLD}% threshold. ${top.reasons.at(0) ?? ''}`,
              expectedImpact:
                t('Establishes which of the six published components is the binding constraint in the highest-reading ward, so intervention is directed rather than general.'),
              departmentId: 'dept-commissioner',
              humanOwnerRole: ownerRole('dept-commissioner'),
              confidence: 'high',
              dependencies: [t('Ward Officer availability'), t('Departmental representation at the review')],
              risks: [t('A review without a resource decision will not change the position it records.')],
              evidenceRefs: evidence.map((e) => e.id).slice(0, 3),
            }),
          ]
        : []),
      ...(mostFrequentLead && mostFrequentLead[1].count > 1
        ? [
            recommend({
              id: `rec-ward-ranking-component-${mostFrequentLead[0]}`,
              title: t('Assess {0} as a cross-ward constraint', mostFrequentLead[1].label.toLowerCase()),
              why:
                `${mostFrequentLead[1].label} is the largest contributor in ${mostFrequentLead[1].count} of the ${ranked.length} ranked wards at a published weight of `
                + `${formatPercent(mostFrequentLead[1].weight * 100, 0)}. A component leading in several wards at once is a candidate for a shared constraint rather than several ward-specific ones - a candidate for verification, not an established finding.`,
              expectedImpact:
                t('Tests whether one departmental capacity or scheduling constraint is producing the reading across several wards, which would change the intervention from ward-by-ward to corporation-wide.'),
              departmentId: leadDept,
              humanOwnerRole: ownerRole(leadDept),
              confidence: 'medium',
              dependencies: [t('Departmental return from {0}', departmentName(leadDept))],
              risks: [
                t('A component appearing across several wards may reflect a common data-capture practice rather than a common operational constraint. The two are not separable from the index alone.'),
              ],
              evidenceRefs: evidence.map((e) => e.id).slice(0, 2),
            }),
          ]
        : []),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('An ordering is relative. The ward at the top of this list is not thereby failing, and the ward at the bottom is not thereby without exposure - both readings should be taken against the band, not against each other.'),
      t('Ward counts in this table are absolute and are not normalised for population, area or density. Wards of materially different size can return similar counts for different reasons.'),
    ],
    sources: sourcesOf(evidence, 'Ward Risk & Performance Index', 'BMC Intelligence Core - ward register'),
    domains: ['wards', 'citizen-services'],
    supportingTable: {
      caption: t('Wards ordered by the Ward Risk & Performance Index. {0}', scopeSentence(ctx)),
      columns: [
        t('Ward'),
        t('Risk & Performance Index'),
        t('Operational health'),
        t('Complaints open'),
        t('Past SLA'),
        t('Mean SLA compliance'),
        t('Monsoon readiness'),
        t('Largest contributor'),
      ],
      rows: ranked.map((r) => [
        fullWard(r.ward.id),
        `${r.score}/100`,
        `${r.health}/100`,
        formatNumber(r.complaints.open),
        formatNumber(r.complaints.slaBreached),
        formatPercent(r.slaMean),
        `${r.readiness}/100`,
        r.leading ? `${r.leading.label} (${formatNumber(r.leading.contribution, 1)})` : '-',
      ]),
    },
    visuals: [
      metricsVisual(
        `ward-ranking-headline-${ctx.user.id}`,
        [
          { label: t('Wards ranked'), value: `${ranked.length} of ${all.length}`, support: ctx.narrowed ? t('Narrowed by the question') : t('Full authorised scope') },
          { label: t('Highest reading'), value: top ? `${top.score}/100` : '-', support: top ? fullWard(top.ward.id) : '-', tone: toneFor(top?.score ?? 0, false) },
          { label: t('Mean index in scope'), value: `${formatNumber(mean, 1)}/100`, support: `${all.filter((r) => r.score >= 60).length} wards at or above 60`, tone: toneFor(mean, false) },
          { label: t('Complaints open'), value: formatNumber(openTotal), support: `${formatNumber(breachedTotal)} past SLA`, tone: breachedTotal > 0 ? 'warn' : 'positive' },
          { label: t('Flood-prone in set'), value: formatNumber(floodProne), support: `${lowReadiness} below 70/100 readiness`, tone: floodProne > 0 ? 'warn' : 'default' },
        ],
        scopeSentence(ctx),
      ),
      rankedBarVisual({
        id: `ward-ranking-index-${ctx.user.id}`,
        caption: t('Ward Risk & Performance Index, highest reading first'),
        unit: '/100',
        higherIsBetter: false,
        data: ranked.map((r) => ({ label: shortWard(r.ward.id), value: r.score })),
      }),
    ],
    followUps: [
      ...(top ? [t('How is {0} performing?', fullWard(top.ward.id))] : []),
      ...(top && ranked.length > 1 ? [t('Compare {0} and {1}.', fullWard(top.ward.id), fullWard(ranked[1]?.ward.id ?? top.ward.id))] : []),
      t('Which services are below their SLA?'),
    ],
  }
}

/* ==========================================================================
   ward-compare - two or more wards on the same measure set
   ========================================================================== */

function answerWardCompare(ctx: AnswerContext): ComposedAnswer {
  if (ctx.wards.length < 2) {
    return emptyAnswer(
      ctx,
      'second ward',
      `A comparison needs at least two wards and your authorised scope holds ${ctx.wards.length}. No substitute comparison is offered in its place.`,
    )
  }

  const named = ctx.focusWards
  let wards: Ward[]
  let substitution = ''

  if (named.length >= 2) {
    wards = named.slice(0, MAX_COMPARE)
    if (named.length > MAX_COMPARE) {
      substitution = `The question named ${named.length} wards; the first ${MAX_COMPARE} are placed side by side so the measure set stays readable.`
    }
  } else {
    const ranked = rankWardsByIndex(ctx.wards)
    const anchor = named.at(0)
    const others = ranked.filter((r) => r.ward.id !== anchor?.id).map((r) => r.ward)
    wards = anchor ? [anchor, ...others.slice(0, 1)] : ranked.slice(0, 2).map((r) => r.ward)
    substitution = anchor
      ? t('Only one ward was named, so {0} - the highest reading otherwise in your authorised scope - is placed alongside it by substitution.', fullWard(wards[1]?.id ?? ''))
      : t('No ward was named in the question, so the two highest readings within your authorised scope are compared by substitution rather than by selection.')
  }

  wards = wards.filter((w, i, arr) => arr.findIndex((x) => x.id === w.id) === i)
  if (wards.length < 2) {
    return emptyAnswer(ctx, 'ward', 'Fewer than two distinct wards could be bound for this comparison.')
  }

  const indices = wards
    .map((ward) => ({ ward, index: buildWardRiskIndex(ward.id) }))
    .filter((entry): entry is { ward: Ward; index: NonNullable<ReturnType<typeof buildWardRiskIndex>> } => entry.index !== null)

  if (indices.length < 2) {
    return emptyAnswer(ctx, 'ward index', 'Fewer than two of the named wards could be placed on the published index, so no comparison is offered.')
  }

  const compared = indices.map((entry) => entry.ward)
  const ids = compared.map((w) => w.id)

  const indexRow: ComparisonRow = {
    id: 'risk-index',
    label: t('Ward Risk & Performance Index'),
    unit: '/100',
    higherIsBetter: false,
    values: Object.fromEntries(indices.map((entry) => [entry.ward.id, entry.index.score])),
  }
  const rows: ComparisonRow[] = [indexRow, ...compareWards(ids).filter((r) => r.id !== 'risk')]

  const strongestFor = (row: ComparisonRow): Ward | undefined => {
    const ordered = [...compared].sort((a, b) =>
      row.higherIsBetter ? metricValue(row, b.id) - metricValue(row, a.id) : metricValue(row, a.id) - metricValue(row, b.id),
    )
    const best = ordered.at(0)
    const next = ordered.at(1)
    if (!best || !next) return best
    return metricValue(row, best.id) === metricValue(row, next.id) ? undefined : best
  }

  const spreadOf = (row: ComparisonRow): number => {
    const values = compared.map((w) => metricValue(row, w.id))
    return Math.max(...values) - Math.min(...values)
  }

  const relativeSpread = (row: ComparisonRow): number => {
    const values = compared.map((w) => metricValue(row, w.id))
    const high = Math.max(...values)
    return high > 0 ? (spreadOf(row) / high) * 100 : 0
  }

  // Ordered on relative divergence, then on the absolute spread, then on the
  // measure identifier, so a tie resolves the same way on every run.
  const widest = [...rows]
    .sort((a, b) => relativeSpread(b) - relativeSpread(a) || spreadOf(b) - spreadOf(a) || a.id.localeCompare(b.id))
    .at(0)
  const widestHigh = widest ? [...compared].sort((a, b) => metricValue(widest, b.id) - metricValue(widest, a.id)).at(0) : undefined
  const widestLow = widest ? [...compared].sort((a, b) => metricValue(widest, a.id) - metricValue(widest, b.id)).at(0) : undefined

  const strongerCounts = compared.map((ward) => ({
    ward,
    count: rows.filter((row) => strongestFor(row)?.id === ward.id).length,
  }))
  const level = rows.filter((row) => strongestFor(row) === undefined).length

  const METRIC_DEPARTMENT: Record<string, string | undefined> = {
    'risk-index': 'dept-commissioner',
    health: 'dept-commissioner',
    sla: 'dept-commissioner',
    'complaints-open': 'dept-commissioner',
    'complaints-breached': 'dept-commissioner',
    repeat: 'dept-commissioner',
    'water-reliability': 'dept-hydraulic',
    'water-pressure': 'dept-hydraulic',
    'water-nrw': 'dept-hydraulic',
    roads: 'dept-roads',
    'waste-coverage': 'dept-solid-waste',
    'waste-segregation': 'dept-solid-waste',
    drainage: 'dept-stormwater',
    monsoon: 'dept-stormwater',
    'health-signal': 'dept-health',
    projects: 'dept-projects',
    'projects-risk': 'dept-projects',
    revenue: 'dept-assessment',
    budget: 'dept-finance',
    'assets-poor': 'dept-estates',
    incidents: 'dept-disaster',
  }
  const widestDept = METRIC_DEPARTMENT[widest?.id ?? ''] ?? 'dept-commissioner'

  const evidence = bestEvidence(ctx.user, {
    wardIds: ids,
    kinds: ['derived-metric', 'field-report', 'inspection'],
    count: 5,
  })

  const highest = [...indices].sort((a, b) => b.index.score - a.index.score).at(0)

  const keyFindings: string[] = [
    ...indices.slice(0, MAX_COMPARE).map((entry) => {
      const summary = wardComplaintSummary(entry.ward.id)
      const leading = [...entry.index.components].sort((a, b) => b.contribution - a.contribution).at(0)
      return (
        `${fullWard(entry.ward.id)} - index ${entry.index.score}/100, health ${entry.ward.healthScore}/100, `
        + `${countOf(summary.open, 'complaint')} open with ${formatNumber(summary.slaBreached)} past SLA, monsoon readiness ${monsoonReadiness(entry.ward.id)}/100`
        + `${leading ? t(', led by {0} at {1} points', leading.label.toLowerCase(), formatNumber(leading.contribution, 1)) : ''}.`
      )
    }),
    widest && widestHigh && widestLow
      ? `The widest relative divergence across the ${rows.length} measures compared is ${widest.label.toLowerCase()}: `
        + `${fullWard(widestHigh.id)} at ${formatNumber(metricValue(widest, widestHigh.id), 1)}${widest.unit} against ${fullWard(widestLow.id)} at `
        + `${formatNumber(metricValue(widest, widestLow.id), 1)}${widest.unit}, a spread of ${formatNumber(spreadOf(widest), 1)}${widest.unit}.`
      : t('The {0} measures compared return no material divergence between the wards.', rows.length),
    `On the ${rows.length} measures compared, the stronger reading sits with ${strongerCounts.map((s) => `${fullWard(s.ward.id)} on ${s.count}`).join(', ')}`
    + `${level > 0 ? t(', and {0} {1} level between them', level, isAre(level)) : ''}.`,
    `The wards differ in size: ${compared.map((w) => t('{0} carries {1} residents over {2} sq km', fullWard(w.id), formatCompact(w.population), formatNumber(w.areaSqKm, 1))).join('; ')}. `
    + 'Counts in this comparison are absolute and are not normalised for that difference.',
  ]

  const barMetrics = ['risk-index', 'health', 'sla', 'monsoon', 'roads']
  const visuals: AIVisual[] = [
    metricsVisual(
      `ward-compare-headline-${ids.join('-')}`,
      [
        ...indices.map((entry) => ({
          label: fullWard(entry.ward.id),
          value: `${entry.index.score}/100`,
          support: `health ${entry.ward.healthScore}/100`,
          tone: toneFor(entry.index.score, false),
        })),
        { label: t('Measures compared'), value: formatNumber(rows.length), support: `${level} level between the wards` },
        { label: t('Widest divergence'), value: widest ? widest.label : '-', support: widest ? `${formatNumber(spreadOf(widest), 1)}${widest.unit}` : '-', tone: 'warn' },
      ],
      `Same measure set, computed from the same registers for each ward. ${substitution}`.trim(),
    ),
    ...barMetrics.flatMap((metricId) => {
      const row = rows.find((r) => r.id === metricId)
      if (!row) return []
      return [
        rankedBarVisual({
          id: `ward-compare-${metricId}-${ids.join('-')}`,
          caption: t('{0}{1} by ward', row.label, row.unit ? ` (${row.unit})` : ''),
          unit: row.unit || 'count',
          higherIsBetter: row.higherIsBetter,
          data: compared.map((w) => ({ label: shortWard(w.id), value: metricValue(row, w.id) })),
        }),
      ]
    }),
  ]

  return {
    requestId: `q-ward-compare-${ids.join('-')}-${ctx.user.id}`,
    answer:
      `${substitution ? `${substitution} ` : ''}`
      + `${compared.map((w) => fullWard(w.id)).join(' and ')} are placed side by side across ${rows.length} measures drawn from the same registers, `
      + `led by the Ward Risk & Performance Index - the published six-component composite weighting ${weightSentence(indices[0]?.index.components ?? [])}. `
      + `${highest ? t('{0} carries the higher index reading at {1}/100. ', fullWard(highest.ward.id), highest.index.score) : ''}`
      + `${widest && widestHigh && widestLow ? t('The widest relative divergence - the largest gap expressed as a share of the higher reading, so measures carried in different units can be placed on the same footing - is {0}, where {1} reads {2}{3} against {4} at {5}{6}. ', widest.label.toLowerCase(), fullWard(widestHigh.id), formatNumber(metricValue(widest, widestHigh.id), 1), widest.unit, fullWard(widestLow.id), formatNumber(metricValue(widest, widestLow.id), 1), widest.unit) : ''}`
      + 'A difference in composite risk records a difference in the measured position of two administrative units. It does not attribute that difference to any officer, '
      + 'department or contractor, it is not a comparison of performance between them, and none of these measures is normalised for ward population, area or land use.',
    keyFindings,
    evidence,
    recommendedActions: [
      ...(widest && widestHigh
        ? [
            recommend({
              id: `rec-ward-compare-divergence-${widest.id}`,
              title: t('Establish what accounts for the {0} divergence between {1}', widest.label.toLowerCase(), compared.map((w) => shortWard(w.id)).join(' and ')),
              why:
                `${widest.label} shows the widest relative divergence in this comparison - ${fullWard(widestHigh.id)} at ${formatNumber(metricValue(widest, widestHigh.id), 1)}${widest.unit} `
                + `against ${widestLow ? `${fullWard(widestLow.id)} at ${formatNumber(metricValue(widest, widestLow.id), 1)}${widest.unit}` : t('the lower reading')}. `
                + 'Wards differing this far on one measure while sitting closer on the others is a candidate for verification, not an established finding about either ward.',
              expectedImpact:
                t('Distinguishes a structural difference in the two wards - network age, density, land use - from an operational one that could be acted on, so effort is not spent closing a gap that is not closable.'),
              departmentId: widestDept,
              humanOwnerRole: ownerRole(widestDept),
              confidence: 'medium',
              dependencies: [t('Departmental return from {0}', departmentName(widestDept)), t('Ward field verification in both wards')],
              risks: [
                t('A divergence between two wards may reflect a difference in how each records the underlying activity rather than a difference in the activity itself.'),
              ],
              evidenceRefs: evidence.map((e) => e.id).slice(0, 3),
            }),
          ]
        : []),
      ...(highest
        ? [
            recommend({
              id: `rec-ward-compare-review-${highest.ward.id}`,
              title: t('Take the {0} position to a ward review', fullWard(highest.ward.id)),
              why:
                `${fullWard(highest.ward.id)} carries the higher index reading in this comparison at ${highest.index.score}/100. `
                + `${highest.index.deteriorationReasons.at(0) ?? ''}`,
              expectedImpact:
                t('Places the components carrying the higher reading in front of the accountable departments, with the comparison as context rather than as a judgement.'),
              departmentId: 'dept-commissioner',
              humanOwnerRole: ownerRole('dept-commissioner'),
              confidence: highest.index.confidence,
              dependencies: [t('Ward Officer availability for both wards')],
              risks: [t('A comparison read as a ranking of officers rather than of measured positions would misuse this output.')],
              evidenceRefs: evidence.map((e) => e.id).slice(0, 2),
            }),
          ]
        : []),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('A difference in composite risk between these wards does not attribute that difference to any officer, department or contractor. It records two measured positions and nothing about how either came about.'),
      t('The wards differ in population, area, density and land use. Absolute counts are not normalised for those differences, and a measure can diverge for structural reasons that no intervention would close.'),
      ...(substitution ? [t('At least one ward in this comparison was selected by substitution rather than named in the question.')] : []),
    ],
    sources: sourcesOf(evidence, 'Ward Risk & Performance Index', 'BMC Intelligence Core - ward register'),
    domains: ['wards', 'citizen-services'],
    supportingTable: {
      caption: t('Same measure set across {0}', compared.map((w) => fullWard(w.id)).join(', ')),
      columns: [t('Measure'), t('Unit'), ...compared.map((w) => fullWard(w.id)), t('Spread'), t('Stronger reading')],
      rows: rows.map((row) => [
        row.label,
        row.unit || 'count',
        ...compared.map((w) => formatNumber(metricValue(row, w.id), 1)),
        formatNumber(spreadOf(row), 1),
        strongestFor(row) ? fullWard(strongestFor(row)?.id ?? '') : t('Level'),
      ]),
    },
    visuals,
    followUps: [
      t('How is {0} performing?', fullWard(compared[0]?.id ?? '')),
      t('Which services are below their SLA in {0}?', fullWard(compared[1]?.id ?? '')),
      t('Which wards need the most attention?'),
    ],
  }
}

/* ==========================================================================
   service-quality - delivery against SLA
   ========================================================================== */

function answerServiceQuality(ctx: AnswerContext): ComposedAnswer {
  const inScopeRows = scopedServiceHealth(ctx)
  if (inScopeRows.length === 0) {
    return emptyAnswer(
      ctx,
      'service delivery',
      'No service health reading is held for the wards this question scoped, so no SLA position can be stated.',
    )
  }

  const severity = ctx.understanding.entities.severity
  const states = severity ? SEVERITY_STATES[severity] : []
  const banded = states.length > 0 ? inScopeRows.filter((r) => states.includes(r.state)) : inScopeRows
  // As with the ward band: nothing in the band is a finding about the band, not
  // an empty register, so the weakest readings are still set out.
  const bandEmpty = states.length > 0 && banded.length === 0
  const filtered = bandEmpty ? inScopeRows : banded

  const ordered = [...filtered].sort((a, b) => a.slaCompliancePct - b.slaCompliancePct)
  const below = ordered.filter((r) => r.slaCompliancePct < SLA_THRESHOLD)
  const falling = ordered.filter((r) => r.trendPct < FALLING_THRESHOLD)
  const attention = ordered.filter((r) => r.slaCompliancePct < SLA_THRESHOLD || r.trendPct < FALLING_THRESHOLD)
  const listed = (attention.length > 0 ? attention : ordered).slice(0, Math.max(1, Math.min(ctx.limit, 8)))
  const weakest = ordered.at(0)
  const openTotal = ordered.reduce((s, r) => s + r.open, 0)

  const byCategory = new Map<ServiceHealth['category'], { total: number; count: number; open: number }>()
  for (const row of ordered) {
    const existing = byCategory.get(row.category) ?? { total: 0, count: 0, open: 0 }
    existing.total += row.slaCompliancePct
    existing.count += 1
    existing.open += row.open
    byCategory.set(row.category, existing)
  }
  const categoryMeans = [...byCategory.entries()]
    .map(([category, agg]) => ({ category, mean: agg.total / agg.count, wards: agg.count, open: agg.open }))
    .sort((a, b) => a.mean - b.mean)
  const weakestCategory = categoryMeans.at(0)
  const strongestCategory = categoryMeans.at(-1)

  const complaints = scopedComplaints(ctx)
  const weightedResolution =
    openTotal > 0
      ? ordered.reduce((s, r) => s + r.avgResolutionHours * r.open, 0) / openTotal
      : ordered.reduce((s, r) => s + r.avgResolutionHours, 0) / ordered.length

  const targetDept = weakest ? categoryDepartment(complaints, weakest.category) : 'dept-commissioner'

  const repeatByWard = ctx.scopeWards
    .map((w) => ({ ward: w, summary: wardComplaintSummary(w.id) }))
    .sort((a, b) => b.summary.repeatRate - a.summary.repeatRate)
  const worstRepeat = repeatByWard.at(0)

  const evidence = bestEvidence(ctx.user, {
    wardIds: Array.from(new Set(listed.map((r) => r.wardId))),
    kinds: ['complaint', 'derived-metric'],
    count: 5,
  })

  const keyFindings: string[] = [
    `${below.length} of ${ordered.length} ward-category readings in scope ${below.length === 1 ? 'sits' : 'sit'} below the ${SLA_THRESHOLD}% SLA compliance threshold and ${falling.length} ${isAre(falling.length)} falling by more than `
    + `${Math.abs(FALLING_THRESHOLD)} percentage points against the previous period. Mean compliance across scope is ${formatPercent(meanSlaFor(ordered))}.`,

    weakestCategory && strongestCategory
      ? `By category, the weakest mean compliance is ${categoryLabel(weakestCategory.category)} at ${formatPercent(weakestCategory.mean)} over ${weakestCategory.wards} wards `
        + `with ${formatNumber(weakestCategory.open)} open; the strongest is ${categoryLabel(strongestCategory.category)} at ${formatPercent(strongestCategory.mean)}.`
      : t('Only one service category is held in scope, so no comparison between categories is offered.'),

    `${countOf(openTotal, 'complaint')} ${isAre(openTotal)} open across the categories in scope, with a volume-weighted mean resolution time of ${formatNumber(weightedResolution)} hours `
    + `against a grievance register of ${formatNumber(complaints.length)} records.`,

    ...listed.slice(0, 5).map(
      (r) =>
        `${fullWard(r.wardId)} - ${categoryLabel(r.category)}: ${formatPercent(r.slaCompliancePct)} SLA compliance, ${formatNumber(r.open)} open, `
        + `${formatNumber(r.resolved30d)} resolved in 30 days, mean resolution ${formatNumber(r.avgResolutionHours)} hours, movement ${formatDelta(r.trendPct)} `
        + `(recorded ${OPERATIONAL_STATE_LABEL[r.state].toLowerCase()}).`,
    ),
  ]

  return {
    requestId: `q-service-quality-${ctx.user.id}-${ctx.scopeWards.length}-${listed.length}-${severity ?? 'all'}`,
    answer:
      `${countOf(below.length, 'ward-category reading')} in scope ${isAre(below.length)} below the ${SLA_THRESHOLD}% SLA compliance threshold and ${falling.length} ${isAre(falling.length)} falling materially against the previous period. `
      + `${scopeSentence(ctx)} `
      + 'Delivery is assessed against both the compliance level and its movement, so a category that is compliant but deteriorating is surfaced rather than passed over'
      + `${states.length > 0 && severity ? (bandEmpty ? t(', and no category in scope is recorded at the {0} band or worse, so the weakest readings are set out in its place', SEVERITY_LABEL[severity].toLowerCase()) : t(', and the set is filtered to categories recorded at the {0} band or worse', SEVERITY_LABEL[severity].toLowerCase())) : ''}. `
      + `${weakest ? t('The weakest reading is {0} in {1} at {2}. ', categoryLabel(weakest.category), fullWard(weakest.wardId), formatPercent(weakest.slaCompliancePct)) : ''}`
      + 'SLA compliance measures process adherence against a published window; it does not measure whether the underlying condition was resolved, '
      + 'and it makes no assertion about the conduct of any officer, crew or contractor engaged on the service.',
    keyFindings,
    evidence,
    recommendedActions: [
      ...(weakest
        ? [
            recommend({
              id: `rec-service-quality-${weakest.wardId}-${weakest.category}`,
              title: t('Review {0} delivery in {1}', categoryLabel(weakest.category).toLowerCase(), fullWard(weakest.wardId)),
              why:
                `SLA compliance stands at ${formatPercent(weakest.slaCompliancePct)} with ${formatNumber(weakest.open)} complaints open, a mean resolution time of `
                + `${formatNumber(weakest.avgResolutionHours)} hours and a movement of ${formatDelta(weakest.trendPct)}. The category is recorded as `
                + `${OPERATIONAL_STATE_LABEL[weakest.state].toLowerCase()} against the published band.`,
              expectedImpact:
                t('Identifies whether the constraint is crew availability, material or plant provision, or scheduling, which is what determines the correct intervention rather than a general instruction to improve.'),
              departmentId: targetDept,
              humanOwnerRole: ownerRole(targetDept),
              confidence: 'medium',
              dependencies: [t('Ward field cadre availability'), t('Departmental return from {0}', departmentName(targetDept))],
              risks: [
                t('A review without a resource decision will not change the position.'),
                t('Compliance can be raised by re-baselining the SLA window rather than by improving delivery. The window should be held fixed while the position is assessed.'),
              ],
              evidenceRefs: evidence.map((e) => e.id).slice(0, 3),
            }),
          ]
        : []),
      ...(worstRepeat && worstRepeat.summary.repeatRate > 0
        ? [
            recommend({
              id: `rec-service-quality-repeat-${worstRepeat.ward.id}`,
              title: t('Verify the repeat-complaint cohort in {0}', fullWard(worstRepeat.ward.id)),
              why:
                `${formatPercent(worstRepeat.summary.repeatRate)} of the ward's grievance register carries at least one repeat against `
                + `${formatNumber(worstRepeat.summary.slaBreached)} complaints past their SLA window. A repeat indicates the underlying condition returned after the record was closed, `
                + 'which compliance against the window does not capture.',
              expectedImpact:
                t('Separates records closed on process from conditions genuinely resolved, giving a compliance figure that means what it appears to mean.'),
              departmentId: 'dept-commissioner',
              humanOwnerRole: t('Ward Officer'),
              confidence: 'medium',
              dependencies: [t('Ward field verification of a sample of closed records')],
              risks: [t('A repeat may be a fresh condition at the same location rather than the same condition returning. The two are not separable from the register alone.')],
              evidenceRefs: evidence.map((e) => e.id).slice(0, 2),
            }),
          ]
        : []),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('SLA compliance measures process adherence, not citizen satisfaction and not whether the underlying condition was genuinely resolved. The repeat-complaint rate is the better indicator of the latter.'),
      t('A category below its threshold identifies where delivery requires attention. It does not characterise the conduct of the officers, crews or contractors engaged on that service, and no finding against any of them is made or implied.'),
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - grievance register', 'Ward service health index'),
    domains: ['citizen-services', 'wards'],
    supportingTable: {
      caption: t('Service categories by SLA compliance, weakest first. {0}', scopeSentence(ctx)),
      columns: [
        t('Ward'),
        t('Service category'),
        t('SLA compliance'),
        t('Open'),
        t('Resolved (30 d)'),
        t('Mean resolution'),
        t('Period movement'),
        t('Recorded state'),
      ],
      rows: listed.map((r) => [
        fullWard(r.wardId),
        categoryLabel(r.category),
        formatPercent(r.slaCompliancePct),
        formatNumber(r.open),
        formatNumber(r.resolved30d),
        `${formatNumber(r.avgResolutionHours)} h`,
        formatDelta(r.trendPct),
        OPERATIONAL_STATE_LABEL[r.state],
      ]),
    },
    visuals: [
      metricsVisual(
        `service-quality-headline-${ctx.user.id}`,
        [
          { label: t('Readings assessed'), value: formatNumber(ordered.length), support: `${ctx.scopeWards.length} wards in scope` },
          { label: t('Below {0}% SLA', SLA_THRESHOLD), value: formatNumber(below.length), support: `${falling.length} falling materially`, tone: below.length > 0 ? 'critical' : 'positive' },
          { label: t('Mean SLA compliance'), value: formatPercent(meanSlaFor(ordered)), support: 'Across all categories in scope', tone: toneFor(meanSlaFor(ordered), true) },
          { label: t('Complaints open'), value: formatNumber(openTotal), support: `${formatNumber(weightedResolution)} h weighted mean resolution`, tone: 'warn' },
          { label: t('Weakest reading'), value: weakest ? formatPercent(weakest.slaCompliancePct) : '-', support: weakest ? `${categoryLabel(weakest.category)}, ${fullWard(weakest.wardId)}` : '-', tone: toneFor(weakest?.slaCompliancePct ?? 100, true) },
        ],
        scopeSentence(ctx),
      ),
      rankedBarVisual({
        id: `service-quality-compliance-${ctx.user.id}`,
        caption: t('SLA compliance by ward and service category, weakest first'),
        unit: '%',
        higherIsBetter: true,
        data: listed.map((r) => ({ label: `${shortWard(r.wardId)} · ${categoryLabel(r.category)}`, value: r.slaCompliancePct })),
      }),
    ],
    followUps: [
      ...(weakest ? [t('Why are complaints increasing in {0}?', fullWard(weakest.wardId))] : []),
      ...(weakest ? [t('How is {0} performing?', fullWard(weakest.wardId))] : []),
      t('Which wards need the most attention?'),
    ],
  }
}

/* ==========================================================================
   complaint-trend - volume and movement on the grievance register
   ========================================================================== */

function answerComplaintTrend(ctx: AnswerContext): ComposedAnswer {
  const complaints = scopedComplaints(ctx)
  const rows = scopedServiceHealth(ctx)

  if (complaints.length === 0 || rows.length === 0) {
    return emptyAnswer(
      ctx,
      'complaint',
      'The grievance register holds no record for the wards this question scoped, so no volume or movement can be stated.',
    )
  }

  const open = complaints.filter((c) => c.status !== 'resolved' && c.status !== 'closed')
  const breached = complaints.filter((c) => c.slaBreached)
  const repeats = complaints.filter((c) => c.repeatCount > 0)
  const reopened = complaints.filter((c) => c.status === 'reopened')

  const rising = [...rows].filter((r) => r.trendPct > RISING_THRESHOLD).sort((a, b) => b.trendPct - a.trendPct)
  const fallingRows = rows.filter((r) => r.trendPct < FALLING_THRESHOLD)
  const listed = (rising.length > 0 ? rising : [...rows].sort((a, b) => b.trendPct - a.trendPct)).slice(
    0,
    Math.max(1, Math.min(ctx.limit, 8)),
  )
  const largest = listed.at(0)

  const openByCategory = new Map<ServiceHealth['category'], number>()
  for (const c of open) openByCategory.set(c.category, (openByCategory.get(c.category) ?? 0) + 1)
  const topCategories = [...openByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

  const meanOpenAge = open.length > 0 ? open.reduce((s, c) => s + c.ageHours, 0) / open.length : 0
  const meanWindow = complaints.reduce((s, c) => s + c.slaHours, 0) / complaints.length

  const insights = buildCrossDomainInsights().filter((i) => i.wardIds.some((w) => inScope(ctx, w)))

  const targetDept = largest ? categoryDepartment(complaints, largest.category) : 'dept-commissioner'

  const evidence = bestEvidence(ctx.user, {
    wardIds: Array.from(new Set(listed.map((r) => r.wardId))),
    kinds: ['complaint', 'field-report'],
    count: 5,
  })

  const keyFindings: string[] = [
    `The grievance register in scope holds ${formatNumber(complaints.length)} records: ${formatNumber(open.length)} open, `
    + `${formatNumber(breached.length)} past their SLA window (${formatPercent((breached.length / complaints.length) * 100)} of the register), `
    + `${formatNumber(repeats.length)} carrying at least one repeat and ${formatNumber(reopened.length)} reopened after closure.`,

    `${countOf(rising.length, 'ward-category reading')} ${rising.length === 1 ? 'shows' : 'show'} a movement above ${formatDelta(RISING_THRESHOLD)} against the previous period and ${fallingRows.length} ${isAre(fallingRows.length)} falling by more than `
    + `${Math.abs(FALLING_THRESHOLD)} percentage points. `
    + `${largest ? t('The largest single movement is {0} in {1} at {2}, with SLA compliance at {3}.', categoryLabel(largest.category), fullWard(largest.wardId), formatDelta(largest.trendPct), formatPercent(largest.slaCompliancePct)) : ''}`,

    topCategories.length > 0
      ? `By volume the largest categories on the open register are ${topCategories.map(([category, count]) => `${categoryLabel(category)} (${formatNumber(count)})`).join(', ')}. `
        + `Mean age of an open complaint in scope is ${formatNumber(meanOpenAge)} hours against a mean published SLA window of ${formatNumber(meanWindow)} hours.`
      : t('No complaint is currently open in scope, so no category composition is offered.'),

    ...listed.slice(0, 4).map(
      (r) =>
        `${fullWard(r.wardId)} - ${categoryLabel(r.category)}: movement ${formatDelta(r.trendPct)}, ${formatNumber(r.open)} open, `
        + `${formatNumber(r.resolved30d)} resolved in 30 days, SLA compliance ${formatPercent(r.slaCompliancePct)}, mean resolution ${formatNumber(r.avgResolutionHours)} hours.`,
    ),

    ...insights.slice(0, 2).map(
      (i) =>
        `Observed alongside the movement, and a candidate for verification rather than an established cause: ${i.title} `
        + `(${SEVERITY_LABEL[i.severity].toLowerCase()} severity, ${i.confidence} confidence).`,
    ),
  ].slice(0, 8)

  return {
    requestId: `q-complaint-trend-${ctx.user.id}-${ctx.scopeWards.length}-${listed.length}`,
    answer:
      `${countOf(rising.length, 'ward-category reading')} ${rising.length === 1 ? 'shows' : 'show'} a rising complaint movement against the previous period, on a register of `
      + `${countOf(complaints.length, 'record')} of which ${formatNumber(open.length)} ${isAre(open.length)} open and ${formatNumber(breached.length)} ${isAre(breached.length)} past the SLA window. `
      + `${scopeSentence(ctx)} `
      + `${largest ? t('The largest movement is {0} in {1} at {2}. ', categoryLabel(largest.category), fullWard(largest.wardId), formatDelta(largest.trendPct)) : ''}`
      + 'The platform can set out what is co-occurring with an increase in the same geography and period, and it does so above. It cannot establish cause: '
      + 'a co-occurrence identifies where to look and what to verify, never why, and a rise in recorded volume may reflect improved reporting access rather than a deterioration in the service.',
    keyFindings,
    evidence,
    recommendedActions: [
      ...(largest
        ? [
            recommend({
              id: `rec-complaint-trend-${largest.wardId}-${largest.category}`,
              title: t('Establish the operational position behind the {0} movement in {1}', categoryLabel(largest.category).toLowerCase(), fullWard(largest.wardId)),
              why:
                `Recorded volume has moved ${formatDelta(largest.trendPct)} against the previous period while SLA compliance stands at ${formatPercent(largest.slaCompliancePct)} `
                + `with ${formatNumber(largest.open)} open and a mean resolution time of ${formatNumber(largest.avgResolutionHours)} hours. `
                + 'Any co-occurring condition set out above is a candidate for assessment, not an established cause.',
              expectedImpact:
                t('Distinguishes a genuine service deterioration from a reporting, seasonal or campaign effect, so the intervention matches the actual constraint rather than the shape of the register.'),
              departmentId: targetDept,
              humanOwnerRole: ownerRole(targetDept),
              confidence: 'medium',
              dependencies: [t('Ward field verification'), t('Departmental return from {0}', departmentName(targetDept))],
              risks: [
                t('Attributing the movement to a co-occurring condition without field verification would be an error of causation.'),
                t('A rise in recorded volume can follow a new reporting channel. Volume and incidence are not the same measure.'),
              ],
              evidenceRefs: evidence.map((e) => e.id).slice(0, 3),
            }),
          ]
        : []),
      ...(repeats.length > 0
        ? [
            recommend({
              id: `rec-complaint-trend-repeat-${ctx.user.id}`,
              title: t('Verify the repeat and reopened cohort before reading the movement as new demand'),
              why:
                `${formatNumber(repeats.length)} records in scope carry at least one repeat and ${formatNumber(reopened.length)} were reopened after closure. `
                + 'A repeat raised against an unresolved condition adds to recorded volume without representing a new condition, which changes what the movement means.',
              expectedImpact:
                t('Separates new demand from returning demand, so the movement is read as what it is and resourcing follows the correct one.'),
              departmentId: 'dept-commissioner',
              humanOwnerRole: t('Ward Officer'),
              confidence: 'medium',
              dependencies: [t('Ward field verification of a sample of repeat records')],
              risks: [t('A repeat may record a fresh condition at the same location. The register alone does not separate the two.')],
              evidenceRefs: evidence.map((e) => e.id).slice(0, 2),
            }),
          ]
        : []),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('Co-occurrence is not causation. The conditions listed occur on the same geography in the same period; no causal relationship between them is asserted or implied, and none is a finding against any person, department or contractor.'),
      t('A rising complaint count may reflect improved reporting access, a new channel or a local campaign rather than a deterioration in the service. Recorded volume and underlying incidence are not separable from the register alone.'),
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - grievance register', 'Cross-domain correlation engine'),
    domains: ['citizen-services', 'wards'],
    supportingTable: {
      caption: t('Service categories by period movement, largest increase first. {0}', scopeSentence(ctx)),
      columns: [
        t('Ward'),
        t('Service category'),
        t('Period movement'),
        t('Open'),
        t('Resolved (30 d)'),
        t('SLA compliance'),
        t('Mean resolution'),
        t('Share of open register'),
      ],
      rows: listed.map((r) => [
        fullWard(r.wardId),
        categoryLabel(r.category),
        formatDelta(r.trendPct),
        formatNumber(r.open),
        formatNumber(r.resolved30d),
        formatPercent(r.slaCompliancePct),
        `${formatNumber(r.avgResolutionHours)} h`,
        open.length > 0 ? formatPercent((r.open / open.length) * 100) : '-',
      ]),
    },
    visuals: [
      metricsVisual(
        `complaint-trend-headline-${ctx.user.id}`,
        [
          { label: t('Register in scope'), value: formatNumber(complaints.length), support: `${formatNumber(open.length)} open` },
          { label: t('Past SLA window'), value: formatNumber(breached.length), support: formatPercent((breached.length / complaints.length) * 100), tone: breached.length > 0 ? 'critical' : 'positive' },
          { label: t('Rising categories'), value: formatNumber(rising.length), support: `${fallingRows.length} falling materially`, tone: rising.length > 0 ? 'warn' : 'positive' },
          { label: t('Repeat-carrying records'), value: formatNumber(repeats.length), support: `${formatNumber(reopened.length)} reopened after closure`, tone: 'warn' },
          { label: t('Mean age, open records'), value: `${formatNumber(meanOpenAge)} h`, support: `Published window ${formatNumber(meanWindow)} h`, tone: meanOpenAge > meanWindow ? 'critical' : 'default' },
        ],
        scopeSentence(ctx),
      ),
      rankedBarVisual({
        id: `complaint-trend-movement-${ctx.user.id}`,
        caption: t('Period movement in recorded complaint volume by ward and service category'),
        unit: '%',
        higherIsBetter: false,
        data: listed.map((r) => ({ label: `${shortWard(r.wardId)} · ${categoryLabel(r.category)}`, value: r.trendPct })),
      }),
    ],
    followUps: [
      ...(largest ? [t('Which services are below their SLA in {0}?', fullWard(largest.wardId))] : [t('Which services are below their SLA?')]),
      ...(largest ? [t('How is {0} performing?', fullWard(largest.wardId))] : []),
      t('What cross-domain exposures are currently identified?'),
    ],
  }
}

/* ==========================================================================
   Registry
   ========================================================================== */

export const wardHandlers: Partial<Record<QueryIntentId, AnswerHandler>> = {
  'ward-profile': answerWardProfile,
  'ward-ranking': answerWardRanking,
  'ward-compare': answerWardCompare,
  'service-quality': answerServiceQuality,
  'complaint-trend': answerComplaintTrend,
}
