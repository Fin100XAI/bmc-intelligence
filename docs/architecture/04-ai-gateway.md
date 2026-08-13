# 04 — AI Gateway

**Status:** further along than it first appears. The provider-abstraction seam this item asks for already exists and is already documented in the codebase — it has simply never been implemented against anything but the demo provider. This is the smallest lift of the seven items in this docket.

## What exists today

- **`src/ai/provider.ts` already defines `AIProvider`** — `generateExecutiveBrief`, `analyseRisk`, `explainMetric`, `answerMunicipalQuery`, `recommendActions`, `summariseIncident`, `generateDecisionOptions`, `interpretScenario`, each taking an `AIRequestContext`. This is already the exact interface a gateway needs to implement.
- **`src/ai/index.ts` already provides `getAIProvider()` / `setAIProvider()`**, with its own header comment stating the migration in two steps: "1. Implement `AIProvider` against the approved AI gateway. 2. Register it once at application start with `setAIProvider(...)`. No page, hook, drawer or component changes. Model credentials never enter the browser bundle - the gateway holds them." **This document did not need to invent that plan — it was already written.**
- `src/ai/mock-provider.ts` — `MockMunicipalAIProvider implements AIProvider`, currently the sole registered provider (`activeProvider` in `src/ai/index.ts`, defaulted at module scope).
- `src/pages/ai/AIIntelligenceCentrePage.tsx` — every AI request logged with use case, model/provider, confidence, latency, grounding, citation count, human-review status, policy status, tokens in/out, requesting officer. This is real observability *of* AI usage; it is not itself a gateway that AI usage is routed *through*.
- `src/pages/ai/ModelRegistryPage.tsx` / `PromptRegistryPage.tsx` — full catalogues (provider, risk class, evaluation status, approved/restricted use; versioned templates with guardrails and allowed-roles). Both explicitly disclose that no request reaches a real external model endpoint.
- `src/config/municipality.config.ts` — `PLATFORM_FEATURE_FLAGS` already contains `ff-sovereign-model` ("Route AI requests to an approved sovereign or on-premise model"), `enabled: false`, `stage: 'planned'`. **The flag already states the destination; nothing implements the routing it would control.**
- `src/security/model.ts` — `HUMAN_CONFIRMATION_REQUIRED` (the "AI must never" list) and the AI Agents' Analysis→Recommendation→Human Review→Authorised Action lifecycle are enforced in the UI/workflow layer today, not in a gateway. They should stay enforced at that layer even after a gateway exists — a gateway is not the place to re-litigate whether an action requires human confirmation, only where to send the request and how to meter it.

## Decision: a distinct gateway service, not a smarter mock-provider

The gateway's job is **routing, rate limiting, cost tracking, and guardrail enforcement at the network boundary** — none of which belongs inside application code that also has to render a chat UI. Recommended shape:

- A thin proxy service (could be as simple as a Cloudflare Worker / Azure API Management policy / a small Express service — the choice matters less than the separation) that every AI-shaped feature calls instead of a model endpoint directly.
- It resolves "which model handles this request" from the **existing** Model Registry data (risk class, approved use, environment) rather than a second, competing configuration surface.
- It is where `ff-sovereign-model` actually gets implemented: the flag flips which upstream the gateway routes to (a sovereign/on-premise model for `restricted`-classification requests, a commercial API for lower-classification ones) — application code never needs to know which.
- It is where per-request cost and token budgets are enforced, not just recorded after the fact (which is all `AIIntelligenceCentrePage` does today).

## Migration steps

1. Stand up the gateway as its own deployable unit (a thin proxy — Cloudflare Worker / Azure API Management policy / small Express service; the separation matters more than the vehicle).
2. Implement `AIProvider` against it — `src/ai/gateway.ts` (scaffolded below) is that implementation's skeleton, with `TODO`s marking exactly where a real HTTP call, real routing-by-risk-class, and real cost metering belong.
3. Have the gateway resolve "which model handles this request" from the **existing** Model Registry data (risk class, approved use, environment) rather than a second, competing configuration surface.
4. This is where `ff-sovereign-model` actually gets implemented: the flag flips which upstream the gateway routes to (a sovereign/on-premise model for `restricted`-classification requests, a commercial API for lower-classification ones) — application code never needs to know which, because it only ever talks to `AIProvider`.
5. Move guardrail enforcement that's genuinely about the model call itself (prompt injection screening, output content filtering) into the gateway; leave `HUMAN_CONFIRMATION_REQUIRED` and the agent-lifecycle checkpoints exactly where they are, in application code, since they're decisions about *what the platform is allowed to act on*, not about the model call.
6. Call `setAIProvider(new GatewayAIProvider(...))` once at application start, exactly as `src/ai/index.ts` already documents. Nothing else changes.
7. Flip `ff-sovereign-model` to `enabled: true` once a real sovereign/on-premise model target exists for the gateway to route to.

## What stays exactly as it is

- `AIProvider`, `getAIProvider()`/`setAIProvider()` — already correct, already documented, needs an implementation rather than a redesign.
- Every AI Agent's Analysis→Recommendation→Human Review→Authorised Action lifecycle, and the `HUMAN_CONFIRMATION_REQUIRED` list — these are governance decisions, not routing decisions, and belong in application code regardless of what's behind the gateway.
- Model Registry, Prompt Registry, AI Risk Register, AI Incidents — the gateway consumes these, it doesn't replace them.
- `AIIntelligenceCentrePage`'s logging — it becomes a view over the gateway's real request log instead of demonstration data, with no change to its own shape.
