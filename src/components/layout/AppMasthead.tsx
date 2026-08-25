import { Link } from 'react-router-dom'
import { municipality } from '@/config/municipality.config'
import { ROUTES } from '@/config/navigation'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatDateTime } from '@/utils/format'
import { t } from '@/i18n'

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
export function AppMasthead(): React.JSX.Element {
  return (
    <div className="shrink-0">
      {/* The corporation's own civic blue, `portal-700` (#0051bb) - the same
          band mcgm.gov.in opens on, and the same one the public landing and
          sign-in pages carry before a user is ever inside the application. An
          officer's working session and the portal they arrived from should
          read as one system, not as two different institutions handing off
          to each other at the sign-in wall. The menu bar below the top bar
          carries the same blue for the same reason. */}
      <div className="flex flex-wrap items-center gap-3 bg-portal-700 px-3 py-2.5 sm:px-4">
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
