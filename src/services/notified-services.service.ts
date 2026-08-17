import { NOTIFIED_SERVICES } from '@/data/notified-services.data'
import { filterByScope } from '@/security/access'
import type { NotifiedService } from '@/types/civic-services'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/notified-services.service.ts
 *
 * The Notified Services Register - every proactive statutory service a
 * citizen applies FOR, against its published turnaround, aggregated
 * city-wide and read across every issuing department at once. Gated on
 * `resource: 'intelligence'`, the same cross-department register pattern
 * `legalService` uses, because no single ward or department owns this list -
 * it is the corporation's own record of the notified-service estate it runs.
 *
 * No applicant, no application reference and no certificate content appears
 * anywhere behind this service. The unit of record is the SERVICE.
 */

async function list(user: User | null): Promise<NotifiedService[]> {
  await simulateLatency('notified-services.list')
  const scoped = scopeToTenant(user, NOTIFIED_SERVICES)
  const visible = filterByScope(
    user,
    scoped,
    (s) => ({ domain: s.domain, departmentId: s.departmentId }),
    'intelligence',
  )
  const sorted = [...visible].sort((a, b) => a.issuedWithinStatutoryPeriodPct - b.issuedWithinStatutoryPeriodPct)
  return deepClone(sorted)
}

export const notifiedServicesService = {
  list,
}
