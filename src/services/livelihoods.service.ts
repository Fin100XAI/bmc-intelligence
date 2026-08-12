import { LIVELIHOOD_CENTRES, LIVELIHOOD_TREND, VENDOR_ZONES } from '@/data/livelihoods.data'
import { filterByScope } from '@/security/access'
import type { LivelihoodCentre, LivelihoodTrendPoint, VendorZone } from '@/types/livelihoods'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/livelihoods.service.ts
 *
 * Urban livelihoods and poverty alleviation - function 11 of the Twelfth
 * Schedule - gated on `resource: 'ward'` + `domain: 'livelihoods'`.
 *
 * Two statutory frames sit behind this service. DAY-NULM (the Deendayal
 * Antyodaya Yojana - National Urban Livelihoods Mission) governs skill
 * training and placement, self-help group formation and bank linkage, and
 * shelters for the urban homeless. The Street Vendors (Protection of
 * Livelihood and Regulation of Street Vending) Act, 2014 governs the vending
 * register and the certificate of vending.
 *
 * What the certificate figures mean. Under the 2014 Act a certificate of
 * vending is an ENTITLEMENT once the statutory survey is complete - issuing it
 * is the corporation's duty, not a favour it grants. The gap this service
 * reports between vendors on the register and certificates in their hands is
 * therefore a measure of the corporation's own statutory non-compliance. It
 * says nothing whatever about the vendors.
 *
 * What the training figures mean. `trainedLast12m` on its own flatters a
 * programme; `placedInWorkPct` is the figure that carries weight, because
 * training that does not end in work is expenditure without outcome.
 *
 * THE UNIT OF RECORD IS THE FACILITY, NEVER THE PERSON. No beneficiary
 * register, no income assessment, no eligibility determination and no name is
 * held anywhere behind this service. The residents this function exists to
 * serve are among the least able to contest a record held about them, so the
 * shape refuses to hold one rather than relying on anyone's restraint.
 */

/** Skill training centres, shelters, vending plazas, SHG federations and
 *  livelihood centres within the principal's authorised ward scope. */
async function centres(user: User | null, wardId?: string): Promise<LivelihoodCentre[]> {
  await simulateLatency(`livelihoods.centres:${wardId ?? 'all'}`)
  const base = wardId ? LIVELIHOOD_CENTRES.filter((c) => c.wardId === wardId) : LIVELIHOOD_CENTRES
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (c) => ({ wardId: c.wardId, domain: 'livelihoods' }), 'ward')
  return deepClone(visible)
}

/** Vending zones under the Street Vendors Act, 2014, with the survey and Town
 *  Vending Committee position each carries. */
async function vendorZones(user: User | null, wardId?: string): Promise<VendorZone[]> {
  await simulateLatency(`livelihoods.vendorZones:${wardId ?? 'all'}`)
  const base = wardId ? VENDOR_ZONES.filter((z) => z.wardId === wardId) : VENDOR_ZONES
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (z) => ({ wardId: z.wardId, domain: 'livelihoods' }), 'ward')
  return deepClone(visible)
}

/** City-wide monthly training, placement and certificate issue. Aggregate by
 *  construction - there is no ward dimension to scope and no person-level
 *  record behind it. */
async function trend(user: User | null): Promise<LivelihoodTrendPoint[]> {
  await simulateLatency('livelihoods.trend')
  if (!user) return []
  return deepClone(LIVELIHOOD_TREND)
}

export const livelihoodsService = {
  centres,
  vendorZones,
  trend,
}
