import type { Locale as DateFnsLocale } from 'date-fns'

/* ---------------------------------------------------------------------------
 * MARATHI CALENDAR NAMES FOR date-fns
 *
 * date-fns ships no Marathi locale, and the platform formats every instant
 * through explicit patterns ('d MMM yyyy', 'HH:mm') rather than through the
 * locale's own presets. This supplies exactly what those patterns consult -
 * month names, day names and the day period - so a date reads as Marathi
 * without the numbering or the layout moving.
 *
 * Figures stay in Latin digits throughout. Marathi's CLDR default is the
 * Devanagari numbering system, but Government of Maharashtra practice is
 * Marathi words with Latin figures, and an officer reconciling this screen
 * against a source system has to be able to read the two side by side.
 * ------------------------------------------------------------------------- */

const MONTHS_WIDE = [
  'जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून',
  'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर',
]

const MONTHS_ABBREVIATED = [
  'जाने', 'फेब्रु', 'मार्च', 'एप्रि', 'मे', 'जून',
  'जुलै', 'ऑग', 'सप्टें', 'ऑक्टो', 'नोव्हें', 'डिसें',
]

const MONTHS_NARROW = ['जा', 'फे', 'मा', 'ए', 'मे', 'जू', 'जु', 'ऑ', 'स', 'ऑ', 'नो', 'डि']

const DAYS_WIDE = ['रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार']
const DAYS_ABBREVIATED = ['रवि', 'सोम', 'मंगळ', 'बुध', 'गुरु', 'शुक्र', 'शनि']
const DAYS_SHORT = ['र', 'सो', 'मं', 'बु', 'गु', 'शु', 'श']

/** The standard Marathi ante/post meridiem markers: मध्यान्हपूर्व / मध्यान्होत्तर. */
const DAY_PERIODS: Record<string, string> = {
  am: 'म.पू.',
  pm: 'म.उ.',
  midnight: 'मध्यरात्र',
  noon: 'दुपार',
  morning: 'सकाळ',
  afternoon: 'दुपार',
  evening: 'संध्याकाळ',
  night: 'रात्र',
}

const QUARTERS_WIDE = ['पहिली तिमाही', 'दुसरी तिमाही', 'तिसरी तिमाही', 'चौथी तिमाही']
const QUARTERS_ABBREVIATED = ['ति1', 'ति2', 'ति3', 'ति4']

const ERAS_WIDE = ['ईसवीसनपूर्व', 'ईसवी सन']
const ERAS_ABBREVIATED = ['इ.स.पू.', 'इ.स.']

type Width = 'narrow' | 'short' | 'abbreviated' | 'wide' | undefined

function pick(values: Record<string, readonly string[]>, width: Width, fallback: string): string[] {
  const chosen = (width && values[width]) ?? values.wide ?? []
  return chosen.length > 0 ? [...chosen] : [fallback]
}

/**
 * Only the members `format()` consults for the patterns this platform uses are
 * meaningful; the rest satisfy the interface. `formatDistance` and
 * `formatRelative` are never reached - `src/utils/format.ts` renders ages
 * itself, through `t()`, so that "3 दिवसांपूर्वी" is a translated message an
 * operator can see in the catalogue rather than a library's private string.
 */
export const mrDateLocale: DateFnsLocale = {
  code: 'mr',
  formatDistance: (token, count) => `${count} ${token}`,
  formatLong: {
    date: () => 'd MMM yyyy',
    time: () => 'HH:mm',
    dateTime: () => "d MMM yyyy, HH:mm",
  } as DateFnsLocale['formatLong'],
  formatRelative: (token) => String(token),
  localize: {
    ordinalNumber: (value: number) => String(value),
    era: (value: number, options?: { width?: Width }) =>
      pick({ narrow: ERAS_ABBREVIATED, abbreviated: ERAS_ABBREVIATED, wide: ERAS_WIDE }, options?.width, '')[value] ?? '',
    quarter: (value: number, options?: { width?: Width }) =>
      pick({ narrow: QUARTERS_ABBREVIATED, abbreviated: QUARTERS_ABBREVIATED, wide: QUARTERS_WIDE }, options?.width, '')[
        value - 1
      ] ?? '',
    month: (value: number, options?: { width?: Width }) =>
      pick(
        { narrow: MONTHS_NARROW, abbreviated: MONTHS_ABBREVIATED, short: MONTHS_ABBREVIATED, wide: MONTHS_WIDE },
        options?.width,
        '',
      )[value] ?? '',
    day: (value: number, options?: { width?: Width }) =>
      pick(
        { narrow: DAYS_SHORT, short: DAYS_SHORT, abbreviated: DAYS_ABBREVIATED, wide: DAYS_WIDE },
        options?.width,
        '',
      )[value] ?? '',
    dayPeriod: (value: string) => DAY_PERIODS[value] ?? value,
  } as unknown as DateFnsLocale['localize'],
  match: {} as DateFnsLocale['match'],
  options: { weekStartsOn: 0, firstWeekContainsDate: 1 },
}
