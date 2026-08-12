import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import type { OperationalState } from '@/types/common'
import type { Ward } from '@/types/organisation'
import type {
  PumpingStation,
  RainfallObservation,
  Reservoir,
  RoadDefect,
  RoadSegment,
  SewerageNode,
  StormWaterDrain,
  TideWindow,
  TrafficCorridor,
  WardMonsoonReadiness,
  WasteFacility,
  WasteHotspot,
  WasteRoute,
  WasteWardPerformance,
  WaterAsset,
  WaterZone,
  WaterloggingSpot,
  ObservationProvenance,
} from '@/types/city-domains'
import type { RiskDriver } from '@/types/finance'
import { det, isoDaysFromAnchor, isoFromAnchor } from '@/utils/deterministic'
import { WARDS, WARD_BY_ID, wardName } from './reference'
import { severityFromScore } from './finance.data'
import { CITY_SCALE, REFERENCE_SCALE, scaled, scaledCount } from './scale'
import { facilityName, localityNames, waterSourceNames } from './naming'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * City service domains - water, sewerage, storm water, monsoon, solid waste,
 * roads and mobility.
 *
 * The physical spine of every figure below is the ACTIVE corporation's own
 * published reference data: its water supply in MLD, its solid waste in TPD,
 * its road network length, its area and its own administrative divisions
 * (`src/data/scale.ts`, `src/config/corporations.ts`). Those totals are
 * distributed across the corporation's wards and zones; the operational detail
 * on top of them - condition indices, complaint volumes, defect priorities - is
 * modelled demonstration data seeded by corporation id. No municipal system is
 * contacted.
 *
 * Facility, reservoir and corridor names are constructed from the active
 * corporation's own localities and water bodies (`src/data/naming.ts`). A real
 * facility name is never carried from one city into another.
 *
 * Every export below is a LIVE BINDING, rebuilt on a corporation switch.
 */

/**
 * How an observed defect or hotspot came to be recorded.
 *
 * Camera detection is a procured capability, not a universal one: a
 * corporation running a command centre with video analytics detects a large
 * share of its own defects, and a corporation without one learns about them
 * from citizens and from inspection rounds. The share therefore follows
 * deployment scale rather than being flat across the roster, which is why two
 * corporations show materially different provenance mixes on the same screen.
 *
 * Confidence is attached ONLY to machine detections. An officer's inspection
 * has no confidence score and giving it a fabricated one would misrepresent
 * what kind of evidence it is.
 */
function observationProvenance(r: ReturnType<typeof det>, cameraCapable: boolean): ObservationProvenance {
  const cameraReach = cameraCapable ? Math.min(0.46, Math.max(0.04, 0.46 * Math.sqrt(CITY_SCALE.population))) : 0
  const detectedBy = r.weighted([
    ['citizen-report', 30],
    ['field-inspection', 34],
    ['camera-detection', Math.max(1, Math.round(cameraReach * 100))],
    ['sensor', 5],
    ['contractor-return', 9],
  ] as const) as ObservationProvenance['detectedBy']

  const machine = detectedBy === 'camera-detection' || detectedBy === 'sensor'
  return {
    detectedBy,
    ...(machine ? { detectionConfidence: r.int(62, 97) } : {}),
    // A machine detection starts unconfirmed; an officer's own inspection is
    // confirmed by definition, because the officer was standing there.
    fieldConfirmed: detectedBy === 'field-inspection' ? true : r.chance(machine ? 0.42 : 0.58),
  }
}

function stateFrom(score: number, invert = false): OperationalState {
  const s = invert ? 100 - score : score
  if (s >= 78) return 'operational'
  if (s >= 62) return 'degraded'
  if (s >= 45) return 'at-risk'
  return 'critical'
}

/**
 * How much ground one administrative unit covers against the reference unit
 * (Brihanmumbai's 603.4 km² across 24 wards). Drain reaches and road segments
 * are quoted per unit, so their lengths track the ground the unit actually
 * covers rather than Brihanmumbai's.
 */
function wardAreaFactor(areaSqKm: number): number {
  const reference = REFERENCE_SCALE.areaSqKm / REFERENCE_SCALE.wards
  return Math.min(3, Math.max(0.12, areaSqKm / reference))
}

/** Total resident population across the active corporation's wards. */
function wardPopulationTotal(): number {
  return Math.max(1, WARDS.reduce((sum, ward) => sum + ward.population, 0))
}

/** ---------------------------------------------------------------------
 * Water supply
 * ------------------------------------------------------------------- */

/**
 * Relative sizes of the source reservoirs in a monsoon-fed municipal supply
 * system, largest first. Only the PROPORTIONS carry across corporations: the
 * absolute storage is set from the corporation's own published supply, held as
 * roughly a year of draw, which is what a system refilled by a single monsoon
 * has to carry between seasons.
 */
const RESERVOIR_SHARES = [0.495, 0.157, 0.134, 0.1, 0.089, 0.019, 0.006]

/** Useful storage the source system carries, expressed as days of its own draw. */
const RESERVOIR_STORAGE_DAYS = 376

const NON_IMPOUNDABLE = /\b(sea|ocean|harbour|harbor|bay|creek)\b/i

/**
 * Reservoir and supply-zone names, from the corporation's own water bodies.
 *
 * `waterSourceNames` answers from everything the corporation publishes as a
 * water body, which for a coastal corporation includes the sea, its harbour and
 * its tidal creeks. Those are real features, but nothing is impounded from
 * them, and a reservoir reported as 62% full under the name of a sea is the
 * kind of line that ends a demonstration. They are dropped here and the neutral
 * constructed source labels take their place.
 */
/**
 * `constructed` is carried rather than re-detected from the finished name.
 *
 * The caller needs to know whether a source carries the corporation's own
 * published water-body name or a label this file built. Testing the string for
 * "Source Reservoir" worked while every label was English and silently stopped
 * working the moment the label was translated - the test never matched, so
 * every zone took the wrong branch. A flag cannot be broken by a translation.
 */
interface ImpoundableSource {
  name: string
  constructed: boolean
}

function impoundableSourceNames(count: number): ImpoundableSource[] {
  const pool = waterSourceNames(count * 3 + 8).filter((name) => !NON_IMPOUNDABLE.test(name))
  return Array.from({ length: count }, (_, i) =>
    pool[i] !== undefined
      ? { name: pool[i] as string, constructed: false }
      : { name: facilityName('Source Reservoir', i), constructed: true },
  )
}

