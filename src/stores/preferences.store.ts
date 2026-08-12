import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_FORMAT_OPTIONS,
  setFormatOptions,
  type DateFormatMode,
  type NumberFormatMode,
  type TimeFormatMode,
} from '@/utils/format'
import { SEVERITY_LABEL, type Severity } from '@/types/common'
import { NOTIFICATION_TYPE_LABEL, type NotificationType } from '@/types/intelligence'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/stores/preferences.store.ts
 *
 * Operator interface preferences — the settings the Settings →
 * Preferences tab writes and `useApplyPreferences` applies.
 *
 * The distinction this file exists to hold: these are *personal, applied*
 * preferences, as opposed to the deployment configuration shown read-only on
 * the same page. Every field below changes what the operator sees the instant
 * it is set, is held in this browser only, and is never written to any
 * operator's institutional record. Nothing here can change a figure, a
 * permission or another operator's view — a preference that could do any of
 * those would belong in the configuration, under change control, not here.
 */

export type InterfaceDensity = 'compact' | 'comfortable' | 'spacious'
export type MotionPreference = 'full' | 'reduced'
export type ContrastPreference = 'standard' | 'high'
export type SidebarPreference = 'expanded' | 'collapsed'
export type TablePageSize = 10 | 15 | 25 | 50

/** Sentinel meaning "use the role's default landing route". */
export const ROLE_DEFAULT_LANDING = 'role-default'

/** Root font-size per density — everything sized in rem scales with it. */
export const DENSITY_ROOT_PX: Record<InterfaceDensity, string> = {
  compact: '14px',
  comfortable: '16px',
  spacious: '18px',
}

function build$DENSITY_LABEL(): Record<InterfaceDensity, string> {
  return {
  compact: t('Compact'),
  comfortable: t('Comfortable'),
  spacious: t('Spacious'),
}
}
export let DENSITY_LABEL: Record<InterfaceDensity, string> = build$DENSITY_LABEL()
registerLayer(() => {
  DENSITY_LABEL = build$DENSITY_LABEL()
})

function build$NUMBER_FORMAT_LABEL(): Record<NumberFormatMode, string> {
  return {
  indian: t('Indian — lakh, crore'),
  international: t('International — thousand, million'),
}
}
export let NUMBER_FORMAT_LABEL: Record<NumberFormatMode, string> = build$NUMBER_FORMAT_LABEL()
registerLayer(() => {
  NUMBER_FORMAT_LABEL = build$NUMBER_FORMAT_LABEL()
})

function build$DATE_FORMAT_LABEL(): Record<DateFormatMode, string> {
  return {
  'day-month-year': t('24 Jul 2026'),
  numeric: '24/07/2026',
  iso: '2026-07-24',
}
}
export let DATE_FORMAT_LABEL: Record<DateFormatMode, string> = build$DATE_FORMAT_LABEL()
registerLayer(() => {
  DATE_FORMAT_LABEL = build$DATE_FORMAT_LABEL()
})

function build$TIME_FORMAT_LABEL(): Record<TimeFormatMode, string> {
  return {
  '24h': t('24-hour — 14:30'),
  '12h': t('12-hour — 2:30 PM'),
}
}
export let TIME_FORMAT_LABEL: Record<TimeFormatMode, string> = build$TIME_FORMAT_LABEL()
registerLayer(() => {
  TIME_FORMAT_LABEL = build$TIME_FORMAT_LABEL()
})

export const TABLE_PAGE_SIZES: TablePageSize[] = [10, 15, 25, 50]

/** Notification severities in descending order of consequence. */
export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

export const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_TYPE_LABEL) as NotificationType[]

function build$SEVERITY_FLOOR_LABEL(): Record<Severity, string> {
  return {
  critical: `${SEVERITY_LABEL.critical} only`,
  high: t('{0} and above', SEVERITY_LABEL.high),
  medium: t('{0} and above', SEVERITY_LABEL.medium),
  low: t('{0} and above', SEVERITY_LABEL.low),
  info: t('Everything addressed to me'),
}
}
export let SEVERITY_FLOOR_LABEL: Record<Severity, string> = build$SEVERITY_FLOOR_LABEL()
registerLayer(() => {
  SEVERITY_FLOOR_LABEL = build$SEVERITY_FLOOR_LABEL()
})

export type PreferenceGroup = 'interface' | 'presentation' | 'notifications'

export interface PreferencesState {
  /* Interface -------------------------------------------------------- */
  density: InterfaceDensity
  motion: MotionPreference
  contrast: ContrastPreference
  sidebar: SidebarPreference
  /** A route path, or ROLE_DEFAULT_LANDING to defer to the role's landing. */
  defaultLanding: string

  /* Data presentation ------------------------------------------------ */
  numberFormat: NumberFormatMode
  dateFormat: DateFormatMode
  timeFormat: TimeFormatMode
  relativeTimestamps: boolean
  tablePageSize: TablePageSize

  /* Notifications ---------------------------------------------------- */
  /**
   * The lowest severity the notification centre surfaces. Routing itself is
   * institutional and is *not* a preference — an officer accountable for a
   * critical alert is notified regardless of what is set here, and the page
   * says so where the control sits.
   */
  notificationFloor: Severity
  /** Notification types the operator has muted in this browser. */
  mutedNotificationTypes: NotificationType[]

  setDensity: (density: InterfaceDensity) => void
  setMotion: (motion: MotionPreference) => void
  setContrast: (contrast: ContrastPreference) => void
  setSidebar: (sidebar: SidebarPreference) => void
  setDefaultLanding: (route: string) => void
  setNumberFormat: (mode: NumberFormatMode) => void
  setDateFormat: (mode: DateFormatMode) => void
  setTimeFormat: (mode: TimeFormatMode) => void
  setRelativeTimestamps: (on: boolean) => void
  setTablePageSize: (size: TablePageSize) => void
  setNotificationFloor: (severity: Severity) => void
  toggleNotificationType: (type: NotificationType) => void

