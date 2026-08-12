#!/usr/bin/env node
/**
 * scripts/i18n-codemod.mjs
 *
 * Routes every user-visible string in the source through `t()`.
 *
 * This edits source text at exact character offsets rather than reprinting the
 * AST, so formatting, comments and blank lines survive untouched and the diff
 * shows only the strings that moved.
 *
 * The invariant it is built around: IN ENGLISH `t()` IS THE IDENTITY FUNCTION,
 * so a correct run cannot change what the English platform renders. The two
 * places that could break that are handled explicitly - JSX whitespace, which
 * is reproduced by Babel's own algorithm before deciding what to emit, and
 * template literals, which become a message with `{0}` placeholders plus the
 * original expressions as arguments.
 *
 *   node scripts/i18n-codemod.mjs --dry     # report, write nothing
 *   node scripts/i18n-codemod.mjs           # apply
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const DRY = process.argv.includes('--dry')
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7)

/* Files that must not import the translator. `src/i18n` is the translator;
   `src/data/runtime.ts` is the root of the layer graph and imports nothing. */
const EXCLUDED = [join(SRC, 'i18n'), join(SRC, 'data', 'runtime.ts')]

/** JSX attributes whose string value is rendered to, or read out to, a human. */
const TEXT_ATTRS = new Set([
  'title', 'label', 'description', 'placeholder', 'content', 'eyebrow', 'subtitle',
  'heading', 'header', 'caption', 'hint', 'note', 'alt', 'summary', 'tooltip',
  'aria-label', 'aria-description', 'aria-placeholder', 'aria-roledescription', 'aria-valuetext',
  'emptyLabel', 'emptyMessage', 'emptyTitle', 'loadingLabel', 'errorLabel', 'actionLabel',
  'confirmLabel', 'cancelLabel', 'submitLabel', 'unit', 'suffix', 'prefix', 'legend',
  'helper', 'helperText', 'message', 'reason', 'rationale', 'statement',
  'footnote', 'stateLabel', 'emptyHint', 'noteText', 'valueLabel',
  'support', 'secondary', 'footer', 'sub', 'badge', 'chip', 'basis', 'meaning',
])

/**
 * Layers where a copy-looking string literal IS copy, wherever it sits.
 *
 * The seeded data layer builds its prose out of bare arrays and `push` calls —
 * project-name templates, correlation phrases, narrative fragments — none of
 * which sits under a property key a codemod can name. In these directories the
 * `isCopy` filter is trusted on its own; everywhere else a string needs a
 * copy-bearing key to be picked up, because a bare literal in a page is as
 * likely to be a class name or an enum member.
 */
const PROSE_LAYERS = ['src/data/', 'src/domains/', 'src/ai/']

/**
 * Object-literal keys whose string value ends up on screen.
 *
 * `name` earns its place here despite also naming identifiers elsewhere: the
 * `isCopy` filter rejects every enum member, kebab id and dotted storage key,
 * and what survives is a display name. `src/config/corporations.ts` is the one
 * exception — a corporation's `name` is resolved through `corporationName()`
 * against its own registered `marathiName`, so translating it here would put
 * two mechanisms on the same field.
 */
const KEY_EXCLUSIONS = new Map([['name', ['src/config/corporations.ts']]])

const TEXT_KEYS = new Set([
  'label', 'title', 'description', 'summary', 'heading', 'subheading', 'caption',
  /* Second pass: the shapes the first sweep did not name. `header` is the
     DataTable column heading — 390 of them, on screen on almost every page.
     The rest are the AI recommendation contract (why, impact, dependencies,
     risks) and the lineage graph's own prose. */
  'header', 'columns', 'dependencies', 'risks', 'name', 'shortName',
  'downstream', 'upstream', 'expectedImpact', 'followUps', 'humanOwnerRole',
  'risksAndLimitations', 'benefits', 'alternatives', 'mitigations',
  /* `operationalNotes` and `notableFacts` on a corporation are deliberately
     absent: nothing renders them. They are authoring notes inside the
     reference table, in the same class as `sources[].note`. */
  'rationale', 'statement', 'note', 'notes', 'body', 'question', 'answer',
  'headline', 'hint', 'detail', 'details', 'reason', 'purpose', 'longName',
  'displayName', 'message', 'placeholder', 'tooltip', 'helper', 'helperText', 'legend',
  'eyebrow', 'subtitle', 'emptyLabel', 'actionLabel',
  'bullets', 'points', 'lines', 'steps', 'examples', 'limitations', 'caveats',
  'implication', 'implications', 'recommendation', 'recommendations', 'finding', 'findings',
  'guidance', 'definition', 'meaning', 'basis', 'method', 'methodology', 'scopeLabel',
  'prompt', 'outcome', 'objective', 'criterion', 'criteria',
  'statusLabel', 'stateLabel', 'severityLabel', 'freshnessLabel',
  'dataFreshnessLabel', 'confidenceRationale', 'ownerRole', 'designation', 'columnLabel',
])

