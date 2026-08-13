# 01 — Security substrate

**Status:** not built. RBAC/ABAC is a real, functional engine; identity, MFA, secrets and monitoring are entirely absent. This is the platform's largest single gap and the precondition for every other item in this docket — nothing below matters in production until this is solved.

## What exists today

- `src/security/access.ts` — `canAccess()` is a genuine RBAC+ABAC decision engine: role permission check, classification-ceiling check, ward-scope check, department-scope check, domain-scope check, in that order. It is exercised live on `/trust` (Control Verification tab) and via the permission tester on `/trust/access`.
- `src/security/model.ts` / `src/security/roles.ts` — the `ResourceType`/`ActionType`/`PermissionId` vocabulary and the 14-role catalogue. Each role declares its `permissionIds` and `maxClassification`.
- `src/types/organisation.ts` — `User.scope: { wardIds, departmentIds, domains }` and `Session { id, userId, tenantId, startedAt, expiresAt, sourceIpPlaceholder, device, mfaSatisfied }`. The session shape already anticipates expiry and MFA enforcement; nothing currently reads `expiresAt` to force a re-auth, and `mfaSatisfied` is set from `user.mfaEnrolled` rather than from a real MFA challenge.
- `src/auth/demo-users.ts` — `DEMO_USERS`, `DEMO_ACCESS_PASSPHRASE` (a single shared string, explicitly documented as **not a security control**), `makeUser()`.
- `src/stores/auth.store.ts` — `useAuthStore` (`signIn(userId)`, `signOut()`, `switchRole(userId)`), `useCurrentUser()`. `signIn` does a `USER_BY_ID.get(userId)` lookup — no credential is verified at all beyond the shared passphrase checked client-side in `LoginPage.tsx`.
- `src/routes/RouteGuard.tsx` — `RequireAuth` (redirects to `/login` when `useCurrentUser()` is null) and `RequirePermission` (calls `canAccess`, writes every denial to the audit trail). **Neither of these needs to change** — they read a `User | null` and don't know or care how it was populated.

## Decision: identity provider

**Recommend Keycloak, self-hosted within the Maharashtra State Data Centre or an empanelled government cloud**, for three reasons specific to this deployment:

1. **Data sovereignty.** The product is branded "Sovereign Urban Intelligence Infrastructure." A self-hosted, open-source IdP is the only option that doesn't put every officer's identity behind a foreign commercial SaaS tenant.
2. **Federation with existing state identity, when it exists.** Keycloak's identity brokering supports federating to an NIC-SSO or state-run IdP later without a second migration, if/when Maharashtra state employee SSO becomes available to line up against.
3. **Standards fit.** Full OIDC + SAML support covers both a modern OIDC-based web client and any legacy SAML-only departmental system that needs to trust the same identity.

**Runner-up: Azure AD B2C / Entra ID** if the corporation already runs Microsoft 365/Azure AD for staff email — lower operational overhead, weaker sovereignty story unless deployed to Azure's India regions with a data-residency commitment.

**Not recommended: Okta** — commercial, non-Indian-hosted by default, no sovereignty advantage over Azure AD B2C to offset the cost.

## Migration steps

1. Stand up Keycloak; create a realm per deployment (aligns with the platform's existing multi-tenant-by-corporation model in `src/config/corporations.ts`).
2. Register an OIDC confidential client for the SPA (authorization code + PKCE flow — never implicit).
3. Define custom claims carrying `roleId`, `wardIds`, `departmentIds`, `domains` (or resolve these server-side from a directory lookup keyed by employee code, if the corporation's HR system is the source of truth rather than the IdP itself — see `docs/architecture/03-connector-runtime.md`).
4. Replace `useAuthStore.signIn` with a real token-exchange flow: redirect to Keycloak, handle the callback, decode the ID token, map claims → `User` (the shape doesn't need to change), call `set({ userId, session })` exactly as today.
5. Replace `LoginPage.tsx`'s position-picker with a single "Sign in with [Corporation] SSO" button that redirects to the IdP. Keep `LoginPage.tsx`'s institutional side panel copy — only the form changes.
6. Enforce MFA at the IdP (Keycloak OTP or WebAuthn), and start actually reading `session.mfaSatisfied` before allowing any `classification: 'restricted'` read, rather than trusting `user.mfaEnrolled` as a static flag.
7. Add session expiry enforcement: a `setInterval`/route-guard check against `session.expiresAt`, forcing silent token refresh or re-auth — the field already exists and is already unused.
8. Retire `src/auth/demo-users.ts` and `DEMO_ACCESS_PASSPHRASE` from any build that isn't explicitly the public demonstration environment.

## What stays exactly as it is

- `canAccess()` and the entire ABAC evaluation — a real IdP only changes **who** the principal is; it does not change how access is decided. This is the platform's best-designed layer and the migration should not touch it.
- `RequireAuth` / `RequirePermission` — already transport-agnostic.
- The `User`/`Session` type shapes — already anticipate the fields a real IdP needs to populate.

## Still needed beyond the IdP (not scaffolded here — later phases)

- **PAM** (privileged access management) for the Security Administrator and Municipal Commissioner roles specifically — just-in-time elevation and session recording for `allActions('administration')` holders.
- **KMS/HSM** for encryption keys backing anything the Privacy & Data Governance page currently only describes in policy (retention, minimisation) rather than enforces technically.
- **SIEM/SOC integration** — `SecurityCommandCentrePage` already models a security-event feed and response workflow; it needs a real event source (the IdP's own audit log, a real SIEM like Wazuh or Elastic Security, or Azure Sentinel if the Azure AD B2C path is chosen) feeding it instead of demonstration data.
