#!/usr/bin/env node
/**
 * scripts/i18n-audit.mjs
 *
 * The gate on the bilingual interface.
 *
 * A translation layer fails quietly. A missing entry renders correct English on
 * an otherwise Marathi screen and nobody notices until it is on a projector in
 * front of a commissioner; a placeholder dropped from a translated sentence
 * renders "{0} wards" as a literal brace, or worse, silently drops the figure.
 * Neither is caught by a type check or by a render test. This is what catches
 * them.
 *
 * It fails the build on:
 *   - a message the interface renders with no Marathi entry
 *   - a placeholder that appears in the English and not in the Marathi, or
 *     vice versa
 *   - a catalogue entry no call site asks for (dead weight, and usually a sign
 *     that source copy was reworded without the catalogue following)
 *   - a Marathi value that is byte-identical to its English key, which is
 *     almost always an untranslated placeholder rather than a deliberate
 *     pass-through
 *   - a `t()` call evaluated at module scope, which freezes in whatever
 *     language was active at import (see scripts/i18n-frozen.mjs)
 *
 *   node scripts/i18n-audit.mjs            # summary, exit 1 on failure
 *   node scripts/i18n-audit.mjs --verbose  # list every finding
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectKeys } from './i18n-keys.mjs'
import { readCatalogue } from './i18n-catalogue.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const VERBOSE = process.argv.includes('--verbose')

const PLACEHOLDER = /\{(\d+)\}/g
const PROMPT_VAR = /\{\{[^}]+\}\}/g

function placeholders(text) {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]).sort()
}

/**
 * Placeholders bound directly to the end of an English word - `incident{1}`,
 * `polic{1}`, `job{1}` - carry an English INFLECTION, not a value: the call
 * site passes `n === 1 ? '' : 's'`. Marathi does not form a plural by adding a
 * suffix, so a faithful translation drops them. They are therefore optional in
 * the translation, and only in the translation: a placeholder the English uses
 * as a value is still mandatory.
 */
function affixBoundPlaceholders(text) {
  return [...text.matchAll(/(\w)\{(\d+)\}/g)].map((m) => m[2])
}

function promptVars(text) {
  return [...text.matchAll(PROMPT_VAR)].map((m) => m[0]).sort()
}

/** Unit and version abbreviations, which are notation rather than words. */
const UNIT_TOKENS = new Set([
  'v', 'ms', 's', 'm', 'km', 'cm', 'mm', 'kg', 'g', 'ha', 'mld', 'tpd', 'mt', 't',
  'mw', 'kw', 'kwh', 'db', 'ppm', 'aqi', 'lpcd', 'cr', 'l', 'k', 'b', 'pp', 'hr',
  'h', 'min', 'd', 'yr', 'ist', 'gb', 'tb', 'mb', 'fy', 'no', 'na',
  // Pollutant and process abbreviations, which the Maharashtra Pollution
  // Control Board's own returns print in Latin.
  'pm', 'nox', 'so', 'co', 'bod', 'cod', 'ph', 'tds', 'stp', 'wtp', 'esr',
  // Concentration units, in both the micro-sign and Greek-mu spellings.
  'µg', 'μg', 'ug', 'mg', 'ng', 'µgm', 'μgm', 'lpm', 'cumecs',
  // Compass points in a coordinate pair: 18°37'05"N 73°48'04"E.
  'n', 's', 'e', 'w',
  'nrw', 'sla', 'gis', 'api', 'ai', 'ml', 'led', 'mfa', 'crz', 'fsi', 'shg', 'ngo',
])

