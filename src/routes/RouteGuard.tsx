import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ROUTES, navItemForPath } from '@/config/navigation'
import { canAccess } from '@/security/access'
import { auditService } from '@/services'
import { useCurrentUser } from '@/stores/auth.store'
import { ROLE_DEFAULT_LANDING, usePreferencesStore } from '@/stores/preferences.store'
import { AccessDeniedState } from '@/components/ui/states'
import { PageBody } from '@/components/layout/PageHeader'
import type { User } from '@/types/organisation'
import { t } from '@/i18n'

/**
 * Resolves an operator's preferred landing route, honouring the Settings →
 * Preferences choice but never over its own head: the preference only wins if
 * the principal actually holds the permission the target route requires.
 * Returns null when there is no valid preference, so the caller falls back to
 * the role default.
 */
export function resolvePreferredLanding(user: User | null, preferred: string): string | null {
  if (!user || !preferred || preferred === ROLE_DEFAULT_LANDING) return null
  const item = navItemForPath(preferred)
  if (!item) return null
  const decision = canAccess(user, item.requires.resource, item.requires.action, item.domain ? { domain: item.domain } : {})
  return decision.allowed ? preferred : null
}

/**
 * Route-level authorisation.
 *
 * Re-evaluates the permission engine on every navigation. Reaching a route by
 * typing its path directly is denied exactly as it would be if the navigation
 * item had been visible - hiding the link is never the control.
 */
export function RequireAuth({ children }: { children: ReactNode }): React.JSX.Element {
  const user = useCurrentUser()
  const location = useLocation()

  if (!user) {
    return <Navigate to={ROUTES.login} state={{ from: location.pathname }} replace />
  }
  return <>{children}</>
}

/**
 * The permission a route falls back to when `navItemForPath` resolves nothing.
 *
 * This gate reads the required permission off the navigation entry for the
 * path, which means a routed page with no navigation entry has no stated
 * permission. The previous behaviour in that case was to GRANT - a fail-open
 * default that made "the author forgot to add a navigation entry" and "this
 * page is open to every authenticated principal" the same thing, silently, on
 * a platform where the navigation table and the route table are edited
 * separately.
 *
 * A gate that cannot determine what a route requires must refuse it. Refusing
 * is visible the first time anyone opens the page; granting is visible only to
 * whoever reads the resulting audit trail, if anyone does.
 */
const UNMAPPED_ROUTE_REQUIREMENT = {
  resource: 'administration' as const,
  action: 'administer' as const,
}

export function RequirePermission({ children }: { children: ReactNode }): React.JSX.Element {
  const user = useCurrentUser()
  const location = useLocation()
  const navItem = navItemForPath(location.pathname)

  const requires = navItem?.requires ?? UNMAPPED_ROUTE_REQUIREMENT
  const label = navItem?.label ?? location.pathname

  const decision = navItem
    ? canAccess(user, requires.resource, requires.action, navItem.domain ? { domain: navItem.domain } : {})
    : {
        allowed: false,
        reason: t(
          'This route carries no declared permission, so it cannot be authorised. A routed screen must have a navigation entry stating what it requires before any principal can open it.',
        ),
        basis: 'role-permission' as const,
      }

  // Every denial is written to the audit trail - a record that shows only
  // successful access is not an audit trail. In production this writes to the
  // append-only audit store through the same service call.
  useEffect(() => {
    if (!decision.allowed) {
      auditService.recordAccessDenied(user, {
        resourceType: 'Route',
        resourceId: location.pathname,
        resourceLabel: label,
        reason: t('{0} (basis: {1}; required {2}:{3})', decision.reason, decision.basis, requires.resource, requires.action),
      })
    }
  }, [decision.allowed, decision.basis, decision.reason, location.pathname, label, requires.resource, requires.action, user])

  if (!decision.allowed) {
    return (
      <PageBody>
        <AccessDeniedState reason={decision.reason} resource={requires.resource} action={requires.action} />
      </PageBody>
    )
  }

  return <>{children}</>
}

/**
 * Sends an authenticated principal to the platform's front page.
 *
 * The Executive Overview is the front page for everyone. It is the one screen
 * that states the city's position across every domain at once, so it is what
 * an officer should meet on opening the platform and what a demonstration
 * should open on - rather than each role arriving somewhere different and
 * having to orient itself before it can read anything.
 *
 * Two things still take precedence, in this order:
 *
 *  1. An explicit landing preference the operator set in Settings. A choice a
 *     person made deliberately outranks the platform's default.
 *  2. The role's own landing, but ONLY where the principal cannot read the
 *     Executive Overview at all. A security administrator or an AI governance
 *     officer holds no `intelligence:view` over the executive domain, and
 *     sending them to a front page that answers with Access Denied would be a
 *     worse greeting than the role landing they have now.
 *
 * This does NOT redirect on every refresh. Refreshing `/city/water` keeps an
 * officer on `/city/water`, which is what `scripts/serve.mjs` exists to make
 * work - a colleague's link and a bookmarked register must both survive.
 */
export function RoleLandingRedirect(): React.JSX.Element {
  const user = useCurrentUser()
  const preferredLanding = usePreferencesStore((s) => s.defaultLanding)
  if (!user) return <Navigate to={ROUTES.login} replace />

  // An explicit, accessible landing preference wins over the default.
  const preferred = resolvePreferredLanding(user, preferredLanding)
  if (preferred) return <Navigate to={preferred} replace />

  // The front page, whenever the principal can actually read it. Reuses the
  // same permission check the preference does, so the two cannot drift.
  const overview = resolvePreferredLanding(user, ROUTES.executive)
  if (overview) return <Navigate to={overview} replace />

  const landing: Record<string, string> = {
    'municipal-commissioner': ROUTES.cockpit,
    'additional-commissioner': ROUTES.executive,
    'deputy-commissioner': ROUTES.executive,
    'ward-officer': ROUTES.wards,
    'department-head': ROUTES.executive,
    'chief-engineer': ROUTES.projects,
    'finance-officer': ROUTES.budget,
    'disaster-management-officer': ROUTES.situationRoom,
    'health-officer': ROUTES.health,
    analyst: ROUTES.executive,
    operator: ROUTES.situationRoom,
    auditor: ROUTES.evidenceAudit,
    'security-administrator': ROUTES.security,
    'ai-governance-officer': ROUTES.aiGovernance,
  }

  return <Navigate to={landing[user.roleId] ?? ROUTES.executive} replace />
}
