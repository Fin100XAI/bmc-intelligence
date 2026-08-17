import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  LayoutGrid,
  ShieldAlert,
  Siren,
  Table2,
  UserPlus,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, IconButton, MetricGrid, Select, SegmentedControl, Textarea } from '@/components/ui/primitives'
import { GovPanel } from '@/components/gov/GovPanel'
import { Badge, ConfidenceBadge, SeverityBadge, SeverityRail } from '@/components/ui/badges'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ConfirmDialog, Modal } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { ActiveFilterChips, FilterBar } from '@/components/filters/FilterBar'
import { MetricCard } from '@/components/cards/MetricCard'
import { AlertCard } from '@/components/cards/domain-cards'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { alertService, intelligenceService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { useDrawerStore } from '@/stores/ui.store'
import type { FilterState } from '@/stores/ui.store'
import { useCurrentUser } from '@/stores/auth.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { allowed } from '@/security'
import { departmentName, officerDesignation, officerDisplayName, wardName } from '@/data/reference'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatDateTime, formatDuration, formatRelative, sanitiseText } from '@/utils/format'
import { cn } from '@/utils/cn'
import { DOMAIN_LABEL, type ConfidenceLevel, type DateRangeKey, type IntelligenceDomain, type Severity } from '@/types/common'
import { ALERT_STATUS_LABEL, type Alert, type AlertStatus } from '@/types/intelligence'
import { t } from '@/i18n'

/**
 * Global Alert Centre.
 *
 * Every operational alert the platform has raised, with SLA position,
 * ownership and the escalation actions an operator or officer holds
 * authority for. Acknowledging, assigning, escalating or closing an alert
 * here is a consequential act recorded in the permanent audit trail - this
 * is not a passive notification list.
 */

const DATE_RANGE_HOURS: Record<DateRangeKey, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  '90d': 24 * 90,
  fy: 24 * 365,
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 0, medium: 1, low: 2 }
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
}

function withinDateRange(iso: string, range: DateRangeKey): boolean {
  const ageMs = DEMO_NOW.getTime() - new Date(iso).getTime()
  return ageMs <= DATE_RANGE_HOURS[range] * 3_600_000
}

function matchesGlobalFilters(alert: Alert, filters: FilterState): boolean {
  if (filters.wardIds.length > 0 && !alert.wardIds.some((w) => filters.wardIds.includes(w))) return false
  if (filters.departmentIds.length > 0 && !filters.departmentIds.includes(alert.departmentId)) return false
  if (filters.domains.length > 0 && !filters.domains.includes(alert.domain)) return false
  if (filters.severities.length > 0 && !filters.severities.includes(alert.severity)) return false
  if (filters.statuses.length > 0 && !filters.statuses.includes(alert.status)) return false
  if (!withinDateRange(alert.createdAt, filters.dateRange)) return false
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    if (!alert.title.toLowerCase().includes(q) && !alert.description.toLowerCase().includes(q)) return false
  }
  return true
}

const STATUS_TONE: Record<AlertStatus, 'neutral' | 'warn' | 'critical' | 'positive' | 'info'> = {
  open: 'critical',
  acknowledged: 'info',
  assigned: 'neutral',
  escalated: 'critical',
  resolved: 'positive',
  closed: 'neutral',
}

interface RaisedRecord {
  incidentRef?: string
  decisionRef?: string
}

type ConfirmAction = { kind: 'escalate'; alert: Alert } | { kind: 'close'; alert: Alert }

interface AssignContext {
  ids: string[]
  wardIds: string[]
  departmentId: string
  label: string
}

