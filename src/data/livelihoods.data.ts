import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import type {
  LivelihoodCentre,
  LivelihoodCentreKind,
  LivelihoodTrendPoint,
  VendorZone,
} from '@/types/livelihoods'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS, wardName } from './reference'
import { stateFrom } from './city.data'
import { landmarkName, localityFor } from './naming'
import { CITY_SCALE, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/livelihoods.data.ts
 *
 * URBAN LIVELIHOODS & POVERTY ALLEVIATION - seed layer.
 *
 * Function 11 of the Twelfth Schedule, modelled through the two instruments a
 * Maharashtra corporation actually works to: DAY-NULM (the Deendayal Antyodaya
 * Yojana - National Urban Livelihoods Mission) for skill training, self-help
 * group formation, bank linkage and shelters for the urban homeless; and the
 * Street Vendors (Protection of Livelihood and Regulation of Street Vending)
 * Act, 2014 for the vending register and certificates of vending.
 *
 * TWO THINGS THIS LAYER IS BUILT TO MAKE VISIBLE.
 *
 * The certificate gap. Under the 2014 Act, once the statutory survey is done a
 * certificate of vending is an ENTITLEMENT - issuing it is the corporation's
 * duty rather than its discretion. So the distance between vendors on the
 * register and certificates in their hands is generated here as a function of
 * whether the corporation completed its survey and constituted its Town
 * Vending Committee. It is a measure of the corporation's compliance, and it
 * is never a statement about the vendors.
 *
 * The placement gap. Training volume flatters a programme. What matters is
 * whether the trainee is in work three months later, so a centre's condition
 * state is derived from placement and bank linkage rather than from the fabric
 * of its building. A centre running large batches into weak placement reads as
 * degraded here, which is the honest reading.
 *
 * NO PERSON IS MODELLED. The unit of record is the facility, the federation
 * and the vending zone. There is no beneficiary register, no income
 * assessment, no eligibility determination and no name anywhere behind this
 * layer, and there must never be one.
 *
 * Everything follows the platform's ordinary discipline: volumes track the
 * active corporation through `CITY_SCALE` and its own published population,
 * place names come from the corporation's own localities, every figure is
 * drawn from a seeded PRNG so the picture is identical on every reload, and
 * the whole layer is rebuilt on a corporation switch.
 */

/* ==========================================================================
   Live bindings
   ========================================================================== */

export let LIVELIHOOD_CENTRES: LivelihoodCentre[] = []
export let VENDOR_ZONES: VendorZone[] = []
export let LIVELIHOOD_TREND: LivelihoodTrendPoint[] = []

/* ==========================================================================
   Vocabulary
   ========================================================================== */

/** The place-kind suffix each premises carries in its constructed name. */
const CENTRE_PLACE_KIND: Record<LivelihoodCentreKind, string> = {
  'skill-training-centre': 'Skill Training Centre',
  'shelter-for-urban-homeless': 'Shelter for the Urban Homeless',
  'vendor-zone': 'Vending Plaza',
  'sh-group-federation': 'Area Level Federation',
  'livelihood-centre': 'Livelihood Centre',
}

/** Sanctioned places per premises, by kind - seats, beds, stalls or members. */
const CENTRE_CAPACITY_RANGE: Record<LivelihoodCentreKind, [number, number]> = {
  'skill-training-centre': [60, 320],
  'shelter-for-urban-homeless': [40, 170],
  'vendor-zone': [90, 430],
  'sh-group-federation': [180, 900],
  'livelihood-centre': [50, 260],
}

function build$VENDING_ZONE_PLACE_KINDS() {
  return [t('Vending Zone'), t('Hawking Zone'), t('Market Vending Zone'), t('Street Vending Zone')]
}
let VENDING_ZONE_PLACE_KINDS: ReturnType<typeof build$VENDING_ZONE_PLACE_KINDS> = build$VENDING_ZONE_PLACE_KINDS()
registerLayer(() => {
  VENDING_ZONE_PLACE_KINDS = build$VENDING_ZONE_PLACE_KINDS()
})

function build$MONTH_LABELS() {
  return [t('Feb'), t('Mar'), t('Apr'), t('May'), t('Jun'), t('Jul')]
}
let MONTH_LABELS: ReturnType<typeof build$MONTH_LABELS> = build$MONTH_LABELS()
registerLayer(() => {
  MONTH_LABELS = build$MONTH_LABELS()
})

/* ==========================================================================
   Rebuild
   ========================================================================== */

registerLayer(() => {
  const corp = activeCorporation
  const scale = CITY_SCALE

  /* ------------------------------------------------------- The estate plan */

  // NULM's Scheme of Shelters for Urban Homeless works to a stated norm: one
  // shelter of about a hundred persons for every lakh of urban population.
  // That entitlement is computed from the corporation's OWN published
  // population rather than scaled off Mumbai, because the norm is per lakh
  // wherever it is applied. What a corporation actually operates is habitually
  // short of the norm, and the shortfall is the point - a city that has not
  // built the shelters its own population entitles it to leaves people on the
  // pavement through the monsoon.
  const shelterEntitlement = Math.max(1, Math.round(corp.population2011 / 100_000))
  const shelterCount = Math.max(1, Math.round(shelterEntitlement * 0.55))

  const estatePlan: Array<{ kind: LivelihoodCentreKind; count: number }> = [
    { kind: 'skill-training-centre', count: scaledCount(48, scale.population, 3) },
    { kind: 'shelter-for-urban-homeless', count: shelterCount },
    { kind: 'vendor-zone', count: scaledCount(26, scale.population, 2) },
    { kind: 'sh-group-federation', count: scaledCount(62, scale.population, 4) },
    { kind: 'livelihood-centre', count: scaledCount(34, scale.population, 3) },
  ]

  const plannedKinds: LivelihoodCentreKind[] = []
  for (const { kind, count } of estatePlan) {
    for (let n = 0; n < count; n += 1) plannedKinds.push(kind)
  }

  /* ----------------------------------------------------------- The centres */

  LIVELIHOOD_CENTRES = plannedKinds.map((kind, i) => {
    const r = det(`livcentre:${i}`)
    // Round-robin rather than a random pick, so every ward carries part of the
    // estate and a ward-scoped officer is never shown an empty page.
    const ward = WARDS[i % WARDS.length]!
    const [capMin, capMax] = CENTRE_CAPACITY_RANGE[kind]
    const capacity = r.int(capMin, capMax)

    // Utilisation above sanctioned capacity is common, particularly in
    // shelters through the cold months. It records what the corporation
    // provided, not a failing of the people who came.
    const utilisation = r.float(kind === 'shelter-for-urban-homeless' ? 0.55 : 0.42, 1.24)
    const currentBeneficiaries = Math.max(0, Math.round(capacity * utilisation))

    // Federations exist to hold groups; other premises host a handful.
    const selfHelpGroups =
      kind === 'sh-group-federation' ? r.int(24, 165) : kind === 'livelihood-centre' ? r.int(4, 42) : r.int(0, 18)

    // Bank linkage is what turns a group from a meeting into working capital,
    // and it is the single figure the mission is judged on at state level.
    const shgBankLinkedPct = selfHelpGroups === 0 ? 0 : r.round(38, 96, 1)

    // Training runs in batches against the seats a centre holds. Shelters and
    // vending plazas train a little; a training centre turns over its seats
    // several times a year.
    const batches = kind === 'skill-training-centre' ? r.float(1.6, 4.4) : r.float(0.05, 0.8)
    const trainedLast12m = Math.round(capacity * batches)

    // Placement three months after completion. The national picture for
    // DAY-NULM skill training sits well below half, and modelling it any
    // higher would be flattery rather than intelligence.
    const placedInWorkPct = trainedLast12m === 0 ? 0 : r.round(19, 71, 1)

    // Condition is read off outcome, not off the fabric: a centre that trains
    // people who do not find work is not in good order however new its
    // building is. Crowding beyond sanctioned capacity pulls the state down
    // because it is the corporation's shortfall, not the residents'.
    const overCapacityPct = Math.max(0, currentBeneficiaries / Math.max(1, capacity) - 1) * 100
    const condition = Math.max(
      0,
      Math.min(100, placedInWorkPct * 0.55 + shgBankLinkedPct * 0.35 + 12 - overCapacityPct * 0.45),
    )

    return {
      id: `liv-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      name:
        kind === 'sh-group-federation'
          ? t('{0} Area Level Federation', wardName(ward.id))
          : landmarkName(`livcentre:${i}`, CENTRE_PLACE_KIND[kind]),
      wardId: ward.id,
      kind,
      capacity,
      currentBeneficiaries,
      selfHelpGroups,
      shgBankLinkedPct,
      trainedLast12m,
      placedInWorkPct,
      state: stateFrom(condition),
      lastInspectedAt: isoDaysFromAnchor(-r.int(3, 340)),
    }
  })

  /* ------------------------------------------------------- The vending zones */

  // The NUMBER of zones scales with the corporation; the holding capacity of
  // any one zone does not. A vending zone in a district city holds roughly
  // what a vending zone in Mumbai holds - there are simply fewer of them.
  const zoneCount = Math.max(WARDS.length, scaledCount(88, scale.population, WARDS.length))

  VENDOR_ZONES = Array.from({ length: zoneCount }, (_, i) => {
    const r = det(`vendorzone:${i}`)
    const ward = WARDS[i % WARDS.length]!

    const sanctionedVendingCapacity = r.int(90, 1180)

    // Vendors on the register routinely exceed the sanctioned places. That is
    // a statement about how little space the corporation demarcated against a
    // livelihood people were already earning, and the Act requires the plan to
    // be revised to accommodate them, not the people to be removed.
    const registeredVendors = Math.round(sanctionedVendingCapacity * r.float(0.64, 1.9))

    // The two statutory preconditions. The Act requires the survey of all
    // street vendors and the constitution of a Town Vending Committee; both
    // are the corporation's duty and both are prerequisites to issuing
    // certificates lawfully.
    const townVendingCommitteeConstituted = r.chance(0.79)
    const surveyCompleted = townVendingCommitteeConstituted ? r.chance(0.82) : r.chance(0.34)

    // Once the survey is done the certificate is an ENTITLEMENT, so the only
    // honest way to model the shortfall is as a failure to issue - never as a
    // vendor declining to collect. Where no survey exists, almost nothing has
    // been issued, because the corporation never started.
    const issueRate = surveyCompleted ? r.float(0.24, 0.93) : r.float(0, 0.11)
    const certificatesOfVendingIssued = Math.min(registeredVendors, Math.round(registeredVendors * issueRate))

    // A vending zone is known by the locality it sits in - that is how the
    // vendors, the ward office and the committee all refer to it - so the name
    // is built from the corporation's own published localities.
    const locality = localityFor(`vendorzone:${i}`)

    return {
      id: `vzn-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      name: `${locality} ${r.pick(VENDING_ZONE_PLACE_KINDS)}`,
      wardId: ward.id,
      sanctionedVendingCapacity,
      registeredVendors,
      certificatesOfVendingIssued,
      surveyCompleted,
      townVendingCommitteeConstituted,
    }
  })

  /* ------------------------------------------------------------ The trend */

  const trainedPerMonth = LIVELIHOOD_CENTRES.reduce((s, c) => s + c.trainedLast12m, 0) / 12
  const trainedWeight = LIVELIHOOD_CENTRES.reduce((s, c) => s + c.trainedLast12m, 0)
  const placementRate =
    trainedWeight > 0
      ? LIVELIHOOD_CENTRES.reduce((s, c) => s + c.trainedLast12m * c.placedInWorkPct, 0) / trainedWeight
      : 0
  const certificatesPerMonth = VENDOR_ZONES.reduce((s, z) => s + z.certificatesOfVendingIssued, 0) / 12

  LIVELIHOOD_TREND = MONTH_LABELS.map((month, i) => {
    const r = det(`livtrend:${month}`)
    // A mild upward drift through the year - batches close and certificates
    // are issued in clusters when a committee finally meets.
    const drift = 0.88 + i * 0.045
    const trained = Math.round(trainedPerMonth * drift * r.float(0.9, 1.14))
    return {
      month,
      trained,
      placed: Math.round(trained * (placementRate / 100) * r.float(0.86, 1.1)),
      certificatesIssued: Math.round(certificatesPerMonth * drift * r.float(0.72, 1.32)),
    }
  })
})
