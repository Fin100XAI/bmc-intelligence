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
import {
  BUDGET_LINES,
  CONTRACTORS,
  CONTRACTS,
  PROCUREMENT_RISK_WEIGHTS,
  PROJECTS,
  PROJECT_RISK_WEIGHTS,
  PROPERTY_SEGMENTS,
  REVENUE_ANOMALIES,
  REVENUE_RECORDS,
  budgetTotals,
  contractorName,
  contractsAtRisk,
  projectsAtRisk,
  revenueTotals,
  wardBudgetPosition,
  wardProjects,
  wardRevenue,
} from '@/data/finance.data'
import {
  CONTRACTOR_PERFORMANCE_WEIGHTS,
  buildAllContractorProfiles,
  contractorPerformanceBands,
} from '@/domains/contractors/performance'
import type { PerformanceBand } from '@/domains/contractors/performance'
import { departmentName } from '@/data/reference'
import { municipality } from '@/config/municipality.config'
import {
  BUDGET_HEAD_LABEL,
  PROJECT_CATEGORY_LABEL,
  PROJECT_STATUS_LABEL,
  REVENUE_STREAM_LABEL,
  TENDER_STAGE_LABEL,
} from '@/types/finance'
import type { PropertySegment, RevenueRecord } from '@/types/finance'
import {
  formatCompact,
  formatCrore,
  formatDelta,
  formatNumber,
  formatPercent,
  formatRelative,
} from '@/utils/format'
import { hashSeed } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/ai/answers/finance.ts
 *
 * The money routes: budget utilisation, receipts, property assessment, capital
 * works, contracts and supplier delivery standing.
 *
 * This file carries the highest language risk in the Copilot, and the discipline
 * is deliberate rather than decorative. A revenue anomaly is a statistical
 * divergence from a comparable cohort - it asserts nothing about error,
 * irregularity or the conduct of any person or entity. A project risk score
 * indicates delivery risk requiring management attention; it is not a finding
 * against the executing agency and makes no assertion about how any contract was
 * awarded or performed. A contractor performance index measures recorded
 * delivery outcomes and never characterises a supplier's conduct or integrity.
 * Indicative values are modelled magnitudes for prioritisation, never adjudicated
 * amounts. Every route below is written so that the platform cannot produce a
 * finding of wrongdoing, because a municipal corporation that lets an analytics
 * layer imply one has already lost the argument it most needs to win.
 *
 * Retrieval is gated before composition. Where the permission engine refuses a
 * register, the route returns a denial rather than a partial figure: a
 * half-scoped budget total is worse than no budget total, because it looks
 * complete.
 */

/* ==========================================================================
   Shared method constants and small helpers
   ========================================================================== */

/**
 * The share of the financial year elapsed at the demonstration anchor.
 *
 * Every utilisation and collection figure in this file is read against this
 * proportion rather than against the full-year allocation or target. Reading a
 * 31%-of-year position against a 100% denominator is the single most common way
 * a finance dashboard manufactures a crisis that does not exist.
 */
const YEAR_ELAPSED = 0.31

function build$SEGMENT_LABEL(): Record<PropertySegment['segment'], string> {
  return {
  residential: t('Residential'),
  commercial: t('Commercial'),
  industrial: t('Industrial'),
  institutional: t('Institutional'),
  mixed: t('Mixed use'),
}
}
let SEGMENT_LABEL: Record<PropertySegment['segment'], string> = build$SEGMENT_LABEL()
registerLayer(() => {
  SEGMENT_LABEL = build$SEGMENT_LABEL()
})

const BAND_COLOUR: Record<PerformanceBand['tone'], string> = {
  critical: VISUAL_COLOUR.crit,
  risk: VISUAL_COLOUR.warn,
  warn: VISUAL_COLOUR.govtSoft,
  info: VISUAL_COLOUR.intel,
  positive: VISUAL_COLOUR.ok,
}

function sum<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

function pct(numerator: number, denominator: number): number {
  return safeDiv(numerator, denominator) * 100
}

/**
 * A stable, scope-dependent request identifier.
 *
 * Hashed rather than concatenated because a twenty-five ward scope would
 * otherwise produce an identifier no audit log could read. Deterministic: the
 * same principal asking the same question of the same scope always produces the
 * same identifier.
 */
function scopeToken(ctx: AnswerContext): string {
  return hashSeed(
    [
      ctx.user.id,
      ctx.scopeWards.map((w) => w.id).join('+'),
      ctx.understanding.entities.departments.map((d) => d.id).join('+'),
      String(ctx.limit),
    ].join('|'),
  ).toString(36)
}

/** Department identifiers the question named, or null where it named none. */
function namedDepartments(ctx: AnswerContext): Set<string> | null {
  const ids = ctx.understanding.entities.departments.map((d) => d.id)
  return ids.length > 0 ? new Set(ids) : null
}

/** A clause naming the departmental filter, where the question applied one. */
function departmentSentence(ctx: AnswerContext): string {
  const named = ctx.understanding.entities.departments
  if (named.length === 0) return ''
  return t(' Filtered to {0} because the question named {1}.', named.map((d) => d.name).join(', '), named.length === 1 ? t('that department') : t('those departments'))
}

/** The number of rows the operator asked for, floored at one. */
function take(ctx: AnswerContext): number {
  return Math.max(1, ctx.limit)
}

/**
 * A count with its noun agreed.
 *
 * Pedantic, and worth it: "1 contracts worth ₹145 Cr" is the kind of seam that
 * tells a reader the paragraph was assembled rather than written, and a reader
 * who stops trusting the prose stops trusting the figure inside it.
 */
