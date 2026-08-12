/**
 * Renders the sign-in screen from the REAL compiled stylesheet, so the layout
 * can be checked without a browser. Mirrors the markup in
 * `src/pages/auth/LoginPage.tsx`.
 *
 * Run `npm run build` first, then `node scripts/login-preview.mjs`.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const cssFile = readdirSync('dist/assets').find((f) => f.endsWith('.css'))
if (!cssFile) throw new Error('No compiled stylesheet found. Run `npm run build` first.')
const css = readFileSync(`dist/assets/${cssFile}`, 'utf8')
const mark = readFileSync('public/brand-mark.svg', 'utf8')
const markData = `data:image/svg+xml;base64,${Buffer.from(mark).toString('base64')}`

const hierarchy = [
  ['National Governance Intelligence', 'Conceptual'],
  ['Maha State Intelligence', 'Conceptual'],
  ['Urban Intelligence Infrastructure', 'Platform Core'],
  ['BMC Intelligence', 'This Deployment'],
  ['Department Intelligence', 'Active'],
  ['Ward Intelligence', 'Active'],
  ['Zone Intelligence', 'Active'],
  ['Asset / Project / Service Intelligence', 'Active'],
]

const chevron =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23596e88' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")"

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Sign in — design preview</title>
<style>${css}</style><style>body{margin:0}.shell{height:100vh}</style></head>
<body>
<div class="shell grid grid-cols-[minmax(0,1fr)_minmax(0,30rem)] bg-canvas">

  <!-- Institutional panel -->
  <div class="hero-surface relative flex flex-col justify-between overflow-hidden p-10 text-white">
    <div class="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.18]"></div>
    <div class="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-intel-500/10 blur-3xl"></div>
    <div class="pointer-events-none absolute -bottom-40 -left-20 h-[28rem] w-[28rem] rounded-full bg-govt-500/10 blur-3xl"></div>
    <div class="relative">
      <div class="flex items-center gap-3">
        <span class="relative flex h-12 w-12 items-center justify-center">
          <span class="absolute inset-0 rounded-2xl bg-gradient-to-br from-intel-400/40 to-govt-500/40 blur-lg"></span>
          <img src="${markData}" class="relative h-11 w-11 rounded-xl" alt="">
        </span>
        <div>
          <p class="text-[0.6875rem] font-semibold tracking-[0.2em] text-intel-300 uppercase">Maha AI</p>
          <p class="text-sm font-medium text-govt-100">Urban Intelligence Infrastructure</p>
        </div>
      </div>
      <h1 class="mt-12 max-w-xl bg-gradient-to-br from-white via-white to-govt-200 bg-clip-text text-[2.75rem] leading-[1.1] font-semibold tracking-[-0.03em] text-transparent">BMC Intelligence Infrastructure</h1>
      <p class="mt-4 max-w-lg text-base leading-relaxed text-govt-200">Sovereign Urban Intelligence &amp; Decision Infrastructure for Mumbai</p>
      <p class="mt-8 max-w-lg text-[0.8125rem] leading-relaxed text-govt-300">A governed urban intelligence and decision-support layer connecting municipal operations, infrastructure, finances, wards, projects, risks, citizen services and institutional knowledge into one evidence-backed operating environment for Mumbai.</p>
    </div>
    <div class="relative mt-10">
      <p class="mb-3 text-[0.6875rem] font-semibold tracking-[0.14em] text-govt-300 uppercase">Platform hierarchy</p>
      <ol class="space-y-1.5">
        ${hierarchy
          .map(
            ([label, scope], i) => `<li class="flex items-center gap-2.5">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full ${scope === 'This Deployment' ? 'bg-intel-400' : scope === 'Active' ? 'bg-govt-300' : 'bg-govt-700'}"></span>
          <span class="text-[0.8125rem] ${scope === 'This Deployment' ? 'font-semibold text-white' : 'text-govt-300'}" style="padding-left:${i * 6}px">${label}</span>
          <span class="ml-auto text-[0.625rem] text-govt-500">${scope}</span></li>`,
          )
          .join('')}
      </ol>
    </div>
    <div class="relative mt-10 border-t border-govt-800 pt-5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="inline-flex h-[1.625rem] items-center rounded-md bg-warn-50 px-2 text-xs font-semibold text-warn-700 ring-1 ring-warn-200 ring-inset">Demonstration Environment</span>
        <span class="inline-flex h-[1.625rem] items-center rounded-md px-2 text-xs font-semibold text-govt-300 ring-1 ring-govt-700 ring-inset">Brihanmumbai Municipal Corporation — Mumbai</span>
      </div>
      <p class="mt-3 max-w-lg text-[0.6875rem] leading-relaxed text-govt-400">Figures shown in this environment are modelled demonstration data and are not connected to live BMC departmental systems. No security certification, accreditation or regulatory approval is claimed or implied by this environment.</p>
    </div>
  </div>

  <!-- Sign-in panel -->
  <div class="flex flex-col justify-center bg-surface px-10 py-10">
    <div class="mx-auto w-full max-w-md">
      <div class="mb-6">
        <h2 class="text-2xl font-semibold tracking-tight text-ink-900">Sign in</h2>
        <p class="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-500">Select the position you are signing in as. The position determines your data scope, the modules you can reach and the actions you are permitted to take.</p>
      </div>

      <div class="mb-4">
        <label class="mb-1 block text-xs font-medium text-ink-600">Position<span class="ml-0.5 text-crit-600">*</span></label>
        <div class="flex h-11 w-full items-center rounded-lg border border-ink-200 bg-surface pr-9 pl-3 text-[0.875rem] font-medium text-ink-800 shadow-xs"
             style="background-image:${chevron};background-repeat:no-repeat;background-position:right 0.75rem center">
          Municipal Commissioner
        </div>
      </div>

      <div class="mb-4">
        <label class="mb-1 block text-xs font-medium text-ink-600">Passphrase<span class="ml-0.5 text-crit-600">*</span></label>
        <div class="relative">
          <div class="flex h-11 w-full items-center rounded-lg border border-ink-200 bg-surface pr-10 pl-3 text-[0.875rem] tracking-[0.3em] text-ink-800 shadow-xs">••••••••••••</div>
          <span class="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-400">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </span>
        </div>
      </div>

      <button class="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-govt-600 to-govt-700 px-4 text-sm font-semibold text-white shadow-[0_1px_2px_0_rgb(26_63_175/0.5),inset_0_1px_0_0_rgb(255_255_255/0.16)]">
        Sign in <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>
      </button>

      <div class="mt-5 rounded-xl border border-ink-100 bg-surface-sunken p-4 shadow-card">
        <p class="label-institutional mb-2">Access granted by this position</p>
        <dl class="space-y-1.5 text-[0.6875rem]">
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Role</dt><dd class="text-right font-medium text-ink-800">Municipal Commissioner</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Ward scope</dt><dd class="text-right font-medium text-ink-800">All 24 wards</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Department scope</dt><dd class="text-right font-medium text-ink-800">All departments</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Classification ceiling</dt><dd class="text-right"><span class="inline-flex h-[1.375rem] items-center gap-1 rounded-md bg-crit-50 px-1.5 text-[0.6875rem] font-semibold tracking-wide text-crit-700 uppercase ring-1 ring-crit-200 ring-inset">Restricted</span></dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Lands on</dt><dd class="text-right font-medium text-ink-800 capitalize">cockpit</dd></div>
        </dl>
        <p class="mt-2.5 border-t border-ink-100 pt-2 text-[0.6875rem] leading-relaxed text-ink-500">Chief executive authority of the corporation. City-wide intelligence, decision approval and escalation authority across every domain.</p>
      </div>

      <div class="mt-6 space-y-2.5">
        <div class="flex items-start gap-2 rounded-lg border border-warn-200 bg-warn-50/70 px-3 py-2.5">
          <svg class="mt-px h-3.5 w-3.5 shrink-0 text-warn-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
          <p class="text-[0.6875rem] leading-relaxed text-warn-800"><span class="font-semibold">Demonstration Environment.</span> Figures shown in this environment are modelled demonstration data and are not connected to live BMC departmental systems.</p>
        </div>
        <div class="flex items-start gap-2 rounded-lg border border-ink-100 bg-surface-sunken px-3 py-2.5">
          <svg class="mt-px h-3.5 w-3.5 shrink-0 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <p class="text-[0.6875rem] leading-relaxed text-ink-500">The passphrase gates entry to this demonstration environment. It is shared across every position and verified in the browser, so it is <span class="font-medium text-ink-600">not a security control</span> and protects nothing. Production deployment requires an institutional identity provider with enforced multi-factor authentication.</p>
        </div>
      </div>

      <div class="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-ink-100 pt-5">
        <span class="inline-flex h-[1.375rem] items-center gap-1 rounded-md bg-warn-50 px-1.5 text-[0.6875rem] font-semibold tracking-wide text-warn-700 uppercase ring-1 ring-warn-200 ring-inset">Demonstration Environment</span>
        <span class="inline-flex h-[1.375rem] items-center gap-1 rounded-md px-1.5 text-[0.6875rem] font-semibold text-ink-500 ring-1 ring-ink-200 ring-inset">Permission engine active</span>
      </div>
    </div>
  </div>
</div>
</body></html>`

writeFileSync('login-preview.html', html)
console.log(`login-preview.html written (stylesheet ${cssFile})`)
