/** One-shot: which rendered-English phrases never reached t(), and where they live. */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { collectKeys } from './i18n-keys.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

const phrases = process.argv.slice(2)
const keys = collectKeys()

const files = []
;(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (p.startsWith(join(SRC, 'i18n'))) continue
    statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && files.push(p)
  }
})(SRC)

/** Every string literal NOT already inside a t() call, with its property key. */
const literals = new Map()
for (const file of files) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const inT = (n) => {
    let p = n.parent
    while (p) {
      if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && (p.expression.text === 't' || p.expression.text === 'tn')) return true
      p = p.parent
    }
    return false
  }
  const visit = (n) => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !inT(n) && /[A-Za-z]{3}/.test(n.text)) {
      let context = '(bare)'
      const p = n.parent
      if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) context = `${p.name.text}:`
      else if (ts.isArrayLiteralExpression(p)) {
        const gp = p.parent
        if (ts.isPropertyAssignment(gp) && (ts.isIdentifier(gp.name) || ts.isStringLiteral(gp.name))) context = `${gp.name.text}: [ ]`
        else if (ts.isVariableDeclaration(gp) && ts.isIdentifier(gp.name)) context = `${gp.name.text} = [ ]`
      } else if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) context = `${p.name.text} =`
      else if (ts.isJsxAttribute(p.parent ?? {}) || ts.isJsxAttribute(p)) context = 'jsx attr'
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
      const list = literals.get(n.text) ?? []
      list.push({ file: relative(ROOT, file), line, context })
      literals.set(n.text, list)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

/* Group the unwrapped literals by the property key they sit under, so the fix
   is a key-list change rather than 300 individual edits. */
const byContext = new Map()
for (const [text, sites] of literals) {
  if (keys.has(text)) continue // already translated somewhere else
  for (const s of sites) {
    const bucket = byContext.get(s.context) ?? { count: 0, files: new Set(), sample: [] }
    bucket.count += 1
    bucket.files.add(s.file.split('/').slice(0, 2).join('/'))
    if (bucket.sample.length < 3) bucket.sample.push(text)
    byContext.set(s.context, bucket)
  }
}

const rows = [...byContext.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 40)
console.log('Unwrapped string literals, grouped by the property they sit under:\n')
for (const [context, b] of rows) {
  console.log(`${String(b.count).padStart(5)}  ${context.padEnd(22)} ${[...b.files].slice(0, 3).join(' ')}`)
  console.log(`       e.g. ${b.sample.map((s) => JSON.stringify(s.slice(0, 60))).join(', ')}`)
}

if (phrases.length > 0) {
  console.log('\nRequested phrases:')
  for (const phrase of phrases) {
    const sites = literals.get(phrase)
    console.log(`  ${JSON.stringify(phrase)} -> ${sites ? sites.map((s) => `${s.file}:${s.line} ${s.context}`).join('; ') : 'NOT A LITERAL (composed at runtime)'}`)
  }
}
