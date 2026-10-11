import type { ReactNode } from 'react'
import { CHART_COLOURS } from '@/components/charts'
import { formatNumber } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { Severity } from '@/types/common'
import type { InfoTone } from './index'

/**
 * Small meter building blocks for the Command Centre pages, alongside the
 * shared kit in `./index`. Each states one reading as a picture with its
 * figure and label in text beside it, so colour is never the only carrier.
 *
 * Colour follows status: positive / warn / risk / critical, with neutral
 * (government blue) where a quantity is a count rather than a judgement.
 */

const TONE_TEXT: Record<InfoTone, string> = {
  positive: 'text-ok-700',
  neutral: 'text-ink-900',
  warn: 'text-warn-700',
  risk: 'text-risk-700',
  critical: 'text-crit-700',
}

const TONE_FILL: Record<InfoTone, string> = {
  positive: CHART_COLOURS.positive,
  neutral: CHART_COLOURS.primary,
  warn: CHART_COLOURS.warn,
  risk: CHART_COLOURS.risk,
  critical: CHART_COLOURS.critical,
}

/** Severity as a fill colour - always paired with a SeverityBadge or text label. */
export const SEVERITY_COLOUR: Record<Severity, string> = {
  critical: CHART_COLOURS.critical,
  high: CHART_COLOURS.risk,
  medium: CHART_COLOURS.warn,
  low: CHART_COLOURS.primary,
  info: CHART_COLOURS.neutral,
}

/** Status tone for a 0-100 score where higher is better. */
export function scoreTone(score: number): InfoTone {
  if (score >= 78) return 'positive'
  if (score >= 60) return 'neutral'
  if (score >= 45) return 'warn'
  if (score >= 30) return 'risk'
  return 'critical'
}

/** Status tone for a 0-100 reading where higher is worse (risk, occupancy, signal). */
export function burdenTone(value: number): InfoTone {
  if (value >= 78) return 'critical'
  if (value >= 62) return 'risk'
  if (value >= 45) return 'warn'
  return 'positive'
}

export function toneText(tone: InfoTone): string {
  return TONE_TEXT[tone]
}

export function toneFill(tone: InfoTone): string {
  return TONE_FILL[tone]
}

/** A labelled horizontal meter: label left, figure right, fill bar beneath. */
export function MeterRow({
  label,
  value,
  max = 100,
  display,
  tone,
  onClick,
  active,
}: {
  label: ReactNode
  value: number
  max?: number
  /** Text shown in place of the raw value, e.g. "62/100" or "4 of 6". */
  display?: ReactNode
  tone: InfoTone
  onClick?: () => void
  active?: boolean
}): React.JSX.Element {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1e-9, max)) * 100))
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2 text-[0.6875rem]">
        <span className="min-w-0 truncate font-medium text-ink-700">{label}</span>
        <span className={cn('numeric shrink-0 font-bold tabular-nums', TONE_TEXT[tone])}>{display ?? formatNumber(value)}</span>
      </span>
      <span className="mt-1 block h-2 w-full overflow-hidden rounded-full bg-ink-100">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: TONE_FILL[tone] }} />
      </span>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          '-mx-1.5 block w-[calc(100%+0.75rem)] rounded-md px-1.5 py-1 text-left transition-colors hover:bg-govt-50/70',
          active && 'bg-govt-50 ring-1 ring-govt-200',
        )}
      >
        {body}
      </button>
    )
  }
  return <div className="block">{body}</div>
}

/**
 * Bars that grow left (worse) or right (better) from a centre line - for
 * movement against a baseline, where the sign matters as much as the size.
 */
export function DivergingBars({
  items,
  onSelect,
  selectedId,
  formatValue = (v) => `${v > 0 ? '+' : ''}${formatNumber(v, 1)}`,
}: {
  items: Array<{ id: string; label: string; value: number }>
  onSelect?: (id: string) => void
  selectedId?: string | null
  formatValue?: (v: number) => string
}): React.JSX.Element {
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.value)), 1)
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const pct = (Math.abs(item.value) / maxAbs) * 50
        const tone: InfoTone = item.value > 0.05 ? 'positive' : item.value < -0.05 ? 'critical' : 'neutral'
        const row = (
          <span className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3rem] items-center gap-2 text-[0.6875rem]">
            <span className="truncate text-ink-700">{item.label}</span>
            <span className="relative block h-3 rounded-sm bg-ink-50">
              <span className="absolute top-[-2px] bottom-[-2px] left-1/2 w-px bg-ink-400" aria-hidden />
              <span
                className="absolute top-0 h-full rounded-sm"
                style={{
                  backgroundColor: TONE_FILL[tone],
                  width: `${pct}%`,
                  left: item.value >= 0 ? '50%' : `${50 - pct}%`,
                }}
              />
            </span>
            <span className={cn('numeric text-right font-bold tabular-nums', TONE_TEXT[tone])}>{formatValue(item.value)}</span>
          </span>
        )
        return (
          <li key={item.id}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  'block w-full rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-govt-50/70',
                  selectedId === item.id && 'bg-govt-50 ring-1 ring-govt-200',
                )}
              >
                {row}
              </button>
            ) : (
              <div className="px-1.5 py-0.5">{row}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A left-to-right pipeline of stages. With counts it reads as a flow (how
 * many sit at each stage); with `activeId` it reads as a lifecycle stepper
 * (where one record stands).
 */
export function StageStrip({
  stages,
  activeId,
}: {
  stages: Array<{ id: string; label: string; count?: number }>
  activeId?: string
}): React.JSX.Element {
  const activeIdx = activeId ? stages.findIndex((s) => s.id === activeId) : -1
  return (
    <ol className="flex w-full items-stretch gap-1">
      {stages.map((stage, i) => {
        const reached = activeIdx >= 0 && i <= activeIdx
        const current = i === activeIdx
        const hasCount = stage.count !== undefined
        const filled = hasCount ? (stage.count ?? 0) > 0 : reached
        return (
          <li
            key={stage.id}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center rounded-md border px-1 py-1.5 text-center',
              current
                ? 'border-govt-500 bg-govt-600 text-white'
                : filled
                  ? 'border-govt-200 bg-govt-50 text-govt-800'
                  : 'border-ink-100 bg-surface-sunken text-ink-400',
            )}
            aria-current={current ? 'step' : undefined}
          >
            {hasCount ? <span className="numeric text-base leading-none font-bold tabular-nums">{stage.count}</span> : null}
            <span className="mt-0.5 w-full truncate text-[0.5625rem] font-semibold tracking-wide uppercase">{stage.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** A compact figure for inside a panel: icon, big number, caption. */
export function StatChip({
  icon,
  value,
  caption,
  tone = 'neutral',
}: {
  icon: ReactNode
  value: ReactNode
  caption: string
  tone?: InfoTone
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-ink-100 bg-surface-sunken px-2.5 py-2">
      <span className={cn('shrink-0', TONE_TEXT[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className={cn('numeric text-lg leading-none font-bold tabular-nums', TONE_TEXT[tone])}>{value}</p>
        <p className="mt-0.5 truncate text-[0.625rem] text-ink-500">{caption}</p>
      </div>
    </div>
  )
}
