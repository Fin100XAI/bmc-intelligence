import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertOctagon,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileSearch,
  Landmark,
  ScrollText,
  UserCheck,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Button, Input, Label, ScoreDial, Textarea } from '@/components/ui/primitives'
import { GovPanel } from '@/components/gov/GovPanel'
import { Badge, ClassificationBadge, SeverityBadge } from '@/components/ui/badges'
import { Modal, Tabs } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { ActiveFilterChips, FilterBar } from '@/components/filters/FilterBar'
import { DecisionCard } from '@/components/cards/domain-cards'
import { BigFigure, KpiTile } from '@/components/infographic'
import { CountBars, LegendDonut, SEVERITY_COLOUR } from '@/components/infographic/command-kit'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { decisionService, intelligenceService, type DecisionCreateInput } from '@/services'
import { useDrawerStore, useFilterStore } from '@/stores/ui.store'
import type { FilterState } from '@/stores/ui.store'
import { useCurrentUser } from '@/stores/auth.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { allowed } from '@/security'
import { departmentName, wardName } from '@/data/reference'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCrore, formatDate, formatNumber, sanitiseText } from '@/utils/format'
import { DOMAIN_LABEL, SEVERITY_LABEL, type DateRangeKey, type IntelligenceDomain, type Severity } from '@/types/common'
import { DECISION_STATUS_LABEL, type DecisionCase, type DecisionStatus } from '@/types/operations'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Decision Centre - the platform's differentiator.
 *
 * Dashboards must lead to workflows and workflows to accountable action. Every
 * decision case carries a named human decision with a recorded rationale; the
 * platform's own comparative analysis is always advisory, never dispositive.
 */

const STAGES: DecisionStatus[] = ['draft', 'under-review', 'approved', 'assigned', 'implementing', 'verification', 'closed', 'rejected']

/** A function, not a constant: the rail is read per render, in the interface language. */
function workflowRail(): string[] {
  return [
    t('Intelligence'),
    t('Decision Case'),
    t('Review'),
    t('Human Decision'),
    t('Assignment'),
    t('Execution'),
    t('Verification'),
    t('Closure'),
    t('Outcome Evaluation'),
  ]
}

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

function matchesGlobalFilters(item: DecisionCase, filters: FilterState): boolean {
  if (filters.wardIds.length > 0 && !item.wardIds.some((w) => filters.wardIds.includes(w))) return false
  if (filters.departmentIds.length > 0 && !filters.departmentIds.some((d) => item.departmentIds.includes(d))) return false
  if (filters.domains.length > 0 && !filters.domains.includes(item.domain)) return false
  if (filters.severities.length > 0 && !filters.severities.includes(item.severity)) return false
  if (!withinDateRange(item.createdAt, filters.dateRange)) return false
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    if (!item.title.toLowerCase().includes(q) && !item.problemStatement.toLowerCase().includes(q) && !item.reference.toLowerCase().includes(q)) return false
  }
  return true
}

interface CreateForm {
  title: string
  problemStatement: string
  background: string
  financialImpactCrore: string
  citizenImpact: string
  dueInDays: string
}

const EFFECTIVENESS_TONE: Record<NonNullable<DecisionCase['outcome']>['effectiveness'], string> = {
  effective: '#10b981',
  'partially-effective': '#f59e0b',
  'not-effective': '#e5484d',
  'too-early': '#8195ac',
}
function build$EFFECTIVENESS_LABEL(): Record<NonNullable<DecisionCase['outcome']>['effectiveness'], string> {
  return {
  effective: t('Effective'),
  'partially-effective': t('Partially effective'),
  'not-effective': t('Not effective'),
  'too-early': t('Too early to assess'),
}
}
let EFFECTIVENESS_LABEL: Record<NonNullable<DecisionCase['outcome']>['effectiveness'], string> = build$EFFECTIVENESS_LABEL()
registerLayer(() => {
  EFFECTIVENESS_LABEL = build$EFFECTIVENESS_LABEL()
})

