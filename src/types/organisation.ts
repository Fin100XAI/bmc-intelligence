import type {
  DataClassification,
  GeoPoint,
  IntelligenceDomain,
  IsoDateTime,
  OperationalState,
  TenantId,
  Trend,
} from './common'

/**
 * Administrative structures. Named generically ("administrative unit") so the
 * same core supports other urban local bodies with different terminology.
 */

/** BMC administrative zone grouping several wards. */
export interface Zone {
  id: string
  tenantId: TenantId
  name: string
  code: string
  wardIds: string[]
  /** Deputy Municipal Commissioner responsible for the zone. */
  officerId: string
}

export interface Ward {
  id: string
  tenantId: TenantId
  /** The corporation's own ward code, e.g. "K/W" for Brihanmumbai. */
  code: string
  name: string
  zoneId: string
  /**
   * The corporation's own grouping label for this ward. Brihanmumbai uses
   * "City" / "Western Suburbs" / "Eastern Suburbs"; other corporations use the
   * compass bands their geography is divided into. Deliberately open: a fixed
   * union here would be a Mumbai-shaped hole in a deployment-neutral core.
   */
  region: string
  population: number
  areaSqKm: number
  households: number
  /** Illustrative centroid - not an official surveyed coordinate. */
  centroid: GeoPoint
  /** Illustrative polygon in normalised 0–100 map space. */
  polygon: Array<[number, number]>
  wardOfficerId: string
  /** Composite 0–100 operational health index. Higher is better. */
  healthScore: number
  /** Composite 0–100 risk index. Higher is worse. */
  riskScore: number
  healthTrend: Trend
  state: OperationalState
  /** Coastal / low-lying exposure flag used by monsoon intelligence. */
  floodProne: boolean
  /** Number of chronic waterlogging locations recorded in the ward. */
  waterloggingSpots: number
}

export interface Department {
  id: string
  tenantId: TenantId
  name: string
  shortName: string
  /** Primary intelligence domain this department owns. */
  domain: IntelligenceDomain
  headOfficerId: string
  staffCount: number
  /** Annual budget allocation in INR crore. */
  budgetCrore: number
  state: OperationalState
  description: string
}

/** Institutional roles. Determines default scope, landing page and actions. */
export type RoleId =
  | 'municipal-commissioner'
  | 'additional-commissioner'
  | 'deputy-commissioner'
  | 'ward-officer'
  | 'department-head'
  | 'chief-engineer'
  | 'finance-officer'
  | 'disaster-management-officer'
  | 'health-officer'
  | 'analyst'
  | 'operator'
  | 'auditor'
  | 'security-administrator'
  | 'ai-governance-officer'
  /**
   * An elected member of the Corporation. Not an officer: a corporator holds
   * no administrative authority at all and cannot act on a municipal record.
   * What they hold is the right to see their own ward and the matters before
   * the house they sit in.
   */
  | 'corporator'

export interface Role {
  id: RoleId
  name: string
  /** Short institutional description shown in access governance. */
  description: string
  /** Seniority band - used only for presentation ordering. */
  band: 'executive' | 'senior' | 'operational' | 'oversight'
  /** Maximum classification this role may read. */
  maxClassification: DataClassification
  /** Route the role lands on after authentication. */
  landingRoute: string
  permissionIds: string[]
}

/** Scope of data a principal may see - the ABAC attribute set. */
export interface AccessScope {
  /** '*' denotes city-wide authority. */
  wardIds: string[] | '*'
  departmentIds: string[] | '*'
  domains: IntelligenceDomain[] | '*'
}

export interface Officer {
  id: string
  tenantId: TenantId
  name: string
  designation: string
  departmentId: string
  wardId?: string
  email: string
  phoneMasked: string
  employeeCode: string
}

/** An authenticated principal in the demonstration environment. */
export interface User {
  id: string
  tenantId: TenantId
  name: string
  designation: string
  roleId: RoleId
  departmentId: string
  /** Home ward for ward-scoped principals. */
  wardId?: string
  /**
   * The officer in the corporation's staff directory (`OFFICERS` in
   * `src/data/reference.ts`) that this principal IS.
   *
   * Operational records name their owner by staff-directory identifier, not by
   * sign-in identifier - a work item belongs to the Ward Officer of P/N, not to
   * a login. Where a demonstration profile stands for one of those directory
   * officers, this states which, so "my tasks", "my incidents" and every other
   * first-person surface resolves to the work that officer actually holds.
   * Undefined for principals with no counterpart in the directory.
   */
  officerId?: string
  email: string
  employeeCode: string
  scope: AccessScope
  /** Demonstration MFA posture, surfaced in the Security Command Centre. */
  mfaEnrolled: boolean
  lastSignInAt: IsoDateTime
  status: 'active' | 'suspended' | 'review-required'
  avatarInitials: string
}

/** Active demonstration session. No real credential material is held. */
export interface Session {
  id: string
  userId: string
  tenantId: TenantId
  startedAt: IsoDateTime
  expiresAt: IsoDateTime
  /** Placeholder only - the demonstration environment records no real IP. */
  sourceIpPlaceholder: string
  device: string
  mfaSatisfied: boolean
}
