import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, User } from '@/types/organisation'
import { DEMO_USERS, USER_BY_ID } from '@/auth/demo-users'
import { onAfterRebuild } from '@/data/runtime'
import { getRole } from '@/security/roles'
import { isoFromAnchor } from '@/utils/deterministic'

/**
 * Authentication context for the demonstration environment.
 *
 * IMPORTANT: no password, token, secret or credential material of any kind is
 * modelled, stored or transmitted. Only the selected demonstration profile
 * identifier is persisted, so a page refresh keeps the chosen role. A
 * production deployment replaces this entirely with an institutional identity
 * provider and enforced multi-factor authentication.
 */

interface AuthState {
  userId: string | null
  session: Session | null
  signIn: (userId: string) => User | null
  signOut: () => void
  /** Switches the acting principal - used by the command palette role switcher. */
  switchRole: (userId: string) => User | null
}

function buildSession(user: User): Session {
  return {
    id: `sess-${user.id.replace('user-', '')}`,
    userId: user.id,
    tenantId: user.tenantId,
    startedAt: isoFromAnchor(0),
    expiresAt: isoFromAnchor(8 * 60),
    sourceIpPlaceholder: '••••:••••:••••::•• (not recorded in demonstration)',
    device: 'Managed workstation - demonstration environment',
    mfaSatisfied: user.mfaEnrolled,
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      session: null,
      signIn: (userId) => {
        const user = USER_BY_ID.get(userId)
        if (!user) return null
        set({ userId: user.id, session: buildSession(user) })
        return user
      },
      signOut: () => set({ userId: null, session: null }),
      switchRole: (userId) => {
        const user = USER_BY_ID.get(userId)
        if (!user) return null
        set({ userId: user.id, session: buildSession(user) })
        return user
      },
    }),
    {
      name: 'bmc-mii.session',
      // Only the profile selection is persisted - never any credential material.
      partialize: (state) => ({ userId: state.userId }),
    },
  ),
)

/**
 * On a municipal corporation switch the demonstration profiles are rebuilt
 * (`src/auth/demo-users.ts`): same profile identifiers, new `tenantId`, new
 * ward scope, new employee codes. The persisted `userId` therefore still
 * resolves, but the session held here was issued against the previous
 * corporation. Re-issuing it keeps the acting principal and the data layer
 * describing the same tenant - without which `scopeToTenant` in
 * `src/services/client.ts` would filter every list in the platform to zero
 * rows and give no indication why.
 */
onAfterRebuild(() => {
  const { userId } = useAuthStore.getState()
  if (!userId) return
  const user = USER_BY_ID.get(userId)
  useAuthStore.setState(user ? { userId: user.id, session: buildSession(user) } : { userId: null, session: null })
})

/** Resolves the acting principal from the persisted profile identifier. */
export function useCurrentUser(): User | null {
  const userId = useAuthStore((s) => s.userId)
  return userId ? (USER_BY_ID.get(userId) ?? null) : null
}

export function useCurrentRole() {
  const user = useCurrentUser()
  return user ? (getRole(user.roleId) ?? null) : null
}

export function useIsAuthenticated(): boolean {
  return useAuthStore((s) => s.userId !== null)
}

export { DEMO_USERS }
