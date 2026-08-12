#!/usr/bin/env node
/**
 * scripts/i18n-keys.mjs
 *
 * The definitive list of messages the platform asks `t()` for, read from the
 * call sites themselves rather than inferred from the source shape. This is
 * what the Marathi catalogue is written against and what `i18n-audit.mjs`
 * measures coverage over.
 *
 *   node scripts/i18n-keys.mjs                 # summary
 *   node scripts/i18n-keys.mjs --json out.json # full inventory
 *   node scripts/i18n-keys.mjs --missing       # keys with no Marathi yet
 *   node scripts/i18n-keys.mjs --missing --area=pages
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { argv } from 'node:process'
import ts from 'typescript'
import { readCatalogue } from './i18n-catalogue.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

export function collectKeys() {
  const files = []
  ;(function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (p.startsWith(join(SRC, 'i18n'))) continue
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p)) files.push(p)
    }
  })(SRC)
  files.sort()

  /** message -> { count, areas:Set, first } */
  const keys = new Map()
  for (const file of files) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const rel = relative(ROOT, file)
    const area = rel.split('/')[1] ?? 'src'
    const visit = (node) => {
      if (
        ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        (node.expression.text === 't' || node.expression.text === 'tn')
      ) {
        for (const arg of node.arguments) {
          if (!ts.isStringLiteral(arg)) continue
          const e = keys.get(arg.text) ?? { count: 0, areas: new Set(), first: rel }
          e.count += 1
          e.areas.add(area)
          keys.set(arg.text, e)
          if (node.expression.text === 't') break // only the first arg is the message
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return keys
}

/* CLI only. Importing this module must not print anything - `i18n-audit.mjs`
   and `.i18n-chunks.mjs` both consume `collectKeys` as a library. */
const RUN_AS_CLI = fileURLToPath(import.meta.url) === (argv[1] ?? '')
if (!RUN_AS_CLI) { /* library use */ } else {

const keys = collectKeys()
const rows = [...keys.entries()]
  .map(([message, e]) => ({ message, count: e.count, areas: [...e.areas], first: e.first }))
  .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message))

const jsonFlag = process.argv.find((a) => a.startsWith('--json'))
const areaFlag = process.argv.find((a) => a.startsWith('--area='))?.slice(7)
const filtered = areaFlag ? rows.filter((r) => r.areas.includes(areaFlag)) : rows

if (process.argv.includes('--missing')) {
  const have = new Set(readCatalogue().keys())
  const missing = filtered.filter((r) => !have.has(r.message))
  for (const r of missing) console.log(JSON.stringify(r.message))
  console.error(`\n${missing.length} of ${filtered.length} messages have no Marathi yet`)
} else if (jsonFlag) {
  const out = jsonFlag.includes('=') ? jsonFlag.split('=')[1] : join(ROOT, 'scripts', '.i18n-keys.json')
  writeFileSync(out, JSON.stringify(rows, null, 2))
  console.log(`wrote ${rows.length} messages -> ${relative(ROOT, out)}`)
} else {
  const byArea = new Map()
  for (const r of rows) for (const a of r.areas) byArea.set(a, (byArea.get(a) ?? 0) + 1)
  console.log(`distinct messages   ${rows.length}`)
  console.log(`total call sites    ${rows.reduce((n, r) => n + r.count, 0)}`)
  console.log(`words               ${rows.reduce((n, r) => n + r.message.split(/\s+/).length, 0)}`)
  console.log(`\nby area:`)
  for (const [a, n] of [...byArea].sort((x, y) => y[1] - x[1])) console.log(`  ${a.padEnd(14)} ${n}`)
  const buckets = { '1 word': 0, '2-4 words': 0, '5-8 words': 0, '9-20 words': 0, '20+ words': 0 }
  for (const r of rows) {
    const w = r.message.split(/\s+/).length
    if (w === 1) buckets['1 word'] += 1
    else if (w <= 4) buckets['2-4 words'] += 1
    else if (w <= 8) buckets['5-8 words'] += 1
    else if (w <= 20) buckets['9-20 words'] += 1
    else buckets['20+ words'] += 1
  }
  console.log(`\nby length:`)
  for (const [b, n] of Object.entries(buckets)) console.log(`  ${b.padEnd(14)} ${n}`)
}

}
