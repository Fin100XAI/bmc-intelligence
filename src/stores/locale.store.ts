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
  setLocale: (locale: Locale) => void
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: getLocale(),
      setLocale: (locale) => {
        if (locale === getLocale()) return
        // Order matters: the seam must already answer in the new language
        // before any layer rebuilds, or the layers would be rebuilt in the
        // outgoing one and the interface would show a half-translated city.
        setActiveLocale(locale)
        set({ locale })
        rebuildAllLayers()
      },
    }),
    {
      name: LOCALE_STORAGE_KEY,
      version: 1,
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