function countOf(value: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`
}

/** Unsigned percentage-point magnitude, for prose that states direction in words. */
function points(value: number): string {
  return t('{0} percentage points', formatNumber(Math.abs(value), 1))
}

/** Row label for a receipts record: the ward where it has one, else the head. */
function revenueLabel(record: RevenueRecord): string {
  return record.wardId ? fullWard(record.wardId) : REVENUE_STREAM_LABEL[record.stream]
}

function elapsedSentence(): string {
  return t('Approximately {0} of {1} has elapsed at the reference date', formatPercent(YEAR_ELAPSED * 100), municipality.financialYear)
}

function projectRiskMethod(): string {
  const w = PROJECT_RISK_WEIGHTS
  return (
    'Scores are produced by the published Project Risk Engine, which weights schedule variance '
    + `(${w.scheduleVariance.toFixed(2)}), cost variance (${w.costVariance.toFixed(2)}), milestone slippage `
    + `(${w.milestoneSlippage.toFixed(2)}), payment/progress mismatch (${w.paymentProgressMismatch.toFixed(2)}), `
    + `executing-agency delivery history (${w.contractorHistory.toFixed(2)}), unresolved inspection observations `
    + `(${w.inspectionObservations.toFixed(2)}) and linked citizen complaints (${w.citizenComplaints.toFixed(2)}).`
  )
}

function procurementMethod(): string {
  const w = PROCUREMENT_RISK_WEIGHTS
  return (
    'Indicator scores are produced by the published procurement indicator set, weighting repeated time extensions '
    + `(${w.extensions.toFixed(2)}), contract variation magnitude (${w.variation.toFixed(2)}), milestone delivery delay `
    + `(${w.deliveryDelay.toFixed(2)}), supplier performance deterioration (${w.performance.toFixed(2)}) and category `
    + `concentration (${w.concentration.toFixed(2)}).`
  )
}

function contractorMethod(): string {
  const w = CONTRACTOR_PERFORMANCE_WEIGHTS
  return (
    'The index is recomputed by the published Contractor Performance Engine from on-time delivery '
    + `(${w.onTimeDelivery.toFixed(2)}), milestone achievement (${w.milestoneAchievement.toFixed(2)}), cost discipline `
    + `(${w.costDiscipline.toFixed(2)}), inspection compliance (${w.inspectionCompliance.toFixed(2)}) and complaint `
    + `correlation (${w.complaintCorrelation.toFixed(2)}), over the contracts and works readable within your scope.`
  )
}

/* ==========================================================================
   Budget utilisation and variance
   ========================================================================== */

const budgetVarianceHandler: AnswerHandler = (ctx): ComposedAnswer => {
  const gate = canAccess(ctx.user, 'budget', 'view')
  if (!gate.allowed) {
    return deniedAnswer(
      ctx,
      'municipal budget utilisation and variance against the phased plan',
      `The budget position is outside your authorised scope. ${gate.reason}`,
    )
  }

  const named = namedDepartments(ctx)
  const lines = BUDGET_LINES.filter(
    (line) =>
      (named === null || named.has(line.departmentId))
      && canAccess(ctx.user, 'budget', 'view', { departmentId: line.departmentId }).allowed,
  )

  if (lines.length === 0) {
    return emptyAnswer(ctx, 'budget line', `${scopeSentence(ctx)}${departmentSentence(ctx)}`)
  }

  const approved = sum(lines, (l) => l.approvedCrore)
  const revised = sum(lines, (l) => l.revisedCrore)
  const actual = sum(lines, (l) => l.actualCrore)
  const committed = sum(lines, (l) => l.committedCrore)
  const forecast = sum(lines, (l) => l.forecastYearEndCrore)
  const phased = revised * YEAR_ELAPSED
  const utilisationPct = pct(actual, revised)
  const variancePct = pct(phased - actual, phased)
  const corporation = budgetTotals()

  const ranked = [...lines].sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct))
  const shown = ranked.slice(0, take(ctx))
  const trailing = lines.filter((l) => l.variancePct > 25)
  const running = lines.filter((l) => l.variancePct < -25)

  const byDepartment = new Map<string, { revised: number; actual: number; committed: number }>()
  for (const line of lines) {
    const entry = byDepartment.get(line.departmentId) ?? { revised: 0, actual: 0, committed: 0 }
    entry.revised += line.revisedCrore
    entry.actual += line.actualCrore
    entry.committed += line.committedCrore
    byDepartment.set(line.departmentId, entry)
  }
  const departmentPositions = [...byDepartment.entries()]
    .map(([id, value]) => {
      const target = value.revised * YEAR_ELAPSED
      return {
        id,
        revised: value.revised,
        actual: value.actual,
        committed: value.committed,
        utilisationPct: pct(value.actual, value.revised),
        variancePct: pct(target - value.actual, target),
      }
    })
    .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct))

  const evidence = bestEvidence(ctx.user, {
    term: 'budget',
    wardIds: ctx.scopeWards.map((w) => w.id),
    kinds: ['financial-record'],
    count: 5,
  })

  const findings: string[] = [
    `${formatCrore(actual, 0)} booked against a revised allocation of ${formatCrore(revised, 0)} across `
    + `${countOf(lines.length, 'budget line')} - utilisation of ${formatPercent(utilisationPct)} where the phased `
    + `plan expects ${formatCrore(phased, 0)}, leaving the position ${points(variancePct)} `
    + `${variancePct > 0 ? 'behind' : t('ahead of')} that plan.`,
    `${countOf(trailing.length, 'line')} trail the phased plan by more than 25 percentage points and `
    + `${formatNumber(running.length)} run ahead of it by the same margin; the remaining `
    + `${formatNumber(lines.length - trailing.length - running.length)} sit within the departmental tolerance band.`,
    `${formatCrore(committed, 0)} is committed but unspent - ${formatPercent(pct(committed, revised))} of the revised `
    + `allocation - and the aggregate year-end forecast of ${formatCrore(forecast, 0)} sits `
    + `${formatDelta(pct(forecast - revised, revised))} against it.`,
    `Lines in scope carry ${formatPercent(pct(revised, corporation.revised))} of the corporation's `
    + `${formatCrore(corporation.revised, 0)} revised allocation, itself revised from ${formatCrore(approved, 0)} `
    + 'approved at budget adoption.',
    ...shown.slice(0, 3).map(
      (l) =>
        `${departmentName(l.departmentId)} - ${BUDGET_HEAD_LABEL[l.head]}: ${formatPercent(l.utilisationPct)} `
        + `utilisation on ${formatCrore(l.revisedCrore)} revised, variance ${formatDelta(l.variancePct, ' pp')} against `
        + `the phased plan.${l.riskNote ? ` ${l.riskNote}` : ''}`,
    ),
  ]

  if (ctx.narrowed) {
    for (const ward of ctx.scopeWards.slice(0, 2)) {
      const position = wardBudgetPosition(ward.id)
      findings.push(
        `${fullWard(ward.id)} - ward-attributable capital exposure of ${formatCrore(position.allocatedCrore)} sanctioned `
        + `with ${formatCrore(position.spentCrore)} released, ${formatPercent(position.utilisationPct)} against sanction.`,
      )
    }
  }

  const overspendLed = running.length > trailing.length

  return {
    requestId: `q-budget-variance-${scopeToken(ctx)}`,
    answer:
      `Against a revised allocation of ${formatCrore(revised, 0)}, ${formatCrore(actual, 0)} has been booked and `
      + `${formatCrore(committed, 0)} is committed but unspent - utilisation of ${formatPercent(utilisationPct)}. `
      + `${elapsedSentence()}, so utilisation is read against that proportion and not against the full-year allocation: `
      + `the phased plan expects ${formatCrore(phased, 0)} by now, leaving the position ${points(variancePct)} `
      + `${variancePct > 0 ? 'behind' : t('ahead of')} plan. `
      + `${scopeSentence(ctx)}${departmentSentence(ctx)} `
      + 'Variance describes the position against the phased plan; it does not indicate whether the plan itself was '
      + 'realistic, and an even monthly phasing is an accounting convention rather than a delivery forecast.',
    keyFindings: findings.slice(0, 8),
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-budget-rephase',
        title: t('Re-phase the works programme for the remainder of {0}', municipality.financialYear),
        why:
          `${formatNumber(trailing.length)} lines trail the phased plan by more than 25 percentage points, with `
          + `${formatCrore(phased - actual, 0)} of the phased expectation unbooked. Where under-spend reflects a `
          + 'delivery constraint rather than an accounting lag, the phasing itself requires correction.',
        expectedImpact:
          'Produces a defensible revised phasing, separates accounting lag from delivery constraint, and identifies the '
          + 'works that can genuinely be advanced within the remaining year.',
        departmentId: 'dept-finance',
        humanOwnerRole: t('Chief Accountant (Finance)'),
        confidence: 'high',
        dependencies: [t('Departmental works programme review'), t('Delivery capacity assessment by executing department')],
        risks: [
          t('Re-phasing may surface an implicit reduction in annual delivery, which requires acknowledgement rather than concealment'),
          t('A revised phasing that is not accompanied by a resource decision will trail the plan again next quarter'),
        ],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 3),
      }),
      recommend({
        id: 'rec-budget-commitment',
        title: overspendLed
          ? t('Verify the commitment position on lines running ahead of the phased plan')
          : t('Reconcile committed but unspent value against the departmental works register'),
        why: overspendLed
          ? `${formatNumber(running.length)} lines have booked expenditure ahead of the phased plan by more than 25 `
            + 'percentage points. Expenditure ahead of plan is not an irregularity; it does require the commitment '
            + 'position to be verified before the remaining allocation is treated as available.'
          : `${formatCrore(committed, 0)} sits committed but unspent - ${formatPercent(pct(committed, revised))} of the `
            + 'revised allocation. Commitment is a departmental record rather than a booked expenditure, so the register '
            + 'and the accounts must agree before the free balance is relied upon.',
        expectedImpact:
          'Establishes the genuine uncommitted balance available for re-allocation, and records the reconciliation '
          + 'against each departmental head.',
        departmentId: 'dept-finance',
        humanOwnerRole: t('Deputy Chief Accountant (Expenditure Control)'),
        confidence: 'medium',
        dependencies: [t('Departmental commitment register extract'), t('Treasury reconciliation for the period')],
        risks: [t('Commitment records and booked expenditure are maintained by different systems and may legitimately diverge')],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      t('Variance describes the position against the phased plan. It does not indicate whether the plan itself was realistic.'),
      `Utilisation is measured against ${formatPercent(YEAR_ELAPSED * 100)} of the year elapsed, which assumes even `
      + 'phasing. Seasonal programmes - pre-monsoon works, monsoon-restricted civil works - legitimately depart from an '
      + 'even phasing and should not be read as under-performance on that basis alone.',
      'Committed but unspent value is a departmental commitment record, not a booked expenditure. It is reported '
      + 'separately for that reason and must not be added to utilisation.',
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - budget register'),
    domains: ['budget'],
    supportingTable: {
      caption: t('Budget lines by absolute variance against the phased plan'),
      columns: [
        t('Department'),
        t('Head'),
        t('Revised'),
        t('Committed'),
        t('Booked'),
        t('Utilisation'),
        t('Variance vs phased'),
        t('Year-end forecast'),
      ],
      rows: shown.map((l) => [
        departmentName(l.departmentId),
        BUDGET_HEAD_LABEL[l.head],
        formatCrore(l.revisedCrore),
        formatCrore(l.committedCrore),
        formatCrore(l.actualCrore),
        formatPercent(l.utilisationPct),
        formatDelta(l.variancePct, ' pp'),
        formatCrore(l.forecastYearEndCrore),
      ]),
    },
    visuals: [
      metricsVisual(
        'budget-headline',
        [
          { label: t('Revised allocation'), value: formatCrore(revised, 0), support: `${formatCrore(approved, 0)} approved` },
          {
            label: t('Booked expenditure'),
            value: formatCrore(actual, 0),
            support: `${formatCrore(phased, 0)} expected at ${formatPercent(YEAR_ELAPSED * 100)} of year`,
          },
          {
            label: t('Utilisation'),
            value: formatPercent(utilisationPct),
            support: `against ${formatPercent(YEAR_ELAPSED * 100)} of the year elapsed`,
            tone: toneFor(utilisationPct, true),
          },
          {
            label: t('Committed, unspent'),
            value: formatCrore(committed, 0),
            support: `${formatPercent(pct(committed, revised))} of revised`,
          },
          {
            label: t('Variance vs phased plan'),
            value: formatDelta(variancePct, ' pp'),
            support: variancePct > 0 ? t('behind the phased plan') : t('ahead of the phased plan'),
            tone: toneFor(Math.abs(variancePct), false),
          },
        ],
        `Budget position across ${formatNumber(lines.length)} lines in scope`,
      ),
      rankedBarVisual({
        id: 'budget-deviation-by-department',
        caption: t('Departments by absolute deviation from the phased plan (either direction)'),
        unit: 'pp',
        higherIsBetter: false,
        data: departmentPositions
          .slice(0, take(ctx))
          .map((d) => ({ label: departmentName(d.id), value: round1(Math.abs(d.variancePct)) })),
      }),
      compositionVisual({
        id: 'budget-allocation-composition',
        caption: t('Revised allocation: booked, committed but unspent, and uncommitted balance'),
        segments: [
          { id: 'booked', label: t('Booked expenditure'), value: round1(actual), colour: VISUAL_COLOUR.govt },
          { id: 'committed', label: t('Committed, unspent'), value: round1(committed), colour: VISUAL_COLOUR.warn },
          {
            id: 'balance',
            label: t('Uncommitted balance'),
            value: round1(Math.max(0, revised - actual - committed)),
            colour: VISUAL_COLOUR.muted,
          },
        ],
      }),
    ],
    followUps: [
      t('What are the current revenue risks?'),
      t('Which capital projects are showing schedule risk or delay?'),
      ctx.narrowed && ctx.scopeWards.length > 0
        ? t('What is the property tax assessment position in {0}?', fullWard(ctx.scopeWards[0]!.id))
        : t('Are there any unusual procurement patterns?'),
    ],
  }
}

