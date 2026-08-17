import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import type {
  AirQualityStation,
  BuildingProposal,
  BuildingRecord,
  CoastalSegment,
  DiseaseIndicator,
  EmergencyStation,
  HealthIndicator,
  Hospital,
  NoiseReading,
  OutcomeChain,
  PlanningIndicator,
} from '@/types/city-domains'
import type { CityFormType } from './geo-generator'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS, WARD_BY_ID } from './reference'
import { PUMPING_STATIONS, STORM_DRAINS, WATER_ZONES, stateFrom } from './city.data'
import { severityFromScore } from './finance.data'
import { CITY_SCALE, scaled, scaledCount } from './scale'
import { CORPORATION_SHORT_NAME, localityNames } from './naming'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * Social and environmental domains - public health, hospitals, emergency
 * services, environment, coastal or riverfront frontage, building control,
 * urban planning and outcome intelligence.
 *
 * Hospital, fire station and frontage names are constructed from the ACTIVE
 * corporation's own localities and water bodies (`src/data/naming.ts`). Bed
 * counts, establishment strengths and facility counts scale to the active
 * corporation (`src/data/scale.ts`); occupancy, compliance and adequacy
 * percentages are ratios and are left alone. No municipal system is contacted.
 *
 * Every export below is a LIVE BINDING, rebuilt on a corporation switch.
 */

/** ---------------------------------------------------------------------
 * Public health - aggregate indicators only.
 *
 * The platform never models, stores or displays patient-level information of
 * any kind. Every health figure here is an aggregate ward-level count.
 * ------------------------------------------------------------------- */

const DISEASES: DiseaseIndicator[] = [
  'dengue',
  'malaria',
  'leptospirosis',
  'gastroenteritis',
  'hepatitis',
  'respiratory',
  'chikungunya',
]

/** Seasonal weighting - monsoon-associated conditions run higher in July. */
const SEASONAL_WEIGHT: Record<DiseaseIndicator, number> = {
  dengue: 1.5,
  malaria: 1.35,
  leptospirosis: 1.8,
  gastroenteritis: 1.4,
  hepatitis: 1.1,
  respiratory: 0.75,
  chikungunya: 1.2,
}

export let HEALTH_INDICATORS: HealthIndicator[] = []

/** ---------------------------------------------------------------------
 * Hospitals
 * ------------------------------------------------------------------- */

export let HOSPITALS: Hospital[] = []

/**
 * One hospital, sized to the active corporation.
 *
 * Bed and ICU strengths are Brihanmumbai-scale establishment figures scaled by
 * resident share, with floors that keep a major hospital recognisably major
 * even in the smallest corporation. Occupancy, staffing and serviceability are
 * percentages and are not scaled.
 */
function buildHospital(name: string, type: Hospital['type'], seedIndex: number, forceWardId?: string): Hospital {
  const r = det(`hospital:${name}`)
  const pop = CITY_SCALE.population
  const ward = forceWardId ? (WARD_BY_ID.get(forceWardId) ?? r.pick(WARDS)) : r.pick(WARDS)
  const bedsTotal =
    type === 'major'
      ? r.int(scaledCount(680, pop, 60), scaledCount(1850, pop, 180))
      : type === 'peripheral'
        ? r.int(scaledCount(120, pop, 25), scaledCount(420, pop, 90))
        : type === 'maternity'
          ? r.int(scaledCount(24, pop, 10), scaledCount(90, pop, 30))
          : r.int(0, scaledCount(12, pop, 6))
  const occupancy = r.round(52, 98, 1)
  const bedsOccupied = Math.round(bedsTotal * (occupancy / 100))
  const icuTotal =
    type === 'major'
      ? r.int(scaledCount(40, pop, 4), scaledCount(140, pop, 12))
      : type === 'peripheral'
        ? r.int(scaledCount(6, pop, 1), scaledCount(30, pop, 4))
        : 0
  const icuOccupancy = r.round(56, 99, 1)
  const accessibility = ward.floodProne ? r.int(46, 88) : r.int(70, 98)

  const allServices = [t('Emergency'), t('Trauma'), t('Maternity'), t('Paediatrics'), t('Dialysis'), t('Radiology'), t('Blood bank'), t('Critical care')]
  const available = r.sample(allServices, type === 'major' ? 8 : type === 'peripheral' ? r.int(4, 6) : r.int(1, 3))
  const unavailable = allServices.filter((s) => !available.includes(s))

  return {
    id: `hos-${String(seedIndex + 1).padStart(3, '0')}`,
    tenantId: TENANT_ID,
    name,
    type,
    wardId: ward.id,
    location: ward.centroid,
    bedsTotal,
    bedsOccupied,
    occupancyPct: occupancy,
    icuTotal,
    icuOccupied: Math.round(icuTotal * (icuOccupancy / 100)),
    emergencyLoadIndex: r.int(28, 98),
    staffingPct: r.round(58, 98, 1),
    equipmentServiceablePct: r.round(62, 99, 1),
    servicesAvailable: available,
    servicesUnavailable: unavailable,
    accessibilityIndex: accessibility,
    state: stateFrom(100 - Math.max(0, occupancy - 80) * 2.4),
  }
}

