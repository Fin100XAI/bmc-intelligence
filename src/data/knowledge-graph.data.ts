import type { GraphEdge, GraphNode, KnowledgeGraph } from '@/types/governance'
import { det } from '@/utils/deterministic'
import { DEPARTMENTS, OFFICERS, WARDS, wardName } from './reference'
import { CONTRACTORS, CONTRACTS, PROJECTS } from './finance.data'
import { COMPLAINTS, DECISION_CASES, INCIDENTS, MUNICIPAL_ASSETS } from './operations.data'
import { HOSPITALS } from './social.data'
import { ROAD_SEGMENTS, WASTE_FACILITIES } from './city.data'
import { DATASETS } from './governance.data'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * Municipal knowledge graph.
 *
 * The graph is assembled from the same canonical entities that drive every
 * other module, so exploring it navigates the real corpus rather than a
 * decorative illustration. Relationships mirror the institutional reality:
 *
 *   Ward → contains → Road → affected by → Complaint → assigned to →
 *   Department → maintained under → Contract → executed by → Contractor →
 *   funded by → Budget → linked to → Project → assessed through → Outcome
 *
 * This is the last layer in the dependency chain: it holds no magnitudes of its
 * own and invents no entities beyond the five programme nodes. Every node
 * label, cost and headcount already arrived scaled and named for the active
 * corporation from the layer that owns it, so nothing here is scaled a second
 * time. The graph therefore grows and shrinks with the corporation on its own.
 *
 * Both exports below are LIVE BINDINGS, rebuilt on a corporation switch.
 */

/**
 * How many of each kind may enter the graph.
 *
 * These are LEGIBILITY limits, not corporation magnitudes. The upstream
 * collections are already sized for the active corporation, so a smaller
 * corporation falls under every cap here and contributes all of its records;
 * scaling these numbers as well would cut the same corpus twice and leave the
 * explorer with too little to traverse.
 */
const GRAPH_BUDGET = {
  roads: 60,
  complaints: 90,
  projects: 70,
  contracts: 50,
  assets: 60,
  /** Programme-to-project links, per programme. */
  schemeProjects: 8,
} as const

/**
 * Ward populations are quoted in lakh where the ward actually holds a lakh of
 * residents. Below that the unit reads as "0.4 lakh residents", which is not
 * how any corporation states the figure, so the plain count is used instead.
 */
function residentsLabel(population: number): string {
  if (population >= 100_000) return t('{0} lakh residents', (population / 100_000).toFixed(1))
  return `${population.toLocaleString('en-IN')} residents`
}

