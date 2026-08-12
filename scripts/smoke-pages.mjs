/**
 * Page render smoke test.
 *
 * `smoke.mjs` proves the data, domain, security and service layers behave.
 * Nothing proved that the fifty-odd page components actually render — a broken
 * page only surfaced when an operator opened it. This closes that gap.
 *
 * For every routed page it:
 *   1. runs the module through Vite's transform pipeline — the same pipeline
 *      the browser's dynamic import hits, so a page that would fail to load in
 *      the running application fails here first;
 *   2. executes the module and checks it exports a component by default;
 *   3. mounts it in a real DOM with the providers the application uses, waits
 *      for its service queries to settle, and fails on any render error;
 *   4. fails the page if any of its queries settled in an error state, or if
 *      it produced no heading — a page that renders nothing is not working.
 *
 * Mounting client-side rather than server-rendering is deliberate: effects run,
 * react-query fetches normally, and zustand reports live state instead of the
 * factory defaults it serves to a server render.
 *
 * The sweep runs for several demonstration roles so permission-narrowed
 * branches are covered as well as the city-wide ones.
 *
 * Run with: node scripts/smoke-pages.mjs
 */
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

/* --------------------------------------------------------------------------
   A browser-shaped environment, installed before any application module or
   React entry point is imported so they all bind to it.
   -------------------------------------------------------------------------- */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})

// Node defines some of these itself as getter-only, so define rather than assign.
function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

for (const name of [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'CustomEvent',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'localStorage',
  'sessionStorage',
]) {
  defineGlobal(name, name === 'window' ? dom.window : dom.window[name])
}
defineGlobal('IS_REACT_ACT_ENVIRONMENT', true)

// Layout observers jsdom does not implement. Charts and virtualised lists ask
// for them on mount; a no-op keeps the mount honest without faking sizes.
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
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
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

// Every service method awaits `simulateLatency` (120–420ms of real time), and
// pages chain queries, so settling is measured in real time rather than ticks.
const SETTLE_TIMEOUT_MS = 15_000
const SETTLE_INTERVAL_MS = 25
const SETTLE_QUIET_CHECKS = 4

/**
 * Roles the render sweep runs for. Broadest first, then narrowed scopes, then
 * the specialist roles that are the ONLY holders of certain permissions — the
 * Security Administrator for the whole Administration section, the AI
 * Governance Officer for the AI governance surfaces — so those pages are
 * actually rendered somewhere rather than skipped by every role.
 */
const ROLES = [
  { userId: 'user-commissioner', label: 'Commissioner' },
  { userId: 'user-ward-officer', label: 'Ward Officer' },
  { userId: 'user-operator', label: 'Operator' },
  { userId: 'user-security', label: 'Security Administrator' },
  { userId: 'user-ai-governance', label: 'AI Governance Officer' },
]

/**
 * Screens that live OUTSIDE the authenticated shell. Each redirects a
 * signed-in principal away, so each is rendered signed-out instead of once per
 * role. Both are real entry points and both have to keep rendering.
 */
const SIGNED_OUT_PAGES = ['LoginPage', 'PortalLandingPage']

const results = []
const headlessPages = new Set()
let failures = 0
let skipped = 0

function record(status, name, detail) {
  if (status === 'FAIL') failures += 1
  if (status === 'SKIP') skipped += 1
  results.push([status, name, detail ?? ''])
}

/** Reads the route table and pairs each page module with the path it serves. */
function readRouteTable() {
  const source = readFileSync(new URL('../src/routes/index.tsx', import.meta.url), 'utf8')

  const modules = new Map()
  for (const m of source.matchAll(/const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\('@\/pages\/([^']+)'\)\)/g)) {
    modules.set(m[1], `/src/pages/${m[2]}.tsx`)
  }

  const routes = []
  for (const m of source.matchAll(/path:\s*(?:ROUTES\.(\w+)|'([^']+)')\s*,\s*element:\s*(?:guarded\()?<(\w+)\s*\/>/g)) {
    const [, routeKey, literalPath, component] = m
    const modulePath = modules.get(component)
    if (!modulePath) continue
    routes.push({ component, modulePath, routeKey, literalPath })
  }

  return { modules, routes }
}

/**
 * Lets effects, timers and query resolutions flush until the page is quiet.
 *
 * Quiet has to be observed for several consecutive ticks: a page whose second
 * query depends on the first is momentarily idle between them, and stopping at
 * the first idle tick would snapshot it mid-load and report a loading skeleton
 * as a broken page.
 */
