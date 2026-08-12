import { useMemo, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SeriesPoint } from '@/types/common'
import { cn } from '@/utils/cn'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * Chart palette. Derived from the design tokens so charts sit inside the same
 * institutional colour system as the rest of the interface. Red is reserved
 * for genuinely critical conditions and never used decoratively.
 */
export const CHART_COLOURS = {
  primary: '#2f6bef',
  primarySoft: '#8db4fe',
  intel: '#08a3ba',
  intelSoft: '#5fdfec',
  positive: '#10b57f',
  warn: '#f0a108',
  risk: '#f97316',
  critical: '#ef4444',
  neutral: '#7e93ab',
  grid: '#e3e9f1',
  axis: '#7e93ab',
} as const

export const CATEGORICAL_SERIES = [
  CHART_COLOURS.primary,
  CHART_COLOURS.intel,
  CHART_COLOURS.warn,
  CHART_COLOURS.positive,
  CHART_COLOURS.neutral,
  CHART_COLOURS.risk,
] as const

const AXIS_PROPS = {
  stroke: CHART_COLOURS.axis,
  fontSize: 10,
  tickLine: false,
  axisLine: false,
} as const

interface TooltipPayloadEntry {
  name?: string | number
  value?: string | number
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

function TooltipShell({
  active,
  label,
  payload,
  unit,
}: {
  active?: boolean
  label?: string | number
  payload?: TooltipPayloadEntry[]
  unit?: string
}): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null
  const simulated = payload.some((p) => (p.payload as { simulated?: boolean } | undefined)?.simulated)
  return (
    <div className="rounded-lg border border-ink-100 bg-surface/95 px-3 py-2.5 shadow-overlay backdrop-blur-sm">
      <p className="mb-1 text-[0.6875rem] font-semibold text-ink-700">{label}</p>
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-[0.6875rem]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
            <span className="text-ink-500">{entry.name}</span>
            <span className="numeric ml-auto font-semibold text-ink-800">
              {typeof entry.value === 'number' ? formatNumber(entry.value, entry.value % 1 === 0 ? 0 : 1) : entry.value}
              {unit ? <span className="ml-0.5 font-normal text-ink-400">{unit}</span> : null}
            </span>
          </div>
        ))}
      </div>
      {simulated ? (
        <p className="mt-1.5 border-t border-ink-100 pt-1 text-[0.625rem] text-warn-700">{t('Simulated value')}</p>
      ) : null}
    </div>
  )
}

/* ==========================================================================
   Line / area trend
   ========================================================================== */

