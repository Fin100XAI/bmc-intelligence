import type { ReactNode } from 'react'
import { CHART_COLOURS, DonutChart, Sparkline } from '@/components/charts'
import { ScoreDial } from '@/components/ui/primitives'
import { OPERATIONAL_STATE_LABEL, type OperationalState } from '@/types/common'
import { formatNumber, formatPercent } from '@/utils/format'
import { t } from '@/i18n'
import { SHADE, autoShade, shadeForTone, type Shade } from '@/components/ui/shade'
import { cn } from '@/utils/cn'

/**
 * Infographic building blocks, shared by the Command Centre pages.
 *
 * The overview is the page a commissioner reads first, so each block states
 * one finding as a picture - a gauge, a share, a ranked bar - with the figure
 * beside it in large type. The precise ledgers remain on the page, folded
 * under "Show details", so nothing is lost; they are simply no longer the
 * first thing the eye has to parse.
 *
 * Colour follows status, never rank: good / watch / serious / critical map to
 * the platform's positive / warn / risk / critical tokens, and every coloured
 * mark ships with a text label so identity is never carried by colour alone.
 */

export type InfoTone = 'positive' | 'neutral' | 'warn' | 'risk' | 'critical'

const TONE_TEXT: Record<InfoTone, string> = {
  positive: 'text-ok-700',
  neutral: 'text-ink-900',
  warn: 'text-warn-700',
  risk: 'text-risk-700',
  critical: 'text-crit-700',
}

const TONE_RING: Record<InfoTone, string> = {
  positive: 'bg-ok-50 text-ok-600 ring-ok-200',
  neutral: 'bg-govt-50 text-govt-600 ring-govt-200',
  warn: 'bg-warn-50 text-warn-600 ring-warn-200',
  risk: 'bg-risk-50 text-risk-600 ring-risk-200',
  critical: 'bg-crit-50 text-crit-600 ring-crit-200',
}

export const TONE_COLOUR: Record<InfoTone, string> = {
  positive: CHART_COLOURS.positive,
  neutral: CHART_COLOURS.primary,
  warn: CHART_COLOURS.warn,
  risk: CHART_COLOURS.risk,
  critical: CHART_COLOURS.critical,
}

/** `shade` unset or `'tone'`: derived from the tone (and gold for money); an explicit shade overrides. */
function resolveShade(shade: Shade | 'tone' | undefined, tone: InfoTone, ...moneyHints: unknown[]): Shade {
  if (shade === 'tone') return shadeForTone(tone)
  return shade ?? autoShade(tone, ...moneyHints)
}

/**
 * A headline figure: icon chip, large number, label and a one-line reading.
 *
 * Drawn in the tinted, meaning-coloured look of the Decision Room's brief
 * tiles (see `@/components/ui/shade`) - tinted wash, matching border, solid
 * icon chip, figure in the same hue. Left unset, `shade` follows `tone`
 * (critical red, risk orange, warn amber, positive green; a neutral figure
 * takes gold when it is money, else the alternating blue / teal). An explicit
 * `shade` overrides; `'none'` keeps the old plain white card.
 */
export function KpiTile({
  icon,
  label,
  value,
  reading,
  tone = 'neutral',
  shade,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  reading?: ReactNode
  tone?: InfoTone
  shade?: Shade | 'tone' | 'none'
}): React.JSX.Element {
  const s = shade === 'none' ? null : SHADE[resolveShade(shade, tone, value, label)]
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3 shadow-xs', s ? s.tile : 'border-ink-200 bg-surface')}>
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center',
          s ? cn('rounded-xl text-white', s.chip) : `rounded-full ring-1 ${TONE_RING[tone]}`,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className={cn('numeric text-2xl leading-none font-bold tabular-nums', s ? s.value : TONE_TEXT[tone])}>{value}</p>
        <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-snug font-semibold text-ink-700">{label}</p>
        {reading ? <p className="truncate text-[0.625rem] text-ink-500">{reading}</p> : null}
      </div>
    </div>
  )
}

/** The hero: the composite city-health gauge with its thirty-day shape. */
export function HealthHero({
  score,
  state,
  trend,
  target,
}: {
  score: number
  state: OperationalState
  trend: number[]
  target: number
}): React.JSX.Element {
  const first = trend[0] ?? score
  const delta = Math.round((score - first) * 10) / 10
  const tone: InfoTone = score >= 78 ? 'positive' : score >= 60 ? 'neutral' : score >= 45 ? 'warn' : 'critical'
  return (
    <div className={cn('flex flex-col items-center gap-4 rounded-xl border p-4 shadow-xs sm:flex-row', SHADE[shadeForTone(tone)].tile)}>
      <ScoreDial score={score} size={150} label={t('of 100')} caption={t('City health index')} />
      <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
        <p className="text-[0.6875rem] font-bold tracking-[0.09em] text-ink-500 uppercase">{t('Overall position')}</p>
        <p className={`text-lg leading-tight font-bold ${TONE_TEXT[tone]}`}>{OPERATIONAL_STATE_LABEL[state]}</p>
        <p className="text-[0.75rem] text-ink-600">
          {delta >= 0
            ? t('Up {0} points over thirty days', formatNumber(Math.abs(delta), 1))
            : t('Down {0} points over thirty days', formatNumber(Math.abs(delta), 1))}
          {' · '}
          {score >= target ? t('at or above the {0}/100 target', target) : t('{0} points below the {1}/100 target', formatNumber(target - score, 1), target)}
        </p>
        <Sparkline points={trend} colour={TONE_COLOUR[tone]} width={220} height={40} className="mx-auto sm:mx-0" />
      </div>
    </div>
  )
}

