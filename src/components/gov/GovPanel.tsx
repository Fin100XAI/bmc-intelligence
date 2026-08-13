import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/**
 * Institutional panel furniture.
 *
 * These are deliberately NOT the platform's `Card` primitives. A card is a
 * floating, rounded, shadowed object — the visual language of a consumer
 * dashboard, where each tile is an independent widget competing for attention.
 * A government record does not read that way. It reads as ruled sections on a
 * printed page: square corners, hairline borders, a titled band across the top
 * of each block, and rows that align to a shared grid so figures can be
 * compared down a column rather than hunted across tiles.
 *
 * The distinction is not decoration. The layouts these compose put the city's
 * position into vertical columns an officer reads top to bottom, the way a
 * departmental return is read, instead of a mosaic that has to be scanned.
 */

type PanelTone = 'default' | 'primary' | 'critical' | 'muted'

/**
 * Band background and title colour, kept as separate classes.
 *
 * The title colour has to be set on the heading ELEMENT, not inherited from
 * the band. `src/styles/index.css` carries a global `h1…h6 { color: ... }`
 * rule, and a direct element rule beats an inherited value however specific
 * the ancestor's class is — so a title relying on `text-white` from the band
 * renders in near-black ink on a navy field, which is all but invisible.
 * Anything that puts a heading on a dark surface has to state its own colour.
 */
const HEADER_TONE: Record<PanelTone, { band: string; title: string; support: string }> = {
  // The institutional navy band. This is the single strongest signal that the
  // surface belongs to an administration rather than to a product.
  default: { band: 'bg-govt-800', title: 'text-white', support: 'text-white/80' },
  primary: { band: 'bg-govt-900', title: 'text-white', support: 'text-white/80' },
  critical: { band: 'bg-crit-600', title: 'text-white', support: 'text-white/80' },
  muted: { band: 'bg-ink-100', title: 'text-ink-800', support: 'text-ink-500' },
}

export function GovPanel({
  title,
  subtitle,
  tone = 'default',
  actions,
  dense = false,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  tone?: PanelTone
  actions?: ReactNode
  /** Removes body padding, for panels whose child owns its own edges. */
  dense?: boolean
  className?: string
  bodyClassName?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section
      className={cn(
        // `rounded-[2px]` rather than `rounded-none`: a true right angle reads
        // as an unstyled box on screen, while two pixels reads as a printed
        // rule. The difference is the whole effect.
        'flex flex-col overflow-hidden rounded-[2px] border border-ink-200 bg-surface shadow-xs',
        className,
      )}
    >
      <header className={cn('flex items-center gap-2 px-3 py-1.5', HEADER_TONE[tone].band)}>
        <h2
          className={cn(
            'min-w-0 flex-1 truncate text-[0.6875rem] font-bold tracking-[0.09em] uppercase',
            HEADER_TONE[tone].title,
          )}
        >
          {title}
        </h2>
        {subtitle ? (
          <span className={cn('shrink-0 text-[0.625rem] font-medium tracking-wide', HEADER_TONE[tone].support)}>
            {subtitle}
          </span>
        ) : null}
        {actions}
      </header>
      <div className={cn('min-h-0 flex-1', dense ? '' : 'p-3', bodyClassName)}>{children}</div>
    </section>
  )
}

/**
 * A labelled figure in a returns table.
 *
 * Label left, value right, hairline below — the shape of every statutory
 * return a corporation files. Reading a column of these is what makes the
 * layout scannable without a single chart.
 */