export function TrendChart({
  points,
  unit,
  seriesLabel = 'Value',
  comparisonLabel,
  variant = 'area',
  colour = CHART_COLOURS.primary,
  comparisonColour = CHART_COLOURS.neutral,
  referenceValue,
  referenceLabel,
  domain,
}: {
  points: SeriesPoint[]
  unit?: string
  seriesLabel?: string
  comparisonLabel?: string
  variant?: 'area' | 'line'
  colour?: string
  comparisonColour?: string
  referenceValue?: number
  referenceLabel?: string
  domain?: [number | 'auto', number | 'auto']
}): React.JSX.Element {
  const hasComparison = points.some((p) => typeof p.comparison === 'number')

  if (variant === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={CHART_COLOURS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...AXIS_PROPS} width={44} domain={domain} />
          <RechartsTooltip content={<TooltipShell unit={unit} />} cursor={{ stroke: CHART_COLOURS.grid }} />
          {typeof referenceValue === 'number' ? (
            <ReferenceLine
              y={referenceValue}
              stroke={CHART_COLOURS.warn}
              strokeDasharray="4 4"
              label={{ value: referenceLabel, position: 'insideTopRight', fontSize: 9, fill: CHART_COLOURS.warn }}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="value"
            name={seriesLabel}
            stroke={colour}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
          />
          {hasComparison ? (
            <Line
              type="monotone"
              dataKey="comparison"
              name={comparisonLabel ?? 'Comparison'}
              stroke={comparisonColour}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  const gradientId = `grad-${seriesLabel.replace(/\W/g, '')}`
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity={0.34} />
            <stop offset="55%" stopColor={colour} stopOpacity={0.12} />
            <stop offset="100%" stopColor={colour} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART_COLOURS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...AXIS_PROPS} width={44} domain={domain} />
        <RechartsTooltip content={<TooltipShell unit={unit} />} cursor={{ stroke: CHART_COLOURS.grid }} />
        {typeof referenceValue === 'number' ? (
          <ReferenceLine
            y={referenceValue}
            stroke={CHART_COLOURS.warn}
            strokeDasharray="4 4"
            label={{ value: referenceLabel, position: 'insideTopRight', fontSize: 9, fill: CHART_COLOURS.warn }}
          />
        ) : null}
        {hasComparison ? (
          <Line
            type="monotone"
            dataKey="comparison"
            name={comparisonLabel ?? 'Comparison'}
            stroke={comparisonColour}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
        ) : null}
        <Area
          type="monotone"
          dataKey="value"
          name={seriesLabel}
          stroke={colour}
          strokeWidth={2.5}
          fill={`url(#${gradientId})`}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ==========================================================================
   Bar / stacked bar
   ========================================================================== */

export interface BarSeries {
  key: string
  label: string
  colour: string
  stackId?: string
}

export function CategoryBarChart({
  data,
  series,
  unit,
  layout = 'vertical',
  categoryKey = 'label',
  showLegend,
  referenceValue,
  referenceLabel,
  barSize,
}: {
  data: Array<Record<string, string | number>>
  series: BarSeries[]
  unit?: string
  /** `vertical` renders upright bars; `horizontal` renders a ranked list. */
  layout?: 'vertical' | 'horizontal'
  categoryKey?: string
  showLegend?: boolean
  referenceValue?: number
  referenceLabel?: string
  barSize?: number
}): React.JSX.Element {
  const horizontal = layout === 'horizontal'
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={horizontal ? { top: 2, right: 12, left: 4, bottom: 2 } : { top: 4, right: 6, left: -18, bottom: 0 }}
        barCategoryGap={horizontal ? '22%' : '28%'}
      >
        <CartesianGrid stroke={CHART_COLOURS.grid} strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...AXIS_PROPS} />
            <YAxis type="category" dataKey={categoryKey} {...AXIS_PROPS} width={92} />
          </>
        ) : (
          <>
            <XAxis dataKey={categoryKey} {...AXIS_PROPS} interval={0} angle={data.length > 10 ? -35 : 0} textAnchor={data.length > 10 ? 'end' : 'middle'} height={data.length > 10 ? 48 : 24} />
            <YAxis {...AXIS_PROPS} width={44} />
          </>
        )}
        <RechartsTooltip content={<TooltipShell unit={unit} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        {showLegend ? <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} iconType="circle" iconSize={7} /> : null}
        {typeof referenceValue === 'number' ? (
          <ReferenceLine
            {...(horizontal ? { x: referenceValue } : { y: referenceValue })}
            stroke={CHART_COLOURS.warn}
            strokeDasharray="4 4"
            label={{ value: referenceLabel, position: 'insideTopRight', fontSize: 9, fill: CHART_COLOURS.warn }}
          />
        ) : null}
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.colour}
            stackId={s.stackId}
            radius={horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0]}
            barSize={barSize}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Ranked bar list where each bar is coloured by its own severity band. */
export function RankedBarChart({
  data,
  unit,
  higherIsWorse = true,
}: {
  data: Array<{ label: string; value: number }>
  unit?: string
  higherIsWorse?: boolean
}): React.JSX.Element {
  const colourFor = (v: number): string => {
    const norm = higherIsWorse ? v : 100 - v
    if (norm >= 78) return CHART_COLOURS.critical
    if (norm >= 62) return CHART_COLOURS.risk
    if (norm >= 45) return CHART_COLOURS.warn
    return CHART_COLOURS.primary
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 14, left: 4, bottom: 2 }} barCategoryGap="20%">
        <CartesianGrid stroke={CHART_COLOURS.grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...AXIS_PROPS} />
        <YAxis type="category" dataKey="label" {...AXIS_PROPS} width={88} />
        <RechartsTooltip content={<TooltipShell unit={unit} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        <Bar dataKey="value" radius={[0, 5, 5, 0]} barSize={13}>
          {data.map((d, i) => (
            <Cell key={i} fill={colourFor(d.value)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ==========================================================================
   Donut - used sparingly, for composition only
   ========================================================================== */

export function DonutChart({
  data,
  unit,
  centreLabel,
  centreValue,
}: {
  data: Array<{ label: string; value: number; colour?: string }>
  unit?: string
  centreLabel?: string
  centreValue?: string
}): React.JSX.Element {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={1.5}
            stroke="none"
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.colour ?? CATEGORICAL_SERIES[i % CATEGORICAL_SERIES.length]} />
            ))}
          </Pie>
          <RechartsTooltip content={<TooltipShell unit={unit} />} />
        </PieChart>
      </ResponsiveContainer>
      {centreValue || centreLabel ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centreValue ? <span className="numeric text-lg font-semibold text-ink-900">{centreValue}</span> : null}
          {centreLabel ? <span className="mt-px text-[0.625rem] text-ink-400">{centreLabel}</span> : null}
        </div>
      ) : null}
      <span className="sr-only">{t('Total {0}', formatNumber(total))}</span>
    </div>
  )
}

