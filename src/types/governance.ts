import type {
  DataClassification,
  IntelligenceDomain,
  IsoDateTime,
  OperationalState,
  Severity,
  TenantId,
} from './common'
import type { RoleId } from './organisation'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/** ---------------------------------------------------------------------
 * Audit - immutable-style institutional record of every consequential act.
 * ------------------------------------------------------------------- */

export type AuditAction =
  | 'sign-in'
  | 'sign-out'
  | 'view-restricted'
  | 'view-evidence'
  | 'create-decision'
  | 'approve'
  | 'reject'
  | 'assign'
  | 'escalate'
  | 'export'
  | 'ai-request'
  | 'configuration-change'
  | 'status-change'
  | 'acknowledge'
  | 'create-incident'
  | 'create-action'
  | 'run-scenario'
  | 'access-denied'

function build$AUDIT_ACTION_LABEL(): Record<AuditAction, string> {
  return {
  'sign-in': t('Sign In'),
  'sign-out': t('Sign Out'),
  'view-restricted': t('View Restricted Item'),
  'view-evidence': t('Evidence Opened'),
  'create-decision': t('Decision Case Created'),
  approve: t('Approved'),
  reject: t('Rejected'),
  assign: t('Assigned'),
  escalate: t('Escalated'),
  export: t('Exported'),
  'ai-request': t('AI Request'),
  'configuration-change': t('Configuration Changed'),
  'status-change': t('Status Changed'),
  acknowledge: t('Acknowledged'),
  'create-incident': t('Incident Created'),
  'create-action': t('Action Created'),
  'run-scenario': t('Scenario Executed'),
  'access-denied': t('Access Denied'),
}
}
export let AUDIT_ACTION_LABEL: Record<AuditAction, string> = build$AUDIT_ACTION_LABEL()
registerLayer(() => {
  AUDIT_ACTION_LABEL = build$AUDIT_ACTION_LABEL()
})

export interface AuditEvent {
  id: string
  tenantId: TenantId
  actorId: string
  actorName: string
  actorRole: RoleId
  action: AuditAction
  resourceType: string
  resourceId: string
  resourceLabel: string
  at: IsoDateTime
  /** Institutional reason captured at the point of action. */
  reason?: string
  /** Placeholder only - no real network identifier is recorded. */
  sourceIpPlaceholder: string
  sessionId: string
  classification: DataClassification
  outcome: 'success' | 'denied' | 'error'
  detail?: string
}

/** ---------------------------------------------------------------------
 * Data governance
 * ------------------------------------------------------------------- */

export interface Dataset {
  id: string
  tenantId: TenantId
  name: string
  description: string
  ownerDepartmentId: string
  ownerOfficerId: string
  /** Stated purpose - the basis for purpose-limited access. */
  purpose: string
  classification: DataClassification
  retentionMonths: number
  sensitivity: 'none' | 'low' | 'moderate' | 'high'
  allowedRoles: RoleId[]
  sourceSystem: string
  sharingStatus: 'internal-only' | 'inter-departmental' | 'state-shared' | 'restricted'
  lineageId: string
  /** 0–100 composite quality score. */
  qualityScore: number
  recordCount: number
  lastRefreshedAt: IsoDateTime
  containsPersonalData: boolean
  minimisationApplied: string[]
  domain: IntelligenceDomain
}

export type LineageStageKind =
  | 'source'
  | 'ingestion'
  | 'validation'
  | 'canonical-entity'
  | 'derived-metric'
  | 'intelligence-engine'
  | 'dashboard'
  | 'decision'

function build$LINEAGE_STAGE_LABEL(): Record<LineageStageKind, string> {
  return {
  source: t('Source'),
  ingestion: t('Ingestion'),
  validation: t('Validation'),
  'canonical-entity': t('Canonical Entity'),
  'derived-metric': t('Derived Metric'),
  'intelligence-engine': t('Intelligence Engine'),
  dashboard: t('Dashboard'),
  decision: t('Decision'),
}
}
export let LINEAGE_STAGE_LABEL: Record<LineageStageKind, string> = build$LINEAGE_STAGE_LABEL()
registerLayer(() => {
  LINEAGE_STAGE_LABEL = build$LINEAGE_STAGE_LABEL()
})

