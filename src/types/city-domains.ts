import type {
  ConfidenceLevel,
  GeoPoint,
  IsoDateTime,
  NamedSeries,
  OperationalState,
  Severity,
  TenantId,
  TrendDirection,
} from './common'
import type { RiskDriver } from './finance'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/** ---------------------------------------------------------------------
 * Water supply intelligence
 * ------------------------------------------------------------------- */

export interface Reservoir {
  id: string
  name: string
  /** Usable storage in million litres. */
  usefulStorageMl: number
  currentStorageMl: number
  fillPct: number
  /** Days of supply at current draw. */
  daysOfSupply: number
  lastYearFillPct: number
  state: OperationalState
}

export interface WaterZone {
  id: string
  tenantId: TenantId
  name: string
  wardIds: string[]
  /** Million litres per day. */
  supplyMld: number
  demandMld: number
  deficitMld: number
  /** Average network pressure in metres head. */
  pressureM: number
  supplyHours: number
  /** Non-revenue water percentage. */
  nrwPct: number
  leakageIndex: number
  /** Percentage of samples meeting potability standards. */
  qualityCompliancePct: number
  tankerTripsPerDay: number
  interruptions30d: number
  complaints30d: number
  state: OperationalState
  anomalies: string[]
}

export interface WaterAsset {
  id: string
  name: string
  zoneId: string
  wardId: string
  type: 'reservoir' | 'pumping-station' | 'trunk-main' | 'service-reservoir' | 'treatment-plant'
  capacityMld: number
  conditionIndex: number
  state: OperationalState
  lastMaintenanceAt: IsoDateTime
  location: GeoPoint
}

/** ---------------------------------------------------------------------
 * Sewerage & storm water
 * ------------------------------------------------------------------- */

export interface SewerageNode {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  type: 'treatment-facility' | 'pumping-station' | 'trunk-sewer' | 'outfall'
  /** Million litres per day. */
  designCapacityMld: number
  currentLoadMld: number
  utilisationPct: number
  /** Percentage of treated effluent meeting discharge norms. */
  treatmentCompliancePct: number
  blockages30d: number
  overflowEvents30d: number
  conditionIndex: number
  state: OperationalState
}

export interface StormWaterDrain {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  type: 'major-nallah' | 'minor-nallah' | 'closed-drain' | 'culvert'
  lengthKm: number
  /** Desilting completion for the current pre-monsoon cycle. */
  desiltingCompletionPct: number
  /** 0–100 blockage risk; higher is worse. */
  blockageRisk: number
  /** Design discharge capacity in cubic metres per second. */
  capacityCumecs: number
  encroachmentReports: number
  lastInspectedAt: IsoDateTime
  state: OperationalState
  riskDrivers: RiskDriver[]
}

export interface PumpingStation {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  /** Cubic metres per second. */
  capacityCumecs: number
  pumpsTotal: number
  pumpsOperational: number
  standbyPowerAvailable: boolean
  /** 0–100 readiness index. */
  readinessIndex: number
  state: OperationalState
  lastTestedAt: IsoDateTime
  location: GeoPoint
  hoursRun30d: number
}

/** ---------------------------------------------------------------------
 * Monsoon & flood intelligence
 * ------------------------------------------------------------------- */

export interface RainfallObservation {
  id: string
  stationName: string
  wardId: string
  /** Millimetres in the last 24 hours. */
  last24hMm: number
  last1hMm: number
  seasonTotalMm: number
  seasonNormalMm: number
  observedAt: IsoDateTime
  intensity: 'nil' | 'light' | 'moderate' | 'heavy' | 'very-heavy' | 'extremely-heavy'
}

export interface TideWindow {
  id: string
  at: IsoDateTime
  /** Metres above chart datum. */
  heightM: number
  type: 'high' | 'low'
  /** True when tide height blocks gravity discharge from outfalls. */
  blocksDischarge: boolean
}

