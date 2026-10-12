import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { SHADE, autoShade, type Shade } from '@/components/ui/shade'
import { meaningIcon } from '@/components/ui/meaning-icon'

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

type PanelTone = 'default' | 'primary' | 'critical' | 'muted' | 'red' | 'amber' | 'green' | 'blue' | 'teal' | 'gold'

/**
 * Band background, title colour and the hairline that separates the band
 * from the body, kept as separate classes.
 *
 * The title colour has to be set on the heading ELEMENT, not inherited from
 * the band. `src/styles/index.css` carries a global `h1…h6 { color: ... }`
 * rule, and a direct element rule beats an inherited value however specific
 * the ancestor's class is — so a title relying on an inherited colour from
 * the band renders in near-black ink regardless of the band's own colour.
 * Anything that bands a heading has to state the heading's colour itself.
 *
 * Light tints, no outer border. A frame around every panel competes with the
 * frame around the next one down the column; on a page carrying five or six
 * of these the borders are what the eye notices first, before any of the
 * figures inside them. `shadow-xs` alone lifts a panel off the canvas just
 * enough to read as its own surface, without drawing a box the reader has
 * to look past.
 *
 * Weight is reserved for genuine severity: `critical` is the one tone still
 * a solid fill top to bottom, so an officer's eye still goes there first on
 * a page where everything else is quiet.
 */
const HEADER_TONE: Record<PanelTone, { band: string; title: string; support: string; border: string }> = {
  // The institutional wash. Blue was pulled from the palette entirely — not
  // just off the cycling identity tones — because a hue that is also every
  // browser's and every wireframe's default accent stopped reading as a
  // considered choice once it was everywhere on the page. `default` and
  // `primary` deliberately do NOT move to one of the three remaining Google
  // hues either: a hero panel banded the same colour as an ordinary
  // identity-cycle panel is the exact collision this palette exists to
  // avoid. Neutral ink is the one wash that can never collide with red,
  // amber or green, which is what a masthead panel needs most.
  default: { band: 'bg-ink-50', title: 'text-ink-900', support: 'text-ink-600', border: 'border-ink-100' },
  // A shade deeper than `default`, reserved for the one panel on a page that
  // anchors it - a masthead among returns, not another return.
  // Now a deeper blue wash rather than grey ink, so the anchoring panel is
  // tinted like every other card on the page while still reading a step
  // heavier than the automatic blue band.
  primary: {
    band: 'bg-google-blue-100',
    title: 'text-google-blue-900',
    support: 'text-google-blue-800',
    border: 'border-google-blue-200',
  },
  // The one tone that stays a solid fill - severity earns weight the other
  // tones deliberately give up.
  critical: { band: 'bg-crit-600', title: 'text-white', support: 'text-white/80', border: 'border-crit-700' },
  muted: { band: 'bg-ink-100', title: 'text-ink-800', support: 'text-ink-500', border: 'border-ink-200' },
  // The three remaining Google brand hues, at the palest step on their ramp,
  // for a register of panels that reads as one calm page rather than one
  // colour: a sequence of same-navy bands is a rule book, a sequence
  // cycling through these washes is a wall of distinct returns an officer
  // can tell apart at a glance without any of them shouting. Reserved for
  // section IDENTITY, not severity — `GovStripCell`/`GovRow`'s tone prop
  // still carries the actual critical/warn/positive reading of a figure,
  // unaffected by which of these a panel happens to be banded in.
  red: {
    band: 'bg-google-red-50',
    title: 'text-google-red-900',
    support: 'text-google-red-700',
    border: 'border-google-red-100',
  },
  amber: {
    band: 'bg-google-yellow-50',
    title: 'text-google-yellow-900',
    support: 'text-google-yellow-800',
    border: 'border-google-yellow-200',
  },
  green: {
    band: 'bg-google-green-50',
    title: 'text-google-green-900',
    support: 'text-google-green-700',
    border: 'border-google-green-100',
  },
  // Meaning tones for the Command Centre / Decisions pages, matching the
  // shades in `@/components/ui/shade`: blue for works, cases and
  // informational registers; teal for intelligence, links and data; gold for
  // money. Opt-in only - nothing cycles into these.
  blue: {
    band: 'bg-google-blue-50',
    title: 'text-google-blue-900',
    support: 'text-google-blue-700',
    border: 'border-google-blue-100',
  },
  teal: {
    band: 'bg-intel-50',
    title: 'text-intel-900',
    support: 'text-intel-700',
    border: 'border-intel-100',
  },
  gold: {
    band: 'bg-gold-50',
    // No gold step is dark enough to set an 11px title in; ink carries it.
    title: 'text-ink-800',
    support: 'text-gold-700',
    border: 'border-gold-200',
  },
}

/**
 * Assigns the three remaining Google hues to a sequence of panels in
 * position order, so neighbours never repeat and a colour returns only on
 * the fourth card — exactly the discipline `.metric-cycle` already applies
 * to metric tiles. Pass the panel's index within its visual sequence
 * (0-based).
 */
export function panelToneForIndex(index: number): PanelTone {
  const cycle: PanelTone[] = ['red', 'amber', 'green']
  return cycle[index % cycle.length]!
}

