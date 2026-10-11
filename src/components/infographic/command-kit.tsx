import { CHART_COLOURS, DonutChart } from '@/components/charts'
import { formatNumber, formatPercent } from '@/utils/format'
import type { Severity } from '@/types/common'

/**
 * Further infographic blocks for the Command Centre's map, feed and decision
 * pages - kept beside the shared kit in `./index.tsx` rather than inside it,
 * so the overview's blocks stay stable while these grow.
 *
 * As with the shared kit: colour carries status only where the data IS a
 * status (severity, timeliness), and every coloured mark ships with its text
 * label and figure, so nothing is read from colour alone. Counts that are not
 * a status (domains, workflow stages) are drawn in the neutral primary hue.
 */

/** Severity to chart colour, matching the platform's severity badges. */
export const SEVERITY_COLOUR: Record<Severity, string> = {
  critical: CHART_COLOURS.critical,
  high: CHART_COLOURS.risk,
  medium: CHART_COLOURS.warn,
  low: CHART_COLOURS.primary,
  info: CHART_COLOURS.neutral,
}

export interface Segment {
  id: string
  label: string
  value: number
  colour: string
}

/** A donut with a labelled legend: each slice's name, count and share. */
export function LegendDonut({
  segments,
  centreValue,
  centreLabel,
  size = 150,
  emptyLabel,
}: {
  segments: Segment[]
  centreValue: string
  centreLabel: string
  size?: number
  emptyLabel: string
}): React.JSX.Element {
  const shown = segments.filter((s) => s.value > 0)
  const total = shown.reduce((n, s) => n + s.value, 0)
  if (shown.length === 0) return <p className="py-4 text-center text-[0.75rem] text-ink-400">{emptyLabel}</p>
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <div className="shrink-0" style={{ width: size, height: size }}>
        <DonutChart
          data={shown.map((s) => ({ label: s.label, value: s.value, colour: s.colour }))}
          centreValue={centreValue}
          centreLabel={centreLabel}
        />
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {shown.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-[0.75rem]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.colour }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ink-700">{s.label}</span>
            <span className="numeric font-bold text-ink-900 tabular-nums">{formatNumber(s.value)}</span>
            <span className="numeric w-10 text-right text-ink-500 tabular-nums">{formatPercent((s.value / Math.max(1, total)) * 100, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface CountRow {
  id: string
  label: string
  value: number
  /** Optional figure to print in place of the raw value (e.g. money). */
  display?: string
  /** Defaults to the neutral primary hue - pass a status colour only for status data. */
  colour?: string
}

/**
 * Labelled horizontal bars scaled to the largest row. When `onSelect` is
 * given each row is a button - used to turn a summary into a filter.
 */
export function CountBars({
  rows,
  onSelect,
  activeIds = [],
  emptyLabel,
}: {
  rows: CountRow[]
  onSelect?: (id: string) => void
  activeIds?: string[]
  emptyLabel: string
}): React.JSX.Element {
  if (rows.length === 0) return <p className="py-3 text-center text-[0.75rem] text-ink-400">{emptyLabel}</p>
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const active = activeIds.includes(r.id)
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-2 text-[0.6875rem]">
              <span className={`min-w-0 truncate ${active ? 'font-bold text-govt-700' : 'font-medium text-ink-700'}`}>{r.label}</span>
              <span className="numeric shrink-0 font-bold text-ink-900 tabular-nums">{r.display ?? formatNumber(r.value)}</span>
            </span>
            <span className="mt-0.5 block h-2 rounded-full bg-ink-100">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(r.value > 0 ? 3 : 0, (r.value / max) * 100)}%`, backgroundColor: r.colour ?? CHART_COLOURS.primary }}
              />
            </span>
          </>
        )
        return (
          <li key={r.id}>
            {onSelect ? (
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(r.id)}
                className={`block w-full rounded-md px-1.5 py-1 text-left transition-colors hover:bg-govt-50/70 ${active ? 'bg-govt-50 ring-1 ring-govt-200' : ''}`}
              >
                {body}
              </button>
            ) : (
              <div className="px-1.5 py-1">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A single full-width stacked meter with a labelled key beneath it. */
export function StackMeter({ segments, emptyLabel }: { segments: Segment[]; emptyLabel: string }): React.JSX.Element {
  const shown = segments.filter((s) => s.value > 0)
  const total = shown.reduce((n, s) => n + s.value, 0)
  if (total === 0) return <p className="py-2 text-center text-[0.75rem] text-ink-400">{emptyLabel}</p>
  return (
    <div className="space-y-2">
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-ink-100">
        {shown.map((s) => (
          <span key={s.id} className="h-full" style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.colour }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {shown.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5 text-[0.6875rem]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.colour }} aria-hidden />
            <span className="text-ink-600">{s.label}</span>
            <span className="numeric font-bold text-ink-900 tabular-nums">{formatNumber(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
