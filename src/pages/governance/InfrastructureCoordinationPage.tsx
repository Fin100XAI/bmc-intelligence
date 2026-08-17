import { useMemo, useState } from 'react'
import { AlertTriangle, Building2, ClipboardList, TrainFront } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  MetricGrid,
  Select,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { GovPanel } from '@/components/gov/GovPanel'
import { MetricCard } from '@/components/cards'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { infraCoordinationService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { activeCorporation } from '@/config/municipality.config'
import { wardShortName } from '@/data/reference'
import {
  COORDINATION_PROJECT_STATUS_LABEL,
  COORDINATION_TASK_STATUS_LABEL,
  COORDINATION_TASK_TYPE_LABEL,
  LEAD_AGENCY_LABEL,
  type CoordinationProjectStatus,
  type CoordinationTask,
  type CoordinationTaskStatus,
} from '@/types/infra-coordination'
import { formatDate, formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/governance/InfrastructureCoordinationPage.tsx
 *
 * Capital works the Corporation does not build but must live beside - metro
 * corridors, coastal highways and sea links delivered by a state agency,
 * running through the Corporation's own streets and drains. Project
 * Intelligence tracks what the Corporation builds itself; this page tracks
 * what it owes, and is owed, on everything it does not.
 */

const PROJECT_STATUS_TONE: Record<CoordinationProjectStatus, BadgeTone> = {
  planned: 'muted',
  'under-construction': 'info',
  commissioning: 'warn',
  operational: 'positive',
}

const TASK_STATUS_TONE: Record<CoordinationTaskStatus, BadgeTone> = {
  pending: 'muted',
  'in-progress': 'info',
  completed: 'positive',
  disputed: 'critical',
}

const TASK_STATUSES: CoordinationTaskStatus[] = ['pending', 'in-progress', 'completed', 'disputed']

export function InfrastructureCoordinationPage(): React.JSX.Element {
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<CoordinationTaskStatus | ''>('')

  usePageMasthead(t('Infrastructure Coordination'))

  const positionQuery = useServiceQuery(queryKeys.infraCoordination('position'), (u) => infraCoordinationService.position(u))
  const projectsQuery = useServiceQuery(queryKeys.infraCoordination('projects'), (u) => infraCoordinationService.projects(u))
  const tasksQuery = useServiceQuery(queryKeys.infraCoordination('tasks'), (u) => infraCoordinationService.tasks(u))

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])

  const projectName = useMemo(() => (id: string) => projects.find((p) => p.id === id)?.name ?? id, [projects])

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (projectFilter && task.projectId !== projectFilter) return false
        if (statusFilter && task.status !== statusFilter) return false
        return true
      }),
    [tasks, projectFilter, statusFilter],
  )

  const loading = positionQuery.isLoading || projectsQuery.isLoading || tasksQuery.isLoading
  const anyError = positionQuery.error ?? projectsQuery.error ?? tasksQuery.error

  if (loading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Projects, Procurement & Assets')} breadcrumbs={[{ label: t('Projects, Procurement & Assets') }, { label: t('Infrastructure Coordination') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Projects, Procurement & Assets')} breadcrumbs={[{ label: t('Projects, Procurement & Assets') }, { label: t('Infrastructure Coordination') }]} />
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void positionQuery.refetch()
            void projectsQuery.refetch()
            void tasksQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const position = positionQuery.data

  const taskColumns: Array<Column<CoordinationTask>> = [
    {
      id: 'project',
      header: t('Project'),
      cell: (task) => <span className="font-medium text-ink-900">{projectName(task.projectId)}</span>,
      sortValue: (task) => projectName(task.projectId),
      width: 'minmax(14rem,1.8fr)',
    },
    {
      id: 'taskType',
      header: t('Obligation'),
      cell: (task) => <Badge tone="neutral" size="sm">{COORDINATION_TASK_TYPE_LABEL[task.taskType]}</Badge>,
      sortValue: (task) => task.taskType,
    },
    {
      id: 'ward',
      header: t('Ward'),
      cell: (task) => wardShortName(task.wardId),
      sortValue: (task) => wardShortName(task.wardId),
      hideBelow: 'md',
    },
    {
      id: 'note',
      header: t('Note'),
      cell: (task) => <span className="line-clamp-2 text-[0.75rem] text-ink-600">{task.note}</span>,
      sortValue: (task) => task.note,
      width: 'minmax(16rem,2.4fr)',
      hideBelow: 'lg',
    },
    {
      id: 'due',
      header: t('Due'),
      cell: (task) => (task.dueAt ? formatDate(task.dueAt) : <span className="text-ink-400">-</span>),
      sortValue: (task) => task.dueAt ?? '',
      hideBelow: 'xl',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (task) => <Badge tone={TASK_STATUS_TONE[task.status]} size="sm">{COORDINATION_TASK_STATUS_LABEL[task.status]}</Badge>,
      sortValue: (task) => task.status,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Projects, Procurement & Assets')}
        breadcrumbs={[{ label: t('Projects, Procurement & Assets') }, { label: t('Infrastructure Coordination') }]}
        hideProvenance
      />

      <DemonstrationNotice />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Agency-led projects active')}
          value={position?.projectsActive ?? 0}
          icon={<TrainFront className="h-4 w-4" />}
          background="red"
          footer={
            activeCorporation.id === 'bmc' && activeCorporation.coastalRoadCostCrore ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('For context: three real agency-led works anchor this register - the Coastal Road (Phase 1, {0} km, opened {1}, ~₹{2} crore, "the most expensive project in BMC\'s history"), the Goregaon-Mulund Link Road (₹{3} crore, {4} km twin tunnel beneath SGNP), and the Gargai Dam (₹{5} crore, {6} MLD additional yield, still pre-construction).', activeCorporation.coastalRoadLengthKm ?? '-', activeCorporation.coastalRoadPhase1OpenedYear ?? '-', formatNumber(activeCorporation.coastalRoadCostCrore), formatNumber(activeCorporation.gmlrCostCrore ?? 0), activeCorporation.gmlrTunnelLengthKm ?? '-', formatNumber(activeCorporation.gargaiDamCostCrore ?? 0), activeCorporation.gargaiDamYieldMLD ?? '-')}
              </span>
            ) : undefined
          }
        />
        <MetricCard label={t('Coordination tasks open')} value={position?.tasksOpen ?? 0} icon={<ClipboardList className="h-4 w-4" />} background="amber" />
        <MetricCard
          label={t('Overdue')}
          value={position?.tasksOverdue ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={position && position.tasksOverdue > 0 ? 'warn' : 'default'}
          background="green"
        />
        <MetricCard
          label={t('Disputed handbacks')}
          value={position?.disputedTasks ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={position && position.disputedTasks > 0 ? 'critical' : 'default'}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.id} className="flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 shrink-0 text-govt-600" aria-hidden />
                <p className="truncate text-[0.875rem] font-semibold text-ink-900">{project.name}</p>
              </div>
              <Badge tone={PROJECT_STATUS_TONE[project.status]} size="sm">{COORDINATION_PROJECT_STATUS_LABEL[project.status]}</Badge>
            </div>
            <p className="text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase">{LEAD_AGENCY_LABEL[project.leadAgency]}</p>
            <p className="text-xs leading-relaxed text-ink-600">{project.description}</p>
            <p className="border-t border-ink-100 pt-2 text-xs leading-relaxed text-ink-500">{project.notes}</p>
            <p className="text-[0.6875rem] text-ink-400">
              {t('{0} wards on corridor', project.corridorWardIds.length)}
              {project.expectedCompletion ? ` · ${t('Expected {0}', formatDate(project.expectedCompletion))}` : ''}
            </p>
          </Card>
        ))}
      </div>

      <GovPanel
        title={t('Coordination obligations')}
        tone="amber"
        dense
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="project-filter">{t('Project')}</Label>
              <Select
                id="project-filter"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                options={[{ value: '', label: t('All projects') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </div>
            <div>
              <Label htmlFor="task-status-filter">{t('Status')}</Label>
              <Select
                id="task-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as CoordinationTaskStatus | '')}
                options={[
                  { value: '', label: t('All statuses') },
                  ...TASK_STATUSES.map((s) => ({ value: s, label: COORDINATION_TASK_STATUS_LABEL[s] })),
                ]}
              />
            </div>
          </div>
        }
      >
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('Utility shifting, road reinstatement, drain diversion and NOC issuance the Corporation owes to, or holds against, each agency-led corridor.')}
        </p>
        {filteredTasks.length === 0 ? (
          <EmptyState title={t('No obligations match the current filters')} detail="Clear a filter to widen the register." />
        ) : (
          <DataTable rows={filteredTasks} columns={taskColumns} rowKey={(task) => task.id} pageSize={14} />
        )}
      </GovPanel>
    </PageBody>
  )
}

export default InfrastructureCoordinationPage
