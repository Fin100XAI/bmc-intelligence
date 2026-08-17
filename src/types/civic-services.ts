import type {
  DataClassification,
  GeoPoint,
  IntelligenceDomain,
  IsoDateTime,
  OperationalState,
  Severity,
  TenantId,
  Trend,
} from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/civic-services.ts
 *
 * The obligatory municipal services that sit outside the engineering and
 * finance functions the rest of the platform models.
 *
 * Every domain here is a duty assigned to municipalities by the Twelfth
 * Schedule of the Constitution (74th Amendment) and by the obligatory duties
 * in the Maharashtra Municipal Corporation Act, 1949. They are grouped in one
 * module because they share a shape - a ward-distributed service estate with a
 * delivery record against it - not because a corporation treats them as one
 * department. Each has its own department in `src/data/reference.ts` and its
 * own service in `src/services/`.
 *
 * Figures are modelled demonstration data, as everywhere else in this
 * platform. Nothing here is drawn from a live departmental system.
 */

/* ==========================================================================
   Education - municipal schools
   ========================================================================== */

/** Medium of instruction. A corporation runs schools in several languages;
 *  which ones, and their relative enrolment, is a live policy question. */
export type SchoolMedium = 'marathi' | 'hindi' | 'urdu' | 'english' | 'gujarati' | 'other'

function build$SCHOOL_MEDIUM_LABEL(): Record<SchoolMedium, string> {
  return {
  marathi: t('Marathi'),
  hindi: t('Hindi'),
  urdu: t('Urdu'),
  english: t('English'),
  gujarati: t('Gujarati'),
  other: t('Other'),
}
}
export let SCHOOL_MEDIUM_LABEL: Record<SchoolMedium, string> = build$SCHOOL_MEDIUM_LABEL()
registerLayer(() => {
  SCHOOL_MEDIUM_LABEL = build$SCHOOL_MEDIUM_LABEL()
})

export type SchoolLevel = 'primary' | 'upper-primary' | 'secondary' | 'higher-secondary'

function build$SCHOOL_LEVEL_LABEL(): Record<SchoolLevel, string> {
  return {
  primary: t('Primary (I-IV)'),
  'upper-primary': t('Upper Primary (V-VII)'),
  secondary: t('Secondary (VIII-X)'),
  'higher-secondary': t('Higher Secondary (XI-XII)'),
}
}
export let SCHOOL_LEVEL_LABEL: Record<SchoolLevel, string> = build$SCHOOL_LEVEL_LABEL()
registerLayer(() => {
  SCHOOL_LEVEL_LABEL = build$SCHOOL_LEVEL_LABEL()
})

export interface MunicipalSchool {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  medium: SchoolMedium
  level: SchoolLevel
  location: GeoPoint
  enrolment: number
  /** Sanctioned teaching posts against posts actually filled. */
  teachersSanctioned: number
  teachersInPosition: number
  /** Working days a pupil attended, as a share of days the school was open. */
  attendancePct: number
  /** Pupils who left during the year without transferring to another school. */
  dropoutPct: number
  /** Composite 0-100 assessment of the building itself. */
  infrastructureScore: number
  hasDrinkingWater: boolean
  hasGirlsToilet: boolean
  hasElectricity: boolean
  hasLibrary: boolean
  hasComputerLab: boolean
  midDayMealCoveragePct: number
  /** Board or assessment result where the level sits one. */
  passPct?: number
  state: OperationalState
  lastInspectedAt: IsoDateTime
}

export interface EducationWardSummary {
  wardId: string
  schools: number
  enrolment: number
  teacherVacancyPct: number
  avgAttendancePct: number
  avgDropoutPct: number
  schoolsBelowInfraThreshold: number
  state: OperationalState
}

/* ==========================================================================
   Slum & housing
   ========================================================================== */

/** Whether a settlement is recognised for the purpose of service delivery.
 *  This is a service-entitlement classification and nothing more - it carries
 *  no finding about tenure, legality or any resident's rights. */
export type SettlementRecognition = 'notified' | 'census' | 'identified' | 'unrecognised'