function reservoirSpecs(): Array<{ id: string; name: string; storage: number }> {
  const waterRatio = CITY_SCALE.waterSupplyMLD / REFERENCE_SCALE.waterSupplyMLD
  const count = Math.max(3, Math.min(RESERVOIR_SHARES.length, scaledCount(RESERVOIR_SHARES.length, waterRatio, 3)))
  const shares = RESERVOIR_SHARES.slice(0, count)
  const shareTotal = shares.reduce((s, x) => s + x, 0)
  const totalStorage = CITY_SCALE.waterSupplyMLD * RESERVOIR_STORAGE_DAYS

  // Names come from the corporation's own water bodies, padded with neutral
  // constructed source labels where it publishes fewer than we draw on.
  return impoundableSourceNames(count).map((source, i) => ({
    id: `res-${String(i + 1).padStart(2, '0')}`,
    name: source.name,
    storage: Math.round((totalStorage * (shares[i] as number)) / shareTotal),
  }))
}

/**
 * Supply zones, built from the ACTIVE corporation's own administrative zones.
 *
 * Brihanmumbai's service zones are named after the service reservoirs that feed
 * them and grouped by ward code; no other corporation has those wards or those
 * reservoirs. Grouping by the corporation's own zone tier guarantees the two
 * properties the water surfaces depend on: every ward lands in exactly one
 * supply zone, and no ward lands in two.
 */
function waterZoneGroups(): Ward[][] {
  const byZone = new Map<string, Ward[]>()
  for (const ward of WARDS) {
    const existing = byZone.get(ward.zoneId)
    if (existing) existing.push(ward)
    else byZone.set(ward.zoneId, [ward])
  }
  const groups = [...byZone.values()]

  // A corporation with only two or three zonal offices still needs a supply
  // picture that reads as a distribution rather than a pair of totals, so the
  // largest group is split - keeping its wards contiguous - until there are at
  // least four zones, or until every ward is its own zone.
  const target = Math.min(WARDS.length, Math.max(4, groups.length))
  while (groups.length < target) {
    let largest = 0
    for (let i = 1; i < groups.length; i += 1) {
      if ((groups[i] as Ward[]).length > (groups[largest] as Ward[]).length) largest = i
    }
    const source = groups[largest] as Ward[]
    if (source.length < 2) break
    const half = Math.ceil(source.length / 2)
    groups.splice(largest, 1, source.slice(0, half), source.slice(half))
  }
  return groups
}

export let RESERVOIRS: Reservoir[] = []
export let WATER_ZONES: WaterZone[] = []
export let WATER_ASSETS: WaterAsset[] = []

/** ---------------------------------------------------------------------
 * Sewerage
 * ------------------------------------------------------------------- */

export let SEWERAGE_NODES: SewerageNode[] = []

/** ---------------------------------------------------------------------
 * Storm water - drains and pumping stations
 * ------------------------------------------------------------------- */

export let STORM_DRAINS: StormWaterDrain[] = []
export let PUMPING_STATIONS: PumpingStation[] = []

/** ---------------------------------------------------------------------
 * Monsoon - rainfall, tide, waterlogging, readiness
 * ------------------------------------------------------------------- */

function rainfallIntensity(mm: number): RainfallObservation['intensity'] {
  if (mm < 0.5) return 'nil'
  if (mm < 15) return 'light'
  if (mm < 64) return 'moderate'
  if (mm < 115) return 'heavy'
  if (mm < 204) return 'very-heavy'
  return 'extremely-heavy'
}

/**
 * Season rainfall normals by Maharashtra revenue division, in millimetres.
 *
 * These are IMD sub-divisional long-period averages, not modelled figures.
 * South-west monsoon rainfall varies by a factor of three across the state, and
 * carrying Konkan's figure into Marathwada would misstate the single largest
 * driver behind every monsoon surface in the platform.
 */
const DIVISION_SEASON_NORMAL_MM: Record<string, number> = {
  Konkan: 2400,
  Pune: 900,
  Nashik: 950,
  Nagpur: 1150,
  Amravati: 900,
  'Chhatrapati Sambhajinagar': 750,
}

const DEFAULT_SEASON_NORMAL_MM = 1000

function build$WATERLOGGING_LOCATION_NAMES() {
  return [
  t('Subway approach'), t('Market junction'), t('Station road'), t('Low-lying colony'), t('Bus depot approach'),
  t('School lane'), t('Hospital approach road'), t('Link road underpass'), t('Fish market crossing'), t('Housing board layout'),
  t('Industrial estate approach'), t('Creek-side settlement'), t('Chowk junction'), t('Highway service road'),
]
}
let WATERLOGGING_LOCATION_NAMES: ReturnType<typeof build$WATERLOGGING_LOCATION_NAMES> = build$WATERLOGGING_LOCATION_NAMES()
registerLayer(() => {
  WATERLOGGING_LOCATION_NAMES = build$WATERLOGGING_LOCATION_NAMES()
})

export let RAINFALL_OBSERVATIONS: RainfallObservation[] = []
export let TIDE_WINDOWS: TideWindow[] = []
export let WATERLOGGING_SPOTS: WaterloggingSpot[] = []
export let WARD_MONSOON_READINESS: WardMonsoonReadiness[] = []
export let READINESS_BY_WARD: Map<string, WardMonsoonReadiness> = new Map()

/** ---------------------------------------------------------------------
 * Solid waste
 * ------------------------------------------------------------------- */

/**
 * The disposal and processing estate, as shares of the corporation's own daily
 * waste tonnage. A corporation runs the same kinds of site whatever its size -
 * a disposal ground, a processing facility, transfer stations, composting and
 * bio-methanation units - but at its own tonnage, under constructed names. A
 * real disposal site is never named in a city that does not have it.
 */