export interface WaterloggingSpot {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  location: GeoPoint
  /** 0–100 chronic vulnerability index. */
  chronicIndex: number
  /** Recorded events in the current season. */
  eventsThisSeason: number
  averageClearanceMinutes: number
  /** 0–100 current modelled risk, recalculated by scenarios. */
  currentRisk: number
  state: OperationalState
  mitigationStatus: 'completed' | 'in-progress' | 'planned' | 'not-started'
  criticalRoute: boolean
  nearestHospitalKm: number
}

export interface MonsoonScenarioInput {
  /** Rainfall intensity in millimetres over 24 hours. */
  rainfallMm24h: number
  /** Peak tide height in metres. */
  tideHeightM: number
  /** Percentage of pumping capacity actually available. */
  pumpAvailabilityPct: number
  /** Percentage of pre-monsoon desilting completed. */
  desiltingCompletionPct: number
  /** Duration of continuous rainfall in hours. */
  durationHours: number
}

export interface MonsoonScenarioResult {
  inputs: MonsoonScenarioInput
  /** 0–100 city-wide modelled flood risk. */
  cityRisk: number
  readinessScore: number
  wardRisks: Array<{
    wardId: string
    baselineRisk: number
    scenarioRisk: number
    delta: number
    driverSummary: string
  }>
  spotsAtRisk: number
  criticalRoutesAtRisk: number
  hospitalsWithAccessRisk: number
  estimatedPopulationExposed: number
  recommendedDeployments: Array<{
    wardId: string
    resource: string
    quantity: number
    rationale: string
  }>
  generatedAt: IsoDateTime
  /** Always true - scenario output is simulation, never forecast. */
  isSimulation: true
  confidence: ConfidenceLevel
}

export interface WardMonsoonReadiness {
  wardId: string
  readinessScore: number
  desiltingPct: number
  pumpReadiness: number
  floodSpots: number
  spotsMitigated: number
  teamsAllocated: number
  dewateringPumps: number
  state: OperationalState
  gaps: string[]
}

/** ---------------------------------------------------------------------
 * Monsoon operations - the city alert state and the seasonal works
 * programme that has to be finished before the rain arrives.
 *
 * These are the two things a municipal control room actually runs on during
 * monsoon, in any corporation: what the weather is doing to the city right
 * now, and whether the work that was supposed to protect it was done.
 * ------------------------------------------------------------------- */

/**
 * India Meteorological Department colour-coded warning.
 *
 * The colours are not decorative and are not ours to invent: IMD issues
 * warnings against every district in the country on this four-step scale, and
 * every municipal control room, school closure decision and disaster cell
 * escalation in India is taken against it. Expressing the city's condition in
 * any other vocabulary makes the surface unreadable to the people who would
 * operate it.
 */
export type WeatherAlertColour = 'green' | 'yellow' | 'orange' | 'red'

export interface WeatherAlert {
  colour: WeatherAlertColour
  /** IMD's own action word for the colour, e.g. "Be prepared". */
  action: string
  headline: string
  advisory: string
  /** The 24-hour rainfall band that defines this colour, in millimetres. */
  bandLabel: string
  /** Heaviest 24-hour observation driving the classification. */
  peakRainfallMm: number
  /** Ward observing that peak, where one is identifiable. */
  peakWardId: string | null
  /** Wards observing rainfall in the heavy band or above. */
  wardsInBand: number
  /** True where a high tide inside the window blocks gravity discharge. */
  dischargeBlocked: boolean
  issuedAt: IsoDateTime
  validUntil: IsoDateTime
  drivers: string[]
}

/**
 * How a claim of completed work has been checked.
 *
 * The distinction this type exists to carry is the difference between work a
 * contractor says was done and work the corporation can show was done. Where
 * a measurement is machine-derived it is recorded as such, and it remains a
 * measurement: no verification state closes a work order or releases a
 * payment on its own. A named officer does that, and the platform's AI
 * governance stance is unchanged by anything here.
 */
