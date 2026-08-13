import { ARBITRATION_MATTERS, LEGAL_CASES, LEGAL_POSITION, RTI_APPLICATIONS } from '@/data/legal.data'
import { filterByScope } from '@/security/access'
import type { ArbitrationMatter, CaseStatus, CaseType, LegalCase, LegalPosition, RtiApplication } from '@/types/legal'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/legal.service.ts
 *
 * The Law Department's docket - court matters, RTI applications and
 * contractor arbitration. Every method is read-only: this platform does not
 * model filing a case, deciding an RTI application or constituting a
 * tribunal, because none of those are administrative actions a municipal
 * intelligence surface should originate. What it can do is show a
 * Commissioner the standing docket the way the Law Department already holds
 * it.
 */

export interface LegalCaseFilters {
  caseType?: CaseType[]
  status?: CaseStatus[]
  search?: string
}

async function cases(user: User | null, filters: LegalCaseFilters = {}): Promise<LegalCase[]> {
  await simulateLatency(`legal.cases:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, LEGAL_CASES)
  const visible = filterByScope(
    user,
    scoped,
    (c) => ({ wardIds: c.wardIds, domain: 'legal', classification: c.classification, departmentId: c.departmentId }),
    'intelligence',
  )
  const filtered = visible.filter((c) => {
    if (filters.caseType && filters.caseType.length > 0 && !filters.caseType.includes(c.caseType)) return false
    if (filters.status && filters.status.length > 0 && !filters.status.includes(c.status)) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!c.subject.toLowerCase().includes(q) && !c.reference.toLowerCase().includes(q)) return false
    }
    return true
  })
  const sorted = [...filtered].sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1))
  return deepClone(sorted)
}

async function rtiApplications(user: User | null): Promise<RtiApplication[]> {
  await simulateLatency('legal.rti')
  const scoped = scopeToTenant(user, RTI_APPLICATIONS)
  const visible = filterByScope(
    user,
    scoped,
    (a) => ({ wardIds: a.wardId ? [a.wardId] : [], domain: 'legal', classification: a.classification, departmentId: a.departmentId }),
    'intelligence',
  )
  const sorted = [...visible].sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
  return deepClone(sorted)
}

async function arbitrationMatters(user: User | null): Promise<ArbitrationMatter[]> {
  await simulateLatency('legal.arbitration')
  const scoped = scopeToTenant(user, ARBITRATION_MATTERS)
  const visible = filterByScope(
    user,
    scoped,
    (a) => ({ wardIds: a.wardIds, domain: 'legal', classification: a.classification, departmentId: a.departmentId }),
    'intelligence',
  )
  const sorted = [...visible].sort((a, b) => (a.invokedAt < b.invokedAt ? 1 : -1))
  return deepClone(sorted)
}

async function position(user: User | null): Promise<LegalPosition> {
  await simulateLatency('legal.position')
  assertAccess(user, 'intelligence', 'view', { domain: 'legal' }, {
    resourceType: 'LegalPosition',
    resourceId: 'position',
    resourceLabel: 'Legal & litigation position',
  })
  return deepClone(LEGAL_POSITION)
}

export const legalService = {
  cases,
  rtiApplications,
  arbitrationMatters,
  position,
}
