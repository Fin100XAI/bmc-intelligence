import { type ReactNode } from 'react'
import type { DataFreshness, DataOrigin } from '@/types/common'
import { cn } from '@/utils/cn'
import { FreshnessLine, ProvenanceBadge } from '@/components/ui/badges'

/**
 * Every chart in the platform is wrapped in this frame, which enforces the
 * institutional requirement that a chart states its title, unit, timeframe
 * and provenance. A chart without those four things is not evidence.
 */
export interface ChartFrameProps {
  title: ReactNode
  unit: string
  timeframe: string
  description?: ReactNode
  actions?: ReactNode
  freshness?: DataFreshness
  origin?: DataOrigin
  legend?: ReactNode
  footnote?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** Fixed body height; charts need an explicit height to render. */
  height?: number
}

export function ChartFrame({
  title,
  unit,
  timeframe,
  description,
  actions,
  freshness,
  origin = 'demonstration',
  legend,
  footnote,
  children,
  className,
  bodyClassName,
  height = 220,
}: ChartFrameProps): React.JSX.Element {
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-[0.8125rem] leading-5 font-semibold text-ink-800">{title}</h4>
          <p className="numeric mt-0.5 text-[0.6875rem] text-ink-400">
            {unit} · {timeframe}
          </p>
          {description ? <p className="mt-1 text-xs leading-relaxed text-ink-500">{description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          {!freshness ? <ProvenanceBadge origin={origin} /> : null}
        </div>
      </div>

      {legend ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">{legend}</div> : null}

      <div className={cn('mt-3 min-w-0 flex-1', bodyClassName)} style={{ height }}>
        {children}
      </div>

      {freshness ? <FreshnessLine freshness={freshness} className="mt-2.5" compact /> : null}
      {footnote ? <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-400">{footnote}</p> : null}
    </div>
  )
}

/** Consistent legend swatch used across every chart. */
export function LegendItem({
  colour,
  label,
  dashed,
  value,
}: {
  colour: string
  label: ReactNode
  dashed?: boolean
  value?: ReactNode
}): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-ink-500">
      <span
        aria-hidden
        className={cn('h-0.5 w-3 rounded-full', dashed && 'opacity-60')}
        style={{
          backgroundColor: dashed ? 'transparent' : colour,
          backgroundImage: dashed ? `repeating-linear-gradient(90deg, ${colour} 0 3px, transparent 3px 6px)` : undefined,
          height: dashed ? 2 : 3,
        }}
      />
      {label}
      {value ? <span className="numeric font-semibold text-ink-700">{value}</span> : null}
    </span>
  )
}
