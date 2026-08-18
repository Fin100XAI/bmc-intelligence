import { TENANT_ID, activeCorporation, municipality } from '@/config/municipality.config'
import { corporationName } from '@/config/corporations'
import type { IntelligenceDomain } from '@/types/common'
import type {
  AccessPolicy,
  AuditAction,
  AuditEvent,
  Connector,
  Dataset,
  LineageGraph,
  LineageStage,
  PipelineJob,
  PlatformService,
  SecurityEvent,
  SecurityEventType,
  SecurityPosture,
} from '@/types/governance'
import type { RoleId } from '@/types/organisation'
import { det, isoDaysFromAnchor, isoFromAnchor } from '@/utils/deterministic'
import { DEMO_USERS } from '@/auth/demo-users'
import { CORPORATION_SHORT_NAME } from './naming'
import { DEPARTMENTS, WARDS } from './reference'
import { CITY_SCALE, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * Data governance, security, audit trail and platform health.
 *
 * The governance *policies* here are properties of the platform and read the
 * same for every deployment. The *volumes* are not: an audit trail carrying
 * 260 events a month, or a grievance pipeline ingesting 3,184 records every
 * fifteen minutes, is a Brihanmumbai figure and is scaled to the active
 * corporation (`./scale.ts`). Institutional record references are built from
 * the active corporation's own short name rather than fixed, because an
 * incident reference reading `MCGM/INC/...` inside another corporation's
 * deployment is exactly the detail an officer notices first.
 *
 * Every corporation-dependent export below is a LIVE BINDING, rebuilt on a
 * corporation switch. No municipal system is contacted.
 */

/**
 * The prefix departmental record references carry, derived from the active
 * corporation's short name. Letters only, so a short name containing a hyphen
 * or a full stop still yields a clean reference.
 */
function referencePrefix(): string {
  return CORPORATION_SHORT_NAME.replace(/[^A-Za-z]/g, '').toUpperCase() || 'MC'
}

/** ---------------------------------------------------------------------
 * Datasets & data governance
 * ------------------------------------------------------------------- */

interface DatasetSpec {
  id: string
  name: string
  description: string
  ownerDepartmentId: string
  purpose: string
  classification: Dataset['classification']
  retentionMonths: number
  sensitivity: Dataset['sensitivity']
  allowedRoles: RoleId[]
  sourceSystem: string
  sharingStatus: Dataset['sharingStatus']
  domain: IntelligenceDomain
  containsPersonalData: boolean
  minimisation: string[]
}

function build$DATASET_SPECS(): DatasetSpec[] {
  return [
  {
    id: 'ds-ward-service',
    name: t('Ward service performance'),
    description: t('Aggregated ward-level service delivery indicators across all citizen service categories.'),
    ownerDepartmentId: 'dept-commissioner',
    purpose: t('Monitoring ward service delivery and directing operational intervention.'),
    classification: 'internal',
    retentionMonths: 84,
    sensitivity: 'low',
    allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'deputy-commissioner', 'ward-officer', 'department-head', 'analyst', 'auditor'],
    sourceSystem: 'Citizen Grievance Platform (simulated)',
    sharingStatus: 'inter-departmental',
    domain: 'wards',
    containsPersonalData: false,
    minimisation: [t('Complainant identity never ingested'), t('Location generalised to locality, never to address')],
  },
  {
    id: 'ds-grievance',
    name: t('Citizen grievance records'),
    description: t('Complaint records reduced to category, locality, timestamp and status. Identity fields are excluded at ingestion.'),
    ownerDepartmentId: 'dept-commissioner',
    purpose: t('Service assurance, SLA monitoring and recurring-issue detection.'),
    classification: 'confidential',
    retentionMonths: 60,
    sensitivity: 'moderate',
    allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'ward-officer', 'department-head', 'analyst', 'auditor'],
    sourceSystem: 'Citizen Grievance Platform (simulated)',
    sharingStatus: 'internal-only',
    domain: 'wards',
    containsPersonalData: false,
    minimisation: [t('Name, contact and address fields dropped at the connector'), t('Free-text narrative summarised to a category descriptor')],
  },
  {
    id: 'ds-property-assessment',
    name: t('Property assessment and collection'),
    description: t('Assessment register and collection position by ward, segment and period.'),
    ownerDepartmentId: 'dept-assessment',
    purpose: t('Revenue intelligence, collection efficiency monitoring and reconciliation.'),
    classification: 'restricted',
    retentionMonths: 120,
    sensitivity: 'high',
    allowedRoles: ['municipal-commissioner', 'finance-officer', 'auditor', 'security-administrator'],
    sourceSystem: 'Assessment & Collection System (simulated)',
    sharingStatus: 'restricted',
    domain: 'revenue',
    containsPersonalData: true,
    minimisation: [t('Assessee identity pseudonymised before analysis'), t('Analysis performed at cohort level only'), t('Individual assessment records never surfaced in intelligence views')],
  },
  {
    id: 'ds-budget-ledger',
    name: t('Budget and expenditure ledger'),
    description: t('Departmental budget allocation, revision, commitment and booked expenditure by head and period.'),
    ownerDepartmentId: 'dept-finance',
    purpose: t('Budget utilisation monitoring, variance analysis and forecasting.'),
    classification: 'confidential',
    retentionMonths: 120,
    sensitivity: 'moderate',
    allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'finance-officer', 'department-head', 'auditor'],
    sourceSystem: 'Municipal Financial Management System (simulated)',
    sharingStatus: 'internal-only',
    domain: 'budget',
    containsPersonalData: false,
    minimisation: [t('Vendor bank details excluded from ingestion')],
  },
  {
    id: 'ds-project-delivery',
    name: t('Capital project delivery'),
    description: t('Project master, milestone schedule, physical progress and payment position.'),
    ownerDepartmentId: 'dept-projects',
    purpose: t('Delivery assurance, risk detection and programme governance.'),
    classification: 'confidential',
    retentionMonths: 120,
    sensitivity: 'moderate',
    allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'chief-engineer', 'department-head', 'finance-officer', 'auditor', 'analyst'],
    sourceSystem: 'Project Management System (simulated)',
    sharingStatus: 'internal-only',
    domain: 'projects',
    containsPersonalData: false,
    minimisation: [t('Site personnel records excluded')],
  },
  {
    id: 'ds-health-surveillance',
    name: t('Public health surveillance aggregates'),
    description: t('Ward-level aggregate case counts by indicator and period. No patient-level record is ever ingested.'),
    ownerDepartmentId: 'dept-health',
    purpose: t('Outbreak signal detection and targeting of public health operations.'),
    classification: 'confidential',
    retentionMonths: 60,
    sensitivity: 'high',
    allowedRoles: ['municipal-commissioner', 'health-officer', 'department-head', 'auditor'],
    sourceSystem: 'Public Health Surveillance Return (simulated)',
    sharingStatus: 'restricted',
    domain: 'health',
    containsPersonalData: false,
    minimisation: [
      t('Aggregation applied at source - patient-level records are never transmitted'),
      t('Counts below the disclosure threshold suppressed'),
      t('No linkage to any individual identifier is technically possible'),
    ],
  },
  {
    id: 'ds-hospital-capacity',
    name: t('Hospital capacity returns'),
    description: t('Bed, critical care, staffing and service availability position by facility.'),
    ownerDepartmentId: 'dept-hospitals',
    purpose: t('Capacity monitoring and emergency surge planning.'),
    classification: 'confidential',
    retentionMonths: 36,
    sensitivity: 'moderate',
    allowedRoles: ['municipal-commissioner', 'health-officer', 'disaster-management-officer', 'department-head'],
    sourceSystem: 'Hospital Management System (simulated)',
    sharingStatus: 'inter-departmental',
    domain: 'hospitals',
    containsPersonalData: false,
    minimisation: [t('Facility-level aggregates only')],
  },
  {
    id: 'ds-rainfall',
    name: t('Rainfall and tide observations'),
    description: t('Automatic weather station rainfall accumulation and tidal prediction windows.'),
    ownerDepartmentId: 'dept-disaster',
    purpose: t('Monsoon risk assessment and operational preparedness.'),
    classification: 'public',
    retentionMonths: 120,
    sensitivity: 'none',
    allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'deputy-commissioner', 'ward-officer', 'department-head', 'disaster-management-officer', 'operator', 'analyst', 'auditor', 'health-officer', 'chief-engineer'],
    sourceSystem: 'Automatic Weather Station Network (simulated)',
    sharingStatus: 'state-shared',
    domain: 'monsoon',
    containsPersonalData: false,
    minimisation: [],
  },
  {
    id: 'ds-drainage-asset',
    name: t('Storm water drainage asset register'),
    description: t('Nallah, drain and culvert register with desilting completion and encroachment reports.'),
    ownerDepartmentId: 'dept-stormwater',
    purpose: t('Pre-monsoon preparedness assessment and flood risk modelling.'),
    classification: 'internal',
    retentionMonths: 120,
    sensitivity: 'low',
    allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'deputy-commissioner', 'ward-officer', 'department-head', 'chief-engineer', 'disaster-management-officer', 'analyst', 'auditor'],
    sourceSystem: 'SWD Asset Register (simulated)',
    sharingStatus: 'inter-departmental',
    domain: 'stormwater',
    containsPersonalData: false,
    minimisation: [],
  },
  {
    id: 'ds-water-distribution',
    name: t('Water distribution operations'),
    description: t('Zonal supply, pressure, non-revenue water and quality compliance readings.'),
    ownerDepartmentId: 'dept-hydraulic',
    purpose: t('Supply assurance, loss reduction and quality monitoring.'),
    classification: 'internal',
    retentionMonths: 84,
    sensitivity: 'low',
    allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'deputy-commissioner', 'ward-officer', 'department-head', 'chief-engineer', 'analyst', 'auditor'],
    sourceSystem: 'Hydraulic SCADA & Zonal Register (simulated)',
    sharingStatus: 'inter-departmental',
    domain: 'water',
    containsPersonalData: false,
    minimisation: [],
  },
  {
    id: 'ds-contract-register',
    name: t('Contract and vendor register'),
    description: t('Contract master, milestone position, variation and vendor performance index.'),
    ownerDepartmentId: 'dept-procurement',
    purpose: t('Procurement risk indication and delivery assurance.'),
    classification: 'restricted',
    retentionMonths: 120,
    sensitivity: 'high',
    allowedRoles: ['municipal-commissioner', 'finance-officer', 'chief-engineer', 'auditor', 'security-administrator'],
    sourceSystem: 'Contract Management System (simulated)',
    sharingStatus: 'restricted',
    domain: 'procurement',
    containsPersonalData: false,
    minimisation: [t('Bid evaluation records excluded from the intelligence layer')],
  },
  {
    id: 'ds-audit-trail',
    name: t('Platform audit trail'),
    description: t('Immutable-style record of every consequential read and write within the platform.'),
    ownerDepartmentId: 'dept-security',
    purpose: t('Accountability, security investigation and institutional assurance.'),
    classification: 'restricted',
    retentionMonths: 120,
    sensitivity: 'high',
    allowedRoles: ['municipal-commissioner', 'auditor', 'security-administrator', 'ai-governance-officer', 'finance-officer'],
    sourceSystem: 'BMC Intelligence Core - audit service',
    sharingStatus: 'restricted',
    domain: 'security',
    containsPersonalData: true,
    minimisation: [t('Officer identity retained by institutional necessity'), t('No network identifier recorded in the demonstration environment')],
  },
  {
    id: 'ds-ai-requests',
    name: t('AI request and response record'),
    description: t('Record of every AI request, the model used, grounding mode, citations and human review outcome.'),
    ownerDepartmentId: 'dept-ai-governance',
    purpose: t('AI governance, human oversight assurance and model performance review.'),
    classification: 'confidential',
    retentionMonths: 60,
    sensitivity: 'moderate',
    allowedRoles: ['municipal-commissioner', 'ai-governance-officer', 'auditor', 'security-administrator'],
    sourceSystem: 'BMC Intelligence Core - AI gateway',
    sharingStatus: 'internal-only',
    domain: 'ai-governance',
    containsPersonalData: true,
    minimisation: [t('Requesting officer retained for oversight accountability'), t('Prompt content retained only where required for governance review')],
  },
  {
    id: 'ds-asset-register',
    name: t('Municipal asset register'),
    description: t('Master register of municipal assets with condition assessment and inspection history.'),
    ownerDepartmentId: 'dept-estates',
    purpose: t('Asset lifecycle management and capital planning.'),
    classification: 'internal',
    retentionMonths: 240,
    sensitivity: 'low',
    allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'deputy-commissioner', 'ward-officer', 'department-head', 'chief-engineer', 'analyst', 'auditor'],
    sourceSystem: 'Municipal Asset Register (simulated)',
    sharingStatus: 'inter-departmental',
    domain: 'assets',
    containsPersonalData: false,
    minimisation: [],
  },
]
}
let DATASET_SPECS: DatasetSpec[] = build$DATASET_SPECS()
registerLayer(() => {
  DATASET_SPECS = build$DATASET_SPECS()
})

