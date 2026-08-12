/**
 * One-shot: take source citations back out of the translation surface.
 *
 * `CorporationSource.note` is a VERBATIM quotation of a published document -
 * a Census of India table, a Directorate of Municipal Administration listing,
 * a budget report - shown next to the URL it came from. Rendering a quotation
 * in another language attributes words to a source that never wrote them, so
 * these stay exactly as published. The label around them is translated; the
 * citation is not.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FILE = join(ROOT, 'src', 'config', 'corporations.ts')

const source = readFileSync(FILE, 'utf8')
const sf = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

const edits = []
const visit = (node) => {
  if (
    ts.isPropertyAssignment(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === 'note' &&
    ts.isCallExpression(node.initializer) &&
    ts.isIdentifier(node.initializer.expression) &&
    node.initializer.expression.text === 't' &&
    node.initializer.arguments.length === 1 &&
    ts.isStringLiteral(node.initializer.arguments[0])
  ) {
    const arg = node.initializer.arguments[0]
    edits.push({ start: node.initializer.getStart(sf), end: node.initializer.getEnd(), text: arg.getText(sf) })
  }
  ts.forEachChild(node, visit)
}
visit(sf)

let out = source
for (const e of edits.sort((a, b) => b.start - a.start)) {
  out = out.slice(0, e.start) + e.text + out.slice(e.end)
}
writeFileSync(FILE, out)
console.log(`${edits.length} source citations left in their published language`)