function wasteFacilitySpecs(): Array<{ name: string; type: WasteFacility['type']; capacity: number }> {
  const tpd = CITY_SCALE.solidWasteTPD
  const capacity = (share: number): number => Math.max(1, Math.round(tpd * share))
  const specs: Array<{ name: string; type: WasteFacility['type']; capacity: number }> = [
    { name: facilityName('Disposal Facility', 0), type: 'landfill', capacity: capacity(0.508) },
    { name: facilityName('Processing Facility', 0), type: 'processing-plant', capacity: capacity(0.762) },
    { name: t('{0} (closed - capping)', facilityName('Disposal Facility', 1)), type: 'landfill', capacity: 0 },
    { name: facilityName('Transfer Station', 0), type: 'transfer-station', capacity: capacity(0.098) },
    { name: facilityName('Transfer Station', 1), type: 'transfer-station', capacity: capacity(0.076) },
    { name: facilityName('Composting Unit', 0), type: 'composting', capacity: capacity(0.035) },
    { name: facilityName('Bio-methanation Unit', 0), type: 'biogas', capacity: capacity(0.019) },
    { name: facilityName('Composting Unit', 1), type: 'composting', capacity: capacity(0.029) },
    { name: facilityName('Transfer Station', 2), type: 'transfer-station', capacity: capacity(0.086) },
  ]

  // A smaller corporation runs fewer sites, but the estate must stay legible -
  // six rows is the floor at which the disposal / processing / transfer mix is
  // still visible on the page.
  const wasteRatio = CITY_SCALE.solidWasteTPD / REFERENCE_SCALE.solidWasteTPD
  const count = Math.max(6, Math.min(specs.length, scaledCount(specs.length, wasteRatio, 6)))
  return specs.slice(0, count)
}

export let WASTE_WARD_PERFORMANCE: WasteWardPerformance[] = []
export let WASTE_ROUTES: WasteRoute[] = []
export let WASTE_FACILITIES: WasteFacility[] = []
export let WASTE_HOTSPOTS: WasteHotspot[] = []

/** ---------------------------------------------------------------------
 * Roads - segments, defects and the priority engine
 * ------------------------------------------------------------------- */

function build$ROAD_NAMES() {
  return [
  t('Link Road'), t('Station Road'), t('Market Road'), t('Main Avenue'), t('Cross Road'),
  t('Highway Service Road'), t('Ring Road'), t('Old Town Road'), t('Depot Road'),
  t('Hospital Road'), t('School Road'), t('Industrial Estate Road'), t('Colony Main Road'),
]
}
let ROAD_NAMES: ReturnType<typeof build$ROAD_NAMES> = build$ROAD_NAMES()
registerLayer(() => {
  ROAD_NAMES = build$ROAD_NAMES()
})

const ROAD_PRIORITY_WEIGHTS = {
  severity: 0.26,
  trafficImportance: 0.18,
  citizenComplaints: 0.16,
  repeatFailures: 0.14,
  hospitalSchoolAccess: 0.14,
  emergencyRoute: 0.12,
} as const

/**
 * The traffic volume the priority engine normalises against - the busiest
 * corridor the ACTIVE corporation carries, not Brihanmumbai's 92,000 PCU.
 * Held as a module-level value rebuilt with the rest of the layer so that
 * `computeDefectPriority` stays a pure exported function with an unchanged
 * signature while still normalising against the right ceiling.
 */
let TRAFFIC_PCU_CEILING = 92000

export let ROAD_SEGMENTS: RoadSegment[] = []

/** Road Defect Priority Engine - explainable, published weights. */
export function computeDefectPriority(input: {
  severity: number
  trafficPcu: number
  complaints: number
  repeatFailures: number
  hospitalAccess: boolean
  schoolAccess: boolean
  emergencyRoute: boolean
}): { score: number; drivers: RiskDriver[] } {
  const raw = {
    severity: input.severity,
    trafficImportance: Math.min(100, (input.trafficPcu / Math.max(TRAFFIC_PCU_CEILING, 1)) * 100),
    citizenComplaints: Math.min(100, (input.complaints / 30) * 100),
    repeatFailures: Math.min(100, (input.repeatFailures / 5) * 100),
    hospitalSchoolAccess: (input.hospitalAccess ? 65 : 0) + (input.schoolAccess ? 35 : 0),
    emergencyRoute: input.emergencyRoute ? 100 : 15,
  }

  const labels: Record<keyof typeof raw, string> = {
    severity: 'Defect severity',
    trafficImportance: 'Traffic importance',
    citizenComplaints: 'Citizen complaints',
    repeatFailures: 'Repeat failures at this location',
    hospitalSchoolAccess: 'Hospital / school access',
    emergencyRoute: 'Emergency route importance',
  }

  const explanations: Record<keyof typeof raw, string> = {
    severity: `Assessed defect severity normalises to ${raw.severity.toFixed(0)}/100 on the departmental defect classification.`,
    trafficImportance: `Average daily traffic of ${input.trafficPcu.toLocaleString('en-IN')} PCU normalises to ${raw.trafficImportance.toFixed(0)}/100.`,
    citizenComplaints: `${input.complaints} complaint(s) linked to this location, normalising to ${raw.citizenComplaints.toFixed(0)}/100.`,
    repeatFailures: `${input.repeatFailures} recorded repeat failure(s) at this location, normalising to ${raw.repeatFailures.toFixed(0)}/100.`,
    hospitalSchoolAccess: input.hospitalAccess
      ? t('Segment carries hospital access, attracting the highest access weighting.')
      : input.schoolAccess
        ? t('Segment carries school access, attracting a partial access weighting.')
        : t('Segment does not carry hospital or school access.'),
    emergencyRoute: input.emergencyRoute
      ? t('Segment is a designated emergency access corridor.')
      : t('Segment is not a designated emergency access corridor.'),
  }

  const drivers: RiskDriver[] = (Object.keys(raw) as Array<keyof typeof raw>).map((k) => ({
    id: k,
    label: labels[k],
    contribution: Math.round(raw[k] * ROAD_PRIORITY_WEIGHTS[k] * 10) / 10,
    weight: ROAD_PRIORITY_WEIGHTS[k],
    rawScore: Math.round(raw[k]),
    explanation: explanations[k],
    severity: severityFromScore(raw[k]),
  }))

  return { score: Math.round(drivers.reduce((s, d) => s + d.contribution, 0)), drivers }
}

export let ROAD_DEFECTS: RoadDefect[] = []

/** ---------------------------------------------------------------------
 * Mobility
 * ------------------------------------------------------------------- */

export let TRAFFIC_CORRIDORS: TrafficCorridor[] = []

/** Ward-level roll-ups consumed by ward intelligence and comparison views. */
export function wardWaterZone(wardId: string): WaterZone | undefined {
  return WATER_ZONES.find((z) => z.wardIds.includes(wardId))
}

export function wardRoadCondition(wardId: string): number {
  const segs = ROAD_SEGMENTS.filter((s) => s.wardId === wardId)
  if (segs.length === 0) return 0
  return Math.round(segs.reduce((s, x) => s + x.conditionIndex, 0) / segs.length)
}