/** ---------------------------------------------------------------------
 * Data lineage
 * ------------------------------------------------------------------- */

const LINEAGE_DOMAINS: Array<{ domain: IntelligenceDomain; metricId: string; metricLabel: string; source: string }> = [
  { domain: 'wards', metricId: 'metric-ward-health', metricLabel: 'Ward operational health index', source: 'Citizen Grievance Platform' },
  { domain: 'monsoon', metricId: 'metric-monsoon-readiness', metricLabel: 'Monsoon readiness score', source: 'SWD Asset Register + AWS Network' },
  { domain: 'water', metricId: 'metric-water-reliability', metricLabel: 'Water supply reliability', source: 'Hydraulic SCADA & Zonal Register' },
  { domain: 'waste', metricId: 'metric-waste-coverage', metricLabel: 'Collection coverage', source: 'SWM Vehicle Tracking' },
  { domain: 'roads', metricId: 'metric-road-condition', metricLabel: 'Road network condition index', source: 'Road Asset & Defect Register' },
  { domain: 'health', metricId: 'metric-outbreak-signal', metricLabel: 'Outbreak signal strength', source: 'Public Health Surveillance Return' },
  { domain: 'budget', metricId: 'metric-budget-utilisation', metricLabel: 'Budget utilisation', source: 'Municipal Financial Management System' },
  { domain: 'revenue', metricId: 'metric-collection-efficiency', metricLabel: 'Collection efficiency', source: 'Assessment & Collection System' },
  { domain: 'projects', metricId: 'metric-project-risk', metricLabel: 'Project composite risk score', source: 'Project Management System' },
  { domain: 'procurement', metricId: 'metric-procurement-risk', metricLabel: 'Procurement risk indicator', source: 'Contract Management System' },
  { domain: 'stormwater', metricId: 'metric-drain-risk', metricLabel: 'Drain blockage risk', source: 'SWD Asset Register' },
  { domain: 'hospitals', metricId: 'metric-hospital-capacity', metricLabel: 'Critical care headroom', source: 'Hospital Management System' },
  { domain: 'assets', metricId: 'metric-asset-condition', metricLabel: 'Asset condition index', source: 'Municipal Asset Register' },
  { domain: 'security', metricId: 'metric-security-posture', metricLabel: 'Security posture composite', source: 'Platform audit and identity services' },
]