function build$SETTLEMENT_RECOGNITION_LABEL(): Record<SettlementRecognition, string> {
  return {
  notified: t('Notified'),
  census: t('Census Settlement'),
  identified: t('Identified'),
  unrecognised: t('Not Yet Recognised'),
}
}
export let SETTLEMENT_RECOGNITION_LABEL: Record<SettlementRecognition, string> = build$SETTLEMENT_RECOGNITION_LABEL()
registerLayer(() => {
  SETTLEMENT_RECOGNITION_LABEL = build$SETTLEMENT_RECOGNITION_LABEL()
})

export type RedevelopmentStage =
  | 'not-proposed'
  | 'survey'
  | 'scheme-proposed'
  | 'approved'
  | 'under-construction'
  | 'rehoused'

function build$REDEVELOPMENT_STAGE_LABEL(): Record<RedevelopmentStage, string> {
  return {
  'not-proposed': t('Not Proposed'),
  survey: t('Survey Stage'),
  'scheme-proposed': t('Scheme Proposed'),
  approved: t('Approved'),
  'under-construction': t('Under Construction'),
  rehoused: t('Rehousing Complete'),
}
}
export let REDEVELOPMENT_STAGE_LABEL: Record<RedevelopmentStage, string> = build$REDEVELOPMENT_STAGE_LABEL()
registerLayer(() => {
  REDEVELOPMENT_STAGE_LABEL = build$REDEVELOPMENT_STAGE_LABEL()
})

/**
 * A settlement the corporation delivers services to.
 *
 * The platform holds SERVICE COVERAGE for a settlement - standposts, toilet
 * seats, collection rounds - and never any record about the people living in
 * it. There is no household register, no individual, no name and no
 * entitlement determination anywhere in this model. A platform that profiled
 * residents of informal settlements would be the most dangerous thing a
 * municipal corporation could be handed, and this one refuses the shape.
 */
export interface Settlement {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  recognition: SettlementRecognition
  centroid: GeoPoint
  areaHectares: number
  /** Estimated population, from the corporation's own survey. Aggregate only. */
  estimatedPopulation: number
  estimatedHouseholds: number
  /** Residents per functioning public standpost. Lower is better. */
  personsPerWaterPoint: number
  /** Residents per functioning community-toilet seat. Lower is better. */
  personsPerToiletSeat: number
  toiletSeatsFunctional: number
  toiletSeatsTotal: number
  wasteCollectionRoundsPerWeek: number
  /** Share of internal lanes with a paved surface. */
  internalRoadsPavedPct: number
  streetLightsFunctional: number
  streetLightsTotal: number
  floodProne: boolean
  /** Composite 0-100 service adequacy. Higher is better. */
  serviceIndex: number
  redevelopment: RedevelopmentStage
  schemeReference?: string
  state: OperationalState
  lastSurveyedAt: IsoDateTime
}

export interface HousingScheme {
  id: string
  tenantId: TenantId
  reference: string
  name: string
  wardIds: string[]
  stage: RedevelopmentStage
  /** Tenements the scheme is sanctioned to deliver. */
  tenementsSanctioned: number
  tenementsDelivered: number
  /** Households in transit accommodation awaiting rehousing. */
  householdsInTransit: number
  outlayCrore: number
  spentCrore: number
  startedAt: IsoDateTime
  targetCompletionAt: IsoDateTime
  delayDays: number
  implementingAgency: string
  state: OperationalState
}

/* ==========================================================================
   Street lighting
   ========================================================================== */

export type LampType = 'led' | 'sodium-vapour' | 'metal-halide' | 'cfl'

function build$LAMP_TYPE_LABEL(): Record<LampType, string> {
  return {
  led: 'LED',
  'sodium-vapour': t('Sodium Vapour'),
  'metal-halide': t('Metal Halide'),
  cfl: 'CFL',
}
}
export let LAMP_TYPE_LABEL: Record<LampType, string> = build$LAMP_TYPE_LABEL()
registerLayer(() => {
  LAMP_TYPE_LABEL = build$LAMP_TYPE_LABEL()
})

/**
 * A feeder circuit, which is the unit a corporation actually manages - poles
 * are maintained, billed and switched in circuits, not individually.
 */