  /** Restores every preference in the named group to its default. */
  resetGroup: (group: PreferenceGroup) => void
  reset: () => void
}

const DEFAULTS = {
  density: 'comfortable' as InterfaceDensity,
  motion: 'full' as MotionPreference,
  contrast: 'standard' as ContrastPreference,
  sidebar: 'expanded' as SidebarPreference,
  defaultLanding: ROLE_DEFAULT_LANDING,
  numberFormat: DEFAULT_FORMAT_OPTIONS.numberFormat,
  dateFormat: DEFAULT_FORMAT_OPTIONS.dateFormat,
  timeFormat: DEFAULT_FORMAT_OPTIONS.timeFormat,
  relativeTimestamps: DEFAULT_FORMAT_OPTIONS.relativeTimestamps,
  tablePageSize: 15 as TablePageSize,
  notificationFloor: 'info' as Severity,
  mutedNotificationTypes: [] as NotificationType[],
}

type DefaultKey = keyof typeof DEFAULTS

const GROUP_KEYS: Record<PreferenceGroup, DefaultKey[]> = {
  interface: ['density', 'motion', 'contrast', 'sidebar', 'defaultLanding'],
  presentation: ['numberFormat', 'dateFormat', 'timeFormat', 'relativeTimestamps', 'tablePageSize'],
  notifications: ['notificationFloor', 'mutedNotificationTypes'],
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setDensity: (density) => set({ density }),
      setMotion: (motion) => set({ motion }),
      setContrast: (contrast) => set({ contrast }),
      setSidebar: (sidebar) => set({ sidebar }),
      setDefaultLanding: (defaultLanding) => set({ defaultLanding }),
      setNumberFormat: (numberFormat) => set({ numberFormat }),
      setDateFormat: (dateFormat) => set({ dateFormat }),
      setTimeFormat: (timeFormat) => set({ timeFormat }),
      setRelativeTimestamps: (relativeTimestamps) => set({ relativeTimestamps }),
      setTablePageSize: (tablePageSize) => set({ tablePageSize }),
      setNotificationFloor: (notificationFloor) => set({ notificationFloor }),
      toggleNotificationType: (type) =>
        set((s) => ({
          mutedNotificationTypes: s.mutedNotificationTypes.includes(type)
            ? s.mutedNotificationTypes.filter((notificationType) => notificationType !== type)
            : [...s.mutedNotificationTypes, type],
        })),
      resetGroup: (group) =>
        set(() => Object.fromEntries(GROUP_KEYS[group].map((key) => [key, DEFAULTS[key]]))),
      reset: () => set({ ...DEFAULTS, mutedNotificationTypes: [] }),
    }),
    { name: 'bmc-mii.preferences', version: 2 },
  ),
)

/** True when every preference in the group is at its shipped default. */
export function isGroupAtDefault(state: PreferencesState, group: PreferenceGroup): boolean {
  return GROUP_KEYS[group].every((key) => {
    const current = state[key]
    const fallback = DEFAULTS[key]
    if (Array.isArray(fallback)) return Array.isArray(current) && current.length === fallback.length
    return current === fallback
  })
}

/** Severities at or above the operator's notification floor. */
export function severitiesAtOrAbove(floor: Severity): Severity[] {
  const index = SEVERITY_ORDER.indexOf(floor)
  return index < 0 ? SEVERITY_ORDER : SEVERITY_ORDER.slice(0, index + 1)
}

/**
 * Applies the operator's preferences to the document root and to the
 * formatting layer. Mounted once, in the app shell — the single place the
 * interface preferences take physical effect.
 *
 * Density drives the root font size (all rem-based sizing scales with it),
 * motion and contrast stamp `data-motion` / `data-contrast`, which the
 * stylesheet reads, and the numbering and date choices are pushed into
 * `src/utils/format.ts` so every formatter in the platform speaks the
 * operator's dialect.
 *
 * Returns a signature that changes whenever a formatting preference changes.
 * The shell keys the routed subtree on it: formatters read module state at
 * render time rather than through a context, so a preference change must force
 * one re-render to become visible. That is deliberate — the alternative is
 * threading a formatting context through every screen in the platform for a
 * preference an operator sets once.
 */
export function useApplyPreferences(): string {
  const density = usePreferencesStore((s) => s.density)
  const motion = usePreferencesStore((s) => s.motion)
  const contrast = usePreferencesStore((s) => s.contrast)
  const numberFormat = usePreferencesStore((s) => s.numberFormat)
  const dateFormat = usePreferencesStore((s) => s.dateFormat)
  const timeFormat = usePreferencesStore((s) => s.timeFormat)
  const relativeTimestamps = usePreferencesStore((s) => s.relativeTimestamps)

  useEffect(() => {
    const root = document.documentElement
    root.style.fontSize = DENSITY_ROOT_PX[density]
    root.dataset.density = density
  }, [density])

  useEffect(() => {
    document.documentElement.dataset.motion = motion
  }, [motion])

  useEffect(() => {
    document.documentElement.dataset.contrast = contrast
  }, [contrast])

  // Applied during render, not in an effect: the first paint after a change
  // must already use the new dialect, or the page renders once in the old one
  // and visibly reflows.
  setFormatOptions({ numberFormat, dateFormat, timeFormat, relativeTimestamps })

  return useMemo(
    () => `${numberFormat}|${dateFormat}|${timeFormat}|${relativeTimestamps ? 'rel' : 'abs'}`,
    [numberFormat, dateFormat, timeFormat, relativeTimestamps],
  )
}
