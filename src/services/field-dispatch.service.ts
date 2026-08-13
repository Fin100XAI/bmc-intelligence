import type { User } from '@/types/organisation'
import { simulateLatency } from './client'

/**
 * src/services/field-dispatch.service.ts
 *
 * SCAFFOLDING — deliberately NOT exported from `src/services/index.ts`.
 * Every real service in this codebase is reached only through that barrel
 * (see its own header comment); a service this file's methods all throw
 * from has no business being reachable from a page. Wiring this in is the
 * migration step itself (docs/architecture/06-command-to-field.md, steps
 * 1-4), not something to do quietly here.
 *
 * The shape below extends `ActionItem` (`src/types/operations.ts`) rather
 * than replacing it - `fieldEvidence` is the field this docket's own gap
 * analysis names as missing: `ActionItem.evidenceIds` already exists but
 * points at platform-internal evidence records, and `ActionItem.notes` is
 * officer-to-officer commentary, neither of which is independently
 * verifiable proof that field work happened.
 */

export interface FieldEvidenceCapture {
  actionId: string
  capturedBy: string
  capturedAt: string
  photoUrl: string
  gps?: { lat: number; lng: number }
}

export interface DispatchResult {
  actionId: string
  channel: 'sms' | 'push' | 'field-app'
  dispatchedAt: string
}

/**
 * TODO(field-dispatch): send a real notification (SMS gateway, push, or an
 * in-app signal to a field PWA reading `actionService` directly) to the
 * action's `ownerId`. `ActionItem` already carries everything a dispatch
 * needs (title, wardIds, dueDate, priority) - this needs a delivery
 * channel, not a new data model.
 */
async function dispatch(_user: User | null, _actionId: string): Promise<DispatchResult> {
  await simulateLatency('field-dispatch.dispatch')
  throw new Error(
    'TODO(field-dispatch): no delivery channel is wired up. See docs/architecture/06-command-to-field.md.',
  )
}

/**
 * TODO(field-dispatch): accept a real photo upload (needs object storage -
 * see the migration doc's recommendation to self-host rather than use a
 * foreign commercial bucket) and a real GPS reading, then attach it to the
 * action as evidence distinct from officer notes.
 */
async function captureEvidence(_user: User | null, _capture: FieldEvidenceCapture): Promise<void> {
  await simulateLatency('field-dispatch.captureEvidence')
  throw new Error(
    'TODO(field-dispatch): no evidence storage is wired up. See docs/architecture/06-command-to-field.md.',
  )
}

/**
 * TODO(field-dispatch): the actual behaviour change this docket calls for -
 * verification confirmed by a DIFFERENT principal than the assignee (a
 * supervisor, or an automated check that the captured GPS coordinate falls
 * within the ward the task was raised in), not a status the assignee sets
 * on their own action.
 */
async function verifyIndependently(_user: User | null, _actionId: string, _verifierId: string): Promise<void> {
  await simulateLatency('field-dispatch.verify')
  throw new Error(
    'TODO(field-dispatch): independent verification is not implemented. See docs/architecture/06-command-to-field.md.',
  )
}

export const fieldDispatchService = {
  dispatch,
  captureEvidence,
  verifyIndependently,
}
