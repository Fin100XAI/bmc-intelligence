import { OPERATIONAL_STATE_LABEL, SEVERITY_LABEL, type ConfidenceLevel } from '@/types/common'
import type { Ward } from '@/types/organisation'
import type { AIVisual } from '@/types/ai'
import {
  DISEASE_LABEL,
  type DiseaseIndicator,
  type EmergencyStation,
  type HealthIndicator,
  type Hospital,
} from '@/types/city-domains'
import type { QueryIntentId } from '@/ai/nlu'
import type { AnswerContext, AnswerHandler, ComposedAnswer } from '@/ai/answer-kit'
import {
  authorisedWards,
  bestEvidence,
  compositionVisual,
  deniedAnswer,
  emptyAnswer,
  fullWard,
  heatmapVisual,
  metricsVisual,
  rankedBarVisual,
  recommend,
  shortWard,
  sourcesOf,
  standardLimitations,
  toneFor,
  VISUAL_COLOUR,
} from '@/ai/answer-kit'
import { canAccess } from '@/security/access'
import { WARDS } from '@/data/reference'
import { EMERGENCY_STATIONS, wardHealthSignals, wardHospitals } from '@/data/social.data'
import { activeIncidents } from '@/data/operations.data'
import { WARD_MONSOON_READINESS } from '@/data/city.data'
import { urbanResilienceIndex } from '@/domains/resilience'
import { formatCompact, formatDelta, formatNumber, formatPercent, formatRelative } from '@/utils/format'
import { t, tList, tn } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/ai/answers/health.ts
 *
 * Retrieval routes for the health, hospital, emergency and disaster estate:
 * `health-signals`, `hospitals`, `emergency`, `disaster`.
 *
 * PRIVACY IS ABSOLUTE IN THIS FILE, and it is a property of the data model
 * rather than a promise made in prose. Only aggregate, ward-level disease
 * indicators exist anywhere in this platform - `HealthIndicator` carries a
 * ward, a condition and a period count and nothing else. No patient-level
 * record, name or individually identifying attribute is modelled, stored,
 * retrievable or renderable, so no question put to this Copilot can produce
 * one. Every answer below states that rather than assuming the reader knows.
 *
 * Two further distinctions are load-bearing and are held throughout:
 *
 *   - An **outbreak signal** is a modelled 0-100 indicator used to prioritise
 *     field verification. It is not a confirmed outbreak declaration, and an
 *     answer that let it read as one would put a health department in front of
 *     the press on the strength of an index.
 *   - A **readiness** score is a statement about preparation, never about
 *     outcome. High ward readiness does not forecast a dry monsoon, and low
 *     readiness is not a prediction that anything will happen.
 *
 * Environmental and sanitation correlates are recorded co-occurrences in the
 * same ward and reporting period. Correlation is not causation, no
 * epidemiological conclusion is drawn here, and no one's conduct is
 * characterised anywhere in this file.
 *
 * Retrieval is filtered through the principal's authorised ward scope before
 * anything is composed, and the bound entities of the question - conditions
 * and wards - are honoured and *stated*, so a narrowed reading is visible
 * rather than silently applied.
 */

/* ==========================================================================
   Vocabulary
   ========================================================================== */

const DISEASES: DiseaseIndicator[] = [
  'dengue',
  'malaria',
  'leptospirosis',
  'gastroenteritis',
  'hepatitis',
  'respiratory',
  'chikungunya',
]

/** Vector-borne conditions, whose breeding conditions are monsoon-associated. */
const VECTOR_BORNE: ReadonlySet<DiseaseIndicator> = new Set<DiseaseIndicator>([
  'dengue',
  'malaria',
  'chikungunya',
])

/** Abbreviated labels for chart axes, where the full label will not fit. */
function build$DISEASE_SHORT(): Record<DiseaseIndicator, string> {
  return {
  dengue: t('Dengue'),
  malaria: t('Malaria'),
  leptospirosis: t('Lepto.'),
  gastroenteritis: t('Gastro.'),
  hepatitis: t('Hepat.'),
  respiratory: t('Respir.'),
  chikungunya: t('Chikun.'),
}
}
let DISEASE_SHORT: Record<DiseaseIndicator, string> = build$DISEASE_SHORT()
registerLayer(() => {
  DISEASE_SHORT = build$DISEASE_SHORT()
})

function build$CONFIDENCE_SHORT(): Record<ConfidenceLevel, string> {
  return {
  high: t('High'),
  medium: t('Medium'),
  low: t('Low'),
}
}
let CONFIDENCE_SHORT: Record<ConfidenceLevel, string> = build$CONFIDENCE_SHORT()
registerLayer(() => {
  CONFIDENCE_SHORT = build$CONFIDENCE_SHORT()
})

function build$FACILITY_LABEL(): Record<Hospital['type'], string> {
  return {
  major: t('Major hospital'),
  peripheral: t('Peripheral hospital'),
  speciality: t('Speciality hospital'),
  maternity: t('Maternity home'),
  dispensary: t('Dispensary'),
}
}
let FACILITY_LABEL: Record<Hospital['type'], string> = build$FACILITY_LABEL()
registerLayer(() => {
  FACILITY_LABEL = build$FACILITY_LABEL()
})

function build$STATION_LABEL(): Record<EmergencyStation['type'], string> {
  return {
  'fire-station': t('Fire station'),
  'disaster-control': t('Emergency operations centre'),
  'ambulance-base': t('Ambulance base'),
}
}
let STATION_LABEL: Record<EmergencyStation['type'], string> = build$STATION_LABEL()
registerLayer(() => {
  STATION_LABEL = build$STATION_LABEL()
})

/** The signal strength at or above which a record warrants field verification. */
const VERIFICATION_THRESHOLD = 50

/* ==========================================================================
   Standing statements
   ========================================================================== */

const AGGREGATE_ONLY =
  'Every health figure here is an aggregate ward-level count: no patient-level record, no name and no individually identifying attribute is modelled, stored, retrievable or renderable anywhere in this platform, and none can be produced by any question put to this Copilot.'

const FACILITY_AGGREGATE_ONLY =
  'Every figure here is a facility-level aggregate - bed strength, occupancy, staffing and serviceability - and no patient-level record of any kind is modelled, stored or retrievable anywhere in this platform.'

const SIGNAL_NOT_A_DECLARATION =
  'An outbreak signal is a modelled 0-100 indicator for prioritising field verification: it is not a confirmed outbreak declaration and must never be presented as one.'

const SIGNAL_METHOD =
  'Each signal is computed from period-on-period movement, case level against the ward’s modelled seasonal baseline and recorded flood exposure - a modelled indicator for prioritising field verification, never a confirmed outbreak declaration.'

const DISCLOSURE_CAVEAT =
  'Health returns are aggregated at source and counts below the disclosure threshold are suppressed before ingestion, so wards carrying low counts may be under-represented in this reading.'

const CORRELATION_CAVEAT =
  'Environmental and sanitation correlates are contextual co-occurrences recorded in the same ward and reporting period. Correlation does not establish causation, and no epidemiological conclusion is drawn here.'

const VECTOR_LAG_CAVEAT =
  'The effect of vector control is lagged, and an intensified verification round raises reporting before transmission falls: the indicator may rise before it falls, and a rise in the weeks after the intervention is not evidence that the intervention failed.'

const READINESS_NOT_OUTCOME =
  'A readiness score describes the state of preparation recorded against the corporation’s own registers: it is not a forecast that any hazard will occur, and it does not predict the outcome of one that does.'

const MODELLED_EXPOSURE_CAVEAT =
  'Affected-population figures are modelled estimates of residents within an exposure area rather than counts of identified individuals, and no individual is identified anywhere in the incident record.'

const DISASTER_PRIVACY =
  'Affected-population figures are modelled estimates of residents within an exposure area rather than counts of identified individuals, and the surveillance figures read alongside them are aggregate ward-level counts - no patient-level record exists anywhere in this platform.'

/* ==========================================================================
   Shared scope and phrasing helpers
   ========================================================================== */

interface HealthScope {
  /** Wards this answer may read: the answer scope, re-checked against access. */
  wards: Ward[]
  wardIds: string[]
  ids: Set<string>
  /** True where the question itself named a ward inside the principal's scope. */
  named: boolean
  /** True where the question named any ward at all, readable or not. */
  namedAny: boolean
  /** Wards the question named that the principal is not authorised to read. */
  outOfScope: Ward[]
  /** True where the scope covers every ward on the register. */
  cityWide: boolean
}

/**
 * The geography an answer may read.
 *
 * `ctx.scopeWards` is already intersected with the principal's authorisation by
 * the caller. It is re-checked here anyway: a retrieval route is the last place
 * an unauthorised ward could enter an answer, and a defence that depends on an
 * upstream caller having done its job is not a defence.
 */
function scopeOf(ctx: AnswerContext): HealthScope {
  const authorised = new Set(authorisedWards(ctx.user).map((w) => w.id))
  const wards = ctx.scopeWards.filter((w) => authorised.has(w.id))
  const ids = new Set(wards.map((w) => w.id))
  return {
    wards,
    wardIds: wards.map((w) => w.id),
    ids,
    named: ctx.focusWards.length > 0,
    namedAny: ctx.understanding.entities.wards.length > 0,
    outOfScope: ctx.understanding.entities.wards.filter((w) => !ids.has(w.id)),
    cityWide: wards.length === WARDS.length,
  }
}

