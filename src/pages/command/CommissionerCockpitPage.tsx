import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Ban,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Droplets,
  FileSearch,
  Flame,
  GitBranch,
  HardHat,
  HeartPulse,
  History,
  MapPinned,
  NotebookPen,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, IconButton, Label, MetricGrid, Select, Textarea } from '@/components/ui/primitives'
import { Badge, ClassificationBadge, ConfidenceBadge, SeverityBadge } from '@/components/ui/badges'
import { ConfirmDialog, Modal } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { MetricCard } from '@/components/cards/MetricCard'
import { useActivityLog, useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { decisionService, healthService, incidentService, intelligenceService, projectService, revenueService } from '@/services'
import { buildCityPosition, buildCrossDomainInsights, type CrossDomainInsight } from '@/domains'
import { useDrawerStore } from '@/stores/ui.store'
import { useActiveCorporation } from '@/stores/corporation.store'
import { useCurrentUser } from '@/stores/auth.store'
import { allowed } from '@/security'
import { ROUTES } from '@/config/navigation'
import { departmentName, officerDesignation, officerDisplayName, wardName } from '@/data/reference'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCompact, formatCrore, formatDateTime, formatPercent, formatRelative, sanitiseText } from '@/utils/format'
import { DOMAIN_LABEL, SEVERITY_ORDER } from '@/types/common'
import { INTELLIGENCE_STATUS_LABEL, type IntelligenceItem } from '@/types/intelligence'
import { t } from '@/i18n'

/**
 * Commissioner Cockpit - the flagship command briefing.
 *
 * "Today's <city>" gives the Commissioner a scannable position across every
 * domain in under a minute; the Priority Queue is where the day's decisions
 * actually get worked. Every action taken here is written to the audit trail
 * and to the visible session log below.
 */

interface ItemState {
  approved?: boolean
  deferred?: boolean
  escalated?: boolean
  notes: string[]
}

type ConfirmKind = 'escalate' | 'defer' | 'approve' | 'close'
interface ConfirmState {
  kind: ConfirmKind
  item: IntelligenceItem
}

interface AssignState {
  item: IntelligenceItem
}

function BriefingTile({
  icon,
  title,
  count,
  tone,
  to,
  children,
}: {
  icon: ReactNode
  title: string
  count: number
  tone?: 'critical' | 'warn' | 'default'
  to: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={icon}
        title={title}
        actions={
          <Badge tone={tone === 'critical' ? 'critical' : tone === 'warn' ? 'warn' : 'neutral'}>{count}</Badge>
        }
      />
      <div className="mt-2.5 min-h-[2.5rem] flex-1 space-y-1.5">{children}</div>
      <LinkButtonRow to={to} />
    </Card>
  )
}

function LinkButtonRow({ to }: { to: string }): React.JSX.Element {
  return (
    <a href={to} className="mt-3 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-govt-600 hover:text-govt-800">
      {t('View module')}{' '}<ChevronRight className="h-3 w-3" />
    </a>
  )
}

