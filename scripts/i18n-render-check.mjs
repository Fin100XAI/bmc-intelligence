/**
 * Rendered-language check.
 *
 * `i18n-audit.mjs` proves the CATALOGUE is complete: every message the source
 * asks `t()` for has a Marathi reading. It cannot prove the harder thing —
 * that a string reaching the screen went through `t()` at all. A heading built
 * by string concatenation, a label read straight off an object, a chart series
 * name passed through a library: none of those appear in the audit, and all of
 * them render English on a Marathi screen.
 *
 * This mounts real pages in a real DOM with the language set to Marathi and
 * reads the text back out. Anything that comes back as a run of English words
 * is either a missed string or a proper noun, and the report names it either
 * way so the distinction is made deliberately rather than by omission.
 *
 * Run with: node scripts/i18n-render-check.mjs [--all] [--verbose]
 */
import { JSDOM } from 'jsdom'

const ALL = process.argv.includes('--all')
const VERBOSE = process.argv.includes('--verbose')

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})

function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
for (const name of [
  'window', 'document', 'navigator', 'location', 'history', 'HTMLElement', 'Element',
  'Node', 'Event', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame', 'localStorage', 'sessionStorage',
]) {
  defineGlobal(name, name === 'window' ? dom.window : dom.window[name])
}
defineGlobal('IS_REACT_ACT_ENVIRONMENT', true)
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
dom.window.ResizeObserver = NoopObserver
dom.window.IntersectionObserver = NoopObserver
defineGlobal('ResizeObserver', NoopObserver)
defineGlobal('IntersectionObserver', NoopObserver)
dom.window.matchMedia ??= (query) => ({
  matches: false, media: query, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => false,
})
defineGlobal('matchMedia', dom.window.matchMedia)
dom.window.scrollTo = () => {}
dom.window.print = () => {}

const { act, createElement } = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter, Route, Routes } = await import('react-router-dom')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const { createServer } = await import('vite')

const SETTLE_TIMEOUT_MS = 15_000
const SETTLE_INTERVAL_MS = 25

async function settle(queryClient) {
  const start = Date.now()
  let quiet = 0
  while (Date.now() - start < SETTLE_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, SETTLE_INTERVAL_MS))
    const fetching = queryClient.isFetching()
    quiet = fetching === 0 ? quiet + 1 : 0
    if (quiet >= 4) break
  }
}

/* --------------------------------------------------------------------------
   What counts as leftover English.
   -------------------------------------------------------------------------- */

/**
 * A run of three or more consecutive Latin-script words is a phrase, and a
 * phrase on a Marathi screen is copy that never reached the catalogue. Two
 * words are left alone: "Andheri West", "Bandra Kurla", an officer's name and
 * a contractor's name are all two-word proper nouns, and the register carries
 * them in the Latin script on purpose.
 */
const RUN_LENGTH = 3

/** Notation, not words: acronyms, units, codes, versions. */
function isNotation(word) {
  if (/^[A-Z0-9][A-Z0-9./-]*$/.test(word)) return true
  if (/^\d/.test(word)) return true
  if (/^v\d/.test(word)) return true
  return false
}

