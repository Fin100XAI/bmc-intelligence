/**
 * scripts/i18n-catalogue.mjs
 *
 * Reads the Marathi catalogue the same way the application does - by parsing
 * the part files - so the tooling and the runtime can never disagree about
 * which messages are covered.
 *
 * Parsed with the TypeScript AST rather than a regular expression: a key may
 * be a quoted string or a bare identifier (`Settings:`), a value may be a
 * concatenation across lines, and either may contain an escaped quote. A
 * regex that got any of those wrong would silently under-report coverage,
 * which is the one failure this file exists to prevent.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MR_DIR = join(ROOT, 'src', 'i18n', 'mr')

/** @returns {Map<string, string>} English source -> Marathi. */
export function readCatalogue() {
  const entries = new Map()
  const files = readdirSync(MR_DIR).filter((f) => f.startsWith('part-') && f.endsWith('.ts')).sort()

  for (const file of files) {
    const path = join(MR_DIR, file)
    const sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

    const literalOf = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
      // `'a' + 'b'` — an entry wrapped across lines.
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = literalOf(node.left)
        const right = literalOf(node.right)
        return left !== null && right !== null ? left + right : null
      }
      return null
    }

    const visit = (node) => {
      if (ts.isPropertyAssignment(node)) {
        const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name)
          ? node.name.text
          : null
        const value = literalOf(node.initializer)
        if (key !== null && value !== null) entries.set(key, value)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return entries
}

export function catalogueFiles() {
  return readdirSync(MR_DIR).filter((f) => f.startsWith('part-') && f.endsWith('.ts')).sort()
}
