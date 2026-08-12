import type { AIRecommendationBlock, AIVisual } from '@/types/ai'
import type { OperationalState } from '@/types/common'
import type { EvidenceItem } from '@/types/intelligence'
import type { QueryIntentId } from '@/ai/nlu'
import type { AnswerContext, AnswerHandler, ComposedAnswer } from '@/ai/answer-kit'
import {
  VISUAL_COLOUR,
  anyInScope,
  bestEvidence,
  compositionVisual,
  emptyAnswer,
  deniedAnswer,
  fullWard,
  inScope,
  metricsVisual,
  rankedBarVisual,
  recommend,
  shortWard,
  sourcesOf,
  standardLimitations,
  toneFor,
} from '@/ai/answer-kit'
import { canAccess } from '@/security/access'
import { DEMO_NOW } from '@/utils/deterministic'
import {
  formatCompact,
  formatCrore,
  formatDelta,
  formatNumber,
  formatPercent,
  formatRelative,
} from '@/utils/format'
import { WARDS, departmentName } from '@/data/reference'
import {
  COMMITTEES,
  COUNCIL_POSITION,
  COUNCIL_RESOLUTIONS,
  EDUCATION_WARD_SUMMARY,
  HOUSING_SCHEMES,
  LICENCE_REGISTERS,
  REGISTRATION_CENTRES,
  REGISTRATION_TREND,
  SETTLEMENTS,
  committeeName,
  schoolsInWard,
  settlementsInWard,
} from '@/data/civic.data'
import { WELFARE_SCHEMES, WELFARE_TREND } from '@/data/welfare.data'
import { LIVELIHOOD_CENTRES, LIVELIHOOD_TREND, VENDOR_ZONES } from '@/data/livelihoods.data'
import { BURIAL_GROUNDS, DEATHCARE_TREND } from '@/data/deathcare.data'
import { MARKET_INSPECTION_TREND, MUNICIPAL_MARKETS } from '@/data/markets.data'
import {
  ANIMAL_WELFARE_TREND,
  WARD_ANIMAL_SIGNALS,
  animalSignalForWard,
  animalWelfareUnitsInWard,
} from '@/data/animal-welfare.data'
import { AMENITY_TREND, PUBLIC_AMENITIES, WARD_AMENITY_GAPS } from '@/data/amenities.data'
import { WORKFORCE_UNITS } from '@/data/operations.data'
import { LICENCE_CATEGORY_LABEL, RESOLUTION_STATUS_LABEL, SETTLEMENT_RECOGNITION_LABEL } from '@/types/civic-services'
import { WELFARE_SCHEME_KIND_LABEL } from '@/types/welfare'
import { BURIAL_GROUND_COMMUNITY_LABEL, BURIAL_GROUND_KIND_LABEL } from '@/types/deathcare'
import { MARKET_INSPECTION_INTERVAL_DAYS, MARKET_KIND_LABEL, REGULATED_TRADE_KINDS } from '@/types/markets'
import {
  PARKING_BAYS_PER_1000_VEHICLES_BENCHMARK,
  RESIDENTS_PER_TOILET_SEAT_BENCHMARK,
} from '@/types/amenities'
import { t } from '@/i18n'

/**
 * src/ai/answers/civic.ts
 *
 * The twelve obligatory civic duties, answered from the corporation's own
 * registers.
 *
 * Every route here reports on a duty assigned to municipal corporations by the
 * Twelfth Schedule of the Constitution and by the obligatory duties in the
 * Maharashtra Municipal Corporation Act, 1949. They are the least glamorous
 * things a corporation does and the ones a management platform most reliably
 * omits - which is precisely the reason the Copilot has to answer them. A city
 * is judged on whether it teaches its children, buries its dead with dignity,
 * inspects the premises its meat comes from, reaches its weakest residents and
 * issues the certificate a widow needs before anyone will pay her.
 *
 * Three disciplines hold across the file:
 *
 *   - **Scope before retrieval.** A record outside the principal's authorised
 *     ward, department or classification scope is never counted, summarised or
 *     implied. The corporation-wide monthly series are quoted only where the
 *     answer already covers every ward, so a ward-scoped principal is never
 *     handed a city aggregate through the side door.
 *   - **The register is not a verdict.** A premises recorded as trading
 *     without a current licence is a register entry and an enforcement
 *     candidate. Settlement figures are aggregate survey estimates. Welfare
 *     counts are scheme-level. Nothing here characterises the conduct of any
 *     person, trader, operator or department.
 *   - **Aggregate only.** No individual resident, beneficiary, licensee,
 *     trainee, vendor or deceased person exists anywhere in these registers,
 *     and no answer may imply that one does.
 */

/* ==========================================================================
   Shared shaping
   ========================================================================== */

type Tone = 'default' | 'positive' | 'warn' | 'critical'

/** Stable, scope-dependent identifier for the request log. */
function requestId(ctx: AnswerContext, key: string): string {
  const scope = ctx.narrowed ? ctx.scopeWards.map((w) => w.id).join('+') : `scope-${ctx.scopeWards.length}`
  return `q-${key}-${ctx.user.id}-${scope}`
}

/** Rows to render: what the operator asked for, capped so a table stays legible. */
function rowLimit(ctx: AnswerContext, max = 8): number {
  return Math.max(3, Math.min(ctx.limit, max))
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length
}

function share(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0
}

/** Age in whole days against the demonstration anchor, never the wall clock. */
function daysSince(iso: string): number {
  return Math.round((DEMO_NOW.getTime() - new Date(iso).getTime()) / 86_400_000)
}

function stateTone(state: OperationalState): Tone {
  if (state === 'critical') return 'critical'
  if (state === 'at-risk') return 'warn'
  if (state === 'operational') return 'positive'
  return 'default'
}

/**
 * True only where the answer covers every ward in the corporation.
 *
 * The monthly series in these registers are corporation-wide totals with no
 * ward dimension, so they may be quoted only when the principal's answer
 * already spans the whole city. Anything narrower and the series would be
 * disclosing beyond the authorised scope while looking like context.
 */
function cityWide(ctx: AnswerContext): boolean {
  return !ctx.narrowed && ctx.scopeWards.length === WARDS.length
}

/** The latest corporation-wide movement, where scope permits it to be read. */
function movement<T>(ctx: AnswerContext, series: T[]): { latest: T; previous: T } | undefined {
  if (!cityWide(ctx) || series.length < 2) return undefined
  return { latest: series[series.length - 1]!, previous: series[series.length - 2]! }
}

function scopeIds(ctx: AnswerContext): string[] {
  return ctx.scopeWards.map((w) => w.id)
}

/**
 * The domain half of the gate every one of these registers is served through.
 *
 * Each civic service filters its records on `{ wardId, domain }`. Ward scope
 * is already carried by `ctx.scopeWards`, so what remains to test once per
 * route is the principal's domain scope. The Copilot has to withhold exactly
 * what the rest of the platform withholds, or it becomes the one surface that
 * leaks - and a principal outside the domain is told so plainly rather than
 * handed an empty register that reads like an absence of records.
 */
function domainDenial(
  ctx: AnswerContext,
  subject: string,
  resource: 'ward' | 'intelligence' = 'ward',
): ComposedAnswer | null {
  const domain = ctx.understanding.intent.domains[0]
  if (!domain) return null
  const decision = canAccess(ctx.user, resource, 'view', { domain })
  return decision.allowed ? null : deniedAnswer(ctx, subject, decision.reason)
}

/** What a handler hands to `finish`, which stamps the parts common to all twelve. */
interface Draft {
  answer: string
  keyFindings: string[]
  supportingTable: NonNullable<ComposedAnswer['supportingTable']>
  visuals: AIVisual[]
  recommendedActions: AIRecommendationBlock[]
  /** Limitations specific to this register, appended to the standard set. */
  caveats: string[]
  followUps: string[]
  /** The system of record behind the figures, named in the provenance tab. */
  register: string
}

function finish(ctx: AnswerContext, key: string, evidence: EvidenceItem[], draft: Draft): ComposedAnswer {
  return {
    requestId: requestId(ctx, key),
    answer: draft.answer,
    keyFindings: draft.keyFindings,
    evidence,
    recommendedActions: draft.recommendedActions,
    risksAndLimitations: [...standardLimitations(), ...draft.caveats],
    sources: sourcesOf(evidence, draft.register),
    domains: ctx.understanding.intent.domains,
    supportingTable: draft.supportingTable,
    visuals: draft.visuals,
    followUps: draft.followUps,
  }
}

/* ==========================================================================
   Education - municipal schools
   ========================================================================== */