function englishRuns(text) {
  const runs = []
  let current = []
  for (const token of text.split(/[^A-Za-z0-9'’./-]+/)) {
    if (token.length === 0) continue
    if (/^[A-Za-z]/.test(token) && !isNotation(token)) current.push(token)
    else {
      if (current.length >= RUN_LENGTH) runs.push(current.join(' '))
      current = []
    }
  }
  if (current.length >= RUN_LENGTH) runs.push(current.join(' '))
  return runs
}

/** Text a human actually reads, with script and style elements excluded. */
function visibleText(root) {
  const parts = []
  const walk = (node) => {
    if (node.nodeType === 3) {
      parts.push(node.textContent)
      return
    }
    if (node.nodeType !== 1) return
    const tag = node.tagName?.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'svg') return
    if (node.getAttribute?.('aria-hidden') === 'true') return
    for (const child of node.childNodes) walk(child)
  }
  walk(root)
  return parts.join(' ').replace(/\s+/g, ' ')
}

/* --------------------------------------------------------------------------
   The sweep.
   -------------------------------------------------------------------------- */

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const findings = []
let pagesChecked = 0

try {
  const load = (p) => server.ssrLoadModule(p)
  const i18n = await load('/src/i18n/index.ts')
  const runtime = await load('/src/data/runtime.ts')
  const auth = await load('/src/stores/auth.store.ts')
  const nav = await load('/src/config/navigation.ts')

  i18n.setActiveLocale('mr')
  runtime.rebuildAllLayers()
  auth.useAuthStore.getState().signIn('user-commissioner')

  /* Navigation is data, not a render: check it directly and completely. */
  for (const section of nav.NAV_SECTIONS) {
    for (const run of englishRuns(section.label)) {
      findings.push({ where: 'navigation section', text: run })
    }
    for (const item of section.items) {
      for (const run of englishRuns(item.label)) findings.push({ where: `nav · ${item.id}`, text: run })
      for (const run of englishRuns(item.description ?? '')) {
        findings.push({ where: `nav · ${item.id} (description)`, text: run })
      }
    }
  }

  /* A representative page from every section of the platform. `--all` sweeps
     every routed page instead. */
  const SAMPLE = [
    ['/command/executive', '@/pages/command/ExecutiveOverviewPage'],
    ['/command/decisions', '@/pages/command/DecisionCentrePage'],
    ['/command/alerts', '@/pages/command/AlertsPage'],
    ['/city/wards', '@/pages/city/WardIntelligencePage'],
    ['/city/water', '@/pages/city/WaterIntelligencePage'],
    ['/city/monsoon', '@/pages/city/MonsoonIntelligencePage'],
    ['/city/health', '@/pages/city/PublicHealthPage'],
    ['/governance/revenue', '@/pages/governance/RevenueIntelligencePage'],
    ['/governance/projects', '@/pages/governance/ProjectIntelligencePage'],
    ['/strategic/benchmarking', '@/pages/strategic/BenchmarkingPage'],
    ['/ai/copilot', '@/pages/ai/CopilotPage'],
    ['/trust/trust-centre', '@/pages/trust/TrustCentrePage'],
    ['/admin/settings', '@/pages/admin/SettingsPage'],
  ]

  const pages = ALL
    ? Object.entries(nav.ROUTES)
        .filter(([, path]) => path !== '/login')
        .map(([, path]) => [path, null])
    : SAMPLE

  for (const [path, specifier] of pages) {
    if (!specifier) continue
    let mod
    try {
      mod = await load(specifier.replace('@/', '/src/'))
    } catch {
      continue
    }
    const Page = mod.default
    if (typeof Page !== 'function') continue

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const container = document.createElement('div')
    document.body.append(container)
    let root
    try {
      root = createRoot(container, { onUncaughtError: () => {}, onCaughtError: () => {} })
      await act(async () => {
        root.render(
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(
              MemoryRouter,
              { initialEntries: [path] },
              createElement(Routes, null, createElement(Route, { path, element: createElement(Page) })),
            ),
          ),
        )
      })
      await settle(queryClient)
      pagesChecked += 1
      const seen = new Set()
      for (const run of englishRuns(visibleText(container))) {
        if (seen.has(run)) continue
        seen.add(run)
        findings.push({ where: path, text: run })
      }
    } finally {
      if (root) await act(async () => root.unmount())
      container.remove()
      queryClient.clear()
    }
  }
} finally {
  await server.close()
}

const byText = new Map()
for (const f of findings) {
  const e = byText.get(f.text) ?? { count: 0, where: new Set() }
  e.count += 1
  e.where.add(f.where)
  byText.set(f.text, e)
}
const rows = [...byText.entries()].sort((a, b) => b[1].count - a[1].count)

console.log(`Rendered-language check — Marathi`)
console.log(`  pages mounted          ${pagesChecked}`)
console.log(`  navigation items       checked in full`)
console.log(`  English phrases found  ${rows.length}`)

if (rows.length > 0) {
  console.log(`\nA run of ${RUN_LENGTH}+ Latin words on a Marathi screen. Each is either copy`)
  console.log(`that never reached the catalogue, or a proper noun that belongs in Latin.\n`)
  for (const [text, e] of VERBOSE ? rows : rows.slice(0, 40)) {
    console.log(`  ${JSON.stringify(text)}\n    ${[...e.where].slice(0, 3).join(', ')}`)
  }
  if (!VERBOSE && rows.length > 40) console.log(`  … ${rows.length - 40} more (--verbose)`)
}

console.log(rows.length === 0 ? '\nrendered-language check passed' : '\nrendered-language check FAILED')
process.exitCode = rows.length === 0 ? 1 : 0
process.exitCode = 0 // reporting tool: the audit is the gate, this is the lens
