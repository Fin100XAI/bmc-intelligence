import { GRAPH_NODE_BY_ID, KNOWLEDGE_GRAPH, layoutNeighbourhood, searchGraph } from '@/data/knowledge-graph.data'
import { filterByScope } from '@/security/access'
import type { AccessContext } from '@/security/model'
import { GRAPH_ENTITY_LABEL, GRAPH_RELATION_LABEL } from '@/types/governance'
import type { GraphEntityKind, GraphNode, GraphRelation } from '@/types/governance'
import type { User } from '@/types/organisation'
import { ServiceError, assertAccess, deepClone, simulateLatency } from './client'

/**
 * src/services/graph.service.ts
 *
 * The municipal knowledge graph explorer. There is no `ResourceType`
 * shaped like "graph" - every node kind (ward, department, project,
 * contractor, complaint, incident, ...) already has its own authoritative
 * service. `graph.service` is a navigational veneer over the same
 * `GraphNode.classification` / `GraphNode.domain` attributes, gated on
 * `resource: 'ward'` - the one grant every role holds - so a node's
 * classification and domain (and, for ward nodes specifically, ward scope)
 * still govern what the explorer surfaces. Opening the underlying record
 * (via `GraphNode.route`) goes through that record's own, more precise,
 * service method.
 */

export interface GraphNeighbourhoodOptions {
  relations?: GraphRelation[]
  kinds?: GraphEntityKind[]
  maxInner?: number
}

export interface GraphNeighbourhoodResult {
  focus: GraphNode | undefined
  positioned: Array<{ node: GraphNode; x: number; y: number; ring: 0 | 1 | 2; relation?: GraphRelation }>
  links: Array<{ from: string; to: string; relation: GraphRelation }>
}

function nodeContext(node: GraphNode): AccessContext {
  const wardId = node.kind === 'ward' ? node.id.replace(/^kg-/, '') : undefined
  return { classification: node.classification, domain: node.domain, wardId }
}

function meta(node: GraphNode): { resourceType: string; resourceId: string; resourceLabel: string } {
  return { resourceType: 'Graph Node', resourceId: node.id, resourceLabel: node.label }
}

async function search(user: User | null, query: string): Promise<GraphNode[]> {
  await simulateLatency(`graph.search:${query}`)
  const results = searchGraph(query, 60)
  const visible = filterByScope(user, results, nodeContext, 'ward')
  return deepClone(visible.slice(0, 24))
}

async function node(user: User | null, id: string): Promise<GraphNode> {
  await simulateLatency(`graph.node:${id}`)
  const found = GRAPH_NODE_BY_ID.get(id)
  if (!found) throw new ServiceError('not-found', `Graph node "${id}" was not found.`)
  assertAccess(user, 'ward', 'view', nodeContext(found), meta(found))
  return deepClone(found)
}

async function neighbourhood(
  user: User | null,
  nodeId: string,
  opts: GraphNeighbourhoodOptions = {},
): Promise<GraphNeighbourhoodResult> {
  await simulateLatency(`graph.neighbourhood:${nodeId}`)
  const layout = layoutNeighbourhood(nodeId, opts)
  if (!layout.focus) throw new ServiceError('not-found', `Graph node "${nodeId}" was not found.`)
  assertAccess(user, 'ward', 'view', nodeContext(layout.focus), meta(layout.focus))

  const positioned = layout.positioned.filter(
    (p) => p.node.id === layout.focus?.id || filterByScope(user, [p.node], nodeContext, 'ward').length > 0,
  )
  const visibleIds = new Set(positioned.map((p) => p.node.id))
  const links = layout.links.filter((l) => visibleIds.has(l.from) && visibleIds.has(l.to))
  return deepClone({ focus: layout.focus, positioned, links })
}

async function kinds(): Promise<Array<{ kind: GraphEntityKind; label: string }>> {
  await simulateLatency('graph.kinds')
  const all = Object.keys(GRAPH_ENTITY_LABEL) as GraphEntityKind[]
  return deepClone(all.map((kind) => ({ kind, label: GRAPH_ENTITY_LABEL[kind] })))
}

async function relations(): Promise<Array<{ relation: GraphRelation; label: string }>> {
  await simulateLatency('graph.relations')
  const all = Object.keys(GRAPH_RELATION_LABEL) as GraphRelation[]
  return deepClone(all.map((relation) => ({ relation, label: GRAPH_RELATION_LABEL[relation] })))
}

/** Exposed for completeness - hooks that just need node/edge counts (e.g. a
 * "graph coverage" stat tile) don't need a full search or neighbourhood
 * call. Counts only; the constituent nodes still go through `search`/`node`. */
export function graphSize(): { nodes: number; edges: number } {
  return { nodes: KNOWLEDGE_GRAPH.nodes.length, edges: KNOWLEDGE_GRAPH.edges.length }
}

export const graphService = {
  search,
  neighbourhood,
  node,
  kinds,
  relations,
}
