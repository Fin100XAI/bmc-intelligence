import type { DataClassification, IsoDateTime, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/enforcement.ts
 *
 * Removal of Encroachments and action against unauthorised development - one
 * register, where six other domain pages (buildings, coastal, gardens,
 * markets, livelihoods, roads) could each surface the SYMPTOM of an
 * encroachment as data but none of them could resolve it, because the
 * notice, the statute it was issued under and what became of it belonged
 * nowhere.
 *
 * The statutory basis is real and cited throughout: Section 314 of the
 * Mumbai Municipal Corporation Act, 1888 empowers summary removal of an
 * encroachment on a public street regardless of how long it has stood or
 * whether tax or a licence fee was ever paid against it; Sections 351 and
 * 354A govern the show-cause notice and stop-work order against unauthorised
 * construction; Sections 52 and 53 of the Maharashtra Regional and Town
 * Planning Act, 1966 penalise unauthorised development and empower the
 * Planning Authority to require its removal.
 *
 * Figures are modelled demonstration data, as everywhere else in this
 * platform.
 */

export type EncroachmentCategory =
  | 'hawking-vending'
  | 'slum-extension'
  | 'unauthorised-construction'
  | 'nullah-drain'
  | 'road-footpath'

function build$ENCROACHMENT_CATEGORY_LABEL(): Record<EncroachmentCategory, string> {
  return {
  'hawking-vending': t('Hawking / Street Vending'),
  'slum-extension': t('Slum Extension'),
  'unauthorised-construction': t('Unauthorised Construction'),
  'nullah-drain': t('Nallah / Drain Encroachment'),
  'road-footpath': t('Road / Footpath Encroachment'),
}
}
export let ENCROACHMENT_CATEGORY_LABEL: Record<EncroachmentCategory, string> = build$ENCROACHMENT_CATEGORY_LABEL()
registerLayer(() => {
  ENCROACHMENT_CATEGORY_LABEL = build$ENCROACHMENT_CATEGORY_LABEL()
})

export type LegalBasis = 'mmc-314' | 'mmc-351' | 'mmc-354a' | 'mrtp-52' | 'mrtp-53'

function build$LEGAL_BASIS_LABEL(): Record<LegalBasis, string> {
  return {
  'mmc-314': t('MMC Act 1888, S.314 - Summary Removal'),
  'mmc-351': t('MMC Act 1888, S.351 - Show-Cause Notice'),
  'mmc-354a': t('MMC Act 1888, S.354A - Stop-Work Notice'),
  'mrtp-52': t('MRTP Act 1966, S.52 - Unauthorised Development'),
  'mrtp-53': t('MRTP Act 1966, S.53 - Removal / Restoration Notice'),
}
}
export let LEGAL_BASIS_LABEL: Record<LegalBasis, string> = build$LEGAL_BASIS_LABEL()
registerLayer(() => {
  LEGAL_BASIS_LABEL = build$LEGAL_BASIS_LABEL()
})

export type NoticeType = 'show-cause' | 'stop-work' | 'demolition-order'

function build$NOTICE_TYPE_LABEL(): Record<NoticeType, string> {
  return {
  'show-cause': t('Show-Cause Notice'),
  'stop-work': t('Stop-Work Notice'),
  'demolition-order': t('Demolition Order'),
}
}
export let NOTICE_TYPE_LABEL: Record<NoticeType, string> = build$NOTICE_TYPE_LABEL()
registerLayer(() => {
  NOTICE_TYPE_LABEL = build$NOTICE_TYPE_LABEL()
})

export type EnforcementStatus =
  | 'notice-issued'
  | 'show-cause-period'
  | 'action-scheduled'
  | 'demolished'
  | 'restored'
  | 'regularised'
  | 'disputed-in-court'
  | 'withdrawn'

function build$ENFORCEMENT_STATUS_LABEL(): Record<EnforcementStatus, string> {
  return {
  'notice-issued': t('Notice Issued'),
  'show-cause-period': t('Within Show-Cause Period'),
  'action-scheduled': t('Action Scheduled'),
  demolished: t('Demolished / Removed'),
  restored: t('Restored Voluntarily'),
  regularised: t('Regularised'),
  'disputed-in-court': t('Disputed in Court'),
  withdrawn: t('Notice Withdrawn'),
}
}
export let ENFORCEMENT_STATUS_LABEL: Record<EnforcementStatus, string> = build$ENFORCEMENT_STATUS_LABEL()
registerLayer(() => {
  ENFORCEMENT_STATUS_LABEL = build$ENFORCEMENT_STATUS_LABEL()
})

/**
 * One encroachment or unauthorised-development matter, from notice to
 * outcome. No occupant or owner is named - the location and the statute are
 * what an enforcement squad and a Commissioner both need; who is on the
 * other side of the notice is the case file's business, not this register's.
 */
export interface EnforcementCase {
  id: string
  tenantId: TenantId
  reference: string
  category: EncroachmentCategory
  legalBasis: LegalBasis
  noticeType: NoticeType
  wardId: string
  locationDescription: string
  /** Rough scale of the encroachment - structures, stalls or running metres, by category. */
  extentDescription: string
  noticeIssuedAt: IsoDateTime
  actionScheduledAt?: IsoDateTime
  actionCompletedAt?: IsoDateTime
  status: EnforcementStatus
  /** True where the notice or the action taken under it is under court challenge. */
  disputedInCourt: boolean
  departmentId: string
  classification: DataClassification
}

/**
 * A time-bound, multi-ward enforcement drive - the unit BMC's own Removal of
 * Encroachments squads actually work in, distinct from a single notice.
 */
export interface EnforcementDrive {
  id: string
  tenantId: TenantId
  name: string
  wardIds: string[]
  startedAt: IsoDateTime
  completedAt?: IsoDateTime
  structuresTargeted: number
  structuresRemoved: number
  personnelDeployed: number
  policeSupportRequested: boolean
}

export interface EnforcementPosition {
  noticesIssued12m: number
  actionsCompleted12m: number
  structuresRemoved12m: number
  disputedInCourt: number
  regularised12m: number
  drivesConducted12m: number
}
