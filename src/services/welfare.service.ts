import { ACCESSIBILITY_AUDITS, WELFARE_SCHEMES, WELFARE_TREND } from '@/data/welfare.data'
import { filterByScope } from '@/security/access'
import type { AccessibilityAudit, WelfareScheme, WelfareTrendPoint } from '@/types/welfare'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/welfare.service.ts
 *
 * Social welfare and accessibility - function 9 of the Twelfth Schedule, and
 * the accessibility duty under sections 40 to 46 of the Rights of Persons with
 * Disabilities Act, 2016.
 *
 * Two registers, gated differently because they are scoped differently.
 *
 * SCHEMES are corporation-wide instruments. A pension scheme is not
 * administered ward by ward, so there is no ward dimension to scope against and
 * the gate is `resource: 'intelligence'` + `domain: 'welfare'`. What the gate
 * protects is the coverage gap itself - the eligible residents a scheme is not
 * reaching - because that figure is the corporation's own admission of who it
 * is failing, and it belongs to the officers accountable for closing it rather
 * than to anyone who happens to be signed in.
 *
 * ACCESSIBILITY AUDITS attach to a named municipal facility in a named ward, so
 * they are gated on `resource: 'ward'` + `domain: 'welfare'` in the ordinary
 * way. A ward officer sees the estate they are answerable for.
 *
 * NO BENEFICIARY PASSES THROUGH THIS SEAM. The methods below return schemes and
 * facilities. There is no method that returns a person, because there is no
 * person in the layer beneath - no name, no age, no disability, no bank
 * account, no entitlement determination. If a future adapter is pointed at a
 * real welfare department system, that constraint holds at this boundary: the
 * corporation's administration of its schemes is reportable, and the residents
 * on their rolls are not.
 */

/**
 * The corporation's welfare schemes with their coverage position - eligible,
 * enrolled, paid, delayed and in arrears. Optionally narrowed to one family of
 * benefit.
 */
async function schemes(user: User | null, kind?: WelfareScheme['kind']): Promise<WelfareScheme[]> {
  await simulateLatency(`welfare.schemes:${kind ?? 'all'}`)
  const base = kind ? WELFARE_SCHEMES.filter((s) => s.kind === kind) : WELFARE_SCHEMES
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, () => ({ domain: 'welfare' }), 'intelligence')
  return deepClone(visible)
}

/**
 * The corporation's own accessibility position against the harmonised
 * guidelines, facility by facility. Ward-scoped, because the estate is.
 */
async function accessibilityAudits(user: User | null, wardId?: string): Promise<AccessibilityAudit[]> {
  await simulateLatency(`welfare.accessibility:${wardId ?? 'all'}`)
  const base = wardId ? ACCESSIBILITY_AUDITS.filter((a) => a.wardId === wardId) : ACCESSIBILITY_AUDITS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (a) => ({ wardId: a.wardId, domain: 'welfare' }), 'ward')
  return deepClone(visible)
}

/** City-wide monthly disbursement and new enrolments. Aggregate by
 *  construction - there is no ward dimension to scope, and no beneficiary
 *  record behind it. */
async function trend(user: User | null): Promise<WelfareTrendPoint[]> {
  await simulateLatency('welfare.trend')
  if (!user) return []
  return deepClone(WELFARE_TREND)
}

export const welfareService = {
  schemes,
  accessibilityAudits,
  trend,
}
