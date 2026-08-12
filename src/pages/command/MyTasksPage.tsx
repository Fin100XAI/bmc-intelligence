import { useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, Inbox, Send, UserPlus } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, SeverityBadge } from '@/components/ui/badges'
import { Button, Card, CardHeader, Input, Label, MetricGrid, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { MetricCard } from '@/components/cards/MetricCard'
import { useServiceQuery, useServiceAction } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { actionService, type ActionCreateInput, type AssignableUser } from '@/services'
import type { ActionItem } from '@/types/operations'
import { ACTION_STATUS_LABEL } from '@/types/operations'
import type { Severity } from '@/types/common'
import type { User } from '@/types/organisation'
import { allowed } from '@/security/access'
import { useCurrentUser } from '@/stores/auth.store'
import { useDrawerStore } from '@/stores/ui.store'
import { departmentName, wardName } from '@/data/reference'
import { formatDate, formatRelative } from '@/utils/format'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * src/pages/command/MyTasksPage.tsx
 *
 * My Tasks - the officer's own task dashboard.
 *
 * This closes the assignment loop the platform describes: an officer assigns a
 * task to another officer, and that task appears on the assignee's own
 * dashboard. Because the mutable store persists across a role switch, the flow
 * is verifiable end to end - assign here, sign in as the assignee, and the task
 * is waiting under "Assigned to me".
 *
 * A task assigned to you is shown regardless of the domain it is tagged with:
 * the assignment is the authorisation. That is enforced in the service, not the
 * page.
 */

const STATUS_TONE: Record<string, 'muted' | 'info' | 'warn' | 'positive' | 'critical'> = {
  open: 'muted',
  assigned: 'info',
  'in-progress': 'warn',
  blocked: 'critical',
  completed: 'positive',
  verified: 'positive',
  closed: 'muted',
}

const PRIORITIES: Severity[] = ['critical', 'high', 'medium', 'low']

export function MyTasksPage(): React.JSX.Element {
  const [assignOpen, setAssignOpen] = useState(false)

  const myTasksQuery = useServiceQuery(queryKeys.myTasks('to-me'), (u) => actionService.myTasks(u))
  const assignedQuery = useServiceQuery(queryKeys.myTasks('by-me'), (u) => actionService.assignedByMe(u))

  if (myTasksQuery.isLoading) return <LoadingState variant="block" rows={6} />
  if (myTasksQuery.error) return <ErrorState detail={myTasksQuery.error.message} onRetry={() => myTasksQuery.refetch()} />

  const myTasks = myTasksQuery.data ?? []
  const assignedByMe = assignedQuery.data ?? []
  const openCount = myTasks.filter((actionItem) => actionItem.status !== 'closed' && actionItem.status !== 'verified').length

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Command')}
        title={t('My Tasks')}
        description={t('The tasks assigned to you, and the tasks you have assigned to other officers. Assigning a task here places it directly on that officer\'s own dashboard — it is waiting for them the moment they sign in.')}
        breadcrumbs={[{ label: t('Command') }, { label: t('My Tasks') }]}
        hideProvenance
        actions={
          <Button variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAssignOpen(true)}>
            {t('Assign a task')}
          </Button>
        }
      />

      <DemonstrationNotice />

      <MetricGrid columns={3}>
        <MetricCard label={t('Assigned to me')} value={myTasks.length} support={t('{0} still open', openCount)} icon={<Inbox className="h-4 w-4" />} />
        <MetricCard label={t('Assigned by me')} value={assignedByMe.length} support={t('Dispatched to other officers')} icon={<Send className="h-4 w-4" />} />
        <MetricCard
          label={t('Completed')}
          value={myTasks.filter((actionItem) => actionItem.status === 'completed' || actionItem.status === 'verified' || actionItem.status === 'closed').length}
          support={t('Of the tasks assigned to me')}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </MetricGrid>

      {/* Assigned to me ------------------------------------------------ */}
      <Card flush>
        <CardHeader
          bordered
          icon={<Inbox className="h-4 w-4" />}
          title={t('Assigned to me')}
          description={t('Tasks another officer has assigned to you. Assignment is the authorisation — these appear regardless of domain.')}
        />
        {myTasks.length === 0 ? (
          <EmptyState
            title={t('No tasks assigned to you')}
            detail="When another officer assigns you a task, it will appear here the moment you sign in."
          />
        ) : (
          <ul className="divide-y divide-ink-50">
            {myTasks.map((task) => (
              <TaskRow key={task.id} task={task} perspective="to-me" />
            ))}
          </ul>
        )}
      </Card>

      {/* Assigned by me ------------------------------------------------ */}
      {assignedByMe.length > 0 ? (
        <Card flush>
          <CardHeader
            bordered
            icon={<Send className="h-4 w-4" />}
            title={t('Assigned by me')}
            description={t('Tasks you have dispatched to other officers. Each is now on that officer\'s own dashboard.')}
          />
          <ul className="divide-y divide-ink-50">
            {assignedByMe.map((task) => (
              <TaskRow key={task.id} task={task} perspective="by-me" />
            ))}
          </ul>
        </Card>
      ) : null}

      {assignOpen ? <AssignTaskModal onClose={() => setAssignOpen(false)} /> : null}
    </PageBody>
  )
}

