/** One-shot: print what the shell actually says in each language. */
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const load = (p) => server.ssrLoadModule(p)
  const i18n = await load('/src/i18n/index.ts')
  const runtime = await load('/src/data/runtime.ts')
  const nav = await load('/src/config/navigation.ts')
  const config = await load('/src/config/municipality.config.ts')
  const reference = await load('/src/data/reference.ts')
  const format = await load('/src/utils/format.ts')
  const intelligence = await load('/src/data/intelligence.data.ts')

  for (const locale of ['en', 'mr']) {
    i18n.setActiveLocale(locale)
    runtime.rebuildAllLayers()
    console.log(`\n${'='.repeat(72)}\n${locale.toUpperCase()}\n${'='.repeat(72)}`)
    console.log(`deployment   ${config.municipality.municipalityName}`)
    console.log(`product      ${config.municipality.branding.productName}`)
    console.log(`environment  ${config.municipality.environmentLabel}`)
    console.log(`unit         ${config.municipality.terminology.primaryUnitSingular} / ${config.municipality.terminology.primaryUnitPlural}`)
    console.log(`executive    ${config.municipality.terminology.executiveTitle}`)
    console.log(`\nnavigation:`)
    for (const section of nav.NAV_SECTIONS.slice(0, 3)) {
      console.log(`  ${section.label}`)
      for (const item of section.items.slice(0, 4)) console.log(`    · ${item.label}`)
    }
    console.log(`\nwards:       ${reference.WARDS.slice(0, 3).map((w) => `${w.code} ${w.name}`).join(' | ')}`)
    console.log(`departments: ${reference.DEPARTMENTS.slice(0, 3).map((d) => d.name).join(' | ')}`)
    console.log(`officers:    ${reference.OFFICERS.slice(0, 3).map((o) => o.name).join(' | ')}`)
    console.log(`alert:       ${intelligence.ALERTS[0]?.title ?? '-'}`)
    console.log(`figures:     ${format.formatCrore(80952.56)} · ${format.formatCompact(12442373)} · ${format.formatPercent(87.4)}`)
    console.log(`dates:       ${format.formatDate('2026-07-24T09:20:00Z')} · ${format.formatDateTime('2026-07-24T09:20:00Z')}`)
    console.log(`ages:        ${format.formatRelative('2026-07-24T06:20:00Z')} · ${format.formatRelative('2026-06-24T06:20:00Z')}`)
    console.log(`duration:    ${format.formatDuration(27.5)}`)
  }
  i18n.setActiveLocale('en')
  runtime.rebuildAllLayers()
} finally {
  await server.close()
}
