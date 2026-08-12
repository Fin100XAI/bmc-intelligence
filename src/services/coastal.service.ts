import { activeCorporation, hasCoastalJurisdiction } from '@/config/municipality.config'
import { COASTAL_SEGMENTS } from '@/data/social.data'
import { BUILDING_PROPOSALS, BUILDING_RECORDS, PLANNING_INDICATORS } from '@/data/social.data'
import { WORKFORCE_UNITS } from '@/data/operations.data'
import { filterByScope } from '@/security/access'
import type {
  BuildingProposal,
  BuildingRecord,
  CoastalSegment,
  PlanningIndicator,
} from '@/types/city-domains'
import type { WorkforceUnit } from '@/types/operations'
import type { User } from '@/types/organisation'
import { DEMO_NOW } from '@/utils/deterministic'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/coastal.service.ts
 *
 * Coastal, building-control, urban-planning and workforce reads.
 *
 * These four domains share a service because each is a small read-only
 * surface over reference data with no workflow of its own. Every method
 * scopes by tenant first, then filters through the permission engine using
 * the domain closest to what it actually returns, so `AccessScope.domains`
 * partitions correctly.
 */

/** ---------------------------------------------------------------------
 * Coastal
 * ------------------------------------------------------------------- */

/**
 * Twenty-three of the twenty-nine municipal corporations in Maharashtra are
 * landlocked - Nagpur, Nashik, Solapur, Amravati and the rest hold no sea
 * shoreline and no tidal creek frontage. Coastal zone management is therefore
 * not a domain those corporations run, and `enabledModules` omits it for them
 * (`buildMunicipalityConfig`).
 *
 * The reads below return an empty result for such a corporation rather than
 * shoreline segments or mangrove cover it does not have. They return rather
 * than throw deliberately: the honest answer to "how much of your coast is
 * unprotected" for a landlocked city is "none is recorded, because there is no
 * coast", and that is an empty register - not a fault. A thrown error would
 * render as a broken screen and would read as a platform defect rather than as
 * a statement about the corporation.
 */
function coastalDomainApplies(): boolean {
  return hasCoastalJurisdiction(activeCorporation)
}

async function segments(user: User | null, wardId?: string): Promise<CoastalSegment[]> {
  await simulateLatency(`coastal.segments:${wardId ?? 'all'}`)
  if (!coastalDomainApplies()) return []
  const base = wardId ? COASTAL_SEGMENTS.filter((s) => s.wardIds.includes(wardId)) : COASTAL_SEGMENTS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (s) => ({ wardIds: s.wardIds, domain: 'coastal' }), 'ward')
  return deepClone(visible)
}

async function coastalSummary(user: User | null): Promise<{
  totalLengthKm: number
  protectedKm: number
  unprotectedSegments: number
  meanVulnerability: number
  mangroveCoverHa: number
  inundationExposureHa: number
  segmentsRequiringSurvey: number
}> {
  const visible = await segments(user)
  // Zero on every measure, reached either because the corporation is landlocked
  // and `segments` returned nothing, or because the principal's scope contains
  // no coastal ward. Both are honestly "nothing to report", and neither is a
  // divide-by-zero the mean below could survive.
  if (visible.length === 0) {
    return {
      totalLengthKm: 0,
      protectedKm: 0,
      unprotectedSegments: 0,
      meanVulnerability: 0,
      mangroveCoverHa: 0,
      inundationExposureHa: 0,
      segmentsRequiringSurvey: 0,
    }
  }
  const round = (n: number): number => Math.round(n * 10) / 10
  // A survey older than two years is treated as requiring re-survey, measured
  // against the single demonstration anchor in `@/utils/deterministic` - the
  // one place the environment's clock is allowed to be defined.
  const twoYearsMs = 730 * 24 * 60 * 60 * 1000
  const anchor = DEMO_NOW.getTime()

  return {
    totalLengthKm: round(visible.reduce((s, x) => s + x.lengthKm, 0)),
    protectedKm: round(
      visible.filter((x) => x.protectionStatus === 'protected').reduce((s, x) => s + x.lengthKm, 0),
    ),
    unprotectedSegments: visible.filter((x) => x.protectionStatus === 'unprotected').length,
    meanVulnerability: Math.round(visible.reduce((s, x) => s + x.vulnerabilityIndex, 0) / visible.length),
    mangroveCoverHa: round(visible.reduce((s, x) => s + x.mangroveCoverHa, 0)),
    inundationExposureHa: round(visible.reduce((s, x) => s + x.inundationExposureHa, 0)),
    segmentsRequiringSurvey: visible.filter((x) => anchor - new Date(x.lastSurveyedAt).getTime() > twoYearsMs).length,
  }
}

/** ---------------------------------------------------------------------
 * Buildings & development control
 * ------------------------------------------------------------------- */

async function buildings(user: User | null, wardId?: string): Promise<BuildingRecord[]> {
  await simulateLatency(`coastal.buildings:${wardId ?? 'all'}`)
  const base = wardId ? BUILDING_RECORDS.filter((b) => b.wardId === wardId) : BUILDING_RECORDS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (b) => ({ wardId: b.wardId, domain: 'buildings' }), 'ward')
  return deepClone(visible)
}

async function proposals(user: User | null, wardId?: string): Promise<BuildingProposal[]> {
  await simulateLatency(`coastal.proposals:${wardId ?? 'all'}`)
  const base = wardId ? BUILDING_PROPOSALS.filter((p) => p.wardId === wardId) : BUILDING_PROPOSALS
  const visible = filterByScope(user, base, (p) => ({ wardId: p.wardId, domain: 'buildings' }), 'ward')
  return deepClone(visible)
}

/** ---------------------------------------------------------------------
 * Urban planning
 * ------------------------------------------------------------------- */

async function planningIndicators(user: User | null, wardId?: string): Promise<PlanningIndicator[]> {
  await simulateLatency(`coastal.planning:${wardId ?? 'all'}`)
  const base = wardId ? PLANNING_INDICATORS.filter((p) => p.wardId === wardId) : PLANNING_INDICATORS
  const visible = filterByScope(user, base, (p) => ({ wardId: p.wardId, domain: 'planning' }), 'ward')
  return deepClone(visible)
}

/** ---------------------------------------------------------------------
 * Workforce
 * ------------------------------------------------------------------- */

async function workforce(user: User | null, departmentId?: string): Promise<WorkforceUnit[]> {
  await simulateLatency(`coastal.workforce:${departmentId ?? 'all'}`)
  const base = departmentId ? WORKFORCE_UNITS.filter((w) => w.departmentId === departmentId) : WORKFORCE_UNITS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(
    user,
    scoped,
    (w) => ({ departmentId: w.departmentId, wardId: w.wardId, domain: 'workforce' }),
    'ward',
  )
  return deepClone(visible)
}

export const coastalService = {
  segments,
  coastalSummary,
  buildings,
  proposals,
  planningIndicators,
  workforce,
}

/** Kept as a separate named export so pages can import either shape. */
export const buildingService = { buildings, proposals }
export const planningService = { indicators: planningIndicators }
export const workforceService = { units: workforce }