export function GovPanel({
  title,
  subtitle,
  tone,
  actions,
  dense = false,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /**
   * Left unset, the band takes the next wash in a blue / green / amber / teal
   * cycle among its sibling panels (`.gov-panel-auto` in `src/styles/index.css`),
   * so no page is left with a column of plain grey headers. `'default'` and
   * `'muted'` take the same cycle.
   */
  tone?: PanelTone
  actions?: ReactNode
  /** Removes body padding, for panels whose child owns its own edges. */
  dense?: boolean
  className?: string
  bodyClassName?: string
  children: ReactNode
}): React.JSX.Element {
  // A plain band (unset, `default` or `muted`) takes the automatic tinted
  // cycle, so no page keeps a grey header among its tinted cards.
  const auto = !tone || tone === 'default' || tone === 'muted'
  const band = auto ? null : HEADER_TONE[tone]
  return (
    <section
      className={cn(
        // `rounded-lg` rather than `rounded-none`: a true right angle reads
        // as an unstyled box on screen, while a soft corner reads as a
        // designed surface. The difference is the whole effect.
        'flex flex-col overflow-hidden rounded-lg bg-surface shadow-xs',
        auto && 'gov-panel-auto',
        className,
      )}
    >
      <header
        className={cn(
          'gov-panel-band flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b px-3 py-1.5',
          band?.band,
          band?.border,
        )}
      >
        <h2
          className={cn(
            // min-w keeps the title whole on a phone: the subtitle wraps under it
            // rather than squeezing it to a few letters.
            'min-w-[9rem] flex-1 truncate text-[0.6875rem] font-bold tracking-[0.09em] uppercase',
            band?.title,
          )}
        >
          {title}
        </h2>
        {subtitle ? (
          <span
            className={cn(
              'gov-panel-support max-w-full shrink-0 text-[0.625rem] font-medium tracking-wide',
              band?.support,
            )}
          >
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
  // The platform's tinted card look: the reading's shade, gold for money,
  // else the alternating informational blue / teal.
  const shadeName = autoShade(tone, value, label, unit)
  const sh = SHADE[shadeName]
  return (
    <div className={cn('border-b px-3 py-2.5 last:border-b-0', sh.tile)}>
      <p className="flex items-center gap-1.5 text-[0.625rem] font-bold tracking-[0.08em] text-ink-500 uppercase">
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white', sh.chip)}>
          {meaningIcon(label, shadeName, 'h-3.5 w-3.5')}
        </span>
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className={cn('numeric text-[1.75rem] leading-none font-bold tabular-nums', sh.value)}>
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
    <div className="overflow-hidden rounded-lg border border-ink-200 shadow-xs">
      <div className="flex flex-wrap items-center gap-3 bg-surface px-4 py-3">
        {seal ? (
          <img
            src={seal}
            alt=""
            aria-hidden
            className="h-11 w-11 shrink-0 rounded-[3px] object-cover ring-1 ring-ink-200"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[0.625rem] font-semibold tracking-[0.12em] text-ink-500 uppercase">{authority}</p>
          <h1 className="mt-0.5 truncate text-[1.0625rem] leading-tight font-bold tracking-tight text-ink-900">{title}</h1>
          {standfirst ? <p className="mt-1 max-w-4xl text-[0.6875rem] leading-snug text-ink-600">{standfirst}</p> : null}
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

/** A strip cell's own wash, independent of `tone` — identity, not severity. */
const STRIP_BACKGROUND: Record<'red' | 'amber' | 'green' | 'blue' | 'teal' | 'gold' | 'neutral', string> = {
  red: 'bg-google-red-50',
  amber: 'bg-google-yellow-50',
  green: 'bg-google-green-50',
  blue: 'bg-google-blue-50',
  teal: 'bg-intel-50',
  gold: 'bg-gold-50',
  neutral: 'bg-ink-50',
}

/**
 * One cell of the masthead's status strip.
 *
 * `icon` is optional so every existing call site keeps rendering the plain
 * label-over-value pair unchanged; a page that wants the strip to read as an
 * infographic rather than a returns row passes one, and the cell reserves it
 * a fixed corner rather than letting it push the figure around. `background`
 * is the same idea applied to the cell itself: opt in to a pale Google wash
 * for a strip that reads as a row of distinct stat cards rather than one
 * flat ledger bar. It is deliberately a separate prop from `tone` — tone is
 * the figure's actual reading (critical/warn/positive), background is only
 * which cell this is, so a critical figure still reads red on top of
 * whichever wash the cell happens to sit on.
 */
export function GovStripCell({
  label,
  value,
  tone = 'default',
  icon,
  background,
}: {
  label: ReactNode
  value: ReactNode
  tone?: 'default' | 'critical' | 'warn' | 'positive'
  icon?: ReactNode
  background?: 'red' | 'amber' | 'green' | 'blue' | 'teal' | 'gold' | 'neutral'
}): React.JSX.Element {
  // A cell left without a wash takes the one its reading implies (critical
  // red, warn amber, positive green; gold for money; else the alternating
  // informational blue / teal). A figure's own reading still colours it on
  // whichever wash the call site chose.
  // Red / amber / green washes were handed out by position, not meaning; a
  // cell given one takes the meaning-based shade instead, so a plain count
  // never reads as critical or healthy. Blue / teal / gold / neutral washes
  // were chosen for what the figure is, and stay.
  const identity = background === 'red' || background === 'amber' || background === 'green'
  const keepWash = Boolean(background) && !identity
  const shadeName: Shade =
    tone !== 'default' ? autoShade(tone) : keepWash ? (background as Shade) : autoShade(tone, value, label)
  const sh = SHADE[shadeName]
  const toneClass = sh.value
  return (
    <div className={cn('min-w-[9.5rem] flex-1 px-4 py-3', keepWash ? STRIP_BACKGROUND[background!] : sh.tile)}>
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.09em] text-ink-500 uppercase">
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white', sh.chip)}>
          {icon ?? meaningIcon(label, shadeName, 'h-3.5 w-3.5')}
        </span>
        {label}
      </p>
      <p className={cn('numeric mt-1 text-[1.75rem] leading-none font-bold tabular-nums', toneClass)}>{value}</p>
    </div>
  )
}
