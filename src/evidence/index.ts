import type { DataFreshness, IntelligenceDomain } from '@/types/common'
import type { EvidenceItem, ProvenanceChain } from '@/types/intelligence'
import type { LineageGraph } from '@/types/governance'
import { t } from '@/i18n'

/**
 * Evidence and decision provenance helpers.
 *
 * The platform's central claim is that nothing it displays is unaccountable.
 * These helpers assemble the chain that makes that claim inspectable.
 */

/** The nine stages of the provenance chain, in institutional order. */
export const PROVENANCE_STAGES = [
  { id: 'source', label: 'Source', description: 'The authoritative departmental record. Remains the system of record.' },
  { id: 'transformation', label: 'Transformation', description: 'What was applied between the source record and the metric.' },
  { id: 'metric', label: 'Metric', description: 'The derived indicator, computed by a published formula.' },
  { id: 'ruleOrModel', label: 'Rule / Model', description: 'The rule or model that evaluated the metric, and its version.' },
  { id: 'intelligence', label: 'Intelligence', description: 'The signal raised, with its severity and confidence.' },
  { id: 'recommendation', label: 'Recommendation', description: 'The advisory course of action, with its rationale and risks.' },
  { id: 'humanDecision', label: 'Human Decision', description: 'The named officer who decided, and why.' },
  { id: 'action', label: 'Action', description: 'The assigned, accountable task that followed.' },
  { id: 'outcome', label: 'Outcome', description: 'What was measured afterwards, reported without adjustment.' },
] as const satisfies ReadonlyArray<{ id: keyof ProvenanceChain; label: string; description: string }>

/**
 * Assesses whether a set of evidence is strong enough to support an assertion.
 * Confidence is derived, never chosen - and the derivation is returned so the
 * interface can state it.
 */
export function assessEvidenceStrength(
  evidence: EvidenceItem[],
  freshness?: DataFreshness,
): { confidence: 'high' | 'medium' | 'low'; rationale: string } {
  if (evidence.length === 0) {
    return {
      confidence: 'low',
      rationale:
        t('No evidence records back this statement. It is presented as general reasoning rather than an evidence-backed assertion.'),
    }
  }

  const avgQuality = evidence.reduce((sum, e) => sum + e.dataQuality, 0) / evidence.length
  const modelInvolved = evidence.some((e) => e.modelId)
  const stale = freshness?.stale ?? false

  const parts: string[] = [
    `${evidence.length} evidence record${evidence.length === 1 ? '' : 's'} with an average data quality of ${avgQuality.toFixed(0)}/100`,
  ]
  if (modelInvolved) parts.push('a model participated in producing part of the evidence set')
  if (stale) parts.push('the newest source observation is older than its refresh cadence')

  let confidence: 'high' | 'medium' | 'low'
  if (evidence.length >= 3 && avgQuality >= 82 && !stale) confidence = 'high'
  else if (evidence.length >= 2 && avgQuality >= 66 && !stale) confidence = 'medium'
  else confidence = 'low'

  return {
    confidence,
    rationale: t('Derived from {0}.', parts.join('; ')),
  }
}

/** Summarises a lineage graph into a single readable statement. */
export function describeLineage(graph: LineageGraph): string {
  const source = graph.stages.find((s) => s.kind === 'source')
  const validation = graph.stages.find((s) => s.kind === 'validation')
  return (
    `${graph.metricLabel} is derived from ${source?.name ?? 'a departmental source'} through ` +
    `${graph.stages.length} declared pipeline stages. ` +
    `${validation ? `Validation quality at the assessment stage is ${validation.quality}/100. ` : ''}` +
    `Records failing validation are quarantined with a reason code rather than silently discarded.`
  )
}

/** Groups evidence by its source system for the evidence drawer summary. */
export function groupEvidenceBySource(evidence: EvidenceItem[]): Array<{ source: string; items: EvidenceItem[] }> {
  const map = new Map<string, EvidenceItem[]>()
  for (const item of evidence) {
    const list = map.get(item.sourceSystem) ?? []
    list.push(item)
    map.set(item.sourceSystem, list)
  }
  return Array.from(map.entries())
    .map(([source, items]) => ({ source, items }))
    .sort((a, b) => b.items.length - a.items.length)
}

/** Domains represented in an evidence set - used to badge cross-domain items. */
export function evidenceDomains(evidence: EvidenceItem[], resolve: (id: string) => IntelligenceDomain | undefined): IntelligenceDomain[] {
  const domains = new Set<IntelligenceDomain>()
  for (const item of evidence) {
    const domain = resolve(item.lineageId)
    if (domain) domains.add(domain)
  }
  return Array.from(domains)
}

/**
 * The statement rendered wherever a figure is presented without a complete
 * chain - the platform says so rather than implying completeness.
 */
export const INCOMPLETE_CHAIN_NOTICE =
  'The provenance chain for this figure is incomplete beyond the intelligence stage. It has not yet reached a human decision, and must not be read as an institutional position.'