export function DecisionCentrePage(): React.JSX.Element {
  const user = useCurrentUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const openDrawer = useDrawerStore((s) => s.open)
  const filters = useFilterStore((s) => s.filters)

  const [activeTab, setActiveTab] = useState<DecisionStatus>('under-review')
  const [form, setForm] = useState<CreateForm | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const caseIdParam = searchParams.get('case')
  const fromIntelligenceId = searchParams.get('from')

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(t('Decision Centre'))

  useEffect(() => {
    if (caseIdParam) openDrawer({ kind: 'decision', id: caseIdParam })
    // Opens once for the entry-point deep link; the drawer's own close
    // control governs the interface from that point on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setForm(null)
  }, [fromIntelligenceId])

  const decisionsQuery = useServiceQuery(queryKeys.decisions(), (u) => decisionService.list(u, { pageSize: 500 }))
  const fromItemQuery = useServiceQuery(
    queryKeys.intelligenceItem(fromIntelligenceId ?? 'none'),
    (u) => intelligenceService.get(u, fromIntelligenceId ?? ''),
    { enabled: Boolean(fromIntelligenceId) },
  )

  useEffect(() => {
    const item = fromItemQuery.data
    if (item && !form) {
      setForm({
        title: t('Decision case: {0}', item.title),
        problemStatement: item.description,
        background: item.explanation,
        financialImpactCrore: '0',
        citizenImpact: item.citizensAffected
          ? t('Approximately {0} residents estimated within the affected area.', item.citizensAffected.toLocaleString('en-IN'))
          : t('Citizen impact not yet estimated.'),
        dueInDays: '21',
      })
    }
  }, [fromItemQuery.data, form])

  const doCreate = useServiceAction(
    (u, input: DecisionCreateInput) => decisionService.create(u, input),
    [queryKeys.decisions()],
  )

  function closeFromModal(): void {
    setForm(null)
    setCreateError(null)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('from')
        return next
      },
      { replace: true },
    )
  }

  function submitCreate(): void {
    const item = fromItemQuery.data
    if (!item || !form) return
    setCreateError(null)
    doCreate({
      title: sanitiseText(form.title, 200),
      problemStatement: sanitiseText(form.problemStatement),
      background: sanitiseText(form.background),
      domain: item.domain,
      departmentIds: [item.departmentId],
      wardIds: item.wardIds,
      financialImpactCrore: Number(form.financialImpactCrore) || 0,
      citizenImpact: sanitiseText(form.citizenImpact),
      recommendationSummary: item.recommendedActions[0]?.title ?? t('Recommendation pending analyst input.'),
      sourceIntelligenceIds: [item.id],
      evidenceIds: item.evidenceIds,
      severity: item.severity,
      classification: item.classification,
      dueInDays: Number(form.dueInDays) || 21,
    })
      .then((created) => {
        closeFromModal()
        setActiveTab('draft')
        openDrawer({ kind: 'decision', id: created.id })
      })
      .catch((err: unknown) => setCreateError(err instanceof Error ? err.message : t('The decision case could not be created.')))
  }

  const cases = useMemo(() => decisionsQuery.data?.items ?? [], [decisionsQuery.data])

  const filtered = useMemo(() => [...cases].filter((c) => matchesGlobalFilters(c, filters)), [cases, filters])

  const stageCounts = useMemo(() => {
    const counts = new Map<DecisionStatus, number>()
    for (const stage of STAGES) counts.set(stage, 0)
    for (const item of filtered) counts.set(item.status, (counts.get(item.status) ?? 0) + 1)
    return counts
  }, [filtered])

  const board = useMemo(() => filtered.filter((c) => c.status === activeTab).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)), [filtered, activeTab])

  const summary = useMemo(() => {
    const active = filtered.filter((c) => c.status !== 'closed' && c.status !== 'rejected')
    const financialImpact = active.reduce((s, c) => s + c.financialImpactCrore, 0)
    const overdue = active.filter((c) => new Date(c.dueDate).getTime() < DEMO_NOW.getTime())
    const underReview = filtered.filter((c) => c.status === 'under-review')
    const avgReviewDays =
      underReview.length > 0
        ? underReview.reduce((s, c) => s + (DEMO_NOW.getTime() - new Date(c.createdAt).getTime()) / 86_400_000, 0) / underReview.length
        : 0
    const withOutcome = filtered.filter((c) => c.outcome)
    const effectivenessCounts = withOutcome.reduce(
      (acc, c) => {
        if (c.outcome) acc[c.outcome.effectiveness] = (acc[c.outcome.effectiveness] ?? 0) + 1
        return acc
      },
      {} as Record<NonNullable<DecisionCase['outcome']>['effectiveness'], number>,
    )
    const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
    const severityMix = severities.map((sev) => ({
      id: sev,
      label: SEVERITY_LABEL[sev],
      value: active.filter((c) => c.severity === sev).length,
      colour: SEVERITY_COLOUR[sev],
    }))
    const seriousCount = active.filter((c) => c.severity === 'critical' || c.severity === 'high').length
    const impactMap = new Map<IntelligenceDomain, number>()
    for (const c of active) impactMap.set(c.domain, (impactMap.get(c.domain) ?? 0) + c.financialImpactCrore)
    const impactByDomain = Array.from(impactMap.entries())
      .map(([domain, crore]) => ({ domain, crore }))
      .filter((d) => d.crore > 0)
      .sort((a, b) => b.crore - a.crore)
      .slice(0, 8)
    return {
      activeCount: active.length,
      financialImpact,
      overdueCount: overdue.length,
      avgReviewDays,
      effectivenessCounts,
      withOutcomeCount: withOutcome.length,
      severityMix,
      seriousCount,
      impactByDomain,
    }
  }, [filtered])

  const canCreate = allowed(user, 'decision', 'create')

  if (decisionsQuery.isLoading) {
    return (
      <PageBody>
        <LoadingState variant="metrics" />
        <LoadingState variant="block" rows={6} />
      </PageBody>
    )
  }
  if (decisionsQuery.error) {
    return (
      <PageBody>
        <ErrorState detail={decisionsQuery.error.message} onRetry={() => decisionsQuery.refetch()} />
      </PageBody>
    )
  }

  const tabItems = STAGES.map((stage) => ({ id: stage, label: DECISION_STATUS_LABEL[stage], count: stageCounts.get(stage) ?? 0 }))

  const effectivenessSegments = (Object.keys(EFFECTIVENESS_LABEL) as Array<keyof typeof EFFECTIVENESS_LABEL>)
    .map((key) => ({ id: key, label: EFFECTIVENESS_LABEL[key], value: summary.effectivenessCounts[key] ?? 0, colour: EFFECTIVENESS_TONE[key] }))
    .filter((s) => s.value > 0)

  const onTimePct = summary.activeCount > 0 ? ((summary.activeCount - summary.overdueCount) / summary.activeCount) * 100 : 100
  const boardOverdue = board.filter((c) => new Date(c.dueDate).getTime() < DEMO_NOW.getTime()).length
  const boardImpact = board.reduce((s, c) => s + c.financialImpactCrore, 0)

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Command')}
        breadcrumbs={[{ label: t('Command') }, { label: t('Decision Centre') }]}
        controls={<FilterBar show={['date', 'ward', 'department', 'severity', 'search']} searchPlaceholder={t('Search decision cases')} />}
      />

      {/* ── Headline figures: what is under decision, in large type ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          icon={<ClipboardList className="h-5 w-5" />}
          label={t('Cases under decision')}
          value={summary.activeCount}
          reading={t('Not yet closed or rejected')}
          tone="neutral"
          shade="blue"
          />
        <KpiTile
          icon={<CalendarClock className="h-5 w-5" />}
          label={t('Overdue')}
          value={summary.overdueCount}
          reading={t('Past the recorded due date')}
          tone={summary.overdueCount > 0 ? 'critical' : 'positive'}
          shade="tone"
          />
        <KpiTile
          icon={<AlertOctagon className="h-5 w-5" />}
          label={t('Critical + high')}
          value={summary.seriousCount}
          reading={t('Active cases of high severity')}
          tone={summary.seriousCount > 0 ? 'risk' : 'positive'}
          shade="tone"
          />
        <KpiTile
          icon={<Landmark className="h-5 w-5" />}
          label={t('Financial impact under decision')}
          value={formatCrore(summary.financialImpact)}
          reading={t('Indicative, active cases')}
          tone="neutral"
          shade="gold"
          />
        <KpiTile
          icon={<Activity className="h-5 w-5" />}
          label={t('Average time in review')}
          value={`${summary.avgReviewDays.toFixed(1)} ${t('days')}`}
          reading={t('Cases currently under review')}
          tone={summary.avgReviewDays > 14 ? 'warn' : 'neutral'}
          shade="amber"
          />
        <KpiTile
          icon={<ClipboardCheck className="h-5 w-5" />}
          label={t('Outcomes recorded')}
          value={summary.withOutcomeCount}
          reading={t('{0} rated effective', summary.effectivenessCounts.effective ?? 0)}
          tone={summary.withOutcomeCount > 0 ? 'positive' : 'neutral'}
          shade="green"
          />
      </div>

      {/* ── The board in three pictures: timeliness · pipeline · outcomes ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <GovPanel title={t('Timeliness')} subtitle={t('Active cases within their due date')} tone="amber" dense>
          <div className="flex items-center gap-4 p-3">
            <ScoreDial score={Math.round(onTimePct)} size={120} label="%" caption={t('On time')} />
            <div className="grid flex-1 grid-cols-1 gap-3">
              <BigFigure
                value={formatNumber(summary.activeCount - summary.overdueCount)}
                caption={t('cases within their due date')}
                tone="positive"
              />
              <BigFigure
                value={formatNumber(summary.overdueCount)}
                caption={t('cases past their due date')}
                tone={summary.overdueCount > 0 ? 'critical' : 'neutral'}
              />
            </div>
          </div>
        </GovPanel>

        <GovPanel title={t('Cases by stage')} subtitle={t('Select a stage to open it on the board')} tone="green" dense>
          <div className="p-2">
            <CountBars
              rows={tabItems.map((tab) => ({ id: tab.id, label: tab.label, value: tab.count }))}
              activeIds={[activeTab]}
              onSelect={(id) => setActiveTab(id as DecisionStatus)}
              emptyLabel={t('No decision cases in scope.')}
            />
          </div>
        </GovPanel>

        <GovPanel title={t('Outcome effectiveness distribution')} subtitle={t('Outcome evaluation')} tone="green" dense>
          <div className="p-3">
            <LegendDonut
              segments={effectivenessSegments}
              centreValue={formatNumber(summary.withOutcomeCount)}
              centreLabel={t('outcomes')}
              size={130}
              emptyLabel={t('No case has a recorded outcome yet.')}
            />
            {effectivenessSegments.length > 0 ? (
              <p className="mt-2 text-[0.625rem] text-ink-500">{t('{0} case(s) with a recorded outcome.', summary.withOutcomeCount)}</p>
            ) : null}
          </div>
        </GovPanel>
      </div>

      {/* The procedure the whole page is about, stated once across the full
          width. It reads left to right by nature — a stage rail forced into a
          column would have to be scrolled to be understood at all. */}
      <GovPanel title={t('Intelligence to accountable outcome')} subtitle={t('How a decision case moves')} tone="amber">
        <div className="scrollbar-slim flex items-center gap-1 overflow-x-auto pb-1">
          {workflowRail().map((step, i, rail) => (
            <div key={step} className="flex shrink-0 items-center gap-1">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-surface-sunken px-2.5 text-xs font-medium whitespace-nowrap text-ink-700">
                <span className="numeric flex h-4 w-4 items-center justify-center rounded-full bg-govt-600 text-[0.625rem] font-bold text-white">
                  {i + 1}
                </span>
                {step}
              </span>
              {i < rail.length - 1 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-300" /> : null}
            </div>
          ))}
        </div>
      </GovPanel>

      {/* ── Two columns ──────────────────────────────────────────────
          The board of cases is what the officer works in, so it takes the
          wide column. Where the money and the severity sit reads down the
          narrow one. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Column 1 — the cases themselves ------------------------- */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-9">
          <ActiveFilterChips />

          <Tabs items={tabItems} value={activeTab} onChange={(id) => setActiveTab(id as DecisionStatus)} ariaLabel={t('Decision workflow stage')} />

          {board.length > 0 ? (
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-google-blue-200 bg-google-blue-50 p-3">
              <BigFigure value={formatNumber(board.length)} caption={t('cases in "{0}"', DECISION_STATUS_LABEL[activeTab])} />
              <BigFigure
                value={formatNumber(boardOverdue)}
                caption={t('past their due date')}
                tone={boardOverdue > 0 ? 'critical' : 'positive'}
              />
              <BigFigure value={formatCrore(boardImpact)} caption={t('financial impact, indicative')} />
            </div>
          ) : null}

          {board.length === 0 ? (
            <EmptyState
              title={t('No cases in "{0}"', DECISION_STATUS_LABEL[activeTab])}
              detail={t('Select a different workflow stage, or raise a decision case from an intelligence item\'s \'Create decision from this section\' action.')}
              icon={<ClipboardCheck className="h-4 w-4" />}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {board.map((c) => (
                <DecisionCard key={c.id} decision={c} onClick={() => openDrawer({ kind: 'decision', id: c.id })} />
              ))}
            </div>
          )}
        </div>

        {/* Column 2 — where the money and the severity sit ----------- */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-3">
          <GovPanel title={t('Active cases by severity')} subtitle={t('Not yet closed or rejected')} tone="red" dense>
            <div className="p-3">
              <LegendDonut
                segments={summary.severityMix}
                centreValue={formatNumber(summary.activeCount)}
                centreLabel={t('cases')}
                size={120}
                emptyLabel={t('No decision cases in scope.')}
              />
            </div>
          </GovPanel>

          <GovPanel title={t('Financial impact by domain')} subtitle={t('Active cases, INR crore, indicative')} tone="gold" dense>
            <div className="p-2">
              <CountBars
                rows={summary.impactByDomain.map((d) => ({
                  id: d.domain,
                  label: DOMAIN_LABEL[d.domain],
                  value: d.crore,
                  display: formatCrore(d.crore),
                }))}
                emptyLabel={t('No decision cases in scope.')}
              />
            </div>
          </GovPanel>
        </div>
      </div>

      <Modal
        open={Boolean(fromIntelligenceId)}
        onClose={closeFromModal}
        title={t('Create decision case')}
        description={t('Pre-filled from the source intelligence item. Review and adjust before submitting - the case enters the board in Draft.')}
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeFromModal}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" disabled={!canCreate || !form || !fromItemQuery.data} onClick={submitCreate} title={!canCreate ? t('Your role does not hold decision:create') : undefined}>
              {t('Create decision case')}
            </Button>
          </>
        }
      >
        {fromItemQuery.isLoading ? (
          <LoadingState variant="inline" label={t('Retrieving source intelligence')} />
        ) : fromItemQuery.error ? (
          <ErrorState detail={fromItemQuery.error.message} />
        ) : fromItemQuery.data && form ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-ink-100 bg-surface-sunken p-2.5">
              <ScrollText className="h-3.5 w-3.5 text-ink-400" />
              <span className="text-xs text-ink-500">{t('Source intelligence:')}</span>
              <span className="text-xs font-medium text-ink-800">{fromItemQuery.data.title}</span>
              <SeverityBadge severity={fromItemQuery.data.severity} />
              <ClassificationBadge classification={fromItemQuery.data.classification} />
              <Badge tone="muted" icon={<FileSearch className="h-3 w-3" />}>
                {t('{0} evidence', fromItemQuery.data.evidenceIds.length)}
              </Badge>
            </div>

            <div>
              <Label htmlFor="dc-title">{t('Title')}</Label>
              <Input id="dc-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} />
            </div>
            <div>
              <Label htmlFor="dc-problem">{t('Problem statement')}</Label>
              <Textarea id="dc-problem" rows={3} value={form.problemStatement} onChange={(e) => setForm({ ...form, problemStatement: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="dc-background">{t('Background')}</Label>
              <Textarea id="dc-background" rows={2} value={form.background} onChange={(e) => setForm({ ...form, background: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="dc-financial" hint={t('INR crore, indicative')}>
                  {t('Financial impact')}
                </Label>
                <Input
                  id="dc-financial"
                  type="number"
                  min={0}
                  value={form.financialImpactCrore}
                  onChange={(e) => setForm({ ...form, financialImpactCrore: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="dc-due" hint={t('days from today')}>
                  {t('Due')}
                </Label>
                <Input id="dc-due" type="number" min={1} value={form.dueInDays} onChange={(e) => setForm({ ...form, dueInDays: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="dc-citizen">{t('Citizen impact')}</Label>
              <Textarea id="dc-citizen" rows={2} value={form.citizenImpact} onChange={(e) => setForm({ ...form, citizenImpact: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <div>
                <p className="label-institutional mb-1">{t('Wards')}</p>
                <p className="text-ink-700">{fromItemQuery.data.wardIds.map((w) => wardName(w)).join(', ') || '-'}</p>
              </div>
              <div>
                <p className="label-institutional mb-1">{t('Departments')}</p>
                <p className="text-ink-700">{departmentName(fromItemQuery.data.departmentId)}</p>
              </div>
              <div>
                <p className="label-institutional mb-1">{t('Domain')}</p>
                <p className="text-ink-700">{DOMAIN_LABEL[fromItemQuery.data.domain]}</p>
              </div>
              <div>
                <p className="label-institutional mb-1">{t('Due date')}</p>
                <p className="text-ink-700">{formatDate(new Date(DEMO_NOW.getTime() + (Number(form.dueInDays) || 21) * 86_400_000))}</p>
              </div>
            </div>
            {createError ? <p className="text-xs text-crit-600">{createError}</p> : null}
            {!canCreate ? (
              <p className="flex items-center gap-1.5 text-xs text-warn-700">
                <UserCheck className="h-3.5 w-3.5" />
                {t('Your role does not hold decision:create - this form cannot be submitted from your current session.')}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default DecisionCentrePage
