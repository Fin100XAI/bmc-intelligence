import type { Severity } from '@/types/common'
import type { AIVisual } from '@/types/ai'
import type { EvidenceItem } from '@/types/intelligence'
import type { AnswerContext, AnswerHandler } from '@/ai/answer-kit'
import type { QueryIntentId } from '@/ai/nlu'
import { SEVERITY_ORDER } from '@/types/common'
import { ASSET_CATEGORY_LABEL } from '@/types/operations'
import { LAMP_TYPE_LABEL, LIGHTING_FAULT_CATEGORY_LABEL, OPEN_SPACE_KIND_LABEL } from '@/types/civic-services'
import {
  VISUAL_COLOUR,
  anyInScope,
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
import { canAccess } from '@/security/access'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCompact, formatCrore, formatNumber, formatPercent, formatRelative } from '@/utils/format'
import {
  ROAD_DEFECTS,
  ROAD_SEGMENTS,
  TRAFFIC_CORRIDORS,
  WASTE_FACILITIES,
  WASTE_HOTSPOTS,
  WASTE_ROUTES,
  wardRoadCondition,
  wardWastePerformance,
} from '@/data/city.data'
import { rankedDefects } from '@/domains/roads/priority'
import { LIGHTING_CIRCUITS, LIGHTING_FAULTS, OPEN_SPACES, TREE_WARD_POSITIONS } from '@/data/civic.data'
import { MUNICIPAL_ASSETS } from '@/data/operations.data'
import {
  BUILDING_PROPOSALS,
  BUILDING_RECORDS,
  NOISE_READINGS,
  wardAirQuality,
  wardPlanning,
} from '@/data/social.data'
import { t } from '@/i18n'

/**
 * src/ai/answers/physical.ts
 *
 * The nine retrieval routes covering the physical city: what the corporation
 * collects, paves, lights, plants, permits and owns.
 *
 * Every route here answers from a register the corporation actually keeps -
 * the ward waste return, the road defect register, the feeder circuit record,
 * the asset register, the monitoring station reading, the Tree Authority's
 * ward position, the planning indicator and the building register. Nothing is
 * inferred where the register is silent: a route whose register is empty in
 * scope says so rather than widening until it finds something to report.
 *
 * Two disciplines are load-bearing rather than stylistic:
 *
 *   - **Scope before retrieval.** Records are filtered through `inScope` /
 *     `anyInScope` (and `canAccess` where the record carries its own
 *     classification) before anything is counted. An unauthorised record is
 *     never summarised, and its absence is never signalled.
 *   - **A score orders work; it does not judge conduct.** The road priority
 *     score sequences the rectification queue. It says nothing about the
 *     quality of previous works or the performance of any contractor. A
 *     building recorded as "unauthorised-alleged" carries an allegation on the
 *     register and nothing more. Both are stated in the answer, not buried.
 */

/* ==========================================================================
   Local shaping helpers
   ========================================================================== */

