import { COORDINATION_PROJECTS, COORDINATION_TASKS, INFRA_COORDINATION_POSITION } from '@/data/infra-coordination.data'
import { filterByScope } from '@/security/access'
import type { CoordinationProject, CoordinationTask, InfraCoordinationPosition } from '@/types/infra-coordination'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/infra-coordination.service.ts
 *
 * Agency-led capital works and the Corporation's interface obligations to
 * them. Distinct from `projectService`, which tracks the Corporation's own
 * capital delivery - this register never carries a physical-progress figure
 * for a corridor the Corporation does not build.
 */

async function projects(user: User | null): Promise<CoordinationProject[]> {
  await simulateLatency('infra-coordination.projects')
  const scoped = scopeToTenant(user, COORDINATION_PROJECTS)
  const visible = filterByScope(user, scoped, (p) => ({ wardIds: p.corridorWardIds, domain: 'projects' }), 'project')
  return deepClone(visible)
}

async function tasks(user: User | null, projectId?: string): Promise<CoordinationTask[]> {
  await simulateLatency(`infra-coordination.tasks:${projectId ?? 'all'}`)
  const scoped = scopeToTenant(user, COORDINATION_TASKS)
  const visible = filterByScope(
    user,
    scoped,
    (task) => ({ wardIds: [task.wardId], domain: 'projects', departmentId: task.departmentId }),
    'project',
  )
  const filtered = projectId ? visible.filter((task) => task.projectId === projectId) : visible
  return deepClone(filtered)
}

async function position(user: User | null): Promise<InfraCoordinationPosition> {
  await simulateLatency('infra-coordination.position')
  assertAccess(user, 'project', 'view', { domain: 'projects' }, {
    resourceType: 'InfraCoordinationPosition',
    resourceId: 'position',
    resourceLabel: 'Infrastructure coordination position',
  })
  return deepClone(INFRA_COORDINATION_POSITION)
}

export const infraCoordinationService = {
  projects,
  tasks,
  position,
}