/* ==========================================================================
   Revenue collection and reconciliation candidates
   ========================================================================== */

const revenueHandler: AnswerHandler = (ctx): ComposedAnswer => {
  const gate = canAccess(ctx.user, 'revenue', 'view')
  if (!gate.allowed) {
    return deniedAnswer(
      ctx,
      'municipal receipts, collection efficiency and open reconciliation candidates',
      `The revenue position is outside your authorised scope. ${gate.reason}`,
    )
  }

  const cityRecords = REVENUE_RECORDS.filter((r) => !r.wardId)
  const wardRecords = ctx.scopeWards
    .map((w) => wardRevenue(w.id))
    .filter((r): r is RevenueRecord => r !== undefined)
    .filter((r) => canAccess(ctx.user, 'revenue', 'view', { wardId: r.wardId }).allowed)

  const wardLed = ctx.narrowed && wardRecords.length > 0
  const records = wardLed ? wardRecords : cityRecords

  if (records.length === 0) {
    return emptyAnswer(ctx, 'revenue', `${scopeSentence(ctx)}${departmentSentence(ctx)}`)
  }

  const target = sum(records, (r) => r.targetCrore)
  const assessed = sum(records, (r) => r.assessedCrore)
  const collected = sum(records, (r) => r.collectedCrore)
  const arrears = sum(records, (r) => r.arrearsCrore)
  const forecast = sum(records, (r) => r.forecastCrore)
  const phased = target * YEAR_ELAPSED
  const efficiencyPct = pct(collected, assessed)
  const variancePct = pct(collected - phased, phased)
  const corporation = revenueTotals()

  const ranked = [...records].sort((a, b) => a.targetVariancePct - b.targetVariancePct)
  const shown = ranked.slice(0, take(ctx))
  const behindPhasing = records.filter((r) => r.targetVariancePct < 0)

  const anomalies = REVENUE_ANOMALIES.filter(
    (a) =>
      (a.status === 'open' || a.status === 'under-review')
      && inScope(ctx, a.wardId)
      && canAccess(ctx.user, 'revenue', 'view', { wardId: a.wardId }).allowed,
  ).sort((a, b) => b.indicativeValueCrore - a.indicativeValueCrore)
  const indicativeTotal = sum(anomalies, (a) => a.indicativeValueCrore)

  const evidence = bestEvidence(ctx.user, {
    wardIds: anomalies.map((a) => a.wardId),
    kinds: ['financial-record'],
    count: 5,
  })

  const findings: string[] = [
    `${formatCrore(collected, 0)} realised against an annual target of ${formatCrore(target, 0)} - collection `
    + `efficiency of ${formatPercent(efficiencyPct)} on ${formatCrore(assessed, 0)} assessed, with `
    + `${formatCrore(arrears, 0)} carried as arrears.`,
    `${elapsedSentence()}, so the phased expectation is ${formatCrore(phased, 0)}; realisation sits `
    + `${formatDelta(variancePct, ' pp')} against that position, and the year-end forecast stands at `
    + `${formatCrore(forecast, 0)}.`,
    `${countOf(records.length, wardLed ? t('ward property-tax position') : t('revenue head'))} are readable in scope, `
    + `of which ${formatNumber(behindPhasing.length)} sit behind their phased target and `
    + `${formatNumber(records.filter((r) => r.targetVariancePct < -18).length)} sit more than 18 percentage `
    + `points behind it. Corporation-wide realisation is ${formatCrore(corporation.collected, 0)} `
    + `against ${formatCrore(corporation.target, 0)}, an efficiency of ${formatPercent(corporation.efficiencyPct)}.`,
    ...shown.slice(0, 3).map(
      (r) =>
        `${revenueLabel(r)}: ${formatCrore(r.collectedCrore)} collected on ${formatCrore(r.targetCrore)} target, efficiency `
        + `${formatPercent(r.collectionEfficiencyPct)}, arrears ${formatCrore(r.arrearsCrore)}, variance against the `
        + `phased position ${formatDelta(r.targetVariancePct, ' pp')}.`,
    ),
  ]

  if (anomalies.length > 0) {
    findings.push(
      `${countOf(anomalies.length, 'pattern')} open for reconciliation, with a combined indicative magnitude of `
      + `${formatCrore(indicativeTotal, 2)}. These are statistical divergences requiring reconciliation, not findings.`,
    )
    for (const anomaly of anomalies.slice(0, 2)) {
      findings.push(
        `${anomaly.title} - disposition ${anomaly.disposition.replace(/-/g, ' ')}, indicative value `
        + `${formatCrore(anomaly.indicativeValueCrore, 2)}, ${anomaly.confidence} confidence, detected `
        + `${formatRelative(anomaly.detectedAt)}.`,
      )
    }
  }

  return {
    requestId: `q-revenue-${scopeToken(ctx)}`,
    answer:
      `Collection stands at ${formatCrore(collected, 0)} against an annual target of ${formatCrore(target, 0)} - a `
      + `collection efficiency of ${formatPercent(efficiencyPct)} on ${formatCrore(assessed, 0)} assessed, with `
      + `${formatCrore(arrears, 0)} carried as arrears. ${elapsedSentence()}, so realisation is read against a phased `
      + `expectation of ${formatCrore(phased, 0)} rather than the full-year target: the position is `
      + `${formatDelta(variancePct, ' pp')} ${variancePct >= 0 ? t('ahead of') : 'behind'} that phasing. `
      + `${countOf(anomalies.length, 'pattern')} are currently open for reconciliation, with a combined indicative `
      + `magnitude of ${formatCrore(indicativeTotal, 2)}. `
      + 'An anomaly is a statistical divergence from a comparable cohort: it asserts nothing about error, irregularity '
      + 'or the conduct of any person or entity, and its indicative value is a modelled magnitude for prioritisation '
      + 'rather than an adjudicated amount.',
    keyFindings: findings.slice(0, 8),
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-revenue-reconcile',
        title: t('Refer the open patterns for assessment reconciliation'),
        why:
          `${countOf(anomalies.length, 'pattern')} carrying a combined indicative magnitude of `
          + `${formatCrore(indicativeTotal, 2)} remain open or under review. Reconciliation establishes whether each `
          + 'reflects genuine property or account characteristics, or a recording issue requiring correction.',
        expectedImpact:
          'Resolves each pattern to either a recorded explanation or a correction, with the outcome written back against '
          + 'the assessment record and the divergence closed.',
        departmentId: 'dept-assessment',
        humanOwnerRole: t('Assessment Officer'),
        confidence: 'low',
        dependencies: [t('Assessment record access for the affected cohort'), t('Site verification where the record is contested')],
        risks: [
          t('Premature characterisation of an anomaly as an irregularity would be improper, and the platform is built so it cannot produce a finding of wrongdoing'),
          t('Statistical divergence has ordinary explanations in a substantial proportion of cases'),
        ],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 3),
      }),
      recommend({
        id: 'rec-revenue-arrears',
        title: t('Prioritise arrears recovery in the heads furthest behind the phased position'),
        why:
          `${formatCrore(arrears, 0)} is carried as arrears - ${formatPercent(pct(arrears, assessed))} of assessed `
          + `value - while ${countOf(behindPhasing.length, 'position')} sit behind the phased target, the weakest `
          + `${shown.length > 0 ? `${revenueLabel(shown[0]!)} at ${formatDelta(shown[0]!.targetVariancePct, ' pp')}` : t('of them materially so')}.`,
        expectedImpact:
          'Concentrates recovery effort where the shortfall against the phased position is largest, and produces a dated '
          + 'recovery expectation the year-end forecast can be re-based on.',
        departmentId: 'dept-finance',
        humanOwnerRole: t('Chief Accountant (Finance)'),
        confidence: 'medium',
        dependencies: [t('Arrears ageing extract by head and ward'), t('Assessment & Collection field capacity')],
        risks: [
          t('Arrears include amounts under appeal or otherwise stayed, which are not recoverable through routine action'),
          t('A recovery drive concentrated on one segment can displace rather than increase overall realisation'),
        ],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      'An anomaly is not fraud. An anomaly is a statistical divergence from a comparable cohort and asserts nothing '
      + 'about error, irregularity or the conduct of any person or entity. The platform is constructed so that it cannot '
      + 'produce a finding of wrongdoing, and its outputs must never be described as one.',
      'Indicative values are modelled magnitudes for prioritisation. They are not adjudicated amounts and carry no '
      + 'implication that any sum is due, recoverable or wrongly recorded.',
      `Collection is read against ${formatPercent(YEAR_ELAPSED * 100)} of the year elapsed. Receipts are strongly `
      + 'seasonal - rebate windows and demand-notice cycles concentrate realisation - so an even phasing understates '
      + 'the position in some periods and overstates it in others.',
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - receipts and assessment register'),
    domains: ['revenue', 'property'],
    supportingTable: {
      caption: wardLed
        ? t('Ward property-tax position against the phased target')
        : t('Revenue heads against the phased target'),
      columns: [
        wardLed ? t('Ward') : t('Revenue head'),
        t('Annual target'),
        t('Phased target'),
        t('Assessed'),
        t('Collected'),
        t('Efficiency'),
        t('Arrears'),
        t('Vs phased'),
      ],
      rows: shown.map((r) => [
        revenueLabel(r),
        formatCrore(r.targetCrore),
        formatCrore(r.targetCrore * YEAR_ELAPSED),
        formatCrore(r.assessedCrore),
        formatCrore(r.collectedCrore),
        formatPercent(r.collectionEfficiencyPct),
        formatCrore(r.arrearsCrore),
        formatDelta(r.targetVariancePct, ' pp'),
      ]),
    },
    visuals: [
      metricsVisual(
        'revenue-headline',
        [
          { label: t('Collected'), value: formatCrore(collected, 0), support: `${formatCrore(target, 0)} annual target` },
          {
            label: t('Phased expectation'),
            value: formatCrore(phased, 0),
            support: `at ${formatPercent(YEAR_ELAPSED * 100)} of the year elapsed`,
          },
          {
            label: t('Collection efficiency'),
            value: formatPercent(efficiencyPct),
            support: `on ${formatCrore(assessed, 0)} assessed`,
            tone: toneFor(efficiencyPct, true),
          },
          {
            label: t('Arrears'),
            value: formatCrore(arrears, 0),
            support: `${formatPercent(pct(arrears, assessed))} of assessed value`,
            tone: toneFor(pct(arrears, assessed), false),
          },
          {
            label: t('Open reconciliation candidates'),
            value: formatNumber(anomalies.length),
            support: `${formatCrore(indicativeTotal, 2)} indicative magnitude`,
          },
        ],
        wardLed ? t('Ward property-tax position') : t('Corporation receipts position'),
      ),
      rankedBarVisual({
        id: 'revenue-efficiency',
        caption: wardLed ? t('Collection efficiency by ward') : t('Collection efficiency by revenue head'),
        unit: '%',
        higherIsBetter: true,
        data: [...records]
          .sort((a, b) => a.collectionEfficiencyPct - b.collectionEfficiencyPct)
          .slice(0, take(ctx))
          .map((r) => ({
            label: r.wardId ? shortWard(r.wardId) : REVENUE_STREAM_LABEL[r.stream],
            value: round1(r.collectionEfficiencyPct),
          })),
      }),
      compositionVisual({
        id: 'revenue-composition',
        caption: t('Assessed demand: realised, carried as arrears, and outstanding balance'),
        segments: [
          { id: 'collected', label: t('Realised'), value: round1(collected), colour: VISUAL_COLOUR.ok },
          { id: 'arrears', label: t('Arrears'), value: round1(arrears), colour: VISUAL_COLOUR.warn },
          {
            id: 'outstanding',
            label: t('Outstanding balance'),
            value: round1(Math.max(0, assessed - collected - arrears)),
            colour: VISUAL_COLOUR.muted,
          },
        ],
      }),
    ],
    followUps: [
      t('What is the property tax assessment and collection position?'),
      t('Show me department budget variance against the phased plan.'),
      anomalies.length > 0
        ? t('What is the property tax assessment position in {0}?', fullWard(anomalies[0]!.wardId))
        : t('Which capital projects are showing schedule risk or delay?'),
    ],
  }
}

