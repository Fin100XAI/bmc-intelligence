import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'
/**
 * Shared primitives used across every BMC intelligence domain.
 * These types are deliberately transport-agnostic: the same models are
 * produced by the demonstration data services today and by authoritative
 * departmental integrations later.
 */

/** Tenant scoping - every municipal deployment is isolated by tenant. */
export type TenantId = string

/** ISO-8601 timestamp string. */
export type IsoDateTime = string

/** Institutional severity ladder. Red is reserved for genuinely critical. */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}

function build$SEVERITY_LABEL(): Record<Severity, string> {
  return {
  critical: t('Critical'),
  high: t('High'),
  medium: t('Medium'),
  low: t('Low'),
  info: t('Informational'),
}
}
export let SEVERITY_LABEL: Record<Severity, string> = build$SEVERITY_LABEL()
registerLayer(() => {
  SEVERITY_LABEL = build$SEVERITY_LABEL()
})

/** Uncertainty must always be communicated - never implied certainty. */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

function build$CONFIDENCE_LABEL(): Record<ConfidenceLevel, string> {
  return {
  high: t('High confidence'),
  medium: t('Medium confidence'),
  low: t('Low confidence'),
}
}
export let CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = build$CONFIDENCE_LABEL()
registerLayer(() => {
  CONFIDENCE_LABEL = build$CONFIDENCE_LABEL()
})

/** Institutional data classification. Drives least-privilege enforcement. */
export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted'

export const CLASSIFICATION_ORDER: Record<DataClassification, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
}

function build$CLASSIFICATION_LABEL(): Record<DataClassification, string> {
  return {
  public: t('Public'),
  internal: t('Internal'),
  confidential: t('Confidential'),
  restricted: t('Restricted'),
}
}
export let CLASSIFICATION_LABEL: Record<DataClassification, string> = build$CLASSIFICATION_LABEL()
registerLayer(() => {
  CLASSIFICATION_LABEL = build$CLASSIFICATION_LABEL()
})

/**
 * Precise operational state vocabulary. Marketing terms such as
 * "100% secure" are explicitly excluded from the platform lexicon.
 */
export type OperationalState =
  | 'operational'
  | 'degraded'
  | 'at-risk'
  | 'critical'
  | 'simulation'
  | 'adapter-ready'
  | 'not-connected'
  | 'review-required'
  | 'planned'

function build$OPERATIONAL_STATE_LABEL(): Record<OperationalState, string> {
  return {
  operational: t('Operational'),
  degraded: t('Degraded'),
  'at-risk': t('At Risk'),
  critical: t('Critical'),
  simulation: t('Simulation'),
  'adapter-ready': t('Adapter Ready'),
  'not-connected': t('Not Connected'),
  'review-required': t('Review Required'),
  planned: t('Planned'),
}
}
export let OPERATIONAL_STATE_LABEL: Record<OperationalState, string> = build$OPERATIONAL_STATE_LABEL()
registerLayer(() => {
  OPERATIONAL_STATE_LABEL = build$OPERATIONAL_STATE_LABEL()
})

/** Directional movement of an indicator over its comparison window. */
export type TrendDirection = 'up' | 'down' | 'flat'

/**
 * Whether a movement is institutionally good or bad. A rise in complaints
 * and a rise in collection efficiency are both "up" but mean opposite things.
 */
export type TrendPolarity = 'positive' | 'negative' | 'neutral'

export interface Trend {
  direction: TrendDirection
  /** Percentage-point or percent change against the comparison window. */
  changePct: number
  polarity: TrendPolarity
  comparisonLabel: string
}

/** Provenance of any figure surfaced in the interface. */
export type DataOrigin =
  | 'demonstration'
  | 'simulated-scenario'
  | 'derived-metric'
  | 'model-output'

function build$DATA_ORIGIN_LABEL(): Record<DataOrigin, string> {
  return {
  // Never rendered: `ProvenanceBadge` returns null for this origin, so an
  // ordinary figure carries no badge at all.
  demonstration: t('Modelled figure'),
  'simulated-scenario': t('Simulated Scenario'),
  'derived-metric': t('Derived Metric'),
  'model-output': t('Model Output'),
}
}
export let DATA_ORIGIN_LABEL: Record<DataOrigin, string> = build$DATA_ORIGIN_LABEL()
registerLayer(() => {
  DATA_ORIGIN_LABEL = build$DATA_ORIGIN_LABEL()
})

