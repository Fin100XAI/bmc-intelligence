import { ALargeSmall } from 'lucide-react'
import { t } from '@/i18n'
import { DENSITY_LABEL, usePreferencesStore, type InterfaceDensity } from '@/stores/preferences.store'
import { cn } from '@/utils/cn'
import { Tooltip } from '@/components/ui/overlays'

/**
 * The header text-size control.
 *
 * Government portals conventionally carry an "A- A A+" control in the masthead
 * so a reader can enlarge type without hunting through a settings screen — the
 * same expectation this platform's own institutional styling otherwise invites.
 * Rather than introduce a second, competing notion of "font size", this is a
 * thin presentation over the density preference the Settings → Preferences
 * screen already exposes (`usePreferencesStore`): density drives the document
 * root's font size, and every rem-based measurement in the interface — type,
 * spacing, icon sizing — scales with it. Three steps, `A A A` set in
 * ascending sizes so the control communicates its own effect before it is
 * ever pressed.
 */
const STEPS: Array<{ density: InterfaceDensity; glyphClass: string }> = [
  { density: 'compact', glyphClass: 'text-[0.625rem]' },
  { density: 'comfortable', glyphClass: 'text-[0.8125rem]' },
  { density: 'spacious', glyphClass: 'text-base' },
]

export function FontSizeControl({ className }: { className?: string }): React.JSX.Element {
  const density = usePreferencesStore((s) => s.density)
  const setDensity = usePreferencesStore((s) => s.setDensity)

  return (
    <Tooltip
      side="bottom"
      className={cn('shrink-0', className)}
      content={
        <span>
          <span className="font-semibold">{t('Text size')}</span>
          <span className="mt-0.5 block opacity-80">
            {t('Scales type and spacing across the whole interface. Saved to this browser.')}
          </span>
        </span>
      }
    >
      <div
        role="group"
        aria-label={t('Text size')}
        className="hidden h-8 items-center gap-0.5 rounded-md border border-ink-200 bg-surface-sunken p-0.5 shadow-xs sm:flex"
      >
        <ALargeSmall className="ml-1 hidden h-3.5 w-3.5 shrink-0 text-ink-400 lg:block" aria-hidden />
        {STEPS.map(({ density: step, glyphClass }) => {
          const isActive = step === density
          return (
            <button
              key={step}
              type="button"
              aria-pressed={isActive}
              aria-label={DENSITY_LABEL[step]}
              onClick={() => setDensity(step)}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded font-bold transition-colors',
                glyphClass,
                'focus-visible:ring-2 focus-visible:ring-govt-500/30 focus-visible:outline-none',
                isActive
                  ? 'bg-surface text-govt-700 shadow-xs ring-1 ring-govt-200'
                  : 'text-ink-500 hover:bg-ink-100/70 hover:text-ink-700',
              )}
            >
              A
            </button>
          )
        })}
      </div>
    </Tooltip>
  )
}
