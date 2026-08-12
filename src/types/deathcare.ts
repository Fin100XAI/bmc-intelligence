import type { IsoDateTime, OperationalState, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/deathcare.ts
 *
 * Cemeteries and crematoria - Twelfth Schedule function 14, "burials and
 * burial grounds; cremations, cremation grounds and electric crematoria".
 *
 * This is the obligatory duty a management platform omits most often, and the
 * omission is not neutral. Land for the dead is finite and non-renewable: a
 * burial ground that fills does not refill, and the ground it stands on cannot
 * be recovered for the purpose it was consumed for. A crematorium reaching
 * capacity is therefore a crisis that arrives without warning and cannot be
 * solved quickly, because acquiring land for a burial ground is among the
 * hardest things a corporation ever does - it needs a willing seller, a
 * consenting neighbourhood and a community that accepts the site, and no
 * amount of money shortens that.
 *
 * The measure that matters most on this shape is `meanWaitHours`. The time a
 * grieving family stands waiting at the gate is the dignity of the service,
 * stated as a number. Everything else here exists so that a corporation can
 * see that number rising years before it becomes unbearable.
 *
 * WHAT IS DELIBERATELY ABSENT. This shape describes FACILITIES and their
 * capacity. It carries no interment record, no name of the deceased, no family
 * contact, no plot allotment and no community register of who was buried
 * where, and it must never acquire one. Registers of the dead sit with the
 * Registrar and with the ground's own managing trust or committee; a
 * management platform reports on whether there is room and how long the wait
 * is, and never reproduces the register itself.
 */

/* ==========================================================================
   Vocabulary
   ========================================================================== */

/**
 * What the facility physically is. A corporation runs all four, and they are
 * not interchangeable: a crematorium consumes fuel and time, a burial ground
 * consumes land permanently.
 */
export type BurialGroundKind = 'cemetery' | 'crematorium' | 'electric-crematorium' | 'burial-ground'

function build$BURIAL_GROUND_KIND_LABEL(): Record<BurialGroundKind, string> {
  return {
  cemetery: t('Cemetery'),
  crematorium: t('Crematorium'),
  'electric-crematorium': t('Electric Crematorium'),
  'burial-ground': t('Burial Ground'),
}
}
export let BURIAL_GROUND_KIND_LABEL: Record<BurialGroundKind, string> = build$BURIAL_GROUND_KIND_LABEL()
registerLayer(() => {
  BURIAL_GROUND_KIND_LABEL = build$BURIAL_GROUND_KIND_LABEL()
})

/**
 * The community whose rites the ground serves.
 *
 * Recorded because provision is not fungible: a city with ample cremation
 * capacity and no burial ground within reach of the families who need one has
 * not met its duty, and a city-wide average would conceal exactly that. The
 * field describes the FACILITY's designation as the corporation records it,
 * never any individual's community.
 */
export type BurialGroundCommunity = 'hindu' | 'muslim' | 'christian' | 'parsi' | 'buddhist' | 'common'

function build$BURIAL_GROUND_COMMUNITY_LABEL(): Record<BurialGroundCommunity, string> {
  return {
  hindu: t('Hindu'),
  muslim: t('Muslim'),
  christian: t('Christian'),
  parsi: t('Parsi'),
  buddhist: t('Buddhist'),
  common: t('Common / Municipal'),
}
}
export let BURIAL_GROUND_COMMUNITY_LABEL: Record<BurialGroundCommunity, string> = build$BURIAL_GROUND_COMMUNITY_LABEL()
registerLayer(() => {
  BURIAL_GROUND_COMMUNITY_LABEL = build$BURIAL_GROUND_COMMUNITY_LABEL()
})

/* ==========================================================================
   The facility
   ========================================================================== */

export interface BurialGround {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  kind: BurialGroundKind
  community: BurialGroundCommunity
  /** Ground area of the facility, in hectares. */
  areaHectares: number
  /**
   * Share of the ground still available for use. On a burial ground this is
   * unconsumed land and it only ever falls; on a crematorium it is unbooked
   * capacity against the furnaces and pyre platforms in service.
   */
  capacityRemainingPct: number
  /**
   * Years the facility can continue at its current rate before it is full.
   * The single most important planning figure a corporation holds on this
   * duty, because the lead time on a replacement site is measured in years.
   */
  estimatedYearsRemaining: number
  cremations30d: number
  burials30d: number
  /**
   * Share of cremations performed on electric or piped-gas furnaces rather
   * than on wood pyres. Higher is better for air quality, fuel cost and the
   * time a family waits, and it is the one lever a corporation can pull
   * quickly when land cannot be found.
   */
  electricGasSharePct: number
  /**
   * Mean hours a family waits from arrival at the gate to the commencement of
   * the rite. This is the dignity measure.
   */
  meanWaitHours: number
  /** Condition of the facility itself - grounds, furnaces, shelter, water. */
  state: OperationalState
  /** When the facility was last renovated, re-laid or refitted. */
  lastUpgradedAt: IsoDateTime
}

/**
 * Monthly city-wide volumes. Aggregate by construction - there is no
 * individual behind any figure on this series.
 */
export interface DeathcareTrendPoint {
  month: string
  cremations: number
  burials: number
}
