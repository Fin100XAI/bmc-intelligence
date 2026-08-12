import { AGENT_WORKFLOWS, AI_AGENTS, AI_EVALUATIONS, AI_INCIDENTS, AI_MODELS, AI_RISK_REGISTER, PROMPT_TEMPLATES } from '@/data/ai.data'
import { canAccess } from '@/security/access'
import type {
  AIAgent,
  AIEvaluation,
  AIIncident,
  AIModel,
  AIRequestRecord,
  AIRiskEntry,
  AIUseCase,
  AgentWorkflow,
  HumanOversightRecord,
  PromptTemplate,
} from '@/types/ai'
import type { IntelligenceDomain, Paged } from '@/types/common'
import type { User } from '@/types/organisation'
import { isoFromAnchor } from '@/utils/deterministic'
import { ServiceError, assertAccess, deepClone, paginate, recordAudit, scopeToTenant, simulateLatency } from './client'
import { emitChange, getCollection, setCollection, type SavedBrief } from './store'
import { t } from '@/i18n'

/**
 * src/services/ai.service.ts
 *
 * The governed AI layer's registry, request log and human-oversight
 * surface. This service never generates an `AIResponse` itself - that is
 * `src/ai/provider.ts`'s `AIProvider` contract, implemented by a concrete
 * provider elsewhere. `recordRequest` persists a request a provider (or a
 * test harness) has already produced; `reviewRecommendation` is the
 * technical enforcement of "recommendations are never actioned without a
 * named human reviewer."
 */

export interface AIRequestFilters {
  useCase?: AIUseCase[]
  requestedBy?: string
  reviewStatus?: Array<AIRequestRecord['reviewStatus']>
  policyStatus?: Array<AIRequestRecord['policyStatus']>
  domain?: IntelligenceDomain
  page?: number
  pageSize?: number
}

export interface OversightFilters {
  outcome?: Array<HumanOversightRecord['outcome']>
  useCase?: AIUseCase[]
  domain?: IntelligenceDomain
  page?: number
  pageSize?: number
}

export interface OversightSummary {
  pending: number
  accepted: number
  modified: number
  rejected: number
  escalated: number
  acceptanceRate: number
}

/** `AIRequestRecord.domains` is an array, so the single-value `context.domain`
 * check `canAccess`/`filterByScope` perform is not expressive enough - this
 * mirrors that check across every domain the request touched. */
function isRequestVisible(user: User, request: AIRequestRecord): boolean {
  if (!canAccess(user, 'ai', 'view', { classification: request.classification }).allowed) return false
  if (user.scope.domains === '*') return true
  if (request.domains.length === 0) return true
  return request.domains.some((d) => user.scope.domains.includes(d))
}

function matchesRequestFilters(record: AIRequestRecord, filters: AIRequestFilters): boolean {
  if (filters.useCase && filters.useCase.length > 0 && !filters.useCase.includes(record.useCase)) return false
  if (filters.requestedBy && record.requestedBy !== filters.requestedBy) return false
  if (filters.reviewStatus && filters.reviewStatus.length > 0 && !filters.reviewStatus.includes(record.reviewStatus)) return false
  if (filters.policyStatus && filters.policyStatus.length > 0 && !filters.policyStatus.includes(record.policyStatus)) return false
  if (filters.domain && !record.domains.includes(filters.domain)) return false
  return true
}

function matchesOversightFilters(record: HumanOversightRecord, filters: OversightFilters): boolean {
  if (filters.outcome && filters.outcome.length > 0 && !filters.outcome.includes(record.outcome)) return false
  if (filters.useCase && filters.useCase.length > 0 && !filters.useCase.includes(record.useCase)) return false
  if (filters.domain && record.domain !== filters.domain) return false
  return true
}

function findOversightOrThrow(user: User | null, id: string): HumanOversightRecord {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const record = getCollection('humanOversight').find((r) => r.id === id && r.tenantId === user.tenantId)
  if (!record) throw new ServiceError('not-found', `Human oversight record "${id}" was not found.`)
  return record
}

async function requests(user: User | null, filters: AIRequestFilters = {}): Promise<Paged<AIRequestRecord>> {
  await simulateLatency(`ai.requests:${JSON.stringify(filters)}`)
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const scoped = scopeToTenant(user, getCollection('aiRequests'))
  const visible = scoped.filter((r) => isRequestVisible(user, r))
  const filtered = visible.filter((r) => matchesRequestFilters(r, filters))
  const sorted = [...filtered].sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1))
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 30)
  return { ...page, items: deepClone(page.items) }
}

