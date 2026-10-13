import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { municipality } from '@/config/municipality.config'
import { ROUTES } from '@/config/navigation'
import { useActiveCorporation } from '@/stores/corporation.store'
import { cityName } from '@/config/corporations'
import { cn } from '@/utils/cn'
import { Tooltip } from '@/components/ui/overlays'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatDateTime, formatRelative } from '@/utils/format'
import { t } from '@/i18n'
import type { TopbarStatus } from './Topbar'

/* The operator's wall clock. Formatted in Asia/Kolkata explicitly so the "IST"
   suffix is true regardless of the machine the console is being shown on. */
const IST_TIME = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})
const IST_DATE = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
})

const STATE_DOT = {
  operational: 'bg-ok-500',
  degraded: 'bg-warn-500',
  'at-risk': 'bg-risk-500',
  critical: 'bg-crit-500',
} as const

const STATE_LABEL = {
  operational: 'City operations normal',
  degraded: 'City operations degraded',
  'at-risk': 'City operations at risk',
  critical: 'City operations critical',
} as const

/**
 * The live clock, opposite the brand.
 *
 * This is the one place in the application that renders the real system clock:
 * it is the operator's wall time, not a data timestamp. Every figure,
 * freshness label and audit age elsewhere stays anchored to `DEMO_NOW`
 * (`src/utils/deterministic.ts`) so the municipal picture remains internally
 * consistent - do not wire this clock into either direction of that boundary.
 *
 * It used to sit in the command bar below; it now stands at the far end of
 * this band instead, the same way the reference portal's masthead states its
 * "position as at" opposite its own letterhead - the brand anchors one end of
 * the row, the live time the other.
 */
function LiveClock({ status, cityLabel }: { status: TopbarStatus; cityLabel: string }): React.JSX.Element {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <Tooltip
      side="bottom"
      className="hidden shrink-0 sm:inline-flex"
      content={
        <span>
          <span className="font-semibold">{STATE_LABEL[status.operationalState]}</span>
          <span className="mt-0.5 block opacity-80">{t('Live {0} time · IST', cityLabel)}</span>
          <span className="mt-0.5 block opacity-80">
            {t('Municipal figures are anchored to {0}.', formatDateTime(DEMO_NOW))}
          </span>
          <span className="mt-0.5 block opacity-80">{t('Data refreshed {0}', formatRelative(status.lastRefreshedAt))}</span>
        </span>
      }
    >
      <span className="flex flex-col items-end justify-center leading-none">
        <span className="numeric flex items-center gap-1.5 text-[0.8125rem] font-semibold tabular-nums text-white">
          <span className={cn('animate-pulse-soft h-1.5 w-1.5 rounded-full', STATE_DOT[status.operationalState])} aria-hidden />
          <time dateTime={now.toISOString()}>{IST_TIME.format(now)}</time>
        </span>
        <span className="mt-1 text-[0.5625rem] font-semibold tracking-[0.09em] text-white/60 uppercase">
          {t('{0} · IST', IST_DATE.format(now))}
        </span>
      </span>
    </Tooltip>
  )
}

/**
 * The masthead band, above everything.
 *
 * A public body's record identifies itself before it says anything: the seal
 * and the platform's own name. Placing it above the search bar rather than
 * inside the page is the point — it frames the whole application as one
 * fixed identity, instead of being a heading that happens to sit on some
 * screens and not others. It never carries the page's own title - that is
 * `PageHeader`'s breadcrumb, on the page itself.
 *
 * The gold rule beneath is the single piece of ornament in the shell, and it
 * earns its place by marking where the platform's identity ends and its
 * working surfaces begin.
 */
export function AppMasthead({ status }: { status: TopbarStatus }): React.JSX.Element {
  const corporation = useActiveCorporation()

  return (
    <div className="shrink-0">
      {/* The institutional navy, `govt-900`, the authority colour. The menu
          bar below the top bar carries the same navy. */}
      <div className="flex flex-wrap items-center gap-3 bg-govt-900 px-3 py-2.5 sm:px-4">
        {/* The seal and the title link to the Executive Overview, the way a
            masthead links home on any government portal.

            Both links are deliberately layout-neutral. The image's wrapper
            carries the `shrink-0` the image used to hold, so it occupies the
            identical slot in the flex row; the title's link sits INSIDE the
            existing `h1`, inline, so the heading keeps its own size, weight and
            `truncate` behaviour. Nothing above or below either element moves.

            The image link needs its own accessible name — the image is
            `alt=""`/`aria-hidden` because it is decoration, which leaves the
            link with nothing to announce. The title link takes its name from
            the heading text it wraps, so it needs none. */}
        <Link to={ROUTES.executive} aria-label={t('Executive Overview')} className="shrink-0">
          <img
            src={municipality.branding.markPath}
            alt=""
            aria-hidden
            className="h-10 w-10 rounded-[3px] object-cover ring-1 ring-white/25"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.0625rem] leading-tight font-bold tracking-tight text-white">
            <Link to={ROUTES.executive} className="hover:underline">
              {municipality.branding.productShortName}
            </Link>
          </h1>
        </div>

        {/* The live clock - exact opposite end of the band from the brand. */}
        <LiveClock status={status} cityLabel={cityName(corporation)} />
      </div>

      {/* The gold rule. */}
      <div aria-hidden className="h-[3px] bg-gradient-to-r from-gold-500 via-gold-400 to-gold-600" />
    </div>
  )
}
