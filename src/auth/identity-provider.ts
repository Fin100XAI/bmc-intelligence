import type { Session, User } from '@/types/organisation'

/**
 * src/auth/identity-provider.ts
 *
 * The seam a real identity provider fills. Not wired into the app yet - see
 * `docs/architecture/01-security-substrate.md` for the migration plan and
 * why Keycloak is the recommended target.
 *
 * `src/stores/auth.store.ts` today implements this shape implicitly: its
 * `signIn(userId)` does a `USER_BY_ID.get(userId)` lookup with no credential
 * verification, which is exactly the `DemoIdentityProvider` below made
 * explicit. A real OIDC/SAML implementation of this same interface is a
 * drop-in replacement for that one lookup - `useAuthStore`, `RequireAuth`,
 * `RequirePermission` and `canAccess()` do not change, because none of them
 * know or care how a `User` was authenticated, only that one exists.
 *
 * This file is deliberately NOT imported by `auth.store.ts` today. Wiring it
 * in is the migration step itself (docs/architecture/01, step 4), not
 * something to do quietly alongside unrelated feature work - swapping the
 * live authentication path belongs in its own reviewed change.
 */

export interface AuthResult {
  user: User
  session: Session
}

/**
 * What any identity provider - the demonstration lookup today, a real OIDC
 * client tomorrow - must be able to do for the rest of the platform to work
 * unmodified.
 */
export interface IdentityProvider {
  /**
   * Begins authentication. For the demo provider this resolves immediately
   * from a selected profile id; for a real OIDC provider this redirects to
   * the authorization endpoint and the promise resolves after the callback
   * completes the code exchange.
   */
  authenticate(input: AuthenticateInput): Promise<AuthResult | null>

  /** True while a session is held and not past `session.expiresAt`. */
  isAuthenticated(): boolean

  /** Silently refreshes the session if the provider supports it; null if not. */
  refresh(): Promise<AuthResult | null>

  signOut(): Promise<void>
}

export type AuthenticateInput =
  | { kind: 'demo-profile'; userId: string }
  | { kind: 'oidc-callback'; code: string; state: string }

/**
 * Maps a real IdP's ID-token claims to the platform's own `User` shape.
 *
 * This is the function a Keycloak integration actually has to write: either
 * the claims carry `roleId`/`wardIds`/`departmentIds`/`domains` directly
 * (issued by a custom Keycloak mapper reading a departmental directory), or
 * this function resolves them by looking up the claimed employee code
 * against a real HR/establishment system - see
 * `docs/architecture/03-connector-runtime.md` for that lookup's own shape.
 * Everything downstream of the returned `User` - `canAccess`, every service
 * call, every page - is unchanged either way.
 */
export type ClaimsToUser = (claims: Record<string, unknown>) => User | null