/** ---------------------------------------------------------------------
 * Connectors - every one is declared as not connected to a live system
 * ------------------------------------------------------------------- */

/**
 * The integration register.
 *
 * Every entry names the system on the other side as its operator would name
 * it, and names that operator. Three kinds appear, and the difference between
 * them is the difference between three completely different pieces of work:
 *
 *   - the corporation's OWN departmental systems, which it can direct;
 *   - STATE services, which have to be requested through the department that
 *     owns the relationship;
 *   - NATIONAL services - the meteorological department above all - which are
 *     subscribed to and are identical for every corporation in the country.
 *
 * The corporation's own systems are named from the ACTIVE corporation, so this
 * register reads as Pune's integration estate when Pune is selected and
 * Jalna's when Jalna is. Nothing here claims a live connection to anything.
 */
function build$CONNECTOR_SPECS(): Array<{
  name: string
  type: Connector['type']
  departmentId: string
  domain: IntelligenceDomain
  targetSystem: string
  sourceAuthority: string
  health: Connector['health']
  auth: Connector['authenticationMode']
}> {
  const corp = activeCorporation
  const own = corporationName(corp)
  const shortName = CORPORATION_SHORT_NAME
  // The corporation's published portal, with the scheme stripped: an operator
  // reading an integration register wants the host, not a link.
  // Not every corporation in the roster publishes a portal; where none is
  // recorded the register says so rather than inventing a hostname.
  const portalHost = corp.website
    ? corp.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : t('No portal recorded on the corporation register')
  const state = municipality.state

  return [
  { name: t('Property Tax & Assessment'), type: 'rest', departmentId: 'dept-assessment', domain: 'revenue', targetSystem: t('{0} Assessment & Collection System', shortName), sourceAuthority: own, health: 'adapter-ready', auth: 'mtls' },
  { name: t('Citizen Portal & Online Services'), type: 'rest', departmentId: 'dept-it', domain: 'citizen-services', targetSystem: portalHost, sourceAuthority: own, health: 'adapter-ready', auth: 'oauth2' },
  { name: t('Financial Management System'), type: 'database', departmentId: 'dept-finance', domain: 'budget', targetSystem: t('{0} Financial Management System', shortName), sourceAuthority: own, health: 'adapter-ready', auth: 'mtls' },
  { name: t('Citizen Grievance Platform'), type: 'rest', departmentId: 'dept-commissioner', domain: 'wards', targetSystem: t('{0} Grievance Redressal System', shortName), sourceAuthority: own, health: 'simulation', auth: 'oauth2' },
  { name: t('Hydraulic SCADA Telemetry'), type: 'event-stream', departmentId: 'dept-hydraulic', domain: 'water', targetSystem: t('{0} Hydraulic SCADA', shortName), sourceAuthority: own, health: 'not-connected', auth: 'not-configured' },
  { name: t('Road Asset & Defect Register'), type: 'rest', departmentId: 'dept-roads', domain: 'roads', targetSystem: t('{0} Road Asset Register', shortName), sourceAuthority: own, health: 'adapter-ready', auth: 'api-key-vault' },
  { name: t('Solid Waste Vehicle Tracking'), type: 'websocket', departmentId: 'dept-solid-waste', domain: 'waste', targetSystem: t('{0} SWM Vehicle Tracking', shortName), sourceAuthority: own, health: 'simulation', auth: 'oauth2' },
  { name: t('Municipal GIS Service'), type: 'gis', departmentId: 'dept-planning', domain: 'planning', targetSystem: t('{0} Municipal GIS', shortName), sourceAuthority: own, health: 'not-connected', auth: 'not-configured' },
  { name: t('Hospital Management System'), type: 'rest', departmentId: 'dept-hospitals', domain: 'hospitals', targetSystem: t('{0} Hospital Management System', shortName), sourceAuthority: own, health: 'adapter-ready', auth: 'mtls' },
  { name: t('Disaster Management EOC Log'), type: 'rest', departmentId: 'dept-disaster', domain: 'disaster', targetSystem: t('{0} Emergency Operations Centre', shortName), sourceAuthority: own, health: 'simulation', auth: 'oauth2' },
  // National. The meteorological department issues colour-coded district
  // warnings against the whole country on one scale, so this connector is
  // identical for every corporation - which is exactly why it is named for
  // the department and not for the corporation.
  { name: t('Weather Warnings & Rainfall Observations'), type: 'rest', departmentId: 'dept-disaster', domain: 'monsoon', targetSystem: t('IMD district warning and rainfall service'), sourceAuthority: t('India Meteorological Department'), health: 'adapter-ready', auth: 'api-key-vault' },
  { name: t('State Disaster Alert Relay'), type: 'rest', departmentId: 'dept-disaster', domain: 'disaster', targetSystem: t('State disaster alert dissemination service'), sourceAuthority: t('{0} State Disaster Management Authority', state), health: 'not-connected', auth: 'not-configured' },
  { name: t('Automatic Weather Station Network'), type: 'iot', departmentId: 'dept-disaster', domain: 'monsoon', targetSystem: t('{0} automatic weather station network', shortName), sourceAuthority: own, health: 'not-connected', auth: 'not-configured' },
  { name: t('Storm Water IoT Telemetry'), type: 'iot', departmentId: 'dept-stormwater', domain: 'stormwater', targetSystem: t('{0} dewatering pump telemetry', shortName), sourceAuthority: own, health: 'not-connected', auth: 'not-configured' },
  { name: t('Command Centre Video Analytics'), type: 'event-stream', departmentId: 'dept-it', domain: 'platform', targetSystem: t('{0} command centre video analytics', shortName), sourceAuthority: own, health: 'not-connected', auth: 'not-configured' },
  { name: t('Document Management System'), type: 'document', departmentId: 'dept-it', domain: 'platform', targetSystem: t('{0} Document Management System', shortName), sourceAuthority: own, health: 'adapter-ready', auth: 'oauth2' },
  { name: t('Contract Management System'), type: 'graphql', departmentId: 'dept-procurement', domain: 'procurement', targetSystem: t('{0} Contract Management System', shortName), sourceAuthority: own, health: 'adapter-ready', auth: 'mtls' },
  { name: t('Public Health Surveillance'), type: 'file-transfer', departmentId: 'dept-health', domain: 'health', targetSystem: t('Integrated Disease Surveillance Programme return'), sourceAuthority: t('{0} State Public Health Department', state), health: 'review-required', auth: 'sftp-key' },
  { name: t('Project Management System'), type: 'rest', departmentId: 'dept-projects', domain: 'projects', targetSystem: t('{0} Project Management System', shortName), sourceAuthority: own, health: 'adapter-ready', auth: 'mtls' },
  { name: t('Environment Monitoring Network'), type: 'iot', departmentId: 'dept-environment', domain: 'environment', targetSystem: t('Ambient air and noise monitoring network'), sourceAuthority: t('{0} Pollution Control Board', state), health: 'not-connected', auth: 'not-configured' },
]
}
let CONNECTOR_SPECS: Array<{
  name: string
  type: Connector['type']
  departmentId: string
  domain: IntelligenceDomain
  targetSystem: string
  sourceAuthority: string
  health: Connector['health']
  auth: Connector['authenticationMode']
}> = build$CONNECTOR_SPECS()
registerLayer(() => {
  CONNECTOR_SPECS = build$CONNECTOR_SPECS()
})