/** Stable, scope-dependent identifier for the request log. */
function requestId(ctx: AnswerContext, route: string): string {
  const geography = ctx.narrowed ? ctx.scopeWards.map((w) => w.id).join('-') : `all${ctx.scopeWards.length}`
  return `q-${route}-${ctx.user.id}-${geography}-n${ctx.limit}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
}

/** Ward-keyed registers, read only for the wards this answer covers. */
function byScopeWard<T>(ctx: AnswerContext, lookup: (wardId: string) => T | undefined): Array<{ wardId: string; record: T }> {
  const out: Array<{ wardId: string; record: T }> = []
  for (const ward of ctx.scopeWards) {
    const record = lookup(ward.id)
    if (record) out.push({ wardId: ward.id, record })
  }
  return out
}

/** Honours an explicit severity filter where the register carries a severity. */
function matchesSeverity(ctx: AnswerContext, severity: Severity): boolean {
  const wanted = ctx.understanding.entities.severity
  return wanted === null || wanted === severity
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length
}

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100
}

/** Renders a hyphenated register value as ordinary prose. */
function readable(value: string): string {
  return value.replace(/-/g, ' ')
}

/** Chart series stay legible; the table honours the requested count in full. */
function chartCount(ctx: AnswerContext): number {
  return Math.max(3, Math.min(ctx.limit, 10))
}

/** Ranked bar over ward-keyed values, labelled with the short ward name. */
function wardBar(
  id: string,
  caption: string,
  unit: string,
  higherIsBetter: boolean,
  rows: Array<{ wardId: string; value: number }>,
): AIVisual {
  return rankedBarVisual({
    id,
    caption,
    unit,
    higherIsBetter,
    data: rows.map((row) => ({ label: shortWard(row.wardId), value: Math.round(row.value * 10) / 10 })),
  })
}

/** Ward identifiers in scope, for evidence selection. */
function scopeIds(ctx: AnswerContext): string[] {
  return ctx.scopeWards.map((w) => w.id)
}

/** The evidence a recommendation is traceable to. */
function refs(evidence: EvidenceItem[], count: number): string[] {
  return evidence.map((e) => e.id).slice(0, count)
}

/**
 * The empty-register sentence, stated so that a severity filter is never
 * mistaken for an empty register. "No critical defect" and "no defect" are
 * different positions and must not read the same.
 */
function emptyDetail(ctx: AnswerContext, register: string): string {
  const severity = ctx.understanding.entities.severity
  return severity
    ? t('The {0} holds no {1}-severity entry for the wards in scope. Entries at other severities were not read, because the question asked for {2} severity.', register, severity, severity)
    : t('The {0} holds no entry for the wards in scope.', register)
}

/* ==========================================================================
   Solid waste
   ========================================================================== */

const waste: AnswerHandler = (ctx) => {
  const rows = byScopeWard(ctx, wardWastePerformance)
  if (rows.length === 0) {
    return emptyAnswer(ctx, 'solid waste', 'No ward collection return is held for the wards in scope.')
  }

  const hotspots = WASTE_HOTSPOTS.filter((h) => inScope(ctx, h.wardId) && matchesSeverity(ctx, h.severity))
  const routes = WASTE_ROUTES.filter((r) => inScope(ctx, r.wardId))
  const facilities = WASTE_FACILITIES.filter((f) => inScope(ctx, f.wardId))
  const generated = sum(rows.map((r) => r.record.generationTpd))
  const collected = sum(rows.map((r) => r.record.collectedTpd))
  const coverage = share(collected, generated)
  const segregation = mean(rows.map((r) => r.record.segregationPct))
  const missed = sum(rows.map((r) => r.record.missedCollections7d))
  const complaints = sum(rows.map((r) => r.record.complaints30d))
  const weakest = [...rows].sort((a, b) => a.record.coveragePct - b.record.coveragePct)
  const recurrent = [...hotspots].sort((a, b) => b.recurrenceCount - a.recurrenceCount)
  const lagging = routes.filter((r) => r.adherencePct < 85)
  const landfill = facilities.filter((f) => f.type === 'landfill')
  const evidence = bestEvidence(ctx.user, {
    term: 'Collection route adherence',
    wardIds: scopeIds(ctx),
    kinds: ['source-record', 'field-report'],
    count: 5,
  })

  return {
    requestId: requestId(ctx, 'waste'),
    answer:
      `Collection coverage stands at ${formatPercent(coverage)} - ${formatNumber(collected, 1)} tonnes lifted daily against `
      + `${formatNumber(generated, 1)} tonnes generated - with segregation at source averaging ${formatPercent(segregation)}. `
      + 'Coverage is computed as tonnage collected against modelled ward generation, and segregation against the tonnage '
      + 'presented at the collection point; neither is an independent weighbridge audit. '
      + `${hotspots.length} dumping hotspots recur on the register and ${lagging.length} of ${routes.length} rounds are running below `
      + `85% schedule adherence. ${scopeSentence(ctx)}`,
    keyFindings: [
      ...weakest.slice(0, 3).map(
        (r) =>
          `${fullWard(r.wardId)} carries the weakest coverage at ${formatPercent(r.record.coveragePct)}, lifting `
          + `${formatNumber(r.record.collectedTpd, 1)} of ${formatNumber(r.record.generationTpd, 1)} TPD, with `
          + `${r.record.missedCollections7d} missed collections in the last seven days.`,
      ),
      `Segregation at source ranges from ${formatPercent(Math.min(...rows.map((r) => r.record.segregationPct)))} to `
        + `${formatPercent(Math.max(...rows.map((r) => r.record.segregationPct)))} across the wards in scope.`,
      recurrent.length > 0
        ? `The most persistent hotspot is ${recurrent[0]!.name}, recorded ${recurrent[0]!.recurrenceCount} times, last reported `
          + `${formatRelative(recurrent[0]!.lastReportedAt)} - recorded cause: ${recurrent[0]!.cause.toLowerCase()}.`
        : t('No dumping hotspot is currently recorded on the register within scope.'),
      t('{0} collection rounds sit below 85% schedule adherence, against {1} rounds operating in scope.', lagging.length, routes.length),
      t('{0} waste complaints were lodged in the last 30 days across {1} wards in scope.', formatCompact(complaints), rows.length),
      landfill.length > 0
        ? `${landfill.length} disposal site(s) in scope, the nearest to exhaustion carrying `
          + `${Math.min(...landfill.map((f) => f.remainingLifeYears ?? 0))} years of remaining recorded life.`
        : t('{0} processing and transfer facilities are in scope; no disposal site falls within it.', facilities.length),
    ],
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-waste-coverage',
        title: t('Rebalance collection rounds in {0}', fullWard(weakest[0]!.wardId)),
        why:
          `Coverage in ${fullWard(weakest[0]!.wardId)} is ${formatPercent(weakest[0]!.record.coveragePct)} against a scope average of `
          + `${formatPercent(coverage)}, with ${weakest[0]!.record.missedCollections7d} missed collections recorded in seven days.`,
        expectedImpact: t('Closes the gap between scheduled and serviced collection points without adding fleet.'),
        departmentId: 'dept-solid-waste',
        humanOwnerRole: t('Deputy Municipal Commissioner (Solid Waste Management)'),
        confidence: 'medium',
        dependencies: [t('Vehicle availability at the ward transfer point'), t('Labour deployment agreed with the ward office')],
        risks: [t('Rebalancing rounds moves the constraint rather than removing it where fleet is the binding limit')],
        evidenceRefs: refs(evidence, 3),
      }),
      recommend({
        id: 'rec-waste-hotspot',
        title: t('Programme containment at the recurring dumping locations'),
        why:
          `${hotspots.length} locations recur on the hotspot register, the most persistent ${recurrent[0]?.recurrenceCount ?? 0} times. `
          + 'Recurrence indicates a mismatch between local generation and collection frequency, not a single clearance failure.',
        expectedImpact: t('Directs container placement and round timing at the locations that keep reappearing.'),
        departmentId: 'dept-solid-waste',
        humanOwnerRole: t('Assistant Municipal Commissioner (Ward)'),
        confidence: 'medium',
        dependencies: [t('Container capacity assessment'), t('Market operating hours confirmed with the licence department')],
        risks: [t('Containment without a frequency change typically relocates the hotspot within the same locality')],
        evidenceRefs: refs(evidence, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('Coverage is measured against the collection points recorded on the round sheet. A point never entered on the sheet cannot register as missed.'),
      t('Hotspot recurrence counts reports received, not tonnage removed, and it does not attribute the dumping to any person or premises.'),
    ],
    sources: sourcesOf(evidence, 'Solid Waste Management ward return and route adherence records'),
    domains: ['waste'],
    supportingTable: {
      caption: t('Solid waste position by ward, weakest collection coverage first'),
      columns: [t('Ward'), t('Generated (TPD)'), t('Collected (TPD)'), t('Coverage'), t('Segregation'), t('Missed (7d)'), t('Complaints (30d)'), t('Hotspots')],
      rows: weakest.slice(0, ctx.limit).map((r) => [
        fullWard(r.wardId),
        formatNumber(r.record.generationTpd, 1),
        formatNumber(r.record.collectedTpd, 1),
        formatPercent(r.record.coveragePct),
        formatPercent(r.record.segregationPct),
        String(r.record.missedCollections7d),
        formatNumber(r.record.complaints30d),
        String(r.record.hotspots),
      ]),
    },
    visuals: [
      metricsVisual(
        'waste-headline',
        [
          { label: t('Collection coverage'), value: formatPercent(coverage), support: `${formatNumber(collected, 1)} of ${formatNumber(generated, 1)} TPD`, tone: toneFor(coverage, true) },
          { label: t('Segregation at source'), value: formatPercent(segregation), support: 'Ward average', tone: toneFor(segregation, true) },
          { label: t('Missed collections (7d)'), value: formatCompact(missed), support: `${rows.length} wards in scope` },
          { label: t('Recurring hotspots'), value: String(hotspots.length), support: `${recurrent[0]?.recurrenceCount ?? 0} recurrences at the worst` },
        ],
        'Solid waste position across the wards in scope',
      ),
      wardBar(
        'waste-coverage',
        'Collection coverage by ward',
        '%',
        true,
        weakest.slice(0, chartCount(ctx)).map((r) => ({ wardId: r.wardId, value: r.record.coveragePct })),
      ),
    ],
    followUps: [
      t('Why are complaints increasing?'),
      t('Which wards need the most attention?'),
      t('Which municipal assets are in the worst condition?'),
    ],
  }
}

/* ==========================================================================
   Roads
   ========================================================================== */

const roads: AnswerHandler = (ctx) => {
  const queue = rankedDefects(ROAD_DEFECTS.length).filter((d) => inScope(ctx, d.wardId) && matchesSeverity(ctx, d.severity))
  if (queue.length === 0) {
    return emptyAnswer(ctx, 'road defect', emptyDetail(ctx, 'road defect register'))
  }

  const segments = ROAD_SEGMENTS.filter((s) => inScope(ctx, s.wardId))
  const scoped = ROAD_DEFECTS.filter((d) => inScope(ctx, d.wardId))
  const immediate = scoped.filter((d) => d.priorityScore >= 75).length
  const priority = scoped.filter((d) => d.priorityScore >= 58 && d.priorityScore < 75).length
  const scheduled = scoped.filter((d) => d.priorityScore >= 40 && d.priorityScore < 58).length
  const emergencyBelow = segments.filter((s) => s.emergencyRoute && s.conditionIndex < 55).length
  const hospitalAccess = queue.filter((d) => segments.some((s) => s.id === d.segmentId && s.hospitalAccess)).length
  const conditions = ctx.scopeWards.map((w) => ({ wardId: w.id, value: wardRoadCondition(w.id) })).filter((c) => c.value > 0)
  const weakest = [...conditions].sort((a, b) => a.value - b.value)
  const top = queue.slice(0, ctx.limit)
  const evidence = bestEvidence(ctx.user, {
    term: 'Road defect register',
    wardIds: scopeIds(ctx),
    kinds: ['source-record', 'inspection'],
    count: 5,
  })

  return {
    requestId: requestId(ctx, 'roads'),
    answer:
      `${queue.length} open defects rank on the published Road Defect Priority Engine within scope, ${immediate} of them in the `
      + 'immediate band at 75 or above. The engine weights defect severity (0.26), traffic importance (0.18), citizen complaints (0.16), '
      + 'repeat failures at the location (0.14), hospital and school access (0.14) and emergency route importance (0.12), so the ordering '
      + `can be shown rather than asserted. ${emergencyBelow} designated emergency corridors in scope currently sit below a pavement `
      + `condition index of 55, and ${hospitalAccess} of the ranked defects sit on segments carrying hospital access. ${scopeSentence(ctx)}`,
    keyFindings: [
      ...top.slice(0, 4).map(
        (d, i) =>
          `${i + 1}. Priority ${d.priorityScore}/100 - ${readable(d.type)} in ${fullWard(d.wardId)}, ${d.severity} severity, `
          + `${d.complaintCount} linked complaints, status ${readable(d.status)}, target repair ${formatRelative(d.targetRepairDate)}.`,
      ),
      t('The rectification queue in scope bands as {0} immediate (75-100), {1} priority (58-74) and {2} scheduled (40-57).', immediate, priority, scheduled),
      weakest.length > 0
        ? `${fullWard(weakest[0]!.wardId)} carries the weakest mean pavement condition at ${weakest[0]!.value}/100, against a scope mean of `
          + `${Math.round(mean(conditions.map((c) => c.value)))}/100.`
        : t('No segment-level condition index is held for the wards in scope.'),
      t('{0} segments in scope carry a planned closure, which constrains when rectification can be programmed.', segments.filter((s) => s.closurePlanned).length),
    ],
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-roads-order',
        title: t('Rectify in strict priority-score order, hospital-access segments first'),
        why:
          `Rectification capacity is constrained and ${immediate} defects sit in the immediate band. Directing capacity by the published `
          + 'weights makes the ordering defensible, and lets a ward receiving no treatment in a window be shown why.',
        expectedImpact: t('Directs constrained capacity to the highest assessed impact rather than to representation.'),
        departmentId: 'dept-roads',
        humanOwnerRole: t('Executive Engineer (Roads)'),
        confidence: 'high',
        dependencies: [t('Rectification capacity confirmed for the window'), t('Night-working permission where the segment is residential')],
        risks: [
          t('Monsoon conditions limit the durability of rectification undertaken now'),
          t('Strict ordering produces an uneven geographic distribution, which has to be explained rather than avoided'),
        ],
        evidenceRefs: refs(evidence, 3),
      }),
      recommend({
        id: 'rec-roads-emergency',
        title: t('Programme a condition survey of the emergency corridors below index 55'),
        why:
          `${emergencyBelow} designated emergency corridors sit below a condition index of 55. The index is a desk assessment; a survey `
          + 'establishes whether the deterioration is surface or structural before any resurfacing is sanctioned.',
        expectedImpact: t('Separates surface rectification from structural reconstruction before capital is committed.'),
        departmentId: 'dept-roads',
        humanOwnerRole: t('Chief Engineer (Roads & Traffic)'),
        confidence: 'medium',
        dependencies: [t('Survey team availability'), t('Traffic management plan for the survey window')],
        risks: [t('A survey without a programmed rectification window records the position without changing it')],
        evidenceRefs: refs(evidence, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('The priority score sequences the rectification queue. It is not an assessment of the quality of previous works, and it is not a measure of the performance of any contractor or department.'),
      t('A defect enters the register on inspection or citizen report. A defect not yet reported carries no score, so a low count may describe reporting rather than road condition.'),
    ],
    sources: sourcesOf(evidence, 'Road defect register and Road Defect Priority Engine'),
    domains: ['roads'],
    supportingTable: {
      caption: t('Rectification queue, ordered strictly by the published priority score'),
      columns: [t('Rank'), t('Ward'), t('Defect type'), t('Severity'), t('Priority'), t('Linked complaints'), t('Status'), t('Target repair')],
      rows: top.map((d, i) => [
        String(i + 1),
        fullWard(d.wardId),
        readable(d.type),
        d.severity,
        `${d.priorityScore}/100`,
        String(d.complaintCount),
        readable(d.status),
        formatRelative(d.targetRepairDate),
      ]),
    },
    visuals: [
      metricsVisual(
        'roads-headline',
        [
          { label: t('Open defects ranked'), value: formatCompact(queue.length), support: `${immediate} in the immediate band` },
          { label: t('Mean pavement condition'), value: `${Math.round(mean(conditions.map((c) => c.value)))}/100`, support: `${segments.length} segments in scope`, tone: toneFor(mean(conditions.map((c) => c.value)), true) },
          { label: t('Emergency corridors below 55'), value: String(emergencyBelow), support: 'Condition index', tone: emergencyBelow > 0 ? 'critical' : 'positive' },
          { label: t('Hospital-access defects'), value: String(hospitalAccess), support: 'Highest access weighting' },
        ],
        'Road condition and the rectification queue in scope',
      ),
      rankedBarVisual({
        id: 'roads-priority',
        caption: t('Highest-ranking defects by published priority score'),
        unit: '/100',
        higherIsBetter: false,
        data: top.slice(0, chartCount(ctx)).map((d) => ({ label: `${shortWard(d.wardId)} · ${readable(d.type)}`, value: d.priorityScore })),
      }),
    ],
    followUps: [
      t('Which traffic corridors are most congested?'),
      t('Which capital projects are showing schedule risk or delay?'),
      t('Which municipal assets are in the worst condition?'),
    ],
  }
}

/* ==========================================================================
   Traffic and mobility
   ========================================================================== */

const traffic: AnswerHandler = (ctx) => {
  const corridors = TRAFFIC_CORRIDORS.filter((c) => anyInScope(ctx, c.wardIds))
  if (corridors.length === 0) {
    return emptyAnswer(ctx, 'traffic corridor', 'No arterial corridor on the register runs through the wards in scope.')
  }

  const ranked = [...corridors].sort((a, b) => b.congestionIndex - a.congestionIndex)
  const top = ranked.slice(0, ctx.limit)
  const meanCongestion = mean(corridors.map((c) => c.congestionIndex))
  const incidents = sum(corridors.map((c) => c.incidents30d))
  const closures = sum(corridors.map((c) => c.closures))
  const plannedClosures = ROAD_SEGMENTS.filter((s) => inScope(ctx, s.wardId) && s.closurePlanned).length
  const severe = corridors.filter((c) => c.congestionIndex >= 60)
  const evidence = bestEvidence(ctx.user, {
    term: 'Field team situation report',
    wardIds: scopeIds(ctx),
    kinds: ['sensor-reading', 'field-report'],
    count: 5,
  })

  return {
    requestId: requestId(ctx, 'traffic'),
    answer:
      `${corridors.length} arterial corridors touch the wards in scope, carrying a mean congestion index of `
      + `${formatNumber(meanCongestion)}/100, and ${severe.length} of them sit at 60 or above. The congestion index is computed as the `
      + 'shortfall of average peak-hour speed against the recorded free-flow speed on the same corridor, so it describes the loss of '
      + 'throughput and does not attribute a cause. '
      + `${formatCompact(incidents)} incidents were recorded on these corridors in the last 30 days, alongside ${closures} recorded closures `
      + `and ${plannedClosures} segments carrying a planned closure. ${scopeSentence(ctx)}`,
    keyFindings: [
      ...top.slice(0, 4).map(
        (c) =>
          `${c.name} runs at ${formatNumber(c.peakSpeedKmph, 1)} km/h in the peak against a free-flow ${formatNumber(c.freeFlowSpeedKmph, 1)} km/h, `
          + `a congestion index of ${c.congestionIndex}/100 across ${c.wardIds.length} wards, with ${c.incidents30d} incidents in 30 days.`,
      ),
      t('{0} of {1} corridors sit at or above a congestion index of 60, the threshold at which peak throughput falls below 40% of free flow.', severe.length, corridors.length),
      t('{0} corridor closures are recorded, and {1} road segments in scope carry a planned closure that will interact with them.', closures, plannedClosures),
      t('Incident load across the corridors in scope averages {0} recorded incidents per corridor over 30 days.', formatNumber(incidents / corridors.length, 1)),
    ],
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-traffic-corridor',
        title: t('Convene a corridor review for {0}', top[0]!.name),
        why:
          `${top[0]!.name} carries the highest congestion index in scope at ${top[0]!.congestionIndex}/100, with peak speed at `
          + `${formatNumber(top[0]!.peakSpeedKmph, 1)} km/h. A review establishes whether the constraint is junction capacity, an active `
          + 'work zone or on-street parking before any intervention is designed.',
        expectedImpact: t('Identifies the binding constraint on the corridor so that the intervention is directed rather than general.'),
        departmentId: 'dept-mobility',
        humanOwnerRole: t('Chief Engineer (Traffic & Transportation)'),
        confidence: 'medium',
        dependencies: [t('Traffic police participation'), t('Junction count data for the corridor')],
        risks: [t('Corridor interventions displace congestion to adjacent corridors unless the network effect is modelled')],
        evidenceRefs: refs(evidence, 3),
      }),
      recommend({
        id: 'rec-traffic-closures',
        title: t('Sequence planned road closures against corridor congestion'),
        why:
          `${plannedClosures} segments in scope carry a planned closure while ${severe.length} corridors already sit above a congestion `
          + 'index of 60. Sequencing the closures avoids concurrent capacity withdrawal on parallel routes.',
        expectedImpact: t('Prevents concurrent loss of capacity on corridors that absorb one another’s diverted traffic.'),
        departmentId: 'dept-mobility',
        humanOwnerRole: t('Deputy Chief Engineer (Traffic Operations)'),
        confidence: 'medium',
        dependencies: [t('Roads department works programme'), t('Utility agency trenching calendar')],
        risks: [t('Deferring a closure defers the underlying works and may extend the defect exposure on that segment')],
        evidenceRefs: refs(evidence, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('The congestion index is derived from average peak-hour speed against the recorded free-flow speed for the same corridor. It measures throughput loss and does not establish its cause.'),
      t('Corridors span several wards, so a corridor is reported in full wherever any of its wards falls within scope. Its figures are not divisible by ward.'),
    ],
    sources: sourcesOf(evidence, 'Traffic corridor speed and incident records'),
    domains: ['mobility'],
    supportingTable: {
      caption: t('Arterial corridors in scope, most congested first'),
      columns: [t('Corridor'), t('Wards'), t('Peak speed (km/h)'), t('Free-flow (km/h)'), t('Congestion'), t('Incidents (30d)'), t('Closures'), t('State')],
      rows: top.map((c) => [
        c.name,
        c.wardIds.map((w) => shortWard(w)).join(', '),
        formatNumber(c.peakSpeedKmph, 1),
        formatNumber(c.freeFlowSpeedKmph, 1),
        `${c.congestionIndex}/100`,
        String(c.incidents30d),
        String(c.closures),
        readable(c.state),
      ]),
    },
    visuals: [
      metricsVisual(
        'traffic-headline',
        [
          { label: t('Mean congestion index'), value: `${formatNumber(meanCongestion)}/100`, support: `${corridors.length} corridors in scope`, tone: toneFor(meanCongestion, false) },
          { label: t('Corridors at 60 or above'), value: String(severe.length), support: 'Peak throughput below 40% of free flow', tone: severe.length > 0 ? 'warn' : 'positive' },
          { label: t('Incidents (30d)'), value: formatCompact(incidents), support: `${formatNumber(incidents / corridors.length, 1)} per corridor` },
          { label: t('Planned segment closures'), value: String(plannedClosures), support: 'Capacity withdrawal ahead' },
        ],
        'Mobility position across the corridors touching the wards in scope',
      ),
      rankedBarVisual({
        id: 'traffic-congestion',
        caption: t('Congestion index by corridor'),
        unit: '/100',
        higherIsBetter: false,
        data: top.slice(0, chartCount(ctx)).map((c) => ({ label: c.name, value: c.congestionIndex })),
      }),
    ],
    followUps: [
      t('Which road assets need intervention?'),
      t('What is the air quality position across the city?'),
      t('Which incidents are currently active?'),
    ],
  }
}

/* ==========================================================================
   Street lighting
   ========================================================================== */

const streetLighting: AnswerHandler = (ctx) => {
  const circuits = LIGHTING_CIRCUITS.filter((c) => inScope(ctx, c.wardId))
  if (circuits.length === 0) {
    return emptyAnswer(ctx, 'street lighting circuit', 'No feeder circuit is recorded against the wards in scope.')
  }

  const faults = LIGHTING_FAULTS.filter((f) => inScope(ctx, f.wardId) && matchesSeverity(ctx, f.severity))
  const open = faults.filter((f) => f.status !== 'rectified')
  const breached = open.filter((f) => f.breached)
  const polesTotal = sum(circuits.map((c) => c.polesTotal))
  const polesWorking = sum(circuits.map((c) => c.polesFunctional))
  const working = share(polesWorking, polesTotal)
  const ledPoles = sum(circuits.map((c) => Math.round((c.ledConversionPct / 100) * c.polesTotal)))
  const compliance = mean(circuits.map((c) => c.burningHoursCompliancePct))
  const energyCost = sum(circuits.map((c) => c.monthlyEnergyCostRupees))
  const consumption = sum(circuits.map((c) => c.monthlyConsumptionKwh))
  const darkest = [...circuits].sort((a, b) => share(a.polesFunctional, a.polesTotal) - share(b.polesFunctional, b.polesTotal))
  const corridors = circuits.filter((c) => c.priorityCorridor)
  const byCategory = new Map<string, number>()
  for (const fault of open) byCategory.set(fault.category, (byCategory.get(fault.category) ?? 0) + 1)
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]
  const lampPoles = (kind: string): number => sum(circuits.filter((c) => c.lampType === kind).map((c) => c.polesTotal))
  const evidence = bestEvidence(ctx.user, {
    term: 'Asset register record',
    wardIds: scopeIds(ctx),
    kinds: ['source-record', 'sensor-reading'],
    count: 5,
  })

  return {
    requestId: requestId(ctx, 'street-lighting'),
    answer:
      `${formatCompact(polesWorking)} of ${formatCompact(polesTotal)} lighting points are functional across ${circuits.length} feeder `
      + `circuits in scope - ${formatPercent(working)} - with burning-hours compliance averaging ${formatPercent(compliance)} and LED `
      + `conversion reaching ${formatPercent(share(ledPoles, polesTotal))} of the pole estate. ${open.length} faults are open, of which `
      + `${breached.length} have passed their restoration SLA; the SLA is 12 hours for a critical fault, 24 for high, 48 for medium and 96 for low. `
      + `${corridors.length} circuits are designated priority corridors, where a dark stretch carries a safety weighting rather than an amenity one. `
      + `${scopeSentence(ctx)}`,
    keyFindings: [
      ...darkest.slice(0, 3).map(
        (c) =>
          `${c.reference} at ${c.location} in ${fullWard(c.wardId)} has ${c.polesTotal - c.polesFunctional} of ${c.polesTotal} points out `
          + `(${formatPercent(share(c.polesFunctional, c.polesTotal))} functional), ${c.faultsOpen} open faults and a mean restoration of `
          + `${formatNumber(c.meanRestorationHours, 1)} hours.`,
      ),
      t('{0} of {1} open faults have passed their restoration SLA, the oldest standing at {2} hours.', breached.length, open.length, Math.max(0, ...open.map((f) => f.ageHours))),
      topCategory
        ? `${LIGHTING_FAULT_CATEGORY_LABEL[topCategory[0] as keyof typeof LIGHTING_FAULT_CATEGORY_LABEL]} is the largest open fault category at `
          + `${topCategory[1]} of ${open.length} faults, affecting ${sum(open.filter((f) => f.category === topCategory[0]).map((f) => f.polesAffected))} points.`
        : t('No fault is currently open on the circuits in scope.'),
      `Burning-hours compliance ranges from ${formatPercent(Math.min(...circuits.map((c) => c.burningHoursCompliancePct)))} to `
        + `${formatPercent(Math.max(...circuits.map((c) => c.burningHoursCompliancePct)))}; `
        + `${circuits.filter((c) => c.automatedSwitching).length} circuits are on automatic astronomical switching.`,
      t('The estate in scope draws {0} kWh a month at a recorded energy cost of {1}.', formatCompact(consumption), formatCrore(energyCost / 1_00_00_000, 2)),
    ],
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-lighting-sla',
        title: t('Clear the SLA-breached faults on priority corridors first'),
        why:
          `${breached.length} open faults have passed their restoration SLA while ${corridors.length} circuits in scope carry a priority `
          + 'corridor designation, where an unlit stretch is a safety exposure rather than an amenity shortfall.',
        expectedImpact: t('Restores lighting on the stretches where darkness carries the highest assessed safety weighting.'),
        departmentId: 'dept-electrical',
        humanOwnerRole: t('Executive Engineer (Electrical & Street Lighting)'),
        confidence: 'high',
        dependencies: [t('Material availability for the fault category'), t('Distribution licensee coordination where the feeder has tripped')],
        risks: [t('Prioritising corridors extends restoration times on residential circuits, which has to be stated rather than absorbed')],
        evidenceRefs: refs(evidence, 3),
      }),
      recommend({
        id: 'rec-lighting-led',
        title: t('Programme LED conversion on the highest-load non-LED circuits'),
        why:
          `${formatPercent(100 - share(ledPoles, polesTotal))} of the pole estate in scope is not yet converted, against a recorded monthly `
          + `energy cost of ${formatCrore(energyCost / 1_00_00_000, 2)} for the circuits in scope.`,
        expectedImpact: t('Reduces connected load and recurring energy expenditure on the circuits carrying the largest draw.'),
        departmentId: 'dept-electrical',
        humanOwnerRole: t('Chief Engineer (Electrical)'),
        confidence: 'medium',
        dependencies: [t('Capital head availability in the current phasing'), t('Pole condition survey before refitting')],
        risks: [t('Energy saving is modelled from connected load, and will not be realised where burning-hours compliance stays low')],
        evidenceRefs: refs(evidence, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('Burning-hours compliance is derived from feeder switching records, not from pole-level metering. A circuit recorded as lit may still contain individual points that are out.'),
      t('A fault is counted from the moment it is reported. An unreported dark stretch does not appear in the count, so a low fault figure may describe reporting rather than illumination.'),
    ],
    sources: sourcesOf(evidence, 'Street lighting circuit register and fault management records'),
    domains: ['street-lighting'],
    supportingTable: {
      caption: t('Feeder circuits in scope, lowest functional share first'),
      columns: [t('Circuit'), t('Ward'), t('Location'), t('Points working'), t('Lamp type'), t('LED conversion'), t('Burning hours'), t('Open faults')],
      rows: darkest.slice(0, ctx.limit).map((c) => [
        c.reference,
        fullWard(c.wardId),
        c.location,
        `${formatNumber(c.polesFunctional)} of ${formatNumber(c.polesTotal)}`,
        LAMP_TYPE_LABEL[c.lampType],
        formatPercent(c.ledConversionPct, 0),
        formatPercent(c.burningHoursCompliancePct),
        String(c.faultsOpen),
      ]),
    },
    visuals: [
      metricsVisual(
        'lighting-headline',
        [
          { label: t('Points functional'), value: formatPercent(working), support: `${formatCompact(polesWorking)} of ${formatCompact(polesTotal)}`, tone: toneFor(working, true) },
          { label: t('Faults past SLA'), value: String(breached.length), support: `${open.length} open in total`, tone: breached.length > 0 ? 'critical' : 'positive' },
          { label: t('Burning-hours compliance'), value: formatPercent(compliance), support: 'Circuit average', tone: toneFor(compliance, true) },
          { label: t('LED conversion'), value: formatPercent(share(ledPoles, polesTotal)), support: `${formatCompact(consumption)} kWh per month`, tone: toneFor(share(ledPoles, polesTotal), true) },
        ],
        'Street lighting position across the circuits in scope',
      ),
      compositionVisual({
        id: 'lighting-lamp-mix',
        caption: t('Pole estate by lamp type'),
        segments: [
          { id: 'led', label: LAMP_TYPE_LABEL.led, value: lampPoles('led'), colour: VISUAL_COLOUR.ok },
          { id: 'sodium-vapour', label: LAMP_TYPE_LABEL['sodium-vapour'], value: lampPoles('sodium-vapour'), colour: VISUAL_COLOUR.warn },
          { id: 'metal-halide', label: LAMP_TYPE_LABEL['metal-halide'], value: lampPoles('metal-halide'), colour: VISUAL_COLOUR.intel },
          { id: 'cfl', label: LAMP_TYPE_LABEL.cfl, value: lampPoles('cfl'), colour: VISUAL_COLOUR.muted },
        ].filter((segment) => segment.value > 0),
      }),
    ],
    followUps: [
      t('Which municipal assets are in the worst condition?'),
      t('Show me department budget variance against the phased plan.'),
      t('Which wards need the most attention?'),
    ],
  }
}

/* ==========================================================================
   Municipal assets
   ========================================================================== */

const assets: AnswerHandler = (ctx) => {
  const register = MUNICIPAL_ASSETS.filter(
    (a) =>
      inScope(ctx, a.wardId)
      && matchesSeverity(ctx, a.criticality)
      && canAccess(ctx.user, 'intelligence', 'view', {
        wardId: a.wardId,
        departmentId: a.departmentId,
        domain: 'assets',
        classification: a.classification,
      }).allowed,
  )
  if (register.length === 0) {
    return emptyAnswer(ctx, 'municipal asset', emptyDetail(ctx, 'asset register'))
  }

  const year = DEMO_NOW.getFullYear()
  const worst = [...register].sort((a, b) => a.conditionIndex - b.conditionIndex)
  const overdueInspection = register.filter((a) => new Date(a.nextInspectionDue).getTime() < DEMO_NOW.getTime())
  const beyondLife = register.filter((a) => year - a.installedYear > a.designLifeYears)
  const failing = register.filter((a) => a.conditionIndex < 40)
  const criticalFailing = failing.filter((a) => a.criticality === 'critical' || a.criticality === 'high')
  const replacementAtRisk = sum(failing.map((a) => a.replacementValueCrore))
  const meanCondition = mean(register.map((a) => a.conditionIndex))
  const observations = sum(register.map((a) => a.openObservations))
  const evidence = bestEvidence(ctx.user, {
    term: 'Asset register record',
    wardIds: scopeIds(ctx),
    kinds: ['source-record', 'inspection'],
    count: 5,
  })

  return {
    requestId: requestId(ctx, 'assets'),
    answer:
      `${formatCompact(register.length)} assets in the register fall within your scope, carrying a mean condition index of `
      + `${formatNumber(meanCondition)}/100 and a combined replacement value of ${formatCrore(sum(register.map((a) => a.replacementValueCrore)))}. `
      + `${failing.length} sit below a condition index of 40, representing ${formatCrore(replacementAtRisk)} of replacement value, and `
      + `${beyondLife.length} have passed their recorded design life. The condition index is a desk assessment derived from age against `
      + `design life and the last recorded inspection; it is not a structural certification. ${overdueInspection.length} assets are past `
      + `their next inspection due date. ${scopeSentence(ctx)}`,
    keyFindings: [
      ...worst.slice(0, 4).map(
        (a) =>
          `${ASSET_CATEGORY_LABEL[a.category]} ${a.name} in ${fullWard(a.wardId)} sits at ${a.conditionIndex}/100 after `
          + `${year - a.installedYear} years against a ${a.designLifeYears}-year design life, ${a.criticality} criticality, `
          + `${formatCrore(a.replacementValueCrore, 2)} replacement value, ${a.openObservations} open observations.`,
      ),
      t('{0} assets below condition 40 also carry critical or high criticality, which is the set that determines the reinvestment sequence.', criticalFailing.length),
      t('{0} of {1} assets are past their next inspection due date; the oldest inspection on file was recorded {2}.', overdueInspection.length, register.length, formatRelative(worst[0]!.lastInspectedAt)),
      t('{0} open maintenance observations stand against the assets in scope, an average of {1} per asset.', observations, formatNumber(observations / register.length, 1)),
    ],
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-assets-inspection',
        title: t('Clear the overdue inspection backlog on critical and high-criticality assets'),
        why:
          `${overdueInspection.length} assets are past their inspection due date, and ${criticalFailing.length} assets below condition 40 `
          + 'carry critical or high criticality. Reinvestment cannot be sequenced from a desk index alone.',
        expectedImpact: t('Replaces a modelled condition index with an inspected one before capital is committed.'),
        departmentId: 'dept-estates',
        humanOwnerRole: t('Deputy Chief Engineer (Estates & Municipal Assets)'),
        confidence: 'high',
        dependencies: [t('Inspection team availability'), t('Access arrangements where the asset is in continuous use')],
        risks: [t('An inspection programme without a reinvestment head records deterioration without addressing it')],
        evidenceRefs: refs(evidence, 3),
      }),
      recommend({
        id: 'rec-assets-reinvestment',
        title: t('Bring the assets beyond design life into the capital reinvestment phasing'),
        why:
          `${beyondLife.length} assets have passed their recorded design life and ${formatCrore(replacementAtRisk)} of replacement value `
          + 'sits below a condition index of 40. Deferral moves the expenditure rather than avoiding it.',
        expectedImpact: t('Places the reinvestment decision on the register position rather than on failure.'),
        departmentId: 'dept-estates',
        humanOwnerRole: t('Additional Municipal Commissioner (Estates)'),
        confidence: 'medium',
        dependencies: [t('Capital phasing agreed with Finance'), t('Departmental confirmation that the asset is still in service')],
        risks: [t('Replacement value is a register figure and is not a valuation; it should not be read as the sanctioned cost')],
        evidenceRefs: refs(evidence, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('The condition index is a desk assessment derived from age against design life and the last recorded inspection. It is not a structural certification and does not substitute for one.'),
      t('Replacement value is the figure carried on the asset register. It is neither a valuation nor a sanctioned estimate, and a reinvestment case cannot rest on it alone.'),
    ],
    sources: sourcesOf(evidence, 'Municipal asset register and inspection records'),
    domains: ['assets'],
    supportingTable: {
      caption: t('Municipal assets in scope, weakest recorded condition first'),
      columns: [t('Asset'), t('Category'), t('Ward'), t('Condition'), t('Age / design life'), t('Criticality'), t('Replacement value'), t('Next inspection')],
      rows: worst.slice(0, ctx.limit).map((a) => [
        a.name,
        ASSET_CATEGORY_LABEL[a.category],
        fullWard(a.wardId),
        `${a.conditionIndex}/100`,
        `${year - a.installedYear} / ${a.designLifeYears} yrs`,
        a.criticality,
        formatCrore(a.replacementValueCrore, 2),
        formatRelative(a.nextInspectionDue),
      ]),
    },
    visuals: [
      metricsVisual(
        'assets-headline',
        [
          { label: t('Mean condition index'), value: `${formatNumber(meanCondition)}/100`, support: `${formatCompact(register.length)} assets in scope`, tone: toneFor(meanCondition, true) },
          { label: t('Below condition 40'), value: String(failing.length), support: `${formatCrore(replacementAtRisk)} replacement value`, tone: failing.length > 0 ? 'critical' : 'positive' },
          { label: t('Beyond design life'), value: String(beyondLife.length), support: `${formatPercent(share(beyondLife.length, register.length))} of the register in scope`, tone: toneFor(share(beyondLife.length, register.length), false) },
          { label: t('Inspections overdue'), value: String(overdueInspection.length), support: `${observations} open observations` },
        ],
        'Asset register position across the wards in scope',
      ),
      rankedBarVisual({
        id: 'assets-condition',
        caption: t('Weakest recorded condition index by asset'),
        unit: '/100',
        higherIsBetter: true,
        data: worst.slice(0, chartCount(ctx)).map((a) => ({ label: `${shortWard(a.wardId)} · ${ASSET_CATEGORY_LABEL[a.category]}`, value: a.conditionIndex })),
      }),
    ],
    followUps: [
      t('Which buildings carry an overdue structural audit?'),
      t('Which capital projects are showing schedule risk or delay?'),
      t('Show me department budget variance against the phased plan.'),
    ],
  }
}

/* ==========================================================================
   Air and noise quality
   ========================================================================== */

const airQuality: AnswerHandler = (ctx) => {
  const stations = byScopeWard(ctx, wardAirQuality)
  if (stations.length === 0) {
    return emptyAnswer(ctx, 'air quality', 'No monitoring station reading is held for the wards in scope.')
  }

  const noise = NOISE_READINGS.filter((n) => inScope(ctx, n.wardId))
  const exceedances = noise.filter((n) => n.exceedance)
  const worst = [...stations].sort((a, b) => b.record.aqi - a.record.aqi)
  const meanAqi = mean(stations.map((s) => s.record.aqi))
  const aboveModerate = stations.filter((s) => s.record.aqi > 100)
  const rising = stations.filter((s) => s.record.trend === 'up')
  const silenceBreaches = exceedances.filter((n) => n.zoneType === 'silence')
  const nightBreaches = exceedances.filter((n) => n.nightDb > n.nightLimitDb)
  const noiseByWard = ctx.scopeWards.map((w) => ({ wardId: w.id, count: exceedances.filter((n) => n.wardId === w.id).length }))
  const evidence = bestEvidence(ctx.user, {
    term: 'Automatic rain gauge observation',
    wardIds: scopeIds(ctx),
    kinds: ['sensor-reading', 'derived-metric'],
    count: 5,
  })

  return {
    requestId: requestId(ctx, 'air-quality'),
    answer:
      `The air quality index across the wards in scope averages ${formatNumber(meanAqi)}, with ${aboveModerate.length} of `
      + `${stations.length} stations reading above 100. Readings are banded on the national scale: 0-50 good, 51-100 satisfactory, `
      + '101-200 moderate, 201-300 poor, 301-400 very poor and above 400 severe. '
      + `${exceedances.length} of ${noise.length} noise readings exceed the prescribed limit for their zone, of which ${silenceBreaches.length} `
      + `fall in silence zones and ${nightBreaches.length} breach the night limit. Each figure is a single station or location observation at `
      + `the stated instant, not a statutory 24-hour compliance return. ${scopeSentence(ctx)}`,
    keyFindings: [
      ...worst.slice(0, 3).map(
        (s) =>
          `${fullWard(s.wardId)} reads AQI ${s.record.aqi} (${readable(s.record.category)}) with PM2.5 at ${s.record.pm25}, PM10 at `
          + `${s.record.pm10} and NO₂ at ${s.record.no2} µg/m³, trend ${s.record.trend}, observed ${formatRelative(s.record.observedAt)}.`,
      ),
      t('{0} of {1} stations record a rising trend against the previous observation window.', rising.length, stations.length),
      t('{0} noise exceedances stand across {1} monitored zone readings, an exceedance rate of {2}.', exceedances.length, noise.length, formatPercent(share(exceedances.length, noise.length))),
      silenceBreaches.length > 0
        ? t('{0} silence-zone readings exceed the 50 dB(A) day or 40 dB(A) night limit, the tightest limits in the schedule.', silenceBreaches.length)
        : t('No silence-zone reading in scope exceeds its prescribed day or night limit.'),
      t('{0} readings breach the night limit specifically, which is the band that governs residential rest rather than daytime activity.', nightBreaches.length),
    ],
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-air-source',
        title: t('Commission a source apportionment review for {0}', fullWard(worst[0]!.wardId)),
        why:
          `${fullWard(worst[0]!.wardId)} carries the highest reading in scope at AQI ${worst[0]!.record.aqi}, with PM10 at `
          + `${worst[0]!.record.pm10} µg/m³. A single station reading identifies where, not what, so apportionment is required before any `
          + 'control measure is directed.',
        expectedImpact: t('Establishes the contributing sources so that mitigation is directed rather than general.'),
        departmentId: 'dept-environment',
        humanOwnerRole: t('Chief Engineer (Environment)'),
        confidence: 'medium',
        dependencies: [t('State pollution control board concurrence'), t('Continuous monitoring data for the same location')],
        risks: [t('A single-station reading is not representative of the whole ward and should not be extrapolated across it')],
        evidenceRefs: refs(evidence, 3),
      }),
      recommend({
        id: 'rec-noise-silence',
        title: t('Review the silence-zone readings against their notified boundaries'),
        why:
          `${silenceBreaches.length} silence-zone readings exceed the prescribed limit. Silence zones are notified around hospitals, `
          + 'educational institutions and courts, so a breach there carries a different weight from a commercial-zone breach.',
        expectedImpact: t('Confirms whether the exceedance is a boundary question or a genuine control failure.'),
        departmentId: 'dept-environment',
        humanOwnerRole: t('Environmental Officer'),
        confidence: 'medium',
        dependencies: [t('Notified silence-zone boundary record'), t('Calibration certificates for the monitoring equipment')],
        risks: [t('A recorded exceedance is an observation against a limit. It is not a finding against any premises or person')],
        evidenceRefs: refs(evidence, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('Each AQI figure is a single monitoring station observation at the stated instant. It is not a 24-hour rolling average and is not comparable to a statutory compliance return.'),
      t('A noise exceedance is a recorded reading against the limit prescribed for that zone. It establishes neither the source nor responsibility, and it is not a finding against any premises.'),
    ],
    sources: sourcesOf(evidence, 'Ambient air quality monitoring stations and noise zone readings'),
    domains: ['environment'],
    supportingTable: {
      caption: t('Air and noise position by ward, highest index first'),
      columns: [t('Ward'), 'AQI', t('Band'), t('PM2.5 (µg/m³)'), t('PM10 (µg/m³)'), t('NO₂ (µg/m³)'), t('Trend'), t('Noise exceedances')],
      rows: worst.slice(0, ctx.limit).map((s) => [
        fullWard(s.wardId),
        String(s.record.aqi),
        readable(s.record.category),
        String(s.record.pm25),
        String(s.record.pm10),
        String(s.record.no2),
        s.record.trend,
        String(noiseByWard.find((n) => n.wardId === s.wardId)?.count ?? 0),
      ]),
    },
    visuals: [
      metricsVisual(
        'air-headline',
        [
          { label: t('Mean air quality index'), value: formatNumber(meanAqi), support: `${stations.length} stations in scope`, tone: meanAqi > 200 ? 'critical' : meanAqi > 100 ? 'warn' : 'positive' },
          { label: t('Stations above 100'), value: `${aboveModerate.length} of ${stations.length}`, support: 'Moderate band or worse' },
          { label: t('Noise exceedances'), value: String(exceedances.length), support: `${formatPercent(share(exceedances.length, noise.length))} of readings`, tone: toneFor(share(exceedances.length, noise.length), false) },
          { label: t('Stations trending up'), value: String(rising.length), support: 'Against the previous window' },
        ],
        'Environmental quality across the wards in scope',
      ),
      wardBar(
        'air-aqi',
        'Air quality index by ward',
        'AQI',
        false,
        worst.slice(0, chartCount(ctx)).map((s) => ({ wardId: s.wardId, value: s.record.aqi })),
      ),
    ],
    followUps: [
      t('What is the tree canopy and open space position?'),
      t('Which traffic corridors are most congested?'),
      t('Are there any public health signals I should know about?'),
    ],
  }
}

/* ==========================================================================
   Gardens, trees and open space
   ========================================================================== */

const gardens: AnswerHandler = (ctx) => {
  const positions = TREE_WARD_POSITIONS.filter((treeWardPosition) => inScope(ctx, treeWardPosition.wardId))
  if (positions.length === 0) {
    return emptyAnswer(ctx, 'tree and open space', 'No Tree Authority ward position is held for the wards in scope.')
  }

  const spaces = OPEN_SPACES.filter((o) => inScope(ctx, o.wardId))
  const weakest = [...positions].sort((a, b) => a.canopyCoverPct - b.canopyCoverPct)
  const meanCanopy = mean(positions.map((p) => p.canopyCoverPct))
  const pending = sum(positions.map((p) => p.fellingApplicationsPending))
  const required = sum(positions.map((p) => p.compensatoryPlantingRequired))
  const completed = sum(positions.map((p) => p.compensatoryPlantingCompleted))
  const survival = mean(positions.map((p) => p.survivalRatePct))
  const encroached = spaces.filter((s) => s.encroachmentReported)
  const accessible = spaces.filter((s) => s.hasAccessibleEntrance)
  const meanCondition = mean(spaces.map((s) => s.conditionScore))
  const gardensCount = spaces.filter((s) => s.kind === 'garden').length
  const playgrounds = spaces.filter((s) => s.kind === 'playground').length
  const evidence = bestEvidence(ctx.user, {
    term: 'Field inspection observation',
    wardIds: scopeIds(ctx),
    kinds: ['inspection', 'source-record'],
    count: 5,
  })

  return {
    requestId: requestId(ctx, 'gardens'),
    answer:
      `Canopy cover across the wards in scope averages ${formatPercent(meanCanopy)} and the corporation maintains ${spaces.length} open `
      + `spaces there - ${gardensCount} ${OPEN_SPACE_KIND_LABEL.garden.toLowerCase()}s and ${playgrounds} `
      + `${OPEN_SPACE_KIND_LABEL.playground.toLowerCase()}s among them - at a mean condition score of ${formatNumber(meanCondition)}/100. `
      + `The Tree Authority carries ${formatCompact(pending)} felling applications pending, and compensatory planting stands at `
      + `${formatCompact(completed)} of ${formatCompact(required)} saplings required (${formatPercent(share(completed, required))}). `
      + `Planting completion and survival are separate observations: recorded survival averages ${formatPercent(survival)}, so completion `
      + `alone overstates established canopy. ${scopeSentence(ctx)}`,
    keyFindings: [
      ...weakest.slice(0, 3).map(
        (p) =>
          `${fullWard(p.wardId)} records ${formatPercent(p.canopyCoverPct)} canopy cover over ${formatCompact(p.treesSurveyed)} surveyed `
          + `trees, with ${formatNumber(p.openSpacePerThousandHa, 2)} ha of open space per 1,000 residents and `
          + `${p.fellingApplicationsPending} felling applications pending.`,
      ),
      t('Compensatory planting is {0} complete against the conditions imposed - {1} saplings remain outstanding across the wards in scope.', formatPercent(share(completed, required)), formatCompact(required - completed)),
      t('Recorded survival averages {0}, ranging from {1} to {2}.', formatPercent(survival), formatPercent(Math.min(...positions.map((p) => p.survivalRatePct))), formatPercent(Math.max(...positions.map((p) => p.survivalRatePct)))),
      t('{0} of {1} open spaces carry a recorded encroachment report, and {2} have no accessible entrance on the register.', encroached.length, spaces.length, spaces.length - accessible.length),
      t('{0} open spaces sit below a condition score of 50, and {1} are maintained under an adoption arrangement rather than departmentally.', spaces.filter((s) => s.conditionScore < 50).length, spaces.filter((s) => s.maintenance === 'adopted').length),
    ],
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-gardens-compensatory',
        title: t('Reconcile the compensatory planting register against the conditions imposed'),
        why:
          `${formatCompact(required - completed)} saplings remain outstanding against permissions already granted, and recorded survival `
          + `averages ${formatPercent(survival)}. The statutory obligation attaches to established trees, not to saplings placed.`,
        expectedImpact: t('Establishes the genuine shortfall against the conditions imposed, separately from the planting count.'),
        departmentId: 'dept-gardens',
        humanOwnerRole: t('Superintendent of Gardens (Tree Authority)'),
        confidence: 'medium',
        dependencies: [t('Tree Authority permission record'), t('Site verification of the planting locations')],
        risks: [t('Reconciliation identifies the shortfall; it does not by itself create the planting capacity to close it')],
        evidenceRefs: refs(evidence, 3),
      }),
      recommend({
        id: 'rec-gardens-access',
        title: t('Programme accessible entrances at the open spaces recorded without one'),
        why:
          `${spaces.length - accessible.length} of ${spaces.length} open spaces in scope carry no accessible entrance on the register, `
          + `and ${spaces.filter((s) => s.conditionScore < 50).length} sit below a condition score of 50.`,
        expectedImpact: t('Brings the open space estate towards universal access alongside routine condition works.'),
        departmentId: 'dept-gardens',
        humanOwnerRole: t('Assistant Superintendent of Gardens'),
        confidence: 'medium',
        dependencies: [t('Site survey where the entrance abuts a footpath'), t('Coordination with the roads department at the kerb line')],
        risks: [t('The register records whether an accessible entrance exists, not whether the route to it is continuous')],
        evidenceRefs: refs(evidence, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('Compensatory planting completion counts saplings planted against the condition imposed. Survival is a separate later observation, and the two figures must not be read as one.'),
      t('An encroachment entry is a recorded report awaiting determination. It is not an adjudicated finding and implies nothing about any occupier.'),
    ],
    sources: sourcesOf(evidence, 'Tree Authority ward register and open space inspection records'),
    domains: ['gardens'],
    supportingTable: {
      caption: t('Tree and open space position by ward, lowest canopy cover first'),
      columns: [t('Ward'), t('Canopy cover'), t('Open space per 1,000 (ha)'), t('Spaces on register'), t('Mean condition'), t('Felling pending'), t('Compensatory planting'), t('Survival rate')],
      rows: weakest.slice(0, ctx.limit).map((p) => [
        fullWard(p.wardId),
        formatPercent(p.canopyCoverPct),
        formatNumber(p.openSpacePerThousandHa, 2),
        String(spaces.filter((s) => s.wardId === p.wardId).length),
        spaces.some((s) => s.wardId === p.wardId)
          ? `${Math.round(mean(spaces.filter((s) => s.wardId === p.wardId).map((s) => s.conditionScore)))}/100`
          : t('No space on register'),
        String(p.fellingApplicationsPending),
        `${formatCompact(p.compensatoryPlantingCompleted)} of ${formatCompact(p.compensatoryPlantingRequired)}`,
        formatPercent(p.survivalRatePct),
      ]),
    },
    visuals: [
      metricsVisual(
        'gardens-headline',
        [
          { label: t('Mean canopy cover'), value: formatPercent(meanCanopy), support: `${positions.length} wards in scope`, tone: meanCanopy >= 20 ? 'positive' : meanCanopy >= 12 ? 'default' : 'warn' },
          { label: t('Compensatory planting'), value: formatPercent(share(completed, required)), support: `${formatCompact(required - completed)} saplings outstanding`, tone: toneFor(share(completed, required), true) },
          { label: t('Recorded survival'), value: formatPercent(survival), support: 'Planted in the last 12 months', tone: toneFor(survival, true) },
          { label: t('Felling applications pending'), value: formatCompact(pending), support: `${encroached.length} encroachment reports on open spaces` },
        ],
        'Gardens, trees and open space across the wards in scope',
      ),
      wardBar(
        'gardens-canopy',
        'Canopy cover by ward',
        '%',
        true,
        weakest.slice(0, chartCount(ctx)).map((p) => ({ wardId: p.wardId, value: p.canopyCoverPct })),
      ),
    ],
    followUps: [
      t('What is the air quality position across the city?'),
      t('Where is infrastructure adequacy lowest against projected growth?'),
      t('What is the public toilet and amenity adequacy position?'),
    ],
  }
}

/* ==========================================================================
   Urban planning
   ========================================================================== */

const planning: AnswerHandler = (ctx) => {
  const indicators = byScopeWard(ctx, wardPlanning)
  if (indicators.length === 0) {
    return emptyAnswer(ctx, 'planning indicator', 'No development plan indicator is held for the wards in scope.')
  }

  const weakest = [...indicators].sort((a, b) => a.record.infraAdequacy - b.record.infraAdequacy)
  const meanAdequacy = mean(indicators.map((i) => i.record.infraAdequacy))
  const belowThreshold = indicators.filter((i) => i.record.infraAdequacy < 55)
  const highGrowth = indicators.filter((i) => i.record.projectedGrowthPct > 2.4)
  const dense = indicators.filter((i) => i.record.populationDensity > 45_000)
  const meanAccess = mean(indicators.map((i) => i.record.transportAccessIndex))
  const gapCounts = new Map<string, number>()
  for (const entry of indicators) for (const gap of entry.record.serviceGaps) gapCounts.set(gap, (gapCounts.get(gap) ?? 0) + 1)
  const commonGap = [...gapCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  const evidence = bestEvidence(ctx.user, {
    term: 'Ward service reliability index',
    wardIds: scopeIds(ctx),
    kinds: ['derived-metric', 'document'],
    count: 5,
  })

  return {
    requestId: requestId(ctx, 'planning'),
    answer:
      `Infrastructure adequacy across the wards in scope averages ${formatNumber(meanAdequacy)}/100, and ${belowThreshold.length} of `
      + `${indicators.length} wards sit below 55 - the threshold at which water and sewerage capacity is recorded as falling short of `
      + 'projected demand. Adequacy is modelled from recorded population density, projected growth and committed capital capacity; it is a '
      + `planning indicator and not a sanctioned Development Plan determination. ${highGrowth.length} wards carry projected growth above `
      + `2.4% and ${dense.length} exceed a density of 45,000 persons per square kilometre, which is the design assumption the networks were `
      + `laid to. ${scopeSentence(ctx)}`,
    keyFindings: [
      ...weakest.slice(0, 3).map(
        (i) =>
          `${fullWard(i.wardId)} records infrastructure adequacy of ${i.record.infraAdequacy}/100 at `
          + `${formatCompact(i.record.populationDensity)} persons per km², projected growth ${formatPercent(i.record.projectedGrowthPct, 2)}, `
          + `transport access ${i.record.transportAccessIndex}/100 and ${formatNumber(i.record.openSpacePerCapitaSqm, 2)} m² of open space per resident.`,
      ),
      commonGap
        ? t('The most frequently recorded service gap is "{0}", entered against {1} of {2} wards in scope.', commonGap[0], commonGap[1], indicators.length)
        : t('No service gap is recorded against the wards in scope.'),
      t('{0} wards carry projected growth above 2.4%, the rate at which the register notes growth outpacing committed capital capacity.', highGrowth.length),
      t('Transport access averages {0}/100, ranging from {1} to {2} across the wards in scope.', formatNumber(meanAccess), Math.min(...indicators.map((i) => i.record.transportAccessIndex)), Math.max(...indicators.map((i) => i.record.transportAccessIndex))),
      t('Land use in the weakest ward is recorded as {0}% residential, {1}% commercial, {2}% industrial and {3}% open.', weakest[0]!.record.landUseMix.residential, weakest[0]!.record.landUseMix.commercial, weakest[0]!.record.landUseMix.industrial, weakest[0]!.record.landUseMix.open),
    ],
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-planning-adequacy',
        title: t('Bring {0} into the next capital phasing review', fullWard(weakest[0]!.wardId)),
        why:
          `${fullWard(weakest[0]!.wardId)} carries the lowest recorded infrastructure adequacy in scope at ${weakest[0]!.record.infraAdequacy}/100 `
          + `against a density of ${formatCompact(weakest[0]!.record.populationDensity)} persons per km². The indicator identifies where capacity `
          + 'is short of projected demand; it does not itself sanction a scheme.',
        expectedImpact: t('Places the capital sequencing question on recorded adequacy rather than on representation.'),
        departmentId: 'dept-planning',
        humanOwnerRole: t('Chief Engineer (Development Plan)'),
        confidence: 'medium',
        dependencies: [t('Departmental capacity confirmations for water, sewerage and roads'), t('Finance phasing envelope')],
        risks: [t('Adequacy is modelled against projected growth; a revised projection moves the ordering')],
        evidenceRefs: refs(evidence, 3),
      }),
      recommend({
        id: 'rec-planning-growth',
        title: t('Re-test the growth assumptions in the wards outpacing committed capacity'),
        why:
          `${highGrowth.length} wards record projected growth above 2.4% while ${belowThreshold.length} sit below an adequacy of 55. `
          + 'A projection carried forward unexamined becomes an assumption the capital programme is built on.',
        expectedImpact: t('Confirms whether the adequacy shortfall is driven by present density or by the growth projection.'),
        departmentId: 'dept-planning',
        humanOwnerRole: t('Deputy Chief Engineer (Development Plan)'),
        confidence: 'medium',
        dependencies: [t('Latest census and building permission trend'), t('Assessment department unit growth data')],
        risks: [t('Revising a growth projection changes the adequacy ordering across every ward, not only the ward examined')],
        evidenceRefs: refs(evidence, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('Infrastructure adequacy is a modelled planning indicator combining recorded density, projected growth and committed capital capacity. It is not a sanctioned Development Plan determination and confers no reservation or permission.'),
      t('Projected growth is a projection carried on the register, not a forecast. It should be re-tested before any capital sequencing decision rests on it.'),
    ],
    sources: sourcesOf(evidence, 'Development Plan indicators and ward demographic register'),
    domains: ['planning'],
    supportingTable: {
      caption: t('Development plan indicators by ward, lowest infrastructure adequacy first'),
      columns: [t('Ward'), t('Density (per km²)'), t('Projected growth'), t('Infrastructure adequacy'), t('Transport access'), t('Open space per capita'), t('Land use R/C/I/O'), t('Recorded gaps')],
      rows: weakest.slice(0, ctx.limit).map((i) => [
        fullWard(i.wardId),
        formatCompact(i.record.populationDensity),
        formatPercent(i.record.projectedGrowthPct, 2),
        `${i.record.infraAdequacy}/100`,
        `${i.record.transportAccessIndex}/100`,
        t('{0} m²', formatNumber(i.record.openSpacePerCapitaSqm, 2)),
        `${i.record.landUseMix.residential}/${i.record.landUseMix.commercial}/${i.record.landUseMix.industrial}/${i.record.landUseMix.open}`,
        String(i.record.serviceGaps.length),
      ]),
    },
    visuals: [
      metricsVisual(
        'planning-headline',
        [
          { label: t('Mean infrastructure adequacy'), value: `${formatNumber(meanAdequacy)}/100`, support: `${indicators.length} wards in scope`, tone: toneFor(meanAdequacy, true) },
          { label: t('Wards below adequacy 55'), value: `${belowThreshold.length} of ${indicators.length}`, support: 'Capacity short of projected demand', tone: belowThreshold.length > 0 ? 'warn' : 'positive' },
          { label: t('Growth above 2.4%'), value: String(highGrowth.length), support: 'Outpacing committed capital capacity' },
          { label: t('Density above 45,000/km²'), value: String(dense.length), support: 'Beyond the network design assumption' },
        ],
        'Urban planning position across the wards in scope',
      ),
      wardBar(
        'planning-adequacy',
        'Infrastructure adequacy by ward',
        '/100',
        true,
        weakest.slice(0, chartCount(ctx)).map((i) => ({ wardId: i.wardId, value: i.record.infraAdequacy })),
      ),
    ],
    followUps: [
      t('What is the tree canopy and open space position?'),
      t('Which capital projects are showing schedule risk or delay?'),
      t('What is the current water supply position?'),
    ],
  }
}

/* ==========================================================================
   Building safety and permissions
   ========================================================================== */

const buildings: AnswerHandler = (ctx) => {
  const records = BUILDING_RECORDS.filter((b) => inScope(ctx, b.wardId) && matchesSeverity(ctx, b.severity))
  if (records.length === 0) {
    return emptyAnswer(ctx, 'building', emptyDetail(ctx, 'building register'))
  }

  const proposals = BUILDING_PROPOSALS.filter((p) => inScope(ctx, p.wardId))
  const overdue = records.filter((b) => b.structuralAudit === 'overdue')
  const due = records.filter((b) => b.structuralAudit === 'due')
  const completed = records.filter((b) => b.structuralAudit === 'completed')
  const notDue = records.filter((b) => b.structuralAudit === 'not-due')
  const c1 = records.filter((b) => b.dilapidationCategory === 'C1')
  const c2a = records.filter((b) => b.dilapidationCategory === 'C2A')
  const alleged = records.filter((b) => b.permissionStatus === 'unauthorised-alleged')
  const noticed = records.filter((b) => b.permissionStatus === 'notice-issued')
  const breached = proposals.filter((p) => p.slaBreached)
  const occupancyAtRisk = sum([...c1, ...c2a].map((b) => b.occupancyUnits))
  const ordered = [...records].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.yearBuilt - b.yearBuilt,
  )
  const evidence = bestEvidence(ctx.user, {
    term: 'Field inspection observation',
    wardIds: scopeIds(ctx),
    kinds: ['inspection', 'document'],
    count: 5,
  })

  return {
    requestId: requestId(ctx, 'buildings'),
    answer:
      `${formatCompact(records.length)} buildings on the register fall within scope. ${overdue.length} carry an overdue structural audit and `
      + `${due.length} an audit now due; of the ${completed.length} audits completed, ${c1.length} returned category C1 and ${c2a.length} `
      + `C2A, together covering ${formatCompact(occupancyAtRisk)} occupancy units. A dilapidation category exists only where an audit has been `
      + 'completed, so a building whose audit is due or overdue carries none - and that absence is not evidence of soundness. '
      + `${noticed.length} entries stand at notice issued and ${alleged.length} are recorded as unauthorised-alleged, which is an allegation `
      + `entered on the register awaiting determination and never a finding. ${breached.length} of ${proposals.length} building proposals in `
      + `scope have passed their scrutiny SLA of 30, 45 or 60 days. ${scopeSentence(ctx)}`,
    keyFindings: [
      ...ordered.slice(0, 3).map(
        (b) =>
          `${b.reference} - ${b.name}, built ${b.yearBuilt}, ${b.floors} floors, ${b.occupancyUnits} occupancy units; structural audit `
          + `${readable(b.structuralAudit)}${b.dilapidationCategory ? t(', category {0}', b.dilapidationCategory) : ''}, permission status `
          + `${readable(b.permissionStatus)}, last inspected ${formatRelative(b.lastInspectedAt)}.`,
      ),
      t('{0} of {1} buildings in scope carry an overdue structural audit, and {2} more are now due.', overdue.length, records.length, due.length),
      c1.length > 0
        ? t('{0} buildings returned category C1 on a completed audit, covering {1} occupancy units - the category that determines the evacuation sequence.', c1.length, formatCompact(sum(c1.map((b) => b.occupancyUnits))))
        : t('No building in scope returned category C1 on a completed structural audit.'),
      t('{0} entries are recorded as unauthorised-alleged and {1} at notice issued. Both are register states awaiting determination.', alleged.length, noticed.length),
      breached.length > 0
        ? t('{0} building proposals have passed their scrutiny SLA, at a mean age of {1} days against SLAs of 30, 45 or 60 days.', breached.length, formatNumber(mean(breached.map((p) => p.ageDays)), 1))
        : t('All {0} building proposals in scope remain within their scrutiny SLA of 30, 45 or 60 days.', proposals.length),
    ],
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-buildings-audit',
        title: t('Clear the overdue structural audit backlog, C1-adjacent stock first'),
        why:
          `${overdue.length} buildings carry an overdue structural audit and ${due.length} are now due. Until an audit is completed no `
          + 'dilapidation category exists, so the stock cannot be sequenced for repair, evacuation or reconstruction.',
        expectedImpact: t('Converts an unknown position on ageing stock into a categorised one that can be acted on.'),
        departmentId: 'dept-building',
        humanOwnerRole: t('Executive Engineer (Building Proposals)'),
        confidence: 'high',
        dependencies: [t('Empanelled structural auditor availability'), t('Occupier access consent for the survey')],
        risks: [t('An audit programme without a rehousing pathway records the position on occupied stock without resolving it')],
        evidenceRefs: refs(evidence, 3),
      }),
      recommend({
        id: 'rec-buildings-proposals',
        title: t('Review the building proposals standing beyond their scrutiny SLA'),
        why:
          `${breached.length} of ${proposals.length} proposals in scope have passed their scrutiny SLA, the oldest standing at `
          + `${Math.max(0, ...proposals.map((p) => p.ageDays))} days. Delay in scrutiny is a service failure irrespective of the merits of the proposal.`,
        expectedImpact: t('Restores the scrutiny timeline published in the citizens’ charter for development permissions.'),
        departmentId: 'dept-building',
        humanOwnerRole: t('Deputy Chief Engineer (Development Plan)'),
        confidence: 'medium',
        dependencies: [t('Scrutiny establishment strength'), t('Query resolution from the applicants')],
        risks: [t('Clearing a scrutiny backlog by age alone displaces proposals raising genuine development control questions')],
        evidenceRefs: refs(evidence, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('A permission status of "unauthorised-alleged" records an allegation entered on the register and awaiting determination. It is not a finding, and no conclusion about any premises, occupier or officer may be drawn from it.'),
      t('A dilapidation category is the outcome of a completed structural audit. A building whose audit is due or overdue carries no category, and that absence is not evidence that the structure is sound.'),
    ],
    sources: sourcesOf(evidence, 'Building register, structural audit record and development permission workflow'),
    domains: ['buildings'],
    supportingTable: {
      caption: t('Building register in scope, highest recorded severity and oldest stock first'),
      columns: [t('Reference'), t('Ward'), t('Type'), t('Year built'), t('Structural audit'), t('Dilapidation'), t('Permission status'), t('Occupancy units')],
      rows: ordered.slice(0, ctx.limit).map((b) => [
        b.reference,
        fullWard(b.wardId),
        readable(b.type),
        String(b.yearBuilt),
        readable(b.structuralAudit),
        b.dilapidationCategory ?? t('No completed audit'),
        readable(b.permissionStatus),
        formatNumber(b.occupancyUnits),
      ]),
    },
    visuals: [
      metricsVisual(
        'buildings-headline',
        [
          { label: t('Structural audits overdue'), value: String(overdue.length), support: `${due.length} further audits now due`, tone: overdue.length > 0 ? 'critical' : 'positive' },
          { label: t('Category C1 on completed audit'), value: String(c1.length), support: `${formatCompact(occupancyAtRisk)} units across C1 and C2A`, tone: c1.length > 0 ? 'critical' : 'positive' },
          { label: t('Unauthorised-alleged entries'), value: String(alleged.length), support: 'Allegation on the register, not a finding' },
          { label: t('Proposals past SLA'), value: `${breached.length} of ${proposals.length}`, support: `${formatPercent(share(breached.length, proposals.length))} of proposals in scope`, tone: toneFor(share(breached.length, proposals.length), false) },
        ],
        'Building safety and development permission position in scope',
      ),
      compositionVisual({
        id: 'buildings-audit-mix',
        caption: t('Building register by structural audit position'),
        segments: [
          { id: 'completed', label: t('Audit completed'), value: completed.length, colour: VISUAL_COLOUR.ok },
          { id: 'not-due', label: t('Audit not due'), value: notDue.length, colour: VISUAL_COLOUR.muted },
          { id: 'due', label: t('Audit due'), value: due.length, colour: VISUAL_COLOUR.warn },
          { id: 'overdue', label: t('Audit overdue'), value: overdue.length, colour: VISUAL_COLOUR.crit },
        ].filter((segment) => segment.value > 0),
      }),
    ],
    followUps: [
      t('Which municipal assets are in the worst condition?'),
      t('Where is infrastructure adequacy lowest against projected growth?'),
      t('What is the settlement service adequacy position?'),
    ],
  }
}

/* ==========================================================================
   Registry
   ========================================================================== */

export const physicalHandlers: Partial<Record<QueryIntentId, AnswerHandler>> = {
  waste,
  roads,
  traffic,
  'street-lighting': streetLighting,
  assets,
  'air-quality': airQuality,
  gardens,
  planning,
  buildings,
}