export interface LineageStage {
  id: string
  kind: LineageStageKind
  name: string
  detail: string
  owner: string
  state: OperationalState
  /** 0–100 quality assessment at this stage. */
  quality: number
  transformations: string[]
}

export interface LineageGraph {
  id: string
  tenantId: TenantId
  metricId: string
  metricLabel: string
  domain: IntelligenceDomain
  stages: LineageStage[]
  classification: DataClassification
  lastValidatedAt: IsoDateTime
}

/** ---------------------------------------------------------------------
 * Integrations
 * ------------------------------------------------------------------- */

export type ConnectorType =
  | 'rest'
  | 'graphql'
  | 'file-transfer'
  | 'database'
  | 'event-stream'
  | 'websocket'
  | 'gis'
  | 'iot'
  | 'document'

function build$CONNECTOR_TYPE_LABEL(): Record<ConnectorType, string> {
  return {
  rest: t('REST API'),
  graphql: t('GraphQL'),
  'file-transfer': t('Secure File Transfer'),
  database: t('Database Link'),
  'event-stream': t('Event Stream'),
  websocket: t('WebSocket'),
  gis: t('GIS Service'),
  iot: t('IoT Telemetry'),
  document: t('Document Intelligence'),
}
}
export let CONNECTOR_TYPE_LABEL: Record<ConnectorType, string> = build$CONNECTOR_TYPE_LABEL()
registerLayer(() => {
  CONNECTOR_TYPE_LABEL = build$CONNECTOR_TYPE_LABEL()
})

export interface Connector {
  id: string
  tenantId: TenantId
  name: string
  type: ConnectorType
  ownerDepartmentId: string
  ownerOfficerId: string
  authenticationMode: 'mtls' | 'oauth2' | 'api-key-vault' | 'sftp-key' | 'not-configured'
  /**
   * Demonstration environment states only. No connector claims a live
   * connection to any municipal departmental system.
   */
  health: Extract<OperationalState, 'simulation' | 'adapter-ready' | 'not-connected' | 'review-required'>
  lastSyncAt?: IsoDateTime
  latencyMs?: number
  qualityScore?: number
  environment: 'demonstration' | 'staging' | 'production'
  classification: DataClassification
  domain: IntelligenceDomain
  /** The system on the other side of the adapter, named as its operator names it. */
  targetSystem: string
  /**
   * Who operates that system. A connector is a relationship with an
   * institution before it is a piece of software, and the institution is what
   * determines whether the feed can be provisioned at all: the corporation's
   * own departments can be directed, a state authority has to be requested,
   * and a national service has to be subscribed to. An integration register
   * that only names systems hides the thing that actually blocks the work.
   */
  sourceAuthority: string
  notes: string
}

/** ---------------------------------------------------------------------
 * Data sources — the operational ingestion register
 *
 * Where a Connector describes the *adapter* (how a feed would authenticate and
 * exchange data), a DataSource is the operator-facing view of a *feed*: is it
 * enabled, how often it ingests, when it last ran, how much it has brought in
 * and how clean that data is. Nothing here is a live connection; sync actions
 * are simulated and their timestamps are anchored to the demonstration clock.
 * ------------------------------------------------------------------- */

export type DataSourceCategory =
  | 'sensor-network'
  | 'departmental-system'
  | 'public-registry'
  | 'citizen-channel'
  | 'external-feed'
  | 'geospatial'

function build$DATA_SOURCE_CATEGORY_LABEL(): Record<DataSourceCategory, string> {
  return {
  'sensor-network': t('Sensor Network'),
  'departmental-system': t('Departmental System'),
  'public-registry': t('Public Registry'),
  'citizen-channel': t('Citizen Channel'),
  'external-feed': t('External Feed'),
  geospatial: t('Geospatial Layer'),
}
}
export let DATA_SOURCE_CATEGORY_LABEL: Record<DataSourceCategory, string> = build$DATA_SOURCE_CATEGORY_LABEL()
registerLayer(() => {
  DATA_SOURCE_CATEGORY_LABEL = build$DATA_SOURCE_CATEGORY_LABEL()
})

export type DataSourceFormat = 'json-api' | 'csv-sftp' | 'event-stream' | 'db-replica' | 'webhook'