/**
 * A count-agreed fragment spliced into a translated sentence.
 *
 * These are the words the sentence's grammar turns on - "that ward" against
 * "those wards", "record read sits" against "records read sit" - and they are
 * passed in as `{n}` arguments. Routing them through `tn` rather than
 * returning the English is what stops a Marathi sentence arriving with two
 * English words in the middle of it; the catalogue audit sees both forms
 * because `tn` carries them as literals.
 */
const pl = tn

/** "A, B and C" in the interface language - Marathi joins with आणि. */
const joinList = tList

/** Names any ward the question asked for but the principal may not read. */
function outOfScopeSentence(scope: HealthScope): string {
  if (scope.outOfScope.length === 0) return ''
  const labels = joinList(scope.outOfScope.map((w) => fullWard(w.id)))
  return t('{0} {1} named in the question but {2} outside your authorised ward scope, so {3} not read and no inference is drawn from the absence.', labels, pl(scope.outOfScope.length, 'was', 'were'), pl(scope.outOfScope.length, 'falls', 'fall'), pl(scope.outOfScope.length, 'it is', 'they are'))
}

/** A plain statement of the geography an answer covers. */
function geographySentence(scope: HealthScope): string {
  if (scope.named) {
    return t('Narrowed to {0} because the question named {1}.', joinList(scope.wards.map((w) => fullWard(w.id))), pl(scope.wards.length, 'that ward', 'those wards'))
  }
  if (scope.cityWide) return t('Covering all {0} wards.', scope.wards.length)
  return t('Covering the {0} {1} within your authorised scope.', scope.wards.length, pl(scope.wards.length, 'ward', 'wards'))
}

/**
 * The filter statement for a surveillance answer.
 *
 * This sentence is the whole point of binding entities before retrieval. A
 * question naming a condition and a ward must produce a condition-and-ward
 * answer, and the operator must be able to see in one line that it did - which
 * is why the applied filter is stated exactly rather than implied by the rows.
 */
function surveillanceFilterSentence(scope: HealthScope, conditions: DiseaseIndicator[]): string {
  const conditionList = joinList(conditions.map((c) => DISEASE_LABEL[c].toLowerCase()))
  const wardList = joinList(scope.wards.map((w) => fullWard(w.id)))
  const conditionNoun = pl(conditions.length, 'that condition', 'those conditions')
  const wardNoun = pl(scope.wards.length, 'that ward', 'those wards')
  // A ward named but unreadable is not the same as no ward named at all, and
  // conflating the two would tell the operator something untrue about their
  // own question.
  const noWard = scope.namedAny ? t('no ward within your authorised scope was named') : t('no ward was named')
  const wardCount = `${scope.wards.length} ${pl(scope.wards.length, 'ward', 'wards')}`

  if (conditions.length > 0 && scope.named) {
    return t('Narrowed to {0} in {1} because the question named {2} and {3}.', conditionList, wardList, conditionNoun, wardNoun)
  }
  if (conditions.length > 0) {
    return t('Narrowed to {0} because the question named {1}; {2}, so the filter is applied across the {3} in your authorised scope.', conditionList, conditionNoun, noWard, wardCount)
  }
  if (scope.named) {
    return t('Narrowed to {0} because the question named {1}; no condition was named, so all {2} aggregate indicators are read for {3}.', wardList, wardNoun, DISEASES.length, pl(scope.wards.length, 'it', 'them'))
  }
  return scope.namedAny
    ? t('No condition was named and {0}, so all {1} aggregate indicators are read across the {2} in your authorised scope.', noWard, DISEASES.length, wardCount)
    : t('Neither a condition nor a ward was named, so all {0} aggregate indicators are read across the {1} in your authorised scope.', DISEASES.length, wardCount)
}

/** Stable, scope-dependent identifier. The same question always logs the same id. */
function requestIdFor(intent: QueryIntentId, ctx: AnswerContext, scope: HealthScope, extra: string[] = []): string {
  const geography = scope.named ? scope.wardIds.join('+') : `scope${scope.wards.length}`
  return ['q', intent, ctx.user.id, ...extra, geography].filter(Boolean).join('-')
}