/* ==========================================================================
   Property assessment and tax
   ========================================================================== */

const propertyTaxHandler: AnswerHandler = (ctx): ComposedAnswer => {
  const gate = canAccess(ctx.user, 'revenue', 'view')
  if (!gate.allowed) {
    return deniedAnswer(
      ctx,
      'property assessment, capital-value segments and tax realisation',
      `The property assessment and collection position is outside your authorised scope. ${gate.reason}`,
    )
  }

  const segments = PROPERTY_SEGMENTS.filter(
    (s) => inScope(ctx, s.wardId) && canAccess(ctx.user, 'revenue', 'view', { wardId: s.wardId }).allowed,
  )

  if (segments.length === 0) {
    return emptyAnswer(ctx, 'property assessment', `${scopeSentence(ctx)}`)
  }

  const units = sum(segments, (s) => s.assessedUnits)
  const assessed = sum(segments, (s) => s.assessedValueCrore)
  const collected = sum(segments, (s) => s.collectedCrore)
  const arrears = sum(segments, (s) => s.arrearsCrore)
  const reassessmentDue = sum(segments, (s) => s.reassessmentDue)
  const efficiencyPct = pct(collected, assessed)
  const phased = assessed * YEAR_ELAPSED

  const bySegment = new Map<PropertySegment['segment'], { units: number; assessed: number; collected: number; arrears: number; due: number }>()
  for (const s of segments) {
    const entry = bySegment.get(s.segment) ?? { units: 0, assessed: 0, collected: 0, arrears: 0, due: 0 }
    entry.units += s.assessedUnits
    entry.assessed += s.assessedValueCrore
    entry.collected += s.collectedCrore
    entry.arrears += s.arrearsCrore
    entry.due += s.reassessmentDue
    bySegment.set(s.segment, entry)
  }
  const segmentPositions = [...bySegment.entries()]
    .map(([segment, value]) => ({
      segment,
      units: value.units,
      assessed: value.assessed,
      collected: value.collected,
      arrears: value.arrears,
      due: value.due,
      efficiencyPct: pct(value.collected, value.assessed),
    }))
    .sort((a, b) => b.assessed - a.assessed)

  const wardPositions = ctx.scopeWards
    .map((ward) => {
      const own = segments.filter((s) => s.wardId === ward.id)
      const record = wardRevenue(ward.id)
      return {
        ward,
        units: sum(own, (s) => s.assessedUnits),
        assessed: sum(own, (s) => s.assessedValueCrore),
        collected: sum(own, (s) => s.collectedCrore),
        arrears: sum(own, (s) => s.arrearsCrore),
        due: sum(own, (s) => s.reassessmentDue),
        efficiencyPct: pct(sum(own, (s) => s.collectedCrore), sum(own, (s) => s.assessedValueCrore)),
        targetVariancePct: record?.targetVariancePct ?? 0,
      }
    })
    .filter((row) => row.units > 0)
    .sort((a, b) => a.efficiencyPct - b.efficiencyPct)

  const evidence = bestEvidence(ctx.user, {
    term: 'assessment',
    wardIds: ctx.scopeWards.map((w) => w.id),
    kinds: ['financial-record'],
    count: 5,
  })

  const weakest = wardPositions.slice(0, take(ctx))

  const findings: string[] = [
    `${formatCompact(units)} assessed units carry ${formatCrore(assessed, 0)} of assessed demand, of which `
    + `${formatCrore(collected, 0)} has been realised - a collection efficiency of ${formatPercent(efficiencyPct)} - `
    + `with ${formatCrore(arrears, 0)} carried as arrears.`,
    `${elapsedSentence()}, so realisation is read against a phased expectation of ${formatCrore(phased, 0)}; the `
    + `position is ${formatDelta(pct(collected - phased, phased), ' pp')} against that phasing.`,
    `${countOf(reassessmentDue, 'unit')} across ${countOf(wardPositions.length, 'ward')} carry a reassessment `
    + `falling due - ${formatPercent(pct(reassessmentDue, units))} of the assessed base in scope.`,
    ...segmentPositions.slice(0, 3).map(
      (s) =>
        `${SEGMENT_LABEL[s.segment]}: ${formatCompact(s.units)} units, ${formatCrore(s.assessed)} assessed, `
        + `${formatPercent(s.efficiencyPct)} realised, arrears ${formatCrore(s.arrears)}, `
        + `${formatNumber(s.due)} reassessments due.`,
    ),
    ...weakest.slice(0, 2).map(
      (w) =>
        `${fullWard(w.ward.id)}: ${formatPercent(w.efficiencyPct)} realisation on ${formatCrore(w.assessed)} assessed, `
        + `arrears ${formatCrore(w.arrears)}, ward target variance ${formatDelta(w.targetVariancePct, ' pp')}.`,
    ),
  ]

  return {
    requestId: `q-property-tax-${scopeToken(ctx)}`,
    answer:
      `${formatCompact(units)} assessed units carry ${formatCrore(assessed, 0)} of assessed demand within scope, of `
      + `which ${formatCrore(collected, 0)} has been realised - a collection efficiency of `
      + `${formatPercent(efficiencyPct)} - against ${formatCrore(arrears, 0)} carried as arrears. `
      + `${elapsedSentence()}, so realisation is read against a phased expectation of ${formatCrore(phased, 0)} rather `
      + 'than the full assessed demand. The position is computed from the capital-value assessment register segmented by '
      + `use class, with ${formatNumber(reassessmentDue)} units carrying a reassessment falling due. `
      + `${scopeSentence(ctx)} `
      + 'A low realisation rate in a segment describes the recorded collection position only. It is not evidence of '
      + 'avoidance by any assessee, and any divergence identified here is a reconciliation candidate rather than a finding.',
    keyFindings: findings.slice(0, 8),
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-property-reassessment',
        title: t('Programme the outstanding reassessments in the weakest-realising wards first'),
        why:
          `${formatNumber(reassessmentDue)} units carry a reassessment falling due, and realisation is weakest in `
          + `${weakest.length > 0 ? fullWard(weakest[0]!.ward.id) : t('the wards in scope')} at `
          + `${weakest.length > 0 ? formatPercent(weakest[0]!.efficiencyPct) : formatPercent(efficiencyPct)}. `
          + 'Reassessment corrects the recorded capital value; it does not by itself increase realisation.',
        expectedImpact:
          'Brings the assessment register into line with recorded property characteristics and establishes a defensible '
          + 'demand base before recovery action is taken on it.',
        departmentId: 'dept-assessment',
        humanOwnerRole: t('Deputy Assessor & Collector'),
        confidence: 'medium',
        dependencies: [t('Field assessment cadre availability'), t('Survey record and building permission cross-reference')],
        risks: [
          t('Reassessment may revise a capital value downwards as readily as upwards; it is a correction exercise, not a revenue measure'),
          t('Assessee appeal rights apply to every revision and must be honoured before any demand is enforced'),
        ],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 3),
      }),
      recommend({
        id: 'rec-property-arrears',
        title: t('Age the arrears book by segment before any recovery drive is authorised'),
        why:
          `${formatCrore(arrears, 0)} is carried as arrears - ${formatPercent(pct(arrears, assessed))} of assessed `
          + `demand - concentrated in ${segmentPositions.length > 0 ? SEGMENT_LABEL[segmentPositions[0]!.segment].toLowerCase() : t('the largest')} `
          + 'holdings. An undifferentiated recovery drive treats disputed, stayed and simply unpaid demand identically.',
        expectedImpact:
          'Separates recoverable arrears from amounts under appeal or otherwise stayed, so that recovery effort is '
          + 'prioritised where it can actually realise.',
        departmentId: 'dept-finance',
        humanOwnerRole: t('Chief Accountant (Finance)'),
        confidence: 'medium',
        dependencies: [t('Arrears ageing extract'), t('Appeal and stay register reconciliation')],
        risks: [t('Ageing data quality varies across legacy assessment records and may require manual verification')],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      'Assessed value is a capital-value determination recorded by the assessment department. It is not a market '
      + 'valuation and carries no implication about the price any property would fetch.',
      'A divergence between a segment and its comparable cohort is a reconciliation candidate. It asserts nothing about '
      + 'error, irregularity or the conduct of any assessee, and the platform cannot produce a finding of wrongdoing.',
      `Realisation is read against ${formatPercent(YEAR_ELAPSED * 100)} of the year elapsed. Property tax receipts `
      + 'concentrate around rebate windows and demand-notice cycles, so an even phasing is an approximation.',
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - property assessment register'),
    domains: ['property', 'revenue'],
    supportingTable: {
      caption: t('Property assessment and realisation by ward, weakest realisation first'),
      columns: [t('Ward'), t('Assessed units'), t('Assessed demand'), t('Realised'), t('Efficiency'), t('Arrears'), t('Reassessments due')],
      rows: weakest.map((w) => [
        fullWard(w.ward.id),
        formatNumber(w.units),
        formatCrore(w.assessed),
        formatCrore(w.collected),
        formatPercent(w.efficiencyPct),
        formatCrore(w.arrears),
        formatNumber(w.due),
      ]),
    },
    visuals: [
      metricsVisual(
        'property-headline',
        [
          { label: t('Assessed units'), value: formatCompact(units), support: countOf(segments.length, 'ward segment') },
          { label: t('Assessed demand'), value: formatCrore(assessed, 0), support: `${formatCrore(phased, 0)} phased expectation` },
          {
            label: t('Realisation'),
            value: formatPercent(efficiencyPct),
            support: `${formatCrore(collected, 0)} realised`,
            tone: toneFor(efficiencyPct, true),
          },
          {
            label: t('Arrears'),
            value: formatCrore(arrears, 0),
            support: `${formatPercent(pct(arrears, assessed))} of assessed demand`,
            tone: toneFor(pct(arrears, assessed), false),
          },
          {
            label: t('Reassessments due'),
            value: formatNumber(reassessmentDue),
            support: `${formatPercent(pct(reassessmentDue, units))} of the assessed base`,
          },
        ],
        'Property assessment and collection position',
      ),
      rankedBarVisual({
        id: 'property-efficiency-by-segment',
        caption: t('Collection efficiency by use class'),
        unit: '%',
        higherIsBetter: true,
        data: segmentPositions.map((s) => ({ label: SEGMENT_LABEL[s.segment], value: round1(s.efficiencyPct) })),
      }),
      compositionVisual({
        id: 'property-demand-composition',
        caption: t('Assessed demand: realised, carried as arrears, and outstanding balance'),
        segments: [
          { id: 'collected', label: t('Realised'), value: round1(collected), colour: VISUAL_COLOUR.ok },
          { id: 'arrears', label: t('Arrears'), value: round1(arrears), colour: VISUAL_COLOUR.warn },
          {
            id: 'balance',
            label: t('Outstanding balance'),
            value: round1(Math.max(0, assessed - collected - arrears)),
            colour: VISUAL_COLOUR.muted,
          },
        ],
      }),
    ],
    followUps: [
      t('What are the current revenue risks?'),
      t('Show me department budget variance against the phased plan.'),
      weakest.length > 0
        ? t('What is the property tax assessment position in {0}?', fullWard(weakest[0]!.ward.id))
        : t('What is the property tax assessment and collection position?'),
    ],
  }
}

