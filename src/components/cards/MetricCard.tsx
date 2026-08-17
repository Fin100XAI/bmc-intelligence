import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { ConfidenceLevel, DataFreshness, DataOrigin, Trend } from '@/types/common'
import { cn } from '@/utils/cn'
import { ConfidenceBadge, FreshnessLine, ProvenanceBadge, TrendBadge } from '@/components/ui/badges'
import { InfoHint } from '@/components/ui/overlays'
import { MiniBar, Sparkline } from '@/components/charts/charts'

/**
 * The single metric primitive used across every intelligence surface.
 * A metric card always states its value, its movement, its provenance and -
 * where relevant - its confidence. It is clickable into a drilldown.
 *
 * It is drawn in the same language as `GovStat` in `@/components/gov/GovPanel`:
 * square corners, a hairline border, a small uppercase label, one large figure
 * set in tabular numerals, and the supporting reading beneath it. The rotating
 * block of Google colour this card used to wear made a row of figures read as
 * four independent product widgets competing for attention; ruled white cells
 * on the canvas read as a column of a departmental return, which is what these
 * numbers actually are. Meaning is carried by the figure's own colour, so the
 * only thing tinted on the screen is the thing that is actually adverse.
 */
export interface MetricCardProps {
  label: ReactNode
  value: ReactNode
  unit?: string
  /** Secondary supporting figure, e.g. "of ₹12,860 Cr sanctioned". */
  support?: ReactNode
  trend?: Trend
  /** Simple delta where a full Trend object is unavailable. */
  deltaPct?: number
  deltaHigherIsBetter?: boolean
  confidence?: ConfidenceLevel
  origin?: DataOrigin
  freshness?: DataFreshness
  /** Renders a progress rail beneath the value. */
  progress?: { value: number; max?: number }
  sparkline?: number[]
  /** Navigates into the drilldown for this metric. */
  to?: string
  onClick?: () => void
  icon?: ReactNode
  /**
   * The reading of the figure, and now the only colour on the card. Call sites
   * already set it conditionally - `count > 0 ? 'critical' : 'default'` - so a
   * page tints exactly the figures that are adverse and leaves the rest in
   * institutional navy.
   */
  tone?: 'default' | 'critical' | 'warn' | 'positive' | 'info'
  /**
   * Opt-in pale Google wash for the card itself — identity, not a reading.
   * Left unset everywhere by default, on purpose: the ruled-white-cell
   * philosophy above still holds for an ordinary row of figures. A call site
   * only reaches for this when the cards are standing in for `GovStripCell`
   * as a page's own masthead strip and are meant to read as a row of
   * distinct stat cards rather than a departmental return.
   */
  background?: 'red' | 'amber' | 'green'
  /** Explanation shown behind an info affordance. */
  explanation?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
  footer?: ReactNode
}

const BACKGROUND_WASH: Record<NonNullable<MetricCardProps['background']>, string> = {
  red: 'bg-google-red-50',
  amber: 'bg-google-yellow-50',
  green: 'bg-google-green-50',
}

/**
 * Figure sizes, set here rather than taken from the `text-metric*` display
 * scale. A return states its numbers large enough to be read down a column,
 * not large enough to be read across a room.
 */
const VALUE_SIZE: Record<NonNullable<MetricCardProps['size']>, string> = {
  sm: 'text-[1.375rem]',
  md: 'text-[1.75rem]',
  lg: 'text-[2.25rem]',
}

const VALUE_TONE: Record<NonNullable<MetricCardProps['tone']>, string> = {
  default: 'text-govt-900',
  critical: 'text-crit-600',
  warn: 'text-warn-700',
  positive: 'text-google-green-700',
  info: 'text-govt-700',
}