/** ---------------------------------------------------------------------
 * Security
 * ------------------------------------------------------------------- */

function build$SECURITY_EVENT_SPECS(): Array<{ type: SecurityEventType; description: string; recommended: string }> {
  return [
  { type: 'failed-authentication', description: t('Repeated failed authentication attempts recorded against a single account within a short window.'), recommended: 'Verify with the account holder and apply a temporary lock if the attempts are unrecognised.' },
  { type: 'restricted-access-attempt', description: t('Access attempt against a restricted-classification record was denied by the permission engine.'), recommended: 'Confirm whether the access requirement is legitimate and, if so, process a formal scope amendment.' },
  { type: 'privilege-escalation-request', description: t('Request submitted for elevation to a role holding a higher classification ceiling.'), recommended: 'Assess the business justification and apply time-bounded elevation if approved.' },
  { type: 'unusual-session', description: t('Session established from a device profile not previously associated with the account.'), recommended: 'Confirm the session with the account holder before taking further action.' },
  { type: 'policy-violation', description: t('An action was attempted that conflicts with an active access policy condition.'), recommended: 'Review whether the policy condition remains correct for the officer\'s current responsibilities.' },
  { type: 'bulk-export', description: t('Export volume materially above the account baseline for the reporting period.'), recommended: 'Verify the institutional purpose of the export and record it against the audit trail.' },
  { type: 'configuration-change', description: t('A platform configuration setting affecting access or classification handling was modified.'), recommended: 'Confirm the change was authorised and recorded against a change reference.' },
  { type: 'integration-auth-failure', description: t('Connector authentication failed against the configured credential material.'), recommended: 'Verify credential validity and rotation status with the owning department.' },
  { type: 'anomalous-query-volume', description: t('Query volume from a single session exceeded the established baseline substantially.'), recommended: 'Assess whether the activity corresponds to a legitimate analytical task.' },
]
}
let SECURITY_EVENT_SPECS: Array<{ type: SecurityEventType; description: string; recommended: string }> = build$SECURITY_EVENT_SPECS()
registerLayer(() => {
  SECURITY_EVENT_SPECS = build$SECURITY_EVENT_SPECS()
})

/**
 * Access policies. Read the same for every corporation - they are properties
 * of the platform's access model, not of any one city - but each carries the
 * active tenant id, so they are rebuilt rather than frozen: a policy stamped
 * with the previous corporation would be filtered out of every access surface.
 */
