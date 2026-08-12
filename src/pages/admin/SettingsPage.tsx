import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BellRing,
  Building2,
  CalendarDays,
  Clock,
  Compass,
  Contrast,
  FlaskConical,
  Gauge,
  Languages,
  Globe2,
  Hash,
  Info,
  Layers,
  Lock,
  MapPin,
  MapPinned,
  PanelLeft,
  RotateCcw,
  Rows3,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  ToggleLeft,
  Zap,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badges'
import {
  Button,
  Card,
  CardHeader,
  Checkbox,
  DefinitionList,
  DefinitionRow,
  MetricGrid,
  SectionHeader,
  SegmentedControl,
  Select,
  Switch,
} from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DemonstrationNotice } from '@/components/ui/states'
import { MetricCard } from '@/components/cards/MetricCard'
import {
  PLATFORM_HIERARCHY,
  municipality,
  municipalityProfiles,
  type FeatureFlag,
  type FeatureFlagStage,
  type MunicipalityProfile,
} from '@/config/municipality.config'
import { NAV_SECTIONS } from '@/config/navigation'
import { canAccess } from '@/security/access'
import { useCurrentUser } from '@/stores/auth.store'
import { useLayoutStore } from '@/stores/ui.store'
import { useLocale, useSetLocale } from '@/stores/locale.store'
import {
  DATE_FORMAT_LABEL,
  DENSITY_LABEL,
  NOTIFICATION_TYPES,
  NUMBER_FORMAT_LABEL,
  ROLE_DEFAULT_LANDING,
  SEVERITY_FLOOR_LABEL,
  SEVERITY_ORDER,
  TABLE_PAGE_SIZES,
  TIME_FORMAT_LABEL,
  isGroupAtDefault,
  severitiesAtOrAbove,
  usePreferencesStore,
  type ContrastPreference,
  type InterfaceDensity,
  type MotionPreference,
  type PreferenceGroup,
  type SidebarPreference,
  type TablePageSize,
} from '@/stores/preferences.store'
import { NOTIFICATIONS } from '@/data/intelligence.data'
import { NOTIFICATION_TYPE_LABEL } from '@/types/intelligence'
import { DOMAIN_LABEL, type Severity } from '@/types/common'
import {
  formatCompact,
  formatCrore,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  type DateFormatMode,
  type NumberFormatMode,
  type TimeFormatMode,
} from '@/utils/format'
import { isoFromAnchor } from '@/utils/deterministic'
import { cn } from '@/utils/cn'
import { LOCALES, LOCALE_INFO, t, type Locale } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/admin/SettingsPage.tsx
 *
 * Two things live on this page, and the page's whole job is to keep them
 * visibly apart.
 *
 * **Preferences** are the operator's own. Every control in the first three
 * sections writes to `usePreferencesStore`, takes effect the instant it is set,
 * is held in this browser alone and changes nothing for any other operator —
 * not a figure, not a permission, not a routing rule. The presentation section
 * carries a live sample block so the effect of a choice is visible without
 * leaving the page.
 *
 * **Deployment configuration** is a build-time artefact of the Urban
 * Intelligence Core, read from `@/config/municipality.config`. The profile,
 * the feature flags and the tenancy register are properties of the deployment,
 * not of the officer reading them: changing terminology, enabled capabilities
 * or tenancy in a real deployment is a change-controlled, audited release, not
 * a form an operator submits. The page presents them for inspection and says so,
 * rather than offering controls that would not do anything.
 *
 * The page is one continuous document rather than a set of tabs. Settings that
 * are hidden behind a tab are settings an operator does not know exist, and the
 * distinction above is far easier to read when both halves are on the same
 * page in order. Length is paid for with the section navigator, which is sticky
 * from `lg:` upward and states which half of the page each section belongs to.
 */

const DENSITY_OPTIONS: InterfaceDensity[] = ['compact', 'comfortable', 'spacious']
const NUMBER_FORMATS: NumberFormatMode[] = ['indian', 'international']
const DATE_FORMATS: DateFormatMode[] = ['day-month-year', 'numeric', 'iso']
const TIME_FORMATS: TimeFormatMode[] = ['24h', '12h']

/** A sample instant far enough back to exercise both date and age rendering. */
const SAMPLE_INSTANT = isoFromAnchor(-187)

/**
 * The section index, grouped exactly the way the page is grouped. The two
 * group labels are the whole point of the navigator: an operator scanning it
 * should be able to tell, before clicking anything, which settings are theirs
 * and which belong to the deployment.
 */