/** ---------------------------------------------------------------------
 * Fire & emergency
 * ------------------------------------------------------------------- */

export let EMERGENCY_STATIONS: EmergencyStation[] = []

/** ---------------------------------------------------------------------
 * Environment
 * ------------------------------------------------------------------- */

function aqiCategory(aqi: number): AirQualityStation['category'] {
  if (aqi <= 50) return 'good'
  if (aqi <= 100) return 'satisfactory'
  if (aqi <= 200) return 'moderate'
  if (aqi <= 300) return 'poor'
  if (aqi <= 400) return 'very-poor'
  return 'severe'
}

export let AIR_QUALITY_STATIONS: AirQualityStation[] = []
export let NOISE_READINGS: NoiseReading[] = []

/** ---------------------------------------------------------------------
 * Coastal, creek and waterfront frontage
 * ------------------------------------------------------------------- */

/**
 * Which kinds of frontage the corporation actually has to manage.
 *
 * Only a corporation on the sea or a tidal creek has beaches, seawalls and
 * mangroves; a river or lake city manages embankments, promenades and channel
 * reaches instead. Giving a landlocked corporation a mangrove programme would
 * be an obvious fabrication on a page a coastal cell would recognise instantly.
 */
function frontageTypes(form: CityFormType): CoastalSegment['type'][] {
  switch (form) {
    case 'coastal':
      return ['promenade', 'seawall', 'beach', 'mangrove', 'creek', 'seawall', 'beach', 'mangrove', 'creek', 'promenade', 'mangrove', 'creek']
    case 'creek-side':
      return ['creek', 'mangrove', 'promenade', 'seawall', 'creek', 'mangrove', 'creek', 'promenade']
    case 'riverine':
      return ['promenade', 'creek', 'promenade', 'creek', 'promenade', 'creek']
    case 'lakeside':
      return ['promenade', 'creek', 'promenade', 'promenade', 'creek', 'promenade']
    default:
      return ['promenade', 'creek', 'promenade', 'creek']
  }
}

/**
 * What the corporation would call that stretch of frontage. A promenade on the
 * sea is a sea face; the same asset on a river is a riverfront, and calling it
 * a sea face inland is the sort of error a coastal cell would notice first.
 */
function frontageLabel(type: CoastalSegment['type'], form: CityFormType): string {
  if (type === 'promenade') {
    switch (form) {
      case 'coastal':
      case 'creek-side':
        return t('Sea Face Promenade')
      case 'riverine':
        return t('Riverfront Promenade')
      case 'lakeside':
        return t('Lakefront Promenade')
      default:
        return t('Waterfront Promenade')
    }
  }
  if (type === 'creek') return form === 'coastal' || form === 'creek-side' ? t('Creek Reach') : t('Channel Reach')
  if (type === 'mangrove') return t('Mangrove Belt')
  if (type === 'seawall') return t('Seawall')
  return t('Beach')
}

export let COASTAL_SEGMENTS: CoastalSegment[] = []

/** ---------------------------------------------------------------------
 * Buildings & development control
 * ------------------------------------------------------------------- */

export let BUILDING_RECORDS: BuildingRecord[] = []
export let BUILDING_PROPOSALS: BuildingProposal[] = []

/** ---------------------------------------------------------------------
 * Urban planning
 * ------------------------------------------------------------------- */

export let PLANNING_INDICATORS: PlanningIndicator[] = []

