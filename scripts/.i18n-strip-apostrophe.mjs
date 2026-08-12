/**
 * One-shot: drop `&apos;` from Marathi VALUES.
 *
 * In the English source the entity is a possessive marker — `the ward&apos;s
 * susceptibility`. Marathi carries possession as a case ending on the noun
 * (प्रभागाची), with no slot for an apostrophe, so an entity carried through
 * lands in the middle of a word: `प्रभागा&apos;ची`. Two of the five catalogue
 * authors kept it and three dropped it; dropping is correct.
 *
 * Keys are untouched — the key is the English source string and must match
 * byte for byte. `&quot;` is untouched too: a quoted term is quoted in Marathi
 * as well.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MR = join(ROOT, 'src', 'i18n', 'mr')

let total = 0
for (const file of readdirSync(MR).filter((f) => f.startsWith('part-'))) {
  const path = join(MR, file)
  const source = readFileSync(path, 'utf8')
  if (!source.includes('&apos;')) continue
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  const edits = []
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
      const value = node.initializer.text
      if (value.includes('&apos;') && /[ऀ-ॿ]/.test(value)) {
        const cleaned = value.replace(/&apos;/g, '')
        edits.push({
          start: node.initializer.getStart(sf),
          end: node.initializer.getEnd(),
          text: `'${cleaned.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`,
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
  console.log(`${file}: ${edits.length} values cleaned`)
}
console.log(`${total} total`)
