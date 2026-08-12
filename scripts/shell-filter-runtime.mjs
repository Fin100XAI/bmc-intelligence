/**
 * Shell-level filter verification.
 *
 * `scripts/filter-runtime.mjs` mounts each page on its own and operates the
 * controls the PAGE renders. That leaves the controls the SHELL renders
 * untested - and the shell renders the one an operator reaches for first: the
 * ward context selector in the command bar.
 *
 * It was inert. `useContextStore.wardId` was read by exactly one screen in
 * ninety-one, so narrowing the interface to a ward at the top of the shell
 * changed a breadcrumb and left every figure underneath it city-wide. Nothing
 * caught it, because no harness had ever mounted a page inside the shell that
 * owns that control.
 *
 * This harness mounts the REAL `AppShell` with a real page routed underneath,
 * drives the real `<select>` in the command bar, and compares only what is
 * inside `#main-content` - so a change to the breadcrumb, the context bar or
 * the selector itself can never be mistaken for the data responding.
 *
 * Run: node scripts/shell-filter-runtime.mjs [pageNameSubstring]
 */
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { createHash } from 'node:crypto'

/* -- DOM environment ------------------------------------------------------ */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
for (const key of ['HTMLElement', 'Element', 'Node', 'SVGElement', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent']) {
  globalThis[key] = dom.window[key]
}
globalThis.getComputedStyle = dom.window.getComputedStyle
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.ResizeObserver = ObserverStub
dom.window.ResizeObserver = ObserverStub
globalThis.IntersectionObserver = ObserverStub
dom.window.IntersectionObserver = ObserverStub
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
})
dom.window.matchMedia = globalThis.matchMedia
globalThis.IS_REACT_ACT_ENVIRONMENT = false
dom.window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { width: 900, height: 320, top: 0, left: 0, bottom: 320, right: 900, x: 0, y: 0, toJSON: () => ({}) }
}
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 900 })
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 320 })

const realError = console.error
console.error = (...args) => {
  const first = String(args[0] ?? '')
  if (/not wrapped in act|useLayoutEffect does nothing|width\(0\)|cannot contain a nested/.test(first)) return
  realError(...args)
}

/* -- Module loading ------------------------------------------------------- */

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const load = (p) => server.ssrLoadModule(p)

const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const { MemoryRouter, Routes, Route } = await import('react-router-dom')
const h = React.createElement

const { useAuthStore } = await load('/src/stores/auth.store.ts')
const { DEMO_USERS } = await load('/src/auth/demo-users.ts')
const { useFilterStore, useContextStore } = await load('/src/stores/ui.store.ts')
const { AppShell } = await load('/src/layouts/AppShell.tsx')

/* -- Helpers -------------------------------------------------------------- */

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms))

/**
 * The command bar carries a live clock that re-renders every second, so the
 * shell's markup NEVER goes quiet. Settling is therefore judged on
 * `#main-content` alone - the clock is not in it.
 */
async function settle(container, { quietFor = 4, maxMs = 25000 } = {}) {
  const started = Date.now()
  let previous = null
  let quiet = 0
  while (Date.now() - started < maxMs) {
    await tick()
    const main = container.querySelector('#main-content')
    const current = main?.innerHTML ?? ''
    const pending = current.length === 0 || /role="status"|animate-pulse/.test(current)
    if (!pending && current === previous) {
      quiet += 1
      if (quiet >= quietFor) return true
    } else {
      quiet = 0
      previous = current
    }
  }
  return false
}

function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el)
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  descriptor.set.call(el, value)
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  el.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
}

/** Only the workspace. The shell's own chrome is deliberately excluded. */
function snapshot(container) {
  const main = container.querySelector('#main-content')
  if (!main) return { hash: 'no-main', length: 0 }
  const clone = main.cloneNode(true)
  for (const el of clone.querySelectorAll('[data-filter-surface]')) el.remove()
  const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
  return { hash: createHash('sha1').update(text).digest('hex').slice(0, 12), length: text.length }
}

class Boundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) return h('div', { 'data-render-error': '' }, String(this.state.error?.message ?? this.state.error))
    return this.props.children
  }
}

/**
 * Ward-aware screens: every routed page that reads the shared ward selection.
 * Kept as an explicit list so a page that stops reading it fails here rather
 * than quietly dropping out of the sweep.
 */
const PAGES = [
  'city/WaterIntelligencePage',
  'city/SewerageIntelligencePage',
  'city/StormWaterIntelligencePage',
  'city/RoadsIntelligencePage',
  'city/SolidWasteIntelligencePage',
  'city/HospitalIntelligencePage',
  'city/FireEmergencyPage',
  'city/DisasterIntelligencePage',
  'city/EnvironmentIntelligencePage',
  'city/HousingIntelligencePage',
  'city/StreetLightingPage',
  'city/GardensIntelligencePage',
  'city/CitizenRegistrationPage',
  'city/MarketsPage',
  'city/AnimalWelfarePage',
  'city/LivelihoodsPage',
  'city/SocialWelfarePage',
  'city/AmenitiesPage',
  'city/WardTrajectoryPage',
  'command/IntelligenceFeedPage',
]

const args = process.argv.slice(2)
const corpArg = args.find((a) => a.startsWith('--corp='))?.split('=')[1]
/**
 * `--every-ward` drives EVERY ward rather than stopping at the first that
 * changes the screen. Slower, and the only way to answer the question an
 * operator actually asks: not "does the filter work" but "does it work for the
 * ward I picked". A filter proven on Ward A and inert on the other nine is a
 * filter that does not work.
 */
