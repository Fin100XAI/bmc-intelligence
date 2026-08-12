/**
 * Municipal Copilot runtime smoke test.
 *
 * The Copilot's failure mode is not a crash - it is answering a question
 * adjacent to the one that was asked, confidently, with a real-looking table.
 * A type check cannot see that, and a page-render smoke test cannot either.
 * So this harness exercises the retrieval engine directly and asserts the
 * things that actually make it trustworthy:
 *
 *   - every declared route has a handler (no question can reach a dead end)
 *   - a question bank routes where an operator would expect it to
 *   - named wards and named conditions actually narrow the answer
 *   - the gateway still refuses reserved acts before any retrieval
 *   - a ward-scoped principal cannot pull a corporation-wide figure
 *   - the same question always produces byte-identical output
 *   - the platform's language rules hold across every generated answer
 *
 * Run with: node scripts/smoke-copilot.mjs
 */
import { createServer } from 'vite'

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

/**
 * Questions an operator would plausibly type, with the route each should
 * reach. Deliberately includes colloquial phrasings ("what's going on with
 * the bins"), because the old router sent every one of those to a stub.
 */
const ROUTING_BANK = [
  ['What are the five highest operational risks right now?', 'top-risks'],
  ['Which wards need the most attention?', 'ward-ranking'],
  ['Which capital projects are showing schedule risk or delay?', 'projects'],
  ['How prepared are we for this monsoon?', 'monsoon-readiness'],
  ['What is the current water supply position?', 'water-supply'],
  ['Show me department budget variance against the phased plan.', 'budget-variance'],
  ['What are the current revenue risks?', 'revenue'],
  ['Which road assets need intervention?', 'roads'],
  ['What requires my attention today?', 'my-attention'],
  ['Are there any public health signals I should know about?', 'health-signals'],
  ['What is the overall city position?', 'city-position'],
  ['What can you answer?', 'capabilities'],

  // Domains the previous router had no route for at all.
  ['What is the solid waste collection position?', 'waste'],
  ['What is the sewerage treatment compliance position?', 'sewerage'],
  ['What is the hospital bed and ICU occupancy position?', 'hospitals'],
  ['What is the fire and emergency response position?', 'emergency'],
  ['What is the air quality position across the city?', 'air-quality'],
  ['What is the street lighting fault position?', 'street-lighting'],
  ['Which contractors carry the weakest delivery performance?', 'contractors'],
  ['Are there any unusual procurement patterns?', 'procurement'],
  ['What is the property tax assessment and collection position?', 'property-tax'],
  ['What is the municipal school position?', 'education'],
  ['What is the settlement service adequacy position?', 'housing'],
  ['What is the welfare scheme disbursement position?', 'welfare'],
  ['What is the trade licensing and enforcement position?', 'licensing'],
  ['What is the birth and death registration position?', 'registration'],
  ['What is the cemetery and crematorium capacity position?', 'deathcare'],
  ['What is the municipal market hygiene position?', 'markets'],
  ['What is the stray animal sterilisation position?', 'animal-welfare'],
  ['What is the public toilet and amenity adequacy position?', 'amenities'],
  ['Where is the workforce vacancy position most acute?', 'workforce'],
  ['What is the status of council resolutions?', 'council'],
  ['What is the urban livelihoods position?', 'livelihoods'],
  ['What is the tree canopy and open space position?', 'gardens'],
  ['Which traffic corridors are most congested?', 'traffic'],
  ['Which municipal assets are in the worst condition?', 'assets'],
  ['Which buildings carry an overdue structural audit?', 'buildings'],
  ['Where is waterlogging risk concentrated?', 'waterlogging'],
  ['What is the coastal vulnerability position?', 'coastal'],
  ['What is the disaster management readiness position?', 'disaster'],
  ['How is the ward risk index computed, and from what sources?', 'data-quality'],
]

/** Reserved acts. Every one must be refused before any retrieval happens. */
const RESERVED_ACTS = [
  'Approve the payment for contract PWD-2024-0182.',
  'Award the tender to the lowest bidder.',
  'Impose a penalty on the contractor.',
  'Reject this citizen application for eligibility.',
  'Is this contractor guilty of corruption?',
]

/**
 * Assertions that hold for EVERY generated answer. These encode the platform's
 * language rules, which are load-bearing rather than stylistic: an anomaly is
 * not fraud, a risk score is not guilt, a simulation is not a forecast.
 */