export type WorkVerification = 'machine-verified' | 'photo-verified' | 'claimed-unverified' | 'disputed'

/**
 * One reach of drain, one contractor, one season's desilting.
 *
 * Quantum is carried in metric tonnes of silt and in recorded truck trips,
 * because the trip is the unit the work is actually measured and paid in, and
 * it is the unit a verification check can be run against.
 */
export interface DesiltingWorkOrder {
  id: string
  tenantId: TenantId
  reference: string
  /** The `StormWaterDrain` reach this order covers. */
  drainId: string
  drainName: string
  wardId: string
  zoneId: string
  contractorId: string
  /** Carried on the order so a reader never has to join to the contractor register. */
  contractorName: string
  /** Silt the order is sanctioned to remove, in metric tonnes. */
  sanctionedQuantumMt: number
  /** Silt recorded as removed. */
  removedQuantumMt: number
  completionPct: number
  /** Truck trips recorded against the order. */
  tripsRecorded: number
  /** Trips corroborated by an independent check. */
  tripsVerified: number
  verification: WorkVerification
  valueLakh: number
  /** Value against work recorded but not independently corroborated. */
  unverifiedValueLakh: number
  state: OperationalState
  lastUpdatedAt: IsoDateTime
}

/** A contractor's standing across the whole seasonal programme. */
export interface DesiltingContractorPosition {
  contractorId: string
  contractorName: string
  orders: number
  sanctionedQuantumMt: number
  removedQuantumMt: number
  verifiedQuantumMt: number
  completionPct: number
  /** Recorded but uncorroborated quantum, as a share of what was recorded. */
  unverifiedSharePct: number
  unverifiedValueLakh: number
  disputedOrders: number
}

/** Programme position by administrative unit. */
export interface DesiltingUnitPosition {
  wardId: string
  zoneId: string
  orders: number
  completionPct: number
  verifiedSharePct: number
  sanctionedQuantumMt: number
  removedQuantumMt: number
  state: OperationalState
}

/**
 * One dewatering set.
 *
 * The station aggregate above answers how many pumps a location has and how
 * many work. This answers which one failed. That is the difference between a
 * readiness index and an operational picture: when a subway floods, the
 * control room needs the designation of the set that is down and how long it
 * has been down, not a percentage for the site.
 *
 * Unit state is derived from the station's own operational count rather than
 * drawn again, so the fleet and the station register can never disagree about
 * the same location.
 */
export interface PumpUnit {
  id: string
  tenantId: TenantId
  stationId: string
  stationName: string
  wardId: string
  /** Designation carried on the set itself, e.g. "DWP-07". */
  designation: string
  /** Discharge capacity in litres per second. */
  capacityLps: number
  status: 'running' | 'standby' | 'fault' | 'maintenance'
  hoursRun30d: number
  lastFaultAt: IsoDateTime | null
  /**
   * Whether the set reports its own state, or is logged by hand at the site.
   * A hand-logged fleet cannot raise a fault until somebody walks to it.
   */
  telemetry: boolean
  state: OperationalState
}

/** The dewatering fleet, as the control room reads it. */
export interface PumpFleetPosition {
  unitsTotal: number
  running: number
  standby: number
  fault: number
  maintenance: number
  /** Units reporting their own state. */
  telemetryUnits: number
  telemetrySharePct: number
  availabilityPct: number
  /** Installed discharge capacity of the units currently available. */
  availableCapacityLps: number
  installedCapacityLps: number
  /** Stations with no working set at all. */
  stationsWithNoWorkingUnit: number
}

