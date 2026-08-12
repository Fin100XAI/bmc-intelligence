/**
 * Functional filter verification.
 *
 * Static analysis can only show that a page *reads* filter state. It cannot
 * show that the state reaches the rendered rows. This harness mounts each page
 * for real in jsdom, snapshots what it renders, operates a filter control the
 * way an operator would — a real click on a real checkbox, a real keystroke in
 * the search box — and compares. If the rendered data is byte-identical
 * afterwards, that filter is inert regardless of how well-wired it looks.
 *
 * Only controls the page actually renders are exercised, so a page is never
 * faulted for ignoring a filter it never offered. The filter controls
 * themselves (`[data-filter-surface]`) are stripped before hashing, so a chip
 * appearing is never mistaken for the data responding.
 *
 * Run: node scripts/filter-runtime.mjs [pageNameSubstring]
 */
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

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
// Node 21+ defines `navigator` as a getter-only global; redefine rather than assign.
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

// Recharts measures its container; jsdom reports zero for everything, which
// makes charts render empty. Give every element a real box so charts draw.
dom.window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { width: 900, height: 320, top: 0, left: 0, bottom: 320, right: 900, x: 0, y: 0, toJSON: () => ({}) }
}
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 900 })
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 320 })

const realError = console.error
console.error = (...args) => {
  const first = String(args[0] ?? '')
  if (process.env.QUIET !== '0' && /not wrapped in act|useLayoutEffect does nothing on the server|width\(0\) and height\(0\)/.test(first)) return
  realError(...args)
}

/* -- Module loading ------------------------------------------------------- */

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const load = (p) => server.ssrLoadModule(p)

// Vite externalises node_modules for SSR, so the pages resolve these to the
// very same instances imported here. Hooks would throw otherwise.
const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const { MemoryRouter } = await import('react-router-dom')

const { useAuthStore } = await load('/src/stores/auth.store.ts')
const { useFilterStore, useContextStore, useLayoutStore } = await load('/src/stores/ui.store.ts')
const { useApplyPreferences, usePreferencesStore } = await load('/src/stores/preferences.store.ts')
const { DEMO_USERS } = await load('/src/auth/demo-users.ts')

/**
 * Sign in as the widest-scoped principal for the page under test, so that ABAC
 * narrowing never masks a filter that does work. Administration screens are
 * deliberately closed to the Commissioner, so those need the administrator.
 */
function signInAs(roleId) {
  const user = DEMO_USERS.find((u) => u.roleId === roleId)
  if (!user) throw new Error(`no demonstration profile holds the role ${roleId}`)
  useAuthStore.getState().signIn(user.id)
}

const h = React.createElement

class Boundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return h('div', { 'data-render-error': '' }, String(this.state.error?.message ?? this.state.error))
    }
    return this.props.children
  }
}

/* -- Interaction helpers -------------------------------------------------- */

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms))

/**
 * Services simulate 120–420ms of network latency, so a few microtasks are not
 * enough. Wait until the rendered markup stops changing, rather than guessing
 * a fixed delay — a page compared while still resolving would show every
 * filter as inert.
 */
async function settle(container, { quietFor = 4, maxMs = 30000 } = {}) {
  const started = Date.now()
  let previous = null
  let quiet = 0
  while (Date.now() - started < maxMs) {
    await tick()
    const current = container.innerHTML
    // `createRoot().render` commits asynchronously and the first paint is a
    // skeleton. An empty container, or one still showing a loading role, is
    // not yet settled.
    const pending = current.length === 0 || /role="status"|animate-pulse/.test(current)
    if (!pending && current === previous) {
      quiet += 1
      if (quiet >= quietFor) return true
    } else {
      quiet = 0
      previous = current
    }
  }
  // Timed out. The caller MUST treat this as inconclusive rather than
  // comparing snapshots of a page that is still resolving - that is how a
  // slow machine turns into a phantom "this filter is inert".
  return false
}

const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))

/** React tracks the last value on the node, so a plain assignment is ignored. */
function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el)
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  descriptor.set.call(el, value)
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  el.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
}