/** Freshness envelope carried alongside every intelligence surface. */
export interface DataFreshness {
  generatedAt: IsoDateTime
  /** Timestamp of the newest underlying source record. */
  sourceObservedAt: IsoDateTime
  /** Nominal refresh cadence of the underlying feed, in minutes. */
  refreshIntervalMinutes: number
  origin: DataOrigin
  sourceState: OperationalState
  /** True when the newest source record is older than the refresh cadence. */
  stale: boolean
}

/** A single quantified indicator with its provenance and movement. */
export interface Metric {
  id: string
  tenantId: TenantId
  label: string
  value: number
  unit: string
  /** Formatted display value; components should prefer this for rendering. */
  display: string
  trend?: Trend
  target?: number
  /** Higher-is-better vs lower-is-better, used for colour semantics. */
  polarity: TrendPolarity
  domain: IntelligenceDomain
  classification: DataClassification
  confidence: ConfidenceLevel
  freshness: DataFreshness
  /** Lineage node identifiers backing this metric. */
  lineageId?: string
  description?: string
}

/** Every operational and strategic domain the platform reasons over. */
export type IntelligenceDomain =
  | 'executive'
  | 'wards'
  | 'water'
  | 'sewerage'
  | 'stormwater'
  | 'monsoon'
  | 'waste'
  | 'roads'
  | 'mobility'
  | 'health'
  | 'hospitals'
  | 'citizen-services'
  | 'emergency'
  | 'disaster'
  | 'property'
  | 'revenue'
  | 'budget'
  | 'procurement'
  | 'projects'
  | 'buildings'
  | 'environment'
  | 'coastal'
  | 'planning'
  | 'assets'
  | 'workforce'
  | 'security'
  | 'ai-governance'
  | 'platform'
  // The obligatory services a municipal corporation carries beyond its
  // engineering and finance functions. Every one of these is assigned to
  // municipalities by the Twelfth Schedule of the Constitution and by the
  // obligatory duties in the Maharashtra Municipal Corporation Act, 1949 - a
  // corporation that did not run them would not be a corporation.
  | 'education'
  | 'housing'
  | 'street-lighting'
  | 'licensing'
  | 'registration'
  | 'gardens'
  // The remainder of the Twelfth Schedule. These are the least glamorous
  // duties a corporation carries and the ones a management platform most
  // often omits - which is precisely why their absence is felt. A city is
  // judged on whether it buries its dead with dignity, keeps its meat supply
  // inspected, controls its strays and reaches its weakest residents.
  | 'deathcare'
  | 'markets'
  | 'animal-welfare'
  | 'livelihoods'
  | 'welfare'
  | 'amenities'
  // The deliberative wing. Distinct from `executive`: the Commissioner
  // administers, the Corporation in session decides.
  | 'council'
  // Institutional functions the platform previously left unrepresented
  // entirely - not thin coverage of an existing wing, but domains with no
  // page anywhere in the platform until now.
  //
  // `legal`: the Law Department's own docket - writ petitions, PILs, civil
  // appeals, consumer and tribunal matters, and contractor arbitration.
  // Distinct from `decision` (the Decision Centre's executive cases) because
  // a court case is not initiated or closed by an officer's decision; it is
  // initiated by a litigant or the Corporation's own counsel and closed by a
  // court.
  | 'legal'
  // `enforcement`: removal of encroachment and action against unauthorised
  // development under the MMC Act, 1888 and the MRTP Act, 1966 - a function
  // several domain pages (buildings, coastal, gardens, markets, livelihoods)
  // could each flag a symptom of but none could resolve, because no register
  // held the notice, the statute it was issued under and what became of it.
  | 'enforcement'
  // `correspondence`: Government Resolutions, circulars and notifications the
  // state issues to the Corporation - the paper trail that authorises or
  // directs a great deal of what the platform's other screens show as
  // already-decided fact.
  | 'correspondence'
  // `heritage`: listed heritage structures and precincts, museums, the zoo
  // and the tourism-facing public realm - conservation responsibility the
  // Corporation carries regardless of who manages a given site.
  | 'heritage'
  // `civic-participation`: consultations, suggestions and public feedback
  // the Corporation has invited or received - aggregate engagement, never
  // a citizen record.
  | 'civic-participation'

