#!/usr/bin/env node
/**
 * scripts/i18n-extract.mjs
 *
 * Walks every source file with the TypeScript AST and reports every
 * user-visible English string in the platform, with the file and line it
 * appears on and how often it recurs.
 *
 * This is the inventory the Marathi dictionary is written against. It is a
 * *measurement* tool - it never edits source. `i18n-audit.mjs` is the gate
 * that fails a build; this one exists to size and slice the work.
 *
 *   node scripts/i18n-extract.mjs            # summary
 *   node scripts/i18n-extract.mjs --json     # full inventory as JSON
 *   node scripts/i18n-extract.mjs --list     # one string per line, by frequency
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

/* JSX attributes whose string value is rendered to, or read out to, a human. */
export const TEXT_ATTRS = new Set([
  'title', 'label', 'description', 'placeholder', 'content', 'eyebrow', 'subtitle',
  'heading', 'header', 'caption', 'hint', 'note', 'alt', 'summary', 'text', 'tooltip',
  'aria-label', 'aria-description', 'aria-placeholder', 'aria-roledescription', 'aria-valuetext',
  'emptyLabel', 'emptyMessage', 'emptyTitle', 'loadingLabel', 'errorLabel', 'actionLabel',
  'confirmLabel', 'cancelLabel', 'submitLabel', 'unit', 'suffix', 'prefix', 'legend',
  'name', 'helper', 'helperText', 'message', 'reason', 'rationale', 'statement', 'body',
  'question', 'answer', 'value', 'valueLabel', 'footnote', 'badge', 'stateLabel', 'cityName',
])

/* Object-literal keys whose string value ends up on screen. */
export const TEXT_KEYS = new Set([
  'label', 'name', 'title', 'description', 'summary', 'heading', 'subheading', 'caption',
  'rationale', 'statement', 'note', 'notes', 'text', 'body', 'question', 'answer',
  'headline', 'hint', 'detail', 'details', 'reason', 'purpose', 'shortName', 'longName',
  'displayName', 'message', 'placeholder', 'tooltip', 'helper', 'helperText', 'legend',
  'unit', 'suffix', 'prefix', 'eyebrow', 'subtitle', 'emptyLabel', 'actionLabel',
  'bullets', 'points', 'items', 'lines', 'steps', 'examples', 'limitations', 'caveats',
  'implication', 'implications', 'recommendation', 'recommendations', 'finding', 'findings',
  'guidance', 'definition', 'meaning', 'basis', 'method', 'methodology', 'scope', 'scopeLabel',
  'question', 'prompt', 'context', 'outcome', 'impact', 'objective', 'criterion', 'criteria',
  'category', 'statusLabel', 'stateLabel', 'severityLabel', 'freshnessLabel',
  'dataFreshnessLabel', 'confidenceRationale', 'source', 'sources', 'owner', 'ownerRole',
  'designation', 'role', 'department', 'ward', 'group', 'section', 'tab', 'columnLabel',
])

/** Strings that are code, not copy. */
function isCopy(raw) {
  const s = raw.trim()
  if (s.length < 2) return false
  if (!/[A-Za-z]/.test(s)) return false
  // Tailwind / CSS class soup, css values, urls, paths, ids, enum members.
  if (/^[a-z0-9-]+(\s+[a-z0-9:[\]/.%_-]+)*$/.test(s) && /(^|\s)(flex|grid|text-|bg-|border-|rounded|px-|py-|gap-|mt-|mb-|w-|h-|min-|max-|font-|shadow|hover:|sm:|md:|lg:|xl:)/.test(s)) return false
  if (/^(https?:|mailto:|\/|\.\/|@\/|#)/.test(s)) return false
  if (/^[a-z][a-zA-Z0-9]*$/.test(s) && s.length < 24) return false            // camelCase identifier
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(s)) return false                        // kebab enum
  if (/^[A-Z0-9_]+$/.test(s) && s.length < 32) return false                   // CONST_CASE
  if (/^[0-9\s.,%+/()₹-]+$/.test(s)) return false                             // pure numeric
  if (/^(rgb|hsl|#[0-9a-f]{3,8}|var\(|calc\()/i.test(s)) return false
  return true
}

const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(p)) files.push(p)
  }
})(SRC)
files.sort()

/** message -> { count, files:Set, kinds:Set, sample } */
const inventory = new Map()

function record(message, file, kind, line) {
  const key = message
  let e = inventory.get(key)
  if (!e) {
    e = { count: 0, files: new Set(), kinds: new Set(), first: `${relative(ROOT, file)}:${line}` }
    inventory.set(key, e)
  }
  e.count += 1
  e.files.add(relative(ROOT, file))
  e.kinds.add(kind)
}

