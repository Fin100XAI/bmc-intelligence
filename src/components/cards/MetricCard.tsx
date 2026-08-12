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
   * Retained so the 200-odd call sites keep documenting what a metric means,
   * but it no longer selects the card's colour: cards cycle through the four
   * Google brand hues by their position in the grid (see `.metric-cycle` in
   * `src/styles/index.css`) so neighbours never repeat a colour.
   */
  tone?: 'default' | 'critical' | 'warn' | 'positive' | 'info'
  /** Explanation shown behind an info affordance. */
  explanation?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
  footer?: ReactNode
}

const VALUE_SIZE: Record<NonNullable<MetricCardProps['size']>, string> = {
  sm: 'text-metric-sm',
  md: 'text-metric',
  lg: 'text-metric-lg',
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
  size = 'md',
  className,
  footer,
}: MetricCardProps): React.JSX.Element {
  const interactive = Boolean(to || onClick)

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-current/20 ring-1 ring-current/35 ring-inset">
              {icon}
            </span>
          ) : null}
          {/* Wraps rather than truncates: a metric whose name is cut off is
              worse than one that occupies a second line. */}
          <span className="label-institutional leading-[1.35] break-words text-current">{label}</span>
          {explanation ? <InfoHint>{explanation}</InfoHint> : null}
        </div>
        {interactive ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-current/70 transition-all group-hover:translate-x-0.5 group-hover:text-current" />
        ) : null}
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className={cn('numeric font-semibold tracking-tight text-current', VALUE_SIZE[size])}>{value}</span>
            {unit ? <span className="text-xs font-semibold text-current/85">{unit}</span> : null}
          </div>
          {support ? <p className="mt-0.5 truncate text-[0.6875rem] text-current/90">{support}</p> : null}
        </div>
        {sparkline && sparkline.length > 1 ? (
          <Sparkline points={sparkline} className="shrink-0 opacity-80" />
        ) : null}
      </div>

      {progress ? (
        <div className="mt-2.5">
          <MiniBar value={progress.value} max={progress.max ?? 100} width={999} className="w-full" />
        </div>
      ) : null}

      {(trend || typeof deltaPct === 'number' || confidence || origin) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
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

      {freshness ? <FreshnessLine freshness={freshness} className="mt-2 text-current/85" compact /> : null}
      {footer ? <div className="mt-2.5 border-t border-current/25 pt-2">{footer}</div> : null}
    </>
  )

  const shell = cn(
    // `metric-cycle` is what the stylesheet keys the Google colour rotation
    // off - the hue comes from this card's position among its grid siblings.
    'metric-cycle group relative block overflow-hidden rounded-xl border p-4 shadow-card',
    interactive && 'lift-on-hover cursor-pointer hover:border-black/30 focus-visible:shadow-raised',
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
        'flex flex-col rounded-md px-2.5 py-1.5 text-left',
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
