import { canAccess, filterByScope } from '@/security/access'
import type { AccessContext } from '@/security/model'
import type { DataClassification, IntelligenceDomain, IsoDateTime, Paged, Severity } from '@/types/common'
import type { AuditAction } from '@/types/governance'
import type { ActionItem, ActionNote, ActionStatus } from '@/types/operations'
import type { User } from '@/types/organisation'
import { isoFromAnchor } from '@/utils/deterministic'
import { findTransition } from '@/workflows/engine'
import { actionWorkflow } from '@/workflows/machines'
import { ServiceError, assertAccess, deepClone, paginate, recordAudit, scopeToTenant, simulateLatency } from './client'
import { emitChange, getCollection, setCollection } from './store'
import { DEMO_USERS } from '@/auth/demo-users'
import { t } from '@/i18n'

/**
 * src/services/action.service.ts
 *
 * Accountable field tasks - the last link in the evidence → intelligence →
 * recommendation → decision → action → outcome chain. Status changes
 * validate against `actionWorkflow` in `src/workflows/machines.ts`.
 */

export interface ActionFilters {
  status?: ActionStatus[]
  priority?: Severity[]
  departmentId?: string
  wardId?: string
  domain?: IntelligenceDomain
  ownerId?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface ActionCreateInput {
  title: string
  description: string
  ownerId: string
  departmentId: string
  wardIds: string[]
  priority: Severity
  dueDate: IsoDateTime
  domain: IntelligenceDomain
  classification: DataClassification
  sourceIntelligenceId?: string
  decisionCaseId?: string
  incidentId?: string
  evidenceIds?: string[]
}

function contextFor(item: ActionItem): AccessContext {
  return { wardIds: item.wardIds, departmentId: item.departmentId, domain: item.domain, classification: item.classification }
}

function meta(item: ActionItem): { resourceType: string; resourceId: string; resourceLabel: string } {
  return { resourceType: 'Action', resourceId: item.id, resourceLabel: item.title }
}

function findOrThrow(user: User | null, id: string): ActionItem {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const item = getCollection('actions').find((a) => a.id === id && a.tenantId === user.tenantId)
  if (!item) throw new ServiceError('not-found', `Action "${id}" was not found.`)
  return item
}

function persist(updated: ActionItem): void {
  setCollection('actions', getCollection('actions').map((a) => (a.id === updated.id ? updated : a)))
}

function auditActionForStatus(to: ActionStatus): AuditAction {
  if (to === 'assigned') return 'assign'
  return 'status-change'
}

function matchesFilters(item: ActionItem, filters: ActionFilters): boolean {
  if (filters.status && filters.status.length > 0 && !filters.status.includes(item.status)) return false
  if (filters.priority && filters.priority.length > 0 && !filters.priority.includes(item.priority)) return false
  if (filters.departmentId && item.departmentId !== filters.departmentId) return false
  if (filters.wardId && !item.wardIds.includes(filters.wardId)) return false
  if (filters.domain && item.domain !== filters.domain) return false
  if (filters.ownerId && item.ownerId !== filters.ownerId) return false
  if (filters.search) {
    const q = filters.search.toLowerCase()
    if (!item.title.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) return false
  }
  return true
}

async function list(user: User | null, filters: ActionFilters = {}): Promise<Paged<ActionItem>> {
  await simulateLatency(`action.list:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, getCollection('actions'))
  const visible = filterByScope(user, scoped, contextFor, 'action')
  const filtered = visible.filter((item) => matchesFilters(item, filters))
  const sorted = [...filtered].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 20)
  return { ...page, items: deepClone(page.items) }
}

async function get(user: User | null, id: string): Promise<ActionItem> {
  await simulateLatency(`action.get:${id}`)
  const item = findOrThrow(user, id)
  assertAccess(user, 'action', 'view', contextFor(item), meta(item))
  return deepClone(item)
}

async function create(user: User | null, input: ActionCreateInput): Promise<ActionItem> {
  await simulateLatency('action.create', 200, 480)
  const context: AccessContext = {
    wardIds: input.wardIds,
    departmentId: input.departmentId,
    domain: input.domain,
    classification: input.classification,
  }
  const authed = assertAccess(user, 'action', 'create', context, {
    resourceType: 'Action',
    resourceId: 'new',
    resourceLabel: input.title,
  })
  const actions = getCollection('actions')
  const seq = actions.length + 1
  const newAction: ActionItem = {
    id: `act-live-${String(seq).padStart(4, '0')}`,
    tenantId: authed.tenantId,
    reference: `ACT-LIVE-${String(seq).padStart(4, '0')}`,
    title: input.title,
    description: input.description,
    ownerId: input.ownerId,
    departmentId: input.departmentId,
    wardIds: input.wardIds,
    priority: input.priority,
    dueDate: input.dueDate,
    sourceIntelligenceId: input.sourceIntelligenceId,
    decisionCaseId: input.decisionCaseId,
    incidentId: input.incidentId,
    status: 'open',
    notes: [],
    evidenceIds: input.evidenceIds ?? [],
    createdAt: isoFromAnchor(0),
    updatedAt: isoFromAnchor(0),
    createdBy: authed.id,
    domain: input.domain,
    classification: input.classification,
  }
  setCollection('actions', [newAction, ...actions])
  recordAudit(authed, {
    action: 'create-action',
    resourceType: 'Action',
    resourceId: newAction.id,
    resourceLabel: newAction.title,
    classification: newAction.classification,
    outcome: 'success',
  })
  emitChange()
  return deepClone(newAction)
}

async function transition(user: User | null, id: string, to: ActionStatus, reason?: string): Promise<ActionItem> {
  await simulateLatency(`action.transition:${id}:${to}`)
  const item = findOrThrow(user, id)
  const definition = findTransition(actionWorkflow, item.status, to)
  if (!definition) {
    throw new ServiceError('invalid', `No transition from "${item.status}" to "${to}" is defined for the action workflow.`)
  }
  if (definition.requiresReason && !reason) {
    throw new ServiceError('invalid', `A reason is required to ${definition.label.toLowerCase()}.`)
  }
  const authed = assertAccess(user, definition.requires.resource, definition.requires.action, contextFor(item), meta(item))
  const updated: ActionItem = { ...item, status: to, updatedAt: isoFromAnchor(0) }
  persist(updated)
  recordAudit(authed, {
    action: auditActionForStatus(to),
    resourceType: 'Action',
    resourceId: item.id,
    resourceLabel: item.title,
    classification: item.classification,
    outcome: 'success',
    reason,
    detail: `${definition.label}: ${item.status} → ${to}.`,
  })
  emitChange()
  return deepClone(updated)
}

async function assign(user: User | null, id: string, ownerId: string, reason?: string): Promise<ActionItem> {
  await simulateLatency(`action.assign:${id}`)
  const item = findOrThrow(user, id)
  const definition = findTransition(actionWorkflow, item.status, 'assigned')
  if (definition?.requiresReason && !reason) {
    throw new ServiceError('invalid', 'A reason is required to reassign this action.')
  }
  const authed = assertAccess(user, 'action', 'assign', contextFor(item), meta(item))
  const updated: ActionItem = {
    ...item,
    ownerId,
    status: definition ? 'assigned' : item.status,
    updatedAt: isoFromAnchor(0),
  }
  persist(updated)
  recordAudit(authed, {
    action: 'assign',
    resourceType: 'Action',
    resourceId: item.id,
    resourceLabel: item.title,
    classification: item.classification,
    outcome: 'success',
    reason,
    detail: t('Assigned to {0}.', ownerId),
  })
  emitChange()
  return deepClone(updated)
}

async function addNote(user: User | null, id: string, body: string): Promise<ActionItem> {
  await simulateLatency(`action.addNote:${id}`)
  const item = findOrThrow(user, id)
  const authed = assertAccess(user, 'action', 'edit', contextFor(item), meta(item))
  const note: ActionNote = {
    id: `${item.id}-note-${item.notes.length + 1}`,
    authorId: authed.id,
    authorName: authed.name,
    body,
    createdAt: isoFromAnchor(0),
  }
  const updated: ActionItem = { ...item, notes: [...item.notes, note], updatedAt: isoFromAnchor(0) }
  persist(updated)
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Action',
    resourceId: item.id,
    resourceLabel: item.title,
    classification: item.classification,
    outcome: 'success',
    detail: t('Note added.'),
  })
  emitChange()
  return deepClone(updated)
}

async function close(user: User | null, id: string, reason?: string): Promise<ActionItem> {
  return transition(user, id, 'closed', reason)
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

function sortByPriorityThenDue(items: ActionItem[]): ActionItem[] {
  return [...items].sort(
    (a, b) => SEVERITY_RANK[a.priority] - SEVERITY_RANK[b.priority] || (a.dueDate < b.dueDate ? -1 : 1),
  )
}

/**
 * Every identifier the acting principal owns work under.
 *
 * A principal is addressed two ways: by sign-in identifier, which is how a
 * task assigned through this platform names its owner, and by staff-directory
 * identifier, which is how the corporation's own operational records name the
 * officer holding an item. A Ward Officer signing in is the same person as the
 * ward's officer in the directory, and their task list has to say so.
 */
function ownerIdentities(user: User): string[] {
  return user.officerId ? [user.id, user.officerId] : [user.id]
}

/**
 * The tasks assigned to the acting principal.
 *
 * A task assigned to you is yours to see, regardless of the domain it is
 * tagged with - the assignment IS the authorisation. Scope filtering by ward
 * or domain is therefore deliberately not applied here; only tenant ownership
 * and the ownership match. This is what makes "assign a task to an officer and
 * they see it on their own dashboard" work across a role switch.
 */
async function myTasks(user: User | null): Promise<ActionItem[]> {
  await simulateLatency('action.myTasks')
  const authed = assertAccess(user, 'action', 'view', {}, {
    resourceType: 'Action',
    resourceId: 'assigned-to-me',
    resourceLabel: 'Tasks assigned to me',
  })
  const mine = ownerIdentities(authed)
  const owned = scopeToTenant(authed, getCollection('actions')).filter((a) => mine.includes(a.ownerId))
  return deepClone(sortByPriorityThenDue(owned))
}

/** The tasks the acting principal has assigned to others - the other side of
 *  the same loop, so an assigner can watch what they dispatched. */
async function assignedByMe(user: User | null): Promise<ActionItem[]> {
  await simulateLatency('action.assignedByMe')
  const authed = assertAccess(user, 'action', 'view', {}, {
    resourceType: 'Action',
    resourceId: 'assigned-by-me',
    resourceLabel: 'Tasks I assigned',
  })
  const mine = ownerIdentities(authed)
  const raised = scopeToTenant(authed, getCollection('actions')).filter(
    (a) => a.createdBy === authed.id && !mine.includes(a.ownerId),
  )
  return deepClone(sortByPriorityThenDue(raised))
}

export interface AssignableUser {
  id: string
  name: string
  designation: string
  departmentId: string
  wardId?: string
  /** True for the acting principal - a task taken on rather than delegated. */
  isSelf: boolean
}

/**
 * The officers a task can be assigned to.
 *
 * These are the demonstration principals - the identities that can actually be
 * signed in as - so an assigned task can be verified end to end by switching to
 * the assignee.
 *
 * The acting principal is included, and listed first. Taking a task on
 * yourself is ordinary municipal practice, not an edge case: an officer who
 * commits to an item of work records it against their own name so it is
 * visible and accountable rather than held in their head. Excluding them also
 * made the assignment loop impossible to see in one sitting - the only way to
 * put anything on your own dashboard was to delegate it to someone else and
 * sign in as them.
 *
 * Principals whose role cannot open an action are excluded: a task nobody can
 * read is not a task. The check is the same `canAccess` the service enforces,
 * so the list can never offer an assignment the assignee would be denied.
 */
async function assignableUsers(user: User | null): Promise<AssignableUser[]> {
  await simulateLatency('action.assignableUsers')
  const authed = assertAccess(user, 'action', 'assign', {}, {
    resourceType: 'Action',
    resourceId: 'assignable-users',
    resourceLabel: 'Assignable officers',
  })
  const candidates = DEMO_USERS.filter(
    (u) => u.tenantId === authed.tenantId && canAccess(u, 'action', 'view', {}).allowed,
  ).map((u) => ({
    id: u.id,
    name: u.name,
    designation: u.designation,
    departmentId: u.departmentId,
    wardId: u.wardId,
    isSelf: u.id === authed.id,
  }))
  return [...candidates].sort((a, b) => Number(b.isSelf) - Number(a.isSelf))
}

export const actionService = {
  list,
  get,
  create,
  transition,
  assign,
  addNote,
  close,
  myTasks,
  assignedByMe,
  assignableUsers,
}