/** Module constants that are label maps: every string value in them is copy. */
const LABEL_MAP_NAME = /(_LABEL|_LABELS|_NAME|_NAMES|_TITLE|_TITLES|_TEXT|_COPY|_DESCRIPTION|_DESCRIPTIONS|_SHORT|_HELP|_HINT|_BLURB|_CAPTION|_SUMMARY)$/

function isCopy(raw) {
  const s = raw.trim()
  if (s.length < 2) return false
  if (!/[A-Za-z]/.test(s)) return false
  if (/^[a-z0-9-]+(\s+[a-z0-9:[\]/.%_-]+)*$/.test(s) && /(^|\s)(flex|grid|text-|bg-|border-|rounded|px-|py-|gap-|mt-|mb-|w-|h-|min-|max-|font-|shadow|hover:|sm:|md:|lg:|xl:)/.test(s)) return false
  if (/^(https?:|mailto:|\/|\.\/|@\/|#)/.test(s)) return false
  if (/^[a-z][a-zA-Z0-9]*$/.test(s) && s.length < 24) return false
  if (/^[a-z0-9]+([-.][a-z0-9]+)+$/.test(s)) return false
  // An upstream system's schema field name is an identifier, not copy.
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(s)) return false
  /* An IDENTIFIER BEING BUILT: `ward-{0}`, `q-{0}-{1}-{2}`, `v{0}.{1}`. These
     are the most dangerous strings in the sweep — translating one renames a
     ward id, which re-seeds the whole municipal picture. Normalising the
     placeholders to a digit and re-testing the kebab shape catches them. A
     genuine unit like `{0}h` has no separator and survives. */
  if (/^[a-z0-9]+([-._/][a-z0-9]+)+$/.test(s.replace(/\{\d+\}/g, '0'))) return false
  /* A REFERENCE FORMAT: an upper-case code, a separator, then figures or
     placeholders. `WO/{0}`, `DC-2026-{0}` and `D-{0}` build identifiers.
     `Flood-prone` and `SLA-breached` are hyphenated ENGLISH and must not
     be caught here, which is why the tail admits no letters. */
  if (/^[A-Z]{1,5}[-/][0-9{}/-]+$/.test(s)) return false
  if (/^[A-Z0-9_]+$/.test(s) && s.length < 32) return false
  if (/^[0-9\s.,%+/()₹-]+$/.test(s)) return false
  if (/^(rgb|hsl|#[0-9a-f]{3,8}|var\(|calc\()/i.test(s)) return false
  return true
}

/**
 * Babel's `cleanJSXElementLiteralChild`, reproduced exactly.
 *
 * What a JSX text node RENDERS is not what it contains: line breaks and the
 * indentation around them are folded away, and a trailing space on the same
 * line is not. Every decision below is made against the rendered string, so
 * the replacement puts back the same characters the browser saw before.
 */
function renderJsxText(text) {
  const lines = text.split(/\r\n|\n|\r/)
  let lastNonEmptyLine = 0
  for (let i = 0; i < lines.length; i += 1) {
    if (/[^ \t]/.test(lines[i])) lastNonEmptyLine = i
  }
  let out = ''
  for (let i = 0; i < lines.length; i += 1) {
    const isFirst = i === 0
    const isLast = i === lines.length - 1
    let line = lines[i].replace(/\t/g, ' ')
    if (!isFirst) line = line.replace(/^ +/, '')
    if (!isLast) line = line.replace(/ +$/, '')
    if (line) {
      if (i !== lastNonEmptyLine) line += ' '
      out += line
    }
  }
  return out
}

/** Escapes a message for a single-quoted TypeScript string literal. */
function quote(message) {
  return `'${message.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'`
}

/**
 * Turns a template literal into `t('… {0} …', expr)`.
 *
 * Marathi puts the verb last and the case marker on the noun, so a sentence
 * frequently has to be reordered around its inserted values. Numbered
 * placeholders are what make that possible without the call site knowing.
 */
function templateCall(node, sf) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return isCopy(node.text) ? `t(${quote(node.text)})` : null
  }
  let message = node.head.text
  const args = []
  node.templateSpans.forEach((span, i) => {
    message += `{${i}}${span.literal.text}`
    args.push(span.expression.getText(sf))
  })
  if (!isCopy(message.replace(/\{\d+\}/g, ' '))) return null
  return `t(${[quote(message), ...args].join(', ')})`
}

/** True when the node sits under an `as const`, where `t()` would widen the type. */
function underAsConst(node) {
  let p = node.parent
  while (p) {
    if (ts.isAsExpression(p) && p.type.kind === ts.SyntaxKind.TypeReference && p.type.getText() === 'const') return true
    p = p.parent
  }
  return false
}

/** True when an expression contains JSX, so it cannot become a message argument. */
function containsJsx(node) {
  let found = false
  const walk = (n) => {
    if (found) return
    if (
      ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n) || ts.isJsxText(n)
    ) {
      found = true
      return
    }
    ts.forEachChild(n, walk)
  }
  walk(node)
  return found
}