function accessPolicySpecs(): AccessPolicy[] {
  return [
    {
      id: 'pol-001',
      tenantId: TENANT_ID,
      name: t('Ward-scoped operational access'),
      description: t('Ward officers may act on intelligence, alerts and actions only within their assigned ward.'),
      roleIds: ['ward-officer'],
      resourceTypes: ['intelligence', 'alert', 'action', 'incident', 'ward'],
      actions: ['view', 'create', 'edit', 'assign', 'escalate'],
      conditions: [{ attribute: 'ward', operator: 'in', value: 'principal.scope.wardIds' }],
      maxClassification: 'internal',
      effect: 'allow',
      status: 'active',
      lastReviewedAt: isoDaysFromAnchor(-42),
      ownerId: 'user-security',
    },
    {
      id: 'pol-002',
      tenantId: TENANT_ID,
      name: t('Restricted revenue data limitation'),
      description: t('Restricted-classification revenue and assessment records are available only to finance, audit and executive roles.'),
      roleIds: ['municipal-commissioner', 'finance-officer', 'auditor', 'security-administrator'],
      resourceTypes: ['revenue', 'procurement'],
      actions: ['view', 'export'],
      conditions: [{ attribute: 'classification', operator: '<=', value: 'principal.role.maxClassification' }],
      maxClassification: 'restricted',
      effect: 'allow',
      status: 'active',
      lastReviewedAt: isoDaysFromAnchor(-16),
      ownerId: 'user-security',
    },
    {
      id: 'pol-003',
      tenantId: TENANT_ID,
      name: t('Decision approval authority'),
      description: t('Only designated approving authorities may approve or reject a decision case.'),
      roleIds: ['municipal-commissioner', 'additional-commissioner', 'department-head', 'chief-engineer', 'finance-officer'],
      resourceTypes: ['decision'],
      actions: ['approve'],
      conditions: [{ attribute: 'department', operator: 'in', value: 'principal.scope.departmentIds' }],
      maxClassification: 'confidential',
      effect: 'allow',
      status: 'active',
      lastReviewedAt: isoDaysFromAnchor(-9),
      ownerId: 'user-commissioner',
    },
    {
      id: 'pol-004',
      tenantId: TENANT_ID,
      name: t('Audit read-only separation'),
      description: t('The audit function holds read access across all domains and may never hold write authority over operational records.'),
      roleIds: ['auditor'],
      resourceTypes: ['intelligence', 'decision', 'evidence', 'budget', 'revenue', 'procurement', 'project', 'audit'],
      actions: ['view', 'export'],
      conditions: [{ attribute: 'action', operator: 'not-in', value: 'create,edit,approve,assign,administer' }],
      maxClassification: 'confidential',
      effect: 'allow',
      status: 'active',
      lastReviewedAt: isoDaysFromAnchor(-31),
      ownerId: 'user-security',
    },
    {
      id: 'pol-005',
      tenantId: TENANT_ID,
      name: t('Health data aggregate-only constraint'),
      description: t('Health domain records are restricted to aggregate indicators; no individual-level record may be ingested or surfaced.'),
      roleIds: ['municipal-commissioner', 'health-officer', 'department-head', 'auditor'],
      resourceTypes: ['intelligence', 'evidence'],
      actions: ['view'],
      conditions: [{ attribute: 'granularity', operator: '=', value: 'aggregate' }],
      maxClassification: 'confidential',
      effect: 'allow',
      status: 'active',
      lastReviewedAt: isoDaysFromAnchor(-24),
      ownerId: 'user-security',
    },
    {
      id: 'pol-006',
      tenantId: TENANT_ID,
      name: t('AI high-impact action prohibition'),
      description: t('AI-originated recommendations may never proceed to expenditure, payment, penalty, procurement award or record amendment without explicit human approval.'),
      roleIds: ['ai-governance-officer', 'municipal-commissioner'],
      resourceTypes: ['ai', 'decision'],
      actions: ['approve'],
      conditions: [{ attribute: 'humanConfirmation', operator: '=', value: 'required' }],
      maxClassification: 'confidential',
      effect: 'deny',
      status: 'active',
      lastReviewedAt: isoDaysFromAnchor(-7),
      ownerId: 'user-ai-governance',
    },
    {
      id: 'pol-007',
      tenantId: TENANT_ID,
      name: t('Situation Room command access'),
      description: t('Situation Room command actions are limited to the disaster management cell and the control room during an active operation.'),
      roleIds: ['disaster-management-officer', 'operator', 'municipal-commissioner'],
      resourceTypes: ['situation-room', 'incident'],
      actions: ['view', 'edit', 'create', 'assign', 'escalate'],
      conditions: [{ attribute: 'operationalMode', operator: '=', value: 'active' }],
      maxClassification: 'confidential',
      effect: 'allow',
      status: 'active',
      lastReviewedAt: isoDaysFromAnchor(-12),
      ownerId: 'user-disaster',
    },
    {
      id: 'pol-008',
      tenantId: TENANT_ID,
      name: t('Tenant isolation'),
      description: t('Every data service call is scoped by tenant. Cross-tenant access is denied unconditionally.'),
      roleIds: ['municipal-commissioner', 'security-administrator', 'auditor', 'analyst', 'ward-officer', 'finance-officer', 'health-officer', 'operator', 'chief-engineer', 'department-head', 'deputy-commissioner', 'additional-commissioner', 'disaster-management-officer', 'ai-governance-officer'],
      resourceTypes: ['intelligence', 'decision', 'ward', 'department', 'budget', 'revenue', 'project'],
      actions: ['view', 'create', 'edit', 'approve', 'assign', 'escalate', 'export', 'administer'],
      conditions: [{ attribute: 'tenantId', operator: '=', value: 'principal.tenantId' }],
      maxClassification: 'restricted',
      effect: 'allow',
      status: 'active',
      lastReviewedAt: isoDaysFromAnchor(-5),
      ownerId: 'user-security',
    },
  ]
}

/** ---------------------------------------------------------------------
 * Audit trail
 * ------------------------------------------------------------------- */

const AUDIT_ACTIONS: AuditAction[] = [
  'sign-in',
  'sign-out',
  'view-restricted',
  'view-evidence',
  'create-decision',
  'approve',
  'reject',
  'assign',
  'escalate',
  'export',
  'ai-request',
  'configuration-change',
  'status-change',
  'acknowledge',
  'create-incident',
  'create-action',
  'run-scenario',
  'access-denied',
]

/**
 * The resource classes an audit entry can be raised against. Incident and
 * capital-works references carry the active corporation's own file prefix, so
 * the audit trail reads like that corporation's registry rather than another's.
 */
function auditResourceSpecs(): Array<{ type: string; label: (n: number) => string }> {
  const prefix = referencePrefix()
  return [
    { type: 'Intelligence', label: (n) => `int-${String(n).padStart(4, '0')}` },
    { type: 'Decision Case', label: (n) => `DC-2026-${String(n).padStart(4, '0')}` },
    { type: 'Incident', label: (n) => `${prefix}/INC/2026/${1400 + n}` },
    { type: 'Alert', label: (n) => `alt-${String(n).padStart(4, '0')}` },
    { type: 'Evidence', label: (n) => `ev-${String(n).padStart(4, '0')}` },
    { type: 'Revenue Record', label: (n) => `rev-ward-${n}` },
    { type: 'Budget Line', label: (n) => `bl-${n}` },
    { type: 'Project', label: (n) => `${prefix}/CAP/2026/${4100 + n}` },
    { type: 'AI Request', label: (n) => `air-${String(n).padStart(4, '0')}` },
    { type: 'Access Policy', label: (n) => `pol-${String(n).padStart(3, '0')}` },
  ]
}

/** ---------------------------------------------------------------------
 * Platform health
 * ------------------------------------------------------------------- */

/**
 * Platform components. These describe the software, not the city, so they are
 * identical for every deployment and carry no tenant id - the AI gateway is
 * the same simulated gateway whether it is serving twelve million residents or
 * three hundred thousand.
 */