/**
 * Everything the operator would read as "the data", with the filter controls
 * removed. Row counts matter most: fewer rows after narrowing is the signal.
 */
function snapshot(container) {
  const clone = container.cloneNode(true)
  for (const el of clone.querySelectorAll('[data-filter-surface]')) el.remove()
  const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
  const rows =
    container.querySelectorAll('tbody tr').length +
    container.querySelectorAll('[data-row]').length +
    container.querySelectorAll('li').length

  /**
   * Some controls are not meant to change the page's own markup, and faulting
   * them for that would be wrong. Display density, contrast and motion are
   * applied to the ROOT element, because they govern the whole interface rather
   * than one screen; the navigation-rail preference is applied to the layout
   * store, because the rail lives in the shell and not in any page. Each of
   * those is still a visible, verifiable effect - it simply is not inside the
   * container - so the snapshot reaches out and includes it. A control that
   * changes none of the four, and none of the markup, really is inert.
   */
  const root = document.documentElement
  const globalEffect = [
    root.style.fontSize,
    root.dataset.density ?? '',
    root.dataset.contrast ?? '',
    root.dataset.motion ?? '',
    String(useLayoutStore.getState().sidebarCollapsed),
  ].join('|')

  return {
    hash: createHash('sha1').update(`${text}##${globalEffect}`).digest('hex').slice(0, 12),
    length: text.length,
    rows,
  }
}

const BASELINE = {
  dateRange: '30d',
  wardIds: [],
  departmentIds: [],
  domains: [],
  severities: [],
  statuses: [],
  search: '',
}

/* -- Discovering which controls a page actually offers -------------------- */

const PANEL_LABELS = ['Ward', 'Department', 'Domain', 'Severity', 'Status']

function filterBar(container) {
  return container.querySelector('[data-filter-surface="bar"]')
}

/**
 * Builds one interaction per control the page renders. Each returns a label
 * and a function that operates the control as a user would.
 */
function discoverControls(container) {
  const bar = filterBar(container)
  if (!bar) return []
  const controls = []

  // Elements are looked up again at run time, never captured here: React
  // replaces nodes between renders, and driving a detached node would report a
  // working filter as inert.
  const dateSelect = bar.querySelector('select')
  if (dateSelect) {
    const other = [...dateSelect.options].map((o) => o.value).find((v) => v !== dateSelect.value)
    if (other) {
      controls.push({
        label: `date → ${other}`,
        run: async () => {
          const el = filterBar(container)?.querySelector('select')
          if (!el) return 'date control disappeared'
          setNativeValue(el, other)
          return null
        },
      })
    }
  }

  for (const label of PANEL_LABELS) {
    const present = [...bar.querySelectorAll('button')].some((b) => (b.textContent ?? '').trim().startsWith(label))
    if (!present) continue
    controls.push({
      label: `${label.toLowerCase()} → first option`,
      run: async () => {
        const live = filterBar(container)
        const button = [...live.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim().startsWith(label))
        if (!button) return `${label} control disappeared`
        click(button)
        await tick()
        const box = filterBar(container)?.querySelector('input[type="checkbox"]')
        if (!box) return `no options rendered in the ${label} panel`
        click(box)
        await tick()
        // Close the panel so it does not overlay the next interaction.
        // The bar can be unmounted while a refetch is in flight, so wait for
        // it to come back before trying to close the panel.
        await settle(container)
        const reopened = [...(filterBar(container)?.querySelectorAll('button') ?? [])].find((b) =>
          (b.textContent ?? '').trim().startsWith(label),
        )
        if (reopened) click(reopened)
        return null
      },
    })
  }

  if (bar.querySelector('input:not([type="checkbox"])')) {
    // A term that cannot match any record. A working search must empty the
    // list; a common word would leave most rows in place and a genuinely
    // inert box would be indistinguishable from a correct one.
    controls.push({
      label: 'search → "zzqqxx" (no match)',
      run: async () => {
        const el = filterBar(container)?.querySelector('input:not([type="checkbox"])')
        if (!el) return 'search control disappeared'
        setNativeValue(el, 'zzqqxx')
        return null
      },
    })
  }

  return controls
}

