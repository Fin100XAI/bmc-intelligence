import type {
  ConfidenceLevel,
  DataClassification,
  DataFreshness,
  IntelligenceDomain,
  IsoDateTime,
  Severity,
  TenantId,
} from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * The intelligence chain: every item the platform surfaces is traceable from
 * source through transformation, model, recommendation, human decision,
 * action and outcome. Nothing is presented as fact without provenance.
 */

export type IntelligenceType =
  | 'risk'
  | 'anomaly'
  | 'forecast'
  | 'incident'
  | 'sla-breach'
  | 'revenue-exception'
  | 'project-delay'
  | 'health-warning'
  | 'asset-failure'
  | 'service-deterioration'
  | 'ai-recommendation'
  | 'cross-domain'

function build$INTELLIGENCE_TYPE_LABEL(): Record<IntelligenceType, string> {
  return {
  risk: t('Risk'),
  anomaly: t('Anomaly'),
  forecast: t('Forecast'),
  incident: t('Incident'),
  'sla-breach': t('SLA Breach'),
  'revenue-exception': t('Revenue Exception'),
  'project-delay': t('Project Delay'),
  'health-warning': t('Health Warning'),
  'asset-failure': t('Asset Failure'),
  'service-deterioration': t('Service Deterioration'),
  'ai-recommendation': t('AI Recommendation'),
  'cross-domain': t('Cross-Domain Insight'),
}
}
export let INTELLIGENCE_TYPE_LABEL: Record<IntelligenceType, string> = build$INTELLIGENCE_TYPE_LABEL()
registerLayer(() => {
  INTELLIGENCE_TYPE_LABEL = build$INTELLIGENCE_TYPE_LABEL()
})

/** Intelligence workflow - New → Reviewed → Assigned → … → Closed. */
export type IntelligenceStatus =
  | 'new'
  | 'reviewed'
  | 'assigned'
  | 'in-progress'
  | 'resolved'
  | 'verified'
  | 'closed'

function build$INTELLIGENCE_STATUS_LABEL(): Record<IntelligenceStatus, string> {
  return {
  new: t('New'),
  reviewed: t('Reviewed'),
  assigned: t('Assigned'),
  'in-progress': t('In Progress'),
  resolved: t('Resolved'),
  verified: t('Verified'),
  closed: t('Closed'),
}
}
export let INTELLIGENCE_STATUS_LABEL: Record<IntelligenceStatus, string> = build$INTELLIGENCE_STATUS_LABEL()
registerLayer(() => {
  INTELLIGENCE_STATUS_LABEL = build$INTELLIGENCE_STATUS_LABEL()
})

/** How the item was produced - rule engine, model or human analyst. */
export type IntelligenceGenerator = 'rule-engine' | 'model' | 'analyst' | 'correlation-engine'

export interface RecommendedAction {
  id: string
  title: string
  /** Institutional justification for the recommendation. */
  rationale: string
  expectedImpact: string
  /** Department expected to own execution. */
  departmentId: string
  effort: 'low' | 'medium' | 'high'
  horizon: 'immediate' | '24-hours' | '7-days' | '30-days'
  dependencies: string[]
  risks: string[]
  confidence: ConfidenceLevel
  /** Recommendations never execute automatically. */
  requiresHumanApproval: true
}