function TaskRow({ task, perspective }: { task: ActionItem; perspective: 'to-me' | 'by-me' }): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)

  return (
    <li>
      {/* A task you cannot open is a task you cannot progress. The drawer is
          where its status is moved and its notes are recorded. */}
      <button
        type="button"
        onClick={() => openDrawer({ kind: 'action', id: task.id })}
        aria-label={t('Open task {0}: {1}', task.reference, task.title)}
        className="flex w-full flex-wrap items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-sunken focus:outline-none focus-visible:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-govt-500"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={task.priority} />
            <Badge tone={STATUS_TONE[task.status] ?? 'muted'} size="sm">
              {ACTION_STATUS_LABEL[task.status]}
            </Badge>
            <span className="numeric text-[0.625rem] text-ink-400">{task.reference}</span>
          </div>
          <p className="mt-1 text-[0.8125rem] font-semibold text-ink-900">{task.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[0.6875rem] leading-relaxed text-ink-500">{task.description}</p>
        </div>
        <div className="shrink-0 text-right text-[0.6875rem] text-ink-500">
          <p>
            <span className="text-ink-400">{t('Due')}</span> {formatDate(task.dueDate)}
          </p>
          <p className="mt-0.5 text-ink-400">{departmentName(task.departmentId)}</p>
          <p className="mt-0.5 text-ink-400">
            {perspective === 'to-me' ? 'Assigned' : 'Created'} {formatRelative(task.createdAt)}
          </p>
        </div>
      </button>
    </li>
  )
}

function AssignTaskModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const user = useCurrentUser()
  const officersQuery = useServiceQuery(queryKeys.myTasks('assignable'), (u) => actionService.assignableUsers(u))
  const createTask = useServiceAction(
    (u, input: ActionCreateInput) => actionService.create(u, input),
    // Invalidate the general action list, every My Tasks view and the single
    // action record, so both sides of the assignment update immediately.
    [['bmc-mii', 'actions'], ['bmc-mii', 'my-tasks'], ['bmc-mii', 'action']],
  )

  const officers = useMemo(() => officersQuery.data ?? [], [officersQuery.data])
  const [assigneeId, setAssigneeId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Severity>('medium')
  const [dueDate, setDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assignee = officers.find((o) => o.id === assigneeId)
  const taskWards = user && assignee ? wardsForTask(user, assignee) : []
  const scopeNote = taskWards.length > 0 ? `, tagged to ${wardName(taskWards[0]!)}` : ', city-wide'

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)
    if (!assignee) {
      setError('Select an officer to assign the task to.')
      return
    }
    if (title.trim().length < 4) {
      setError('Give the task a title of at least four characters.')
      return
    }

    if (!user) {
      setError('No authenticated principal. The task was not raised.')
      return
    }

    setSubmitting(true)
    try {
      await createTask(buildInput(user, assignee, title, description, priority, dueDate))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The task could not be assigned.')
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Assign a task')}
      description={t('The task is placed on the selected officer\'s own dashboard. Sign in as them to see it under Assigned to me.')}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting} icon={<UserPlus className="h-4 w-4" />}>
            {submitting ? 'Assigning…' : 'Assign task'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <Label htmlFor="assignee" required>
            {t('Assign to')}
          </Label>
          <Select
            id="assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            options={[
              { value: '', label: t('Select an officer…') },
              ...officers.map((o) => ({
                value: o.id,
                label: o.isSelf ? `Myself — ${o.designation}` : `${o.designation} — ${o.name}`,
              })),
            ]}
          />
          {assignee && user ? (
            <p className="mt-1 text-[0.6875rem] text-ink-500">
              {t('Raised under {0}{1}. It appears on {2} under “Assigned to me”.', departmentName(user.departmentId), scopeNote, assignee.isSelf ? 'your own dashboard' : `${assignee.name}'s dashboard`)}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="task-title" required>
            {t('Task')}
          </Label>
          <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('What needs to be done')} />
        </div>

        <div>
          <Label htmlFor="task-desc">{t('Detail')}</Label>
          <Textarea
            id="task-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('Any context the officer needs to act on this.')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="task-priority">{t('Priority')}</Label>
            <Select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Severity)}
              options={PRIORITIES.map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))}
            />
          </div>
          <div>
            <Label htmlFor="task-due">{t('Due date')}</Label>
            <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        {error ? <p className="text-[0.75rem] text-crit-600">{error}</p> : null}
      </form>
    </Modal>
  )
}

/**
 * The ward a raised task is tagged with.
 *
 * A task is raised under the authority of the officer raising it, so it can
 * only carry a ward that officer holds. The assignee's home ward is used where
 * the raising officer's scope covers it - that is the most specific and most
 * useful tag - otherwise the raising officer's own ward, otherwise none, which
 * records the task as city-wide. Delegating to an officer in another ward is
 * ordinary practice and must not be refused for it.
 */
function wardsForTask(raisedBy: User, assignee: AssignableUser): string[] {
  const candidates = [assignee.wardId, raisedBy.wardId].filter((w): w is string => Boolean(w))
  const permitted = candidates.find((wardId) => allowed(raisedBy, 'action', 'create', { wardIds: [wardId] }))
  return permitted ? [permitted] : []
}

/**
 * Builds the action input.
 *
 * The task is scoped to the department and ward the RAISING officer is
 * accountable for, not the assignee's - a Chief Engineer raising works and
 * handing them to a Ward Officer is raising them under Infrastructure
 * Delivery, not under the ward office. Ownership, and therefore whose
 * dashboard the task lands on, is carried by `ownerId` alone.
 */
function buildInput(
  raisedBy: User,
  assignee: AssignableUser,
  title: string,
  description: string,
  priority: Severity,
  dueDate: string,
): ActionCreateInput {
  // A picked date parses deterministically; the fallback anchors to the frozen
  // demonstration clock (seven days out) rather than real wall-clock time.
  const due = dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : isoFromAnchor(7 * 24 * 60)
  return {
    title: title.trim(),
    description: description.trim() || 'No further detail provided.',
    ownerId: assignee.id,
    departmentId: raisedBy.departmentId,
    wardIds: wardsForTask(raisedBy, assignee),
    priority,
    dueDate: due,
    domain: 'executive',
    classification: 'internal',
  }
}

export default MyTasksPage