const education: AnswerHandler = (ctx) => {
  const denied = domainDenial(ctx, 'the municipal school register')
  if (denied) return denied
  const summaries = EDUCATION_WARD_SUMMARY.filter((s) => inScope(ctx, s.wardId) && s.schools > 0)
  if (summaries.length === 0) {
    return emptyAnswer(ctx, 'municipal school', 'No ward within scope carries a school on the education register.')
  }
  const schools = ctx.scopeWards.flatMap((w) => schoolsInWard(w.id))
  const enrolment = summaries.reduce((s, x) => s + x.enrolment, 0)
  const sanctioned = schools.reduce((s, x) => s + x.teachersSanctioned, 0)
  const inPosition = schools.reduce((s, x) => s + x.teachersInPosition, 0)
  const vacancyPct = share(sanctioned - inPosition, sanctioned)
  const attendance = mean(summaries.map((s) => s.avgAttendancePct))
  const dropout = mean(summaries.map((s) => s.avgDropoutPct))
  const belowInfra = summaries.reduce((s, x) => s + x.schoolsBelowInfraThreshold, 0)
  const noGirlsToilet = schools.filter((s) => !s.hasGirlsToilet).length
  const noWater = schools.filter((s) => !s.hasDrinkingWater).length
  const ranked = [...summaries].sort((a, b) => b.teacherVacancyPct - a.teacherVacancyPct)
  const rows = ranked.slice(0, rowLimit(ctx))
  const evidence = bestEvidence(ctx.user, { wardIds: scopeIds(ctx), kinds: ['inspection', 'derived-metric'], count: 4 })

  return finish(ctx, 'education', evidence, {
    answer:
      `${formatNumber(schools.length)} municipal schools within scope carry an enrolment of ${formatCompact(enrolment)} pupils against ${formatNumber(sanctioned)} sanctioned teaching posts, of which ${formatNumber(sanctioned - inPosition)} stand unfilled - a teaching vacancy of ${formatPercent(vacancyPct)}. `
      + `Mean attendance is ${formatPercent(attendance)} and the mean dropout rate ${formatPercent(dropout)}, both averaged across ward summaries rather than weighted by enrolment, so a large school and a small one count alike. `
      + `${formatNumber(belowInfra)} schools sit below the infrastructure threshold of 55, which is a condition assessment of the building and not a statement about the teaching within it.`,
    keyFindings: [
      ...rows.map(
        (s) =>
          t('{0} - {1} schools, enrolment {2}, teaching vacancy {3}, attendance {4}, dropout {5}, {6} below the infrastructure threshold.', fullWard(s.wardId), formatNumber(s.schools), formatCompact(s.enrolment), formatPercent(s.teacherVacancyPct), formatPercent(s.avgAttendancePct), formatPercent(s.avgDropoutPct), formatNumber(s.schoolsBelowInfraThreshold)),
      ),
      t('{0} schools have no functioning girls\' toilet recorded and {1} have no drinking water point. Both are provisioning facts on the school record and are the two conditions most closely associated with attendance falling away in the upper primary years.', formatNumber(noGirlsToilet), formatNumber(noWater)),
      t('Mid-day meal coverage averages {0} of enrolled pupils across the schools in scope.', formatPercent(mean(schools.map((s) => s.midDayMealCoveragePct)))),
      t('{0} schools have not been inspected in the last six months, the longest interval standing at {1} days.', formatNumber(schools.filter((s) => daysSince(s.lastInspectedAt) > 180).length), formatNumber(Math.max(0, ...schools.map((s) => daysSince(s.lastInspectedAt))))),
    ],
    supportingTable: {
      caption: t('Ward education position, ordered by teaching vacancy'),
      columns: [t('Ward'), t('Schools'), t('Enrolment'), t('Teaching vacancy'), t('Attendance'), t('Dropout'), t('Below infra threshold')],
      rows: rows.map((s) => [
        fullWard(s.wardId),
        formatNumber(s.schools),
        formatCompact(s.enrolment),
        formatPercent(s.teacherVacancyPct),
        formatPercent(s.avgAttendancePct),
        formatPercent(s.avgDropoutPct),
        formatNumber(s.schoolsBelowInfraThreshold),
      ]),
    },
    visuals: [
      metricsVisual('education-headline', [
        { label: t('Schools'), value: formatNumber(schools.length), support: `${ctx.scopeWards.length} wards in scope` },
        { label: t('Enrolment'), value: formatCompact(enrolment), support: 'pupils on roll' },
        { label: t('Teaching vacancy'), value: formatPercent(vacancyPct), support: `${formatNumber(sanctioned - inPosition)} posts unfilled`, tone: toneFor(vacancyPct, false) },
        { label: t('Mean attendance'), value: formatPercent(attendance), tone: toneFor(attendance, true) },
        { label: t('Mean dropout'), value: formatPercent(dropout), tone: toneFor(dropout * 8, false) },
      ]),
      rankedBarVisual({
        id: 'education-vacancy',
        caption: t('Teaching vacancy by ward'),
        unit: '%',
        higherIsBetter: false,
        data: rows.map((s) => ({ label: shortWard(s.wardId), value: Math.round(s.teacherVacancyPct * 10) / 10 })),
      }),
    ],
    recommendedActions: [
      recommend({
        id: 'rec-education-vacancy',
        title: t('Prioritise teaching deployment into {0} and the wards behind it', fullWard(rows[0]!.wardId)),
        why: `${fullWard(rows[0]!.wardId)} carries a teaching vacancy of ${formatPercent(rows[0]!.teacherVacancyPct)} against ${formatCompact(rows[0]!.enrolment)} pupils on roll. A vacancy at that level is absorbed by increasing class size, which is not visible in any figure the corporation publishes.`,
        expectedImpact: t('Establishes whether the shortfall is a recruitment constraint, a posting preference or an establishment approval still pending, which determines the correct instrument.'),
        departmentId: 'dept-education',
        humanOwnerRole: t('Education Officer'),
        confidence: 'medium',
        dependencies: [t('Establishment sanction position'), t('Education Committee concurrence for redeployment')],
        risks: [t('Redeployment relieves one ward at the expense of another unless the establishment itself is enlarged')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    ],
    caveats: [
      t('Attendance and dropout are school-reported figures held at ward level. Neither is independently verified, and a school under pressure has an incentive in both.'),
      t('The infrastructure score assesses the building - fabric, water, electricity, sanitation. It carries no assessment of teaching quality or of learning outcomes.'),
    ],
    followUps: [
      t('Which municipal school buildings show the weakest infrastructure and teacher vacancy?'),
      t('Where is the workforce vacancy position most acute?'),
      t('What is the status of council resolutions?'),
    ],
    register: 'Education Department School Register (simulated)',
  })
}

/* ==========================================================================
   Housing - settlements and rehousing
   ========================================================================== */

const housing: AnswerHandler = (ctx) => {
  const denied = domainDenial(ctx, 'the settlement survey and rehousing register')
  if (denied) return denied
  const settlements = SETTLEMENTS.filter((s) => inScope(ctx, s.wardId))
  if (settlements.length === 0) {
    return emptyAnswer(ctx, 'settlement', 'No settlement within scope is recorded on the slum improvement survey register.')
  }
  const schemes = HOUSING_SCHEMES.filter((s) => anyInScope(ctx, s.wardIds))
  const densest = ctx.scopeWards
    .map((w) => ({ wardId: w.id, rows: settlementsInWard(w.id) }))
    .sort((a, b) => b.rows.length - a.rows.length)[0]
  const population = settlements.reduce((s, x) => s + x.estimatedPopulation, 0)
  const floodProne = settlements.filter((s) => s.floodProne)
  const waterPoint = mean(settlements.map((s) => s.personsPerWaterPoint))
  const toiletSeat = mean(settlements.map((s) => s.personsPerToiletSeat))
  const seatsOutOfUse = settlements.reduce((s, x) => s + (x.toiletSeatsTotal - x.toiletSeatsFunctional), 0)
  const inTransit = schemes.reduce((s, x) => s + x.householdsInTransit, 0)
  const delivered = schemes.reduce((s, x) => s + x.tenementsDelivered, 0)
  const sanctionedUnits = schemes.reduce((s, x) => s + x.tenementsSanctioned, 0)
  const ranked = [...settlements].sort((a, b) => a.serviceIndex - b.serviceIndex)
  const rows = ranked.slice(0, rowLimit(ctx))
  const evidence = bestEvidence(ctx.user, { wardIds: scopeIds(ctx), kinds: ['field-report', 'source-record'], count: 4 })

  return finish(ctx, 'housing', evidence, {
    answer:
      `${formatNumber(settlements.length)} settlements within scope hold a surveyed population of approximately ${formatCompact(population)} residents across ${formatNumber(settlements.reduce((s, x) => s + x.estimatedHouseholds, 0))} estimated households. These are aggregate estimates from the corporation's own settlement survey; no household or resident record exists anywhere in this platform. `
      + `Service provision averages one public standpost for every ${formatNumber(waterPoint)} residents and one community toilet seat for every ${formatNumber(toiletSeat)}, with ${formatNumber(seatsOutOfUse)} seats recorded as installed but not functioning. `
      + `${formatNumber(floodProne.length)} settlements are flagged flood-prone, and ${formatNumber(inTransit)} households sit in transit accommodation against rehousing schemes still in delivery.`,
    keyFindings: [
      ...rows.map(
        (s) =>
          t('{0} ({1}) - service index {2}, {3} residents per water point, {4} per toilet seat, {5} of lanes paved, {6}, {7} collection rounds a week.', s.name, fullWard(s.wardId), formatNumber(s.serviceIndex), formatNumber(s.personsPerWaterPoint), formatNumber(s.personsPerToiletSeat), formatPercent(s.internalRoadsPavedPct, 0), SETTLEMENT_RECOGNITION_LABEL[s.recognition].toLowerCase(), s.wasteCollectionRoundsPerWeek),
      ),
      t('{0} rehousing schemes touch the wards in scope: {1} tenements delivered against {2} sanctioned, on a committed outlay of {3} of which {4} is spent.', formatNumber(schemes.length), formatCompact(delivered), formatCompact(sanctionedUnits), formatCrore(schemes.reduce((s, x) => s + x.outlayCrore, 0), 0), formatCrore(schemes.reduce((s, x) => s + x.spentCrore, 0), 0)),
      t('{0} schemes run more than a year behind their target completion date, the longest by {1} days.', formatNumber(schemes.filter((s) => s.delayDays > 365).length), formatNumber(Math.max(0, ...schemes.map((s) => s.delayDays)))),
      densest && densest.rows.length > 0
        ? t('{0} carries the largest concentration in scope - {1} settlements holding an estimated {2} residents, of which {3} are flagged flood-prone.', fullWard(densest.wardId), formatNumber(densest.rows.length), formatCompact(densest.rows.reduce((s, x) => s + x.estimatedPopulation, 0)), formatNumber(densest.rows.filter((x) => x.floodProne).length))
        : t('Settlement provision is spread evenly across the wards in scope; no single ward dominates the survey register.'),
    ],
    supportingTable: {
      caption: t('Settlements by service adequacy, weakest first'),
      columns: [t('Settlement'), t('Ward'), t('Recognition'), t('Persons per water point'), t('Persons per toilet seat'), t('Service index'), t('Redevelopment')],
      rows: rows.map((s) => [
        s.name,
        fullWard(s.wardId),
        SETTLEMENT_RECOGNITION_LABEL[s.recognition],
        formatNumber(s.personsPerWaterPoint),
        formatNumber(s.personsPerToiletSeat),
        formatNumber(s.serviceIndex),
        s.redevelopment.replace(/-/g, ' '),
      ]),
    },
    visuals: [
      metricsVisual('housing-headline', [
        { label: t('Settlements'), value: formatNumber(settlements.length), support: 'within authorised scope' },
        { label: t('Surveyed population'), value: formatCompact(population), support: 'aggregate survey estimate' },
        { label: t('Persons per toilet seat'), value: formatNumber(toiletSeat), tone: toneFor(toiletSeat / 2, false) },
        { label: t('Flood-prone'), value: formatNumber(floodProne.length), support: 'settlements flagged', tone: floodProne.length > 0 ? 'warn' : 'positive' },
        { label: t('Households in transit'), value: formatNumber(inTransit), support: 'awaiting rehousing' },
      ]),
      rankedBarVisual({
        id: 'housing-service-index',
        caption: t('Settlement service adequacy index, weakest first'),
        unit: 'index',
        higherIsBetter: true,
        data: rows.map((s) => ({ label: s.name, value: s.serviceIndex })),
      }),
    ],
    recommendedActions: [
      recommend({
        id: 'rec-housing-service',
        title: t('Commission a basic services survey of {0} and the settlements ranked with it', rows[0]!.name),
        why: `${rows[0]!.name} in ${fullWard(rows[0]!.wardId)} records a service index of ${formatNumber(rows[0]!.serviceIndex)} with ${formatNumber(rows[0]!.personsPerToiletSeat)} residents per toilet seat. Restoring the ${formatNumber(seatsOutOfUse)} seats already installed but not functioning across scope is a maintenance act, not a capital one.`,
        expectedImpact: t('Separates the provision deficit that needs capital from the maintenance deficit that needs only a works order, which is the distinction the settlement figures currently conceal.'),
        departmentId: 'dept-housing',
        humanOwnerRole: t('Deputy Municipal Commissioner (Improvements)'),
        confidence: 'medium',
        dependencies: [t('Ward engineering staff availability'), t('Water Department connection sanction for new standposts')],
        risks: [t('A survey without a maintenance budget attached restates a known deficit without moving it')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    ],
    caveats: [
      t('Population and household counts are aggregate estimates from the corporation\'s own settlement survey, some of it several years old. They are not a census and they are not a household register.'),
      t('The recognition classification governs service entitlement only. It carries no finding about tenure, legality or any resident\'s rights.'),
    ],
    followUps: [
      t('Which slum settlements carry the weakest basic service provision?'),
      t('What is the public toilet and amenity adequacy position?'),
      t('What is the status of council resolutions?'),
    ],
    register: 'Slum Improvement Settlement Survey Register (simulated)',
  })
}

/* ==========================================================================
   Welfare - social welfare schemes
   ========================================================================== */

const welfare: AnswerHandler = (ctx) => {
  const denied = domainDenial(ctx, 'the welfare scheme register', 'intelligence')
  if (denied) return denied
  if (WELFARE_SCHEMES.length === 0) {
    return emptyAnswer(ctx, 'welfare scheme', 'No scheme is currently recorded on the welfare register.')
  }
  const eligible = WELFARE_SCHEMES.reduce((s, x) => s + x.eligibleBeneficiaries, 0)
  const enrolled = WELFARE_SCHEMES.reduce((s, x) => s + x.enrolledBeneficiaries, 0)
  const paid = WELFARE_SCHEMES.reduce((s, x) => s + x.disbursedThisMonth, 0)
  const arrears = WELFARE_SCHEMES.reduce((s, x) => s + x.arrearsLakh, 0)
  const gap = eligible - enrolled
  const ranked = [...WELFARE_SCHEMES].sort(
    (a, b) => (b.eligibleBeneficiaries - b.enrolledBeneficiaries) - (a.eligibleBeneficiaries - a.enrolledBeneficiaries),
  )
  const rows = ranked.slice(0, rowLimit(ctx))
  const move = WELFARE_TREND.length >= 2 ? { latest: WELFARE_TREND[WELFARE_TREND.length - 1]!, previous: WELFARE_TREND[WELFARE_TREND.length - 2]! } : undefined
  const evidence = bestEvidence(ctx.user, { kinds: ['derived-metric', 'financial-record'], count: 4 })

  return finish(ctx, 'welfare', evidence, {
    answer:
      `Across ${formatNumber(WELFARE_SCHEMES.length)} schemes the corporation administers, ${formatCompact(enrolled)} residents are on the rolls against ${formatCompact(eligible)} assessed as entitled - a coverage gap of ${formatCompact(gap)} residents, or ${formatPercent(share(gap, eligible))} of the eligible population. `
      + `Of those enrolled, ${formatCompact(paid)} were paid this month; the ${formatCompact(enrolled - paid)} who were not are held up by administrative causes - an account not seeded, a life certificate outstanding, a ward sanction pending - and each is a household that did not receive money it is entitled to. `
      + `Accrued unpaid entitlement stands at ₹${formatNumber(arrears)} lakh. The register is scheme-level and corporation-wide; it holds no beneficiary, no household and no entitlement determination, and cannot be resolved to a ward.`,
    keyFindings: [
      ...rows.map(
        (s) =>
          t('{0} ({1}) - {2} enrolled of {3} eligible, gap {4}, {5} paid this month, mean delay {6} days, arrears ₹{7} lakh.', s.name, WELFARE_SCHEME_KIND_LABEL[s.kind].toLowerCase(), formatCompact(s.enrolledBeneficiaries), formatCompact(s.eligibleBeneficiaries), formatCompact(s.eligibleBeneficiaries - s.enrolledBeneficiaries), formatCompact(s.disbursedThisMonth), formatNumber(s.meanDisbursementDelayDays, 1), formatNumber(s.arrearsLakh)),
      ),
      t('The widest gaps sit on the schemes that require documentary proof before the corporation will consider an applicant - a disability certificate, a death certificate - which is the single largest structural cause of non-enrolment in Indian welfare administration. Correlation with scheme type is observed here; causation is not established by these figures.'),
      move
        ? t('Disbursement moved from ₹{0} lakh to ₹{1} lakh month on month ({2}), on {3} new enrolments - the only figure on this register that closes the coverage gap.', formatNumber(move.previous.disbursed), formatNumber(move.latest.disbursed), formatDelta(share(move.latest.disbursed - move.previous.disbursed, move.previous.disbursed)), formatNumber(move.latest.newEnrolments))
        : t('{0} schemes carry a mean disbursement delay beyond twenty days. A pension paid late is a pension that did not arrive when the rent was due.', formatNumber(WELFARE_SCHEMES.filter((s) => s.meanDisbursementDelayDays > 20).length)),
    ],
    supportingTable: {
      caption: t('Welfare schemes by coverage gap, widest first'),
      columns: [t('Scheme'), t('Type'), t('Eligible'), t('Enrolled'), t('Coverage gap'), t('Paid this month'), t('Mean delay'), t('Arrears')],
      rows: rows.map((s) => [
        s.name,
        WELFARE_SCHEME_KIND_LABEL[s.kind],
        formatCompact(s.eligibleBeneficiaries),
        formatCompact(s.enrolledBeneficiaries),
        formatCompact(s.eligibleBeneficiaries - s.enrolledBeneficiaries),
        formatCompact(s.disbursedThisMonth),
        `${formatNumber(s.meanDisbursementDelayDays, 1)} d`,
        t('₹{0} L', formatNumber(s.arrearsLakh)),
      ]),
    },
    visuals: [
      metricsVisual('welfare-headline', [
        { label: t('Schemes'), value: formatNumber(WELFARE_SCHEMES.length) },
        { label: t('Eligible'), value: formatCompact(eligible), support: 'assessed entitled' },
        { label: t('Coverage gap'), value: formatCompact(gap), support: formatPercent(share(gap, eligible)), tone: toneFor(share(gap, eligible), false) },
        { label: t('Paid this month'), value: formatCompact(paid), support: `${formatPercent(share(paid, enrolled))} of enrolment`, tone: toneFor(share(paid, enrolled), true) },
        { label: t('Arrears'), value: `₹${formatNumber(arrears)} L`, tone: 'warn' },
      ]),
      compositionVisual({
        id: 'welfare-coverage',
        caption: t('Eligible population: paid, enrolled but unpaid, and not enrolled'),
        segments: [
          { id: 'paid', label: t('Paid this month'), value: paid, colour: VISUAL_COLOUR.ok },
          { id: 'unpaid', label: t('Enrolled, not paid this month'), value: Math.max(0, enrolled - paid), colour: VISUAL_COLOUR.warn },
          { id: 'gap', label: t('Eligible, not enrolled'), value: Math.max(0, gap), colour: VISUAL_COLOUR.crit },
        ],
      }),
    ],
    recommendedActions: [
      recommend({
        id: 'rec-welfare-gap',
        title: t('Run an assisted enrolment drive against the {0}-resident gap on {1}', formatCompact(rows[0]!.eligibleBeneficiaries - rows[0]!.enrolledBeneficiaries), rows[0]!.name),
        why: `${rows[0]!.name} reaches ${formatPercent(share(rows[0]!.enrolledBeneficiaries, rows[0]!.eligibleBeneficiaries))} of its eligible population. Residents outside a scheme are by definition the least able to complain about being outside it, so the gap will not close through the grievance channel.`,
        expectedImpact: t('Converts a documented eligibility gap into enrolments through ward-office camps, which is the only mechanism on this register that closes it.'),
        departmentId: 'dept-commissioner',
        humanOwnerRole: t('Deputy Municipal Commissioner (Special) - the duty sits with the Community Development Officer'),
        confidence: 'medium',
        dependencies: [t('Ward office counter capacity'), t('Certification support from the sanctioning authority for disability and widow schemes')],
        risks: [t('Enrolment beyond the sanctioned provision creates an entitlement the welfare reserve cannot pay, converting a coverage gap into an arrears position')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    ],
    caveats: [
      t('Every figure here is scheme-level and aggregate. There is no beneficiary, no household, no bank account and no entitlement determination in this platform, and the coverage gap cannot be resolved to named residents.'),
      t('The eligible population is an assessment against each scheme\'s own criteria, not an enumerated register. A gap therefore measures assessed entitlement against enrolment, and both sides carry estimation error.'),
    ],
    followUps: [
      t('What is the urban livelihoods position?'),
      t('What is the birth and death registration position?'),
      t('What is the status of council resolutions?'),
    ],
    register: 'Welfare Scheme Disbursement Register (simulated)',
  })
}

/* ==========================================================================
   Livelihoods - urban poverty alleviation and street vending
   ========================================================================== */

const livelihoods: AnswerHandler = (ctx) => {
  const denied = domainDenial(ctx, 'the Urban Poverty Alleviation register')
  if (denied) return denied
  const centres = LIVELIHOOD_CENTRES.filter((c) => inScope(ctx, c.wardId))
  const zones = VENDOR_ZONES.filter((z) => inScope(ctx, z.wardId))
  if (centres.length === 0 && zones.length === 0) {
    return emptyAnswer(ctx, 'urban livelihoods', 'No livelihood centre or vending zone within scope is on the Urban Poverty Alleviation register.')
  }
  const trained = centres.reduce((s, x) => s + x.trainedLast12m, 0)
  const placement = trained > 0 ? centres.reduce((s, x) => s + x.trainedLast12m * x.placedInWorkPct, 0) / trained : 0
  const groups = centres.reduce((s, x) => s + x.selfHelpGroups, 0)
  const bankLinked = mean(centres.map((c) => c.shgBankLinkedPct))
  const registered = zones.reduce((s, x) => s + x.registeredVendors, 0)
  const certificates = zones.reduce((s, x) => s + x.certificatesOfVendingIssued, 0)
  const shortfall = registered - certificates
  const ranked = [...zones].sort(
    (a, b) => (b.registeredVendors - b.certificatesOfVendingIssued) - (a.registeredVendors - a.certificatesOfVendingIssued),
  )
  const rows = ranked.slice(0, rowLimit(ctx))
  const move = movement(ctx, LIVELIHOOD_TREND)
  const evidence = bestEvidence(ctx.user, { wardIds: scopeIds(ctx), kinds: ['inspection', 'derived-metric'], count: 4 })

  return finish(ctx, 'livelihoods', evidence, {
    answer:
      `${formatNumber(zones.length)} vending zones within scope carry ${formatCompact(registered)} vendors on the register against ${formatCompact(certificates)} certificates of vending actually issued - a shortfall of ${formatCompact(shortfall)}. `
      + `Under section 4 of the Street Vendors Act, 2014 the certificate follows the survey as an entitlement, so that shortfall records a duty the corporation has not yet discharged. It is not a measure of anything the vendors did. `
      + `${formatNumber(centres.length)} livelihood centres trained ${formatCompact(trained)} people over the last twelve months, of whom ${formatPercent(placement)} were in work three months after completion, weighted by batch size.`,
    keyFindings: [
      ...rows.map(
        (z) =>
          t('{0} ({1}) - {2} registered against {3} sanctioned places, {4} certificates issued, shortfall {5}; statutory survey {6}, Town Vending Committee {7}.', z.name, fullWard(z.wardId), formatCompact(z.registeredVendors), formatNumber(z.sanctionedVendingCapacity), formatCompact(z.certificatesOfVendingIssued), formatCompact(z.registeredVendors - z.certificatesOfVendingIssued), z.surveyCompleted ? 'complete' : t('not complete'), z.townVendingCommitteeConstituted ? 'constituted' : t('not constituted')),
      ),
      t('{0} zones in scope have no constituted Town Vending Committee, which is the body the Act requires before a certificate can lawfully issue.', formatNumber(zones.filter((z) => !z.townVendingCommitteeConstituted).length)),
      t('{0} self-help groups are active against these centres, {1} of them bank-linked. Bank linkage is what converts a group from a meeting into working capital.', formatNumber(groups), formatPercent(bankLinked)),
      move
        ? t('Corporation-wide, placement moved from {0} to {1} against {2} trained in the month, and {3} certificates issued.', formatNumber(move.previous.placed), formatNumber(move.latest.placed), formatNumber(move.latest.trained), formatNumber(move.latest.certificatesIssued))
        : t('{0} centres are serving more people than they are sanctioned for, which is a statement about what the corporation provided rather than about the people served.', formatNumber(centres.filter((c) => c.currentBeneficiaries > c.capacity).length)),
    ],
    supportingTable: {
      caption: t('Vending zones by certificate shortfall against the register'),
      columns: [t('Zone'), t('Ward'), t('Sanctioned places'), t('Registered'), t('Certificates issued'), t('Shortfall'), t('Survey'), t('Town Vending Committee')],
      rows: rows.map((z) => [
        z.name,
        fullWard(z.wardId),
        formatNumber(z.sanctionedVendingCapacity),
        formatCompact(z.registeredVendors),
        formatCompact(z.certificatesOfVendingIssued),
        formatCompact(z.registeredVendors - z.certificatesOfVendingIssued),
        z.surveyCompleted ? t('Complete') : t('Outstanding'),
        z.townVendingCommitteeConstituted ? t('Constituted') : t('Not constituted'),
      ]),
    },
    visuals: [
      metricsVisual('livelihoods-headline', [
        { label: t('Vending zones'), value: formatNumber(zones.length) },
        { label: t('Certificate shortfall'), value: formatCompact(shortfall), support: `${formatPercent(share(shortfall, registered))} of the register`, tone: toneFor(share(shortfall, registered), false) },
        { label: t('Trained (12 months)'), value: formatCompact(trained) },
        { label: t('In work at 3 months'), value: formatPercent(placement), tone: toneFor(placement, true) },
        { label: t('SHG bank linkage'), value: formatPercent(bankLinked), tone: toneFor(bankLinked, true) },
      ]),
      rankedBarVisual({
        id: 'livelihoods-shortfall',
        caption: t('Certificates of vending outstanding, by zone'),
        unit: 'vendors',
        higherIsBetter: false,
        data: rows.map((z) => ({ label: z.name, value: z.registeredVendors - z.certificatesOfVendingIssued })),
      }),
    ],
    recommendedActions: [
      recommend({
        id: 'rec-livelihoods-certificates',
        title: t('Clear the certificate of vending backlog in {0}', rows.length > 0 ? rows[0]!.name : 'the surveyed zones'),
        why: `${formatCompact(shortfall)} surveyed vendors across scope hold no certificate. The Act makes issue a duty once the survey is complete, and a vendor without the certificate remains exposed to eviction from a pitch the corporation has already recognised.`,
        expectedImpact: t('Discharges a statutory obligation already triggered by the completed survey, and removes the principal cause of contested evictions in recognised zones.'),
        departmentId: 'dept-commissioner',
        humanOwnerRole: t('Chairperson, Town Vending Committee (Municipal Commissioner)'),
        confidence: 'medium',
        dependencies: [t('Town Vending Committee constitution where it is outstanding'), t('Ward-level survey verification')],
        risks: [t('Issuing against an incomplete survey creates a certificate the committee may later have to revisit')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    ],
    caveats: [
      t('The vendor register counts enumerated pitches, not people, and holds no vendor identity, income assessment or eligibility determination.'),
      t('Placement is reported by the training centre three months after completion and is not verified against any independent employment record.'),
    ],
    followUps: [
      t('What is the welfare scheme disbursement position?'),
      t('What is the trade licensing and enforcement position?'),
      t('What is the municipal market hygiene position?'),
    ],
    register: 'Urban Poverty Alleviation Cell Register (simulated)',
  })
}

/* ==========================================================================
   Licensing - trade licences and enforcement
   ========================================================================== */

const licensing: AnswerHandler = (ctx) => {
  const denied = domainDenial(ctx, 'the trade licence register')
  if (denied) return denied
  const registers = LICENCE_REGISTERS.filter((r) => inScope(ctx, r.wardId))
  if (registers.length === 0) {
    return emptyAnswer(ctx, 'trade licence', 'No licence register within scope could be read.')
  }
  const categories = Array.from(new Set(registers.map((r) => r.category)))
  const byCategory = categories
    .map((category) => {
      const rows = registers.filter((r) => r.category === category)
      const active = rows.reduce((s, x) => s + x.active, 0)
      return {
        category,
        active,
        expired: rows.reduce((s, x) => s + x.expired, 0),
        pending: rows.reduce((s, x) => s + x.pending, 0),
        decisionDays: mean(rows.map((r) => r.meanDecisionDays)),
        charter: active > 0 ? rows.reduce((s, x) => s + x.active * x.charterCompliancePct, 0) / active : 0,
        demanded: rows.reduce((s, x) => s + x.feeDemandedLakh, 0),
        collected: rows.reduce((s, x) => s + x.feeCollectedLakh, 0),
        detected: rows.reduce((s, x) => s + x.unlicensedDetected, 0),
        notices: rows.reduce((s, x) => s + x.noticesIssued, 0),
      }
    })
    .sort((a, b) => a.charter - b.charter)
  const rows = byCategory.slice(0, rowLimit(ctx))
  const active = byCategory.reduce((s, x) => s + x.active, 0)
  const expired = byCategory.reduce((s, x) => s + x.expired, 0)
  const demanded = byCategory.reduce((s, x) => s + x.demanded, 0)
  const collected = byCategory.reduce((s, x) => s + x.collected, 0)
  const detected = byCategory.reduce((s, x) => s + x.detected, 0)
  const evidence = bestEvidence(ctx.user, { wardIds: scopeIds(ctx), kinds: ['source-record', 'financial-record'], count: 4 })

  return finish(ctx, 'licensing', evidence, {
    answer:
      `${formatCompact(active)} licences are current across ${formatNumber(categories.length)} categories within scope, with ${formatCompact(expired)} lapsed and not renewed and ${formatCompact(byCategory.reduce((s, x) => s + x.pending, 0))} applications lodged and undecided. `
      + `Fee realisation stands at ₹${formatNumber(collected)} lakh against a demand of ₹${formatNumber(demanded)} lakh, or ${formatPercent(share(collected, demanded))}. `
      + `${formatCompact(detected)} premises are recorded as trading without a current licence and ${formatCompact(byCategory.reduce((s, x) => s + x.notices, 0))} notices have issued against them - these are register entries and enforcement candidates, not findings against any trader.`,
    keyFindings: [
      ...rows.map(
        (c) =>
          t('{0} - {1} active, {2} lapsed, {3} pending, mean decision {4} working days, citizens\' charter compliance {5}, {6} premises detected without a current licence.', LICENCE_CATEGORY_LABEL[c.category], formatCompact(c.active), formatCompact(c.expired), formatCompact(c.pending), formatNumber(c.decisionDays, 1), formatPercent(c.charter), formatCompact(c.detected)),
      ),
      t('Renewal discipline: {0} of the combined register has lapsed. A lapsed licence is a renewal failure on both sides of the counter, and the split between the two is not recoverable from this register.', formatPercent(share(expired, active + expired))),
      t('{0} categories take more than twenty-one working days to decide an application on average, which is where an applicant\'s incentive to trade without waiting is created.', formatNumber(byCategory.filter((c) => c.decisionDays > 21).length)),
    ],
    supportingTable: {
      caption: t('Licence categories by citizens\' charter compliance, weakest first'),
      columns: [t('Category'), t('Active'), t('Lapsed'), t('Pending'), t('Mean decision'), t('Charter compliance'), t('Fee realised'), t('Detected unlicensed')],
      rows: rows.map((c) => [
        LICENCE_CATEGORY_LABEL[c.category],
        formatCompact(c.active),
        formatCompact(c.expired),
        formatCompact(c.pending),
        `${formatNumber(c.decisionDays, 1)} d`,
        formatPercent(c.charter),
        t('₹{0} L', formatNumber(c.collected)),
        formatCompact(c.detected),
      ]),
    },
    visuals: [
      metricsVisual('licensing-headline', [
        { label: t('Active licences'), value: formatCompact(active) },
        { label: t('Lapsed'), value: formatCompact(expired), support: `${formatPercent(share(expired, active + expired))} of the register`, tone: toneFor(share(expired, active + expired), false) },
        { label: t('Fee realisation'), value: formatPercent(share(collected, demanded)), support: `₹${formatNumber(collected)} L of ₹${formatNumber(demanded)} L`, tone: toneFor(share(collected, demanded), true) },
        { label: t('Detected unlicensed'), value: formatCompact(detected), support: 'enforcement candidates' },
      ]),
      rankedBarVisual({
        id: 'licensing-charter',
        caption: t('Citizens\' charter compliance by licence category'),
        unit: '%',
        higherIsBetter: true,
        data: rows.map((c) => ({ label: LICENCE_CATEGORY_LABEL[c.category], value: Math.round(c.charter * 10) / 10 })),
      }),
    ],
    recommendedActions: [
      recommend({
        id: 'rec-licensing-charter',
        title: t('Review decision turnaround on {0} applications', LICENCE_CATEGORY_LABEL[rows[0]!.category].toLowerCase()),
        why: `Charter compliance on this category stands at ${formatPercent(rows[0]!.charter)} with a mean decision time of ${formatNumber(rows[0]!.decisionDays, 1)} working days against ${formatCompact(rows[0]!.pending)} applications pending. Slow decisions and unlicensed trading appear together in the register; the direction of that relationship is not established by these figures.`,
        expectedImpact: t('Identifies whether the delay sits at scrutiny, at inspection or at sanction, which determines whether the correction is procedural or a staffing one.'),
        departmentId: 'dept-licence',
        humanOwnerRole: t('Superintendent, Licence Department'),
        confidence: 'medium',
        dependencies: [t('Ward licence inspector availability'), t('Fire and health no-objection turnaround where the category requires one')],
        risks: [t('Compressing decision time without inspection capacity moves the risk from the counter to the premises')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    ],
    caveats: [
      t('A premises recorded as trading without a current licence is a register entry and an enforcement candidate. It is not a finding of guilt, and no adverse inference about any trader may be drawn from it.'),
      t('Fee demand and realisation are drawn from the licence register rather than the treasury ledger, so a receipt not yet reconciled will read as an outstanding demand.'),
    ],
    followUps: [
      t('What is the municipal market hygiene position?'),
      t('What is the urban livelihoods position?'),
      t('What is the public toilet and amenity adequacy position?'),
    ],
    register: 'Licence Department Trade Register (simulated)',
  })
}

/* ==========================================================================
   Registration - births and deaths
   ========================================================================== */

const registration: AnswerHandler = (ctx) => {
  const denied = domainDenial(ctx, 'the births and deaths registration record')
  if (denied) return denied
  const centres = REGISTRATION_CENTRES.filter((c) => inScope(ctx, c.wardId))
  if (centres.length === 0) {
    return emptyAnswer(ctx, 'registration centre', 'No registration centre within scope is on the vital statistics register.')
  }
  const births = centres.reduce((s, x) => s + x.birthsRegistered30d, 0)
  const deaths = centres.reduce((s, x) => s + x.deathsRegistered30d, 0)
  const events = births + deaths
  const withinPeriod = events > 0
    ? centres.reduce((s, x) => s + (x.birthsRegistered30d + x.deathsRegistered30d) * x.withinStatutoryPeriodPct, 0) / events
    : 0
  const late = centres.reduce((s, x) => s + x.lateRegistrations30d, 0)
  const certificates = centres.reduce((s, x) => s + x.certificatesIssued30d, 0)
  const backlog = centres.reduce((s, x) => s + x.backlog, 0)
  const issueDays = mean(centres.map((c) => c.meanIssueDays))
  const digital = mean(centres.map((c) => c.digitalSharePct))
  const rows = [...centres].sort((a, b) => b.backlog - a.backlog).slice(0, rowLimit(ctx))
  const move = movement(ctx, REGISTRATION_TREND)
  const evidence = bestEvidence(ctx.user, { wardIds: scopeIds(ctx), kinds: ['source-record', 'derived-metric'], count: 4 })

  return finish(ctx, 'registration', evidence, {
    answer:
      `${formatNumber(centres.length)} registration centres within scope recorded ${formatCompact(births)} births and ${formatCompact(deaths)} deaths over the last thirty days, ${formatPercent(withinPeriod)} of them within the twenty-one day statutory period. `
      + `${formatCompact(late)} events were registered late and now require a delayed registration order, which is a counter visit the family would not otherwise have had to make. `
      + `${formatCompact(certificates)} certificates issued in the same period at a mean of ${formatNumber(issueDays, 1)} working days, with ${formatCompact(backlog)} applications outstanding across the centres in scope.`,
    keyFindings: [
      ...rows.map(
        (c) =>
          t('{0} ({1}, {2}) - {3} births and {4} deaths in thirty days, {5} within the statutory period, mean issue {6} days, backlog {7}.', c.name, fullWard(c.wardId), c.kind === 'hospital-unit' ? t('hospital unit') : t('ward office'), formatCompact(c.birthsRegistered30d), formatCompact(c.deathsRegistered30d), formatPercent(c.withinStatutoryPeriodPct), formatNumber(c.meanIssueDays, 1), formatCompact(c.backlog)),
      ),
      t('{0} centres register fewer than nine in ten events inside the statutory period. Late registration falls hardest on families who need the certificate to claim a benefit, settle a tenancy or enrol a child.', formatNumber(centres.filter((c) => c.withinStatutoryPeriodPct < 90).length)),
      t('Digital request share averages {0}. Every counter visit avoided is a working day returned to a resident who is usually taking unpaid leave to make it.', formatPercent(digital)),
      move
        ? t('Corporation-wide, the monthly return moved to {0} births and {1} deaths from {2} and {3}, on {4} certificates issued.', formatCompact(move.latest.births), formatCompact(move.latest.deaths), formatCompact(move.previous.births), formatCompact(move.previous.deaths), formatCompact(move.latest.certificatesIssued))
        : t('Certificates issued run at {0} per registered event, reflecting repeat copies requested against a single registration.', formatNumber(share(certificates, events) / 100, 2)),
    ],
    supportingTable: {
      caption: t('Registration centres by outstanding certificate backlog'),
      columns: [t('Centre'), t('Ward'), t('Type'), t('Births (30d)'), t('Deaths (30d)'), t('Within 21 days'), t('Mean issue'), t('Backlog')],
      rows: rows.map((c) => [
        c.name,
        fullWard(c.wardId),
        c.kind === 'hospital-unit' ? t('Hospital unit') : t('Ward office'),
        formatCompact(c.birthsRegistered30d),
        formatCompact(c.deathsRegistered30d),
        formatPercent(c.withinStatutoryPeriodPct),
        `${formatNumber(c.meanIssueDays, 1)} d`,
        formatCompact(c.backlog),
      ]),
    },
    visuals: [
      metricsVisual('registration-headline', [
        { label: t('Births (30 days)'), value: formatCompact(births) },
        { label: t('Deaths (30 days)'), value: formatCompact(deaths) },
        { label: t('Within statutory period'), value: formatPercent(withinPeriod), tone: toneFor(withinPeriod, true) },
        { label: t('Mean issue time'), value: `${formatNumber(issueDays, 1)} d`, tone: toneFor(issueDays * 7, false) },
        { label: t('Backlog'), value: formatCompact(backlog), support: 'applications outstanding', tone: backlog > 0 ? 'warn' : 'positive' },
      ]),
      rankedBarVisual({
        id: 'registration-backlog',
        caption: t('Outstanding certificate applications by centre'),
        unit: 'applications',
        higherIsBetter: false,
        data: rows.map((c) => ({ label: c.name, value: c.backlog })),
      }),
    ],
    recommendedActions: [
      recommend({
        id: 'rec-registration-backlog',
        title: t('Clear the certificate backlog at {0}', rows[0]!.name),
        why: `${rows[0]!.name} holds ${formatCompact(rows[0]!.backlog)} outstanding applications at a mean issue time of ${formatNumber(rows[0]!.meanIssueDays, 1)} working days, with ${formatPercent(rows[0]!.withinStatutoryPeriodPct)} of events registered inside the statutory period.`,
        expectedImpact: t('Returns the certificate to the family within the charter commitment, and removes the delayed registration order from the path of those already registering late.'),
        departmentId: 'dept-registration',
        humanOwnerRole: t('Registrar of Births and Deaths'),
        confidence: 'medium',
        dependencies: [t('Counter staffing at the ward office'), t('Hospital unit return discipline for events registered at source')],
        risks: [t('Clearing a backlog by relaxing verification transfers the error into the register itself, where it is far harder to correct')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    ],
    caveats: [
      t('This register counts registration events and certificates. It holds no name, no parent, no address and no cause of death - the statutory register itself remains with the Registrar and is not reproduced here.'),
      t('Registration counts reflect where an event was registered, not where it occurred. A hospital unit draws events from well beyond its own ward.'),
    ],
    followUps: [
      t('What is the cemetery and crematorium capacity position?'),
      t('What is the welfare scheme disbursement position?'),
      t('What is the status of council resolutions?'),
    ],
    register: 'Vital Statistics Registration System (simulated)',
  })
}

/* ==========================================================================
   Deathcare - cemeteries and crematoria
   ========================================================================== */

const deathcare: AnswerHandler = (ctx) => {
  const denied = domainDenial(ctx, 'the cemetery and crematorium facility register')
  if (denied) return denied
  const grounds = BURIAL_GROUNDS.filter((g) => inScope(ctx, g.wardId))
  if (grounds.length === 0) {
    return emptyAnswer(ctx, 'cemetery or crematorium', 'No burial ground or crematorium within scope is on the facility register.')
  }
  const cremations = grounds.reduce((s, x) => s + x.cremations30d, 0)
  const burials = grounds.reduce((s, x) => s + x.burials30d, 0)
  const rites = cremations + burials
  const wait = rites > 0
    ? grounds.reduce((s, x) => s + (x.cremations30d + x.burials30d) * x.meanWaitHours, 0) / rites
    : mean(grounds.map((g) => g.meanWaitHours))
  const electric = cremations > 0
    ? grounds.reduce((s, x) => s + x.cremations30d * x.electricGasSharePct, 0) / cremations
    : 0
  const underTen = grounds.filter((g) => g.estimatedYearsRemaining < 10)
  const rows = [...grounds].sort((a, b) => a.estimatedYearsRemaining - b.estimatedYearsRemaining).slice(0, rowLimit(ctx))
  const communities = Array.from(new Set(grounds.map((g) => g.community)))
  const move = movement(ctx, DEATHCARE_TREND)
  const evidence = bestEvidence(ctx.user, { wardIds: scopeIds(ctx), kinds: ['source-record', 'field-report'], count: 4 })

  return finish(ctx, 'deathcare', evidence, {
    answer:
      `${formatNumber(grounds.length)} cemeteries and crematoria within scope performed ${formatCompact(cremations)} cremations and ${formatCompact(burials)} burials over the last thirty days, at a volume-weighted mean wait of ${formatNumber(wait, 1)} hours from arrival at the gate to the commencement of the rite. That wait is the dignity of the service stated as a number. `
      + `${formatNumber(underTen.length)} facilities hold under ten years of capacity at their current rate. Land consumed by a burial ground is not recoverable and a replacement site needs a willing seller, a consenting neighbourhood and years of lead time, so a shortening horizon is a planning finding today rather than a crisis later. `
      + `${formatPercent(electric)} of cremations are performed on electric or piped-gas furnaces, which is the one lever available quickly where land cannot be found.`,
    keyFindings: [
      ...rows.map(
        (g) =>
          t('{0} ({1}, {2}, {3}) - {4} capacity remaining, about {5} years at the current rate, mean wait {6} hours, last upgraded {7}.', g.name, fullWard(g.wardId), BURIAL_GROUND_KIND_LABEL[g.kind].toLowerCase(), BURIAL_GROUND_COMMUNITY_LABEL[g.community], formatPercent(g.capacityRemainingPct, 0), formatNumber(g.estimatedYearsRemaining, 1), formatNumber(g.meanWaitHours, 1), formatRelative(g.lastUpgradedAt)),
      ),
      t('Provision is not fungible between communities: {0} community designations are served within scope, and a city with ample cremation capacity but no burial ground within reach of the families who need one has not discharged this duty.', formatNumber(communities.length)),
      t('{0} facilities record a mean wait beyond three hours. A grieving family standing at a gate is the outcome measure on this duty, not the throughput figure.', formatNumber(grounds.filter((g) => g.meanWaitHours > 3).length)),
      move
        ? t('Corporation-wide monthly volumes moved to {0} cremations and {1} burials from {2} and {3}.', formatCompact(move.latest.cremations), formatCompact(move.latest.burials), formatCompact(move.previous.cremations), formatCompact(move.previous.burials))
        : t('Mean remaining capacity across the facilities in scope is {0}.', formatPercent(mean(grounds.map((g) => g.capacityRemainingPct)), 0)),
    ],
    supportingTable: {
      caption: t('Cemeteries and crematoria by remaining years of capacity, shortest first'),
      columns: [t('Facility'), t('Ward'), t('Kind'), t('Community'), t('Capacity remaining'), t('Years remaining'), t('Mean wait'), t('Electric or gas')],
      rows: rows.map((g) => [
        g.name,
        fullWard(g.wardId),
        BURIAL_GROUND_KIND_LABEL[g.kind],
        BURIAL_GROUND_COMMUNITY_LABEL[g.community],
        formatPercent(g.capacityRemainingPct, 0),
        formatNumber(g.estimatedYearsRemaining, 1),
        `${formatNumber(g.meanWaitHours, 1)} h`,
        formatPercent(g.electricGasSharePct, 0),
      ]),
    },
    visuals: [
      metricsVisual('deathcare-headline', [
        { label: t('Facilities'), value: formatNumber(grounds.length) },
        { label: t('Rites (30 days)'), value: formatCompact(rites), support: `${formatCompact(cremations)} cremations, ${formatCompact(burials)} burials` },
        { label: t('Mean wait'), value: `${formatNumber(wait, 1)} h`, support: 'gate to commencement', tone: toneFor(wait * 20, false) },
        { label: t('Under ten years'), value: formatNumber(underTen.length), support: 'facilities nearing capacity', tone: underTen.length > 0 ? 'critical' : 'positive' },
        { label: t('Electric or gas'), value: formatPercent(electric), tone: toneFor(electric, true) },
      ]),
      rankedBarVisual({
        id: 'deathcare-years',
        caption: t('Estimated years of capacity remaining, shortest first'),
        unit: 'years',
        higherIsBetter: true,
        data: rows.map((g) => ({ label: g.name, value: Math.round(g.estimatedYearsRemaining * 10) / 10 })),
      }),
    ],
    recommendedActions: [
      recommend({
        id: 'rec-deathcare-capacity',
        title: t('Open a site search against {0} and the facilities behind it', rows[0]!.name),
        why: `${rows[0]!.name} in ${fullWard(rows[0]!.wardId)} holds about ${formatNumber(rows[0]!.estimatedYearsRemaining, 1)} years of capacity at its current rate, with ${formatPercent(rows[0]!.capacityRemainingPct, 0)} of the ground unconsumed. Acquiring a replacement site is among the slowest things a corporation ever does, which is why the search must begin while the horizon is still measured in years.`,
        expectedImpact: t('Converts an inevitable capacity exhaustion into a planned acquisition with community consultation, rather than an emergency arrangement at the point of failure.'),
        departmentId: 'dept-health',
        humanOwnerRole: t('Executive Health Officer'),
        confidence: 'medium',
        dependencies: [t('Land reservation in the development plan'), t('Consultation with the community the ground serves'), t('Improvement Committee reference')],
        risks: [t('A site identified without community consent is not a site'), t('Additional electric or gas capacity relieves cremation demand only, and does nothing for burial ground exhaustion')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    ],
    caveats: [
      t('This register holds facilities and their capacity. It carries no interment record, no name of any deceased person, no plot allotment and no family contact, and it must never acquire one.'),
      t('Years remaining is a projection at the current rate of use. A demographic shift, an epidemic or the closure of a neighbouring facility changes it sharply and without warning.'),
    ],
    followUps: [
      t('What is the birth and death registration position?'),
      t('What is the public toilet and amenity adequacy position?'),
      t('Where is the workforce vacancy position most acute?'),
    ],
    register: 'Cemeteries and Crematoria Facility Register (simulated)',
  })
}

/* ==========================================================================
   Markets - markets, slaughter houses and tanneries
   ========================================================================== */

const markets: AnswerHandler = (ctx) => {
  const denied = domainDenial(ctx, 'the market and slaughter house inspection register')
  if (denied) return denied
  const facilities = MUNICIPAL_MARKETS.filter((m) => inScope(ctx, m.wardId))
  if (facilities.length === 0) {
    return emptyAnswer(ctx, 'municipal market', 'No market, slaughter house or tannery within scope is on the facility register.')
  }
  const overdue = facilities.filter((m) => daysSince(m.lastInspectedAt) > MARKET_INSPECTION_INTERVAL_DAYS)
  const regulated = facilities.filter((m) => REGULATED_TRADE_KINDS.includes(m.kind))
  const effluentFailing = facilities.filter((m) => !m.effluentCompliant)
  const hygiene = mean(facilities.map((m) => m.hygieneScore))
  const violations = facilities.reduce((s, x) => s + x.openViolations, 0)
  const stalls = facilities.reduce((s, x) => s + x.stalls, 0)
  const occupied = facilities.reduce((s, x) => s + x.stallsOccupied, 0)
  const rent = facilities.reduce((s, x) => s + x.monthlyRentLakh, 0)
  const rows = [...facilities].sort((a, b) => daysSince(b.lastInspectedAt) - daysSince(a.lastInspectedAt)).slice(0, rowLimit(ctx))
  const move = movement(ctx, MARKET_INSPECTION_TREND)
  const evidence = bestEvidence(ctx.user, { wardIds: scopeIds(ctx), kinds: ['inspection', 'source-record'], count: 4 })

  return finish(ctx, 'markets', evidence, {
    answer:
      `${formatNumber(facilities.length)} market facilities within scope, of which ${formatNumber(regulated.length)} are slaughter houses or tanneries the corporation regulates rather than merely lets. `
      + `${formatNumber(overdue.length)} have not been inspected within the ${MARKET_INSPECTION_INTERVAL_DAYS}-day working interval, and the inspection interval - not the inspection count - is the control that matters, because inspections concentrated on compliant premises leave the same facilities unvisited as none at all. `
      + `Mean hygiene score is ${formatNumber(hygiene)} of 100 with ${formatNumber(violations)} violations open, and ${formatNumber(effluentFailing.length)} facilities are recorded outside trade effluent consent conditions.`,
    keyFindings: [
      ...rows.map(
        (m) =>
          t('{0} ({1}, {2}) - last inspected {3}, {4} days ago, hygiene {5}, {6} violations open, {7} of stalls let, {8}.', m.name, fullWard(m.wardId), MARKET_KIND_LABEL[m.kind].toLowerCase(), formatRelative(m.lastInspectedAt), formatNumber(daysSince(m.lastInspectedAt)), formatNumber(m.hygieneScore), formatNumber(m.openViolations), formatPercent(share(m.stallsOccupied, m.stalls), 0), m.effluentCompliant ? t('effluent within consent') : t('effluent outside consent')),
      ),
      t('{0} of the {1} regulated premises are overdue. An uninspected slaughter house is a public-health exposure inside the city\'s meat supply whether or not its fee has been paid.', formatNumber(regulated.filter((m) => daysSince(m.lastInspectedAt) > MARKET_INSPECTION_INTERVAL_DAYS).length), formatNumber(regulated.length)),
      t('{0} of {1} stalls and licensed bays are let, against a monthly rent and fee demand of ₹{2} lakh. Vacancy in a retail market is a revenue question; vacancy in an abattoir is a diversion question, because the trade does not stop when the licensed premises empty.', formatPercent(share(occupied, stalls)), formatCompact(stalls), formatNumber(rent)),
      move
        ? t('Corporation-wide the monthly return records {0} inspections against {1} the month before, finding {2} violations and issuing {3} licences.', formatNumber(move.latest.inspections), formatNumber(move.previous.inspections), formatNumber(move.latest.violationsFound), formatNumber(move.latest.licencesIssued))
        : t('{0} fish markets or slaughter houses in scope operate without cold storage on the premises.', formatNumber(facilities.filter((m) => !m.coldStorage && (m.kind === 'fish-market' || m.kind === 'slaughterhouse')).length)),
    ],
    supportingTable: {
      caption: t('Market facilities by time since last inspection, longest first'),
      columns: [t('Facility'), t('Ward'), t('Kind'), t('Hygiene'), t('Last inspected'), t('Days since'), t('Open violations'), t('Effluent')],
      rows: rows.map((m) => [
        m.name,
        fullWard(m.wardId),
        MARKET_KIND_LABEL[m.kind],
        formatNumber(m.hygieneScore),
        formatRelative(m.lastInspectedAt),
        formatNumber(daysSince(m.lastInspectedAt)),
        formatNumber(m.openViolations),
        m.effluentCompliant ? t('Within consent') : t('Outside consent'),
      ]),
    },
    visuals: [
      metricsVisual('markets-headline', [
        { label: t('Facilities'), value: formatNumber(facilities.length), support: `${formatNumber(regulated.length)} regulated trades` },
        { label: t('Overdue inspection'), value: formatNumber(overdue.length), support: `beyond ${MARKET_INSPECTION_INTERVAL_DAYS} days`, tone: toneFor(share(overdue.length, facilities.length), false) },
        { label: t('Mean hygiene score'), value: formatNumber(hygiene), tone: toneFor(hygiene, true) },
        { label: t('Open violations'), value: formatNumber(violations), tone: violations > 0 ? 'warn' : 'positive' },
        { label: t('Effluent outside consent'), value: formatNumber(effluentFailing.length), tone: effluentFailing.length > 0 ? 'critical' : 'positive' },
      ]),
      rankedBarVisual({
        id: 'markets-inspection-age',
        caption: t('Days since last recorded inspection'),
        unit: 'days',
        higherIsBetter: false,
        data: rows.map((m) => ({ label: m.name, value: daysSince(m.lastInspectedAt) })),
      }),
    ],
    recommendedActions: [
      recommend({
        id: 'rec-markets-inspection',
        title: t('Schedule inspection of the {0} facilities past the {1}-day interval, regulated trades first', formatNumber(overdue.length), MARKET_INSPECTION_INTERVAL_DAYS),
        why: `${rows[0]!.name} was last inspected ${formatNumber(daysSince(rows[0]!.lastInspectedAt))} days ago and carries a hygiene score of ${formatNumber(rows[0]!.hygieneScore)}. Interval, not volume, is the control: the register shows where the inspection effort has not been going.`,
        expectedImpact: t('Restores an even inspection interval across the estate, and re-establishes assurance over the premises the city\'s meat and fish supply passes through.'),
        departmentId: 'dept-health',
        humanOwnerRole: t('Executive Health Officer - market and slaughter house inspection wing'),
        confidence: 'high',
        dependencies: [t('Sanitary inspector deployment'), t('Veterinary officer availability for slaughter house inspection')],
        risks: [t('An inspection round without follow-up on the violations it finds converts a control into a formality')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    ],
    caveats: [
      t('The hygiene score and the violation count record the state of a facility at its last inspection. Where that inspection is months old, both describe a position the corporation has not verified since.'),
      t('Nothing on this register characterises the conduct of any trader, operator or licensee. A violation is an inspection observation against a premises and an enforcement candidate, not a finding against a person.'),
    ],
    followUps: [
      t('What is the trade licensing and enforcement position?'),
      t('What is the stray animal sterilisation position?'),
      t('What is the public toilet and amenity adequacy position?'),
    ],
    register: 'Market and Slaughter House Inspection Register (simulated)',
  })
}

/* ==========================================================================
   Animal welfare - sterilisation, pounds and the bite rate
   ========================================================================== */

const animalWelfare: AnswerHandler = (ctx) => {
  const denied = domainDenial(ctx, 'the animal welfare and veterinary register')
  if (denied) return denied
  const signals = WARD_ANIMAL_SIGNALS.filter((s) => inScope(ctx, s.wardId))
  if (signals.length === 0) {
    return emptyAnswer(ctx, 'animal welfare', 'No ward within scope carries an animal welfare signal or unit on the register.')
  }
  const units = ctx.scopeWards.flatMap((w) => animalWelfareUnitsInWard(w.id))
  const strays = signals.reduce((s, x) => s + x.estimatedStrayPopulation, 0)
  const sterilisedPct = strays > 0
    ? signals.reduce((s, x) => s + x.estimatedStrayPopulation * x.sterilisedPct, 0) / strays
    : 0
  const bites = signals.reduce((s, x) => s + x.dogBites30d, 0)
  const sterilisations = units.reduce((s, x) => s + x.sterilisations30d, 0)
  const vaccinations = units.reduce((s, x) => s + x.rabiesVaccinations30d, 0)
  const overCapacity = units.filter((u) => u.animalsInCare > u.capacity)
  const rows = [...signals].sort((a, b) => b.bitesPer10kPopulation - a.bitesPer10kPopulation).slice(0, rowLimit(ctx))
  const move = movement(ctx, ANIMAL_WELFARE_TREND)
  const evidence = bestEvidence(ctx.user, { wardIds: scopeIds(ctx), kinds: ['source-record', 'derived-metric'], count: 4 })

  return finish(ctx, 'animal-welfare', evidence, {
    answer:
      `Across ${formatNumber(signals.length)} wards in scope the modelled free-roaming dog population is ${formatCompact(strays)}, of which ${formatPercent(sterilisedPct)} is recorded sterilised and ear-notched. The Animal Birth Control (Dogs) Rules make sterilisation the lawful method, so that figure is the input the corporation controls. `
      + `The outcome is ${formatCompact(bites)} dog bite cases reported at municipal facilities over thirty days. Reporting the first without the second is reporting activity rather than results, so both are set out together here. `
      + `${formatNumber(units.length)} units performed ${formatCompact(sterilisations)} sterilisations and administered ${formatCompact(vaccinations)} anti-rabies doses in the same period.`,
    keyFindings: [
      ...rows.map((s) => {
        const wardUnits = animalWelfareUnitsInWard(s.wardId)
        return t('{0} - {1} bites per 10,000 residents ({2} cases in thirty days), {3} of an estimated {4} strays sterilised, {5} units in the ward performing {6} sterilisations.', fullWard(s.wardId), formatNumber(s.bitesPer10kPopulation, 1), formatCompact(s.dogBites30d), formatPercent(s.sterilisedPct), formatCompact(s.estimatedStrayPopulation), formatNumber(wardUnits.length), formatCompact(wardUnits.reduce((wardUnit, u) => wardUnit + u.sterilisations30d, 0)))
      }),
      t('{0} units hold more animals than they are sanctioned for, which is the most common welfare finding at a shelter or a pound and is a statement about provision rather than about the animals.', formatNumber(overCapacity.length)),
      t('{0} stray cattle were impounded in thirty days. Cattle loose on a carriageway are a road safety cause before they are a welfare case.', formatCompact(units.reduce((s, x) => s + x.cattleImpounded30d, 0))),
      move
        ? t('Corporation-wide, sterilisations moved {0} and reported bites {1} month on month. The inverse relationship between the two series is the case for the programme, and it is only readable over months.', formatDelta(share(move.latest.sterilisations - move.previous.sterilisations, move.previous.sterilisations)), formatDelta(share(move.latest.dogBites - move.previous.dogBites, move.previous.dogBites)))
        : t('{0} of {1} units are run by recognised partner organisations under contract, where the corporation\'s own inspection record is the only assurance it holds.', formatNumber(units.filter((u) => u.operatedBy === 'ngo-partner').length), formatNumber(units.length)),
    ],
    supportingTable: {
      caption: t('Ward animal welfare position: the input against the outcome'),
      columns: [t('Ward'), t('Units'), t('Estimated strays'), t('Sterilised'), t('Sterilisations (30d)'), t('Rabies doses (30d)'), t('Bites (30d)'), t('Bites per 10k')],
      rows: rows.map((s) => {
        const wardUnits = animalWelfareUnitsInWard(s.wardId)
        return [
          fullWard(s.wardId),
          formatNumber(wardUnits.length),
          formatCompact(s.estimatedStrayPopulation),
          formatPercent(s.sterilisedPct),
          formatCompact(wardUnits.reduce((wardUnit, u) => wardUnit + u.sterilisations30d, 0)),
          formatCompact(wardUnits.reduce((wardUnit, u) => wardUnit + u.rabiesVaccinations30d, 0)),
          formatCompact(s.dogBites30d),
          formatNumber(s.bitesPer10kPopulation, 1),
        ]
      }),
    },
    visuals: [
      metricsVisual('animal-headline', [
        { label: t('Estimated strays'), value: formatCompact(strays), support: 'modelled free-roaming population' },
        { label: t('Sterilised'), value: formatPercent(sterilisedPct), support: 'the input', tone: toneFor(sterilisedPct, true) },
        { label: t('Bites (30 days)'), value: formatCompact(bites), support: 'the outcome', tone: 'warn' },
        { label: t('Sterilisations (30 days)'), value: formatCompact(sterilisations) },
        { label: t('Units over capacity'), value: formatNumber(overCapacity.length), tone: overCapacity.length > 0 ? 'critical' : 'positive' },
      ]),
      rankedBarVisual({
        id: 'animal-bite-rate',
        caption: t('Dog bites per 10,000 residents, by ward'),
        unit: 'per 10k',
        higherIsBetter: false,
        data: rows.map((s) => ({ label: shortWard(s.wardId), value: Math.round(s.bitesPer10kPopulation * 10) / 10 })),
      }),
    ],
    recommendedActions: [
      recommend({
        id: 'rec-animal-sterilisation',
        title: t('Concentrate sterilisation capacity on {0}', fullWard(rows[0]!.wardId)),
        why: `${fullWard(rows[0]!.wardId)} records ${formatNumber(rows[0]!.bitesPer10kPopulation, 1)} bites per 10,000 residents against ${formatPercent(animalSignalForWard(rows[0]!.wardId)?.sterilisedPct ?? rows[0]!.sterilisedPct)} of its estimated stray population sterilised. Sterilisation coverage and bite rate move together in the register; the direction of that relationship is not established by these figures alone.`,
        expectedImpact: t('Raises sterilisation coverage in the ward where the reported outcome is worst, which is the lawful method and the only one the Rules permit.'),
        departmentId: 'dept-health',
        humanOwnerRole: t('Chief Veterinary Officer'),
        confidence: 'medium',
        dependencies: [t('Animal Birth Control centre theatre capacity'), t('Partner organisation contract headroom'), t('Post-operative holding space')],
        risks: [t('Raising throughput past holding capacity produces the overcrowding finding this register already records at other units')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    ],
    caveats: [
      t('The stray population is modelled, not enumerated. Sterilisation coverage is a share of that modelled figure and inherits its uncertainty.'),
      t('Bite cases count presentations at municipal facilities only. Cases treated privately or not treated at all are outside this register, so the outcome figure is a floor rather than a total.'),
    ],
    followUps: [
      t('What is the municipal market hygiene position?'),
      t('Are there any public health signals I should know about?'),
      t('What is the public toilet and amenity adequacy position?'),
    ],
    register: 'Animal Welfare and Veterinary Register (simulated)',
  })
}

/* ==========================================================================
   Amenities - public conveniences, parking and the rest of the estate
   ========================================================================== */

const amenities: AnswerHandler = (ctx) => {
  const denied = domainDenial(ctx, 'the public amenity and parking register')
  if (denied) return denied
  const gaps = WARD_AMENITY_GAPS.filter((g) => inScope(ctx, g.wardId) && g.amenities > 0)
  if (gaps.length === 0) {
    return emptyAnswer(ctx, 'public amenity', 'No ward within scope carries an amenity on the public amenity register.')
  }
  const estate = PUBLIC_AMENITIES.filter((a) => inScope(ctx, a.wardId))
  const conveniences = estate.filter((a) => a.kind === 'public-toilet')
  const dryConveniences = conveniences.filter((a) => !a.waterSupplyAvailable)
  const inaccessible = estate.filter((a) => !a.accessibleToPwD)
  const needingRepair = gaps.reduce((s, x) => s + x.amenitiesNeedingRepair, 0)
  const complaints = estate.reduce((s, x) => s + x.openComplaints30d, 0)
  const perSeat = mean(gaps.map((g) => g.populationPerPublicToilet))
  const perBays = mean(gaps.map((g) => g.parkingBaysPer1000Vehicles))
  const rows = [...gaps].sort((a, b) => b.populationPerPublicToilet - a.populationPerPublicToilet).slice(0, rowLimit(ctx))
  const move = movement(ctx, AMENITY_TREND)
  const evidence = bestEvidence(ctx.user, { wardIds: scopeIds(ctx), kinds: ['complaint', 'inspection'], count: 4 })

  return finish(ctx, 'amenities', evidence, {
    answer:
      `${formatNumber(estate.length)} amenities are recorded across ${formatNumber(gaps.length)} wards in scope. The honest measure of that estate is the seat denominator rather than the block count: ${formatNumber(perSeat)} residents share every usable public toilet seat on average, against a provision benchmark of ${formatNumber(RESIDENTS_PER_TOILET_SEAT_BENCHMARK)}. `
      + `${formatNumber(dryConveniences.length)} conveniences stand without a water supply and are counted on the asset register but are not a working amenity. ${formatNumber(needingRepair)} amenities are at risk, critical or standing dry. `
      + `Public parking runs at ${formatNumber(perBays, 1)} bays per thousand registered vehicles against a planning benchmark of ${formatNumber(PARKING_BAYS_PER_1000_VEHICLES_BENCHMARK)}; where that ratio collapses the shortfall does not disappear, it moves onto the carriageway.`,
    keyFindings: [
      ...rows.map(
        (g) =>
          t('{0} - {1} residents per usable toilet seat ({2}× the benchmark), {3} amenities of which {4} need repair, {5} parking bays per thousand vehicles.', fullWard(g.wardId), formatNumber(g.populationPerPublicToilet), formatNumber(g.populationPerPublicToilet / RESIDENTS_PER_TOILET_SEAT_BENCHMARK, 1), formatNumber(g.amenities), formatNumber(g.amenitiesNeedingRepair), formatNumber(g.parkingBaysPer1000Vehicles, 1)),
      ),
      t('{0} of {1} amenities in scope have no step-free approach recorded. Sections 40 to 46 of the Rights of Persons with Disabilities Act, 2016 make accessibility a statutory duty on the corporation\'s own estate, not a courtesy.', formatNumber(inaccessible.length), formatNumber(estate.length)),
      t('{0} complaints are open against the estate over thirty days. Complaints rise both where condition is poor and where a facility is worked hard - at high occupancy the queue itself is the grievance.', formatNumber(complaints)),
      move
        ? t('Corporation-wide, {0} amenity complaints were raised in the month against {1} resolved, with parking collections at ₹{2} lakh.', formatNumber(move.latest.complaintsRaised), formatNumber(move.latest.complaintsResolved), formatNumber(move.latest.parkingRevenueLakh))
        : t('Parking lots in scope collect ₹{0} lakh a month. Parking is a demand-management instrument before it is a revenue line, and reading it the other way round is how a corporation builds parking it cannot afford to police.', formatNumber(estate.reduce((s, x) => s + (x.monthlyRevenueLakh ?? 0), 0))),
    ],
    supportingTable: {
      caption: t('Ward amenity adequacy, weakest toilet seat provision first'),
      columns: [t('Ward'), t('Amenities'), t('Residents per toilet seat'), t('Against benchmark'), t('Parking bays per 1,000 vehicles'), t('Needing repair'), t('State')],
      rows: rows.map((g) => [
        fullWard(g.wardId),
        formatNumber(g.amenities),
        formatNumber(g.populationPerPublicToilet),
        `${formatNumber(g.populationPerPublicToilet / RESIDENTS_PER_TOILET_SEAT_BENCHMARK, 1)}×`,
        formatNumber(g.parkingBaysPer1000Vehicles, 1),
        formatNumber(g.amenitiesNeedingRepair),
        g.state.replace(/-/g, ' '),
      ]),
    },
    visuals: [
      metricsVisual('amenities-headline', [
        { label: t('Amenities'), value: formatNumber(estate.length), support: `${formatNumber(conveniences.length)} public conveniences` },
        { label: t('Residents per seat'), value: formatNumber(perSeat), support: `benchmark ${formatNumber(RESIDENTS_PER_TOILET_SEAT_BENCHMARK)}`, tone: toneFor(share(RESIDENTS_PER_TOILET_SEAT_BENCHMARK, perSeat), true) },
        { label: t('Conveniences without water'), value: formatNumber(dryConveniences.length), tone: dryConveniences.length > 0 ? 'critical' : 'positive' },
        { label: t('Parking bays per 1,000'), value: formatNumber(perBays, 1), support: `benchmark ${formatNumber(PARKING_BAYS_PER_1000_VEHICLES_BENCHMARK)}`, tone: toneFor(share(perBays, PARKING_BAYS_PER_1000_VEHICLES_BENCHMARK), true) },
        { label: t('Not step-free'), value: formatNumber(inaccessible.length), tone: 'warn' },
        { label: t('Weakest ward'), value: fullWard(rows[0]!.wardId), support: rows[0]!.state.replace(/-/g, ' '), tone: stateTone(rows[0]!.state) },
      ]),
      rankedBarVisual({
        id: 'amenities-seat-ratio',
        caption: t('Residents per usable public toilet seat, by ward'),
        unit: 'residents per seat',
        higherIsBetter: false,
        data: rows.map((g) => ({ label: shortWard(g.wardId), value: g.populationPerPublicToilet })),
      }),
    ],
    recommendedActions: [
      recommend({
        id: 'rec-amenities-water',
        title: t('Restore water supply to the {0} conveniences standing dry, {1} first', formatNumber(dryConveniences.length), fullWard(rows[0]!.wardId)),
        why: `${fullWard(rows[0]!.wardId)} carries ${formatNumber(rows[0]!.populationPerPublicToilet)} residents per usable seat, ${formatNumber(rows[0]!.populationPerPublicToilet / RESIDENTS_PER_TOILET_SEAT_BENCHMARK, 1)} times the provision benchmark. A convenience without water is a locked room with a signboard, and restoring supply adds seats without building anything.`,
        expectedImpact: t('Returns already-built seats to use, which is the fastest available improvement to the denominator that decides whether a resident can move through the city for a full day.'),
        departmentId: 'dept-estates',
        humanOwnerRole: t('Assistant Commissioner (Estates) - with the Health Department sanitation wing for operated blocks'),
        confidence: 'high',
        dependencies: [t('Hydraulic Department connection sanction'), t('Contractor obligation review where the block is contractor-operated')],
        risks: [t('Restoring supply without a maintenance contract returns the same block to the same condition within a season')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    ],
    caveats: [
      t('The seat ratio counts only seats a resident could actually use - a block without water or in critical condition is excluded. A count of blocks rather than seats would read materially better and would be materially less true.'),
      t('Registered vehicle counts behind the parking ratio are ward-modelled. An office district holds vehicles that sleep elsewhere, so the ratio understates daytime demand there.'),
    ],
    followUps: [
      t('Which slum settlements carry the weakest basic service provision?'),
      t('What is the municipal market hygiene position?'),
      t('What is the solid waste collection position?'),
    ],
    register: 'Public Amenity and Parking Register (simulated)',
  })
}

/* ==========================================================================
   Workforce - establishment, cadre strength and deployment
   ========================================================================== */

const workforce: AnswerHandler = (ctx) => {
  const denied = domainDenial(ctx, 'the personnel establishment register')
  if (denied) return denied
  // A department bound only because its own name carries the route's domain
  // word - "workforce" binds the Personnel & Workforce Department - restates
  // the route rather than narrowing it, and treating it as a filter would
  // answer the canonical question about one department instead of the
  // corporation. A department from any other domain is a genuine narrowing.
  const named = ctx.understanding.entities.departments
    .filter((d) => d.domain !== ctx.understanding.intent.domains[0])
    .map((d) => d.id)
  const units = WORKFORCE_UNITS.filter((u) => {
    if (named.length > 0 && !named.includes(u.departmentId)) return false
    if (u.wardId && !inScope(ctx, u.wardId)) return false
    return canAccess(ctx.user, 'ward', 'view', {
      departmentId: u.departmentId,
      wardId: u.wardId,
      domain: 'workforce',
    }).allowed
  })
  if (units.length === 0) {
    return emptyAnswer(ctx, 'workforce', 'No establishment record within your authorised department scope could be read.')
  }
  const sanctioned = units.reduce((s, x) => s + x.sanctioned, 0)
  const deployed = units.reduce((s, x) => s + x.deployed, 0)
  const onLeave = units.reduce((s, x) => s + x.onLeave, 0)
  const contractual = units.reduce((s, x) => s + x.contractual, 0)
  const vacancyPct = share(sanctioned - deployed, sanctioned)
  const workload = mean(units.map((u) => u.workloadIndex))
  const strained = units.filter((u) => u.workloadIndex >= 80)
  const rows = [...units].sort((a, b) => b.vacancyPct - a.vacancyPct).slice(0, rowLimit(ctx))
  const evidence = bestEvidence(ctx.user, { wardIds: scopeIds(ctx), kinds: ['derived-metric', 'document'], count: 4 })

  return finish(ctx, 'workforce', evidence, {
    answer:
      `${formatNumber(units.length)} cadre records within your authorised department scope carry ${formatCompact(sanctioned)} sanctioned posts against ${formatCompact(deployed)} deployed - a vacancy of ${formatNumber(sanctioned - deployed)} posts, or ${formatPercent(vacancyPct)}. `
      + `${formatCompact(onLeave)} of those deployed are on leave on the reference date, so the strength actually available is ${formatCompact(deployed - onLeave)}, and ${formatCompact(contractual)} contractual staff sit alongside the establishment. `
      + `The mean workload index is ${formatNumber(workload)} of 100, with ${formatNumber(strained.length)} cadres at or above 80 - the band where a vacancy stops being an establishment matter and becomes a service delivery one.`,
    keyFindings: [
      ...rows.map(
        (u) =>
          t('{0} - {1}: {2} sanctioned, {3} deployed, vacancy {4}, {5} on leave, {6} contractual, workload index {7}.', departmentName(u.departmentId), u.cadre, formatNumber(u.sanctioned), formatNumber(u.deployed), formatPercent(u.vacancyPct), formatNumber(u.onLeave), formatNumber(u.contractual), formatNumber(u.workloadIndex)),
      ),
      t('Contractual staff make up {0} of the total strength in scope. A contractual complement holds service delivery up while the vacancy persists, and it does not reduce the vacancy itself.', formatPercent(share(contractual, sanctioned + contractual))),
      named.length > 0
        ? t('Narrowed to {0} because the question named {1}.', named.map((id) => departmentName(id)).join(', '), named.length === 1 ? 'that department' : 'those departments')
        : t('{0} departments are readable within your scope; establishment outside it is neither counted nor indicated.', formatNumber(new Set(units.map((u) => u.departmentId)).size)),
    ],
    supportingTable: {
      caption: t('Cadres by vacancy against sanctioned establishment'),
      columns: [t('Department'), t('Cadre'), t('Sanctioned'), t('Deployed'), t('Vacancy'), t('On leave'), t('Contractual'), t('Workload index')],
      rows: rows.map((u) => [
        departmentName(u.departmentId),
        u.cadre,
        formatNumber(u.sanctioned),
        formatNumber(u.deployed),
        formatPercent(u.vacancyPct),
        formatNumber(u.onLeave),
        formatNumber(u.contractual),
        formatNumber(u.workloadIndex),
      ]),
    },
    visuals: [
      metricsVisual('workforce-headline', [
        { label: t('Sanctioned'), value: formatCompact(sanctioned), support: `${formatNumber(units.length)} cadre records` },
        { label: t('Deployed'), value: formatCompact(deployed), support: `${formatCompact(deployed - onLeave)} available today` },
        { label: t('Vacancy'), value: formatPercent(vacancyPct), tone: toneFor(vacancyPct, false) },
        { label: t('Mean workload index'), value: formatNumber(workload), tone: toneFor(workload, false) },
        { label: t('Cadres at or above 80'), value: formatNumber(strained.length), tone: strained.length > 0 ? 'warn' : 'positive' },
      ]),
      rankedBarVisual({
        id: 'workforce-vacancy',
        caption: t('Vacancy against sanctioned establishment, by cadre'),
        unit: '%',
        higherIsBetter: false,
        data: rows.map((u) => ({ label: `${u.cadre} · ${departmentName(u.departmentId)}`, value: Math.round(u.vacancyPct * 10) / 10 })),
      }),
    ],
    recommendedActions: [
      recommend({
        id: 'rec-workforce-vacancy',
        title: t('Take the {0} vacancy in {1} to the establishment review', rows[0]!.cadre, departmentName(rows[0]!.departmentId)),
        why: `The cadre stands at ${formatPercent(rows[0]!.vacancyPct)} vacancy against ${formatNumber(rows[0]!.sanctioned)} sanctioned posts, at a workload index of ${formatNumber(rows[0]!.workloadIndex)}. Vacancy and workload rise together across these records, which is consistent with the remaining strength absorbing the gap.`,
        expectedImpact: t('Establishes whether the shortfall is a recruitment constraint, a sanction still pending or a cadre the corporation no longer needs at its sanctioned size.'),
        departmentId: 'dept-personnel',
        humanOwnerRole: t('Deputy Municipal Commissioner (Personnel)'),
        confidence: 'medium',
        dependencies: [t('State approval for the establishment where the cadre is a sanctioned post'), t('Recruitment calendar of the service commission')],
        risks: [t('Filling a cadre without revisiting its sanctioned size perpetuates an establishment designed for a different workload')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    ],
    caveats: [
      t('The workload index is a modelled 0-100 composite, not a measured output per post. It orders cadres by strain reliably and should not be read as a productivity measure.'),
      t('Establishment is held by department and cadre. Where a cadre is not attributed to a ward it is reported corporation-wide within your department scope, and no ward attribution should be inferred.'),
    ],
    followUps: [
      t('What is the municipal school position?'),
      t('Which services are below their SLA?'),
      t('What is the status of council resolutions?'),
    ],
    register: 'Personnel Establishment Register (simulated)',
  })
}

/* ==========================================================================
   Council - the deliberative wing
   ========================================================================== */

const council: AnswerHandler = (ctx) => {
  const denied = domainDenial(ctx, "the Municipal Secretary's resolution record", 'intelligence')
  if (denied) return denied
  const resolutions = COUNCIL_RESOLUTIONS.filter((r) => {
    if (r.wardIds.length > 0 && !anyInScope(ctx, r.wardIds)) return false
    return canAccess(ctx.user, 'intelligence', 'view', {
      wardIds: r.wardIds,
      domain: 'council',
      classification: r.classification,
    }).allowed
  })
  if (resolutions.length === 0) {
    return emptyAnswer(ctx, 'council resolution', 'No resolution within your authorised scope is on the Municipal Secretary\'s record.')
  }
  const awaiting = resolutions.filter((r) => r.status === 'passed')
  const implemented = resolutions.filter((r) => r.status === 'implemented')
  const undecided = resolutions.filter((r) => r.status === 'tabled' || r.status === 'under-discussion')
  const deferred = resolutions.filter((r) => r.status === 'deferred')
  const exposure = awaiting.reduce((s, r) => s + (r.financialImplicationCrore ?? 0), 0)
  // Where nothing is awaiting implementation the same table still has to say
  // something true, so it falls through to the matters still before the house.
  const focus = awaiting.length > 0 ? awaiting : undecided.length > 0 ? undecided : resolutions
  const rows = [...focus]
    .sort((a, b) => (a.decidedAt ?? a.tabledAt).localeCompare(b.decidedAt ?? b.tabledAt))
    .slice(0, rowLimit(ctx))
  const evidence = bestEvidence(ctx.user, { wardIds: scopeIds(ctx), kinds: ['document', 'financial-record'], count: 4 })
  const statuses: Array<{ id: string; label: string; value: number; colour: string }> = [
    { id: 'implemented', label: t('Implemented'), value: implemented.length, colour: VISUAL_COLOUR.ok },
    { id: 'passed', label: t('Passed, implementation not recorded'), value: awaiting.length, colour: VISUAL_COLOUR.warn },
    { id: 'undecided', label: t('Tabled or under discussion'), value: undecided.length, colour: VISUAL_COLOUR.govt },
    { id: 'deferred', label: t('Deferred'), value: deferred.length, colour: VISUAL_COLOUR.muted },
    { id: 'rejected', label: t('Rejected'), value: resolutions.filter((r) => r.status === 'rejected').length, colour: VISUAL_COLOUR.crit },
  ]

  return finish(ctx, 'council', evidence, {
    answer:
      `The Corporation carries ${formatNumber(COUNCIL_POSITION.corporatorSeats)} corporator seats across ${formatNumber(COUNCIL_POSITION.committees)} committees, and ${formatNumber(resolutions.length)} resolutions within your scope are on the Municipal Secretary's record for the last twelve months. `
      + `${formatNumber(implemented.length)} carry recorded administrative action and ${formatNumber(awaiting.length)} were passed with no implementation note against them - a committed financial implication of ${formatCrore(exposure, 0)} resolved but not yet visible in delivery. `
      + `A matter takes a mean of ${formatNumber(COUNCIL_POSITION.meanDaysTabledToDecision)} days from tabling to decision; the interval after the decision is the one this record makes visible for the first time.`,
    keyFindings: [
      ...rows.map(
        (r) =>
          t('{0} - {1} ({2}): {3}, tabled {4}{5}, financial implication {6}.', r.reference, r.subject, committeeName(r.committeeId), RESOLUTION_STATUS_LABEL[r.status].toLowerCase(), formatRelative(r.tabledAt), r.decidedAt ? t(', decided {0}', formatRelative(r.decidedAt)) : '', r.financialImplicationCrore !== undefined ? formatCrore(r.financialImplicationCrore, 0) : t('not stated')),
      ),
      t('{0} matters remain tabled or under discussion and {1} stand deferred. A deferral is a decision of the house and is recorded as such, without inference about why it was taken.', formatNumber(undecided.length), formatNumber(deferred.length)),
      t('Committee sittings over twelve months: {0}, at a mean attendance of {1} and trending {2} {3} {4}.', COMMITTEES.map((c) => `${c.name} ${formatNumber(c.sittings12m)}`).join(', '), formatPercent(mean(COMMITTEES.map((c) => c.meanAttendancePct))), COUNCIL_POSITION.attendanceTrend.direction, formatDelta(COUNCIL_POSITION.attendanceTrend.changePct), COUNCIL_POSITION.attendanceTrend.comparisonLabel),
      t('The Standing Committee sanctions within a limit of {0}; matters above it rise to the General Body, which is why a resolution\'s financial implication determines its route rather than its subject.', formatCrore(COMMITTEES.find((c) => c.id === 'cmt-standing')?.sanctionLimitCrore ?? 0, 0)),
    ],
    supportingTable: {
      caption: awaiting.length > 0
        ? t('Resolutions passed with no implementation recorded, oldest decision first')
        : t('Resolutions before the house within scope, oldest first'),
      columns: [t('Reference'), t('Committee'), t('Subject'), t('Status'), t('Tabled'), t('Decided'), t('Financial implication')],
      rows: rows.map((r) => [
        r.reference,
        committeeName(r.committeeId),
        r.subject,
        RESOLUTION_STATUS_LABEL[r.status],
        formatRelative(r.tabledAt),
        r.decidedAt ? formatRelative(r.decidedAt) : t('Not decided'),
        r.financialImplicationCrore !== undefined ? formatCrore(r.financialImplicationCrore, 0) : t('Not stated'),
      ]),
    },
    visuals: [
      metricsVisual('council-headline', [
        { label: t('Corporator seats'), value: formatNumber(COUNCIL_POSITION.corporatorSeats) },
        { label: t('Resolutions in scope'), value: formatNumber(resolutions.length), support: 'last twelve months' },
        { label: t('Awaiting implementation'), value: formatNumber(awaiting.length), support: formatCrore(exposure, 0), tone: toneFor(share(awaiting.length, resolutions.length), false) },
        { label: t('Mean tabling to decision'), value: `${formatNumber(COUNCIL_POSITION.meanDaysTabledToDecision)} d` },
        { label: t('Mean committee attendance'), value: formatPercent(mean(COMMITTEES.map((c) => c.meanAttendancePct))), tone: toneFor(mean(COMMITTEES.map((c) => c.meanAttendancePct)), true) },
      ]),
      compositionVisual({
        id: 'council-status',
        caption: t('Resolutions in scope by status'),
        segments: statuses.filter((s) => s.value > 0),
      }),
    ],
    recommendedActions: [
      recommend({
        id: 'rec-council-implementation',
        title: t('Return an implementation report to the house on the {0} resolutions passed without recorded action', formatNumber(awaiting.length)),
        why: `${formatCrore(exposure, 0)} of sanctioned financial implication sits behind resolutions with no implementation note. The house has resolved; the record does not yet show what followed, and that gap is a reporting failure rather than a finding about any officer or member.`,
        expectedImpact: t('Closes the loop between the deliberative decision and the executive act, and gives the committee a factual basis for its next sitting rather than a restatement of the same matter.'),
        departmentId: 'dept-secretary',
        humanOwnerRole: t('Municipal Secretary'),
        confidence: 'high',
        dependencies: [t('Departmental returns against each resolution'), t('Standing Committee calendar')],
        risks: [t('An implementation report compiled without departmental verification records progress that has not occurred')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    ],
    caveats: [
      t('A resolution records what the house decided. Nothing here characterises the conduct, vote or position of any corporator, committee or officer, and the voting figures are the recorded division only.'),
      t('Absence of an implementation note means no administrative action has been recorded against the resolution on this platform. It does not establish that none was taken.'),
    ],
    followUps: [
      t('Which decision cases are awaiting determination?'),
      t('Show me department budget variance against the phased plan.'),
      t('What is the municipal school position?'),
    ],
    register: "Municipal Secretary's Resolution Record (simulated)",
  })
}

/* ==========================================================================
   Registry
   ========================================================================== */

export const civicHandlers: Partial<Record<QueryIntentId, AnswerHandler>> = {
  education,
  housing,
  welfare,
  livelihoods,
  licensing,
  registration,
  deathcare,
  markets,
  'animal-welfare': animalWelfare,
  amenities,
  workforce,
  council,
}
