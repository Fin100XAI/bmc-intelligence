import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'

/* ==========================================================================
   Buttons
   ========================================================================== */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'critical' | 'positive'
export type ButtonSize = 'xs' | 'sm' | 'md'

// `ease-[var(--ease-calm)]` rather than Tailwind's default easing: every other
// moving part in the platform - card lift, drawer, tab marker, page entrance -
// is on that one curve, and a button easing differently is the difference
// between an interface that moves as one piece and one that moves in parts.
const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap ' +
  'transition-all duration-150 ease-[var(--ease-calm)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 ' +
  'disabled:active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-govt-500'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-govt-600 to-govt-700 text-white shadow-[0_1px_2px_0_rgb(26_63_175/0.5),inset_0_1px_0_0_rgb(255_255_255/0.16)] hover:from-govt-500 hover:to-govt-600',
  secondary: 'bg-ink-50 text-ink-800 border border-ink-200 hover:bg-ink-100 hover:border-ink-300',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  outline: 'border border-ink-200 bg-surface text-ink-700 shadow-xs hover:bg-ink-50 hover:border-govt-300 hover:text-govt-700',
  critical:
    'bg-gradient-to-b from-crit-500 to-crit-600 text-white shadow-[0_1px_2px_0_rgb(180_34_34/0.45),inset_0_1px_0_0_rgb(255_255_255/0.18)] hover:from-crit-500 hover:to-crit-500',
  positive:
    'bg-gradient-to-b from-ok-500 to-ok-600 text-white shadow-[0_1px_2px_0_rgb(4_117_85/0.45),inset_0_1px_0_0_rgb(255_255_255/0.18)] hover:from-ok-500 hover:to-ok-500',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs',
  sm: 'h-8 px-3 text-[0.8125rem]',
  md: 'h-9 px-4 text-sm',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', icon, iconRight, block, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], block && 'w-full', className)}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  )
})

export interface LinkButtonProps {
  to: string
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  className?: string
  children: ReactNode
  'aria-label'?: string
}

export function LinkButton({
  to,
  variant = 'secondary',
  size = 'sm',
  icon,
  iconRight,
  className,
  children,
  ...rest
}: LinkButtonProps): React.JSX.Element {
  return (
    <Link
      to={to}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </Link>
  )
}

/** Compact icon-only control used in dense toolbars. */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'sm', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        size === 'xs' ? 'h-7 w-7' : size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        'px-0',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

/* ==========================================================================
   Surfaces
   ========================================================================== */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Removes the default padding so the card can host a table or map flush. */
  flush?: boolean
  interactive?: boolean
  tone?: 'default' | 'sunken' | 'critical' | 'warn' | 'positive' | 'info'
}

const CARD_TONES: Record<NonNullable<CardProps['tone']>, string> = {
  default: 'bg-surface border-ink-100',
  sunken: 'bg-surface-sunken border-ink-100',
  critical: 'bg-gradient-to-br from-crit-50 to-surface border-crit-200/70',
  warn: 'bg-gradient-to-br from-warn-50 to-surface border-warn-200/70',
  positive: 'bg-gradient-to-br from-ok-50 to-surface border-ok-200/70',
  info: 'bg-gradient-to-br from-govt-50 to-surface border-govt-200/70',
}