function buildGraph(): KnowledgeGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const seen = new Set<string>()

  const addNode = (node: GraphNode): void => {
    if (seen.has(node.id)) return
    seen.add(node.id)
    nodes.push(node)
  }

  const edgeIds = new Set<string>()
  const addEdge = (from: string, to: string, relation: GraphEdge['relation'], weight = 1): void => {
    // An edge to a node that was never added would render as a dangling link
    // and break neighbourhood traversal, so both endpoints must exist first.
    if (!seen.has(from) || !seen.has(to)) return
    const id = `${from}->${relation}->${to}`
    if (edgeIds.has(id)) return
    edgeIds.add(id)
    edges.push({ id, from, to, relation, weight })
  }

  // --- Wards --------------------------------------------------------------
  for (const ward of WARDS) {
    addNode({
      id: `kg-${ward.id}`,
      kind: 'ward',
      label: `${ward.code} - ${ward.name.split(' · ')[0]}`,
      subtitle: `${ward.region} · ${residentsLabel(ward.population)}`,
      weight: 10,
      domain: 'wards',
      classification: 'internal',
      attributes: [
        { key: 'Ward code', value: ward.code },
        { key: 'Zone', value: ward.zoneId.toUpperCase() },
        { key: 'Population', value: ward.population.toLocaleString('en-IN') },
        { key: 'Area', value: `${ward.areaSqKm} km²` },
        { key: 'Health index', value: `${ward.healthScore}/100` },
        { key: 'Risk index', value: `${ward.riskScore}/100` },
        { key: 'Flood exposure', value: ward.floodProne ? t('Flood-prone') : t('Limited exposure') },
      ],
      route: `/city/wards?ward=${ward.id}`,
      severity: ward.riskScore >= 66 ? 'high' : ward.riskScore >= 45 ? 'medium' : 'low',
    })
  }

  // --- Departments --------------------------------------------------------
  for (const dept of DEPARTMENTS) {
    addNode({
      id: `kg-${dept.id}`,
      kind: 'department',
      label: dept.shortName,
      subtitle: dept.name,
      weight: 9,
      domain: dept.domain,
      classification: 'internal',
      attributes: [
        { key: 'Establishment', value: dept.staffCount.toLocaleString('en-IN') },
        { key: 'Allocation', value: `₹${dept.budgetCrore.toLocaleString('en-IN')} Cr` },
        { key: 'State', value: dept.state },
      ],
      route: '/admin/departments',
    })
    addNode({
      id: `kg-budget-${dept.id}`,
      kind: 'budget',
      label: `${dept.shortName} allocation`,
      subtitle: t('₹{0} Cr, FY 2026–27', dept.budgetCrore.toLocaleString('en-IN')),
      weight: 6,
      domain: 'budget',
      classification: 'confidential',
      attributes: [
        { key: 'Department', value: dept.name },
        { key: 'Allocation', value: `₹${dept.budgetCrore.toLocaleString('en-IN')} Cr` },
      ],
      route: '/governance/budget',
    })
    addEdge(`kg-budget-${dept.id}`, `kg-${dept.id}`, 'funded-by', 2)
  }

  // --- Officers -----------------------------------------------------------
  const headOfficers = OFFICERS.filter((o) => o.id.startsWith('off-head-'))
  for (const officer of headOfficers) {
    addNode({
      id: `kg-${officer.id}`,
      kind: 'officer',
      label: officer.name,
      subtitle: officer.designation,
      weight: 5,
      domain: 'executive',
      classification: 'internal',
      attributes: [
        { key: 'Designation', value: officer.designation },
        { key: 'Employee code', value: officer.employeeCode },
        { key: 'Contact', value: officer.phoneMasked },
      ],
      route: '/admin/users',
    })
    addEdge(`kg-${officer.id}`, `kg-${officer.departmentId}`, 'reports-to', 1)
  }

  // One officer per administrative unit, whatever the corporation's unit count
  // is. The reference layer issues exactly one ward officer per ward, so the
  // count follows the ward count without a cap of its own.
  const wardOfficers = OFFICERS.filter((o) => o.id.startsWith('off-ward-'))
  for (const officer of wardOfficers) {
    addNode({
      id: `kg-${officer.id}`,
      kind: 'officer',
      label: officer.name,
      subtitle: officer.designation,
      weight: 4,
      domain: 'wards',
      classification: 'internal',
      attributes: [
        { key: 'Designation', value: officer.designation },
        { key: 'Employee code', value: officer.employeeCode },
      ],
      route: '/admin/users',
    })
    if (officer.wardId) addEdge(`kg-${officer.id}`, `kg-${officer.wardId}`, 'governs', 2)
  }

  // --- Roads --------------------------------------------------------------
  for (const road of ROAD_SEGMENTS.slice(0, GRAPH_BUDGET.roads)) {
    addNode({
      id: `kg-${road.id}`,
      kind: 'road',
      label: road.name,
      subtitle: t('{0} km · condition {1}/100', road.lengthKm, road.conditionIndex),
      weight: 3,
      domain: 'roads',
      classification: 'internal',
      attributes: [
        { key: 'Length', value: `${road.lengthKm} km` },
        { key: 'Surface', value: road.surface },
        { key: 'Condition index', value: `${road.conditionIndex}/100` },
        { key: 'Traffic', value: `${road.trafficPcu.toLocaleString('en-IN')} PCU` },
        { key: 'Emergency route', value: road.emergencyRoute ? t('Yes') : t('No') },
        { key: 'Open defects', value: String(road.openDefects) },
      ],
      route: '/city/roads',
      severity: road.conditionIndex < 45 ? 'high' : road.conditionIndex < 65 ? 'medium' : 'low',
    })
    addEdge(`kg-${road.wardId}`, `kg-${road.id}`, 'contains', 2)
    addEdge(`kg-${road.id}`, 'kg-dept-roads', 'assigned-to', 1)
  }

  // --- Complaints ---------------------------------------------------------
  for (const complaint of COMPLAINTS.slice(0, GRAPH_BUDGET.complaints)) {
    addNode({
      id: `kg-${complaint.id}`,
      kind: 'complaint',
      label: complaint.reference,
      subtitle: complaint.summary,
      weight: 2,
      domain: 'wards',
      classification: 'confidential',
      attributes: [
        { key: 'Category', value: complaint.category },
        { key: 'Locality', value: complaint.localityName },
        { key: 'Status', value: complaint.status },
        { key: 'SLA', value: complaint.slaBreached ? t('Breached') : t('Within SLA') },
        { key: 'Repeat count', value: String(complaint.repeatCount) },
      ],
      route: '/city/wards',
      severity: complaint.severity,
    })
    addEdge(`kg-${complaint.wardId}`, `kg-${complaint.id}`, 'contains', 1)
    addEdge(`kg-${complaint.id}`, `kg-${complaint.departmentId}`, 'assigned-to', 1)
  }

  // --- Projects, contracts and contractors --------------------------------
  for (const project of PROJECTS.slice(0, GRAPH_BUDGET.projects)) {
    addNode({
      id: `kg-${project.id}`,
      kind: 'project',
      label: project.name,
      subtitle: t('₹{0} Cr · {1}% complete', project.sanctionedCostCrore, project.completionPct),
      weight: 6,
      domain: 'projects',
      classification: 'confidential',
      attributes: [
        { key: 'Reference', value: project.reference },
        { key: 'Category', value: project.category },
        { key: 'Sanctioned', value: `₹${project.sanctionedCostCrore} Cr` },
        { key: 'Completion', value: `${project.completionPct}%` },
        { key: 'Risk score', value: `${project.riskScore}/100` },
        { key: 'Status', value: project.status },
      ],
      route: `/governance/projects?project=${project.id}`,
      severity: project.riskScore >= 70 ? 'critical' : project.riskScore >= 55 ? 'high' : project.riskScore >= 38 ? 'medium' : 'low',
    })
    for (const wardId of project.wardIds) addEdge(`kg-${wardId}`, `kg-${project.id}`, 'contains', 2)
    addEdge(`kg-${project.id}`, `kg-${project.departmentId}`, 'assigned-to', 2)
    addEdge(`kg-budget-${project.departmentId}`, `kg-${project.id}`, 'linked-to', 2)
  }

  for (const contractor of CONTRACTORS) {
    addNode({
      id: `kg-${contractor.id}`,
      kind: 'contractor',
      label: contractor.name,
      subtitle: t('{0} active contracts · delivery index {1}/100', contractor.activeContracts, contractor.performanceIndex),
      weight: 5,
      domain: 'procurement',
      classification: 'confidential',
      attributes: [
        { key: 'Registration', value: contractor.registrationRef },
        { key: 'Active contracts', value: String(contractor.activeContracts) },
        { key: 'Delivery index', value: `${contractor.performanceIndex}/100` },
        { key: 'On-time delivery', value: `${contractor.onTimeDeliveryPct}%` },
        { key: 'Open observations', value: String(contractor.openObservations) },
      ],
      route: '/governance/procurement',
      severity: contractor.performanceIndex < 55 ? 'high' : contractor.performanceIndex < 70 ? 'medium' : 'low',
    })
  }

  const contractedContractorIds = new Set<string>()
  for (const contract of CONTRACTS.slice(0, GRAPH_BUDGET.contracts)) {
    addNode({
      id: `kg-${contract.id}`,
      kind: 'tender',
      label: contract.reference,
      subtitle: t('₹{0} Cr · {1} extension(s)', contract.valueCrore, contract.extensions),
      weight: 4,
      domain: 'procurement',
      classification: 'confidential',
      attributes: [
        { key: 'Tender reference', value: contract.tenderReference },
        { key: 'Value', value: `₹${contract.valueCrore} Cr` },
        { key: 'Extensions', value: String(contract.extensions) },
        { key: 'Variation', value: `${contract.variationPct}%` },
        { key: 'Stage', value: contract.stage },
        { key: 'Risk indicator', value: `${contract.riskScore}/100` },
      ],
      route: '/governance/procurement',
      severity: contract.riskScore >= 65 ? 'high' : contract.riskScore >= 45 ? 'medium' : 'low',
    })
    contractedContractorIds.add(contract.contractorId)
    addEdge(`kg-${contract.id}`, `kg-${contract.contractorId}`, 'executed-by', 3)
    addEdge(`kg-${contract.id}`, `kg-${contract.departmentId}`, 'maintained-under', 2)
    if (contract.projectId) addEdge(`kg-${contract.projectId}`, `kg-${contract.id}`, 'linked-to', 3)
  }

  // A contractor otherwise reaches the graph only through the contracts above.
  // A corporation that lets fewer contracts than it has empanelled firms would
  // leave those firms as unreachable nodes, so an empanelment edge to the
  // department that registers them keeps the vendor base traversable.
  for (const contractor of CONTRACTORS) {
    if (contractedContractorIds.has(contractor.id)) continue
    addEdge('kg-dept-procurement', `kg-${contractor.id}`, 'governs', 1)
  }

  // --- Incidents ----------------------------------------------------------
  for (const incident of INCIDENTS) {
    addNode({
      id: `kg-${incident.id}`,
      kind: 'incident',
      label: incident.reference,
      subtitle: incident.title,
      weight: 5,
      domain: 'disaster',
      classification: 'confidential',
      attributes: [
        { key: 'Type', value: incident.type },
        { key: 'Status', value: incident.status },
        { key: 'Location', value: incident.locationName },
        { key: 'Affected (estimate)', value: incident.affectedPopulation.toLocaleString('en-IN') },
        { key: 'Response teams', value: String(incident.responseTeams.length) },
      ],
      route: `/city/disaster?incident=${incident.id}`,
      severity: incident.severity,
    })
    addEdge(`kg-${incident.wardId}`, `kg-${incident.id}`, 'affected-by', 3)
    addEdge(`kg-${incident.id}`, `kg-${incident.departmentId}`, 'assigned-to', 2)
  }

  // --- Hospitals & facilities --------------------------------------------
  // Major and peripheral hospitals are the ones with institutional weight in
  // the graph. A corporation small enough to run neither category would lose
  // the health estate from the graph altogether, so the largest facilities it
  // does run stand in.
  const referralHospitals = HOSPITALS.filter((h) => h.type === 'major' || h.type === 'peripheral')
  const graphHospitals =
    referralHospitals.length > 0 ? referralHospitals : [...HOSPITALS].sort((a, b) => b.bedsTotal - a.bedsTotal).slice(0, 6)
  for (const hospital of graphHospitals) {
    addNode({
      id: `kg-${hospital.id}`,
      kind: 'hospital',
      label: hospital.name,
      subtitle: t('{0} beds · {1}% occupancy', hospital.bedsTotal, hospital.occupancyPct),
      weight: 6,
      domain: 'hospitals',
      classification: 'confidential',
      attributes: [
        { key: 'Type', value: hospital.type },
        { key: 'Beds', value: String(hospital.bedsTotal) },
        { key: 'Occupancy', value: `${hospital.occupancyPct}%` },
        { key: 'Critical care', value: `${hospital.icuOccupied}/${hospital.icuTotal}` },
        { key: 'Accessibility index', value: `${hospital.accessibilityIndex}/100` },
      ],
      route: '/city/hospitals',
      severity: hospital.occupancyPct > 92 ? 'high' : hospital.occupancyPct > 84 ? 'medium' : 'low',
    })
    addEdge(`kg-${hospital.id}`, `kg-${hospital.wardId}`, 'located-in', 2)
    addEdge(`kg-${hospital.id}`, 'kg-dept-hospitals', 'maintained-under', 1)
  }

  for (const facility of WASTE_FACILITIES) {
    addNode({
      id: `kg-${facility.id}`,
      kind: 'facility',
      label: facility.name,
      subtitle: t('{0} · {1} TPD capacity', facility.type, facility.capacityTpd),
      weight: 4,
      domain: 'waste',
      classification: 'internal',
      attributes: [
        { key: 'Type', value: facility.type },
        { key: 'Capacity', value: `${facility.capacityTpd} TPD` },
        { key: 'Utilisation', value: `${facility.utilisationPct}%` },
      ],
      route: '/city/waste',
    })
    addEdge(`kg-${facility.id}`, `kg-${facility.wardId}`, 'located-in', 1)
    addEdge(`kg-${facility.id}`, 'kg-dept-solid-waste', 'maintained-under', 1)
  }

  // --- Assets -------------------------------------------------------------
  for (const asset of MUNICIPAL_ASSETS.filter((a) => a.criticality === 'critical' || a.criticality === 'high').slice(0, GRAPH_BUDGET.assets)) {
    addNode({
      id: `kg-${asset.id}`,
      kind: 'asset',
      label: asset.name,
      subtitle: t('{0} · condition {1}/100', asset.category, asset.conditionIndex),
      weight: 3,
      domain: 'assets',
      classification: 'internal',
      attributes: [
        { key: 'Category', value: asset.category },
        { key: 'Installed', value: String(asset.installedYear) },
        { key: 'Design life', value: `${asset.designLifeYears} years` },
        { key: 'Condition', value: `${asset.conditionIndex}/100` },
        { key: 'Criticality', value: asset.criticality },
      ],
      route: '/governance/assets',
      severity: asset.criticality,
    })
    addEdge(`kg-${asset.wardId}`, `kg-${asset.id}`, 'contains', 1)
    addEdge(`kg-${asset.id}`, `kg-${asset.departmentId}`, 'maintained-under', 1)
  }

  // --- Decisions ----------------------------------------------------------
  for (const decision of DECISION_CASES) {
    addNode({
      id: `kg-${decision.id}`,
      kind: 'decision',
      label: decision.reference,
      subtitle: decision.title,
      weight: 7,
      domain: decision.domain,
      classification: 'confidential',
      attributes: [
        { key: 'Status', value: decision.status },
        { key: 'Financial impact', value: `₹${decision.financialImpactCrore} Cr` },
        { key: 'Departments', value: String(decision.departmentIds.length) },
        { key: 'Alternatives', value: String(decision.alternatives.length) },
      ],
      route: `/command/decisions?case=${decision.id}`,
      severity: decision.severity,
    })
    for (const wardId of decision.wardIds) addEdge(`kg-${decision.id}`, `kg-${wardId}`, 'linked-to', 2)
    for (const deptId of decision.departmentIds) addEdge(`kg-${decision.id}`, `kg-${deptId}`, 'assigned-to', 2)
  }

  // --- Schemes & documents (datasets stand in as governed documents) ------
  for (const dataset of DATASETS) {
    addNode({
      id: `kg-${dataset.id}`,
      kind: 'document',
      label: dataset.name,
      subtitle: `${dataset.classification} · ${dataset.sourceSystem}`,
      weight: 3,
      domain: dataset.domain,
      classification: dataset.classification,
      attributes: [
        { key: 'Purpose', value: dataset.purpose },
        { key: 'Retention', value: `${dataset.retentionMonths} months` },
        { key: 'Quality', value: `${dataset.qualityScore}/100` },
        { key: 'Personal data', value: dataset.containsPersonalData ? t('Yes - minimised') : t('No') },
      ],
      route: '/trust/privacy',
    })
    addEdge(`kg-${dataset.id}`, `kg-${dataset.ownerDepartmentId}`, 'governs', 1)
  }

  // --- Schemes ------------------------------------------------------------
  // Standing programmes every municipal corporation runs, named for the work
  // rather than for a place, so the same five hold whichever corporation is
  // active. Each anchors to the department that owns the programme.
  const SCHEMES = [
    { id: 'kg-scheme-monsoon', label: t('Pre-Monsoon Preparedness Programme'), domain: 'monsoon' as const, dept: 'dept-stormwater' },
    { id: 'kg-scheme-roads', label: t('Road Concretisation Programme'), domain: 'roads' as const, dept: 'dept-roads' },
    { id: 'kg-scheme-water', label: t('Water Distribution Improvement Programme'), domain: 'water' as const, dept: 'dept-hydraulic' },
    { id: 'kg-scheme-waste', label: t('Waste Processing Capacity Programme'), domain: 'waste' as const, dept: 'dept-solid-waste' },
    { id: 'kg-scheme-health', label: t('Health Infrastructure Upgrade Programme'), domain: 'hospitals' as const, dept: 'dept-hospitals' },
  ]
  for (const scheme of SCHEMES) {
    addNode({
      id: scheme.id,
      kind: 'scheme',
      label: scheme.label,
      subtitle: t('Municipal programme'),
      weight: 7,
      domain: scheme.domain,
      classification: 'internal',
      attributes: [{ key: 'Owning department', value: scheme.dept }],
      route: '/governance/projects',
    })
    addEdge(scheme.id, `kg-${scheme.dept}`, 'assigned-to', 2)
    // Only the projects that were added as nodes above are in the graph, so a
    // scheme links to those rather than to the full departmental portfolio. A
    // corporation with no live project under a programme still reaches the
    // graph through the owning department edge above.
    const related = PROJECTS.filter((p) => p.departmentId === scheme.dept && seen.has(`kg-${p.id}`)).slice(0, GRAPH_BUDGET.schemeProjects)
    for (const project of related) addEdge(scheme.id, `kg-${project.id}`, 'linked-to', 2)
  }

  return { nodes, edges }
}