function build$DOMAIN_LABEL(): Record<IntelligenceDomain, string> {
  return {
  executive: t('Executive'),
  wards: t('Ward Operations'),
  water: t('Water Supply'),
  sewerage: t('Sewerage'),
  stormwater: t('Storm Water'),
  monsoon: t('Monsoon & Flood'),
  waste: t('Solid Waste'),
  roads: t('Roads'),
  mobility: t('Traffic & Mobility'),
  health: t('Public Health'),
  hospitals: t('Hospitals'),
  'citizen-services': t('Citizen Services'),
  emergency: t('Fire & Emergency'),
  disaster: t('Disaster Management'),
  property: t('Property'),
  revenue: t('Revenue'),
  budget: t('Budget'),
  procurement: t('Procurement'),
  projects: t('Projects'),
  buildings: t('Buildings'),
  environment: t('Environment'),
  coastal: t('Coastal'),
  planning: t('Urban Planning'),
  assets: t('Municipal Assets'),
  workforce: t('Workforce'),
  security: t('Security'),
  'ai-governance': t('AI Governance'),
  platform: t('Platform'),
  education: t('Education'),
  housing: t('Slum & Housing'),
  'street-lighting': t('Street Lighting'),
  licensing: t('Licences & Trade'),
  registration: t('Births & Deaths'),
  gardens: t('Gardens & Open Space'),
  deathcare: t('Cemeteries & Crematoria'),
  markets: t('Markets & Slaughterhouses'),
  'animal-welfare': t('Animal Welfare'),
  livelihoods: t('Urban Livelihoods'),
  welfare: t('Social Welfare'),
  amenities: t('Parking & Amenities'),
  council: t('Council & Committees'),
  legal: t('Legal & Litigation'),
  enforcement: t('Encroachment & Enforcement'),
  correspondence: t('Government Correspondence'),
  heritage: t('Heritage & Tourism'),
  'civic-participation': t('Civic Participation'),
}
}
export let DOMAIN_LABEL: Record<IntelligenceDomain, string> = build$DOMAIN_LABEL()
registerLayer(() => {
  DOMAIN_LABEL = build$DOMAIN_LABEL()
})

/** Generic geographic anchor. Coordinates are illustrative, not surveyed. */
export interface GeoPoint {
  lat: number
  lng: number
}

/** A time-series observation used by charts across all domains. */
export interface SeriesPoint {
  /** Short axis label, e.g. "12 Jun" or "W23". */
  label: string
  value: number
  /** Optional secondary comparison value for the same period. */
  comparison?: number
  /** Marks points produced by scenario recalculation rather than observation. */
  simulated?: boolean
}

export interface NamedSeries {
  id: string
  name: string
  unit: string
  points: SeriesPoint[]
}

/** Paged envelope returned by list-style services. */
export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** Standard filter surface shared by the reusable global filter bar. */
export interface GlobalFilterState {
  dateRange: DateRangeKey
  wardIds: string[]
  departmentIds: string[]
  domains: IntelligenceDomain[]
  severities: Severity[]
  statuses: string[]
  search: string
}

export type DateRangeKey = '24h' | '7d' | '30d' | '90d' | 'fy'

function build$DATE_RANGE_LABEL(): Record<DateRangeKey, string> {
  return {
  '24h': t('Last 24 hours'),
  '7d': t('Last 7 days'),
  '30d': t('Last 30 days'),
  '90d': t('Last 90 days'),
  fy: t('Financial year to date'),
}
}
export let DATE_RANGE_LABEL: Record<DateRangeKey, string> = build$DATE_RANGE_LABEL()
registerLayer(() => {
  DATE_RANGE_LABEL = build$DATE_RANGE_LABEL()
})
