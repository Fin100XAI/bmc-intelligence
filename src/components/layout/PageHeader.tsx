import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { DataFreshness } from '@/types/common'
import { cn } from '@/utils/cn'
import { FreshnessLine, ProvenanceBadge } from '@/components/ui/badges'
import { t } from '@/i18n'

/**
 * Page furniture — the ruled strip that sits above a screen's content.
 *
 * This used to be the screen's identity banner: a tall tinted block carrying
 * the page title and its standfirst. The shell now renders that identity once,
 * above the top bar (`AppMasthead`), taking its wording from the route's own
 * navigation entry or from whatever the page declares through
 * `usePageMasthead`. A banner here as well meant every screen in the platform
 * stated its own name twice, a few rows apart, which is the surest way to make
 * a record look like a product.
 *
 * So what remains is only the part the masthead does NOT carry: where the
 * screen sits in the hierarchy, what may be done on it, and what the figures'
 * provenance is. One hairline-ruled strip, the height of a line of type.
 *
 * `title` and `description` stay in the props — every page passes them, and
 * they remain the honest declaration of what the screen is — but they are the
 * masthead's business to display, not this bar's.
 */
export interface PageHeaderProps {
  /**
   * Optional, because the masthead is where a screen now states its name. A
   * page that has declared its wording through `usePageMasthead` has nothing
   * left for this bar to carry beyond its trail, actions and provenance.
   */
  title?: ReactNode
  /** Small uppercase eyebrow - usually the section, e.g. "City Intelligence". */
  eyebrow?: ReactNode
  description?: ReactNode
  breadcrumbs?: Array<{ label: string; to?: string }>
  actions?: ReactNode
  /** Rendered under the description - filters, ward selector, mode switch. */
  controls?: ReactNode
  freshness?: DataFreshness
  meta?: ReactNode
  className?: string
  /** Hides the provenance badge where the header already carries freshness. */
  hideProvenance?: boolean
}

export function PageHeader({
  eyebrow,
  breadcrumbs,
  actions,
  controls,
  freshness,
  meta,
  className,
  hideProvenance,
}: PageHeaderProps): React.JSX.Element {
  const trail = breadcrumbs ?? []
  // The bar earns its rule only when it has something to rule off. A page that
  // passes nothing but a title now renders no furniture at all, rather than an
  // empty box holding a gap open above the first panel.
  const hasBar = trail.length > 0 || Boolean(eyebrow) || Boolean(meta) || Boolean(actions) || Boolean(freshness)

  if (!hasBar && !controls) return <></>

  return (
    <header className={cn('min-w-0', className)}>
      {hasBar ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[2px] border border-ink-200 bg-surface-sunken px-3 py-1.5">
          {eyebrow ? (
            <span className="shrink-0 text-[0.625rem] font-bold tracking-[0.1em] text-ink-500 uppercase">
              {eyebrow}
            </span>
          ) : null}
          {eyebrow && trail.length > 0 ? <span aria-hidden className="h-3 w-px shrink-0 bg-ink-200" /> : null}

          {trail.length > 0 ? (
            <nav
              aria-label={t('Breadcrumb')}
              className="flex min-w-0 flex-wrap items-center gap-1 text-[0.6875rem] text-ink-500"
            >
              {trail.map((crumb, i) => (
                <span key={`${crumb.label}-${i}`} className="inline-flex items-center gap-1">
                  {i > 0 ? <ChevronRight className="h-3 w-3 text-ink-300" aria-hidden /> : null}
                  {crumb.to ? (
                    <Link to={crumb.to} className="transition-colors hover:text-govt-700 hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={cn(i === trail.length - 1 && 'font-semibold text-ink-700')}>{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          ) : null}

          {/* Everything on the right of the rule is what the screen offers or
              discloses, rather than what it is called. */}
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {meta ? <div className="flex flex-wrap items-center gap-1.5">{meta}</div> : null}
            {freshness ? <FreshnessLine freshness={freshness} /> : !hideProvenance ? <ProvenanceBadge /> : null}
            {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
          </div>
        </div>
      ) : null}

      {controls ? (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 rounded-[2px] border border-ink-200 bg-surface px-3 py-2',
            hasBar && 'mt-2',
          )}
        >
          {controls}
        </div>
      ) : null}
    </header>
  )
}

/**
 * Page body wrapper. Every page uses this so vertical rhythm, max width and
 * responsive padding are identical across all fifty-four screens and content
 * never overlaps at any breakpoint.
 *
 * It also carries the entrance: `page-enter` (see `src/styles/index.css`)
 * brings each top-level section in, in reading order, so a screen assembles
 * itself top-down instead of appearing all at once. Expressed here rather than
 * per page so every screen moves the same way, and suppressed entirely by
 * Settings → Preferences → reduced motion.
 */
export function PageBody({
  children,
  className,
  width = 'wide',
}: {
  children: ReactNode
  className?: string
  width?: 'wide' | 'full' | 'narrow'
}): React.JSX.Element {
  const widths = {
    narrow: 'max-w-4xl',
    wide: 'max-w-[1600px]',
    full: 'max-w-none',
  }
  return (
    <div className={cn('page-enter mx-auto w-full min-w-0 space-y-4', widths[width], className)}>{children}</div>
  )
}

/** Two-column layout: main workspace plus a sticky supporting rail. */
export function SplitLayout({
  main,
  aside,
  asideWidth = 'md',
  className,
  reverseOnMobile,
}: {
  main: ReactNode
  aside: ReactNode
  asideWidth?: 'sm' | 'md' | 'lg'
  className?: string
  reverseOnMobile?: boolean
}): React.JSX.Element {
  const widths = {
    sm: 'xl:w-72',
    md: 'xl:w-80',
    lg: 'xl:w-96',
  }
  return (
    <div className={cn('flex min-w-0 flex-col gap-4 xl:flex-row', className)}>
      <div className={cn('min-w-0 flex-1', reverseOnMobile && 'order-2 xl:order-1')}>{main}</div>
      <aside
        className={cn(
          'min-w-0 shrink-0 space-y-4 xl:sticky xl:top-4 xl:self-start',
          widths[asideWidth],
          reverseOnMobile && 'order-1 xl:order-2',
        )}
      >
        {aside}
      </aside>
    </div>
  )
}