/**
 * Controls that are genuinely not filters on the data the page renders, and
 * are therefore not faults when the page does not change.
 *
 * Kept as an explicit, reasoned list rather than a loose heuristic: the whole
 * value of this harness is that it cannot be quieted without someone writing
 * down why, in the file, where the next person will read it.
 */
const NOT_DATA_FILTERS = new Map([
  [
    'Default landing page',
    'chooses where the operator arrives at next sign-in. It cannot change the page it is set on, and would be wrong to.',
  ],
])

/**
 * Controls that ARE filters, work exactly as written, and cannot be proven on
 * the page they sit on in THIS build - because the register they narrow is
 * shorter than the narrowing.
 *
 * Keyed `page::control`, and held to the same standard as the list above: an
 * entry has to name the register and say why it is too short, so that the
 * moment the register grows again the entry reads as obviously stale. This is
 * the only way a control leaves the gate unproven without failing it.
 */
const CANNOT_BIND_HERE = new Map([
  [
    'admin/SettingsPage::Rows per table',
    'paginates the municipal corporation deployments table, the one register on this page. ' +
      'This build is scoped to Brihanmumbai alone, so that table is one row long and no page ' +
      'size can trim it. The preference itself is unchanged and still applies to every paginated ' +
      'register in the platform.',
  ],
])

/**
 * Controls a page rolls itself: plain <select> dropdowns and segmented
 * controls outside the shared filter bar. Each is driven to a value it does
 * not currently hold, which is exactly what an operator would do.
 */
function discoverLocalControls(container) {
  const controls = []

  const selects = [...container.querySelectorAll('select')].filter((el) => !el.closest('[data-filter-surface]'))
  selects.forEach((el, index) => {
    const label =
      el.getAttribute('aria-label') ??
      container.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ??
      el.getAttribute('name') ??
      `select ${index + 1}`
    const alternatives = [...el.options].map((o) => o.value).filter((v) => v !== el.value)
    if (alternatives.length === 0) return
    if (NOT_DATA_FILTERS.has(label.trim())) return
    controls.push({
      label: `${label.slice(0, 30)}`,
      // Every option is tried, not just the first. A filter whose first option
      // happens to match every row (all demonstration accounts are "active",
      // for instance) would otherwise read as inert when it is merely
      // undiscriminating for that one value.
      options: alternatives.slice(0, 10),
      run: async (value) => {
        const live = [...container.querySelectorAll('select')].filter((e) => !e.closest('[data-filter-surface]'))[index]
        if (!live) return 'control disappeared'
        setNativeValue(live, value)
        return null
      },
    })
  })

  const tablists = [...container.querySelectorAll('[role="tablist"]')]
  tablists.forEach((list, index) => {
    const inactive = [...list.querySelectorAll('[role="tab"]')].filter(
      (t) => t.getAttribute('aria-selected') !== 'true',
    )
    if (inactive.length === 0) return
    const name = list.getAttribute('aria-label') ?? `tablist ${index + 1}`
    const labels = inactive.map((t) => (t.textContent ?? '').trim())

    // Every inactive segment is tried, not just the first - the same reason the
    // selects above try every option. A segmented control whose first
    // alternative happens to select exactly the rows already on screen is not
    // inert, it is undiscriminating for that one value, and the next value is
    // what proves it. Benchmarking's peer band is the case in point: the only
    // corporation in the roster sits in the largest band, so narrowing to that
    // band changes nothing and narrowing to any other band empties the table.
    //
    // Labels are the option values because that is what an operator clicks.
    // Where a control's segments are unlabelled or repeat a label, there is
    // nothing to address them by, and the old behaviour - click the first
    // inactive segment - is used instead.
    const addressable =
      labels.length > 0 && labels.every((l) => l.length > 0) && new Set(labels).size === labels.length

    controls.push({
      label: addressable ? name : `${name} → ${labels[0]?.slice(0, 20) || 'next'}`,
      options: addressable ? labels.slice(0, 10) : undefined,
      run: async (value) => {
        const live = [...container.querySelectorAll('[role="tablist"]')][index]
        if (!live) return 'control disappeared'
        const tabs = [...live.querySelectorAll('[role="tab"]')]
        const tab =
          value === null || value === undefined
            ? tabs.find((t) => t.getAttribute('aria-selected') !== 'true')
            : tabs.find(
                (t) => (t.textContent ?? '').trim() === value && t.getAttribute('aria-selected') !== 'true',
              )
        if (!tab) return 'no inactive option'
        click(tab)
        return null
      },
    })
  })

  // Standalone checkboxes — layer toggles, entity-kind filters and the like.
  const boxes = [...container.querySelectorAll('input[type="checkbox"]')].filter(
    (el) => !el.closest('[data-filter-surface]'),
  )
  boxes.slice(0, 3).forEach((el, index) => {
    const name = (el.closest('label')?.textContent ?? `checkbox ${index + 1}`).trim().slice(0, 24)
    controls.push({
      label: `toggle "${name}"`,
      run: async () => {
        const live = [...container.querySelectorAll('input[type="checkbox"]')].filter(
          (e) => !e.closest('[data-filter-surface]'),
        )[index]
        if (!live) return 'control disappeared'
        click(live)
        return null
      },
    })
  })

  // Buttons that report a pressed state are acting as filters too.
  const pressed = [...container.querySelectorAll('button[aria-pressed]')].filter(
    (el) => !el.closest('[data-filter-surface]'),
  )
  pressed.slice(0, 3).forEach((el, index) => {
    const name = (el.textContent ?? `toggle ${index + 1}`).trim().slice(0, 24)
    controls.push({
      label: `press "${name}"`,
      run: async () => {
        const live = [...container.querySelectorAll('button[aria-pressed]')].filter(
          (e) => !e.closest('[data-filter-surface]'),
        )[index]
        if (!live) return 'control disappeared'
        click(live)
        return null
      },
    })
  })

  return controls
}