/** Turns a template literal into a message with {0}, {1} … placeholders. */
export function templateToMessage(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  let out = node.head.text
  node.templateSpans.forEach((span, i) => {
    out += `{${i}}` + span.literal.text
  })
  return out
}

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1

  const visit = (node) => {
    /* 1. Visible text between JSX tags. */
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim()
      if (isCopy(text)) record(text, file, 'jsx-text', lineOf(node))
    }

    /* 2. String-valued JSX attributes in the whitelist. */
    if (ts.isJsxAttribute(node) && node.initializer) {
      const attr = node.name.getText(sf)
      if (TEXT_ATTRS.has(attr)) {
        const init = node.initializer
        if (ts.isStringLiteral(init) && isCopy(init.text)) {
          record(init.text, file, 'jsx-attr', lineOf(node))
        } else if (ts.isJsxExpression(init) && init.expression) {
          const e = init.expression
          if (ts.isStringLiteral(e) && isCopy(e.text)) record(e.text, file, 'jsx-attr', lineOf(node))
          else if (ts.isTemplateExpression(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
            const m = templateToMessage(e)
            if (isCopy(m.replace(/\{\d+\}/g, ''))) record(m, file, 'jsx-attr-tpl', lineOf(node))
          }
        }
      }
    }

    /* 3. Object properties whose key names a human-readable field. */
    if (ts.isPropertyAssignment(node)) {
      const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null
      if (key && TEXT_KEYS.has(key)) {
        const v = node.initializer
        if (ts.isStringLiteral(v) && isCopy(v.text)) record(v.text, file, 'obj', lineOf(node))
        else if (ts.isTemplateExpression(v) || ts.isNoSubstitutionTemplateLiteral(v)) {
          const m = templateToMessage(v)
          if (isCopy(m.replace(/\{\d+\}/g, ''))) record(m, file, 'obj-tpl', lineOf(node))
        } else if (ts.isArrayLiteralExpression(v)) {
          for (const el of v.elements) {
            if (ts.isStringLiteral(el) && isCopy(el.text)) record(el.text, file, 'obj-arr', lineOf(node))
            else if (ts.isTemplateExpression(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
              const m = templateToMessage(el)
              if (isCopy(m.replace(/\{\d+\}/g, ''))) record(m, file, 'obj-arr-tpl', lineOf(node))
            }
          }
        }
      }
    }

    /* 4. Record<X, string> label maps: every string value is a label. */
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /(_LABEL|_LABELS|_NAME|_NAMES|_TITLE|_TEXT|_COPY|_DESCRIPTION)$/.test(node.name.text) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const p of node.initializer.properties) {
        if (ts.isPropertyAssignment(p)) {
          const v = p.initializer
          if (ts.isStringLiteral(v) && isCopy(v.text)) record(v.text, file, 'label-map', lineOf(p))
          else if (ts.isTemplateExpression(v) || ts.isNoSubstitutionTemplateLiteral(v)) {
            const m = templateToMessage(v)
            if (isCopy(m.replace(/\{\d+\}/g, ''))) record(m, file, 'label-map-tpl', lineOf(p))
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }
  visit(sf)
}

const rows = [...inventory.entries()]
  .map(([message, e]) => ({ message, count: e.count, kinds: [...e.kinds], files: [...e.files], first: e.first }))
  .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message))

if (process.argv.includes('--json')) {
  const out = join(ROOT, 'scripts', '.i18n-inventory.json')
  writeFileSync(out, JSON.stringify(rows, null, 2))
  console.log(`wrote ${rows.length} messages -> ${relative(ROOT, out)}`)
} else if (process.argv.includes('--list')) {
  for (const r of rows) console.log(r.message)
} else {
  const words = rows.reduce((n, r) => n + r.message.split(/\s+/).length, 0)
  const byKind = new Map()
  for (const r of rows) for (const k of r.kinds) byKind.set(k, (byKind.get(k) ?? 0) + 1)
  const byDir = new Map()
  for (const r of rows) {
    const d = r.first.split('/').slice(0, 2).join('/')
    byDir.set(d, (byDir.get(d) ?? 0) + 1)
  }
  console.log(`files scanned      ${files.length}`)
  console.log(`distinct messages  ${rows.length}`)
  console.log(`total occurrences  ${rows.reduce((n, r) => n + r.count, 0)}`)
  console.log(`total words        ${words}`)
  console.log(`\nby kind:`)
  for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(18)} ${n}`)
  console.log(`\nby directory:`)
  for (const [d, n] of [...byDir].sort((a, b) => b[1] - a[1])) console.log(`  ${d.padEnd(22)} ${n}`)
  const single = rows.filter((r) => r.message.split(/\s+/).length === 1).length
  const short = rows.filter((r) => r.message.split(/\s+/).length <= 4).length
  console.log(`\nsingle-word messages   ${single}`)
  console.log(`<= 4 words             ${short}`)
  console.log(`sentences (>= 8 words) ${rows.filter((r) => r.message.split(/\s+/).length >= 8).length}`)
}
