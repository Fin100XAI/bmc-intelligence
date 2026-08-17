import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import type { Severity, Trend } from '@/types/common'
import type {
  Committee,
  CouncilPosition,
  CouncilResolution,
  EducationWardSummary,
  HousingScheme,
  LicenceCategory,
  LicenceRegister,
  LightingCircuit,
  LightingFault,
  MunicipalSchool,
  OpenSpace,
  OpenSpaceKind,
  RedevelopmentStage,
  RegistrationCentre,
  RegistrationTrendPoint,
  SchoolLevel,
  SchoolMedium,
  Settlement,
  SettlementRecognition,
  TreeWardPosition,
} from '@/types/civic-services'
import { det, isoDaysFromAnchor, isoFromAnchor } from '@/utils/deterministic'
import { WARDS, wardName } from './reference'
import { stateFrom } from './city.data'
import { CORPORATION_SHORT_NAME, landmarkName, localityFor } from './naming'
import { CITY_SCALE, scaled, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/civic.data.ts
 *
 * The obligatory municipal services: education, slum and housing, street
 * lighting, licensing, registration of births and deaths, gardens and the
 * Tree Authority, and the Corporation's own deliberative wing.
 *
 * These are duties assigned to municipalities by the Twelfth Schedule of the
 * Constitution and by the Maharashtra Municipal Corporation Act, 1949. The
 * platform previously modelled a corporation's engineering and finance
 * functions in depth and none of these at all, which described a public works
 * authority rather than a municipal corporation.
 *
 * Everything here follows the same discipline as every other seed layer:
 * volumes track the active corporation through `CITY_SCALE`, place names come
 * from the corporation's own published localities, every figure is drawn from
 * a seeded PRNG so the picture is identical on every reload, and the whole
 * layer is rebuilt on a corporation switch.
 *
 * ONE DELIBERATE ABSENCE. The housing layer holds settlements and the SERVICE
 * COVERAGE delivered to them - standposts, toilet seats, collection rounds. It
 * holds no household register, no individual, no name and no entitlement
 * determination, and it must never acquire one. A municipal platform that
 * profiled residents of informal settlements would be the most dangerous thing
 * this system could become, so the shape refuses it rather than relying on
 * anyone's restraint.
 */

/* ==========================================================================
   Live bindings
   ========================================================================== */

export let MUNICIPAL_SCHOOLS: MunicipalSchool[] = []
export let EDUCATION_WARD_SUMMARY: EducationWardSummary[] = []
export let SETTLEMENTS: Settlement[] = []
export let HOUSING_SCHEMES: HousingScheme[] = []
export let LIGHTING_CIRCUITS: LightingCircuit[] = []
export let LIGHTING_FAULTS: LightingFault[] = []
export let LICENCE_REGISTERS: LicenceRegister[] = []
export let REGISTRATION_CENTRES: RegistrationCentre[] = []
export let REGISTRATION_TREND: RegistrationTrendPoint[] = []
export let OPEN_SPACES: OpenSpace[] = []
export let TREE_WARD_POSITIONS: TreeWardPosition[] = []
export let COMMITTEES: Committee[] = []
export let COUNCIL_RESOLUTIONS: CouncilResolution[] = []
export let COUNCIL_POSITION: CouncilPosition = {
  corporatorSeats: 0,
  committees: 0,
  resolutionsTabled12m: 0,
  resolutionsPassed12m: 0,
  passedAwaitingImplementation: 0,
  meanDaysTabledToDecision: 0,
  attendanceTrend: { direction: 'flat', changePct: 0, polarity: 'positive', comparisonLabel: 'vs previous year' },
}

/* ==========================================================================
   Vocabulary
   ========================================================================== */

const LICENCE_CATEGORIES: LicenceCategory[] = [
  'shop-establishment', 'eating-house', 'lodging', 'trade-storage', 'factory', 'advertisement-hoarding', 'hawker',
]

function build$SCHOOL_PLACE_KINDS() {
  return [t('Vidyalaya'), t('School'), t('Shala'), t('Municipal School'), t('Secondary School')]
}
let SCHOOL_PLACE_KINDS: ReturnType<typeof build$SCHOOL_PLACE_KINDS> = build$SCHOOL_PLACE_KINDS()
registerLayer(() => {
  SCHOOL_PLACE_KINDS = build$SCHOOL_PLACE_KINDS()
})
function build$SETTLEMENT_PLACE_KINDS() {
  return [t('Nagar'), t('Chawl'), t('Wadi'), t('Colony'), t('Vasahat'), t('Basti')]
}
let SETTLEMENT_PLACE_KINDS: ReturnType<typeof build$SETTLEMENT_PLACE_KINDS> = build$SETTLEMENT_PLACE_KINDS()
registerLayer(() => {
  SETTLEMENT_PLACE_KINDS = build$SETTLEMENT_PLACE_KINDS()
})
function build$OPEN_SPACE_PLACE_KINDS() {
  return [t('Udyan'), t('Garden'), t('Maidan'), t('Park'), t('Recreation Ground')]
}
let OPEN_SPACE_PLACE_KINDS: ReturnType<typeof build$OPEN_SPACE_PLACE_KINDS> = build$OPEN_SPACE_PLACE_KINDS()
registerLayer(() => {
  OPEN_SPACE_PLACE_KINDS = build$OPEN_SPACE_PLACE_KINDS()
})

function build$MONTH_LABELS() {
  return [t('Feb'), t('Mar'), t('Apr'), t('May'), t('Jun'), t('Jul')]
}
let MONTH_LABELS: ReturnType<typeof build$MONTH_LABELS> = build$MONTH_LABELS()
registerLayer(() => {
  MONTH_LABELS = build$MONTH_LABELS()
})

/** Thirty-day periods in a year, converting an annual rate to a monthly volume. */
const THIRTY_DAY_PERIODS_PER_YEAR = 12.17

/**
 * Crude birth rate per thousand residents a year. Maharashtra's urban
 * districts report between fifteen and sixteen.
 */
const URBAN_BIRTH_RATE_PER_1000 = 15.5

/**
 * Crude death rate per thousand residents a year, close to seven across
 * Maharashtra's urban districts.
 *
 * This MUST stay equal to the rate in `deathcare.data.ts`. The registration
 * layer counts the deaths a city registers and the deathcare layer counts the
 * rites its grounds hold; those are the same physical events seen at two
 * counters, and a Commissioner reading both pages in one sitting will notice
 * immediately if they disagree. Registration completeness in Maharashtra's
 * corporations is effectively total, so the two figures should differ only by
 * the small share of rites held outside municipal grounds.
 */
const URBAN_DEATH_RATE_PER_1000 = 7

/* ==========================================================================
   Rebuild
   ========================================================================== */

registerLayer(() => {
  const corp = activeCorporation
  const scale = CITY_SCALE
  const prefix = CORPORATION_SHORT_NAME || corp.shortName.replace(/[^A-Za-z]/g, '').toUpperCase()
  const totalWardPopulation = WARDS.reduce((s, w) => s + w.population, 0) || 1

  /* ---------------------------------------------------------------- Schools */

  // Anchored to the Education Department's own published school count where
  // the active corporation reports one (1,135 for BMC, bmceducation.in);
  // otherwise modelled at roughly one municipal school per eleven thousand
  // residents, with a floor that keeps the smallest corporation's education
  // board populated rather than empty.
  const schoolCount = corp.municipalSchoolsCount ?? scaledCount(1100, scale.population, 14)

  MUNICIPAL_SCHOOLS = Array.from({ length: schoolCount }, (_, i) => {
    const r = det(`school:${i}`)
    const ward = r.pick(WARDS)
    const level = r.weighted([
      ['primary', 8], ['upper-primary', 5], ['secondary', 4], ['higher-secondary', 1],
    ] as const) as SchoolLevel
    const medium = r.weighted([
      ['marathi', 9], ['hindi', 6], ['urdu', 4], ['english', 4], ['gujarati', 2], ['other', 1],
    ] as const) as SchoolMedium

    const enrolment = r.int(
      level === 'primary' ? 90 : 120,
      level === 'higher-secondary' ? 620 : level === 'secondary' ? 780 : 540,
    )
    // Establishment is sanctioned against enrolment; the gap between sanctioned
    // and in-position posts is the finding this page exists to surface.
    const sanctioned = Math.max(3, Math.round(enrolment / r.float(26, 36)))
    const inPosition = Math.max(1, sanctioned - r.int(0, Math.max(1, Math.round(sanctioned * 0.34))))

    const infrastructure = r.round(38, 96, 0)
    const attendance = r.round(58, 96, 1)
    const dropout = r.round(0.4, 11.5, 1)

    return {
      id: `sch-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      name: `${landmarkName(`school:${i}`, r.pick(SCHOOL_PLACE_KINDS))}`,
      wardId: ward.id,
      medium,
      level,
      location: {
        lat: ward.centroid.lat + r.float(-0.014, 0.014),
        lng: ward.centroid.lng + r.float(-0.014, 0.014),
      },
      enrolment,
      teachersSanctioned: sanctioned,
      teachersInPosition: inPosition,
      attendancePct: attendance,
      dropoutPct: dropout,
      infrastructureScore: infrastructure,
      hasDrinkingWater: r.chance(0.93),
      hasGirlsToilet: r.chance(0.86),
      hasElectricity: r.chance(0.97),
      hasLibrary: r.chance(0.58),
      hasComputerLab: r.chance(0.44),
      midDayMealCoveragePct: r.round(72, 100, 1),
      passPct: level === 'secondary' || level === 'higher-secondary' ? r.round(58, 99, 1) : undefined,
      state: stateFrom(infrastructure * 0.4 + attendance * 0.4 + (100 - dropout * 8) * 0.2),
      lastInspectedAt: isoDaysFromAnchor(-r.int(4, 240)),
    }
  })

  // Anchors the city-wide enrolment total to the Education Department's own
  // published figure (~2.93 lakh for BMC) by rescaling every school's
  // independently-rolled enrolment proportionally. This keeps the spread
  // between schools exactly as modelled while making the aggregate genuinely
  // real rather than an artefact of however many schools happened to roll high.
  if (corp.municipalSchoolsEnrolment) {
    const generatedEnrolment = MUNICIPAL_SCHOOLS.reduce((s, x) => s + x.enrolment, 0)
    const ratio = generatedEnrolment > 0 ? corp.municipalSchoolsEnrolment / generatedEnrolment : 1
    MUNICIPAL_SCHOOLS = MUNICIPAL_SCHOOLS.map((s) => ({ ...s, enrolment: Math.max(1, Math.round(s.enrolment * ratio)) }))
  }

  EDUCATION_WARD_SUMMARY = WARDS.map((ward) => {
    const rows = MUNICIPAL_SCHOOLS.filter((s) => s.wardId === ward.id)
    const enrolment = rows.reduce((s, x) => s + x.enrolment, 0)
    const sanctioned = rows.reduce((s, x) => s + x.teachersSanctioned, 0)
    const inPosition = rows.reduce((s, x) => s + x.teachersInPosition, 0)
    const vacancy = sanctioned > 0 ? Math.round(((sanctioned - inPosition) / sanctioned) * 1000) / 10 : 0
    const attendance = rows.length ? Math.round((rows.reduce((s, x) => s + x.attendancePct, 0) / rows.length) * 10) / 10 : 0
    const dropout = rows.length ? Math.round((rows.reduce((s, x) => s + x.dropoutPct, 0) / rows.length) * 10) / 10 : 0
    return {
      wardId: ward.id,
      schools: rows.length,
      enrolment,
      teacherVacancyPct: vacancy,
      avgAttendancePct: attendance,
      avgDropoutPct: dropout,
      schoolsBelowInfraThreshold: rows.filter((x) => x.infrastructureScore < 55).length,
      state: stateFrom(attendance * 0.45 + (100 - vacancy) * 0.35 + (100 - dropout * 8) * 0.2),
    }
  })

  /* ----------------------------------------------------------- Settlements */

  const settlementCount = scaledCount(160, scale.population, 8)

  SETTLEMENTS = Array.from({ length: settlementCount }, (_, i) => {
    const r = det(`settlement:${i}`)
    const ward = r.pick(WARDS)
    const recognition = r.weighted([
      ['notified', 6], ['census', 5], ['identified', 3], ['unrecognised', 1],
    ] as const) as SettlementRecognition

    const population = r.int(scaledCount(900, scale.population, 300), scaledCount(28000, scale.population, 2400))
    const households = Math.max(40, Math.round(population / r.float(3.9, 4.9)))
    const area = Math.round((population / r.float(520, 1450)) * 100) / 100

    // Service adequacy is dominated by how many people share a water point and
    // a toilet seat. Both are ratios where LOWER is better, so the index
    // inverts them against the benchmark a corporation designs to.
    const personsPerWaterPoint = r.int(38, 340)
    const personsPerToiletSeat = r.int(22, 190)
    const seatsTotal = Math.max(4, Math.round(population / personsPerToiletSeat))
    const seatsFunctional = Math.max(1, seatsTotal - r.int(0, Math.max(1, Math.round(seatsTotal * 0.3))))
    const lightsTotal = Math.max(6, Math.round(area * r.float(9, 26)))
    const lightsFunctional = Math.max(1, lightsTotal - r.int(0, Math.max(1, Math.round(lightsTotal * 0.28))))
    const paved = r.round(18, 94, 0)

    const waterScore = Math.max(0, 100 - (personsPerWaterPoint / 340) * 100)
    const toiletScore = Math.max(0, 100 - (personsPerToiletSeat / 190) * 100)
    const serviceIndex = Math.round(
      waterScore * 0.3 + toiletScore * 0.3 + paved * 0.2 + (lightsFunctional / lightsTotal) * 100 * 0.2,
    )

    const redevelopment = r.weighted([
      ['not-proposed', 8], ['survey', 4], ['scheme-proposed', 3], ['approved', 2],
      ['under-construction', 2], ['rehoused', 1],
    ] as const) as RedevelopmentStage

    return {
      id: `stl-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      name: `${landmarkName(`settlement:${i}`, r.pick(SETTLEMENT_PLACE_KINDS))}`,
      wardId: ward.id,
      recognition,
      centroid: {
        lat: ward.centroid.lat + r.float(-0.015, 0.015),
        lng: ward.centroid.lng + r.float(-0.015, 0.015),
      },
      areaHectares: area,
      estimatedPopulation: population,
      estimatedHouseholds: households,
      personsPerWaterPoint,
      personsPerToiletSeat,
      toiletSeatsFunctional: seatsFunctional,
      toiletSeatsTotal: seatsTotal,
      wasteCollectionRoundsPerWeek: r.int(2, 7),
      internalRoadsPavedPct: paved,
      streetLightsFunctional: lightsFunctional,
      streetLightsTotal: lightsTotal,
      floodProne: ward.floodProne ? r.chance(0.62) : r.chance(0.18),
      serviceIndex,
      redevelopment,
      schemeReference: redevelopment === 'not-proposed' || redevelopment === 'survey'
        ? undefined
        : `${prefix}/RH/${2024 + r.int(0, 2)}/${String(r.int(11, 940)).padStart(3, '0')}`,
      state: stateFrom(serviceIndex),
      lastSurveyedAt: isoDaysFromAnchor(-r.int(20, 700)),
    }
  })

  /*
   * Hold each ward's settlement population inside its own population.
   *
   * Settlements draw a ward at random and a population independently of it,
   * so a physically small ward could be dealt several large settlements and
   * end up reporting more residents in informal housing than the ward holds
   * altogether. Brihanmumbai's Marine Lines / Kalbadevi reached 107.5 per
   * cent, which is not a severe figure but an impossible one - a part cannot
   * exceed its whole, and any page dividing by ward population would print
   * nonsense from it.
   *
   * The ceiling is 85 per cent rather than 100. Wards genuinely dominated by
   * informal settlement exist and must stay representable - Mumbai's M/E ward
   * is around three quarters - but a ward housing its entire population
   * informally would describe no corporation in Maharashtra.
   *
   * Scaling is proportional within the offending ward only, so the relative
   * size of its settlements is preserved, and every other ward is untouched.
   */
  const SETTLEMENT_SHARE_CEILING = 0.85
  const settlementPopulationByWard = new Map<string, number>()
  for (const s of SETTLEMENTS) {
    settlementPopulationByWard.set(s.wardId, (settlementPopulationByWard.get(s.wardId) ?? 0) + s.estimatedPopulation)
  }
  for (const ward of WARDS) {
    const total = settlementPopulationByWard.get(ward.id) ?? 0
    const ceiling = ward.population * SETTLEMENT_SHARE_CEILING
    if (total <= ceiling || total === 0) continue
    const factor = ceiling / total
    for (const s of SETTLEMENTS) {
      if (s.wardId !== ward.id) continue
      s.estimatedPopulation = Math.max(1, Math.round(s.estimatedPopulation * factor))
      s.estimatedHouseholds = Math.max(1, Math.round(s.estimatedHouseholds * factor))
    }
  }

  const schemeCount = scaledCount(26, scale.population, 4)
  HOUSING_SCHEMES = Array.from({ length: schemeCount }, (_, i) => {
    const r = det(`scheme:${i}`)
    const wardIds = r.sample(WARDS, r.int(1, 3)).map((w) => w.id)
    const stage = r.weighted([
      ['survey', 2], ['scheme-proposed', 3], ['approved', 3], ['under-construction', 4], ['rehoused', 2],
    ] as const) as RedevelopmentStage
    const sanctioned = r.int(scaledCount(240, scale.population, 60), scaledCount(4200, scale.population, 420))
    const deliveredShare = stage === 'rehoused' ? 1 : stage === 'under-construction' ? r.float(0.18, 0.78) : 0
    const delivered = Math.round(sanctioned * deliveredShare)
    const outlay = scaled(r.int(120, 1600), scale.budget, 4)
    const spentShare = stage === 'rehoused' ? r.float(0.9, 1) : stage === 'under-construction' ? r.float(0.25, 0.85) : r.float(0.02, 0.2)
    const delay = stage === 'rehoused' ? r.int(0, 180) : r.int(0, 900)

    return {
      id: `hsc-${String(i + 1).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      reference: `${prefix}/HSG/${2023 + r.int(0, 3)}/${String(i + 41).padStart(3, '0')}`,
      name: t('{0} Rehousing Scheme', localityFor(`scheme:${i}`)),
      wardIds,
      stage,
      tenementsSanctioned: sanctioned,
      tenementsDelivered: delivered,
      householdsInTransit: stage === 'under-construction' || stage === 'approved' ? r.int(0, Math.round(sanctioned * 0.4)) : 0,
      outlayCrore: outlay,
      spentCrore: Math.round(outlay * spentShare * 10) / 10,
      startedAt: isoDaysFromAnchor(-r.int(180, 2200)),
      targetCompletionAt: isoDaysFromAnchor(r.int(-500, 900)),
      delayDays: delay,
      implementingAgency: r.pick([
        t('{0} Housing Cell', corp.shortName),
        t('State Slum Rehabilitation Authority'),
        t('{0} Projects Department', corp.shortName),
      ]),
      state: stateFrom(delay > 540 ? 40 : delay > 240 ? 60 : 82),
    }
  })

  /* ------------------------------------------------------- Street lighting */

  const circuitCount = scaledCount(420, scale.area, 12)

  LIGHTING_CIRCUITS = Array.from({ length: circuitCount }, (_, i) => {
    const r = det(`circuit:${i}`)
    const ward = r.pick(WARDS)
    const poles = r.int(24, 320)
    const functional = Math.max(1, poles - r.int(0, Math.max(1, Math.round(poles * 0.22))))
    const lampType = r.weighted([
      ['led', 11], ['sodium-vapour', 5], ['metal-halide', 2], ['cfl', 1],
    ] as const) as LightingCircuit['lampType']
    const ledPct = lampType === 'led' ? r.round(88, 100, 0) : r.round(4, 62, 0)

    // Load follows the lamp mix: an LED pole draws roughly a third of what the
    // sodium-vapour fitting it replaced did, which is the entire financial
    // case for conversion and has to be visible in the figures.
    const wattsPerPole = lampType === 'led' ? r.int(38, 90) : lampType === 'cfl' ? r.int(70, 130) : r.int(140, 260)
    const loadKw = Math.round((poles * wattsPerPole) / 100) / 10
    const burningHours = r.float(10.4, 11.9)
    const consumption = Math.round(loadKw * burningHours * 30)
    const tariff = r.float(7.4, 9.6)

    const compliance = r.round(62, 99, 1)
    const faults = r.int(0, 14)

    return {
      id: `lgc-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${prefix}/SL/${ward.code.replace(/[^A-Za-z0-9]/g, '')}/${String(i + 1).padStart(3, '0')}`,
      wardId: ward.id,
      location: landmarkName(`circuit:${i}`, r.pick([t('Road'), t('Marg'), t('Cross Road'), t('Junction'), t('Link Road')])),
      centroid: {
        lat: ward.centroid.lat + r.float(-0.013, 0.013),
        lng: ward.centroid.lng + r.float(-0.013, 0.013),
      },
      polesTotal: poles,
      polesFunctional: functional,
      lampType,
      ledConversionPct: ledPct,
      connectedLoadKw: loadKw,
      monthlyConsumptionKwh: consumption,
      monthlyEnergyCostRupees: Math.round(consumption * tariff),
      burningHoursCompliancePct: compliance,
      automatedSwitching: r.chance(lampType === 'led' ? 0.82 : 0.34),
      faultsOpen: faults,
      meanRestorationHours: r.round(3, 96, 1),
      priorityCorridor: r.chance(0.22),
      state: stateFrom((functional / poles) * 100 * 0.6 + compliance * 0.4),
      lastInspectedAt: isoDaysFromAnchor(-r.int(1, 120)),
    }
  })

  const faultCount = scaledCount(180, scale.area, 8)
  LIGHTING_FAULTS = Array.from({ length: faultCount }, (_, i) => {
    const r = det(`lgfault:${i}`)
    const circuit = r.pick(LIGHTING_CIRCUITS)
    const category = r.weighted([
      ['lamp-failure', 9], ['cable-fault', 4], ['feeder-tripped', 3], ['pole-damage', 2], ['timer-fault', 1],
    ] as const) as LightingFault['category']
    const severity = r.weighted([
      ['low', 5], ['medium', 6], ['high', 3], ['critical', 1],
    ] as const) as Severity
    const status = r.weighted([['reported', 4], ['assigned', 3], ['rectified', 5]] as const) as LightingFault['status']
    const ageHours = r.int(1, 260)
    const slaHours = severity === 'critical' ? 12 : severity === 'high' ? 24 : severity === 'medium' ? 48 : 96

    return {
      id: `lgf-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${prefix}/SLF/${String(i + 1).padStart(4, '0')}`,
      circuitId: circuit.id,
      wardId: circuit.wardId,
      reportedAt: isoFromAnchor(-ageHours * 60),
      category,
      polesAffected: category === 'lamp-failure' ? r.int(1, 6) : r.int(4, 60),
      severity,
      status,
      ageHours,
      slaHours,
      breached: status !== 'rectified' && ageHours > slaHours,
    }
  })

  /* ------------------------------------------------------ Licences & trade */

  LICENCE_REGISTERS = WARDS.flatMap((ward) =>
    LICENCE_CATEGORIES.map((category) => {
      const r = det(`licence:${ward.id}:${category}`)
      const share = ward.population / totalWardPopulation
      const base = {
        'shop-establishment': 42000, 'eating-house': 6400, lodging: 900,
        'trade-storage': 5200, factory: 1400, 'advertisement-hoarding': 2600, hawker: 12000,
      }[category]
      const active = Math.max(4, Math.round(base * share * scale.population * r.float(0.7, 1.35)))
      const expired = Math.round(active * r.float(0.04, 0.26))
      const pending = Math.round(active * r.float(0.01, 0.11))
      const demanded = Math.round(active * r.float(0.09, 0.42) * 10) / 10
      const compliance = r.round(46, 97, 1)

      return {
        id: `lic-${ward.id}-${category}`,
        tenantId: TENANT_ID,
        wardId: ward.id,
        category,
        active,
        expired,
        pending,
        meanDecisionDays: r.round(3, 46, 1),
        charterCompliancePct: compliance,
        feeDemandedLakh: demanded,
        feeCollectedLakh: Math.round(demanded * r.float(0.52, 0.98) * 10) / 10,
        unlicensedDetected: r.int(0, Math.max(2, Math.round(active * 0.06))),
        noticesIssued: r.int(0, Math.max(2, Math.round(active * 0.04))),
        prosecutionsFiled: r.int(0, 12),
        state: stateFrom(compliance),
      }
    }),
  )

  /* --------------------------------------- Registration of births & deaths */

  const centreCount = scaledCount(52, scale.population, WARDS.length)

  // Pass one establishes what each centre IS. Volumes are allocated in pass
  // two from the city's own vital rates, NOT drawn per centre: the number of
  // births and deaths a city registers is set by its demography, not by how
  // many counters it happens to run. Drawing each centre's volume from a
  // population-scaled range while the centre count also scaled made city
  // totals rise with the SQUARE of population - Brihanmumbai implied a crude
  // death rate of twenty-seven per thousand against an actual urban rate of
  // about seven, and the same events were reported three times larger here
  // than on the cemeteries and crematoria page.
  const centreSpecs = Array.from({ length: centreCount }, (_, i) => {
    const r = det(`regcentre:${i}`)
    const kind: RegistrationCentre['kind'] = r.chance(0.55) ? 'hospital-unit' : 'ward-office'
    return {
      i,
      r,
      kind,
      ward: WARDS[i % WARDS.length]!,
      // Births are registered where they occur, so a hospital unit carries the
      // greater share of them; deaths are more evenly spread across the ward
      // offices that certify them.
      birthLoad: (kind === 'hospital-unit' ? 2.6 : 1) * r.float(0.6, 1.4),
      deathLoad: (kind === 'hospital-unit' ? 1.15 : 1) * r.float(0.6, 1.4),
    }
  })

  const cityBirths30d = Math.round(
    (scale.populationTotal * (URBAN_BIRTH_RATE_PER_1000 / 1000)) / THIRTY_DAY_PERIODS_PER_YEAR,
  )
  const cityDeaths30d = Math.round(
    (scale.populationTotal * (URBAN_DEATH_RATE_PER_1000 / 1000)) / THIRTY_DAY_PERIODS_PER_YEAR,
  )
  const totalBirthLoad = centreSpecs.reduce((s, c) => s + c.birthLoad, 0) || 1
  const totalDeathLoad = centreSpecs.reduce((s, c) => s + c.deathLoad, 0) || 1

  REGISTRATION_CENTRES = centreSpecs.map((spec) => {
    const { i, r, kind, ward } = spec
    const births = Math.max(1, Math.round((cityBirths30d * spec.birthLoad) / totalBirthLoad))
    const deaths = Math.max(1, Math.round((cityDeaths30d * spec.deathLoad) / totalDeathLoad))
    const withinPeriod = r.round(74, 99, 1)

    return {
      id: `reg-${String(i + 1).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      name: kind === 'hospital-unit'
        ? t('{0} Registration Unit', landmarkName(`regc:${i}`, 'Hospital'))
        : t('{0} Ward Office', wardName(ward.id)),
      wardId: ward.id,
      kind,
      birthsRegistered30d: births,
      deathsRegistered30d: deaths,
      withinStatutoryPeriodPct: withinPeriod,
      lateRegistrations30d: Math.round((births + deaths) * (1 - withinPeriod / 100)),
      certificatesIssued30d: Math.round((births + deaths) * r.float(1.1, 1.9)),
      meanIssueDays: r.round(1, 14, 1),
      digitalSharePct: r.round(18, 86, 1),
      // Backlog is a share of the counter's own throughput. A fixed range made
      // the smallest corporation's ward office carry a Brihanmumbai backlog.
      backlog: Math.round((births + deaths) * r.float(0, 0.28)),
      state: stateFrom(withinPeriod),
    }
  })

  REGISTRATION_TREND = MONTH_LABELS.map((month, i) => {
    const r = det(`regtrend:${month}`)
    const births = REGISTRATION_CENTRES.reduce((s, c) => s + c.birthsRegistered30d, 0)
    const deaths = REGISTRATION_CENTRES.reduce((s, c) => s + c.deathsRegistered30d, 0)
    const drift = 0.9 + i * 0.03
    return {
      month,
      births: Math.round(births * drift * r.float(0.94, 1.06)),
      deaths: Math.round(deaths * drift * r.float(0.92, 1.08)),
      certificatesIssued: Math.round((births + deaths) * drift * r.float(1.15, 1.6)),
    }
  })

  /* --------------------------------------- Gardens, open space & the trees */

  // Anchored to MCGM's own Recreation Ground / Playground / Garden plot list
  // (18 Sep 2023): `gardenPlotsCount` real plots citywide, of which
  // `gardensCount` are gardens specifically. Traffic islands and plazas sit
  // outside that published list, so they are carried as a small unanchored
  // addition on top rather than folded into the cited total.
  const openSpaceCount = scale.gardenPlotsCount + scaledCount(70, scale.area, 5)
  const nonGardenPlots = Math.max(1, scale.gardenPlotsCount - scale.gardensCount)
  const openSpaceKindWeights = [
    ['garden', scale.gardensCount],
    ['playground', Math.round((nonGardenPlots * 6) / 14)],
    ['recreation-ground', Math.round((nonGardenPlots * 4) / 14)],
    ['traffic-island', Math.round((nonGardenPlots * 3) / 14)],
    ['plaza', Math.round((nonGardenPlots * 1) / 14)],
  ] as const
  OPEN_SPACES = Array.from({ length: openSpaceCount }, (_, i) => {
    const r = det(`openspace:${i}`)
    const ward = r.pick(WARDS)
    const kind = r.weighted(openSpaceKindWeights) as OpenSpaceKind
    const condition = r.round(32, 97, 0)

    return {
      id: `ops-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      name: landmarkName(`openspace:${i}`, r.pick(OPEN_SPACE_PLACE_KINDS)),
      wardId: ward.id,
      kind,
      centroid: {
        lat: ward.centroid.lat + r.float(-0.014, 0.014),
        lng: ward.centroid.lng + r.float(-0.014, 0.014),
      },
      areaHectares: Math.round(r.float(0.06, kind === 'recreation-ground' ? 9 : 3.4) * 100) / 100,
      maintenance: r.weighted([['departmental', 6], ['caretaker', 4], ['adopted', 2]] as const) as OpenSpace['maintenance'],
      conditionScore: condition,
      hasChildrensPlayArea: r.chance(kind === 'playground' ? 0.95 : 0.42),
      hasAccessibleEntrance: r.chance(0.48),
      openToPublic: r.chance(0.94),
      encroachmentReported: r.chance(0.14),
      state: stateFrom(condition),
      lastInspectedAt: isoDaysFromAnchor(-r.int(2, 300)),
    }
  })

  // Anchored to the corporation's own most recent official tree census
  // (`CorporationRef.treeCensusCount` - 29,75,283 trees for Brihanmumbai's
  // 2018 census) where one is published, distributed across wards by
  // population share with a per-ward variance band. Where no census exists,
  // the total falls back to Brihanmumbai's own census density per km² of
  // ground covered - a periodic survey figure, not a live count either way.
  const treeCensusTotal = corp.treeCensusCount ?? Math.round(4931 * scale.area)

  TREE_WARD_POSITIONS = WARDS.map((ward) => {
    const r = det(`trees:${ward.id}`)
    const spaces = OPEN_SPACES.filter((o) => o.wardId === ward.id)
    const openHa = spaces.reduce((s, o) => s + o.areaHectares, 0)
    const canopy = r.round(4, 34, 1)
    const granted = r.int(4, 220)
    const required = Math.round(granted * r.float(1.8, 3.2))
    const completed = Math.round(required * r.float(0.32, 0.98))
    const survival = r.round(48, 94, 1)
    const treesShare = ward.population / totalWardPopulation

    return {
      wardId: ward.id,
      treesSurveyed: Math.max(200, scaledCount(treeCensusTotal * treesShare, r.float(0.75, 1.35))),
      canopyCoverPct: canopy,
      openSpacePerThousandHa: Math.round((openHa / (ward.population / 1000)) * 1000) / 1000,
      fellingApplicationsPending: r.int(0, 46),
      fellingPermissionsGranted12m: granted,
      compensatoryPlantingRequired: required,
      compensatoryPlantingCompleted: completed,
      treesPlanted12m: completed + r.int(0, 900),
      survivalRatePct: survival,
      state: stateFrom(canopy * 1.6 + (completed / Math.max(1, required)) * 100 * 0.5),
    }
  })

  /* ---------------------------------------------- Council & its committees */

  // The corporation's own elected seat count where the roster records it -
  // this is researched fact in `src/config/corporations.ts`, not a modelled
  // figure, and the deliberative wing should be sized by it rather than by a
  // ratio off Brihanmumbai.
  const seats = corp.electoralWards ?? scaledCount(227, scale.population, 20)

  COMMITTEES = [
    {
      id: 'cmt-general-body',
      tenantId: TENANT_ID,
      name: t('General Body'),
      kind: 'general-body',
      seats,
      chairDesignation: 'Mayor',
      sittings12m: 12,
      meanAttendancePct: 78,
      nextSittingAt: isoDaysFromAnchor(9),
      description: t('The Corporation in session. Approves the annual budget estimates and every matter reserved to the whole house.'),
    },
    {
      id: 'cmt-standing',
      tenantId: TENANT_ID,
      name: t('Standing Committee'),
      kind: 'standing',
      // BMC's own published Standing Committee membership where the roster
      // records it - researched fact, not the 11%-of-the-house ratio every
      // other committee below is still sized by.
      seats: corp.standingCommitteeMembersCount ?? Math.max(8, Math.round(seats * 0.11)),
      chairDesignation: 'Chairman, Standing Committee',
      sittings12m: 44,
      meanAttendancePct: 84,
      sanctionLimitCrore: scaled(50, scale.budget, 1),
      nextSittingAt: isoDaysFromAnchor(3),
      description: t('Sanctions expenditure and contracts within its financial limit; matters above it rise to the General Body.'),
    },
    {
      id: 'cmt-improvement',
      tenantId: TENANT_ID,
      name: t('Improvement Committee'),
      kind: 'improvement',
      seats: Math.max(6, Math.round(seats * 0.07)),
      chairDesignation: 'Chairman, Improvement Committee',
      sittings12m: 18,
      meanAttendancePct: 71,
      sanctionLimitCrore: scaled(12, scale.budget, 1),
      nextSittingAt: isoDaysFromAnchor(16),
      description: t('Development plan modifications, land reservations and improvement schemes.'),
    },
    {
      id: 'cmt-education',
      tenantId: TENANT_ID,
      name: t('Education Committee'),
      kind: 'education',
      seats: Math.max(6, Math.round(seats * 0.06)),
      chairDesignation: 'Chairman, Education Committee',
      sittings12m: 14,
      meanAttendancePct: 69,
      sanctionLimitCrore: scaled(8, scale.budget, 1),
      nextSittingAt: isoDaysFromAnchor(22),
      description: t('Municipal schools, the teaching establishment and the education budget.'),
    },
    {
      id: 'cmt-works',
      tenantId: TENANT_ID,
      name: t('Works Committee'),
      kind: 'works',
      seats: Math.max(6, Math.round(seats * 0.06)),
      chairDesignation: 'Chairman, Works Committee',
      sittings12m: 26,
      meanAttendancePct: 74,
      sanctionLimitCrore: scaled(20, scale.budget, 1),
      nextSittingAt: isoDaysFromAnchor(6),
      description: t('Civil works, roads, drains and building contracts referred by the administration.'),
    },
    {
      id: 'cmt-ward',
      tenantId: TENANT_ID,
      name: t('Ward Committees'),
      kind: 'ward-committee',
      seats,
      chairDesignation: 'Ward Committee Chairperson',
      sittings12m: Math.max(12, WARDS.length * 4),
      meanAttendancePct: 63,
      sanctionLimitCrore: scaled(2, scale.budget, 1),
      nextSittingAt: isoDaysFromAnchor(2),
      description: t('Statutory ward-level committees taking local works and grievances within the ward.'),
    },
  ]

  const RESOLUTION_SUBJECTS: Array<{ subject: string; summary: string; domain: string; committee: string }> = [
    { subject: 'Pre-monsoon nallah desilting contract', summary: t('Sanction of the annual desilting contract for major nallahs ahead of the monsoon, with third-party measurement of silt removed.'), domain: 'stormwater', committee: 'cmt-standing' },
    { subject: 'Municipal school building repairs', summary: t('Repair and structural strengthening of school buildings assessed below the safe condition threshold.'), domain: 'education', committee: 'cmt-education' },
    { subject: 'LED conversion of remaining street lighting circuits', summary: t('Conversion of sodium-vapour and metal-halide circuits to LED, with the energy saving to be reported against the sanctioned outlay.'), domain: 'street-lighting', committee: 'cmt-standing' },
    { subject: 'Community toilet blocks in settlements', summary: t('Construction and maintenance contract for community sanitation blocks in settlements below the service adequacy threshold.'), domain: 'housing', committee: 'cmt-works' },
    { subject: 'Revision of trade licence fee schedule', summary: t('Revision of the licence fee schedule, first revision since the previous scheduled review.'), domain: 'licensing', committee: 'cmt-general-body' },
    { subject: 'Garden maintenance through caretaker agencies', summary: t('Award of caretaker maintenance contracts for gardens and recreation grounds, with a condition-score-linked payment schedule.'), domain: 'gardens', committee: 'cmt-standing' },
    { subject: 'Water supply augmentation works', summary: t('Sanction of distribution network augmentation in the divisions reporting the lowest supply hours.'), domain: 'water', committee: 'cmt-standing' },
    { subject: 'Road resurfacing programme', summary: t('Annual resurfacing programme prioritised on the published road condition index rather than on representation.'), domain: 'roads', committee: 'cmt-works' },
    { subject: 'Solid waste processing capacity', summary: t('Capacity augmentation at processing facilities to reduce the tonnage routed to disposal.'), domain: 'waste', committee: 'cmt-general-body' },
    { subject: 'Rehousing scheme for transit households', summary: t('Sanction of transit accommodation rental support for households awaiting rehousing beyond the scheme timeline.'), domain: 'housing', committee: 'cmt-improvement' },
    { subject: 'Compensatory planting compliance', summary: t('Direction to the Tree Authority to report felling permissions against compensatory planting actually completed.'), domain: 'gardens', committee: 'cmt-improvement' },
    { subject: 'Hospital equipment procurement', summary: t('Procurement of diagnostic equipment for peripheral hospitals reporting the longest referral times.'), domain: 'hospitals', committee: 'cmt-standing' },
    { subject: 'Birth and death certificate turnaround', summary: t('Direction to reduce certificate issue time and clear the registration backlog at ward offices.'), domain: 'registration', committee: 'cmt-general-body' },
    { subject: 'Property tax arrears recovery policy', summary: t('Policy for recovery of long-outstanding property tax arrears, with an instalment facility for small assessees.'), domain: 'revenue', committee: 'cmt-standing' },
    { subject: 'Ward-level works allocation', summary: t('Allocation of the ward works fund across ward committees on a population and deficit basis.'), domain: 'wards', committee: 'cmt-ward' },
  ]

  const resolutionCount = scaledCount(64, scale.population, 15)
  COUNCIL_RESOLUTIONS = Array.from({ length: resolutionCount }, (_, i) => {
    const r = det(`resolution:${i}`)
    const spec = RESOLUTION_SUBJECTS[i % RESOLUTION_SUBJECTS.length]!
    const status = r.weighted([
      ['passed', 7], ['implemented', 5], ['tabled', 3], ['under-discussion', 3], ['deferred', 2], ['rejected', 1],
    ] as const) as CouncilResolution['status']
    const tabledDaysAgo = r.int(6, 340)
    const decided = status !== 'tabled' && status !== 'under-discussion'
    const committee = COMMITTEES.find((c) => c.id === spec.committee) ?? COMMITTEES[0]!
    const votingSeats = committee.seats
    const votesFor = decided ? r.int(Math.round(votingSeats * 0.34), votingSeats) : undefined
    const against = votesFor !== undefined ? r.int(0, Math.max(0, votingSeats - votesFor)) : undefined

    return {
      id: `res-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${prefix}/RES/2026/${String(i + 118).padStart(4, '0')}`,
      committeeId: committee.id,
      subject: `${spec.subject}${i >= RESOLUTION_SUBJECTS.length ? ` - ${localityFor(`res:${i}`)}` : ''}`,
      summary: spec.summary,
      domain: spec.domain,
      wardIds: r.chance(0.55) ? r.sample(WARDS, r.int(1, 3)).map((w) => w.id) : [],
      status,
      tabledAt: isoDaysFromAnchor(-tabledDaysAgo),
      decidedAt: decided ? isoDaysFromAnchor(-Math.round(tabledDaysAgo * r.float(0.15, 0.8))) : undefined,
      financialImplicationCrore: r.chance(0.78) ? scaled(r.int(2, 620), scale.budget, 0.2) : undefined,
      votesFor,
      votesAgainst: against,
      abstentions: votesFor !== undefined ? r.int(0, 6) : undefined,
      decisionCaseId: undefined,
      implementationNote: status === 'implemented'
        ? t('Administrative action recorded against the resolution; the sanctioned work is in progress or complete.')
        : undefined,
      classification: 'internal',
    }
  })

  const passed12m = COUNCIL_RESOLUTIONS.filter((x) => x.status === 'passed' || x.status === 'implemented').length
  const decidedRows = COUNCIL_RESOLUTIONS.filter((x) => x.decidedAt)
  const meanDays = decidedRows.length
    ? Math.round(
        decidedRows.reduce((s, x) => {
          const tabled = new Date(x.tabledAt).getTime()
          const at = new Date(x.decidedAt!).getTime()
          return s + Math.max(0, (at - tabled) / 86_400_000)
        }, 0) / decidedRows.length,
      )
    : 0

  const attendanceTrend: Trend = {
    direction: 'up',
    changePct: 2.4,
    polarity: 'positive',
    comparisonLabel: 'vs previous year',
  }

  COUNCIL_POSITION = {
    corporatorSeats: seats,
    committees: COMMITTEES.length,
    resolutionsTabled12m: COUNCIL_RESOLUTIONS.length,
    resolutionsPassed12m: passed12m,
    passedAwaitingImplementation: COUNCIL_RESOLUTIONS.filter((x) => x.status === 'passed').length,
    meanDaysTabledToDecision: meanDays,
    attendanceTrend,
  }
})

/* ==========================================================================
   Roll-ups
   ========================================================================== */

export function settlementsInWard(wardId: string): Settlement[] {
  return SETTLEMENTS.filter((s) => s.wardId === wardId)
}

export function schoolsInWard(wardId: string): MunicipalSchool[] {
  return MUNICIPAL_SCHOOLS.filter((s) => s.wardId === wardId)
}

export function committeeName(id: string): string {
  return COMMITTEES.find((c) => c.id === id)?.name ?? id
}