function build$PLATFORM_SERVICES(): PlatformService[] {
  return [
  { id: 'svc-app', name: t('Application shell and routing'), category: 'application', state: 'operational', availabilityPct: 99.94, p95LatencyMs: 118, errorRatePct: 0.02, simulated: false, note: t('Client application served from the deployment target.') },
  { id: 'svc-intel', name: t('Intelligence engine'), category: 'data-pipeline', state: 'operational', availabilityPct: 99.71, p95LatencyMs: 246, errorRatePct: 0.08, simulated: true, note: t('Runs against local deterministic demonstration data services.') },
  { id: 'svc-ai', name: t('AI gateway'), category: 'ai-gateway', state: 'simulation', availabilityPct: 100, p95LatencyMs: 640, errorRatePct: 0, simulated: true, note: t('MockMunicipalAIProvider. No external model endpoint is contacted.') },
  { id: 'svc-connector', name: t('Connector runtime'), category: 'integration', state: 'simulation', availabilityPct: 100, p95LatencyMs: 92, errorRatePct: 0, simulated: true, note: t('Adapter contracts implemented; no departmental system is contacted.') },
  { id: 'svc-audit', name: t('Audit service'), category: 'storage', state: 'simulation', availabilityPct: 100, p95LatencyMs: 34, errorRatePct: 0, simulated: true, note: t('In-session audit store. A production deployment requires an append-only audit store.') },
  { id: 'svc-events', name: t('Event processing'), category: 'event-processing', state: 'simulation', availabilityPct: 100, p95LatencyMs: 58, errorRatePct: 0, simulated: true, note: t('Event fan-out is simulated locally; no message broker is provisioned.') },
  { id: 'svc-search', name: t('Search and knowledge graph'), category: 'application', state: 'operational', availabilityPct: 99.88, p95LatencyMs: 74, errorRatePct: 0.01, simulated: true, note: t('Graph and search operate over the in-memory demonstration corpus.') },
  { id: 'svc-storage', name: t('Object and document storage'), category: 'storage', state: 'not-connected', availabilityPct: 0, p95LatencyMs: 0, errorRatePct: 0, simulated: true, note: t('No storage backend provisioned in the demonstration environment.') },
]
}
export let PLATFORM_SERVICES: PlatformService[] = build$PLATFORM_SERVICES()
registerLayer(() => {
  PLATFORM_SERVICES = build$PLATFORM_SERVICES()
})

/**
 * Ingestion and computation jobs. The schedules and durations are platform
 * properties, but the volumes each run handles are not: a grievance ingest
 * moving 3,184 records every fifteen minutes is a Brihanmumbai figure, so each
 * job's throughput is scaled on the dimension it actually tracks. The lineage
 * sweep is the exception - it validates one graph per domain, a platform
 * constant, whatever the size of the corporation.
 */
function pipelineJobSpecs(): PipelineJob[] {
  const { population, area, budget } = CITY_SCALE
  return [
    { id: 'job-grievance', name: t('Grievance ingestion and clustering'), schedule: 'Every 15 minutes', lastRunAt: isoFromAnchor(-9), durationSeconds: 42, status: 'succeeded', recordsProcessed: scaledCount(3184, population, 40), failures7d: 0, domain: 'wards' },
    { id: 'job-rainfall', name: t('Rainfall and tide observation ingest'), schedule: 'Every 5 minutes', lastRunAt: isoFromAnchor(-3), durationSeconds: 8, status: 'succeeded', recordsProcessed: scaledCount(216, area, 12), failures7d: 1, domain: 'monsoon' },
    { id: 'job-water', name: t('Water zone reading consolidation'), schedule: 'Hourly', lastRunAt: isoFromAnchor(-38), durationSeconds: 64, status: 'succeeded', recordsProcessed: scaledCount(1240, population, 24), failures7d: 0, domain: 'water' },
    { id: 'job-waste', name: t('Route adherence computation'), schedule: 'Every 30 minutes', lastRunAt: isoFromAnchor(-21), durationSeconds: 96, status: 'succeeded', recordsProcessed: scaledCount(684, area, 18), failures7d: 2, domain: 'waste' },
    { id: 'job-project', name: t('Project risk engine evaluation'), schedule: 'Daily at 02:00', lastRunAt: isoFromAnchor(-440), durationSeconds: 184, status: 'succeeded', recordsProcessed: scaledCount(128, budget, 8), failures7d: 0, domain: 'projects' },
    { id: 'job-finance', name: t('Budget and revenue reconciliation'), schedule: 'Daily at 03:00', lastRunAt: isoFromAnchor(-380), durationSeconds: 312, status: 'succeeded', recordsProcessed: scaledCount(2196, budget, 30), failures7d: 0, domain: 'budget' },
    { id: 'job-health', name: t('Health surveillance aggregation'), schedule: 'Daily at 06:00', lastRunAt: isoFromAnchor(-200), durationSeconds: 58, status: 'succeeded', recordsProcessed: scaledCount(168, population, 10), failures7d: 0, domain: 'health' },
    { id: 'job-correlate', name: t('Cross-domain correlation engine'), schedule: 'Every 2 hours', lastRunAt: isoFromAnchor(-74), durationSeconds: 268, status: 'succeeded', recordsProcessed: scaledCount(412, population, 12), failures7d: 1, domain: 'executive' },
    { id: 'job-lineage', name: t('Lineage validation sweep'), schedule: 'Weekly, Sunday 01:00', lastRunAt: isoFromAnchor(-3800), durationSeconds: 640, status: 'succeeded', recordsProcessed: LINEAGE_DOMAINS.length, failures7d: 0, domain: 'platform' },
    { id: 'job-quality', name: t('Data quality assessment'), schedule: 'Daily at 04:00', lastRunAt: isoFromAnchor(-320), durationSeconds: 148, status: 'failed', recordsProcessed: 0, failures7d: 3, domain: 'platform' },
  ]
}

/** ---------------------------------------------------------------------
 * Live bindings
 * ------------------------------------------------------------------- */

export let DATASETS: Dataset[] = []
export let LINEAGE_GRAPHS: LineageGraph[] = []
export let LINEAGE_BY_ID: Map<string, LineageGraph> = new Map()
export let CONNECTORS: Connector[] = []
export let SECURITY_EVENTS: SecurityEvent[] = []
export let SECURITY_POSTURE: SecurityPosture = emptySecurityPosture()
export let ACCESS_POLICIES: AccessPolicy[] = []
export let AUDIT_EVENTS: AuditEvent[] = []
export let PIPELINE_JOBS: PipelineJob[] = []

/** The audit action vocabulary. A platform constant, not a corporation one. */
export const AUDIT_ACTION_VALUES = AUDIT_ACTIONS

/**
 * The posture shape before the rebuild fills it. It exists only so the exported
 * binding has a value of the right type between module evaluation and the
 * immediate first rebuild; no surface ever renders it.
 */
function emptySecurityPosture(): SecurityPosture {
  return {
    authenticationHealth: 0,
    mfaCoveragePct: 0,
    privilegedAccounts: 0,
    privilegedWithoutMfa: 0,
    suspiciousSessions: 0,
    policyViolations30d: 0,
    securityEvents30d: 0,
    openVulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
    encryptionInTransit: 'operational',
    encryptionAtRest: 'review-required',
    integrationsRequiringReview: 0,
    lastAssessmentAt: isoDaysFromAnchor(-18),
    certificationNote: '',
  }
}

/**
 * Security posture, derived from the principals, events and connectors as they
 * currently stand. Coverage and violation counts move with the corporation
 * because the event volume does; the open-vulnerability position is a property
 * of the software and does not.
 */
