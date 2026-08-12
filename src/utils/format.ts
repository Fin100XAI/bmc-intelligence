import { format, parseISO } from 'date-fns'
import { DEMO_NOW } from './deterministic'
import { getLocale, t } from '@/i18n'
import { mrDateLocale } from '@/i18n/date-locale.mr'

/** ---------------------------------------------------------------------
 * Runtime presentation options
 *
 * Numbering and date conventions are an operator preference, not a product
 * decision: an engineer reading crore figures all day and a visiting reviewer
 * reading millions want different renderings of the same number. The System
 * Settings page writes these through `setFormatOptions`; every formatter below
 * reads them, so one preference change re-renders the whole platform
 * consistently rather than leaving each screen to remember.
 *
 * They govern *presentation only*. No underlying figure, seed or derivation
 * changes - the same value is spoken in a different dialect.
 * ------------------------------------------------------------------- */

export type NumberFormatMode = 'indian' | 'international'
export type DateFormatMode = 'day-month-year' | 'numeric' | 'iso'
export type TimeFormatMode = '24h' | '12h'

export interface FormatOptions {
  /** Digit grouping and the compact scale: lakh/crore, or thousand/million. */
  numberFormat: NumberFormatMode
  dateFormat: DateFormatMode
  timeFormat: TimeFormatMode
  /** When false, ages are shown as absolute instants rather than "3 h ago". */
  relativeTimestamps: boolean
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
  numberFormat: 'indian',
  dateFormat: 'day-month-year',
  timeFormat: '24h',
  relativeTimestamps: true,
}

const options: FormatOptions = { ...DEFAULT_FORMAT_OPTIONS }

/** Applied by the preferences store; see `useApplyPreferences`. */
export function setFormatOptions(next: Partial<FormatOptions>): void {
  Object.assign(options, next)
}

export function getFormatOptions(): Readonly<FormatOptions> {
  return options
}

/** ---------------------------------------------------------------------
 * Numeric formatting - Indian numbering conventions by default.
 * ------------------------------------------------------------------- */

const GROUPERS: Record<NumberFormatMode, Intl.NumberFormat[]> = {
  indian: [
    new Intl.NumberFormat('en-IN'),
    new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  ],
  international: [
    new Intl.NumberFormat('en-GB'),
    new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  ],
}

export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '-'
  const grouping = GROUPERS[options.numberFormat] ?? GROUPERS.indian
  if (decimals === 1) return grouping[1]!.format(value)
  if (decimals === 2) return grouping[2]!.format(value)
  return grouping[0]!.format(Math.round(value))
}

/**
 * Compact form for large counts. Indian scale gives 12.4K / 3.1L / 1.2Cr;
 * international gives 12.4K / 310K / 12M.
 */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '-'
  const abs = Math.abs(value)
  if (options.numberFormat === 'international') {
    if (abs >= 1_000_000_000) return t('{0}B', (value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1))
    if (abs >= 1_000_000) return t('{0}M', (value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1))
    if (abs >= 1_000) return t('{0}K', (value / 1_000).toFixed(abs >= 10_000 ? 0 : 1))
    return formatNumber(value)
  }
  // The compact suffix is a WORD, not a symbol - "Cr" is read as crore and in
  // Marathi is written कोटी. It is translated for the same reason the column
  // heading above it is.
  if (abs >= 1_00_00_000) return t('{0}Cr', (value / 1_00_00_000).toFixed(abs >= 10_00_00_000 ? 0 : 1))
  if (abs >= 1_00_000) return t('{0}L', (value / 1_00_000).toFixed(abs >= 10_00_000 ? 0 : 1))
  if (abs >= 1_000) return t('{0}K', (value / 1_000).toFixed(abs >= 10_000 ? 0 : 1))
  return formatNumber(value)
}

/** Monetary values are held in INR crore throughout the platform. */
export function formatCrore(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '-'
  return t('₹{0} Cr', formatNumber(value, decimals))
}

/**
 * A figure held in plain rupees rather than in crore.
 *
 * Most money in this platform is a departmental or city aggregate and is
 * carried in crore. Assessment works the other way round: a single property's
 * annual demand is a four- or five-figure rupee amount, and rendering it as
 * "₹0.0008 Cr" would be useless to the assessor who has to act on it. This
 * renders the exact rupee value under a lakh and switches to the compact
 * Indian scale above it, so a worklist row and a city total can sit on the
 * same screen without either becoming unreadable.
 */
export function formatRupees(value: number): string {
  if (!Number.isFinite(value)) return '-'
  if (Math.abs(value) >= 1_00_000) return `₹${formatCompact(value)}`
  return `₹${formatNumber(Math.round(value))}`
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '-'
  return `${formatNumber(value, decimals)}%`
}