export interface IntelligenceItem {
  id: string
  tenantId: TenantId
  title: string
  description: string
  /** Plain-language explanation of why the platform raised this. */
  explanation: string
  type: IntelligenceType
  domain: IntelligenceDomain
  severity: Severity
  confidence: ConfidenceLevel
  wardIds: string[]
  departmentId: string
  evidenceIds: string[]
  recommendedActions: RecommendedAction[]
  ownerId?: string
  status: IntelligenceStatus
  generator: IntelligenceGenerator
  /** Populated when a decision case has been raised from this item. */
  decisionCaseId?: string
  /** Populated when an incident has been raised from this item. */
  incidentId?: string
  /** Estimated citizens affected - modelled, not surveyed. */
  citizensAffected?: number
  /** Contributing domains for cross-domain correlations. */
  contributingDomains?: IntelligenceDomain[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  classification: DataClassification
  freshness: DataFreshness
}

/** ---------------------------------------------------------------------
 * Evidence & provenance
 * ------------------------------------------------------------------- */

export type EvidenceKind =
  | 'source-record'
  | 'derived-metric'
  | 'sensor-reading'
  | 'field-report'
  | 'inspection'
  | 'document'
  | 'model-output'
  | 'complaint'
  | 'financial-record'

export interface EvidenceItem {
  id: string
  tenantId: TenantId
  kind: EvidenceKind
  title: string
  summary: string
  /** Authoritative system that remains the system of record. */
  sourceSystem: string
  sourceRecordRef: string
  observedAt: IsoDateTime
  ingestedAt: IsoDateTime
  /** Transformation applied between source and metric. */
  transformation: string
  /** 0–100 data quality score for the source record. */
  dataQuality: number
  classification: DataClassification
  /** Model identifier when a model participated in producing this evidence. */
  modelId?: string
  confidence?: ConfidenceLevel
  wardIds: string[]
  departmentId: string
  /** Structured key/value detail rendered in the evidence drawer. */
  attributes: Array<{ key: string; value: string }>
  lineageId: string
}

/** The full provenance chain rendered by the evidence drawer. */
export interface ProvenanceChain {
  source: string
  transformation: string
  metric: string
  ruleOrModel: string
  intelligence: string
  recommendation: string
  humanDecision: string
  action: string
  outcome: string
}

/** ---------------------------------------------------------------------
 * Alerts
 * ------------------------------------------------------------------- */

export type AlertStatus =
  | 'open'
  | 'acknowledged'
  | 'assigned'
  | 'escalated'
  | 'resolved'
  | 'closed'

function build$ALERT_STATUS_LABEL(): Record<AlertStatus, string> {
  return {
  open: t('Open'),
  acknowledged: t('Acknowledged'),
  assigned: t('Assigned'),
  escalated: t('Escalated'),
  resolved: t('Resolved'),
  closed: t('Closed'),
}
}
export let ALERT_STATUS_LABEL: Record<AlertStatus, string> = build$ALERT_STATUS_LABEL()
registerLayer(() => {
  ALERT_STATUS_LABEL = build$ALERT_STATUS_LABEL()
})

export interface Alert {
  id: string
  tenantId: TenantId
  title: string
  description: string
  domain: IntelligenceDomain
  severity: Severity
  wardIds: string[]
  departmentId: string
  source: string
  confidence: ConfidenceLevel
  status: AlertStatus
  ownerId?: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  /** SLA target in hours from creation. */
  slaHours: number
  /** Remaining SLA in hours; negative means breached. */
  slaRemainingHours: number
  evidenceIds: string[]
  intelligenceId?: string
  incidentId?: string
  decisionCaseId?: string
  classification: DataClassification
}

/** ---------------------------------------------------------------------
 * Notifications
 * ------------------------------------------------------------------- */

export type NotificationType =
  | 'assignment'
  | 'escalation'
  | 'decision-required'
  | 'critical-alert'
  | 'sla-warning'
  | 'ai-recommendation'
  | 'security-event'

function build$NOTIFICATION_TYPE_LABEL(): Record<NotificationType, string> {
  return {
  assignment: t('Assignment'),
  escalation: t('Escalation'),
  'decision-required': t('Decision Required'),
  'critical-alert': t('Critical Alert'),
  'sla-warning': t('SLA Warning'),
  'ai-recommendation': t('AI Recommendation'),
  'security-event': t('Security Event'),
}
}
export let NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = build$NOTIFICATION_TYPE_LABEL()
registerLayer(() => {
  NOTIFICATION_TYPE_LABEL = build$NOTIFICATION_TYPE_LABEL()
})

export interface NotificationItem {
  id: string
  tenantId: TenantId
  type: NotificationType
  title: string
  body: string
  createdAt: IsoDateTime
  read: boolean
  severity: Severity
  /** In-app destination for the notification. */
  route?: string
  recipientRoleIds: string[]
}