async function models(user: User | null): Promise<AIModel[]> {
  await simulateLatency('ai.models')
  assertAccess(user, 'ai-governance', 'view', { domain: 'ai-governance' }, {
    resourceType: 'AI Model',
    resourceId: 'all',
    resourceLabel: 'Model registry',
  })
  return deepClone(AI_MODELS)
}

async function prompts(user: User | null): Promise<PromptTemplate[]> {
  await simulateLatency('ai.prompts')
  assertAccess(user, 'ai-governance', 'view', { domain: 'ai-governance' }, {
    resourceType: 'Prompt Template',
    resourceId: 'all',
    resourceLabel: 'Prompt registry',
  })
  return deepClone(PROMPT_TEMPLATES)
}

async function riskRegister(user: User | null): Promise<AIRiskEntry[]> {
  await simulateLatency('ai.riskRegister')
  assertAccess(user, 'ai-governance', 'view', { domain: 'ai-governance' }, {
    resourceType: 'AI Risk Entry',
    resourceId: 'all',
    resourceLabel: 'AI risk register',
  })
  return deepClone(AI_RISK_REGISTER)
}

async function oversight(user: User | null, filters: OversightFilters = {}): Promise<Paged<HumanOversightRecord>> {
  await simulateLatency(`ai.oversight:${JSON.stringify(filters)}`)
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const scoped = scopeToTenant(user, getCollection('humanOversight'))
  const visible = scoped.filter(
    (r) => user.scope.domains === '*' || user.scope.domains.includes(r.domain),
  )
  assertAccess(user, 'ai-governance', 'view', { domain: 'ai-governance' }, {
    resourceType: 'Human Oversight',
    resourceId: 'all',
    resourceLabel: 'Human oversight register',
  })
  const filtered = visible.filter((r) => matchesOversightFilters(r, filters))
  const sorted = [...filtered].sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 30)
  return { ...page, items: deepClone(page.items) }
}

async function incidents(user: User | null): Promise<AIIncident[]> {
  await simulateLatency('ai.incidents')
  assertAccess(user, 'ai-governance', 'view', { domain: 'ai-governance' }, {
    resourceType: 'AI Incident',
    resourceId: 'all',
    resourceLabel: 'AI incidents',
  })
  return deepClone(AI_INCIDENTS)
}

async function agentWorkflows(user: User | null): Promise<AgentWorkflow[]> {
  await simulateLatency('ai.agentWorkflows')
  assertAccess(user, 'ai-governance', 'view', { domain: 'ai-governance' }, {
    resourceType: 'Agent Workflow',
    resourceId: 'all',
    resourceLabel: 'Agent workflows',
  })
  return deepClone(AGENT_WORKFLOWS)
}

async function agents(user: User | null): Promise<AIAgent[]> {
  await simulateLatency('ai.agents')
  assertAccess(user, 'ai-governance', 'view', { domain: 'ai-governance' }, {
    resourceType: 'AI Agent',
    resourceId: 'all',
    resourceLabel: 'AI agents',
  })
  return deepClone(AI_AGENTS)
}

async function evaluations(user: User | null): Promise<AIEvaluation[]> {
  await simulateLatency('ai.evaluations')
  assertAccess(user, 'ai-governance', 'view', { domain: 'ai-governance' }, {
    resourceType: 'AI Evaluation',
    resourceId: 'all',
    resourceLabel: 'AI model evaluations',
  })
  return deepClone(AI_EVALUATIONS)
}

export type AIRequestInput = Omit<AIRequestRecord, 'id' | 'tenantId' | 'requestedBy' | 'requestedByRole' | 'requestedAt'>

async function recordRequest(user: User | null, record: AIRequestInput): Promise<AIRequestRecord> {
  await simulateLatency('ai.recordRequest', 180, 420)
  const authed = assertAccess(user, 'ai', 'create', { classification: record.classification }, {
    resourceType: 'AI Request',
    resourceId: 'new',
    resourceLabel: record.prompt.slice(0, 60),
  })
  const existing = getCollection('aiRequests')
  const seq = existing.length + 1
  const newRecord: AIRequestRecord = {
    ...record,
    id: `air-live-${String(seq).padStart(4, '0')}`,
    tenantId: authed.tenantId,
    requestedBy: authed.id,
    requestedByRole: authed.roleId,
    requestedAt: isoFromAnchor(0),
  }
  setCollection('aiRequests', [newRecord, ...existing])
  recordAudit(authed, {
    action: 'ai-request',
    resourceType: 'AI Request',
    resourceId: newRecord.id,
    resourceLabel: newRecord.prompt.slice(0, 80),
    classification: newRecord.classification,
    outcome: 'success',
    detail: `${newRecord.useCase} · ${newRecord.modelId}.`,
  })
  emitChange()
  return deepClone(newRecord)
}