export interface LightingCircuit {
  id: string
  tenantId: TenantId
  reference: string
  wardId: string
  location: string
  centroid: GeoPoint
  polesTotal: number
  polesFunctional: number
  lampType: LampType
  /** Share of the circuit converted to LED. */
  ledConversionPct: number
  connectedLoadKw: number
  /** Units consumed in the last billing month. */
  monthlyConsumptionKwh: number
  monthlyEnergyCostRupees: number
  /** Hours the circuit was lit against hours it should have been. */
  burningHoursCompliancePct: number
  /** Whether the circuit is on an automatic astronomical timer. */
  automatedSwitching: boolean
  faultsOpen: number
  /** Mean hours from fault report to restoration over the last 30 days. */
  meanRestorationHours: number
  /** Circuits on a dark stretch matter more; this is the safety weighting. */
  priorityCorridor: boolean
  state: OperationalState
  lastInspectedAt: IsoDateTime
}

export interface LightingFault {
  id: string
  tenantId: TenantId
  reference: string
  circuitId: string
  wardId: string
  reportedAt: IsoDateTime
  category: 'lamp-failure' | 'cable-fault' | 'pole-damage' | 'feeder-tripped' | 'timer-fault'
  polesAffected: number
  severity: Severity
  status: 'reported' | 'assigned' | 'rectified'
  ageHours: number
  slaHours: number
  breached: boolean
}

function build$LIGHTING_FAULT_CATEGORY_LABEL(): Record<LightingFault['category'], string> {
  return {
  'lamp-failure': t('Lamp Failure'),
  'cable-fault': t('Cable Fault'),
  'pole-damage': t('Pole Damage'),
  'feeder-tripped': t('Feeder Tripped'),
  'timer-fault': t('Timer Fault'),
}
}
export let LIGHTING_FAULT_CATEGORY_LABEL: Record<LightingFault['category'], string> = build$LIGHTING_FAULT_CATEGORY_LABEL()
registerLayer(() => {
  LIGHTING_FAULT_CATEGORY_LABEL = build$LIGHTING_FAULT_CATEGORY_LABEL()
})

/* ==========================================================================
   Licences & trade
   ========================================================================== */

export type LicenceCategory =
  | 'shop-establishment'
  | 'eating-house'
  | 'lodging'
  | 'trade-storage'
  | 'factory'
  | 'advertisement-hoarding'
  | 'hawker'

function build$LICENCE_CATEGORY_LABEL(): Record<LicenceCategory, string> {
  return {
  'shop-establishment': t('Shop & Establishment'),
  'eating-house': t('Eating House'),
  lodging: t('Lodging House'),
  'trade-storage': t('Trade & Storage'),
  factory: t('Factory'),
  'advertisement-hoarding': t('Advertisement Hoarding'),
  hawker: t('Hawker Pitch'),
}
}
export let LICENCE_CATEGORY_LABEL: Record<LicenceCategory, string> = build$LICENCE_CATEGORY_LABEL()
registerLayer(() => {
  LICENCE_CATEGORY_LABEL = build$LICENCE_CATEGORY_LABEL()
})

/**
 * A licence category's position in a ward - counts, renewal behaviour and
 * enforcement, never an individual licensee. The platform reports on the
 * REGIME, not on any trader.
 */
export interface LicenceRegister {
  id: string
  tenantId: TenantId
  wardId: string
  category: LicenceCategory
  active: number
  /** Licences whose validity has lapsed and not been renewed. */
  expired: number
  /** Applications lodged and not yet decided. */
  pending: number
  /** Mean working days from application to decision. */
  meanDecisionDays: number
  /** Applications decided within the citizens' charter commitment. */
  charterCompliancePct: number
  feeDemandedLakh: number
  feeCollectedLakh: number
  /** Premises found trading without a current licence. */
  unlicensedDetected: number
  noticesIssued: number
  prosecutionsFiled: number
  state: OperationalState
}

/* ==========================================================================
   Vital statistics - registration of births and deaths
   ========================================================================== */

export type RegistrationKind = 'birth' | 'death'

export interface RegistrationCentre {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  /** Where the event is registered - a hospital unit or a ward office. */
  kind: 'hospital-unit' | 'ward-office'
  birthsRegistered30d: number
  deathsRegistered30d: number
  /** Events registered within the 21-day statutory period. */
  withinStatutoryPeriodPct: number
  /** Registrations lodged after the statutory period, needing a late order. */
  lateRegistrations30d: number
  certificatesIssued30d: number
  /** Mean working days from application to certificate issue. */
  meanIssueDays: number
  /** Certificates requested online rather than at a counter. */
  digitalSharePct: number
  backlog: number
  state: OperationalState
}

