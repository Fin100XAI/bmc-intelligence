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

// Side-effect imports: the composer registers itself, and each catalogue
// registers its messages. Order matters only in that both must be installed
// before the first `t()` call, which importing this module guarantees.
import './compose'
import './mr'

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
