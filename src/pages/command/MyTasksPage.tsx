import { useMemo, useState, type FormEvent } from 'react'
import { AlarmClock, CalendarClock, CheckCircle2, Circle, Hourglass, Inbox, Loader, OctagonX, Send, UserCheck, UserPlus } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, SeverityBadge, SeverityRail } from '@/components/ui/badges'
import { Button, Input, Label, ScoreDial, Select, Textarea } from '@/components/ui/primitives'
import { CHART_COLOURS, CompositionBar } from '@/components/charts'
import { KpiTile, type InfoTone } from '@/components/infographic'
import { BreakdownBars, Meter, SegmentDonut, type Segment } from '@/components/infographic/work-surface'
import { GovPanel } from '@/components/gov/GovPanel'
import { Modal } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery, useServiceAction } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { actionService, type ActionCreateInput, type AssignableUser } from '@/services'
import type { ActionItem, ActionStatus } from '@/types/operations'
import { ACTION_STATUS_LABEL } from '@/types/operations'
import { DOMAIN_LABEL, SEVERITY_LABEL, type DateRangeKey, type IntelligenceDomain, type Severity } from '@/types/common'
import type { User } from '@/types/organisation'
import { allowed } from '@/security/access'
import { useCurrentUser } from '@/stores/auth.store'
import { useDrawerStore, useFilterStore } from '@/stores/ui.store'
import type { FilterState } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { departmentName, wardName } from '@/data/reference'
import { DEMO_NOW, isoFromAnchor } from '@/utils/deterministic'
import { formatDate, formatRelative } from '@/utils/format'
import { t } from '@/i18n'
import { SHADE, type Shade } from '@/components/ui/shade'
import { cn } from '@/utils/cn'

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

const DATE_RANGE_HOURS: Record<DateRangeKey, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  '90d': 24 * 90,
  fy: 24 * 365,
}

function withinDateRange(iso: string, range: DateRangeKey): boolean {
  const ageMs = DEMO_NOW.getTime() - new Date(iso).getTime()
  return ageMs <= DATE_RANGE_HOURS[range] * 3_600_000
}

/**
 * Narrows a task register to the global filter set selected across the shell.
 *
 * A task carries the ward(s), department, domain, priority and status it was
 * raised under, so every one of those dimensions genuinely applies here - a
 * task spanning two wards belongs in both officers' ward views. No selection
 * on a dimension means no narrowing on it, which is the city-wide register.
 *
 * The test is the same shape the other command registers apply (see
 * `AlertsPage`), so a filter selection cannot mean one thing there and
 * another here. Ownership - what appears under "Assigned to me" at all - is
 * decided by the service, never by this filter; it can only narrow further.
 */
function matchesGlobalFilters(task: ActionItem, filters: FilterState): boolean {
  if (filters.wardIds.length > 0 && !task.wardIds.some((w) => filters.wardIds.includes(w))) return false
  if (filters.departmentIds.length > 0 && !filters.departmentIds.includes(task.departmentId)) return false
  if (filters.domains.length > 0 && !filters.domains.includes(task.domain)) return false
  if (filters.severities.length > 0 && !filters.severities.includes(task.priority)) return false
  if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return false
  if (!withinDateRange(task.createdAt, filters.dateRange)) return false
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    if (!task.title.toLowerCase().includes(q) && !task.description.toLowerCase().includes(q) && !task.reference.toLowerCase().includes(q)) return false
  }
  return true
}

