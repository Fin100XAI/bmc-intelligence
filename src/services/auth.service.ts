import { DEMO_USERS, FEATURED_DEMO_PROFILES, USER_BY_ID } from '@/auth/demo-users'
import { onAfterRebuild } from '@/data/runtime'
import type { Session, User } from '@/types/organisation'
import { DEMO_NOW, isoFromAnchor } from '@/utils/deterministic'
import { DEMO_SOURCE_IP_PLACEHOLDER, ServiceError, deepClone, recordAudit, simulateLatency } from './client'

/**
 * src/services/auth.service.ts
 *
 * Demonstration authentication. No password, token or credential material
 * of any kind is modelled, stored or transmitted anywhere in this module -
 * see `src/auth/demo-users.ts`. Session state lives in a module-scoped map
 * here rather than in `store.ts` (which is reserved for the domain
 * collections shared across services) because signing in and out has no
 * bearing on any other service's data.
 */

export interface DemoProfile {
  user: User
  accessSummary: string
}

const SESSIONS = new Map<string, Session>()
const SESSION_DURATION_MINUTES = 8 * 60
let sessionSequence = 0

/**
 * Whether a session has passed its own stated expiry.
 *
 * Every session issued here has carried an `expiresAt` since the type was
 * written, and nothing read it. A declared lifetime that is never enforced is
 * worse than no lifetime at all: the Security Command Centre listed expired
 * sessions as live, `getSession` returned them as valid, and the interface
 * stated an eight-hour session policy the platform did not actually apply.
 *
 * Compared against the platform clock (`DEMO_NOW`), not `Date.now()` - every
 * other age, freshness and audit interval in the build is measured from that
 * anchor, and a session judged against wall-clock time while an audit entry
 * beside it is judged against the anchor would disagree with itself.
 */
export function isSessionExpired(session: Session, now: Date = DEMO_NOW): boolean {
  const expiry = Date.parse(session.expiresAt)
  return Number.isFinite(expiry) && expiry <= now.getTime()
}

/** Drops an expired session and reports whether one survives. */
function liveSession(userId: string): Session | undefined {
  const session = SESSIONS.get(userId)
  if (!session) return undefined
  if (!isSessionExpired(session)) return session
  SESSIONS.delete(userId)
  return undefined
}

/**
 * A session carries the tenant it was established against. When the operator
 * switches municipal corporation, every session in this map is for the
 * previous tenant and would let a principal appear to be authenticated against
 * a corporation it no longer belongs to. Clearing them forces a fresh session
 * to be issued against the corporation now in effect.
 */
onAfterRebuild(() => {
  SESSIONS.clear()
})

async function listDemoProfiles(): Promise<DemoProfile[]> {
  await simulateLatency('auth.listDemoProfiles')
  const profiles: DemoProfile[] = FEATURED_DEMO_PROFILES.map((p) => ({
    user: USER_BY_ID.get(p.userId) ?? (DEMO_USERS[0] as User),
    accessSummary: p.accessSummary,
  }))
  return deepClone(profiles)
}

async function signIn(userId: string): Promise<{ user: User; session: Session }> {
  await simulateLatency(`auth.signIn:${userId}`)
  const user = USER_BY_ID.get(userId)
  if (!user) {
    throw new ServiceError('not-found', `No demonstration profile exists for "${userId}".`)
  }
  if (user.status !== 'active') {
    throw new ServiceError('forbidden', `This demonstration profile is currently "${user.status}" and cannot sign in.`)
  }

  sessionSequence += 1
  const session: Session = {
    id: `sess-${user.id}-${String(sessionSequence).padStart(4, '0')}`,
    userId: user.id,
    tenantId: user.tenantId,
    startedAt: isoFromAnchor(0),
    expiresAt: isoFromAnchor(SESSION_DURATION_MINUTES),
    sourceIpPlaceholder: DEMO_SOURCE_IP_PLACEHOLDER,
    device: 'Managed desktop - municipal network',
    mfaSatisfied: user.mfaEnrolled,
  }
  SESSIONS.set(user.id, session)

  recordAudit(user, {
    action: 'sign-in',
    resourceType: 'Session',
    resourceId: session.id,
    resourceLabel: `Sign-in - ${user.name}`,
    classification: 'internal',
    outcome: 'success',
    detail: user.mfaEnrolled ? 'MFA satisfied.' : 'MFA not enrolled for this demonstration profile.',
  })

  return deepClone({ user, session })
}

async function signOut(user: User): Promise<void> {
  await simulateLatency(`auth.signOut:${user.id}`)
  const session = SESSIONS.get(user.id)
  SESSIONS.delete(user.id)
  recordAudit(user, {
    action: 'sign-out',
    resourceType: 'Session',
    resourceId: session?.id ?? `sess-${user.id}`,
    resourceLabel: `Sign-out - ${user.name}`,
    classification: 'internal',
    outcome: 'success',
  })
}

async function getSession(userId: string): Promise<Session | undefined> {
  await simulateLatency(`auth.getSession:${userId}`)
  const session = liveSession(userId)
  return session ? deepClone(session) : undefined
}

/**
 * Read-only accessor used by `security.service.ts` to model currently
 * active demonstration sessions for the Security Command Centre, without
 * duplicating session bookkeeping in a second place.
 *
 * "Live" is enforced, not assumed: an expired session is dropped here rather
 * than being counted as an active one on the security posture screen.
 */
export function listLiveSessions(): Session[] {
  // Collected first, deleted after: removing entries while iterating the map
  // being iterated is how a sweep silently skips half of what it was asked to
  // clear.
  const expired: string[] = []
  for (const [userId, session] of SESSIONS) {
    if (isSessionExpired(session)) expired.push(userId)
  }
  for (const userId of expired) SESSIONS.delete(userId)
  return Array.from(SESSIONS.values())
}

export const authService = {
  listDemoProfiles,
  signIn,
  signOut,
  getSession,
}
