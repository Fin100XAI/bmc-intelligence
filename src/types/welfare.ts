import type { IsoDateTime, OperationalState, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/welfare.ts
 *
 * SOCIAL WELFARE AND ACCESSIBILITY
 *
 * Function 9 of the Twelfth Schedule of the Constitution assigns municipalities
 * the "safeguarding the interests of weaker sections of society, including the
 * handicapped and mentally retarded". That is the constitutional wording and it
 * is quoted here once, in the place where the statutory basis belongs. It is
 * not the language this platform uses anywhere a person will read it: the
 * interface says "persons with disabilities" and "weaker sections", because a
 * resident reading a screen about their own entitlement is owed the same
 * courtesy as anyone else.
 *
 * THE MEASURE THAT MATTERS IS THE COVERAGE GAP - eligible residents who are not
 * enrolled. A scheme that reaches eighty per cent of those entitled to it is
 * commonly reported as a success, and it is failing the other twenty per cent
 * silently. Those residents are, by definition, the ones least able to
 * complain: an eighty-year-old widow without a bank account seeded to her
 * Aadhaar number does not file a grievance, she simply does not get paid. The
 * shape below therefore carries `eligibleBeneficiaries` alongside
 * `enrolledBeneficiaries` in every record, so the gap cannot be reported away.
 *
 * TIMELINESS IS PART OF THE ENTITLEMENT. A pension paid late is a pension that
 * did not arrive when the rent was due. `meanDisbursementDelayDays` and
 * `arrearsLakh` are held at the same level as the headcount for that reason,
 * not as a service-quality footnote.
 *
 * ACCESSIBILITY IS A STATUTORY DUTY, NOT A COURTESY. Sections 40 to 46 of the
 * Rights of Persons with Disabilities Act, 2016 oblige the corporation to make
 * its buildings and public facilities accessible, against the harmonised
 * guidelines notified under that Act. `AccessibilityAudit` records the
 * corporation's own compliance position against its own estate.
 *
 * ONE DELIBERATE ABSENCE, AND IT IS NOT NEGOTIABLE. Nothing in this module
 * holds a beneficiary. There is no name, no age, no disability, no bank
 * account, no household and no entitlement determination anywhere in these
 * types, and there must never be one. The unit of record is the SCHEME and the
 * FACILITY. A municipal platform that assembled a register of the city's
 * poorest and most vulnerable residents would be the most dangerous object this
 * system could produce, so the shape refuses it rather than relying on
 * anybody's restraint downstream.
 */

/* ==========================================================================
   Welfare schemes
   ========================================================================== */

/**
 * The families of benefit a corporation administers, whether the scheme is
 * central, state or the corporation's own. Grouped by what the payment is FOR,
 * because that is what determines who is being failed when it does not arrive.
 */
export type WelfareSchemeKind =
  | 'pension'
  | 'scholarship'
  | 'disability-support'
  | 'widow-support'
  | 'maternity-benefit'
  | 'senior-citizen'

function build$WELFARE_SCHEME_KIND_LABEL(): Record<WelfareSchemeKind, string> {
  return {
  pension: t('Pension'),
  scholarship: t('Scholarship'),
  'disability-support': t('Disability Support'),
  'widow-support': t('Widow Support'),
  'maternity-benefit': t('Maternity Benefit'),
  'senior-citizen': t('Senior Citizen'),
}
}
export let WELFARE_SCHEME_KIND_LABEL: Record<WelfareSchemeKind, string> = build$WELFARE_SCHEME_KIND_LABEL()
registerLayer(() => {
  WELFARE_SCHEME_KIND_LABEL = build$WELFARE_SCHEME_KIND_LABEL()
})

export interface WelfareScheme {
  id: string
  tenantId: TenantId
  name: string
  kind: WelfareSchemeKind
  /**
   * Residents assessed as entitled to the scheme under its own criteria.
   * The denominator, and the reason this record exists: enrolment without an
   * eligible population beside it reports reach as though it were coverage.
   */
  eligibleBeneficiaries: number
  /**
   * Residents currently on the scheme's rolls. The difference between this and
   * `eligibleBeneficiaries` is the COVERAGE GAP - the residents the corporation
   * owes a benefit to and is not paying.
   */
  enrolledBeneficiaries: number
  /**
   * Enrolled residents actually paid in the current month. Falls short of
   * enrolment for reasons that are administrative rather than substantive - an
   * account not seeded to Aadhaar, a life certificate not yet submitted, a
   * ward-level sanction pending - and every one of those shortfalls is a
   * household that did not receive money it is entitled to.
   */
  disbursedThisMonth: number
  /** Mean days from the entitlement falling due to the money reaching the
   *  beneficiary's account. */
  meanDisbursementDelayDays: number
  /** Entitlement accrued, unpaid and carried forward, in ₹ lakh. */
  arrearsLakh: number
  /**
   * Entitlement per beneficiary per month, in rupees. Where the scheme pays a
   * lump sum or an annual award rather than a monthly instalment, this is the
   * monthly-equivalent value of that award.
   */
  monthlyEntitlementRupees: number
  state: OperationalState
}

/* ==========================================================================
   Accessibility - Rights of Persons with Disabilities Act, 2016
   ========================================================================== */

/**
 * The classes of municipal facility audited against the harmonised
 * accessibility guidelines. Every one of these is a place a resident has to be
 * able to reach in order to obtain something they are entitled to.
 */
export type AccessibilityFacilityKind =
  | 'ward-office'
  | 'municipal-school'
  | 'hospital'
  | 'public-toilet'
  | 'garden'
  | 'market'

function build$ACCESSIBILITY_FACILITY_KIND_LABEL(): Record<AccessibilityFacilityKind, string> {
  return {
  'ward-office': t('Ward Office'),
  'municipal-school': t('Municipal School'),
  hospital: t('Hospital'),
  'public-toilet': t('Public Convenience'),
  garden: t('Garden'),
  market: t('Municipal Market'),
}
}
export let ACCESSIBILITY_FACILITY_KIND_LABEL: Record<AccessibilityFacilityKind, string> = build$ACCESSIBILITY_FACILITY_KIND_LABEL()
registerLayer(() => {
  ACCESSIBILITY_FACILITY_KIND_LABEL = build$ACCESSIBILITY_FACILITY_KIND_LABEL()
})

export interface AccessibilityAudit {
  id: string
  tenantId: TenantId
  facilityName: string
  wardId: string
  facilityKind: AccessibilityFacilityKind
  /** Ramp at the principal entrance at a gradient within the harmonised
   *  guidelines. A ramp too steep to use is recorded as non-compliant. */
  rampCompliant: boolean
  /** Lift serving every floor on which a public service is delivered. */
  liftAvailable: boolean
  /** At least one accessible toilet, available during public hours. */
  accessibleToilet: boolean
  /** Tactile guiding path from the entrance to the service counter. */
  tactilePaving: boolean
  /** Signage in large print and Braille at the points a visitor must decide. */
  signageCompliant: boolean
  /**
   * Compliance against the full harmonised guidelines, of which the five
   * recorded checks above are the most consequential but not the whole. Counter
   * heights, parking, handrails, lift controls and assistance at the help desk
   * carry the remainder.
   */
  overallCompliancePct: number
  lastAuditedAt: IsoDateTime
}

/* ==========================================================================
   Monthly movement
   ========================================================================== */

export interface WelfareTrendPoint {
  month: string
  /** Value actually disbursed in the month, in ₹ lakh. */
  disbursed: number
  /** Residents newly brought onto a scheme's rolls in the month. This is the
   *  only number that closes the coverage gap. */
  newEnrolments: number
}
