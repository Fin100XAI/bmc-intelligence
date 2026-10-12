import { useEffect } from 'react'
import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { rebuildAllLayers } from '@/data/runtime'
import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  LOCALE_STORAGE_KEY,
  getLocale,
  setActiveLocale,
  type Locale,
} from '@/i18n/locale'
import { isCatalogueLoaded, loadLocaleCatalogue } from '@/i18n'

/**
 * src/stores/locale.store.ts
 *
 * The interface language, and the machinery that makes changing it take
 * effect everywhere at once.
 *
 * Changing language is not a filter or a display preference - it re-renders
 * the platform in a different language, including the municipal picture
 * itself. Alert titles, ward and department names, defect summaries and the
 * Copilot's narrative are all composed inside the data layer, so the switch
 * runs the SAME rebuild a municipal-corporation switch runs
 * (`rebuildAllLayers`), in the same dependency order, and then remounts the
 * routed subtree.
 *
 * The seeds are keyed on the corporation and never on the language, so this
 * is a pure re-description: every figure on screen before the switch is the
 * same figure after it. That property is asserted by `scripts/smoke-i18n.mjs`,
 * because a language toggle that quietly moved a number would be far worse
 * than one that failed loudly.
 */

interface LocaleState {
  locale: Locale
  /** The language being fetched, while its catalogue downloads; else null. */
  pending: Locale | null
  setLocale: (locale: Locale) => void
}

/** Switches the seam, the store and the data layers - catalogue already installed. */
function applyLocale(locale: Locale, set: (partial: Partial<LocaleState>) => void): void {
  if (locale === getLocale()) {
    set({ pending: null })
    return
  }
  // Order matters: the seam must already answer in the new language
  // before any layer rebuilds, or the layers would be rebuilt in the
  // outgoing one and the interface would show a half-translated city.
  setActiveLocale(locale)
  set({ locale, pending: null })
  rebuildAllLayers()
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: getLocale(),
      pending: null,
      setLocale: (locale) => {
        if (locale === getLocale() && get().pending === null) return
        // English, or a catalogue already fetched: switch in the same tick,
        // exactly as before the catalogue became lazy.
        if (isCatalogueLoaded(locale)) {
          applyLocale(locale, set)
          return
        }
        // Otherwise fetch it first. Only the LAST request wins, so a quick
        // Marathi -> English -> Marathi sequence settles on what was asked
        // for last rather than on whichever download finished last.
        set({ pending: locale })
        loadLocaleCatalogue(locale).then(
          () => {
            if (get().pending === locale) applyLocale(locale, set)
          },
          () => {
            // The catalogue could not be fetched: stay in the current
            // language rather than switching to one that would render as
            // English anyway.
            if (get().pending === locale) set({ pending: null })
          },
        )
      },
    }),
    {
      name: LOCALE_STORAGE_KEY,
      version: 1,
      // `pending` is transient download state, never persisted.
      partialize: (state) => ({ locale: state.locale }),
      /* The persisted value has already been read directly by
         `src/i18n/locale.ts` before any data layer evaluated. Rehydration here
         only has to reconcile the store with that decision - it must never
         trigger a second rebuild, which would discard the query cache on every
         page load. */
      onRehydrateStorage: () => (state) => {
        if (state && state.locale !== getLocale()) setActiveLocale(state.locale)
      },
    },
  ),
)

/** The active language. Subscribing re-renders the component on a switch. */
export function useLocale(): Locale {
  return useLocaleStore((s) => s.locale)
}

export function useSetLocale(): (locale: Locale) => void {
  return useLocaleStore((s) => s.setLocale)
}

/**
 * Keeps the document in step with the chosen language.
 *
 * `lang` is not cosmetic: it is what a screen reader consults to choose a
 * Marathi voice rather than reading Devanagari with an English one, and what
 * the stylesheet reads to select the Devanagari type stack. Mounted once, in
 * the shell.
 */
export function useApplyLocale(): Locale {
  const locale = useLocale()

  useEffect(() => {
    const root = document.documentElement
    root.lang = LOCALE_INFO[locale].htmlLang
    root.dataset.locale = locale
  }, [locale])

  return locale
}

/**
 * The language as a value that changes on every switch, for keying a subtree.
 *
 * Read through `useSyncExternalStore` on the module seam rather than from the
 * store, so that a component keyed on it is guaranteed to see the language
 * `t()` is currently answering in - not the store's copy of it.
 */
export function useLocaleSignature(): Locale {
  return useSyncExternalStore(
    (listener) => useLocaleStore.subscribe(listener),
    getLocale,
    () => DEFAULT_LOCALE,
  )
}
