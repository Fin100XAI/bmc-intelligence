import { readdirSync, readFileSync, statSync } from 'node:fs'

/**
 * scripts/audit-layout.mjs
 *
 * Guards two visual defects that fail SILENTLY - the interface renders, nothing
 * throws, no type is violated, and the screen is simply wrong.
 *
 * ---------------------------------------------------------------------------
 * 1. A card header rendered flush against the corner of its own card.
 *
 * `Card` drops its padding when `flush` is set, which is correct - a table or a
 * map should reach the card's edge. `CardHeader` takes its padding from
 * `bordered`, and from nothing else. Put an unbordered header inside a flush
 * card and the heading sits hard against the corner with no margin at all.
 *
 * Neither the type checker nor the linter can see this: both components are
 * used correctly in isolation, and it is only their combination that is wrong.
 * It reached twenty-five pages before anyone reported it, which is exactly the
 * kind of defect a written convention fails to prevent and a check like this
 * does.
 *
 * A header that genuinely must sit without a divider can opt out by carrying
 * its own padding class - `className="px-4 py-3"` - which this audit accepts.
 *
 * ---------------------------------------------------------------------------
 * 2. A colour utility naming a token the theme does not define.
 *
 * The palette is declared in a Tailwind v4 `@theme` block in
 * `src/styles/index.css`, and v4 generates a utility for declared tokens ONLY.
 * `text-warn-800` where the theme stops at `warn-700` compiles, ships, and
 * renders as unstyled inherited text - a warning that does not look like one.
 *
 * This is not hypothetical: `text-pos-700` (no such family - it is `ok`), plus
 * `-400` and `-800` shades of `warn`, `ok` and `crit` that were never declared,
 * were all live in the codebase when this check was written. Grepping for a
 * class name cannot catch it either, because a typo'd class looks exactly like
 * a real one until you compare it against the theme.
 *
 * URLs are stripped before scanning - a slug like `thane-to-have-131-...`
 * otherwise reads as a `to-have-131` colour utility.
 *
 * Run with: node scripts/audit-layout.mjs
 */

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = `${dir}/${entry}`
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : []
  })

/** End of a JSX opening tag, respecting braced expressions in props. */
function tagEnd(src, start) {
  let depth = 0
  for (let i = start; i < src.length; i += 1) {
    const c = src[i]
    if (c === '{') depth += 1
    else if (c === '}') depth -= 1
    else if (c === '>' && depth === 0) return i
  }
  return src.length
}

const offenders = []

for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8')

  const events = []
  const re = /<Card\b|<\/Card>|<CardHeader\b/g
  let m
  while ((m = re.exec(src)) !== null) events.push({ kind: m[0], idx: m.index })

  const stack = []
  for (const ev of events) {
    if (ev.kind === '</Card>') {
      stack.pop()
      continue
    }

    const tag = src.slice(ev.idx, tagEnd(src, ev.idx) + 1)

    if (ev.kind === '<Card') {
      // A self-closing <Card ... /> opens no region.
      if (!tag.trimEnd().endsWith('/>')) stack.push({ flush: /\bflush\b/.test(tag) })
      continue
    }

    const insideFlushCard = stack.length > 0 && stack[stack.length - 1].flush
    if (!insideFlushCard) continue
    if (/\bbordered\b/.test(tag)) continue
    if (/\bp[xytblr]?-\d/.test(tag)) continue

    const title = tag.match(/title="([^"]*)"/)?.[1] ?? '(dynamic title)'
    offenders.push({ file, line: src.slice(0, ev.idx).split('\n').length, title })
  }
}

/* ==========================================================================
   2. Colour utilities naming tokens the theme does not define
   ========================================================================== */

const theme = readFileSync('src/styles/index.css', 'utf8')
const definedTokens = new Set()
for (const t of theme.matchAll(/--color-([a-z]+)-(\d{2,3})\s*:/g)) definedTokens.add(`${t[1]}-${t[2]}`)

const COLOUR_UTILITIES =
  '(?:text|bg|border|ring|from|to|via|fill|stroke|decoration|outline|divide|accent|caret|shadow)'
const colourRe = new RegExp(`\\b${COLOUR_UTILITIES}-([a-z]+)-(\\d{2,3})\\b`, 'g')

const undefinedColours = []

for (const file of [...walk('src'), ...walk('src').filter((f) => f.endsWith('.ts'))]) {
  if (!/\.tsx?$/.test(file)) continue
  // Strip URLs first - a slug reads as a colour utility otherwise.
  const src = readFileSync(file, 'utf8').replace(/https?:\/\/\S+/g, '')
  for (const hit of src.matchAll(colourRe)) {
    const token = `${hit[1]}-${hit[2]}`
    if (definedTokens.has(token)) continue
    undefinedColours.push({
      file,
      line: src.slice(0, hit.index).split('\n').length,
      utility: hit[0],
      token,
    })
  }
}

/* ==========================================================================
   Report
   ========================================================================== */

let failed = false

if (offenders.length > 0) {
  failed = true
  console.error(
    '\nCard headers flush against the card corner - a <CardHeader> inside a <Card flush>\n' +
      'takes no padding unless it is `bordered` (or carries its own padding class):\n',
  )
  for (const o of offenders) console.error(`  ${o.file}:${o.line}  ${o.title}`)
  console.error(`\n${offenders.length} header(s) would render with no margin. Add \`bordered\`.\n`)
}

if (undefinedColours.length > 0) {
  failed = true
  console.error(
    '\nColour utilities naming tokens the theme does not define. Tailwind v4 emits a\n' +
      'utility only for a declared `@theme` token, so each of these renders unstyled:\n',
  )
  for (const c of undefinedColours) {
    console.error(`  ${c.file}:${c.line}  ${c.utility}  (no --color-${c.token})`)
  }
  console.error(
    `\n${undefinedColours.length} undefined colour utility/utilities. Use a shade declared in\n` +
      'src/styles/index.css, or declare the token there.\n',
  )
}

if (failed) process.exit(1)

console.log('ok   every CardHeader inside a flush Card carries its own padding')
console.log(`ok   every colour utility resolves to one of ${definedTokens.size} declared theme tokens`)
