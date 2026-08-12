import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { municipality } from '@/config/municipality.config'
import type { DataFreshness } from '@/types/common'
import { cn } from '@/utils/cn'
import { FreshnessLine, ProvenanceBadge } from '@/components/ui/badges'
import { t } from '@/i18n'

/**
 * Standard page header used by every intelligence surface.
 *
 * Enforces the institutional requirement that a screen states what it is,
 * where it sits in the hierarchy, when it was generated and where its figures
 * came from - before any figure is displayed.
 */
export interface PageHeaderProps {
  title: ReactNode
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
  title,
  eyebrow,
  description,
  breadcrumbs,
  actions,
  controls,
  freshness,
  meta,
  className,
  hideProvenance,
}: PageHeaderProps): React.JSX.Element {
  return (
    <header className={cn('min-w-0', className)}>
      {/* Identity banner - hierarchy, name and purpose of the screen. ---- */}
      {/* The brand colour is handed to the stylesheet as the banner's BASE
          layer rather than as its whole `background`. Setting `background`
          inline replaced the shorthand outright, which threw away the two
          radial gradients underneath it and left every page in the platform
          headed by a flat rectangle. */}
      <div
        className="banner-surface relative overflow-hidden rounded-xl px-5 py-5 shadow-raised sm:px-6 sm:py-6"
        style={{ '--banner-base': municipality.branding.panelColor } as React.CSSProperties}
      >
        {/* Faint grid texture, so the banner reads as an instrument panel
            rather than a flat block of colour. */}
        <span aria-hidden className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.35]" />
        <div className="relative">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label={t('Breadcrumb')} className="mb-1.5 flex flex-wrap items-center gap-1 text-[0.6875rem] text-white/65">
            {breadcrumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="inline-flex items-center gap-1">
                {i > 0 ? <ChevronRight className="h-3 w-3 text-white/45" aria-hidden /> : null}
                {crumb.to ? (
                  <Link to={crumb.to} className="transition-colors hover:text-white">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={cn(i === breadcrumbs.length - 1 && 'text-white/85')}>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <div className="mb-1.5 text-[0.6875rem] font-bold tracking-[0.13em] text-intel-200 uppercase">
                {eyebrow}
              </div>
            ) : null}
            <h1 className="text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] text-white">{title}</h1>
            {description ? (
              <p className="mt-1.5 max-w-4xl text-[0.875rem] leading-relaxed text-white/80">{description}</p>
            ) : null}
            {meta ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
          </div>
        </div>
      </div>

      {freshness ? (
        <FreshnessLine freshness={freshness} className="mt-2.5" />
      ) : !hideProvenance ? (
        <div className="mt-2.5">
          <ProvenanceBadge />
        </div>
      ) : null}

      {controls ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">{controls}</div>
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