/** ---------------------------------------------------------------------
 * Outcome intelligence - Input → Activity → Output → Outcome
 * ------------------------------------------------------------------- */

interface OutcomeSpec {
  title: string
  domain: string
  input: [string, string]
  activity: [string, string]
  output: [string, string]
  outcome: [string, string]
  achieved: number
  target: number
  baseline: string
  start: number
}

/**
 * The outcome chains, stated in the active corporation's own magnitudes.
 *
 * The achievement, target and baseline PERCENTAGES are performance ratios and
 * carry across unchanged - they are what the chain is actually about. The
 * inputs, activities and outputs quoted alongside them are corporation-scale
 * quantities and are restated: an allocation, an establishment strength or a
 * tonnage handled has to be the corporation's own, or the chain reads as
 * somebody else's programme.
 */
function outcomeSpecs(): OutcomeSpec[] {
  const scale = CITY_SCALE
  const crore = (base: number): string => t('₹{0} Cr', scaled(base, scale.budget, 1).toLocaleString('en-IN'))
  const people = (base: number): string => scaledCount(base, scale.population, 24).toLocaleString('en-IN')
  // A smaller corporation's volumes do not reach a lakh, and "0.05 lakh
  // complaints" is not a figure any officer would write.
  const lakh = (base: number): string => {
    const n = scaledCount(base, scale.population, 2000)
    return n >= 100_000 ? `${(n / 100_000).toFixed(2)} lakh` : n.toLocaleString('en-IN')
  }

  const zoneCount = Math.max(WATER_ZONES.length, 1)
  const zonesMeeting = Math.max(1, Math.round(zoneCount * 0.7))
  const wardCount = Math.max(WARDS.length, 1)
  const wardsMeeting = Math.max(1, Math.round(wardCount * 0.375))
  const drainReaches = Math.max(STORM_DRAINS.length, 1)
  const pumpStations = Math.max(PUMPING_STATIONS.length, 1)
  const roadsTreatedKm = Math.max(1, Math.round(scale.roadLengthKm * 0.155))
  const wasteHandledTpd = Math.round(scale.solidWasteTPD * 1.086)

  return [
    {
      title: t('Water supply reliability'),
      domain: 'Water Supply',
      input: [t('Operating and capital allocation'), crore(4310)],
      activity: [
        t('Network rehabilitation and DMA implementation'),
        t('{0} km rehabilitated', scaled(412, scale.area, 1).toLocaleString('en-IN')),
      ],
      output: [t('Zones meeting pressure standard'), t('{0} of {1} zones', zonesMeeting, zoneCount)],
      outcome: [t('Households receiving standard supply hours'), '78.4%'],
      achieved: 78.4,
      target: 90,
      baseline: 'FY 2025–26 baseline: 71.2%',
      start: 71.2,
    },
    {
      title: t('Complaint resolution effectiveness'),
      domain: 'Citizen Services',
      input: [t('Ward field cadre deployment'), `${people(18240)} personnel`],
      activity: [t('Grievance handling across all categories'), `${lakh(214000)} complaints`],
      output: [t('Complaints resolved within SLA'), '81.3%'],
      outcome: [t('Complaints not reopened within 30 days'), '86.7%'],
      achieved: 86.7,
      target: 92,
      baseline: 'FY 2025–26 baseline: 82.1%',
      start: 82.1,
    },
    {
      title: t('Flood response effectiveness'),
      domain: 'Monsoon & Flood',
      input: [t('Pre-monsoon works and readiness allocation'), crore(2150)],
      activity: [
        t('Desilting, pump readiness and chronic spot mitigation'),
        t('{0} reaches, {1} stations', drainReaches, pumpStations),
      ],
      output: [t('Average waterlogging clearance time'), t('96 minutes')],
      outcome: [t('Chronic locations clearing within 60 minutes'), '54.2%'],
      achieved: 54.2,
      target: 75,
      baseline: 'Season 2025 baseline: 46.8%',
      start: 46.8,
    },
    {
      title: t('Capital project delivery'),
      domain: 'Projects',
      input: [t('Sanctioned capital programme'), crore(12860)],
      activity: [
        t('Works execution across {0} capital projects', scaledCount(128, scale.budget, 8)),
        t('{0} active works', scaledCount(128, scale.budget, 8)),
      ],
      output: [t('Milestones achieved on programme'), '68.1%'],
      outcome: [t('Projects completing within sanctioned time and cost'), '41.6%'],
      achieved: 41.6,
      target: 65,
      baseline: 'FY 2025–26 baseline: 38.9%',
      start: 38.9,
    },
    {
      title: t('Revenue realisation improvement'),
      domain: 'Revenue',
      input: [t('Assessment and collection establishment'), `${people(2860)} personnel`],
      activity: [t('Assessment revision and structured recovery'), `${lakh(342000)} assessments`],
      output: [t('Collection efficiency, year to date'), '34.8%'],
      outcome: [t('Arrears reduced against opening position'), '11.2%'],
      achieved: 11.2,
      target: 22,
      baseline: 'FY 2025–26 baseline: 7.4%',
      start: 7.4,
    },
    {
      title: t('Road surface quality'),
      domain: 'Roads',
      input: [t('Roads capital and maintenance allocation'), crore(5240)],
      activity: [
        t('Concretisation, resurfacing and defect rectification'),
        t('{0} km treated', roadsTreatedKm.toLocaleString('en-IN')),
      ],
      output: [t('Network above condition threshold'), '72.6%'],
      outcome: [t('Emergency corridors above minimum condition'), '84.1%'],
      achieved: 84.1,
      target: 95,
      baseline: 'FY 2025–26 baseline: 79.3%',
      start: 79.3,
    },
    {
      title: t('Public health surveillance responsiveness'),
      domain: 'Public Health',
      input: [t('Public health establishment and vector control'), `${people(12780)} personnel`],
      activity: [t('Surveillance returns and targeted vector operations'), `${people(1940)} operations`],
      output: [t('Signals investigated within 48 hours'), '76.4%'],
      outcome: [t('Signals contained before ward-level escalation'), '69.8%'],
      achieved: 69.8,
      target: 85,
      baseline: 'Season 2025 baseline: 62.5%',
      start: 62.5,
    },
    {
      title: t('Solid waste processing'),
      domain: 'Solid Waste',
      input: [t('Solid waste management allocation'), crore(4620)],
      activity: [t('Collection, transfer and processing operations'), t('{0} TPD handled', wasteHandledTpd.toLocaleString('en-IN'))],
      output: [t('Waste diverted from landfill'), '38.4%'],
      outcome: [t('Wards meeting segregation target'), t('{0} of {1} wards', wardsMeeting, wardCount)],
      achieved: 37.5,
      target: 60,
      baseline: 'FY 2025–26 baseline: 29.2%',
      start: 29.2,
    },
  ]
}