/**
 * Assembles an element's children into ONE message.
 *
 * This is the difference between a translatable interface and a broken one.
 * `Live {cityName} time · IST` wrapped node by node yields three fragments a
 * translator cannot reorder - and Marathi must reorder them, because it puts
 * the qualifier before the noun and the case marker on the noun itself. Read
 * as a whole it becomes `'Live {0} time · IST'`, and the Marathi reading is
 * free to place `{0}` wherever the sentence needs it.
 *
 * Returns null when the element contains nested markup, in which case the
 * caller falls back to wrapping each text run on its own - correct, just less
 * expressive.
 */
function jsxChildrenMessage(children, sf) {
  if (children.length === 0) return null
  let message = ''
  const args = []
  let hasText = false

  for (const child of children) {
    if (ts.isJsxText(child)) {
      message += renderJsxText(sf.text.slice(child.pos, child.end))
      if (/[A-Za-z]/.test(child.text)) hasText = true
      continue
    }
    if (ts.isJsxExpression(child)) {
      if (!child.expression) continue // a {/* comment */}
      // `{' '}` and friends are spacing the author wrote deliberately.
      if (ts.isStringLiteral(child.expression) || ts.isNoSubstitutionTemplateLiteral(child.expression)) {
        message += child.expression.text
        continue
      }
      if (containsJsx(child.expression)) return null
      message += `{${args.length}}`
      args.push(child.expression.getText(sf))
      continue
    }
    return null // nested element
  }

  const core = message.trim()
  if (!hasText || !isCopy(core.replace(/\{\d+\}/g, ' '))) return null
  return { call: `{t(${[quote(core), ...args].join(', ')})}`, args }
}

/** True when the node is already an argument to `t(...)`. */
function alreadyTranslated(node) {
  let p = node.parent
  while (p) {
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && (p.expression.text === 't' || p.expression.text === 'tn')) return true
    p = p.parent
  }
  return false
}

const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (EXCLUDED.some((x) => p === x || p.startsWith(x + '/'))) continue
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(p)) files.push(p)
  }
})(SRC)
files.sort()

let totalEdits = 0
let touchedFiles = 0
const perKind = new Map()