/* -- Pages ---------------------------------------------------------------- */

/** `as` names the principal to sign in with; administration is closed to the Commissioner. */
const ADMIN = 'security-administrator'
const PAGES = [
  { path: 'command/IntelligenceFeedPage' },
  { path: 'command/AlertsPage' },
  { path: 'command/DecisionCentrePage' },
  { path: 'city/CoastalIntelligencePage' },
  { path: 'city/DisasterIntelligencePage' },
  { path: 'city/EnvironmentIntelligencePage' },
  { path: 'city/FireEmergencyPage' },
  { path: 'city/HospitalIntelligencePage' },
  { path: 'city/RoadsIntelligencePage' },
  { path: 'city/SewerageIntelligencePage' },
  { path: 'city/SolidWasteIntelligencePage' },
  { path: 'city/StormWaterIntelligencePage' },
  // The obligatory services beyond engineering and finance. Every one of these
  // is a Twelfth Schedule duty, and every one of them carries the shared
  // filter bar, so generic discovery operates them without special handling.
  { path: 'city/EducationIntelligencePage' },
  { path: 'city/HousingIntelligencePage' },
  { path: 'city/StreetLightingPage' },
  { path: 'city/GardensIntelligencePage' },
  { path: 'city/CitizenRegistrationPage' },
  { path: 'city/DeathcarePage' },
  { path: 'city/MarketsPage' },
  { path: 'city/AnimalWelfarePage' },
  { path: 'city/LivelihoodsPage' },
  { path: 'city/SocialWelfarePage' },
  { path: 'city/AmenitiesPage' },
  { path: 'governance/LicensingIntelligencePage' },
  // Registry reconciliation. All three carry a plain ward select in the page
  // header, so generic discovery operates them without special handling.
  { path: 'governance/RevenueReconciliationPage' },
  { path: 'governance/RecoveryWorklistPage' },
  { path: 'governance/RecoveryPilotPage' },
  { path: 'council/CouncilResolutionsPage' },
  { path: 'strategic/BenchmarkingPage' },
  // Ward decision surfaces. Each renders its own controls - a metric selector,
  // a ward selector, a cohort or standing filter - rather than the shared bar.
  { path: 'city/WardLeaguePage' },
  { path: 'city/WardEquityPage' },
  { path: 'city/WardTrajectoryPage' },
  { path: 'city/WardCommitmentsPage' },
  { path: 'city/WardPerformancePage' },
  // Pages that roll their own controls instead of the shared filter bar.
  {
    path: 'city/MonsoonIntelligencePage',
    // The scenario tool is neither a select nor a checkbox: it is a set of
    // range inputs committed by an explicit "Run Scenario" press, plus preset
    // buttons that commit immediately. Generic discovery cannot infer that
    // sequence, so it is spelled out.
    extra: (container) => {
      const byText = (text) =>
        [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === text)
      const presets = [...container.querySelectorAll('button')].filter((b) =>
        /rain|tide|cloudburst|baseline|normal/i.test((b.textContent ?? '').trim()),
      )
      const controls = []
      if (presets.length > 1) {
        controls.push({
          label: `scenario preset → "${(presets[1].textContent ?? '').trim().slice(0, 24)}"`,
          run: async () => {
            const live = [...container.querySelectorAll('button')].filter((b) =>
              /rain|tide|cloudburst|baseline|normal/i.test((b.textContent ?? '').trim()),
            )[1]
            if (!live) return 'preset disappeared'
            click(live)
            return null
          },
        })
      }
      if (container.querySelector('input[type="range"]') && byText('Run Scenario')) {
        controls.push({
          label: 'rainfall slider + Run Scenario',
          run: async () => {
            const slider = container.querySelector('input[type="range"]')
            if (!slider) return 'slider disappeared'
            setNativeValue(slider, String(Math.min(Number(slider.max), Number(slider.value) + 250)))
            await tick()
            const run = byText('Run Scenario')
            if (!run) return 'Run Scenario button not found'
            click(run)
            return null
          },
        })
      }
      return controls
    },
  },
  { path: 'city/WardIntelligencePage' },
  { path: 'city/WaterIntelligencePage' },
  { path: 'city/TrafficIntelligencePage' },
  { path: 'city/PublicHealthPage' },
  { path: 'command/CommissionerCockpitPage' },
  { path: 'command/ExecutiveOverviewPage' },
  { path: 'command/SituationRoomPage' },
  { path: 'governance/AssetIntelligencePage' },
  { path: 'governance/BuildingIntelligencePage' },
  { path: 'governance/ProjectIntelligencePage' },
  { path: 'governance/PropertyIntelligencePage' },
  { path: 'governance/RevenueIntelligencePage' },
  { path: 'governance/BudgetIntelligencePage' },
  { path: 'governance/ProcurementIntelligencePage' },
  { path: 'strategic/DigitalTwinPage' },
  { path: 'strategic/KnowledgeGraphPage' },
  { path: 'strategic/UrbanPlanningPage' },
  { path: 'ai/AIIntelligenceCentrePage' },
  { path: 'ai/ModelRegistryPage' },
  { path: 'ai/PromptRegistryPage' },
  { path: 'trust/AIGovernancePage' },
  // Exercised twice, under two differently-scoped principals. No single
  // principal is narrow on every axis, so one pass alone would report the
  // unchallenged constraints as inert when they are simply not binding for
  // that principal: the Chief Engineer is department- and classification-
  // bound, the Ward Officer is ward- and domain-bound.
  {
    path: 'trust/AccessGovernancePage',
    label: 'trust/AccessGovernancePage [as Chief Engineer]',
    as: ADMIN,
    // The permission simulator's optional constraints (classification, ward,
    // department, domain) narrow a decision the engine has already made. A
    // narrowly-scoped principal is chosen deliberately: the Commissioner
    // passes every check, so the ABAC stages would never be reached and the
    // controls would look inert when they are merely unchallenged.
    prepare: async (container) => {
      const principal = container.querySelector('select')
      if (!principal) return
      const scoped = [...principal.options].map((o) => o.value).find((v) => v === 'user-chief-engineer')
      if (scoped) setNativeValue(principal, scoped)
    },
  },
  {
    path: 'trust/AccessGovernancePage',
    label: 'trust/AccessGovernancePage [as Ward Officer]',
    as: ADMIN,
    prepare: async (container) => {
      const principal = container.querySelector('select')
      if (!principal) return
      const scoped = [...principal.options].map((o) => o.value).find((v) => v === 'user-ward-officer')
      if (scoped) setNativeValue(principal, scoped)
    },
  },
  { path: 'trust/DataLineagePage' },
  { path: 'trust/EvidenceAuditPage' },
  { path: 'trust/PrivacyGovernancePage' },
  { path: 'trust/SecurityCommandCentrePage', as: ADMIN },
  { path: 'admin/UsersPage', as: ADMIN },
  { path: 'admin/PoliciesPage', as: ADMIN },
  { path: 'admin/DataSourcesPage', as: ADMIN },

  // Every remaining page the static audit reports as carrying a filter surface.
  // A page that offers a control and is never exercised here is a page whose
  // control could be inert without anything noticing - which is the precise
  // failure this harness exists to prevent, so the two lists must agree.
  { path: 'city/CitizenServiceIntelligencePage' },
  { path: 'city/HyperlocalIntelligencePage' },
  { path: 'command/MyTasksPage' },
  { path: 'governance/ContractorIntelligencePage' },
  { path: 'strategic/InstitutionalMemoryPage' },
  { path: 'trust/IntegrationHealthPage', as: ADMIN },
  { path: 'trust/PlatformHealthPage', as: ADMIN },
  { path: 'trust/PlatformReadinessPage', as: ADMIN },
  { path: 'trust/ResilienceDRPage', as: ADMIN },
  { path: 'admin/SettingsPage', as: ADMIN },
]

