/**
 * Renders a static design preview using the REAL compiled stylesheet.
 *
 * There is no browser available in this environment, so this is how the visual
 * system gets verified: the markup below uses the same utility classes the
 * application components use, against the same `dist` CSS the application
 * ships. If it renders correctly here, it renders correctly in the app.
 *
 * Run `npm run build` first, then `node scripts/design-preview.mjs`.
 * Output: design-preview.html at the repository root.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const cssFile = readdirSync('dist/assets').find((f) => f.endsWith('.css'))
if (!cssFile) throw new Error('No compiled stylesheet found. Run `npm run build` first.')
const css = readFileSync(`dist/assets/${cssFile}`, 'utf8')
const mark = readFileSync('public/brand-mark.svg', 'utf8')
const markData = `data:image/svg+xml;base64,${Buffer.from(mark).toString('base64')}`

const navSections = [
  {
    label: 'Command',
    items: [
      ['Executive Overview', false, 0],
      ['Commissioner Cockpit', true, 12],
      ['Situation Room', false, 9],
      ['Intelligence Feed', false, 0],
      ['Decision Centre', false, 12],
      ['Alerts & Escalations', false, 7],
    ],
  },
  {
    label: 'City Intelligence',
    items: [
      ['Ward Intelligence', false, 0],
      ['Water Intelligence', false, 0],
      ['Monsoon Intelligence', false, 0],
      ['Roads Intelligence', false, 0],
    ],
  },
  {
    label: 'Trust Centre',
    items: [
      ['Security Command Centre', false, 21],
      ['AI Governance', false, 0],
    ],
  },
]

const rail = `
<nav class="rail-surface relative flex h-full w-[17rem] shrink-0 flex-col shadow-rail">
  <span class="absolute inset-y-0 right-0 w-px bg-ink-100"></span>
  <div class="relative flex h-14 shrink-0 items-center gap-2.5 border-b border-ink-100 px-3">
    <span class="relative flex h-9 w-9 items-center justify-center">
      <span class="absolute inset-0 rounded-[0.6rem] bg-gradient-to-br from-intel-400/25 to-govt-500/25 blur-[6px]"></span>
      <img src="${markData}" class="relative h-8 w-8 rounded-[0.55rem]" alt="">
    </span>
    <div class="min-w-0 flex-1">
      <p class="text-[0.5625rem] font-bold tracking-[0.22em] text-intel-700 uppercase">Maha AI</p>
      <p class="truncate text-[0.8125rem] leading-tight font-semibold text-rail-text">BMC Intelligence</p>
    </div>
  </div>
  <div class="relative flex-1 overflow-hidden px-2.5 py-3">
    ${navSections
      .map(
        (section) => `
      <div class="mb-1.5">
        <div class="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5">
          <svg class="h-3 w-3 shrink-0 text-google-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
          <span class="flex-1 text-[0.625rem] font-bold tracking-[0.13em] text-google-blue-700 uppercase">${section.label}</span>
        </div>
        <ul class="mt-0.5 space-y-0.5 pl-2.5">
          ${section.items
            .map(
              ([label, active, badge]) => `
            <li>
              <span class="group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[0.4375rem] text-[0.8125rem] ${
                active
                  ? 'bg-govt-50 font-semibold text-rail-text ring-1 ring-govt-200/60 ring-inset'
                  : 'text-rail-text/90'
              }">
                ${active ? '<span class="absolute top-1/2 -left-1.5 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-govt-500 to-intel-500"></span>' : ''}
                <span class="h-[1.0625rem] w-[1.0625rem] shrink-0 rounded-[4px] ${active ? 'bg-govt-600/80' : 'bg-rail-muted/50'}"></span>
                <span class="min-w-0 flex-1 truncate">${label}</span>
                ${
                  badge
                    ? `<span class="numeric shrink-0 rounded-full px-1.5 py-px text-[0.625rem] font-bold ${
                        badge > 10
                          ? 'bg-crit-500 text-white'
                          : 'bg-govt-100 text-govt-700 ring-1 ring-govt-200 ring-inset'
                      }">${badge}</span>`
                    : ''
                }
              </span>
            </li>`,
            )
            .join('')}
        </ul>
      </div>`,
      )
      .join('')}
  </div>
  <div class="relative shrink-0 border-t border-ink-100 p-2">
    <span class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-rail-muted">Collapse</span>
  </div>
</nav>`

/* The hue comes from `.metric-cycle:nth-child(...)` in the real stylesheet —
   nothing here selects a colour, exactly as in the application. */