export let KNOWLEDGE_GRAPH: KnowledgeGraph = { nodes: [], edges: [] }

export let GRAPH_NODE_BY_ID: Map<string, GraphNode> = new Map()

/** Neighbours of a node, with the relationship and direction preserved. */
export function graphNeighbours(nodeId: string): Array<{
  node: GraphNode
  relation: GraphEdge['relation']
  direction: 'outbound' | 'inbound'
}> {
  const out: Array<{ node: GraphNode; relation: GraphEdge['relation']; direction: 'outbound' | 'inbound' }> = []
  for (const edge of KNOWLEDGE_GRAPH.edges) {
    if (edge.from === nodeId) {
      const node = GRAPH_NODE_BY_ID.get(edge.to)
      if (node) out.push({ node, relation: edge.relation, direction: 'outbound' })
    } else if (edge.to === nodeId) {
      const node = GRAPH_NODE_BY_ID.get(edge.from)
      if (node) out.push({ node, relation: edge.relation, direction: 'inbound' })
    }
  }
  return out
}

/**
 * Radial layout for the graph explorer: the focus node at the centre, its
 * direct neighbours on an inner ring and second-degree nodes on an outer ring.
 */
export function layoutNeighbourhood(
  focusId: string,
  options: { relations?: GraphEdge['relation'][]; kinds?: GraphNode['kind'][]; maxInner?: number } = {},
): {
  focus: GraphNode | undefined
  positioned: Array<{ node: GraphNode; x: number; y: number; ring: 0 | 1 | 2; relation?: GraphEdge['relation'] }>
  links: Array<{ from: string; to: string; relation: GraphEdge['relation'] }>
} {
  const focus = GRAPH_NODE_BY_ID.get(focusId)
  if (!focus) return { focus: undefined, positioned: [], links: [] }

  const { relations, kinds, maxInner = 12 } = options
  const rng = det(`kglayout:${focusId}`)

  const filterNeighbour = (n: { node: GraphNode; relation: GraphEdge['relation'] }): boolean => {
    if (relations && relations.length > 0 && !relations.includes(n.relation)) return false
    if (kinds && kinds.length > 0 && !kinds.includes(n.node.kind)) return false
    return true
  }

  const inner = graphNeighbours(focusId).filter(filterNeighbour).slice(0, maxInner)
  const innerIds = new Set(inner.map((n) => n.node.id))

  const outer: Array<{ node: GraphNode; relation: GraphEdge['relation']; parent: string }> = []
  for (const item of inner.slice(0, 6)) {
    const second = graphNeighbours(item.node.id)
      .filter((n) => n.node.id !== focusId && !innerIds.has(n.node.id))
      .filter(filterNeighbour)
      .slice(0, 2)
    for (const s of second) {
      if (outer.some((o) => o.node.id === s.node.id)) continue
      outer.push({ node: s.node, relation: s.relation, parent: item.node.id })
    }
  }

  const positioned: Array<{ node: GraphNode; x: number; y: number; ring: 0 | 1 | 2; relation?: GraphEdge['relation'] }> = [
    { node: focus, x: 50, y: 50, ring: 0 },
  ]
  const links: Array<{ from: string; to: string; relation: GraphEdge['relation'] }> = []

  inner.forEach((item, i) => {
    const angle = (i / Math.max(inner.length, 1)) * Math.PI * 2 - Math.PI / 2
    const radius = 22 + rng.float(-1.5, 1.5)
    positioned.push({
      node: item.node,
      x: 50 + Math.cos(angle) * radius * 1.55,
      y: 50 + Math.sin(angle) * radius,
      ring: 1,
      relation: item.relation,
    })
    links.push({ from: focus.id, to: item.node.id, relation: item.relation })
  })

  outer.forEach((item, i) => {
    const angle = (i / Math.max(outer.length, 1)) * Math.PI * 2 - Math.PI / 2 + 0.22
    const radius = 39 + rng.float(-2, 2)
    positioned.push({
      node: item.node,
      x: 50 + Math.cos(angle) * radius * 1.55,
      y: 50 + Math.sin(angle) * radius,
      ring: 2,
      relation: item.relation,
    })
    links.push({ from: item.parent, to: item.node.id, relation: item.relation })
  })

  return { focus, positioned, links }
}