export function MyTasksPage(): React.JSX.Element {
  const [assignOpen, setAssignOpen] = useState(false)

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(t('My Tasks'))

  /**
   * The global filter set in effect across the shell.
   *
   * This screen used to read neither store, so narrowing the interface to a
   * ward left the officer's own task list showing every ward's work under a
   * heading that said otherwise. The selection is read here, where it narrows
   * what is DISPLAYED; it is not - and must not be - what decides what may be
   * read. That remains the service's ownership check: a task assigned to you
   * is yours to open whatever ward it is tagged with, and no filter selection
   * can widen that set, only shorten it.
   *
   * `useFilterStore.filters` rather than `useContextStore.wardId` because the
   * two are reconciled by a single writer and the filter form is the general
   * one - it holds a set, so a comparison across several wards narrows this
   * list correctly too. It is the same source the sibling command screens
   * (Alerts, Decision Centre, Intelligence Feed) read.
   */
  const filters = useFilterStore((s) => s.filters)

  const myTasksQuery = useServiceQuery(queryKeys.myTasks('to-me'), (u) => actionService.myTasks(u))
  const assignedQuery = useServiceQuery(queryKeys.myTasks('by-me'), (u) => actionService.assignedByMe(u))

  const myTasks = useMemo(() => (myTasksQuery.data ?? []).filter((task) => matchesGlobalFilters(task, filters)), [myTasksQuery.data, filters])
  const assignedByMe = useMemo(() => (assignedQuery.data ?? []).filter((task) => matchesGlobalFilters(task, filters)), [assignedQuery.data, filters])

  const domainOptions = useMemo<IntelligenceDomain[]>(
    () =>
      Array.from(new Set([...(myTasksQuery.data ?? []), ...(assignedQuery.data ?? [])].map((task) => task.domain))).sort((a, b) =>
        DOMAIN_LABEL[a].localeCompare(DOMAIN_LABEL[b]),
      ),
    [myTasksQuery.data, assignedQuery.data],
  )
  const statusOptions = useMemo(
    () =>
      Array.from(new Set([...(myTasksQuery.data ?? []), ...(assignedQuery.data ?? [])].map((task) => task.status))).map((s: ActionStatus) => ({
        value: s,
        label: ACTION_STATUS_LABEL[s],
      })),
    [myTasksQuery.data, assignedQuery.data],
  )

  if (myTasksQuery.isLoading) return <LoadingState variant="block" rows={6} />
  if (myTasksQuery.error) return <ErrorState detail={myTasksQuery.error.message} onRetry={() => myTasksQuery.refetch()} />

  const stats = taskStats(myTasks)
  const byMeStats = taskStats(assignedByMe)
  const completionPct = myTasks.length > 0 ? (stats.done / myTasks.length) * 100 : 0

  const statusSegments: Segment[] = STATUS_ORDER.map((s) => ({
    id: s,
    label: ACTION_STATUS_LABEL[s],
    value: myTasks.filter((task) => task.status === s).length,
    colour: STATUS_COLOUR[s],
  }))
  const prioritySegments: Segment[] = PRIORITIES.map((p) => ({
    id: p,
    label: SEVERITY_LABEL[p],
    value: myTasks.filter((task) => task.priority === p).length,
    colour: PRIORITY_COLOUR[p],
  }))
  const dueSegments: Segment[] = [
    {
      id: 'overdue',
      label: t('Overdue'),
      value: stats.overdue,
      colour: CHART_COLOURS.critical,
      icon: <AlarmClock className="h-3 w-3" />,
    },
    {
      id: 'soon',
      label: t('Due within 3 days'),
      value: stats.dueSoon,
      colour: CHART_COLOURS.warn,
      icon: <Hourglass className="h-3 w-3" />,
    },
    {
      id: 'fortnight',
      label: t('Due in 4–14 days'),
      value: stats.dueFortnight,
      colour: CHART_COLOURS.primary,
      icon: <CalendarClock className="h-3 w-3" />,
    },
    {
      id: 'later',
      label: t('Due later'),
      value: stats.dueLater,
      colour: CHART_COLOURS.neutral,
      icon: <CalendarClock className="h-3 w-3" />,
    },
    {
      id: 'done',
      label: t('Completed'),
      value: stats.done,
      colour: CHART_COLOURS.positive,
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Command')}
        breadcrumbs={[{ label: t('Command') }, { label: t('My Tasks') }]}
        hideProvenance
        actions={
          <Button variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAssignOpen(true)}>
            {t('Assign a task')}
          </Button>
        }
        controls={
          <FilterBar
            show={['date', 'ward', 'department', 'domain', 'severity', 'status', 'search']}
            statusOptions={statusOptions}
            domainOptions={domainOptions}
          />
        }
      />

      <DemonstrationNotice />

      {/* ── Hero: the completion gauge, then the six standing figures ──
          The officer reads "how much of my work is done" first, then what
          is late, due and blocked - each a picture with the number in large
          type - before the register itself. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className={cn('flex flex-col items-center gap-4 rounded-xl border p-4 shadow-xs sm:flex-row', SHADE[stats.overdue > 0 ? 'amber' : 'green'].tile)}>
          <ScoreDial score={Math.round(completionPct)} size={136} label="%" caption={t('Tasks completed')} />
          <div className="w-full min-w-0 flex-1 space-y-2 text-center sm:text-left">
            <p className="text-[0.6875rem] font-bold tracking-[0.09em] text-ink-500 uppercase">{t('My workload')}</p>
            <p className="text-lg leading-tight font-bold text-ink-900">{t('{0} of {1} tasks still open', stats.active, myTasks.length)}</p>
            <p className={`text-[0.75rem] font-semibold ${stats.overdue > 0 ? 'text-crit-700' : 'text-ok-700'}`}>
              {stats.overdue > 0 ? t('{0} past the due date', stats.overdue) : t('Nothing past the due date')}
            </p>
            {myTasks.length > 0 ? (
              <CompositionBar
                height={10}
                segments={dueSegments
                  .filter((s) => s.value > 0)
                  .map((s) => ({
                    id: s.id,
                    label: s.label,
                    value: s.value,
                    colour: s.colour,
                  }))}
              />
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <KpiTile
            icon={<Inbox className="h-5 w-5" />}
            label={t('Assigned to me')}
            value={myTasks.length}
            reading={t('{0} still open', stats.active)}
            tone="neutral"
            shade="blue"
          />
          <KpiTile
            icon={<AlarmClock className="h-5 w-5" />}
            label={t('Overdue')}
            value={stats.overdue}
            reading={stats.overdue > 0 ? t('Past the due date') : t('None overdue')}
            tone={stats.overdue > 0 ? 'critical' : 'positive'}
            shade="tone"
          />
          <KpiTile
            icon={<Hourglass className="h-5 w-5" />}
            label={t('Due within 3 days')}
            value={stats.dueSoon}
            reading={t('Plan these first')}
            tone={stats.dueSoon > 0 ? 'warn' : 'positive'}
            shade="amber"
          />
          <KpiTile
            icon={<OctagonX className="h-5 w-5" />}
            label={t('Blocked')}
            value={stats.blocked}
            reading={stats.blocked > 0 ? t('Need a decision to proceed') : t('Nothing blocked')}
            tone={stats.blocked > 0 ? 'critical' : 'positive'}
            shade="tone"
          />
          <KpiTile
            icon={<CheckCircle2 className="h-5 w-5" />}
            label={t('Completed')}
            value={stats.done}
            reading={t('Of the tasks assigned to me')}
            tone="positive"
            shade="green"
          />
          <KpiTile
            icon={<Send className="h-5 w-5" />}
            label={t('Assigned by me')}
            value={assignedByMe.length}
            reading={t('{0} still open', byMeStats.active)}
            tone="neutral"
            shade="teal"
          />
        </div>
      </div>

      {/* ── The shape of my register: status · priority · due position ── */}
      {myTasks.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <GovPanel title={t('My tasks by status')} subtitle={t('Where each task sits in its workflow')} tone="green" dense>
            <div className="p-3">
              <SegmentDonut segments={statusSegments} centreLabel={t('tasks')} size={150} />
            </div>
          </GovPanel>
          <GovPanel title={t('By priority')} subtitle={t('Tasks assigned to me')} tone="red" dense>
            <div className="p-3">
              <BreakdownBars rows={prioritySegments} />
            </div>
          </GovPanel>
          <GovPanel title={t('Due-date position')} subtitle={t('Against the demonstration clock')} tone="amber" dense>
            <div className="p-3">
              <BreakdownBars rows={dueSegments} />
            </div>
          </GovPanel>
        </div>
      ) : null}

      {/* ── The registers ─────────────────────────────────────────────
          What is waiting on the officer reads in the wide column, what they
          have handed on beside it. Each row carries its priority as a colour
          rail, its workflow stage as a meter and its due position as a pill. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <GovPanel title={t('Assigned to me')} subtitle={t('{0} task(s)', myTasks.length)} tone="amber" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Tasks another officer has assigned to you. Assignment is the authorisation — these appear regardless of domain.')}
            </p>
            {myTasks.length === 0 ? (
              <EmptyState
                className="mx-3 mb-3"
                title={t('No tasks assigned to you')}
                detail={t('When another officer assigns you a task, it will appear here the moment you sign in.')}
              />
            ) : (
              <ul className="space-y-2 px-3 pb-3">
                {sortForQueue(myTasks).map((task) => (
                  <TaskRow key={task.id} task={task} perspective="to-me" />
                ))}
              </ul>
            )}
          </GovPanel>
        </div>

        <div className="min-w-0 xl:col-span-5">
          {assignedByMe.length > 0 ? (
            <GovPanel title={t('Assigned by me')} subtitle={t('{0} task(s)', assignedByMe.length)} tone="red" dense>
              <div className="space-y-2 px-3 pt-3 pb-2">
                <CompositionBar
                  height={10}
                  segments={[
                    {
                      id: 'overdue',
                      label: t('Overdue'),
                      value: byMeStats.overdue,
                      colour: CHART_COLOURS.critical,
                    },
                    {
                      id: 'open',
                      label: t('On schedule'),
                      value: Math.max(0, byMeStats.active - byMeStats.overdue),
                      colour: CHART_COLOURS.primary,
                    },
                    {
                      id: 'done',
                      label: t('Completed'),
                      value: byMeStats.done,
                      colour: CHART_COLOURS.positive,
                    },
                  ].filter((s) => s.value > 0)}
                />
                <p className="text-xs leading-relaxed text-ink-500">
                  {t("Tasks you have dispatched to other officers. Each is now on that officer's own dashboard.")}
                </p>
              </div>
              <ul className="space-y-2 px-3 pb-3">
                {sortForQueue(assignedByMe).map((task) => (
                  <TaskRow key={task.id} task={task} perspective="by-me" />
                ))}
              </ul>
            </GovPanel>
          ) : (
            <GovPanel title={t('Assigned by me')} tone="red" dense>
              <EmptyState className="m-3" title={t('Nothing dispatched yet')} detail={t("Use “Assign a task” to place work on another officer's dashboard.")} />
            </GovPanel>
          )}
        </div>
      </div>

      {assignOpen ? <AssignTaskModal onClose={() => setAssignOpen(false)} /> : null}
    </PageBody>
  )
}

const DONE_STATUSES: ActionStatus[] = ['completed', 'verified', 'closed']
const STATUS_ORDER: ActionStatus[] = ['open', 'assigned', 'in-progress', 'blocked', 'completed', 'verified', 'closed']

const STATUS_COLOUR: Record<ActionStatus, string> = {
  open: CHART_COLOURS.neutral,
  assigned: CHART_COLOURS.primarySoft,
  'in-progress': CHART_COLOURS.primary,
  blocked: CHART_COLOURS.critical,
  completed: CHART_COLOURS.positive,
  verified: CHART_COLOURS.positive,
  closed: CHART_COLOURS.intel,
}

/** How far along its workflow a task is, for the row meter. */
const STATUS_STAGE: Record<ActionStatus, number> = {
  open: 8,
  assigned: 25,
  'in-progress': 55,
  blocked: 55,
  completed: 85,
  verified: 100,
  closed: 100,
}

const PRIORITY_COLOUR: Record<Severity, string> = {
  critical: CHART_COLOURS.critical,
  high: CHART_COLOURS.risk,
  medium: CHART_COLOURS.warn,
  low: CHART_COLOURS.primary,
  info: CHART_COLOURS.neutral,
}

const DAY_MS = 86_400_000

function isDone(task: ActionItem): boolean {
  return DONE_STATUSES.includes(task.status)
}

/** Whole days from the demonstration clock to the due date; negative is overdue. */
function daysToDue(task: ActionItem): number {
  return Math.floor((new Date(task.dueDate).getTime() - DEMO_NOW.getTime()) / DAY_MS)
}

interface TaskStats {
  active: number
  done: number
  overdue: number
  dueSoon: number
  dueFortnight: number
  dueLater: number
  blocked: number
}

function taskStats(tasks: ActionItem[]): TaskStats {
  const active = tasks.filter((task) => !isDone(task))
  const days = active.map(daysToDue)
  return {
    active: active.length,
    done: tasks.length - active.length,
    overdue: days.filter((d) => d < 0).length,
    dueSoon: days.filter((d) => d >= 0 && d <= 3).length,
    dueFortnight: days.filter((d) => d > 3 && d <= 14).length,
    dueLater: days.filter((d) => d > 14).length,
    blocked: active.filter((task) => task.status === 'blocked').length,
  }
}

/** Work-queue order: open work before finished work, then the earliest due date first. */
function sortForQueue(tasks: ActionItem[]): ActionItem[] {
  return [...tasks].sort((a, b) => {
    const doneDiff = Number(isDone(a)) - Number(isDone(b))
    if (doneDiff !== 0) return doneDiff
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  })
}

function StatusIcon({ status }: { status: ActionStatus }): React.JSX.Element {
  const cls = 'h-4 w-4'
  if (status === 'blocked') return <OctagonX className={cls} />
  if (status === 'in-progress') return <Loader className={cls} />
  if (DONE_STATUSES.includes(status)) return <CheckCircle2 className={cls} />
  if (status === 'assigned') return <UserCheck className={cls} />
  return <Circle className={cls} />
}

function TaskRow({ task, perspective }: { task: ActionItem; perspective: 'to-me' | 'by-me' }): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)
  const done = isDone(task)
  const days = daysToDue(task)
  const dueTone = done ? 'positive' : days < 0 ? 'critical' : days <= 3 ? 'warn' : 'info'
  const dueLabel = done ? t('Done') : days < 0 ? t('Overdue by {0} day(s)', Math.abs(days)) : days === 0 ? t('Due today') : t('Due in {0} day(s)', days)
  // The row wears the shade of where it stands: blocked or overdue red, due
  // within three days amber, done green, otherwise an ordinary open task blue.
  const rowShade: Shade = task.status === 'blocked' || (!done && days < 0) ? 'red' : done ? 'green' : days <= 3 ? 'amber' : 'blue'
  const stageTone: InfoTone = task.status === 'blocked' ? 'critical' : done ? 'positive' : 'neutral'
  const discClass =
    task.status === 'blocked' ? 'bg-crit-50 text-crit-600 ring-crit-200' : done ? 'bg-ok-50 text-ok-600 ring-ok-200' : 'bg-govt-50 text-govt-600 ring-govt-200'

  return (
    <li>
      {/* A task you cannot open is a task you cannot progress. The drawer is
          where its status is moved and its notes are recorded. */}
      <button
        type="button"
        onClick={() => openDrawer({ kind: 'action', id: task.id })}
        aria-label={t('Open task {0}: {1}', task.reference, task.title)}
        className={cn(
          'flex w-full items-stretch gap-3 rounded-lg border p-2.5 text-left transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-govt-500',
          SHADE[rowShade].tile,
        )}
      >
        <SeverityRail severity={task.priority} className="self-stretch" />
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${discClass}`} aria-hidden>
          <StatusIcon status={task.status} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={task.priority} />
            <Badge tone={STATUS_TONE[task.status] ?? 'muted'} size="sm">
              {ACTION_STATUS_LABEL[task.status]}
            </Badge>
            <span className="numeric text-[0.625rem] text-ink-400">{task.reference}</span>
          </div>
          <p className="mt-1 text-[0.8125rem] leading-snug font-semibold text-ink-900">{task.title}</p>
          <p className="mt-0.5 line-clamp-1 text-[0.6875rem] text-ink-500">{task.description}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <Meter value={STATUS_STAGE[task.status]} tone={stageTone} className="w-20 shrink-0" />
            <span className="truncate text-[0.625rem] text-ink-400">
              {departmentName(task.departmentId)} ·{' '}
              {perspective === 'to-me' ? t('Assigned {0}', formatRelative(task.createdAt)) : t('Created {0}', formatRelative(task.createdAt))}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <Badge tone={dueTone} icon={<CalendarClock className="h-3 w-3" />}>
            {dueLabel}
          </Badge>
          <span className="text-[0.625rem] text-ink-400">
            {t('Due')} {formatDate(task.dueDate)}
          </span>
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
    [
      ['bmc-mii', 'actions'],
      ['bmc-mii', 'my-tasks'],
      ['bmc-mii', 'action'],
    ],
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
  const scopeNote = taskWards.length > 0 ? t(', tagged to {0}', wardName(taskWards[0]!)) : ', city-wide'

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)
    if (!assignee) {
      setError(t('Select an officer to assign the task to.'))
      return
    }
    if (title.trim().length < 4) {
      setError(t('Give the task a title of at least four characters.'))
      return
    }

    if (!user) {
      setError(t('No authenticated principal. The task was not raised.'))
      return
    }

    setSubmitting(true)
    try {
      await createTask(buildInput(user, assignee, title, description, priority, dueDate))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('The task could not be assigned.'))
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Assign a task')}
      description={t("The task is placed on the selected officer's own dashboard. Sign in as them to see it under Assigned to me.")}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting} icon={<UserPlus className="h-4 w-4" />}>
            {submitting ? 'Assigning…' : t('Assign task')}
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
              {t(
                'Raised under {0}{1}. It appears on {2} under “Assigned to me”.',
                departmentName(user.departmentId),
                scopeNote,
                assignee.isSelf ? 'your own dashboard' : `${assignee.name}'s dashboard`,
              )}
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="task-priority">{t('Priority')}</Label>
            <Select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Severity)}
              options={PRIORITIES.map((p) => ({
                value: p,
                label: p.charAt(0).toUpperCase() + p.slice(1),
              }))}
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
function buildInput(raisedBy: User, assignee: AssignableUser, title: string, description: string, priority: Severity, dueDate: string): ActionCreateInput {
  // A picked date parses deterministically; the fallback anchors to the frozen
  // demonstration clock (seven days out) rather than real wall-clock time.
  const due = dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : isoFromAnchor(7 * 24 * 60)
  return {
    title: title.trim(),
    description: description.trim() || t('No further detail provided.'),
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
