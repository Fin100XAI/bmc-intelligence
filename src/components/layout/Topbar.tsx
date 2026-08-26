import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  UserCog,
} from 'lucide-react'
import { municipality } from '@/config/municipality.config'
import { ROUTES } from '@/config/navigation'
import { getRole } from '@/security/roles'
import { describeScope } from '@/security/access'
import { WARDS, wardName } from '@/data/reference'
import { useAuthStore, useCurrentUser } from '@/stores/auth.store'
import { useCommandStore, useContextStore, useLayoutStore } from '@/stores/ui.store'
import { useBreadcrumbStore } from '@/stores/breadcrumb.store'
import { formatRelative } from '@/utils/format'
import { DEMO_NOW } from '@/utils/deterministic'
import { cn } from '@/utils/cn'
import { Badge } from '@/components/ui/badges'
import { Button, IconButton } from '@/components/ui/primitives'
import { Tooltip } from '@/components/ui/overlays'
import { useActiveCorporation } from '@/stores/corporation.store'
import { cityName } from '@/config/corporations'
import { LanguageSwitcher } from './LanguageSwitcher'
import { FontSizeControl } from './FontSizeControl'
import { t } from '@/i18n'

export interface TopbarStatus {
  operationalState: 'operational' | 'degraded' | 'at-risk' | 'critical'
  criticalAlerts: number
  unreadNotifications: number
  activeIncidents: number
  pendingDecisions: number
  lastRefreshedAt: string
}

