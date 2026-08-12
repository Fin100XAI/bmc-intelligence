/**
 * One-shot: remove catalogue entries no call site asks for.
 *
 * These accumulate when a string stops being routed through `t()` — here, the
 * 93 upstream schema field names (`ward_code`, `rainfall_mm_24h`) that a sweep
 * wrapped and a later correction unwrapped. The catalogue still carried a
 * self-mapping for each. Dead weight in a translation file is how it drifts
 * away from the interface it translates, so the audit gates on it.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { collectKeys } from './i18n-keys.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MR = join(ROOT, 'src', 'i18n', 'mr')
const used = collectKeys()

let total = 0
for (const file of readdirSync(MR).filter((f) => f.startsWith('part-'))) {
  const path = join(MR, file)
  const source = readFileSync(path, 'utf8')
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  const removals = []
  const visit = (node) => {
    if (ts.isPropertyAssignment(node)) {
      const key =
        ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null
      if (key !== null && !used.has(key)) {
        /* Start at the property itself, NOT its full start: leading trivia
           belongs to the preceding line, and consuming it made two adjacent
           removals overlap and eat each other's quotes. */
        const start = node.getStart(sf)
        let end = node.getEnd()
        if (source[end] === ',') end += 1
        while (end < source.length && (source[end] === ' ' || source[end] === '\r')) end += 1
        if (source[end] === '\n') end += 1
        removals.push({ start, end, key })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (removals.length === 0) continue

  /* Belt and braces: never apply two ranges that touch. */
  const ordered = removals.sort((a, b) => a.start - b.start)
  const safe = []
  let lastEnd = -1
  for (const r of ordered) {
    if (r.start < lastEnd) continue
    safe.push(r)
    lastEnd = r.end
  }

  let out = source
  for (const r of safe.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, r.start) + out.slice(r.end)
  }
  out = out.replace(/^[ \t]+$/gm, '')
  // Collapse any run of blank lines the removals opened up.
  out = out.replace(/\n{3,}/g, '\n\n')
  writeFileSync(path, out)
  total += safe.length
  console.log(`${file}: ${safe.length} orphaned entries removed`)
}
console.log(`${total} total`)
