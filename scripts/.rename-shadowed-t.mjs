/**
 * One-shot: rename every local binding named `t` that shadows the translator
 * import. Scope-accurate via the TypeScript checker, not text substitution.
 *
 * A translator call inside a shadowed scope (`t('…')`) is left as `t` on
 * purpose - once the local binding is renamed, that identifier resolves to the
 * import again, which is what it was always meant to mean.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const config = ts.getParsedCommandLineOfConfigFile(join(ROOT, 'tsconfig.app.json'), {}, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (d) => {
    throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'))
  },
})
const program = ts.createProgram(config.fileNames, config.options)
const checker = program.getTypeChecker()

const RESERVED = new Set(['t', 'tn', 'if', 'in', 'of', 'do', 'for', 'new', 'var', 'let', 'try'])

/** A readable name for a binding, taken from what it actually holds. */
function deriveName(decl, sf, used) {
  const candidates = []

  const typeName = checker.typeToString(checker.getTypeAtLocation(decl.name))
    .replace(/\[\]$/, '')
    .replace(/<.*>$/, '')
    .replace(/\s*\|\s*(undefined|null)$/, '')
    .trim()
  if (/^[A-Z][A-Za-z0-9]*$/.test(typeName)) {
    candidates.push(typeName.charAt(0).toLowerCase() + typeName.slice(1))
  }

  // `xs.map((t) => …)` -> the singular of `xs`.
  const call = decl.parent?.parent
  if (call && ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression)) {
    const subject = call.expression.expression.getText(sf).split('.').pop() ?? ''
    const bare = subject.replace(/^[A-Z_]+$/, (s) => s.toLowerCase()).replace(/s$/, '')
    if (/^[a-z][A-Za-z0-9]*$/.test(bare) && bare.length > 1) candidates.push(bare)
  }

  candidates.push('entry', 'item', 'row', 'record')
  for (const c of candidates) {
    if (!RESERVED.has(c) && !used.has(c)) return c
  }
  return `entry${used.size}`
}

let filesChanged = 0
let renamed = 0

/** Identifiers declared at the top level of a file - never safe to shadow. */
function moduleScopeNames(sf) {
  const names = new Set()
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause) {
      if (st.importClause.name) names.add(st.importClause.name.text)
      const b = st.importClause.namedBindings
      if (b && ts.isNamedImports(b)) for (const el of b.elements) names.add(el.name.text)
      if (b && ts.isNamespaceImport(b)) names.add(b.name.text)
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text)
    }
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) names.add(st.name.text)
  }
  return names
}

/** The function that owns a binding - the scope a new name must be free in. */
function owningFunction(node) {
  let p = node.parent
  while (p) {
    if (
      ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isFunctionDeclaration(p) ||
      ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isConstructorDeclaration(p)
    ) return p
    p = p.parent
  }
  return null
}

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue
  const rel = relative(ROOT, sf.fileName)
  if (!rel.startsWith('src/') || rel.startsWith('src/i18n/')) continue
  // Only files that actually import the translator can shadow it.
  if (!/^import \{[^}]*\bt\b[^}]*\} from '@\/i18n'/m.test(sf.text)) continue

  const moduleNames = moduleScopeNames(sf)

  /** Local declarations of `t`, and the symbol each one introduces. */
  const decls = []
  const collect = (node) => {
    if (
      (ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node)) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 't'
    ) {
      const sym = checker.getSymbolAtLocation(node.name)
      if (sym) decls.push({ decl: node, sym })
    }
    ts.forEachChild(node, collect)
  }
  collect(sf)
  if (decls.length === 0) continue

  const newNames = new Map()
  for (const { decl, sym } of decls) {
    /* A sibling scope may reuse a name freely, so uniqueness is checked
       against the owning function's own identifiers rather than the whole
       file - otherwise the second `.map((t) => …)` in a chain gets a
       needlessly numbered name. */
    const owner = owningFunction(decl)
    const used = new Set(moduleNames)
    if (owner) {
      const walk = (n) => {
        if (ts.isIdentifier(n) && n.text !== 't') used.add(n.text)
        ts.forEachChild(n, walk)
      }
      walk(owner)
    }
    const name = deriveName(decl, sf, used)
    newNames.set(sym, name)
  }

  const edits = []
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === 't') {
      // A translator call. Leave it alone - it will bind to the import once
      // the local declaration below it has been renamed.
      const parent = node.parent
      const isTranslatorCall =
        parent && ts.isCallExpression(parent) && parent.expression === node &&
        parent.arguments.length > 0 && ts.isStringLiteral(parent.arguments[0])
      if (!isTranslatorCall) {
        const sym = checker.getSymbolAtLocation(node)
        const name = sym ? newNames.get(sym) : undefined
        if (name) {
          if (ts.isShorthandPropertyAssignment(node.parent)) {
            throw new Error(`shorthand { t } in ${rel} - refusing to rename`)
          }
          edits.push({ start: node.getStart(sf), end: node.getEnd(), name })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (edits.length === 0) continue

  let out = readFileSync(sf.fileName, 'utf8')
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.name + out.slice(e.end)
  }
  writeFileSync(sf.fileName, out)
  filesChanged += 1
  renamed += edits.length
  console.log(`${rel}: ${edits.length} references -> ${[...new Set(edits.map((e) => e.name))].join(', ')}`)
}

console.log(`\n${renamed} references renamed across ${filesChanged} files`)
