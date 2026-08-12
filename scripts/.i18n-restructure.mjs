/** One-shot: split the Marathi catalogue into reviewable parts. */
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MR = join(ROOT, 'src', 'i18n', 'mr')

for (const f of ['core', 'domains', 'data', 'pages', 'ai', 'trust']) {
  try { rmSync(join(MR, `${f}.ts`)) } catch { /* already gone */ }
}

const PARTS = 15
for (let i = 1; i <= PARTS; i += 1) {
  const n = String(i).padStart(2, '0')
  const file = join(MR, `part-${n}.ts`)
  if (readdirSync(MR).includes(`part-${n}.ts`)) continue
  writeFileSync(
    file,
    `/** Marathi catalogue, part ${n}. Keyed by the exact English source. */\nexport const MR_PART_${n}: Record<string, string> = {\n}\n`,
  )
}

const nums = Array.from({ length: PARTS }, (_, i) => String(i + 1).padStart(2, '0'))
writeFileSync(
  join(MR, 'index.ts'),
  `import { registerMessages } from '../locale'\n` +
    nums.map((n) => `import { MR_PART_${n} } from './part-${n}'`).join('\n') +
    `\n\n/**\n * The Marathi catalogue.\n *\n * Every entry is keyed by its exact English source, so a reviewer can read the\n * two languages side by side without resolving a key first, and a message with\n * no entry degrades to correct English rather than to a raw key on screen.\n *\n * Split into parts purely so the files stay reviewable - the catalogue is one\n * flat namespace, and registration order is the override order, later winning.\n * \`scripts/i18n-audit.mjs\` compares these keys against the strings the source\n * actually renders and fails on a gap in either direction, so the catalogue\n * cannot silently drift away from the interface it translates.\n */\n` +
    nums.map((n) => `registerMessages('mr', MR_PART_${n})`).join('\n') +
    '\n',
)

/* The tooling reads whatever parts exist rather than a fixed list. */
for (const p of ['scripts/i18n-keys.mjs', 'scripts/.i18n-chunks.mjs']) {
  const path = join(ROOT, p)
  let s = readFileSync(path, 'utf8')
  s = s.replace(
    "  const cat = readFileSync(join(SRC, 'i18n', 'mr', 'core.ts'), 'utf8')\n" +
      "  const files = ['core', 'domains', 'data', 'pages', 'ai', 'trust']\n" +
      '    .map((f) => readFileSync(join(SRC, \'i18n\', \'mr\', `${f}.ts`), \'utf8\'))\n' +
      "    .join('\\n')",
    "  const dir = join(SRC, 'i18n', 'mr')\n" +
      "  const files = readdirSync(dir).filter((f) => f.startsWith('part-'))\n" +
      '    .map((f) => readFileSync(join(dir, f), \'utf8\')).join(\'\\n\')',
  )
  s = s.replace('  void cat\n', '')
  s = s.replace(
    "for (const f of ['core', 'domains', 'data', 'pages', 'ai', 'trust']) {\n" +
      '  const text = readFileSync(join(ROOT, \'src\', \'i18n\', \'mr\', `${f}.ts`), \'utf8\')',
    "const MR_DIR = join(ROOT, 'src', 'i18n', 'mr')\n" +
      "for (const f of readdirSync(MR_DIR).filter((x) => x.startsWith('part-'))) {\n" +
      '  const text = readFileSync(join(MR_DIR, f), \'utf8\')',
  )
  s = s.replace(
    "import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'",
    "import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'",
  )
  s = s.replace(
    "import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'",
    "import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'",
  )
  writeFileSync(path, s)
}

console.log(`catalogue split into ${PARTS} parts; tooling now globs part-*.ts`)