export function CommissionerCockpitPage(): React.JSX.Element {
  const user = useCurrentUser()
  const corporation = useActiveCorporation()
  const openDrawer = useDrawerStore((s) => s.open)
  const activity = useActivityLog(user?.name ?? 'Municipal Commissioner')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [itemState, setItemState] = useState<Record<string, ItemState>>({})
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [assignState, setAssignState] = useState<AssignState | null>(null)
  const [assignOfficerId, setAssignOfficerId] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [openInsight, setOpenInsight] = useState<CrossDomainInsight | null>(null)

  const cityPosition = useMemo(() => buildCityPosition(), [])
  const insights = useMemo(() => buildCrossDomainInsights(), [])

  const priorityQuery = useServiceQuery(queryKeys.intelligence('cockpit-priority'), (u) =>
    intelligenceService.list(u, { severity: ['critical', 'high'], status: ['new', 'reviewed', 'assigned', 'in-progress'], pageSize: 200 }),
  )
  const incidentsQuery = useServiceQuery(queryKeys.incidents('cockpit-active'), (u) => incidentService.active(u))
  const projectsAtRiskQuery = useServiceQuery(queryKeys.projects('cockpit-at-risk'), (u) => projectService.atRisk(u, 60))
  const healthSignalsQuery = useServiceQuery(queryKeys.health('cockpit-outbreak'), (u) => healthService.outbreakSignals(u))
  const revenueAnomaliesQuery = useServiceQuery(queryKeys.revenue('cockpit-anomalies'), (u) =>
    revenueService.anomalies(u, { status: ['open', 'under-review'] }),
  )
  const decisionsQuery = useServiceQuery(queryKeys.decisions('cockpit'), (u) => decisionService.list(u, { pageSize: 500 }))

  const INTEL_KEYS = [queryKeys.intelligence('cockpit-priority'), queryKeys.intelligence()]
  const doReview = useServiceAction((u, id: string) => intelligenceService.transition(u, id, 'reviewed'), INTEL_KEYS)
  const doAssignItem = useServiceAction(
    (u, id: string, ownerId: string, reason?: string) => intelligenceService.assign(u, id, ownerId, reason),
    INTEL_KEYS,
  )
  const doCloseItem = useServiceAction((u, id: string, reason: string) => intelligenceService.transition(u, id, 'closed', reason), INTEL_KEYS)

  const canReview = allowed(user, 'intelligence', 'edit')
  const canAssignPerm = allowed(user, 'intelligence', 'assign')
  const canEscalatePerm = allowed(user, 'intelligence', 'escalate')
  const canApprovePerm = allowed(user, 'intelligence', 'approve')
  const canRequestAnalysis = allowed(user, 'ai', 'create')
  const canOpenEvidence = allowed(user, 'evidence', 'view')

  const queue = useMemo(() => {
    const items = priorityQuery.data?.items ?? []
    return [...items].sort((a, b) => {
      const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      if (sev !== 0) return sev
      return a.createdAt < b.createdAt ? 1 : -1
    })
  }, [priorityQuery.data])

  const decisionById = useMemo(() => new Map((decisionsQuery.data?.items ?? []).map((d) => [d.id, d])), [decisionsQuery.data])
  // The selected item drives the detail pop-up; nothing is open until a row is
  // clicked, and an item that leaves the queue (e.g. once closed) closes it.
  const selectedItem = queue.find((i) => i.id === selectedId) ?? null

  function stateFor(id: string): ItemState {
    return itemState[id] ?? { notes: [] }
  }

  function patchState(id: string, patch: Partial<ItemState>): void {
    setItemState((prev) => ({ ...prev, [id]: { ...stateFor(id), ...patch } }))
  }

  function runAction(promise: Promise<unknown>, logLine: { action: string; detail: string }): void {
    setActionError(null)
    promise
      .then(() => activity.record(logLine.action, logLine.detail))
      .catch((err: unknown) => setActionError(err instanceof Error ? err.message : 'The action could not be completed.'))
  }

  function handleConfirm(reason: string): void {
    if (!confirmState) return
    const { kind, item } = confirmState
    if (kind === 'escalate') {
      patchState(item.id, { escalated: true })
      activity.record('Escalated', `"${item.title}" escalated to higher authority - ${reason}`, reason)
    } else if (kind === 'defer') {
      patchState(item.id, { deferred: true })
      activity.record('Deferred', `"${item.title}" deferred - ${reason}`, reason)
    } else if (kind === 'approve') {
      patchState(item.id, { approved: true })
      activity.record('Approved recommendation', `Approved "${item.recommendedActions[0]?.title ?? item.title}" - ${reason}`, reason)
    } else if (kind === 'close') {
      runAction(doCloseItem(item.id, reason), { action: 'Closed', detail: t('"{0}" closed - {1}', item.title, reason) })
    }
  }

  function submitAssign(): void {
    if (!assignState || !assignOfficerId) return
    const { item } = assignState
    runAction(doAssignItem(item.id, assignOfficerId, undefined), {
      action: 'Assigned',
      detail: t('"{0}" assigned to {1}', item.title, officerDisplayName(assignOfficerId)),
    })
    setAssignState(null)
    setAssignOfficerId('')
  }

  function submitNote(): void {
    if (!selectedItem || !noteDraft.trim()) return
    const clean = sanitiseText(noteDraft, 500)
    patchState(selectedItem.id, { notes: [...stateFor(selectedItem.id).notes, clean] })
    activity.record('Note added', `Note added to "${selectedItem.title}": ${clean.slice(0, 80)}${clean.length > 80 ? '…' : ''}`)
    setNoteDraft('')
  }

  const officerCandidates = useMemo(() => {
    if (!assignState) return []
    const item = assignState.item
    const candidates: Array<{ id: string; label: string }> = []
    const headId = `off-head-${item.departmentId}`
    candidates.push({ id: headId, label: `${officerDisplayName(headId)} - ${officerDesignation(headId)}` })
    for (const wardId of item.wardIds) {
      const wardOfficerId = `off-ward-${wardId}`
      candidates.push({ id: wardOfficerId, label: `${officerDisplayName(wardOfficerId)} - ${officerDesignation(wardOfficerId)}` })
    }
    return candidates
  }, [assignState])

  if (priorityQuery.isLoading) {
    return (
      <PageBody>
        <LoadingState variant="metrics" />
        <LoadingState variant="block" rows={8} />
      </PageBody>
    )
  }
  if (priorityQuery.error) {
    return (
      <PageBody>
        <ErrorState detail={priorityQuery.error.message} onRetry={() => priorityQuery.refetch()} />
      </PageBody>
    )
  }

  const incidents = incidentsQuery.data ?? []
  const projectsAtRisk = projectsAtRiskQuery.data ?? []
  const healthSignals = healthSignalsQuery.data ?? []
  const revenueAnomalies = [...(revenueAnomaliesQuery.data?.items ?? [])].sort((a, b) => b.indicativeValueCrore - a.indicativeValueCrore)
  const grievanceWards = [...cityPosition.wardPerformance].sort((a, b) => b.slaBreached - a.slaBreached)
  const totalOpenComplaints = cityPosition.wardPerformance.reduce((s, w) => s + w.openComplaints, 0)
  const totalSlaBreached = cityPosition.wardPerformance.reduce((s, w) => s + w.slaBreached, 0)
  const overdueDecisions = (decisionsQuery.data?.items ?? []).filter(
    (d) => d.status !== 'closed' && d.status !== 'rejected' && new Date(d.dueDate).getTime() < DEMO_NOW.getTime(),
  ).length

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Command')}
        title={t('Commissioner Cockpit')}
        description={t('Today\'s {0} in one scannable briefing, and the ranked queue of issues that need a Commissioner\'s decision. Every action below is written to the permanent audit trail and to the session log at the foot of this page.', corporation.city)}
        breadcrumbs={[{ label: t('Command') }, { label: t('Commissioner Cockpit') }]}
      />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('City health score')}
          value={cityPosition.healthScore}
          unit="/100"
          tone={cityPosition.healthScore >= 78 ? 'positive' : cityPosition.healthScore >= 60 ? 'default' : cityPosition.healthScore >= 45 ? 'warn' : 'critical'}
          support={t('Composite across every domain - full breakdown on Executive Overview')}
          to={ROUTES.executive}
        />
        <MetricCard
          label={t('Priority queue')}
          value={queue.length}
          tone={queue.length > 0 ? 'critical' : 'default'}
          support={t('Critical or high-severity items open')}
        />
        <MetricCard
          label={t('Active incidents')}
          value={incidents.length}
          tone={incidents.length > 0 ? 'critical' : 'default'}
          support={t('Detected, validated or active')}
          to={ROUTES.situationRoom}
        />
        <MetricCard
          label={t('Overdue decisions')}
          value={overdueDecisions}
          tone={overdueDecisions > 0 ? 'warn' : 'default'}
          support={t('Past the recorded due date')}
          to={ROUTES.decisions}
        />
      </MetricGrid>

      {/* Cross-domain insight strip - the platform's differentiator */}
      <Card tone="info">
        <CardHeader
          icon={<GitBranch className="h-4 w-4" />}
          eyebrow={t('Cross-domain intelligence')}
          title={t('Exposures no single departmental view reveals')}
          description={t('Correlation identifies a review candidate. It is never a finding, and never an assertion of cause.')}
        />
        <div className="scrollbar-slim mt-3 flex gap-3 overflow-x-auto pb-1">
          {insights.map((insight) => (
            <button
              key={insight.id}
              type="button"
              onClick={() => setOpenInsight(insight)}
              className="w-80 shrink-0 rounded-lg border border-ink-100 bg-surface p-3 text-left shadow-card transition-shadow hover:shadow-raised"
            >
              <div className="flex items-center gap-1.5">
                <SeverityBadge severity={insight.severity} />
                <ConfidenceBadge confidence={insight.confidence} />
              </div>
              <p className="mt-2 line-clamp-2 text-[0.8125rem] font-semibold text-ink-900">{insight.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{insight.narrative}</p>
              <p className="mt-2 text-[0.6875rem] text-govt-600">{t('{0} signals · {1} ward(s) · Read more', insight.inputs.length, insight.wardIds.length)}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Today's <city> */}
      <div>
        <h2 className="mb-2 text-base font-semibold text-ink-900">{`Today's ${corporation.city}`}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <BriefingTile icon={<AlertTriangle className="h-4 w-4" />} title={t('High-priority issues')} count={queue.length} tone={queue.length > 0 ? 'critical' : 'default'} to={ROUTES.intelligenceFeed}>
            {queue.slice(0, 3).map((i) => (
              <p key={i.id} className="flex items-center gap-1.5 truncate text-xs text-ink-600">
                <SeverityBadge severity={i.severity} size="xs" /> <span className="truncate">{i.title}</span>
              </p>
            ))}
            {queue.length === 0 ? <p className="text-xs text-ink-400">{t('No critical or high-severity items open.')}</p> : null}
          </BriefingTile>

          <BriefingTile icon={<MapPinned className="h-4 w-4" />} title={t('High-risk wards')} count={cityPosition.wardPerformance.filter((w) => w.risk >= 60).length} tone="warn" to={ROUTES.wards}>
            {cityPosition.wardPerformance.slice(0, 3).map((w) => (
              <p key={w.wardId} className="flex items-center justify-between gap-2 text-xs text-ink-600">
                <span className="truncate">{w.label}</span>
                <span className="numeric font-semibold text-ink-800">{t('Risk {0}', w.risk)}</span>
              </p>
            ))}
          </BriefingTile>

          <BriefingTile icon={<Droplets className="h-4 w-4" />} title={t('Critical infrastructure')} count={cityPosition.water.zonesAtRisk + cityPosition.monsoon.wardsBelowThreshold} tone="warn" to={ROUTES.water}>
            <p className="text-xs text-ink-600">{t('Water zones at risk:')}{' '}<span className="font-semibold text-ink-800">{cityPosition.water.zonesAtRisk}</span></p>
            <p className="text-xs text-ink-600">{t('Wards below monsoon readiness:')}{' '}<span className="font-semibold text-ink-800">{cityPosition.monsoon.wardsBelowThreshold}</span></p>
            <p className="text-xs text-ink-600">{t('Chronic waterlogging locations:')}{' '}<span className="font-semibold text-ink-800">{cityPosition.monsoon.chronicLocations}</span></p>
          </BriefingTile>

          <BriefingTile icon={<HardHat className="h-4 w-4" />} title={t('Significant project delays')} count={projectsAtRisk.length} tone={projectsAtRisk.length > 0 ? 'warn' : 'default'} to={ROUTES.projects}>
            {projectsAtRisk.slice(0, 3).map((p) => (
              <p key={p.id} className="flex items-center justify-between gap-2 text-xs text-ink-600">
                <span className="truncate">{p.name}</span>
                <span className="numeric font-semibold text-ink-800">{t('Risk {0}', p.riskScore)}</span>
              </p>
            ))}
            {projectsAtRisk.length === 0 ? <p className="text-xs text-ink-400">{t('No projects above the risk threshold.')}</p> : null}
          </BriefingTile>

          <BriefingTile icon={<HeartPulse className="h-4 w-4" />} title={t('Health alerts')} count={healthSignals.length} tone={healthSignals.length > 0 ? 'warn' : 'default'} to={ROUTES.health}>
            {healthSignals.slice(0, 3).map((h) => (
              <p key={h.id} className="flex items-center justify-between gap-2 text-xs text-ink-600">
                <span className="truncate">{wardName(h.wardId)} - {h.disease}</span>
                <span className="numeric font-semibold text-ink-800">{h.outbreakSignal}/100</span>
              </p>
            ))}
            {healthSignals.length === 0 ? <p className="text-xs text-ink-400">{t('No elevated outbreak signals.')}</p> : null}
          </BriefingTile>

          <BriefingTile icon={<Flame className="h-4 w-4" />} title={t('Emergency events')} count={incidents.length} tone={incidents.length > 0 ? 'critical' : 'default'} to={ROUTES.situationRoom}>
            {incidents.slice(0, 3).map((inc) => (
              <p key={inc.id} className="flex items-center gap-1.5 truncate text-xs text-ink-600">
                <SeverityBadge severity={inc.severity} size="xs" /> <span className="truncate">{inc.title}</span>
              </p>
            ))}
            {incidents.length === 0 ? <p className="text-xs text-ink-400">{t('No active incidents.')}</p> : null}
          </BriefingTile>

          <BriefingTile icon={<Banknote className="h-4 w-4" />} title={t('Revenue / budget exceptions')} count={revenueAnomalies.length} tone={revenueAnomalies.length > 0 ? 'warn' : 'default'} to={ROUTES.revenue}>
            <p className="text-xs text-ink-600">
              {t('Collection efficiency:')}{' '}<span className="font-semibold text-ink-800">{formatPercent(cityPosition.revenue.efficiencyPct)}</span>
            </p>
            <p className="text-xs text-ink-600">
              {t('Budget utilisation:')}{' '}<span className="font-semibold text-ink-800">{formatPercent(cityPosition.budget.utilisationPct)}</span>
            </p>
            {revenueAnomalies[0] ? (
              <p className="truncate text-xs text-ink-600">{t('Top anomaly:')}{' '}<span className="font-semibold text-ink-800">{revenueAnomalies[0].title}</span></p>
            ) : null}
          </BriefingTile>

          <BriefingTile icon={<Users className="h-4 w-4" />} title={t('Citizen grievance escalation')} count={totalSlaBreached} tone={totalSlaBreached > 0 ? 'warn' : 'default'} to={ROUTES.wards}>
            <p className="text-xs text-ink-600">
              {t('Open complaints (city-wide):')}{' '}<span className="font-semibold text-ink-800">{formatCompact(totalOpenComplaints)}</span>
            </p>
            {grievanceWards.slice(0, 2).map((w) => (
              <p key={w.wardId} className="flex items-center justify-between gap-2 text-xs text-ink-600">
                <span className="truncate">{w.label}</span>
                <span className="numeric font-semibold text-crit-600">{w.slaBreached} breached</span>
              </p>
            ))}
          </BriefingTile>

          <BriefingTile icon={<CalendarClock className="h-4 w-4" />} title={t('Priority decisions')} count={cityPosition.priorityDecisions} tone={cityPosition.priorityDecisions > 0 ? 'warn' : 'default'} to={ROUTES.decisions}>
            <p className="text-xs text-ink-600">{t('Draft or under review, awaiting a human decision.')}</p>
            <p className="text-xs text-ink-600">
              {t('Financial impact under decision:')}{' '}
              <span className="font-semibold text-ink-800">
                {formatCrore((decisionsQuery.data?.items ?? []).filter((d) => d.status !== 'closed' && d.status !== 'rejected').reduce((s, d) => s + d.financialImpactCrore, 0))}
              </span>
            </p>
          </BriefingTile>
        </div>
      </div>

      {/* Priority Queue */}
      <div>
        <h2 className="mb-2 text-base font-semibold text-ink-900">{t('Commissioner Priority Queue')}</h2>
        {actionError ? (
          <Card tone="critical" className="mb-3 flex items-start justify-between gap-3">
            <p className="text-[0.8125rem] text-crit-700">{actionError}</p>
            <Button size="xs" variant="ghost" onClick={() => setActionError(null)}>
              {t('Dismiss')}
            </Button>
          </Card>
        ) : null}

        {queue.length === 0 ? (
          <EmptyState title={t('No priority items')} detail="No critical or high-severity intelligence items are currently open." />
        ) : (
          <Card flush>
            <div className="divide-y divide-ink-50">
              {queue.map((item) => {
                const s = stateFor(item.id)
                const decision = item.decisionCaseId ? decisionById.get(item.decisionCaseId) : undefined
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-haspopup="dialog"
                    className="group flex w-full items-start gap-3 p-3.5 text-left transition-colors hover:bg-govt-50/50"
                  >
                    <SeverityBadge severity={item.severity} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8125rem] font-semibold text-ink-900">{item.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.6875rem] text-ink-400">
                        <span>{item.wardIds.map((w) => wardName(w)).join(', ') || 'City-wide'}</span>
                        <span>{departmentName(item.departmentId)}</span>
                        <span>{officerDisplayName(item.ownerId)}</span>
                        <span className="inline-flex items-center gap-1"><FileSearch className="h-3 w-3" />{item.evidenceIds.length}</span>
                        <span>{formatRelative(item.createdAt)}</span>
                      </p>
                      {item.recommendedActions[0] ? (
                        <p className="mt-1 truncate text-[0.6875rem] text-govt-700">→ {item.recommendedActions[0].title}</p>
                      ) : null}
                      <p className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone="muted">{decision ? `Decision: ${formatDecisionStatusLabel(decision.status)}` : 'No decision raised'}</Badge>
                        {decision ? <Badge tone="muted" icon={<CalendarClock className="h-3 w-3" />}>{t('Due {0}', formatRelative(decision.dueDate))}</Badge> : null}
                        {s.approved ? <Badge tone="positive">{t('Approved')}</Badge> : null}
                        {s.deferred ? <Badge tone="warn">{t('Deferred')}</Badge> : null}
                        {s.escalated ? <Badge tone="critical">{t('Escalated')}</Badge> : null}
                      </p>
                    </div>
                    <span className="mt-0.5 hidden shrink-0 items-center gap-1 text-[0.6875rem] font-medium text-ink-300 transition-colors group-hover:text-govt-600 sm:inline-flex">
                      {t('Open')}<ChevronRight className="h-4 w-4" />
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Session activity log */}
      <Card flush>
        <CardHeader bordered eyebrow={t('Accountability')} title={t('Session activity log')} description={t('What you have done in this session, with timestamps. Every entry here also produced a permanent audit record.')} icon={<History className="h-4 w-4" />} />
        <div className="max-h-72 overflow-y-auto p-4">
          {activity.entries.length === 0 ? (
            <p className="text-xs text-ink-400">{t('No actions recorded yet in this session.')}</p>
          ) : (
            <ol className="space-y-2.5">
              {activity.entries.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2.5 text-xs">
                  <Clock className="mt-0.5 h-3 w-3 shrink-0 text-ink-300" />
                  <div className="min-w-0">
                    <p className="text-ink-700">
                      <span className="font-semibold text-ink-900">{entry.action}</span> - {entry.detail}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-ink-400">{entry.actor} · {formatDateTime(entry.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>

      {/* Priority item detail — opens as a medium pop-up when a row is clicked. */}
      <Modal
        open={selectedItem !== null}
        onClose={() => setSelectedId(null)}
        width="md"
        title={selectedItem?.title ?? ''}
        description={selectedItem?.description}
      >
        {selectedItem ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="muted">{INTELLIGENCE_STATUS_LABEL[selectedItem.status]}</Badge>
              <SeverityBadge severity={selectedItem.severity} />
              <ConfidenceBadge confidence={selectedItem.confidence} />
              <ClassificationBadge classification={selectedItem.classification} />
              <Badge tone="muted">{DOMAIN_LABEL[selectedItem.domain]}</Badge>
            </div>

            <p className="text-xs leading-relaxed text-ink-600">{selectedItem.explanation}</p>

            <dl className="grid grid-cols-1 gap-1.5 rounded-lg bg-surface-sunken p-3 text-xs sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:flex-col sm:justify-start sm:gap-0.5"><dt className="text-ink-400">{t('Wards')}</dt><dd className="text-right text-ink-700 sm:text-left">{selectedItem.wardIds.map((w) => wardName(w)).join(', ') || 'City-wide'}</dd></div>
              <div className="flex justify-between gap-2 sm:flex-col sm:justify-start sm:gap-0.5"><dt className="text-ink-400">{t('Department')}</dt><dd className="text-right text-ink-700 sm:text-left">{departmentName(selectedItem.departmentId)}</dd></div>
              <div className="flex justify-between gap-2 sm:flex-col sm:justify-start sm:gap-0.5"><dt className="text-ink-400">{t('Responsible officer')}</dt><dd className="text-right text-ink-700 sm:text-left">{officerDisplayName(selectedItem.ownerId)}</dd></div>
              <div className="flex justify-between gap-2 sm:flex-col sm:justify-start sm:gap-0.5"><dt className="text-ink-400">{t('Evidence')}</dt><dd className="text-right text-ink-700 sm:text-left">{t('{0} record(s)', selectedItem.evidenceIds.length)}</dd></div>
            </dl>

            {selectedItem.recommendedActions.length > 0 ? (
              <div className="rounded-md border border-intel-200 bg-intel-50/40 p-2.5">
                <p className="label-institutional mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3" />{t('Recommended next action')}</p>
                <p className="text-xs font-medium text-ink-800">{selectedItem.recommendedActions[0]?.title}</p>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">{selectedItem.recommendedActions[0]?.rationale}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5 border-t border-ink-100 pt-3">
              <Button size="xs" variant="outline" disabled={selectedItem.status !== 'new' || !canReview} title={canReview ? undefined : 'Your role does not hold intelligence:edit'} icon={<CheckCircle2 className="h-3 w-3" />} onClick={() => runAction(doReview(selectedItem.id), { action: 'Reviewed', detail: t('"{0}" marked reviewed', selectedItem.title) })}>
                {t('Review')}
              </Button>
              <Button size="xs" variant="outline" disabled={!canAssignPerm} title={canAssignPerm ? undefined : 'Your role does not hold intelligence:assign'} icon={<UserPlus className="h-3 w-3" />} onClick={() => setAssignState({ item: selectedItem })}>
                {t('Assign')}
              </Button>
              <Button size="xs" variant="outline" disabled={!canEscalatePerm} title={canEscalatePerm ? undefined : 'Your role does not hold intelligence:escalate'} onClick={() => setConfirmState({ kind: 'escalate', item: selectedItem })}>
                {t('Escalate')}
              </Button>
              <Button size="xs" variant="outline" disabled={!canRequestAnalysis} title={canRequestAnalysis ? undefined : 'Your role does not hold ai:create'} onClick={() => runAction(Promise.resolve(), { action: 'Requested analysis', detail: t('Analysis requested for "{0}"', selectedItem.title) })}>
                {t('Request Analysis')}
              </Button>
              <Button size="xs" variant="outline" disabled={selectedItem.evidenceIds.length === 0 || !canOpenEvidence} title={!canOpenEvidence ? 'Your role does not hold evidence:view' : selectedItem.evidenceIds.length === 0 ? 'No evidence recorded against this item' : undefined} onClick={() => { const firstId = selectedItem.evidenceIds[0]; if (firstId) { openDrawer({ kind: 'evidence', id: firstId }); activity.record('Opened evidence', `Evidence opened for "${selectedItem.title}"`) } }}>
                {t('Open Evidence')}
              </Button>
              <Button size="xs" variant="outline" disabled={selectedItem.recommendedActions.length === 0 || !canApprovePerm} title={!canApprovePerm ? 'Your role does not hold intelligence:approve' : selectedItem.recommendedActions.length === 0 ? 'No recommendation to approve' : undefined} onClick={() => setConfirmState({ kind: 'approve', item: selectedItem })}>
                {t('Approve Action')}
              </Button>
              <Button size="xs" variant="outline" disabled={!canReview} title={canReview ? undefined : 'Your role does not hold intelligence:edit'} onClick={() => setConfirmState({ kind: 'defer', item: selectedItem })}>
                {t('Defer')}
              </Button>
              <Button size="xs" variant="critical" disabled={!canReview} title={canReview ? undefined : 'Your role does not hold intelligence:edit'} icon={<Ban className="h-3 w-3" />} onClick={() => setConfirmState({ kind: 'close', item: selectedItem })}>
                {t('Close')}
              </Button>
            </div>

            <div className="border-t border-ink-100 pt-3">
              <p className="label-institutional mb-1.5 flex items-center gap-1"><NotebookPen className="h-3 w-3" />{t('Notes')}</p>
              {stateFor(selectedItem.id).notes.map((n, i) => (
                <p key={i} className="mb-1.5 rounded-md bg-surface-sunken p-2 text-[0.6875rem] leading-relaxed text-ink-600">{n}</p>
              ))}
              <div className="flex items-start gap-1.5">
                <Textarea rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder={t('Add a note for the record.')} className="flex-1" />
                <IconButton label={t('Add note')} disabled={!noteDraft.trim() || !canReview} onClick={submitNote}>
                  <NotebookPen className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmState !== null}
        onClose={() => setConfirmState(null)}
        onConfirm={handleConfirm}
        title={
          confirmState?.kind === 'escalate'
            ? `Escalate "${confirmState.item.title}"`
            : confirmState?.kind === 'defer'
              ? `Defer "${confirmState.item.title}"`
              : confirmState?.kind === 'approve'
                ? `Approve recommendation for "${confirmState.item.title}"`
                : `Close "${confirmState?.item.title ?? ''}"`
        }
        description={t('State the institutional basis for this action. It is written to the permanent audit record.')}
        confirmLabel={
          confirmState?.kind === 'escalate' ? 'Escalate' : confirmState?.kind === 'defer' ? 'Defer' : confirmState?.kind === 'approve' ? 'Approve' : 'Close'
        }
        intent={confirmState?.kind === 'approve' ? 'positive' : confirmState?.kind === 'close' || confirmState?.kind === 'escalate' ? 'critical' : 'primary'}
        requireReason
      />

      <Modal
        open={assignState !== null}
        onClose={() => setAssignState(null)}
        title={t('Assign - {0}', assignState?.item.title ?? '')}
        description={t('Ownership passes to the selected officer.')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignState(null)}>{t('Cancel')}</Button>
            <Button variant="primary" disabled={!assignOfficerId} onClick={submitAssign}>{t('Assign')}</Button>
          </>
        }
      >
        <Label htmlFor="cockpit-assign-officer">{t('Officer')}</Label>
        <Select id="cockpit-assign-officer" value={assignOfficerId} onChange={(e) => setAssignOfficerId(e.target.value)} placeholder={t('Select an officer')} options={officerCandidates.map((c) => ({ value: c.id, label: c.label }))} />
      </Modal>

      <Modal open={openInsight !== null} onClose={() => setOpenInsight(null)} title={openInsight?.title ?? ''} width="lg">
        {openInsight ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <SeverityBadge severity={openInsight.severity} />
              <ConfidenceBadge confidence={openInsight.confidence} />
              {openInsight.wardIds.map((w) => (
                <Badge key={w} tone="muted">{wardName(w)}</Badge>
              ))}
            </div>
            <p className="text-[0.8125rem] leading-relaxed text-ink-700">{openInsight.narrative}</p>
            <div>
              <p className="label-institutional mb-1.5">{t('Contributing signals')}</p>
              <div className="space-y-1">
                {openInsight.inputs.map((input, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-md bg-surface-sunken px-2.5 py-1.5 text-xs">
                    <span className="text-ink-500">{DOMAIN_LABEL[input.domain]} - {input.signal}</span>
                    <span className="numeric font-semibold text-ink-800">{input.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="label-institutional mb-1">{t('What this suggests')}</p>
              <p className="text-xs leading-relaxed text-ink-600">{openInsight.conclusion}</p>
            </div>
            <p className="border-t border-ink-100 pt-2.5 text-[0.6875rem] leading-relaxed text-ink-400">{openInsight.caveat}</p>
          </div>
        ) : null}
      </Modal>

      <DemonstrationNotice />
    </PageBody>
  )
}

function formatDecisionStatusLabel(status: string): string {
  // Renders a DecisionStatus id ("under-review") in title case for the queue row badge.
  return status
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default CommissionerCockpitPage
