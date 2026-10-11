import { useEffect, useState, type ReactNode } from 'react'
import { DonutChart } from '@/components/charts'
import { formatNumber, formatPercent } from '@/utils/format'
import { cn } from '@/utils/cn'
import { TONE_COLOUR, type InfoTone } from './index'

/**
 * Infographic blocks for the Command Centre's work surfaces - task queues,
 * alert registers, report documents.
 *
 * Those pages keep their register (it is where the work is done), but each
 * register is introduced by a picture of its shape: how it splits by status,
 * how much of it is late, where the weight sits. As in `./index`, colour
 * carries status only and every coloured mark is paired with a text label
 * and its count, so nothing is read from colour alone.
 */

export interface Segment {
  id: string
  label: string
  value: number
  colour: string
  icon?: ReactNode
  /** Optional secondary reading, shown muted after the label. */
  note?: string
}

/** A composition donut with a labelled legend: count and share per segment. */
export function SegmentDonut({
  segments,
  centreValue,
  centreLabel,
  size = 150,
  hideEmpty = true,
}: {
  segments: Segment[]
  centreValue?: string
  centreLabel?: string
  size?: number
  hideEmpty?: boolean
}): React.JSX.Element {
  const shown = hideEmpty ? segments.filter((s) => s.value > 0) : segments
  const total = segments.reduce((s, x) => s + x.value, 0)
  return (
    <div className="flex h-full flex-col items-center gap-3 sm:flex-row">
      <div className="shrink-0" style={{ width: size, height: size }}>
        <DonutChart
          data={shown.map((s) => ({ label: s.label, value: s.value, colour: s.colour }))}
          centreValue={centreValue ?? formatNumber(total)}
          centreLabel={centreLabel}
        />
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {shown.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-[0.75rem]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.colour }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ink-700">{s.label}</span>
            <span className="numeric font-bold text-ink-900 tabular-nums">{formatNumber(s.value)}</span>
            <span className="numeric w-10 text-right text-ink-500 tabular-nums">
              {formatPercent((s.value / Math.max(1, total)) * 100, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Labelled horizontal bars, scaled to the largest row (or to `max`). Used for
 * a breakdown where the question is "where does the weight sit".
 */
export function BreakdownBars({
  rows,
  max,
  showShare = true,
  onSelect,
}: {
  rows: Segment[]
  max?: number
  showShare?: boolean
  onSelect?: (id: string) => void
}): React.JSX.Element {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value))
  const total = rows.reduce((s, r) => s + r.value, 0)
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-2 text-[0.6875rem]">
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink-700">
                {r.icon ? <span className="shrink-0 text-ink-500">{r.icon}</span> : null}
                <span className="truncate">{r.label}</span>
                {r.note ? <span className="shrink-0 text-ink-400">{r.note}</span> : null}
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                <span className="numeric text-[0.8125rem] font-bold text-ink-900 tabular-nums">{formatNumber(r.value)}</span>
                {showShare ? (
                  <span className="numeric w-9 text-right text-ink-400 tabular-nums">
                    {formatPercent((r.value / Math.max(1, total)) * 100, 0)}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-1 h-2.5 rounded-full bg-ink-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(r.value > 0 ? 2 : 0, Math.min(100, (r.value / top) * 100))}%`, backgroundColor: r.colour }}
              />
            </div>
          </>
        )
        return (
          <li key={r.id}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className="block w-full rounded-md px-1 py-0.5 text-left hover:bg-govt-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-govt-500"
              >
                {body}
              </button>
            ) : (
              <div className="px-1">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Bars either side of a zero line - for variance against a plan, where the
 * direction matters as much as the size. `goodWhenPositive` decides which
 * side reads as favourable.
 */
export function DivergingBars({
  rows,
  unit = '',
  goodWhenPositive = true,
}: {
  rows: Array<{ id: string; label: string; value: number }>
  unit?: string
  goodWhenPositive?: boolean
}): React.JSX.Element {
  const span = Math.max(1, ...rows.map((r) => Math.abs(r.value)))
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const favourable = goodWhenPositive ? r.value >= 0 : r.value <= 0
        const tone: InfoTone = favourable ? 'positive' : Math.abs(r.value) >= span * 0.5 ? 'critical' : 'warn'
        const width = (Math.abs(r.value) / span) * 50
        return (
          <li key={r.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-2 text-[0.6875rem]">
            <span className="truncate text-ink-700" title={r.label}>
              {r.label}
            </span>
            <span className="relative h-2.5 rounded-full bg-ink-100">
              <span className="absolute top-[-2px] left-1/2 h-[14px] w-px bg-ink-400" aria-hidden />
              <span
                className="absolute top-0 h-full rounded-full"
                style={{
                  left: r.value >= 0 ? '50%' : `${50 - width}%`,
                  width: `${width}%`,
                  backgroundColor: TONE_COLOUR[tone],
                }}
              />
            </span>
            <span className={cn('numeric text-right font-bold tabular-nums', favourable ? 'text-ok-700' : 'text-crit-700')}>
              {r.value > 0 ? '+' : ''}
              {r.value.toFixed(1)}
              {unit}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** A thin fill meter, 0-100, coloured by status tone. */
export function Meter({ value, tone, className }: { value: number; tone: InfoTone; className?: string }): React.JSX.Element {
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-full bg-ink-100', className)} aria-hidden>
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: TONE_COLOUR[tone] }}
      />
    </span>
  )
}

/**
 * A "Show details" fold for printable documents. A closed `<details>` does
 * not print its contents, so the fold opens itself for the duration of a
 * print and restores the reader's choice afterwards - the PDF always carries
 * the full ledger.
 */
export function PrintableFold({ summary, children }: { summary: string; children: ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const before = (): void => setPrinting(true)
    const after = (): void => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  return (
    <details
      className="group rounded-lg border border-ink-200"
      open={open || printing}
      onToggle={(e) => {
        if (!printing) setOpen(e.currentTarget.open)
      }}
    >
      <summary className="print-hidden cursor-pointer list-none px-3 py-2 text-[0.6875rem] font-semibold text-govt-700 hover:bg-govt-50/60">
        <span className="group-open:hidden">▸ {summary}</span>
        <span className="hidden group-open:inline">▾ {summary}</span>
      </summary>
      <div className="border-t border-ink-100 p-2">{children}</div>
    </details>
  )
}