const metric = (label, value, unit, support, delta, deltaGood) => `
<div class="metric-cycle group relative block overflow-hidden rounded-xl border p-4 shadow-card">
  <div class="flex items-start justify-between gap-2">
    <div class="flex min-w-0 items-center gap-2">
      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-current/20 ring-1 ring-current/35 ring-inset">
        <span class="h-3 w-3 rounded-[3px] bg-current opacity-80"></span>
      </span>
      <span class="label-institutional leading-[1.35] break-words text-current">${label}</span>
      <span class="info-hint flex h-3.5 w-3.5 items-center justify-center rounded-full border border-ink-300 text-[0.5625rem] font-semibold text-ink-400">i</span>
    </div>
    <svg class="h-4 w-4 shrink-0 text-current/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>
  </div>
  <div class="mt-2.5 flex items-end justify-between gap-2">
    <div class="min-w-0">
      <div class="flex items-baseline gap-1.5">
        <span class="numeric text-metric font-semibold tracking-tight text-current">${value}</span>
        ${unit ? `<span class="text-xs font-semibold text-current/85">${unit}</span>` : ''}
      </div>
      <p class="mt-0.5 truncate text-[0.6875rem] text-current/90">${support}</p>
    </div>
  </div>
  <div class="mt-2.5">
    <span class="mini-bar inline-flex h-1.5 w-full overflow-hidden rounded-full bg-ink-100 align-middle">
      <span class="h-full rounded-full bg-govt-500" style="width:64%"></span>
    </span>
  </div>
  <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
    <span class="badge-chip inline-flex h-[1.375rem] max-w-full items-center gap-1 rounded-md px-1.5 text-[0.6875rem] font-semibold ring-1 ring-inset ${
      deltaGood ? 'bg-ok-50 text-ok-700 ring-ok-200' : 'bg-crit-50 text-crit-700 ring-crit-200'
    }">${delta}</span>
    <span class="badge-chip inline-flex h-[1.375rem] max-w-full items-center gap-1 rounded-md bg-intel-50 px-1.5 text-[0.6875rem] font-semibold text-intel-700 ring-1 ring-intel-200 ring-inset">Demonstration Data</span>
  </div>
</div>`

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>BMC Intelligence — design preview</title>
<style>${css}</style>
<style>
  body { margin: 0; }
  .preview-shell { height: 100vh; }