const everyWard = args.includes('--every-ward')
const only = args.find((a) => !a.startsWith('--'))
const targets = only ? PAGES.filter((p) => p.toLowerCase().includes(only.toLowerCase())) : PAGES

if (corpArg) {
  const { useCorporationStore } = await load('/src/stores/corporation.store.ts')
  useCorporationStore.getState().setCorporation(corpArg)
  const { activeCorporation } = await load('/src/config/municipality.config.ts')
  if (activeCorporation.id !== corpArg) {
    console.error(`No such corporation: ${corpArg}`)
    await server.close()
    process.exit(1)
  }
  console.log(`Deployment: ${activeCorporation.shortName} - ${activeCorporation.city}\n`)
}

// Signed in AFTER the corporation switch: the demonstration profiles are
// rebuilt per corporation, and a principal carrying the previous tenant is
// filtered to zero rows by `scopeToTenant` with nothing to explain why.
useAuthStore.getState().signIn(DEMO_USERS.find((u) => u.roleId === 'municipal-commissioner').id)

const results = []

for (const path of targets) {
  // Every run starts from an unfiltered platform.
  useFilterStore.getState().resetFilters()
  useContextStore.getState().reset()

  let Page
  try {
    const mod = await load(`/src/pages/${path}.tsx`)
    Page = mod.default ?? Object.values(mod).find((v) => typeof v === 'function')
  } catch (error) {
    results.push({ path, status: 'LOAD-FAIL', detail: error.message.slice(0, 90) })
    continue
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } })
  const root = createRoot(container)
  root.render(
    h(
      Boundary,
      null,
      h(
        QueryClientProvider,
        { client: queryClient },
        h(
          MemoryRouter,
          { initialEntries: ['/'] },
          h(Routes, null, h(Route, { path: '/', element: h(AppShell) }, h(Route, { index: true, element: h(Page) }))),
        ),
      ),
    ),
  )

  const settledBefore = await settle(container)
  const failed = container.querySelector('[data-render-error]')
  if (failed) {
    results.push({ path, status: 'RENDER-ERR', detail: failed.textContent.slice(0, 90) })
    root.unmount()
    container.remove()
    continue
  }

  const select = container.querySelector('select[aria-label="Select ward context"]')
  if (!select) {
    results.push({ path, status: 'NO-CONTROL', detail: 'command bar rendered no ward context selector' })
    root.unmount()
    container.remove()
    continue
  }

  const before = snapshot(container)

  // Every ward is tried, not only the first. A ward that happens to hold no
  // record on this screen narrows the page to the same empty state the
  // unfiltered view would show only if the page were already empty - trying
  // one ward alone would report a working filter as inert.
  const wardValues = [...select.options].map((o) => o.value).filter(Boolean)
  let changed = false
  let settledAfter = true
  /** Distinct workspace renderings, keyed by hash, so wards can be compared. */
  const byHash = new Map()
  const inertWards = []

  for (const value of wardValues) {
    const live = container.querySelector('select[aria-label="Select ward context"]')
    if (!live) break
    setNativeValue(live, value)
    settledAfter = await settle(container)
    if (!settledAfter) break
    const after = snapshot(container)
    if (after.hash !== before.hash) {
      changed = true
      if (!byHash.has(after.hash)) byHash.set(after.hash, [])
      byHash.get(after.hash).push(value)
    } else {
      inertWards.push(value)
    }

    if (!everyWard && changed) {
      results.push({ path, status: 'ok', detail: `${before.length} → ${after.length} chars via ${value}`, wards: wardValues.length })
      break
    }

    // Back to city-wide before trying the next ward.
    const reset = container.querySelector('select[aria-label="Select ward context"]')
    if (reset) setNativeValue(reset, '')
    await settle(container)
  }

  if (everyWard && settledAfter) {
    /**
     * Two separate failures are possible once every ward is driven, and they
     * are not the same defect:
     *   - a ward that renders the CITY-WIDE view (the filter did not apply);
     *   - several wards that render the SAME view as each other (the filter
     *     applied, but the screen does not distinguish them).
     * Both read to an operator as "the data did not change for my ward".
     */
    const distinct = byHash.size
    const ok = inertWards.length === 0 && distinct >= Math.max(2, Math.ceil(wardValues.length * 0.6))
    results.push({
      path,
      status: ok ? 'ok' : inertWards.length > 0 ? 'INERT-WARDS' : 'LOW-VARIANCE',
      detail:
        `${wardValues.length} wards → ${distinct} distinct views` +
        (inertWards.length > 0 ? `; ${inertWards.length} showed the city-wide view: ${inertWards.slice(0, 6).join(', ')}` : ''),
      wards: wardValues.length,
    })
  } else if (!changed) {
    results.push({
      path,
      status: !settledBefore || !settledAfter ? 'INCONCLUSIVE' : 'INERT',
      detail: !settledBefore || !settledAfter
        ? 'page never finished rendering'
        : `no ward of ${wardValues.length} changed the workspace`,
    })
  }

  root.unmount()
  container.remove()
}

/* -- Output --------------------------------------------------------------- */

const width = Math.max(...results.map((r) => r.path.length))
let failures = 0
for (const r of results) {
  const ok = r.status === 'ok'
  if (!ok) failures += 1
  console.log(`${ok ? '  ✓ ' : '  ✗ '}${r.path.padEnd(width)}  ${r.status.padEnd(12)} ${r.detail ?? ''}`)
}

console.log(
  failures === 0
    ? `\n${results.length}/${results.length} ward-aware pages respond to the command bar ward context.`
    : `\n${results.length - failures}/${results.length} respond; ${failures} do not.`,
)

await server.close()
process.exit(failures > 0 ? 1 : 0)
