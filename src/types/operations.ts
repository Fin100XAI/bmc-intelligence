import type {
  ConfidenceLevel,
  DataClassification,
  GeoPoint,
  IntelligenceDomain,
  IsoDateTime,
  OperationalState,
  Severity,
  TenantId,
} from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/** ---------------------------------------------------------------------
 * Decision Centre - the differentiator. Dashboards must lead to workflows,
 * workflows to accountable action, and every decision must remain auditable.
 * ------------------------------------------------------------------- */

export type DecisionStatus =
  | 'draft'
  | 'under-review'
  | 'approved'
  | 'rejected'
  | 'assigned'
  | 'implementing'
  | 'verification'
  | 'closed'

function build$DECISION_STATUS_LABEL(): Record<DecisionStatus, string> {
  return {
  draft: t('Draft'),
  'under-review': t('Under Review'),
  approved: t('Approved'),
  rejected: t('Rejected'),
  assigned: t('Assigned'),
  implementing: t('Implementing'),
  verification: t('Verification'),
  closed: t('Closed'),
}
}
export let DECISION_STATUS_LABEL: Record<DecisionStatus, string> = build$DECISION_STATUS_LABEL()
registerLayer(() => {
  DECISION_STATUS_LABEL = build$DECISION_STATUS_LABEL()
})

export interface DecisionAlternative {
  id: string
  title: string
  description: string
  /** Indicative cost in INR crore. */
  indicativeCostCrore: number
  timeToEffectDays: number
  benefits: string[]
  risks: string[]
  /** 0–100 modelled preference score with an explanation. */
  score: number
  scoreRationale: string
}

export interface DecisionApproval {
  id: string
  approverId: string
  approverDesignation: string
  status: 'pending' | 'approved' | 'rejected' | 'deferred'
  decidedAt?: IsoDateTime
  note?: string
}

export interface DecisionOutcome {
  measuredAt: IsoDateTime
  summary: string
  /** Indicator movements observed after implementation. */
  indicators: Array<{ label: string; before: number; after: number; unit: string }>
  effectiveness: 'effective' | 'partially-effective' | 'not-effective' | 'too-early'
}

export interface DecisionCase {
  id: string
  tenantId: TenantId
  /** Institutional reference, e.g. "DC-2026-0142". */
  reference: string
  title: string
  problemStatement: string
  background: string
  sourceIntelligenceIds: string[]
  evidenceIds: string[]
  alternatives: DecisionAlternative[]
  /** Structured analysis produced by the governed AI layer. */
  aiAnalysis?: {
    summary: string
    keyFindings: string[]
    confidence: ConfidenceLevel
    modelId: string
    generatedAt: IsoDateTime
    limitations: string[]
  }
  risks: string[]
  financialImpactCrore: number
  geographicImpact: string[]
  citizenImpact: string
  departmentIds: string[]
  wardIds: string[]
  domain: IntelligenceDomain
  /** Platform recommendation - advisory only. */
  recommendationId?: string
  recommendationSummary: string
  /** The human decision. Authority always rests with a named officer. */
  humanDecision?: {
    selectedAlternativeId: string
    rationale: string
    decidedBy: string
    decidedAt: IsoDateTime
  }
  ownerId: string
  approvals: DecisionApproval[]
  dueDate: IsoDateTime
  actionIds: string[]
  outcome?: DecisionOutcome
  status: DecisionStatus
  severity: Severity
  classification: DataClassification
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  createdBy: string
}

/** ---------------------------------------------------------------------
 * Actions & tasks
 * ------------------------------------------------------------------- */

export type ActionStatus =
  | 'open'
  | 'assigned'
  | 'in-progress'
  | 'blocked'
  | 'completed'
  | 'verified'
  | 'closed'

function build$ACTION_STATUS_LABEL(): Record<ActionStatus, string> {
  return {
  open: t('Open'),
  assigned: t('Assigned'),
  'in-progress': t('In Progress'),
  blocked: t('Blocked'),
  completed: t('Completed'),
  verified: t('Verified'),
  closed: t('Closed'),
}
}
export let ACTION_STATUS_LABEL: Record<ActionStatus, string> = build$ACTION_STATUS_LABEL()
registerLayer(() => {
  ACTION_STATUS_LABEL = build$ACTION_STATUS_LABEL()
})

export interface ActionNote {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: IsoDateTime
}