export function Topbar({ status }: { status: TopbarStatus }): React.JSX.Element {
  const corporation = useActiveCorporation()
  const user = useCurrentUser()
  const signOut = useAuthStore((s) => s.signOut)
  const setSidebarOpen = useLayoutStore((s) => s.setSidebarOpen)
  const setPaletteOpen = useCommandStore((s) => s.setPaletteOpen)
  const setNotificationsOpen = useCommandStore((s) => s.setNotificationsOpen)
  const notificationsOpen = useCommandStore((s) => s.notificationsOpen)
  const [profileOpen, setProfileOpen] = useState(false)
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform))
  }, [])

  const role = user ? getRole(user.roleId) : null
  const authorisedWards = user
    ? user.scope.wardIds === '*'
      ? WARDS
      : WARDS.filter((w) => (user.scope.wardIds as string[]).includes(w.id))
    : []

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-ink-100 bg-surface/85 px-3 shadow-[0_1px_0_0_rgb(11_18_32/0.04)] backdrop-blur-md sm:px-4">
      <IconButton label={t('Open navigation')} className="lg:hidden" onClick={() => setSidebarOpen(true)}>
        <Menu className="h-4 w-4" />
      </IconButton>

      {/* No brand block here: `AppMasthead` sits directly above this bar and
          carries the seal, the office and the corporation. Repeating them a
          row apart would read as a duplication rather than as identity. */}

      {/* Global search / command palette trigger --------------------- */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="group flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-ink-200 bg-surface-sunken px-3 text-left shadow-xs transition-all hover:border-govt-300 hover:bg-surface hover:shadow-sm sm:max-w-md"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-400">
          {t('Search wards, projects, decisions, evidence…')}
        </span>
        <kbd className="hidden shrink-0 rounded border border-ink-200 bg-surface px-1 py-px font-mono text-[0.625rem] text-ink-400 sm:inline">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>

      <div className="flex-1" />

      {/* Copilot shortcut --------------------------------------------- */}
      <Tooltip side="bottom" content={t('Open the {0} Municipal Copilot', corporation.shortName)}>
        <Link
          to={ROUTES.copilot}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-intel-200 bg-gradient-to-b from-intel-50 to-intel-100/70 px-2.5 text-xs font-semibold text-intel-700 shadow-xs transition-all hover:border-intel-300 hover:shadow-sm"
          aria-label={t('Open Copilot')}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('Copilot')}</span>
        </Link>
      </Tooltip>

      {/* The corporation selector used to sit here. This build is a single
          Brihanmumbai deployment, so a control offering to re-deploy the
          interface against another corporation offered a choice that is not
          on the table - and it read as a live capability while listing
          nothing. `CorporationSelector` is still in the tree, unreferenced,
          for the multi-tenant build that needs it.

          The live clock that used to sit here moved to `AppMasthead`, at the
          opposite end of the band from the brand - see the note there. */}

      {/* A single-ward officer's own ward, stated rather than chosen - this
          is identity, not a filter, so it has no interactive control. Every
          page's own Ward filter (see `FilterBar`) is the one place scope is
          actually narrowed now, rather than duplicating that control here. */}
      {authorisedWards.length === 1 ? (
        <Badge tone="info" size="sm" className="hidden md:inline-flex">
          {wardName(authorisedWards[0]!.id)}
        </Badge>
      ) : null}

      {/* Situation Room shortcut -------------------------------------- */}
      <Tooltip side="bottom" content={t('Open the Situation Room')}>
        <Link
          to={ROUTES.situationRoom}
          className="relative hidden h-8 w-8 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-800 sm:inline-flex"
          aria-label={t('Situation Room')}
        >
          <Radar className="h-4 w-4" />
          {status.activeIncidents > 0 ? (
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-crit-500" aria-hidden />
          ) : null}
        </Link>
      </Tooltip>

      {/* Text size ------------------------------------------------------ */}
      <FontSizeControl />

      {/* Interface language -------------------------------------------- */}
      <LanguageSwitcher />

      {/* Notifications ------------------------------------------------- */}
      <IconButton
        label={t('Notifications')}
        onClick={() => setNotificationsOpen(!notificationsOpen)}
        className="relative"
      >
        <Bell className="h-4 w-4" />
        {status.unreadNotifications > 0 ? (
          <span className="numeric absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-crit-500 px-0.5 text-[0.5625rem] font-semibold text-white">
            {status.unreadNotifications > 9 ? '9+' : status.unreadNotifications}
          </span>
        ) : null}
      </IconButton>

      {/* Profile ------------------------------------------------------- */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setProfileOpen((v) => !v)}
          aria-expanded={profileOpen}
          className="flex h-8 items-center gap-2 rounded-md pr-1.5 pl-1 transition-colors hover:bg-ink-50"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-govt-500 to-govt-700 text-[0.625rem] font-bold text-white shadow-sm ring-2 ring-white">
            {user?.avatarInitials ?? '-'}
          </span>
          {/* Position only - the office holds the authority, not the officer. */}
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-[9rem] truncate text-[0.6875rem] leading-tight font-medium text-ink-800">
              {user?.designation ?? 'Not signed in'}
            </span>
            <span className="block max-w-[9rem] truncate text-[0.625rem] leading-tight text-ink-400">
              {role?.name ?? ''}
            </span>
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-ink-400" aria-hidden />
        </button>

        {profileOpen ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} aria-hidden />
            <div className="animate-in-scale absolute top-full right-0 z-50 mt-1.5 w-72 rounded-lg border border-ink-100 bg-surface p-1.5 shadow-overlay">
              <div className="border-b border-ink-100 px-2.5 py-2">
                <p className="text-[0.8125rem] font-semibold text-ink-900">{user?.designation}</p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-500">{role?.name}</p>
                <div className="mt-2 space-y-1 text-[0.6875rem] text-ink-400">
                  <p>
                    <span className="text-ink-500">{t('Scope:')}</span> {describeScope(user, wardName)}
                  </p>
                  <p>
                    <span className="text-ink-500">{t('Classification ceiling:')}</span> {role?.maxClassification ?? '-'}
                  </p>
                  <p>
                    <span className="text-ink-500">{t('Session started:')}</span> {formatRelative(DEMO_NOW.toISOString())}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge tone={user?.mfaEnrolled ? 'positive' : 'warn'} icon={<ShieldCheck className="h-3 w-3" />}>
                    {user?.mfaEnrolled ? 'MFA enrolled' : 'MFA not enrolled'}
                  </Badge>
                  <Badge tone="muted">{municipality.shortName}</Badge>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false)
                  setPaletteOpen(true)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-ink-600 transition-colors hover:bg-ink-50"
              >
                <UserCog className="h-3.5 w-3.5 text-ink-400" />
                {t('Change demonstration role')}
              </button>

              <Link
                to={ROUTES.accessGovernance}
                onClick={() => setProfileOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-ink-600 transition-colors hover:bg-ink-50"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-ink-400" />
                {t('My access and permissions')}
              </Link>

              <div className="my-1 h-px bg-ink-100" />

              <Button
                variant="ghost"
                block
                size="sm"
                className="justify-start text-crit-600 hover:bg-crit-50"
                icon={<LogOut className="h-3.5 w-3.5" />}
                onClick={() => {
                  // A hard navigation, not `useNavigate()`: clearing the
                  // session and routing away in the same tick races
                  // `RequireAuth`, which re-renders the instant the session
                  // goes and - being still mounted on this guarded route -
                  // fires its own `<Navigate to="/login">` after this handler
                  // returns, overriding the client-side navigation requested
                  // here no matter which of the two calls comes first or how
                  // long the other is deferred. A full page load bypasses
                  // that race entirely: the guard runs once, against
                  // `/portal` and a session already cleared in storage,
                  // reaching the exact same result the two of them were
                  // fighting over - and as a side effect resets every other
                  // piece of in-memory state (React Query cache, session
                  // store) that ending a session should reset anyway.
                  setProfileOpen(false)
                  signOut()
                  window.location.assign(ROUTES.portal)
                }}
              >
                {t('Sign out')}
              </Button>

              <p className="mt-1 px-2.5 py-1.5 text-[0.625rem] leading-relaxed text-ink-400">
                {t('{0}. No credential material of any kind is held by this application.', municipality.environmentLabel)}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </header>
  )
}

