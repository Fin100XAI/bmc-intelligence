/* ---------------------------------------------------------------------------
 * THE LANGUAGE SEAM
 *
 * The platform is bilingual: English and Marathi, the official language of
 * Maharashtra. Every word an operator can read - navigation, headings, table
 * columns, status chips, tooltips, empty states, error text, the generated
 * municipal narrative and the Copilot's answers - passes through `t()` in this
 * module.
 *
 * Three decisions in here are load-bearing:
 *
 *   1. `t()` is a PLAIN MODULE FUNCTION, not a hook. It is called from the
 *      data layer, from services, from pure domain engines and from React
 *      alike - none of which can hold a context. It reads module state at call
 *      time, exactly as `src/utils/format.ts` reads the numbering dialect, and
 *      for the same reason: threading a translation context through 120 screens
 *      to serve a preference an operator sets once is not a trade worth making.
 *
 *   2. MESSAGES ARE KEYED BY THEIR ENGLISH SOURCE, not by an invented key.
 *      `t('Ward Performance')` reads as what it renders, so a reviewer can see
 *      the English and the Marathi side by side without resolving a key first,
 *      and a missing translation degrades to correct English rather than to a
 *      raw key on screen. It also means `t()` accepts a string computed at
 *      runtime, which is what lets a value read out of a rebuilt data layer be
 *      translated at the point it is rendered.
 *
 *   3. IN ENGLISH, `t()` IS THE IDENTITY FUNCTION. The English platform cannot
 *      be changed by translation work - there is no lookup, no fallback and no
 *      failure mode on that path, only interpolation.
 *
 * This module deliberately imports nothing. It is evaluated before every data
 * layer, so the persisted language is already resolved when the first seed is
 * drawn and the interface never paints one language and then repaints in the
 * other.
 * ------------------------------------------------------------------------- */

export type Locale = 'en' | 'mr'

export const LOCALES: readonly Locale[] = ['en', 'mr'] as const

export interface LocaleDescriptor {
  id: Locale
  /** The language's name in itself - what the switcher shows. */
  nativeName: string
  /** The language's name in English, for the accessible label. */
  englishName: string
  /** Two-letter tag stamped on <html lang>, for screen readers and hyphenation. */
  htmlLang: string
  /** Short form for the collapsed switcher. */
  abbreviation: string
  /** BCP-47 tag used for Intl number and date formatting. */
  intlLocale: string
}

export const LOCALE_INFO: Record<Locale, LocaleDescriptor> = {
  en: {
    id: 'en',
    nativeName: 'English',
    englishName: 'English',
    htmlLang: 'en-IN',
    abbreviation: 'ENG',
    intlLocale: 'en-IN',
  },
  mr: {
    id: 'mr',
    nativeName: 'मराठी',
    englishName: 'Marathi',
    htmlLang: 'mr-IN',
    abbreviation: 'मरा',
    /* Latin digits are pinned deliberately. Marathi's CLDR default is the
       Devanagari numbering system, which would render a ward's collection
       figure as १२,३४,५६७ - unreadable next to the source systems an officer
       reconciles against, and unalignable in a tabular column. Government of
       Maharashtra practice is Marathi words with Latin figures, which is what
       this produces: Marathi month names, Marathi units, Latin digits. */
    intlLocale: 'mr-IN-u-nu-latn',
  },
}

export const DEFAULT_LOCALE: Locale = 'en'

/** The zustand persistence key for the language selection. */
export const LOCALE_STORAGE_KEY = 'bmc-mii.locale'

function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'mr'
}

/**
 * Resolve the persisted language BEFORE any data layer evaluates, so the very
 * first build of the municipal picture is already in the operator's language.
 */
function readInitialLocale(): Locale {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_LOCALE
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (!raw) return DEFAULT_LOCALE
    const id: unknown = JSON.parse(raw)?.state?.locale
    return isLocale(id) ? id : DEFAULT_LOCALE
  } catch {
    // Corrupt or unreadable storage falls through to English rather than
    // failing the application boot.
    return DEFAULT_LOCALE
  }
}

let activeLocale: Locale = readInitialLocale()

export function getLocale(): Locale {
  return activeLocale
}

export function getLocaleInfo(): LocaleDescriptor {
  return LOCALE_INFO[activeLocale]
}

/** True when the interface is running in a language other than English. */
export function isTranslated(): boolean {
  return activeLocale !== 'en'
}

/**
 * Sets the active language. This is the low-level seam - it changes what
 * `t()` returns and nothing else. Rebuilding the data layers and remounting
 * the interface is the store's job (`src/stores/locale.store.ts`), because
 * this module must not depend on anything.
 */
export function setActiveLocale(locale: Locale): void {
  activeLocale = locale
}

/* ---------------------------------------------------------------------------
 * Message catalogue
 * ------------------------------------------------------------------------- */

/** English source -> translation, per locale. */
const catalogues: Record<Locale, Map<string, string>> = {
  en: new Map(),
  mr: new Map(),
}

/**
 * Registers a block of translations. Called once per catalogue file at import.
 * Later registrations win, which is how a page-specific reading of a phrase
 * overrides the general one.
 */
