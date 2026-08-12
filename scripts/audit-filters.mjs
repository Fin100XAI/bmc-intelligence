/**
 * Static audit of filter wiring across every page.
 *
 * The failure this catches: a page renders <FilterBar /> (or a local select)
 * but never reads the resulting state, so changing a filter visibly does
 * nothing. That is worse than having no filter at all, because it tells the
 * operator the data has been narrowed when it has not.
 *
 * For each page this reports:
 *   - which filter surfaces it renders
 *   - whether the filter state is actually consumed downstream
 *
 * Run: node scripts/audit-filters.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : []
  })
}

const pages = walk('src/pages').sort()
const rows = []

for (const file of pages) {
  const src = readFileSync(file, 'utf8')
  const name = file.replace('src/pages/', '')

  const rendersFilterBar = /<FilterBar\b/.test(src)
  const usesFilterStore = /useFilterStore\(/.test(src)
  // Does it read the store's filter values, not just render the bar?
  const readsStoreFilters = /useFilterStore\(\s*\(s\)\s*=>\s*s\.filters\s*\)/.test(src)

  // Local filter state: useState hooks whose name suggests a filter.
  const localFilterStates = [
    ...src.matchAll(/const \[(\w*(?:[Ff]ilter|Severity|Status|Ward|Category|Domain|Type|Mode|Band|Stage|Kind|Search|Query|Selected)\w*), set\w+\] = useState/g),
  ].map((m) => m[1])

  // Interactive filter surfaces beyond FilterBar.
  const selects = (src.match(/<Select\b/g) ?? []).length
  const segmented = (src.match(/<SegmentedControl\b/g) ?? []).length
  const checkboxes = (src.match(/<Checkbox\b/g) ?? []).length
  const nativeSelects = (src.match(/<select\b/g) ?? []).length

  const hasAnyFilterSurface =
    rendersFilterBar || selects + segmented + checkboxes + nativeSelects > 0 || localFilterStates.length > 0
  if (!hasAnyFilterSurface) continue

  // Is each local filter state read anywhere other than its own declaration?
  // A state that is set but never read is dead. One further mention is enough
  // to be live — a single read in JSX is entirely normal, so the threshold is
  // "appears more than once", not "more than twice".
  const deadLocalStates = localFilterStates.filter((state) => {
    const uses = [...src.matchAll(new RegExp(`\\b${state}\\b`, 'g'))].length
    return uses < 2
  })

  // FilterBar rendered but store filters never read → the bar does nothing.
  const filterBarInert = rendersFilterBar && !readsStoreFilters

  rows.push({
    name,
    filterBar: rendersFilterBar,
    readsStore: readsStoreFilters,
    localStates: localFilterStates.length,
    deadLocalStates,
    surfaces: selects + segmented + checkboxes + nativeSelects,
    filterBarInert,
  })
}

const problems = rows.filter((r) => r.filterBarInert || r.deadLocalStates.length > 0)

console.log(`Pages with a filter surface: ${rows.length} of ${pages.length}\n`)

const width = Math.max(...rows.map((r) => r.name.length))
for (const r of rows) {
  const flags = []
  if (r.filterBarInert) flags.push('FILTERBAR-INERT')
  if (r.deadLocalStates.length > 0) flags.push(`DEAD-STATE: ${r.deadLocalStates.join(', ')}`)
  const status = flags.length ? `  ✗ ${flags.join(' | ')}` : '  ok'
  console.log(
    `${status.padEnd(flags.length ? 0 : 6)} ${r.name.padEnd(width)}  ` +
      `bar=${r.filterBar ? 'y' : '-'} store=${r.readsStore ? 'y' : '-'} ` +
      `local=${r.localStates} surfaces=${r.surfaces}`,
  )
}

console.log(`\n${rows.length - problems.length}/${rows.length} pages have all filter surfaces wired.`)
if (problems.length > 0) {
  console.log(`\n${problems.length} page(s) need attention:`)
  for (const p of problems) console.log(`  - ${p.name}`)
}
process.exit(problems.length > 0 ? 1 : 0)