/** Secondary context bar showing the platform hierarchy and active scope. */
export function ContextBar({ children, className }: { children?: React.ReactNode; className?: string }): React.JSX.Element {
  const corporation = useActiveCorporation()
  const user = useCurrentUser()
  const wardId = useContextStore((s) => s.wardId)
  const role = user ? getRole(user.roleId) : null
  const trail = useBreadcrumbStore((s) => s.trail)

  return (
    <div
      className={cn(
        'flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-ink-100 bg-gradient-to-r from-surface-sunken via-surface to-surface-sunken px-3 sm:px-4',
        'scrollbar-slim',
        className,
      )}
    >
      <span className="label-institutional shrink-0">{t('Context')}</span>
      <span className="h-3 w-px shrink-0 bg-ink-200" aria-hidden />
      <Badge tone="muted" size="sm">
        {municipality.branding.productFamily}
      </Badge>
      <span className="shrink-0 text-ink-300">›</span>
      <Badge tone="info" size="sm">
        {t('BMC Intelligence')}
      </Badge>
      <span className="hidden shrink-0 text-[0.625rem] text-ink-400 lg:inline">{cityName(corporation)}</span>
      {/* The page's own trail (section, screen) - reported by `PageHeader` via
          `useBreadcrumbStore` rather than drawn a second time on the page
          itself, so the platform states its location once, the way the
          reference intelligence platforms in this programme do it. */}
      {trail.map((crumb, i) => {
        const isLast = i === trail.length - 1
        const badge = (
          <Badge tone={isLast ? 'warn' : 'muted'} size="sm">
            {crumb.label}
          </Badge>
        )
        return (
          <span key={`${crumb.label}-${i}`} className="inline-flex shrink-0 items-center gap-2">
            <span className="text-ink-300">›</span>
            {crumb.to ? (
              <Link to={crumb.to} className="transition-opacity hover:opacity-80">
                {badge}
              </Link>
            ) : (
              badge
            )}
          </span>
        )
      })}
      {wardId ? (
        <>
          <span className="shrink-0 text-ink-300">›</span>
          <Badge tone="intel" size="sm">
            {wardName(wardId)}
          </Badge>
        </>
      ) : null}
      <div className="flex-1" />
      {role ? (
        <Badge tone="neutral" size="sm">
          {t('Acting as {0}', role.name)}
        </Badge>
      ) : null}
      {children}
    </div>
  )
}