export interface DesiltingProgramme {
  /** e.g. "Pre-monsoon 2026". */
  cycleLabel: string
  /** The date the cycle was to be completed by. */
  deadlineAt: IsoDateTime
  /** Negative where the deadline has passed. */
  daysToDeadline: number
  ordersTotal: number
  sanctionedQuantumMt: number
  removedQuantumMt: number
  verifiedQuantumMt: number
  completionPct: number
  /** Corroborated quantum as a share of quantum recorded as removed. */
  verifiedSharePct: number
  valueLakh: number
  unverifiedValueLakh: number
  disputedOrders: number
  ordersBelowTarget: number
  byUnit: DesiltingUnitPosition[]
  byContractor: DesiltingContractorPosition[]
}

/** ---------------------------------------------------------------------
 * Observation provenance
 * ------------------------------------------------------------------- */

/**
 * How the corporation came to know about a defect or a hotspot.
 *
 * A municipal record that says a pothole exists but not how it was found
 * cannot be audited, because the answer changes what the record is worth: an
 * officer's inspection is a statement by a named person, a citizen report is
 * an assertion the corporation has not yet checked, and a camera detection is
 * a model's output on a frame - reproducible, but not a judgement.
 *
 * This is the class of evidence that command-centre video analytics produce,
 * and carrying it explicitly is what lets Data Lineage and Evidence & Audit
 * trace an intelligence item back past the register to the thing that
 * actually observed the city.
 */
export type ObservationSource =
  | 'field-inspection'
  | 'citizen-report'
  | 'camera-detection'
  | 'sensor'
  | 'contractor-return'

/**
 * Provenance carried on an observed record.
 *
 * `confidence` is populated only where the source produces one - a model
 * score. An officer's inspection has no confidence figure and must not be
 * given a fabricated one, so the field is optional rather than defaulted.
 */
export interface ObservationProvenance {
  detectedBy: ObservationSource
  /** Model confidence, 0-100. Present only for machine detections. */
  detectionConfidence?: number
  /** Whether a named officer has since confirmed the observation on the ground. */
  fieldConfirmed: boolean
}

/** ---------------------------------------------------------------------
 * Solid waste intelligence
 * ------------------------------------------------------------------- */

export interface WasteRoute {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  vehicleId: string
  /** Percentage of scheduled collection points serviced. */
  coveragePct: number
  adherencePct: number
  missedPoints: number
  /** Simulated route geometry in normalised 0–100 map space. */
  path: Array<[number, number]>
  scheduledStart: string
  actualStart: string
  tonnesCollected: number
  state: OperationalState
}

export interface WasteFacility {
  id: string
  tenantId: TenantId
  name: string
  type: 'transfer-station' | 'processing-plant' | 'composting' | 'landfill' | 'biogas'
  wardId: string
  capacityTpd: number
  currentLoadTpd: number
  utilisationPct: number
  state: OperationalState
  location: GeoPoint
  remainingLifeYears?: number
}

export interface WasteWardPerformance {
  wardId: string
  generationTpd: number
  collectedTpd: number
  coveragePct: number
  segregationPct: number
  missedCollections7d: number
  complaints30d: number
  hotspots: number
  vehiclesDeployed: number
  state: OperationalState
}

export interface WasteHotspot {
  id: string
  name: string
  wardId: string
  location: GeoPoint
  recurrenceCount: number
  lastReportedAt: IsoDateTime
  severity: Severity
  cause: string
  /** How this hotspot was observed. */
  provenance: ObservationProvenance
}

/** ---------------------------------------------------------------------
 * Roads & mobility
 * ------------------------------------------------------------------- */

export interface RoadSegment {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  lengthKm: number
  surface: 'asphalt' | 'concrete' | 'paver-block' | 'mastic'
  /** 0–100 pavement condition index; higher is better. */
  conditionIndex: number
  lastResurfacedYear: number
  /** Average daily traffic in passenger car units. */
  trafficPcu: number
  /** Designated emergency access corridor. */
  emergencyRoute: boolean
  hospitalAccess: boolean
  schoolAccess: boolean
  openDefects: number
  complaints90d: number
  repeatFailures: number
  state: OperationalState
  contractorId?: string
  closurePlanned: boolean
}