async function reviewRecommendation(
  user: User | null,
  oversightId: string,
  outcome: HumanOversightRecord['outcome'],
  note?: string,
): Promise<HumanOversightRecord> {
  await simulateLatency(`ai.reviewRecommendation:${oversightId}`)
  const record = findOversightOrThrow(user, oversightId)
  const authed = assertAccess(user, 'ai-governance', 'approve', { domain: record.domain }, {
    resourceType: 'Human Oversight Record',
    resourceId: record.id,
    resourceLabel: record.recommendationTitle,
  })
  const updated: HumanOversightRecord = {
    ...record,
    outcome,
    reviewerId: authed.id,
    reviewedAt: isoFromAnchor(0),
    modificationNote: note ?? record.modificationNote,
  }
  setCollection('humanOversight', getCollection('humanOversight').map((r) => (r.id === updated.id ? updated : r)))
  recordAudit(authed, {
    action: outcome === 'accepted' ? 'approve' : outcome === 'rejected' ? 'reject' : 'status-change',
    resourceType: 'Human Oversight Record',
    resourceId: record.id,
    resourceLabel: record.recommendationTitle,
    classification: 'confidential',
    outcome: 'success',
    reason: note,
    detail: t('Reviewed with outcome "{0}".', outcome),
  })
  emitChange()
  return deepClone(updated)
}

/** Recomputed from the live store (not `aiOversightSummary()` in
 * `src/data/ai.data.ts`, which is frozen against the seed) so a review
 * recorded moments ago via `reviewRecommendation` is reflected immediately. */
async function oversightSummary(user: User | null): Promise<OversightSummary> {
  await simulateLatency('ai.oversightSummary')
  assertAccess(user, 'ai-governance', 'view', { domain: 'ai-governance' }, {
    resourceType: 'Oversight Summary',
    resourceId: 'summary',
    resourceLabel: 'Human oversight summary',
  })
  const records = getCollection('humanOversight')
  const pending = records.filter((r) => r.outcome === 'pending').length
  const accepted = records.filter((r) => r.outcome === 'accepted').length
  const modified = records.filter((r) => r.outcome === 'modified').length
  const rejected = records.filter((r) => r.outcome === 'rejected').length
  const escalated = records.filter((r) => r.outcome === 'escalated').length
  const reviewed = accepted + modified + rejected + escalated
  return deepClone({
    pending,
    accepted,
    modified,
    rejected,
    escalated,
    acceptanceRate: reviewed > 0 ? Math.round((accepted / reviewed) * 1000) / 10 : 0,
  })
}

/** Persists an `AIResponse` an officer chose to keep - e.g. an executive
 * brief - into the `savedBriefs` store collection. */
async function saveBrief(user: User | null, useCase: AIUseCase, title: string, response: SavedBrief['response']): Promise<SavedBrief> {
  await simulateLatency('ai.saveBrief')
  const authed = assertAccess(user, 'ai', 'view', {}, {
    resourceType: 'Saved Brief',
    resourceId: 'new',
    resourceLabel: title,
  })
  const existing = getCollection('savedBriefs')
  const brief: SavedBrief = {
    id: `brief-${existing.length + 1}`,
    tenantId: authed.tenantId,
    title,
    useCase,
    response,
    savedBy: authed.id,
    savedAt: isoFromAnchor(0),
  }
  setCollection('savedBriefs', [brief, ...existing])
  emitChange()
  return deepClone(brief)
}

async function savedBriefs(user: User | null): Promise<SavedBrief[]> {
  await simulateLatency('ai.savedBriefs')
  const authed = assertAccess(user, 'ai', 'view', {}, {
    resourceType: 'Saved Brief',
    resourceId: 'all',
    resourceLabel: 'Saved briefs',
  })
  return deepClone(getCollection('savedBriefs').filter((b) => b.tenantId === authed.tenantId && b.savedBy === authed.id))
}

export const aiService = {
  requests,
  models,
  prompts,
  riskRegister,
  oversight,
  incidents,
  agentWorkflows,
  agents,
  evaluations,
  recordRequest,
  reviewRecommendation,
  oversightSummary,
  saveBrief,
  savedBriefs,
}