/** Strings that legitimately read the same in both languages. */
function isLegitimatePassThrough(message) {
  // Pure symbols, digits and identifiers carry no words to translate.
  if (!/[A-Za-z]/.test(message)) return true
  // Acronyms and protocol names, which Marathi administrative practice keeps
  // in the Latin script: "REST API", "JSON API", "SFTP".
  if (/^[A-Z0-9]+([ /._-][A-Z0-9]+)*$/.test(message)) return true
  // Product and standard names with internal capitals, optionally versioned:
  // "GraphQL", "WebSocket", "OAuth 2.0".
  if (/^[A-Z][a-z0-9]*[A-Z][A-Za-z0-9]*( ?[\d.]+)?$/.test(message)) return true
  // A corporation's own short code: "PMC-Panvel", "NMC-Nagpur". The code is
  // how the corporation refers to itself on its own letterhead.
  if (/^[A-Z]{2,}[-/][A-Z][a-zA-Z]+$/.test(message)) return true
  // Key caps are read off the keyboard, not off the screen.
  if (/^(Esc|Enter|Tab|Ctrl|Shift|Alt|Cmd|Del)$/.test(message)) return true
  if (/^[a-z]+:[a-z]+$/.test(message)) return true // permission ids
  /* A field name in an upstream system's schema — `ward_code`, `rainfall_mm_24h`.
     The Data Sources surface prints these so an integration engineer can match
     them against the departmental system they came from. That system calls the
     column `ward_code` whatever language this screen is running in, and
     translating it would misrepresent the source. */
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(message)) return true
  /* Whatever is left once placeholders, HTML entities, figures, symbols and
     unit abbreviations are removed. "{0} · v{1}" and "< 300ms" have nothing
     translatable in them; "Ward Performance" has two words and stays flagged. */
  const residue = message
    .replace(/\{\d+\}/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[\d.,:;%<>≥≤±/()[\]{}·—–\-+×÷²³°₹|"'?!*₀₁₂₃₄₅₆₇₈₉¹⁰⁴⁵]/g, ' ')
  const words = residue.split(/\s+/).filter(Boolean)
  return words.length === 0 || words.every((w) => UNIT_TOKENS.has(w.toLowerCase()))
}

const keys = collectKeys()
const catalogue = readCatalogue()

const missing = []
const orphaned = []
const placeholderMismatch = []
const promptVarMismatch = []
const untranslated = []

for (const [message, meta] of keys) {
  const mr = catalogue.get(message)
  if (mr === undefined) {
    missing.push({ message, count: meta.count, where: meta.first })
    continue
  }
  const a = placeholders(message)
  const b = placeholders(mr)
  const optional = new Set(affixBoundPlaceholders(message))
  const required = a.filter((p) => !optional.has(p))
  const missingRequired = required.filter((p) => !b.includes(p))
  const invented = b.filter((p) => !a.includes(p))
  if (missingRequired.length > 0 || invented.length > 0) {
    placeholderMismatch.push({ message, mr, english: a, marathi: b })
  }
  const pa = promptVars(message)
  const pb = promptVars(mr)
  if (pa.join('|') !== pb.join('|')) {
    promptVarMismatch.push({ message, mr, english: pa, marathi: pb })
  }
  if (mr === message && !isLegitimatePassThrough(message)) {
    untranslated.push({ message, where: meta.first })
  }
}

for (const message of catalogue.keys()) {
  if (!keys.has(message)) orphaned.push(message)
}

/* Module-scope translations freeze at import; that check lives in its own
   script so it can also be run on its own during a refactor. */
let frozen = 0
try {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'i18n-frozen.mjs')], { stdio: 'pipe' })
} catch (err) {
  const out = String(err.stdout ?? '')
  frozen = Number(/(\d+) module-scope translations/.exec(out)?.[1] ?? 1)
  if (VERBOSE) process.stdout.write(out)
}

const total = keys.size
const covered = total - missing.length
const pct = total === 0 ? 100 : (covered / total) * 100

console.log('Marathi coverage')
console.log(`  messages rendered      ${total}`)
console.log(`  translated             ${covered} (${pct.toFixed(2)}%)`)
console.log(`  catalogue entries      ${catalogue.size}`)
console.log('')
console.log('Findings')
console.log(`  missing translation    ${missing.length}`)
console.log(`  placeholder mismatch   ${placeholderMismatch.length}`)
console.log(`  prompt-var mismatch    ${promptVarMismatch.length}`)
console.log(`  identical to English   ${untranslated.length}`)
console.log(`  orphaned entries       ${orphaned.length}`)
console.log(`  frozen at module scope ${frozen}`)

function report(title, rows, format) {
  if (rows.length === 0) return
  console.log(`\n${title} (${rows.length})`)
  const shown = VERBOSE ? rows : rows.slice(0, 15)
  for (const row of shown) console.log(`  ${format(row)}`)
  if (!VERBOSE && rows.length > shown.length) {
    console.log(`  … ${rows.length - shown.length} more (--verbose for all)`)
  }
}

report('MISSING', missing, (r) => `${JSON.stringify(r.message)}  [${r.where}]`)
report(
  'PLACEHOLDER MISMATCH',
  placeholderMismatch,
  (r) => `${JSON.stringify(r.message)}\n    en {${r.english}} vs mr {${r.marathi}}\n    ${JSON.stringify(r.mr)}`,
)
report(
  'PROMPT VARIABLE MISMATCH',
  promptVarMismatch,
  (r) => `${JSON.stringify(r.message)}\n    en ${r.english.join(' ')} vs mr ${r.marathi.join(' ')}`,
)
report('IDENTICAL TO ENGLISH', untranslated, (r) => `${JSON.stringify(r.message)}  [${r.where}]`)
report('ORPHANED CATALOGUE ENTRY', orphaned, (r) => JSON.stringify(r))

const failed =
  missing.length > 0 ||
  placeholderMismatch.length > 0 ||
  promptVarMismatch.length > 0 ||
  untranslated.length > 0 ||
  orphaned.length > 0 ||
  frozen > 0

console.log(failed ? '\ni18n audit FAILED' : '\ni18n audit passed')
process.exitCode = failed ? 1 : 0
