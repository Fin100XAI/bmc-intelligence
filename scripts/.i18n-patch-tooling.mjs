/** One-shot: point the key/chunk tooling at the shared catalogue reader. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

let keys = readFileSync(join(ROOT, 'scripts', 'i18n-keys.mjs'), 'utf8')
keys = keys.replace(
  `  const dir = join(SRC, 'i18n', 'mr')
  const files = readdirSync(dir).filter((f) => f.startsWith('part-'))
    .map((f) => readFileSync(join(dir, f), 'utf8')).join('\\n')
  const have = new Set()
  for (const m of files.matchAll(/^\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")\\s*:/gm)) {
    have.add((m[1] ?? m[2] ?? '').replace(/\\\\'/g, "'").replace(/\\\\\\\\/g, '\\\\').replace(/\\\\n/g, '\\n'))
  }`,
  `  const have = new Set(readCatalogue().keys())`,
)
keys = keys.replace(
  "import ts from 'typescript'",
  "import ts from 'typescript'\nimport { readCatalogue } from './i18n-catalogue.mjs'",
)
writeFileSync(join(ROOT, 'scripts', 'i18n-keys.mjs'), keys)

let chunks = readFileSync(join(ROOT, 'scripts', '.i18n-chunks.mjs'), 'utf8')
chunks = chunks.replace(
  `const have = new Set()
const MR_DIR = join(ROOT, 'src', 'i18n', 'mr')
for (const f of readdirSync(MR_DIR).filter((x) => x.startsWith('part-'))) {
  const text = readFileSync(join(MR_DIR, f), 'utf8')
  for (const m of text.matchAll(/^\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")\\s*:/gm)) {
    have.add((m[1] ?? m[2] ?? '').replace(/\\\\'/g, "'").replace(/\\\\\\\\/g, '\\\\').replace(/\\\\n/g, '\\n'))
  }
}`,
  `const have = new Set(readCatalogue().keys())`,
)
chunks = chunks.replace(
  "import { collectKeys } from './i18n-keys.mjs'",
  "import { collectKeys } from './i18n-keys.mjs'\nimport { readCatalogue } from './i18n-catalogue.mjs'",
)
writeFileSync(join(ROOT, 'scripts', '.i18n-chunks.mjs'), chunks)

console.log('tooling now reads the catalogue through the AST')