export function Card({ flush, interactive, tone = 'default', className, children, ...rest }: CardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-xl border shadow-card',
        CARD_TONES[tone],
        interactive && 'lift-on-hover cursor-pointer hover:border-govt-200',
        !flush && 'p-4',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export interface CardHeaderProps {
  title: ReactNode
  /** Small uppercase eyebrow above the title. */
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
  className?: string
  /** Applies bottom padding + hairline when the card is `flush`. */
  bordered?: boolean
}

export function CardHeader({
  title,
  eyebrow,
  description,
  actions,
  icon,
  className,
  bordered,
}: CardHeaderProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3',
        bordered && 'border-b border-ink-100 px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow ? <div className="label-institutional mb-1">{eyebrow}</div> : null}
        <div className="flex items-center gap-2">
          {icon ? (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-govt-50 text-govt-600 ring-1 ring-govt-100 ring-inset">
              {icon}
            </span>
          ) : null}
          <h3 className="truncate text-[0.9375rem] leading-5 font-semibold text-ink-900">{title}</h3>
        </div>
        {description ? (
          <p className="mt-1 text-[0.8125rem] leading-[1.45] text-ink-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  )
}

/** Page-level section divider with an institutional eyebrow. */
export function SectionHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="label-institutional mb-1">{eyebrow}</div> : null}
        <h2 className="accent-rule text-[1.0625rem] leading-6 font-semibold tracking-tight text-ink-900">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-[0.8125rem] leading-relaxed text-ink-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/* ==========================================================================
   Key–value presentation
   ========================================================================== */

export function DefinitionRow({
  label,
  children,
  className,
  mono,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
  mono?: boolean
}): React.JSX.Element {
  return (
    <div className={cn('grid grid-cols-[minmax(7rem,38%)_1fr] gap-3 py-1.5', className)}>
      <dt className="text-xs leading-5 font-medium text-ink-500">{label}</dt>
      <dd className={cn('text-[0.8125rem] leading-5 text-ink-800', mono && 'font-mono text-xs')}>{children}</dd>
    </div>
  )
}

export function DefinitionList({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return <dl className={cn('divide-y divide-ink-50', className)}>{children}</dl>
}

/* ==========================================================================
   Form fields
   ========================================================================== */

export function Label({
  htmlFor,
  children,
  hint,
  required,
  className,
}: {
  htmlFor?: string
  children: ReactNode
  hint?: ReactNode
  required?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1 block text-xs font-medium text-ink-600', className)}>
      {children}
      {required ? <span className="ml-0.5 text-crit-600">*</span> : null}
      {hint ? <span className="ml-1.5 font-normal text-ink-400">{hint}</span> : null}
    </label>
  )
}

const FIELD_BASE =
  'w-full rounded-lg border border-ink-200 bg-surface px-3 text-[0.8125rem] text-ink-800 shadow-xs ' +
  'placeholder:text-ink-300 transition-all focus:border-govt-400 focus:outline-none ' +
  'focus:ring-[3px] focus:ring-govt-500/15 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(FIELD_BASE, 'h-9', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(FIELD_BASE, 'py-1.5 leading-relaxed', className)} {...rest} />
  },
)

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        FIELD_BASE,
        'h-9 cursor-pointer appearance-none bg-[length:14px] bg-[right_0.5rem_center] bg-no-repeat pr-7',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235b6f89' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...rest}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
})

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  disabled?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 text-[0.8125rem] text-ink-700',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded-[3px] border-ink-300 text-govt-600 focus:ring-2 focus:ring-govt-500/25"
      />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  )
}

/**
 * Binary on/off control for a setting that takes effect immediately.
 *
 * Distinct from `Checkbox`, which selects a value inside a form that is
 * submitted later: a switch is the change. Used for enable/pause on the data
 * source register and for the immediate interface preferences.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  /** Announced to assistive technology; the visible label sits alongside. */
  label: string
  disabled?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[1.15rem] w-9 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:ring-2 focus-visible:ring-govt-500/30 focus-visible:outline-none',
        checked ? 'bg-ok-600' : 'bg-ink-300',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[1.15rem]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

/** Segmented control - used for view modes and scenario presets. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
  className,
  ariaLabel,
}: {
  value: T
  onChange: (next: T) => void
  options: Array<{ value: T; label: ReactNode; icon?: ReactNode }>
  size?: 'xs' | 'sm'
  className?: string
  ariaLabel?: string
}): React.JSX.Element {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-0.5 rounded-lg border border-ink-200 bg-ink-50 p-[3px] shadow-inner', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md font-semibold transition-all duration-150',
              size === 'xs' ? 'h-6 px-2.5 text-[0.6875rem]' : 'h-[1.875rem] px-3 text-xs',
              active
                ? 'bg-surface text-govt-700 shadow-[0_1px_2px_0_rgb(11_18_32/0.1)] ring-1 ring-ink-200/70'
                : 'text-ink-500 hover:text-ink-800',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/* ==========================================================================
   Progress & score display
   ========================================================================== */

export type ScoreTone = 'positive' | 'neutral' | 'warn' | 'risk' | 'critical'

