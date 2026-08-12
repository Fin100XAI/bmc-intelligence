/**
 * Static preview of the portal landing page, rendered against the REAL
 * compiled stylesheet - the same technique `design-preview.mjs` uses, because
 * there is no browser in this environment.
 *
 * Run `npm run build` first. Output: portal-preview.html at the repo root.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/login',
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
globalThis.ResizeObserver = ObserverStub
globalThis.IntersectionObserver = ObserverStub
const matchMediaStub = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
globalThis.matchMedia = matchMediaStub
/* The page reads `window.matchMedia`, not the bare global, so the stub has to
   live on the JSDOM window as well - jsdom does not implement it. */
dom.window.matchMedia = matchMediaStub

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { act, createElement } = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter, Routes, Route } = await import('react-router-dom')
const { createServer } = await import('vite')
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const runtime = await server.ssrLoadModule('/src/data/runtime.ts')
const page = await server.ssrLoadModule('/src/pages/auth/PortalLandingPage.tsx')

const target = process.argv[2] ?? 'bmc'
runtime.setActiveCorporation(target)

const container = document.createElement('div')
document.body.append(container)
const root = createRoot(container)
await act(async () => {
  root.render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/login'] },
      createElement(Routes, null, createElement(Route, { path: '/login', element: createElement(page.default) })),
    ),
  )
})

const cssFile = readdirSync('dist/assets').find((f) => f.endsWith('.css'))
if (!cssFile) throw new Error('No compiled stylesheet found. Run `npm run build` first.')
const css = readFileSync(`dist/assets/${cssFile}`, 'utf8')

writeFileSync(
  'portal-preview.html',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Portal preview — ${target}</title><style>${css}</style></head><body>${container.innerHTML}</body></html>`,
)
console.log(`portal-preview.html written for ${target} — ${container.innerHTML.length.toLocaleString()} chars`)
console.log('\nText content sample:\n' + (container.textContent ?? '').replace(/\s+/g, ' ').slice(0, 1200))

await act(async () => root.unmount())
await server.close()