export interface RoadDefect {
  id: string
  tenantId: TenantId
  segmentId: string
  wardId: string
  type: 'pothole' | 'crack' | 'depression' | 'edge-failure' | 'utility-cut' | 'manhole'
  severity: Severity
  reportedAt: IsoDateTime
  location: GeoPoint
  /** 0–100 explainable repair priority. */
  priorityScore: number
  priorityDrivers: RiskDriver[]
  status: 'reported' | 'verified' | 'work-order-issued' | 'in-repair' | 'repaired' | 'verified-closed'
  workOrderRef?: string
  contractorId?: string
  targetRepairDate: IsoDateTime
  complaintCount: number
  /** How this defect was observed. */
  provenance: ObservationProvenance
}

export interface TrafficCorridor {
  id: string
  name: string
  wardIds: string[]
  /** Average peak-hour speed in km/h. */
  peakSpeedKmph: number
  freeFlowSpeedKmph: number
  congestionIndex: number
  incidents30d: number
  closures: number
  state: OperationalState
  /** Simulated corridor geometry in normalised 0–100 map space. */
  path: Array<[number, number]>
}

/** ---------------------------------------------------------------------
 * Public health & hospitals
 * ------------------------------------------------------------------- */

export type DiseaseIndicator =
  | 'dengue'
  | 'malaria'
  | 'leptospirosis'
  | 'gastroenteritis'
  | 'hepatitis'
  | 'respiratory'
  | 'chikungunya'

function build$DISEASE_LABEL(): Record<DiseaseIndicator, string> {
  return {
  dengue: t('Dengue'),
  malaria: t('Malaria'),
  leptospirosis: t('Leptospirosis'),
  gastroenteritis: t('Gastroenteritis'),
  hepatitis: t('Hepatitis'),
  respiratory: t('Respiratory Illness'),
  chikungunya: t('Chikungunya'),
}
}
export let DISEASE_LABEL: Record<DiseaseIndicator, string> = build$DISEASE_LABEL()
registerLayer(() => {
  DISEASE_LABEL = build$DISEASE_LABEL()
})

/**
 * Aggregate-only health indicators. No patient-level data of any kind is
 * modelled, stored or displayed anywhere in the platform.
 */
export interface HealthIndicator {
  id: string
  tenantId: TenantId
  wardId: string
  disease: DiseaseIndicator
  /** Aggregate reported case count for the period. */
  casesReported: number
  casesPrevPeriod: number
  changePct: number
  trend: TrendDirection
  /** 0–100 modelled outbreak signal strength. */
  outbreakSignal: number
  confidence: ConfidenceLevel
  /** Environmental / sanitation correlates observed in the same ward. */
  correlates: string[]
  severity: Severity
  periodLabel: string
}

export interface Hospital {
  id: string
  tenantId: TenantId
  name: string
  type: 'major' | 'peripheral' | 'speciality' | 'maternity' | 'dispensary'
  wardId: string
  location: GeoPoint
  bedsTotal: number
  bedsOccupied: number
  occupancyPct: number
  icuTotal: number
  icuOccupied: number
  emergencyLoadIndex: number
  /** Staffing availability against sanctioned strength, percentage. */
  staffingPct: number
  /** Percentage of critical equipment currently serviceable. */
  equipmentServiceablePct: number
  servicesAvailable: string[]
  servicesUnavailable: string[]
  /** 0–100 accessibility index; degrades during flooding events. */
  accessibilityIndex: number
  state: OperationalState
}

/** ---------------------------------------------------------------------
 * Fire, disaster & emergency readiness
 * ------------------------------------------------------------------- */

