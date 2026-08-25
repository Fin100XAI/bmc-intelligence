import { COMPLAINTS } from '@/data/operations.data'
import {
  buildResolutionCases,
  caseContext,
  complaintFusionFunnel,
  departmentTransferFlows,
  multiDepartmentCases,
  priorityQueue,
  protocolStateBreakdown,
  resolutionBrief,
  resolutionQualityIndex,
  resolutionSnapshot,
  routingConfidenceProfile,
  transferLoopCases,
  type CaseContext,
  type ComplaintFusionFunnel,
  type DepartmentTransferFlow,
  type ProtocolStateCount,
  type ResolutionCase,
  type ResolutionQualityIndex,
  type ResolutionSnapshot,
  type RoutingConfidenceProfile,
} from '@/domains/resolution/engine'
import { filterByScope } from '@/security/access'
import type { Complaint, ComplaintCategory } from '@/types/operations'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/resolution.service.ts
 *
 * Municipal Resolution Intelligence.
 *
 * Every aggregate here is derived from the same ward/department-scoped
 * complaint set `citizenService` reads, run through
 * `domains/resolution/engine.ts` to turn each complaint into a Resolution
 * Case - who owns it and why, what it depends on, and whether it is
 * converging on a resolution or bouncing between departments.
 */

/**
 * Named `CaseResolutionFilters` rather than `ResolutionFilters` - the latter
 * is already `council.service.ts`'s type for council resolution business,
 * an unrelated meaning of the same word.
 */
export interface CaseResolutionFilters {
  wardId?: string
  category?: ComplaintCategory
}

function scopedComplaints(user: User | null, filters: CaseResolutionFilters = {}): Complaint[] {
  const scoped = scopeToTenant(user, COMPLAINTS)
  let visible = filterByScope(
    user,
    scoped,
    (c) => ({ wardId: c.wardId, departmentId: c.departmentId, domain: 'citizen-services' }),
    'intelligence',
  )

  if (filters.wardId) visible = visible.filter((c) => c.wardId === filters.wardId)
  if (filters.category) visible = visible.filter((c) => c.category === filters.category)
  return visible
}

async function snapshot(user: User | null, filters: CaseResolutionFilters = {}): Promise<ResolutionSnapshot> {
  await simulateLatency(`resolution.snapshot:${JSON.stringify(filters)}`)
  return resolutionSnapshot(buildResolutionCases(scopedComplaints(user, filters)))
}

async function queue(user: User | null, filters: CaseResolutionFilters = {}): Promise<ResolutionCase[]> {
  await simulateLatency(`resolution.queue:${JSON.stringify(filters)}`)
  return deepClone(priorityQueue(buildResolutionCases(scopedComplaints(user, filters))))
}

async function multiDepartment(user: User | null, filters: CaseResolutionFilters = {}): Promise<ResolutionCase[]> {
  await simulateLatency(`resolution.multi:${JSON.stringify(filters)}`)
  return deepClone(multiDepartmentCases(buildResolutionCases(scopedComplaints(user, filters))))
}

async function transferLoops(user: User | null, filters: CaseResolutionFilters = {}): Promise<ResolutionCase[]> {
  await simulateLatency(`resolution.loops:${JSON.stringify(filters)}`)
  return deepClone(transferLoopCases(buildResolutionCases(scopedComplaints(user, filters))))
}

async function transferFlows(user: User | null, filters: CaseResolutionFilters = {}): Promise<DepartmentTransferFlow[]> {
  await simulateLatency(`resolution.flows:${JSON.stringify(filters)}`)
  return deepClone(departmentTransferFlows(buildResolutionCases(scopedComplaints(user, filters))))
}

async function qualityIndex(user: User | null, filters: CaseResolutionFilters = {}): Promise<ResolutionQualityIndex> {
  await simulateLatency(`resolution.quality:${JSON.stringify(filters)}`)
  return resolutionQualityIndex(buildResolutionCases(scopedComplaints(user, filters)))
}

async function protocolBreakdown(user: User | null, filters: CaseResolutionFilters = {}): Promise<ProtocolStateCount[]> {
  await simulateLatency(`resolution.protocol:${JSON.stringify(filters)}`)
  return protocolStateBreakdown(buildResolutionCases(scopedComplaints(user, filters)))
}

async function confidenceProfile(user: User | null, filters: CaseResolutionFilters = {}): Promise<RoutingConfidenceProfile> {
  await simulateLatency(`resolution.confidence:${JSON.stringify(filters)}`)
  return routingConfidenceProfile(buildResolutionCases(scopedComplaints(user, filters)))
}

async function fusionFunnel(user: User | null, filters: CaseResolutionFilters = {}): Promise<ComplaintFusionFunnel> {
  await simulateLatency(`resolution.fusion:${JSON.stringify(filters)}`)
  return deepClone(complaintFusionFunnel(scopedComplaints(user, filters)))
}

async function context(user: User | null, filters: CaseResolutionFilters = {}): Promise<CaseContext | null> {
  await simulateLatency(`resolution.context:${JSON.stringify(filters)}`)
  const result = caseContext(scopedComplaints(user, filters))
  return result ? deepClone(result) : null
}

async function brief(user: User | null, filters: CaseResolutionFilters = {}): Promise<string> {
  await simulateLatency(`resolution.brief:${JSON.stringify(filters)}`)
  const cases = buildResolutionCases(scopedComplaints(user, filters))
  return resolutionBrief(resolutionSnapshot(cases), departmentTransferFlows(cases))
}

export const resolutionService = {
  snapshot,
  queue,
  multiDepartment,
  transferLoops,
  transferFlows,
  qualityIndex,
  protocolBreakdown,
  confidenceProfile,
  fusionFunnel,
  context,
  brief,
}
