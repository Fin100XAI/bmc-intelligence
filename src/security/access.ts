import { CLASSIFICATION_ORDER, type DataClassification, type IntelligenceDomain } from '@/types/common'
import type { AccessScope, User } from '@/types/organisation'
import {
  DENY_TEMPLATE,
  permission,
  type AccessContext,
  type AccessDecision,
  type ActionType,
  type ResourceType,
} from './model'
import { getRole } from './roles'
import { t } from '@/i18n'

/**
 * The single access authority for the platform.
 *
 * Every guarded read, action button, route and data service call resolves
 * through this function. Frontend link hiding is a presentation convenience
 * only - it is never the enforcement mechanism.
 */
export function canAccess(
  user: User | null,
  resource: ResourceType,
  action: ActionType,
  context: AccessContext = {},
): AccessDecision {
  if (!user) {
    return { allowed: false, reason: t('No authenticated principal.'), basis: 'unknown-role' }
  }

  const role = getRole(user.roleId)
  if (!role) {
    return { allowed: false, reason: DENY_TEMPLATE['unknown-role'], basis: 'unknown-role' }
  }

  // --- 1. RBAC: does the role hold the permission at all? -----------------
  const required: string = permission(resource, action)
  if (!role.permissionIds.includes(required)) {
    return {
      allowed: false,
      reason: t('{0} does not hold "{1}:{2}". {3}', role.name, resource, action, DENY_TEMPLATE['role-permission']),
      basis: 'role-permission',
    }
  }

  // --- 2. ABAC: classification ceiling ------------------------------------
  if (context.classification && !withinClassification(role.maxClassification, context.classification)) {
    return {
      allowed: false,
      reason: t('{0} Ceiling: {1}; record: {2}.', DENY_TEMPLATE['classification-ceiling'], role.maxClassification, context.classification),
      basis: 'classification-ceiling',
    }
  }

  // --- 3. ABAC: ward scope -------------------------------------------------
  const wardIds = context.wardIds ?? (context.wardId ? [context.wardId] : [])
  if (wardIds.length > 0 && !scopeAllowsAny(user.scope.wardIds, wardIds)) {
    return { allowed: false, reason: DENY_TEMPLATE['ward-scope'], basis: 'ward-scope' }
  }

  // --- 4. ABAC: department scope ------------------------------------------
  const departmentIds = context.departmentIds ?? (context.departmentId ? [context.departmentId] : [])
  if (departmentIds.length > 0 && !scopeAllowsAny(user.scope.departmentIds, departmentIds)) {
    return { allowed: false, reason: DENY_TEMPLATE['department-scope'], basis: 'department-scope' }
  }

  // --- 5. ABAC: domain scope ----------------------------------------------
  if (context.domain && !domainAllowed(user.scope, context.domain)) {
    return { allowed: false, reason: DENY_TEMPLATE['domain-scope'], basis: 'domain-scope' }
  }

  return { allowed: true, reason: DENY_TEMPLATE.granted, basis: 'granted' }
}

/** Boolean convenience wrapper for conditional rendering. */
export function allowed(
  user: User | null,
  resource: ResourceType,
  action: ActionType,
  context: AccessContext = {},
): boolean {
  return canAccess(user, resource, action, context).allowed
}

/** True when the subject's ceiling covers the record classification. */
export function withinClassification(
  ceiling: DataClassification,
  recordClassification: DataClassification,
): boolean {
  return CLASSIFICATION_ORDER[recordClassification] <= CLASSIFICATION_ORDER[ceiling]
}

/** The subject's maximum readable classification. */
export function classificationCeiling(user: User | null): DataClassification {
  if (!user) return 'public'
  return getRole(user.roleId)?.maxClassification ?? 'public'
}

function scopeAllowsAny(scope: string[] | '*', candidates: string[]): boolean {
  if (scope === '*') return true
  if (candidates.length === 0) return true
  return candidates.some((c) => scope.includes(c))
}

function domainAllowed(scope: AccessScope, domain: IntelligenceDomain): boolean {
  if (scope.domains === '*') return true
  return scope.domains.includes(domain)
}

/**
 * Filters a collection down to the records the subject may actually read.
 * Used by the demonstration data services so that scope is enforced in the
 * data layer, not merely in the interface.
 */
export function filterByScope<T>(
  user: User | null,
  records: T[],
  accessor: (record: T) => AccessContext,
  resource: ResourceType = 'intelligence',
): T[] {
  if (!user) return []
  return records.filter((record) => canAccess(user, resource, 'view', accessor(record)).allowed)
}

/** Human-readable summary of the subject's scope, shown in the context bar. */
export function describeScope(user: User | null, wardName?: (id: string) => string): string {
  if (!user) return 'No scope'
  const wardPart =
    user.scope.wardIds === '*'
      ? 'All wards'
      : user.scope.wardIds.length === 1
        ? (wardName?.(user.scope.wardIds[0] ?? '') ?? user.scope.wardIds[0] ?? 'One ward')
        : `${user.scope.wardIds.length} wards`
  const deptPart =
    user.scope.departmentIds === '*' ? 'all departments' : `${user.scope.departmentIds.length} departments`
  return `${wardPart} · ${deptPart}`
}

/** Every permission held by a role, expanded for the access governance page. */
export function expandPermissions(user: User | null): string[] {
  if (!user) return []
  return getRole(user.roleId)?.permissionIds ?? []
}