</style>
</head>
<body>
<div class="preview-shell flex w-full bg-canvas">
  ${rail}
  <div class="flex min-w-0 flex-1 flex-col">
    <!-- Top bar -->
    <header class="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-ink-100 bg-surface/85 px-4 shadow-[0_1px_0_0_rgb(11_18_32/0.04)] backdrop-blur-md">
      <div class="flex h-9 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-ink-200 bg-surface-sunken px-3 shadow-xs">
        <span class="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-ink-400"></span>
        <span class="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-400">Search wards, projects, decisions, evidence…</span>
        <kbd class="shrink-0 rounded border border-ink-200 bg-surface px-1 py-px font-mono text-[0.625rem] text-ink-400">⌘ K</kbd>
      </div>
      <div class="flex-1"></div>
      <span class="flex flex-col items-end justify-center leading-none">
        <span class="numeric flex items-center gap-1.5 text-[0.8125rem] font-semibold tabular-nums text-ink-800">
          <span class="h-1.5 w-1.5 rounded-full bg-risk-500"></span>09:20:14
        </span>
        <span class="mt-1 text-[0.5625rem] font-semibold tracking-[0.09em] text-ink-400 uppercase">Fri, 24 Jul · IST</span>
      </span>
      <span class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-intel-200 bg-gradient-to-b from-intel-50 to-intel-100/70 px-2.5 text-xs font-semibold text-intel-700 shadow-xs">Copilot</span>
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-govt-500 to-govt-700 text-[0.625rem] font-bold text-white shadow-sm ring-2 ring-white">AD</span>
    </header>

    <!-- Context bar -->
    <div class="flex h-11 shrink-0 items-center gap-2 border-b border-ink-100 bg-gradient-to-r from-surface-sunken via-surface to-surface-sunken px-4">
      <span class="label-institutional shrink-0">Context</span>
      <span class="h-3 w-px shrink-0 bg-ink-200"></span>
      <span class="inline-flex h-[1.625rem] items-center rounded-md bg-transparent px-2 text-xs font-semibold text-ink-500 ring-1 ring-ink-200 ring-inset">Maha AI</span>
      <span class="shrink-0 text-ink-300">›</span>
      <span class="inline-flex h-[1.625rem] items-center rounded-md bg-govt-50 px-2 text-xs font-semibold text-govt-700 ring-1 ring-govt-200 ring-inset">BMC Intelligence</span>
      <div class="flex-1"></div>
      <span class="inline-flex h-[1.625rem] items-center rounded-md bg-ink-50 px-2 text-xs font-semibold text-ink-700 ring-1 ring-ink-200 ring-inset">Acting as Municipal Commissioner</span>
    </div>

    <!-- Workspace -->
    <main class="min-w-0 flex-1 overflow-hidden p-5">
      <div class="mx-auto w-full max-w-[1600px] space-y-4">
        <!-- Page banner -->
        <header class="min-w-0">
          <div class="banner-surface relative overflow-hidden rounded-xl px-6 py-6 shadow-raised">
            <span class="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.35]"></span>
            <span class="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-intel-400/20 blur-3xl"></span>
            <div class="relative">
              <nav class="mb-1.5 flex flex-wrap items-center gap-1 text-[0.6875rem] text-white/65">
                <span>Command</span><span class="text-white/45">›</span><span class="text-white/85">Commissioner Cockpit</span>
              </nav>
              <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div class="min-w-0 flex-1">
                  <div class="mb-1.5 text-[0.6875rem] font-bold tracking-[0.13em] text-intel-200 uppercase">Command</div>
                  <h1 class="text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] text-white">Commissioner Intelligence Cockpit</h1>
                  <p class="mt-1.5 max-w-4xl text-[0.875rem] leading-relaxed text-white/80">Today's Mumbai and the priority queue requiring a decision from the competent authority. Every item is traceable to its evidence.</p>
                </div>
                <div class="flex shrink-0 flex-wrap items-center gap-1.5">
                  <span class="inline-flex h-8 items-center rounded-lg border border-white/25 bg-white/10 px-3 text-[0.8125rem] font-semibold text-white">Generate Brief</span>
                  <span class="inline-flex h-8 items-center rounded-lg bg-white px-3 text-[0.8125rem] font-semibold text-govt-800 shadow-sm">Open Situation Room</span>
                </div>
              </div>
            </div>
          </div>
          <div class="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.6875rem] text-ink-400">
            <span>Generated 12 min ago</span><span>Source observed 34 min ago</span>
            <span class="inline-flex h-[1.375rem] items-center rounded-md bg-intel-50 px-1.5 text-[0.6875rem] font-semibold text-intel-700 ring-1 ring-intel-200 ring-inset">Demonstration Data</span>
          </div>
        </header>

        <!-- Metric row -->
        <div class="grid grid-cols-4 gap-3">
          ${metric('City Health Score', '75', '/100', 'Weighted across 6 published components', '+2.4%', true)}
          ${metric('Critical Alerts', '7', '', '4 breaching SLA within 6 hours', '+3', false)}
          ${metric('Priority Decisions', '12', '', 'Awaiting the competent authority', '+2', false)}
          ${metric('Services at Risk', '18', '', 'Below 65% SLA compliance', '−4', true)}
        </div>

        <!-- Content row -->
        <div class="grid grid-cols-3 gap-4">
          <div class="col-span-2 rounded-xl border border-ink-100 bg-surface p-4 shadow-card">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="label-institutional mb-1">Operational trend</div>
                <h2 class="accent-rule text-[1.0625rem] leading-6 font-semibold tracking-tight text-ink-900">City health, last 30 days</h2>
                <p class="mt-1 text-[0.8125rem] leading-relaxed text-ink-500">Index 0–100 · rolling 30 days · target 75</p>
              </div>
              <div class="inline-flex items-center gap-0.5 rounded-lg border border-ink-200 bg-ink-50 p-[3px] shadow-inner">
                <span class="inline-flex h-[1.875rem] items-center rounded-md bg-surface px-3 text-xs font-semibold text-govt-700 shadow-[0_1px_2px_0_rgb(11_18_32/0.1)] ring-1 ring-ink-200/70">30d</span>
                <span class="inline-flex h-[1.875rem] items-center px-3 text-xs font-semibold text-ink-500">90d</span>
                <span class="inline-flex h-[1.875rem] items-center px-3 text-xs font-semibold text-ink-500">FY</span>
              </div>
            </div>
            <svg viewBox="0 0 600 170" class="mt-4 w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#2f6bef" stop-opacity="0.34"/>
                  <stop offset="55%" stop-color="#2f6bef" stop-opacity="0.12"/>
                  <stop offset="100%" stop-color="#2f6bef" stop-opacity="0.01"/>
                </linearGradient>
              </defs>
              <g stroke="#e3e9f1" stroke-dasharray="3 3">
                <line x1="0" y1="30" x2="600" y2="30"/><line x1="0" y1="70" x2="600" y2="70"/>
                <line x1="0" y1="110" x2="600" y2="110"/><line x1="0" y1="150" x2="600" y2="150"/>
              </g>
              <path d="M0,118 C60,110 90,126 140,104 C190,84 230,96 280,76 C330,58 370,80 420,62 C470,46 520,58 600,40 L600,170 L0,170 Z" fill="url(#g)"/>
              <path d="M0,118 C60,110 90,126 140,104 C190,84 230,96 280,76 C330,58 370,80 420,62 C470,46 520,58 600,40" fill="none" stroke="#2f6bef" stroke-width="2.5" stroke-linecap="round"/>
              <line x1="0" y1="66" x2="600" y2="66" stroke="#f0a108" stroke-dasharray="4 4"/>
              <circle cx="600" cy="40" r="4" fill="#2f6bef" stroke="#fff" stroke-width="2"/>
            </svg>
          </div>

          <div class="space-y-3">
            <div class="rounded-xl border border-crit-200/70 bg-gradient-to-br from-crit-50 to-surface p-4 shadow-card">
              <div class="flex gap-3">
                <span class="w-1 shrink-0 rounded-full bg-gradient-to-b from-crit-500 to-crit-600"></span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="inline-flex h-[1.375rem] items-center gap-1 rounded-md bg-crit-50 px-1.5 text-[0.6875rem] font-semibold text-crit-700 ring-1 ring-crit-200 ring-inset"><span class="h-1.5 w-1.5 rounded-full bg-current opacity-80"></span>Critical</span>
                    <span class="inline-flex h-[1.375rem] items-center rounded-md bg-intel-50 px-1.5 text-[0.6875rem] font-semibold text-intel-700 ring-1 ring-intel-200 ring-inset">Cross-domain</span>
                  </div>
                  <h3 class="mt-2 text-[0.8125rem] leading-[1.4] font-semibold text-ink-900">Integrated urban risk — hospital approach exposure in H/E</h3>
                  <p class="mt-1 text-xs leading-relaxed text-ink-500">Rainfall, drain capacity, road condition and hospital location converge on a single-route dependency.</p>
                  <div class="mt-2 flex flex-wrap items-center gap-1.5">
                    <span class="inline-flex h-[1.375rem] items-center rounded-md bg-warn-50 px-1.5 text-[0.6875rem] font-semibold text-warn-700 ring-1 ring-warn-200 ring-inset">Medium confidence</span>
                    <span class="inline-flex h-[1.375rem] items-center rounded-md bg-warn-50 px-1.5 text-[0.6875rem] font-semibold tracking-wide text-warn-700 uppercase ring-1 ring-warn-200 ring-inset">Confidential</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-xl border border-ink-100 bg-surface p-4 shadow-card">
              <div class="label-institutional mb-2">Monsoon readiness</div>
              <div class="flex items-baseline justify-between">
                <span class="numeric text-metric-sm font-semibold tracking-tight text-ink-900">63<span class="text-xs font-semibold text-ink-400">/100</span></span>
                <span class="inline-flex h-[1.375rem] items-center rounded-md bg-crit-50 px-1.5 text-[0.6875rem] font-semibold text-crit-700 ring-1 ring-crit-200 ring-inset">−4</span>
              </div>
              <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-100 shadow-inner">
                <div class="h-full rounded-full bg-gradient-to-r from-warn-600 to-warn-300" style="width:63%"></div>
              </div>
              <p class="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">9 wards below the 70-point threshold. Desilting is the binding constraint in 6 of them.</p>
              <div class="mt-3 flex gap-1.5 border-t border-ink-100 pt-2.5">
                <span class="inline-flex h-7 items-center rounded-lg border border-ink-200 bg-surface px-2.5 text-xs font-semibold text-ink-700 shadow-xs">Open module</span>
                <span class="inline-flex h-7 items-center rounded-lg bg-gradient-to-b from-govt-600 to-govt-700 px-2.5 text-xs font-semibold text-white shadow-[0_1px_2px_0_rgb(26_63_175/0.5),inset_0_1px_0_0_rgb(255_255_255/0.16)]">Run scenario</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</div>
</body>
</html>`

writeFileSync('design-preview.html', html)
console.log(`design-preview.html written (${(html.length / 1024).toFixed(0)} kB, stylesheet ${cssFile})`)