export function MetricCard({
  label,
  value,
  unit,
  support,
  trend,
  deltaPct,
  deltaHigherIsBetter = true,
  confidence,
  origin,
  freshness,
  progress,
  sparkline,
  to,
  onClick,
  icon,
  explanation,
  tone = 'default',
  background,
  size = 'md',
  className,
  footer,
}: MetricCardProps): React.JSX.Element {
  const interactive = Boolean(to || onClick)

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {icon ? (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] border border-ink-200 bg-surface-sunken text-ink-500">
              {icon}
            </span>
          ) : null}
          {/* Wraps rather than truncates: a metric whose name is cut off is
              worse than one that occupies a second line. */}
          <span className="min-w-0 text-[0.625rem] leading-[1.35] font-bold tracking-[0.08em] break-words text-ink-500 uppercase">
            {label}
          </span>
          {explanation ? <InfoHint>{explanation}</InfoHint> : null}
        </div>
        {interactive ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-300 transition-colors group-hover:text-govt-700" />
        ) : null}
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className={cn('numeric leading-none font-bold tabular-nums', VALUE_SIZE[size], VALUE_TONE[tone])}>
              {value}
            </span>
            {unit ? <span className="text-[0.8125rem] font-medium text-ink-400">{unit}</span> : null}
          </div>
          {support ? <p className="mt-1 text-[0.6875rem] leading-snug text-ink-500">{support}</p> : null}
        </div>
        {sparkline && sparkline.length > 1 ? <Sparkline points={sparkline} className="shrink-0" /> : null}
      </div>

      {progress ? (
        <div className="mt-2">
          {/* The rail is deliberately over-wide and clipped by the card's own
              `overflow-hidden`: `MiniBar` sets its width inline, so a class
              cannot stretch it. */}
          <MiniBar value={progress.value} max={progress.max ?? 100} width={999} className="w-full" />
        </div>
      ) : null}

      {(trend || typeof deltaPct === 'number' || confidence || origin) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {trend ? <TrendBadge trend={trend} showLabel={false} /> : null}
          {!trend && typeof deltaPct === 'number' ? (
            <TrendBadge
              trend={{
                direction: deltaPct > 0.4 ? 'up' : deltaPct < -0.4 ? 'down' : 'flat',
                changePct: deltaPct,
                polarity: deltaHigherIsBetter ? 'positive' : 'negative',
                comparisonLabel: 'vs previous period',
              }}
              showLabel={false}
            />
          ) : null}
          {confidence ? <ConfidenceBadge confidence={confidence} /> : null}
          {origin && !freshness ? <ProvenanceBadge origin={origin} /> : null}
        </div>
      )}

      {freshness ? <FreshnessLine freshness={freshness} className="mt-2" compact /> : null}
      {footer ? <div className="mt-2 border-t border-ink-100 pt-2">{footer}</div> : null}
    </>
  )

  const shell = cn(
    // Two pixels of radius, not none: a true right angle reads as an unstyled
    // box on screen, while a hairline with a two-pixel corner reads as a
    // printed rule. The same corner every panel on the platform now carries.
    'group relative block overflow-hidden rounded-[2px] border border-ink-200 p-3 shadow-xs',
    background ? BACKGROUND_WASH[background] : 'bg-surface',
    interactive && 'cursor-pointer transition-colors hover:border-govt-300 hover:bg-govt-50/50',
    className,
  )

  if (to) {
    return (
      <Link to={to} className={shell}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(shell, 'w-full text-left')}>
        {body}
      </button>
    )
  }
  return <div className={shell}>{body}</div>
}

/** Ultra-compact metric for dense strips (Situation Room, context bars). */
export function MetricPill({
  label,
  value,
  tone = 'default',
  className,
  onClick,
}: {
  label: ReactNode
  value: ReactNode
  tone?: 'default' | 'critical' | 'warn' | 'positive' | 'info'
  className?: string
  onClick?: () => void
}): React.JSX.Element {
  const tones = {
    default: 'bg-ink-50 text-ink-700',
    critical: 'bg-google-red-50 text-google-red-700',
    warn: 'bg-google-yellow-50 text-google-yellow-900',
    positive: 'bg-google-green-50 text-google-green-700',
    info: 'bg-google-blue-50 text-google-blue-700',
  }
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex flex-col rounded-[2px] px-2.5 py-1.5 text-left',
        tones[tone],
        onClick && 'cursor-pointer transition-opacity hover:opacity-85',
        className,
      )}
    >
      <span className="text-[0.625rem] font-medium tracking-wide uppercase opacity-70">{label}</span>
      <span className="numeric text-base leading-tight font-semibold">{value}</span>
    </Wrapper>
  )
}
