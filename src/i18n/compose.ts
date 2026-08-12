import { registerComposer, type Locale } from './locale'
import { MR_LEXICON, MR_LEXICON_MAX_WORDS } from './mr/lexicon'

/* ---------------------------------------------------------------------------
 * COMPOSITIONAL FALLBACK
 *
 * The catalogue in `src/i18n/mr/` carries a hand-written Marathi reading of
 * every message authored in the source. This module covers the other kind:
 * text ASSEMBLED AT RUNTIME - a ward name spliced into an alert title, a
 * department stitched onto a defect summary, a narrative sentence the AI
 * gateway composed from seeded figures. Those strings do not exist until they
 * are built, so no catalogue can enumerate them.
 *
 * It works term by term against a curated municipal lexicon, longest phrase
 * first, and it is deliberately CONSERVATIVE: unless it recognises most of the
 * words in a message it returns nothing and the operator is shown accurate
 * English. A screen that mixes languages honestly is recoverable; a screen
 * that states something confidently wrong in Marathi is not, and this platform
 * is read by people who act on what it says.
 *
 * Proper nouns are left in their source script on purpose. "Andheri", "Bandra
 * Kurla Complex" and an officer's name are not translated in Marathi municipal
 * correspondence either - the ward and department registers carry their own
 * Marathi names, and those are looked up, not composed.
 * ------------------------------------------------------------------------- */

/** A composed reading is only trusted when this share of its words resolved. */
const CONFIDENCE_FLOOR = 0.55

/** Tokens that carry no meaning to translate but must survive intact. */
const PASSTHROUGH = /^[\s\d.,;:!?%₹()[\]{}<>/\\|"'`~@#$^&*_+=-]+$/

/** Units and symbols that stay as they are in both languages. */
const UNITS = new Set([
  'cr', 'l', 'k', 'm', 'b', 'kg', 'km', 'km2', 'mld', 'mm', 'cm', 'ha', 'mw', 'kw', 'kwh',
  'pp', 'sqm', 'sqft', 'aqi', 'pm', 'ppm', 'mg', 'ml', 'gis', 'api', 'ai', 'ml', 'sla',
  'id', 'gb', 'tb', 'ms', 'utc', 'ist', 'inr', 'usd', 'no', 'na', 'nil',
])

/**
 * Whole-message shape rules, applied before term substitution.
 *
 * English builds a noun phrase left to right; Marathi builds it right to left
 * around a postposition. These three patterns cover the overwhelming majority
 * of the column headings and chart labels a municipal console generates, and
 * getting them right is the difference between "प्रभागनुसार तक्रारी" and a
 * word salad that happens to contain the correct nouns.
 */
const SHAPES: Array<{ pattern: RegExp; build: (parts: string[]) => string }> = [
  // "Complaints by ward" -> "प्रभागनुसार तक्रारी"
  { pattern: /^(.+?) by (.+)$/i, build: ([a, b]) => `${b}नुसार ${a}` },
  // "Complaints per ward" -> "प्रति प्रभाग तक्रारी"
  { pattern: /^(.+?) per (.+)$/i, build: ([a, b]) => `प्रति ${b} ${a}` },
  // "Head of department" -> "विभाग प्रमुख"
  { pattern: /^(.+?) of (.+)$/i, build: ([a, b]) => `${b} ${a}` },
]

interface Attempt {
  text: string
  words: number
  resolved: number
}

/** Splits on word boundaries, keeping the separators so spacing is preserved. */
function tokenise(input: string): string[] {
  return input.split(/([A-Za-zऀ-ॿ]+(?:['’][A-Za-z]+)?)/).filter((part) => part.length > 0)
}

function lookup(phrase: string): string | undefined {
  return MR_LEXICON[phrase.toLowerCase()]
}

/**
 * Substitutes known terms, preferring the longest phrase that matches at each
 * position so "solid waste management" beats "solid" + "waste" + "management".
 */
function substitute(input: string): Attempt {
  const tokens = tokenise(input)
  const out: string[] = []
  let words = 0
  let resolved = 0

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] as string

    if (PASSTHROUGH.test(token)) {
      out.push(token)
      continue
    }

    /* Try the longest run of words starting here. Runs may only be joined by a
       single space - a phrase must not be assembled across a comma. */
    let matched = false
    for (let span = MR_LEXICON_MAX_WORDS; span >= 1 && !matched; span -= 1) {
      const slice: string[] = []
      let cursor = i
      let taken = 0
      while (taken < span && cursor < tokens.length) {
        const piece = tokens[cursor] as string
        if (/^[A-Za-zऀ-ॿ]/.test(piece)) {
          slice.push(piece)
          taken += 1
          cursor += 1
        } else if (piece === ' ' && taken > 0 && taken < span) {
          slice.push(piece)
          cursor += 1
        } else break
      }
      if (taken !== span) continue

      const phrase = slice.join('')
      const hit = lookup(phrase)
      if (hit !== undefined) {
        out.push(hit)
        words += span
        resolved += span
        i = cursor - 1
        matched = true
      }
    }
    if (matched) continue

    /* A single word. Try it whole, then without a plural or possessive
       inflection, then as a hyphenated compound. */
    words += 1
    const direct = lookup(token)
    if (direct !== undefined) {
      out.push(direct)
      resolved += 1
      continue
    }

    const bare = token.replace(/['’]s$/i, '')
    const singular =
      lookup(bare) ??
      (bare.length > 3 && /ies$/i.test(bare) ? lookup(`${bare.slice(0, -3)}y`) : undefined) ??
      (bare.length > 3 && /(ses|xes|zes|ches|shes)$/i.test(bare) ? lookup(bare.slice(0, -2)) : undefined) ??
      (bare.length > 3 && /s$/i.test(bare) ? lookup(bare.slice(0, -1)) : undefined)
    if (singular !== undefined) {
      out.push(singular)
      resolved += 1
      continue
    }

    if (UNITS.has(token.toLowerCase())) {
      out.push(token)
      resolved += 1
      continue
    }

    out.push(token)
  }

  return { text: out.join(''), words, resolved }
}

function compose(message: string, locale: Locale): string | null {
  if (locale !== 'mr') return null
  // Nothing to do for figures, codes, placeholders and punctuation runs.
  if (!/[A-Za-z]/.test(message)) return null
  // Already Devanagari - a value read out of a translated register.
  if (/[ऀ-ॿ]/.test(message) && !/[A-Za-z]{3}/.test(message)) return null

  for (const shape of SHAPES) {
    const match = shape.pattern.exec(message)
    if (!match) continue
    const left = substitute(match[1] as string)
    const right = substitute(match[2] as string)
    const words = left.words + right.words
    const resolved = left.resolved + right.resolved
    if (words > 0 && resolved / words >= CONFIDENCE_FLOOR) {
      return shape.build([left.text.trim(), right.text.trim()])
    }
  }

  const attempt = substitute(message)
  if (attempt.words === 0) return null
  if (attempt.resolved / attempt.words < CONFIDENCE_FLOOR) return null
  return attempt.text
}

registerComposer(compose)

/** Exposed for `scripts/i18n-audit.mjs`, which reports composition coverage. */
export function composeForAudit(message: string): { text: string; words: number; resolved: number } {
  return substitute(message)
}