/* -- Coverage guard ------------------------------------------------------- */

/**
 * Pages that render a filter-shaped control but are deliberately not swept.
 * Each needs a reason, because "it is not in the list" is how a filter stops
 * being tested without anyone deciding that it should.
 */
const NOT_SWEPT = new Map([
  [
    'auth/LoginPage',
    'its only control is the demonstration-profile picker on the signed-out screen; this harness signs a principal in before mounting, so the page it would test is not the page an operator sees.',
  ],
  [
    'auth/PortalLandingPage',
    'its search box filters the published service directory held on the page itself, not a scoped data service; and like the sign-in screen it redirects an authenticated principal away, so the page this harness would mount is not the page a visitor sees.',
  ],
])

/**
 * Every page carrying a filter surface must appear in PAGES. Without this, a
 * page added next month renders a control nobody ever operates, and the suite
 * still reports everything green - which is worse than not having the suite,
 * because it is a green light nobody earned.
 */
function assertCoverage() {
  const walk = (dir) =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : []
    })

  const swept = new Set(PAGES.map((p) => p.path))
  const missing = []

  /**
   * Only pages an operator can actually reach are required to be swept. A page
   * module that exists but is absent from the route table is work in progress -
   * no filter on it is reachable, so faulting it here would be noise, and noise
   * is what trains people to stop reading a check.
   */
  const routeTable = readFileSync('src/routes/index.tsx', 'utf8')
  const routed = new Set(
    [...routeTable.matchAll(/lazy\(\(\)\s*=>\s*import\('@\/pages\/([^']+)'\)\)/g)].map((m) => m[1]),
  )

  for (const file of walk('src/pages')) {
    const src = readFileSync(file, 'utf8')
    const name = file.replace('src/pages/', '').replace(/\.tsx$/, '')
    if (!routed.has(name)) continue
    const hasSurface =
      /<FilterBar\b/.test(src) ||
      /<Select\b/.test(src) ||
      /<SegmentedControl\b/.test(src) ||
      /<Checkbox\b/.test(src) ||
      /<select\b/.test(src)
    if (!hasSurface) continue
    if (swept.has(name) || NOT_SWEPT.has(name)) continue
    missing.push(name)
  }

  if (missing.length > 0) {
    console.error(
      `\nFilter coverage gap - these routed pages render a filter control but are not swept by this harness:\n` +
        missing.map((m) => `  - ${m}`).join('\n') +
        `\n\nAdd each to PAGES, or to NOT_SWEPT with the reason it cannot be swept.\n`,
    )
    return missing
  }
  return []
}

const coverageGap = assertCoverage()
if (coverageGap.length > 0) {
  await server.close()
  process.exit(1)
}

const only = process.argv[2]
const targets = only ? PAGES.filter((p) => p.path.toLowerCase().includes(only.toLowerCase())) : PAGES

/** Mounts a page fresh and waits for it to finish resolving. */
/** Applies the operator's interface preferences exactly as `AppShell` does. */
function PreferenceHost({ children }) {
  useApplyPreferences()
  return children
}

async function mount(Page) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  useContextStore.setState({ wardId: null, departmentId: null })
  useFilterStore.setState({ filters: { ...BASELINE } })
  // Preferences are persisted and module-scoped, so a format changed while
  // testing one page would silently become the next page's baseline.
  usePreferencesStore.getState().reset()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } })
  const root = createRoot(container)
  // Pages never render bare in the application - `AppShell` always wraps them,
  // and it is `AppShell` that calls `useApplyPreferences()` to push the
  // operator's number, date and time dialect into the formatters every figure
  // is rendered through. Mounting without that made the presentation
  // preferences look inert here when they are not, so the harness mirrors the
  // real tree: the one hook the shell contributes, and nothing else.
  root.render(
    h(Boundary, null, h(QueryClientProvider, { client: queryClient }, h(MemoryRouter, null, h(PreferenceHost, null, h(Page))))),
  )
  await settle(container)
  return {
    container,
    dispose: () => {
      root.unmount()
      container.remove()
    },
  }
}

