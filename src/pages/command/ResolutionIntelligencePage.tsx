import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Award,
  GitBranch,
  MessageSquareWarning,
  RefreshCcw,
  Repeat,
  Scale,
  ShieldCheck,
  Sparkles,
  Timer,
  Users2,
} from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { Badge, type BadgeTone, SeverityBadge } from '@/components/ui/badges'
import { Card, Label, MetricGrid, Select } from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { MetricCard } from '@/components/cards/MetricCard'
import { GovPanel } from '@/components/gov/GovPanel'
import { HeatmapMatrix, MiniBar } from '@/components/charts'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { resolutionService } from '@/services'
import type { OwnershipProtocolState, ResolutionCase } from '@/domains/resolution/engine'
import { usePageMasthead } from '@/stores/masthead.store'
import { WARDS } from '@/data/reference'
import { COMPLAINT_CATEGORY_LABEL, type ComplaintCategory } from '@/types/operations'
import { formatPercent } from '@/utils/format'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/command/ResolutionIntelligencePage.tsx
 *
 * Municipal Resolution Intelligence.
 *
 * A complaint tells the corporation how loud a problem is; routing it to a
 * department only says where it landed. This screen answers the harder
 * question: who actually owns it and on what evidence, what else the same
 * problem depends on, whether it is converging on a resolution or bouncing
 * between departments, and how likely it is to breach its SLA before that
 * happens.
 *
 * Every complaint in scope becomes a Resolution Case via
 * `domains/resolution/engine.ts`. Ownership is never asserted as fact - the
 * evidence behind each assignment is shown, and a case whose runner-up
 * department scores close to the winner is flagged as contested rather than
 * silently resolved. This is advisory intelligence: a named officer confirms
 * ownership on any contested or multi-department case.
 *
 * What this page deliberately does not rebuild: a graph-visualisation read of
 * how wards, works and decisions connect already exists at Municipal
 * Knowledge Graph (`/strategic/knowledge-graph`) and City Infrastructure
 * Graph (`/strategic/infrastructure-graph`); a spatial digital-twin view
 * already exists at Urban Digital Twin (`/strategic/digital-twin`); and a
 * governed conversational assistant already exists at Municipal Copilot
 * (`/ai/copilot`). Duplicating any of those here would disagree with them the
 * first time the underlying data moved. This page cross-references them
 * instead of re-deriving them.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-30),
  refreshIntervalMinutes: 60,
  origin: 'derived-metric' as const,
  sourceState: 'operational' as const,
  stale: false,
}

function build$PROTOCOL_LABEL(): Record<OwnershipProtocolState, string> {
  return {
    accepted: t('Accepted'),
    'accepted-with-dependency': t('Accepted w/ dependency'),
    challenged: t('Challenged'),
    'joint-ownership': t('Joint ownership'),
    escalated: t('Escalated'),
  }
}
let PROTOCOL_LABEL: Record<OwnershipProtocolState, string> = build$PROTOCOL_LABEL()
registerLayer(() => {
  PROTOCOL_LABEL = build$PROTOCOL_LABEL()
})

function protocolTone(state: OwnershipProtocolState): BadgeTone {
  switch (state) {
    case 'accepted':
      return 'positive'
    case 'accepted-with-dependency':
      return 'intel'
    case 'challenged':
      return 'warn'
    case 'joint-ownership':
      return 'info'
    case 'escalated':
      return 'critical'
  }
}

function CaseSignals({ c }: { c: ResolutionCase }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {c.isMultiDepartment ? <Badge tone="intel">{t('Multi-department')}</Badge> : null}
      {c.ownershipConflict ? <Badge tone="warn">{t('Ownership conflict')}</Badge> : null}
      {c.isTransferLoop ? <Badge tone="critical">{t('Transfer loop')}</Badge> : null}
      {c.isRecurring ? <Badge tone="muted">{t('Recurring')}</Badge> : null}
    </div>
  )
}

function Objective({
  up,
  label,
  value,
  detail,
}: {
  up: boolean
  label: string
  value: string
  detail: string
}): React.JSX.Element {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-ink-100 p-2.5">
      {up ? (
        <ArrowUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok-600" aria-hidden />
      ) : (
        <ArrowDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok-600" aria-hidden />
      )}
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-medium text-ink-700">{label}</span>
          <span className="numeric shrink-0 text-sm font-bold text-ink-900">{value}</span>
        </div>
        <p className="mt-0.5 text-[0.6875rem] text-ink-500">{detail}</p>
      </div>
    </li>
  )
}

