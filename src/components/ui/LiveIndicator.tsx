import { useEffect, useState } from 'react'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'

/**
 * src/components/ui/LiveIndicator.tsx
 *
 * A quiet freshness signal for a panel backed by a polling query
 * (`refetchInterval` on `useServiceQuery`) - a pulsing dot plus "Updated Xs
 * ago", deliberately understated rather than a jarring re-layout on every
 * tick. Pairs with `refetchIntervalInBackground: false` and the platform's
 * explicit stance that operational software should not silently reshuffle
 * beneath an operator: this tells the operator data IS live, without moving
 * anything else on the screen to do it.
 *
 * Ticks against the real wall clock, on purpose - unlike `formatRelative` in
 * `src/utils/format.ts`, which is deliberately anchored to the frozen
 * `DEMO_NOW` so municipal figures stay internally consistent. `dataUpdatedAt`
 * (from TanStack Query) is a real `Date.now()` timestamp, so "how long ago
 * did this poll land" has to be measured against real time too - the same
 * boundary `Topbar.tsx`'s `LiveClock` already keeps for the same reason.
 */
export function LiveIndicator({
  dataUpdatedAt,
  isFetching,
  className,
}: {
  /** `UseQueryResult.dataUpdatedAt` - a real epoch millisecond timestamp. */
  dataUpdatedAt: number
  isFetching?: boolean
  className?: string
}): React.JSX.Element {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const seconds = Math.max(0, Math.round((nowMs - dataUpdatedAt) / 1000))
  const label = seconds < 5 ? t('Updated just now') : t('Updated {0}s ago', seconds)

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[0.72rem] font-medium text-ink-500', className)}>
      <span
        className={cn('h-1.5 w-1.5 rounded-full bg-ok-500', isFetching ? 'animate-pulse-soft' : undefined)}
        aria-hidden
      />
      {label}
    </span>
  )
}
