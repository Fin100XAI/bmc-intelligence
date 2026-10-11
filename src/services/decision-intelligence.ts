import { activeCorporation } from '@/config/municipality.config'
import { bmcBaselineEvidence, bmcSources } from '@/config/bmc/evidence'
import { bmcAreaEvidence, bmcAreaSources } from '@/config/bmc/area-evidence'
import { bmcFundingNeeds } from '@/config/bmc/funding'
import { bmcBudgetLines, bmcProjectEvidence, bmcProjectSources, bmcProjects } from '@/config/bmc/public-money'
import type { EvidenceRecord, SourceRecord } from '@/domains/evidence/model'
import type { BudgetLine, FundingNeed, PublicProject } from '@/domains/public-money/model'
import type { IntelligenceCase } from '@/domains/decision/case'
import {
  ENGINE_VERSION,
  alertTier,
  daysUntil,
  deadlineFactor,
  detectCoordination,
  evidenceFactor,
  isStatusStale,
  materiality,
  milestoneDate,
  milestoneWindow,
  projectCrore,
  scorePriority,
  statusAgeDays,
  type CoordinationReason,
  type FactorValues,
  type PriorityFactor,
} from '@/domains/decision/engines'
import { DEMO_NOW } from '@/utils/deterministic'
import { registerLayer } from '@/data/runtime'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/services/decision-intelligence.ts
 *
 * Assembles the decision-intelligence layer for the active corporation: its
 * Source Registry, evidence, public portfolio, and the Intelligence Cases the
 * engines raise over them. Corporations without a configuration get empty
 * collections - the core never invents a portfolio.
 *
 * "Now" is the platform's demonstration clock (`DEMO_NOW`), so every age and
 * window is reproducible.
 */

export type { FundingNeed } from '@/domains/public-money/model'

export interface DecisionLayer {
  sources: SourceRecord[]
  evidence: EvidenceRecord[]
  projects: PublicProject[]
  budget: BudgetLine[]
  funding: FundingNeed[]
  now: Date
}

function hasConfig(): boolean {
  return activeCorporation.id === 'bmc'
}

/**
 * The layer's clock. Its sources were opened and read on real dates; were "now"
 * left at the demonstration anchor (`DEMO_NOW`), every source read after it
 * would carry a negative age. So the layer reads time from whichever is later:
 * the anchor, or the newest retrieval in its own registry.
 */
function layerNow(sources: SourceRecord[]): Date {
  const latest = sources.reduce((max, s) => (s.lastRetrieved > max ? s.lastRetrieved : max), '')
  const retrieved = latest ? new Date(`${latest}T09:20:00+05:30`) : DEMO_NOW
  return retrieved > DEMO_NOW ? retrieved : DEMO_NOW
}

/**
 * Built once per corporation and language, and shared: every evidence-backed
 * figure on a screen reads the same layer rather than assembling its own.
 * Rebuilt by the runtime whenever the corporation or language changes.
 */
let cached: DecisionLayer | null = null
registerLayer(() => {
  cached = null
})

export function loadDecisionLayer(): DecisionLayer {
  if (!cached) cached = assembleDecisionLayer()
  return cached
}

function assembleDecisionLayer(): DecisionLayer {
  if (!hasConfig()) return { sources: [], evidence: [], projects: [], budget: [], funding: [], now: DEMO_NOW }
  const sources = [...bmcSources(), ...bmcProjectSources(), ...bmcAreaSources()]
  return {
    sources,
    evidence: [...bmcBaselineEvidence(), ...bmcProjectEvidence(), ...bmcAreaEvidence()],
    projects: bmcProjects(),
    budget: bmcBudgetLines(),
    funding: bmcFundingNeeds(),
    now: layerNow(sources),
  }
}

export function evidenceById(layer: DecisionLayer, id: string): EvidenceRecord | undefined {
  return layer.evidence.find((e) => e.id === id)
}

export function sourceById(layer: DecisionLayer, id: string): SourceRecord | undefined {
  return layer.sources.find((s) => s.id === id)
}

/* ------------------------------------------------------------------------ */
/* Case builders                                                            */
/* ------------------------------------------------------------------------ */

function evidenceOf(layer: DecisionLayer, ids: string[]): EvidenceRecord[] {
  return ids.map((id) => evidenceById(layer, id)).filter((e): e is EvidenceRecord => Boolean(e))
}