/* ==========================================================================
   Capital works delivery
   ========================================================================== */

const projectsHandler: AnswerHandler = (ctx): ComposedAnswer => {
  const gate = canAccess(ctx.user, 'project', 'view')
  if (!gate.allowed) {
    return deniedAnswer(
      ctx,
      'the capital works programme and its delivery risk position',
      `The capital works register is outside your authorised scope. ${gate.reason}`,
    )
  }

  const named = namedDepartments(ctx)
  const readable = PROJECTS.filter(
    (p) =>
      anyInScope(ctx, p.wardIds)
      && (named === null || named.has(p.departmentId))
      && canAccess(ctx.user, 'project', 'view', {
        wardIds: p.wardIds,
        departmentId: p.departmentId,
        classification: p.classification,
      }).allowed,
  )

  if (readable.length === 0) {
    return emptyAnswer(ctx, 'capital work', `${scopeSentence(ctx)}${departmentSentence(ctx)}`)
  }

  const readableIds = new Set(readable.map((p) => p.id))
  const live = readable.filter((p) => p.status !== 'completed' && p.status !== 'closed')
  const atRiskIds = new Set(projectsAtRisk().map((p) => p.id))
  const atRisk = live.filter((p) => atRiskIds.has(p.id)).sort((a, b) => b.riskScore - a.riskScore)
  const ordered = atRisk.length > 0 ? atRisk : [...live].sort((a, b) => b.riskScore - a.riskScore)
  const shown = ordered.slice(0, take(ctx))

  const sanctioned = sum(readable, (p) => p.sanctionedCostCrore)
  const current = sum(readable, (p) => p.currentCostCrore)
  const paid = sum(readable, (p) => p.paidCrore)
  const riskExposure = sum(atRisk, (p) => p.sanctionedCostCrore)
  const meanRisk = safeDiv(sum(live, (p) => p.riskScore), live.length)
  const meanCompletion = safeDiv(sum(live, (p) => p.completionPct), live.length)
  const meanPlanned = safeDiv(sum(live, (p) => p.plannedCompletionPct), live.length)
  const slippedMilestones = sum(live, (p) => p.milestones.filter((m) => m.status === 'slipped').length)

  const wardExposure = ctx.scopeWards
    .map((ward) => {
      const own = wardProjects(ward.id).filter((p) => readableIds.has(p.id))
      return {
        ward,
        count: own.length,
        sanctioned: sum(own, (p) => p.sanctionedCostCrore),
        atRisk: own.filter((p) => atRiskIds.has(p.id)).length,
      }
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.sanctioned - a.sanctioned)

  const statusCounts = new Map<string, number>()
  for (const p of live) statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1)

  const evidence = bestEvidence(ctx.user, {
    wardIds: shown.flatMap((p) => p.wardIds),
    kinds: ['inspection', 'document', 'financial-record'],
    count: 5,
  })

  const findings: string[] = [
    `${formatNumber(atRisk.length)} of ${countOf(live.length, 'live work')} carry a composite risk score at or above `
    + `60, a sanctioned exposure of ${formatCrore(riskExposure, 0)} within a readable programme of `
    + `${formatCrore(sanctioned, 0)}.`,
    `Mean recorded progress across live works is ${formatPercent(meanCompletion)} against a phased plan expecting `
    + `${formatPercent(meanPlanned)}, a delivery gap of ${formatDelta(meanCompletion - meanPlanned, ' pp')}; mean risk `
    + `score is ${formatNumber(meanRisk, 1)}/100 and ${formatNumber(slippedMilestones)} milestones have slipped.`,
    `Current cost stands at ${formatCrore(current, 0)} against ${formatCrore(sanctioned, 0)} sanctioned `
    + `(${formatDelta(pct(current - sanctioned, sanctioned))}), with ${formatCrore(paid, 0)} released - `
    + `${formatPercent(pct(paid, current))} of current cost.`,
    ...(wardExposure.length > 0
      ? [
          t('Capital exposure concentrates in {0}.', wardExposure
            .slice(0, 3)
            .map((w) => `${fullWard(w.ward.id)} (${formatCrore(w.sanctioned, 0)}, ${formatNumber(w.atRisk)} at risk)`)
            .join('; ')),
        ]
      : []),
    ...shown.slice(0, 4).map((p) => {
      const driver = [...p.riskDrivers].sort((a, b) => b.contribution - a.contribution)[0]
      return (
        `${p.reference} - ${p.name}: risk ${formatNumber(p.riskScore)}/100, ${formatPercent(p.completionPct)} complete `
        + `against ${formatPercent(p.plannedCompletionPct)} planned, `
        + `${formatNumber(p.milestones.filter((m) => m.status === 'slipped').length)} milestones slipped, `
        + `${formatCrore(p.sanctionedCostCrore)} sanctioned. Largest driver: ${driver ? driver.label.toLowerCase() : t('not attributed')}`
        + `${driver ? t(' at {0} of the composite', formatNumber(driver.contribution, 1)) : ''}. Last inspected `
        + `${formatRelative(p.lastInspectedAt)}.`
      )
    }),
  ]

  const lead = shown[0]

  return {
    requestId: `q-projects-${scopeToken(ctx)}`,
    answer:
      `${formatNumber(atRisk.length)} of ${countOf(live.length, 'live capital work')} carry a composite risk score `
      + `at or above 60, representing a sanctioned exposure of ${formatCrore(riskExposure, 0)} within a readable `
      + `programme of ${formatCrore(sanctioned, 0)}. Mean recorded progress is ${formatPercent(meanCompletion)} against `
      + `a phased plan expecting ${formatPercent(meanPlanned)}. ${projectRiskMethod()} ${scopeSentence(ctx)}`
      + `${departmentSentence(ctx)} `
      + 'A risk score indicates delivery risk requiring management attention. It is not a finding against the executing '
      + 'agency and makes no assertion about how any contract was awarded or performed.',
    keyFindings: findings.slice(0, 8),
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-projects-recovery',
        title: lead
          ? t('Convene a milestone recovery review for {0}', lead.reference)
          : t('Convene a milestone recovery review for the highest-scoring works'),
        why: lead
          ? `Schedule variance stands at ${formatNumber(Math.max(0, lead.plannedCompletionPct - lead.completionPct))} `
            + `percentage points with `
            + `${formatNumber(lead.milestones.filter((m) => m.status === 'slipped').length)} milestones slipped and `
            + `${formatNumber(lead.inspectionObservationsOpen)} inspection observations open beyond their rectification `
            + 'window. That combination indicates a structural constraint a recovery plan must address explicitly.'
          : t('{0} sit at or above the published risk threshold.', countOf(atRisk.length, 'work')),
        expectedImpact:
          'Produces a dated recovery plan with revised milestone commitments, and establishes whether the original '
          + 'programme was achievable on the resources actually deployed.',
        departmentId: 'dept-projects',
        humanOwnerRole: t('Chief Engineer / Executive Engineer'),
        confidence: 'high',
        dependencies: [t('Executing agency attendance'), t('Site engineer measurement report'), t('Departmental works programme')],
        risks: [
          t('Recovery plans agreed without a resource change frequently slip again'),
          t('Withholding payment may affect executing agency cash flow and should be assessed before it is applied'),
        ],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 3),
      }),
      recommend({
        id: 'rec-projects-payment-progress',
        title: t('Reconcile financial progress against recorded physical progress on the flagged works'),
        why:
          `${formatCrore(paid, 0)} has been released against ${formatCrore(current, 0)} of current cost while mean `
          + `recorded progress stands at ${formatPercent(meanCompletion)}. Payment/progress mismatch carries a weight of `
          + `${PROJECT_RISK_WEIGHTS.paymentProgressMismatch.toFixed(2)} in the published engine precisely because the two `
          + 'figures are maintained by different systems and may legitimately diverge.',
        expectedImpact:
          'Establishes whether the divergence is a measurement-book timing difference or a genuine control gap, and '
          + 'records the reconciliation against each work.',
        departmentId: 'dept-finance',
        humanOwnerRole: t('Chief Accountant (Finance)'),
        confidence: 'medium',
        dependencies: [t('Measurement book extract'), t('Running account bill register')],
        risks: [
          t('A timing difference between measurement and certification is ordinary and must not be reported as a control failure'),
          t('Reconciliation identifies a divergence only; it establishes no fault on the part of any executing agency'),
        ],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      'A risk score indicates delivery risk requiring management attention. It is not a finding against the executing '
      + 'agency and makes no assertion about how any contract was awarded or performed.',
      'Payment/progress mismatch is a control indicator, not a finding. Financial and physical progress are recorded in '
      + 'different systems on different cycles and may legitimately diverge.',
      'Recorded completion percentages are departmental returns. Where a return is stale, the resulting schedule '
      + 'variance overstates the position until the next measurement is booked.',
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - capital works register'),
    domains: ['projects', 'procurement'],
    supportingTable: {
      caption: t('Capital works by composite delivery risk, highest first'),
      columns: [
        t('Reference'),
        t('Work'),
        t('Department'),
        t('Ward'),
        t('Risk'),
        t('Progress vs plan'),
        t('Milestones slipped'),
        t('Sanctioned'),
      ],
      rows: shown.map((p) => [
        p.reference,
        `${p.name} (${PROJECT_CATEGORY_LABEL[p.category]})`,
        departmentName(p.departmentId),
        p.wardIds.map((id) => shortWard(id)).join(', '),
        `${formatNumber(p.riskScore)}/100`,
        `${formatPercent(p.completionPct)} / ${formatPercent(p.plannedCompletionPct)}`,
        formatNumber(p.milestones.filter((m) => m.status === 'slipped').length),
        formatCrore(p.sanctionedCostCrore),
      ]),
    },
    visuals: [
      metricsVisual(
        'projects-headline',
        [
          { label: t('Live works in scope'), value: formatNumber(live.length), support: `${formatNumber(readable.length)} readable in total` },
          {
            label: t('At delivery risk'),
            value: formatNumber(atRisk.length),
            support: `${formatCrore(riskExposure, 0)} sanctioned exposure`,
            tone: toneFor(pct(atRisk.length, Math.max(live.length, 1)), false),
          },
          { label: t('Sanctioned programme'), value: formatCrore(sanctioned, 0), support: `${formatCrore(paid, 0)} released` },
          {
            label: t('Mean risk score'),
            value: `${formatNumber(meanRisk, 1)}/100`,
            support: `${formatNumber(slippedMilestones)} milestones slipped`,
            tone: toneFor(meanRisk, false),
          },
          {
            label: t('Progress vs phased plan'),
            value: formatDelta(meanCompletion - meanPlanned, ' pp'),
            support: `${formatPercent(meanCompletion)} recorded against ${formatPercent(meanPlanned)} planned`,
            tone: toneFor(Math.abs(meanCompletion - meanPlanned), false),
          },
        ],
        'Capital works delivery position',
      ),
      rankedBarVisual({
        id: 'projects-risk-ranking',
        caption: t('Capital works by composite risk score (Project Risk Engine)'),
        unit: '/100',
        higherIsBetter: false,
        data: shown.map((p) => ({ label: p.reference, value: p.riskScore })),
      }),
      compositionVisual({
        id: 'projects-status-composition',
        caption: t('Live works by recorded delivery status'),
        segments: [...statusCounts.entries()].map(([status, count]) => ({
          id: status,
          label: PROJECT_STATUS_LABEL[status as keyof typeof PROJECT_STATUS_LABEL] ?? status,
          value: count,
          colour:
            status === 'delayed'
              ? VISUAL_COLOUR.crit
              : status === 'on-hold'
                ? VISUAL_COLOUR.warn
                : status === 'in-progress'
                  ? VISUAL_COLOUR.govt
                  : VISUAL_COLOUR.muted,
        })),
      }),
    ],
    followUps: [
      t('Which contractors carry the weakest delivery performance?'),
      t('Are there any unusual procurement patterns?'),
      wardExposure.length > 0
        ? t('Which capital projects in {0} are showing schedule risk?', fullWard(wardExposure[0]!.ward.id))
        : t('Show me department budget variance against the phased plan.'),
    ],
  }
}

