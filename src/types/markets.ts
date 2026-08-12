import type { IsoDateTime, OperationalState, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/markets.ts
 *
 * Markets, slaughter houses and tanneries.
 *
 * Function 18 of the Twelfth Schedule reads "regulation of slaughter houses
 * and tanneries", and it is worth reading it as written: the duty assigned to
 * the corporation is REGULATION, not ownership. The municipal market estate -
 * the retail markets, the wholesale yards, the fish markets - sits alongside
 * it because the corporation happens to be the landlord there as well, but the
 * two duties are not the same duty and the platform should not let the rent
 * roll speak louder than the inspection record.
 *
 * THIS IS A FOOD-SAFETY FUNCTION BEFORE IT IS A REVENUE ONE. An uninspected
 * slaughter house is a public-health exposure sitting inside the city's meat
 * supply, and it stays one whether or not its licence fee has been paid. The
 * shape below therefore carries `lastInspectedAt` as a first-class field, not
 * an administrative footnote: the INSPECTION INTERVAL - not the inspection
 * count - is the control that matters, because a hundred inspections
 * concentrated on the same six compliant markets leave the same premises
 * unvisited as no inspections at all.
 *
 * `effluentCompliant` is where a slaughter house or a tannery stops being a
 * hygiene matter and becomes an environmental one as well. Both trades
 * discharge high-load organic and chemical effluent; where it is not treated
 * it reaches a nullah, and from there a creek. The field is meaningful for
 * those two kinds and for fish markets, and is recorded as compliant elsewhere
 * because a vegetable market has no trade effluent for the Pollution Control
 * Board to take an interest in.
 *
 * Figures are modelled demonstration data, as everywhere else in this
 * platform. No municipal licensing or inspection system is contacted.
 */

/* ==========================================================================
   Facility kinds
   ========================================================================== */

export type MarketKind = 'retail-market' | 'wholesale-market' | 'fish-market' | 'slaughterhouse' | 'tannery'

function build$MARKET_KIND_LABEL(): Record<MarketKind, string> {
  return {
  'retail-market': t('Retail Market'),
  'wholesale-market': t('Wholesale Market'),
  'fish-market': t('Fish Market'),
  slaughterhouse: t('Slaughter House'),
  tannery: t('Tannery'),
}
}
export let MARKET_KIND_LABEL: Record<MarketKind, string> = build$MARKET_KIND_LABEL()
registerLayer(() => {
  MARKET_KIND_LABEL = build$MARKET_KIND_LABEL()
})

/**
 * The kinds the corporation regulates rather than merely lets. Separated
 * because the two duties carry different consequences for failure: a vacant
 * stall costs the corporation rent, an unregulated slaughter house costs
 * somebody their health.
 */
export const REGULATED_TRADE_KINDS: readonly MarketKind[] = ['slaughterhouse', 'tannery']

/**
 * The interval beyond which a facility is treated as overdue for inspection.
 *
 * Ninety days is the working standard applied here rather than a figure lifted
 * from statute - the Food Safety and Standards Act sets frequency by risk
 * category rather than by a single number - and it is stated as a constant so
 * that a corporation adopting a tighter interval changes it in one place
 * instead of in every screen that counts against it.
 */
export const MARKET_INSPECTION_INTERVAL_DAYS = 90

/* ==========================================================================
   The facility record
   ========================================================================== */

export interface MunicipalMarket {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  kind: MarketKind
  /**
   * Trading stalls the facility is laid out for. For a slaughter house or a
   * tannery the figure is licensed operating bays rather than retail stalls -
   * the same unit of capacity, put to a different trade.
   */
  stalls: number
  /** Stalls or bays actually let and trading. Vacancy in a municipal market is
   *  a revenue question; vacancy in an abattoir is a diversion question, since
   *  the trade does not stop when the licensed premises empty. */
  stallsOccupied: number
  /** Occupied stalls held by a trader with a current licence. */
  licensedTradersPct: number
  /** Composite hygiene score from the last inspection, 0-100. */
  hygieneScore: number
  /** The single most important field on this record. */
  lastInspectedAt: IsoDateTime
  /** Violations found and not yet closed out. */
  openViolations: number
  /** Rent and fee demand raised against the facility each month, in lakh. */
  monthlyRentLakh: number
  /** Condition of the facility as a whole, on the platform's standard ladder. */
  state: OperationalState
  /** Cold chain on the premises - decisive for fish and for meat. */
  coldStorage: boolean
  /** Trade effluent treated to consent conditions. Meaningful for slaughter
   *  houses, tanneries and fish markets; recorded true elsewhere. */
  effluentCompliant: boolean
}

/* ==========================================================================
   Monthly enforcement record
   ========================================================================== */

/**
 * The monthly regulatory record. Inspections and violations are reported
 * together deliberately: an inspection count rising while violations found
 * stay flat usually means the inspections are going where they are easiest,
 * not where they are needed.
 */
export interface MarketInspectionTrendPoint {
  month: string
  inspections: number
  violationsFound: number
  licencesIssued: number
}
