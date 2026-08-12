import { CONTRACTS, PROJECT_BY_ID, PROJECTS, projectsAtRisk, wardProjects } from '@/data/finance.data'
import { filterByScope } from '@/security/access'
import type { AccessContext } from '@/security/model'
import type { IntelligenceDomain, Paged } from '@/types/common'
import type { Contract, Project, ProjectCategory, ProjectStatus, RiskDriver } from '@/types/finance'
import type { User } from '@/types/organisation'
import { ServiceError, assertAccess, deepClone, paginate, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/project.service.ts
 *
 * Capital project delivery intelligence - the explainable project risk
 * engine's published output (`src/data/finance.data.ts`). Read-only: no
 * required method here mutates a project; project status advances through
 * the source system of record, not through this demonstration layer.
 */

export interface ProjectFilters {
  category?: ProjectCategory[]
  status?: ProjectStatus[]
  departmentId?: string
  wardId?: string
  search?: string
  page?: number
  pageSize?: number
}

/** Projects do not carry an `IntelligenceDomain` field directly; this maps
 * `ProjectCategory` onto the nearest domain so ward-officer / department
 * head domain scoping still applies to project visibility. */
const PROJECT_CATEGORY_DOMAIN: Record<ProjectCategory, IntelligenceDomain> = {
  roads: 'roads',
  stormwater: 'stormwater',
  'water-supply': 'water',
  sewerage: 'sewerage',
  health: 'health',
  education: 'buildings',
  'solid-waste': 'waste',
  coastal: 'coastal',
  buildings: 'buildings',
  mobility: 'mobility',
  environment: 'environment',
}

function contextFor(project: Project): AccessContext {
  return {
    wardIds: project.wardIds,
    departmentId: project.departmentId,
    domain: PROJECT_CATEGORY_DOMAIN[project.category],
    classification: project.classification,
  }
}

function meta(project: Project): { resourceType: string; resourceId: string; resourceLabel: string } {
  return { resourceType: 'Project', resourceId: project.id, resourceLabel: project.name }
}

function requireProject(user: User | null, id: string): Project {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const project = PROJECT_BY_ID.get(id)
  if (!project || project.tenantId !== user.tenantId) {
    throw new ServiceError('not-found', `Project "${id}" was not found.`)
  }
  assertAccess(user, 'project', 'view', contextFor(project), meta(project))
  return project
}

function matchesFilters(project: Project, filters: ProjectFilters): boolean {
  if (filters.category && filters.category.length > 0 && !filters.category.includes(project.category)) return false
  if (filters.status && filters.status.length > 0 && !filters.status.includes(project.status)) return false
  if (filters.departmentId && project.departmentId !== filters.departmentId) return false
  if (filters.wardId && !project.wardIds.includes(filters.wardId)) return false
  if (filters.search) {
    const q = filters.search.toLowerCase()
    if (!project.name.toLowerCase().includes(q) && !project.description.toLowerCase().includes(q)) return false
  }
  return true
}

async function list(user: User | null, filters: ProjectFilters = {}): Promise<Paged<Project>> {
  await simulateLatency(`project.list:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, PROJECTS)
  const visible = filterByScope(user, scoped, contextFor, 'project')
  const filtered = visible.filter((p) => matchesFilters(p, filters))
  const sorted = [...filtered].sort((a, b) => b.riskScore - a.riskScore)
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 20)
  return { ...page, items: deepClone(page.items) }
}

async function get(user: User | null, id: string): Promise<Project> {
  await simulateLatency(`project.get:${id}`)
  return deepClone(requireProject(user, id))
}

async function atRisk(user: User | null, threshold = 60): Promise<Project[]> {
  await simulateLatency(`project.atRisk:${threshold}`)
  const scoped = scopeToTenant(user, projectsAtRisk(threshold))
  const visible = filterByScope(user, scoped, contextFor, 'project')
  return deepClone(visible)
}

async function riskDrivers(user: User | null, id: string): Promise<RiskDriver[]> {
  await simulateLatency(`project.riskDrivers:${id}`)
  const project = requireProject(user, id)
  return deepClone(project.riskDrivers)
}

async function byWard(user: User | null, wardId: string): Promise<Project[]> {
  await simulateLatency(`project.byWard:${wardId}`)
  const scoped = scopeToTenant(user, wardProjects(wardId))
  const visible = filterByScope(user, scoped, contextFor, 'project')
  return deepClone(visible)
}

async function contracts(user: User | null, projectId: string): Promise<Contract[]> {
  await simulateLatency(`project.contracts:${projectId}`)
  requireProject(user, projectId)
  const scoped = scopeToTenant(user, CONTRACTS.filter((c) => c.projectId === projectId))
  const visible = filterByScope(
    user,
    scoped,
    (c) => ({ wardIds: c.wardIds, departmentId: c.departmentId, domain: 'procurement', classification: c.classification }),
    'procurement',
  )
  return deepClone(visible)
}

export const projectService = {
  list,
  get,
  atRisk,
  riskDrivers,
  byWard,
  contracts,
}