/** Free-text search across the graph. */
export function searchGraph(query: string, limit = 24): GraphNode[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) {
    return KNOWLEDGE_GRAPH.nodes
      .filter((n) => n.kind === 'ward' || n.kind === 'department')
      .slice(0, limit)
  }
  return KNOWLEDGE_GRAPH.nodes
    .filter((n) => n.label.toLowerCase().includes(q) || n.subtitle.toLowerCase().includes(q) || n.kind.includes(q))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
}

/** Institutional example path used to introduce the graph. */
export const EXAMPLE_RELATIONSHIP_PATH = [
  { kind: 'ward' as const, relation: 'contains' as const },
  { kind: 'road' as const, relation: 'affected-by' as const },
  { kind: 'complaint' as const, relation: 'assigned-to' as const },
  { kind: 'department' as const, relation: 'maintained-under' as const },
  { kind: 'tender' as const, relation: 'executed-by' as const },
  { kind: 'contractor' as const, relation: 'funded-by' as const },
  { kind: 'budget' as const, relation: 'linked-to' as const },
  { kind: 'project' as const, relation: 'assessed-through' as const },
]

export { wardName }

registerLayer(() => {
  KNOWLEDGE_GRAPH = buildGraph()
  GRAPH_NODE_BY_ID = new Map(KNOWLEDGE_GRAPH.nodes.map((n) => [n.id, n]))
})