export function wardDrainageRisk(wardId: string): number {
  const drains = STORM_DRAINS.filter((d) => d.wardId === wardId)
  if (drains.length === 0) return 0
  return Math.round(drains.reduce((s, d) => s + d.blockageRisk, 0) / drains.length)
}

export function wardWastePerformance(wardId: string): WasteWardPerformance | undefined {
  return WASTE_WARD_PERFORMANCE.find((p) => p.wardId === wardId)
}

export function topDefectsForWard(wardId: string, limit = 5): RoadDefect[] {
  return ROAD_DEFECTS.filter((d) => d.wardId === wardId)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit)
}

export { ROAD_PRIORITY_WEIGHTS, stateFrom, wardName }

registerLayer(() => {
  const corp = activeCorporation
  const scale = CITY_SCALE
  const population = scale.population
  const totalWardPopulation = wardPopulationTotal()
  const fleetPrefix = corp.shortName.replace(/[^A-Za-z]/g, '').toUpperCase()
  /** True only where the corporation discharges to the sea or a tidal creek. */
  const tidal = corp.form.type === 'coastal' || corp.form.type === 'creek-side'

  /** ------------------------------------------------------------------ Water */

  RESERVOIRS = reservoirSpecs().map((spec) => {
    const r = det(`reservoir:${spec.id}`)
    const fillPct = r.round(38, 92, 1)
    const current = Math.round(spec.storage * (fillPct / 100))
    return {
      id: spec.id,
      name: spec.name,
      usefulStorageMl: spec.storage,
      currentStorageMl: current,
      fillPct,
      // Days this source alone would carry at the corporation's own daily draw.
      daysOfSupply: Math.round(current / Math.max(scale.waterSupplyMLD, 1)),
      lastYearFillPct: Math.round((fillPct + r.float(-14, 14)) * 10) / 10,
      state: stateFrom(fillPct),
    }
  })

  const zoneGroups = waterZoneGroups()

  // Where the corporation publishes a real bulk source, the supply zone carries
  // its name - which is how service zones are actually identified on a network
  // schematic. Where the source name itself had to be constructed, a plain
  // compass zone name reads better than stacking two constructed labels.
  const zoneSources = impoundableSourceNames(zoneGroups.length)
  const zoneNames = zoneSources.map((source, i) =>
    source.constructed ? facilityName('Service Zone', i) : t('{0} Service Zone', source.name),
  )
  /* The bare source name, kept alongside the zone name rather than recovered
     from it by stripping " Service Zone". That strip is a no-op in any
     language but English, which would have left every asset called
     "पूर्व सेवा झोन प्रक्रिया केंद्र" instead of "पूर्व प्रक्रिया केंद्र". */
  const zoneBaseNames = zoneSources.map((source, i) =>
    source.constructed ? facilityName('Service Zone', i) : source.name,
  )

  WATER_ZONES = zoneGroups.map((wards, i) => {
    const id = `wz-${String(i + 1).padStart(2, '0')}`
    const r = det(`waterzone:${id}`)
    const wardIds = wards.map((w) => w.id)
    const zonePopulation = wards.reduce((s, w) => s + w.population, 0)
    const share = zonePopulation / totalWardPopulation

    // Supply is the corporation's OWN published daily volume distributed by
    // resident share; assessed demand runs above it in most zones, which is what
    // puts a deficit on the page rather than a comfortable surplus everywhere.
    const supply = Math.round(scale.waterSupplyMLD * share * r.float(0.9, 1.1) * 10) / 10
    const demand = Math.round(supply * r.float(0.98, 1.32) * 10) / 10
    const deficit = Math.round((demand - supply) * 10) / 10
    const nrw = r.round(18, 42, 1)
    const pressure = r.round(6.5, 21, 1)
    const supplyHours = r.round(2.5, 9, 1)
    const quality = r.round(88.5, 99.6, 1)

    const anomalies: string[] = []
    if (nrw > 34) anomalies.push(t('Non-revenue water above departmental threshold'))
    if (pressure < 9) anomalies.push(t('Tail-end pressure below service standard'))
    if (deficit > demand * 0.18) anomalies.push(t('Supply deficit exceeding 18% of assessed demand'))
    if (quality < 92) anomalies.push(t('Potability compliance below target'))

    const health = 100 - (nrw - 18) * 1.6 - Math.max(0, (deficit / Math.max(demand, 1)) * 100) * 1.4
    return {
      id,
      tenantId: TENANT_ID,
      name: zoneNames[i] as string,
      wardIds,
      supplyMld: supply,
      demandMld: demand,
      deficitMld: Math.max(0, deficit),
      pressureM: pressure,
      supplyHours,
      nrwPct: nrw,
      leakageIndex: Math.round(nrw * r.float(1.1, 1.8)),
      qualityCompliancePct: quality,
      tankerTripsPerDay: Math.round(Math.max(0, deficit) * r.float(4, 11)),
      interruptions30d: r.int(0, 14),
      complaints30d: r.int(scaledCount(24, population, 4), scaledCount(480, population, 40)),
      state: stateFrom(Math.max(0, Math.min(100, health))),
      anomalies,
    }
  })

  WATER_ASSETS = WATER_ZONES.flatMap((zone, zi) => {
    const types: WaterAsset['type'][] = ['service-reservoir', 'pumping-station', 'trunk-main', 'treatment-plant']
    const base = zoneBaseNames[zi] ?? zone.name
    return types.map((type, ti) => {
      const r = det(`waterasset:${zone.id}:${type}`)
      const wardId = zone.wardIds[ti % zone.wardIds.length] ?? zone.wardIds[0] ?? WARDS[0]!.id
      const ward = WARD_BY_ID.get(wardId)
      const condition = r.int(38, 96)
      return {
        id: `wa-${zone.id}-${ti}`,
        name: t('{0} {1}', base, t(type.replace('-', ' '))),
        zoneId: zone.id,
        wardId,
        type,
        capacityMld: Math.round(zone.supplyMld * r.float(0.15, 0.5) * 10) / 10,
        conditionIndex: condition,
        state: stateFrom(condition),
        lastMaintenanceAt: isoDaysFromAnchor(-r.int(5, 420)),
        location: ward?.centroid ?? corp.latLng,
      }
    })
  })

  /** -------------------------------------------------------------- Sewerage */

  // Sewage generated is conventionally taken at around 80% of water supplied;
  // installed treatment capacity here sits a little under that, which is the
  // gap every sewerage surface in the platform is there to show.
  const sewerageTreatmentMld = Math.max(2, scale.waterSupplyMLD * 0.72)
  const facilityCount = scaledCount(9, population, 3)
  const facilityLocalities = localityNames(facilityCount)

  SEWERAGE_NODES = [
    ...facilityLocalities.map((locality, i) => {
      const r = det(`sewfac:${locality}`)
      const ward = r.pick(WARDS)
      const capacity = Math.max(1, Math.round((sewerageTreatmentMld / facilityCount) * r.float(0.45, 1.6)))
      const load = Math.round(capacity * r.float(0.55, 1.06))
      const compliance = r.round(62, 98, 1)
      return {
        id: `swg-fac-${i + 1}`,
        tenantId: TENANT_ID,
        name: t('{0} Sewage Treatment Facility', locality),
        wardId: ward.id,
        type: 'treatment-facility' as const,
        designCapacityMld: capacity,
        currentLoadMld: load,
        utilisationPct: Math.round((load / capacity) * 1000) / 10,
        treatmentCompliancePct: compliance,
        blockages30d: r.int(0, 6),
        overflowEvents30d: r.int(0, 5),
        conditionIndex: r.int(45, 94),
        state: stateFrom(compliance),
      }
    }),
    ...WARDS.map((ward, i) => {
      const r = det(`sewnode:${ward.id}`)
      const share = ward.population / totalWardPopulation
      const capacity = Math.max(1, Math.round(sewerageTreatmentMld * share * r.float(0.75, 1.5)))
      const load = Math.round(capacity * r.float(0.6, 1.12))
      const blockages = r.int(0, 18)
      const overflow = r.int(0, 9)
      const condition = r.int(38, 92)
      return {
        id: `swg-node-${i + 1}`,
        tenantId: TENANT_ID,
        name: t('{0} trunk sewer network', ward.code),
        wardId: ward.id,
        type: 'trunk-sewer' as const,
        designCapacityMld: capacity,
        currentLoadMld: load,
        utilisationPct: Math.round((load / capacity) * 1000) / 10,
        treatmentCompliancePct: 0,
        blockages30d: blockages,
        overflowEvents30d: overflow,
        conditionIndex: condition,
        state: stateFrom(condition - blockages * 1.4 - overflow * 2.2),
      }
    }),
  ]

  /** ----------------------------------------------------------- Storm water */

  // Design discharge of the largest reach the corporation maintains. A 46-cumec
  // nallah is a Brihanmumbai-sized river reach; the ceiling has to follow the
  // catchment the corporation actually drains, because the drain risk model
  // normalises capacity against it.
  const drainCapacityCeiling = Math.max(8, scaled(46, scale.area, 8))

  STORM_DRAINS = WARDS.flatMap((ward, wi) => {
    const r = det(`drains:${ward.id}`)
    const count = ward.floodProne ? r.int(3, 5) : r.int(2, 3)
    const areaFactor = wardAreaFactor(ward.areaSqKm)
    const wardLocality = ward.name.split(' · ')[0] as string
    return Array.from({ length: count }, (_, i) => {
      const dr = det(`drain:${ward.id}:${i}`)
      const type = dr.weighted([
        ['major-nallah', ward.floodProne ? 4 : 2],
        ['minor-nallah', 4],
        ['closed-drain', 3],
        ['culvert', 2],
      ] as const)
      const desilting = dr.round(46, 100, 1)
      const encroachment = dr.int(0, 14)
      const capacity = Math.round(dr.float(drainCapacityCeiling * 0.045, drainCapacityCeiling) * 10) / 10
      const lengthKm = Math.max(0.2, Math.round(dr.float(0.6, 9.4) * areaFactor * 10) / 10)

      const rawDrivers = {
        desilting: 100 - desilting,
        encroachment: Math.min(100, (encroachment / 14) * 100),
        capacity: Math.min(100, Math.max(0, 100 - (capacity / drainCapacityCeiling) * 100)),
        exposure: ward.floodProne ? 78 : 30,
      }
      const weights = { desilting: 0.38, encroachment: 0.22, capacity: 0.22, exposure: 0.18 }
      const labels: Record<keyof typeof rawDrivers, string> = {
        desilting: 'Desilting shortfall',
        encroachment: 'Recorded encroachment reports',
        capacity: 'Design discharge capacity',
        exposure: 'Ward flood exposure',
      }
      const explanations: Record<keyof typeof rawDrivers, string> = {
        desilting: `Pre-monsoon desilting stands at ${desilting.toFixed(0)}% completion against the departmental target of 100%.`,
        encroachment: `${encroachment} encroachment report(s) recorded against this reach, constraining effective section.`,
        capacity: `Design discharge capacity of ${capacity.toFixed(1)} cumecs assessed against the reach catchment.`,
        exposure: ward.floodProne
          ? tidal
            ? t('Reach serves a ward classified as flood-prone with low-lying areas and tidal influence.')
            : t('Reach serves a ward classified as flood-prone with low-lying areas and constrained outfall discharge.')
          : t('Reach serves a ward with limited low-lying exposure.'),
      }

      const drivers: RiskDriver[] = (Object.keys(rawDrivers) as Array<keyof typeof rawDrivers>).map((k) => ({
        id: k,
        label: labels[k],
        contribution: Math.round(rawDrivers[k] * weights[k] * 10) / 10,
        weight: weights[k],
        rawScore: Math.round(rawDrivers[k]),
        explanation: explanations[k],
        severity: severityFromScore(rawDrivers[k]),
      }))
      const blockageRisk = Math.round(drivers.reduce((s, d) => s + d.contribution, 0))

      return {
        id: `swd-${wi}-${i}`,
        tenantId: TENANT_ID,
        // Major reaches carry the name of the locality they run through, which
        // is how municipal nallahs are actually identified; the ward code keeps
        // them unique across the network.
        name:
          type === 'major-nallah'
            ? t('{0} nallah reach {1} - {2}', wardLocality, i + 1, ward.code)
            : `${ward.code} ${type.replace('-', ' ')} ${i + 1}`,
        wardId: ward.id,
        type,
        lengthKm,
        desiltingCompletionPct: desilting,
        blockageRisk,
        capacityCumecs: capacity,
        encroachmentReports: encroachment,
        lastInspectedAt: isoDaysFromAnchor(-dr.int(1, 60)),
        state: stateFrom(blockageRisk, true),
        riskDrivers: drivers,
      }
    })
  })

  const pumpCount = scaledCount(18, scale.area, 5)
  const pumpCapacityCeiling = Math.max(10, scaled(68, scale.area, 10))

  PUMPING_STATIONS = localityNames(pumpCount).map((locality, i) => {
    const r = det(`pump:${locality}`)
    const floodWards = WARDS.filter((w) => w.floodProne)
    const ward = floodWards.length > 0 ? r.pick(floodWards) : r.pick(WARDS)
    const total = r.int(4, 12)
    const operational = Math.max(1, total - r.weighted([[0, 6], [1, 3], [2, 2], [3, 1]] as const))
    const availability = (operational / total) * 100
    const standby = r.chance(0.72)
    const readiness = Math.round(availability * 0.7 + (standby ? 30 : 8))
    return {
      id: `ps-${String(i + 1).padStart(2, '0')}`,
      tenantId: TENANT_ID,
      name: t('{0} Pumping Station', locality),
      wardId: ward.id,
      capacityCumecs: Math.round(r.float(pumpCapacityCeiling * 0.09, pumpCapacityCeiling) * 10) / 10,
      pumpsTotal: total,
      pumpsOperational: operational,
      standbyPowerAvailable: standby,
      readinessIndex: Math.min(100, readiness),
      state: stateFrom(Math.min(100, readiness)),
      lastTestedAt: isoDaysFromAnchor(-r.int(1, 45)),
      location: ward.centroid,
      hoursRun30d: r.int(0, 220),
    }
  })

  /** ---------------------------------------------------------------- Monsoon */

  const seasonNormalMm = DIVISION_SEASON_NORMAL_MM[corp.division] ?? DEFAULT_SEASON_NORMAL_MM

  RAINFALL_OBSERVATIONS = WARDS.map((ward) => {
    const r = det(`rain:${ward.id}`)
    const last24 = r.round(seasonNormalMm * 0.0035, seasonNormalMm * 0.065, 1)
    return {
      id: `rain-${ward.id}`,
      stationName: `${ward.code} Automatic Weather Station`,
      wardId: ward.id,
      last24hMm: last24,
      last1hMm: Math.round(last24 * r.float(0.06, 0.24) * 10) / 10,
      // Season to date against the divisional long-period average.
      seasonTotalMm: Math.round(seasonNormalMm * r.float(0.45, 1.0)),
      seasonNormalMm: Math.round(seasonNormalMm * r.float(0.86, 1.12)),
      observedAt: isoFromAnchor(-r.int(5, 40)),
      intensity: rainfallIntensity(last24),
    }
  })

  // A tidal outfall constraint only exists where the corporation discharges to
  // the sea or a tidal creek. Inland corporations still get a discharge window
  // series - outfall tailwater rises and falls with river or lake stage - but at
  // an amplitude that never locks gravity discharge, because theirs does not.
  TIDE_WINDOWS = Array.from({ length: 8 }, (_, i) => {
    const r = det(`tide:${i}`)
    const isHigh = i % 2 === 0
    const height = isHigh
      ? tidal
        ? r.round(3.4, 4.9, 2)
        : r.round(1.2, 2.4, 2)
      : tidal
        ? r.round(0.4, 1.6, 2)
        : r.round(0.2, 0.9, 2)
    return {
      id: `tide-${i + 1}`,
      at: isoFromAnchor(i * 372 - 120),
      heightM: height,
      type: isHigh ? 'high' : 'low',
      blocksDischarge: isHigh && height >= 4.2,
    }
  })

  WATERLOGGING_SPOTS = WARDS.flatMap((ward) => {
    const count = ward.waterloggingSpots
    return Array.from({ length: count }, (_, i) => {
      const r = det(`wls:${ward.id}:${i}`)
      const chronic = r.int(30, 96)
      const mitigation = r.weighted([
        ['completed', 3],
        ['in-progress', 3],
        ['planned', 2],
        ['not-started', 2],
      ] as const)
      const mitigationRelief = mitigation === 'completed' ? 28 : mitigation === 'in-progress' ? 12 : 0
      const currentRisk = Math.min(100, Math.max(4, Math.round(chronic - mitigationRelief + r.float(-8, 8))))
      return {
        id: `wls-${ward.id}-${i}`,
        tenantId: TENANT_ID,
        name: `${r.pick(WATERLOGGING_LOCATION_NAMES)}, ${ward.name.split(' · ')[0]}`,
        wardId: ward.id,
        location: {
          lat: ward.centroid.lat + r.float(-0.012, 0.012),
          lng: ward.centroid.lng + r.float(-0.012, 0.012),
        },
        chronicIndex: chronic,
        eventsThisSeason: r.int(0, 9),
        averageClearanceMinutes: r.int(25, 240),
        currentRisk,
        state: stateFrom(currentRisk, true),
        mitigationStatus: mitigation,
        criticalRoute: r.chance(0.34),
        nearestHospitalKm: r.round(0.4, 6.2, 1),
      }
    })
  })

  WARD_MONSOON_READINESS = WARDS.map((ward) => {
    const r = det(`readiness:${ward.id}`)
    const wardDrains = STORM_DRAINS.filter((d) => d.wardId === ward.id)
    const desilting =
      wardDrains.length > 0
        ? Math.round((wardDrains.reduce((s, d) => s + d.desiltingCompletionPct, 0) / wardDrains.length) * 10) / 10
        : r.round(60, 96, 1)
    const wardPumps = PUMPING_STATIONS.filter((p) => p.wardId === ward.id)
    const pumpReadiness =
      wardPumps.length > 0
        ? Math.round(wardPumps.reduce((s, p) => s + p.readinessIndex, 0) / wardPumps.length)
        : r.int(58, 94)
    const spots = WATERLOGGING_SPOTS.filter((s) => s.wardId === ward.id)
    const mitigated = spots.filter((s) => s.mitigationStatus === 'completed').length
    const mitigationPct = spots.length > 0 ? (mitigated / spots.length) * 100 : 100
    const teams = ward.floodProne ? r.int(3, 9) : r.int(1, 4)
    const pumpsDeployed = ward.floodProne ? r.int(2, 10) : r.int(0, 3)

    const readiness = Math.round(
      desilting * 0.34 + pumpReadiness * 0.28 + mitigationPct * 0.2 + Math.min(100, teams * 11) * 0.1 + Math.min(100, pumpsDeployed * 12) * 0.08,
    )

    const gaps: string[] = []
    if (desilting < 92) gaps.push(t('Desilting at {0}% against the 100% pre-monsoon target', desilting.toFixed(0)))
    if (pumpReadiness < 80) gaps.push(t('Pump readiness at {0}% - below the 80% operational threshold', pumpReadiness))
    if (mitigationPct < 60 && spots.length > 0) gaps.push(t('{0} chronic location(s) without completed mitigation', spots.length - mitigated))
    if (ward.floodProne && teams < 4) gaps.push(t('Response team allocation below flood-prone ward standard'))

    return {
      wardId: ward.id,
      readinessScore: Math.min(100, Math.max(0, readiness)),
      desiltingPct: desilting,
      pumpReadiness,
      floodSpots: spots.length,
      spotsMitigated: mitigated,
      teamsAllocated: teams,
      dewateringPumps: pumpsDeployed,
      state: stateFrom(readiness),
      gaps,
    }
  })

  READINESS_BY_WARD = new Map(WARD_MONSOON_READINESS.map((r) => [r.wardId, r]))

  /** ------------------------------------------------------------ Solid waste */

  WASTE_WARD_PERFORMANCE = WARDS.map((ward) => {
    const r = det(`waste:${ward.id}`)
    // The corporation's own published daily tonnage, distributed by resident
    // share rather than a per-capita rate carried over from Brihanmumbai.
    const share = ward.population / totalWardPopulation
    const generation = Math.round(scale.solidWasteTPD * share * r.float(0.86, 1.18) * 10) / 10
    const coverage = r.round(72, 99.4, 1)
    const collected = Math.round(generation * (coverage / 100) * 10) / 10
    const segregation = r.round(18, 74, 1)
    return {
      wardId: ward.id,
      generationTpd: generation,
      collectedTpd: collected,
      coveragePct: coverage,
      segregationPct: segregation,
      missedCollections7d: r.int(0, scaledCount(42, population, 6)),
      complaints30d: r.int(scaledCount(12, population, 3), scaledCount(320, population, 26)),
      hotspots: r.int(0, scaledCount(11, population, 3)),
      vehiclesDeployed: Math.max(2, Math.round(generation / r.float(4.5, 8))),
      state: stateFrom(coverage * 0.7 + segregation * 0.3),
    }
  })

  WASTE_ROUTES = WARDS.flatMap((ward, wi) => {
    const r = det(`wroute:${ward.id}`)
    const count = r.int(2, 4)
    const wardGeneration = WASTE_WARD_PERFORMANCE.find((p) => p.wardId === ward.id)?.generationTpd ?? 1
    return Array.from({ length: count }, (_, i) => {
      const rr = det(`wroute:${ward.id}:${i}`)
      const [cx, cy] = [
        ward.polygon.reduce((s, p) => s + p[0], 0) / ward.polygon.length,
        ward.polygon.reduce((s, p) => s + p[1], 0) / ward.polygon.length,
      ]
      // Simulated route geometry - a short meandering path inside the ward.
      const path: Array<[number, number]> = Array.from({ length: 7 }, (_, k) => {
        const angle = (k / 6) * Math.PI * 1.7 + rr.float(0, 1.2)
        const radius = 1.2 + k * 0.34 + rr.float(-0.3, 0.3)
        return [
          Math.round((cx + Math.cos(angle) * radius) * 10) / 10,
          Math.round((cy + Math.sin(angle) * radius * 0.8) * 10) / 10,
        ]
      })
      const coverage = rr.round(68, 99, 1)
      const adherence = rr.round(62, 98, 1)
      const startHour = rr.int(5, 8)
      const delayMin = rr.int(0, 95)
      return {
        id: `wr-${wi}-${i}`,
        tenantId: TENANT_ID,
        name: t('{0} Route {1}', ward.code, i + 1),
        wardId: ward.id,
        // A municipal fleet number, not a vehicle registration: registration
        // series belong to the RTO the corporation sits in, and inventing one
        // for the wrong district would be a fabrication on a visible column.
        vehicleId: `${fleetPrefix}-${String.fromCharCode(65 + (wi % 26))}${String.fromCharCode(65 + (i % 26))}-${rr.int(1000, 9999)}`,
        coveragePct: coverage,
        adherencePct: adherence,
        missedPoints: rr.int(0, 26),
        path,
        scheduledStart: `${String(startHour).padStart(2, '0')}:00`,
        actualStart: `${String(startHour + Math.floor(delayMin / 60)).padStart(2, '0')}:${String(delayMin % 60).padStart(2, '0')}`,
        // A route lifts a share of its ward's own daily generation.
        tonnesCollected: Math.round(Math.max(0.4, wardGeneration * rr.float(0.12, 0.44)) * 10) / 10,
        state: stateFrom(adherence),
      }
    })
  })

  WASTE_FACILITIES = wasteFacilitySpecs().map((spec, i) => {
    const r = det(`wfac:${spec.name}`)
    const ward = r.pick(WARDS)
    const load = spec.capacity > 0 ? Math.round(spec.capacity * r.float(0.55, 1.04)) : 0
    const util = spec.capacity > 0 ? Math.round((load / spec.capacity) * 1000) / 10 : 0
    return {
      id: `wf-${i + 1}`,
      tenantId: TENANT_ID,
      name: spec.name,
      type: spec.type,
      wardId: ward.id,
      capacityTpd: spec.capacity,
      currentLoadTpd: load,
      utilisationPct: util,
      state: spec.capacity === 0 ? 'planned' : stateFrom(100 - Math.max(0, util - 70) * 2),
      location: ward.centroid,
      remainingLifeYears: spec.type === 'landfill' ? r.int(1, 9) : undefined,
    }
  })

  WASTE_HOTSPOTS = WARDS.flatMap((ward) => {
    const perf = WASTE_WARD_PERFORMANCE.find((p) => p.wardId === ward.id)
    const count = perf?.hotspots ?? 0
    return Array.from({ length: count }, (_, i) => {
      const r = det(`whot:${ward.id}:${i}`)
      const recurrence = r.int(3, 22)
      return {
        id: `wh-${ward.id}-${i}`,
        name: `${r.pick([t('Market chowk'), t('Bus stop corner'), t('Railway boundary'), t('School lane'), t('Vegetable market'), t('Colony entrance')])}, ${ward.name.split(' · ')[0]}`,
        wardId: ward.id,
        location: {
          lat: ward.centroid.lat + r.float(-0.01, 0.01),
          lng: ward.centroid.lng + r.float(-0.01, 0.01),
        },
        recurrenceCount: recurrence,
        lastReportedAt: isoDaysFromAnchor(-r.int(0, 14)),
        severity: severityFromScore(Math.min(100, recurrence * 5)),
        cause: r.pick([
          t('Generation exceeds scheduled collection frequency'),
          t('Informal dumping outside collection window'),
          t('Container capacity below local generation'),
          t('Route timing misaligned with market operating hours'),
        ]),
        provenance: observationProvenance(r, true),
      }
    })
  })

  /** ------------------------------------------------------------------ Roads */

  TRAFFIC_PCU_CEILING = scaledCount(92000, population, 6000)
  const trafficFloor = scaledCount(3200, population, 400)

  ROAD_SEGMENTS = WARDS.flatMap((ward, wi) => {
    const r = det(`roads:${ward.id}`)
    const count = r.int(4, 7)
    const areaFactor = wardAreaFactor(ward.areaSqKm)
    return Array.from({ length: count }, (_, i) => {
      const sr = det(`road:${ward.id}:${i}`)
      const condition = sr.int(28, 96)
      const emergencyRoute = sr.chance(0.3)
      const hospitalAccess = sr.chance(0.26)
      return {
        id: `rs-${wi}-${i}`,
        tenantId: TENANT_ID,
        name: `${sr.pick(ROAD_NAMES)} (${ward.code}-${i + 1})`,
        wardId: ward.id,
        // Segments are a representative sample of the network, so their length
        // tracks the ground the ward covers rather than a fixed city figure.
        lengthKm: Math.max(0.15, Math.round(sr.float(0.4, 5.6) * areaFactor * 100) / 100),
        surface: sr.weighted([
          ['asphalt', 5],
          ['concrete', 4],
          ['paver-block', 2],
          ['mastic', 1],
        ] as const),
        conditionIndex: condition,
        lastResurfacedYear: 2026 - sr.int(1, 14),
        trafficPcu: sr.int(trafficFloor, TRAFFIC_PCU_CEILING),
        emergencyRoute,
        hospitalAccess,
        schoolAccess: sr.chance(0.4),
        openDefects: sr.int(0, scaledCount(22, population, 6)),
        complaints90d: sr.int(0, scaledCount(68, population, 8)),
        repeatFailures: sr.int(0, 5),
        state: stateFrom(condition),
        contractorId: sr.chance(0.7) ? `ctr-${String(sr.int(1, 22)).padStart(3, '0')}` : undefined,
        closurePlanned: sr.chance(0.1),
      }
    })
  })

  ROAD_DEFECTS = ROAD_SEGMENTS.flatMap((segment) => {
    const count = Math.min(segment.openDefects, 6)
    return Array.from({ length: count }, (_, i) => {
      const r = det(`defect:${segment.id}:${i}`)
      const severityScore = r.int(24, 98)
      const complaints = r.int(0, 28)
      const { score, drivers } = computeDefectPriority({
        severity: severityScore,
        trafficPcu: segment.trafficPcu,
        complaints,
        repeatFailures: segment.repeatFailures,
        hospitalAccess: segment.hospitalAccess,
        schoolAccess: segment.schoolAccess,
        emergencyRoute: segment.emergencyRoute,
      })
      const ward = WARD_BY_ID.get(segment.wardId)
      const status = r.weighted([
        ['reported', 4],
        ['verified', 3],
        ['work-order-issued', 3],
        ['in-repair', 2],
        ['repaired', 2],
        ['verified-closed', 1],
      ] as const)
      return {
        id: `rd-${segment.id}-${i}`,
        tenantId: TENANT_ID,
        segmentId: segment.id,
        wardId: segment.wardId,
        type: r.weighted([
          ['pothole', 6],
          ['crack', 4],
          ['depression', 3],
          ['utility-cut', 3],
          ['edge-failure', 2],
          ['manhole', 2],
        ] as const),
        severity: severityFromScore(severityScore),
        reportedAt: isoDaysFromAnchor(-r.int(0, 70)),
        location: {
          lat: (ward?.centroid.lat ?? corp.latLng.lat) + r.float(-0.01, 0.01),
          lng: (ward?.centroid.lng ?? corp.latLng.lng) + r.float(-0.01, 0.01),
        },
        priorityScore: score,
        priorityDrivers: drivers,
        status,
        workOrderRef: status === 'reported' || status === 'verified' ? undefined : `WO/${r.int(20000, 89999)}`,
        contractorId: segment.contractorId,
        targetRepairDate: isoDaysFromAnchor(r.int(-12, 34)),
        complaintCount: complaints,
        provenance: observationProvenance(r, true),
      }
    })
  })

  /** --------------------------------------------------------------- Mobility */

  // Arterial corridors are constructed labels running across contiguous runs of
  // the corporation's own wards. Naming a real arterial road belonging to a
  // different city is the single most visible error this layer could make.
  const corridorCount = Math.max(4, Math.min(12, scaledCount(10, scale.area, 4)))
  const corridorSpan = Math.max(2, Math.min(WARDS.length, Math.round(WARDS.length / 4)))
  const corridorStep = Math.max(1, Math.floor(WARDS.length / corridorCount))

  TRAFFIC_CORRIDORS = Array.from({ length: corridorCount }, (_, i) => {
    const name = facilityName('Arterial Corridor', i)
    const r = det(`corridor:${name}`)
    const start = (i * corridorStep) % WARDS.length
    const wardIds = Array.from({ length: corridorSpan }, (_slot, k) => (WARDS[(start + k) % WARDS.length] as Ward).id)
    const freeFlow = r.round(46, 62, 1)
    const peak = r.round(9, 34, 1)
    const path: Array<[number, number]> = wardIds.map((wid) => {
      const ward = WARD_BY_ID.get(wid)
      if (!ward) return [50, 50]
      const cx = ward.polygon.reduce((s, p) => s + p[0], 0) / ward.polygon.length
      const cy = ward.polygon.reduce((s, p) => s + p[1], 0) / ward.polygon.length
      return [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10]
    })
    const congestion = Math.round((1 - peak / freeFlow) * 100)
    return {
      id: `tc-${i + 1}`,
      name,
      wardIds,
      peakSpeedKmph: peak,
      freeFlowSpeedKmph: freeFlow,
      congestionIndex: congestion,
      incidents30d: r.int(scaledCount(2, population, 1), scaledCount(46, population, 6)),
      closures: r.int(0, 5),
      state: stateFrom(100 - congestion),
      path,
    }
  })
})