export function AlertsPage(): React.JSX.Element {
  const user = useCurrentUser()
  const [searchParams] = useSearchParams()
  const openDrawer = useDrawerStore((s) => s.open)
  const filters = useFilterStore((s) => s.filters)
  const toggleInFilter = useFilterStore((s) => s.toggleInFilter)

  const [view, setView] = useState<'table' | 'cards'>('table')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [assignContext, setAssignContext] = useState<AssignContext | null>(null)
  const [assignOfficerId, setAssignOfficerId] = useState('')
  const [assignNote, setAssignNote] = useState('')
  const [raised, setRaised] = useState<Record<string, RaisedRecord>>({})
  const [actionError, setActionError] = useState<string | null>(null)

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(t('Alerts & Escalations'))

  // Honour `?severity=` as a one-time initial filter, applied once on mount.
  useEffect(() => {
    const initial = searchParams.get('severity') as Severity | null
    if (initial && !filters.severities.includes(initial)) {
      toggleInFilter('severities', initial)
    }
    // Intentionally runs once - subsequent filter changes are the operator's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const alertsQuery = useServiceQuery(queryKeys.alerts(), (u) => alertService.list(u, { pageSize: 500 }))
  const slaQuery = useServiceQuery(queryKeys.alerts('sla-summary'), (u) => alertService.slaSummary(u))

  const doAcknowledge = useServiceAction(
    (u, id: string) => alertService.acknowledge(u, id),
    [queryKeys.alerts(), queryKeys.alerts('sla-summary')],
  )
  const doAssign = useServiceAction(
    (u, id: string, ownerId: string, reason?: string) => alertService.assign(u, id, ownerId, reason),
    [queryKeys.alerts()],
  )
  const doEscalate = useServiceAction(
    (u, id: string, reason: string) => alertService.escalate(u, id, reason),
    [queryKeys.alerts(), queryKeys.alerts('sla-summary')],
  )
  const doClose = useServiceAction(
    (u, id: string, reason?: string) => alertService.close(u, id, reason),
    [queryKeys.alerts(), queryKeys.alerts('sla-summary')],
  )
  const doResolve = useServiceAction(
    (u, id: string) => alertService.transition(u, id, 'resolved'),
    [queryKeys.alerts(), queryKeys.alerts('sla-summary')],
  )
  const doCreateIncident = useServiceAction(
    (u, intelligenceId: string) => intelligenceService.createIncidentFrom(u, intelligenceId),
    [queryKeys.intelligence()],
  )
  const doCreateDecision = useServiceAction(
    (u, intelligenceId: string) => intelligenceService.createDecisionFrom(u, intelligenceId),
    [queryKeys.decisions(), queryKeys.intelligence()],
  )

  const canEdit = allowed(user, 'alert', 'edit')
  const canAssignPerm = allowed(user, 'alert', 'assign')
  const canEscalatePerm = allowed(user, 'alert', 'escalate')
  const canCreateIncidentPerm = allowed(user, 'incident', 'create')
  const canCreateDecisionPerm = allowed(user, 'decision', 'create')

  const alerts = useMemo(() => alertsQuery.data?.items ?? [], [alertsQuery.data])

  const domainOptions = useMemo<IntelligenceDomain[]>(
    () => Array.from(new Set(alerts.map((a) => a.domain))).sort((a, b) => DOMAIN_LABEL[a].localeCompare(DOMAIN_LABEL[b])),
    [alerts],
  )
  const statusOptions = useMemo(
    () => (Object.keys(ALERT_STATUS_LABEL) as AlertStatus[]).map((v) => ({ value: v, label: ALERT_STATUS_LABEL[v] })),
    [],
  )

  const filtered = useMemo(
    () => [...alerts].filter((a) => matchesGlobalFilters(a, filters)).sort((a, b) => a.slaRemainingHours - b.slaRemainingHours),
    [alerts, filters],
  )

  function runAction(promise: Promise<unknown>): void {
    setActionError(null)
    promise.catch((err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'The action could not be completed.')
    })
  }

  function handleCreateIncident(alert: Alert): void {
    if (!alert.intelligenceId) return
    setActionError(null)
    doCreateIncident(alert.intelligenceId)
      .then((incident) => setRaised((prev) => ({ ...prev, [alert.id]: { ...prev[alert.id], incidentRef: incident.reference } })))
      .catch((err: unknown) => setActionError(err instanceof Error ? err.message : 'The incident could not be created.'))
  }

  function handleCreateDecision(alert: Alert): void {
    if (!alert.intelligenceId) return
    setActionError(null)
    doCreateDecision(alert.intelligenceId)
      .then((decision) => setRaised((prev) => ({ ...prev, [alert.id]: { ...prev[alert.id], decisionRef: decision.reference } })))
      .catch((err: unknown) => setActionError(err instanceof Error ? err.message : 'The decision case could not be created.'))
  }

  function openAssign(alertsToAssign: Alert[]): void {
    if (alertsToAssign.length === 0) return
    const wardIds = Array.from(new Set(alertsToAssign.flatMap((a) => a.wardIds)))
    const departmentId = alertsToAssign[0]?.departmentId ?? ''
    setAssignOfficerId('')
    setAssignNote('')
    setAssignContext({
      ids: alertsToAssign.map((a) => a.id),
      wardIds,
      departmentId,
      label: alertsToAssign.length === 1 ? (alertsToAssign[0]?.title ?? '') : `${alertsToAssign.length} selected alerts`,
    })
  }

  function submitAssign(): void {
    if (!assignContext || !assignOfficerId) return
    setActionError(null)
    Promise.all(assignContext.ids.map((id) => doAssign(id, assignOfficerId, sanitiseText(assignNote) || undefined)))
      .then(() => {
        setAssignContext(null)
        setSelectedKeys([])
      })
      .catch((err: unknown) => setActionError(err instanceof Error ? err.message : 'Assignment could not be completed.'))
  }

  function bulkAcknowledge(): void {
    const eligible = filtered.filter((a) => selectedKeys.includes(a.id) && a.status === 'open')
    if (eligible.length === 0) return
    setActionError(null)
    Promise.all(eligible.map((a) => doAcknowledge(a.id)))
      .then(() => setSelectedKeys([]))
      .catch((err: unknown) => setActionError(err instanceof Error ? err.message : 'Bulk acknowledgement could not be completed.'))
  }

  const officerCandidates = useMemo(() => {
    if (!assignContext) return []
    const candidates: Array<{ id: string; label: string }> = []
    if (assignContext.departmentId) {
      const headId = `off-head-${assignContext.departmentId}`
      candidates.push({ id: headId, label: `${officerDisplayName(headId)} - ${officerDesignation(headId)}` })
    }
    for (const wardId of assignContext.wardIds) {
      const wardOfficerId = `off-ward-${wardId}`
      candidates.push({ id: wardOfficerId, label: `${officerDisplayName(wardOfficerId)} - ${officerDesignation(wardOfficerId)}` })
    }
    return candidates
  }, [assignContext])

  if (alertsQuery.isLoading || slaQuery.isLoading) {
    return (
      <PageBody>
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (alertsQuery.error) {
    return (
      <PageBody>
        <ErrorState detail={alertsQuery.error.message} onRetry={() => alertsQuery.refetch()} />
      </PageBody>
    )
  }

  const sla = slaQuery.data

  const columns: Array<Column<Alert>> = [
    {
      id: 'severity',
      header: t('Severity'),
      cell: (row) => <SeverityBadge severity={row.severity} />,
      sortValue: (row) => SEVERITY_RANK[row.severity],
      width: '7rem',
    },
    {
      id: 'title',
      header: t('Alert'),
      cell: (row) => (
        <div className="min-w-0 max-w-xs">
          <p className="truncate text-[0.8125rem] font-medium text-ink-800">{row.title}</p>
          <p className="truncate text-[0.6875rem] text-ink-400">{row.description}</p>
        </div>
      ),
      sortValue: (row) => row.title,
      searchValue: (row) => `${row.title} ${row.description}`,
    },
    {
      id: 'domain',
      header: t('Domain'),
      cell: (row) => <Badge tone="muted">{DOMAIN_LABEL[row.domain]}</Badge>,
      sortValue: (row) => DOMAIN_LABEL[row.domain],
      hideBelow: 'md',
    },
    {
      id: 'ward',
      header: t('Ward'),
      cell: (row) => <span className="truncate">{row.wardIds.map((w) => wardName(w)).join(', ') || '-'}</span>,
      searchValue: (row) => row.wardIds.map((w) => wardName(w)).join(' '),
      hideBelow: 'lg',
    },
    {
      id: 'department',
      header: t('Department'),
      cell: (row) => departmentName(row.departmentId),
      sortValue: (row) => departmentName(row.departmentId),
      hideBelow: 'lg',
    },
    {
      id: 'source',
      header: t('Source'),
      cell: (row) => <span className="text-ink-500">{row.source}</span>,
      hideBelow: 'xl',
      optional: true,
    },
    {
      id: 'confidence',
      header: t('Confidence'),
      cell: (row) => <ConfidenceBadge confidence={row.confidence} />,
      sortValue: (row) => CONFIDENCE_RANK[row.confidence],
      hideBelow: 'md',
      optional: true,
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (row) => <Badge tone={STATUS_TONE[row.status]}>{ALERT_STATUS_LABEL[row.status]}</Badge>,
      sortValue: (row) => row.status,
    },
    {
      id: 'owner',
      header: t('Owner'),
      cell: (row) => (row.ownerId ? officerDisplayName(row.ownerId) : <Badge tone="warn">{t('Unassigned')}</Badge>),
      sortValue: (row) => (row.ownerId ? officerDisplayName(row.ownerId) : ''),
      hideBelow: 'lg',
    },
    {
      id: 'created',
      header: t('Created'),
      cell: (row) => <span title={formatDateTime(row.createdAt)}>{formatRelative(row.createdAt)}</span>,
      sortValue: (row) => row.createdAt,
    },
    {
      id: 'sla',
      header: t('SLA remaining'),
      cell: (row) => {
        const breached = row.slaRemainingHours < 0
        const soon = !breached && row.slaRemainingHours <= 2
        return (
          <Badge tone={breached ? 'critical' : soon ? 'warn' : 'neutral'} className={cn(breached && 'font-semibold')}>
            {breached ? `Breached ${formatDuration(Math.abs(row.slaRemainingHours))} ago` : `${formatDuration(row.slaRemainingHours)} left`}
          </Badge>
        )
      },
      sortValue: (row) => row.slaRemainingHours,
    },
    {
      id: 'evidence',
      header: t('Evidence'),
      cell: (row) => <span className="numeric">{row.evidenceIds.length}</span>,
      sortValue: (row) => row.evidenceIds.length,
      align: 'center',
      hideBelow: 'xl',
      optional: true,
    },
  ]

  function renderActions(row: Alert): React.JSX.Element {
    const raisedRecord = raised[row.id]
    const incidentAlready = row.incidentId ?? raisedRecord?.incidentRef
    const decisionAlready = row.decisionCaseId ?? raisedRecord?.decisionRef
    return (
      <div className="flex items-center justify-end gap-1">
        {row.status === 'open' ? (
          <IconButton
            label={t('Acknowledge')}
            disabled={!canEdit}
            title={canEdit ? 'Acknowledge this alert' : 'Your role does not hold alert:edit'}
            onClick={() => runAction(doAcknowledge(row.id))}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {row.status === 'open' || row.status === 'acknowledged' ? (
          <IconButton
            label={t('Escalate')}
            disabled={!canEscalatePerm}
            title={canEscalatePerm ? 'Escalate to higher authority' : 'Your role does not hold alert:escalate'}
            onClick={() => setConfirmAction({ kind: 'escalate', alert: row })}
          >
            <Siren className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {row.status === 'assigned' ? (
          <IconButton
            label={t('Mark resolved')}
            disabled={!canEdit}
            title={canEdit ? 'Mark the underlying condition resolved' : 'Your role does not hold alert:edit'}
            onClick={() => runAction(doResolve(row.id))}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {row.status !== 'closed' ? (
          <IconButton
            label={t('Assign')}
            disabled={!canAssignPerm}
            title={canAssignPerm ? 'Assign an owning officer' : 'Your role does not hold alert:assign'}
            onClick={() => openAssign([row])}
          >
            <UserPlus className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {row.status === 'resolved' ? (
          <IconButton
            label={t('Close')}
            disabled={!canEdit}
            title={canEdit ? 'Close this alert into the permanent record' : 'Your role does not hold alert:edit'}
            onClick={() => setConfirmAction({ kind: 'close', alert: row })}
          >
            <Ban className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        <IconButton
          label={t('Create incident')}
          disabled={Boolean(incidentAlready) || !row.intelligenceId || !canCreateIncidentPerm}
          title={
            incidentAlready
              ? `Incident already raised (${incidentAlready})`
              : !row.intelligenceId
                ? 'No source intelligence item to raise an incident from'
                : canCreateIncidentPerm
                  ? 'Raise an incident from the source intelligence'
                  : 'Your role does not hold incident:create'
          }
          onClick={() => handleCreateIncident(row)}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          label={t('Create decision')}
          disabled={Boolean(decisionAlready) || !row.intelligenceId || !canCreateDecisionPerm}
          title={
            decisionAlready
              ? `Decision case already raised (${decisionAlready})`
              : !row.intelligenceId
                ? 'No source intelligence item to raise a decision case from'
                : canCreateDecisionPerm
                  ? 'Raise a decision case from the source intelligence'
                  : 'Your role does not hold decision:create'
          }
          onClick={() => handleCreateDecision(row)}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    )
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Command')}
        breadcrumbs={[{ label: t('Command') }, { label: t('Alerts & Escalations') }]}
        actions={
          <SegmentedControl
            ariaLabel="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'table', label: t('Table'), icon: <Table2 className="h-3 w-3" /> },
              { value: 'cards', label: t('Cards'), icon: <LayoutGrid className="h-3 w-3" /> },
            ]}
          />
        }
        controls={
          <FilterBar
            show={['date', 'ward', 'department', 'domain', 'severity', 'status', 'search']}
            statusOptions={statusOptions}
            domainOptions={domainOptions}
            searchPlaceholder="Search alerts"
          />
        }
      />

      {sla ? (
        <MetricGrid columns={3}>
          <MetricCard
            label={t('SLA breached')}
            value={sla.breached}
            tone={sla.breached > 0 ? 'critical' : 'default'}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            support={t('Open alerts past their SLA target')}
            background="red"
          />
          <MetricCard
            label={t('Breaching soon (≤ 2h)')}
            value={sla.approachingBreach}
            tone={sla.approachingBreach > 0 ? 'warn' : 'default'}
            icon={<Siren className="h-3.5 w-3.5" />}
            support={t('Requires attention within two hours')}
            background="amber"
          />
          <MetricCard
            label={t('Within SLA')}
            value={sla.withinSla}
            tone="positive"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            support={t('{0} open alert(s) tracked against SLA', sla.total)}
            background="green"
          />
        </MetricGrid>
      ) : null}

      <ActiveFilterChips />

      {actionError ? (
        <Card tone="critical" className="flex items-start justify-between gap-3">
          <p className="text-[0.8125rem] text-crit-700">{actionError}</p>
          <Button size="xs" variant="ghost" onClick={() => setActionError(null)}>
            {t('Dismiss')}
          </Button>
        </Card>
      ) : null}

      {selectedKeys.length > 0 ? (
        <Card tone="info" className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.8125rem] font-medium text-govt-800">{t('{0} alert(s) selected', selectedKeys.length)}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs" variant="outline" disabled={!canEdit} onClick={bulkAcknowledge} icon={<CheckCircle2 className="h-3 w-3" />}>
              {t('Acknowledge selected')}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={!canAssignPerm}
              onClick={() => openAssign(filtered.filter((a) => selectedKeys.includes(a.id)))}
              icon={<UserPlus className="h-3 w-3" />}
            >
              {t('Assign selected')}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setSelectedKeys([])}>
              {t('Clear')}
            </Button>
          </div>
        </Card>
      ) : null}

      <GovPanel
        title={t('{0} of {1} alert(s) shown', filtered.length, alerts.length)}
        subtitle={t('Alert register')}
        tone="amber"
        dense
      >
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('Sorted by SLA remaining - the most urgent position first.')}
        </p>
        {filtered.length === 0 ? (
          <EmptyState className="m-3" title={t('No alerts match the current filters')} detail="Widen the date range or clear a filter to see more results." />
        ) : view === 'table' ? (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(row) => row.id}
            searchable={false}
            pageSize={20}
            stickyHeader
            maxHeight="640px"
            onRowClick={(row) => openDrawer({ kind: 'alert', id: row.id })}
            selectable
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            rowActions={renderActions}
            rowAccent={(row) => <SeverityRail severity={row.severity} className="h-full" />}
            ariaLabel="Alerts"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onClick={() => openDrawer({ kind: 'alert', id: alert.id })}
                actions={
                  <div
                    role="presentation"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="flex w-full"
                  >
                    {renderActions(alert)}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </GovPanel>

      <ConfirmDialog
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={(reason) => {
          if (!confirmAction) return
          if (confirmAction.kind === 'escalate') runAction(doEscalate(confirmAction.alert.id, reason))
          else runAction(doClose(confirmAction.alert.id, reason))
        }}
        title={confirmAction?.kind === 'escalate' ? `Escalate "${confirmAction.alert.title}"` : `Close "${confirmAction?.alert.title ?? ''}"`}
        description={
          confirmAction?.kind === 'escalate'
            ? 'The alert is raised to a higher authority for immediate attention. State the institutional basis for escalation.'
            : 'The alert is closed into the permanent record. Confirm the underlying condition has been addressed.'
        }
        confirmLabel={confirmAction?.kind === 'close' ? 'Close alert' : 'Escalate'}
        intent={confirmAction?.kind === 'close' ? 'primary' : 'critical'}
        requireReason
      />

      <Modal
        open={assignContext !== null}
        onClose={() => setAssignContext(null)}
        title={t('Assign - {0}', assignContext?.label ?? '')}
        description={t('Ownership passes to the selected officer. This action is recorded in the audit trail.')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignContext(null)}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" disabled={!assignOfficerId} onClick={submitAssign}>
              {t('Assign')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-600" htmlFor="assign-officer">
              {t('Officer')}
            </label>
            <Select
              id="assign-officer"
              value={assignOfficerId}
              onChange={(e) => setAssignOfficerId(e.target.value)}
              placeholder={t('Select an officer')}
              options={officerCandidates.map((c) => ({ value: c.id, label: c.label }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-600" htmlFor="assign-note">
              {t('Note (optional)')}
            </label>
            <Textarea
              id="assign-note"
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
              placeholder={t('Any context for the receiving officer.')}
            />
          </div>
        </div>
      </Modal>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default AlertsPage
