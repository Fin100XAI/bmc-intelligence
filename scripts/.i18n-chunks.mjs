/** One-shot: dump the message inventory in translation-order chunks. */
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectKeys } from './i18n-keys.mjs'
import { readCatalogue } from './i18n-catalogue.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'scripts', '.i18n-chunks')
mkdirSync(OUT, { recursive: true })

const PRIORITY = [
  'config', 'components', 'types', 'utils', 'stores', 'security', 'governance',
  'services', 'features', 'auth', 'app', 'evidence', 'routes', 'workflows',
  'domains', 'data', 'ai', 'pages',
]

const keys = collectKeys()
const rows = [...keys.entries()].map(([message, e]) => ({ message, count: e.count, areas: [...e.areas] }))

const rank = (r) => Math.min(...r.areas.map((a) => { const i = PRIORITY.indexOf(a); return i < 0 ? 99 : i }))
rows.sort((a, b) => rank(a) - rank(b) || b.count - a.count || a.message.localeCompare(b.message))

/** Already-translated keys are skipped so re-runs only surface what is left. */
const have = new Set(readCatalogue().keys())

const todo = rows.filter((r) => !have.has(r.message))
const SIZE = Number(process.argv[2] ?? 420)
let n = 0
for (let i = 0; i < todo.length; i += SIZE) {
  n += 1
  const slice = todo.slice(i, i + SIZE)
  writeFileSync(
    join(OUT, `chunk-${String(n).padStart(2, '0')}.txt`),
    slice.map((r) => JSON.stringify(r.message)).join('\n') + '\n',
  )
}
console.log(`${todo.length} messages left -> ${n} chunks of ${SIZE} in scripts/.i18n-chunks/`)
