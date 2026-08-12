import type { ConfidenceLevel, IntelligenceDomain } from '@/types/common'
import type { AIRecommendationBlock, AIResponse, AIVisual, GroundingMode } from '@/types/ai'
import type { EvidenceItem } from '@/types/intelligence'
import type { User, Ward } from '@/types/organisation'
import { canAccess } from '@/security/access'
import { EVIDENCE_BY_ID, EVIDENCE_ITEMS } from '@/data/evidence.data'
import { INTELLIGENCE_ITEMS } from '@/data/intelligence.data'
import { WARDS, wardName, wardShortName } from '@/data/reference'
import { municipality } from '@/config/municipality.config'
import type { QueryUnderstanding } from './nlu'
import { t } from '@/i18n'

/**
 * src/ai/answer-kit.ts
 *
 * The shared contract every Copilot retrieval route is written against.
 *
 * A route's whole job is: take an authorised principal and a *understood*
 * question, compute real figures from the platform's own records, and hand back
 * a `ComposedAnswer`. It does not decide confidence (derived from evidence), it
 * does not stamp timestamps, and it does not choose colours - those belong to
 * the provider and the component layer respectively.
 *
 * The scope helpers here are not conveniences. Retrieval is filtered through
 * `canAccess` **before** anything is composed, so an unauthorised record is
 * never summarised, counted, or hinted at by its absence. Every route uses
 * these rather than reaching into `@/data/*` unfiltered.
 */

/* ==========================================================================
   Context handed to a route
   ========================================================================== */

export interface AnswerContext {
  /** The acting principal. All retrieval is filtered against this. */
  user: User
  /** How the question was read. Routes must honour the entities bound here. */
  understanding: QueryUnderstanding
  /** Every ward the principal may read. */
  wards: Ward[]
  /** Wards the question named, intersected with what the principal may read. */
  focusWards: Ward[]
  /**
   * The wards this answer should actually cover: the named ones where the
   * question named any, otherwise every authorised ward. Routes read this.
   */
  scopeWards: Ward[]
  /** True where `scopeWards` is narrower than the principal's full scope. */
  narrowed: boolean
  /** Result count: what the operator asked for, else the route's default. */
  limit: number
}

/** What a route returns. The provider derives confidence and provenance from it. */
export interface ComposedAnswer {
  /** Stable, scope-dependent identifier for the request log. */
  requestId: string
  answer: string
  keyFindings: string[]
  evidence: EvidenceItem[]
  recommendedActions: AIRecommendationBlock[]
  risksAndLimitations: string[]
  sources: string[]
  domains: IntelligenceDomain[]
  supportingTable?: AIResponse['supportingTable']
  visuals?: AIVisual[]
  followUps?: string[]
  /** Only set to override the evidence-derived default. */
  grounding?: GroundingMode
}

export type AnswerHandler = (ctx: AnswerContext) => ComposedAnswer

/* ==========================================================================
   Scoped retrieval
   ========================================================================== */

/** Wards the principal is authorised to read. */
export function authorisedWards(user: User): Ward[] {
  return WARDS.filter((w) => canAccess(user, 'ward', 'view', { wardId: w.id }).allowed)
}

/** Evidence records the principal is authorised to read, by identifier. */
export function scopedEvidence(user: User, ids: string[]): EvidenceItem[] {
  const seen = new Set<string>()
  const out: EvidenceItem[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const item = EVIDENCE_BY_ID.get(id)
    if (!item) continue
    const allowed = canAccess(user, 'evidence', 'view', {
      wardIds: item.wardIds,
      departmentId: item.departmentId,
      classification: item.classification,
    }).allowed
    if (allowed) out.push(item)
  }
  return out
}

/** Authorised evidence of the given kinds, newest observation first. */
export function evidenceOfKind(user: User, kinds: Array<EvidenceItem['kind']>, count = 5): EvidenceItem[] {
  const candidates = EVIDENCE_ITEMS.filter((e) => kinds.includes(e.kind))
    .slice()
    .sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1))
    .map((e) => e.id)
  return scopedEvidence(user, candidates).slice(0, count)
}

