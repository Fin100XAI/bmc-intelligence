import { Languages } from 'lucide-react'
import { LOCALES, LOCALE_INFO, type Locale } from '@/i18n'
import { t } from '@/i18n'
import { useLocale, useSetLocale } from '@/stores/locale.store'
import { cn } from '@/utils/cn'
import { Tooltip } from '@/components/ui/overlays'

/**
 * The interface language control.
 *
 * Presented as a segmented control rather than a menu, and rendered at every
 * breakpoint, because for a bilingual state the language is not a setting an
 * operator goes looking for - it is a property of the screen they are standing
 * in front of, and a visiting officer must be able to change it without being
 * told where it lives. Two options fit; a menu would hide half of them behind
 * a click for no gain.
 *
 * Each option is labelled in ITS OWN language. A reader who cannot read the
 * current one still has to be able to find their own, which is why the Marathi
 * option says मराठी and not "Marathi".
 */
export function LanguageSwitcher({ className }: { className?: string }): React.JSX.Element {
  const locale = useLocale()
  const setLocale = useSetLocale()

  return (
    <Tooltip
      side="bottom"
      className={cn('shrink-0', className)}
      content={
        <span>
          <span className="font-semibold">{t('Interface language')}</span>
          <span className="mt-0.5 block opacity-80">
            {t('Every screen, figure label and generated finding is re-rendered in the language chosen here.')}
          </span>
        </span>
      }
    >
      <div
        role="group"
        aria-label={t('Interface language')}
        className="flex h-8 items-center gap-0.5 rounded-md border border-ink-200 bg-surface-sunken p-0.5 shadow-xs"
      >
        <Languages className="ml-1 hidden h-3.5 w-3.5 shrink-0 text-ink-400 sm:block" aria-hidden />
        {LOCALES.map((id: Locale) => {
          const info = LOCALE_INFO[id]
          const isActive = id === locale
          return (
            <button
              key={id}
              type="button"
              lang={info.htmlLang}
              aria-pressed={isActive}
              /* Named in English as well as in itself, so the control is
                 unambiguous to a screen reader in either language. */
              aria-label={`${info.nativeName} — ${info.englishName}`}
              onClick={() => setLocale(id)}
              className={cn(
                'rounded px-1.5 py-1 text-[0.6875rem] leading-none font-semibold transition-colors',
                'focus-visible:ring-2 focus-visible:ring-govt-500/30 focus-visible:outline-none',
                isActive
                  ? 'bg-surface text-govt-700 shadow-xs ring-1 ring-govt-200'
                  : 'text-ink-500 hover:bg-ink-100/70 hover:text-ink-700',
              )}
            >
              {info.nativeName}
            </button>
          )
        })}
      </div>
    </Tooltip>
  )
}