const report = []

for (const target of targets) {
  signInAs(target.as ?? 'municipal-commissioner')
  const mod = await load(`/src/pages/${target.path}.tsx`)
  const Page = mod.default ?? Object.values(mod).find((v) => typeof v === 'function')

  // Pass one: baseline and control inventory.
  const first = await mount(Page)
  const failed = first.container.querySelector('[data-render-error]')
  if (failed) {
    report.push({ page: target.label ?? target.path, error: failed.textContent })
    first.dispose()
    continue
  }
  const base = snapshot(first.container)
  const denied = /Access not authorised|could not be retrieved/.test(first.container.textContent ?? '')
  const inventory = [
    ...discoverControls(first.container),
    ...discoverLocalControls(first.container),
    ...(target.extra ? target.extra(first.container) : []),
  ]
  first.dispose()

  if (denied) {
    report.push({ page: target.label ?? target.path, denied: true })
    continue
  }

  // Pass two: one fresh mount per control. Local `useState` filters do not
  // reset when the store does, so reusing a single mount would let an earlier
  // control's narrowing be credited to the next one — a false pass.
  const outcomes = []
  for (let i = 0; i < inventory.length; i += 1) {
    const run = await mount(Page)
    // Some controls only mean anything once the page has been put into a
    // usable state — the permission simulator decides nothing until a
    // principal is named. Preparation runs before the baseline is re-taken.
    if (target.prepare) await target.prepare(run.container)
    const settledBefore = await settle(run.container)
    // The baseline is taken from THIS mount, never carried over from the
    // inventory pass. Two mounts of the same page settle to the same markup
    // in the ordinary case, but if they ever diverge - a slow query, a
    // preference left applied - comparing against the other mount's snapshot
    // reports a working filter as inert, or an inert one as working.
    const prepared = snapshot(run.container)
    if (!settledBefore) {
      outcomes.push({
        label: inventory[i].label,
        changed: false,
        note: 'page never finished rendering; result inconclusive',
      })
      run.dispose()
      continue
    }

    const live = [
      ...discoverControls(run.container),
      ...discoverLocalControls(run.container),
      ...(target.extra ? target.extra(run.container) : []),
    ][i]
    if (!live) {
      outcomes.push({ label: inventory[i].label, changed: false, note: 'control not found on remount' })
      run.dispose()
      continue
    }

    // A control passes as soon as any one of its values changes the data.
    const values = live.options ?? [null]
    let best = null
    let note = null
    for (const value of values) {
      note = await live.run(value)
      const settledAfter = await settle(run.container)
      if (!settledAfter) {
        note = 'page never finished rendering after the change; result inconclusive'
        break
      }
      const after = snapshot(run.container)
      const changed = after.hash !== prepared.hash
      if (changed) {
        best = { value, changed, rowDelta: after.rows - prepared.rows, lenDelta: after.length - prepared.length }
        break
      }
      if (!best) best = { value, changed: false, rowDelta: 0, lenDelta: 0 }
    }

    outcomes.push({
      label: `${live.label}${best?.value ? ` → ${String(best.value).slice(0, 22)}` : ''}`,
      changed: Boolean(best?.changed),
      rowDelta: best?.rowDelta ?? 0,
      lenDelta: best?.lenDelta ?? 0,
      tried: values.length,
      note,
    })
    run.dispose()
  }

  report.push({ page: target.label ?? target.path, baseRows: base.rows, baseLen: base.length, controls: inventory.length, outcomes })
}

