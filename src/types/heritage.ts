import type { GeoPoint, IsoDateTime, OperationalState, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/heritage.ts
 *
 * Heritage structures and precincts, museums, the zoo and the city's
 * tourism-facing public realm - assets the Corporation is either the
 * managing authority for, or holds statutory conservation responsibility
 * over regardless of ownership.
 *
 * `heritageGrade` follows the real grading Mumbai's own Development Control
 * Regulations use for listed structures - Grade I (of national or historic
 * importance, no external change permitted), Grade IIA and IIB (regionally
 * or locally important, internal change may be permitted with approval) and
 * Grade III (features worth retaining within an otherwise alterable
 * structure). The grade is a planning-control fact independent of who owns
 * or manages the site, which is why `managingAuthority` is recorded
 * separately from it.
 */

export type HeritageSiteCategory =
  | 'heritage-precinct'
  | 'heritage-structure'
  | 'museum'
  | 'zoo'
  | 'nature-park'
  | 'promenade-beach'
  | 'viewpoint-garden'

function build$HERITAGE_CATEGORY_LABEL(): Record<HeritageSiteCategory, string> {
  return {
  'heritage-precinct': t('Heritage Precinct'),
  'heritage-structure': t('Listed Heritage Structure'),
  museum: t('Museum'),
  zoo: t('Zoo / Zoological Garden'),
  'nature-park': t('Nature Park'),
  'promenade-beach': t('Promenade / Beach'),
  'viewpoint-garden': t('Viewpoint Garden'),
}
}
export let HERITAGE_CATEGORY_LABEL: Record<HeritageSiteCategory, string> = build$HERITAGE_CATEGORY_LABEL()
registerLayer(() => {
  HERITAGE_CATEGORY_LABEL = build$HERITAGE_CATEGORY_LABEL()
})

export type HeritageGrade = 'grade-i' | 'grade-iia' | 'grade-iib' | 'grade-iii' | 'ungraded'

function build$HERITAGE_GRADE_LABEL(): Record<HeritageGrade, string> {
  return {
  'grade-i': t('Grade I'),
  'grade-iia': t('Grade IIA'),
  'grade-iib': t('Grade IIB'),
  'grade-iii': t('Grade III'),
  ungraded: t('Ungraded'),
}
}
export let HERITAGE_GRADE_LABEL: Record<HeritageGrade, string> = build$HERITAGE_GRADE_LABEL()
registerLayer(() => {
  HERITAGE_GRADE_LABEL = build$HERITAGE_GRADE_LABEL()
})

export type ConservationStatus = 'well-maintained' | 'requires-repair' | 'under-restoration' | 'at-risk' | 'encroached'

function build$CONSERVATION_STATUS_LABEL(): Record<ConservationStatus, string> {
  return {
  'well-maintained': t('Well Maintained'),
  'requires-repair': t('Requires Repair'),
  'under-restoration': t('Under Restoration'),
  'at-risk': t('At Risk'),
  encroached: t('Encroached'),
}
}
export let CONSERVATION_STATUS_LABEL: Record<ConservationStatus, string> = build$CONSERVATION_STATUS_LABEL()
registerLayer(() => {
  CONSERVATION_STATUS_LABEL = build$CONSERVATION_STATUS_LABEL()
})

export type HeritageManagingAuthority = 'corporation' | 'state' | 'central' | 'trust-private'

function build$MANAGING_AUTHORITY_LABEL(): Record<HeritageManagingAuthority, string> {
  return {
  corporation: t('Corporation'),
  state: t('State Government'),
  central: t('Central Government / ASI'),
  'trust-private': t('Trust / Private'),
}
}
export let MANAGING_AUTHORITY_LABEL: Record<HeritageManagingAuthority, string> = build$MANAGING_AUTHORITY_LABEL()
registerLayer(() => {
  MANAGING_AUTHORITY_LABEL = build$MANAGING_AUTHORITY_LABEL()
})

export interface HeritageSite {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  category: HeritageSiteCategory
  centroid: GeoPoint
  heritageGrade: HeritageGrade
  managingAuthority: HeritageManagingAuthority
  conservationStatus: ConservationStatus
  /** Visitors in the last twelve months, where the site records footfall at all. */
  annualFootfall?: number
  entryFeeRupees?: number
  /** Revenue collected in the last twelve months, INR lakh, where the Corporation collects it. */
  revenueCollectedLakh?: number
  openToPublic: boolean
  accessibleEntrance: boolean
  lastInspectedAt: IsoDateTime
  state: OperationalState
}

export interface HeritageTourismPosition {
  /** Notable landmarks this platform profiles individually - a curated register, not BMC's citywide inventory. */
  sitesOnRegister: number
  gradeICount: number
  atRiskOrEncroached: number
  underRestoration: number
  annualFootfallTotal: number
  revenueCollectedLakhTotal: number
  /**
   * BMC's published citywide count of Grade I/IIA/IIB/III heritage-listed
   * structures, compiled from its own ward-by-ward lists - distinct from
   * `sitesOnRegister` above. Null where the active corporation publishes no
   * such aggregate.
   */
  heritageStructuresCitywide: number | null
  /** BMC's published citywide count of heritage precincts. Null where unpublished. */
  heritagePrecinctsCitywide: number | null
}
