import { LICENCE_REGISTERS } from '@/data/civic.data'
import { filterByScope } from '@/security/access'
import type { LicenceRegister } from '@/types/civic-services'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/licence.service.ts
 *
 * The licensing regime, gated on `resource: 'ward'` + `domain: 'licensing'`.
 *
 * The unit of record is the WARD AND CATEGORY - how many licences of a kind
 * are current, how many have lapsed, how long a decision takes, what was
 * demanded and what was collected. No individual licensee, trader or premises
 * appears anywhere in the model. The platform reports on the regime's
 * administration; naming a trader would make it an enforcement register, which
 * is a different instrument with a different legal basis.
 */

async function registers(user: User | null, wardId?: string): Promise<LicenceRegister[]> {
  await simulateLatency(`licence.registers:${wardId ?? 'all'}`)
  const base = wardId ? LICENCE_REGISTERS.filter((l) => l.wardId === wardId) : LICENCE_REGISTERS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (l) => ({ wardId: l.wardId, domain: 'licensing' }), 'ward')
  return deepClone(visible)
}

export const licenceService = {
  registers,
}