/* ==========================================================================
   Procurement and contracts
   ========================================================================== */

const procurementHandler: AnswerHandler = (ctx): ComposedAnswer => {
  const gate = canAccess(ctx.user, 'procurement', 'view')
  if (!gate.allowed) {
    return deniedAnswer(
      ctx,
      'the contract register, tender stages and procurement delivery indicators',
      `The procurement register is outside your authorised scope. ${gate.reason}`,
    )
  }

  const named = namedDepartments(ctx)
  const readable = CONTRACTS.filter(
    (c) =>
      anyInScope(ctx, c.wardIds)
      && (named === null || named.has(c.departmentId))
      && canAccess(ctx.user, 'procurement', 'view', {
        wardIds: c.wardIds,
        departmentId: c.departmentId,
        classification: c.classification,
      }).allowed,
  )

  if (readable.length === 0) {
    return emptyAnswer(ctx, 'contract', `${scopeSentence(ctx)}${departmentSentence(ctx)}`)
  }

  const flaggedIds = new Set(contractsAtRisk().map((c) => c.id))
  const flagged = readable.filter((c) => flaggedIds.has(c.id)).sort((a, b) => b.riskScore - a.riskScore)
  const ordered = flagged.length > 0 ? flagged : [...readable].sort((a, b) => b.riskScore - a.riskScore)
  const shown = ordered.slice(0, take(ctx))

  const value = sum(readable, (c) => c.valueCrore)
  const paid = sum(readable, (c) => c.paidCrore)
  const variationValue = sum(readable, (c) => c.variationValueCrore)
  const extensions = sum(readable, (c) => c.extensions)
  const meanVariationPct = safeDiv(sum(readable, (c) => c.variationPct), readable.length)
  const flaggedValue = sum(flagged, (c) => c.valueCrore)
  const withExtensions = readable.filter((c) => c.extensions > 0)

  const stageCounts = new Map<string, number>()
  for (const c of readable) stageCounts.set(c.stage, (stageCounts.get(c.stage) ?? 0) + 1)

  const evidence = bestEvidence(ctx.user, {
    term: 'contract',
    wardIds: shown.flatMap((c) => c.wardIds),
    kinds: ['document', 'financial-record'],
    count: 5,
  })

  const findings: string[] = [
    `${countOf(readable.length, 'contract')} are readable in scope with an awarded value of `
    + `${formatCrore(value, 0)}, of which ${formatCrore(paid, 0)} has been released - `
    + `${formatPercent(pct(paid, value))} of awarded value.`,
    `${countOf(flagged.length, 'contract')} sit at or above the published indicator threshold of 55, carrying `
    + `${formatCrore(flaggedValue, 0)} of awarded value - ${formatPercent(pct(flaggedValue, value))} of the readable `
    + 'contract book.',
    `${countOf(extensions, 'time extension')} have been recorded across `
    + `${countOf(withExtensions.length, 'contract')}, and variations amount to ${formatCrore(variationValue, 1)} - a mean of `
    + `${formatPercent(meanVariationPct)} of awarded value. A variation is a recorded contractual change within `
    + 'sanctioned limits, not an irregularity.',
    `${formatNumber(stageCounts.get('awarded') ?? 0)} contracts are at award stage, `
    + `${formatNumber(stageCounts.get('evaluation') ?? 0)} under evaluation and `
    + `${formatNumber(stageCounts.get('bidding') ?? 0)} in bidding.`,
    ...shown.slice(0, 4).map((c) => {
      const driver = [...c.riskIndicators].sort((a, b) => b.contribution - a.contribution)[0]
      return (
        `${c.reference} - ${c.title}: indicator score ${formatNumber(c.riskScore)}/100, awarded `
        + `${formatCrore(c.valueCrore)} to ${contractorName(c.contractorId)}, ${formatNumber(c.extensions)} extensions, `
        + `variation ${formatPercent(c.variationPct)}, ${formatNumber(c.milestonesAchieved)} of `
        + `${formatNumber(c.milestonesTotal)} milestones achieved. Largest indicator: `
        + `${driver ? driver.label.toLowerCase() : t('not attributed')}. Awarded ${formatRelative(c.awardDate)}.`
      )
    }),
  ]

  return {
    requestId: `q-procurement-${scopeToken(ctx)}`,
    answer:
      `${countOf(readable.length, 'contract')} worth ${formatCrore(value, 0)} are readable in scope, of which `
      + `${formatNumber(flagged.length)} carry a delivery indicator score at or above 55 covering `
      + `${formatCrore(flaggedValue, 0)} of awarded value. ${formatNumber(extensions)} time extensions and `
      + `${formatCrore(variationValue, 1)} of variations are recorded across the book, a mean variation of `
      + `${formatPercent(meanVariationPct)}. ${procurementMethod()} ${scopeSentence(ctx)}${departmentSentence(ctx)} `
      + 'Every indicator here describes delivery-continuity exposure requiring management attention. None makes any '
      + 'assertion about how a contract was awarded, evaluated or performed, and none is a finding against any supplier.',
    keyFindings: findings.slice(0, 8),
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-procurement-extensions',
        title: t('Review the extension and variation record on the contracts above the indicator threshold'),
        why:
          `${countOf(extensions, 'extension')} across ${countOf(withExtensions.length, 'contract')} and a mean `
          + `variation of ${formatPercent(meanVariationPct)} indicate delivery risk and possible planning optimism at `
          + 'award stage. Repeated extension is granted through process and may be entirely justified; the rate is what '
          + 'warrants attention.',
        expectedImpact:
          'Establishes whether extensions arise from scope definition, site handover or executing-agency capacity, which '
          + 'determines whether the correct intervention sits at tender stage or at supervision stage.',
        departmentId: 'dept-procurement',
        humanOwnerRole: t('Chief Engineer (Contracts)'),
        confidence: 'medium',
        dependencies: [t('Contract file for each flagged award'), t('Site handover and utility diversion record')],
        risks: [
          t('Extensions and variations recorded within sanctioned limits are ordinary contract administration and must not be characterised as irregularities'),
          t('A review that changes only documentation will not change the delivery position'),
        ],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 3),
      }),
      recommend({
        id: 'rec-procurement-concentration',
        title: t('Assess category concentration across the active contract book as a continuity exposure'),
        why:
          `Category concentration carries a weight of ${PROCUREMENT_RISK_WEIGHTS.concentration.toFixed(2)} in the `
          + `published indicator set. With ${formatCrore(value, 0)} of awarded value across `
          + `${countOf(readable.length, 'contract')}, the corporation's exposure to any single supplier `
          + 'underperforming is a delivery-continuity question, independent of how any contract was awarded.',
        expectedImpact:
          'Identifies the categories where a single supplier failure would interrupt delivery, and informs whether the '
          + 'empanelment roster needs widening ahead of the next tender cycle.',
        departmentId: 'dept-procurement',
        humanOwnerRole: t('Deputy Municipal Commissioner (Procurement)'),
        confidence: 'low',
        dependencies: [t('Empanelment roster by category'), t('Forward tender programme')],
        risks: [
          t('Concentration is a structural exposure of the corporation, not a comment on any supplier'),
          t('Widening a roster takes effect only from the next tender cycle and changes nothing on live contracts'),
        ],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      'A procurement indicator describes delivery-continuity exposure requiring management attention. It makes no '
      + 'assertion about how any contract was awarded, evaluated or performed, and it is not a finding against any '
      + 'supplier or officer.',
      'Variation within sanctioned limits is ordinary contract administration. Its magnitude is tracked as a '
      + 'delivery-risk indicator only, and carries no implication of impropriety.',
      'Category concentration is a continuity exposure carried by the corporation. It is a consequence of the size of '
      + 'the empanelled roster, not a characterisation of any supplier holding those contracts.',
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - contract register'),
    domains: ['procurement', 'projects'],
    supportingTable: {
      caption: t('Contracts by composite delivery indicator score, highest first'),
      columns: [t('Reference'), t('Work'), t('Supplier'), t('Awarded'), t('Released'), t('Extensions'), t('Variation'), t('Indicator')],
      rows: shown.map((c) => [
        `${c.reference} (${TENDER_STAGE_LABEL[c.stage]})`,
        c.title,
        contractorName(c.contractorId),
        formatCrore(c.valueCrore),
        formatCrore(c.paidCrore),
        formatNumber(c.extensions),
        formatPercent(c.variationPct),
        `${formatNumber(c.riskScore)}/100`,
      ]),
    },
    visuals: [
      metricsVisual(
        'procurement-headline',
        [
          { label: t('Contracts in scope'), value: formatNumber(readable.length), support: `${formatCrore(value, 0)} awarded value` },
          {
            label: t('Above indicator threshold'),
            value: formatNumber(flagged.length),
            support: `${formatCrore(flaggedValue, 0)} of awarded value`,
            tone: toneFor(pct(flagged.length, Math.max(readable.length, 1)), false),
          },
          { label: t('Released'), value: formatCrore(paid, 0), support: `${formatPercent(pct(paid, value))} of awarded value` },
          {
            label: t('Time extensions'),
            value: formatNumber(extensions),
            support: `across ${countOf(withExtensions.length, 'contract')}`,
            tone: toneFor(pct(withExtensions.length, Math.max(readable.length, 1)), false),
          },
          {
            label: t('Mean variation'),
            value: formatPercent(meanVariationPct),
            support: `${formatCrore(variationValue, 1)} recorded`,
            tone: toneFor(meanVariationPct, false),
          },
        ],
        'Contract register position',
      ),
      rankedBarVisual({
        id: 'procurement-indicator-ranking',
        caption: t('Contracts by composite delivery indicator score'),
        unit: '/100',
        higherIsBetter: false,
        data: shown.map((c) => ({ label: c.reference, value: c.riskScore })),
      }),
      compositionVisual({
        id: 'procurement-stage-composition',
        caption: t('Readable contract book by tender stage'),
        segments: [...stageCounts.entries()].map(([stage, count]) => ({
          id: stage,
          label: TENDER_STAGE_LABEL[stage as keyof typeof TENDER_STAGE_LABEL] ?? stage,
          value: count,
          colour:
            stage === 'awarded'
              ? VISUAL_COLOUR.govt
              : stage === 'evaluation'
                ? VISUAL_COLOUR.intel
                : stage === 'cancelled'
                  ? VISUAL_COLOUR.crit
                  : VISUAL_COLOUR.muted,
        })),
      }),
    ],
    followUps: [
      t('Which contractors carry the weakest delivery performance?'),
      t('Which capital projects are showing schedule risk or delay?'),
      t('Show me department budget variance against the phased plan.'),
    ],
  }
}