/* -- Output --------------------------------------------------------------- */

/**
 * A control is proven the moment any run of its page shows it changing the
 * data. Pages exercised under more than one principal rely on this: a ward
 * constraint that does not bind an all-wards principal is the permission
 * engine behaving correctly, not a dead control, and it is proven by the run
 * whose principal it does bind.
 */
const provenByPage = new Map()
for (const entry of report) {
  const key = entry.page.replace(/ \[.*\]$/, '')
  const proven = provenByPage.get(key) ?? new Set()
  for (const o of entry.outcomes ?? []) if (o.changed) proven.add(o.label.replace(/ → .*$/, ''))
  provenByPage.set(key, proven)
}

let unproven = 0
let checked = 0
const outstanding = []

for (const entry of report) {
  if (entry.error) {
    console.log(`\n✗ ${entry.page}\n    RENDER ERROR: ${entry.error}`)
    unproven += 1
    continue
  }
  if (entry.denied) {
    console.log(`\n${entry.page}\n    — not authorised for this principal; no filters reachable`)
    continue
  }
  const proven = provenByPage.get(entry.page.replace(/ \[.*\]$/, '')) ?? new Set()
  console.log(`\n${entry.page}  (${entry.baseRows} rows, ${entry.baseLen} chars, ${entry.controls} controls)`)
  if (entry.controls === 0) console.log('    — no filter controls on this page')
  for (const o of entry.outcomes) {
    const bare = o.label.replace(/ → .*$/, '')
    const elsewhere = !o.changed && proven.has(bare)
    const tooShort =
      !o.changed && !elsewhere
        ? CANNOT_BIND_HERE.get(`${entry.page.replace(/ \[.*\]$/, '')}::${bare}`)
        : undefined
    checked += 1
    if (!o.changed && !elsewhere && !tooShort) {
      unproven += 1
      outstanding.push(`${entry.page}  ${o.label}`)
    }
    const mark = o.changed ? '✓' : elsewhere || tooShort ? '~' : '✗'
    const detail = o.changed
      ? `rows ${o.rowDelta >= 0 ? '+' : ''}${o.rowDelta}, text ${o.lenDelta >= 0 ? '+' : ''}${o.lenDelta}`
      : elsewhere
        ? 'not binding for this principal; proven in the other run'
        : tooShort
          ? `nothing to narrow here: ${tooShort}`
          : 'NO CHANGE'
    console.log(`    ${mark} ${o.label.padEnd(36)} ${detail}${o.note ? `  (${o.note})` : ''}`)
  }
}

console.log(`\n${checked - unproven}/${checked} rendered filter controls are proven to change the data.`)
if (outstanding.length > 0) {
  console.log('\nUnproven controls:')
  for (const line of outstanding) console.log(`  - ${line}`)
}
await server.close()
process.exit(outstanding.length > 0 ? 1 : 0)
