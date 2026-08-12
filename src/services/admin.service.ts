import { DEMO_USERS } from '@/auth/demo-users'
import { municipality } from '@/config/municipality.config'
import { ACCESS_POLICIES, CONNECTORS } from '@/data/governance.data'
import { DATA_SOURCES } from '@/data/data-sources.data'
import { DEPARTMENTS_ORDERED, WARDS } from '@/data/reference'
import { ROLES_ORDERED } from '@/security/roles'
import type { IntelligenceDomain } from '@/types/common'
import type { AccessPolicy, Connector, DataSource } from '@/types/governance'
import type { NotificationType } from '@/types/intelligence'
import type { Department, Role, RoleId, User, Ward } from '@/types/organisation'
import { TRANSPORT_MODE, assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/services/admin.service.ts
 *
 * Platform administration. `resource: 'administration'` is held only by
 * `security-administrator` in `src/security/roles.ts` - deliberately: this
 * is the identity/role/department/ward *management* surface, distinct from
 * the read-only operational views the same data feeds elsewhere (e.g.
 * `ward.service.list`, gated on `resource: 'ward'`, is broadly readable;
 * `admin.service.wards`, gated on `resource: 'administration'`, is not).
 * `policies` and `connectors` reuse their own resources (`'security'`,
 * `'connector'`) since those already exist and are held more broadly.
 */

export interface NotificationRule {
  id: string
  type: NotificationType
  description: string
  recipientRoleIds: RoleId[]
  channel: 'in-app' | 'email' | 'sms'
  enabled: boolean
}

export interface PlatformSettings {
  tenantId: string
  municipalityName: string
  environmentLabel: string
  dataProvenanceStatement: string
  financialYear: string
  enabledModules: IntelligenceDomain[]
  transportMode: typeof TRANSPORT_MODE
}

function build$NOTIFICATION_RULES(): NotificationRule[] {
  return [
  {
    id: 'rule-assignment',
    type: 'assignment',
    description: t('Notify the assigned officer when an action, intelligence item or alert is assigned to them.'),
    recipientRoleIds: ['ward-officer', 'department-head', 'chief-engineer'],
    channel: 'in-app',
    enabled: true,
  },
  {
    id: 'rule-escalation',
    type: 'escalation',
    description: t('Notify the escalation authority when an alert is escalated.'),
    recipientRoleIds: ['municipal-commissioner', 'additional-commissioner', 'department-head'],
    channel: 'in-app',
    enabled: true,
  },
  {
    id: 'rule-decision-required',
    type: 'decision-required',
    description: t('Notify the competent authority when a decision case enters review.'),
    recipientRoleIds: ['municipal-commissioner', 'additional-commissioner', 'department-head'],
    channel: 'in-app',
    enabled: true,
  },
  {
    id: 'rule-critical-alert',
    type: 'critical-alert',
    description: t('Notify executive and disaster management roles immediately on a critical-severity alert.'),
    recipientRoleIds: ['municipal-commissioner', 'disaster-management-officer', 'additional-commissioner'],
    channel: 'in-app',
    enabled: true,
  },
  {
    id: 'rule-sla-warning',
    type: 'sla-warning',
    description: t('Warn accountable officers as an alert approaches SLA breach.'),
    recipientRoleIds: ['municipal-commissioner', 'ward-officer', 'department-head', 'operator'],
    channel: 'in-app',
    enabled: true,
  },
  {
    id: 'rule-ai-recommendation',
    type: 'ai-recommendation',
    description: t('Notify the relevant oversight role when an AI recommendation awaits human review.'),
    recipientRoleIds: ['municipal-commissioner', 'disaster-management-officer', 'ai-governance-officer'],
    channel: 'in-app',
    enabled: true,
  },
  {
    id: 'rule-security-event',
    type: 'security-event',
    description: t('Notify security and audit roles when a security event is recorded.'),
    recipientRoleIds: ['security-administrator', 'auditor', 'municipal-commissioner'],
    channel: 'in-app',
    enabled: true,
  },
]
}
let NOTIFICATION_RULES: NotificationRule[] = build$NOTIFICATION_RULES()
registerLayer(() => {
  NOTIFICATION_RULES = build$NOTIFICATION_RULES()
})

async function users(user: User | null): Promise<User[]> {
  await simulateLatency('admin.users')
  const authed = assertAccess(user, 'administration', 'view', {}, {
    resourceType: 'User',
    resourceId: 'all',
    resourceLabel: 'User roster',
  })
  return deepClone(scopeToTenant(authed, DEMO_USERS))
}

async function roles(user: User | null): Promise<Role[]> {
  await simulateLatency('admin.roles')
  assertAccess(user, 'administration', 'view', {}, {
    resourceType: 'Role',
    resourceId: 'all',
    resourceLabel: 'Role catalogue',
  })
  return deepClone(ROLES_ORDERED)
}

async function departments(user: User | null): Promise<Department[]> {
  await simulateLatency('admin.departments')
  const authed = assertAccess(user, 'administration', 'view', {}, {
    resourceType: 'Department',
    resourceId: 'all',
    resourceLabel: 'Department register',
  })
  return deepClone(scopeToTenant(authed, DEPARTMENTS_ORDERED))
}

async function wards(user: User | null): Promise<Ward[]> {
  await simulateLatency('admin.wards')
  const authed = assertAccess(user, 'administration', 'view', {}, {
    resourceType: 'Ward',
    resourceId: 'all',
    resourceLabel: 'Ward register',
  })
  return deepClone(scopeToTenant(authed, WARDS))
}

async function policies(user: User | null): Promise<AccessPolicy[]> {
  await simulateLatency('admin.policies')
  const authed = assertAccess(user, 'security', 'view', {}, {
    resourceType: 'Access Policy',
    resourceId: 'all',
    resourceLabel: 'Access policy register',
  })
  return deepClone(scopeToTenant(authed, ACCESS_POLICIES))
}

async function connectors(user: User | null): Promise<Connector[]> {
  await simulateLatency('admin.connectors')
  const authed = assertAccess(user, 'connector', 'view', {}, {
    resourceType: 'Connector',
    resourceId: 'all',
    resourceLabel: 'Connector registry',
  })
  return deepClone(scopeToTenant(authed, CONNECTORS))
}

async function dataSources(user: User | null): Promise<DataSource[]> {
  await simulateLatency('admin.dataSources')
  assertAccess(user, 'connector', 'view', {}, {
    resourceType: 'Data Source',
    resourceId: 'all',
    resourceLabel: 'Data source register',
  })
  return deepClone(DATA_SOURCES)
}

async function notificationRules(user: User | null): Promise<NotificationRule[]> {
  await simulateLatency('admin.notificationRules')
  assertAccess(user, 'administration', 'view', {}, {
    resourceType: 'Notification Rule',
    resourceId: 'all',
    resourceLabel: 'Notification routing rules',
  })
  return deepClone(NOTIFICATION_RULES)
}

async function settings(user: User | null): Promise<PlatformSettings> {
  await simulateLatency('admin.settings')
  assertAccess(user, 'administration', 'view', {}, {
    resourceType: 'Platform Settings',
    resourceId: 'settings',
    resourceLabel: 'Platform settings',
  })
  return deepClone({
    tenantId: municipality.tenantId,
    municipalityName: municipality.municipalityName,
    environmentLabel: municipality.environmentLabel,
    dataProvenanceStatement: municipality.dataProvenanceStatement,
    financialYear: municipality.financialYear,
    enabledModules: municipality.enabledModules,
    transportMode: TRANSPORT_MODE,
  })
}

export const adminService = {
  users,
  roles,
  departments,
  wards,
  policies,
  connectors,
  dataSources,
  notificationRules,
  settings,
}
