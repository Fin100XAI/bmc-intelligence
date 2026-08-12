import { KNOWLEDGE_GRAPH, GRAPH_NODE_BY_ID } from '@/data/knowledge-graph.data'
import { onAfterRebuild } from '@/data/runtime'
import { GRAPH_ENTITY_LABEL, GRAPH_RELATION_LABEL, type GraphEntityKind, type GraphNode } from '@/types/governance'

/**
 * City Infrastructure Graph - chain tracing.
 *
 * The Knowledge Graph is an exploratory browser: search any entity, expand its
 * neighbourhood. This engine is the complementary, purpose-built view the
 * master specification calls for - it traces the accountability CHAIN that
 * connects a piece of infrastructure to everything the corporation holds about
 * how it is delivered and maintained:
 *
 *   Asset → Location → Ward → Department → Contractor → Work Order →
 *   Project → Complaint → Inspection → Budget → Incident
 *
 * It operates on the same graph the Knowledge Graph uses, so there is one
 * source of truth for how the city's entities connect. It differs in intent:
 * a bounded, layered trace from one infrastructure anchor, not a free browse.
 */

/** The entity kinds that make up the infrastructure accountability chain. */
export const INFRASTRUCTURE_KINDS: GraphEntityKind[] = [
  'asset',
  'road',
  'ward',
  'department',
  'contractor',
  'project',
  'tender',
  'complaint',
  'incident',
  'budget',
  'facility',
  'hospital',
]

/** Kinds that make a good starting anchor for a trace. */
export const INFRASTRUCTURE_ANCHOR_KINDS: GraphEntityKind[] = ['asset', 'road', 'project', 'facility', 'hospital']

export interface ChainEdge {
  from: string
  to: string
  relationLabel: string
}

export interface ChainNode {
  node: GraphNode
  /** Hops from the anchor. */
  depth: number
  /** How this node was reached, e.g. "maintained under". */
  viaRelation?: string
  /** The node one hop closer to the anchor. */
  parentId?: string
}

export interface InfrastructureChain {
  anchor: GraphNode
  /** Nodes reachable from the anchor within the depth bound, in BFS order. */
  nodes: ChainNode[]
  edges: ChainEdge[]
  /** How many of each kind are in the chain - the composition summary. */
  composition: Array<{ kind: GraphEntityKind; label: string; count: number }>
  /** The distinct departments accountable somewhere in this chain. */
  accountableDepartments: string[]
}

/** Adjacency built once from the shared graph, both directions. */
interface Adjacency {
  neighbourId: string
  relationLabel: string
}

let adjacencyCache: Map<string, Adjacency[]> | null = null

/**
 * The adjacency map is derived state, not seed data: it is built once from
 * `KNOWLEDGE_GRAPH.edges` and would otherwise survive a corporation switch,
 * leaving the walk following the previous corporation's edges while
 * `GRAPH_NODE_BY_ID` already resolves the new corporation's nodes. Every node
 * id then fails to resolve and the trace comes back empty or wrong - a silent
 * failure, because an empty accountability chain looks like a legitimate
 * answer. Dropping the cache after every rebuild forces it to be rebuilt from
 * the graph the rest of the platform is now reading.
 */
onAfterRebuild(() => {
  adjacencyCache = null
})

function adjacency(): Map<string, Adjacency[]> {
  if (adjacencyCache) return adjacencyCache
  const map = new Map<string, Adjacency[]>()
  for (const edge of KNOWLEDGE_GRAPH.edges) {
    const label = GRAPH_RELATION_LABEL[edge.relation]
    const forward = map.get(edge.from) ?? []
    forward.push({ neighbourId: edge.to, relationLabel: label })
    map.set(edge.from, forward)

    const back = map.get(edge.to) ?? []
    back.push({ neighbourId: edge.from, relationLabel: label })
    map.set(edge.to, back)
  }
  adjacencyCache = map
  return map
}