export function toneForScore(score: number, higherIsBetter = true): ScoreTone {
  const v = higherIsBetter ? score : 100 - score
  if (v >= 78) return 'positive'
  if (v >= 62) return 'neutral'
  if (v >= 45) return 'warn'
  if (v >= 30) return 'risk'
  return 'critical'
}

export const SCORE_TONE_BAR: Record<ScoreTone, string> = {
  positive: 'bg-gradient-to-r from-ok-500 to-ok-300',
  neutral: 'bg-gradient-to-r from-govt-600 to-govt-400',
  warn: 'bg-gradient-to-r from-warn-600 to-warn-300',
  risk: 'bg-gradient-to-r from-risk-600 to-risk-300',
  critical: 'bg-gradient-to-r from-crit-600 to-crit-300',
}

export const SCORE_TONE_TEXT: Record<ScoreTone, string> = {
  positive: 'text-ok-700',
  neutral: 'text-govt-700',
  warn: 'text-warn-700',
  risk: 'text-risk-700',
  critical: 'text-crit-700',
}

export function ProgressBar({
  value,
  max = 100,
  tone,
  size = 'md',
  className,
  label,
  showValue,
}: {
  value: number
  max?: number
  tone?: ScoreTone
  size?: 'xs' | 'sm' | 'md'
  className?: string
  label?: ReactNode
  showValue?: boolean
}): React.JSX.Element {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const resolved = tone ?? toneForScore(pct)
  return (
    <div className={cn('w-full', className)}>
      {label || showValue ? (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          {label ? <span className="text-xs text-ink-500">{label}</span> : <span />}
          {showValue ? (
            <span className={cn('numeric text-xs font-semibold', SCORE_TONE_TEXT[resolved])}>
              {Math.round(pct)}%
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-ink-100 shadow-inner',
          size === 'xs' ? 'h-1.5' : size === 'sm' ? 'h-2' : 'h-2.5',
        )}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out', SCORE_TONE_BAR[resolved])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/** Circular score dial for the headline composite indices. */
export function ScoreDial({
  score,
  size = 92,
  label,
  higherIsBetter = true,
  caption,
}: {
  score: number
  size?: number
  label?: ReactNode
  higherIsBetter?: boolean
  caption?: ReactNode
}): React.JSX.Element {
  const tone = toneForScore(score, higherIsBetter)
  const stroke = size >= 80 ? 7 : 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100)
  const colour = {
    positive: 'var(--color-ok-500)',
    neutral: 'var(--color-govt-500)',
    warn: 'var(--color-warn-500)',
    risk: 'var(--color-risk-500)',
    critical: 'var(--color-crit-500)',
  }[tone]

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-ink-100)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colour}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 700ms var(--ease-calm)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('numeric font-semibold tracking-tight', size >= 80 ? 'text-2xl' : 'text-lg', SCORE_TONE_TEXT[tone])}>
            {Math.round(score)}
          </span>
          {label ? <span className="mt-px text-[0.625rem] text-ink-400">{label}</span> : null}
        </div>
      </div>
      {caption ? <span className="text-center text-xs text-ink-500">{caption}</span> : null}
    </div>
  )
}

/* ==========================================================================
   Layout helpers
   ========================================================================== */

/** Responsive metric grid used across every intelligence page. */
export function MetricGrid({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode
  columns?: 2 | 3 | 4 | 5 | 6
  className?: string
}): React.JSX.Element {
  const cols: Record<number, string> = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  }
  return <div className={cn('grid gap-3', cols[columns], className)}>{children}</div>
}

export function Divider({ className, label }: { className?: string; label?: ReactNode }): React.JSX.Element {
  if (label) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className="h-px flex-1 bg-ink-100" />
        <span className="label-institutional">{label}</span>
        <div className="h-px flex-1 bg-ink-100" />
      </div>
    )
  }
  return <div className={cn('h-px w-full bg-ink-100', className)} />
}

/** Horizontally scrollable container - wide tables and diagrams never break the page. */
export function ScrollArea({
  children,
  className,
  maxHeight,
}: {
  children: ReactNode
  className?: string
  maxHeight?: string
}): React.JSX.Element {
  return (
    <div className={cn('scrollbar-slim overflow-auto', className)} style={maxHeight ? { maxHeight } : undefined}>
      {children}
    </div>
  )
}