/** Share of divisions by operating state, as a donut with a labelled legend. */
export function StateDonut({
  states,
  unitLabel,
}: {
  states: OperationalState[]
  unitLabel: string
}): React.JSX.Element {
  const ORDER: Array<{ state: OperationalState; colour: string }> = [
    { state: 'operational', colour: CHART_COLOURS.positive },
    { state: 'degraded', colour: CHART_COLOURS.warn },
    { state: 'at-risk', colour: CHART_COLOURS.risk },
    { state: 'critical', colour: CHART_COLOURS.critical },
  ]
  const counts = ORDER.map((o) => ({ ...o, value: states.filter((s) => s === o.state).length })).filter((o) => o.value > 0)
  return (
    <div className="flex h-full flex-col items-center gap-3 sm:flex-row">
      <div className="h-[170px] w-[170px] shrink-0">
        <DonutChart
          data={counts.map((c) => ({ label: OPERATIONAL_STATE_LABEL[c.state], value: c.value, colour: c.colour }))}
          centreValue={formatNumber(states.length)}
          centreLabel={unitLabel}
        />
      </div>
      <ul className="w-full space-y-1.5">
        {counts.map((c) => (
          <li key={c.state} className="flex items-center gap-2 text-[0.75rem]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.colour }} aria-hidden />
            <span className="flex-1 text-ink-700">{OPERATIONAL_STATE_LABEL[c.state]}</span>
            <span className="numeric font-bold text-ink-900 tabular-nums">{c.value}</span>
            <span className="numeric w-10 text-right text-ink-500 tabular-nums">
              {formatPercent((c.value / Math.max(1, states.length)) * 100, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * A labelled horizontal bar against a target tick - used for service-level
 * compliance, where the question is "how far from the standard", not "which
 * is biggest".
 */
export function TargetBar({
  label,
  value,
  target,
  note,
}: {
  label: string
  value: number
  target: number
  note?: string
}): React.JSX.Element {
  const tone: InfoTone = value >= target ? 'positive' : value >= target - 15 ? 'warn' : 'critical'
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[0.6875rem]">
        <span className="truncate font-medium text-ink-700">{label}</span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          {note ? <span className="text-ink-400">{note}</span> : null}
          <span className={`numeric font-bold tabular-nums ${TONE_TEXT[tone]}`}>{formatPercent(value, 0)}</span>
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-ink-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: TONE_COLOUR[tone] }} />
        <span
          className="absolute -top-0.5 h-3.5 w-0.5 rounded bg-ink-700"
          style={{ left: `${target}%` }}
          title={t('Target {0}%', target)}
          aria-hidden
        />
      </div>
    </div>
  )
}

/**
 * One infrastructure service as a tile: icon, big reading, a fill meter, a note.
 * `shade` works as on `KpiTile`.
 */
export function ServiceTile({
  icon,
  label,
  value,
  meter,
  note,
  tone,
  shade,
}: {
  icon: ReactNode
  label: string
  value: string
  /** 0-100 fill for the meter; omitted where the reading is not a share. */
  meter?: number
  note: string
  tone: InfoTone
  shade?: Shade | 'tone' | 'none'
}): React.JSX.Element {
  const s = shade === 'none' ? null : SHADE[resolveShade(shade, tone, value, label)]
  return (
    <div className={cn('flex flex-col gap-2 rounded-xl border p-3 shadow-xs', s ? s.tile : 'border-ink-200 bg-surface')}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            s ? cn('text-white', s.chip) : `ring-1 ${TONE_RING[tone]}`,
          )}
        >
          {icon}
        </span>
        <span className="text-[0.6875rem] font-semibold text-ink-700">{label}</span>
      </div>
      <p className={cn('numeric text-xl leading-none font-bold tabular-nums', s ? s.value : TONE_TEXT[tone])}>{value}</p>
      {meter !== undefined ? (
        <div className={cn('h-2 rounded-full', s ? 'bg-white/70' : 'bg-ink-100')}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, meter))}%`, backgroundColor: TONE_COLOUR[tone] }}
          />
        </div>
      ) : null}
      <p className={cn('text-[0.625rem] leading-snug', s ? 'text-ink-600' : 'text-ink-500')}>{note}</p>
    </div>
  )
}

/** A big figure with a caption, for money and counts inside a panel. */
export function BigFigure({ value, caption, tone = 'neutral' }: { value: string; caption: string; tone?: InfoTone }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <p className={`numeric text-lg leading-none font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      <p className="mt-1 text-[0.625rem] leading-snug text-ink-500">{caption}</p>
    </div>
  )
}

/** A folded section that keeps the full ledger one click away. */
export function DetailsFold({ summary, children }: { summary: string; children: ReactNode }): React.JSX.Element {
  return (
    <details className="group border-t border-ink-100">
      <summary className="cursor-pointer list-none px-3 py-2 text-[0.6875rem] font-semibold text-govt-700 hover:bg-govt-50/60">
        <span className="group-open:hidden">▸ {summary}</span>
        <span className="hidden group-open:inline">▾ {summary}</span>
      </summary>
      {children}
    </details>
  )
}