export function registerMessages(locale: Locale, entries: Record<string, string>): void {
  const target = catalogues[locale]
  for (const key of Object.keys(entries)) {
    const value = entries[key]
    if (typeof value === 'string' && value.length > 0) target.set(key, value)
  }
}

export function catalogueSize(locale: Locale): number {
  return catalogues[locale].size
}

export function hasMessage(locale: Locale, message: string): boolean {
  return catalogues[locale].has(message)
}

export function catalogueEntries(locale: Locale): IterableIterator<[string, string]> {
  return catalogues[locale].entries()
}

/* ---------------------------------------------------------------------------
 * Untranslated-string reporting
 *
 * Every message that reaches the interface without a translation is recorded
 * so `scripts/i18n-audit.mjs` and the Settings → Language panel can name the
 * gap rather than leaving it to be discovered on a screen in front of an
 * audience. Recording is bounded so a pathological render cannot grow it
 * without limit.
 * ------------------------------------------------------------------------- */

const MISS_LIMIT = 4000
const misses = new Map<string, number>()

function recordMiss(message: string): void {
  if (misses.size >= MISS_LIMIT && !misses.has(message)) return
  misses.set(message, (misses.get(message) ?? 0) + 1)
}

/** Messages rendered in this session with no translation, most frequent first. */
export function untranslatedMessages(): Array<{ message: string; count: number }> {
  return [...misses.entries()]
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message))
}

export function clearUntranslatedMessages(): void {
  misses.clear()
}

/* ---------------------------------------------------------------------------
 * Composition fallback
 *
 * Registered by `src/i18n/compose.ts` rather than imported, so this module
 * keeps its "imports nothing" property and stays first in evaluation order.
 * ------------------------------------------------------------------------- */

type Composer = (message: string, locale: Locale) => string | null

let composer: Composer | null = null

export function registerComposer(fn: Composer): void {
  composer = fn
}

/* ---------------------------------------------------------------------------
 * Interpolation
 * ------------------------------------------------------------------------- */

const PLACEHOLDER = /\{(\d+)\}/g

/**
 * A value the caller may legitimately not have. An optional field spliced into
 * a sentence — `Open gap: {0}` where there is no gap — is guarded at the call
 * site, but TypeScript cannot always see the guard, and rendering the string
 * "undefined" onto a municipal screen is not an acceptable alternative.
 */
export type MessageArg = string | number | null | undefined

function interpolate(template: string, args: ReadonlyArray<MessageArg>): string {
  if (args.length === 0) return template
  return template.replace(PLACEHOLDER, (match, index: string) => {
    const position = Number(index)
    /* A placeholder with no argument AT ALL is a defect in the message, and
       leaving `{0}` on screen is how it gets noticed. A placeholder whose
       argument was passed and is absent is the caller saying "nothing here",
       and renders as nothing. */
    if (position >= args.length) return match
    const value = args[position]
    return value === undefined || value === null ? '' : String(value)
  })
}

/* ---------------------------------------------------------------------------
 * t()
 * ------------------------------------------------------------------------- */

/**
 * Translates a message into the active language.
 *
 * @param message  The English source text. `{0}`, `{1}` … are substituted from
 *                 `args`, so a sentence can be reordered by the translation
 *                 without the call site knowing - which matters here, because
 *                 Marathi puts the verb last and the case marker on the noun.
 *
 * Resolution order: exact catalogue entry, then term-by-term composition, then
 * the English source unchanged. The last step is not a failure state - showing
 * a reviewer accurate English is always better than showing them confident
 * nonsense in Marathi.
 */
export function t(message: string, ...args: MessageArg[]): string {
  if (activeLocale === 'en') return interpolate(message, args)
  if (typeof message !== 'string' || message.length === 0) return message

  const exact = catalogues[activeLocale].get(message)
  if (exact !== undefined) return interpolate(exact, args)

  /* Copy is authored with the surrounding layout in mind, so the same phrase
     reaches here with punctuation or spacing attached. Try the bare phrase and
     restore the trimmings, rather than treating "Ward performance." as a
     different message from "Ward performance". */
  const trimmed = message.trim()
  if (trimmed !== message) {
    const inner = catalogues[activeLocale].get(trimmed)
    if (inner !== undefined) {
      const lead = message.slice(0, message.indexOf(trimmed[0] ?? ''))
      const tail = message.slice(lead.length + trimmed.length)
      return interpolate(lead + inner + tail, args)
    }
  }

  const composed = composer ? composer(message, activeLocale) : null
  if (composed !== null) return interpolate(composed, args)

  recordMiss(message)
  return interpolate(message, args)
}

/**
 * Count-sensitive translation. Marathi and English agree on the one/other
 * split, so this is a chooser rather than a plural-rule engine - but it keeps
 * the two forms as separate translatable messages, which is what a translator
 * needs. `{0}` in either form receives the count.
 */
export function tn(count: number, one: string, other: string): string {
  return t(count === 1 ? one : other, count)
}

/**
 * Joins a list into a readable series in the active language:
 * "A, B and C" / "A, B आणि C".
 */
export function tList(items: readonly string[]): string {
  const parts = items.filter((item) => item.length > 0)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0] as string
  const last = parts[parts.length - 1] as string
  return `${parts.slice(0, -1).join(', ')} ${t('and')} ${last}`
}
