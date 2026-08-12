#!/usr/bin/env node
/**
 * scripts/i18n-frozen.mjs
 *
 * Finds `t()` calls that run at MODULE SCOPE.
 *
 * A translation evaluated while a module is first imported is frozen in
 * whatever language was active at that moment. Every such call therefore has
 * to sit inside a layer that `rebuildAllLayers()` replays, or inside a
 * function that runs per render - otherwise switching to Marathi leaves that
 * one label in English, which is the failure mode a language toggle is
 * judged on.
 *
 * This is the gate for that. `--list` names every offending declaration.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const LIST = process.argv.includes('--list')

const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(p)) files.push(p)
  }
})(SRC)
files.sort()

const byFile = new Map()
let total = 0

for (const file of files) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const rel = relative(ROOT, file)

  /** True when a node is inside something that re-runs after a rebuild. */
  const isDeferred = (node) => {
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

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === 't' || node.expression.text === 'tn') &&
      !isDeferred(node)
    ) {
      total += 1
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
      // Name the declaration it belongs to, which is what has to be made live.
      let owner = '(top level)'
      let p = node.parent
      while (p) {
        if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) { owner = p.name.text; break }
        p = p.parent
      }
      const list = byFile.get(rel) ?? []
      list.push({ line, owner })
      byFile.set(rel, list)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

const rows = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)
for (const [file, hits] of rows) {
  const owners = [...new Set(hits.map((h) => h.owner))]
  console.log(`${String(hits.length).padStart(5)}  ${file}`)
  if (LIST) for (const o of owners) console.log(`         ${o}`)
}
console.log(`\n${total} module-scope translations across ${rows.length} files`)
process.exitCode = total > 0 ? 1 : 0