/* ==========================================================================
   Sparkline - inline, axis-free
   ========================================================================== */

export function Sparkline({
  points,
  colour = CHART_COLOURS.primary,
  width = 68,
  height = 22,
  className,
}: {
  points: number[]
  colour?: string
  width?: number
  height?: number
  className?: string
}): React.JSX.Element {
  const path = useMemo(() => {
    if (points.length < 2) return ''
    const min = Math.min(...points)
    const max = Math.max(...points)
    const range = max - min || 1
    return points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * width
        const y = height - ((p - min) / range) * (height - 3) - 1.5
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [points, width, height])

  if (!path) return <span className={cn('inline-block text-ink-300', className)}>-</span>

  return (
    <svg width={width} height={height} className={cn('inline-block align-middle', className)} aria-hidden>
      <path d={path} fill="none" stroke={colour} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ==========================================================================
   Heatmap matrix - ward × indicator comparison
   ========================================================================== */

export function HeatmapMatrix({
  rows,
  columns,
  values,
  higherIsBetter = false,
  onCellClick,
  formatValue,
  legendLow = 'Low',
  legendHigh = 'High',
}: {
  rows: Array<{ id: string; label: string }>
  columns: Array<{ id: string; label: string }>
  /** values[rowId][columnId] on a 0–100 scale. */
  values: Record<string, Record<string, number>>
  higherIsBetter?: boolean
  onCellClick?: (rowId: string, columnId: string) => void
  formatValue?: (v: number) => string
  legendLow?: string
  legendHigh?: string
}): React.JSX.Element {
  const cellColour = (v: number): string => {
    const norm = Math.max(0, Math.min(100, higherIsBetter ? 100 - v : v))
    if (norm >= 80) return 'bg-crit-500/85 text-white'
    if (norm >= 65) return 'bg-risk-500/80 text-white'
    if (norm >= 50) return 'bg-warn-500/75 text-ink-900'
    if (norm >= 35) return 'bg-warn-300/60 text-ink-800'
    if (norm >= 20) return 'bg-ok-300/55 text-ink-800'
    return 'bg-ok-500/70 text-white'
  }

  return (
    <div className="flex h-full flex-col">
      <div className="scrollbar-slim min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0.5 text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface">
                <span className="sr-only">{t('Row')}</span>
              </th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="label-institutional px-1 pb-1 text-center text-[0.5625rem] leading-tight font-semibold"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-surface pr-2 text-[0.6875rem] font-medium whitespace-nowrap text-ink-600"
                >
                  {row.label}
                </th>
                {columns.map((col) => {
                  const v = values[row.id]?.[col.id]
                  if (typeof v !== 'number') {
                    return (
                      <td key={col.id} className="h-6 rounded-sm bg-ink-50">
                        <span className="sr-only">{t('No data')}</span>
                      </td>
                    )
                  }
                  const content = formatValue ? formatValue(v) : String(Math.round(v))
                  return (
                    <td key={col.id} className="p-0">
                      <button
                        type="button"
                        disabled={!onCellClick}
                        onClick={() => onCellClick?.(row.id, col.id)}
                        title={`${row.label} · ${col.label}: ${content}`}
                        className={cn(
                          'numeric h-6 w-full rounded-sm text-[0.625rem] font-semibold transition-transform',
                          cellColour(v),
                          onCellClick && 'cursor-pointer hover:scale-[1.08] focus-visible:scale-[1.08]',
                        )}
                      >
                        {content}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[0.625rem] text-ink-400">
        <span>{legendLow}</span>
        <span className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-ok-500 via-warn-500 to-crit-500" aria-hidden />
        <span>{legendHigh}</span>
      </div>
    </div>
  )
}

/* ==========================================================================
   Horizontal contribution bar - explains composite scores
   ========================================================================== */

export function ContributionBars({
  items,
  className,
  onSelect,
}: {
  items: Array<{ id: string; label: string; contribution: number; weight: number; rawScore: number; explanation?: string }>
  className?: string
  onSelect?: (id: string) => void
}): React.JSX.Element {
  const max = Math.max(...items.map((i) => i.contribution), 1)
  return (
    <ul className={cn('space-y-2', className)}>
      {items.map((item) => {
        const pct = (item.contribution / max) * 100
        const tone =
          item.rawScore >= 78
            ? 'bg-crit-500'
            : item.rawScore >= 62
              ? 'bg-risk-500'
              : item.rawScore >= 45
                ? 'bg-warn-500'
                : 'bg-govt-500'
        const Wrapper = onSelect ? 'button' : 'div'
        return (
          <li key={item.id}>
            <Wrapper
              {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(item.id) } : {})}
              className={cn('w-full text-left', onSelect && 'cursor-pointer rounded-md p-1 -m-1 hover:bg-ink-50')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs text-ink-700">{item.label}</span>
                <span className="numeric shrink-0 text-[0.6875rem] text-ink-500">
                  <span className="font-semibold text-ink-800">{item.contribution.toFixed(1)}</span>
                  <span className="mx-1 text-ink-300">·</span>
                  w {item.weight.toFixed(2)}
                  <span className="mx-1 text-ink-300">·</span>
                  raw {item.rawScore}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
              </div>
              {item.explanation ? (
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">{item.explanation}</p>
              ) : null}
            </Wrapper>
          </li>
        )
      })}
    </ul>
  )
}

/** Compact inline bar for tables. */
export function MiniBar({
  value,
  max = 100,
  tone,
  width = 56,
  className,
  higherIsWorse = false,
}: {
  value: number
  max?: number
  tone?: 'positive' | 'neutral' | 'warn' | 'risk' | 'critical'
  width?: number
  className?: string
  /**
   * Inverts the colour semantics for indicators where a higher value is a
   * worse condition - occupancy, congestion, risk, vacancy, arrears.
   * Without this the bar would colour a 95% occupied hospital as healthy.
   */
  higherIsWorse?: boolean
}): React.JSX.Element {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const semantic = higherIsWorse ? 100 - pct : pct
  const resolved =
    tone ??
    (semantic >= 78
      ? 'positive'
      : semantic >= 62
        ? 'neutral'
        : semantic >= 45
          ? 'warn'
          : semantic >= 30
            ? 'risk'
            : 'critical')
  const colours = {
    positive: 'bg-ok-500',
    neutral: 'bg-govt-500',
    warn: 'bg-warn-500',
    risk: 'bg-risk-500',
    critical: 'bg-crit-500',
  }
  return (
    <span
      className={cn('mini-bar inline-flex h-1.5 overflow-hidden rounded-full bg-ink-100 align-middle', className)}
      style={{ width }}
      aria-hidden
    >
      <span className={cn('h-full rounded-full', colours[resolved])} style={{ width: `${pct}%` }} />
    </span>
  )
}

/** Stacked composition bar used for status distributions. */
export function CompositionBar({
  segments,
  className,
  height = 8,
}: {
  segments: Array<{ id: string; label: string; value: number; colour: string }>
  className?: string
  height?: number
}): React.JSX.Element {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div className={className}>
      <div className="flex w-full overflow-hidden rounded-full bg-ink-100" style={{ height }}>
        {segments.map((seg) => (
          <div
            key={seg.id}
            title={`${seg.label}: ${formatNumber(seg.value)}`}
            style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.colour }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {segments.map((seg) => (
          <span key={seg.id} className="inline-flex items-center gap-1.5 text-[0.6875rem] text-ink-500">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: seg.colour }} aria-hidden />
            {seg.label}
            <span className="numeric font-semibold text-ink-700">{formatNumber(seg.value)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export type { ReactNode }