export let OUTCOME_CHAINS: OutcomeChain[] = []

/** Convenience roll-ups used by ward intelligence. */
export function wardHealthSignals(wardId: string): HealthIndicator[] {
  return HEALTH_INDICATORS.filter((h) => h.wardId === wardId).sort((a, b) => b.outbreakSignal - a.outbreakSignal)
}

export function wardHospitals(wardId: string): Hospital[] {
  return HOSPITALS.filter((h) => h.wardId === wardId)
}

export function wardAirQuality(wardId: string): AirQualityStation | undefined {
  return AIR_QUALITY_STATIONS.find((a) => a.wardId === wardId)
}

export function wardPlanning(wardId: string): PlanningIndicator | undefined {
  return PLANNING_INDICATORS.find((p) => p.wardId === wardId)
}

registerLayer(() => {
  const corp = activeCorporation
  const scale = CITY_SCALE
  const population = scale.population
  /** Reference prefix on building and proposal files. Never `MCGM`. */
  const refCode = CORPORATION_SHORT_NAME.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'MC'

  /** --------------------------------------------------------- Public health */

  HEALTH_INDICATORS = WARDS.flatMap((ward) =>
    DISEASES.map((disease) => {
      const r = det(`health:${ward.id}:${disease}`)
      const densityFactor = Math.min(2.1, ward.population / ward.areaSqKm / 24_000)
      const floodFactor = ward.floodProne ? 1.35 : 1
      const base = 6 * densityFactor * floodFactor * SEASONAL_WEIGHT[disease]
      const cases = Math.max(0, Math.round(base * r.float(0.5, 1.9)))
      const prev = Math.max(0, Math.round(cases * r.float(0.55, 1.45)))
      const changePct = prev > 0 ? Math.round(((cases - prev) / prev) * 1000) / 10 : 0
      const outbreakSignal = Math.min(
        100,
        Math.max(0, Math.round(changePct * 1.5 + (cases > base * 1.4 ? 34 : 0) + (ward.floodProne ? 12 : 0))),
      )

      const correlates: string[] = []
      if (ward.floodProne && (disease === 'leptospirosis' || disease === 'dengue')) {
        correlates.push(t('Elevated water stagnation reports in the same locality cluster'))
      }
      if (disease === 'gastroenteritis') correlates.push(t('Water supply interruption reports in the reporting period'))
      if (disease === 'respiratory') correlates.push(t('Particulate levels above the moderate band during the period'))
      if (disease === 'dengue' || disease === 'chikungunya') correlates.push(t('Vector breeding sites identified during sanitation inspection'))

      return {
        id: `hi-${ward.id}-${disease}`,
        tenantId: TENANT_ID,
        wardId: ward.id,
        disease,
        casesReported: cases,
        casesPrevPeriod: prev,
        changePct,
        trend: changePct > 6 ? 'up' : changePct < -6 ? 'down' : 'flat',
        outbreakSignal,
        confidence: r.weighted([['high', 3], ['medium', 5], ['low', 2]] as const),
        correlates,
        severity: severityFromScore(outbreakSignal),
        periodLabel: 'Week 30, 2026 (aggregate)',
      }
    }),
  )

  /** ------------------------------------------------------------- Hospitals */

  // Major hospitals, maternity homes and dispensaries anchor to the counts the
  // Public Health Department actually publishes (`corporations.ts`) where the
  // active corporation has one; only the peripheral tier - for which no
  // published count exists - stays modelled from population. Real BMC runs
  // several maternity homes and dispensaries per ward (30 and 192 across 24
  // wards), so neither is capped at the ward count any more - the placement
  // below cycles wards by modulo rather than assuming one facility per ward.
  const majorCount = corp.majorHospitalsCount ?? scaledCount(5, population, 1)
  const peripheralCount = scaledCount(10, population, 3)
  const maternityCount = corp.maternityHomesCount ?? Math.min(WARDS.length, scaledCount(10, population, 2))
  const dispensaryCount = corp.dispensariesCount ?? Math.min(WARDS.length, scaledCount(10, population, 3))

  // Hospitals are named for the locality they stand in, which is how municipal
  // hospitals are actually identified once the honorifics are stripped. Drawing
  // from a single distinct pool per tier keeps two facilities from sharing a
  // name even when a real count runs well past the corporation's own locality
  // list (localityNames falls back to numbered sectors beyond it).
  const hospitalLocalities = localityNames(majorCount + peripheralCount)
  const maternityLocalities = localityNames(maternityCount)
  const dispensaryLocalities = localityNames(dispensaryCount)

  HOSPITALS = [
    ...hospitalLocalities
      .slice(0, majorCount)
      .map((locality, i) => buildHospital(`${locality} Municipal General Hospital`, 'major', i)),
    ...hospitalLocalities
      .slice(majorCount)
      .map((locality, i) => buildHospital(`${locality} Municipal Hospital`, 'peripheral', i + 20)),
    ...maternityLocalities.map((locality, i) => {
      const ward = WARDS[i % WARDS.length]!
      return buildHospital(`${locality} Maternity Home`, 'maternity', i + 40, ward.id)
    }),
    ...dispensaryLocalities.map((locality, i) => {
      const ward = WARDS[(i + maternityCount) % WARDS.length]!
      return buildHospital(`${locality} Municipal Dispensary`, 'dispensary', i + 60, ward.id)
    }),
  ]

  /** ----------------------------------------------------- Fire & emergency */

  // Anchored to the Fire Brigade's own published station count where the
  // active corporation reports one (54 for BMC - 35 major + 19 small); modelled
  // from population otherwise.
  const fireStationCount = corp.fireStationsCount ?? scaledCount(16, population, 4)

  // The control room covers the whole corporation, so its coverage radius is
  // the radius of a circle of the corporation's own area rather than a fixed
  // figure drawn for Brihanmumbai's 603 km².
  const controlRoomRadiusKm = Math.max(4, Math.round(Math.sqrt(scale.areaSqKm / Math.PI) * 1.75))

  EMERGENCY_STATIONS = [
    ...localityNames(fireStationCount).map((locality, i) => {
      const name = `${locality} Fire Station`
      const r = det(`estation:${name}`)
      const ward = r.pick(WARDS)
      const total = r.int(4, 14)
      const available = Math.max(1, total - r.weighted([[0, 5], [1, 3], [2, 2]] as const))
      const response = r.round(4.2, 13.8, 1)
      return {
        id: `es-${i + 1}`,
        tenantId: TENANT_ID,
        name,
        type: 'fire-station' as const,
        wardId: ward.id,
        location: ward.centroid,
        vehiclesTotal: total,
        vehiclesAvailable: available,
        personnelOnDuty: r.int(18, 74),
        avgResponseMinutes: response,
        coverageRadiusKm: r.round(2.4, 7.2, 1),
        readinessIndex: Math.round((available / total) * 60 + Math.max(0, 40 - (response - 4) * 4)),
        state: stateFrom(Math.round((available / total) * 60 + Math.max(0, 40 - (response - 4) * 4))),
      }
    }),
    {
      id: 'es-doc',
      tenantId: TENANT_ID,
      name: t('Municipal Disaster Control Room'),
      type: 'disaster-control',
      wardId: WARDS[4]?.id ?? WARDS[0]!.id,
      location: WARDS[4]?.centroid ?? WARDS[0]!.centroid,
      vehiclesTotal: scaledCount(22, population, 4),
      vehiclesAvailable: Math.max(1, scaledCount(19, population, 3)),
      personnelOnDuty: scaledCount(64, population, 8),
      avgResponseMinutes: 6.4,
      coverageRadiusKm: controlRoomRadiusKm,
      readinessIndex: 88,
      state: 'operational',
    },
  ]

  /** ----------------------------------------------------------- Environment */

  AIR_QUALITY_STATIONS = WARDS.map((ward) => {
    const r = det(`aqi:${ward.id}`)
    // July monsoon conditions suppress particulate levels across the city.
    const aqi = r.int(34, 148)
    return {
      id: `aq-${ward.id}`,
      name: t('{0} Monitoring Station', ward.name.split(' · ')[0]),
      wardId: ward.id,
      aqi,
      category: aqiCategory(aqi),
      pm25: Math.round(aqi * r.float(0.32, 0.55)),
      pm10: Math.round(aqi * r.float(0.62, 1.1)),
      no2: Math.round(aqi * r.float(0.18, 0.42)),
      observedAt: isoDaysFromAnchor(0),
      trend: r.weighted([['up', 3], ['down', 3], ['flat', 4]] as const),
    }
  })

  NOISE_READINGS = WARDS.flatMap((ward) => {
    const zones: NoiseReading['zoneType'][] = ['silence', 'residential', 'commercial', 'industrial']
    const limits: Record<NoiseReading['zoneType'], { day: number; night: number }> = {
      silence: { day: 50, night: 40 },
      residential: { day: 55, night: 45 },
      commercial: { day: 65, night: 55 },
      industrial: { day: 75, night: 70 },
    }
    return zones.map((zoneType) => {
      const r = det(`noise:${ward.id}:${zoneType}`)
      const day = Math.round((limits[zoneType].day + r.float(-6, 18)) * 10) / 10
      const night = Math.round((limits[zoneType].night + r.float(-5, 16)) * 10) / 10
      return {
        id: `nz-${ward.id}-${zoneType}`,
        location: `${ward.name.split(' · ')[0]} ${zoneType} zone`,
        wardId: ward.id,
        zoneType,
        dayDb: day,
        nightDb: night,
        dayLimitDb: limits[zoneType].day,
        nightLimitDb: limits[zoneType].night,
        exceedance: day > limits[zoneType].day || night > limits[zoneType].night,
      }
    })
  })

  /** -------------------------------------------------------------- Frontage */

  const palette = frontageTypes(corp.form.type)
  const frontageCount = Math.max(4, Math.min(palette.length, scaledCount(palette.length, scale.area, 4)))
  // Frontage is identified by the locality it fronts, not by the water body -
  // a beach and a seawall a kilometre apart on the same sea carry different
  // names because they stand in different places.
  const frontageNames = localityNames(frontageCount)
  const frontageStep = Math.max(1, Math.floor(WARDS.length / frontageCount))
  const tidal = corp.form.type === 'coastal' || corp.form.type === 'creek-side'

  COASTAL_SEGMENTS = Array.from({ length: frontageCount }, (_, i) => {
    const type = palette[i] as CoastalSegment['type']
    const name = `${frontageNames[i] as string} ${frontageLabel(type, corp.form.type)}`
    const r = det(`coastal:${name}`)
    const vulnerability = r.int(22, 92)
    const span = i % 2 === 0 ? 1 : 2
    const start = (i * frontageStep) % WARDS.length
    const wardIds = Array.from({ length: Math.min(span, WARDS.length) }, (_slot, k) => WARDS[(start + k) % WARDS.length]!.id)
    return {
      id: `cs-${i + 1}`,
      tenantId: TENANT_ID,
      name,
      wardIds,
      lengthKm: scaled(r.round(1.1, 11.4, 1), scale.area, 0.4),
      type,
      vulnerabilityIndex: vulnerability,
      protectionStatus: vulnerability > 68 ? 'unprotected' : vulnerability > 44 ? 'partially-protected' : 'protected',
      // Mangroves are a tidal formation. An inland corporation records none,
      // because it has none.
      mangroveCoverHa: tidal
        ? type === 'mangrove'
          ? scaled(r.round(40, 620, 1), scale.area, 1)
          : scaled(r.round(0, 48, 1), scale.area, 0)
        : 0,
      inundationExposureHa: scaled(r.round(4, 340, 1), scale.area, 0.5),
      state: stateFrom(100 - vulnerability),
      lastSurveyedAt: isoDaysFromAnchor(-r.int(20, 420)),
    }
  })

  /** ------------------------------------------ Buildings & development control */

  // Building height tracks city size sub-linearly: a G+24 tower in a
  // three-lakh corporation would be as conspicuous as a Brihanmumbai budget on
  // its balance sheet, but a mid-sized corporation genuinely has high-rise.
  const maxFloors = Math.max(4, Math.round(24 * Math.cbrt(population)))

  BUILDING_RECORDS = WARDS.flatMap((ward, wi) => {
    const r = det(`buildings:${ward.id}`)
    const count = r.int(4, 8)
    return Array.from({ length: count }, (_, i) => {
      const br = det(`building:${ward.id}:${i}`)
      const yearBuilt = 2026 - br.int(8, 95)
      const age = 2026 - yearBuilt
      const auditDue = age >= 30
      const audit = auditDue
        ? br.weighted([
            ['completed', 4],
            ['due', 3],
            ['overdue', 3],
          ] as const)
        : ('not-due' as const)
      const dilapidation =
        audit === 'completed' && br.chance(0.4)
          ? br.weighted([['C1', 1], ['C2A', 2], ['C2B', 3], ['C3', 4]] as const)
          : undefined
      const severity =
        dilapidation === 'C1' ? 'critical' : dilapidation === 'C2A' ? 'high' : audit === 'overdue' ? 'high' : dilapidation ? 'medium' : 'low'

      return {
        id: `bld-${wi}-${i}`,
        tenantId: TENANT_ID,
        reference: `${refCode}/BLD/${ward.code.replace('/', '')}/${br.int(1000, 9999)}`,
        name: `${br.pick([t('Shanti'), t('Sagar'), t('Girija'), t('Prabhat'), t('Krishna'), t('Vasant'), t('Anand'), t('Rajhans'), t('Vishwa'), t('Sundar')])} ${br.pick([t('Bhavan'), t('Apartments'), t('Chawl Block'), t('Niwas'), t('Complex'), t('Sadan')])}, ${ward.name.split(' · ')[0]}`,
        wardId: ward.id,
        type: br.weighted([
          ['residential', 6],
          ['commercial', 3],
          ['mixed', 3],
          ['institutional', 1],
          ['industrial', 1],
        ] as const),
        yearBuilt,
        floors: br.int(2, maxFloors),
        structuralAudit: audit,
        dilapidationCategory: dilapidation,
        occupancyUnits: br.int(8, 220),
        permissionStatus: br.weighted([
          ['approved', 7],
          ['under-scrutiny', 3],
          ['notice-issued', 2],
          ['unauthorised-alleged', 1],
        ] as const),
        severity,
        lastInspectedAt: isoDaysFromAnchor(-br.int(10, 700)),
      }
    })
  })

  const proposalCount = scaledCount(86, population, 14)
  const maxBuiltUpSqm = Math.max(2400, scaledCount(24000, population, 2400))

  BUILDING_PROPOSALS = Array.from({ length: proposalCount }, (_, i) => {
    const r = det(`proposal:${i}`)
    const ward = r.pick(WARDS)
    const slaDays = r.pick([30, 45, 60])
    const ageDays = r.int(2, 140)
    return {
      id: `bp-${String(i + 1).padStart(3, '0')}`,
      reference: `${refCode}/BP/${ward.code.replace('/', '')}/${r.int(2000, 9999)}`,
      wardId: ward.id,
      applicantType: r.weighted([
        ['developer', 5],
        ['individual', 4],
        ['institution', 2],
        ['government', 1],
      ] as const),
      stage: r.weighted([
        ['scrutiny', 5],
        ['query-raised', 4],
        ['submitted', 3],
        ['approved', 3],
        ['rejected', 1],
      ] as const),
      submittedAt: isoDaysFromAnchor(-ageDays),
      ageDays,
      slaDays,
      slaBreached: ageDays > slaDays,
      builtUpAreaSqm: r.int(180, maxBuiltUpSqm),
    }
  })

  /** --------------------------------------------------------- Urban planning */

  PLANNING_INDICATORS = WARDS.map((ward) => {
    const r = det(`planning:${ward.id}`)
    const density = Math.round(ward.population / ward.areaSqKm)
    const growth = r.round(-0.4, 3.8, 2)
    const residential = r.int(38, 72)
    const commercial = r.int(8, 30)
    const industrial = r.int(2, 18)
    const open = Math.max(2, 100 - residential - commercial - industrial)
    const adequacy = Math.round(
      Math.max(12, Math.min(96, 92 - (density / 60_000) * 46 - growth * 5 + r.float(-8, 8))),
    )

    const gaps: string[] = []
    if (adequacy < 55) gaps.push(t('Water and sewerage capacity below projected demand'))
    if (open < 8) gaps.push(t('Open space per capita materially below planning norm'))
    if (density > 45_000) gaps.push(t('Density exceeding the infrastructure design assumption'))
    if (growth > 2.4) gaps.push(t('Growth rate outpacing committed capital capacity'))

    return {
      id: `pi-${ward.id}`,
      wardId: ward.id,
      populationDensity: density,
      projectedGrowthPct: growth,
      landUseMix: { residential, commercial, industrial, open },
      infraAdequacy: adequacy,
      serviceGaps: gaps,
      transportAccessIndex: r.int(34, 94),
      openSpacePerCapitaSqm: Math.round(((open / 100) * ward.areaSqKm * 1_000_000) / ward.population * 100) / 100,
      state: stateFrom(adequacy),
    }
  })

  /** --------------------------------------------------- Outcome intelligence */

  OUTCOME_CHAINS = outcomeSpecs().map((spec, i) => {
    const r = det(`outcome:${spec.title}`)
    const months = [t('Feb'), t('Mar'), t('Apr'), t('May'), t('Jun'), t('Jul')]
    const step = (spec.achieved - spec.start) / (months.length - 1)
    return {
      id: `oc-${i + 1}`,
      tenantId: TENANT_ID,
      title: spec.title,
      domain: spec.domain,
      input: { label: spec.input[0], value: spec.input[1] },
      activity: { label: spec.activity[0], value: spec.activity[1] },
      output: { label: spec.output[0], value: spec.output[1] },
      outcome: {
        label: spec.outcome[0],
        value: spec.outcome[1],
        achievedPct: spec.achieved,
        targetPct: spec.target,
      },
      baselineLabel: spec.baseline,
      trend: {
        id: `oc-trend-${i + 1}`,
        name: spec.outcome[0],
        unit: '%',
        points: months.map((label, m) => ({
          label,
          value: Math.round((spec.start + step * m + r.float(-1.4, 1.4)) * 10) / 10,
          comparison: spec.target,
        })),
      },
      confidence: r.weighted([['high', 4], ['medium', 5], ['low', 1]] as const),
      state: stateFrom((spec.achieved / spec.target) * 100),
    }
  })
})
