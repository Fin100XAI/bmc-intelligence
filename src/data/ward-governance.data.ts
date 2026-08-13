import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import type {
  CaseworkCategory,
  CaseworkStatus,
  CorporatorCasework,
  WardCommitteeDetail,
  WardGovernancePosition,
} from '@/types/ward-governance'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS } from './reference'
import { CORPORATION_SHORT_NAME } from './naming'
import { CITY_SCALE, scaledCount } from './scale'
import { stateFrom } from './city.data'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/ward-governance.data.ts
 *
 * The statutory ward committees under the 74th Constitutional Amendment Act,
 * and the casework an individual corporator carries that never needs to
 * reach the committee floor.
 *
 * `governanceStatus` records a real, current fact rather than a modelled one:
 * Brihanmumbai's elected council term expired in March 2022, and the
 * Corporation was administered by the state-appointed Municipal Commissioner
 * as Administrator for close to four years - the longest such spell in the
 * Corporation's history - until elections for all 227 wards were held on 15
 * January 2026, with results declared the following day. This module states
 * that fact and its date; it does not seed a named Mayor or corporator
 * against it; every committee sitting, attendance figure and casework record
 * below remains modelled demonstration data like everywhere else in this
 * platform.
 */

export let WARD_COMMITTEES: WardCommitteeDetail[] = []
export let CORPORATOR_CASEWORK: CorporatorCasework[] = []
export let WARD_GOVERNANCE_POSITION: WardGovernancePosition = {
  governanceStatus: 'elected-council',
  governanceSince: isoDaysFromAnchor(-190),
  committeesConstituted: 0,
  totalCorporatorSeats: 0,
  meanAttendancePct: 0,
  sittings12m: 0,
  localWorksSanctioned12m: 0,
  localWorksValueCrore12m: 0,
  caseworkOpen: 0,
  caseworkResolved12m: 0,
  meanResolutionDays: 0,
}

/** The 2026 general election date, held to bring council-managed corporations back under an elected house. */
const ELECTION_RESULTS_DATE = '2026-01-16T18:00:00+05:30'

function build$CASEWORK_SUBJECTS(): Array<{ category: CaseworkCategory; subject: string }> {
  return [
    { category: 'infrastructure', subject: t('Pothole and road-edge repair request') },
    { category: 'infrastructure', subject: t('Street light outage on internal lane') },
    { category: 'sanitation', subject: t('Missed door-to-door waste collection') },
    { category: 'sanitation', subject: t('Public toilet block condition complaint') },
    { category: 'water-supply', subject: t('Low pressure at end-of-line connections') },
    { category: 'water-supply', subject: t('Tanker supply request for supply-deficit pocket') },
    { category: 'encroachment', subject: t('Encroachment on footpath obstructing pedestrian access') },
    { category: 'encroachment', subject: t('Unauthorised structure on municipal open plot') },
    { category: 'social-welfare', subject: t('Scheme enrolment assistance for eligible household') },
    { category: 'social-welfare', subject: t('Accessibility request at a municipal facility') },
    { category: 'certificate-registration', subject: t('Delay in birth certificate issue') },
    { category: 'certificate-registration', subject: t('Trade licence renewal delay') },
    { category: 'other', subject: t('General grievance referred at a citizen meeting') },
  ]
}
let CASEWORK_SUBJECTS: Array<{ category: CaseworkCategory; subject: string }> = build$CASEWORK_SUBJECTS()
registerLayer(() => {
  CASEWORK_SUBJECTS = build$CASEWORK_SUBJECTS()
})

const CATEGORY_DEPARTMENT: Record<CaseworkCategory, string | undefined> = {
  infrastructure: 'dept-roads',
  sanitation: 'dept-solid-waste',
  'water-supply': 'dept-hydraulic',
  encroachment: 'dept-estates',
  'social-welfare': 'dept-health',
  'certificate-registration': 'dept-registration',
  other: undefined,
}

