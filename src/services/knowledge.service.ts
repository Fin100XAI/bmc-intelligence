import { MEMORY_RECORDS, MEMORY_BY_ID } from '@/data/knowledge.data'
import { filterByScope } from '@/security/access'
import type { MemoryKind, MemoryRecord } from '@/types/knowledge'
import type { IntelligenceDomain } from '@/types/common'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/knowledge.service.ts
 *
 * Institutional Memory.
 *
 * Records are scoped by ward before they are returned, so a ward officer reads
 * the memory relevant to their ward and city-wide records, but not another
 * ward's ward-specific history. A record with no ward attached is corporation
 * knowledge and is readable by anyone with the intelligence permission.
 */

export interface MemoryFilters {
  kind?: MemoryKind
  domain?: IntelligenceDomain
  search?: string
}

function scoped(user: User | null): MemoryRecord[] {
  const tenant = scopeToTenant(user, MEMORY_RECORDS)
  // A record with no ward is corporation-wide knowledge; a ward-tagged record
  // is only shown to a principal whose scope includes one of its wards.
  return tenant.filter((record) => {
    if (record.wardIds.length === 0) return true
    return filterByScope(user, [record], (r) => ({ wardIds: r.wardIds, domain: r.domain }), 'intelligence').length > 0
  })
}

async function records(user: User | null, filters: MemoryFilters = {}): Promise<MemoryRecord[]> {
  await simulateLatency(`knowledge.records:${JSON.stringify(filters)}`)

  let visible = scoped(user)
  if (filters.kind) visible = visible.filter((r) => r.kind === filters.kind)
  if (filters.domain) visible = visible.filter((r) => r.domain === filters.domain)
  if (filters.search) {
    const q = filters.search.trim().toLowerCase()
    visible = visible.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.lesson.toLowerCase().includes(q) ||
        r.tags.some((t) => t.includes(q)),
    )
  }

  const sig: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  return deepClone(
    [...visible].sort((a, b) => sig[a.significance] - sig[b.significance] || (a.occurredAt < b.occurredAt ? 1 : -1)),
  )
}

async function record(user: User | null, id: string): Promise<MemoryRecord | null> {
  await simulateLatency(`knowledge.record:${id}`)
  const all = scoped(user)
  return all.find((r) => r.id === id) ? deepClone(MEMORY_BY_ID.get(id) ?? null) : null
}

export interface SimilarMemory {
  record: MemoryRecord
  /** 0–1 relevance against the query record. */
  relevance: number
  /** Why this record was surfaced as similar. */
  basis: string[]
}

/**
 * "Show similar past incidents and what actions were taken" (§41).
 *
 * Similarity is computed from shared domain, overlapping tags, shared wards and
 * an explicit related-record link. Transparent by design: the basis for every
 * match is returned alongside it, so an officer can see why a record surfaced.
 */
async function similar(user: User | null, id: string, limit = 5): Promise<SimilarMemory[]> {
  await simulateLatency(`knowledge.similar:${id}`)

  const anchor = MEMORY_BY_ID.get(id)
  if (!anchor) return []

  const pool = scoped(user).filter((r) => r.id !== id)
  const anchorTags = new Set(anchor.tags)
  const anchorWards = new Set(anchor.wardIds)

  const scored = pool.map((candidate) => {
    const basis: string[] = []
    let relevance = 0

    if (candidate.domain === anchor.domain) {
      relevance += 0.35
      basis.push('same domain')
    }
    const sharedTags = candidate.tags.filter((t) => anchorTags.has(t))
    if (sharedTags.length > 0) {
      relevance += Math.min(0.4, sharedTags.length * 0.15)
      basis.push(`shared themes: ${sharedTags.join(', ')}`)
    }
    if (candidate.wardIds.some((w) => anchorWards.has(w))) {
      relevance += 0.15
      basis.push('shared ward')
    }
    if (anchor.relatedIds.includes(candidate.id) || candidate.relatedIds.includes(anchor.id)) {
      relevance += 0.3
      basis.push('explicitly linked record')
    }

    return { record: candidate, relevance: Math.min(1, relevance), basis }
  })

  return deepClone(
    scored
      .filter((s) => s.relevance > 0.2)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit),
  )
}

export interface MemorySummary {
  total: number
  byKind: Array<{ kind: MemoryKind; count: number }>
  oldestDays: number
  newestDays: number
}

async function summary(user: User | null): Promise<MemorySummary> {
  await simulateLatency('knowledge.summary')
  const all = scoped(user)
  const byKindMap = new Map<MemoryKind, number>()
  for (const r of all) byKindMap.set(r.kind, (byKindMap.get(r.kind) ?? 0) + 1)

  return {
    total: all.length,
    byKind: [...byKindMap.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    oldestDays: 0,
    newestDays: 0,
  }
}

export const knowledgeService = {
  records,
  record,
  similar,
  summary,
}