export function GovRow({
  label,
  value,
  note,
  tone,
  className,
}: {
  label: ReactNode
  value: ReactNode
  note?: ReactNode
  tone?: 'default' | 'critical' | 'warn' | 'positive'
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 border-b border-ink-100 px-3 py-[0.4375rem] last:border-b-0', className)}>
      <span className="min-w-0 text-[0.75rem] leading-snug text-ink-600">
        {label}
        {note ? <span className="mt-0.5 block text-[0.6875rem] text-ink-400">{note}</span> : null}
      </span>
      <span
        className={cn(
          'numeric shrink-0 text-[0.8125rem] font-semibold tabular-nums',
          tone === 'critical'
            ? 'text-crit-600'
            : tone === 'warn'
              ? 'text-warn-700'
              : tone === 'positive'
                ? 'text-google-green-700'
                : 'text-ink-900',
        )}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * The headline figure of a column — one number, stated plainly, with the
 * denominator and the reading beneath it.
 */
export function GovStat({
  label,
  value,
  unit,
  reading,
  tone = 'default',
}: {
  label: ReactNode
  value: ReactNode
  unit?: string
  reading?: ReactNode
  tone?: 'default' | 'critical' | 'warn' | 'positive'
}): React.JSX.Element {
  return (
    <div className="border-b border-ink-100 px-3 py-2.5 last:border-b-0">
      <p className="text-[0.625rem] font-bold tracking-[0.08em] text-ink-500 uppercase">{label}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span
          className={cn(
            'numeric text-[1.75rem] leading-none font-bold tabular-nums',
            tone === 'critical'
              ? 'text-crit-600'
              : tone === 'warn'
                ? 'text-warn-700'
                : tone === 'positive'
                  ? 'text-google-green-700'
                  : 'text-govt-900',
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-[0.8125rem] font-medium text-ink-400">{unit}</span> : null}
      </p>
      {reading ? <p className="mt-1 text-[0.6875rem] leading-snug text-ink-500">{reading}</p> : null}
    </div>
  )
}

/**
 * The masthead band.
 *
 * A corporation's own record identifies itself before it says anything: the
 * seal, the name of the body, what the page is, and the moment the figures
 * were taken. The gold rule beneath is the one piece of ornament on the page,
 * and it earns its place by marking where the administration's identity ends
 * and its data begins.
 */
export function GovMasthead({
  seal,
  authority,
  title,
  standfirst,
  meta,
  strip,
}: {
  seal?: string
  authority: ReactNode
  title: ReactNode
  standfirst?: ReactNode
  meta?: ReactNode
  strip?: ReactNode
}): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-[2px] border border-ink-200 shadow-xs">
      <div className="flex flex-wrap items-center gap-3 bg-govt-900 px-4 py-3">
        {seal ? (
          <img
            src={seal}
            alt=""
            aria-hidden
            className="h-11 w-11 shrink-0 rounded-[3px] object-cover ring-1 ring-white/25"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[0.625rem] font-semibold tracking-[0.12em] text-white/70 uppercase">{authority}</p>
          <h1 className="mt-0.5 truncate text-[1.0625rem] leading-tight font-bold tracking-tight text-white">{title}</h1>
          {standfirst ? <p className="mt-1 max-w-4xl text-[0.6875rem] leading-snug text-white/65">{standfirst}</p> : null}
        </div>
        {meta ? <div className="shrink-0 text-right">{meta}</div> : null}
      </div>

      {/* The gold rule. */}
      <div aria-hidden className="h-[3px] bg-gradient-to-r from-gold-500 via-gold-400 to-gold-600" />

      {strip ? (
        <div className="flex flex-wrap items-stretch divide-x divide-ink-100 border-t border-ink-100 bg-surface-sunken">
          {strip}
        </div>
      ) : null}
    </div>
  )
}

/** One cell of the masthead's status strip. */
export function GovStripCell({
  label,
  value,
  tone = 'default',
}: {
  label: ReactNode
  value: ReactNode
  tone?: 'default' | 'critical' | 'warn' | 'positive'
}): React.JSX.Element {
  return (
    <div className="min-w-[8.5rem] flex-1 px-3 py-2">
      <p className="text-[0.5625rem] font-bold tracking-[0.1em] text-ink-500 uppercase">{label}</p>
      <p
        className={cn(
          'numeric mt-0.5 text-[0.9375rem] font-bold tabular-nums',
          tone === 'critical'
            ? 'text-crit-600'
            : tone === 'warn'
              ? 'text-warn-700'
              : tone === 'positive'
                ? 'text-google-green-700'
                : 'text-govt-900',
        )}
      >
        {value}
      </p>
    </div>
  )
}