export interface RegistrationTrendPoint {
  month: string
  births: number
  deaths: number
  certificatesIssued: number
}

/* ==========================================================================
   Gardens, open space & the Tree Authority
   ========================================================================== */

export type OpenSpaceKind = 'garden' | 'playground' | 'recreation-ground' | 'traffic-island' | 'plaza'

function build$OPEN_SPACE_KIND_LABEL(): Record<OpenSpaceKind, string> {
  return {
  garden: t('Garden'),
  playground: t('Playground'),
  'recreation-ground': t('Recreation Ground'),
  'traffic-island': t('Traffic Island'),
  plaza: t('Plaza'),
}
}
export let OPEN_SPACE_KIND_LABEL: Record<OpenSpaceKind, string> = build$OPEN_SPACE_KIND_LABEL()
registerLayer(() => {
  OPEN_SPACE_KIND_LABEL = build$OPEN_SPACE_KIND_LABEL()
})

export interface OpenSpace {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  kind: OpenSpaceKind
  centroid: GeoPoint
  areaHectares: number
  /** Whether the corporation maintains it directly or through a caretaker. */
  maintenance: 'departmental' | 'caretaker' | 'adopted'
  /** Composite 0-100 condition assessment. */
  conditionScore: number
  hasChildrensPlayArea: boolean
  hasAccessibleEntrance: boolean
  openToPublic: boolean
  encroachmentReported: boolean
  state: OperationalState
  lastInspectedAt: IsoDateTime
}

/**
 * The Tree Authority's ward position.
 *
 * Tree felling permissions are a statutory function of a constituted Tree
 * Authority, not an administrative convenience - which is why the pending
 * count and the compensatory-planting shortfall are reported together. A
 * permission granted without the compensatory planting that conditioned it is
 * the finding that matters.
 */
export interface TreeWardPosition {
  wardId: string
  treesSurveyed: number
  /** Canopy as a share of ward area. */
  canopyCoverPct: number
  /** Open space per 1,000 residents, in hectares. */
  openSpacePerThousandHa: number
  fellingApplicationsPending: number
  fellingPermissionsGranted12m: number
  compensatoryPlantingRequired: number
  compensatoryPlantingCompleted: number
  treesPlanted12m: number
  survivalRatePct: number
  state: OperationalState
}

/* ==========================================================================
   Council & committees - the deliberative wing
   ========================================================================== */

export type CommitteeKind =
  | 'general-body'
  | 'standing'
  | 'improvement'
  | 'education'
  | 'works'
  | 'ward-committee'

function build$COMMITTEE_KIND_LABEL(): Record<CommitteeKind, string> {
  return {
  'general-body': t('General Body'),
  standing: t('Standing Committee'),
  improvement: t('Improvement Committee'),
  education: t('Education Committee'),
  works: t('Works Committee'),
  'ward-committee': t('Ward Committee'),
}
}
export let COMMITTEE_KIND_LABEL: Record<CommitteeKind, string> = build$COMMITTEE_KIND_LABEL()
registerLayer(() => {
  COMMITTEE_KIND_LABEL = build$COMMITTEE_KIND_LABEL()
})

export interface Committee {
  id: string
  tenantId: TenantId
  name: string
  kind: CommitteeKind
  /** Corporators holding a seat on it. */
  seats: number
  chairDesignation: string
  /** Sittings held in the last twelve months. */
  sittings12m: number
  /** Mean attendance across those sittings. */
  meanAttendancePct: number
  /** Financial sanction limit in INR crore, above which the matter rises. */
  sanctionLimitCrore?: number
  nextSittingAt: IsoDateTime
  description: string
}

export type ResolutionStatus =
  | 'tabled'
  | 'under-discussion'
  | 'deferred'
  | 'passed'
  | 'rejected'
  | 'implemented'

function build$RESOLUTION_STATUS_LABEL(): Record<ResolutionStatus, string> {
  return {
  tabled: t('Tabled'),
  'under-discussion': t('Under Discussion'),
  deferred: t('Deferred'),
  passed: t('Passed'),
  rejected: t('Rejected'),
  implemented: t('Implemented'),
}
}
export let RESOLUTION_STATUS_LABEL: Record<ResolutionStatus, string> = build$RESOLUTION_STATUS_LABEL()
registerLayer(() => {
  RESOLUTION_STATUS_LABEL = build$RESOLUTION_STATUS_LABEL()
})