function build$DATA_SOURCE_FORMAT_LABEL(): Record<DataSourceFormat, string> {
  return {
  'json-api': t('JSON API'),
  'csv-sftp': t('CSV over SFTP'),
  'event-stream': t('Event Stream'),
  'db-replica': t('Database Replica'),
  webhook: t('Webhook'),
}
}
export let DATA_SOURCE_FORMAT_LABEL: Record<DataSourceFormat, string> = build$DATA_SOURCE_FORMAT_LABEL()
registerLayer(() => {
  DATA_SOURCE_FORMAT_LABEL = build$DATA_SOURCE_FORMAT_LABEL()
})

export type SyncFrequency = 'realtime' | '5-min' | 'hourly' | 'daily' | 'weekly'

function build$SYNC_FREQUENCY_LABEL(): Record<SyncFrequency, string> {
  return {
  realtime: 'Real-time',
  '5-min': t('Every 5 minutes'),
  hourly: t('Hourly'),
  daily: t('Daily'),
  weekly: t('Weekly'),
}
}
export let SYNC_FREQUENCY_LABEL: Record<SyncFrequency, string> = build$SYNC_FREQUENCY_LABEL()
registerLayer(() => {
  SYNC_FREQUENCY_LABEL = build$SYNC_FREQUENCY_LABEL()
})

/** Demonstration ingestion states — never a claim of a live departmental feed. */
export type DataSourceStatus = 'healthy' | 'degraded' | 'stale' | 'paused' | 'error'

function build$DATA_SOURCE_STATUS_LABEL(): Record<DataSourceStatus, string> {
  return {
  healthy: t('Healthy'),
  degraded: t('Degraded'),
  stale: t('Stale'),
  paused: t('Paused'),
  error: t('Error'),
}
}
export let DATA_SOURCE_STATUS_LABEL: Record<DataSourceStatus, string> = build$DATA_SOURCE_STATUS_LABEL()
registerLayer(() => {
  DATA_SOURCE_STATUS_LABEL = build$DATA_SOURCE_STATUS_LABEL()
})

/**
 * A field in the source's declared ingestion schema. `sensitive` marks a field
 * carrying something personal: those are the fields a privacy review has to
 * account for, and the ones the register minimises or hashes on ingest.
 */
export interface DataSourceField {
  name: string
  type: 'string' | 'integer' | 'decimal' | 'boolean' | 'timestamp' | 'geo-point' | 'enum'
  nullable: boolean
  description: string
  sensitive?: boolean
}

/**
 * Data quality decomposed rather than asserted. A single "92/100" tells an
 * operator nothing about *what* is wrong; these five dimensions are what a
 * data steward actually acts on, and the headline `qualityScore` is their mean
 * rather than an independent judgement.
 */
export interface DataSourceQuality {
  /** Share of expected records that arrived at all. */
  completeness: number
  /** Share of arrived records that passed schema and range validation. */
  validity: number
  /** Share of records that arrived inside the freshness SLA. */
  timeliness: number
  /** Share of records with no duplicate on the declared natural key. */
  uniqueness: number
  /** Agreement with the canonical entity register (ward, department, asset). */
  consistency: number
}

export type SyncOutcome = 'succeeded' | 'partial' | 'failed' | 'skipped'

function build$SYNC_OUTCOME_LABEL(): Record<SyncOutcome, string> {
  return {
  succeeded: t('Succeeded'),
  partial: t('Partial'),
  failed: t('Failed'),
  skipped: t('Skipped'),
}
}
export let SYNC_OUTCOME_LABEL: Record<SyncOutcome, string> = build$SYNC_OUTCOME_LABEL()
registerLayer(() => {
  SYNC_OUTCOME_LABEL = build$SYNC_OUTCOME_LABEL()
})

/** One simulated ingestion run. Never a record of a real departmental fetch. */
export interface DataSourceSyncRun {
  id: string
  startedAt: IsoDateTime
  durationSeconds: number
  outcome: SyncOutcome
  recordsIngested: number
  recordsRejected: number
  note: string
}

/** A recorded ingestion fault — a feed problem, never a departmental fault. */
export interface DataSourceIncident {
  id: string
  at: IsoDateTime
  severity: Severity
  summary: string
  resolved: boolean
}

