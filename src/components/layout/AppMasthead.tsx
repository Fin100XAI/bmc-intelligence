import { Link, useLocation } from 'react-router-dom'
import { municipality } from '@/config/municipality.config'
import { ROUTES, navItemForPath } from '@/config/navigation'
import { useMastheadStore } from '@/stores/masthead.store'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatDateTime } from '@/utils/format'
import { t } from '@/i18n'

/**
 * The masthead band, above everything.
 *
 * A public body's record identifies itself before it says anything: the seal,
 * the office publishing it, what the screen is, and the moment the figures
 * were taken. Placing it above the search bar rather than inside the page is
 * the point — it frames the whole application as one corporation's record,
 * instead of being a heading that happens to sit on some screens and not
 * others.
 *
 * Wording comes from the page when the page states one (`usePageMasthead`),
 * and otherwise from the route's own navigation entry, which every route
 * already carries a label and description for. So the band is always correct
 * and never blank.
 *
 * The gold rule beneath is the single piece of ornament in the shell, and it
 * earns its place by marking where the administration's identity ends and its
 * working surfaces begin.
 */
export function AppMasthead(): React.JSX.Element {
  const location = useLocation()
  const overrideTitle = useMastheadStore((s) => s.title)
  const overrideStandfirst = useMastheadStore((s) => s.standfirst)

  const navItem = navItemForPath(location.pathname)
  const title = overrideTitle ?? navItem?.label ?? municipality.branding.productName
  const standfirst = overrideStandfirst ?? navItem?.description ?? municipality.branding.deploymentLine

  return (
    <div className="shrink-0">
      {/* The institutional navy, `govt-900` (#1b3170).
          Not the `portal-*` ramp: its 900 step is a desaturated slate that
          reads green against white rather than blue, and its lighter steps are
          the public site's brighter civic blue. This band carries the
          corporation's identity inside the application, so it takes the
          application's own authority colour — the same one the menu bar below
          the top bar uses, so the two read as one system. */}
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
          <p className="truncate text-[0.625rem] font-semibold tracking-[0.12em] text-white/70 uppercase">
            {t('{0} · Office of the Municipal Commissioner', municipality.municipalityName)}
          </p>
          <h1 className="mt-0.5 truncate text-[1.0625rem] leading-tight font-bold tracking-tight text-white">
            <Link to={ROUTES.executive} className="hover:underline">
              {title}
            </Link>
          </h1>
          <p className="mt-0.5 line-clamp-2 max-w-5xl text-[0.6875rem] leading-snug text-white/65">{standfirst}</p>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-[0.5625rem] font-bold tracking-[0.1em] text-white/60 uppercase">{t('Position as at')}</p>
          <p className="numeric mt-0.5 text-[0.75rem] font-semibold text-white tabular-nums">
            {formatDateTime(DEMO_NOW.toISOString())}
          </p>
          <p className="mt-0.5 text-[0.625rem] text-white/60">{municipality.environmentLabel}</p>
        </div>
      </div>

      {/* The gold rule. */}
      <div aria-hidden className="h-[3px] bg-gradient-to-r from-gold-500 via-gold-400 to-gold-600" />
    </div>
  )
}
