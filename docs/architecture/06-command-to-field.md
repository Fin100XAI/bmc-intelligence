# 06 — Command-to-field loop

**Status:** the in-app half is real and well built; nothing leaves the app. A task assigned in Decision Centre stops at another officer's inbox, and Verification is a status field an assignee sets on their own say-so, not an independent check.

## What exists today

- `src/services/action.service.ts` — `ActionItem` (owner, department, ward, priority, due date, status, notes, evidence links, links back to the source intelligence/decision/incident), full `create`/`assign`/`assignedByMe`/`assignableUsers` lifecycle, audit-logged.
- `src/pages/command/MyTasksPage.tsx` — assigned-to-me / assigned-by-me registers, ward-scoped assignment.
- `src/pages/command/DecisionCentrePage.tsx` — the Decision Case lifecycle already names `Assignment → Execution → Verification → Closure → Outcome Evaluation` as distinct stages. **The stage names already describe the loop this item is about — nothing currently enforces that Verification is independent of the assignee, or that Execution reflects anything that happened in the field.**
- No field-force mobile surface, no photo/GPS evidence capture, no dispatch to any external work-order system exists anywhere in the codebase.

## Decision: what "leaves the app" actually requires

Two genuinely separate things get conflated under "field dispatch," and they have different build costs:

1. **Notifying a field team that work is assigned to them** — the cheap part. `ActionItem` already has everything a push notification or SMS needs (`ownerId`, `title`, `wardIds`, `dueDate`, `priority`). This just needs a delivery channel (SMS gateway, or a lightweight mobile app reading the existing `actionService` API) added to `assign()` — no new data model.
2. **Getting independently-verifiable evidence back** — the real work, and the part actually missing from the model. `ActionItem` has `evidenceIds: string[]` already, but nothing populates it from the field, and nothing distinguishes "the assignee says it's done" from "a supervisor, or a photo with a GPS stamp and timestamp, confirms it's done." This is a genuine new capability, not a wiring exercise.

## Migration steps

1. Extend `ActionItem` with a `fieldEvidence` array — photo URL(s), a GPS coordinate, a captured timestamp, distinct from `notes` (which is officer-to-officer commentary, not field proof) and from `evidenceIds` (which today points at platform-internal evidence records, not field-captured media).
2. Add a real upload path for field evidence — this needs object storage (S3-compatible; sovereignty argues for a self-hosted MinIO instance over a foreign commercial bucket, consistent with the security-substrate recommendation) and is the first place in the platform that needs one.
3. Build (or integrate) the actual field surface — a lightweight PWA is the pragmatic choice over a native app for a first version: it can read/write against the existing `actionService`/`incidentService` APIs directly, requires no app-store distribution, and works on whatever Android device a field officer already carries.
4. Change what "Verification" means in Decision Centre: today it is a status the assignee sets; make it a status a *different* principal (a supervisor, or an automated check against the field evidence — e.g. a GPS coordinate that must fall within the ward the task was raised in) confirms. This is a workflow-rule change in existing code, not a new subsystem.
5. Only after 1–4 are real, consider actual dispatch integration to an external work-order/CMMS system, if the corporation already runs one — don't build a second work-order system inside this platform if a departmental one already exists to integrate with instead.

## What stays exactly as it is

- `ActionItem`'s existing fields, `action.service.ts`'s existing methods and audit behaviour — this is additive (new evidence fields, a new verification rule), not a rewrite.
- Decision Centre's stage names and Kanban structure — they already describe the target loop; they're currently unenforced, not wrong.
