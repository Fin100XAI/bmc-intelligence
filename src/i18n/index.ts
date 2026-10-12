/**
 * src/i18n
 *
 * The platform's language seam. Import `t` from here - never from
 * `./locale` directly - so that importing the translator is what installs the
 * catalogues and the compositional fallback behind it.
 *
 *   import { t } from '@/i18n'
 *   <h1>{t('Ward Performance')}</h1>
 *   {t('{0} wards are below the equity floor', belowFloor)}
 *
 * `t` is a plain function, not a hook: it is called from React, from the
 * seeded data layer, from services and from pure domain engines alike. See
 * `./locale.ts` for why the message itself is the key, and why `t` is the
 * identity function in English.
 */

import { getLocale, type Locale } from './locale'

/* ---------------------------------------------------------------------------
 * The Marathi catalogue loads on demand.
 *
 * It is several megabytes of text - larger than the rest of the application
 * put together - and an English session never reads a word of it, so it is
 * NOT a static import. `loadLocaleCatalogue('mr')` fetches it (and the
 * compositional fallback, which only Marathi uses) once; the locale store
 * awaits it before switching, so `t()` stays synchronous and never answers in
 * a language whose catalogue is not installed yet.
 *
 * Two cases load it before anything else evaluates, using top-level await so
 * every module importing `t` waits for it:
 *
 *   - a browser session whose persisted language is Marathi, so the first
 *     build of the data layers is already in Marathi (the guarantee
 *     `./locale.ts` makes about evaluation order still holds);
 *   - any server-side runtime (the API server, the Node smoke and audit
 *     harnesses), which switch language synchronously and expect the
 *     catalogue to be present, as it always was.
 * ------------------------------------------------------------------------- */

let marathi: Promise<void> | null = null
let marathiReady = false

/** True once the catalogue for `locale` is installed (English always is). */
export function isCatalogueLoaded(locale: Locale): boolean {
  return locale === 'en' || marathiReady
}

/** Installs the catalogue for `locale`. Safe to call repeatedly. */
export function loadLocaleCatalogue(locale: Locale): Promise<void> {
  if (locale === 'en') return Promise.resolve()
  marathi ??= Promise.all([import('./compose'), import('./mr')]).then(
    () => {
      marathiReady = true
    },
    (error: unknown) => {
      // Let a later attempt retry (a dropped connection on a slow link), and
      // let the caller decide what to tell the operator.
      marathi = null
      throw error
    },
  )
  return marathi
}

// `import.meta.env` is absent under plain Node (the API server runs on tsx),
// and `SSR` is true under Vite's `ssrLoadModule` - which is how the harnesses
// load the app, some of them with a jsdom `window` installed beforehand.
const serverSide = typeof window === 'undefined' || import.meta.env?.SSR === true
if (serverSide || getLocale() !== 'en') {
  try {
    await loadLocaleCatalogue('mr')
  } catch {
    // The catalogue could not be fetched. `t()` falls back to English for
    // every message, which is the documented, honest failure mode.
  }
}

export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_INFO,
  LOCALE_STORAGE_KEY,
  catalogueEntries,
  catalogueSize,
  clearUntranslatedMessages,
  getLocale,
  getLocaleInfo,
  hasMessage,
  isTranslated,
  registerMessages,
  setActiveLocale,
  t,
  tList,
  tn,
  untranslatedMessages,
  type Locale,
  type LocaleDescriptor,
} from './locale'
