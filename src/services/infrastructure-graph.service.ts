import {
  infrastructureAnchors,
  traceInfrastructureChain,
  type InfrastructureAnchor,
  type InfrastructureChain,
} from '@/domains/infrastructure/graph-trace'
import { filterByScope } from '@/security/access'
import type { GraphNode } from '@/types/governance'
import type { User } from '@/types/organisation'
import type { AccessContext } from '@/security/model'
import { deepClone, simulateLatency } from './client'

/**
 * src/services/infrastructure-graph.service.ts
 *
 * The City Infrastructure Graph.
 *
 * Every node in a trace is passed through the same permission gate the
 * Knowledge Graph uses, so a principal only ever sees the parts of a chain
 * they are entitled to read. A trace anchored on an asset a ward officer may
 * read will still stop at a department or contract node outside their scope -
 * the chain is pruned to the reader, and the reader is told it was pruned.
 */

function nodeContext(node: GraphNode): AccessContext {
  const wardId = node.kind === 'ward' ? node.id.replace(/^kg-/, '') : undefined
  return { classification: node.classification, domain: node.domain, wardId }
}

function readable(user: User | null, node: GraphNode): boolean {
  return filterByScope(user, [node], nodeContext, 'ward').length > 0
}

export interface ScopedInfrastructureChain extends InfrastructureChain {
  /** Nodes pruned from the chain because they are outside the reader's scope. */
  prunedNodes: number
}

async function anchors(user: User | null): Promise<InfrastructureAnchor[]> {
  await simulateLatency('infraGraph.anchors')
  const all = infrastructureAnchors(60)
  const visible = all.filter((a) => readable(user, a.node))
  return deepClone(visible.slice(0, 40))
}

async function chain(user: User | null, anchorId: string): Promise<ScopedInfrastructureChain | null> {
  await simulateLatency(`infraGraph.chain:${anchorId}`)

  const traced = traceInfrastructureChain(anchorId)
  if (!traced) return null

  // The anchor itself must be readable, or there is nothing to show.
  if (!readable(user, traced.anchor)) return null

  const visibleNodes = traced.nodes.filter((n) => readable(user, n.node))
  const visibleIds = new Set(visibleNodes.map((n) => n.node.id))
  const visibleEdges = traced.edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to))

  const compositionMap = new Map<string, { kind: (typeof traced.composition)[number]['kind']; label: string; count: number }>()
  for (const n of visibleNodes) {
    const existing = compositionMap.get(n.node.kind)
    if (existing) existing.count += 1
    else compositionMap.set(n.node.kind, { kind: n.node.kind, label: kindLabel(traced, n.node.kind), count: 1 })
  }

  return deepClone({
    anchor: traced.anchor,
    nodes: visibleNodes,
    edges: visibleEdges,
    composition: [...compositionMap.values()].sort((a, b) => b.count - a.count),
    accountableDepartments: visibleNodes.filter((n) => n.node.kind === 'department').map((n) => n.node.label),
    prunedNodes: traced.nodes.length - visibleNodes.length,
  })
}

function kindLabel(chain: InfrastructureChain, kind: (typeof chain.composition)[number]['kind']): string {
  return chain.composition.find((c) => c.kind === kind)?.label ?? kind
}

export const infrastructureGraphService = {
  anchors,
  chain,
}