/** Authorised evidence attached to any of the given wards. */
export function evidenceForWards(user: User, wardIds: string[], count = 5): EvidenceItem[] {
  if (wardIds.length === 0) return []
  const wanted = new Set(wardIds)
  const candidates = EVIDENCE_ITEMS.filter((e) => e.wardIds.some((w) => wanted.has(w))).map((e) => e.id)
  return scopedEvidence(user, candidates).slice(0, count)
}

/** Authorised evidence whose title mentions the given term. */
export function evidenceMatching(user: User, term: string, count = 5): EvidenceItem[] {
  const needle = term.toLowerCase()
  const candidates = EVIDENCE_ITEMS.filter((e) => e.title.toLowerCase().includes(needle)).map((e) => e.id)
  return scopedEvidence(user, candidates).slice(0, count)
}

/** Open intelligence within the principal's ward, department and domain scope. */
export function scopedIntelligence(user: User, domain?: IntelligenceDomain) {
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

/**
 * Evidence chosen to back an answer, falling back through progressively
 * broader pools so a route in a narrow ward scope still cites something real
 * rather than citing nothing and silently losing its confidence rating.
 */
export function bestEvidence(
  user: User,
  options: { wardIds?: string[]; kinds?: Array<EvidenceItem['kind']>; term?: string; count?: number },
): EvidenceItem[] {
  const count = options.count ?? 5
  const collected: EvidenceItem[] = []
  const push = (items: EvidenceItem[]): void => {
    for (const item of items) {
      if (collected.length >= count) return
      if (!collected.some((e) => e.id === item.id)) collected.push(item)
    }
  }
  if (options.term) push(evidenceMatching(user, options.term, count))
  if (options.wardIds && options.wardIds.length > 0) push(evidenceForWards(user, options.wardIds, count))
  if (options.kinds && options.kinds.length > 0) push(evidenceOfKind(user, options.kinds, count))
  return collected.slice(0, count)
}

/* ==========================================================================
   Composition helpers
   ========================================================================== */

/**
 * The limitations attached to every substantive answer.
 *
 * A getter, not a constant: the provider is constructed once at module load,
 * so a frozen array would disclaim against whichever corporation happened to
 * be active then and would keep doing so after a corporation switch.
 */
export function standardLimitations(): string[] {
  return [
    municipality.dataProvenanceStatement,
    t('Retrieval is limited to records within your authorised ward, department, domain and classification scope. Records outside that scope are not summarised and their absence is not indicated.'),
    t('This response analyses and recommends. It does not decide, and it cannot transition any municipal record.'),
  ]
}

/** Builds a recommendation block. Every one requires a named human approver. */
export function recommend(input: {
  id: string
  title: string
  why: string
  expectedImpact: string
  departmentId: string
  humanOwnerRole: string
  confidence: ConfidenceLevel
  dependencies?: string[]
  risks?: string[]
  evidenceRefs?: string[]
}): AIRecommendationBlock {
  return {
    id: input.id,
    title: input.title,
    why: input.why,
    evidenceRefs: input.evidenceRefs ?? [],
    expectedImpact: input.expectedImpact,
    confidence: input.confidence,
    dependencies: input.dependencies ?? [],
    risks: input.risks ?? [],
    humanOwnerRole: input.humanOwnerRole,
    departmentId: input.departmentId,
    requiresHumanApproval: true,
  }
}

/** Unique source systems behind a set of evidence, for the provenance tab. */
export function sourcesOf(evidence: EvidenceItem[], ...extra: string[]): string[] {
  return Array.from(new Set([...evidence.map((e) => e.sourceSystem), ...extra])).filter(Boolean)
}

/** A sentence naming exactly what geography the answer covers. */
export function scopeSentence(ctx: AnswerContext): string {
  if (ctx.scopeWards.length === 0) return t('No ward within your authorised scope could be read for this question.')
  if (ctx.narrowed) {
    return t('Narrowed to {0} because the question named {1}.', ctx.scopeWards.map((w) => wardName(w.id)).join(', '), ctx.scopeWards.length === 1 ? t('that ward') : t('those wards'))
  }
  if (ctx.scopeWards.length === WARDS.length) return t('Covering all {0} wards.', ctx.scopeWards.length)
  return t('Covering the {0} wards within your authorised scope.', ctx.scopeWards.length)
}

/** True where the record's ward falls inside the answer's geographic scope. */
export function inScope(ctx: AnswerContext, wardId: string): boolean {
  return ctx.scopeWards.some((w) => w.id === wardId)
}

/** True where any of the record's wards falls inside the answer's scope. */
export function anyInScope(ctx: AnswerContext, wardIds: string[]): boolean {
  return wardIds.some((id) => inScope(ctx, id))
}

/** Short ward label for chart axes, where the full name would not fit. */
export const shortWard = wardShortName

/** Full ward label for prose and tables. */
export const fullWard = wardName

/* ==========================================================================
   Visual builders
   ========================================================================== */

export function metricsVisual(
  id: string,
  items: Array<{ label: string; value: string; support?: string; tone?: 'default' | 'positive' | 'warn' | 'critical' }>,
  caption?: string,
): AIVisual {
  return { kind: 'metrics', id, items, caption }
}

export function rankedBarVisual(input: {
  id: string
  caption: string
  unit: string
  higherIsBetter: boolean
  data: Array<{ label: string; value: number }>
}): AIVisual {
  return { kind: 'ranked-bar', ...input }
}

export function compositionVisual(input: {
  id: string
  caption: string
  segments: Array<{ id: string; label: string; value: number; colour: string }>
}): AIVisual {
  return { kind: 'composition', ...input }
}

export function trendVisual(input: {
  id: string
  caption: string
  unit: string
  series: Array<{ id: string; name: string; unit: string; points: Array<{ label: string; value: number; comparison?: number }> }>
}): AIVisual {
  return { kind: 'trend', ...input }
}

export function heatmapVisual(input: {
  id: string
  caption: string
  rows: Array<{ id: string; label: string }>
  columns: Array<{ id: string; label: string }>
  values: Record<string, Record<string, number>>
  higherIsBetter: boolean
}): AIVisual {
  return { kind: 'heatmap', ...input }
}

/** Palette tokens routes may reference for composition segments. */
export const VISUAL_COLOUR = {
  govt: 'var(--color-govt-500)',
  govtSoft: 'var(--color-govt-300)',
  intel: 'var(--color-intel-500)',
  ok: 'var(--color-ok-500)',
  warn: 'var(--color-warn-500)',
  crit: 'var(--color-crit-500)',
  muted: 'var(--color-ink-300)',
} as const

/** Tone for a 0-100 score, given whether a high value is good. */
export function toneFor(score: number, higherIsBetter: boolean): 'default' | 'positive' | 'warn' | 'critical' {
  const good = higherIsBetter ? score >= 75 : score <= 25
  const bad = higherIsBetter ? score < 50 : score > 70
  const middling = higherIsBetter ? score < 65 : score > 50
  if (good) return 'positive'
  if (bad) return 'critical'
  if (middling) return 'warn'
  return 'default'
}

/* ==========================================================================
   Standard answers
   ========================================================================== */

/** The answer given where the permission engine refused retrieval. */
export function deniedAnswer(ctx: AnswerContext, subject: string, reason: string): ComposedAnswer {
  return {
    requestId: `q-denied-${ctx.understanding.intent.id}-${ctx.user.id}`,
    answer:
      `${reason} Retrieval was not attempted, and no partial or inferred figure is offered in its place. `
      + 'If this access is required for your responsibilities, raise a scope amendment through Access Governance.',
    keyFindings: [],
    evidence: [],
    recommendedActions: [],
    risksAndLimitations: [
      t('The permission engine denied retrieval before generation. The denial has been recorded in the audit trail.'),
      t('Subject withheld: {0}.', subject),
    ],
    sources: [t('BMC Intelligence Core - permission engine')],
    domains: ctx.understanding.intent.domains,
    grounding: 'general-reasoning',
  }
}

/** The answer given where a route ran but its underlying register was empty. */
export function emptyAnswer(ctx: AnswerContext, subject: string, detail: string): ComposedAnswer {
  return {
    requestId: `q-empty-${ctx.understanding.intent.id}-${ctx.user.id}`,
    answer:
      `No ${subject} record was returned within your authorised scope. ${detail} `
      + 'This describes your scope only; it is not a statement about the corporation as a whole.',
    keyFindings: [],
    evidence: [],
    recommendedActions: [],
    risksAndLimitations: standardLimitations(),
    sources: [t('BMC Intelligence Core')],
    domains: ctx.understanding.intent.domains,
    grounding: 'general-reasoning',
  }
}
