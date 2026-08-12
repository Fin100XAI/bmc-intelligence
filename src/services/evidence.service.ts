import { EVIDENCE_BY_ID, EVIDENCE_ITEMS } from '@/data/evidence.data'
import { LINEAGE_BY_ID } from '@/data/governance.data'
import { filterByScope } from '@/security/access'
import type { AccessContext } from '@/security/model'
import type { LineageGraph } from '@/types/governance'
import type { EvidenceItem, ProvenanceChain } from '@/types/intelligence'
import type { User } from '@/types/organisation'
import { ServiceError, assertAccess, deepClone, recordAudit, scopeToTenant, simulateLatency } from './client'
import { t } from '@/i18n'

/**
 * src/services/evidence.service.ts
 *
 * The provenance layer - every intelligence item, alert, decision case and
 * AI response cites evidence records here, so no statement anywhere in the
 * platform is unsupported by a traceable source. Opening an evidence
 * record is itself a consequential act: `get` records a `view-evidence`
 * audit event every time.
 */

function contextFor(item: EvidenceItem): AccessContext {
  return { wardIds: item.wardIds, departmentId: item.departmentId, classification: item.classification }
}

function meta(item: EvidenceItem): { resourceType: string; resourceId: string; resourceLabel: string } {
  return { resourceType: 'Evidence', resourceId: item.id, resourceLabel: item.title }
}

function findOrThrow(user: User | null, id: string): EvidenceItem {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const item = EVIDENCE_BY_ID.get(id)
  if (!item || item.tenantId !== user.tenantId) {
    throw new ServiceError('not-found', `Evidence item "${id}" was not found.`)
  }
  return item
}

async function list(user: User | null, ids: string[]): Promise<EvidenceItem[]> {
  await simulateLatency(`evidence.list:${ids.join(',')}`)
  const scoped = scopeToTenant(user, EVIDENCE_ITEMS.filter((e) => ids.includes(e.id)))
  const visible = filterByScope(user, scoped, contextFor, 'evidence')
  return deepClone(visible)
}

async function get(user: User | null, id: string): Promise<EvidenceItem> {
  await simulateLatency(`evidence.get:${id}`)
  const item = findOrThrow(user, id)
  const authed = assertAccess(user, 'evidence', 'view', contextFor(item), meta(item))
  recordAudit(authed, {
    action: 'view-evidence',
    resourceType: 'Evidence',
    resourceId: item.id,
    resourceLabel: item.title,
    classification: item.classification,
    outcome: 'success',
  })
  return deepClone(item)
}

async function chain(user: User | null, evidenceId: string): Promise<ProvenanceChain> {
  await simulateLatency(`evidence.chain:${evidenceId}`)
  const item = findOrThrow(user, evidenceId)
  assertAccess(user, 'evidence', 'view', contextFor(item), meta(item))
  const lineageGraph = LINEAGE_BY_ID.get(item.lineageId)
  const stages = lineageGraph?.stages ?? []
  const detailFor = (kind: (typeof stages)[number]['kind']): string =>
    stages.find((s) => s.kind === kind)?.detail ?? 'Not modelled for this evidence item.'

  const result: ProvenanceChain = {
    source: `${item.sourceSystem} (${item.sourceRecordRef}), observed ${item.observedAt}.`,
    transformation: item.transformation,
    metric: detailFor('derived-metric'),
    ruleOrModel: detailFor('intelligence-engine'),
    intelligence: 'Intelligence items citing this evidence are listed against the source record and reachable from it.',
    recommendation: t('Any recommendation citing this evidence requires a named human approval before it can be actioned.'),
    humanDecision: detailFor('decision'),
    action: 'Actions raised from intelligence citing this evidence are tracked in the action register.',
    outcome: t('Outcome is recorded against the decision case, where one has been raised from intelligence citing this evidence.'),
  }
  return deepClone(result)
}

async function lineage(user: User | null, lineageId: string): Promise<LineageGraph> {
  await simulateLatency(`evidence.lineage:${lineageId}`)
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const graph = LINEAGE_BY_ID.get(lineageId)
  if (!graph || graph.tenantId !== user.tenantId) {
    throw new ServiceError('not-found', `Lineage graph "${lineageId}" was not found.`)
  }
  assertAccess(user, 'evidence', 'view', { classification: graph.classification, domain: graph.domain }, {
    resourceType: 'Lineage Graph',
    resourceId: graph.id,
    resourceLabel: graph.metricLabel,
  })
  return deepClone(graph)
}

export const evidenceService = {
  list,
  get,
  chain,
  lineage,
}