function buildSecurityPosture(): SecurityPosture {
  const mfaEnrolled = DEMO_USERS.filter((u) => u.mfaEnrolled).length
  return {
    authenticationHealth: 82,
    mfaCoveragePct: Math.round((mfaEnrolled / Math.max(DEMO_USERS.length, 1)) * 1000) / 10,
    privilegedAccounts: DEMO_USERS.filter((u) =>
      ['municipal-commissioner', 'security-administrator', 'additional-commissioner', 'ai-governance-officer'].includes(u.roleId),
    ).length,
    privilegedWithoutMfa: DEMO_USERS.filter(
      (u) =>
        !u.mfaEnrolled &&
        ['municipal-commissioner', 'security-administrator', 'additional-commissioner', 'ai-governance-officer'].includes(u.roleId),
    ).length,
    suspiciousSessions: SECURITY_EVENTS.filter((e) => e.type === 'unusual-session' && e.status !== 'closed').length,
    policyViolations30d: SECURITY_EVENTS.filter((e) => e.type === 'policy-violation').length,
    securityEvents30d: SECURITY_EVENTS.length,
    openVulnerabilities: { critical: 0, high: 2, medium: 7, low: 14 },
    encryptionInTransit: 'operational',
    encryptionAtRest: 'review-required',
    integrationsRequiringReview: CONNECTORS.filter((c) => c.health === 'review-required' || c.health === 'not-connected').length,
    lastAssessmentAt: isoDaysFromAnchor(-18),
    certificationNote:
      'This is a demonstration environment. No security certification, accreditation or audit attestation is claimed or implied. A formal security assessment is a prerequisite for any production deployment.',
  }
}

