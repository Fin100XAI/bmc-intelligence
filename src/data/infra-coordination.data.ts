import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import {
  COORDINATION_TASK_TYPE_LABEL,
  type CoordinationProject,
  type CoordinationProjectStatus,
  type CoordinationTask,
  type CoordinationTaskStatus,
  type CoordinationTaskType,
  type InfraCoordinationPosition,
  type LeadAgency,
} from '@/types/infra-coordination'
import { DEMO_NOW, det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS } from './reference'
import { CITY_SCALE, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/infra-coordination.data.ts
 *
 * Real, named projects are shown only for the Brihanmumbai deployment - the
 * Aqua Line, the Coastal Road north extension, the Atal Setu and the
 * corridors under CMRS inspection as of 2026 are Mumbai's own, reported
 * facts, and naming them for a different corporation would be exactly the
 * kind of error `src/data/naming.ts` exists to prevent. Every other
 * corporation instead sees a generic, clearly-labelled agency-led corridor
 * template - the deployment-neutral shape every other data layer in this
 * platform already follows.
 *
 * The task register beneath both is grounded in a real 2025-26 point of
 * friction: the Corporation's own Commissioner held a state road agency to
 * account for road cavities and sewer damage from reinstatement finished
 * below the Corporation's own standard. That is modelled here as the
 * `disputed` task status - not a reproduction of the actual exchange, which
 * this demonstration environment does not hold.
 */

export let COORDINATION_PROJECTS: CoordinationProject[] = []
export let COORDINATION_TASKS: CoordinationTask[] = []
export let INFRA_COORDINATION_POSITION: InfraCoordinationPosition = {
  projectsActive: 0,
  tasksOpen: 0,
  tasksOverdue: 0,
  disputedTasks: 0,
}

interface ProjectSpec {
  name: string
  leadAgency: LeadAgency
  status: CoordinationProjectStatus
  description: string
  notes: string
  wardShare: number
}

function build$BMC_PROJECT_SPECS(): ProjectSpec[] {
  return [
    {
      name: t('Mumbai Metro Line 3 (Aqua Line)'),
      leadAgency: 'mmrc',
      status: 'operational',
      description: t('Underground metro corridor, Cuffe Parade to Aarey, brought fully into service across 2025.'),
      notes: t('Fully operational. Residual obligation is utility-corridor handback along the alignment.'),
      wardShare: 0.28,
    },
    {
      name: t('Mumbai Metro Line 9 (Red Line extension to Bhayandar)'),
      leadAgency: 'mmrda',
      status: 'commissioning',
      description: t('Elevated metro extension currently under Commissioner of Metro Railway Safety inspection ahead of passenger service.'),
      notes: t('Pre-commissioning. Road reinstatement along the corridor is the Corporation’s live obligation.'),
      wardShare: 0.12,
    },
    {
      name: t('Mumbai Metro Line 2B (Yellow Line, DN Nagar - Mankhurd)'),
      leadAgency: 'mmrda',
      status: 'commissioning',
      description: t('Elevated metro corridor under safety inspection ahead of passenger service.'),
      notes: t('Pre-commissioning. Storm-water drain diversions along the corridor remain open.'),
      wardShare: 0.14,
    },
    {
      name: t('Mumbai Metro Line 5/12 (Orange Line)'),
      leadAgency: 'mmrda',
      status: 'under-construction',
      description: t('Elevated metro corridor under construction, targeted for completion in phases.'),
      notes: t('Under construction. Utility shifting and NOC issuance are the Corporation’s current obligations.'),
      wardShare: 0.1,
    },
    {
      name: t('Coastal Road North Extension (Versova - Dahisar - Bhayandar)'),
      leadAgency: 'msrdc',
      status: 'under-construction',
      description: t('26.3 km coastal highway extension; the Corporation executes the corridor to Worli, the state agency the remainder.'),
      notes: t('Cleared its final mangrove-authority permit and is now in heavy construction, with a staggered opening expected in phases.'),
      wardShare: 0.22,
    },
    {
      name: t('Mumbai Trans Harbour Link (Atal Setu)'),
      leadAgency: 'mmrda',
      status: 'operational',
      description: t('22 km sea link connecting Sewri to Navi Mumbai, opened to the public in January 2024.'),
      notes: t('Fully operational. Residual obligation is approach-road maintenance handback on the Sewri side.'),
      wardShare: 0.06,
    },
  ]
}

function build$GENERIC_PROJECT_SPECS(): ProjectSpec[] {
  return [
    {
      name: t('Metro Corridor Extension'),
      leadAgency: 'state-infrastructure-agency',
      status: 'under-construction',
      description: t('State-executed metro or mass-transit corridor passing through the Corporation’s limits.'),
      notes: t('Under construction. Utility shifting and road reinstatement are the Corporation’s current obligations.'),
      wardShare: 0.18,
    },
    {
      name: t('Ring Road Bypass'),
      leadAgency: 'state-infrastructure-agency',
      status: 'under-construction',
      description: t('State highway bypass corridor requiring land handover and drainage diversion within municipal limits.'),
      notes: t('Under construction. Storm-water drain diversion is the Corporation’s live obligation.'),
      wardShare: 0.16,
    },
    {
      name: t('Rail Corridor Doubling'),
      leadAgency: 'railways',
      status: 'planned',
      description: t('Railway line-doubling project affecting level crossings and utility corridors within municipal limits.'),
      notes: t('Planning stage. NOC issuance is the Corporation’s current obligation.'),
      wardShare: 0.1,
    },
  ]
}
let BMC_PROJECT_SPECS: ProjectSpec[] = build$BMC_PROJECT_SPECS()
let GENERIC_PROJECT_SPECS: ProjectSpec[] = build$GENERIC_PROJECT_SPECS()
registerLayer(() => {
  BMC_PROJECT_SPECS = build$BMC_PROJECT_SPECS()
  GENERIC_PROJECT_SPECS = build$GENERIC_PROJECT_SPECS()
})

const TASK_TYPES: CoordinationTaskType[] = [
  'utility-shifting', 'road-reinstatement', 'storm-water-diversion', 'noc-issuance', 'land-handover', 'tree-mangrove-noc',
]

const TASK_DEPARTMENT: Record<CoordinationTaskType, string> = {
  'utility-shifting': 'dept-hydraulic',
  'road-reinstatement': 'dept-roads',
  'storm-water-diversion': 'dept-stormwater',
  'noc-issuance': 'dept-planning',
  'land-handover': 'dept-estates',
  'tree-mangrove-noc': 'dept-gardens',
}

registerLayer(() => {
  const scale = CITY_SCALE
  const specs = activeCorporation.id === 'bmc' ? BMC_PROJECT_SPECS : GENERIC_PROJECT_SPECS

  COORDINATION_PROJECTS = specs.map((spec, i) => {
    const r = det(`coordproject:${i}`)
    const wardCount = Math.max(1, Math.round(WARDS.length * spec.wardShare))
    return {
      id: `cop-${String(i + 1).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      name: spec.name,
      leadAgency: spec.leadAgency,
      status: spec.status,
      corridorWardIds: r.sample(WARDS, wardCount).map((w) => w.id),
      description: spec.description,
      notes: spec.notes,
      expectedCompletion: spec.status === 'operational' ? undefined : isoDaysFromAnchor(r.int(60, 720)),
    }
  })

  const tasksPerProject = scaledCount(6, scale.population, 3)
  COORDINATION_TASKS = COORDINATION_PROJECTS.flatMap((project, pi) =>
    Array.from({ length: tasksPerProject }, (_, i) => {
      const r = det(`coordtask:${project.id}:${i}`)
      const taskType = TASK_TYPES[(pi + i) % TASK_TYPES.length]!
      const ward = r.pick(project.corridorWardIds.length > 0 ? project.corridorWardIds.map((id) => WARDS.find((w) => w.id === id) ?? WARDS[0]!) : WARDS)
      const status = (project.status === 'operational'
        ? r.weighted([['completed', 8], ['pending', 1]] as const)
        : r.weighted([['pending', 3], ['in-progress', 4], ['completed', 4], ['disputed', 1]] as const)) as CoordinationTaskStatus

      return {
        id: `cot-${project.id}-${String(i + 1).padStart(2, '0')}`,
        tenantId: TENANT_ID,
        projectId: project.id,
        taskType,
        wardId: ward.id,
        departmentId: TASK_DEPARTMENT[taskType],
        status,
        dueAt: status === 'pending' || status === 'in-progress' ? isoDaysFromAnchor(r.int(-10, 90)) : undefined,
        note: status === 'disputed' && taskType === 'road-reinstatement'
          ? t('Reinstatement completed by the executing agency but found below the Corporation’s road and drainage standard; handback withheld pending rectification.')
          : t('{0} for the {1} corridor, tracked against the executing agency’s own works schedule.', COORDINATION_TASK_TYPE_LABEL[taskType], project.name),
      }
    }),
  )

  const activeProjects = COORDINATION_PROJECTS.filter((p) => p.status !== 'operational')
  const openTasks = COORDINATION_TASKS.filter((task) => task.status === 'pending' || task.status === 'in-progress')
  const overdueTasks = openTasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < DEMO_NOW.getTime())

  INFRA_COORDINATION_POSITION = {
    projectsActive: activeProjects.length,
    tasksOpen: openTasks.length,
    tasksOverdue: overdueTasks.length,
    disputedTasks: COORDINATION_TASKS.filter((task) => task.status === 'disputed').length,
  }
})
