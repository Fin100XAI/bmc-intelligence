import { TENANT_ID } from '@/config/municipality.config'
import type {
  EncroachmentCategory,
  EnforcementCase,
  EnforcementDrive,
  EnforcementPosition,
  EnforcementStatus,
  LegalBasis,
  NoticeType,
} from '@/types/enforcement'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS } from './reference'
import { CORPORATION_SHORT_NAME, localityFor } from './naming'
import { CITY_SCALE, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/enforcement.data.ts
 *
 * Removal of Encroachments and unauthorised-development action. Category
 * mix, the legal basis attached to each notice type, and the scale of a
 * drive are grounded in reported practice: a January-March 2025 time-bound
 * citywide drive against illegal construction, an April 2026 Mankhurd drive
 * that removed over 1,200 structures across roughly eleven acres using a
 * four-hundred-person team, and continuing hawker-and-stall clearances
 * through mid-2026. None of the individual case records below are those real
 * drives - they are modelled demonstration data shaped by the same practice.
 */

export let ENFORCEMENT_CASES: EnforcementCase[] = []
export let ENFORCEMENT_DRIVES: EnforcementDrive[] = []
export let ENFORCEMENT_POSITION: EnforcementPosition = {
  noticesIssued12m: 0,
  actionsCompleted12m: 0,
  structuresRemoved12m: 0,
  disputedInCourt: 0,
  regularised12m: 0,
  drivesConducted12m: 0,
}

interface CategorySpec {
  category: EncroachmentCategory
  legalBasis: LegalBasis
  noticeType: NoticeType
  departmentId: string
  extentUnit: string
}

const CATEGORY_SPECS: CategorySpec[] = [
  { category: 'hawking-vending', legalBasis: 'mmc-314', noticeType: 'show-cause', departmentId: 'dept-licence', extentUnit: 'stalls' },
  { category: 'slum-extension', legalBasis: 'mmc-314', noticeType: 'demolition-order', departmentId: 'dept-housing', extentUnit: 'structures' },
  { category: 'unauthorised-construction', legalBasis: 'mrtp-52', noticeType: 'stop-work', departmentId: 'dept-building', extentUnit: 'floors' },
  { category: 'unauthorised-construction', legalBasis: 'mmc-351', noticeType: 'show-cause', departmentId: 'dept-building', extentUnit: 'sq. m' },
  { category: 'nullah-drain', legalBasis: 'mrtp-53', noticeType: 'demolition-order', departmentId: 'dept-stormwater', extentUnit: 'running metres' },
  { category: 'road-footpath', legalBasis: 'mmc-314', noticeType: 'show-cause', departmentId: 'dept-roads', extentUnit: 'metres of frontage' },
]

function build$DRIVE_NAME_KINDS(): string[] {
  return [t('citywide unauthorised-construction drive'), t('nallah-frontage clearance drive'), t('footpath and road-frontage drive'), t('hawker-zone compliance drive')]
}
let DRIVE_NAME_KINDS: string[] = build$DRIVE_NAME_KINDS()
registerLayer(() => {
  DRIVE_NAME_KINDS = build$DRIVE_NAME_KINDS()
})

registerLayer(() => {
  const prefix = CORPORATION_SHORT_NAME.replace(/[^A-Za-z]/g, '').toUpperCase() || 'MC'
  const scale = CITY_SCALE

  /* ------------------------------------------------------------- Drives */

  const driveCount = scaledCount(10, scale.population, 3)
  ENFORCEMENT_DRIVES = Array.from({ length: driveCount }, (_, i) => {
    const r = det(`enfdrive:${i}`)
    const wardIds = r.sample(WARDS, r.int(1, 3)).map((w) => w.id)
    const startedDaysAgo = r.int(5, 500)
    const completed = r.chance(0.72)
    const targeted = scaledCount(r.int(80, 1400), scale.population, 12)
    const removed = Math.round(targeted * r.float(0.55, 0.98))

    return {
      id: `edr-${String(i + 1).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      name: t('{0} - {1}', localityFor(`enfdrive:${i}`), r.pick(DRIVE_NAME_KINDS)),
      wardIds,
      startedAt: isoDaysFromAnchor(-startedDaysAgo),
      completedAt: completed ? isoDaysFromAnchor(-startedDaysAgo + r.int(1, 14)) : undefined,
      structuresTargeted: targeted,
      structuresRemoved: removed,
      personnelDeployed: r.int(40, 420),
      policeSupportRequested: r.chance(0.68),
    }
  })

  /* --------------------------------------------------------------- Cases */

  const caseCount = scaledCount(220, scale.population, 24)
  ENFORCEMENT_CASES = Array.from({ length: caseCount }, (_, i) => {
    const r = det(`enfcase:${i}`)
    const spec = CATEGORY_SPECS[i % CATEGORY_SPECS.length]!
    const ward = r.pick(WARDS)
    const status = r.weighted([
      ['notice-issued', 3], ['show-cause-period', 3], ['action-scheduled', 2],
      ['demolished', 5], ['restored', 2], ['regularised', 1], ['disputed-in-court', 2], ['withdrawn', 1],
    ] as const) as EnforcementStatus
    const noticeDaysAgo = r.int(3, 620)
    const completed = status === 'demolished' || status === 'restored' || status === 'regularised' || status === 'withdrawn'
    const extent = spec.extentUnit === 'floors' ? r.int(1, 3) : spec.extentUnit === 'sq. m' ? r.int(20, 220) : r.int(1, 40)

    return {
      id: `enf-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${prefix}/RE/${2024 + r.int(0, 2)}/${String(i + 118).padStart(4, '0')}`,
      category: spec.category,
      legalBasis: spec.legalBasis,
      noticeType: spec.noticeType,
      wardId: ward.id,
      locationDescription: t('{0} - {1}', localityFor(`enfcase:${i}`), ward.name.split(' · ')[0] ?? ward.code),
      extentDescription: `${extent} ${spec.extentUnit}`,
      noticeIssuedAt: isoDaysFromAnchor(-noticeDaysAgo),
      actionScheduledAt: status === 'action-scheduled' ? isoDaysFromAnchor(r.int(2, 30)) : undefined,
      actionCompletedAt: completed ? isoDaysFromAnchor(-noticeDaysAgo + r.int(7, 60)) : undefined,
      status,
      disputedInCourt: status === 'disputed-in-court',
      departmentId: spec.departmentId,
      classification: 'internal',
    }
  })

  /* --------------------------------------------------------------- Roll-up */

  const yearStart = isoDaysFromAnchor(-365)
  const recentCases = ENFORCEMENT_CASES.filter((c) => c.noticeIssuedAt >= yearStart)

  ENFORCEMENT_POSITION = {
    noticesIssued12m: recentCases.length,
    actionsCompleted12m: recentCases.filter((c) => c.actionCompletedAt).length,
    structuresRemoved12m: recentCases.filter((c) => c.status === 'demolished').length,
    disputedInCourt: ENFORCEMENT_CASES.filter((c) => c.disputedInCourt).length,
    regularised12m: recentCases.filter((c) => c.status === 'regularised').length,
    drivesConducted12m: ENFORCEMENT_DRIVES.filter((d) => d.startedAt >= yearStart).length,
  }
})