function build$NAV_GROUPS(): Array<{
  label: string
  sections: Array<{ id: string; label: string; icon: ReactNode }>
}> {
  return [
  {
    label: t('Your preferences'),
    sections: [
      { id: 'preferences', label: t('Interface'), icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
      { id: 'presentation', label: t('Data presentation'), icon: <Hash className="h-3.5 w-3.5" /> },
      { id: 'notifications', label: t('Notifications'), icon: <BellRing className="h-3.5 w-3.5" /> },
    ],
  },
  {
    label: t('Deployment configuration'),
    sections: [
      { id: 'profile', label: t('Deployment profile'), icon: <Compass className="h-3.5 w-3.5" /> },
      { id: 'feature-flags', label: t('Feature flags'), icon: <ToggleLeft className="h-3.5 w-3.5" /> },
      { id: 'tenancy', label: t('Tenancy & portability'), icon: <Layers className="h-3.5 w-3.5" /> },
    ],
  },
]
}
let NAV_GROUPS: Array<{
  label: string
  sections: Array<{ id: string; label: string; icon: ReactNode }>
}> = build$NAV_GROUPS()
registerLayer(() => {
  NAV_GROUPS = build$NAV_GROUPS()
})

/** Document order of the sections — what the scroll observer reports against. */
const SECTION_IDS: string[] = NAV_GROUPS.flatMap((group) => group.sections.map((s) => s.id))

/* --------------------------------------------------------------------------
   Feature flag vocabulary — carried over from the former Feature Flags page.
   -------------------------------------------------------------------------- */

const STAGE_TONE: Record<FeatureFlagStage, 'positive' | 'info' | 'warn' | 'muted'> = {
  ga: 'positive',
  beta: 'info',
  experimental: 'warn',
  planned: 'muted',
}
function build$STAGE_LABEL(): Record<FeatureFlagStage, string> {
  return {
  ga: 'GA',
  beta: t('Beta'),
  experimental: t('Experimental'),
  planned: t('Planned'),
}
}
let STAGE_LABEL: Record<FeatureFlagStage, string> = build$STAGE_LABEL()
registerLayer(() => {
  STAGE_LABEL = build$STAGE_LABEL()
})

function build$CATEGORY_LABEL(): Record<FeatureFlag['category'], string> {
  return {
  ai: t('AI & Automation'),
  intelligence: t('Intelligence'),
  governance: t('Governance'),
  integration: t('Integration'),
  experience: t('Experience'),
}
}
let CATEGORY_LABEL: Record<FeatureFlag['category'], string> = build$CATEGORY_LABEL()
registerLayer(() => {
  CATEGORY_LABEL = build$CATEGORY_LABEL()
})

/**
 * Which section the operator is currently reading.
 *
 * A jump list that never moves tells an operator nothing about where they are
 * on a page this long. The observation band is a thin strip immediately below
 * the sticky command bar — whichever section occupies the line actually being
 * read is the one marked current. Margins are in pixels because
 * `IntersectionObserver` accepts no other unit.
 */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? '')

  useEffect(() => {
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const first = ids.find((id) => visible.has(id))
        if (first) setActive(first)
      },
      { rootMargin: '-80px 0px -70% 0px' },
    )
    for (const id of ids) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [ids])

  return active
}

/**
 * The section navigator. Sticky beside the content from `lg:` upward, where
 * there is a column to spare; a single horizontal row above the content below
 * that, where taking a column would squeeze the settings themselves.
 */
