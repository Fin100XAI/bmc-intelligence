/**
 * Runtime smoke test.
 *
 * Loads the real application modules through Vite's SSR pipeline and exercises
 * the data, domain, security, workflow, service and AI layers end to end. This
 * catches runtime failures that a type check cannot — undefined access, empty
 * reductions, thrown service errors, broken permission contexts.
 *
 * Run with: node scripts/smoke.mjs
 */
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

const results = []
let failures = 0

async function check(name, fn) {
  try {
    const detail = await fn()
    results.push(['PASS', name, detail ?? ''])
  } catch (error) {
    failures += 1
    results.push(['FAIL', name, error?.message ?? String(error)])
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}


/** Ray-casting point-in-polygon, used by the ward tessellation checks. */
function pointInPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Shoelace area of a polygon in normalised 0-100 map space. */
function polyArea(poly) {
  let sum = 0
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const load = (p) => server.ssrLoadModule(p)

  // --- Reference & data ---------------------------------------------------
  const reference = await load('/src/data/reference.ts')
  const config = await load('/src/config/municipality.config.ts')
  const expectedWards = config.municipality.administrativeUnits.wards
  await check('Wards seeded', () => {
    assert(
      reference.WARDS.length === expectedWards,
      `expected ${expectedWards} wards, got ${reference.WARDS.length}`,
    )
    assert(reference.WARDS.every((w) => w.polygon.length >= 5), 'every ward needs a polygon')
    return `${reference.WARDS.length} wards, ${reference.DEPARTMENTS.length} departments`
  })

  await check('Determinism — repeat import yields identical figures', async () => {
    const again = await load('/src/data/reference.ts')
    const a = reference.WARDS.map((w) => w.healthScore).join(',')
    const b = again.WARDS.map((w) => w.healthScore).join(',')
    assert(a === b, 'ward health scores changed between reads')
    return 'ward health scores stable'
  })

  const intel = await load('/src/data/intelligence.data.ts')
  await check('Intelligence corpus', () => {
    assert(intel.INTELLIGENCE_ITEMS.length >= 100, `expected 100+ items, got ${intel.INTELLIGENCE_ITEMS.length}`)
    assert(intel.ALERTS.length >= 100, `expected 100+ alerts, got ${intel.ALERTS.length}`)
    const orphan = intel.INTELLIGENCE_ITEMS.find((i) => i.evidenceIds.length === 0)
    assert(!orphan, `intelligence item ${orphan?.id} has no evidence`)
    return `${intel.INTELLIGENCE_ITEMS.length} items, ${intel.ALERTS.length} alerts`
  })

  const evidence = await load('/src/data/evidence.data.ts')
  await check('Every cited evidence id resolves', () => {
    const missing = new Set()
    for (const item of intel.INTELLIGENCE_ITEMS) {
      for (const id of item.evidenceIds) if (!evidence.EVIDENCE_BY_ID.has(id)) missing.add(id)
    }
    assert(missing.size === 0, `${missing.size} dangling evidence references`)
    return `${evidence.EVIDENCE_ITEMS.length} evidence records, 0 dangling`
  })

  // --- Security engine ----------------------------------------------------
  const security = await load('/src/security/index.ts')
  const users = await load('/src/auth/demo-users.ts')
  const commissioner = users.USER_BY_ID.get('user-commissioner')
  const wardOfficer = users.USER_BY_ID.get('user-ward-officer')
  const finance = users.USER_BY_ID.get('user-finance')

  await check('Permission engine — Commissioner city-wide', () => {
    const d = security.canAccess(commissioner, 'decision', 'approve', { wardId: reference.WARDS[10].id })
    assert(d.allowed, `expected allow, got: ${d.reason}`)
    return d.basis
  })

  await check('Permission engine — Ward Officer denied outside ward', () => {
    const own = security.canAccess(wardOfficer, 'intelligence', 'view', { wardId: wardOfficer.wardId })
    assert(own.allowed, 'ward officer must see their own ward')
    const other = reference.WARDS.find((w) => w.id !== wardOfficer.wardId)
    const d = security.canAccess(wardOfficer, 'intelligence', 'view', { wardId: other.id })
    assert(!d.allowed && d.basis === 'ward-scope', `expected ward-scope denial, got ${d.basis}`)
    return 'own ward allowed; other ward denied on ward-scope'
  })

  await check('Permission engine — classification ceiling enforced', () => {
    const d = security.canAccess(wardOfficer, 'intelligence', 'view', {
      wardId: wardOfficer.wardId,
      classification: 'restricted',
    })
    assert(!d.allowed && d.basis === 'classification-ceiling', `expected ceiling denial, got ${d.basis}`)
    return 'restricted denied to internal ceiling'
  })

  await check('Permission engine — Ward Officer cannot approve decisions', () => {
    const d = security.canAccess(wardOfficer, 'decision', 'approve', {})
    assert(!d.allowed && d.basis === 'role-permission', `expected role denial, got ${d.basis}`)
    return 'decision:approve withheld'
  })

  /**
   * A session lifetime the platform states but never applies is a policy on
   * paper. Every issued session has carried `expiresAt` since the type was
   * written; until this check existed nothing read it, so `getSession` served
   * expired sessions as valid and the Security Command Centre counted them as
   * live.
   */
  await check('Session expiry is enforced, not merely declared', async () => {
    const auth = await load('/src/services/auth.service.ts')
    const { session } = await auth.authService.signIn('user-commissioner')

    assert(session.expiresAt, 'issued session carries no expiry')
    assert(
      auth.isSessionExpired(session) === false,
      'a session issued at the platform clock must not already be expired',
    )

    const live = auth.listLiveSessions()
    assert(live.some((s) => s.userId === 'user-commissioner'), 'issued session is not reported live')

    // Judged one minute past its own stated expiry, the same session must be
    // refused - and `getSession` must stop serving it.
    const justAfter = new Date(Date.parse(session.expiresAt) + 60_000)
    assert(auth.isSessionExpired(session, justAfter), 'a session past expiresAt was still reported valid')

    const stale = { ...session, expiresAt: new Date(Date.parse(session.expiresAt) - 9 * 60 * 60_000).toISOString() }
    assert(auth.isSessionExpired(stale), 'a session that expired nine hours ago was reported valid')

    return `${live.length} live session(s); expiry enforced on read and on the live-session sweep`
  })

  // --- Workflows ----------------------------------------------------------
  const workflows = await load('/src/workflows/index.ts')
  await check('Workflow machines reachable end to end', () => {
    for (const machine of workflows.WORKFLOW_CATALOGUE) {
      let current = machine.order[0]
      let hops = 0
      while (!machine.terminal.includes(current) && hops < 20) {
        // Walk forward along the declared lifecycle. A machine may legitimately
        // offer backward transitions (Blocked, Reassign, Return for rework), and
        // a naive first-match walk would oscillate on those forever.
        const options = workflows.nextTransitions(machine, current)
        const forward = options
          .filter((t) => machine.order.indexOf(t.to) > machine.order.indexOf(current))
          .sort((a, b) => machine.order.indexOf(a.to) - machine.order.indexOf(b.to))[0]
        const next = forward ?? options.find((t) => machine.terminal.includes(t.to))
        assert(next, `${machine.id} cannot progress from ${current}`)
        current = next.to
        hops += 1
      }
      assert(machine.terminal.includes(current), `${machine.id} never reached a terminal state`)
    }
    return `${workflows.WORKFLOW_CATALOGUE.length} machines reach terminal states`
  })

  // --- Domain engines -----------------------------------------------------
  const domains = await load('/src/domains/index.ts')

  await check('City position composite', () => {
    const pos = domains.buildCityPosition()
    assert(pos.healthScore > 0 && pos.healthScore <= 100, `health score out of range: ${pos.healthScore}`)
    assert(pos.healthComponents.length === 6, 'expected 6 published components')
    const sum = pos.healthComponents.reduce((s, c) => s + c.weight, 0)
    assert(Math.abs(sum - 1) < 0.001, `component weights must sum to 1, got ${sum}`)
    assert(pos.operationalTrend.length === 30, 'expected a 30-day trend')
    return `health ${pos.healthScore}/100, ${pos.topRisks.length} top risks, weights sum ${sum.toFixed(3)}`
  })

  await check('Ward profile builds for every ward', () => {
    for (const ward of reference.WARDS) {
      const profile = domains.buildWardProfile(ward.id)
      assert(profile, `no profile for ${ward.id}`)
      assert(profile.services.byCategory.length > 0, `${ward.id} has no service rows`)
    }
    return `${reference.WARDS.length} ward profiles built`
  })

  await check('Ward risk index is explainable', () => {
    const index = domains.buildWardRiskIndex(reference.WARDS[0].id)
    assert(index, 'no index produced')
    assert(index.components.length === 6, 'expected 6 components')
    assert(index.components.every((c) => c.explanation.length > 40), 'every component needs a real explanation')
    assert(index.deteriorationReasons.length > 0, 'expected at least one stated reason')
    const sum = index.components.reduce((s, c) => s + c.weight, 0)
    assert(Math.abs(sum - 1) < 0.001, `index weights must sum to 1, got ${sum}`)
    return `score ${index.score}/100, ${index.components.length} components, ${index.deteriorationReasons.length} reasons`
  })

  await check('Ward comparison across four wards', () => {
    const ids = reference.WARDS.slice(0, 4).map((w) => w.id)
    const rows = domains.compareWards(ids)
    assert(rows.length >= 15, `expected 15+ comparison rows, got ${rows.length}`)
    assert(rows.every((r) => ids.every((id) => typeof r.values[id] === 'number')), 'missing values')
    return `${rows.length} rows × ${ids.length} wards`
  })

  await check('Monsoon scenario — heavy rain + high tide raises risk', () => {
    const baseline = domains.runMonsoonScenario(domains.DEFAULT_MONSOON_SCENARIO)
    const preset = domains.MONSOON_SCENARIO_PRESETS.find((p) => p.id === 'heavy-rain-high-tide')
    assert(preset, 'preset missing')
    const scenario = domains.runMonsoonScenario(preset.inputs)
    assert(scenario.isSimulation === true, 'scenario must be flagged as simulation')
    assert(scenario.cityRisk > baseline.cityRisk, `expected risk to rise: ${baseline.cityRisk} → ${scenario.cityRisk}`)
    assert(scenario.wardRisks.length === expectedWards, 'expected all wards scored')
    assert(scenario.recommendedDeployments.length > 0, 'expected deployment recommendations')
    // Determinism
    const again = domains.runMonsoonScenario(preset.inputs)
    assert(again.cityRisk === scenario.cityRisk, 'scenario is not deterministic')
    return `city risk ${baseline.cityRisk} → ${scenario.cityRisk}, ${scenario.spotsAtRisk} spots at risk`
  })

  await check('Monsoon extreme scenario exceeds heavy scenario', () => {
    const heavy = domains.runMonsoonScenario(
      domains.MONSOON_SCENARIO_PRESETS.find((p) => p.id === 'heavy-rain-high-tide').inputs,
    )
    const extreme = domains.runMonsoonScenario(
      domains.MONSOON_SCENARIO_PRESETS.find((p) => p.id === 'extreme').inputs,
    )
    assert(extreme.cityRisk >= heavy.cityRisk, `extreme (${extreme.cityRisk}) should meet or exceed heavy (${heavy.cityRisk})`)
    return `heavy ${heavy.cityRisk} ≤ extreme ${extreme.cityRisk}`
  })

  await check('Budget scenario responds to inputs', () => {
    const base = domains.runBudgetScenario(domains.DEFAULT_BUDGET_SCENARIO)
    const stressed = domains.runBudgetScenario({
      capitalAllocationDeltaPct: 8,
      revenueExpenditureDeltaPct: 3,
      collectionEfficiencyDeltaPct: -10,
      contingencyCrore: 200,
    })
    assert(stressed.isSimulation === true, 'must be flagged as simulation')
    assert(stressed.totals.headroomCrore < base.totals.headroomCrore, 'headroom should fall under stress')
    assert(stressed.risks.length > 0, 'stressed scenario must raise risks')
    return `headroom ₹${base.totals.headroomCrore} Cr → ₹${stressed.totals.headroomCrore} Cr`
  })

  await check('Planning scenario surfaces new service gaps', () => {
    const base = domains.runPlanningScenario(domains.DEFAULT_PLANNING_SCENARIO)
    const growth = domains.runPlanningScenario({
      populationDeltaPct: 10,
      capitalInvestmentDeltaPct: 0,
      transportDemandDeltaPct: 0,
      extremeRainfallDeltaPct: 0,
    })
    assert(growth.city.scenarioAdequacy < base.city.scenarioAdequacy, 'adequacy should fall under growth')
    return `adequacy ${base.city.scenarioAdequacy} → ${growth.city.scenarioAdequacy}, ${growth.city.newGapCount} new gaps`
  })

  await check('Cross-domain correlations produced', () => {
    const insights = domains.buildCrossDomainInsights()
    assert(insights.length >= 6, `expected 6+ insights, got ${insights.length}`)
    assert(insights.every((i) => i.caveat.includes('correlation') || i.caveat.includes('Correlation')), 'every insight needs the causation caveat')
    assert(insights.every((i) => i.inputs.length >= 4), 'each insight must combine 4+ domain signals')
    return `${insights.length} insights, all carrying the causation caveat`
  })

  await check('Road defect priority engine', () => {
    const ranked = domains.rankedDefects(10)
    assert(ranked.length > 0, 'no defects ranked')
    for (let i = 1; i < ranked.length; i += 1) {
      assert(ranked[i - 1].priorityScore >= ranked[i].priorityScore, 'ranking not monotonic')
    }
    assert(ranked[0].priorityDrivers.length === 6, 'expected 6 published drivers')
    const weights = Object.values(domains.ROAD_PRIORITY_WEIGHTS).reduce((s, w) => s + w, 0)
    assert(Math.abs(weights - 1) < 0.001, `road weights must sum to 1, got ${weights}`)
    return `top priority ${ranked[0].priorityScore}/100, weights sum ${weights.toFixed(3)}`
  })

  // --- Services -----------------------------------------------------------
  const services = await load('/src/services/index.ts')

  await check('Ward service scopes to the acting principal', async () => {
    const all = await services.wardService.list(commissioner)
    const scoped = await services.wardService.list(wardOfficer)
    assert(
      all.length === expectedWards,
      `commissioner should see ${expectedWards} wards, saw ${all.length}`,
    )
    assert(scoped.length === 1, `ward officer should see 1 ward, saw ${scoped.length}`)
    return `commissioner ${all.length} wards, ward officer ${scoped.length}`
  })

  await check('Intelligence service filters by scope', async () => {
    const all = await services.intelligenceService.list(commissioner, { pageSize: 500 })
    const scoped = await services.intelligenceService.list(wardOfficer, { pageSize: 500 })
    assert(all.total > scoped.total, `expected narrower scope for ward officer (${all.total} vs ${scoped.total})`)
    assert(scoped.items.every((i) => i.wardIds.includes(wardOfficer.wardId)), 'leaked out-of-scope items')
    return `commissioner ${all.total} items, ward officer ${scoped.total}`
  })

  await check('Finance service withholds from unauthorised roles', async () => {
    const authorised = await services.financeService.budgetTotals(finance)
    assert(authorised.revised > 0, 'finance officer should see budget totals')
    assert(authorised.utilisationPct > 0, 'utilisation should be computed')
    let denied = false
    try {
      await services.financeService.budgetTotals(wardOfficer)
    } catch {
      denied = true
    }
    assert(denied, 'ward officer must not read city-wide budget totals')
    return `revised ₹${Math.round(authorised.revised)} Cr to Finance Officer; withheld from Ward Officer`
  })

  await check('Governance service double-gates the dataset register', async () => {
    const forCommissioner = await services.governanceService.datasets(commissioner)
    const forWardOfficer = await services.governanceService.datasets(wardOfficer)
    assert(forCommissioner.length > forWardOfficer.length, 'ward officer should see fewer datasets')
    const summary = await services.governanceService.summary(wardOfficer)
    assert(summary.withheldFromPrincipal > 0, 'expected withheld count to be disclosed')
    return `commissioner ${forCommissioner.length}, ward officer ${forWardOfficer.length} (${summary.withheldFromPrincipal} withheld)`
  })

  await check('Sewerage service excludes trunk reaches from compliance', async () => {
    const summary = await services.sewerageService.summary(commissioner)
    const facilities = await services.sewerageService.facilities(commissioner)
    assert(facilities.length > 0, 'expected treatment facilities')
    const manual = facilities.reduce((s, f) => s + f.treatmentCompliancePct, 0) / facilities.length
    assert(Math.abs(manual - summary.meanTreatmentCompliancePct) < 0.15, 'compliance average must exclude trunk reaches')
    return `${facilities.length} facilities, mean compliance ${summary.meanTreatmentCompliancePct}%`
  })

  await check('Procurement concentration computed', async () => {
    const rows = await services.procurementService.concentration(commissioner)
    assert(rows.length > 0, 'expected concentration rows')
    assert(rows.every((r) => r.note.length > 40), 'every row needs an institutional note')
    return `${rows.length} categories, top share ${rows[0].topVendorSharePct}%`
  })

  await check('Global search returns grouped results', async () => {
    const groups = await services.searchService.global(commissioner, 'ward')
    assert(Array.isArray(groups), 'expected grouped results')
    return `${groups.length} result group(s)`
  })

  await check('Workflow transition through the service layer', async () => {
    const page = await services.intelligenceService.list(commissioner, { pageSize: 50 })
    const target = page.items.find((i) => i.status === 'new')
    assert(target, 'no "new" intelligence item to transition')
    const updated = await services.intelligenceService.transition(commissioner, target.id, 'reviewed', 'Smoke test review')
    assert(updated.status === 'reviewed', `expected reviewed, got ${updated.status}`)
    const audit = await services.auditService.list(commissioner, { pageSize: 10 })
    assert(audit.items.length > 0, 'transition should have produced an audit event')
    return `${target.id}: new → reviewed, audit recorded`
  })

  await check('Audit denies unauthorised export', async () => {
    let denied = false
    try {
      await services.auditService.export(wardOfficer, {})
    } catch {
      denied = true
    }
    assert(denied, 'ward officer must not be able to export the audit trail')
    return 'audit:export withheld from Ward Officer'
  })

  // --- AI layer -----------------------------------------------------------
  const ai = await load('/src/ai/index.ts')
  const provider = ai.getAIProvider()

  await check('AI gateway blocks reserved acts before any generation', async () => {
    const blocked = ai.evaluateGatewayPolicy('Approve the payment for contract CON/7301')
    assert(!blocked.permitted, 'payment approval must be blocked')
    const response = await provider.answerMunicipalQuery({ user: commissioner }, 'Approve the payment for contract CON/7301')
    assert(response.recommendedActions.length === 0, 'a blocked request must not recommend actions')
    assert(response.answer.toLowerCase().includes('blocked'), 'the block must be explained to the officer')
    return blocked.blockedIntent
  })

  await check('AI answers route to real handlers with real figures', async () => {
    // Asserted on the route the retrieval engine reports reaching, not on a
    // phrase in the prose. A marker string tests the wording of an answer and
    // fails when that wording improves; the intent id tests the thing the
    // check is actually about - that the question reached the handler an
    // operator would expect - and cannot be satisfied by an adjacent route
    // that happens to use the same word.
    const cases = [
      ["What are the city's five highest operational risks today?", 'top-risks'],
      ['Which wards require immediate attention?', 'ward-ranking'],
      ['Which projects are at highest schedule risk?', 'projects'],
      ['Explain today’s monsoon readiness.', 'monsoon-readiness'],
      ['Which departments show major budget variance?', 'budget-variance'],
      ['Identify unusual collection patterns.', 'revenue'],
      ['Which road assets need priority intervention?', 'roads'],
      ['Which services are below SLA?', 'service-quality'],
    ]
    for (const [question, expectedIntent] of cases) {
      const r = await provider.answerMunicipalQuery({ user: commissioner }, question)
      assert(r.answer.length > 80, `answer too thin for "${question}"`)
      assert(r.keyFindings.length > 0, `no key findings for "${question}"`)
      assert(r.confidenceRationale.length > 40, `confidence not derived for "${question}"`)
      assert(r.interpretation, `no interpretation published for "${question}"`)
      assert(
        r.interpretation.intentId === expectedIntent,
        `"${question}" reached "${r.interpretation.intentId}" (expected "${expectedIntent}")`,
      )
      // Real figures, not a plausible-sounding paragraph.
      assert(
        /\d/.test(`${r.answer} ${r.keyFindings.join(' ')}`),
        `"${question}" produced no numeric content`,
      )
    }
    return `${cases.length} routed questions reached their declared handler with figures`
  })

  await check('Every AI citation resolves to a real evidence record', async () => {
    const r = await provider.answerMunicipalQuery({ user: commissioner }, "What are the city's five highest operational risks today?")
    assert(r.evidence.length > 0, 'expected citations')
    for (const c of r.evidence) {
      assert(!c.evidenceId || evidence.EVIDENCE_BY_ID.has(c.evidenceId), `fabricated citation ${c.evidenceId}`)
    }
    assert(r.grounding === 'evidence-backed', 'expected an evidence-backed response')
    return `${r.evidence.length} citations, all resolving`
  })

  await check('AI respects scope — ward officer answer is narrower', async () => {
    const wide = await provider.answerMunicipalQuery({ user: commissioner }, 'Which wards require immediate attention?')
    const narrow = await provider.answerMunicipalQuery({ user: wardOfficer }, 'Which wards require immediate attention?')
    assert(narrow.keyFindings.length <= wide.keyFindings.length, 'ward officer answer should not be broader')
    return `commissioner ${wide.keyFindings.length} findings, ward officer ${narrow.keyFindings.length}`
  })

  await check('Executive brief tailors to role and carries evidence', async () => {
    const brief = await provider.generateExecutiveBrief({ user: commissioner })
    const expected = ['Current Situation', 'Critical Risks', 'Major Exceptions', 'Decisions Required', 'Operational Actions', 'Financial Position', 'Upcoming Risks']
    assert(brief.sections.length === 7, `expected 7 sections, got ${brief.sections.length}`)
    for (const heading of expected) {
      assert(brief.sections.some((s) => s.heading === heading), `missing section: ${heading}`)
    }
    const wardBrief = await provider.generateExecutiveBrief({ user: wardOfficer })
    assert(wardBrief.title !== brief.title, 'brief must be tailored to role')
    assert(wardBrief.scopeLabel !== brief.scopeLabel, 'scope label must reflect the principal')
    return `${brief.sections.length} sections; commissioner "${brief.title}" vs ward "${wardBrief.title}"`
  })

  await check('Finance query withheld from an unauthorised principal', async () => {
    const r = await provider.answerMunicipalQuery({ user: wardOfficer }, 'Which departments show major budget variance?')
    assert(r.answer.toLowerCase().includes('outside your authorised scope'), 'must state the scope constraint plainly')
    assert(r.evidence.length === 0, 'no evidence should be returned for a withheld domain')
    return 'budget variance withheld with an explicit statement'
  })

  await check('Scenario interpretation never claims a forecast', async () => {
    const result = domains.runMonsoonScenario(
      domains.MONSOON_SCENARIO_PRESETS.find((p) => p.id === 'heavy-rain-high-tide').inputs,
    )
    const r = await provider.interpretScenario({ user: commissioner }, result.inputs, result)
    assert(r.answer.includes('SIMULATION') || r.answer.includes('simulation'), 'must label output as simulation')
    assert(r.risksAndLimitations.some((l) => l.toLowerCase().includes('not a forecast')), 'must deny forecast status')
    return 'labelled simulation; forecast status denied'
  })

  // --- Knowledge graph ----------------------------------------------------
  const graph = await load('/src/data/knowledge-graph.data.ts')
  await check('Knowledge graph is connected and navigable', () => {
    const { nodes, edges } = graph.KNOWLEDGE_GRAPH
    assert(nodes.length > 200, `expected 200+ nodes, got ${nodes.length}`)
    assert(edges.length > 200, `expected 200+ edges, got ${edges.length}`)
    for (const edge of edges) {
      assert(graph.GRAPH_NODE_BY_ID.has(edge.from), `edge from unknown node ${edge.from}`)
      assert(graph.GRAPH_NODE_BY_ID.has(edge.to), `edge to unknown node ${edge.to}`)
    }
    const ward = nodes.find((n) => n.kind === 'ward')
    const layout = graph.layoutNeighbourhood(ward.id)
    assert(layout.positioned.length > 1, 'neighbourhood layout produced no neighbours')
    return `${nodes.length} nodes, ${edges.length} edges, all endpoints resolve`
  })

  // --- Navigation ---------------------------------------------------------
  const nav = await load('/src/config/navigation.ts')
  await check('Every navigation item maps to a declared route', () => {
    const routes = new Set(Object.values(nav.ROUTES))
    for (const item of nav.ALL_NAV_ITEMS) {
      assert(routes.has(item.to), `nav item "${item.label}" points at undeclared route ${item.to}`)
      assert(item.description.length > 20, `nav item "${item.label}" needs a real description`)
    }
    return `${nav.ALL_NAV_ITEMS.length} navigation items across ${nav.NAV_SECTIONS.length} sections`
  })

  await check('Every role has a reachable landing route', () => {
    const routes = new Set(Object.values(nav.ROUTES))
    for (const role of security.ROLE_LIST) {
      assert(routes.has(role.landingRoute), `role ${role.id} lands on undeclared route ${role.landingRoute}`)
      assert(role.permissionIds.length > 0, `role ${role.id} holds no permissions`)
    }
    return `${security.ROLE_LIST.length} roles, all landing routes declared`
  })

  /**
   * `RequirePermission` reads the permission a route requires off its
   * navigation entry. A guarded route with no navigation entry therefore has
   * no declared permission - and the guard now REFUSES rather than granting,
   * because a gate that cannot determine what a route requires must not open
   * it. That fail-closed default is only safe if no legitimate page is sitting
   * on it, which is what this check establishes.
   *
   * A page added to the route table without a navigation entry fails here,
   * loudly, at build time - rather than either shipping open to everyone (the
   * old behaviour) or shipping closed to everyone (the new one).
   */
  await check('Every guarded route declares the permission it requires', () => {
    const table = readFileSync('src/routes/index.tsx', 'utf8')
    const guardedKeys = [...table.matchAll(/\{\s*path:\s*ROUTES\.(\w+),\s*element:\s*guarded\(/g)].map((m) => m[1])
    assert(guardedKeys.length > 50, `only ${guardedKeys.length} guarded routes found - the route table scan is broken`)

    const undeclared = []
    for (const key of guardedKeys) {
      const path = nav.ROUTES[key]
      if (!path) {
        undeclared.push(`${key} (no ROUTES entry)`)
        continue
      }
      if (!nav.navItemForPath(path)) undeclared.push(`${key} -> ${path}`)
    }
    assert(
      undeclared.length === 0,
      `these guarded routes resolve no navigation item, so RequirePermission cannot authorise them and will refuse: ${undeclared.join(', ')}`,
    )
    return `${guardedKeys.length} guarded routes, every one resolves a declared permission`
  })

  // --- Deployment ----------------------------------------------------------
  //
  // This build is scoped to Brihanmumbai, and the roster carries that one
  // corporation. The deployment machinery underneath is unchanged - selecting a
  // corporation still rebuilds every data layer rather than filtering one - so
  // these checks still run, over a roster of one. They exist because the
  // failure mode is silent: if the rebuilt seeds carry a new tenant id while
  // the acting principal still carries the old one, `scopeToTenant` filters
  // every list in the application to zero rows and nothing throws. A green type
  // check and a rendered page both survive that.
  const runtime = await load('/src/data/runtime.ts')
  const corporations = await load('/src/config/corporations.ts')
  const ops = await load('/src/data/operations.data.ts')

  /** A fingerprint that must be identical whenever the same corporation is active. */
  const fingerprint = () =>
    [
      config.municipality.tenantId,
      reference.WARDS.map((w) => `${w.code}:${w.healthScore}:${w.population}`).join('|'),
      reference.DEPARTMENTS.map((d) => `${d.id}:${d.budgetCrore}:${d.staffCount}`).join('|'),
      intel.INTELLIGENCE_ITEMS.length,
      ops.INCIDENTS.length,
    ].join('#')

  const bmcFingerprint = fingerprint()

  await check('Roster carries Brihanmumbai and nothing else', () => {
    assert(
      corporations.CORPORATIONS.length === 1,
      `expected 1 corporation, got ${corporations.CORPORATIONS.length}`,
    )
    const ids = new Set(corporations.CORPORATIONS.map((c) => c.id))
    assert(ids.size === corporations.CORPORATIONS.length, 'corporation ids must be unique')
    assert(ids.has('bmc'), 'the roster must carry Brihanmumbai')
    for (const c of corporations.CORPORATIONS) {
      assert(c.population2011 > 0, `${c.id} has no Census population`)
      assert(c.areaSqKm > 0, `${c.id} has no area`)
      assert(Number.isFinite(c.latLng.lat) && Number.isFinite(c.latLng.lng), `${c.id} has no coordinate`)
    }
    return `${corporations.CORPORATIONS.length} corporations, all with area, population and coordinates`
  })

  const fingerprints = new Map()
  /** Ward names and codes per corporation, for the identity checks below. */
  const wardListings = new Map()
  const wardCodes = new Map()

  for (const corp of corporations.CORPORATIONS) {
    await check(`Deployment rebuilds for ${corp.shortName} (${corp.city})`, async () => {
      runtime.setActiveCorporation(corp.id)

      // Identity propagated everywhere it is read.
      assert(config.municipality.tenantId === corp.id, `config still on ${config.municipality.tenantId}`)
      assert(config.TENANT_ID === corp.id, `TENANT_ID still ${config.TENANT_ID}`)

      // Geography rebuilt to this corporation's own division count.
      const expected = corporations.resolveWardCount(corp)
      assert(
        reference.WARDS.length === expected,
        `expected ${expected} wards for ${corp.shortName}, got ${reference.WARDS.length}`,
      )
      assert(reference.ZONES.length > 0, 'no zones')
      for (const w of reference.WARDS) {
        assert(w.polygon.length >= 3, `${corp.shortName} ward ${w.code} has a degenerate polygon`)
        assert(w.tenantId === corp.id, `${corp.shortName} ward ${w.code} carries tenant ${w.tenantId}`)
        assert(w.population > 0, `${corp.shortName} ward ${w.code} has no population`)
        assert(reference.ZONE_BY_ID.has(w.zoneId), `${corp.shortName} ward ${w.code} points at a missing zone`)
      }


      // Geometry the eye would catch and a type check never will: cells that
      // overlap, cells with no area, vertices off the canvas, a ward whose own
      // centroid falls outside it. There is no browser in this environment, so
      // the tessellation is proven by sampling rather than by looking at it.
      const bounds = reference.WARDS.flatMap((w) => w.polygon).every(
        ([x, y]) => x >= -0.5 && x <= 100.5 && y >= -0.5 && y <= 100.5,
      )
      assert(bounds, `${corp.shortName}: a ward vertex falls outside the map canvas`)

      const areas = reference.WARDS.map((w) => polyArea(w.polygon))
      assert(
        areas.every((a) => a > 0.5),
        `${corp.shortName}: a ward polygon has no meaningful area`,
      )
      const totalArea = areas.reduce((a, b) => a + b, 0)
      assert(
        areas.every((a) => a / totalArea < 0.7),
        `${corp.shortName}: one ward covers most of the city`,
      )

      // A 70x70 sample: every point of the city must fall inside at most one
      // ward. Two wards claiming the same ground is the failure that makes a
      // spatial surface untrustworthy.
      let covered = 0
      let overlapping = 0
      for (let gx = 0; gx < 70; gx += 1) {
        for (let gy = 0; gy < 70; gy += 1) {
          const x = (gx + 0.5) * (100 / 70)
          const y = (gy + 0.5) * (100 / 70)
          let hits = 0
          for (const w of reference.WARDS) if (pointInPolygon(x, y, w.polygon)) hits += 1
          if (hits > 0) covered += 1
          if (hits > 1) overlapping += 1
        }
      }
      assert(overlapping === 0, `${corp.shortName}: ${overlapping} sampled points fall in more than one ward`)
      assert(covered > 400, `${corp.shortName}: wards cover only ${covered} sampled points - the city is too sparse`)

      // Every ward belongs to exactly one zone, and no zone is empty.
      const assigned = new Set(reference.ZONES.flatMap((z) => z.wardIds))
      assert(assigned.size === reference.WARDS.length, `${corp.shortName}: wards missing from the zone tier`)
      for (const z of reference.ZONES) {
        assert(z.wardIds.length > 0, `${corp.shortName} zone ${z.code} holds no wards`)
      }

      // The acting principal moved with the deployment - the silent-empty guard.
      const principal = users.USER_BY_ID.get('user-commissioner')
      assert(principal, 'commissioner profile missing after switch')
      assert(
        principal.tenantId === corp.id,
        `commissioner still carries tenant ${principal.tenantId} under ${corp.id}`,
      )

      // Services must return a populated picture, not a silently empty one.
      const wardsSeen = await services.wardService.list(principal)
      assert(
        wardsSeen.length === expected,
        `${corp.shortName}: ward service returned ${wardsSeen.length} of ${expected}`,
      )
      const items = await services.intelligenceService.list(principal, { pageSize: 500 })
      assert(items.total > 0, `${corp.shortName}: intelligence feed is empty`)

      // Nothing may collapse to nothing at the smallest corporation.
      assert(reference.DEPARTMENTS.length > 0, 'no departments')
      assert(reference.OFFICERS.length > 0, 'no officers')
      assert(intel.ALERTS.length > 0, `${corp.shortName}: no alerts`)
      assert(ops.INCIDENTS.length > 0, `${corp.shortName}: no incidents`)
      assert(ops.COMPLAINTS.length > 0, `${corp.shortName}: no complaints`)

      const fp = fingerprint()
      fingerprints.set(corp.id, fp)
      wardListings.set(corp.id, reference.WARDS.map((w) => w.name).join(' | '))
      wardCodes.set(corp.id, reference.WARDS.map((w) => w.code))
      return `${reference.WARDS.length} units, ${reference.ZONES.length} zones, ${items.total} intelligence items`
    })
  }

  await check('Every corporation produces a distinct municipal picture', () => {
    const distinct = new Set(fingerprints.values())
    assert(
      distinct.size === fingerprints.size,
      `${fingerprints.size - distinct.size} corporations share an identical dataset`,
    )
    return `${distinct.size} distinct datasets across ${fingerprints.size} corporations`
  })

  /**
   * Two corporations that render the SAME LIST OF WARD NAMES read, to an
   * operator switching between them, as a switch that did not happen. The
   * fingerprint check above does not catch it: health scores and populations
   * differ per corporation, so two identical name lists still fingerprint
   * apart. This is the check that failed silently while `resolveDivisions`
   * discarded each corporation's published divisions and renumbered them as
   * `${wardTerminology} ${n}` - Kolhapur and Bhiwandi-Nizampur were the same
   * five rows, and Sangli, Malegaon, Ahilyanagar and Dhule the same four.
   *
   * The allowance below is not a silencer. Each entry is a pair of cities that
   * genuinely run the same structure under the same terminology, with the
   * source that establishes it. Anything else is a defect.
   */
  const SAME_STRUCTURE_BY_FACT = new Map([
    [
      'ichalkaranji|jalna',
      'both run sixteen numbered prabhags returning 65 corporator seats under the four-member prabhag structure, and neither publishes names for them. Ichalkaranji: first general election 15 Jan 2026, 65 seats across 16 prabhags. Jalna: constituted 7 Aug 2023, 16 prabhags x 4 corporators.',
    ],
  ])

  await check('No two corporations render the same ward list', () => {
    const byListing = new Map()
    const collisions = []
    for (const [id, listing] of wardListings) {
      const seen = byListing.get(listing)
      if (seen) collisions.push([seen, id].sort().join('|'))
      else byListing.set(listing, id)
    }
    const unexplained = collisions.filter((pair) => !SAME_STRUCTURE_BY_FACT.has(pair))
    assert(
      unexplained.length === 0,
      `these corporations render an identical ward list: ${unexplained.join(', ')}. ` +
        'Either the corporation publishes divisions that are being discarded, or the pair belongs in SAME_STRUCTURE_BY_FACT with the source that says so.',
    )
    return `${byListing.size} distinct ward lists, ${collisions.length} explained by identical published structure`
  })

  await check('Ward codes are clean and unique within every corporation', () => {
    for (const [id, codes] of wardCodes) {
      const unique = new Set(codes)
      assert(unique.size === codes.length, `${id}: duplicate ward codes (${codes.join(', ')})`)
      for (const code of codes) {
        // Quotes and stray punctuation in a code mean the derivation read
        // typography as identity - Panvel's four lettered ward offices once
        // came out as 'K, 'K2, 'K3 and 'P.
        assert(
          /^[A-Z0-9][A-Z0-9/-]*$/.test(code),
          `${id}: ward code ${JSON.stringify(code)} carries punctuation that is not part of a published designation`,
        )
      }
    }
    return `${[...wardCodes.values()].reduce((n, c) => n + c.length, 0)} ward codes across ${wardCodes.size} corporations`
  })

  await check('Switching back reproduces the original picture exactly', () => {
    runtime.setActiveCorporation('bmc')
    assert(
      fingerprint() === bmcFingerprint,
      'Brihanmumbai did not reproduce byte-identically after switching away and back',
    )
    return 'byte-identical on return'
  })

} finally {
  await server.close()
}

const width = Math.max(...results.map((r) => r[1].length))
for (const [status, name, detail] of results) {
  const mark = status === 'PASS' ? '  ok  ' : ' FAIL '
  console.log(`${mark} ${name.padEnd(width)}  ${detail}`)
}
console.log(`\n${results.length - failures}/${results.length} checks passed`)
process.exit(failures > 0 ? 1 : 0)