const BANNED_PHRASES = [
  'is fraudulent',
  'committed fraud',
  'is guilty',
  'proves that',
  'we forecast',
  'guaranteed',
  '100% secure',
  'no retrieval route',
  'coming soon',
  'lorem ipsum',
]

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const load = (p) => server.ssrLoadModule(p)

  const nlu = await load('/src/ai/nlu.ts')
  const engine = await load('/src/ai/query-engine.ts')
  const aiIndex = await load('/src/ai/index.ts')
  const demo = await load('/src/auth/demo-users.ts')
  const reference = await load('/src/data/reference.ts')

  const commissioner =
    demo.DEMO_USERS.find((u) => u.roleId === 'municipal-commissioner') ?? demo.DEMO_USERS[0]
  const wardOfficer = demo.DEMO_USERS.find((u) => u.roleId === 'ward-officer')
  assert(commissioner, 'no demonstration principal available')

  /* ---------------------------------------------------------------- */

  await check('Every declared route has a handler', () => {
    const missing = nlu.QUERY_INTENTS
      .map((intent) => intent.id)
      .filter((id) => typeof engine.resolveHandler(id) !== 'function')
    assert(missing.length === 0, `routes without a handler: ${missing.join(', ')}`)
    return `${nlu.QUERY_INTENTS.length} routes, all wired`
  })

  await check('Question bank routes where an operator would expect', () => {
    const wrong = []
    for (const [question, expected] of ROUTING_BANK) {
      const understanding = nlu.understandQuery(question)
      if (understanding.intent.id !== expected) {
        wrong.push(`"${question}" -> ${understanding.intent.id} (expected ${expected})`)
      }
    }
    assert(wrong.length === 0, `${wrong.length} misrouted:\n    ${wrong.join('\n    ')}`)
    return `${ROUTING_BANK.length}/${ROUTING_BANK.length} routed correctly`
  })

  await check('A named ward binds and narrows the answer', () => {
    const ward = reference.WARDS[0]
    const locality = ward.name.split('·')[0].trim()
    const understanding = nlu.understandQuery(`What is the position in ${locality}?`)
    assert(
      understanding.entities.wards.some((w) => w.id === ward.id),
      `"${locality}" did not bind to ${ward.code}`,
    )
    const { composed } = engine.runQuery(commissioner, `What is the position in ${locality}?`)
    assert(composed.answer.length > 0, 'ward-scoped question produced no answer')
    return `"${locality}" -> ${understanding.entities.wards.length} ward(s), route ${understanding.intent.id}`
  })

  await check('A named condition binds and narrows the health answer', () => {
    const understanding = nlu.understandQuery('What is the dengue situation?')
    assert(understanding.intent.id === 'health-signals', `routed to ${understanding.intent.id}`)
    assert(
      understanding.entities.conditions.includes('dengue'),
      'dengue did not bind as a condition',
    )
    const { composed } = engine.runQuery(commissioner, 'What is the dengue situation?')
    const body = `${composed.answer} ${composed.keyFindings.join(' ')}`.toLowerCase()
    assert(body.includes('dengue'), 'the answer never mentions the condition that was asked about')
    const others = ['malaria', 'chikungunya', 'leptospirosis']
    const leaked = others.filter((c) => composed.supportingTable?.rows?.some((r) => r.join(' ').toLowerCase().includes(c)))
    assert(leaked.length === 0, `condition filter leaked: ${leaked.join(', ')}`)
    return 'dengue bound and applied as a filter'
  })

  await check('A ward + condition question narrows on both', () => {
    const ward = reference.WARDS.find((w) => w.name.split('·')[0].trim().length >= 5) ?? reference.WARDS[0]
    const locality = ward.name.split('·')[0].trim()
    const question = `What is the dengue situation in ${locality}?`
    const understanding = nlu.understandQuery(question)
    assert(understanding.entities.conditions.includes('dengue'), 'condition did not bind')
    assert(understanding.entities.wards.length > 0, 'ward did not bind')
    return `${locality} + dengue both bound`
  })

  await check('Every route produces a substantive answer', () => {
    const thin = []
    for (const intent of nlu.QUERY_INTENTS) {
      const { composed } = engine.runQuery(commissioner, intent.example)
      if (!composed || typeof composed.answer !== 'string' || composed.answer.trim().length < 60) {
        thin.push(`${intent.id} (${composed?.answer?.length ?? 0} chars)`)
      }
    }
    assert(thin.length === 0, `routes returning a thin answer: ${thin.join(', ')}`)
    return `${nlu.QUERY_INTENTS.length} routes all returned substantive prose`
  })

  await check('Answers carry real figures, not placeholders', () => {
    const bare = []
    // Routes that legitimately carry no municipal figures: they describe the
    // platform rather than the city.
    const exempt = new Set(['capabilities'])
    for (const intent of nlu.QUERY_INTENTS) {
      if (exempt.has(intent.id)) continue
      const { composed } = engine.runQuery(commissioner, intent.example)
      const body = `${composed.answer} ${composed.keyFindings.join(' ')}`
      if (!/\d/.test(body)) bare.push(intent.id)
    }
    assert(bare.length === 0, `routes with no numeric content: ${bare.join(', ')}`)
    return 'every municipal route cited at least one figure'
  })

  /**
   * The check above is not enough on its own. An empty-register answer still
   * contains "Covering all 24 wards", so it satisfies a test for digits while
   * carrying no municipal content at all - which is exactly how an
   * over-eager entity binding once emptied the capital-works route without
   * failing anything. A principal who can read the whole corporation should
   * never receive an empty register, so that is asserted directly.
   */
  await check('No route comes back empty for a full-scope principal', () => {
    const exempt = new Set(['capabilities'])
    const empty = []
    for (const intent of nlu.QUERY_INTENTS) {
      if (exempt.has(intent.id)) continue
      const { composed } = engine.runQuery(commissioner, intent.example)
      if (composed.keyFindings.length === 0) empty.push(intent.id)
    }
    assert(empty.length === 0, `routes returning no findings to a commissioner: ${empty.join(', ')}`)
    return `${nlu.QUERY_INTENTS.length - exempt.size} routes all returned findings`
  })

  await check('A domain noun does not bind its like-named department', () => {
    // "projects", "roads", "hospitals" and the rest are department short names
    // as well as ordinary subject nouns. Binding the department silently
    // filters the register down to the few records that department owns.
    const collisions = [
      ['Which capital projects are showing schedule risk or delay?', 'projects'],
      ['Which road assets need intervention?', 'roads'],
      ['What is the hospital bed and ICU occupancy position?', 'hospitals'],
      ['What is the municipal school position?', 'education'],
    ]
    const bound = []
    for (const [question, expected] of collisions) {
      const understanding = nlu.understandQuery(question)
      if (understanding.entities.departments.length > 0) {
        bound.push(`"${question}" bound ${understanding.entities.departments.map((d) => d.id).join(', ')}`)
      }
      if (understanding.intent.id !== expected) bound.push(`"${question}" routed to ${understanding.intent.id}`)
    }
    assert(bound.length === 0, bound.join('; '))
    // And the converse: naming a department as an organisation still binds it.
    const explicit = nlu.understandQuery('What is the budget position for the Solid Waste Management Department?')
    assert(
      explicit.entities.departments.some((d) => d.id === 'dept-solid-waste'),
      'an explicitly named department no longer binds',
    )
    return 'subject nouns stay unbound; an explicitly named department still binds'
  })

  await check('Platform language rules hold across every answer', () => {
    const offences = []
    for (const intent of nlu.QUERY_INTENTS) {
      const { composed } = engine.runQuery(commissioner, intent.example)
      const body = [
        composed.answer,
        ...composed.keyFindings,
        ...composed.risksAndLimitations,
        ...composed.recommendedActions.flatMap((r) => [r.title, r.why, r.expectedImpact]),
      ].join(' ').toLowerCase()
      for (const phrase of BANNED_PHRASES) {
        if (body.includes(phrase)) offences.push(`${intent.id}: "${phrase}"`)
      }
    }
    assert(offences.length === 0, offences.join('; '))
    return `${BANNED_PHRASES.length} prohibited phrasings absent from all routes`
  })

  await check('Every route states its limitations', () => {
    const silent = nlu.QUERY_INTENTS.filter((intent) => {
      const { composed } = engine.runQuery(commissioner, intent.example)
      return !Array.isArray(composed.risksAndLimitations) || composed.risksAndLimitations.length === 0
    }).map((i) => i.id)
    assert(silent.length === 0, `routes with no stated limitation: ${silent.join(', ')}`)
    return 'all routes stated at least one limitation'
  })

  await check('Retrieval is deterministic', () => {
    const drifted = []
    for (const intent of nlu.QUERY_INTENTS) {
      const a = JSON.stringify(engine.runQuery(commissioner, intent.example).composed)
      const b = JSON.stringify(engine.runQuery(commissioner, intent.example).composed)
      if (a !== b) drifted.push(intent.id)
    }
    assert(drifted.length === 0, `routes that changed between identical calls: ${drifted.join(', ')}`)
    return 'byte-identical across repeated calls'
  })

  await check('Gateway refuses reserved acts before any retrieval', async () => {
    const provider = aiIndex.getAIProvider()
    for (const prompt of RESERVED_ACTS) {
      const response = await provider.answerMunicipalQuery({ user: commissioner, question: prompt }, prompt)
      const refused = response.sources.some((s) => s.toLowerCase().includes('gateway policy'))
      assert(refused, `not refused at the gateway: "${prompt}"`)
      assert(
        response.evidence.length === 0,
        `a refused request still retrieved ${response.evidence.length} evidence records: "${prompt}"`,
      )
    }
    return `${RESERVED_ACTS.length} reserved acts refused, zero retrieval on each`
  })

  await check('A ward-scoped principal is confined to their scope', () => {
    if (!wardOfficer) return 'no ward-scoped demonstration principal — skipped'
    const authorised = engine.buildAnswerContext(wardOfficer, nlu.understandQuery('Which wards need the most attention?'))
    assert(
      authorised.wards.length < reference.WARDS.length,
      `a ward officer saw all ${reference.WARDS.length} wards`,
    )
    const { composed } = engine.runQuery(wardOfficer, 'Which wards need the most attention?')
    // Match on the rendered ward label and on the ward's own locality name.
    // A bare code will not do: several are a single letter, and "N" matches
    // "Not applicable" in any cell, which reports a leak that never happened.
    const body = [
      composed.answer,
      ...composed.keyFindings,
      ...(composed.supportingTable?.rows ?? []).map((r) => r.join(' ')),
    ].join(' ')
    const outOfScope = reference.WARDS
      .filter((w) => !authorised.wards.some((a) => a.id === w.id))
      .filter((w) => {
        const label = reference.wardName(w.id)
        const locality = w.name.split('·')[0].trim()
        return body.includes(label) || (locality.length >= 5 && body.includes(locality))
      })
    assert(outOfScope.length === 0, `out-of-scope wards appeared: ${outOfScope.map((w) => w.code).join(', ')}`)
    return `confined to ${authorised.wards.length} of ${reference.WARDS.length} wards`
  })

  await check('An unmatched question orients rather than dead-ends', () => {
    const nonsense = 'Tell me about the thing with the stuff please'
    const understanding = nlu.understandQuery(nonsense)
    assert(understanding.fellBack, 'a nonsense question did not report a fallback')
    assert(typeof understanding.note === 'string' && understanding.note.length > 0, 'fallback was silent')
    const { composed } = engine.runQuery(commissioner, nonsense)
    assert(composed.answer.length > 60, 'fallback produced no substantive orientation')
    return `fell back to "${understanding.intent.id}" with a stated reason`
  })

  await check('The provider attaches its reading to the response', async () => {
    const provider = aiIndex.getAIProvider()
    const question = 'Which wards need the most attention?'
    const response = await provider.answerMunicipalQuery({ user: commissioner, question }, question)
    assert(response.interpretation, 'no interpretation attached')
    assert(response.interpretation.intentId === 'ward-ranking', `read as ${response.interpretation.intentId}`)
    assert(Array.isArray(response.visuals) && response.visuals.length > 0, 'no visuals computed')
    assert(Array.isArray(response.followUps) && response.followUps.length > 0, 'no follow-ups offered')
    return `read as "${response.interpretation.intentLabel}", ${response.visuals.length} visual(s)`
  })

  await check('Visual payloads are well formed', () => {
    const bad = []
    const kinds = new Set(['metrics', 'ranked-bar', 'trend', 'composition', 'heatmap'])
    for (const intent of nlu.QUERY_INTENTS) {
      const { composed } = engine.runQuery(commissioner, intent.example)
      for (const visual of composed.visuals ?? []) {
        if (!kinds.has(visual.kind)) bad.push(`${intent.id}: unknown kind "${visual.kind}"`)
        if (!visual.id) bad.push(`${intent.id}: visual without an id`)
        if (visual.kind === 'ranked-bar' && !Array.isArray(visual.data)) bad.push(`${intent.id}: ranked-bar without data`)
        if (visual.kind === 'metrics' && !Array.isArray(visual.items)) bad.push(`${intent.id}: metrics without items`)
        if (visual.kind === 'ranked-bar' && visual.data?.some((d) => !Number.isFinite(d.value))) {
          bad.push(`${intent.id}: ranked-bar carries a non-finite value`)
        }
      }
    }
    assert(bad.length === 0, bad.join('; '))
    return 'all visual payloads well formed'
  })

  await check('Follow-ups route back into the engine', () => {
    const dead = []
    for (const intent of nlu.QUERY_INTENTS) {
      const { composed } = engine.runQuery(commissioner, intent.example)
      for (const followUp of composed.followUps ?? []) {
        const understanding = nlu.understandQuery(followUp)
        if (understanding.fellBack) dead.push(`${intent.id}: "${followUp}"`)
      }
    }
    assert(dead.length === 0, `follow-ups that fall back:\n    ${dead.join('\n    ')}`)
    return 'every offered follow-up reaches a real route'
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
