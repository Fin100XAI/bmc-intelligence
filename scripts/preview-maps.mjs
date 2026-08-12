/**
 * Renders every corporation's generated ward geometry to a single HTML sheet.
 *
 * The map is the most visible thing a corporation switch changes, and a
 * tessellation bug - a degenerate cell, a ward outside the outline, a water
 * feature drawn through the middle of the built-up area - is obvious to the
 * eye and invisible to a type check. This exists so that judgement can
 * actually be applied before the build is shown to anyone.
 *
 * Run with: node scripts/preview-maps.mjs   → writes map-preview.html
 */
import { createServer } from 'vite'
import { writeFile } from 'node:fs/promises'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })

const FILL = {
  forest: '#dcfce7',
  water: '#dbeafe',
  creek: '#dbeafe',
  river: '#bfdbfe',
  lake: '#bfdbfe',
}

const WARD_FILL = ['#eef2ff', '#f0f9ff', '#f5f3ff', '#ecfeff', '#fef2f2', '#fffbeb', '#f0fdf4', '#fdf4ff']

try {
  const load = (p) => server.ssrLoadModule(p)
  const runtime = await load('/src/data/runtime.ts')
  const corporations = await load('/src/config/corporations.ts')
  const geography = await load('/src/data/geography.ts')
  const reference = await load('/src/data/reference.ts')

  const cards = []

  for (const corp of corporations.CORPORATIONS) {
    runtime.setActiveCorporation(corp.id)

    const backdrop = geography.MAP_BACKDROP_FEATURES.map(
      (f) =>
        `<polygon points="${f.polygon.map(([x, y]) => `${x},${y}`).join(' ')}" fill="${FILL[f.kind] ?? '#e0f2fe'}" opacity="0.85" />`,
    ).join('')

    const wards = reference.WARDS.map((w, i) => {
      const pts = w.polygon.map(([x, y]) => `${x},${y}`).join(' ')
      return `<polygon points="${pts}" fill="${WARD_FILL[i % WARD_FILL.length]}" fill-opacity="0.9" stroke="#64748b" stroke-width="0.35" />`
    }).join('')

    const labels = reference.WARDS.map((w) => {
      const cx = w.polygon.reduce((s, p) => s + p[0], 0) / w.polygon.length
      const cy = w.polygon.reduce((s, p) => s + p[1], 0) / w.polygon.length
      return `<text x="${cx}" y="${cy}" font-size="2.1" text-anchor="middle" fill="#0f172a">${w.code}</text>`
    }).join('')

    const waterNames = geography.MAP_BACKDROP_FEATURES.map((f) => f.label).join(' · ')

    cards.push(`
      <figure>
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <rect width="100" height="100" fill="#f8fafc" />
          ${backdrop}${wards}${labels}
        </svg>
        <figcaption>
          <strong>${corp.city}</strong> <span class="tag">${corp.shortName}</span>
          <span class="meta">${reference.WARDS.length} × ${corp.wardTerminology} · ${reference.ZONES.length} ${corp.zoneTerminology.toLowerCase()}s · ${corp.form.type}</span>
          <span class="meta">${waterNames || 'no named water features'}</span>
        </figcaption>
      </figure>`)
  }

  runtime.setActiveCorporation('bmc')

  const html = `<!doctype html><meta charset="utf-8"><title>Generated city geometry — all corporations</title>
<style>
  body { font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; background: #f1f5f9; color: #0f172a; margin: 0; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.lede { margin: 0 0 20px; color: #475569; max-width: 70ch; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
  figure { margin: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; }
  svg { width: 100%; height: auto; border-radius: 6px; display: block; }
  figcaption { margin-top: 8px; }
  .tag { font: 11px ui-monospace, monospace; color: #64748b; }
  .meta { display: block; font-size: 11px; color: #64748b; margin-top: 2px; }
</style>
<h1>Generated city geometry — all ${corporations.CORPORATIONS.length} Maharashtra municipal corporations</h1>
<p class="lede">Ward names and counts are each corporation's own published administrative divisions. The boundaries are a schematic tessellation generated for demonstration and are not official GIS boundaries. Brihanmumbai uses hand-authored geometry.</p>
<div class="grid">${cards.join('')}</div>`

  await writeFile('map-preview.html', html, 'utf-8')
  console.log(`wrote map-preview.html — ${corporations.CORPORATIONS.length} corporations`)
} finally {
  await server.close()
}