for (const file of files) {
  if (ONLY && !file.includes(ONLY)) continue
  const source = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  /** @type {Array<{start:number,end:number,text:string,kind:string}>} */
  const edits = []

  const push = (start, end, text, kind) => {
    edits.push({ start, end, text, kind })
    perKind.set(kind, (perKind.get(kind) ?? 0) + 1)
  }

  /** Wraps a string literal or template in `t()` at its own range. */
  const wrapValue = (node, kind) => {
    if (alreadyTranslated(node) || underAsConst(node)) return false
    if (ts.isStringLiteral(node)) {
      if (!isCopy(node.text)) return false
      push(node.getStart(sf), node.getEnd(), `t(${quote(node.text)})`, kind)
      return true
    }
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const call = templateCall(node, sf)
      if (!call) return false
      push(node.getStart(sf), node.getEnd(), call, kind)
      return true
    }
    if (ts.isArrayLiteralExpression(node)) {
      let any = false
      for (const el of node.elements) any = wrapValue(el, kind) || any
      return any
    }
    return false
  }

  const visit = (node) => {
    /* --- A whole element's children, read as one sentence ------------ */
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const children = node.children
      const combined = jsxChildrenMessage(children, sf)
      if (combined && !alreadyTranslated(node)) {
        const start = children[0].pos
        const end = children[children.length - 1].end
        const raw = sf.text.slice(start, end)
        // Indentation is whitespace-with-a-newline, which JSX renders as
        // nothing, so carrying it through keeps the source readable without
        // changing a character of the output.
        const leadWs = /^[ \t]*\n[ \t]*/.exec(raw)?.[0] ?? ''
        const trailWs = /\n[ \t]*$/.exec(raw)?.[0] ?? ''
        push(start, end, `${leadWs}${combined.call}${trailWs}`, 'jsx-children')
      }
    }

    /* --- A text run beside markup that could not be read as a whole -- */
    if (ts.isJsxText(node)) {
      const raw = sf.text.slice(node.pos, node.end)
      const rendered = renderJsxText(raw)
      const core = rendered.trim()
      if (isCopy(core)) {
        const leadWs = /^[ \t]*\n[ \t]*/.exec(raw)?.[0] ?? ''
        const trailWs = /\n[ \t]*$/.exec(raw)?.[0] ?? ''
        // Spaces the render depends on are re-emitted explicitly, so the
        // replacement's own indentation cannot change the output.
        const lead = rendered.startsWith(' ') ? "{' '}" : ''
        const trail = rendered.endsWith(' ') ? "{' '}" : ''
        push(node.pos, node.end, `${leadWs}${lead}{t(${quote(core)})}${trail}${trailWs}`, 'jsx-text')
      }
    }

    /* --- String-valued JSX attributes -------------------------------- */
    if (ts.isJsxAttribute(node) && node.initializer && TEXT_ATTRS.has(node.name.getText(sf))) {
      const init = node.initializer
      if (ts.isStringLiteral(init) && isCopy(init.text) && !underAsConst(node)) {
        push(init.getStart(sf), init.getEnd(), `{t(${quote(init.text)})}`, 'jsx-attr')
      } else if (ts.isJsxExpression(init) && init.expression) {
        wrapValue(init.expression, 'jsx-attr-expr')
      }
    }

    /* --- Object properties that name a human-readable field ---------- */
    if (ts.isPropertyAssignment(node)) {
      const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null
      const excluded = key ? (KEY_EXCLUSIONS.get(key) ?? []) : []
      if (key && TEXT_KEYS.has(key) && !excluded.some((x) => relative(ROOT, file) === x)) {
        wrapValue(node.initializer, 'obj')
      }
    }

    /* --- Bare prose in the seeded layers ------------------------------ */
    if (
      PROSE_LAYERS.some((dir) => relative(ROOT, file).startsWith(dir)) &&
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))
    ) {
      const inCopyPosition =
        ts.isArrayLiteralExpression(node.parent) ||
        /* `title: (w) => `… ${w}`` — the seeded layers build a lot of their
           register rows from small factory functions, and the string is the
           function's whole body rather than the property's initialiser. */
        (ts.isArrowFunction(node.parent) && node.parent.body === node) ||
        ts.isReturnStatement(node.parent) ||
        (ts.isCallExpression(node.parent) &&
          ts.isPropertyAccessExpression(node.parent.expression) &&
          node.parent.expression.name.text === 'push') ||
        ts.isConditionalExpression(node.parent) ||
        (ts.isBinaryExpression(node.parent) &&
          node.parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
      if (inCopyPosition) wrapValue(node, 'prose')
    }

    /* --- Label maps: every value in them is a label ------------------- */
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      LABEL_MAP_NAME.test(node.name.text) &&
      node.initializer
    ) {
      const target = ts.isAsExpression(node.initializer) || ts.isSatisfiesExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer
      if (ts.isObjectLiteralExpression(target)) {
        for (const p of target.properties) {
          if (ts.isPropertyAssignment(p)) wrapValue(p.initializer, 'label-map')
        }
      }
    }

    ts.forEachChild(node, visit)
  }
  visit(sf)

  if (edits.length === 0) continue

  /* Nested edits would corrupt each other - an array element inside a
     property that is itself being wrapped. Keep only outermost ranges. */
  edits.sort((a, b) => a.start - b.start || b.end - a.end)
  const flat = []
  let lastEnd = -1
  for (const e of edits) {
    if (e.start < lastEnd) continue
    flat.push(e)
    lastEnd = e.end
  }

  let out = source
  for (const e of [...flat].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }

  /* The translator import, placed after the last existing import so the
     import block stays one block. */
  if (!/^import \{[^}]*\bt\b[^}]*\} from '@\/i18n'/m.test(out)) {
    const imports = sf.statements.filter(ts.isImportDeclaration)
    const anchor = imports.length > 0 ? imports[imports.length - 1].getEnd() : 0
    // Offsets are from the ORIGINAL source; recompute against the edited text
    // by locating the same import statement text.
    const anchorText = imports.length > 0 ? source.slice(imports[imports.length - 1].getStart(sf), anchor) : null
    if (anchorText && out.includes(anchorText)) {
      const at = out.indexOf(anchorText) + anchorText.length
      out = `${out.slice(0, at)}\nimport { t } from '@/i18n'${out.slice(at)}`
    } else {
      out = `import { t } from '@/i18n'\n${out}`
    }
  }

  totalEdits += flat.length
  touchedFiles += 1
  if (!DRY) writeFileSync(file, out)
}

console.log(`${DRY ? '[dry run] ' : ''}${totalEdits} strings wrapped across ${touchedFiles} files`)
for (const [kind, n] of [...perKind].sort((a, b) => b[1] - a[1])) console.log(`  ${kind.padEnd(16)} ${n}`)