export interface ActionItem {
  id: string
  tenantId: TenantId
  reference: string
  title: string
  description: string
  ownerId: string
  departmentId: string
  wardIds: string[]
  priority: Severity
  dueDate: IsoDateTime
  sourceIntelligenceId?: string
  decisionCaseId?: string
  incidentId?: string
  status: ActionStatus
  notes: ActionNote[]
  evidenceIds: string[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  createdBy: string
  domain: IntelligenceDomain
  classification: DataClassification
}

/** ---------------------------------------------------------------------
 * Incidents - unified across disaster, fire, infrastructure and health
 * ------------------------------------------------------------------- */

export type IncidentType =
  | 'flood'
  | 'fire'
  | 'building-collapse'
  | 'infrastructure-failure'
  | 'extreme-weather'
  | 'public-health'
  | 'road-disruption'
  | 'utility-incident'

function build$INCIDENT_TYPE_LABEL(): Record<IncidentType, string> {
  return {
  flood: t('Flood / Waterlogging'),
  fire: t('Fire'),
  'building-collapse': t('Building Collapse'),
  'infrastructure-failure': t('Infrastructure Failure'),
  'extreme-weather': t('Extreme Weather'),
  'public-health': t('Public Health'),
  'road-disruption': t('Road Disruption'),
  'utility-incident': t('Utility Incident'),
}
}
export let INCIDENT_TYPE_LABEL: Record<IncidentType, string> = build$INCIDENT_TYPE_LABEL()
registerLayer(() => {
  INCIDENT_TYPE_LABEL = build$INCIDENT_TYPE_LABEL()
})

export type IncidentStatus =
  | 'detected'
  | 'validated'
  | 'active'
  | 'contained'
  | 'resolved'
  | 'reviewed'

function build$INCIDENT_STATUS_LABEL(): Record<IncidentStatus, string> {
  return {
  detected: t('Detected'),
  validated: t('Validated'),
  active: t('Active'),
  contained: t('Contained'),
  resolved: t('Resolved'),
  reviewed: t('Reviewed'),
}
}
export let INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = build$INCIDENT_STATUS_LABEL()
registerLayer(() => {
  INCIDENT_STATUS_LABEL = build$INCIDENT_STATUS_LABEL()
})

export interface ResponseTeam {
  id: string
  name: string
  type: 'fire' | 'disaster-response' | 'medical' | 'engineering' | 'dewatering' | 'police-liaison'
  strength: number
  status: 'deployed' | 'en-route' | 'standby' | 'stood-down'
  assignedAt?: IsoDateTime
  wardId: string
}

export interface TimelineEvent {
  id: string
  at: IsoDateTime
  actor: string
  title: string
  detail: string
  kind: 'detection' | 'assessment' | 'deployment' | 'update' | 'escalation' | 'resolution' | 'decision'
}

export interface Incident {
  id: string
  tenantId: TenantId
  reference: string
  title: string
  description: string
  type: IncidentType
  severity: Severity
  status: IncidentStatus
  wardId: string
  locationName: string
  location: GeoPoint
  /** Modelled estimate of affected residents. */
  affectedPopulation: number
  affectedAreaSqKm: number
  responseTeams: ResponseTeam[]
  timeline: TimelineEvent[]
  evidenceIds: string[]
  notes: ActionNote[]
  decisionCaseIds: string[]
  actionIds: string[]
  ownerId: string
  departmentId: string
  detectedAt: IsoDateTime
  updatedAt: IsoDateTime
  resolvedAt?: IsoDateTime
  /** Roads rendered impassable or restricted by the incident. */
  roadsImpacted: string[]
  hospitalsImpacted: string[]
  classification: DataClassification
  confidence: ConfidenceLevel
}

/** ---------------------------------------------------------------------
 * Citizen services
 * ------------------------------------------------------------------- */

export type ComplaintCategory =
  | 'water-supply'
  | 'drainage'
  | 'road-defect'
  | 'solid-waste'
  | 'street-light'
  | 'sewerage'
  | 'building'
  | 'health-sanitation'
  | 'encroachment'
  // Services the corporation is obliged to run, and is therefore complained
  // to about. A grievance taxonomy narrower than the service catalogue forces
  // real complaints into "Other", where no department owns them.
  | 'garden'
  | 'public-convenience'
  | 'stray-animal'
  | 'education'
  | 'licensing'
  | 'registration'
  | 'other'

function build$COMPLAINT_CATEGORY_LABEL(): Record<ComplaintCategory, string> {
  return {
  'water-supply': t('Water Supply'),
  drainage: t('Drainage'),
  'road-defect': t('Road Defect'),
  'solid-waste': t('Solid Waste'),
  'street-light': t('Street Light'),
  sewerage: t('Sewerage'),
  building: t('Building'),
  'health-sanitation': t('Health & Sanitation'),
  encroachment: t('Encroachment'),
  garden: t('Garden & Open Space'),
  'public-convenience': t('Public Convenience'),
  'stray-animal': t('Stray Animal'),
  education: t('Municipal School'),
  licensing: t('Licence & Trade'),
  registration: t('Birth / Death Registration'),
  other: t('Other'),
}
}
export let COMPLAINT_CATEGORY_LABEL: Record<ComplaintCategory, string> = build$COMPLAINT_CATEGORY_LABEL()
registerLayer(() => {
  COMPLAINT_CATEGORY_LABEL = build$COMPLAINT_CATEGORY_LABEL()
})

/**
 * How a citizen reached the corporation.
 *
 * Carried because the channel is an operational fact, not a detail: a
 * corporation reports resolution rates per channel, the mobile channel is
 * where photographic evidence arrives, and the walk-in channel is the one
 * that tells you the digital channels are failing the people using them. A
 * complaint register without the channel cannot answer any of that.
 */
export type ComplaintChannel =
  | 'helpline'
  | 'citizen-portal'
  | 'mobile-app'
  | 'ward-office'
  | 'social-media'
  | 'field-inspection'

export interface Complaint {
  id: string
  tenantId: TenantId
  reference: string
  category: ComplaintCategory
  /** The channel the complaint arrived on. */
  channel: ComplaintChannel
  /** No citizen personal data is held in the demonstration environment. */
  summary: string
  wardId: string
  localityName: string
  departmentId: string
  raisedAt: IsoDateTime
  status: 'registered' | 'assigned' | 'in-progress' | 'resolved' | 'reopened' | 'closed'
  slaHours: number
  ageHours: number
  slaBreached: boolean
  repeatCount: number
  severity: Severity
  assignedOfficerId?: string
  location: GeoPoint
}

/** Aggregated ward-level citizen service posture. */
export interface ServiceHealth {
  wardId: string
  category: ComplaintCategory
  open: number
  resolved30d: number
  avgResolutionHours: number
  slaCompliancePct: number
  trendPct: number
  state: OperationalState
}

/** ---------------------------------------------------------------------
 * Municipal assets & workforce
 * ------------------------------------------------------------------- */

export type AssetCategory =
  | 'water-asset'
  | 'pumping-station'
  | 'drain'
  | 'road'
  | 'bridge'
  | 'building'
  | 'hospital'
  | 'school'
  | 'waste-facility'
  | 'vehicle'
  | 'street-light'
  | 'park'
  | 'market'
  | 'crematorium'
  | 'public-convenience'

function build$ASSET_CATEGORY_LABEL(): Record<AssetCategory, string> {
  return {
  'water-asset': t('Water Asset'),
  'pumping-station': t('Pumping Station'),
  drain: t('Storm Water Drain'),
  road: t('Road'),
  bridge: t('Bridge / Flyover'),
  building: t('Municipal Building'),
  hospital: t('Hospital'),
  school: t('Municipal School'),
  'waste-facility': t('Waste Facility'),
  vehicle: t('Vehicle'),
  'street-light': t('Street Light'),
  park: t('Park / Open Space'),
  market: t('Municipal Market'),
  crematorium: t('Crematorium / Burial Ground'),
  'public-convenience': t('Public Convenience'),
}
}
export let ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = build$ASSET_CATEGORY_LABEL()
registerLayer(() => {
  ASSET_CATEGORY_LABEL = build$ASSET_CATEGORY_LABEL()
})

export interface MunicipalAsset {
  id: string
  tenantId: TenantId
  name: string
  category: AssetCategory
  wardId: string
  departmentId: string
  installedYear: number
  designLifeYears: number
  /** 0–100 condition index; higher is better. */
  conditionIndex: number
  state: OperationalState
  lastInspectedAt: IsoDateTime
  nextInspectionDue: IsoDateTime
  replacementValueCrore: number
  criticality: Severity
  location: GeoPoint
  /** Open maintenance observations recorded against this asset. */
  openObservations: number
  classification: DataClassification
}

export interface WorkforceUnit {
  id: string
  tenantId: TenantId
  departmentId: string
  wardId?: string
  cadre: string
  sanctioned: number
  deployed: number
  onLeave: number
  contractual: number
  vacancyPct: number
  /** 0–100 modelled workload index; higher means more strained. */
  workloadIndex: number
  state: OperationalState
}
