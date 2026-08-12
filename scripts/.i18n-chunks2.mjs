/**
 * One-shot: chunk the messages the SECOND codemod pass exposed, excluding the
 * two chunks a translation agent is still working through.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectKeys } from './i18n-keys.mjs'
import { readCatalogue } from './i18n-catalogue.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'scripts', '.i18n-chunks2')
const IN_FLIGHT = ['chunk-03.txt', 'chunk-04.txt']

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const claimed = new Set()
for (const f of IN_FLIGHT) {
  const text = readFileSync(join(ROOT, 'scripts', '.i18n-chunks', f), 'utf8')
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    claimed.add(JSON.parse(line))
  }
}

const have = new Set(readCatalogue().keys())
const keys = collectKeys()

const PRIORITY = [
  'config', 'components', 'types', 'utils', 'stores', 'security', 'governance',
  'services', 'features', 'auth', 'app', 'evidence', 'routes', 'workflows',
  'domains', 'data', 'ai', 'pages',
]
const rank = (areas) => Math.min(...areas.map((a) => { const i = PRIORITY.indexOf(a); return i < 0 ? 99 : i }))

const todo = [...keys.entries()]
  .filter(([k]) => !have.has(k) && !claimed.has(k))
  .map(([message, e]) => ({ message, count: e.count, areas: [...e.areas] }))
  .sort((a, b) => rank(a.areas) - rank(b.areas) || b.count - a.count || a.message.localeCompare(b.message))

const SIZE = Number(process.argv[2] ?? 400)
let n = 0
for (let i = 0; i < todo.length; i += SIZE) {
  n += 1
  writeFileSync(
    join(OUT, `chunk-${String(n).padStart(2, '0')}.txt`),
    todo.slice(i, i + SIZE).map((r) => JSON.stringify(r.message)).join('\n') + '\n',
  )
}
console.log(`${todo.length} messages (excluding ${claimed.size} in flight) -> ${n} chunks in scripts/.i18n-chunks2/`)
console.log(readdirSync(OUT).join(' '))
