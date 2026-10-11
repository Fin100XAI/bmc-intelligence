import { type ReactNode, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { sectionForPath } from '@/config/navigation'
import type { DataFreshness } from '@/types/common'
import { cn } from '@/utils/cn'
import { FreshnessLine, ProvenanceBadge } from '@/components/ui/badges'
import { type BreadcrumbCrumb, useBreadcrumbStore } from '@/stores/breadcrumb.store'

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
 * The trail (`eyebrow` + `breadcrumbs`) used to be drawn a second time here as
 * well, in its own ruled box directly under the shell's own "Context" line —
 * two breadcrumb strips, a few pixels apart, saying almost the same thing.
 * This bar now reports its trail into `useBreadcrumbStore` instead, and the
 * shell's context line renders it as the tail of the one trail it already
 * shows for the product and the ward — one line, the way a reference platform
 * states it, rather than two.
 *
 * So what this bar still draws directly is only what genuinely belongs beside
 * the page's own content rather than in the shell's chrome: view actions and
 * data provenance.
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
  /** Small uppercase eyebrow - usually the section, e.g. "City Intelligence". Reported to the shell's context line, not drawn here. */
  eyebrow?: ReactNode
  description?: ReactNode
  /** Reported to the shell's context line as the trail's tail, not drawn here. */
  breadcrumbs?: BreadcrumbCrumb[]
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
  breadcrumbs,
  actions,
  controls,
  freshness,
  meta,
  className,
  hideProvenance,
}: PageHeaderProps): React.JSX.Element {
  const setTrail = useBreadcrumbStore((s) => s.set)
  const { pathname } = useLocation()
  // The trail's first leg names the menu section the screen sits under, read
  // from the menu itself, so the trail and the menu bar can never disagree -
  // a page's own wording for its section is replaced, the rest of its trail
  // (screen, record) is kept.
  const sectionLabel = sectionForPath(pathname)?.label
  const crumbs = breadcrumbs ?? []
  const trail = sectionLabel && crumbs.length > 0 ? [{ ...crumbs[0], label: sectionLabel }, ...crumbs.slice(1)] : crumbs
  const trailKey = JSON.stringify(trail)
  useEffect(() => {
    setTrail(JSON.parse(trailKey))
    return () => setTrail([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTrail, trailKey])

  // The bar earns its rule only when it has something of its own to show. The
  // trail no longer counts - that lives in the shell now.
  const hasBar = Boolean(meta) || Boolean(actions) || Boolean(freshness)

  if (!hasBar && !controls) return <></>

  return (
    <header className={cn('min-w-0', className)}>
      {/* Filters sit directly under the shell's Context line - nothing of the
          page's own furniture stands between them, the way the reference
          platform keeps that pair adjacent. */}
      {controls ? <div className="flex flex-wrap items-center gap-2 py-1.5">{controls}</div> : null}

      {hasBar ? (
        <div
          className={cn(
            'flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 rounded-lg border border-ink-200 bg-surface-sunken px-3 py-1.5',
            controls && 'mt-1.5',
          )}
        >
          {meta ? <div className="flex flex-wrap items-center gap-1.5">{meta}</div> : null}
          {freshness ? <FreshnessLine freshness={freshness} /> : !hideProvenance ? <ProvenanceBadge /> : null}
          {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
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
