/**
 * One-shot: take identifier-shaped messages back out of `t()`.
 *
 * A sweep wrapped `t('ward-{0}', code)` — the function that BUILDS A WARD ID.
 * Translating it renamed every ward to `प्रभाग-a`, which re-seeded the entire
 * municipal picture: `scripts/smoke-i18n.mjs` caught it as "no figure moves"
 * failing, which is exactly what that check is for.
 *
 * The codemod's `isCopy` now rejects this shape, so the sweep will not
 * reintroduce them; this removes the ones already written.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

/** `ward-{0}`, `q-{0}-{1}-{2}`, `v{0}.{1}` — a kebab identifier with holes. */
function isIdentifierShape(text) {
  return /^[a-z0-9]+([-._/][a-z0-9]+)+$/i.test(text.replace(/\{\d+\}/g, '0'))
}

const files = []
;(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (p.startsWith(join(SRC, 'i18n'))) continue
    statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && files.push(p)
  }
})(SRC)

let total = 0
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  if (!source.includes("t('")) continue
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  const edits = []
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 't' &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0]) &&
      isIdentifierShape(node.arguments[0].text)
    ) {
      const message = node.arguments[0].text
      const args = node.arguments.slice(1).map((a) => a.getText(sf))
      /* Put the template literal back exactly as it was written. */
      const restored =
        args.length === 0
          ? `'${message}'`
          : '`' + message.replace(/\{(\d+)\}/g, (_, i) => `\${${args[Number(i)]}}`) + '`'
      edits.push({ start: node.getStart(sf), end: node.getEnd(), text: restored, message })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (edits.length === 0) continue

  let out = source
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }
  writeFileSync(file, out)
  total += edits.length
  console.log(`${relative(ROOT, file)}: ${edits.length} — ${edits.map((e) => e.message).join(', ')}`)
}
console.log(`${total} identifier-shaped messages restored`)
