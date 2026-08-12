import type { IntelligenceDomain, Severity } from '@/types/common'
import { DOMAIN_LABEL } from '@/types/common'
import type { AIVisual } from '@/types/ai'
import { SECURITY_EVENT_LABEL } from '@/types/governance'
import type { QueryIntentId, QueryIntentSpec } from '@/ai/nlu'
import { QUERY_INTENTS } from '@/ai/nlu'
import type { AnswerContext, AnswerHandler, ComposedAnswer } from '@/ai/answer-kit'
import {
  VISUAL_COLOUR,
  bestEvidence,
  compositionVisual,
  deniedAnswer,
  emptyAnswer,
  metricsVisual,
  rankedBarVisual,
  recommend,
  scopedEvidence,
  sourcesOf,
  standardLimitations,
  toneFor,
} from '@/ai/answer-kit'
import { activeProviderInfo } from '@/ai/index'
import { HUMAN_REVIEW_REQUIRED, PROHIBITED_INTENTS } from '@/ai/provider'
import { canAccess } from '@/security/access'
import { EVIDENCE_ITEMS } from '@/data/evidence.data'
import {
  ACCESS_POLICIES,
  DATASETS,
  LINEAGE_GRAPHS,
  PIPELINE_JOBS,
  PLATFORM_SERVICES,
  SECURITY_EVENTS,
  SECURITY_POSTURE,
} from '@/data/governance.data'
import { DATA_SOURCES } from '@/data/data-sources.data'
import {
  AGENT_WORKFLOWS,
  AI_AGENTS,
  AI_EVALUATIONS,
  AI_INCIDENTS,
  AI_MODELS,
  AI_RISK_REGISTER,
  HUMAN_OVERSIGHT,
  PROMPT_TEMPLATES,
  aiOversightSummary,
} from '@/data/ai.data'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCompact, formatNumber, formatPercent, formatRelative } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/ai/answers/governance.ts
 *
 * The four routes that answer about the platform rather than about the city:
 * what the Copilot can be asked, where its figures come from, how it is
 * secured, and how the AI layer inside it is governed.
 *
 * `capabilities` carries the heaviest obligation. It is the route the query
 * engine reaches when nothing else scored, which makes it the platform's answer
 * to a question it could not read. The failure mode it exists to prevent is not
 * a wrong number - it is a fluent paragraph answering an adjacent question that
 * the operator has no way to notice. So the route says plainly that the wording
 * did not match, and then turns the miss into an orientation: the whole route
 * catalogue, derived from `QUERY_INTENTS` at request time rather than kept as a
 * hand-maintained list that would drift the moment a route was added.
 *
 * `security` and `ai-governance` are gated domains. For most demonstration
 * roles the denial is the ordinary outcome, not an edge case, so it is composed
 * with the same care as a successful retrieval: what was withheld, on whose
 * authority, and how a genuine need is properly raised.
 */

/* ==========================================================================
   Shared helpers
   ========================================================================== */

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

/** The result count in effect, defended against an absent or absurd limit. */
function resultCount(ctx: AnswerContext): number {
  const asked = Math.round(ctx.limit)
  if (!Number.isFinite(asked) || asked < 1) return 6
  return Math.min(asked, 30)
}

/** Whole days between an observation and the demonstration anchor. */
function daysSince(iso: string): number {
  return Math.round((DEMO_NOW.getTime() - new Date(iso).getTime()) / 86_400_000)
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function tally<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const out = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    out.set(k, (out.get(k) ?? 0) + 1)
  }
  return out
}

function countOf(counts: Map<string, number>, key: string): number {
  return counts.get(key) ?? 0
}

/* ==========================================================================
   capabilities - the route catalogue, derived from the registry itself
   ========================================================================== */

interface RouteGroup {
  domain: IntelligenceDomain
  label: string
  intents: QueryIntentSpec[]
}

/**
 * Groups every published route by its primary domain.
 *
 * Built from `QUERY_INTENTS` on each call rather than from a constant, so a
 * route added to the registry appears in this catalogue without anybody
 * remembering to update it, and a route removed cannot linger here as an
 * offer the engine can no longer honour.
 */
function routeGroups(): RouteGroup[] {
  const byDomain = new Map<IntelligenceDomain, QueryIntentSpec[]>()
  for (const intent of QUERY_INTENTS) {
    const domain = intent.domains[0]
    if (!domain) continue
    const bucket = byDomain.get(domain)
    if (bucket) bucket.push(intent)
    else byDomain.set(domain, [intent])
  }
  return Array.from(byDomain.entries())
    .map(([domain, intents]) => ({ domain, label: DOMAIN_LABEL[domain], intents }))
    .sort((a, b) => b.intents.length - a.intents.length || a.label.localeCompare(b.label))
}

/**
 * Three example questions spread across the most heavily covered domains.
 *
 * `capabilities` itself is excluded: offering "What can you answer?" as the
 * follow-up to an answer about what can be answered is a loop, not a route.
 */
function catalogueFollowUps(groups: RouteGroup[]): string[] {
  const out: string[] = []
  for (const group of groups) {
    const candidate = group.intents.find((intent) => intent.id !== 'capabilities')
    if (candidate) out.push(candidate.example)
    if (out.length === 3) break
  }
  return out
}

