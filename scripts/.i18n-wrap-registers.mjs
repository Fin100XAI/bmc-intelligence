/**
 * One-shot: route the ward and department REGISTERS through `t()`.
 *
 * `name` and `shortName` were held back from the general codemod because those
 * keys carry identifiers as often as they carry copy. In these two files they
 * carry neither — they are the names of the institution's own divisions, which
 * are the most-read words in the platform and which the corporation itself
 * publishes in Marathi.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TARGETS = [
  { file: 'src/data/reference.ts', keys: new Set(['name', 'shortName']) },
  { file: 'src/data/geography.ts', keys: new Set(['name']) },
]

function quote(text) {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function isCopy(s) {
  if (s.trim().length < 2) return false
  if (!/[A-Za-z]/.test(s)) return false
  if (/^[a-z0-9]+([-.][a-z0-9]+)+$/.test(s)) return false // kebab / dotted id
  if (/^[a-z][a-zA-Z0-9]*$/.test(s) && s.length < 24) return false
  return true
}

let total = 0
for (const { file, keys } of TARGETS) {
  const path = join(ROOT, file)
  const source = readFileSync(path, 'utf8')
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const edits = []

  const inTranslator = (node) => {
    let p = node.parent
    while (p) {
      if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 't') return true
      p = p.parent
    }
    return false
  }

  const visit = (node) => {
    if (ts.isPropertyAssignment(node)) {
      const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null
      if (key && keys.has(key) && !inTranslator(node)) {
        const v = node.initializer
        if (ts.isStringLiteral(v) && isCopy(v.text)) {
          edits.push({ start: v.getStart(sf), end: v.getEnd(), text: `t(${quote(v.text)})` })
        } else if (ts.isTemplateExpression(v)) {
          // `${city} Fire Brigade` -> t('{0} Fire Brigade', city)
          let message = v.head.text
          const args = []
          v.templateSpans.forEach((span, i) => {
            message += `{${i}}${span.literal.text}`
            args.push(span.expression.getText(sf))
          })
          if (isCopy(message.replace(/\{\d+\}/g, ' '))) {
            edits.push({
              start: v.getStart(sf),
              end: v.getEnd(),
              text: `t(${[quote(message), ...args].join(', ')})`,
            })
          }
        }
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
  if (!/^import \{[^}]*\bt\b[^}]*\} from '@\/i18n'/m.test(out)) {
    const imports = sf.statements.filter(ts.isImportDeclaration)
    const anchor = source.slice(imports[imports.length - 1].getStart(sf), imports[imports.length - 1].getEnd())
    const at = out.indexOf(anchor) + anchor.length
    out = `${out.slice(0, at)}\nimport { t } from '@/i18n'${out.slice(at)}`
  }
  writeFileSync(path, out)
  total += edits.length
  console.log(`${file}: ${edits.length} register names routed through t()`)
}
console.log(`${total} total`)