/**
 * Traces the infrastructure chain from one anchor node.
 *
 * A breadth-first walk bounded by `maxDepth` and restricted to infrastructure
 * entity kinds, so a trace stays on the delivery-and-accountability spine
 * rather than wandering into governance or AI entities that share the graph.
 */
export function traceInfrastructureChain(anchorId: string, maxDepth = 3, maxNodes = 40): InfrastructureChain | null {
  const anchor = GRAPH_NODE_BY_ID.get(anchorId)
  if (!anchor) return null

  const adj = adjacency()
  const infraKinds = new Set(INFRASTRUCTURE_KINDS)

  const visited = new Map<string, ChainNode>()
  visited.set(anchor.id, { node: anchor, depth: 0 })
  const queue: string[] = [anchor.id]
  const edges: ChainEdge[] = []
  const edgeSeen = new Set<string>()

  while (queue.length > 0 && visited.size < maxNodes) {
    const currentId = queue.shift()
    if (!currentId) break
    const current = visited.get(currentId)
    if (!current || current.depth >= maxDepth) continue

    for (const { neighbourId, relationLabel } of adj.get(currentId) ?? []) {
      const neighbour = GRAPH_NODE_BY_ID.get(neighbourId)
      if (!neighbour) continue
      if (!infraKinds.has(neighbour.kind)) continue

      const edgeKey = [currentId, neighbourId].sort().join('|')
      if (!edgeSeen.has(edgeKey)) {
        edgeSeen.add(edgeKey)
        edges.push({ from: currentId, to: neighbourId, relationLabel })
      }

      if (!visited.has(neighbourId) && visited.size < maxNodes) {
        visited.set(neighbourId, {
          node: neighbour,
          depth: current.depth + 1,
          viaRelation: relationLabel,
          parentId: currentId,
        })
        queue.push(neighbourId)
      }
    }
  }

  const nodes = [...visited.values()].sort((a, b) => a.depth - b.depth || a.node.label.localeCompare(b.node.label))

  const compositionMap = new Map<GraphEntityKind, number>()
  for (const { node } of nodes) compositionMap.set(node.kind, (compositionMap.get(node.kind) ?? 0) + 1)
  const composition = [...compositionMap.entries()]
    .map(([kind, count]) => ({ kind, label: GRAPH_ENTITY_LABEL[kind], count }))
    .sort((a, b) => b.count - a.count)

  const accountableDepartments = nodes
    .filter((n) => n.node.kind === 'department')
    .map((n) => n.node.label)

  return { anchor, nodes, edges, composition, accountableDepartments }
}

export interface InfrastructureAnchor {
  node: GraphNode
  /** Number of infrastructure entities within two hops - the chain's reach. */
  reach: number
}

/**
 * The infrastructure anchors worth starting a trace from, ranked by how much
 * of the city's fabric each one connects to.
 */
export function infrastructureAnchors(limit = 40): InfrastructureAnchor[] {
  const adj = adjacency()
  const infraKinds = new Set(INFRASTRUCTURE_KINDS)
  const anchorKinds = new Set(INFRASTRUCTURE_ANCHOR_KINDS)

  const anchors = KNOWLEDGE_GRAPH.nodes.filter((n) => anchorKinds.has(n.kind))

  return anchors
    .map((node) => {
      const oneHop = new Set<string>()
      for (const { neighbourId } of adj.get(node.id) ?? []) {
        const nb = GRAPH_NODE_BY_ID.get(neighbourId)
        if (nb && infraKinds.has(nb.kind)) oneHop.add(neighbourId)
      }
      const twoHop = new Set<string>(oneHop)
      for (const id of oneHop) {
        for (const { neighbourId } of adj.get(id) ?? []) {
          const nb = GRAPH_NODE_BY_ID.get(neighbourId)
          if (nb && infraKinds.has(nb.kind) && neighbourId !== node.id) twoHop.add(neighbourId)
        }
      }
      return { node, reach: twoHop.size }
    })
    .sort((a, b) => b.reach - a.reach)
    .slice(0, limit)
}
