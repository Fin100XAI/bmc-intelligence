import type { DataClassification, IntelligenceDomain } from '@/types/common'
import type { RoleId } from '@/types/organisation'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Central permission model.
 *
 * Access is never enforced by hiding navigation links. Every consequential
 * read and write in the platform routes through `canAccess`, which evaluates
 * role permissions (RBAC) together with ward, department, domain and
 * classification attributes (ABAC).
 */

export type ResourceType =
  | 'ward'
  | 'department'
  | 'project'
  | 'budget'
  | 'revenue'
  | 'procurement'
  | 'security'
  | 'ai'
  | 'ai-governance'
  | 'evidence'
  | 'decision'
  | 'incident'
  | 'alert'
  | 'intelligence'
  | 'action'
  | 'audit'
  | 'dataset'
  | 'connector'
  | 'platform'
  | 'administration'
  | 'situation-room'
  | 'report'

function build$RESOURCE_LABEL(): Record<ResourceType, string> {
  return {
  ward: t('Ward'),
  department: t('Department'),
  project: t('Project'),
  budget: t('Budget'),
  revenue: t('Revenue'),
  procurement: t('Procurement'),
  security: t('Security'),
  ai: t('AI Workspace'),
  'ai-governance': t('AI Governance'),
  evidence: t('Evidence'),
  decision: t('Decision'),
  incident: t('Incident'),
  alert: t('Alert'),
  intelligence: t('Intelligence'),
  action: t('Action'),
  audit: t('Audit'),
  dataset: t('Dataset'),
  connector: t('Connector'),
  platform: t('Platform'),
  administration: t('Administration'),
  'situation-room': t('Situation Room'),
  report: t('Report'),
}
}
export let RESOURCE_LABEL: Record<ResourceType, string> = build$RESOURCE_LABEL()
registerLayer(() => {
  RESOURCE_LABEL = build$RESOURCE_LABEL()
})

export type ActionType =
  | 'view'
  | 'create'
  | 'edit'
  | 'approve'
  | 'assign'
  | 'escalate'
  | 'export'
  | 'administer'

function build$ACTION_LABEL(): Record<ActionType, string> {
  return {
  view: t('View'),
  create: t('Create'),
  edit: t('Edit'),
  approve: t('Approve'),
  assign: t('Assign'),
  escalate: t('Escalate'),
  export: t('Export'),
  administer: t('Administer'),
}
}
export let ACTION_LABEL: Record<ActionType, string> = build$ACTION_LABEL()
registerLayer(() => {
  ACTION_LABEL = build$ACTION_LABEL()
})

/** Permission identifiers follow `resource:action`. */
export type PermissionId = `${ResourceType}:${ActionType}`

export function permission(resource: ResourceType, action: ActionType): PermissionId {
  return `${resource}:${action}`
}

/** Wildcard granting every action on a resource. */
export function allActions(resource: ResourceType): PermissionId[] {
  return (Object.keys(ACTION_LABEL) as ActionType[]).map((a) => permission(resource, a))
}

/** Read-only grant across a set of resources. */
export function viewOnly(...resources: ResourceType[]): PermissionId[] {
  return resources.map((r) => permission(r, 'view'))
}

/** Operational grant: read, act on and progress work, but not administer. */
export function operate(...resources: ResourceType[]): PermissionId[] {
  return resources.flatMap((r) => [
    permission(r, 'view'),
    permission(r, 'create'),
    permission(r, 'edit'),
    permission(r, 'assign'),
    permission(r, 'escalate'),
  ])
}

/** Context supplied at the point of an access check. */
export interface AccessContext {
  wardId?: string
  wardIds?: string[]
  departmentId?: string
  departmentIds?: string[]
  domain?: IntelligenceDomain
  classification?: DataClassification
  /** Set when the subject is acting on a record they own. */
  ownerId?: string
}

export interface AccessDecision {
  allowed: boolean
  /** Institutional explanation, surfaced in access denial screens and audit. */
  reason: string
  /** Which check produced the outcome - useful for access governance review. */
  basis:
    | 'role-permission'
    | 'ward-scope'
    | 'department-scope'
    | 'domain-scope'
    | 'classification-ceiling'
    | 'granted'
    | 'unknown-role'
}

/** A denial that is safe to render to the subject. */
export const DENY_TEMPLATE: Record<AccessDecision['basis'], string> = {
  'role-permission': 'The assigned role does not hold this permission.',
  'ward-scope': 'This record falls outside your authorised ward scope.',
  'department-scope': 'This record falls outside your authorised department scope.',
  'domain-scope': 'This intelligence domain is not within your authorised scope.',
  'classification-ceiling': 'The classification of this record exceeds your authorised ceiling.',
  granted: 'Access granted.',
  'unknown-role': 'No role definition could be resolved for this principal.',
}

/** Roles permitted to act as an approving authority on decision cases. */
export const APPROVING_ROLES: RoleId[] = [
  'municipal-commissioner',
  'additional-commissioner',
  'deputy-commissioner',
  'department-head',
  'chief-engineer',
  'finance-officer',
]

/**
 * High-impact operations that always require an explicit, visible human
 * confirmation step regardless of role. AI never performs any of these.
 */
function build$HUMAN_CONFIRMATION_REQUIRED(): ReadonlyArray<{
  id: string
  label: string
  rationale: string
}> {
  return [
  { id: 'approve-expenditure', label: t('Approve municipal expenditure'), rationale: t('Financial authority rests with a named officer.') },
  { id: 'sanction-payment', label: t('Sanction contractor payment'), rationale: t('Payment release requires human verification of delivery.') },
  { id: 'impose-penalty', label: t('Impose penalty or recovery'), rationale: t('Penal action requires due process and human authority.') },
  { id: 'approve-procurement', label: t('Approve procurement award'), rationale: t('Procurement decisions require the competent authority.') },
  { id: 'amend-official-record', label: t('Amend an official record'), rationale: t('Source systems remain authoritative; changes are made there.') },
  { id: 'issue-order', label: t('Issue a government order'), rationale: t('Orders are issued only by an authorised officer.') },
  { id: 'reject-eligibility', label: t('Reject citizen eligibility'), rationale: t('Citizen-affecting determinations require human adjudication.') },
]
}
export let HUMAN_CONFIRMATION_REQUIRED: ReadonlyArray<{
  id: string
  label: string
  rationale: string
}> = build$HUMAN_CONFIRMATION_REQUIRED()
registerLayer(() => {
  HUMAN_CONFIRMATION_REQUIRED = build$HUMAN_CONFIRMATION_REQUIRED()
})
