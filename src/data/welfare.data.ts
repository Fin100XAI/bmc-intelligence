import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import type {
  AccessibilityAudit,
  AccessibilityFacilityKind,
  WelfareScheme,
  WelfareSchemeKind,
  WelfareTrendPoint,
} from '@/types/welfare'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS, wardName } from './reference'
import { stateFrom } from './city.data'
import { CORPORATION_SHORT_NAME, landmarkName, localityFor } from './naming'
import { CITY_SCALE, scaled, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/welfare.data.ts
 *
 * SOCIAL WELFARE AND ACCESSIBILITY - seed layer.
 *
 * Function 9 of the Twelfth Schedule obliges the corporation to safeguard the
 * interests of weaker sections of society, including persons with disabilities.
 * In practice that duty is discharged through two quite different registers,
 * and this layer models both.
 *
 * THE FIRST IS MONEY THAT MUST REACH A HOUSEHOLD. Pensions, scholarships,
 * disability support, widow support and maternity benefit. The figure that
 * matters here is not the number enrolled - it is the COVERAGE GAP, the
 * eligible residents who are not enrolled at all. A scheme reaching eighty per
 * cent of those entitled to it is failing the other twenty per cent silently,
 * and those residents are by definition the ones least able to complain about
 * it. Every scheme record therefore carries its eligible population beside its
 * enrolment, so that no screen built on this layer can report reach as though
 * it were coverage.
 *
 * Timeliness sits at the same level, for the same reason. A pension paid late
 * is a pension that did not arrive when the rent was due, and thirty-one days
 * of delay on ₹1,500 is not a service-quality footnote to the household waiting
 * on it. Delay and arrears are modelled per scheme, not averaged into a single
 * departmental number that hides the worst performer.
 *
 * THE SECOND IS PHYSICAL ACCESS TO THE CORPORATION ITSELF. Sections 40 to 46 of
 * the Rights of Persons with Disabilities Act, 2016 make accessibility of
 * municipal buildings and public facilities a statutory duty against notified
 * harmonised guidelines. It is not a courtesy and it is not a capital-works
 * aspiration. A ward office with an unusable entrance is a place where an
 * entitlement cannot be claimed, which converts a physical failure into a
 * financial one.
 *
 * SCALE AND PROVENANCE. Entitlement rates are anchored to published central and
 * state rates so the money reads correctly; every volume, delay and compliance
 * figure is modelled demonstration data seeded by corporation id, and tracks
 * the active corporation through `CITY_SCALE`. No welfare department system is
 * contacted. Place names come from the active corporation's own localities.
 *
 * THE ABSENCE THAT DEFINES THIS LAYER. There is no beneficiary anywhere in it.
 * No name, no age, no disability, no bank account, no household, no entitlement
 * determination - not in the seeds, not in the types, and it must not be added
 * later. The unit of record is the SCHEME and the FACILITY. A register of the
 * city's poorest and most vulnerable residents is the most dangerous artefact
 * this platform could hold, so it is refused by shape rather than by policy.
 *
 * Every export below is a LIVE BINDING, rebuilt on a corporation switch.
 */

/* ==========================================================================
   Live bindings
   ========================================================================== */

export let WELFARE_SCHEMES: WelfareScheme[] = []
export let ACCESSIBILITY_AUDITS: AccessibilityAudit[] = []
export let WELFARE_TREND: WelfareTrendPoint[] = []

/* ==========================================================================
   Vocabulary
   ========================================================================== */

interface SchemeSeed {
  key: string
  name: string
  kind: WelfareSchemeKind
  /** Eligible population at Brihanmumbai scale, scaled per corporation. */
  baseEligible: number
  /** Published monthly entitlement in rupees, or its monthly equivalent. */
  entitlement: number
  /**
   * Enrolment band as a share of the eligible population. Disability support
   * and widow support sit lowest by design rather than by accident: both
   * require documentary proof - a disability certificate, a death certificate -
   * that the applicant must obtain before the corporation will look at them, and
   * that certification barrier is the single largest cause of a coverage gap in
   * Indian welfare administration.
   */
  coverage: readonly [number, number]
}

/**
 * Schemes every municipal corporation in the state administers, because they
 * are central or state schemes routed through the urban local body. The list
 * does not shorten for a smaller corporation - a resident of Jalna is entitled
 * to the same national pension as a resident of Mumbai.
 */
function build$STATUTORY_SCHEMES(): readonly SchemeSeed[] {
  return [
  { key: 'sgnay', name: t('Sanjay Gandhi Niradhar Anudan Yojana'), kind: 'pension', baseEligible: 186000, entitlement: 1500, coverage: [0.62, 0.83] },
  { key: 'sbsy', name: t('Shravan Bal Seva Rajya Nivrutti Vetan Yojana'), kind: 'senior-citizen', baseEligible: 214000, entitlement: 1500, coverage: [0.64, 0.86] },
  { key: 'ignoaps', name: t('Indira Gandhi National Old Age Pension Scheme'), kind: 'pension', baseEligible: 148000, entitlement: 600, coverage: [0.66, 0.88] },
  { key: 'ignwps', name: t('Indira Gandhi National Widow Pension Scheme'), kind: 'widow-support', baseEligible: 74000, entitlement: 900, coverage: [0.48, 0.71] },
  { key: 'igndps', name: t('Indira Gandhi National Disability Pension Scheme'), kind: 'disability-support', baseEligible: 41000, entitlement: 900, coverage: [0.41, 0.66] },
  { key: 'pmmvy', name: t('Pradhan Mantri Matru Vandana Yojana'), kind: 'maternity-benefit', baseEligible: 96000, entitlement: 1250, coverage: [0.58, 0.82] },
  { key: 'jsy', name: t('Janani Suraksha Yojana'), kind: 'maternity-benefit', baseEligible: 88000, entitlement: 600, coverage: [0.61, 0.85] },
  { key: 'postmatric', name: t('Post-Matric Scholarship for Weaker Sections'), kind: 'scholarship', baseEligible: 132000, entitlement: 850, coverage: [0.52, 0.78] },
  { key: 'prematric', name: t('Pre-Matric Scholarship for Scheduled Castes and Scheduled Tribes'), kind: 'scholarship', baseEligible: 164000, entitlement: 450, coverage: [0.55, 0.8] },
  { key: 'adip', name: t('Assistive Devices and Aids Grant (ADIP)'), kind: 'disability-support', baseEligible: 28000, entitlement: 700, coverage: [0.34, 0.58] },
  { key: 'nfbs', name: t('National Family Benefit Scheme'), kind: 'widow-support', baseEligible: 19000, entitlement: 1667, coverage: [0.44, 0.69] },
  { key: 'daycare', name: t('Senior Citizens Day Care and Recreation Support'), kind: 'senior-citizen', baseEligible: 36000, entitlement: 500, coverage: [0.38, 0.63] },
]
}
let STATUTORY_SCHEMES: readonly SchemeSeed[] = build$STATUTORY_SCHEMES()
registerLayer(() => {
  STATUTORY_SCHEMES = build$STATUTORY_SCHEMES()
})

/**
 * Schemes a corporation funds from its own budget, chiefly through the welfare
 * reserve the Maharashtra Municipal Corporation Act requires it to set aside for
 * persons with disabilities and weaker sections. How many of these a
 * corporation can run is a function of what it has to spend, so the count
 * scales with the budget rather than the population.
 */
function build$DISCRETIONARY_SCHEMES(): readonly SchemeSeed[] {
  return [
  { key: 'disability-reserve', name: t('Disability Welfare Reserve Grant'), kind: 'disability-support', baseEligible: 33000, entitlement: 1100, coverage: [0.36, 0.6] },
  { key: 'safai-education', name: t('Educational Assistance for Children of Sanitation Workers'), kind: 'scholarship', baseEligible: 24000, entitlement: 950, coverage: [0.47, 0.74] },
  { key: 'widow-livelihood', name: t('Widow and Deserted Women Livelihood Grant'), kind: 'widow-support', baseEligible: 31000, entitlement: 1200, coverage: [0.42, 0.68] },
  { key: 'merit', name: t('Municipal Merit Scholarship'), kind: 'scholarship', baseEligible: 21000, entitlement: 1000, coverage: [0.58, 0.84] },
  { key: 'senior-transport', name: t('Senior Citizen Travel Concession Reimbursement'), kind: 'senior-citizen', baseEligible: 58000, entitlement: 400, coverage: [0.5, 0.77] },
  { key: 'maternity-topup', name: t('Maternity Nutrition Top-Up'), kind: 'maternity-benefit', baseEligible: 42000, entitlement: 800, coverage: [0.53, 0.79] },
  { key: 'destitute', name: t('Destitute Persons Relief Allowance'), kind: 'pension', baseEligible: 26000, entitlement: 1300, coverage: [0.39, 0.64] },
  { key: 'caregiver', name: t('Caregiver Allowance for Persons with High Support Needs'), kind: 'disability-support', baseEligible: 12000, entitlement: 1400, coverage: [0.31, 0.55] },
]
}
let DISCRETIONARY_SCHEMES: readonly SchemeSeed[] = build$DISCRETIONARY_SCHEMES()
registerLayer(() => {
  DISCRETIONARY_SCHEMES = build$DISCRETIONARY_SCHEMES()
})

const FACILITY_KINDS: ReadonlyArray<readonly [AccessibilityFacilityKind, number]> = [
  ['public-toilet', 9],
  ['municipal-school', 7],
  ['garden', 5],
  ['ward-office', 4],
  ['market', 3],
  ['hospital', 2],
]

function build$SCHOOL_PLACE_KINDS() {
  return [t('Vidyalaya'), t('Municipal School'), t('Shala')]
}
let SCHOOL_PLACE_KINDS: ReturnType<typeof build$SCHOOL_PLACE_KINDS> = build$SCHOOL_PLACE_KINDS()
registerLayer(() => {
  SCHOOL_PLACE_KINDS = build$SCHOOL_PLACE_KINDS()
})
function build$GARDEN_PLACE_KINDS() {
  return [t('Udyan'), t('Garden'), t('Maidan')]
}
let GARDEN_PLACE_KINDS: ReturnType<typeof build$GARDEN_PLACE_KINDS> = build$GARDEN_PLACE_KINDS()
registerLayer(() => {
  GARDEN_PLACE_KINDS = build$GARDEN_PLACE_KINDS()
})

function build$MONTH_LABELS() {
  return [t('Feb'), t('Mar'), t('Apr'), t('May'), t('Jun'), t('Jul')]
}
let MONTH_LABELS: ReturnType<typeof build$MONTH_LABELS> = build$MONTH_LABELS()
registerLayer(() => {
  MONTH_LABELS = build$MONTH_LABELS()
})

/**
 * Annual provision, in ₹ crore at Brihanmumbai scale, that a corporation
 * earmarks for the welfare of persons with disabilities and weaker sections
 * from its own funds. This is the ceiling on the corporation's discretionary
 * schemes: enrolment cannot outrun the money voted for it, however large the
 * eligible population is. It scales with the BUDGET, not the population - which
 * is precisely why a corporation with many residents and a thin budget carries
 * the widest coverage gap on its own schemes.
 */
const WELFARE_RESERVE_BASE_CRORE = 210

/* ==========================================================================
   Rebuild
   ========================================================================== */

registerLayer(() => {
  const corp = activeCorporation
  const scale = CITY_SCALE
  const prefix = CORPORATION_SHORT_NAME || corp.shortName.replace(/[^A-Za-z]/g, '').toUpperCase()

  /* -------------------------------------------------------------- Schemes */

  // Every corporation administers the full statutory list - a resident of the
  // smallest corporation in the state is entitled to the same national pension
  // as a resident of Brihanmumbai. Only the corporation's own discretionary
  // schemes thin out with the budget, which is exactly how a smaller
  // corporation experiences the constraint. The floor of three holds because no
  // corporation runs none of its own: a disability grant, a scholarship and a
  // widow's grant are near-universal even where the provision is small.
  const discretionaryCount = Math.min(
    DISCRETIONARY_SCHEMES.length,
    scaledCount(DISCRETIONARY_SCHEMES.length, scale.budget, 3),
  )
  const catalogue = [...STATUTORY_SCHEMES, ...DISCRETIONARY_SCHEMES.slice(0, discretionaryCount)]

  // The corporation's own welfare provision, expressed as what it can pay out
  // in a single month. Drawn down in catalogue order as the discretionary
  // schemes are built, so a scheme late in the list is the one the money runs
  // out on - which is how a welfare budget is actually exhausted.
  let reserveRemainingRupees = scaled(WELFARE_RESERVE_BASE_CRORE, scale.budget, 0.5) * 10_000_000 / 12

  WELFARE_SCHEMES = catalogue.map((seed, i) => {
    const r = det(`welfare-scheme:${seed.key}`)
    const isStatutory = STATUTORY_SCHEMES.some((s) => s.key === seed.key)

    const eligible = scaledCount(seed.baseEligible, scale.population, 40)
    const coverageShare = r.float(seed.coverage[0], seed.coverage[1])
    let enrolled = Math.min(eligible, Math.max(1, Math.round(eligible * coverageShare)))

    // A statutory scheme is funded by the state or the centre and is not capped
    // by what the corporation itself has voted. The corporation's own schemes
    // are, and that cap is not a rounding detail - it is the point at which an
    // eligible resident is turned away for want of provision rather than for
    // want of entitlement.
    if (!isStatutory) {
      const affordable = Math.max(1, Math.floor(reserveRemainingRupees / seed.entitlement))
      enrolled = Math.min(enrolled, affordable)
      reserveRemainingRupees = Math.max(0, reserveRemainingRupees - enrolled * seed.entitlement)
    }

    // Enrolment is not payment. The shortfall between the two is administrative
    // - an account not seeded to Aadhaar, a life certificate outstanding, a
    // ward sanction pending - and each one is a household that went without.
    const paymentSuccess = r.float(0.74, 0.985)
    const disbursed = Math.max(0, Math.round(enrolled * paymentSuccess))

    // Delay is worse where the entitlement depends on an annual re-verification
    // (scholarships, disability certification) than where it is a standing
    // monthly instruction.
    const delayFloor = seed.kind === 'scholarship' || seed.kind === 'disability-support' ? 9 : 3
    const delay = r.round(delayFloor, delayFloor + r.float(12, 30), 1)

    // Arrears are what the unpaid have accrued, carried across a modelled
    // number of months. Stated in ₹ lakh, as the welfare budget line is.
    const unpaid = enrolled - disbursed
    const monthsCarried = r.float(0.8, 4.2)
    const arrearsLakh = Math.round(((unpaid * seed.entitlement * monthsCarried) / 100_000) * 10) / 10

    // The state of a scheme is its coverage, marked down for delay. A scheme
    // that reaches everybody a month late is not operational.
    const coveragePct = (enrolled / eligible) * 100
    const health = coveragePct - Math.min(28, delay * 0.85)

    return {
      id: `wsch-${String(i + 1).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      name: isStatutory ? seed.name : `${prefix} ${seed.name}`,
      kind: seed.kind,
      eligibleBeneficiaries: eligible,
      enrolledBeneficiaries: enrolled,
      disbursedThisMonth: disbursed,
      meanDisbursementDelayDays: delay,
      arrearsLakh,
      monthlyEntitlementRupees: seed.entitlement,
      state: stateFrom(Math.max(0, Math.min(100, health))),
    }
  })

  /* -------------------------------------------------------- Accessibility */

  // One audited facility per roughly nine thousand residents at Brihanmumbai
  // scale. The floor keeps every ward carrying at least one audited facility,
  // because a ward with no audit is not a ward that is compliant.
  const facilityCount = scaledCount(1380, scale.population, WARDS.length * 2)

  ACCESSIBILITY_AUDITS = Array.from({ length: facilityCount }, (_, i) => {
    const r = det(`accessibility-audit:${i}`)
    const ward = WARDS[i % WARDS.length]!
    const kind = r.weighted(FACILITY_KINDS)

    // Buildings the corporation occupies itself are further along than the
    // facilities residents use unaccompanied, which is the wrong way round.
    const institutional = kind === 'ward-office' || kind === 'hospital'
    const ramp = r.chance(institutional ? 0.86 : 0.52)
    const lift = kind === 'garden' || kind === 'public-toilet' ? false : r.chance(institutional ? 0.64 : 0.31)
    const accessibleToilet = r.chance(institutional ? 0.58 : 0.29)
    const tactile = r.chance(institutional ? 0.34 : 0.14)
    const signage = r.chance(institutional ? 0.47 : 0.21)

    // The five recorded checks are the most consequential, not the whole of the
    // harmonised guidelines. The residual covers counter heights, parking,
    // handrails, lift controls and assistance at the help desk.
    const checks = [ramp, lift, accessibleToilet, tactile, signage]
    const met = checks.filter(Boolean).length
    const residual = r.float(-9, 11)
    const compliance = Math.max(0, Math.min(100, Math.round((met / checks.length) * 100 + residual)))

    const facilityName =
      kind === 'ward-office'
        ? t('{0} Ward Office', wardName(ward.id))
        : kind === 'municipal-school'
          ? landmarkName(`accessibility:${i}`, r.pick(SCHOOL_PLACE_KINDS))
          : kind === 'hospital'
            ? landmarkName(`accessibility:${i}`, 'Municipal Hospital')
            : kind === 'public-toilet'
              ? t('{0} Public Convenience', localityFor(`accessibility:${i}`))
              : kind === 'garden'
                ? landmarkName(`accessibility:${i}`, r.pick(GARDEN_PLACE_KINDS))
                : landmarkName(`accessibility:${i}`, 'Municipal Market')

    return {
      id: `acc-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      facilityName,
      wardId: ward.id,
      facilityKind: kind,
      rampCompliant: ramp,
      liftAvailable: lift,
      accessibleToilet,
      tactilePaving: tactile,
      signageCompliant: signage,
      overallCompliancePct: compliance,
      lastAuditedAt: isoDaysFromAnchor(-r.int(6, 640)),
    }
  })

  /* ---------------------------------------------------------------- Trend */

  const monthlyValueLakh =
    WELFARE_SCHEMES.reduce((s, sch) => s + sch.disbursedThisMonth * sch.monthlyEntitlementRupees, 0) / 100_000
  const enrolledTotal = WELFARE_SCHEMES.reduce((s, sch) => s + sch.enrolledBeneficiaries, 0)

  WELFARE_TREND = MONTH_LABELS.map((month, i) => {
    const r = det(`welfare-trend:${month}`)
    // Disbursement drifts upward across the financial year as sanctions clear
    // and arrears are released in tranches; enrolment drives are seasonal and
    // cluster around the camps a corporation runs after the budget is adopted.
    const drift = 0.9 + i * 0.032
    const campMonth = i === 1 || i === 4
    return {
      month,
      // Already at corporation scale - the scheme records it is summed from
      // were scaled when they were built, so it is only rounded here.
      disbursed: Math.round(monthlyValueLakh * drift * r.float(0.93, 1.08) * 10) / 10,
      newEnrolments: Math.max(
        1,
        Math.round(enrolledTotal * r.float(0.004, 0.011) * (campMonth ? 1.9 : 1)),
      ),
    }
  })
})