function capabilitiesAnswer(ctx: AnswerContext): ComposedAnswer {
  const groups = routeGroups()
  const alphabetical = [...groups].sort((a, b) => a.label.localeCompare(b.label))
  const retrievalRoutes = QUERY_INTENTS.filter((intent) => intent.id !== 'capabilities').length
  const largest = groups[0]
  const reservedActs = PROHIBITED_INTENTS.map((intent) => intent.label)
  const fellBack = ctx.understanding.fellBack
  const alternatives = ctx.understanding.alternatives

  const reservedSentence =
    'It will not approve or sanction expenditure, award a contract, impose a penalty, reject citizen eligibility, '
    + 'issue an official order, amend an official record, or characterise conduct as wrongdoing. Those '
    + `${reservedActs.length} acts are reserved to human authority and are blocked at the gateway before any model is reached, `
    + 'so the constraint is technical rather than a matter of policy wording.'

  const answer = fellBack
    ? `The wording just submitted did not clear the match floor on any of the ${retrievalRoutes} published retrieval routes; `
      + `the strongest reading scored ${ctx.understanding.matchStrength}/100. `
      + 'The platform states that rather than answering an adjacent question, because a fluent answer to a question nobody asked '
      + 'is the one failure an operator cannot see. What it can answer is set out below in full: every route, what it answers, '
      + `and the phrasing that reaches it, across ${groups.length} domain groups. ${reservedSentence}`
    : `This Copilot publishes ${retrievalRoutes} retrieval routes across ${groups.length} domain groups, each answering from the `
      + "platform's own records rather than from general knowledge, and each stating the evidence it read and the scope it was "
      + 'confined to. The catalogue below gives, for every route, what it answers and the phrasing that reaches it. '
      + reservedSentence

  const keyFindings: string[] = [
    `${retrievalRoutes} retrieval routes are published across ${groups.length} domain groups`
      + `${largest ? t('; the most heavily covered is {0} with {1} routes', largest.label, largest.intents.length) : ''}.`,
    fellBack
      ? t('No route scored above the match floor on this wording, so no retrieval was attempted and no figure is offered in its place.')
      : t('This route was reached on the wording itself at a match strength of {0}/100.', ctx.understanding.matchStrength),
    alternatives.length > 0
      ? t('Nearest readings the engine considered and set aside: {0}. Each is one click away below.', alternatives.map((a) => a.label).join(', '))
      : t('No near-miss route scored highly enough to be offered as a correction, which is itself a signal that the wording sits outside the published vocabulary.'),
    t('{0} reserved acts are blocked at the gateway before any model is reached: {1}.', reservedActs.length, reservedActs.join('; ')),
    `${HUMAN_REVIEW_REQUIRED.length} use cases carry a mandatory recorded human review before any action follows: `
      + `${HUMAN_REVIEW_REQUIRED.join(', ')}.`,
    'Wards, departments, aggregate disease indicators, an explicit severity filter and a result count are bound from the question '
      + `itself before retrieval runs, so a ward-specific question returns a ward-specific answer. ${ctx.wards.length} wards sit `
      + 'within your authorised scope.',
    'Every route is filtered through the permission engine before composition. A record outside your ward, department, domain or '
      + 'classification scope is not summarised, not counted, and not hinted at by its absence.',
  ]

  const visuals: AIVisual[] = [
    metricsVisual(
      'cap-metrics',
      [
        { label: t('Retrieval routes available'), value: formatNumber(retrievalRoutes) },
        { label: t('Domain groups covered'), value: formatNumber(groups.length) },
        { label: t('Reserved acts blocked at the gateway'), value: formatNumber(reservedActs.length), tone: 'critical' },
        { label: t('Use cases requiring recorded human review'), value: formatNumber(HUMAN_REVIEW_REQUIRED.length), tone: 'warn' },
        { label: t('Wards in your authorised scope'), value: formatNumber(ctx.wards.length) },
      ],
      'Counts derived from the route registry and the gateway policy at the moment of asking.',
    ),
    rankedBarVisual({
      id: 'cap-routes-by-domain',
      caption: t('Retrieval routes per domain group, most heavily covered first'),
      unit: 'routes',
      higherIsBetter: true,
      data: groups.slice(0, resultCount(ctx)).map((group) => ({ label: group.label, value: group.intents.length })),
    }),
  ]

  return {
    requestId: `q-capabilities-${ctx.user.id}-${QUERY_INTENTS.length}-${fellBack ? 'fallback' : 'direct'}`,
    answer,
    keyFindings,
    evidence: [],
    recommendedActions: [],
    risksAndLimitations: [
      ...standardLimitations(),
      'This catalogue is derived from the route registry when the question is asked, so it states the routes that actually exist '
        + 'rather than a maintained description of them that could drift out of date.',
      'A route existing is not an assurance that it holds records within your scope. Where a register is empty in scope, the route '
        + 'says so rather than widening the question until something is found.',
    ],
    sources: [
      t('BMC Intelligence Core - query route registry'),
      t('BMC Intelligence Core - AI gateway policy'),
    ],
    domains: ctx.understanding.intent.domains,
    supportingTable: {
      caption: t('All {0} published routes, grouped by primary domain', QUERY_INTENTS.length),
      columns: [t('Domain'), t('Route'), t('What it answers'), t('Ask it like this'), t('Also reports on'), t('Reached by')],
      rows: alphabetical.flatMap((group) =>
        group.intents.map((intent) => [
          group.label,
          intent.id,
          intent.label,
          intent.example,
          intent.domains.length > 1 ? intent.domains.slice(1).map((d) => DOMAIN_LABEL[d]).join(', ') : '—',
          intent.anchors.slice(0, 3).join(', '),
        ]),
      ),
    },
    visuals,
    followUps: catalogueFollowUps(groups),
    grounding: 'general-reasoning',
  }
}

/* ==========================================================================
   data-quality - lineage, provenance and the freshness of the record base
   ========================================================================== */