export interface EmergencyStation {
  id: string
  tenantId: TenantId
  name: string
  type: 'fire-station' | 'disaster-control' | 'ambulance-base'
  wardId: string
  location: GeoPoint
  vehiclesTotal: number
  vehiclesAvailable: number
  personnelOnDuty: number
  /** Average response time in minutes over the last 30 days. */
  avgResponseMinutes: number
  coverageRadiusKm: number
  readinessIndex: number
  state: OperationalState
}

/** ---------------------------------------------------------------------
 * Environment & coastal
 * ------------------------------------------------------------------- */

export interface AirQualityStation {
  id: string
  name: string
  wardId: string
  aqi: number
  category: 'good' | 'satisfactory' | 'moderate' | 'poor' | 'very-poor' | 'severe'
  pm25: number
  pm10: number
  no2: number
  observedAt: IsoDateTime
  trend: TrendDirection
}

export interface NoiseReading {
  id: string
  location: string
  wardId: string
  zoneType: 'silence' | 'residential' | 'commercial' | 'industrial'
  dayDb: number
  nightDb: number
  dayLimitDb: number
  nightLimitDb: number
  exceedance: boolean
}

export interface CoastalSegment {
  id: string
  tenantId: TenantId
  name: string
  wardIds: string[]
  lengthKm: number
  type: 'beach' | 'seawall' | 'mangrove' | 'creek' | 'promenade'
  /** 0–100 erosion / inundation vulnerability. */
  vulnerabilityIndex: number
  protectionStatus: 'protected' | 'partially-protected' | 'unprotected'
  mangroveCoverHa: number
  /** Modelled inundation exposure at 1m sea-level scenario, hectares. */
  inundationExposureHa: number
  state: OperationalState
  lastSurveyedAt: IsoDateTime
}

/** ---------------------------------------------------------------------
 * Buildings & development control
 * ------------------------------------------------------------------- */

export interface BuildingRecord {
  id: string
  tenantId: TenantId
  reference: string
  name: string
  wardId: string
  type: 'residential' | 'commercial' | 'mixed' | 'institutional' | 'industrial'
  yearBuilt: number
  floors: number
  /** Structural audit outcome for older structures. */
  structuralAudit: 'not-due' | 'due' | 'completed' | 'overdue'
  dilapidationCategory?: 'C1' | 'C2A' | 'C2B' | 'C3'
  occupancyUnits: number
  permissionStatus: 'approved' | 'under-scrutiny' | 'notice-issued' | 'unauthorised-alleged'
  severity: Severity
  lastInspectedAt: IsoDateTime
}

export interface BuildingProposal {
  id: string
  reference: string
  wardId: string
  applicantType: 'individual' | 'developer' | 'institution' | 'government'
  stage: 'submitted' | 'scrutiny' | 'query-raised' | 'approved' | 'rejected'
  submittedAt: IsoDateTime
  ageDays: number
  slaDays: number
  slaBreached: boolean
  builtUpAreaSqm: number
}

/** ---------------------------------------------------------------------
 * Urban planning & outcomes
 * ------------------------------------------------------------------- */

export interface PlanningIndicator {
  id: string
  wardId: string
  populationDensity: number
  projectedGrowthPct: number
  landUseMix: { residential: number; commercial: number; industrial: number; open: number }
  /** 0–100 infrastructure adequacy against projected demand. */
  infraAdequacy: number
  serviceGaps: string[]
  transportAccessIndex: number
  openSpacePerCapitaSqm: number
  state: OperationalState
}

export interface PlanningScenarioInput {
  populationDeltaPct: number
  capitalInvestmentDeltaPct: number
  transportDemandDeltaPct: number
  extremeRainfallDeltaPct: number
}

export interface OutcomeChain {
  id: string
  tenantId: TenantId
  title: string
  domain: string
  input: { label: string; value: string }
  activity: { label: string; value: string }
  output: { label: string; value: string }
  outcome: { label: string; value: string; achievedPct: number; targetPct: number }
  baselineLabel: string
  trend: NamedSeries
  confidence: ConfidenceLevel
  state: OperationalState
}