export interface DataSource {
  id: string
  name: string
  category: DataSourceCategory
  ownerDepartmentId: string
  /** Accountable officer for the feed, resolved through `officerDisplayName`. */
  ownerOfficerId?: string
  domain: IntelligenceDomain
  classification: DataClassification
  format: DataSourceFormat
  frequency: SyncFrequency
  enabled: boolean
  status: DataSourceStatus
  /** Simulated last successful ingestion, anchored to the demonstration clock. */
  lastSyncAt: IsoDateTime
  recordsIngested: number
  /** Mean of the five quality dimensions; never set independently of them. */
  qualityScore: number
  latencyMs: number

  /* Governance ------------------------------------------------------- */
  /**
   * Why this feed is ingested at all. Purpose limitation is enforced by
   * writing the purpose down next to the feed, so an ingestion that has
   * outlived its stated purpose is visible rather than inferred.
   */
  purpose?: string
  /** True when any schema field is marked sensitive. */
  personalData?: boolean
  retentionDays?: number
  /** Freshness expectation in minutes; breaching it is what makes a feed stale. */
  slaMinutes?: number
  /** Illustrative endpoint label. Deliberately not a routable address. */
  endpointLabel?: string

  /* Operational detail ------------------------------------------------ */
  schema?: DataSourceField[]
  quality?: DataSourceQuality
  syncHistory?: DataSourceSyncRun[]
  incidents?: DataSourceIncident[]
  /** Metrics and modules downstream of this feed, for impact assessment. */
  downstream?: string[]
  notes?: string

  /** True for sources added in-session through the Add data source form. */
  custom?: boolean
}

/** ---------------------------------------------------------------------
 * Security
 * ------------------------------------------------------------------- */

export type SecurityEventType =
  | 'failed-authentication'
  | 'privilege-escalation-request'
  | 'unusual-session'
  | 'policy-violation'
  | 'restricted-access-attempt'
  | 'bulk-export'
  | 'configuration-change'
  | 'integration-auth-failure'
  | 'anomalous-query-volume'

function build$SECURITY_EVENT_LABEL(): Record<SecurityEventType, string> {
  return {
  'failed-authentication': t('Failed Authentication'),
  'privilege-escalation-request': t('Privilege Escalation Request'),
  'unusual-session': t('Unusual Session'),
  'policy-violation': t('Policy Violation'),
  'restricted-access-attempt': t('Restricted Access Attempt'),
  'bulk-export': t('Bulk Export'),
  'configuration-change': t('Configuration Change'),
  'integration-auth-failure': t('Integration Authentication Failure'),
  'anomalous-query-volume': t('Anomalous Query Volume'),
}
}
export let SECURITY_EVENT_LABEL: Record<SecurityEventType, string> = build$SECURITY_EVENT_LABEL()
registerLayer(() => {
  SECURITY_EVENT_LABEL = build$SECURITY_EVENT_LABEL()
})

export interface SecurityEvent {
  id: string
  tenantId: TenantId
  reference: string
  type: SecurityEventType
  severity: Severity
  detectedAt: IsoDateTime
  subjectUserId?: string
  subjectUserName: string
  subjectRole?: RoleId
  sessionId?: string
  sourceIpPlaceholder: string
  device: string
  description: string
  status: 'open' | 'investigating' | 'contained' | 'closed' | 'false-positive'
  ownerId: string
  relatedPolicyIds: string[]
  auditEventIds: string[]
  recommendedAction: string
  classification: DataClassification
}

export interface SecurityPosture {
  authenticationHealth: number
  mfaCoveragePct: number
  privilegedAccounts: number
  privilegedWithoutMfa: number
  suspiciousSessions: number
  policyViolations30d: number
  securityEvents30d: number
  openVulnerabilities: { critical: number; high: number; medium: number; low: number }
  encryptionInTransit: OperationalState
  encryptionAtRest: OperationalState
  integrationsRequiringReview: number
  lastAssessmentAt: IsoDateTime
  /** Explicit statement that no certification is claimed. */
  certificationNote: string
}

