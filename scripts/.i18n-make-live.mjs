/**
 * One-shot: put module-scope constants that carry translated text into the
 * layer-rebuild chain, using the pattern the data layers already use.
 *
 *   export const DOMAIN_LABEL: Record<K, string> = { water: t('Water') }
 *
 * becomes
 *
 *   function build$DOMAIN_LABEL(): Record<K, string> { return { water: t('Water') } }
 *   export let DOMAIN_LABEL: Record<K, string> = build$DOMAIN_LABEL()
 *   registerLayer(() => { DOMAIN_LABEL = build$DOMAIN_LABEL() })
 *
 * `export let` is an ESM live binding, so every consumer sees the rebuilt
 * value without changing a single import.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (p.startsWith(join(SRC, 'i18n'))) continue
    if (p === join(SRC, 'data', 'runtime.ts')) continue
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(p)) files.push(p)
  }
})(SRC)
files.sort()

const skipped = []
let changedFiles = 0
let changedDecls = 0

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  if (!/\bt\(/.test(source)) continue
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const rel = relative(ROOT, file)

  const inFunction = (node) => {
    let p = node.parent
    while (p) {
      if (
        ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p) ||
        ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isConstructorDeclaration(p)
      ) return true
      p = p.parent
    }
    return false
  }

  /** Statements that evaluate a translation while the module is being loaded. */
  const frozenStatements = new Set()
  const scan = (node) => {
    if (
      ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
      (node.expression.text === 't' || node.expression.text === 'tn') && !inFunction(node)
    ) {
      let p = node.parent
      while (p && p.parent !== sf) p = p.parent
      if (p) frozenStatements.add(p)
    }
    ts.forEachChild(node, scan)
  }
  scan(sf)
  if (frozenStatements.size === 0) continue

  const edits = []
  for (const stmt of frozenStatements) {
    if (!ts.isVariableStatement(stmt)) {
      skipped.push(`${rel}:${sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line + 1} ${ts.SyntaxKind[stmt.kind]}`)
      continue
    }
    const decls = stmt.declarationList.declarations
    if (decls.length !== 1 || !ts.isIdentifier(decls[0].name) || !decls[0].initializer) {
      skipped.push(`${rel}:${sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line + 1} (shape)`)
      continue
    }
    const decl = decls[0]
    const name = decl.name.text
    const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ? 'export ' : ''
    const annotation = decl.type ? `: ${decl.type.getText(sf)}` : ''
    const init = decl.initializer.getText(sf)
    const builder = `build$${name}`

    edits.push({
      start: stmt.getStart(sf),
      end: stmt.getEnd(),
      text:
        `function ${builder}()${annotation} {\n  return ${init}\n}\n` +
        `${exported}let ${name}${annotation || `: ReturnType<typeof ${builder}>`} = ${builder}()\n` +
        `registerLayer(() => {\n  ${name} = ${builder}()\n})`,
    })
    changedDecls += 1
  }
  if (edits.length === 0) continue

  let out = source
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }

  if (!/import \{[^}]*\bregisterLayer\b[^}]*\} from ['"][^'"]*runtime['"]/.test(out)) {
    const imports = sf.statements.filter(ts.isImportDeclaration)
    const anchorText = imports.length > 0
      ? source.slice(imports[imports.length - 1].getStart(sf), imports[imports.length - 1].getEnd())
      : null
    const spec = rel.startsWith('src/data/') ? './runtime' : '@/data/runtime'
    if (anchorText && out.includes(anchorText)) {
      const at = out.indexOf(anchorText) + anchorText.length
      out = `${out.slice(0, at)}\nimport { registerLayer } from '${spec}'${out.slice(at)}`
    } else {
      out = `import { registerLayer } from '${spec}'\n${out}`
    }
  }

  writeFileSync(file, out)
  changedFiles += 1
}

console.log(`${changedDecls} constants made live across ${changedFiles} files`)
if (skipped.length > 0) {
  console.log(`\n${skipped.length} not transformed (need a look):`)
  for (const s of skipped) console.log(`  ${s}`)
}
