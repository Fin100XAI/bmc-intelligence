import { SEWERAGE_NODES } from '@/data/city.data'
import { filterByScope } from '@/security/access'
import type { SewerageNode } from '@/types/city-domains'
import type { OperationalState } from '@/types/common'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/sewerage.service.ts
 *
 * Sewerage collection, treatment and network condition.
 *
 * Treatment facilities and trunk-sewer reaches are held in the same
 * collection, distinguished by `type`. Facilities carry a treatment
 * compliance figure; trunk reaches do not, and their compliance field is
 * zero rather than absent - so summaries must exclude trunk reaches from any
 * compliance average rather than averaging a zero into it.
 */

export interface SewerageFilters {
  wardId?: string
  type?: SewerageNode['type']
  /** Only nodes at or above this utilisation percentage. */
  minUtilisation?: number
  state?: OperationalState
  search?: string
}

async function nodes(user: User | null, filters: SewerageFilters = {}): Promise<SewerageNode[]> {
  await simulateLatency(`sewerage.nodes:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, SEWERAGE_NODES)
  let visible = filterByScope(user, scoped, (n) => ({ wardId: n.wardId, domain: 'sewerage' }), 'ward')

  if (filters.wardId) visible = visible.filter((n) => n.wardId === filters.wardId)
  if (filters.type) visible = visible.filter((n) => n.type === filters.type)
  if (typeof filters.minUtilisation === 'number') {
    visible = visible.filter((n) => n.utilisationPct >= (filters.minUtilisation as number))
  }
  if (filters.state) visible = visible.filter((n) => n.state === filters.state)
  if (filters.search) {
    const q = filters.search.trim().toLowerCase()
    visible = visible.filter((n) => n.name.toLowerCase().includes(q))
  }

  return deepClone([...visible].sort((a, b) => b.utilisationPct - a.utilisationPct))
}

/** Treatment facilities only - the nodes that carry a compliance figure. */
async function facilities(user: User | null): Promise<SewerageNode[]> {
  return nodes(user, { type: 'treatment-facility' })
}

/** Trunk-sewer reaches only - condition, blockages and overflow events. */
async function trunkNetwork(user: User | null, wardId?: string): Promise<SewerageNode[]> {
  const all = await nodes(user, wardId ? { wardId } : {})
  return all.filter((n) => n.type === 'trunk-sewer')
}

export interface SewerageSummary {
  designCapacityMld: number
  currentLoadMld: number
  meanUtilisationPct: number
  facilitiesOverCapacity: number
  /** Averaged across treatment facilities only - trunk reaches carry none. */
  meanTreatmentCompliancePct: number
  facilitiesBelowNorm: number
  blockages30d: number
  overflowEvents30d: number
  meanConditionIndex: number
  nodesRequiringAttention: number
}

/** Discharge norm below which compliance is reported as a shortfall. */
export const TREATMENT_COMPLIANCE_NORM = 90

async function summary(user: User | null): Promise<SewerageSummary> {
  const all = await nodes(user)
  const treatment = all.filter((n) => n.type === 'treatment-facility')

  if (all.length === 0) {
    return {
      designCapacityMld: 0,
      currentLoadMld: 0,
      meanUtilisationPct: 0,
      facilitiesOverCapacity: 0,
      meanTreatmentCompliancePct: 0,
      facilitiesBelowNorm: 0,
      blockages30d: 0,
      overflowEvents30d: 0,
      meanConditionIndex: 0,
      nodesRequiringAttention: 0,
    }
  }

  const round = (n: number): number => Math.round(n * 10) / 10

  return {
    designCapacityMld: round(all.reduce((s, n) => s + n.designCapacityMld, 0)),
    currentLoadMld: round(all.reduce((s, n) => s + n.currentLoadMld, 0)),
    meanUtilisationPct: round(all.reduce((s, n) => s + n.utilisationPct, 0) / all.length),
    facilitiesOverCapacity: all.filter((n) => n.utilisationPct > 100).length,
    meanTreatmentCompliancePct:
      treatment.length > 0
        ? round(treatment.reduce((s, n) => s + n.treatmentCompliancePct, 0) / treatment.length)
        : 0,
    facilitiesBelowNorm: treatment.filter((n) => n.treatmentCompliancePct < TREATMENT_COMPLIANCE_NORM).length,
    blockages30d: all.reduce((s, n) => s + n.blockages30d, 0),
    overflowEvents30d: all.reduce((s, n) => s + n.overflowEvents30d, 0),
    meanConditionIndex: Math.round(all.reduce((s, n) => s + n.conditionIndex, 0) / all.length),
    nodesRequiringAttention: all.filter((n) => n.state === 'at-risk' || n.state === 'critical').length,
  }
}

export interface OverflowCluster {
  wardId: string
  overflowEvents30d: number
  blockages30d: number
  nodeCount: number
  meanConditionIndex: number
  /** True where events exceed the structural-pattern threshold. */
  structuralPattern: boolean
  note: string
}

/**
 * Wards where overflow events cluster. Repeat events at the same nodes
 * indicate a structural rather than incidental blockage pattern, which is a
 * different intervention from routine jetting.
 */
async function overflowClusters(user: User | null): Promise<OverflowCluster[]> {
  const all = await nodes(user)
  const byWard = new Map<string, SewerageNode[]>()
  for (const node of all) {
    const list = byWard.get(node.wardId) ?? []
    list.push(node)
    byWard.set(node.wardId, list)
  }

  const THRESHOLD = 6

  return Array.from(byWard.entries())
    .map(([wardId, items]) => {
      const overflow = items.reduce((s, n) => s + n.overflowEvents30d, 0)
      const blockages = items.reduce((s, n) => s + n.blockages30d, 0)
      const structuralPattern = overflow >= THRESHOLD
      return {
        wardId,
        overflowEvents30d: overflow,
        blockages30d: blockages,
        nodeCount: items.length,
        meanConditionIndex: Math.round(items.reduce((s, n) => s + n.conditionIndex, 0) / items.length),
        structuralPattern,
        note: structuralPattern
          ? `${overflow} overflow events recorded in 30 days across ${items.length} node(s), at or above the ${THRESHOLD}-event threshold. Repeat events at fixed nodes typically indicate a structural defect or persistent obstruction requiring a CCTV survey, rather than routine jetting.`
          : `${overflow} overflow event(s) in 30 days - within the range handled by routine maintenance.`,
      }
    })
    .filter((c) => c.overflowEvents30d > 0)
    .sort((a, b) => b.overflowEvents30d - a.overflowEvents30d)
}

export const sewerageService = {
  nodes,
  facilities,
  trunkNetwork,
  summary,
  overflowClusters,
}
