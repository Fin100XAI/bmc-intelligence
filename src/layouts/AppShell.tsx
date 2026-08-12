import { Suspense, useMemo } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { municipality } from '@/config/municipality.config'
import { ALERTS, INTELLIGENCE_ITEMS } from '@/data/intelligence.data'
import { DECISION_CASES, activeIncidents } from '@/data/operations.data'
import { SECURITY_EVENTS } from '@/data/governance.data'
import { HUMAN_OVERSIGHT } from '@/data/ai.data'
import { canAccess } from '@/security/access'
import { useCurrentUser } from '@/stores/auth.store'
import { useLayoutStore } from '@/stores/ui.store'
import { useApplyPreferences } from '@/stores/preferences.store'
import { useApplyLocale } from '@/stores/locale.store'
import { DEMO_NOW } from '@/utils/deterministic'
import { useActiveVersion } from '@/data/runtime'
import { cn } from '@/utils/cn'
import { Sidebar, type SidebarBadges } from '@/components/layout/Sidebar'
import { ContextBar, Topbar, type TopbarStatus } from '@/components/layout/Topbar'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { NotificationCentre, useUnreadNotificationCount } from '@/components/layout/NotificationCentre'
import { DrawerHost } from '@/components/drawers/DrawerHost'
import { LoadingState } from '@/components/ui/states'

/**
 * Application shell.
 *
 * Holds the sidebar, top bar, context bar, command palette, notification
 * centre and the global drawer host. The Situation Room reduces the shell so
 * the operational workspace is maximised.
 */
export function AppShell(): React.JSX.Element {
  const user = useCurrentUser()
  const location = useLocation()
  const situationMode = useLayoutStore((s) => s.situationMode)
  const unread = useUnreadNotificationCount()

  // Bumped once per municipal corporation switch, after every data layer has
  // rebuilt. The whole shell reads it so the branding, footer and badges move
  // with the deployment, and the routed subtree is keyed by it so each page
  // remounts against the new corporation rather than re-rendering against a
  // half-replaced dataset.
  const corporationVersion = useActiveVersion()

  // Interface preferences take physical effect here — density, motion,
  // contrast and the numbering/date dialect every formatter reads.
  const formatSignature = useApplyPreferences()

  // The interface language. Stamps <html lang> and, because `t()` reads module
  // state at call time rather than through a context, keys the shell so a
  // switch re-renders every word on screen at once. The data layers have
  // already been rebuilt in the new language by the store before this runs.
  const locale = useApplyLocale()

  const badges = useMemo<SidebarBadges>(() => {
    if (!user) {
      return {
        'critical-alerts': 0,
        'pending-decisions': 0,
        'active-incidents': 0,
        'ai-pending': 0,
        'security-open': 0,
      }
    }
    const visibleAlerts = ALERTS.filter(
      (a) =>
        a.severity === 'critical' &&
        a.status !== 'closed' &&
        a.status !== 'resolved' &&
        canAccess(user, 'alert', 'view', { wardIds: a.wardIds, departmentId: a.departmentId, classification: a.classification })
          .allowed,
    )
    const pendingDecisions = DECISION_CASES.filter(
      (d) =>
        (d.status === 'under-review' || d.status === 'draft') &&
        canAccess(user, 'decision', 'view', { wardIds: d.wardIds, classification: d.classification }).allowed,
    )
    const incidents = activeIncidents().filter(
      (i) => canAccess(user, 'incident', 'view', { wardId: i.wardId, classification: i.classification }).allowed,
    )
    const aiPending = canAccess(user, 'ai', 'view').allowed
      ? HUMAN_OVERSIGHT.filter((h) => h.outcome === 'pending').length
      : 0
    const securityOpen = canAccess(user, 'security', 'view').allowed
      ? SECURITY_EVENTS.filter((e) => e.status === 'open' || e.status === 'investigating').length
      : 0

    return {
      'critical-alerts': visibleAlerts.length,
      'pending-decisions': pendingDecisions.length,
      'active-incidents': incidents.length,
      'ai-pending': aiPending,
      'security-open': securityOpen,
    }
    // `corporationVersion` is a dependency because every collection read above
    // is a LIVE BINDING, replaced wholesale on a corporation switch. The lint
    // rule cannot see that - it only sees identifiers imported from a module -
    // so without the dependency the badges would keep showing the previous
    // corporation's counts until some unrelated state change happened to
    // re-render the shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, corporationVersion])

  const status = useMemo<TopbarStatus>(() => {
    const criticalIntel = INTELLIGENCE_ITEMS.filter((i) => i.severity === 'critical' && i.status !== 'closed').length
    const operationalState =
      badges['critical-alerts'] >= 6 || criticalIntel >= 6
        ? 'critical'
        : badges['critical-alerts'] >= 3
          ? 'at-risk'
          : badges['critical-alerts'] >= 1
            ? 'degraded'
            : 'operational'
    return {
      operationalState,
      criticalAlerts: badges['critical-alerts'],
      unreadNotifications: unread,
      activeIncidents: badges['active-incidents'],
      pendingDecisions: badges['pending-decisions'],
      lastRefreshedAt: DEMO_NOW.toISOString(),
    }
    // Same reason as above: `INTELLIGENCE_ITEMS` is a live binding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badges, unread, corporationVersion])

  const isSituationRoom = location.pathname.startsWith('/command/situation-room')
  const reduced = situationMode && isSituationRoom

  return (
    /* Keyed on the language: a switch remounts the shell so the sidebar,
       command bar, footer and every open surface are redrawn in it together.
       A partial change - a translated page under an English navigation - is
       worse than either language on its own. */
    <div key={locale} className="flex min-h-screen w-full bg-canvas">
      {!reduced ? <Sidebar badges={badges} /> : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar status={status} />
        {!reduced ? <ContextBar /> : null}

        <main
          className={cn('min-w-0 flex-1', reduced ? 'p-0' : 'p-3 sm:p-4 lg:p-5')}
          id="main-content"
          tabIndex={-1}
        >
          <Suspense
            fallback={
              <div className="mx-auto w-full max-w-[1600px] space-y-4">
                <LoadingState variant="metrics" />
                <LoadingState variant="block" rows={5} />
              </div>
            }
          >
            {/* Keyed on the active corporation and the formatting dialect, so
                that switching corporation remounts every page against the
                rebuilt dataset, and a change in Settings re-renders
                every figure on screen at once rather than only where the next
                state update happens to land. */}
            <div key={`${corporationVersion}:${formatSignature}`} className="contents">
              <Outlet />
            </div>
          </Suspense>
        </main>

        {!reduced ? (
            <footer className="shrink-0 border-t border-ink-100 bg-surface/80 px-4 py-2.5 backdrop-blur-sm">
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 text-[0.625rem] text-ink-400">
              <span className="font-medium text-ink-500">
                {municipality.branding.productFamily} · {municipality.branding.productName}
              </span>
              <span>{municipality.branding.deploymentLine}</span>
              <div className="flex-1" />
              <span>{municipality.environmentLabel}</span>
              <span className="hidden sm:inline">{municipality.dataProvenanceStatement}</span>
            </div>
          </footer>
        ) : null}
      </div>

      <CommandPalette />
      <NotificationCentre />
      <DrawerHost />
    </div>
  )
}
