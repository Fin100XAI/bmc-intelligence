import type { IsoDateTime, OperationalState, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/ward-governance.ts
 *
 * The ward as a unit of GOVERNANCE, not of service delivery.
 *
 * `src/types/civic-services.ts` already holds one row for "Ward Committees" in
 * the corporation's committee register - correctly, because the Standing
 * Committee, the Education Committee and the Ward Committees are all
 * committees of the same house. But a single lumped row cannot answer the
 * questions that register exists to ask of every OTHER committee: how well is
 * THIS ward committee running, what has it sanctioned, and what has an
 * individual corporator done with a constituent's complaint that never
 * reached the committee floor at all. Those are the two things this module
 * adds - one row per statutory ward committee, and the casework register
 * beneath it.
 */

/**
 * One of the corporation's statutory ward committees under the 74th
 * Constitutional Amendment Act - one per administrative ward, distinct from
 * the corporator seats within it (a ward committee typically covers several
 * electoral wards, whose corporators together make up its membership and
 * elect a chairperson from among themselves).
 */
export interface WardCommitteeDetail {
  wardId: string
  corporatorSeats: number
  chairpersonDesignation: string
  sittings12m: number
  meanAttendancePct: number
  /**
   * Local works a corporator got sanctioned through the committee within the
   * ₹5 lakh threshold - above it, a matter rises to the General Body rather
   * than being disposed of at ward level.
   */
  localWorksSanctioned12m: number
  localWorksValueCrore12m: number
  grievancesReviewed12m: number
  grievancesResolved12m: number
  nextSittingAt: IsoDateTime
  state: OperationalState
}

export type CaseworkCategory =
  | 'infrastructure'
  | 'sanitation'
  | 'water-supply'
  | 'encroachment'
  | 'social-welfare'
  | 'certificate-registration'
  | 'other'

function build$CASEWORK_CATEGORY_LABEL(): Record<CaseworkCategory, string> {
  return {
  infrastructure: t('Roads, Drains & Infrastructure'),
  sanitation: t('Sanitation & Solid Waste'),
  'water-supply': t('Water Supply'),
  encroachment: t('Encroachment Complaint'),
  'social-welfare': t('Social Welfare & Amenities'),
  'certificate-registration': t('Certificates & Registration'),
  other: t('Other Constituent Matter'),
}
}
export let CASEWORK_CATEGORY_LABEL: Record<CaseworkCategory, string> = build$CASEWORK_CATEGORY_LABEL()
registerLayer(() => {
  CASEWORK_CATEGORY_LABEL = build$CASEWORK_CATEGORY_LABEL()
})

export type CaseworkStatus = 'raised' | 'referred-to-department' | 'in-progress' | 'resolved' | 'closed-no-action'

function build$CASEWORK_STATUS_LABEL(): Record<CaseworkStatus, string> {
  return {
  raised: t('Raised'),
  'referred-to-department': t('Referred to Department'),
  'in-progress': t('In Progress'),
  resolved: t('Resolved'),
  'closed-no-action': t('Closed - No Action Warranted'),
}
}
export let CASEWORK_STATUS_LABEL: Record<CaseworkStatus, string> = build$CASEWORK_STATUS_LABEL()
registerLayer(() => {
  CASEWORK_STATUS_LABEL = build$CASEWORK_STATUS_LABEL()
})

/**
 * A constituent matter an elected corporator has taken up - the casework that
 * never needs to reach the committee floor to be real accountability work.
 *
 * No constituent is named, for the same reason no citizen is named anywhere
 * else in the platform. What is held is the category, which ward raised it,
 * and whether it moved.
 */
export interface CorporatorCasework {
  id: string
  tenantId: TenantId
  reference: string
  wardId: string
  category: CaseworkCategory
  subject: string
  departmentId?: string
  raisedAt: IsoDateTime
  status: CaseworkStatus
  resolvedAt?: IsoDateTime
  daysOpen: number
  /** Whether this was formally tabled at the ward committee rather than handled directly. */
  raisedAtCommittee: boolean
}

export type CorporationGovernanceStatus = 'elected-council' | 'administrator'

export interface WardGovernancePosition {
  governanceStatus: CorporationGovernanceStatus
  /** When the current governance arrangement took effect. */
  governanceSince: IsoDateTime
  committeesConstituted: number
  totalCorporatorSeats: number
  meanAttendancePct: number
  sittings12m: number
  localWorksSanctioned12m: number
  localWorksValueCrore12m: number
  caseworkOpen: number
  caseworkResolved12m: number
  meanResolutionDays: number
}
