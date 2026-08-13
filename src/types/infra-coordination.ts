import type { IsoDateTime, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/infra-coordination.ts
 *
 * Capital works the Corporation does not itself build but must live beside
 * and answer for - metro corridors, coastal highways and sea links delivered
 * by a state infrastructure agency, running through the Corporation's own
 * streets, drains and utility corridors.
 *
 * Project Intelligence (`src/types/governance.ts`) tracks the Corporation's
 * own capital works end to end; nothing in the platform previously held the
 * Corporation's INTERFACE obligations to a project it does not control - the
 * utility shifting, road reinstatement and NOC issuance a state agency's
 * timeline depends on, and that the Corporation is accountable for at street
 * level regardless of who is building above it. A real, reported point of
 * friction grounds the task model: in 2025-26 the Corporation's own
 * Commissioner held a state road agency to account for road cavities and
 * sewer damage from reinstatement work finished below the Corporation's own
 * standard - the kind of disputed handback this register exists to carry.
 */

export type LeadAgency = 'mmrda' | 'mmrc' | 'msrdc' | 'railways' | 'state-infrastructure-agency' | 'corporation'

function build$LEAD_AGENCY_LABEL(): Record<LeadAgency, string> {
  return {
  mmrda: t('Mumbai Metropolitan Region Development Authority'),
  mmrc: t('Mumbai Metro Rail Corporation'),
  msrdc: t('Maharashtra State Road Development Corporation'),
  railways: t('Indian Railways'),
  'state-infrastructure-agency': t('State Infrastructure Agency'),
  corporation: t('Corporation (own execution)'),
}
}
export let LEAD_AGENCY_LABEL: Record<LeadAgency, string> = build$LEAD_AGENCY_LABEL()
registerLayer(() => {
  LEAD_AGENCY_LABEL = build$LEAD_AGENCY_LABEL()
})

export type CoordinationProjectStatus = 'planned' | 'under-construction' | 'commissioning' | 'operational'

function build$COORDINATION_PROJECT_STATUS_LABEL(): Record<CoordinationProjectStatus, string> {
  return {
  planned: t('Planned'),
  'under-construction': t('Under Construction'),
  commissioning: t('Commissioning / Safety Inspection'),
  operational: t('Operational'),
}
}
export let COORDINATION_PROJECT_STATUS_LABEL: Record<CoordinationProjectStatus, string> = build$COORDINATION_PROJECT_STATUS_LABEL()
registerLayer(() => {
  COORDINATION_PROJECT_STATUS_LABEL = build$COORDINATION_PROJECT_STATUS_LABEL()
})

/**
 * An agency-led capital work the Corporation coordinates with rather than
 * executes. `notes` carries a plain-language status statement rather than a
 * completion percentage - a corridor operated by another agency is not the
 * Corporation's progress to measure.
 */
export interface CoordinationProject {
  id: string
  tenantId: TenantId
  name: string
  leadAgency: LeadAgency
  status: CoordinationProjectStatus
  corridorWardIds: string[]
  description: string
  notes: string
  expectedCompletion?: IsoDateTime
}

export type CoordinationTaskType =
  | 'utility-shifting'
  | 'road-reinstatement'
  | 'storm-water-diversion'
  | 'noc-issuance'
  | 'land-handover'
  | 'tree-mangrove-noc'

function build$COORDINATION_TASK_TYPE_LABEL(): Record<CoordinationTaskType, string> {
  return {
  'utility-shifting': t('Utility Shifting'),
  'road-reinstatement': t('Road Reinstatement'),
  'storm-water-diversion': t('Storm Water Drain Diversion'),
  'noc-issuance': t('NOC Issuance'),
  'land-handover': t('Land Handover'),
  'tree-mangrove-noc': t('Tree / Mangrove NOC'),
}
}
export let COORDINATION_TASK_TYPE_LABEL: Record<CoordinationTaskType, string> = build$COORDINATION_TASK_TYPE_LABEL()
registerLayer(() => {
  COORDINATION_TASK_TYPE_LABEL = build$COORDINATION_TASK_TYPE_LABEL()
})

export type CoordinationTaskStatus = 'pending' | 'in-progress' | 'completed' | 'disputed'

function build$COORDINATION_TASK_STATUS_LABEL(): Record<CoordinationTaskStatus, string> {
  return {
  pending: t('Pending'),
  'in-progress': t('In Progress'),
  completed: t('Completed'),
  disputed: t('Disputed - Standard Not Accepted'),
}
}
export let COORDINATION_TASK_STATUS_LABEL: Record<CoordinationTaskStatus, string> = build$COORDINATION_TASK_STATUS_LABEL()
registerLayer(() => {
  COORDINATION_TASK_STATUS_LABEL = build$COORDINATION_TASK_STATUS_LABEL()
})

/** One obligation the Corporation owes to, or holds against, an agency-led project. */
export interface CoordinationTask {
  id: string
  tenantId: TenantId
  projectId: string
  taskType: CoordinationTaskType
  wardId: string
  departmentId: string
  status: CoordinationTaskStatus
  dueAt?: IsoDateTime
  note: string
}

export interface InfraCoordinationPosition {
  projectsActive: number
  tasksOpen: number
  tasksOverdue: number
  disputedTasks: number
}
