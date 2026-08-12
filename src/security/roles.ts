import { CLASSIFICATION_ORDER } from '@/types/common'
import type { Role, RoleId } from '@/types/organisation'
import { allActions, operate, permission, viewOnly, type PermissionId } from './model'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Institutional role catalogue.
 *
 * Roles determine which permissions a principal holds; the principal's
 * AccessScope determines which wards, departments and domains those
 * permissions apply to. Both are evaluated together by `canAccess`.
 */

const COMMON_READ: PermissionId[] = viewOnly('intelligence', 'alert', 'evidence', 'ward', 'department', 'report')

function build$ROLES(): Record<RoleId, Role> {
  return {
  'municipal-commissioner': {
    id: 'municipal-commissioner',
    name: t('Municipal Commissioner'),
    description:
      t('Chief executive authority of the corporation. City-wide intelligence, decision approval and escalation authority across every domain.'),
    band: 'executive',
    maxClassification: 'restricted',
    landingRoute: '/command/cockpit',
    permissionIds: [
      ...allActions('intelligence'),
      ...allActions('decision'),
      ...allActions('incident'),
      ...allActions('alert'),
      ...allActions('action'),
      ...allActions('project'),
      ...allActions('budget'),
      ...allActions('revenue'),
      ...allActions('procurement'),
      ...allActions('ward'),
      ...allActions('department'),
      ...allActions('report'),
      ...operate('situation-room'),
      // Administration is READ ONLY here, and deliberately so. The chief
      // executive of the corporation must be able to see how their own
      // deployment is configured - who holds which role, which connectors feed
      // which domain, what the notification and retention policy is - because
      // they answer for it. Changing any of it remains with the Security
      // Administrator, who is the only holder of `allActions('administration')`.
      // Nothing enforces that split by hiding a link: `admin.service.ts`
      // exposes no mutating method at all, and every one of its reads asserts
      // this same permission.
      ...viewOnly(
        'evidence', 'audit', 'ai', 'ai-governance', 'security', 'dataset', 'connector', 'platform',
        'administration',
      ),
      permission('ai', 'create'),
      permission('evidence', 'export'),
      permission('audit', 'export'),
    ],
  },

  'additional-commissioner': {
    id: 'additional-commissioner',
    name: t('Additional Municipal Commissioner'),
    description:
      t('Senior executive with delegated authority across assigned zones and departments. Approves decision cases within delegated financial limits.'),
    band: 'executive',
    maxClassification: 'confidential',
    landingRoute: '/command/executive',
    permissionIds: [
      ...allActions('intelligence'),
      ...operate('decision', 'incident', 'alert', 'action', 'project'),
      permission('decision', 'approve'),
      ...viewOnly('budget', 'revenue', 'procurement', 'evidence', 'audit', 'ai', 'ward', 'department', 'report'),
      permission('report', 'export'),
      permission('ai', 'create'),
      ...operate('situation-room'),
    ],
  },

  'deputy-commissioner': {
    id: 'deputy-commissioner',
    name: t('Deputy Municipal Commissioner'),
    description:
      t('Zone-level executive responsible for the wards within an administrative zone. Coordinates ward officers and department field operations.'),
    band: 'senior',
    maxClassification: 'confidential',
    landingRoute: '/command/executive',
    permissionIds: [
      ...operate('intelligence', 'decision', 'incident', 'alert', 'action'),
      ...viewOnly('project', 'budget', 'evidence', 'ward', 'department', 'report', 'ai'),
      permission('ai', 'create'),
      ...operate('situation-room'),
    ],
  },

  'ward-officer': {
    id: 'ward-officer',
    name: t('Ward Officer'),
    description:
      t('Field executive accountable for service delivery within a single ward. Scope is restricted to the assigned ward across all domains.'),
    band: 'operational',
    maxClassification: 'internal',
    landingRoute: '/city/wards',
    permissionIds: [
      ...operate('intelligence', 'alert', 'action', 'incident'),
      ...viewOnly('ward', 'project', 'evidence', 'department', 'report', 'ai'),
      permission('ai', 'create'),
      permission('decision', 'view'),
      permission('decision', 'create'),
    ],
  },

  'department-head': {
    id: 'department-head',
    name: t('Department Head'),
    description:
      t('Head of a municipal department. Full operational authority within the department across all wards it serves.'),
    band: 'senior',
    maxClassification: 'confidential',
    landingRoute: '/command/executive',
    permissionIds: [
      ...operate('intelligence', 'decision', 'incident', 'alert', 'action', 'project'),
      permission('decision', 'approve'),
      ...viewOnly('budget', 'procurement', 'evidence', 'ward', 'department', 'report', 'ai'),
      permission('ai', 'create'),
      permission('report', 'export'),
    ],
  },

  'chief-engineer': {
    id: 'chief-engineer',
    name: t('Chief Engineer'),
    description:
      t('Technical authority for infrastructure delivery. Owns project, asset and contract intelligence across engineering departments.'),
    band: 'senior',
    maxClassification: 'confidential',
    landingRoute: '/governance/projects',
    permissionIds: [
      ...operate('project', 'intelligence', 'action', 'decision', 'incident'),
      permission('decision', 'approve'),
      ...viewOnly('procurement', 'budget', 'evidence', 'ward', 'department', 'alert', 'report', 'ai'),
      permission('ai', 'create'),
      permission('alert', 'assign'),
      permission('report', 'export'),
    ],
  },

  'finance-officer': {
    id: 'finance-officer',
    name: t('Finance Officer'),
    description:
      t('Accountable for municipal budget, revenue and procurement intelligence. No operational authority over field domains.'),
    band: 'senior',
    maxClassification: 'confidential',
    landingRoute: '/governance/budget',
    permissionIds: [
      ...operate('budget', 'revenue', 'procurement'),
      permission('budget', 'approve'),
      permission('budget', 'export'),
      permission('revenue', 'export'),
      ...operate('decision', 'action'),
      ...viewOnly('project', 'evidence', 'intelligence', 'alert', 'ward', 'department', 'report', 'ai', 'audit'),
      permission('ai', 'create'),
      permission('report', 'export'),
    ],
  },

  'disaster-management-officer': {
    id: 'disaster-management-officer',
    name: t('Disaster Management Officer'),
    description:
      t('Leads the disaster management cell. Owns the Situation Room, monsoon preparedness and emergency incident response.'),
    band: 'senior',
    maxClassification: 'confidential',
    landingRoute: '/command/situation-room',
    permissionIds: [
      ...allActions('incident'),
      ...allActions('situation-room'),
      ...operate('intelligence', 'alert', 'action', 'decision'),
      ...viewOnly('ward', 'department', 'evidence', 'project', 'report', 'ai'),
      permission('ai', 'create'),
      permission('report', 'export'),
    ],
  },

  'health-officer': {
    id: 'health-officer',
    name: t('Executive Health Officer'),
    description:
      t('Leads public health intelligence and hospital operations. Works exclusively with aggregate health indicators.'),
    band: 'senior',
    maxClassification: 'confidential',
    landingRoute: '/city/health',
    permissionIds: [
      ...operate('intelligence', 'alert', 'action', 'incident', 'decision'),
      ...viewOnly('ward', 'department', 'evidence', 'project', 'budget', 'report', 'ai'),
      permission('ai', 'create'),
      permission('report', 'export'),
    ],
  },

  analyst: {
    id: 'analyst',
    name: t('Municipal Analyst'),
    description:
      t('Produces analysis and briefs. May create intelligence and decision drafts but holds no approval authority.'),
    band: 'operational',
    maxClassification: 'internal',
    landingRoute: '/command/executive',
    permissionIds: [
      ...COMMON_READ,
      permission('intelligence', 'create'),
      permission('decision', 'view'),
      permission('decision', 'create'),
      permission('action', 'view'),
      permission('project', 'view'),
      permission('budget', 'view'),
      permission('revenue', 'view'),
      permission('ai', 'view'),
      permission('ai', 'create'),
      permission('report', 'export'),
    ],
  },

  operator: {
    id: 'operator',
    name: t('Control Room Operator'),
    description:
      t('Staffs the operations control room. Acknowledges alerts, logs field updates and progresses incidents.'),
    band: 'operational',
    maxClassification: 'internal',
    landingRoute: '/command/situation-room',
    permissionIds: [
      ...COMMON_READ,
      ...operate('incident'),
      permission('alert', 'edit'),
      permission('alert', 'assign'),
      permission('alert', 'escalate'),
      permission('action', 'view'),
      permission('action', 'edit'),
      permission('situation-room', 'view'),
      permission('situation-room', 'edit'),
    ],
  },

  auditor: {
    id: 'auditor',
    name: t('Municipal Auditor'),
    description:
      t('Independent assurance function. Read-only visibility across decisions, evidence, finance and the full audit record.'),
    band: 'oversight',
    maxClassification: 'confidential',
    landingRoute: '/trust/evidence-audit',
    permissionIds: [
      ...viewOnly(
        'intelligence',
        'decision',
        'evidence',
        'audit',
        'budget',
        'revenue',
        'procurement',
        'project',
        'ward',
        'department',
        'dataset',
        'alert',
        'incident',
        'action',
        'report',
        'ai',
        'ai-governance',
      ),
      permission('audit', 'export'),
      permission('evidence', 'export'),
      permission('report', 'export'),
    ],
  },

  'security-administrator': {
    id: 'security-administrator',
    name: t('Security Administrator'),
    description:
      t('Owns platform security posture, identity, access policy and security event response. No operational municipal data authority.'),
    band: 'oversight',
    maxClassification: 'restricted',
    landingRoute: '/trust/security',
    permissionIds: [
      ...allActions('security'),
      ...allActions('administration'),
      ...viewOnly('audit', 'dataset', 'connector', 'platform', 'ai-governance', 'department', 'ward', 'report'),
      permission('audit', 'export'),
      permission('connector', 'administer'),
      permission('platform', 'administer'),
    ],
  },

  /**
   * An elected member of the Corporation.
   *
   * This role exists to make a distinction the platform previously could not
   * express: a corporator is not a junior officer. They hold NO operational
   * authority - no permission to create, edit, assign, escalate or approve
   * anything - because administrative action is the Commissioner's, and a
   * platform that let an elected member act directly on a municipal record
   * would be describing an institution that does not exist.
   *
   * What they do hold is sight. The matters before the house they sit in, the
   * ward they were elected from, and the published intelligence behind both.
   * The classification ceiling is `internal`: a corporator is not an officer
   * of the corporation for the purpose of confidential departmental material.
   */
  corporator: {
    id: 'corporator',
    name: t('Corporator'),
    description:
      t('Elected member of the Corporation. Sight of the matters before the house and of their own ward, with no administrative authority over any municipal record.'),
    band: 'oversight',
    maxClassification: 'internal',
    landingRoute: '/council/resolutions',
    permissionIds: [
      ...viewOnly('intelligence', 'ward', 'department', 'report', 'project', 'budget', 'alert', 'decision'),
      permission('report', 'export'),
    ],
  },

  'ai-governance-officer': {
    id: 'ai-governance-officer',
    name: t('AI Governance Officer'),
    description:
      t('Accountable for model approval, prompt governance, AI risk and human oversight of every AI-assisted recommendation.'),
    band: 'oversight',
    maxClassification: 'confidential',
    landingRoute: '/trust/ai-governance',
    permissionIds: [
      ...allActions('ai-governance'),
      ...operate('ai'),
      permission('ai', 'approve'),
      ...viewOnly('audit', 'intelligence', 'decision', 'evidence', 'dataset', 'department', 'ward', 'report', 'platform'),
      permission('report', 'export'),
    ],
  },
}
}
export let ROLES: Record<RoleId, Role> = build$ROLES()
registerLayer(() => {
  ROLES = build$ROLES()
})

export const ROLE_LIST: Role[] = Object.values(ROLES)

export function getRole(roleId: RoleId): Role | undefined {
  return ROLES[roleId]
}

/** Roles ordered for presentation in access governance tables. */
const BAND_ORDER: Record<Role['band'], number> = {
  executive: 0,
  senior: 1,
  operational: 2,
  oversight: 3,
}

export const ROLES_ORDERED: Role[] = [...ROLE_LIST].sort((a, b) => {
  const band = BAND_ORDER[a.band] - BAND_ORDER[b.band]
  if (band !== 0) return band
  return CLASSIFICATION_ORDER[b.maxClassification] - CLASSIFICATION_ORDER[a.maxClassification]
})