/** Result count: what the operator asked for, else this file's default. */
function resultLimit(ctx: AnswerContext, fallback = 6): number {
  return ctx.limit > 0 ? Math.min(ctx.limit, 24) : fallback
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function share(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0
}

/** Incidents inside the answer scope that the principal is authorised to read. */
function scopedIncidents(ctx: AnswerContext, scope: HealthScope) {
  return activeIncidents().filter(
    (incident) =>
      scope.ids.has(incident.wardId) &&
      canAccess(ctx.user, 'incident', 'view', {
        wardId: incident.wardId,
        departmentId: incident.departmentId,
        classification: incident.classification,
      }).allowed,
  )
}

/* ==========================================================================
   health-signals - aggregate disease surveillance
   ========================================================================== */

interface ConditionRoll {
  disease: DiseaseIndicator
  records: number
  cases: number
  previous: number
  changePct: number
  meanSignal: number
  elevated: number
}

function rollByCondition(rows: HealthIndicator[]): ConditionRoll[] {
  return DISEASES.map((disease) => {
    const matching = rows.filter((h) => h.disease === disease)
    const cases = matching.reduce((sum, h) => sum + h.casesReported, 0)
    const previous = matching.reduce((sum, h) => sum + h.casesPrevPeriod, 0)
    return {
      disease,
      records: matching.length,
      cases,
      previous,
      changePct: previous > 0 ? Math.round(((cases - previous) / previous) * 1000) / 10 : 0,
      meanSignal: Math.round(mean(matching.map((h) => h.outbreakSignal))),
      elevated: matching.filter((h) => h.outbreakSignal >= VERIFICATION_THRESHOLD).length,
    }
  }).filter((roll) => roll.records > 0)
}

function answerHealthSignals(ctx: AnswerContext): ComposedAnswer {
  const scope = scopeOf(ctx)
  if (scope.wards.length === 0) {
    return deniedAnswer(
      ctx,
      'aggregate ward-level disease surveillance',
      'No ward falls within your authorised scope, so no aggregate disease indicator could be read.',
    )
  }

  const conditions = ctx.understanding.entities.conditions
  const wanted = new Set<DiseaseIndicator>(conditions)
  const limit = resultLimit(ctx)

  // Retrieval is ward-scoped by construction: `wardHealthSignals` is asked only
  // for wards the principal may read, so an unauthorised ward is never counted,
  // summarised, or hinted at by its absence.
  const readable = scope.wards.flatMap((ward) => wardHealthSignals(ward.id))
  const rows = wanted.size > 0 ? readable.filter((h) => wanted.has(h.disease)) : readable

  const filterStatement = surveillanceFilterSentence(scope, conditions)
  const framing = [filterStatement, outOfScopeSentence(scope)].filter(Boolean).join(' ')

  if (rows.length === 0) {
    return emptyAnswer(
      ctx,
      'aggregate disease surveillance',
      `${framing} No aggregate indicator was returned for that combination of condition and ward.`,
    )
  }

  const ranked = [...rows].sort(
    (a, b) =>
      b.outbreakSignal - a.outbreakSignal || b.casesReported - a.casesReported || a.id.localeCompare(b.id),
  )
  const top = ranked.slice(0, limit)
  const lead = ranked[0]

  const cases = rows.reduce((sum, h) => sum + h.casesReported, 0)
  const previous = rows.reduce((sum, h) => sum + h.casesPrevPeriod, 0)
  const movement = previous > 0 ? Math.round(((cases - previous) / previous) * 1000) / 10 : 0
  const elevated = rows.filter((h) => h.outbreakSignal >= VERIFICATION_THRESHOLD)
  const elevatedWards = new Set(elevated.map((h) => h.wardId))
  const meanSignal = Math.round(mean(rows.map((h) => h.outbreakSignal)))
  const rising = rows.filter((h) => h.trend === 'up').length
  const falling = rows.filter((h) => h.trend === 'down').length
  const flat = rows.length - rising - falling
  const highConfidence = rows.filter((h) => h.confidence === 'high').length
  const mediumConfidence = rows.filter((h) => h.confidence === 'medium').length
  const lowConfidence = rows.filter((h) => h.confidence === 'low').length

  const byCondition = rollByCondition(rows)
  const conditionRanking = [...byCondition].sort(
    (a, b) => b.meanSignal - a.meanSignal || b.cases - a.cases || a.disease.localeCompare(b.disease),
  )
  const strongestCondition = conditionRanking.length > 0 ? conditionRanking[0] : null

  const correlateCounts = new Map<string, number>()
  for (const record of elevated) {
    for (const correlate of record.correlates) {
      correlateCounts.set(correlate, (correlateCounts.get(correlate) ?? 0) + 1)
    }
  }
  const correlateRanking = [...correlateCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const topCorrelate = correlateRanking.length > 0 ? correlateRanking[0] : null

  const evidence = bestEvidence(ctx.user, { term: 'health surveillance', wardIds: scope.wardIds, count: 5 })
  const evidenceRefs = evidence.map((item) => item.id).slice(0, 3)

  const keyFindings = [
    ...top
      .slice(0, 4)
      .map(
        (h) =>
          t('{0} · {1} - {2} aggregate cases against {3} in the previous period ({4}), modelled signal {5}/100, {6} severity, {7} reporting confidence.', fullWard(h.wardId), DISEASE_LABEL[h.disease], formatNumber(h.casesReported), formatNumber(h.casesPrevPeriod), formatDelta(h.changePct), h.outbreakSignal, SEVERITY_LABEL[h.severity].toLowerCase(), CONFIDENCE_SHORT[h.confidence].toLowerCase()),
      ),
    t('{0} of {1} ward × condition {2} at or above the {3}/100 verification threshold{4}; the mean signal across the scope is {5}/100.', elevated.length, rows.length, pl(rows.length, 'record read sits', 'records read sit'), VERIFICATION_THRESHOLD, elevated.length > 0 ? `, across ${elevatedWards.size} ${pl(elevatedWards.size, 'ward', 'wards')}` : '', meanSignal),
    t('Aggregate case volume in scope is {0} against {1} in the previous period, a movement of {2}.', formatNumber(cases), formatNumber(previous), formatDelta(movement)),
    strongestCondition
      ? t('{0} carries the strongest mean signal at {1}/100 across {2} ward {3}, on {4} aggregate cases ({5}), with {6} {7} above the verification threshold.', DISEASE_LABEL[strongestCondition.disease], strongestCondition.meanSignal, strongestCondition.records, pl(strongestCondition.records, 'record', 'records'), formatNumber(strongestCondition.cases), formatDelta(strongestCondition.changePct), strongestCondition.elevated, pl(strongestCondition.elevated, 'record', 'records'))
      : null,
    t('{0} {1} trending up against the previous period, {2} flat and {3} down. Reporting confidence across the set: {4} high, {5} medium, {6} low.', rising, pl(rising, 'record is', 'records are'), flat, falling, highConfidence, mediumConfidence, lowConfidence),
    topCorrelate
      ? t('The condition most often recorded alongside an elevated signal is “{0}”, on {1} ward × condition {2}. That is a co-occurrence in the same ward and period, not a cause.', topCorrelate[0], topCorrelate[1], pl(topCorrelate[1], 'record', 'records'))
      : t('No environmental or sanitation correlate is recorded against any elevated signal in this scope.'),
  ]
    .filter((line): line is string => line !== null)
    .slice(0, 8)

  const visuals: AIVisual[] = [
    metricsVisual(
      'health-signals-headline',
      [
        {
          label: t('Ward × condition records read'),
          value: formatNumber(rows.length),
          support: `${scope.wards.length} ${pl(scope.wards.length, 'ward', 'wards')}, ${byCondition.length} ${pl(byCondition.length, 'condition', 'conditions')}`,
        },
        {
          label: t('At or above verification threshold'),
          value: formatNumber(elevated.length),
          support: `Signal ≥ ${VERIFICATION_THRESHOLD} / 100`,
          tone: toneFor(share(elevated.length, rows.length), false),
        },
        {
          label: t('Strongest modelled signal'),
          value: `${lead.outbreakSignal} / 100`,
          support: `${fullWard(lead.wardId)} · ${DISEASE_LABEL[lead.disease]}`,
          tone: toneFor(lead.outbreakSignal, false),
        },
        {
          label: t('Mean signal across scope'),
          value: `${meanSignal} / 100`,
          support: 'Modelled indicator, not a declaration',
          tone: toneFor(meanSignal, false),
        },
        {
          label: t('Aggregate cases, this period'),
          value: formatNumber(cases),
          support: `${formatNumber(previous)} in the previous period`,
        },
        {
          label: t('Movement against previous period'),
          value: formatDelta(movement),
          support: rows[0].periodLabel,
          tone: movement > 15 ? 'critical' : movement > 0 ? 'warn' : 'positive',
        },
      ],
      'Aggregate ward-level indicators only. No patient-level record exists anywhere in this platform.',
    ),
    rankedBarVisual({
      id: 'health-signals-ranked',
      caption: t('Modelled outbreak signal by ward and condition, strongest first'),
      unit: '0-100 modelled signal',
      higherIsBetter: false,
      data: top.map((h) => ({
        label: `${shortWard(h.wardId)} · ${DISEASE_SHORT[h.disease]}`,
        value: h.outbreakSignal,
      })),
    }),
  ]

  // The unfiltered reading is the one that benefits from the full matrix: with
  // no condition named there is no basis for choosing which conditions to drop,
  // so every ward is shown against every indicator.
  if (wanted.size === 0) {
    const values: Record<string, Record<string, number>> = {}
    for (const record of rows) {
      const row = values[record.wardId] ?? {}
      row[record.disease] = record.outbreakSignal
      values[record.wardId] = row
    }
    visuals.push(
      heatmapVisual({
        id: 'health-signals-heatmap',
        caption:
          t('Ward × condition modelled outbreak signal. Colour reflects the 0-100 modelled indicator, not a confirmed outbreak.'),
        rows: scope.wards.map((w) => ({ id: w.id, label: shortWard(w.id) })),
        columns: DISEASES.map((d) => ({ id: d, label: DISEASE_SHORT[d] })),
        values,
        higherIsBetter: false,
      }),
    )
  }

  const recommendedActions = [
    recommend({
      id: `rec-health-verify-${lead.wardId}-${lead.disease}`,
      title: t('Prioritise field verification and intensified vector control for {0} in {1}', DISEASE_LABEL[lead.disease].toLowerCase(), fullWard(lead.wardId)),
      why:
        `The aggregate ${DISEASE_LABEL[lead.disease].toLowerCase()} indicator for ${fullWard(lead.wardId)} stands at ${lead.outbreakSignal}/100 on ${formatNumber(lead.casesReported)} cases against ${formatNumber(lead.casesPrevPeriod)} in the previous period (${formatDelta(lead.changePct)}) - the strongest signal in the scope read, at ${CONFIDENCE_SHORT[lead.confidence].toLowerCase()} reporting confidence.` +
        (lead.correlates.length > 0
          ? t(' A condition recorded alongside it in the same ward and period is “{0}”, offered as context for where to look rather than as a cause.', lead.correlates[0])
            : ''),
      expectedImpact:
        t('Directs the verification round and the vector-control cycle at the specific ward and condition carrying the signal. A targeted round is materially more effective per unit of field effort than uniform ward-wide activity.'),
      departmentId: 'dept-health',
      humanOwnerRole: t('Executive Health Officer'),
      confidence: lead.confidence,
      dependencies: [
        t('Vector-control field staff availability in the ward'),
        t('Larvicide and insecticide stock position'),
        t('Continuity of health post reporting for the verification period'),
      ],
      risks: [VECTOR_LAG_CAVEAT, CORRELATION_CAVEAT, SIGNAL_NOT_A_DECLARATION],
      evidenceRefs,
    }),
  ]

  if (elevatedWards.size >= 2) {
    recommendedActions.push(
      recommend({
        id: `rec-health-surge-${elevatedWards.size}`,
        title: t('Brief facility headroom for the {0} wards carrying an elevated surveillance signal', elevatedWards.size),
        why: `${elevated.length} ward × condition ${pl(elevated.length, 'record sits', 'records sit')} at or above ${VERIFICATION_THRESHOLD}/100 across ${elevatedWards.size} wards. Admission demand is not modelled from these indicators and is not projected here; the purpose is to establish what bed, ICU and staffing headroom exists in the facilities serving those wards while it still exists.`,
        expectedImpact:
          t('Places the current facility capacity position for the affected wards in front of the accountable officer ahead of any demand, rather than after it.'),
        departmentId: 'dept-hospitals',
        humanOwnerRole: t('Director, Medical Education & Major Hospitals'),
        confidence: 'medium',
        dependencies: [t('Current capacity returns from the facilities serving those wards')],
        risks: [
          t('An elevated surveillance signal does not forecast admissions. This is a readiness step, not a projection of demand.'),
          DISCLOSURE_CAVEAT,
        ],
        evidenceRefs,
      }),
    )
  }

  const filterLabel =
    conditions.length > 0 ? joinList(conditions.map((c) => DISEASE_LABEL[c])) : t('all {0} conditions', DISEASES.length)

  const followUps = [
    t('What is the hospital bed and ICU occupancy position in {0}?', fullWard(lead.wardId)),
    t('How prepared are we for this monsoon in {0}?', fullWard(lead.wardId)),
    conditions.length > 0
      ? t('Are there any public health signals I should know about across the other conditions?')
      : t('What is the solid waste collection position in {0}?', fullWard(lead.wardId)),
  ]

  return {
    requestId: requestIdFor('health-signals', ctx, scope, [
      conditions.length > 0 ? conditions.join('+') : 'all-conditions',
    ]),
    answer: [
      framing,
      t('The strongest position in that scope is {0} in {1} at {2}/100, on {3} aggregate cases against {4} in the previous period ({5}); {6} of {7} ward × condition {8} at or above the {9}/100 verification threshold.', DISEASE_LABEL[lead.disease].toLowerCase(), fullWard(lead.wardId), lead.outbreakSignal, formatNumber(lead.casesReported), formatNumber(lead.casesPrevPeriod), formatDelta(lead.changePct), elevated.length, rows.length, pl(rows.length, 'record read sits', 'records read sit'), VERIFICATION_THRESHOLD),
      SIGNAL_METHOD,
      AGGREGATE_ONLY,
    ]
      .filter(Boolean)
      .join(' '),
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      AGGREGATE_ONLY,
      DISCLOSURE_CAVEAT,
      CORRELATION_CAVEAT,
      SIGNAL_NOT_A_DECLARATION,
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - aggregate disease surveillance'),
    domains: ['health'],
    supportingTable: {
      caption: t('Aggregate ward-level disease indicators - {0} across {1} {2}, strongest modelled signal first', filterLabel, scope.wards.length, pl(scope.wards.length, 'ward', 'wards')),
      columns: [
        t('Ward'),
        t('Condition'),
        t('Cases (period)'),
        t('Previous period'),
        t('Change'),
        t('Signal'),
        t('Confidence'),
        t('Severity'),
      ],
      rows: top.map((h) => [
        fullWard(h.wardId),
        DISEASE_LABEL[h.disease],
        formatNumber(h.casesReported),
        formatNumber(h.casesPrevPeriod),
        formatDelta(h.changePct),
        `${h.outbreakSignal} / 100`,
        CONFIDENCE_SHORT[h.confidence],
        SEVERITY_LABEL[h.severity],
      ]),
    },
    visuals,
    followUps,
  }
}

/* ==========================================================================
   hospitals - capacity and utilisation
   ========================================================================== */

function icuOccupancyPct(hospital: Hospital): number {
  return hospital.icuTotal > 0 ? Math.round((hospital.icuOccupied / hospital.icuTotal) * 1000) / 10 : 0
}

/**
 * Utilisation pressure, 0-100, computed for this answer and published so it can
 * be checked: bed occupancy 40%, ICU occupancy 35%, emergency load 25%. A
 * facility holding no critical-care beds carries no ICU term, and its weights
 * are redistributed to bed occupancy and emergency load rather than scored zero
 * - a dispensary with no ICU is not thereby a facility under no pressure.
 */
function utilisationPressure(hospital: Hospital): number {
  if (hospital.icuTotal > 0) {
    return Math.round(
      hospital.occupancyPct * 0.4 + icuOccupancyPct(hospital) * 0.35 + hospital.emergencyLoadIndex * 0.25,
    )
  }
  return Math.round(hospital.occupancyPct * 0.6 + hospital.emergencyLoadIndex * 0.4)
}

function answerHospitals(ctx: AnswerContext): ComposedAnswer {
  const scope = scopeOf(ctx)
  if (scope.wards.length === 0) {
    return deniedAnswer(
      ctx,
      'hospital capacity and utilisation',
      'No ward falls within your authorised scope, so no facility capacity record could be read.',
    )
  }

  const limit = resultLimit(ctx, 8)
  const hospitals = scope.wards.flatMap((ward) => wardHospitals(ward.id))

  if (hospitals.length === 0) {
    return emptyAnswer(
      ctx,
      'hospital capacity',
      `${geographySentence(scope)} No facility on the hospital, maternity or dispensary register stands within that geography.`,
    )
  }

  const bedsTotal = hospitals.reduce((sum, h) => sum + h.bedsTotal, 0)
  const bedsOccupied = hospitals.reduce((sum, h) => sum + h.bedsOccupied, 0)
  const occupancy = share(bedsOccupied, bedsTotal)
  const icuTotal = hospitals.reduce((sum, h) => sum + h.icuTotal, 0)
  const icuOccupied = hospitals.reduce((sum, h) => sum + h.icuOccupied, 0)
  const icuOccupancy = share(icuOccupied, icuTotal)
  const highLoad = hospitals.filter((h) => h.emergencyLoadIndex >= 80)
  const meanStaffing = Math.round(mean(hospitals.map((h) => h.staffingPct)) * 10) / 10
  const meanServiceable = Math.round(mean(hospitals.map((h) => h.equipmentServiceablePct)) * 10) / 10
  const accessRisk = hospitals.filter((h) => h.accessibilityIndex < 60)
  const outsideOperational = hospitals.filter((h) => h.state !== 'operational')

  const ranked = [...hospitals].sort(
    (a, b) => utilisationPressure(b) - utilisationPressure(a) || b.bedsTotal - a.bedsTotal || a.id.localeCompare(b.id),
  )
  const top = ranked.slice(0, limit)
  const lead = ranked[0]
  const thinnestStaffing = [...hospitals].sort((a, b) => a.staffingPct - b.staffingPct || a.id.localeCompare(b.id))[0]

  const bedsByType = (type: Hospital['type']): number =>
    hospitals.filter((h) => h.type === type).reduce((sum, h) => sum + h.bedsTotal, 0)

  const conditions = ctx.understanding.entities.conditions
  const conditionNote =
    conditions.length > 0
      ? t('The question named {0}; the capacity register is not disaggregated by condition, so no condition filter could be applied and the full facility position within the scope is set out instead.', joinList(conditions.map((c) => DISEASE_LABEL[c].toLowerCase())))
      : ''

  const evidence = bestEvidence(ctx.user, { term: 'hospital capacity', wardIds: scope.wardIds, count: 5 })
  const evidenceRefs = evidence.map((item) => item.id).slice(0, 3)

  const keyFindings = [
    t('{0} {1} within the scope carry {2} functional beds, of which {3} are occupied - {4} bed occupancy.', hospitals.length, pl(hospitals.length, 'facility', 'facilities'), formatCompact(bedsTotal), formatCompact(bedsOccupied), formatPercent(occupancy)),
    icuTotal > 0
      ? t('Critical care stands at {0} of {1} ICU beds occupied, {2}, leaving {3} {4} of headroom.', formatCompact(icuOccupied), formatCompact(icuTotal), formatPercent(icuOccupancy), formatCompact(icuTotal - icuOccupied), pl(icuTotal - icuOccupied, 'bed', 'beds'))
      : t('No critical-care capacity is held by any facility within this scope, so ICU-dependent presentations depend entirely on referral out of the geography.'),
    t('{0} carries the highest utilisation pressure at {1}/100 - {2} bed occupancy, {3}, emergency load index {4}/100, in {5}.', lead.name, utilisationPressure(lead), formatPercent(lead.occupancyPct), lead.icuTotal > 0 ? `${formatPercent(icuOccupancyPct(lead))} ICU occupancy` : 'no critical-care beds', lead.emergencyLoadIndex, fullWard(lead.wardId)),
    t('{0} {1} an emergency load index at or above 80/100{2}.', highLoad.length, pl(highLoad.length, 'facility carries', 'facilities carry'), highLoad.length > 0 ? `: ${joinList(highLoad.slice(0, 3).map((h) => h.name))}` : ''),
    t('Staffing availability against sanctioned strength averages {0} across the scope; the thinnest position is {1} at {2}.', formatPercent(meanStaffing), thinnestStaffing.name, formatPercent(thinnestStaffing.staffingPct)),
    t('Critical equipment serviceability averages {0}, and {1} of {2} {3} outside an operational state on their own recorded classification.', formatPercent(meanServiceable), outsideOperational.length, hospitals.length, pl(outsideOperational.length, 'facility sits', 'facilities sit')),
    accessRisk.length > 0
      ? t('{0} {1} an accessibility index below 60/100, meaning approach routes are recorded as degrading under flooding conditions - relevant while the monsoon season is running.', accessRisk.length, pl(accessRisk.length, 'facility carries', 'facilities carry'))
      : t('No facility within the scope carries an accessibility index below 60/100 on its recorded approach-route assessment.'),
    conditionNote,
  ]
    .filter((line) => line.length > 0)
    .slice(0, 8)

  const segments = [
    { id: 'major', label: t('Major hospitals'), value: bedsByType('major'), colour: VISUAL_COLOUR.govt },
    { id: 'peripheral', label: t('Peripheral hospitals'), value: bedsByType('peripheral'), colour: VISUAL_COLOUR.intel },
    { id: 'speciality', label: t('Speciality hospitals'), value: bedsByType('speciality'), colour: VISUAL_COLOUR.ok },
    { id: 'maternity', label: t('Maternity homes'), value: bedsByType('maternity'), colour: VISUAL_COLOUR.govtSoft },
    { id: 'dispensary', label: t('Dispensaries'), value: bedsByType('dispensary'), colour: VISUAL_COLOUR.muted },
  ].filter((segment) => segment.value > 0)

  const visuals: AIVisual[] = [
    metricsVisual(
      'hospitals-headline',
      [
        {
          label: t('Functional beds in scope'),
          value: formatCompact(bedsTotal),
          support: `${hospitals.length} ${pl(hospitals.length, 'facility', 'facilities')} across ${scope.wards.length} ${pl(scope.wards.length, 'ward', 'wards')}`,
        },
        {
          label: t('Bed occupancy'),
          value: formatPercent(occupancy),
          support: `${formatCompact(bedsOccupied)} of ${formatCompact(bedsTotal)}`,
          tone: toneFor(occupancy, false),
        },
        {
          label: t('ICU occupancy'),
          value: icuTotal > 0 ? formatPercent(icuOccupancy) : t('No ICU capacity'),
          support: icuTotal > 0 ? t('{0} of {1} beds', formatCompact(icuOccupied), formatCompact(icuTotal)) : t('Referral dependent'),
          tone: icuTotal > 0 ? toneFor(icuOccupancy, false) : 'warn',
        },
        {
          label: t('Facilities at high emergency load'),
          value: formatNumber(highLoad.length),
          support: 'Emergency load index ≥ 80 / 100',
          tone: toneFor(share(highLoad.length, hospitals.length), false),
        },
        {
          label: t('Mean staffing against sanctioned'),
          value: formatPercent(meanStaffing),
          support: `Thinnest: ${formatPercent(thinnestStaffing.staffingPct)}`,
          tone: toneFor(meanStaffing, true),
        },
        {
          label: t('Mean equipment serviceability'),
          value: formatPercent(meanServiceable),
          support: 'Critical equipment only',
          tone: toneFor(meanServiceable, true),
        },
      ],
      'Facility-level aggregates only. No patient-level record is modelled or retrievable anywhere in this platform.',
    ),
    rankedBarVisual({
      id: 'hospitals-pressure',
      caption:
        t('Utilisation pressure by facility - bed occupancy 40%, ICU occupancy 35%, emergency load 25%, redistributed where no critical-care beds are held'),
      unit: '0-100 composite pressure',
      higherIsBetter: false,
      data: top.map((h) => ({ label: h.name, value: utilisationPressure(h) })),
    }),
  ]

  if (segments.length > 0) {
    visuals.push(
      compositionVisual({
        id: 'hospitals-bed-mix',
        caption: t('Functional bed strength by facility type across the scope read'),
        segments,
      }),
    )
  }

  const recommendedActions = [
    recommend({
      id: `rec-hospital-pressure-${lead.id}`,
      title: t('Review admission and discharge flow at {0}', lead.name),
      why: `${lead.name} in ${fullWard(lead.wardId)} carries the highest utilisation pressure in the scope at ${utilisationPressure(lead)}/100: ${formatPercent(lead.occupancyPct)} bed occupancy${lead.icuTotal > 0 ? t(', {0} ICU occupancy', formatPercent(icuOccupancyPct(lead))) : ''}, emergency load index ${lead.emergencyLoadIndex}/100, staffing at ${formatPercent(lead.staffingPct)} of sanctioned strength.${lead.servicesUnavailable.length > 0 ? t(' Services recorded as unavailable at this facility: {0}.', joinList(lead.servicesUnavailable.slice(0, 3))) : ''}`,
      expectedImpact:
        t('Establishes whether the pressure is an inflow problem, a discharge-pathway problem or a staffing problem, so the response is directed rather than a general instruction to cope.'),
      departmentId: 'dept-hospitals',
      humanOwnerRole: t('Director, Medical Education & Major Hospitals'),
      confidence: 'high',
      dependencies: [
        t('Facility capacity return for the current period'),
        t('Referral protocol with the peripheral facilities in the same geography'),
      ],
      risks: [
        t('Occupancy is a point-in-time aggregate. A facility at high occupancy on this return may have cleared by the time the review convenes.'),
        FACILITY_AGGREGATE_ONLY,
      ],
      evidenceRefs,
    }),
    recommend({
      id: 'rec-hospital-surveillance-read',
      title: t('Read facility headroom alongside the aggregate surveillance position for the same wards'),
      why: `The capacity position covers ${scope.wards.length} ${pl(scope.wards.length, 'ward', 'wards')} carrying ${formatCompact(bedsTotal)} functional beds at ${formatPercent(occupancy)} occupancy${icuTotal > 0 ? t(' and {0} ICU occupancy', formatPercent(icuOccupancy)) : ''}. Read on its own it says nothing about what is coming; read against the aggregate ward-level disease surveillance for the same wards it indicates where headroom and signal strength diverge.`,
      expectedImpact:
        t('Connects two registers the corporation already holds, so a pre-positioning decision rests on both rather than on capacity alone.'),
      departmentId: 'dept-health',
      humanOwnerRole: t('Executive Health Officer'),
      confidence: 'medium',
      dependencies: [t('Aggregate surveillance return for the same reporting period')],
      risks: [
        t('Surveillance indicators are modelled signals for prioritising verification. They do not forecast admissions and must not be converted into a demand projection.'),
        VECTOR_LAG_CAVEAT,
      ],
      evidenceRefs,
    }),
  ]

  return {
    requestId: requestIdFor('hospitals', ctx, scope),
    answer: [
      geographySentence(scope),
      outOfScopeSentence(scope),
      t('{0} {1} {2} functional beds at {3} occupancy{4}; {5} {6} an emergency load index at or above 80/100.', hospitals.length, pl(hospitals.length, 'facility holds', 'facilities hold'), formatCompact(bedsTotal), formatPercent(occupancy), icuTotal > 0 ? `, with critical care at ${formatPercent(icuOccupancy)} across ${formatCompact(icuTotal)} ICU beds` : ', and no critical-care capacity within the geography', highLoad.length, pl(highLoad.length, 'facility carries', 'facilities carry')),
      t('Facilities are ranked below on a utilisation pressure index computed for this answer and published with its weights, so the ordering can be checked rather than taken. {0}', FACILITY_AGGREGATE_ONLY),
      conditionNote,
    ]
      .filter(Boolean)
      .join(' '),
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      FACILITY_AGGREGATE_ONLY,
      t('Occupancy, staffing and serviceability are point-in-time returns for the current reporting period. They describe the position at the time of return, not a trend or a projection.'),
      t('The utilisation pressure index is a composite computed for this answer from three published components. It is a ranking instrument for prioritising review and is not a clinical measure.'),
      DISCLOSURE_CAVEAT,
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - facility capacity register'),
    domains: ['hospitals', 'health'],
    supportingTable: {
      caption: t('Facility capacity and utilisation - {0} {1} in scope, highest utilisation pressure first', scope.wards.length, pl(scope.wards.length, 'ward', 'wards')),
      columns: [
        t('Facility'),
        t('Type'),
        t('Ward'),
        t('Beds (occupied / total)'),
        t('Bed occupancy'),
        t('ICU (occupied / total)'),
        t('Emergency load'),
        t('Pressure index'),
      ],
      rows: top.map((h) => [
        h.name,
        FACILITY_LABEL[h.type],
        fullWard(h.wardId),
        `${formatNumber(h.bedsOccupied)} / ${formatNumber(h.bedsTotal)}`,
        formatPercent(h.occupancyPct),
        h.icuTotal > 0 ? `${formatNumber(h.icuOccupied)} / ${formatNumber(h.icuTotal)}` : t('None held'),
        `${h.emergencyLoadIndex} / 100`,
        `${utilisationPressure(h)} / 100`,
      ]),
    },
    visuals,
    followUps: [
      t('Are there any public health signals I should know about in {0}?', fullWard(lead.wardId)),
      t('What is the fire and emergency response position?'),
      t('Where is the workforce vacancy position most acute?'),
    ],
  }
}

/* ==========================================================================
   emergency - fire and emergency response
   ========================================================================== */

function answerEmergency(ctx: AnswerContext): ComposedAnswer {
  const scope = scopeOf(ctx)
  if (scope.wards.length === 0) {
    return deniedAnswer(
      ctx,
      'fire and emergency response readiness',
      'No ward falls within your authorised scope, so no emergency station record could be read.',
    )
  }

  const limit = resultLimit(ctx, 8)
  const stations = EMERGENCY_STATIONS.filter((station) => scope.ids.has(station.wardId))

  if (stations.length === 0) {
    return emptyAnswer(
      ctx,
      'fire and emergency response',
      `${geographySentence(scope)} No fire station, ambulance base or emergency operations centre stands within that geography, so response for it is mounted from stations outside your authorised scope, which are not read here.`,
    )
  }

  const fireStations = stations.filter((s) => s.type === 'fire-station')
  const controlRooms = stations.filter((s) => s.type === 'disaster-control')
  const appliancesTotal = stations.reduce((sum, s) => sum + s.vehiclesTotal, 0)
  const appliancesAvailable = stations.reduce((sum, s) => sum + s.vehiclesAvailable, 0)
  const availability = share(appliancesAvailable, appliancesTotal)
  const personnel = stations.reduce((sum, s) => sum + s.personnelOnDuty, 0)
  const meanResponse = Math.round(mean(stations.map((s) => s.avgResponseMinutes)) * 10) / 10
  const meanReadiness = Math.round(mean(stations.map((s) => s.readinessIndex)))
  const outsideOperational = stations.filter((s) => s.state !== 'operational')
  const slowerThanMean = stations.filter((s) => s.avgResponseMinutes > meanResponse)

  const incidents = scopedIncidents(ctx, scope)
  const fireIncidents = incidents.filter((incident) => incident.type === 'fire')
  const exposedResidents = incidents.reduce((sum, incident) => sum + incident.affectedPopulation, 0)

  const byReadiness = [...stations].sort(
    (a, b) => a.readinessIndex - b.readinessIndex || b.avgResponseMinutes - a.avgResponseMinutes || a.id.localeCompare(b.id),
  )
  const weakest = byReadiness[0]
  const byResponse = [...stations].sort(
    (a, b) => b.avgResponseMinutes - a.avgResponseMinutes || a.readinessIndex - b.readinessIndex || a.id.localeCompare(b.id),
  )
  const slowest = byResponse[0]
  const table = byReadiness.slice(0, limit)

  const evidence = bestEvidence(ctx.user, {
    term: 'situation report',
    wardIds: scope.wardIds,
    kinds: ['field-report'],
    count: 5,
  })
  const evidenceRefs = evidence.map((item) => item.id).slice(0, 3)

  const keyFindings = [
    t('{0} response {1} within the scope - {2} fire {3}{4} - with {5} personnel recorded on duty.', stations.length, pl(stations.length, 'establishment sits', 'establishments sit'), fireStations.length, pl(fireStations.length, 'station', 'stations'), controlRooms.length > 0 ? ` and ${controlRooms.length} emergency operations ${pl(controlRooms.length, 'centre', 'centres')}` : '', formatNumber(personnel)),
    t('Appliance availability stands at {0} of {1}, {2} of the fleet held in the scope.', formatNumber(appliancesAvailable), formatNumber(appliancesTotal), formatPercent(availability)),
    t('Mean recorded response time across the scope is {0} minutes over the last 30 days; {1} of {2} {3} above that mean, the slowest being {4} at {5} minutes.', formatNumber(meanResponse, 1), slowerThanMean.length, stations.length, pl(slowerThanMean.length, 'station sits', 'stations sit'), slowest.name, formatNumber(slowest.avgResponseMinutes, 1)),
    t('Mean readiness across the scope is {0}/100. The weakest position is {1} in {2} at {3}/100, with {4} of {5} appliances available.', meanReadiness, weakest.name, fullWard(weakest.wardId), weakest.readinessIndex, weakest.vehiclesAvailable, weakest.vehiclesTotal),
    t('{0} of {1} {2} outside an operational state on their own recorded classification{3}.', outsideOperational.length, stations.length, pl(outsideOperational.length, 'establishment sits', 'establishments sit'), outsideOperational.length > 0 ? `: ${joinList(outsideOperational.slice(0, 3).map((s) => `${s.name} (${OPERATIONAL_STATE_LABEL[s.state].toLowerCase()})`))}` : ''),
    incidents.length > 0
      ? t('{0} active {1} open within the scope you are authorised to read, {2} of them fire incidents, with a modelled exposure of {3} residents.', incidents.length, pl(incidents.length, 'incident is', 'incidents are'), fireIncidents.length, formatCompact(exposedResidents))
      : t('No active incident is open within the scope you are authorised to read.'),
    incidents.length > 0
      ? t('The most recently detected of them is {0} in {1}, {2} severity, detected {3}, with {4} response {5} recorded against it.', incidents[0].title, fullWard(incidents[0].wardId), SEVERITY_LABEL[incidents[0].severity].toLowerCase(), formatRelative(incidents[0].detectedAt), incidents[0].responseTeams.length, pl(incidents[0].responseTeams.length, 'team', 'teams'))
      : t('Mean coverage radius across the establishments read is {0} km.', formatNumber(mean(stations.map((s) => s.coverageRadiusKm)), 1)),
  ].slice(0, 8)

  const visuals: AIVisual[] = [
    metricsVisual(
      'emergency-headline',
      [
        {
          label: t('Response establishments in scope'),
          value: formatNumber(stations.length),
          support: `${fireStations.length} fire, ${controlRooms.length} operations ${pl(controlRooms.length, 'centre', 'centres')}`,
        },
        {
          label: t('Appliance availability'),
          value: formatPercent(availability),
          support: `${formatNumber(appliancesAvailable)} of ${formatNumber(appliancesTotal)}`,
          tone: toneFor(availability, true),
        },
        {
          label: t('Mean response time'),
          value: `${formatNumber(meanResponse, 1)} min`,
          support: 'Recorded over the last 30 days',
          tone: meanResponse <= 6 ? 'positive' : meanResponse <= 9 ? 'warn' : 'critical',
        },
        {
          label: t('Mean readiness'),
          value: `${meanReadiness} / 100`,
          support: `Weakest: ${weakest.readinessIndex} / 100`,
          tone: toneFor(meanReadiness, true),
        },
        {
          label: t('Personnel on duty'),
          value: formatCompact(personnel),
          support: `Across ${stations.length} ${pl(stations.length, 'establishment', 'establishments')}`,
        },
        {
          label: t('Active incidents in scope'),
          value: formatNumber(incidents.length),
          support: `${fireIncidents.length} fire, ${formatCompact(exposedResidents)} residents in the modelled exposure area`,
          tone: incidents.length > 0 ? 'warn' : 'positive',
        },
      ],
      'Station-level operational aggregates. Exposure figures are modelled estimates, not counts of identified individuals.',
    ),
    rankedBarVisual({
      id: 'emergency-readiness',
      caption: t('Recorded readiness index by establishment, weakest first'),
      unit: '0-100 readiness index',
      higherIsBetter: true,
      data: table.map((s) => ({ label: s.name, value: s.readinessIndex })),
    }),
    rankedBarVisual({
      id: 'emergency-response-time',
      caption: t('Mean recorded response time by establishment over the last 30 days, slowest first'),
      unit: 'minutes',
      higherIsBetter: false,
      data: byResponse.slice(0, limit).map((s) => ({ label: s.name, value: s.avgResponseMinutes })),
    }),
  ]

  const recommendedActions = [
    recommend({
      id: `rec-emergency-readiness-${weakest.id}`,
      title: t('Restore appliance availability and readiness at {0}', weakest.name),
      why: `${weakest.name} in ${fullWard(weakest.wardId)} carries the weakest readiness position in the scope at ${weakest.readinessIndex}/100, with ${weakest.vehiclesAvailable} of ${weakest.vehiclesTotal} appliances available, ${weakest.personnelOnDuty} personnel on duty and a mean recorded response of ${formatNumber(weakest.avgResponseMinutes, 1)} minutes against a scope mean of ${formatNumber(meanResponse, 1)} minutes. Its recorded state is ${OPERATIONAL_STATE_LABEL[weakest.state].toLowerCase()}.`,
      expectedImpact: t('Returning the off-run appliances at this establishment lifts availability across the scope from {0} and shortens the arm of cover over a {1} km radius.', formatPercent(availability), formatNumber(weakest.coverageRadiusKm, 1)),
      departmentId: 'dept-fire',
      humanOwnerRole: t('Chief Fire Officer'),
      confidence: 'high',
      dependencies: [
        t('Workshop capacity for the appliances currently off the run'),
        t('Crewing availability against the sanctioned watch strength'),
      ],
      risks: [
        t('Response time is a 30-day mean over recorded turnouts. It reflects the incidents that occurred, not the response the establishment would mount to a different call profile.'),
        t('Readiness describes preparation. It is not a forecast of the incidents this establishment will face.'),
      ],
      evidenceRefs,
    }),
  ]

  if (incidents.length > 0 || controlRooms.length > 0) {
    recommendedActions.push(
      recommend({
        id: 'rec-emergency-coordination',
        title:
          incidents.length > 0
            ? t('Confirm multi-agency coordination for the {0} active {1} in scope', incidents.length, pl(incidents.length, 'incident', 'incidents'))
            : t('Confirm the operations centre mobilisation position against the current establishment readiness'),
        why:
          incidents.length > 0
            ? t('{0} active {1} a modelled exposure of {2} residents across {3} {4}, against a scope-wide appliance availability of {5} and {6} personnel on duty.', incidents.length, pl(incidents.length, 'incident carries', 'incidents carry'), formatCompact(exposedResidents), new Set(incidents.map((i) => i.wardId)).size, pl(new Set(incidents.map((i) => i.wardId)).size, 'ward', 'wards'), formatPercent(availability), formatNumber(personnel))
            : t('The scope holds {0} emergency operations {1} against {2} fire {3} at {4} appliance availability and a mean readiness of {5}/100.', controlRooms.length, pl(controlRooms.length, 'centre', 'centres'), fireStations.length, pl(fireStations.length, 'station', 'stations'), formatPercent(availability), meanReadiness),
        expectedImpact:
          t('Establishes which establishments are committed and what reserve remains before the next call, rather than after it.'),
        departmentId: 'dept-disaster',
        humanOwnerRole: t('Director, Disaster Management Cell'),
        confidence: 'medium',
        dependencies: [t('Current mobilisation state from each establishment in the scope')],
        risks: [
          MODELLED_EXPOSURE_CAVEAT,
          t('Coordination establishes the position. It does not itself add response capacity.'),
        ],
        evidenceRefs,
      }),
    )
  }

  return {
    requestId: requestIdFor('emergency', ctx, scope),
    answer: [
      geographySentence(scope),
      outOfScopeSentence(scope),
      t('{0} response {1} {2} of {3} appliances available ({4}) and {5} personnel on duty, at a mean recorded response of {6} minutes and a mean readiness of {7}/100.', stations.length, pl(stations.length, 'establishment holds', 'establishments hold'), formatNumber(appliancesAvailable), formatNumber(appliancesTotal), formatPercent(availability), formatNumber(personnel), formatNumber(meanResponse, 1), meanReadiness),
      t('Establishments are ordered below by their own recorded readiness index and response mean over the last 30 days, so the ranking rests on the corporation’s own returns and describes preparation rather than the incidents any establishment will face.'),
      incidents.length > 0 ? MODELLED_EXPOSURE_CAVEAT : READINESS_NOT_OUTCOME,
    ]
      .filter(Boolean)
      .join(' '),
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      READINESS_NOT_OUTCOME,
      MODELLED_EXPOSURE_CAVEAT,
      t('Response time is a mean over recorded turnouts in the last 30 days. It is affected by the call profile the establishment happened to receive and is not a service guarantee.'),
      t('Establishments outside your authorised ward scope may cover part of this geography. They are not read here and their contribution is not counted.'),
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - emergency establishment register'),
    domains: ['emergency'],
    supportingTable: {
      caption: t('Fire and emergency response establishments - {0} {1} in scope, weakest readiness first', scope.wards.length, pl(scope.wards.length, 'ward', 'wards')),
      columns: [
        t('Establishment'),
        t('Type'),
        t('Ward'),
        t('Appliances (available / total)'),
        t('Personnel on duty'),
        t('Mean response'),
        t('Coverage radius'),
        t('Readiness'),
      ],
      rows: table.map((s) => [
        s.name,
        STATION_LABEL[s.type],
        fullWard(s.wardId),
        `${formatNumber(s.vehiclesAvailable)} / ${formatNumber(s.vehiclesTotal)}`,
        formatNumber(s.personnelOnDuty),
        `${formatNumber(s.avgResponseMinutes, 1)} min`,
        `${formatNumber(s.coverageRadiusKm, 1)} km`,
        `${s.readinessIndex} / 100 (${OPERATIONAL_STATE_LABEL[s.state]})`,
      ]),
    },
    visuals,
    followUps: [
      t('What is the disaster management readiness position?'),
      t('Which incidents are currently active?'),
      t('What is the hospital bed and ICU occupancy position in {0}?', fullWard(weakest.wardId)),
    ],
  }
}

/* ==========================================================================
   disaster - readiness and response posture
   ========================================================================== */

function answerDisaster(ctx: AnswerContext): ComposedAnswer {
  const scope = scopeOf(ctx)
  if (scope.wards.length === 0) {
    return deniedAnswer(
      ctx,
      'disaster management readiness',
      'No ward falls within your authorised scope, so no readiness record could be read.',
    )
  }

  const limit = resultLimit(ctx, 8)
  const readiness = WARD_MONSOON_READINESS.filter((row) => scope.ids.has(row.wardId))
  const stations = EMERGENCY_STATIONS.filter((station) => scope.ids.has(station.wardId))
  const incidents = scopedIncidents(ctx, scope)

  if (readiness.length === 0 && stations.length === 0 && incidents.length === 0) {
    return emptyAnswer(
      ctx,
      'disaster management readiness',
      `${geographySentence(scope)} Neither the ward readiness register, the response establishment register nor the active incident register returned a record for that geography.`,
    )
  }

  const meanReadiness = Math.round(mean(readiness.map((r) => r.readinessScore)))
  const meanDesilting = Math.round(mean(readiness.map((r) => r.desiltingPct)) * 10) / 10
  const meanPumps = Math.round(mean(readiness.map((r) => r.pumpReadiness)))
  const chronicSpots = readiness.reduce((sum, r) => sum + r.floodSpots, 0)
  const mitigated = readiness.reduce((sum, r) => sum + r.spotsMitigated, 0)
  const teams = readiness.reduce((sum, r) => sum + r.teamsAllocated, 0)
  const pumpsDeployed = readiness.reduce((sum, r) => sum + r.dewateringPumps, 0)
  const gapsRecorded = readiness.reduce((sum, r) => sum + r.gaps.length, 0)
  const belowOperational = readiness.filter((r) => r.state !== 'operational')

  const ordered = [...readiness].sort(
    (a, b) => a.readinessScore - b.readinessScore || a.wardId.localeCompare(b.wardId),
  )
  const weakest = ordered.length > 0 ? ordered[0] : null
  const table = ordered.slice(0, limit)

  const controlRooms = stations.filter((s) => s.type === 'disaster-control')
  const controlVehicles = controlRooms.reduce((sum, s) => sum + s.vehiclesAvailable, 0)
  const controlPersonnel = controlRooms.reduce((sum, s) => sum + s.personnelOnDuty, 0)
  const exposedResidents = incidents.reduce((sum, incident) => sum + incident.affectedPopulation, 0)
  const criticalIncidents = incidents.filter((i) => i.severity === 'critical' || i.severity === 'high')

  // The composite resilience index is a corporation-wide computation across
  // every ward register. It is quoted only where the principal is authorised to
  // read the whole register, because a city-wide composite offered inside a
  // narrow ward scope would disclose an aggregate of records outside it.
  const resilience = scope.cityWide ? urbanResilienceIndex() : null

  // Vector-borne conditions carry a recorded association with standing water,
  // which is why the readiness position and the surveillance position belong on
  // the same page during the monsoon. The association is contextual only.
  const floodProneWards = scope.wards.filter((w) => w.floodProne)
  const vectorSignals = floodProneWards
    .flatMap((ward) => wardHealthSignals(ward.id))
    .filter((h) => VECTOR_BORNE.has(h.disease) && h.outbreakSignal >= VERIFICATION_THRESHOLD)
    .sort((a, b) => b.outbreakSignal - a.outbreakSignal || a.id.localeCompare(b.id))
  const vectorWards = new Set(vectorSignals.map((h) => h.wardId))
  const leadVectorSignal = vectorSignals.length > 0 ? vectorSignals[0] : null

  const evidence = bestEvidence(ctx.user, {
    term: 'situation report',
    wardIds: scope.wardIds,
    kinds: ['field-report', 'sensor-reading'],
    count: 5,
  })
  const evidenceRefs = evidence.map((item) => item.id).slice(0, 3)

  const keyFindings = [
    readiness.length > 0
      ? t('Mean ward readiness across the scope is {0}/100 over {1} {2}, with {3} {4} recorded outside an operational state and {5} readiness {6} logged against them.', meanReadiness, readiness.length, pl(readiness.length, 'ward', 'wards'), belowOperational.length, pl(belowOperational.length, 'ward', 'wards'), gapsRecorded, pl(gapsRecorded, 'gap', 'gaps'))
      : t('No ward readiness record falls within your authorised scope.'),
    readiness.length > 0
      ? t('Pre-monsoon desilting stands at {0} against the 100% target and pump readiness at {1}%, the two capacities that bind when rainfall exceeds drain design.', formatPercent(meanDesilting), meanPumps)
      : '',
    readiness.length > 0
      ? t('{0} chronic waterlogging {1} on the register within the scope, of which {2} {3} completed mitigation - {4} of the register closed.', chronicSpots, pl(chronicSpots, 'location remains', 'locations remain'), mitigated, pl(mitigated, 'carries', 'carry'), formatPercent(share(mitigated, chronicSpots)))
      : '',
    readiness.length > 0
      ? t('{0} response {1} allocated and {2} dewatering {3} positioned across the scope.', teams, pl(teams, 'team is', 'teams are'), pumpsDeployed, pl(pumpsDeployed, 'pump is', 'pumps are'))
      : '',
    weakest
      ? t('The weakest ward position is {0} at {1}/100 - desilting {2}, pump readiness {3}%, {4} chronic {5} with {6} mitigated{7}.', fullWard(weakest.wardId), weakest.readinessScore, formatPercent(weakest.desiltingPct), weakest.pumpReadiness, weakest.floodSpots, pl(weakest.floodSpots, 'location', 'locations'), weakest.spotsMitigated, weakest.gaps.length > 0 ? `. Recorded gap: ${weakest.gaps[0]}` : '')
      : '',
    stations.length > 0
      ? t('{0} response {1} within the scope{2}.', stations.length, pl(stations.length, 'establishment sits', 'establishments sit'), controlRooms.length > 0 ? `, including ${controlRooms.length} emergency operations ${pl(controlRooms.length, 'centre', 'centres')} holding ${controlVehicles} available ${pl(controlVehicles, 'vehicle', 'vehicles')} and ${formatNumber(controlPersonnel)} personnel on duty` : '')
      : '',
    incidents.length > 0
      ? t('{0} active {1} open within your authorised scope, {2} at high or critical severity, with a modelled exposure of {3} residents. Most recent: {4} in {5}, detected {6}.', incidents.length, pl(incidents.length, 'incident is', 'incidents are'), criticalIncidents.length, formatCompact(exposedResidents), incidents[0].title, fullWard(incidents[0].wardId), formatRelative(incidents[0].detectedAt))
      : t('No active incident is open within your authorised scope.'),
    leadVectorSignal
      ? t('{0} flood-prone {1} in scope also {2} a vector-borne surveillance signal at or above {3}/100, the strongest being {4} in {5} at {6}/100. This is a seasonal co-occurrence recorded in the same period, not a causal finding.', vectorWards.size, pl(vectorWards.size, 'ward', 'wards'), pl(vectorWards.size, 'carries', 'carry'), VERIFICATION_THRESHOLD, DISEASE_LABEL[leadVectorSignal.disease].toLowerCase(), fullWard(leadVectorSignal.wardId), leadVectorSignal.outbreakSignal)
      : t('No flood-prone ward in scope carries a vector-borne surveillance signal at or above {0}/100 in the current period.', VERIFICATION_THRESHOLD),
    resilience
      ? t('The corporation-wide composite resilience index stands at {0}/100, assessed across {1} hazards; the weakest assessed hazard is {2}.', resilience.score, resilience.dimensions.length, resilience.weakest ? `${resilience.weakest.label.toLowerCase()} at ${resilience.weakest.score}/100` : 'not resolvable from the current registers')
      : '',
  ]
    .filter((line) => line.length > 0)
    .slice(0, 8)

  const visuals: AIVisual[] = [
    metricsVisual(
      'disaster-headline',
      [
        {
          label: t('Mean ward readiness'),
          value: `${meanReadiness} / 100`,
          support: `${readiness.length} ${pl(readiness.length, 'ward', 'wards')} in scope`,
          tone: toneFor(meanReadiness, true),
        },
        {
          label: t('Pre-monsoon desilting'),
          value: formatPercent(meanDesilting),
          support: 'Against the 100% pre-monsoon target',
          tone: toneFor(meanDesilting, true),
        },
        {
          label: t('Pump readiness'),
          value: formatPercent(meanPumps, 0),
          support: 'Mean across the wards read',
          tone: toneFor(meanPumps, true),
        },
        {
          label: t('Chronic locations mitigated'),
          value: `${formatNumber(mitigated)} / ${formatNumber(chronicSpots)}`,
          support: `${formatPercent(share(mitigated, chronicSpots))} of the register closed`,
          tone: toneFor(share(mitigated, chronicSpots), true),
        },
        {
          label: t('Response teams and pumps positioned'),
          value: `${formatNumber(teams)} / ${formatNumber(pumpsDeployed)}`,
          support: 'Teams allocated / dewatering pumps',
        },
        {
          label: t('Active incidents in scope'),
          value: formatNumber(incidents.length),
          support: `${criticalIncidents.length} high or critical, ${formatCompact(exposedResidents)} residents in the modelled exposure area`,
          tone: criticalIncidents.length > 0 ? 'critical' : incidents.length > 0 ? 'warn' : 'positive',
        },
      ],
      'Readiness describes the state of preparation recorded against the corporation’s own registers. It is not a forecast of any hazard.',
    ),
  ]

  if (readiness.length > 0) {
    visuals.push(
      rankedBarVisual({
        id: 'disaster-ward-readiness',
        caption: t('Ward monsoon and disaster readiness, weakest first'),
        unit: '0-100 readiness score',
        higherIsBetter: true,
        data: table.map((r) => ({ label: shortWard(r.wardId), value: r.readinessScore })),
      }),
    )
  }

  if (resilience) {
    visuals.push(
      rankedBarVisual({
        id: 'disaster-resilience-dimensions',
        caption: t('Corporation-wide resilience by assessed hazard, weakest first - composite {0}/100', resilience.score),
        unit: '0-100 preparedness',
        higherIsBetter: true,
        data: [...resilience.dimensions]
          .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
          .map((d) => ({ label: d.label, value: d.score })),
      }),
    )
  }

  const recommendedActions = []

  if (weakest) {
    recommendedActions.push(
      recommend({
        id: `rec-disaster-readiness-${weakest.wardId}`,
        title: t('Close the recorded readiness gaps in {0} ahead of the next heavy spell', fullWard(weakest.wardId)),
        why: `${fullWard(weakest.wardId)} carries the weakest readiness position in the scope at ${weakest.readinessScore}/100 against a scope mean of ${meanReadiness}/100: desilting at ${formatPercent(weakest.desiltingPct)}, pump readiness at ${weakest.pumpReadiness}%, ${weakest.floodSpots} chronic ${pl(weakest.floodSpots, 'location', 'locations')} of which ${weakest.spotsMitigated} ${pl(weakest.spotsMitigated, 'is', 'are')} mitigated, ${weakest.teamsAllocated} ${pl(weakest.teamsAllocated, 'team', 'teams')} allocated and ${weakest.dewateringPumps} dewatering ${pl(weakest.dewateringPumps, 'pump', 'pumps')} positioned.${weakest.gaps.length > 0 ? t(' The gaps recorded against the ward are: {0}.', joinList(weakest.gaps.slice(0, 3))) : ''}`,
        expectedImpact:
          t('Addresses the specific recorded gaps in the ward carrying the weakest position, which is where a marginal unit of pre-monsoon effort changes the readiness score most.'),
        departmentId: 'dept-disaster',
        humanOwnerRole: t('Director, Disaster Management Cell'),
        confidence: 'high',
        dependencies: [
          t('Desilting contractor availability within the remaining season window'),
          t('Dewatering pump availability from the central pool'),
          t('Ward-level response team release from competing commitments'),
        ],
        risks: [
          READINESS_NOT_OUTCOME,
          t('Closing a recorded gap raises the readiness score. It does not by itself change the drainage capacity the ward was designed with.'),
        ],
        evidenceRefs,
      }),
    )
  }

  if (leadVectorSignal) {
    recommendedActions.push(
      recommend({
        id: `rec-disaster-vector-${leadVectorSignal.wardId}`,
        title: t('Sequence vector control behind the dewatering round in the {0} flood-prone {1} carrying an elevated signal', vectorWards.size, pl(vectorWards.size, 'ward', 'wards')),
        why: `${vectorWards.size} flood-prone ${pl(vectorWards.size, 'ward in scope carries', 'wards in scope carry')} a vector-borne surveillance signal at or above ${VERIFICATION_THRESHOLD}/100, the strongest being ${DISEASE_LABEL[leadVectorSignal.disease].toLowerCase()} in ${fullWard(leadVectorSignal.wardId)} at ${leadVectorSignal.outbreakSignal}/100 on ${formatNumber(leadVectorSignal.casesReported)} aggregate cases (${formatDelta(leadVectorSignal.changePct)}). Standing water and vector breeding are seasonally associated, so a dewatering round and a vector-control round contend for the same localities in the same window.`,
        expectedImpact:
          t('Puts the two rounds in an order that does not undo the other, and directs the vector-control cycle at the wards where the aggregate indicator is already elevated.'),
        departmentId: 'dept-health',
        humanOwnerRole: t('Executive Health Officer'),
        confidence: leadVectorSignal.confidence,
        dependencies: [
          t('Dewatering completion in the localities concerned'),
          t('Vector-control field staff availability across the flood-prone wards'),
        ],
        risks: [VECTOR_LAG_CAVEAT, CORRELATION_CAVEAT, AGGREGATE_ONLY],
        evidenceRefs,
      }),
    )
  } else if (stations.length > 0) {
    const applianceAvailability = share(
      stations.reduce((sum, s) => sum + s.vehiclesAvailable, 0),
      stations.reduce((sum, s) => sum + s.vehiclesTotal, 0),
    )
    recommendedActions.push(
      recommend({
        id: 'rec-disaster-mobilisation',
        title: t('Confirm the mobilisation position of response establishments against the current readiness scores'),
        why: `${stations.length} response ${pl(stations.length, 'establishment holds', 'establishments hold')} ${formatPercent(applianceAvailability)} appliance availability across a scope whose mean ward readiness is ${meanReadiness}/100, with ${belowOperational.length} ${pl(belowOperational.length, 'ward', 'wards')} recorded outside an operational state.`,
        expectedImpact:
          t('Establishes what response capacity is actually uncommitted against the wards least prepared to absorb a spell, rather than assuming the two align.'),
        departmentId: 'dept-fire',
        humanOwnerRole: t('Chief Fire Officer'),
        confidence: 'medium',
        dependencies: [t('Current mobilisation state from each establishment in the scope')],
        risks: [READINESS_NOT_OUTCOME, MODELLED_EXPOSURE_CAVEAT],
        evidenceRefs,
      }),
    )
  }

  return {
    requestId: requestIdFor('disaster', ctx, scope),
    answer: [
      geographySentence(scope),
      outOfScopeSentence(scope),
      readiness.length > 0
        ? t('Mean ward readiness across the scope is {0}/100, with desilting at {1} against the 100% pre-monsoon target, pump readiness at {2}%, {3} of {4} chronic waterlogging {5} carrying completed mitigation, and {6} active {7} open in scope.', meanReadiness, formatPercent(meanDesilting), meanPumps, mitigated, chronicSpots, pl(chronicSpots, 'location', 'locations'), incidents.length, pl(incidents.length, 'incident', 'incidents'))
        : t('{0} response {1} within the scope and {2} active {3} open, but no ward readiness record falls within it.', stations.length, pl(stations.length, 'establishment sits', 'establishments sit'), incidents.length, pl(incidents.length, 'incident is', 'incidents are')),
      t('The position is computed from the corporation’s own desilting, pump, chronic-location and deployment registers{0}, and describes the state of preparation recorded there rather than any forecast that a hazard will occur or of how one would turn out.', resilience ? `, read alongside the corporation-wide composite resilience index of ${resilience.score}/100 across ${resilience.dimensions.length} assessed hazards` : ''),
      DISASTER_PRIVACY,
    ]
      .filter(Boolean)
      .join(' '),
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      READINESS_NOT_OUTCOME,
      MODELLED_EXPOSURE_CAVEAT,
      AGGREGATE_ONLY,
      DISCLOSURE_CAVEAT,
      CORRELATION_CAVEAT,
      t('Readiness components are drawn from the pre-monsoon programme registers. A component recorded as complete describes the record, and field verification remains the only test of the condition on the ground.'),
    ],
    sources: sourcesOf(evidence, 'BMC Intelligence Core - readiness and incident registers'),
    domains: ['disaster', 'emergency', 'monsoon'],
    supportingTable: {
      caption: t('Ward disaster and monsoon readiness - {0} {1} in scope, weakest first', readiness.length, pl(readiness.length, 'ward', 'wards')),
      columns: [
        t('Ward'),
        t('Readiness'),
        t('Desilting'),
        t('Pump readiness'),
        t('Chronic locations'),
        t('Mitigated'),
        t('Response teams'),
        t('Dewatering pumps'),
      ],
      rows: table.map((r) => [
        fullWard(r.wardId),
        `${r.readinessScore} / 100 (${OPERATIONAL_STATE_LABEL[r.state]})`,
        formatPercent(r.desiltingPct),
        formatPercent(r.pumpReadiness, 0),
        formatNumber(r.floodSpots),
        formatNumber(r.spotsMitigated),
        formatNumber(r.teamsAllocated),
        formatNumber(r.dewateringPumps),
      ]),
    },
    visuals,
    followUps: [
      t('How prepared are we for this monsoon?'),
      t('Which incidents are currently active?'),
      weakest
        ? t('Are there any public health signals I should know about in {0}?', fullWard(weakest.wardId))
        : t('What is the fire and emergency response position?'),
    ],
  }
}

/* ==========================================================================
   Registry
   ========================================================================== */

export const healthHandlers: Partial<Record<QueryIntentId, AnswerHandler>> = {
  'health-signals': answerHealthSignals,
  hospitals: answerHospitals,
  emergency: answerEmergency,
  disaster: answerDisaster,
}