/* ==========================================================================
   Contractor delivery performance
   ========================================================================== */

const contractorsHandler: AnswerHandler = (ctx): ComposedAnswer => {
  const gate = canAccess(ctx.user, 'procurement', 'view')
  if (!gate.allowed) {
    return deniedAnswer(
      ctx,
      'empanelled supplier delivery standing and the contracts behind it',
      `The supplier performance register is outside your authorised scope. ${gate.reason}`,
    )
  }

  const named = namedDepartments(ctx)
  const readableContracts = CONTRACTS.filter(
    (c) =>
      anyInScope(ctx, c.wardIds)
      && (named === null || named.has(c.departmentId))
      && canAccess(ctx.user, 'procurement', 'view', {
        wardIds: c.wardIds,
        departmentId: c.departmentId,
        classification: c.classification,
      }).allowed,
  )
  const readableProjects = PROJECTS.filter(
    (p) =>
      anyInScope(ctx, p.wardIds)
      && (named === null || named.has(p.departmentId))
      && canAccess(ctx.user, 'project', 'view', {
        wardIds: p.wardIds,
        departmentId: p.departmentId,
        classification: p.classification,
      }).allowed,
  )

  const profiles = buildAllContractorProfiles(readableContracts, readableProjects).filter(
    (p) => p.activeContracts.length + p.closedContracts.length > 0 || p.projects.length > 0,
  )

  if (profiles.length === 0) {
    return emptyAnswer(
      ctx,
      'supplier delivery',
      `No empanelled supplier holds a contract or work readable within this scope. ${scopeSentence(ctx)}${departmentSentence(ctx)}`,
    )
  }

  const shown = profiles.slice(0, take(ctx))
  const bands = contractorPerformanceBands(profiles)
  const meanIndex = safeDiv(sum(profiles, (p) => p.performanceIndex), profiles.length)
  const belowExpectation = profiles.filter((p) => p.performanceIndex < 62)
  const contracted = sum(profiles, (p) => p.totalContractedCrore)
  const released = sum(profiles, (p) => p.totalPaidCrore)
  const extensions = sum(profiles, (p) => p.totalExtensions)
  const observations = sum(profiles, (p) => p.openObservations)
  const withIndicators = profiles.filter((p) => p.riskIndicators.length > 0)

  const evidence = bestEvidence(ctx.user, {
    term: 'inspection',
    wardIds: shown.flatMap((p) => p.wards),
    kinds: ['inspection', 'document', 'financial-record'],
    count: 5,
  })

  const findings: string[] = [
    `${formatNumber(profiles.length)} of ${countOf(CONTRACTORS.length, 'empanelled supplier')} hold at least one `
    + `contract or work readable within your scope, together carrying ${formatCrore(contracted, 0)} of contracted value `
    + `with ${formatCrore(released, 0)} released - ${formatPercent(pct(released, contracted))} of contracted value.`,
    `Mean delivery index across the readable roster is ${formatNumber(meanIndex, 1)}/100. `
    + `${countOf(belowExpectation.length, 'supplier')} sit below the empanelment expectation of 62, and `
    + `${formatNumber(withIndicators.length)} carry at least one recorded delivery indicator.`,
    `${countOf(extensions, 'time extension')} and ${countOf(observations, 'inspection observation')} open beyond `
    + 'their rectification window are recorded across the readable portfolio. Both are counted as rates per contract and '
    + 'per work in the index, so a supplier is not marked down for holding more work.',
    t('Band distribution: {0}.', bands.map((b) => `${b.band} ${formatNumber(b.count)}`).join(', ')),
    ...shown.slice(0, 4).map((p) => {
      const weakest = [...p.components].sort((a, b) => a.score - b.score)[0]
      const indicator = p.riskIndicators[0]
      return (
        `${p.contractor.name}: index ${formatNumber(p.performanceIndex)}/100 across `
        + `${countOf(p.activeContracts.length + p.closedContracts.length, 'contract')} worth `
        + `${formatCrore(p.totalContractedCrore)}, ${formatPercent(p.deliveryProgressPct)} mean recorded progress, `
        + `${formatNumber(p.totalExtensions)} extensions, mean variation ${formatPercent(p.meanVariationPct)}. Weakest `
        + `criterion: ${weakest ? t('{0} at {1}/100', weakest.label.toLowerCase(), formatNumber(weakest.score)) : t('not assessed')}`
        + `${indicator ? t('; recorded indicator: {0}', indicator.label.toLowerCase()) : ''}.`
      )
    }),
  ]

  const lead = shown[0]

  return {
    requestId: `q-contractors-${scopeToken(ctx)}`,
    answer:
      `${countOf(profiles.length, 'empanelled supplier')} hold contracts or works readable within your scope, `
      + `carrying ${formatCrore(contracted, 0)} of contracted value at a mean delivery index of `
      + `${formatNumber(meanIndex, 1)}/100; ${formatNumber(belowExpectation.length)} sit below the empanelment `
      + `expectation of 62. ${contractorMethod()} ${scopeSentence(ctx)}${departmentSentence(ctx)} `
      + 'A performance index measures recorded delivery outcomes only. It never characterises a supplier\'s conduct or '
      + 'integrity, it is not a finding, a penalty or a disqualification, and it makes no assertion about how any '
      + 'contract was awarded.',
    keyFindings: findings.slice(0, 8),
    evidence,
    recommendedActions: [
      recommend({
        id: 'rec-contractors-supervision',
        title: lead
          ? t('Increase supervision intensity on live work held by {0}', lead.contractor.name)
          : t('Increase supervision intensity on the weakest-standing suppliers'),
        why: lead
          ? `Delivery index of ${formatNumber(lead.performanceIndex)}/100 across `
            + `${countOf(lead.activeContracts.length, 'active contract')} worth `
            + `${formatCrore(lead.totalContractedCrore)}, with ${formatNumber(lead.openObservations)} inspection `
            + `observations open and ${formatPercent(lead.deliveryProgressPct)} mean recorded progress. Supervision is a `
            + 'management response to delivery exposure, not a sanction.'
          : t('{0} sit below the empanelment expectation.', countOf(belowExpectation.length, 'supplier')),
        expectedImpact:
          'Raises inspection frequency and measurement scrutiny where recorded delivery is weakest, giving the '
          + 'department earlier warning before a milestone is missed rather than after.',
        departmentId: 'dept-projects',
        humanOwnerRole: t('Chief Engineer / Executive Engineer'),
        confidence: 'medium',
        dependencies: [t('Site supervision cadre availability'), t('Inspection schedule revision')],
        risks: [
          t('A performance index is not a finding and cannot support any adverse action against a supplier on its own'),
          t('Increased supervision consumes engineering capacity that is also required elsewhere in the programme'),
        ],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 3),
      }),
      recommend({
        id: 'rec-contractors-observations',
        title: t('Close the open inspection observations before the next empanelment review'),
        why:
          `${countOf(observations, 'inspection observation')} remain open beyond their rectification window across `
          + `the readable portfolio, weighted at ${CONTRACTOR_PERFORMANCE_WEIGHTS.inspectionCompliance.toFixed(2)} in the `
          + 'published index. Each requires departmental closure on its own merits before it can bear on any supplier\'s '
          + 'standing.',
        expectedImpact:
          'Resolves each observation to a recorded rectification or a recorded departmental closure, so that the index a '
          + 'supplier is assessed on rests on a current record rather than a stale one.',
        departmentId: 'dept-procurement',
        humanOwnerRole: t('Chief Engineer (Contracts)'),
        confidence: 'medium',
        dependencies: [t('Inspection register extract by supplier'), t('Executing agency rectification response')],
        risks: [
          t('An open observation is a recorded finding of the inspecting officer on a work, not an adverse conclusion about the supplier'),
          t('Closure requires site verification and cannot be completed administratively'),
        ],
        evidenceRefs: evidence.map((e) => e.id).slice(0, 2),
      }),
    ],
    risksAndLimitations: [
      ...standardLimitations(),
      'A contractor performance index measures recorded delivery outcomes. It never characterises the contractor\'s '
      + 'conduct or integrity, and it is not a finding, a penalty or a disqualification - those are the outcome of '
      + 'process, not of arithmetic.',
      'Complaint correlation records complaints linked to a work location. Correlation with a work site is not '
      + 'attribution of cause to the supplier executing it.',
      'The index is computed only over contracts and works readable within your scope. A supplier holding work outside '
      + 'that scope will show a partial standing here, and the difference is not indicated.',
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - empanelment and contract register'),
    domains: ['procurement', 'projects'],
    supportingTable: {
      caption: t('Empanelled suppliers by delivery index, weakest standing first'),
      columns: [
        t('Supplier'),
        t('Contracts'),
        t('Contracted'),
        t('Released'),
        t('Recorded progress'),
        t('Extensions'),
        t('Mean variation'),
        t('Index'),
      ],
      rows: shown.map((p) => [
        p.contractor.name,
        formatNumber(p.activeContracts.length + p.closedContracts.length),
        formatCrore(p.totalContractedCrore),
        formatPercent(p.paymentRatioPct),
        formatPercent(p.deliveryProgressPct),
        formatNumber(p.totalExtensions),
        formatPercent(p.meanVariationPct),
        `${formatNumber(p.performanceIndex)}/100`,
      ]),
    },
    visuals: [
      metricsVisual(
        'contractors-headline',
        [
          {
            label: t('Suppliers assessed'),
            value: formatNumber(profiles.length),
            support: `of ${formatNumber(CONTRACTORS.length)} on the empanelled roster`,
          },
          {
            label: t('Mean delivery index'),
            value: `${formatNumber(meanIndex, 1)}/100`,
            support: 'empanelment expectation is 62',
            tone: toneFor(meanIndex, true),
          },
          {
            label: t('Below expectation'),
            value: formatNumber(belowExpectation.length),
            support: `${formatNumber(withIndicators.length)} carry a recorded indicator`,
            tone: toneFor(pct(belowExpectation.length, Math.max(profiles.length, 1)), false),
          },
          { label: t('Contracted value'), value: formatCrore(contracted, 0), support: `${formatCrore(released, 0)} released` },
          {
            label: t('Open observations'),
            value: formatNumber(observations),
            support: `${formatNumber(extensions)} time extensions recorded`,
          },
        ],
        'Supplier delivery standing across the readable portfolio',
      ),
      rankedBarVisual({
        id: 'contractors-index-ranking',
        caption: t('Suppliers by recomputed delivery index (Contractor Performance Engine)'),
        unit: '/100',
        higherIsBetter: true,
        data: shown.map((p) => ({ label: p.contractor.name, value: p.performanceIndex })),
      }),
      compositionVisual({
        id: 'contractors-band-composition',
        caption: t('Readable roster by published performance band'),
        segments: bands.map((b) => ({
          id: b.band.toLowerCase().replace(/\s+/g, '-'),
          label: `${b.band} (${b.min}-${b.max})`,
          value: b.count,
          colour: BAND_COLOUR[b.tone],
        })),
      }),
    ],
    followUps: [
      t('Are there any unusual procurement patterns?'),
      t('Which capital projects are showing schedule risk or delay?'),
      t('Show me department budget variance against the phased plan.'),
    ],
  }
}

/* ==========================================================================
   Registry
   ========================================================================== */

export const financeHandlers: Partial<Record<QueryIntentId, AnswerHandler>> = {
  'budget-variance': budgetVarianceHandler,
  revenue: revenueHandler,
  'property-tax': propertyTaxHandler,
  projects: projectsHandler,
  procurement: procurementHandler,
  contractors: contractorsHandler,
}
