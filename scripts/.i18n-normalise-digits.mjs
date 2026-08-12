/**
 * One-shot: normalise Devanagari digits in Marathi VALUES to Latin.
 *
 * The formatting layer pins `mr-IN-u-nu-latn`, so every figure the platform
 * COMPUTES is rendered in Latin digits — Government of Maharashtra practice is
 * Marathi words with Latin figures, because an officer reconciles this screen
 * against source systems that print Latin. A catalogue that writes "१२ महिने"
 * in a fixed label while the tile beside it computes "12" is inconsistent on
 * the same screen. Latin wins, everywhere.
 *
 * Keys are untouched: a key is the English source and must match byte for byte.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MR = join(ROOT, 'src', 'i18n', 'mr')
const DEVANAGARI_DIGITS = '०१२३४५६७८९'

function toLatinDigits(text) {
  return text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
}

let total = 0
for (const file of readdirSync(MR).filter((f) => f.startsWith('part-'))) {
  const path = join(MR, file)
  const source = readFileSync(path, 'utf8')
  if (!/[०-९]/.test(source)) continue
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  const edits = []
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
      const value = node.initializer.text
      if (/[०-९]/.test(value)) {
        edits.push({
          start: node.initializer.getStart(sf),
          end: node.initializer.getEnd(),
          text: `'${toLatinDigits(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (edits.length === 0) continue

  let out = source
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }
  writeFileSync(path, out)
  total += edits.length
  console.log(`${file}: ${edits.length} values normalised`)
}
console.log(`${total} total`)