registerLayer(() => {
  const prefix = CORPORATION_SHORT_NAME.replace(/[^A-Za-z]/g, '').toUpperCase() || 'MC'
  const scale = CITY_SCALE

  /* ------------------------------------------------------- Ward committees */

  const totalSeats = activeCorporation.electoralWards ?? scaledCount(227, scale.population, WARDS.length)
  const totalWardPopulation = WARDS.reduce((s, w) => s + w.population, 0) || 1

  WARD_COMMITTEES = WARDS.map((ward) => {
    const r = det(`wardcommittee:${ward.id}`)
    const share = ward.population / totalWardPopulation
    const corporatorSeats = Math.max(1, Math.round(totalSeats * share))
    const attendance = r.round(46, 92, 1)
    const sittings = r.int(8, 16)
    const worksSanctioned = r.int(4, 42)
    // Each work is disposed of at ward level precisely because it sits under
    // the five-lakh-rupee threshold - the average therefore has to as well.
    const avgWorkValueLakh = r.float(1.2, 4.6)
    const worksValueCrore = Math.round(((worksSanctioned * avgWorkValueLakh) / 100) * 100) / 100
    const grievancesReviewed = r.int(10, 90)
    const grievancesResolved = Math.round(grievancesReviewed * r.float(0.45, 0.92))

    return {
      wardId: ward.id,
      corporatorSeats,
      chairpersonDesignation: t('Ward Committee Chairperson (rotational)'),
      sittings12m: sittings,
      meanAttendancePct: attendance,
      localWorksSanctioned12m: worksSanctioned,
      localWorksValueCrore12m: worksValueCrore,
      grievancesReviewed12m: grievancesReviewed,
      grievancesResolved12m: grievancesResolved,
      nextSittingAt: isoDaysFromAnchor(r.int(1, 30)),
      state: stateFrom(attendance * 0.5 + (grievancesResolved / Math.max(1, grievancesReviewed)) * 100 * 0.5),
    }
  })

  /* --------------------------------------------------- Corporator casework */

  const caseworkCount = scaledCount(260, scale.population, 30)
  CORPORATOR_CASEWORK = Array.from({ length: caseworkCount }, (_, i) => {
    const r = det(`casework:${i}`)
    const ward = r.pick(WARDS)
    const spec = CASEWORK_SUBJECTS[i % CASEWORK_SUBJECTS.length]!
    const status = r.weighted([
      ['raised', 3], ['referred-to-department', 3], ['in-progress', 3], ['resolved', 6], ['closed-no-action', 1],
    ] as const) as CaseworkStatus
    const raisedDaysAgo = r.int(1, 260)
    const resolved = status === 'resolved' || status === 'closed-no-action'
    const resolutionDays = r.int(2, 75)

    return {
      id: `cw-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${prefix}/CORP/${2025 + (raisedDaysAgo > 365 ? 0 : 1)}/${String(i + 205).padStart(4, '0')}`,
      wardId: ward.id,
      category: spec.category,
      subject: spec.subject,
      departmentId: CATEGORY_DEPARTMENT[spec.category],
      raisedAt: isoDaysFromAnchor(-raisedDaysAgo),
      status,
      resolvedAt: resolved ? isoDaysFromAnchor(-raisedDaysAgo + resolutionDays) : undefined,
      daysOpen: resolved ? resolutionDays : raisedDaysAgo,
      raisedAtCommittee: r.chance(0.3),
    }
  })

  /* --------------------------------------------------------------- Roll-up */

  const meanAttendance = WARD_COMMITTEES.length
    ? Math.round((WARD_COMMITTEES.reduce((s, c) => s + c.meanAttendancePct, 0) / WARD_COMMITTEES.length) * 10) / 10
    : 0
  const caseworkResolved = CORPORATOR_CASEWORK.filter((c) => c.status === 'resolved')
  const caseworkOpen = CORPORATOR_CASEWORK.filter((c) => c.status === 'raised' || c.status === 'referred-to-department' || c.status === 'in-progress').length
  const meanResolutionDays = caseworkResolved.length
    ? Math.round(caseworkResolved.reduce((s, c) => s + c.daysOpen, 0) / caseworkResolved.length)
    : 0

  WARD_GOVERNANCE_POSITION = {
    governanceStatus: 'elected-council',
    governanceSince: ELECTION_RESULTS_DATE,
    committeesConstituted: WARD_COMMITTEES.length,
    totalCorporatorSeats: totalSeats,
    meanAttendancePct: meanAttendance,
    sittings12m: WARD_COMMITTEES.reduce((s, c) => s + c.sittings12m, 0),
    localWorksSanctioned12m: WARD_COMMITTEES.reduce((s, c) => s + c.localWorksSanctioned12m, 0),
    localWorksValueCrore12m: Math.round(WARD_COMMITTEES.reduce((s, c) => s + c.localWorksValueCrore12m, 0) * 10) / 10,
    caseworkOpen,
    caseworkResolved12m: caseworkResolved.length,
    meanResolutionDays,
  }
})

export function committeeForWard(wardId: string): WardCommitteeDetail | undefined {
  return WARD_COMMITTEES.find((c) => c.wardId === wardId)
}
