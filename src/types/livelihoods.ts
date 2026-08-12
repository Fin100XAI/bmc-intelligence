import type { IsoDateTime, OperationalState, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/livelihoods.ts
 *
 * URBAN LIVELIHOODS & POVERTY ALLEVIATION
 *
 * Function 11 of the Twelfth Schedule of the Constitution - "urban poverty
 * alleviation" - read together with the two instruments that give it operative
 * shape in a Maharashtra corporation:
 *
 *   - The Deendayal Antyodaya Yojana - National Urban Livelihoods Mission
 *     (DAY-NULM), which funds skill training and placement, self-help group
 *     formation and bank linkage, shelters for the urban homeless, and support
 *     to street vendors through the corporation's Urban Poverty Alleviation
 *     cell.
 *   - The Street Vendors (Protection of Livelihood and Regulation of Street
 *     Vending) Act, 2014, which converts street vending from something a
 *     corporation tolerates or clears into something it must survey, register
 *     and certify.
 *
 * TWO MEASUREMENT DECISIONS ARE BUILT INTO THESE SHAPES, DELIBERATELY.
 *
 * First, `certificatesOfVendingIssued` is carried beside `registeredVendors`
 * and `surveyCompleted` rather than on its own. Under the 2014 Act a
 * certificate of vending is an ENTITLEMENT that follows from the survey - once
 * a vendor has been surveyed and the Town Vending Committee is constituted,
 * issuing the certificate is the corporation's duty, not its discretion. The
 * gap between vendors on the register and certificates in their hands is
 * therefore a measure of statutory non-compliance BY THE CORPORATION. It is
 * never a measure of anything the vendors did or failed to do, and no field
 * here should be read as though it were.
 *
 * Second, `placedInWorkPct` sits beside `trainedLast12m` because the trained
 * count on its own flatters the programme. Training that does not end in work
 * is expenditure without outcome, and a centre reporting large batches and
 * weak placement is a finding rather than an achievement. The condition state
 * is therefore read off outcome, not off the fabric of the building.
 *
 * NO PERSON IS MODELLED HERE. The unit of record is the facility, the group
 * and the vending zone - never the beneficiary, the trainee, the shelter
 * resident or the vendor. There is no household register, no income
 * assessment and no eligibility determination behind any of this, and there
 * must never be one. Residents on low incomes are the people this function
 * exists to serve; a platform that profiled them would invert it.
 */

/* ==========================================================================
   The livelihoods estate
   ========================================================================== */

/**
 * The kinds of premises a corporation's Urban Poverty Alleviation cell runs.
 * `sh-group-federation` is not a building in the ordinary sense - it is the
 * area-level federation of self-help groups, which holds the bank linkage and
 * the revolving fund, and it is carried in the same estate because that is
 * where the corporation's support actually lands.
 */
export type LivelihoodCentreKind =
  | 'skill-training-centre'
  | 'shelter-for-urban-homeless'
  | 'vendor-zone'
  | 'sh-group-federation'
  | 'livelihood-centre'

function build$LIVELIHOOD_CENTRE_KIND_LABEL(): Record<LivelihoodCentreKind, string> {
  return {
  'skill-training-centre': t('Skill Training Centre'),
  'shelter-for-urban-homeless': t('Shelter for Urban Homeless'),
  'vendor-zone': t('Vending Zone Facility'),
  'sh-group-federation': t('SHG Federation'),
  'livelihood-centre': t('Livelihood Centre'),
}
}
export let LIVELIHOOD_CENTRE_KIND_LABEL: Record<LivelihoodCentreKind, string> = build$LIVELIHOOD_CENTRE_KIND_LABEL()
registerLayer(() => {
  LIVELIHOOD_CENTRE_KIND_LABEL = build$LIVELIHOOD_CENTRE_KIND_LABEL()
})

export interface LivelihoodCentre {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  kind: LivelihoodCentreKind
  /** Sanctioned places - training seats, shelter beds, stalls or members. */
  capacity: number
  /** People currently served. Above capacity is common and is not a fault of
   *  the people served; it is a statement about what the corporation provided. */
  currentBeneficiaries: number
  /** Self-help groups formed and active against this premises. */
  selfHelpGroups: number
  /** Groups holding a live bank account and credit linkage, as a percentage.
   *  Bank linkage is what turns a group from a meeting into working capital. */
  shgBankLinkedPct: number
  trainedLast12m: number
  /** Trainees in work three months after completion. The count of people
   *  trained means little without this; training that does not end in work is
   *  expenditure without outcome. */
  placedInWorkPct: number
  /** Read off outcome and utilisation, not off the fabric of the building. */
  state: OperationalState
  lastInspectedAt: IsoDateTime
}

/* ==========================================================================
   Street vending - the Street Vendors Act, 2014
   ========================================================================== */

/**
 * A vending zone as the 2014 Act contemplates it: a demarcated area with a
 * sanctioned holding capacity, a survey behind it and a Town Vending Committee
 * responsible for it.
 *
 * `certificatesOfVendingIssued` against `registeredVendors` is the compliance
 * measure. The Act makes the certificate an entitlement once the survey is
 * done, so a shortfall records a duty the corporation has not discharged.
 */
export interface VendorZone {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  /** Vending places the zone is sanctioned to hold. */
  sanctionedVendingCapacity: number
  /** Vendors enumerated onto the register for this zone. */
  registeredVendors: number
  /** Certificates of vending actually issued under section 4 of the Act. */
  certificatesOfVendingIssued: number
  /** Whether the statutory survey of street vendors has been completed. */
  surveyCompleted: boolean
  /** Whether the Town Vending Committee required by the Act is constituted. */
  townVendingCommitteeConstituted: boolean
}

/* ==========================================================================
   Monthly movement
   ========================================================================== */

export interface LivelihoodTrendPoint {
  month: string
  trained: number
  /** In work three months after completion. The line that matters. */
  placed: number
  certificatesIssued: number
}