/**
 * A resolution before a committee.
 *
 * This is the record the executive side of the platform has never held. A
 * decision case in the Decision Centre ends with an officer; a great many of
 * those matters cannot take effect until the Corporation in session has
 * resolved on them, and `decisionCaseId` is where the two records meet.
 */
export interface CouncilResolution {
  id: string
  tenantId: TenantId
  reference: string
  committeeId: string
  subject: string
  summary: string
  domain: string
  wardIds: string[]
  status: ResolutionStatus
  tabledAt: IsoDateTime
  decidedAt?: IsoDateTime
  /** Financial implication of the matter, INR crore. */
  financialImplicationCrore?: number
  votesFor?: number
  votesAgainst?: number
  abstentions?: number
  /** The executive decision case this resolution sanctions, where there is one. */
  decisionCaseId?: string
  /** Administrative action recorded after the resolution was passed. */
  implementationNote?: string
  classification: DataClassification
}

export interface CouncilPosition {
  corporatorSeats: number
  committees: number
  resolutionsTabled12m: number
  resolutionsPassed12m: number
  /** Matters passed but with no implementation recorded against them. */
  passedAwaitingImplementation: number
  meanDaysTabledToDecision: number
  attendanceTrend: Trend
}

/* ==========================================================================
   Notified services register
   ========================================================================== */

/**
 * The service domain a notified service belongs to, reusing the platform's
 * own intelligence-domain taxonomy rather than inventing a parallel one -
 * every one of these already has a department, a page and a place in
 * `DOMAIN_LABEL`.
 */
export type NotifiedServiceDomain = Extract<
  IntelligenceDomain,
  | 'registration'
  | 'licensing'
  | 'property'
  | 'buildings'
  | 'health'
  | 'water'
  | 'sewerage'
  | 'planning'
  | 'gardens'
  | 'assets'
  | 'enforcement'
>

/** How a citizen may reach the counter this service is issued from. */
export type NotifiedServiceChannel = 'online' | 'ward-office' | 'both'

function build$NOTIFIED_SERVICE_CHANNEL_LABEL(): Record<NotifiedServiceChannel, string> {
  return {
  online: t('Online'),
  'ward-office': t('Ward Office'),
  both: t('Online & Ward Office'),
}
}
export let NOTIFIED_SERVICE_CHANNEL_LABEL: Record<NotifiedServiceChannel, string> = build$NOTIFIED_SERVICE_CHANNEL_LABEL()
registerLayer(() => {
  NOTIFIED_SERVICE_CHANNEL_LABEL = build$NOTIFIED_SERVICE_CHANNEL_LABEL()
})

/**
 * A NOTIFIED SERVICE - a proactive application a citizen files FOR (a
 * certificate, a licence, a permit) against a published statutory delivery
 * timeline, on the pattern set by Maharashtra's Right to Public Services
 * Act and the individual Acts and Rules that notify each service in turn.
 *
 * This is deliberately distinct from `ServiceHealth` in
 * `src/types/operations.ts`, which is COMPLAINT-RESOLUTION SLA - how fast a
 * grievance already lodged against the corporation is closed. A notified
 * service is not a grievance; it is a duty the corporation owes every
 * applicant from the day the application is filed, whether or not anything
 * has gone wrong. The two figures answer different questions and neither
 * substitutes for the other.
 *
 * The unit of record is the SERVICE itself, aggregated city-wide across
 * every ward and counter that issues it - not an individual application, an
 * applicant's name or a certificate number. What the register reports is how
 * well the notified timeline is being kept.
 */
export interface NotifiedService {
  id: string
  tenantId: TenantId
  name: string
  domain: NotifiedServiceDomain
  departmentId: string
  /** The published statutory turnaround, in working days. */
  statutoryDays: number
  channel: NotifiedServiceChannel
  applications30d: number
  /** Applications issued within the statutory period, as a share of those decided. */
  issuedWithinStatutoryPeriodPct: number
  /** Mean working days from application to issue, across every channel. */
  avgIssueDays: number
  /** Applications lodged and not yet decided. */
  backlog: number
  /** Change in `issuedWithinStatutoryPeriodPct` against the previous quarter, in percentage points. */
  trendPct: number
  state: OperationalState
}