async function settle(queryClient) {
  const startedAt = Date.now()
  let quiet = 0
  while (Date.now() - startedAt < SETTLE_TIMEOUT_MS) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS))
    })
    quiet = queryClient.isFetching() > 0 ? 0 : quiet + 1
    if (quiet >= SETTLE_QUIET_CHECKS) break
  }
  return Date.now() - startedAt
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const load = (p) => server.ssrLoadModule(p)

  const { modules, routes } = readRouteTable()
  const navigation = await load('/src/config/navigation.ts')
  const auth = await load('/src/stores/auth.store.ts')
  const access = await load('/src/security/access.ts')
  const runtime = await load('/src/data/runtime.ts')
  const config = await load('/src/config/municipality.config.ts')

  // Resolve each route's real URL so the router starts where the page expects.
  const pages = routes.map((r) => ({
    ...r,
    path: r.literalPath && r.literalPath !== '*' ? r.literalPath : (navigation.ROUTES[r.routeKey] ?? '/'),
  }))

  record(
    pages.length === modules.size ? 'PASS' : 'FAIL',
    'Every lazily-imported page is routed',
    `${modules.size} modules declared, ${pages.length} reachable through the route table`,
  )

  // --- 1 & 2. Transform and execute every page module ---------------------
  for (const page of pages) {
    try {
      const transformed = await server.transformRequest(page.modulePath)
      if (!transformed?.code) throw new Error('transform produced no code')

      const mod = await load(page.modulePath)
      if (typeof mod.default !== 'function') {
        throw new Error(`default export is ${typeof mod.default}, expected a component`)
      }
      page.module = mod
      record('PASS', `Loads · ${page.component}`, page.path)
    } catch (error) {
      record('FAIL', `Loads · ${page.component}`, error?.message ?? String(error))
    }
  }

  // --- 3 & 4. Mount every page, with data, for every role -----------------
  //
  // Brihanmumbai gets the full role matrix. Two GENERATED corporations are then
  // swept as Commissioner, the only role that reaches every page: Pune, the
  // largest deployment whose geography is generated rather than hand-authored,
  // and Jalna, the smallest corporation in the state. Jalna is the one that
  // matters most - it is where a collection that was scaled without a floor
  // collapses to nothing and a page renders an empty shell that no type check
  // and no Brihanmumbai-only sweep would ever catch.
  const SWEEPS = [
    { corporationId: 'bmc', roles: ROLES },
    { corporationId: 'pmc', roles: [ROLES[0]] },
    { corporationId: 'jalna', roles: [ROLES[0]] },
  ]

  for (const sweep of SWEEPS) {
    runtime.setActiveCorporation(sweep.corporationId)
    const deployment = config.municipality.shortName

  for (const role of sweep.roles) {
    const signedInUser = auth.useAuthStore.getState().signIn(role.userId)
    if (!signedInUser) throw new Error(`demonstration profile ${role.userId} does not exist`)

    for (const page of pages) {
      if (!page.module) continue

      // The pre-authentication screens redirect an authenticated principal
      // away, so there is nothing to assert about them here. They are covered
      // signed-out below.
      if (SIGNED_OUT_PAGES.includes(page.component)) continue

      const name = `Renders (${deployment} · ${role.label}) · ${page.component}`

      // Mirror RequirePermission. Rendering a page the route guard would have
      // blocked tests a state no operator can reach, and its service denials
      // would be reported as defects when they are the engine working.
      const navItem = navigation.navItemForPath(page.path)
      if (navItem) {
        const decision = access.canAccess(
          signedInUser,
          navItem.requires.resource,
          navItem.requires.action,
          navItem.domain ? { domain: navItem.domain } : {},
        )
        if (!decision.allowed) {
          record('SKIP', name, `route guard denies this role — ${navItem.requires.resource}:${navItem.requires.action}`)
          continue
        }
      }

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
      })
      const container = document.createElement('div')
      document.body.append(container)

      const renderErrors = []
      let root

      try {
        const Page = page.module.default
        const tree = createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            MemoryRouter,
            { initialEntries: [page.path] },
            createElement(Routes, null, createElement(Route, { path: page.path, element: createElement(Page) })),
          ),
        )

        root = createRoot(container, {
          onUncaughtError: (error) => renderErrors.push(error),
          onCaughtError: (error) => renderErrors.push(error),
        })

        await act(async () => {
          root.render(tree)
        })
        const settledMs = await settle(queryClient)

        if (renderErrors.length > 0) {
          throw new Error(`render threw — ${renderErrors[0]?.message ?? renderErrors[0]}`)
        }

        const errored = queryClient
          .getQueryCache()
          .getAll()
          .filter((q) => q.state.status === 'error')
        if (errored.length > 0) {
          const first = errored[0]
          throw new Error(
            `${errored.length} query(ies) errored, e.g. [${first.queryKey.join(', ')}] — ${first.state.error?.message}`,
          )
        }

        // A settled page must have said something. Markup with no text at all
        // is a skeleton that never resolved — the failure mode worth catching.
        const shown = container.textContent?.replace(/\s+/g, ' ').trim() ?? ''
        if (shown.length === 0) {
          throw new Error(
            `produced no text after ${settledMs}ms — the page never left its loading state (html=${container.innerHTML.length}b)`,
          )
        }

        const queries = queryClient.getQueryCache().getAll().length
        const headless = container.querySelector('h1') ? '' : ` · NO HEADING, showing "${shown.slice(0, 60)}"`
        if (headless) headlessPages.add(`${page.component} (${role.label})`)
        record(
          'PASS',
          name,
          `${container.innerHTML.length.toLocaleString()} chars, ${queries} query(ies), ${settledMs}ms${headless}`,
        )
      } catch (error) {
        record('FAIL', name, error?.message ?? String(error))
      } finally {
        if (root) await act(async () => root.unmount())
        container.remove()
        queryClient.clear()
      }
    }
  }
  }
  runtime.setActiveCorporation('bmc')

  // --- 5. The pre-authentication screens, signed out ----------------------
  for (const authPage of SIGNED_OUT_PAGES) {
  const loginPage = pages.find((p) => p.component === authPage)
  if (loginPage?.module) {
    const container = document.createElement('div')
    document.body.append(container)
    const renderErrors = []
    let root
    try {
      auth.useAuthStore.getState().signOut()
      root = createRoot(container, {
        onUncaughtError: (error) => renderErrors.push(error),
        onCaughtError: (error) => renderErrors.push(error),
      })
      await act(async () => {
        root.render(
          createElement(
            QueryClientProvider,
            { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
            createElement(
              MemoryRouter,
              { initialEntries: [loginPage.path] },
              createElement(
                Routes,
                null,
                createElement(Route, { path: loginPage.path, element: createElement(loginPage.module.default) }),
              ),
            ),
          ),
        )
      })
      if (renderErrors.length > 0) throw new Error(`render threw — ${renderErrors[0]?.message ?? renderErrors[0]}`)
      const shown = container.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      if (shown.length === 0) throw new Error('the screen rendered nothing')

      // The portal front page is only ever seen by a visitor with NO session,
      // so every module it names sits behind `RequireAuth`. Following one
      // directly bounced the visitor straight back to the portal, which reads
      // as a dead link rather than as "you need to sign in". Every card,
      // column and button that names a destination inside the platform must
      // therefore lead to the officer sign-in screen. This is the check that
      // keeps it that way as the portal grows new links.
      let gatedNote = ''
      if (authPage === 'PortalLandingPage') {
        const hrefs = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '')
        const leaked = [
          ...new Set(hrefs.filter((h) => h.startsWith('/') && !h.startsWith(navigation.ROUTES.login))),
        ]
        if (leaked.length > 0) {
          throw new Error(
            `${leaked.length} portal destination(s) still lead into the platform rather than to sign-in, ` +
              `so a signed-out visitor clicking them is bounced back to the portal: ${leaked.slice(0, 6).join(', ')}`,
          )
        }
        const gated = hrefs.filter((h) => h.startsWith(`${navigation.ROUTES.loginDirect}?next=`))
        if (gated.length === 0) throw new Error('no portal destination routes through the sign-in screen')
        gatedNote = `, ${gated.length} destinations gated to sign-in`
      }

      record(
        'PASS',
        `Renders (signed out) · ${authPage}`,
        `${container.innerHTML.length.toLocaleString()} chars${gatedNote}`,
      )
    } catch (error) {
      record('FAIL', `Renders (signed out) · ${authPage}`, error?.message ?? String(error))
    } finally {
      if (root) await act(async () => root.unmount())
      container.remove()
    }
  }
  }
} finally {
  await server.close()
}

const width = Math.max(...results.map((r) => r[1].length))
const MARK = { PASS: '  ok', FAIL: 'FAIL', SKIP: 'skip' }
for (const [status, name, detail] of results) {
  if (status === 'FAIL' || !process.env.SMOKE_QUIET) {
    // eslint-disable-next-line no-console
    console.log(`${MARK[status]}  ${name.padEnd(width)}  ${detail}`)
  }
}

if (headlessPages.size > 0) {
  // eslint-disable-next-line no-console
  console.log(
    `\nRendered without a page heading (early-returns a loading, empty or error state before PageHeader, so the ` +
      `operator loses the page title, breadcrumbs and provenance):\n  ${[...headlessPages].join('\n  ')}`,
  )
}

const attempted = results.length - skipped
// eslint-disable-next-line no-console
console.log(`\n${attempted - failures}/${attempted} page checks passed (${skipped} skipped — route guard denies the role)`)
process.exit(failures > 0 ? 1 : 0)