export interface AccessPolicy {
  id: string
  tenantId: TenantId
  name: string
  description: string
  /** Roles the policy grants to. */
  roleIds: RoleId[]
  resourceTypes: string[]
  actions: string[]
  /** Attribute conditions (ABAC) evaluated at request time. */
  conditions: Array<{ attribute: string; operator: string; value: string }>
  maxClassification: DataClassification
  effect: 'allow' | 'deny'
  status: 'active' | 'draft' | 'review-required' | 'retired'
  lastReviewedAt: IsoDateTime
  ownerId: string
}

/** ---------------------------------------------------------------------
 * Platform health
 * ------------------------------------------------------------------- */

export interface PlatformService {
  id: string
  name: string
  category: 'application' | 'data-pipeline' | 'ai-gateway' | 'integration' | 'storage' | 'event-processing'
  state: OperationalState
  /** Availability percentage over the last 30 days. */
  availabilityPct: number
  p95LatencyMs: number
  errorRatePct: number
  lastIncidentAt?: IsoDateTime
  /** True where the component is a demonstration simulation. */
  simulated: boolean
  note: string
}

export interface PipelineJob {
  id: string
  name: string
  schedule: string
  lastRunAt: IsoDateTime
  durationSeconds: number
  status: 'succeeded' | 'failed' | 'running' | 'skipped'
  recordsProcessed: number
  failures7d: number
  domain: IntelligenceDomain
}

/** ---------------------------------------------------------------------
 * Knowledge graph
 * ------------------------------------------------------------------- */

export type GraphEntityKind =
  | 'ward'
  | 'department'
  | 'officer'
  | 'asset'
  | 'road'
  | 'project'
  | 'contractor'
  | 'tender'
  | 'budget'
  | 'complaint'
  | 'incident'
  | 'hospital'
  | 'facility'
  | 'scheme'
  | 'decision'
  | 'document'

function build$GRAPH_ENTITY_LABEL(): Record<GraphEntityKind, string> {
  return {
  ward: t('Ward'),
  department: t('Department'),
  officer: t('Officer'),
  asset: t('Asset'),
  road: t('Road'),
  project: t('Project'),
  contractor: t('Contractor'),
  tender: t('Tender'),
  budget: t('Budget'),
  complaint: t('Complaint'),
  incident: t('Incident'),
  hospital: t('Hospital'),
  facility: t('Facility'),
  scheme: t('Scheme'),
  decision: t('Decision'),
  document: t('Document'),
}
}
export let GRAPH_ENTITY_LABEL: Record<GraphEntityKind, string> = build$GRAPH_ENTITY_LABEL()
registerLayer(() => {
  GRAPH_ENTITY_LABEL = build$GRAPH_ENTITY_LABEL()
})

export interface GraphNode {
  id: string
  kind: GraphEntityKind
  label: string
  subtitle: string
  /** Institutional importance, drives node radius. */
  weight: number
  domain: IntelligenceDomain
  classification: DataClassification
  attributes: Array<{ key: string; value: string }>
  /** Deep link into the relevant intelligence module. */
  route?: string
  severity?: Severity
}

export type GraphRelation =
  | 'contains'
  | 'affected-by'
  | 'assigned-to'
  | 'maintained-under'
  | 'executed-by'
  | 'funded-by'
  | 'linked-to'
  | 'assessed-through'
  | 'reports-to'
  | 'serves'
  | 'located-in'
  | 'raised-from'
  | 'governs'

function build$GRAPH_RELATION_LABEL(): Record<GraphRelation, string> {
  return {
  contains: 'contains',
  'affected-by': t('affected by'),
  'assigned-to': t('assigned to'),
  'maintained-under': t('maintained under'),
  'executed-by': t('executed by'),
  'funded-by': t('funded by'),
  'linked-to': t('linked to'),
  'assessed-through': t('assessed through'),
  'reports-to': t('reports to'),
  serves: 'serves',
  'located-in': t('located in'),
  'raised-from': t('raised from'),
  governs: 'governs',
}
}
export let GRAPH_RELATION_LABEL: Record<GraphRelation, string> = build$GRAPH_RELATION_LABEL()
registerLayer(() => {
  GRAPH_RELATION_LABEL = build$GRAPH_RELATION_LABEL()
})

export interface GraphEdge {
  id: string
  from: string
  to: string
  relation: GraphRelation
  weight: number
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
