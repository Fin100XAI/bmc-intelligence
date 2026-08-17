import { Contrast } from 'lucide-react'
import { t } from '@/i18n'
import { usePreferencesStore, type ContrastPreference } from '@/stores/preferences.store'
import { cn } from '@/utils/cn'
import { Tooltip } from '@/components/ui/overlays'

/**
 * The header contrast control.
 *
 * Same shape as `FontSizeControl` and for the same reason: a control an
 * operator on a bright, daylit control-room screen or a projected display
 * reaches for in the moment, not one buried in Settings. It is a header
 * shortcut over the contrast preference Settings → Preferences already owns
 * (`usePreferencesStore`) — high contrast deepens muted text and hairline
 * borders into visible lines across every screen at once; semantic colour
 * keeps its meaning, only its weight changes.
 */
const OPTIONS: Array<{ value: ContrastPreference; label: () => string }> = [
  { value: 'standard', label: () => t('Standard') },
  { value: 'high', label: () => t('High') },
]

export function ContrastToggle({ className }: { className?: string }): React.JSX.Element {
  const contrast = usePreferencesStore((s) => s.contrast)
  const setContrast = usePreferencesStore((s) => s.setContrast)

  return (
    <Tooltip
      side="bottom"
      className={cn('shrink-0', className)}
      content={
        <span>
          <span className="font-semibold">{t('Contrast')}</span>
          <span className="mt-0.5 block opacity-80">
            {t('High contrast deepens secondary text and turns hairline rules into visible lines. Semantic colours keep their meaning — only their weight changes.')}
          </span>
        </span>
      }
    >
      <div
        role="group"
        aria-label={t('Contrast')}
        className="hidden h-8 items-center gap-0.5 rounded-md border border-ink-200 bg-surface-sunken p-0.5 shadow-xs lg:flex"
      >
        <Contrast className="ml-1 hidden h-3.5 w-3.5 shrink-0 text-ink-400 xl:block" aria-hidden />
        {OPTIONS.map(({ value, label }) => {
          const isActive = value === contrast
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isActive}
              onClick={() => setContrast(value)}
              className={cn(
                'rounded px-1.5 py-1 text-[0.6875rem] leading-none font-semibold transition-colors',
                'focus-visible:ring-2 focus-visible:ring-govt-500/30 focus-visible:outline-none',
                isActive
                  ? 'bg-surface text-govt-700 shadow-xs ring-1 ring-govt-200'
                  : 'text-ink-500 hover:bg-ink-100/70 hover:text-ink-700',
              )}
            >
              {label()}
            </button>
          )
        })}
      </div>
    </Tooltip>
  )
}