export function ResolutionIntelligencePage(): React.JSX.Element {
  const [wardId, setWardId] = useState<string>('')
  const [category, setCategory] = useState<string>('')
  const [selectedPair, setSelectedPair] = useState<string | null>(null)

  usePageMasthead(t('Resolution Intelligence'))

  const filters = useMemo(
    () => ({
      ...(wardId ? { wardId } : {}),
      ...(category ? { category: category as ComplaintCategory } : {}),
    }),
    [wardId, category],
  )

  const scopeKey = `${wardId}:${category}`
  const snapshotQuery = useServiceQuery(queryKeys.resolution(`snapshot:${scopeKey}`), (u) =>
    resolutionService.snapshot(u, filters),
  )
  const queueQuery = useServiceQuery(queryKeys.resolution(`queue:${scopeKey}`), (u) => resolutionService.queue(u, filters))
  const multiQuery = useServiceQuery(queryKeys.resolution(`multi:${scopeKey}`), (u) =>
    resolutionService.multiDepartment(u, filters),
  )
  const loopsQuery = useServiceQuery(queryKeys.resolution(`loops:${scopeKey}`), (u) =>
    resolutionService.transferLoops(u, filters),
  )
  const flowsQuery = useServiceQuery(queryKeys.resolution(`flows:${scopeKey}`), (u) =>
    resolutionService.transferFlows(u, filters),
  )
  const qualityQuery = useServiceQuery(queryKeys.resolution(`quality:${scopeKey}`), (u) =>
    resolutionService.qualityIndex(u, filters),
  )
  const protocolQuery = useServiceQuery(queryKeys.resolution(`protocol:${scopeKey}`), (u) =>
    resolutionService.protocolBreakdown(u, filters),
  )
  const confidenceQuery = useServiceQuery(queryKeys.resolution(`confidence:${scopeKey}`), (u) =>
    resolutionService.confidenceProfile(u, filters),
  )
  const fusionQuery = useServiceQuery(queryKeys.resolution(`fusion:${scopeKey}`), (u) =>
    resolutionService.fusionFunnel(u, filters),
  )
  const contextQuery = useServiceQuery(queryKeys.resolution(`context:${scopeKey}`), (u) =>
    resolutionService.context(u, filters),
  )
  const briefQuery = useServiceQuery(queryKeys.resolution(`brief:${scopeKey}`), (u) => resolutionService.brief(u, filters))

  if (snapshotQuery.isLoading) return <LoadingState variant="metrics" />
  if (snapshotQuery.error) {
    return <ErrorState detail={snapshotQuery.error.message} onRetry={() => snapshotQuery.refetch()} />
  }

  const snapshot = snapshotQuery.data
  const queue = queueQuery.data ?? []
  const multi = multiQuery.data ?? []
  const loops = loopsQuery.data ?? []
  const flows = flowsQuery.data ?? []
  const quality = qualityQuery.data
  const protocol = protocolQuery.data ?? []
  const confidence = confidenceQuery.data
  const fusion = fusionQuery.data
  const caseContext = contextQuery.data
  const brief = briefQuery.data

  const contested = queue.find((c) => c.ownershipConflict) ?? queue[0]
  const orchestrated = multi[0]

  const escalatedCount = protocol.find((p) => p.state === 'escalated')?.count ?? 0
  const accountabilityPct = snapshot && snapshot.incoming > 0 ? Math.round((1 - escalatedCount / snapshot.incoming) * 1000) / 10 : 100
  const avgDelayAcrossFlows =
    flows.length > 0 ? Math.round((flows.reduce((s, f) => s + f.avgDelayHours, 0) / flows.length) * 10) / 10 : 0

  const deptIds = [...new Set(flows.flatMap((f) => [f.fromId, f.toId]))]
  const deptLabelById = new Map(flows.flatMap((f) => [[f.fromId, f.fromLabel] as const, [f.toId, f.toLabel] as const]))
  const heatmapValues: Record<string, Record<string, number>> = {}
  for (const f of flows) {
    heatmapValues[f.fromId] = { ...(heatmapValues[f.fromId] ?? {}), [f.toId]: f.volume }
    heatmapValues[f.toId] = { ...(heatmapValues[f.toId] ?? {}), [f.fromId]: f.volume }
  }
  const selectedFlow =
    flows.find((f) => `${f.fromId}|${f.toId}` === selectedPair || `${f.toId}|${f.fromId}` === selectedPair) ?? flows[0]

  const queueColumns: Array<Column<ResolutionCase>> = [
    {
      id: 'case',
      header: t('Case'),
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-800">{c.id}</p>
          <p className="truncate text-[0.625rem] text-ink-400">{c.problem}</p>
        </div>
      ),
      sortValue: (c) => c.id,
      searchValue: (c) => `${c.id} ${c.problem} ${c.localityName} ${c.wardLabel} ${c.categoryLabel}`,
      width: 'minmax(13rem,1.6fr)',
    },
    {
      id: 'location',
      header: t('Where'),
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-ink-700">{c.localityName}</p>
          <p className="truncate text-[0.625rem] text-ink-400">{c.wardLabel}</p>
        </div>
      ),
      sortValue: (c) => c.wardLabel,
      hideBelow: 'md',
    },
    {
      id: 'owner',
      header: t('Primary owner'),
      cell: (c) => (
        <div className="min-w-[8rem]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-medium text-ink-800">{c.primary.departmentLabel}</span>
            <span className="numeric shrink-0 text-[0.6875rem] font-semibold text-ink-600">{c.primary.confidencePct}%</span>
          </div>
          <MiniBar value={c.primary.confidencePct} className="mt-1" />
        </div>
      ),
      sortValue: (c) => c.primary.confidencePct,
    },
    {
      id: 'protocol',
      header: t('Protocol'),
      cell: (c) => <Badge tone={protocolTone(c.protocolState)}>{PROTOCOL_LABEL[c.protocolState]}</Badge>,
      sortValue: (c) => c.protocolState,
      hideBelow: 'lg',
    },
    {
      id: 'signals',
      header: t('Signals'),
      cell: (c) => <CaseSignals c={c} />,
      hideBelow: 'lg',
    },
    {
      id: 'sla',
      header: t('SLA breach risk'),
      align: 'right',
      cell: (c) => (
        <Badge tone={c.slaBreachProbabilityPct >= 75 ? 'critical' : c.slaBreachProbabilityPct >= 50 ? 'warn' : 'positive'}>
          {formatPercent(c.slaBreachProbabilityPct, 0)}
        </Badge>
      ),
      sortValue: (c) => c.slaBreachProbabilityPct,
    },
    {
      id: 'severity',
      header: t('Severity'),
      cell: (c) => <SeverityBadge severity={c.severity} />,
      sortValue: (c) => c.severity,
      hideBelow: 'lg',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Command Centre')}
        breadcrumbs={[{ label: t('Command Centre') }, { label: t('Resolution Intelligence') }]}
        freshness={FRESHNESS}
        controls={
          <>
            <div className="w-full max-w-[14rem]">
              <Label htmlFor="ri-ward">{t('Ward')}</Label>
              <Select
                id="ri-ward"
                value={wardId}
                onChange={(e) => setWardId(e.target.value)}
                aria-label={t('Filter by ward')}
                options={[
                  { value: '', label: t('All authorised wards') },
                  ...WARDS.map((w) => ({ value: w.id, label: `${w.code} - ${w.name.split(' · ')[0]}` })),
                ]}
              />
            </div>
            <div className="w-full max-w-[14rem]">
              <Label htmlFor="ri-category">{t('Service category')}</Label>
              <Select
                id="ri-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label={t('Filter by service category')}
                options={[
                  { value: '', label: t('All categories') },
                  ...Object.entries(COMPLAINT_CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
                ]}
              />
            </div>
          </>
        }
      />

      <DemonstrationNotice />

      {/* Today's resolution position -------------------------------- */}
      <MetricGrid columns={4}>
        <MetricCard
          label={t('Cases in scope')}
          value={snapshot?.incoming ?? 0}
          support={t('Every complaint in your authorised scope, read as a resolution case')}
          icon={<MessageSquareWarning className="h-4 w-4" />}
          background="red"
        />
        <MetricCard
          label={t('First-time-right routing')}
          value={formatPercent(snapshot?.firstTimeRightPct ?? 0)}
          tone={(snapshot?.firstTimeRightPct ?? 0) >= 80 ? 'positive' : (snapshot?.firstTimeRightPct ?? 0) >= 60 ? 'default' : 'warn'}
          support={t('Cases that reached their owner without a single transfer')}
          icon={<GitBranch className="h-4 w-4" />}
          background="blue"
        />
        <MetricCard
          label={t('Multi-department cases')}
          value={snapshot?.multiDepartmentCases ?? 0}
          support={t('Decomposed into coordinated tasks rather than transferred')}
          icon={<Users2 className="h-4 w-4" />}
          background="amber"
        />
        <MetricCard
          label={t('Ownership conflicts')}
          value={snapshot?.ownershipConflicts ?? 0}
          tone={(snapshot?.ownershipConflicts ?? 0) > 0 ? 'warn' : 'default'}
          support={t('Runner-up department scores within 20 points of the primary')}
          icon={<Scale className="h-4 w-4" />}
          background="orange"
        />
        <MetricCard
          label={t('Transfer loops')}
          value={snapshot?.transferLoops ?? 0}
          tone={(snapshot?.transferLoops ?? 0) > 0 ? 'critical' : 'default'}
          support={t('Cases the engine believes are bouncing between departments')}
          icon={<Repeat className="h-4 w-4" />}
          background="teal"
        />
        <MetricCard
          label={t('SLA at risk')}
          value={snapshot?.slaAtRisk ?? 0}
          tone={(snapshot?.slaAtRisk ?? 0) > 0 ? 'critical' : 'default'}
          support={t('Open cases with a predicted breach probability of 60% or more')}
          icon={<Timer className="h-4 w-4" />}
          background="gold"
        />
        <MetricCard
          label={t('Recurring problems')}
          value={snapshot?.recurringProblems ?? 0}
          support={t('Cases raised before at the same locality and category')}
          icon={<RefreshCcw className="h-4 w-4" />}
          background="neutral"
        />
        <MetricCard
          label={t('Resolution Quality Index')}
          value={quality?.score ?? 0}
          unit="/100"
          tone={(quality?.score ?? 0) >= 75 ? 'positive' : (quality?.score ?? 0) >= 55 ? 'default' : 'warn'}
          support={t('Weighted composite - every weight published in the panel below')}
          icon={<Award className="h-4 w-4" />}
          background="green"
        />
      </MetricGrid>

      {/* Auto-brief ---------------------------------------------------- */}
      <Card tone="sunken" className="flex items-start gap-2.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-semibold tracking-wide text-ink-400 uppercase">{t('Today\'s brief')}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-700">
            {brief ?? t('Loading…')}
          </p>
          <p className="mt-1.5 text-[0.625rem] leading-relaxed text-ink-400">
            {t('Generated from this page\'s own aggregates. A conversational answer to an arbitrary question - "why did this deteriorate this week?" - belongs to the governed Municipal Copilot, which carries the trend history and retrieval this brief does not.')}
          </p>
        </div>
      </Card>

      {/* Pilot scorecard ------------------------------------------------ */}
      <GovPanel
        title={t('BMC Zero-Transfer Mission — Pilot Scorecard')}
        tone="primary"
        dense
        actions={<Badge tone="intel">{t('Backtest on historical complaints, shadow mode before live routing')}</Badge>}
      >
        <ul className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Objective up label={t('First-time-right routing')} value={formatPercent(snapshot?.firstTimeRightPct ?? 0)} detail={t('Target: rising')} />
          <Objective up={false} label={t('Transfer loops')} value={String(snapshot?.transferLoops ?? 0)} detail={t('Target: falling')} />
          <Objective up={false} label={t('Time lost between departments')} value={t('{0}h avg', avgDelayAcrossFlows)} detail={t('Added on top of age, per dependency')} />
          <Objective up={false} label={t('SLA breaches at risk')} value={String(snapshot?.slaAtRisk ?? 0)} detail={t('Target: falling')} />
          <Objective up={false} label={t('Repeat complaints')} value={String(snapshot?.recurringProblems ?? 0)} detail={t('Target: falling')} />
          <Objective up label={t('Verified resolution')} value={formatPercent(snapshot?.verifiedResolutionPct ?? 0)} detail={t('Of closed cases')} />
          <Objective up label={t('Accountability')} value={formatPercent(accountabilityPct)} detail={t('Cases resolved without escalation')} />
          <Objective up label={t('Resolution Quality Index')} value={`${quality?.score ?? 0}/100`} detail={t('Weighted composite')} />
        </ul>
      </GovPanel>

      <SplitLayout
        asideWidth="lg"
        main={
          <>
            {/* Priority queue --------------------------------------- */}
            <GovPanel
              title={t('Needs Intervention Now')}
              tone="red"
              dense
              actions={<Badge tone="intel">{t('Ranked by impact, urgency, recurrence and SLA risk')}</Badge>}
            >
              {queue.length === 0 ? (
                <EmptyState className="mx-3 mb-3" title={t('No open case in scope')} detail={t('Every case in this scope is closed.')} />
              ) : (
                <DataTable
                  rows={queue}
                  columns={queueColumns}
                  rowKey={(c) => c.id}
                  pageSize={12}
                  stickyHeader
                  maxHeight="28rem"
                  searchPlaceholder={t('Search case, locality or ward')}
                />
              )}
            </GovPanel>

            {/* Complaint Fusion ---------------------------------------- */}
            <GovPanel title={t('Complaint Fusion: Duplicate → Cluster → Incident')} tone="amber" dense className="mt-4">
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('Repeat reports at the same locality and service category are fused into one cluster. A cluster severe or large enough is read as a single probable incident needing one coordinated case, not many disconnected ones.')}
              </p>
              <div className="mx-3 mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-ink-100 p-3 text-center">
                  <p className="numeric text-xl font-bold text-ink-900">{fusion?.complaints ?? 0}</p>
                  <p className="text-[0.625rem] text-ink-500">{t('Complaints')}</p>
                </div>
                <div className="rounded-lg border border-ink-100 p-3 text-center">
                  <p className="numeric text-xl font-bold text-ink-900">{fusion?.clusters ?? 0}</p>
                  <p className="text-[0.625rem] text-ink-500">{t('Clusters')}</p>
                </div>
                <div className="rounded-lg border border-crit-200 bg-crit-50 p-3 text-center">
                  <p className="numeric text-xl font-bold text-crit-700">{fusion?.incidents ?? 0}</p>
                  <p className="text-[0.625rem] text-crit-600">{t('Probable incidents')}</p>
                </div>
              </div>
              {!fusion || fusion.incidentCases.length === 0 ? (
                <EmptyState className="mx-3 mb-3" title={t('No cluster reaches the incident threshold in scope')} />
              ) : (
                <ul className="mx-3 mb-3 space-y-1.5">
                  {fusion.incidentCases.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-sunken px-2.5 py-1.5">
                      <span className="min-w-0 truncate text-xs text-ink-700">
                        {c.localityName} · {c.categoryLabel} · {c.wardLabel}
                      </span>
                      <Badge tone="critical">{t('{0} reports', c.complaints)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </GovPanel>

            {/* Case context / root cause -------------------------------- */}
            <GovPanel title={t('Case Context & Root Cause Signal')} tone="green" dense className="mt-4">
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('The Root-Cause Engine\'s read for the highest-priority recurring cluster in scope, and the closest this page comes to a case digital twin: the infrastructure records the corporation already holds at that location. An association of place and category, never a finding of cause.')}
              </p>
              {!caseContext ? (
                <EmptyState className="mx-3 mb-3" title={t('No recurring cluster reaches the reporting threshold in scope')} />
              ) : (
                <div className="mx-3 mb-3 rounded-lg border border-ink-100 p-3">
                  <p className="text-[0.6875rem] font-semibold tracking-wide text-ink-400 uppercase">
                    {caseContext.cluster.localityName} · {caseContext.cluster.categoryLabel}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-600">{caseContext.association.statement}</p>
                  {caseContext.association.issues.length > 0 ? (
                    <ul className="mt-2.5 space-y-1.5">
                      {caseContext.association.issues.map((issue) => (
                        <li key={issue.id} className="flex items-start gap-2 rounded-md bg-surface-sunken px-2.5 py-1.5">
                          <SeverityBadge severity={issue.severity} />
                          <div className="min-w-0">
                            <p className="truncate text-[0.75rem] font-medium text-ink-800">{issue.label}</p>
                            <p className="text-[0.6875rem] leading-relaxed text-ink-500">{issue.detail}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </GovPanel>

            {/* Ownership intelligence --------------------------------- */}
            <GovPanel title={t('Ownership Intelligence')} tone="amber" dense className="mt-4">
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('Ownership is recommended, never asserted. Rules, jurisdiction, the asset record, historical resolution pattern and complaint wording each contribute evidence to a confidence score - a case whose runner-up department scores close behind the winner is a contested case, not a settled one.')}
              </p>
              {!contested ? (
                <EmptyState className="mx-3 mb-3" title={t('No case in scope')} />
              ) : (
                <div className="mx-3 mb-3 rounded-lg border border-ink-100 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[0.6875rem] font-semibold tracking-wide text-ink-400 uppercase">
                      {contested.id} · {contested.categoryLabel}
                    </p>
                    <Badge tone={protocolTone(contested.protocolState)}>{PROTOCOL_LABEL[contested.protocolState]}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-600">{contested.problem}</p>
                  <p className="mt-1 text-[0.6875rem] text-ink-500">
                    {t('Assigned officer: {0}', contested.assignedOfficerLabel)}
                  </p>

                  <div className="mt-3 rounded-md bg-surface-sunken p-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[0.8125rem] font-semibold text-ink-900">{contested.primary.departmentLabel}</span>
                      <span className="numeric text-sm font-bold text-ok-700">{contested.primary.confidencePct}%</span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {contested.primary.evidence.map((e) => (
                        <li key={e.label} className="flex items-baseline justify-between text-[0.6875rem] text-ink-500">
                          <span>{e.label}</span>
                          <span className="numeric font-medium text-ink-700">+{e.points}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {contested.alternative ? (
                    <div className="mt-2 rounded-md border border-dashed border-ink-200 p-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-ink-700">
                          {t('Alternative: {0}', contested.alternative.departmentLabel)}
                        </span>
                        <span className="numeric text-xs font-semibold text-ink-500">{contested.alternative.confidencePct}%</span>
                      </div>
                      {contested.ownershipConflict ? (
                        <p className="mt-1 text-[0.6875rem] leading-relaxed text-warn-700">
                          {t('Within 20 points of the primary assignment - an officer should confirm ownership before work begins.')}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </GovPanel>

            {/* Multi-department orchestration --------------------------- */}
            <GovPanel title={t('Multi-Department Case Orchestration')} tone="green" dense className="mt-4">
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('A problem that touches more than one department is decomposed into one case with several tasks - nobody transfers the citizen\'s complaint.')}
              </p>
              {!orchestrated ? (
                <EmptyState
                  className="mx-3 mb-3"
                  title={t('No multi-department case in scope')}
                  detail={t('No open case in this scope currently depends on more than one department.')}
                />
              ) : (
                <div className="mx-3 mb-3 rounded-lg border border-ink-100 p-3">
                  <p className="text-[0.6875rem] font-semibold tracking-wide text-ink-400 uppercase">
                    {orchestrated.id} · {orchestrated.wardLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-600">{orchestrated.problem}</p>
                  <ol className="mt-2.5 space-y-1.5">
                    {orchestrated.tasks.map((task, i) => (
                      <li key={task.id} className="flex items-start gap-2 rounded-md bg-surface-sunken px-2.5 py-1.5">
                        <span className="numeric mt-0.5 shrink-0 text-[0.625rem] font-bold text-ink-400">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-[0.75rem] font-medium text-ink-800">
                            {task.departmentLabel}
                            <Badge
                              tone={task.role === 'primary' ? 'intel' : task.role === 'verification' ? 'positive' : 'muted'}
                              className="ml-1.5"
                            >
                              {task.role === 'primary' ? t('Primary owner') : task.role === 'verification' ? t('Verification') : t('Co-owner')}
                            </Badge>
                          </p>
                          <p className="text-[0.6875rem] leading-relaxed text-ink-500">{task.action}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </GovPanel>

            {/* No-Ping-Pong Protocol ------------------------------------ */}
            <GovPanel title={t('No-Ping-Pong Protocol')} tone="amber" dense className="mt-4">
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('A department cannot merely forward a case. It accepts, accepts with a dependency, or challenges ownership with a proposed correct owner. An unresolved challenge becomes joint ownership or is referred to escalation authority - never left to bounce indefinitely.')}
              </p>
              <ul className="mx-3 mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {protocol.map((p) => (
                  <li key={p.state} className="rounded-lg border border-ink-100 p-2.5 text-center">
                    <p className="numeric text-lg font-bold text-ink-900">{p.count}</p>
                    <p className="text-[0.625rem] text-ink-500">{p.label}</p>
                  </li>
                ))}
              </ul>
            </GovPanel>
          </>
        }
        aside={
          <>
            {/* Resolution Quality Index --------------------------------- */}
            <GovPanel title={t('Resolution Quality Index')} tone="green" dense>
              <div className="flex items-center gap-3 border-b border-ink-100 px-3 py-3">
                <p className="numeric text-3xl font-bold text-ink-900">{quality?.score ?? 0}</p>
                <p className="text-[0.6875rem] leading-snug text-ink-500">
                  {t('of 100 · weighted composite - every weight and contribution published below')}
                </p>
              </div>
              <div className="scrollbar-slim overflow-x-auto">
                <table className="w-full text-[0.6875rem]">
                  <thead>
                    <tr className="border-b border-ink-100 bg-surface-sunken text-left">
                      <th className="px-2.5 py-1 font-bold tracking-wide text-ink-500 uppercase">{t('Component')}</th>
                      <th className="px-2 py-1 text-right font-bold tracking-wide text-ink-500 uppercase">{t('Wt')}</th>
                      <th className="px-2 py-1 text-right font-bold tracking-wide text-ink-500 uppercase">{t('Score')}</th>
                      <th className="px-2.5 py-1 text-right font-bold tracking-wide text-ink-500 uppercase">{t('Contrib.')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(quality?.components ?? []).map((c) => (
                      <tr key={c.id} className="border-b border-ink-100 last:border-b-0 even:bg-ink-50/40">
                        <td className="truncate px-2.5 py-[0.3125rem] text-ink-700">{c.label}</td>
                        <td className="numeric px-2 py-[0.3125rem] text-right text-ink-500 tabular-nums">{Math.round(c.weight * 100)}%</td>
                        <td className="numeric px-2 py-[0.3125rem] text-right text-ink-700 tabular-nums">{c.score.toFixed(0)}</td>
                        <td className="numeric px-2.5 py-[0.3125rem] text-right font-semibold text-ink-900 tabular-nums">
                          {c.contribution.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GovPanel>

            {/* Department Responsibility Heatmap ------------------------ */}
            <GovPanel title={t('Department Responsibility Heatmap')} tone="amber">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                {t('Where a multi-department case creates a real dependency between two departments. Click a cell to see its volume, loop share, delay and dominant category.')}
              </p>
              {deptIds.length < 2 ? (
                <EmptyState title={t('No dependency in scope')} />
              ) : (
                <>
                  <div className="h-[16rem]">
                    <HeatmapMatrix
                      rows={deptIds.map((id) => ({ id, label: deptLabelById.get(id) ?? id }))}
                      columns={deptIds.map((id) => ({ id, label: deptLabelById.get(id) ?? id }))}
                      values={heatmapValues}
                      onCellClick={(rowId, colId) => setSelectedPair(`${rowId}|${colId}`)}
                      legendLow={t('Fewer cases')}
                      legendHigh={t('More cases')}
                    />
                  </div>
                  {selectedFlow ? (
                    <div className="mt-3 rounded-lg border border-ink-100 p-2.5">
                      <p className="text-[0.8125rem] font-semibold text-ink-800">
                        {selectedFlow.fromLabel} ↔ {selectedFlow.toLabel}
                      </p>
                      <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">
                        {t('{0} case(s) · {1} loop share · avg {2}h added · mostly {3}', selectedFlow.volume, formatPercent(selectedFlow.loopSharePct, 0), selectedFlow.avgDelayHours, selectedFlow.topCategory)}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </GovPanel>

            {/* Predictive intelligence ----------------------------------- */}
            <GovPanel title={t('Predictive Intelligence: Where Risk Is Building')} tone="amber">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                {t('Localities below the incident threshold today but already showing repeat reports - a candidate for pre-emptive inspection before it becomes a full incident.')}
              </p>
              {!fusion || fusion.emergingRisk.length === 0 ? (
                <EmptyState title={t('No emerging cluster in scope')} />
              ) : (
                <ul className="space-y-2">
                  {fusion.emergingRisk.map((c) => (
                    <li key={c.id} className="rounded-lg border border-ink-100 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-[0.8125rem] font-medium text-ink-800">{c.localityName}</p>
                        <Badge tone="warn">{t('{0} reports', c.complaints)}</Badge>
                      </div>
                      <p className="mt-1 text-[0.6875rem] text-ink-500">
                        {c.categoryLabel} · {c.wardLabel}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </GovPanel>

            {/* No-Ping-Pong: loops ---------------------------------------- */}
            <GovPanel title={t('No-Ping-Pong: Transfer Loops Detected')} tone="red">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                {t('Cases bouncing between departments instead of converging - a structural routing problem, not a complaint volume problem.')}
              </p>
              {loops.length === 0 ? (
                <EmptyState title={t('No transfer loop detected in scope')} />
              ) : (
                <ul className="mt-3 space-y-2">
                  {loops.slice(0, 8).map((c) => (
                    <li key={c.id} className="rounded-lg border border-ink-100 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-[0.8125rem] font-medium text-ink-800">{c.id}</p>
                        <Badge tone="critical">{t('{0} transfers', c.transferCount)}</Badge>
                      </div>
                      <p className="mt-1 text-[0.6875rem] text-ink-500">
                        {c.categoryLabel} · {c.wardLabel} · {c.primary.departmentLabel}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </GovPanel>

            {/* Routing confidence & evaluation readiness ------------------ */}
            <GovPanel title={t('Routing Confidence & Evaluation Readiness')} tone="muted">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                {t('A precision/recall evaluation needs a ground truth this demonstration does not have - a corpus of officer-confirmed correct owners. What can be shown honestly today is the confidence distribution the engine produced, and the share of cases it flags for an officer rather than deciding outright.')}
              </p>
              <ul className="space-y-2.5">
                <li>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-ink-700">{t('High confidence (≥85%)')}</span>
                    <span className="numeric text-[0.6875rem] font-semibold text-ink-800">{formatPercent(confidence?.highConfidencePct ?? 0, 0)}</span>
                  </div>
                  <MiniBar value={confidence?.highConfidencePct ?? 0} className="mt-1" />
                </li>
                <li>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-ink-700">{t('Medium confidence (70–84%)')}</span>
                    <span className="numeric text-[0.6875rem] font-semibold text-ink-800">{formatPercent(confidence?.mediumConfidencePct ?? 0, 0)}</span>
                  </div>
                  <MiniBar value={confidence?.mediumConfidencePct ?? 0} className="mt-1" />
                </li>
                <li>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-ink-700">{t('Low confidence (<70%)')}</span>
                    <span className="numeric text-[0.6875rem] font-semibold text-ink-800">{formatPercent(confidence?.lowConfidencePct ?? 0, 0)}</span>
                  </div>
                  <MiniBar value={confidence?.lowConfidencePct ?? 0} className="mt-1" />
                </li>
                <li>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-ink-700">{t('Override-eligible (contested or looping)')}</span>
                    <span className="numeric text-[0.6875rem] font-semibold text-ink-800">{formatPercent(confidence?.overrideEligiblePct ?? 0, 0)}</span>
                  </div>
                  <MiniBar value={confidence?.overrideEligiblePct ?? 0} className="mt-1" />
                </li>
              </ul>
              <p className="mt-3 text-[0.625rem] leading-snug text-ink-400">
                {t('A Learning Loop that compares this recommendation against the officer\'s final assignment and the verified outcome is the target architecture\'s next stage, not something this demonstration environment can show without that ground truth.')}
              </p>
            </GovPanel>

            <Card tone="sunken">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-semibold text-ink-800">{t('AI safety architecture')}</p>
                  <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">
                    {t('The Ownership Intelligence Engine (deterministic rules, jurisdiction, the asset record, historical resolution pattern and complaint wording) is advisory only. It cannot: reject a citizen complaint; silently discard a case; make an autonomous punitive or regulatory decision; accuse an officer or contractor of fault; invent a responsibility the evidence does not support; or expose citizen personal data. Every recommendation carries its evidence, its confidence, the reason for the assignment, a path to human override, and an audit record.')}
                  </p>
                </div>
              </div>
            </Card>
          </>
        }
      />
    </PageBody>
  )
}

export default ResolutionIntelligencePage