function factorsFor(layer: DecisionLayer, projects: PublicProject[], evidenceIds: string[], overrides: Partial<FactorValues> = {}): FactorValues {
  const crore = projects.reduce<number | null>((m, p) => {
    const c = projectCrore(p)
    return c === null ? m : Math.max(m ?? 0, c)
  }, null)
  const days = projects
    .map((p) => daysUntil(milestoneDate(p), layer.now))
    .filter((d): d is number => d !== null && d >= 0)
  const departments = new Set(projects.flatMap((p) => p.departments))
  const people = Math.max(0, ...projects.map((p) => p.serviceExposure?.people ?? 0))
  return {
    financial: materiality(crore),
    deadline: deadlineFactor(days.length ? Math.min(...days) : null),
    critical: projects.some((p) => p.critical) ? 1 : 0.3,
    dependency: Math.min(1, Math.max(0, departments.size - 1) / 3),
    service: Math.min(1, people / 600_000),
    evidence: evidenceFactor(evidenceOf(layer, evidenceIds)),
    ...overrides,
  }
}

function reasonText(r: CoordinationReason): string {
  switch (r.kind) {
    case 'shared-corridor':
      return t('Both works run along the same corridor: {0}.', r.name)
    case 'shared-locality':
      return t('Both works are in the same locality: {0}.', r.name)
    case 'buffer-overlap':
      return t('The two works lie {0} km apart, inside the coordination buffer.', formatNumber(r.km, 1))
    case 'timeline-overlap':
      return t('Their implementation windows overlap by about {0} days.', formatNumber(r.days))
    case 'timeline-unknown':
      return t('At least one implementation window is not published, so overlap cannot be ruled out.')
    case 'both-excavate':
      return t('Both works open the ground, so their sequence decides whether a reinstated surface is dug again.')
    case 'different-agencies':
      return t('They are executed by different agencies, so neither sequence is visible to the other by default.')
  }
}