/** Signed percentage-point delta, e.g. "+2.4 pp" / "−1.1 pp". */
export function formatDelta(value: number, unit = '%', decimals = 1): string {
  if (!Number.isFinite(value)) return '-'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatNumber(Math.abs(value), decimals)}${unit}`
}

export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return formatNumber(Math.round(value))
}

/** ---------------------------------------------------------------------
 * Temporal formatting - anchored to the demonstration reference instant so
 * relative labels never drift between the data layer and the interface.
 * ------------------------------------------------------------------- */

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? parseISO(value) : value
}

const DATE_PATTERN: Record<DateFormatMode, string> = {
  'day-month-year': 'd MMM yyyy',
  numeric: 'dd/MM/yyyy',
  iso: 'yyyy-MM-dd',
}

const SHORT_DATE_PATTERN: Record<DateFormatMode, string> = {
  'day-month-year': 'd MMM',
  numeric: 'dd/MM',
  iso: 'MM-dd',
}

const TIME_PATTERN: Record<TimeFormatMode, string> = {
  '24h': 'HH:mm',
  '12h': 'h:mm a',
}

/**
 * Month names and the meridiem marker are the only parts of a formatted
 * instant that are language-bearing; the digits, separators and ordering are
 * not. Passing the Marathi calendar names through to `format()` therefore
 * translates the date without moving anything an operator reconciles against.
 */
function dateOptions(): Parameters<typeof format>[2] {
  return getLocale() === 'mr' ? { locale: mrDateLocale } : undefined
}

export function formatDateTime(value: string | Date): string {
  try {
    return format(
      toDate(value),
      `${DATE_PATTERN[options.dateFormat]}, ${TIME_PATTERN[options.timeFormat]} '${t('IST')}'`,
      dateOptions(),
    )
  } catch {
    return '-'
  }
}

export function formatDate(value: string | Date): string {
  try {
    return format(toDate(value), DATE_PATTERN[options.dateFormat], dateOptions())
  } catch {
    return '-'
  }
}

export function formatShortDate(value: string | Date): string {
  try {
    return format(toDate(value), SHORT_DATE_PATTERN[options.dateFormat], dateOptions())
  } catch {
    return '-'
  }
}

export function formatTime(value: string | Date): string {
  try {
    return format(toDate(value), TIME_PATTERN[options.timeFormat], dateOptions())
  } catch {
    return '-'
  }
}

/**
 * Relative age measured against the demonstration anchor rather than the
 * wall clock, so freshness statements stay truthful within the environment.
 *
 * An operator who prefers absolute instants gets the timestamp itself - the
 * age is the same fact either way, and a decision record read months later is
 * easier to reconcile against a source system when it carries the instant.
 */
export function formatRelative(value: string | Date): string {
  try {
    const date = toDate(value)
    if (!options.relativeTimestamps) return formatDateTime(date)
    const diffMs = DEMO_NOW.getTime() - date.getTime()
    const future = diffMs < 0
    const abs = Math.abs(diffMs)
    const minutes = Math.round(abs / 60_000)
    if (minutes < 1) return t('just now')
    if (minutes < 60) return future ? t('in {0} min', minutes) : t('{0} min ago', minutes)
    const hours = Math.round(minutes / 60)
    if (hours < 24) return future ? t('in {0} h', hours) : t('{0} h ago', hours)
    const days = Math.round(hours / 24)
    if (days < 30) return future ? t('in {0} d', days) : t('{0} d ago', days)
    /* Beyond a month the age is spoken rather than counted in days. This is
       computed here rather than delegated to date-fns so that both languages
       read out of the catalogue and an age can never appear in English on an
       otherwise Marathi screen. */
    const months = Math.round(days / 30)
    if (months < 12) {
      if (months <= 1) return future ? t('in 1 month') : t('1 month ago')
      return future ? t('in {0} months', months) : t('{0} months ago', months)
    }
    const years = Math.round(days / 365)
    if (years <= 1) return future ? t('in 1 year') : t('1 year ago')
    return future ? t('in {0} years', years) : t('{0} years ago', years)
  } catch {
    return '-'
  }
}

/** Duration in hours rendered as "3h 20m" / "2d 4h". */
export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours)) return '-'
  const abs = Math.abs(hours)
  if (abs < 1) return t('{0}m', Math.round(abs * 60))
  if (abs < 24) {
    const h = Math.floor(abs)
    const m = Math.round((abs - h) * 60)
    return m > 0 ? t('{0}h {1}m', h, m) : t('{0}h', h)
  }
  const d = Math.floor(abs / 24)
  const h = Math.round(abs % 24)
  return h > 0 ? t('{0}d {1}h', d, h) : t('{0}d', d)
}

/** ---------------------------------------------------------------------
 * Text helpers
 * ------------------------------------------------------------------- */

export function titleCase(input: string): string {
  return input
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '-'
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase()
  return `${parts[0]?.charAt(0) ?? ''}${parts[parts.length - 1]?.charAt(0) ?? ''}`.toUpperCase()
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input
  return `${input.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/**
 * Neutralises user-entered text before it is stored or displayed.
 * The platform never renders raw HTML from user input anywhere.
 */
export function sanitiseText(input: string, maxLength = 2000): string {
  return input
    // Never render user-entered markup: angle brackets are stripped outright.
    .replace(/[<>]/g, '')
    // Remove control characters that could corrupt audit records or exports.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // Collapse runs of horizontal whitespace; newlines in notes are preserved.
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, maxLength)
}