registerLayer(() => {
  const scale = CITY_SCALE

  DATASETS = DATASET_SPECS.map((spec) => {
    const r = det(`dataset:${spec.id}`)
    return {
      id: spec.id,
      tenantId: TENANT_ID,
      name: spec.name,
      description: spec.description,
      ownerDepartmentId: spec.ownerDepartmentId,
      ownerOfficerId: `off-head-${spec.ownerDepartmentId}`,
      purpose: spec.purpose,
      classification: spec.classification,
      retentionMonths: spec.retentionMonths,
      sensitivity: spec.sensitivity,
      allowedRoles: spec.allowedRoles,
      sourceSystem: spec.sourceSystem,
      sharingStatus: spec.sharingStatus,
      lineageId: `lin-${spec.domain}`,
      qualityScore: r.int(66, 98),
      // Retention and quality are policy and measurement; the number of rows
      // held is neither, and tracks the population the dataset describes.
      recordCount: scaledCount(r.int(1_800, 4_200_000), scale.population, 400),
      lastRefreshedAt: isoFromAnchor(-r.int(12, 2400)),
      containsPersonalData: spec.containsPersonalData,
      minimisationApplied: spec.minimisation,
      domain: spec.domain,
    }
  })

  LINEAGE_GRAPHS = LINEAGE_DOMAINS.map(({ domain, metricId, metricLabel, source }) => {
    const r = det(`lineage:${domain}`)
    const stages: LineageStage[] = [
      {
        id: `${domain}-source`,
        kind: 'source',
        name: source,
        detail: t('Authoritative departmental system. Remains the system of record; the platform never writes back to it.'),
        owner: DEPARTMENTS.find((d) => d.domain === domain)?.shortName ?? t('Department'),
        state: 'simulation',
        quality: r.int(72, 98),
        transformations: [t('Extract at the agreed cadence'), t('Field-level selection against the approved schema')],
      },
      {
        id: `${domain}-ingestion`,
        kind: 'ingestion',
        name: t('Connector ingestion'),
        detail: t('Adapter transports the extract into the platform staging area with schema and volume checks.'),
        owner: 'IT - Data Services',
        state: 'adapter-ready',
        quality: r.int(80, 99),
        transformations: [t('Schema conformance check'), t('Volume anomaly detection'), t('Minimisation rules applied at the boundary')],
      },
      {
        id: `${domain}-validation`,
        kind: 'validation',
        name: t('Validation and quality assessment'),
        detail: t('Records are validated against domain rules; failures are quarantined rather than silently dropped.'),
        owner: 'IT - Data Services',
        state: 'operational',
        quality: r.int(74, 97),
        transformations: [t('Referential integrity against master data'), t('Range and plausibility checks'), t('Quarantine of failing records with reason codes')],
      },
      {
        id: `${domain}-canonical`,
        kind: 'canonical-entity',
        name: t('Canonical entity mapping'),
        detail: t('Source records are mapped onto the platform domain model with ward and department resolution.'),
        owner: 'BMC Intelligence Core',
        state: 'operational',
        quality: r.int(82, 99),
        transformations: [t('Ward and department resolution'), t('Deduplication on the source record reference'), t('Classification tagging')],
      },
      {
        id: `${domain}-metric`,
        kind: 'derived-metric',
        name: metricLabel,
        detail: t('Derived indicator computed from canonical entities using published weights.'),
        owner: 'BMC Intelligence Core',
        state: 'operational',
        quality: r.int(78, 96),
        transformations: [t('Weighted composite computation'), t('Normalisation to the published scale'), t('Confidence assignment from input completeness')],
      },
      {
        id: `${domain}-engine`,
        kind: 'intelligence-engine',
        name: t('Intelligence engine evaluation'),
        detail: t('Rules, models and correlations evaluate the metric against thresholds and cross-domain conditions.'),
        owner: 'BMC Intelligence Core',
        state: 'operational',
        quality: r.int(70, 94),
        transformations: [t('Threshold evaluation'), t('Cross-domain correlation'), t('Severity and confidence assignment')],
      },
      {
        id: `${domain}-dashboard`,
        kind: 'dashboard',
        name: t('Intelligence surface'),
        detail: t('The metric and any intelligence raised from it are surfaced with provenance and freshness.'),
        owner: 'BMC Intelligence Core',
        state: 'operational',
        quality: 100,
        transformations: [t('Access scope filtering'), t('Classification enforcement'), t('Provenance and freshness annotation')],
      },
      {
        id: `${domain}-decision`,
        kind: 'decision',
        name: t('Decision and accountable action'),
        detail: t('Where a decision case is raised, the chain continues into human decision, action and outcome.'),
        owner: 'Competent authority',
        state: 'operational',
        quality: 100,
        transformations: [t('Decision case creation'), t('Human decision recording'), t('Action assignment and outcome measurement')],
      },
    ]

    return {
      id: `lin-${domain}`,
      tenantId: TENANT_ID,
      metricId,
      metricLabel,
      domain,
      stages,
      classification: 'internal',
      /**
       * Validation age, spread across the three currency bands the Data
       * Lineage page assesses - it treats 60 days as the warning line and 90
       * days as the withholding threshold, so the bands are current (up to 60),
       * approaching (61-90) and beyond threshold (over 90).
       *
       * This used to be a flat 1-30 days, which made every graph current. That
       * is a pleasant picture and a false one: it left the approaching and
       * beyond-threshold counts permanently at zero, the currency filter unable
       * to narrow anything, and the page's central claim - that a metric whose
       * lineage has gone stale is withheld rather than published from an older
       * batch - impossible to see working at all. A revalidation backlog is the
       * normal state of a real data estate, and the platform is more credible
       * showing one than claiming none.
       */
      lastValidatedAt: isoDaysFromAnchor(
        -r.weighted([
          [r.int(3, 55), 64], // current - the healthy majority
          [r.int(63, 88), 24], // approaching the threshold
          [r.int(96, 240), 12], // beyond it - withheld from evidence
        ]),
      ),
    }
  })

  LINEAGE_BY_ID = new Map(LINEAGE_GRAPHS.map((l) => [l.id, l]))

  CONNECTORS = CONNECTOR_SPECS.map((spec, i) => {
    const r = det(`connector:${spec.name}`)
    const connectedish = spec.health === 'simulation' || spec.health === 'adapter-ready'
    return {
      id: `cn-${String(i + 1).padStart(2, '0')}`,
      tenantId: TENANT_ID,
      name: spec.name,
      type: spec.type,
      ownerDepartmentId: spec.departmentId,
      ownerOfficerId: `off-head-${spec.departmentId}`,
      authenticationMode: spec.auth,
      health: spec.health,
      lastSyncAt: connectedish ? isoFromAnchor(-r.int(4, 900)) : undefined,
      latencyMs: connectedish ? r.int(38, 1400) : undefined,
      qualityScore: connectedish ? r.int(64, 98) : undefined,
      environment: 'demonstration',
      classification: 'internal',
      domain: spec.domain,
      targetSystem: spec.targetSystem,
      sourceAuthority: spec.sourceAuthority,
      notes:
        spec.health === 'simulation'
          ? t('Demonstration data service. The adapter contract is implemented; no departmental system is contacted.')
          : spec.health === 'adapter-ready'
            ? t('Adapter contract implemented and tested against the published schema. Awaiting departmental data-sharing agreement and endpoint provisioning.')
            : spec.health === 'review-required'
              ? t('Adapter requires privacy and security review before provisioning, owing to the sensitivity of the source.')
              : t('No adapter provisioned. Integration approach requires departmental agreement before development.'),
    }
  })

  // Security event volume tracks the size of the officer body and the traffic
  // it generates. The floor keeps the security register legible for the
  // smallest corporation rather than leaving the page with three rows.
  const securityEventCount = scaledCount(48, scale.population, 8)

  SECURITY_EVENTS = Array.from({ length: securityEventCount }, (_, i) => {
    const r = det(`secevent:${i}`)
    const spec = SECURITY_EVENT_SPECS[i % SECURITY_EVENT_SPECS.length] as (typeof SECURITY_EVENT_SPECS)[number]
    const user = r.pick(DEMO_USERS)
    const severity = r.weighted([
      ['critical', 1],
      ['high', 3],
      ['medium', 5],
      ['low', 3],
    ] as const)

    return {
      id: `sec-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `SEC-2026-${String(2100 + i)}`,
      type: spec.type,
      severity,
      detectedAt: isoFromAnchor(-r.int(8, 60 * 24 * 21)),
      subjectUserId: user.id,
      subjectUserName: user.name,
      subjectRole: user.roleId,
      sessionId: `sess-${r.int(100000, 999999)}`,
      sourceIpPlaceholder: '••••:••••:••••::•• (not recorded in demonstration)',
      device: r.pick([t('Managed desktop - municipal network'), t('Managed laptop - municipal VPN'), t('Control room terminal'), t('Managed tablet - field')]),
      description: spec.description,
      status: r.weighted([
        ['open', 4],
        ['investigating', 3],
        ['contained', 2],
        ['closed', 3],
        ['false-positive', 2],
      ] as const),
      ownerId: 'user-security',
      relatedPolicyIds: r.sample(['pol-001', 'pol-002', 'pol-003', 'pol-004', 'pol-005'], r.int(1, 2)),
      auditEventIds: [],
      recommendedAction: spec.recommended,
      classification: 'restricted',
    }
  })

  SECURITY_POSTURE = buildSecurityPosture()

  ACCESS_POLICIES = accessPolicySpecs()

  // Audit volume follows the number of officers using the platform and the
  // work they generate, with a floor that keeps the trail worth reading - an
  // audit page showing six entries proves nothing about accountability.
  const auditEventCount = scaledCount(260, scale.population, 20)
  const auditResources = auditResourceSpecs()

  AUDIT_EVENTS = Array.from({ length: auditEventCount }, (_, i): AuditEvent => {
    const r = det(`audit:${i}`)
    const user = r.pick(DEMO_USERS)
    const action = r.weighted([
      ['sign-in', 5],
      ['view-evidence', 8],
      ['view-restricted', 4],
      ['status-change', 6],
      ['assign', 5],
      ['acknowledge', 5],
      ['ai-request', 7],
      ['create-decision', 3],
      ['approve', 3],
      ['escalate', 3],
      ['export', 2],
      ['create-incident', 2],
      ['create-action', 4],
      ['run-scenario', 3],
      ['configuration-change', 1],
      ['access-denied', 2],
      ['reject', 1],
      ['sign-out', 3],
    ] as const satisfies ReadonlyArray<readonly [AuditAction, number]>)
    const resource = r.pick(auditResources)
    const denied = action === 'access-denied'
    // One reference per entry: the identifier and the label must name the same
    // record, or the trail cannot be followed back to what was acted on.
    const reference = resource.label(r.int(1, 60))

    return {
      id: `aud-${String(i + 1).padStart(5, '0')}`,
      tenantId: TENANT_ID,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.roleId,
      action,
      resourceType: resource.type,
      resourceId: reference,
      resourceLabel: `${resource.type} ${reference}`,
      at: isoFromAnchor(-r.int(3, 60 * 24 * 30)),
      reason: ['approve', 'reject', 'escalate', 'export', 'configuration-change'].includes(action)
        ? r.pick([
            t('Recorded against the operational review for the period.'),
            t('Required for the departmental performance assessment.'),
            t('Escalation threshold met under the standing operating procedure.'),
            t('Requested by the competent authority for institutional review.'),
          ])
        : undefined,
      sourceIpPlaceholder: '••••:••••:••••::•• (not recorded in demonstration)',
      sessionId: `sess-${r.int(100000, 999999)}`,
      classification: denied ? 'restricted' : r.weighted([
        ['internal', 6],
        ['confidential', 3],
        ['restricted', 1],
        ['public', 1],
      ] as const),
      outcome: denied ? 'denied' : 'success',
      detail: denied
        ? t('Access denied by the permission engine. The classification of the requested record exceeds the principal ceiling.')
        : undefined,
    }
  }).sort((a, b) => (a.at < b.at ? 1 : -1))

  PIPELINE_JOBS = pipelineJobSpecs()
})

/** Wards and departments are re-exported for governance surfaces. */
export { WARDS, DEPARTMENTS }