export function buildCases(layer: DecisionLayer, weights?: Record<PriorityFactor, number>): IntelligenceCase[] {
  const cases: IntelligenceCase[] = []
  const now = layer.now

  // 1. Coordination - the build, dig, rebuild problem (spec §66-67, §101).
  for (const s of detectCoordination(layer.projects)) {
    const evidenceIds = [...new Set([...s.a.evidenceIds, ...s.b.evidenceIds])]
    const values = factorsFor(layer, [s.a, s.b], evidenceIds)
    const priority = scorePriority(values, weights)
    const days = [daysUntil(milestoneDate(s.a), now), daysUntil(milestoneDate(s.b), now)].filter((d): d is number => d !== null)
    cases.push({
      id: s.id,
      origin: 'coordination',
      title: t('Coordination check: {0} and {1}', s.a.name, s.b.name),
      context: t('Two publicly identified works share ground in {0} and their implementation periods may overlap. Public evidence does not show whether their execution sequence has been agreed.', activeCorporation.shortName),
      reasons: s.reasons.map(reasonText),
      evidenceIds,
      projectIds: [s.a.id, s.b.id],
      relationships: [
        { label: s.a.name, ref: s.a.id, kind: 'project' },
        { label: s.b.name, ref: s.b.id, kind: 'project' },
        ...[...new Set([...s.a.departments, ...s.b.departments])].map((d) => ({ label: d, ref: d, kind: 'department' as const })),
      ],
      signal: t('Potential dependency - interdepartmental verification required.'),
      priority,
      tier: alertTier(priority, {
        criticalInfrastructure: s.a.critical || s.b.critical,
        daysToDeadline: days.length ? Math.min(...days) : null,
        actionable: true,
        duplicate: false,
      }),
      recommendation: t('Convene the executing departments to confirm the execution sequence on the shared ground before the next excavation, and record the agreed order.'),
      responsibleRole: t('Municipal Commissioner'),
      departments: [...new Set([...s.a.departments, ...s.b.departments])],
      expectedOutcome: t('An agreed, recorded execution sequence; no reinstated surface on the shared ground re-opened by the other work within twelve months.'),
      evidenceLimits: [
        t('Public sources do not show detailed alignments, so a shared corridor or locality is not proof that trenches cross.'),
        t('No rework cost is estimated: public evidence cannot establish one.'),
      ],
      engine: ENGINE_VERSION,
    })
  }

  // 2. Milestones in the next 90 days, and passed dates with no confirmation.
  //    Completed and merely proposed works have no milestone to watch.
  for (const p of layer.projects) {
    if (p.phase === 'completed' || p.phase === 'proposed') continue
    const window = milestoneWindow(p, now)
    if (window !== 'next-30' && window !== 'next-60' && window !== 'next-90' && window !== 'passed-unconfirmed') continue
    const d = daysUntil(milestoneDate(p), now)
    const values = factorsFor(layer, [p], p.evidenceIds)
    const priority = scorePriority(values, weights)
    const passed = window === 'passed-unconfirmed'
    cases.push({
      id: `milestone:${p.id}`,
      origin: 'milestone',
      title: passed ? t('Completion date passed, not confirmed: {0}', p.name) : t('Milestone in {0} days: {1}', formatNumber(d ?? 0), p.name),
      context: passed
        ? t('The published completion date has passed and no public source confirms completion. This is not evidence of delay: public status reporting lags.')
        : t('The published completion date falls inside the next 90 days.'),
      reasons: [
        t('Published completion: {0}.', milestoneDate(p) ?? '—'),
        p.status ? t('Last published status: "{0}" ({1}).', p.status.text, p.status.asOf) : t('No status has been published.'),
      ],
      evidenceIds: p.evidenceIds,
      projectIds: [p.id],
      relationships: [{ label: p.name, ref: p.id, kind: 'project' }],
      signal: passed ? t('Completion unconfirmed - status verification required.') : t('Milestone approaching - readiness review.'),
      priority,
      tier: alertTier(priority, { criticalInfrastructure: p.critical, daysToDeadline: d, actionable: true, duplicate: false }),
      recommendation: passed
        ? t('Ask the executing agency for the current physical status and the revised completion date, and record the answer as evidence.')
        : t('Confirm with the executing agency that the milestone will be met, and what the Corporation must do before handover.'),
      responsibleRole: t('Chief Engineer'),
      departments: p.departments,
      expectedOutcome: passed ? t('A dated, sourced status for the work.') : t('Milestone met, or a revised date recorded before it passes.'),
      evidenceLimits: [t('Public sources give the scheduled date; they do not give physical progress against it.')],
      engine: ENGINE_VERSION,
    })
  }

  // 3. Stale public status - one case for the whole set, never "delayed" (spec §81, §124).
  const stale = layer.projects.filter((p) => p.phase !== 'completed' && p.phase !== 'proposed' && isStatusStale(p, now))
  if (stale.length > 0) {
    const evidenceIds = stale.flatMap((p) => p.evidenceIds)
    const values = factorsFor(layer, stale, evidenceIds, { deadline: 0.3 })
    const priority = scorePriority(values, weights)
    cases.push({
      id: 'stale:portfolio',
      origin: 'stale-status',
      title: t('Stale public status on {0} works', formatNumber(stale.length)),
      context: t('For these works the latest public status is older than {0} days, or no dated status exists. A project can look active simply because its public information is old; this is not evidence of delay.', formatNumber(120)),
      reasons: stale.map((p) => {
        const age = statusAgeDays(p, now)
        return age === null ? t('{0} - no dated public status.', p.name) : t('{0} - status {1} days old ({2}).', p.name, formatNumber(age), p.status?.asOf ?? '')
      }),
      evidenceIds,
      projectIds: stale.map((p) => p.id),
      relationships: stale.map((p) => ({ label: p.name, ref: p.id, kind: 'project' as const })),
      signal: t('Stale public status - not evidence of delay.'),
      priority,
      tier: alertTier(priority, { criticalInfrastructure: stale.some((p) => p.critical), daysToDeadline: null, actionable: true, duplicate: false }),
      recommendation: t('Request a current, dated status for each listed work from its executing department, and record it as evidence before the next review.'),
      responsibleRole: t('Chief Engineer'),
      departments: [...new Set(stale.flatMap((p) => p.departments))],
      expectedOutcome: t('Every listed work carries a status dated within the last 120 days.'),
      evidenceLimits: [t('An old report says nothing about current progress either way.')],
      engine: ENGINE_VERSION,
    })
  }

  // 4. Evidence gaps, grouped by what is missing (spec §113).
  const gapGroups: Array<{ id: string; title: (n: string) => string; test: (p: PublicProject) => boolean; ask: string }> = [
    {
      id: 'location',
      title: (n) => t('Location not published for {0} works', n),
      test: (p) => p.location.level === 'CITY' || p.location.level === 'UNKNOWN',
      ask: t('Ask the executing department for the streets or localities of each work, so dependencies with other works can be checked.'),
    },
    {
      id: 'money',
      title: (n) => t('No published cost for {0} works', n),
      test: (p) => Object.keys(p.money).length === 0,
      ask: t('Ask the owning department for the sanction order or estimate of each work, and attach it as evidence.'),
    },
    {
      id: 'tender',
      title: (n) => t('No tender or contract value published for {0} works', n),
      test: (p) => p.phase !== 'completed' && p.phase !== 'proposed' && Boolean(p.money.projectCost || p.money.sanctionedCost) && !p.money.tenderValue && !p.money.contractValue,
      ask: t('Ask Engineering for the awarded contract value of each work, so cost, tender and contract can be compared.'),
    },
  ]
  for (const g of gapGroups) {
    const hit = layer.projects.filter(g.test)
    if (hit.length === 0) continue
    const evidenceIds = hit.flatMap((p) => p.evidenceIds)
    const values = factorsFor(layer, hit, evidenceIds, { deadline: 0.15 })
    const priority = scorePriority(values, weights)
    cases.push({
      id: `gap:${g.id}`,
      origin: 'evidence-gap',
      title: g.title(formatNumber(hit.length)),
      context: t('Part of what the platform needs to reason about these works is not in public evidence. A gap is a request for information, not an indication of wrongdoing.'),
      reasons: hit.map((p) => p.name),
      evidenceIds,
      projectIds: hit.map((p) => p.id),
      relationships: hit.map((p) => ({ label: p.name, ref: p.id, kind: 'project' as const })),
      signal: t('Data / evidence gap - not an indication of wrongdoing.'),
      priority,
      tier: alertTier(priority, { criticalInfrastructure: false, daysToDeadline: null, actionable: true, duplicate: false }),
      recommendation: g.ask,
      responsibleRole: t('Deputy Commissioner'),
      departments: [...new Set(hit.flatMap((p) => p.departments))],
      expectedOutcome: t('The missing item recorded, with its source, for every listed work.'),
      evidenceLimits: [t('Until the item is supplied, dependent analysis (coordination, materiality) is weaker for these works.')],
      engine: ENGINE_VERSION,
    })
  }

  // 5. Contradictions between sources (spec §96) - one case per pair of
  //    disagreeing sources, listing every figure on which they disagree.
  const byPair = new Map<string, Array<[EvidenceRecord, EvidenceRecord]>>()
  const seen = new Set<string>()
  for (const e of layer.evidence) {
    for (const other of e.conflictsWith ?? []) {
      const key = [e.id, other].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      const o = evidenceById(layer, other)
      if (!o) continue
      const [first, second] = e.sourceId <= o.sourceId ? [e, o] : [o, e]
      const pairKey = `${first.sourceId}|${second.sourceId}`
      byPair.set(pairKey, [...(byPair.get(pairKey) ?? []), [first, second]])
    }
  }
  for (const [pairKey, items] of byPair) {
    const [a0, b0] = items[0] as [EvidenceRecord, EvidenceRecord]
    const sa = sourceById(layer, a0.sourceId)?.title ?? a0.sourceId
    const sb = sourceById(layer, b0.sourceId)?.title ?? b0.sourceId
    const evidenceIds = items.flatMap(([a, b]) => [a.id, b.id])
    const values: FactorValues = { financial: 0.05, deadline: 0.1, critical: 0.3, dependency: 0.33, service: items.length > 1 ? 0.6 : 1, evidence: evidenceFactor(evidenceOf(layer, evidenceIds)) }
    const priority = scorePriority(values, weights)
    cases.push({
      id: `conflict:${pairKey}`,
      origin: 'contradiction',
      title: items.length > 1 ? t('Sources disagree on {0} figures: {1}', formatNumber(items.length), a0.label) : t('Sources disagree: {0}', a0.label),
      context: t('Two sources state different values for the same thing. Both are kept and shown; neither is silently preferred. Source A: {0} ({1}). Source B: {2} ({3}).', sa, a0.period, sb, b0.period),
      reasons: items.map(([a, b]) => t('{0} vs {1} — {2}', a.value, b.value, a.quote.split(' … ')[0] ?? a.label)),
      evidenceIds,
      projectIds: [],
      relationships: [
        { label: sa, ref: a0.sourceId, kind: 'source' },
        { label: sb, ref: b0.sourceId, kind: 'source' },
      ],
      signal: t('Data contradiction - authoritative value to be confirmed.'),
      priority,
      tier: alertTier(priority, { criticalInfrastructure: false, daysToDeadline: null, actionable: true, duplicate: false }),
      recommendation: t('Ask the owner of each figure which value is current, record it as the authoritative status, and keep the other as history.'),
      responsibleRole: t('Deputy Commissioner'),
      departments: [t('Administration')],
      expectedOutcome: t('One authoritative value recorded for each figure, with the other kept as history.'),
      evidenceLimits: [t('Neither source states why it differs from the other.')],
      engine: ENGINE_VERSION,
    })
  }

  // 6. Resilience - south-west monsoon field-verification priority (spec §82, §103).
  //    Mumbai's rain falls June to September; flood and drainage works are
  //    verified from the pre-monsoon month (May) until the season closes.
  const swMonsoon = evidenceById(layer, 'ev-rainfall-santacruz-2026')
  const month = now.getUTCMonth()
  const floodWorks = layer.projects.filter((p) => p.sector === 'flood' || p.sector === 'drainage')
  if (swMonsoon && month >= 4 && month <= 8 && floodWorks.length > 0) {
    const evidenceIds = [swMonsoon.id, ...floodWorks.flatMap((p) => p.evidenceIds)]
    const values = factorsFor(layer, floodWorks, evidenceIds, { deadline: 1, critical: 1, service: 0.8 })
    const priority = scorePriority(values, weights)
    cases.push({
      id: 'resilience:sw-monsoon',
      origin: 'resilience',
      title: t('South-west monsoon: field verification of flood and drainage works'),
      context: t('Most of {0}\'s rain falls in the south-west monsoon, June to September. Flood-protection and drainage works whose current state is not confirmed by recent public evidence are the first places to verify on the ground.', activeCorporation.shortName),
      reasons: [
        t('South-west monsoon reference: {0}.', swMonsoon.value),
        ...floodWorks.map((p) => t('{0} - last public status: {1}.', p.name, p.status ? p.status.asOf : t('none'))),
      ],
      evidenceIds,
      projectIds: floodWorks.map((p) => p.id),
      relationships: floodWorks.map((p) => ({ label: p.name, ref: p.id, kind: 'project' as const })),
      signal: t('72-hour verification priority - not a flood forecast.'),
      priority,
      tier: alertTier(priority, { criticalInfrastructure: true, daysToDeadline: 0, actionable: true, duplicate: false }),
      recommendation: t('Send engineering teams to inspect each listed work and its outfall before the next heavy-rain advisory, and record what they find.'),
      responsibleRole: t('Disaster Management Officer'),
      departments: [...new Set(floodWorks.flatMap((p) => p.departments))],
      expectedOutcome: t('Every listed work inspected and its condition recorded before the season\'s first heavy-rain advisory.'),
      evidenceLimits: [t('This is not a flood prediction. Public evidence cannot establish drain capacity or blockage.')],
      engine: ENGINE_VERSION,
    })
  }

  // 7. Funding opportunities (spec §85).
  for (const need of layer.funding) {
    const values: FactorValues = { financial: 0.5, deadline: 0.2, critical: need.critical ? 1 : 0.3, dependency: 0.33, service: 0.5, evidence: evidenceFactor(evidenceOf(layer, need.evidenceIds)) }
    const priority = scorePriority(values, weights)
    cases.push({
      id: `funding:${need.id}`,
      origin: 'funding',
      title: t('Funding opportunity: {0}', need.need),
      context: need.context,
      reasons: need.schemes.map((s) => t('{0} - {1}', s.name, s.fit)),
      evidenceIds: need.evidenceIds,
      projectIds: need.projectIds,
      relationships: need.schemes.map((s) => ({ label: s.name, ref: s.url, kind: 'scheme' as const })),
      signal: t('Potential eligibility - verify.'),
      priority,
      tier: alertTier(priority, { criticalInfrastructure: need.critical, daysToDeadline: null, actionable: true, duplicate: false }),
      recommendation: t('Ask {0} to confirm eligibility against the current scheme guidelines and list the documents a proposal needs.', need.department),
      responsibleRole: t('Finance Officer'),
      departments: [need.department],
      expectedOutcome: t('Eligibility confirmed or ruled out in writing; where confirmed, a proposal timeline.'),
      evidenceLimits: [t('Scheme guidelines and windows change; eligibility is not confirmed until the scheme authority says so.')],
      engine: ENGINE_VERSION,
    })
  }

  return cases.sort((a, b) => b.priority.score - a.priority.score)
}