function dataQualityAnswer(ctx: AnswerContext): ComposedAnswer {
  const limit = resultCount(ctx)
  const focusDomains = new Set(ctx.understanding.entities.departments.map((d) => d.domain))
  const narrowedGraphs = focusDomains.size > 0 ? LINEAGE_GRAPHS.filter((g) => focusDomains.has(g.domain)) : []
  const graphs = narrowedGraphs.length > 0 ? narrowedGraphs : LINEAGE_GRAPHS
  const narrowed = narrowedGraphs.length > 0

  if (graphs.length === 0) {
    return emptyAnswer(
      ctx,
      'data lineage',
      'The lineage register holds no graph, so no metric on this platform can currently be traced to a declared source. '
        + 'Nothing is presented as evidence until a lineage graph exists behind it.',
    )
  }

  const graphRows = graphs
    .map((graph) => {
      const quality = mean(graph.stages.map((stage) => stage.quality))
      const weakest = graph.stages.length > 0
        ? graph.stages.reduce((a, b) => (a.quality <= b.quality ? a : b))
        : undefined
      const ageDays = daysSince(graph.lastValidatedAt)
      const band = ageDays > 90 ? t('Beyond threshold') : ageDays > 60 ? t('Approaching') : t('Current')
      return { graph, quality, weakest, ageDays, band }
    })
    .sort((a, b) => a.quality - b.quality)

  const current = graphRows.filter((r) => r.band === 'Current').length
  const approaching = graphRows.filter((r) => r.band === 'Approaching').length
  const beyond = graphRows.filter((r) => r.band === 'Beyond threshold').length
  const meanLineageQuality = mean(graphRows.map((r) => r.quality))
  const weakestGraph = graphRows[0]

  const authorisedEvidence = scopedEvidence(ctx.user, EVIDENCE_ITEMS.map((e) => e.id))
  const meanEvidenceQuality = mean(authorisedEvidence.map((e) => e.dataQuality))
  const staleEvidence = authorisedEvidence.filter(
    (e) => DEMO_NOW.getTime() - new Date(e.observedAt).getTime() > 48 * 60 * 60 * 1000,
  ).length
  const stalePct = authorisedEvidence.length > 0 ? (staleEvidence / authorisedEvidence.length) * 100 : 0

  const feedStatus = tally(DATA_SOURCES, (f) => f.status)
  const meanFeedQuality = mean(DATA_SOURCES.map((f) => f.qualityScore))
  const personalDataFeeds = DATA_SOURCES.filter((f) => f.personalData).length
  const ingestedRecords = DATA_SOURCES.reduce((sum, f) => sum + f.recordsIngested, 0)
  const newestSync = DATA_SOURCES.reduce<string | undefined>(
    (newest, f) => (!newest || f.lastSyncAt > newest ? f.lastSyncAt : newest),
    undefined,
  )

  const failedJobs = PIPELINE_JOBS.filter((j) => j.status === 'failed')
  const failures7d = PIPELINE_JOBS.reduce((sum, j) => sum + j.failures7d, 0)
  const processedRecords = PIPELINE_JOBS.reduce((sum, j) => sum + j.recordsProcessed, 0)

  const operationalServices = PLATFORM_SERVICES.filter((s) => s.state === 'operational').length
  const simulatedServices = PLATFORM_SERVICES.filter((s) => s.simulated).length
  const notConnectedServices = PLATFORM_SERVICES.filter((s) => s.state === 'not-connected').length

  const meanDatasetQuality = mean(DATASETS.map((d) => d.qualityScore))
  const personalDatasets = DATASETS.filter((d) => d.containsPersonalData).length
  const datasetRecords = DATASETS.reduce((sum, d) => sum + d.recordCount, 0)

  const evidence = bestEvidence(ctx.user, { kinds: ['derived-metric', 'source-record'], count: 5 })

  const scopeNote = narrowed
    ? t('Narrowed to the {0} lineage graph{1} owned by the department{2} named in the question. ', graphs.length, graphs.length === 1 ? '' : 's', focusDomains.size === 1 ? '' : 's')
    : ''

  const answer =
    `${scopeNote}Every figure this platform publishes is traceable: ${graphs.length} metric lineage graph`
    + `${graphs.length === 1 ? '' : 's'} are registered, each declaring its stages from departmental source through ingestion, `
    + 'validation, canonical entity mapping and derived computation to the surface that renders it. Mean stage quality across '
    + `those graphs is ${formatNumber(meanLineageQuality, 1)}/100, and validation currency splits ${current} current, `
    + `${approaching} approaching the 60-day warning line and ${beyond} beyond the 90-day threshold, at which a metric is withheld `
    + 'from evidence rather than published from an older batch. Within your authorised scope '
    + `${formatNumber(authorisedEvidence.length)} evidence records stand behind platform assertions at a mean data quality of `
    + `${formatNumber(meanEvidenceQuality, 1)}/100, of which ${staleEvidence} (${formatPercent(stalePct, 0)}) carry an observation `
    + 'older than 48 hours. Ingestion itself is simulated: no departmental system is contacted, so every feed state below describes '
    + 'the demonstration environment and not a live integration.'

  const keyFindings: string[] = [
    `Lineage register: ${graphs.length} graphs at a mean stage quality of ${formatNumber(meanLineageQuality, 1)}/100.`
      + `${weakestGraph ? t(' Weakest is {0} at {1}/100, constrained by "{2}".', weakestGraph.graph.metricLabel, formatNumber(weakestGraph.quality, 1), weakestGraph.weakest?.name ?? 'not recorded') : ''}`,
    `Validation currency: ${current} current, ${approaching} approaching the 60-day warning line, ${beyond} beyond the 90-day `
      + `threshold${beyond > 0 ? t(' and therefore withheld from evidence') : ''}.`,
    `Evidence base in scope: ${formatNumber(authorisedEvidence.length)} records at a mean data quality of `
      + `${formatNumber(meanEvidenceQuality, 1)}/100; ${staleEvidence} (${formatPercent(stalePct, 0)}) older than 48 hours.`,
    `Ingestion feeds: ${DATA_SOURCES.length} registered - ${countOf(feedStatus, 'healthy')} healthy, `
      + `${countOf(feedStatus, 'degraded')} degraded, ${countOf(feedStatus, 'stale')} stale, ${countOf(feedStatus, 'paused')} paused, `
      + `${countOf(feedStatus, 'error')} in error - mean quality ${formatNumber(meanFeedQuality, 1)}/100 across `
      + `${formatCompact(ingestedRecords)} ingested records.`
      + `${newestSync ? t(' Most recent simulated ingestion {0}.', formatRelative(newestSync)) : ''}`,
    `Personal data: ${personalDataFeeds} of ${DATA_SOURCES.length} feeds carry at least one field marked sensitive, and `
      + `${personalDatasets} of ${DATASETS.length} registered datasets record personal data with minimisation rules applied at the `
      + 'ingestion boundary rather than after storage.',
    `Computation jobs: ${PIPELINE_JOBS.length} scheduled, ${failedJobs.length} failed at their last run`
      + `${failedJobs.length > 0 ? ` (${failedJobs.map((j) => j.name).join(', ')})` : ''}, ${failures7d} failures recorded over seven days `
      + `across ${formatCompact(processedRecords)} records processed.`,
    `Dataset register: ${DATASETS.length} datasets at a mean quality of ${formatNumber(meanDatasetQuality, 1)}/100, holding `
      + `${formatCompact(datasetRecords)} records under declared purpose and retention.`,
    `Platform services: ${operationalServices} of ${PLATFORM_SERVICES.length} operational, ${simulatedServices} simulated, `
      + `${notConnectedServices} not-connected. A simulated component is stated as simulated wherever it is read.`,
  ]

  const recommendedActions = beyond > 0
    ? [
        recommend({
          id: 'rec-dq-revalidate',
          title: t('Revalidate the {0} lineage graph{1} beyond the 90-day threshold', beyond, beyond === 1 ? '' : 's'),
          why:
            `${beyond} graph${beyond === 1 ? ' has' : t('s have')} passed the published 90-day revalidation threshold, so the metric`
            + `${beyond === 1 ? '' : 's'} downstream of ${beyond === 1 ? 'it' : 'them'} ${beyond === 1 ? 'is' : 'are'} withheld from `
            + 'evidence. Withholding is the correct behaviour, but it removes the metric from every intelligence surface that depends on it.',
          expectedImpact:
            'Restores the affected metrics to evidence-backed status, or establishes that the source feed has genuinely lapsed and '
            + 'the dependent intelligence must be re-based.',
          departmentId: 'dept-it',
          humanOwnerRole: t('Head of Data Services (IT)'),
          confidence: 'high',
          dependencies: [t('Source system extract availability'), t('Data steward sign-off per graph')],
          risks: [t('Revalidating without addressing the underlying feed restores currency without restoring quality')],
          evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
        }),
      ]
    : [
        recommend({
          id: 'rec-dq-sweep',
          title: t('Hold the lineage revalidation sweep on its published cadence'),
          why:
            `All ${graphs.length} registered graphs sit inside the 90-day threshold, with ${approaching} already approaching the `
            + '60-day warning line. Currency is maintained by the sweep, not by the absence of complaint.',
          expectedImpact: t('Keeps the approaching cohort from crossing the threshold and silently withdrawing metrics from evidence.'),
          departmentId: 'dept-it',
          humanOwnerRole: t('Head of Data Services (IT)'),
          confidence: 'medium',
          dependencies: [t('Scheduled sweep window')],
          risks: [t('A sweep that revalidates without re-measuring quality records currency it has not earned')],
          evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
        }),
      ]

  if (failedJobs.length > 0) {
    recommendedActions.push(
      recommend({
        id: 'rec-dq-jobs',
        title: t('Re-run the {0} computation job{1} recorded as failed', failedJobs.length, failedJobs.length === 1 ? '' : 's'),
        why:
          `${failedJobs.map((j) => j.name).join(', ')} failed at the last scheduled run, with ${failures7d} failures recorded across `
          + 'the register over seven days. A quality assessment that did not run leaves the quality figures it produces unrefreshed.',
        expectedImpact:
          t('Restores the affected computation so the quality position is measured rather than carried forward from the previous run.'),
        departmentId: 'dept-it',
        humanOwnerRole: t('Data Platform Engineer (IT)'),
        confidence: 'medium',
        dependencies: [t('Job scheduler window'), t('Upstream feed availability')],
        risks: [t('A re-run that fails for the same reason consumes the window without changing the position')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    )
  }

  const visuals: AIVisual[] = [
    metricsVisual(
      'dq-metrics',
      [
        {
          label: t('Lineage graphs registered'),
          value: formatNumber(graphs.length),
          support: `${beyond} beyond the 90-day threshold`,
          tone: beyond > 0 ? 'warn' : 'positive',
        },
        {
          label: t('Mean lineage stage quality'),
          value: `${formatNumber(meanLineageQuality, 1)}/100`,
          tone: toneFor(meanLineageQuality, true),
        },
        {
          label: t('Evidence records in scope'),
          value: formatNumber(authorisedEvidence.length),
          support: `mean quality ${formatNumber(meanEvidenceQuality, 1)}/100`,
        },
        {
          label: t('Evidence older than 48 hours'),
          value: formatPercent(stalePct, 0),
          support: `${staleEvidence} of ${authorisedEvidence.length} records`,
          tone: toneFor(stalePct, false),
        },
        {
          label: t('Feeds degraded, stale or in error'),
          value: formatNumber(countOf(feedStatus, 'degraded') + countOf(feedStatus, 'stale') + countOf(feedStatus, 'error')),
          support: `of ${DATA_SOURCES.length} registered`,
          tone: 'warn',
        },
      ],
      'Lineage, evidence and ingestion position at the demonstration reference instant.',
    ),
    rankedBarVisual({
      id: 'dq-weakest-lineage',
      caption: t('Lineage graphs by mean stage quality, weakest first'),
      unit: '/100',
      higherIsBetter: true,
      data: graphRows.slice(0, limit).map((row) => ({
        label: row.graph.metricLabel,
        value: Math.round(row.quality * 10) / 10,
      })),
    }),
    compositionVisual({
      id: 'dq-feed-status',
      caption: t('Ingestion feed states across the register'),
      segments: [
        { id: 'healthy', label: t('Healthy'), value: countOf(feedStatus, 'healthy'), colour: VISUAL_COLOUR.ok },
        { id: 'degraded', label: t('Degraded'), value: countOf(feedStatus, 'degraded'), colour: VISUAL_COLOUR.warn },
        { id: 'stale', label: t('Stale'), value: countOf(feedStatus, 'stale'), colour: VISUAL_COLOUR.govtSoft },
        { id: 'paused', label: t('Paused'), value: countOf(feedStatus, 'paused'), colour: VISUAL_COLOUR.muted },
        { id: 'error', label: t('Error'), value: countOf(feedStatus, 'error'), colour: VISUAL_COLOUR.crit },
      ],
    }),
  ]

  return {
    requestId: `q-data-quality-${ctx.user.id}-${graphs.length}-${authorisedEvidence.length}${narrowed ? `-${Array.from(focusDomains).sort().join('+')}` : ''}`,
    answer,
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      'Feed states, sync timestamps and ingestion volumes describe the demonstration environment. A healthy feed state is a property '
        + 'of the simulation and is not evidence that a live departmental integration exists.',
      'A quality score measures the records that arrived. It cannot detect a record the source system never emitted, so completeness '
        + 'is bounded by what the source chose to send and should be read as such.',
    ],
    sources: sourcesOf(
      evidence,
      'BMC Intelligence Core - lineage register',
      'BMC Intelligence Core - data source register',
      'BMC Intelligence Core - pipeline scheduler',
    ),
    domains: ctx.understanding.intent.domains,
    supportingTable: {
      caption: narrowed
        ? t('Lineage graphs for the named department{0}, weakest stage quality first', focusDomains.size === 1 ? '' : 's')
        : t('Metric lineage graphs, weakest mean stage quality first'),
      columns: [t('Metric'), t('Domain'), t('Stages'), t('Mean stage quality'), t('Weakest stage'), t('Last validated'), t('Currency')],
      rows: graphRows.slice(0, limit).map((row) => [
        row.graph.metricLabel,
        DOMAIN_LABEL[row.graph.domain],
        String(row.graph.stages.length),
        `${formatNumber(row.quality, 1)}/100`,
        `${row.weakest?.name ?? t('not recorded')} (${row.weakest?.quality ?? 0}/100)`,
        t('{0} · {1} d', formatRelative(row.graph.lastValidatedAt), row.ageDays),
        row.band,
      ]),
    },
    visuals,
    followUps: [
      t('What is the information security posture?'),
      t('What is the AI human-oversight position?'),
      t('What are the five highest operational risks right now?'),
    ],
  }
}

/* ==========================================================================
   security - gated. The denial is the common path.
   ========================================================================== */

function securityAnswer(ctx: AnswerContext): ComposedAnswer {
  const decision = canAccess(ctx.user, 'security', 'view')
  if (!decision.allowed) {
    return deniedAnswer(
      ctx,
      'the security posture, the security event register and the access policy register',
      `${decision.reason} Security posture is held by the Information Security Office and is readable only by a principal holding `
        + '"security:view"; the register is not summarised in outline, in aggregate, or by describing what it would have contained.',
    )
  }

  const limit = resultCount(ctx)
  const readable = SECURITY_EVENTS.filter(
    (event) => canAccess(ctx.user, 'security', 'view', { classification: event.classification }).allowed,
  )

  if (readable.length === 0) {
    return emptyAnswer(
      ctx,
      'security event',
      'No event in the register sits at or below your classification ceiling, so none was retrieved. The posture figures that would '
        + 'have been derived from those events are withheld with them rather than published from a partial base.',
    )
  }

  const severity = ctx.understanding.entities.severity
  const events = severity ? readable.filter((event) => event.severity === severity) : readable

  if (events.length === 0 && severity) {
    return emptyAnswer(
      ctx,
      `${severity}-severity security event`,
      `The register holds ${readable.length} readable events, none of them at ${severity} severity. The filter was applied as asked `
        + 'rather than widened to the nearest band that would have returned rows.',
    )
  }

  const open = events.filter((e) => e.status === 'open' || e.status === 'investigating')
  const statusCounts = tally(events, (e) => e.status)
  const severityCounts = tally(open, (e) => e.severity)
  // Tallied on the rendered label rather than the raw discriminant, so the
  // chart, the finding and the table all speak the same vocabulary.
  const typeCounts = Array.from(tally(events, (e) => SECURITY_EVENT_LABEL[e.type]).entries()).sort(
    (a, b) => b[1] - a[1],
  )
  const mostFrequentType = typeCounts[0]

  const ranked = [...open].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySeverity !== 0) return bySeverity
    return a.detectedAt < b.detectedAt ? 1 : -1
  })

  const posture = SECURITY_POSTURE
  const vulns = posture.openVulnerabilities
  const policyCounts = tally(ACCESS_POLICIES, (p) => p.status)
  const policiesForReview = countOf(policyCounts, 'review-required')
  const oldestPolicyReview = ACCESS_POLICIES.reduce<number>(
    (oldest, policy) => Math.max(oldest, daysSince(policy.lastReviewedAt)),
    0,
  )

  const evidence = bestEvidence(ctx.user, { kinds: ['document', 'derived-metric'], count: 4 })

  const severityNote = severity ? t('Filtered to {0} severity because the question asked for it. ', severity) : ''

  const answer =
    `${severityNote}Authentication health is recorded at ${posture.authenticationHealth}/100 with multi-factor coverage at `
    + `${formatPercent(posture.mfaCoveragePct)} across the principal register, and ${posture.privilegedWithoutMfa} of `
    + `${posture.privilegedAccounts} privileged accounts recorded without multi-factor enrolment. `
    + `${events.length} security events sit within your classification ceiling, ${open.length} of them open or under investigation, `
    + `against ${posture.policyViolations30d} policy violations and ${posture.suspiciousSessions} sessions flagged as unusual over the `
    + 'assessment window. Encryption in transit is recorded as operational and encryption at rest as review-required, which is a stated '
    + `gap rather than a resolved control. The last posture assessment was ${formatRelative(posture.lastAssessmentAt)}.`

  const keyFindings: string[] = [
    `Identity: multi-factor coverage ${formatPercent(posture.mfaCoveragePct)}, authentication health `
      + `${posture.authenticationHealth}/100, ${posture.privilegedAccounts} privileged accounts of which `
      + `${posture.privilegedWithoutMfa} carry no multi-factor enrolment.`,
    `Event register: ${events.length} readable events - ${countOf(statusCounts, 'open')} open, `
      + `${countOf(statusCounts, 'investigating')} under investigation, ${countOf(statusCounts, 'contained')} contained, `
      + `${countOf(statusCounts, 'closed')} closed, ${countOf(statusCounts, 'false-positive')} recorded as false positive.`,
    `Open severity split: ${countOf(severityCounts, 'critical')} critical, ${countOf(severityCounts, 'high')} high, `
      + `${countOf(severityCounts, 'medium')} medium, ${countOf(severityCounts, 'low')} low.`
      + `${mostFrequentType ? t(' Most frequent detection type overall: {0} ({1}).', mostFrequentType[0], mostFrequentType[1]) : ''}`,
    `Open vulnerabilities: ${vulns.critical} critical, ${vulns.high} high, ${vulns.medium} medium, ${vulns.low} low. `
      + 'These are counts against the platform software, not against any municipal system.',
    `Encryption: in transit ${posture.encryptionInTransit}, at rest ${posture.encryptionAtRest}. The at-rest position is stated as it `
      + 'stands rather than described as adequate.',
    `Access policy register: ${ACCESS_POLICIES.length} policies - ${countOf(policyCounts, 'active')} active, `
      + `${countOf(policyCounts, 'draft')} draft, ${policiesForReview} review-required, ${countOf(policyCounts, 'retired')} retired. `
      + `Oldest recorded review is ${oldestPolicyReview} days old.`,
    `Integrations: ${posture.integrationsRequiringReview} connectors are recorded as requiring privacy or security review before `
      + 'provisioning, and are not-connected until that review completes.',
    `Suspicious sessions currently open: ${posture.suspiciousSessions}; policy violations over the window: `
      + `${posture.policyViolations30d}; total events over the window: ${posture.securityEvents30d}.`,
  ]

  const recommendedActions = posture.privilegedWithoutMfa > 0
    ? [
        recommend({
          id: 'rec-sec-mfa',
          title: t('Complete multi-factor enrolment for the {0} privileged account{1} recorded without it', posture.privilegedWithoutMfa, posture.privilegedWithoutMfa === 1 ? '' : 's'),
          why:
            `${posture.privilegedWithoutMfa} of ${posture.privilegedAccounts} privileged accounts hold no second factor while carrying `
            + 'the highest classification ceilings on the platform. Coverage across the wider principal register stands at '
            + `${formatPercent(posture.mfaCoveragePct)}.`,
          expectedImpact:
            'Removes the single-factor path to the accounts with the broadest read authority, and closes the gap between the general '
            + 'coverage figure and the privileged cohort it currently conceals.',
          departmentId: 'dept-security',
          humanOwnerRole: t('Security Administrator'),
          confidence: 'high',
          dependencies: [t('Enrolment window with each account holder'), t('Registered device for each principal')],
          risks: [t('Enforcing a second factor without an enrolment window locks out the principals with the broadest authority')],
          evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
        }),
      ]
    : [
        recommend({
          id: 'rec-sec-review',
          title: t('Hold the access policy review cycle on its published cadence'),
          why:
            `The register carries ${ACCESS_POLICIES.length} policies with an oldest recorded review of ${oldestPolicyReview} days. `
            + 'A policy that has not been reviewed still evaluates at request time, so a stale policy is an active one.',
          expectedImpact: t('Keeps the evaluated policy set aligned with the roles and scopes actually in use.'),
          departmentId: 'dept-security',
          humanOwnerRole: t('Security Administrator'),
          confidence: 'medium',
          dependencies: [t('Access governance review slot')],
          risks: [t('A review that re-dates a policy without re-reading it records currency it has not earned')],
          evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
        }),
      ]

  if (policiesForReview > 0) {
    recommendedActions.push(
      recommend({
        id: 'rec-sec-policies',
        title: t('Return the {0} access polic{1} marked review-required to access governance', policiesForReview, policiesForReview === 1 ? 'y' : 'ies'),
        why:
          `${policiesForReview} policies are recorded as review-required and continue to be evaluated at request time in that state. `
          + 'A policy awaiting review is not a suspended policy.',
        expectedImpact:
          t('Resolves each policy to active or retired, so the evaluated set matches the set the corporation has actually agreed.'),
        departmentId: 'dept-security',
        humanOwnerRole: t('Security Administrator'),
        confidence: 'medium',
        dependencies: [t('Owning officer availability'), t('Role scope confirmation from each affected department')],
        risks: [t('Retiring a policy without a replacement narrows access for principals who currently depend on it')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    )
  }

  const visuals: AIVisual[] = [
    metricsVisual(
      'sec-metrics',
      [
        {
          label: t('Multi-factor coverage'),
          value: formatPercent(posture.mfaCoveragePct),
          tone: toneFor(posture.mfaCoveragePct, true),
        },
        {
          label: t('Privileged accounts without MFA'),
          value: formatNumber(posture.privilegedWithoutMfa),
          support: `of ${posture.privilegedAccounts} privileged`,
          tone: posture.privilegedWithoutMfa > 0 ? 'critical' : 'positive',
        },
        {
          label: t('Authentication health'),
          value: `${posture.authenticationHealth}/100`,
          tone: toneFor(posture.authenticationHealth, true),
        },
        {
          label: t('Events open or investigating'),
          value: formatNumber(open.length),
          support: `of ${events.length} readable`,
          tone: open.length > 0 ? 'warn' : 'positive',
        },
        {
          label: t('Integrations requiring review'),
          value: formatNumber(posture.integrationsRequiringReview),
          tone: posture.integrationsRequiringReview > 0 ? 'warn' : 'default',
        },
        {
          label: t('Access policies review-required'),
          value: formatNumber(policiesForReview),
          support: `of ${ACCESS_POLICIES.length} policies`,
          tone: policiesForReview > 0 ? 'warn' : 'positive',
        },
      ],
      `Posture last assessed ${formatRelative(posture.lastAssessmentAt)}.`,
    ),
    compositionVisual({
      id: 'sec-vulnerabilities',
      caption: t('Open vulnerabilities against the platform software, by severity'),
      segments: [
        { id: 'critical', label: t('Critical'), value: vulns.critical, colour: VISUAL_COLOUR.crit },
        { id: 'high', label: t('High'), value: vulns.high, colour: VISUAL_COLOUR.warn },
        { id: 'medium', label: t('Medium'), value: vulns.medium, colour: VISUAL_COLOUR.intel },
        { id: 'low', label: t('Low'), value: vulns.low, colour: VISUAL_COLOUR.muted },
      ],
    }),
    rankedBarVisual({
      id: 'sec-event-types',
      caption: t('Security events by detection type, most frequent first'),
      unit: 'events',
      higherIsBetter: false,
      data: typeCounts.slice(0, limit).map(([label, count]) => ({ label, value: count })),
    }),
  ]

  return {
    requestId: `q-security-${ctx.user.id}-${events.length}-${open.length}${severity ? `-${severity}` : ''}`,
    answer,
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      posture.certificationNote,
      'A security event is a detection against a rule. It is not a finding against any principal: no event here attributes intent, '
        + 'conduct or responsibility to a named person, and none should be read or repeated as though it did.',
    ],
    sources: sourcesOf(
      evidence,
      'BMC Intelligence Core - security posture',
      'BMC Intelligence Core - security event register',
      'BMC Intelligence Core - access policy register',
    ),
    domains: ctx.understanding.intent.domains,
    supportingTable: {
      caption: severity
        ? t('Open {0}-severity security events, most severe and most recent first', severity)
        : t('Open and investigating security events, most severe and most recent first'),
      columns: [t('Reference'), t('Detection type'), t('Severity'), t('Detected'), t('Status'), t('Policies referenced'), t('Recommended action')],
      rows: ranked.slice(0, limit).map((event) => [
        event.reference,
        SECURITY_EVENT_LABEL[event.type],
        event.severity,
        formatRelative(event.detectedAt),
        event.status.replace('-', ' '),
        event.relatedPolicyIds.length > 0 ? event.relatedPolicyIds.join(', ') : '—',
        event.recommendedAction,
      ]),
    },
    visuals,
    followUps: [
      t('What is the AI human-oversight position?'),
      t('What is the data quality and lineage position?'),
      t('Which alerts have breached their response SLA?'),
    ],
  }
}

/* ==========================================================================
   ai-governance - gated. How the AI layer inside the platform is controlled.
   ========================================================================== */

function aiGovernanceAnswer(ctx: AnswerContext): ComposedAnswer {
  const decision = canAccess(ctx.user, 'ai-governance', 'view', { domain: 'ai-governance' })
  if (!decision.allowed) {
    return deniedAnswer(
      ctx,
      'the model register, prompt governance register, AI risk register and human-oversight record',
      `${decision.reason} AI governance is held by the AI Governance Office and is readable only by a principal holding `
        + '"ai-governance:view" with that domain inside their scope. What can be said without it is already stated in every answer '
        + 'this platform gives: the model identifier, the grounding mode, and the evidence relied upon.',
    )
  }

  if (AI_MODELS.length === 0) {
    return emptyAnswer(
      ctx,
      'AI model',
      'The model register is empty, so no model is approved for use and no evaluation evidence exists to report against.',
    )
  }

  const limit = resultCount(ctx)
  const oversight = aiOversightSummary()
  const provider = activeProviderInfo()
  const evaluationByModel = new Map(AI_EVALUATIONS.map((evaluation) => [evaluation.modelId, evaluation]))

  const modelRows = AI_MODELS.map((model) => {
    const evaluation = evaluationByModel.get(model.id)
    const dimensionsPassed = evaluation ? evaluation.dimensions.filter((d) => d.passed).length : 0
    const dimensionCount = evaluation ? evaluation.dimensions.length : 0
    return { model, evaluation, dimensionsPassed, dimensionCount }
  }).sort((a, b) => (a.evaluation?.compositeScore ?? 0) - (b.evaluation?.compositeScore ?? 0))

  const activeModels = AI_MODELS.filter((m) => m.status === 'active').length
  const restrictedModels = AI_MODELS.filter((m) => m.status === 'restricted' || m.status === 'pending-approval').length
  const highRiskModels = AI_MODELS.filter((m) => m.riskClass === 'high').length
  const evaluationConcerns = AI_MODELS.filter(
    (m) => m.evaluationStatus === 'failed' || m.evaluationStatus === 're-evaluation-due',
  )
  const meanComposite = mean(AI_EVALUATIONS.map((e) => e.compositeScore))
  const evaluatedCases = AI_EVALUATIONS.reduce((sum, e) => sum + e.caseCount, 0)
  const failedDimensions = AI_EVALUATIONS.reduce(
    (sum, e) => sum + e.dimensions.filter((d) => !d.passed).length,
    0,
  )

  const advisoryAgents = AI_AGENTS.filter((a) => a.autonomyLevel === 'advisory-only').length
  const agentsAwaitingReview = AI_AGENTS.filter((a) => a.stage === 'human-review').length
  const meanAgentApproval = mean(AI_AGENTS.map((a) => a.humanApprovalRate))
  const humanCheckpoints = AGENT_WORKFLOWS.reduce(
    (sum, workflow) => sum + workflow.steps.filter((step) => step.requiresHuman).length,
    0,
  )
  const activeWorkflows = AGENT_WORKFLOWS.filter((w) => w.status === 'active').length

  const promptCounts = tally(PROMPT_TEMPLATES, (p) => p.approvalStatus)
  const openRisks = AI_RISK_REGISTER.filter((r) => r.status === 'open' || r.status === 'monitoring')
  const severeResidual = openRisks.filter((r) => r.residualRating === 'critical' || r.residualRating === 'high').length
  const openIncidents = AI_INCIDENTS.filter((i) => i.status !== 'resolved' && i.status !== 'reviewed')
  const reviewed = oversight.accepted + oversight.modified + oversight.rejected + oversight.escalated

  const evidence = bestEvidence(ctx.user, { kinds: ['model-output', 'derived-metric'], count: 4 })

  const answer =
    `The AI layer is governed as an advisory instrument: ${AI_MODELS.length} models are registered, all ${advisoryAgents} of `
    + `${AI_AGENTS.length} agents run at advisory-only autonomy, and no agent transitions its own work to an approved action - that `
    + `transition requires a named human at one of ${humanCheckpoints} checkpoints across ${AGENT_WORKFLOWS.length} workflows. `
    + `Human oversight records ${oversight.pending} reviews pending against ${reviewed} completed, an acceptance rate of `
    + `${formatPercent(oversight.acceptanceRate)}; the balance were modified, rejected or escalated rather than accepted silently, `
    + 'which is what makes the rate worth reading at all. The provider in effect is '
    + `${provider.displayName} (model ${provider.modelId}) in the ${provider.environment} environment. `
    + `${PROHIBITED_INTENTS.length} reserved acts are blocked at the gateway before a request reaches any model, and `
    + `${HUMAN_REVIEW_REQUIRED.length} use cases carry a mandatory recorded human review before any action follows.`

  const keyFindings: string[] = [
    `Model register: ${AI_MODELS.length} registered - ${activeModels} active, ${restrictedModels} restricted or pending approval, `
      + `${highRiskModels} classified high risk. ${evaluationConcerns.length} carry an evaluation status of failed or `
      + `re-evaluation-due${evaluationConcerns.length > 0 ? ` (${evaluationConcerns.map((m) => m.name).join(', ')})` : ''}.`,
    `Evaluation evidence: ${AI_EVALUATIONS.length} recorded runs over ${formatCompact(evaluatedCases)} held-out cases, mean composite `
      + `${formatNumber(meanComposite, 1)}/100, ${failedDimensions} dimension result${failedDimensions === 1 ? '' : 's'} below the `
      + 'published threshold. A verdict without a dated run behind it is not treated as an evaluation.',
    `Human oversight: ${oversight.pending} pending, ${oversight.accepted} accepted, ${oversight.modified} modified, `
      + `${oversight.rejected} rejected, ${oversight.escalated} escalated across ${HUMAN_OVERSIGHT.length} recorded submissions - `
      + `acceptance rate ${formatPercent(oversight.acceptanceRate)}.`,
    `Agents: ${AI_AGENTS.length} registered, all at advisory-only autonomy, mean recorded human approval rate `
      + `${formatNumber(meanAgentApproval, 1)}%, ${agentsAwaitingReview} currently at the human-review stage.`,
    `Workflows: ${AGENT_WORKFLOWS.length} defined, ${activeWorkflows} active, carrying ${humanCheckpoints} human checkpoints that `
      + 'cannot be bypassed by configuration.',
    `Prompt governance: ${PROMPT_TEMPLATES.length} templates - ${countOf(promptCounts, 'approved')} approved, `
      + `${countOf(promptCounts, 'under-review')} under review, ${countOf(promptCounts, 'draft')} draft, `
      + `${countOf(promptCounts, 'withdrawn')} withdrawn. Each carries its own guardrails and permitted roles.`,
    `AI risk register: ${AI_RISK_REGISTER.length} entries, ${openRisks.length} open or under monitoring, of which ${severeResidual} `
      + 'retain a critical or high residual rating after declared controls.',
    `AI incidents: ${AI_INCIDENTS.length} recorded, ${openIncidents.length} not yet resolved or reviewed`
      + `${openIncidents.length > 0 ? ` (${openIncidents.slice(0, 3).map((i) => i.reference).join(', ')})` : ''}.`,
  ]

  const recommendedActions = oversight.pending > 0
    ? [
        recommend({
          id: 'rec-aig-oversight',
          title: t('Clear the {0} AI recommendation{1} awaiting recorded human review', oversight.pending, oversight.pending === 1 ? '' : 's'),
          why:
            `${oversight.pending} submissions sit at pending against ${reviewed} completed reviews. An advisory output that is never `
            + 'reviewed is neither accepted nor refused, which leaves the recommending model unaccountable for it either way.',
          expectedImpact:
            'Closes the oversight loop so the acceptance rate reflects a reviewed population, and surfaces any pattern of modification '
            + 'that should feed back into the prompt or the model evaluation.',
          departmentId: 'dept-ai-governance',
          humanOwnerRole: t('AI Governance Officer'),
          confidence: 'high',
          dependencies: [t('Reviewer availability against the pending queue'), t('Domain officer input on escalated items')],
          risks: [t('Clearing a backlog under time pressure produces recorded reviews of lower value than no review at all')],
          evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
        }),
      ]
    : [
        recommend({
          id: 'rec-aig-cadence',
          title: t('Hold the model evaluation cadence against the published dimensions'),
          why:
            `No review is currently pending, and mean composite evaluation stands at ${formatNumber(meanComposite, 1)}/100 across `
            + `${AI_EVALUATIONS.length} runs. Evaluation currency, not the absence of a complaint, is what keeps an approval defensible.`,
          expectedImpact: t('Keeps every approved model inside its evaluation window before an approval has to be defended retrospectively.'),
          departmentId: 'dept-ai-governance',
          humanOwnerRole: t('AI Governance Officer'),
          confidence: 'medium',
          dependencies: [t('Held-out case set refresh')],
          risks: [t('Re-running an unchanged case set measures stability rather than capability')],
          evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
        }),
      ]

  if (evaluationConcerns.length > 0) {
    recommendedActions.push(
      recommend({
        id: 'rec-aig-evaluate',
        title: t('Re-evaluate the {0} model{1} recorded as failed or re-evaluation-due', evaluationConcerns.length, evaluationConcerns.length === 1 ? '' : 's'),
        why:
          `${evaluationConcerns.map((m) => `${m.name} (${m.evaluationStatus.replace(/-/g, ' ')})`).join(', ')}. `
          + `${failedDimensions} dimension result${failedDimensions === 1 ? ' sits' : t('s sit')} below a published threshold across the `
          + 'evaluation register, and a model carrying one should not be relied upon in the use cases that depend on that dimension.',
        expectedImpact:
          'Produces a dated verdict a governance board can inspect, and establishes whether restriction, retraining or retirement is '
          + 'the correct disposition for each model.',
        departmentId: 'dept-ai-governance',
        humanOwnerRole: t('AI Governance Officer'),
        confidence: 'high',
        dependencies: [t('Evaluation environment availability'), t('Reviewer sign-off per dimension')],
        risks: [t('Restricting a model in active use narrows the surfaces that depend on it until a replacement is approved')],
        evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
      }),
    )
  }

  const visuals: AIVisual[] = [
    metricsVisual(
      'aig-metrics',
      [
        {
          label: t('Models registered'),
          value: formatNumber(AI_MODELS.length),
          support: `${activeModels} active, ${highRiskModels} high risk`,
        },
        {
          label: t('Reviews pending'),
          value: formatNumber(oversight.pending),
          support: `${reviewed} completed`,
          tone: oversight.pending > 0 ? 'warn' : 'positive',
        },
        {
          label: t('Acceptance rate'),
          value: formatPercent(oversight.acceptanceRate),
          support: 'of reviewed recommendations',
          tone: 'default',
        },
        {
          label: t('AI risks open or monitored'),
          value: formatNumber(openRisks.length),
          support: `${severeResidual} at critical or high residual`,
          tone: severeResidual > 0 ? 'critical' : 'warn',
        },
        {
          label: t('AI incidents unresolved'),
          value: formatNumber(openIncidents.length),
          support: `of ${AI_INCIDENTS.length} recorded`,
          tone: openIncidents.length > 0 ? 'warn' : 'positive',
        },
        {
          label: t('Agents at advisory-only autonomy'),
          value: `${advisoryAgents} / ${AI_AGENTS.length}`,
          support: `${humanCheckpoints} human checkpoints`,
          tone: 'positive',
        },
      ],
      `Provider in effect: ${provider.displayName} (${provider.environment}).`,
    ),
    compositionVisual({
      id: 'aig-oversight-outcomes',
      caption: t('Human oversight outcomes across the recorded submissions'),
      segments: [
        { id: 'accepted', label: t('Accepted'), value: oversight.accepted, colour: VISUAL_COLOUR.ok },
        { id: 'modified', label: t('Modified'), value: oversight.modified, colour: VISUAL_COLOUR.intel },
        { id: 'rejected', label: t('Rejected'), value: oversight.rejected, colour: VISUAL_COLOUR.crit },
        { id: 'escalated', label: t('Escalated'), value: oversight.escalated, colour: VISUAL_COLOUR.warn },
        { id: 'pending', label: t('Pending'), value: oversight.pending, colour: VISUAL_COLOUR.muted },
      ],
    }),
    rankedBarVisual({
      id: 'aig-composite-scores',
      caption: t('Model composite evaluation score, weakest first'),
      unit: '/100',
      higherIsBetter: true,
      data: modelRows
        .slice(0, limit)
        .map((row) => ({ label: row.model.name, value: row.evaluation?.compositeScore ?? 0 })),
    }),
  ]

  return {
    requestId: `q-ai-governance-${ctx.user.id}-${AI_MODELS.length}-${oversight.pending}-${openRisks.length}`,
    answer,
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      'Every model in this environment is a deterministic demonstration implementation. Approval status, evaluation verdict and risk '
        + 'rating are modelled records of a governance process; they are not attestations from an accredited assessor.',
      'An acceptance rate measures what reviewers recorded, not whether a recommendation was correct. A high rate is equally '
        + 'consistent with effective oversight and with review that has become a formality, and the register cannot distinguish them.',
    ],
    sources: sourcesOf(
      evidence,
      'BMC Intelligence Core - AI model register',
      'BMC Intelligence Core - human oversight record',
      'BMC Intelligence Core - AI gateway policy',
    ),
    domains: ctx.understanding.intent.domains,
    supportingTable: {
      caption: t('AI model register with its evaluation evidence, weakest composite first'),
      columns: [t('Model'), t('Provider'), t('Environment'), t('Risk class'), t('Evaluation'), t('Composite'), t('Dimensions cleared'), t('Last evaluated')],
      rows: modelRows.slice(0, limit).map((row) => [
        `${row.model.name} v${row.model.version}`,
        row.model.provider,
        row.model.environment,
        row.model.riskClass,
        row.evaluation ? row.evaluation.verdict.replace(/-/g, ' ') : row.model.evaluationStatus.replace(/-/g, ' '),
        row.evaluation ? `${row.evaluation.compositeScore}/100` : '—',
        row.dimensionCount > 0 ? `${row.dimensionsPassed} / ${row.dimensionCount}` : '—',
        formatRelative(row.model.lastEvaluatedAt),
      ]),
    },
    visuals,
    followUps: [
      t('What is the information security posture?'),
      t('What is the data quality and lineage position?'),
      t('What can you answer?'),
    ],
  }
}

/* ==========================================================================
   Registry export
   ========================================================================== */

export const governanceHandlers: Partial<Record<QueryIntentId, AnswerHandler>> = {
  capabilities: capabilitiesAnswer,
  'data-quality': dataQualityAnswer,
  security: securityAnswer,
  'ai-governance': aiGovernanceAnswer,
}