function SectionNav({ active, mutedTypes }: { active: string; mutedTypes: number }): React.JSX.Element {
  return (
    <nav aria-label={t('Settings sections')} className="min-w-0 lg:sticky lg:top-[4.5rem] lg:z-10">
      {/* The height cap sits on the card, not the sticky wrapper, so a short
          viewport scrolls the index rather than clipping the card's shadow. */}
      <Card flush className="scrollbar-slim p-2 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <p className="label-institutional hidden px-1.5 pb-2 lg:block">{t('On this page')}</p>
        <div className="scrollbar-slim flex gap-1 overflow-x-auto lg:flex-col lg:gap-3 lg:overflow-x-visible">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex shrink-0 items-center gap-1 lg:block lg:shrink">
              <p className="label-institutional hidden pb-1 pl-1.5 text-[0.625rem] lg:block">{group.label}</p>
              <ul className="flex items-center gap-1 lg:flex-col lg:items-stretch lg:gap-0.5">
                {group.sections.map((section) => {
                  const current = section.id === active
                  return (
                    <li key={section.id} className="min-w-0">
                      <a
                        href={`#${section.id}`}
                        aria-current={current ? 'location' : undefined}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                          current
                            ? 'bg-govt-50 text-govt-800 ring-1 ring-govt-200/70 ring-inset'
                            : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                        )}
                      >
                        <span className={cn('shrink-0', current ? 'text-govt-600' : 'text-ink-400')}>
                          {section.icon}
                        </span>
                        <span className="min-w-0 truncate">{section.label}</span>
                        {section.id === 'notifications' && mutedTypes > 0 ? (
                          <span
                            className={cn(
                              'numeric ml-auto shrink-0 text-[0.625rem]',
                              current ? 'text-govt-600' : 'text-ink-400',
                            )}
                            title={t('{0} notification types muted', mutedTypes)}
                          >
                            {mutedTypes}
                          </span>
                        ) : null}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </nav>
  )
}

/**
 * One section of the document. The `scroll-mt` clears the sticky command bar
 * (`h-14`) with room to spare, so an anchored jump lands on the heading rather
 * than underneath the bar.
 */
function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-heading`} className="scroll-mt-20 space-y-4 outline-none">
      <SectionHeader eyebrow={eyebrow} title={<span id={`${id}-heading`}>{title}</span>} description={description} />
      {children}
    </section>
  )
}

/** One preference: a titled row with an explanation and its control. */
function PrefRow({
  icon,
  title,
  help,
  children,
}: {
  icon: ReactNode
  title: string
  help: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-govt-50 text-govt-600 ring-1 ring-govt-200/60 ring-inset">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-ink-800">{title}</p>
          <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-500">{help}</p>
        </div>
      </div>
      <div className="shrink-0 sm:pl-4">{children}</div>
    </div>
  )
}

/** Reset control for one preference group, disabled while already at default. */
function GroupReset({ group, label }: { group: PreferenceGroup; label: string }): React.JSX.Element {
  const state = usePreferencesStore()
  const atDefault = isGroupAtDefault(state, group)
  return (
    <Button
      variant="ghost"
      size="xs"
      icon={<RotateCcw className="h-3 w-3" />}
      disabled={atDefault}
      title={atDefault ? 'Already at the shipped default' : `Restore ${label} to the shipped default`}
      onClick={() => state.resetGroup(group)}
    >
      {t('Reset')}
    </Button>
  )
}

/** A single before/after sample line in the presentation preview. */
function SampleRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-100 py-1.5 last:border-b-0">
      <span className="text-[0.6875rem] text-ink-500">{label}</span>
      <span className="numeric text-[0.8125rem] font-semibold text-ink-900">{value}</span>
    </div>
  )
}

function build$ALTERNATE_COLUMNS(): Array<Column<MunicipalityProfile>> {
  return [
  {
    id: 'tenant',
    header: t('Tenant identifier'),
    cell: (p) => <span className="font-mono text-xs text-ink-700">{p.tenantId}</span>,
    sortValue: (p) => p.tenantId,
  },
  {
    id: 'name',
    header: t('Urban local body'),
    cell: (p) => <span className="font-medium text-ink-800">{p.municipalityName}</span>,
    sortValue: (p) => p.municipalityName,
  },
  { id: 'short', header: t('Short name'), cell: (p) => p.shortName, sortValue: (p) => p.shortName },
  { id: 'division', header: t('Revenue division'), cell: (p) => p.division, sortValue: (p) => p.division },
  {
    id: 'population',
    header: t('Population (2011)'),
    cell: (p) => <span className="numeric">{formatNumber(p.population2011)}</span>,
    sortValue: (p) => p.population2011,
    align: 'right',
  },
  {
    id: 'wards',
    header: t('Administrative units'),
    cell: (p) => <span className="numeric">{p.wards}</span>,
    sortValue: (p) => p.wards,
    align: 'right',
  },
  {
    id: 'status',
    header: t('Status'),
    cell: (p) => (
      <Badge tone={p.status === 'active' ? 'positive' : 'neutral'} dot>
        {p.status === 'active' ? 'Active - this deployment' : 'Available'}
      </Badge>
    ),
    sortValue: (p) => p.status,
  },
]
}
let ALTERNATE_COLUMNS: Array<Column<MunicipalityProfile>> = build$ALTERNATE_COLUMNS()
registerLayer(() => {
  ALTERNATE_COLUMNS = build$ALTERNATE_COLUMNS()
})

export function SettingsPage(): React.JSX.Element {
  const user = useCurrentUser()
  const activeSection = useActiveSection(SECTION_IDS)

  const prefs = usePreferencesStore()
  const locale = useLocale()
  const setLocale = useSetLocale()
  const setSidebarCollapsed = useLayoutStore((s) => s.toggleSidebar)
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed)

  // Session-local feature flag overrides. Deliberately not persisted — see the
  // notice at the head of the feature flags section.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  const flags = useMemo(
    () => municipality.featureFlags.map((f) => ({ ...f, enabled: overrides[f.id] ?? f.enabled })),
    [overrides],
  )

  const groupedFlags = useMemo(() => {
    const map = new Map<FeatureFlag['category'], typeof flags>()
    for (const f of flags) {
      const list = map.get(f.category) ?? []
      list.push(f)
      map.set(f.category, list)
    }
    return [...map.entries()]
  }, [flags])

  const flagsEnabled = flags.filter((f) => f.enabled).length
  const flagsPlanned = flags.filter((f) => f.stage === 'planned').length
  const flagsDemoOnly = flags.filter((f) => f.demonstrationOnly).length

  const toggleFlag = (flag: FeatureFlag): void => {
    setOverrides((prev) => ({ ...prev, [flag.id]: !(prev[flag.id] ?? flag.enabled) }))
  }

  // Only offer landing routes the current principal can actually reach.
  const landingOptions = useMemo(() => {
    const opts = [{ value: ROLE_DEFAULT_LANDING, label: t('Role default (recommended)') }]
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        const decision = canAccess(user, item.requires.resource, item.requires.action, item.domain ? { domain: item.domain } : {})
        if (decision.allowed) opts.push({ value: item.to, label: `${section.label} · ${item.label}` })
      }
    }
    return opts
  }, [user])

  /**
   * What the notification filter actually withholds right now. Stating the
   * number is the point: a filter whose effect is invisible reads as an
   * absence of events rather than a choice the operator made.
   */
  const notificationEffect = useMemo(() => {
    if (!user) return { addressed: 0, shown: 0 }
    const addressed = NOTIFICATIONS.filter((n) => n.recipientRoleIds.includes(user.roleId))
    const allowed = severitiesAtOrAbove(prefs.notificationFloor)
    const shown = addressed.filter((n) => allowed.includes(n.severity) && !prefs.mutedNotificationTypes.includes(n.type))
    return { addressed: addressed.length, shown: shown.length }
  }, [user, prefs.notificationFloor, prefs.mutedNotificationTypes])

  /** Applies the sidebar preference to the live layout as well as storing it. */
  function applySidebar(next: SidebarPreference): void {
    prefs.setSidebar(next)
    const shouldCollapse = next === 'collapsed'
    if (shouldCollapse !== sidebarCollapsed) setSidebarCollapsed()
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Administration')}
        title={t('Settings')}
        description={t('Your interface preferences and this deployment\'s municipal configuration, on one page. Preferences are yours to change and take effect immediately; the deployment profile, feature flags and tenancy register below are build-time artefacts of the Urban Intelligence Core, presented for inspection.')}
        breadcrumbs={[{ label: t('Administration') }, { label: t('Settings') }]}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              disabled={
                isGroupAtDefault(prefs, 'interface') &&
                isGroupAtDefault(prefs, 'presentation') &&
                isGroupAtDefault(prefs, 'notifications')
              }
              onClick={() => prefs.reset()}
            >
              {t('Reset all preferences')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Lock className="h-3.5 w-3.5" />}
              disabled
              title={t('Configuration changes require a change-controlled release process in a production deployment. This demonstration environment exposes configuration for inspection only - there is no in-application configuration writer.')}
            >
              {t('Propose configuration change')}
            </Button>
          </>
        }
      />

      {/* The navigator takes its own column from `lg:` upward and never shares
          one with the content, so a sticky rail cannot come to rest over a
          card at any width. `items-start` is what lets it stick: a stretched
          grid item is as tall as its row and has nowhere to travel. */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start">
        <SectionNav active={activeSection} mutedTypes={prefs.mutedNotificationTypes.length} />

        <div className="min-w-0 space-y-6">
          {/* ------------------------------------------------ Interface */}
          <Section
            id="preferences"
            eyebrow={t('Your preferences')}
            title={t('Interface')}
            description={t('How this platform looks and behaves for you. Held in this browser, applied the moment they are set.')}
          >
            <Card>
              <CardHeader
                icon={<SlidersHorizontal className="h-4 w-4" />}
                title={t('Interface preferences')}
                description={t('These apply to this browser immediately and are stored on this device only — they change nothing for other operators.')}
                actions={<GroupReset group="interface" label={t('the interface preferences')} />}
              />
              <div className="mt-4 divide-y divide-ink-100">
                <PrefRow
                  icon={<Languages className="h-4 w-4" />}
                  title={t('Interface language')}
                  help={t('English or Marathi, the official language of Maharashtra. The choice re-renders every screen, figure label and generated finding — including the municipal narrative itself. No figure changes; only the words describing it do.')}
                >
                  <SegmentedControl<Locale>
                    value={locale}
                    onChange={setLocale}
                    ariaLabel={t('Interface language')}
                    options={LOCALES.map((id) => ({ value: id, label: LOCALE_INFO[id].nativeName }))}
                  />
                </PrefRow>
                <PrefRow
                  icon={<Gauge className="h-4 w-4" />}
                  title={t('Display density')}
                  help="Scales the whole interface. Compact fits more on screen; spacious is easier to read from a distance or on a projected display."
                >
                  <SegmentedControl<InterfaceDensity>
                    value={prefs.density}
                    onChange={prefs.setDensity}
                    ariaLabel="Display density"
                    options={DENSITY_OPTIONS.map((d) => ({ value: d, label: DENSITY_LABEL[d] }))}
                  />
                </PrefRow>
                <PrefRow
                  icon={<Contrast className="h-4 w-4" />}
                  title={t('Contrast')}
                  help="High contrast deepens secondary text and turns hairline rules into visible lines. Semantic colours keep their meaning — only their weight changes."
                >
                  <SegmentedControl<ContrastPreference>
                    value={prefs.contrast}
                    onChange={prefs.setContrast}
                    ariaLabel="Contrast preference"
                    options={[
                      { value: 'standard', label: t('Standard') },
                      { value: 'high', label: t('High') },
                    ]}
                  />
                </PrefRow>
                <PrefRow
                  icon={<Zap className="h-4 w-4" />}
                  title={t('Motion')}
                  help="Reduce animations and transitions across the platform. Also honoured automatically if your system requests reduced motion."
                >
                  <SegmentedControl<MotionPreference>
                    value={prefs.motion}
                    onChange={prefs.setMotion}
                    ariaLabel="Motion preference"
                    options={[
                      { value: 'full', label: t('Full') },
                      { value: 'reduced', label: t('Reduced') },
                    ]}
                  />
                </PrefRow>
                <PrefRow
                  icon={<PanelLeft className="h-4 w-4" />}
                  title={t('Navigation rail')}
                  help="Whether the command rail starts expanded or collapsed to icons. Applied to this window straight away."
                >
                  <SegmentedControl<SidebarPreference>
                    value={prefs.sidebar}
                    onChange={applySidebar}
                    ariaLabel="Navigation rail preference"
                    options={[
                      { value: 'expanded', label: t('Expanded') },
                      { value: 'collapsed', label: t('Collapsed') },
                    ]}
                  />
                </PrefRow>
                <PrefRow
                  icon={<MapPin className="h-4 w-4" />}
                  title={t('Default landing page')}
                  help="Where you arrive after signing in. Only pages your role can reach are offered; sign out and back in to see it take effect."
                >
                  <Select
                    aria-label={t('Default landing page')}
                    className="w-full sm:w-72"
                    value={prefs.defaultLanding}
                    onChange={(e) => prefs.setDefaultLanding(e.target.value)}
                    options={landingOptions}
                  />
                </PrefRow>
              </div>
            </Card>

            <Card tone="info">
              <p className="text-[0.8125rem] leading-relaxed text-ink-700">
                {t('These are personal interface preferences, not deployment configuration. They are held in this browser and never leave it — there is no preferences service and nothing is written to any operator&apos;s record. No preference in this half of the page can change a figure, widen a permission or alter who the platform holds accountable for an item; a setting that could do any of those belongs to the deployment, under change control, and is shown further down under')}{' '}
                <a href="#profile" className="font-medium text-govt-700 underline-offset-2 hover:underline">
                  {t('Deployment profile')}
                </a>
                .
              </p>
            </Card>
          </Section>

          {/* ---------------------------------------- Data presentation */}
          <Section
            id="presentation"
            eyebrow={t('Your preferences')}
            title={t('Data presentation')}
            description={t('The dialect every figure in the platform is spoken in. Presentation only — no value, derivation or seed moves with these.')}
          >
            {/* The sample rail only comes alongside once the content column is
                genuinely wide enough for both. With the navigator holding a
                column of its own, that is 2xl and not before — a preference row
                squeezed until its explanation is one word per line explains
                nothing. */}
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem]">
              <Card>
                <CardHeader
                  icon={<Hash className="h-4 w-4" />}
                  title={t('Numbering, dates and tables')}
                  description={t('How every figure in the platform is spoken. These change presentation only — no underlying value, derivation or seed moves.')}
                  actions={<GroupReset group="presentation" label={t('the presentation preferences')} />}
                />
                <div className="mt-4 divide-y divide-ink-100">
                  <PrefRow
                    icon={<Hash className="h-4 w-4" />}
                    title={t('Number format')}
                    help="Digit grouping and the compact scale. Indian gives 3.1L and 1.2Cr; international gives 310K and 12M."
                  >
                    <Select
                      aria-label={t('Number format')}
                      className="w-full sm:w-64"
                      value={prefs.numberFormat}
                      onChange={(e) => prefs.setNumberFormat(e.target.value as NumberFormatMode)}
                      options={NUMBER_FORMATS.map((m) => ({ value: m, label: NUMBER_FORMAT_LABEL[m] }))}
                    />
                  </PrefRow>
                  <PrefRow
                    icon={<CalendarDays className="h-4 w-4" />}
                    title={t('Date format')}
                    help="Applied to every date the platform renders, including exports taken from any register."
                  >
                    <Select
                      aria-label={t('Date format')}
                      className="w-full sm:w-52"
                      value={prefs.dateFormat}
                      onChange={(e) => prefs.setDateFormat(e.target.value as DateFormatMode)}
                      options={DATE_FORMATS.map((f) => ({ value: f, label: DATE_FORMAT_LABEL[f] }))}
                    />
                  </PrefRow>
                  <PrefRow
                    icon={<Clock className="h-4 w-4" />}
                    title={t('Time format')}
                    help="All times are Indian Standard Time; this governs only whether the clock is read on 24 or 12 hours."
                  >
                    <Select
                      aria-label={t('Time format')}
                      className="w-full sm:w-52"
                      value={prefs.timeFormat}
                      onChange={(e) => prefs.setTimeFormat(e.target.value as TimeFormatMode)}
                      options={TIME_FORMATS.map((f) => ({ value: f, label: TIME_FORMAT_LABEL[f] }))}
                    />
                  </PrefRow>
                  <PrefRow
                    icon={<Timer className="h-4 w-4" />}
                    title={t('Relative timestamps')}
                    help='Show ages as "3 h ago". Turn this off to read the instant itself — easier to reconcile a record against a source system months later.'
                  >
                    <Switch
                      checked={prefs.relativeTimestamps}
                      onChange={prefs.setRelativeTimestamps}
                      label={t('Relative timestamps')}
                    />
                  </PrefRow>
                  <PrefRow
                    icon={<Rows3 className="h-4 w-4" />}
                    title={t('Rows per table')}
                    help="Applies to every paginated register in the platform, from the intelligence feed to the audit trail."
                  >
                    <SegmentedControl<string>
                      value={String(prefs.tablePageSize)}
                      onChange={(v) => prefs.setTablePageSize(Number(v) as TablePageSize)}
                      ariaLabel="Rows per table"
                      options={TABLE_PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
                    />
                  </PrefRow>
                </div>
              </Card>

              <Card tone="sunken">
                <CardHeader
                  title={t('Live sample')}
                  description={t('The same underlying values, rendered with the choices above.')}
                />
                <div className="mt-3">
                  <SampleRow label={t('Property assessments')} value={formatNumber(1_84_23_940)} />
                  <SampleRow label={t('Compact form')} value={formatCompact(1_84_23_940)} />
                  <SampleRow label={t('Records ingested')} value={formatCompact(942_130)} />
                  <SampleRow label={t('Revised budget')} value={formatCrore(35_959.4)} />
                  <SampleRow label={t('Date')} value={formatDate(SAMPLE_INSTANT)} />
                  <SampleRow label={t('Date and time')} value={formatDateTime(SAMPLE_INSTANT)} />
                  <SampleRow label={t('Age of that record')} value={formatRelative(SAMPLE_INSTANT)} />
                </div>
                <p className="mt-3 border-t border-ink-100 pt-2.5 text-[0.625rem] leading-relaxed text-ink-500">
                  {t('Monetary figures are held in INR crore throughout the platform. That unit is institutional and does not change with this preference — only its digit grouping does.')}
                </p>
              </Card>
            </div>

            <Card tone="info">
              <p className="text-[0.8125rem] leading-relaxed text-ink-700">
                {t('Formatting is presentation, never derivation. Changing the numbering convention re-renders a figure in a different dialect; it does not recompute it, round it differently or alter what any service returned. Exports taken after a change carry the same values in the same convention you are reading on screen, so a file and the screen it came from can always be reconciled.')}
              </p>
            </Card>
          </Section>

          {/* ------------------------------------------- Notifications */}
          <Section
            id="notifications"
            eyebrow={t('Your preferences')}
            title={t('Notifications')}
            description={t('A personal view filter over items already routed to your role. It never changes routing, escalation or accountability.')}
          >
            <MetricGrid columns={3}>
              <Card>
                <p className="label-institutional">{t('Addressed to your role')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{notificationEffect.addressed}</p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Routed by institutional accountability')}</p>
              </Card>
              <Card tone={notificationEffect.shown < notificationEffect.addressed ? 'warn' : 'default'}>
                <p className="label-institutional">{t('Shown after your filter')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{notificationEffect.shown}</p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-500">
                  {t('{0} withheld by this preference', notificationEffect.addressed - notificationEffect.shown)}
                </p>
              </Card>
              <Card tone="info">
                <p className="label-institutional">{t('Muted types')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">
                  {prefs.mutedNotificationTypes.length}
                  <span className="text-base text-ink-400">/{NOTIFICATION_TYPES.length}</span>
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Reversible at any time')}</p>
              </Card>
            </MetricGrid>

            <Card>
              <CardHeader
                icon={<BellRing className="h-4 w-4" />}
                title={t('What reaches your notification centre')}
                description={t('A personal view filter over notifications already routed to your role. It never changes routing, escalation or who the platform holds accountable.')}
                actions={<GroupReset group="notifications" label={t('the notification preferences')} />}
              />
              <div className="mt-4 divide-y divide-ink-100">
                <PrefRow
                  icon={<BellRing className="h-4 w-4" />}
                  title={t('Severity floor')}
                  help="The lowest severity surfaced in the notification centre. Anything below it is counted and named in the drawer, never silently dropped."
                >
                  <Select
                    aria-label={t('Notification severity floor')}
                    className="w-full sm:w-60"
                    value={prefs.notificationFloor}
                    onChange={(e) => prefs.setNotificationFloor(e.target.value as Severity)}
                    options={SEVERITY_ORDER.map((s) => ({ value: s, label: SEVERITY_FLOOR_LABEL[s] }))}
                  />
                </PrefRow>
              </div>

              <div className="mt-4 border-t border-ink-100 pt-3">
                <p className="text-[0.8125rem] font-semibold text-ink-800">{t('Notification types')}</p>
                <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-500">
                  {t('Untick a type to stop it appearing in your notification centre. The item still exists, is still routed to your role and still appears in its own module — this only governs the drawer.')}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {NOTIFICATION_TYPES.map((type) => (
                    <div key={type} className="rounded-md border border-ink-100 bg-surface-sunken px-3 py-2">
                      <Checkbox
                        checked={!prefs.mutedNotificationTypes.includes(type)}
                        onChange={() => prefs.toggleNotificationType(type)}
                        label={NOTIFICATION_TYPE_LABEL[type]}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card tone="warn">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warn-700" />
                <p className="text-[0.8125rem] leading-relaxed text-ink-700">
                  {t('Muting a notification type does not mute the obligation behind it. Escalation timers, SLA clocks and decision deadlines run on the institutional record, not on whether an officer chose to see a drawer entry — a muted critical alert is still a critical alert, still assigned, still counted in the alert register and still escalated on schedule.')}
                </p>
              </div>
            </Card>
          </Section>

          {/* --------------------------------------- Deployment profile */}
          <Section
            id="profile"
            eyebrow={t('Deployment configuration')}
            title={t('Deployment profile')}
            description={t('Who this deployment serves and in whose vocabulary. A build-time artefact of the Urban Intelligence Core, shown read-only.')}
          >
            {/* Two across until 2xl: a corporation name or a state name set in
                the metric face needs roughly 14rem of card to sit on one line,
                and four columns of this content column do not give it. */}
            <MetricGrid columns={2} className="2xl:grid-cols-4">
              <Card>
                <p className="label-institutional">{t('Urban local body')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{municipality.shortName}</p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-500">{municipality.municipalityName}</p>
              </Card>
              <Card>
                <p className="label-institutional">{t('State')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{municipality.state}</p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-500">{municipality.country}</p>
              </Card>
              <Card>
                <p className="label-institutional">{t('Financial year')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{municipality.financialYear}</p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Currency unit: {0}', municipality.currencyUnitLabel)}</p>
              </Card>
              <Card tone="info">
                <p className="label-institutional">{t('Environment')}</p>
                <p className="mt-2 text-sm font-semibold text-govt-800">{municipality.environmentLabel}</p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Not connected to any live {0} system.', municipality.shortName)}</p>
              </Card>
            </MetricGrid>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader
                  icon={<Building2 className="h-4 w-4" />}
                  title={t('Municipality profile')}
                  description={t('Identity and branding configuration for this deployment.')}
                />
                <DefinitionList className="mt-3">
                  <DefinitionRow label={t('Tenant identifier')} mono>
                    {municipality.tenantId}
                  </DefinitionRow>
                  <DefinitionRow label={t('Municipality name')}>{municipality.municipalityName}</DefinitionRow>
                  <DefinitionRow label={t('Short name')}>{municipality.shortName}</DefinitionRow>
                  <DefinitionRow label={t('State / country')}>
                    {municipality.state}, {municipality.country}
                  </DefinitionRow>
                  <DefinitionRow label={t('Product family')}>{municipality.branding.productFamily}</DefinitionRow>
                  <DefinitionRow label={t('Product name')}>{municipality.branding.productName}</DefinitionRow>
                  <DefinitionRow label={t('Product subtitle')}>{municipality.branding.productSubtitle}</DefinitionRow>
                  <DefinitionRow label={t('Deployment line')}>{municipality.branding.deploymentLine}</DefinitionRow>
                  <DefinitionRow label={t('Institutional accent')}>
                    <Badge tone={municipality.branding.accent === 'govt' ? 'info' : 'intel'} uppercase>
                      {municipality.branding.accent}
                    </Badge>
                  </DefinitionRow>
                </DefinitionList>
              </Card>

              <Card>
                <CardHeader
                  icon={<Globe2 className="h-4 w-4" />}
                  title={t('Administrative terminology')}
                  description={t('The same core renders different institutional vocabulary per deployment.')}
                />
                <DefinitionList className="mt-3">
                  <DefinitionRow label={t('Primary unit')}>
                    {municipality.terminology.primaryUnitSingular} / {municipality.terminology.primaryUnitPlural}
                  </DefinitionRow>
                  <DefinitionRow label={t('Secondary unit')}>
                    {municipality.terminology.secondaryUnitSingular} / {municipality.terminology.secondaryUnitPlural}
                  </DefinitionRow>
                  <DefinitionRow label={t('Executive title')}>{municipality.terminology.executiveTitle}</DefinitionRow>
                  <DefinitionRow label={t('Field officer title')}>{municipality.terminology.fieldOfficerTitle}</DefinitionRow>
                </DefinitionList>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-ink-100 pt-3">
                  <div>
                    <p className="label-institutional">{municipality.terminology.secondaryUnitPlural}</p>
                    <p className="numeric mt-1 text-lg font-semibold text-ink-900">
                      {municipality.administrativeUnits.zones}
                    </p>
                  </div>
                  <div>
                    <p className="label-institutional">{municipality.terminology.primaryUnitPlural}</p>
                    <p className="numeric mt-1 text-lg font-semibold text-ink-900">
                      {municipality.administrativeUnits.wards}
                    </p>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader
                  icon={<MapPinned className="h-4 w-4" />}
                  title={t('Map configuration')}
                  description={t('Spatial rendering configuration. Geometry is illustrative, not surveyed GIS.')}
                />
                <DefinitionList className="mt-3">
                  <DefinitionRow label={t('View box')}>
                    {municipality.mapConfiguration.viewBoxWidth} × {municipality.mapConfiguration.viewBoxHeight}
                  </DefinitionRow>
                  <DefinitionRow label={t('Reference centre')}>
                    {municipality.mapConfiguration.centre.lat.toFixed(4)}, {municipality.mapConfiguration.centre.lng.toFixed(4)}
                  </DefinitionRow>
                </DefinitionList>
                <p className="mt-2.5 rounded-md bg-warn-50/70 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-warn-700">
                  {municipality.mapConfiguration.provenanceStatement}
                </p>
              </Card>

              <Card>
                <CardHeader
                  icon={<Layers className="h-4 w-4" />}
                  title={t('Enabled modules')}
                  description={t('{0} intelligence domains enabled for this deployment.', municipality.enabledModules.length)}
                />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {municipality.enabledModules.map((domain) => (
                    <Badge key={domain} tone="muted">
                      {DOMAIN_LABEL[domain]}
                    </Badge>
                  ))}
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader
                icon={<Compass className="h-4 w-4" />}
                title={t('Platform hierarchy')}
                description={t('Where this deployment sits within the broader Urban Intelligence Core hierarchy.')}
              />
              <ol className="mt-3 space-y-0">
                {PLATFORM_HIERARCHY.map((level, i, arr) => (
                  <li key={level.id} className="relative flex items-start gap-3 pb-3 last:pb-0">
                    {i < arr.length - 1 ? (
                      <span className="absolute top-5 bottom-0 left-[9px] w-px bg-ink-100" aria-hidden />
                    ) : null}
                    <span
                      className={`z-10 mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 bg-surface text-[0.5625rem] font-semibold ${
                        level.scope === 'This Deployment'
                          ? 'border-govt-600 text-govt-700'
                          : level.scope === 'Active'
                            ? 'border-intel-500 text-intel-700'
                            : 'border-ink-300 text-ink-400'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.8125rem] font-medium text-ink-800">{level.label}</p>
                    </div>
                    <Badge
                      tone={level.scope === 'This Deployment' ? 'info' : level.scope === 'Active' ? 'intel' : 'muted'}
                    >
                      {level.scope}
                    </Badge>
                  </li>
                ))}
              </ol>
            </Card>
          </Section>

          {/* ------------------------------------------- Feature flags */}
          <Section
            id="feature-flags"
            eyebrow={t('Deployment configuration')}
            title={t('Feature flags')}
            description={t('The platform capabilities that can be enabled or disabled for this deployment, held in the municipality configuration so the same core can present a different surface for each corporation. A property of the deployment, not of you — nothing here is a personal preference.')}
          >
            <Card tone="sunken">
              <div className="flex items-start gap-2.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
                <p className="text-[0.6875rem] leading-relaxed text-ink-600">
                  {t('Toggling a flag here changes only your current session and is not saved. In a production deployment a feature-flag change is a governed configuration action, recorded in the audit trail against the officer who made it — never an unlogged switch. This screen demonstrates the surface, not that persistence.')}
                </p>
              </div>
            </Card>

            <MetricGrid columns={3}>
              <MetricCard
                label={t('Flags enabled')}
                value={flagsEnabled}
                support={t('of {0} defined', flags.length)}
                icon={<ToggleLeft className="h-4 w-4" />}
              />
              <MetricCard label={t('Planned capabilities')} value={flagsPlanned} support={t('Not yet available in this build')} />
              <MetricCard
                label={t('Demonstration only')}
                value={flagsDemoOnly}
                support={t('Require production work to be real')}
                icon={<FlaskConical className="h-4 w-4" />}
              />
            </MetricGrid>

            {groupedFlags.map(([category, categoryFlags]) => (
              <Card key={category} flush>
                <CardHeader
                  className="px-4 pt-4"
                  title={CATEGORY_LABEL[category]}
                  description={t('{0} of {1} enabled', categoryFlags.filter((f) => f.enabled).length, categoryFlags.length)}
                />
                <ul className="divide-y divide-ink-50">
                  {categoryFlags.map((flag) => (
                    <li key={flag.id} className="flex items-start justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[0.8125rem] font-semibold text-ink-900">{flag.label}</p>
                          <Badge tone={STAGE_TONE[flag.stage]} size="sm">
                            {STAGE_LABEL[flag.stage]}
                          </Badge>
                          {flag.demonstrationOnly ? (
                            <Badge tone="muted" size="sm">
                              {t('Demonstration only')}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">{flag.description}</p>
                      </div>
                      {/* A planned capability has nothing behind it to switch
                          on, so its control is inert and says why rather than
                          pretending the build could honour it. */}
                      <Switch
                        checked={flag.enabled}
                        onChange={() => toggleFlag(flag)}
                        disabled={flag.stage === 'planned'}
                        label={
                          flag.stage === 'planned'
                            ? `${flag.label} - planned, not available in this build`
                            : `${flag.enabled ? 'Disable' : 'Enable'} ${flag.label}`
                        }
                        className="mt-0.5"
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </Section>

          {/* ------------------------------------ Tenancy & portability */}
          <Section
            id="tenancy"
            eyebrow={t('Deployment configuration')}
            title={t('Tenancy & portability')}
            description={t('How one municipal body\'s data is kept apart from every other, and which bodies this same build can be deployed against.')}
          >
            <Card tone="info">
              <CardHeader
                icon={<ShieldCheck className="h-4 w-4" />}
                title={t('Tenant isolation')}
                description={t('How this deployment keeps one municipal body\'s data separate from every other.')}
              />
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-700">
                {t('Every record produced anywhere in the platform - every ward, department, intelligence item, decision case, evidence record and audit event - carries a')}{' '}<span className="font-mono">tenantId</span>{' '}{t('field set to')}{' '}<span className="font-mono">{municipality.tenantId}</span>{' '}{t('for this deployment. Every service method in the data-access layer accepts the acting principal first and filters its source collection to that principal&apos;s own tenant before any further permission or scope check is applied. In this single-tenant demonstration build the filter is a deliberate no-op - there is only one tenant to filter to - but the enforcement point exists exactly where it would sit in a genuine multi-tenant deployment, so a second municipal body&apos;s data would be excluded at the same choke point, not left to individual screens to remember.')}
              </p>
            </Card>

            <Card>
              <CardHeader
                title={t('Municipal corporation deployments')}
                description={t('Every municipal corporation in Maharashtra this build can be deployed against. Switch the active corporation from the deployment selector in the command bar.')}
              />
              {/* Paginated deliberately. Twenty-nine rows is long enough to
                  warrant it, and this is the one table on the same page as the
                  "Rows per table" preference - leaving it unpaginated meant an
                  operator could set that preference and watch the table
                  immediately below it do nothing. */}
              <DataTable
                rows={municipalityProfiles()}
                columns={ALTERNATE_COLUMNS}
                rowKey={(p) => p.tenantId}
                searchable
                searchPlaceholder="Search urban local bodies"
                initialSort={{ columnId: 'status', direction: 'desc' }}
                pageSize={15}
                emptyTitle={t('No profiles configured')}
              />
              <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-500">
                {t('This build is configured for the Brihanmumbai Municipal Corporation and is served against its own published reference data. The deployment profile derives a')}{' '}<span className="font-mono">{t('MunicipalityConfig')}</span>{' '}{t('- its own terminology, administrative units, branding and published reference statistics - and rebuilds every intelligence layer beneath it, without any change to the intelligence, security or workflow engines themselves. Reference statistics carried against each corporation are published figures from the corporation\'s own sources; the operational figures generated on top of them are modelled demonstration data. Provisioning any of these for a real deployment would additionally require its own institutional governance, data-sharing agreements and security review; nothing here implies those are in place.')}
              </p>
            </Card>
          </Section>
        </div>
      </div>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default SettingsPage
