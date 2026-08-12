import { MARKET_INSPECTION_TREND, MUNICIPAL_MARKETS } from '@/data/markets.data'
import { filterByScope } from '@/security/access'
import type { MarketInspectionTrendPoint, MunicipalMarket } from '@/types/markets'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/markets.service.ts
 *
 * Markets, slaughter houses and tanneries - Twelfth Schedule function 18 -
 * gated on `resource: 'ward'` + `domain: 'markets'`.
 *
 * This is a food-safety function before it is a revenue one. The corporation
 * collects rent from its market estate, but the duty the Constitution assigns
 * it is regulation of the trades carried on inside it, and an uninspected
 * slaughter house is a public-health exposure whether or not its licence fee
 * has cleared. The unit of record here is therefore the FACILITY and its
 * inspection interval - not the tenancy, not the receipt.
 *
 * The interval, not the count, is the control that matters: a rising
 * inspection total achieved by revisiting the same compliant markets leaves
 * exactly the same premises unvisited as no inspections at all. `facilities`
 * returns `lastInspectedAt` on every record precisely so the caller can
 * measure the gap rather than admire the total.
 *
 * NO TRADER IS HELD HERE. The register is one of premises and their condition
 * - stalls, occupancy, hygiene score, violations, effluent. It carries no
 * trader name, no licence holder, no tenancy record and no prosecution
 * subject, and it must not acquire one. Enforcement against a named individual
 * belongs in the licensing register under its own statutory safeguards, not in
 * a management platform.
 */

/**
 * The facility estate within the caller's authorised ward scope. Optionally
 * narrowed to one ward before scoping, which is how the ward-office view is
 * built without a second method.
 */
async function facilities(user: User | null, wardId?: string): Promise<MunicipalMarket[]> {
  await simulateLatency(`markets.facilities:${wardId ?? 'all'}`)
  const base = wardId ? MUNICIPAL_MARKETS.filter((m) => m.wardId === wardId) : MUNICIPAL_MARKETS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (m) => ({ wardId: m.wardId, domain: 'markets' }), 'ward')
  return deepClone(visible)
}

/** City-wide monthly inspection and enforcement record. Aggregate by
 *  construction - there is no ward dimension to scope, and no premises-level
 *  or trader-level record behind it. */
async function trend(user: User | null): Promise<MarketInspectionTrendPoint[]> {
  await simulateLatency('markets.trend')
  if (!user) return []
  return deepClone(MARKET_INSPECTION_TREND)
}

export const marketsService = {
  facilities,
  trend,
}
