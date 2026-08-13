# Platform architecture — target vs. built

Seven documents, one per platform-layer gap named in the Architecture Reality Check review. Each follows the same shape: what exists today (with exact file references), a decision, migration steps, and what should **not** change along the way.

| # | Document | Scaffolding added |
|---|---|---|
| 01 | [Security substrate](./01-security-substrate.md) | `src/auth/identity-provider.ts` |
| 02 | [Canonical municipal data model](./02-canonical-data-model.md) | `src/canonical/{ward,department,building}.schema.json`, `src/canonical/assert-shape.ts` |
| 03 | [Connector / ingestion runtime](./03-connector-runtime.md) | `server/connectors/rainfall-poll.job.ts` |
| 04 | [AI Gateway](./04-ai-gateway.md) | `src/ai/gateway.ts` |
| 05 | [GIS backend](./05-gis-backend.md) | `src/gis/provider.ts` |
| 06 | [Command-to-field loop](./06-command-to-field.md) | `src/services/field-dispatch.service.ts` |
| 07 | [Persisted graph store](./07-graph-store.md) | none — correctly deferred, see the doc |

## Reading order

**Item 01 is the precondition for everything else.** No other item on this list matters in a production deployment until a real identity provider exists — the rest are legitimate roadmap items, that one is a blocker.

After that, read in whichever order matches what's actually being built next:

- Extending domain coverage (more pages, more registers) → none of these seven block that work; it can continue in parallel.
- Making one domain's data real → 03 (connector runtime), then 02 (canonical model) once there's a second real source to reconcile the first against.
- Making the AI layer production-grade → 04, which turns out to be the smallest lift of the seven, because the seam (`AIProvider`) was already built and documented before this review — see the doc.
- Making the platform trustworthy for a compliance review → 01, then 06 (command-to-field), since "did the work actually happen" is the question a compliance review asks that this platform cannot currently answer independently of the assignee's own say-so.

## What none of this scaffolding does

Every file listed above is additive and **not wired into the live application** — none of them is imported by anything a running page reaches, by design (see each file's own header comment for why). Registering `GatewayAIProvider`, swapping `useAuthStore`'s lookup for a real OIDC flow, exporting `fieldDispatchService` from the services barrel — each of those is a live migration step with its own review, not something that should happen quietly alongside architecture documentation.

## Verification

These seven documents and their scaffolding files were checked against the existing verification suite (`npm run typecheck`, `npm run lint`) as part of the change that added them — the scaffolding compiles cleanly and changes no runtime behaviour of the deployed application.
