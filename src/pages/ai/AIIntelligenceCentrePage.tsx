import { useMemo, useState } from 'react'
import { AlertTriangle, Ban, Cpu } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { aiService } from '@/services'
import { DEMO_USERS } from '@/stores/auth.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { getRole } from '@/security'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatPercent } from '@/utils/format'
import { AI_USE_CASE_LABEL, GROUNDING_LABEL, type AIRequestRecord, type AIUseCase } from '@/types/ai'
import { DOMAIN_LABEL } from '@/types/common'
import {
  Badge,
  Card,
  ConfidenceBadge,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  Select,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { CategoryBarChart, ChartFrame, DonutChart } from '@/components/charts'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * AI Intelligence Centre.
 *
 * Every request the AI layer has processed, with its model, use case,
 * confidence, latency, grounding, citation volume, human review posture and
 * policy outcome - the operational instrument for governing AI use across
 * the platform, not a marketing dashboard of "AI activity".
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-5),
  refreshIntervalMinutes: 5,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const REVIEW_TONE: Record<AIRequestRecord['reviewStatus'], 'positive' | 'warn' | 'critical' | 'neutral'> = {
  'not-required': 'neutral',
  pending: 'warn',
  accepted: 'positive',
  modified: 'warn',
  rejected: 'critical',
  escalated: 'critical',
}

const POLICY_TONE: Record<AIRequestRecord['policyStatus'], 'positive' | 'warn' | 'critical'> = {
  passed: 'positive',
  flagged: 'warn',
  blocked: 'critical',
}

function build$LATENCY_BANDS() {
  return [
  { id: 'fast', label: t('< 300ms'), max: 300 },
  { id: 'moderate', label: t('300–600ms'), max: 600 },
  { id: 'slow', label: t('600–900ms'), max: 900 },
  { id: 'very-slow', label: t('≥ 900ms'), max: Infinity },
]
}
let LATENCY_BANDS: ReturnType<typeof build$LATENCY_BANDS> = build$LATENCY_BANDS()
registerLayer(() => {
  LATENCY_BANDS = build$LATENCY_BANDS()
})

export function AIIntelligenceCentrePage(): React.JSX.Element {
  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(t('AI Intelligence Centre'))

  const requestsQuery = useServiceQuery(queryKeys.ai('requests-all'), (u) => aiService.requests(u, { pageSize: 300 }))

  const [useCaseFilter, setUseCaseFilter] = useState<'all' | AIUseCase>('all')
  const [modelFilter, setModelFilter] = useState<string>('all')
  const [reviewFilter, setReviewFilter] = useState<'all' | AIRequestRecord['reviewStatus']>('all')
  const [policyFilter, setPolicyFilter] = useState<'all' | AIRequestRecord['policyStatus']>('all')
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | AIRequestRecord['confidence']>('all')

  const requests = requestsQuery.data?.items ?? []

  const userNameById = useMemo(() => new Map(DEMO_USERS.map((u) => [u.id, u])), [])
  const models = useMemo(() => Array.from(new Set(requests.map((r) => r.modelId))).sort(), [requests])

  const filtered = useMemo(
    () =>
      requests.filter((r) => {
        if (useCaseFilter !== 'all' && r.useCase !== useCaseFilter) return false
        if (modelFilter !== 'all' && r.modelId !== modelFilter) return false
        if (reviewFilter !== 'all' && r.reviewStatus !== reviewFilter) return false
        if (policyFilter !== 'all' && r.policyStatus !== policyFilter) return false
        if (confidenceFilter !== 'all' && r.confidence !== confidenceFilter) return false
        return true
      }),
    [requests, useCaseFilter, modelFilter, reviewFilter, policyFilter, confidenceFilter],
  )

  const flaggedOrBlocked = requests.filter((r) => r.policyStatus === 'flagged' || r.policyStatus === 'blocked')

  const avgLatency = requests.length > 0 ? requests.reduce((s, r) => s + r.latencyMs, 0) / requests.length : 0
  const evidenceBackedShare =
    requests.length > 0 ? (requests.filter((r) => r.grounding === 'evidence-backed').length / requests.length) * 100 : 0

  const byUseCase = useMemo(() => {
    const counts = new Map<AIUseCase, number>()
    for (const r of requests) counts.set(r.useCase, (counts.get(r.useCase) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([useCase, value]) => ({ label: AI_USE_CASE_LABEL[useCase], value }))
      .sort((a, b) => b.value - a.value)
  }, [requests])

  const byConfidence = useMemo(() => {
    const bands = { high: 0, medium: 0, low: 0 }
    for (const r of requests) bands[r.confidence] += 1
    return [
      { label: t('High'), value: bands.high, colour: '#10b981' },
      { label: t('Medium'), value: bands.medium, colour: '#f59e0b' },
      { label: t('Low'), value: bands.low, colour: '#e5484d' },
    ]
  }, [requests])

  const byLatency = useMemo(
    () =>
      LATENCY_BANDS.map((band, i) => {
        const prevMax = LATENCY_BANDS[i - 1]?.max ?? 0
        return { label: band.label, value: requests.filter((r) => r.latencyMs > prevMax && r.latencyMs <= band.max).length }
      }),
    [requests],
  )

  const columns: Array<Column<AIRequestRecord>> = [
    {
      id: 'useCase',
      header: t('Use case'),
      cell: (row) => <Badge tone="intel">{AI_USE_CASE_LABEL[row.useCase]}</Badge>,
      sortValue: (row) => row.useCase,
      searchValue: (row) => `${AI_USE_CASE_LABEL[row.useCase]} ${row.prompt}`,
    },
    { id: 'model', header: t('Model / provider'), cell: (row) => <span className="font-mono text-[0.6875rem]">{row.modelId}</span>, sortValue: (row) => row.modelId, hideBelow: 'lg' },
    {
      id: 'confidence',
      header: t('Confidence'),
      cell: (row) => <ConfidenceBadge confidence={row.confidence} />,
      sortValue: (row) => row.confidence,
    },
    {
      id: 'latency',
      header: t('Latency'),
      cell: (row) => <span className="numeric">{row.latencyMs} ms</span>,
      sortValue: (row) => row.latencyMs,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'grounding',
      header: t('Grounding'),
      cell: (row) => (
        <Badge tone={row.grounding === 'evidence-backed' ? 'positive' : 'neutral'}>{GROUNDING_LABEL[row.grounding]}</Badge>
      ),
      sortValue: (row) => row.grounding,
      hideBelow: 'lg',
    },
    {
      id: 'citations',
      header: t('Citations'),
      cell: (row) => <span className="numeric">{row.citationCount}</span>,
      sortValue: (row) => row.citationCount,
      align: 'center',
      hideBelow: 'xl',
    },
    {
      id: 'review',
      header: t('Human review'),
      cell: (row) => <Badge tone={REVIEW_TONE[row.reviewStatus]} dot>{row.reviewStatus.replace(/-/g, ' ')}</Badge>,
      sortValue: (row) => row.reviewStatus,
    },
    {
      id: 'policy',
      header: t('Policy status'),
      cell: (row) => (
        <Badge tone={POLICY_TONE[row.policyStatus]} title={row.policyNote}>
          {row.policyStatus}
        </Badge>
      ),
      sortValue: (row) => row.policyStatus,
    },
    {
      id: 'tokens',
      header: t('Tokens (in/out)'),
      cell: (row) => <span className="numeric text-ink-500">{row.tokensIn} / {row.tokensOut}</span>,
      sortValue: (row) => row.tokensIn + row.tokensOut,
      align: 'right',
      hideBelow: 'xl',
      optional: true,
    },
    {
      id: 'officer',
      header: t('Requesting officer'),
      cell: (row) => <span>{userNameById.get(row.requestedBy)?.name ?? row.requestedBy}</span>,
      sortValue: (row) => userNameById.get(row.requestedBy)?.name ?? row.requestedBy,
      hideBelow: 'xl',
      optional: true,
    },
    {
      id: 'role',
      header: t('Role'),
      cell: (row) => <span className="text-ink-500">{getRole(row.requestedByRole)?.name ?? row.requestedByRole}</span>,
      sortValue: (row) => row.requestedByRole,
      hideBelow: 'xl',
      optional: true,
    },
    {
      id: 'domains',
      header: t('Domains'),
      cell: (row) => <span className="truncate text-ink-500">{row.domains.map((d) => DOMAIN_LABEL[d]).join(', ') || '-'}</span>,
      sortValue: (row) => row.domains.join(','),
      hideBelow: 'xl',
      optional: true,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('AI & Automation')}
        breadcrumbs={[{ label: t('AI & Automation') }, { label: t('AI Intelligence Centre') }]}
        freshness={FRESHNESS}
      />

      {requestsQuery.isLoading ? <LoadingState variant="metrics" /> : null}
      {requestsQuery.error ? <ErrorState detail={requestsQuery.error.message} onRetry={() => requestsQuery.refetch()} /> : null}

      {!requestsQuery.isLoading && !requestsQuery.error ? (
        requests.length === 0 ? (
          <EmptyState title={t('No AI requests recorded')} detail="No AI request records are visible within your authorised scope." />
        ) : (
          <>
            <MetricGrid columns={6}>
              <MetricCard label={t('Total requests')} value={requests.length} icon={<Cpu className="h-4 w-4" />} background="red" />
              <MetricCard label={t('Average latency')} value={`${Math.round(avgLatency)} ms`} background="amber" />
              <MetricCard label={t('Evidence-backed share')} value={formatPercent(evidenceBackedShare)} tone="positive" background="green" />
              <MetricCard label={t('Flagged')} value={requests.filter((r) => r.policyStatus === 'flagged').length} tone="warn" />
              <MetricCard label={t('Blocked')} value={requests.filter((r) => r.policyStatus === 'blocked').length} tone={requests.some((r) => r.policyStatus === 'blocked') ? 'critical' : 'default'} />
              <MetricCard label={t('Pending review')} value={requests.filter((r) => r.reviewStatus === 'pending').length} tone="warn" />
            </MetricGrid>

            {/* ── Two columns ───────────────────────────────────────
                The log is the record and takes the wide column; the three
                distributions and the policy exceptions read beside it, where
                a shape in the chart can be checked against the rows that
                produced it without scrolling the table away. */}
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-8">
                  <GovPanel
                    title={t('AI request log')}
                    tone="amber"
                    dense
                    actions={
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            aria-label={t('Filter by use case')}
                            value={useCaseFilter}
                            onChange={(e) => setUseCaseFilter(e.target.value as typeof useCaseFilter)}
                            className="w-auto min-w-[10rem]"
                            options={[{ value: 'all', label: t('All use cases') }, ...(Object.keys(AI_USE_CASE_LABEL) as AIUseCase[]).map((u) => ({ value: u, label: AI_USE_CASE_LABEL[u] }))]}
                          />
                          <Select
                            aria-label={t('Filter by model')}
                            value={modelFilter}
                            onChange={(e) => setModelFilter(e.target.value)}
                            className="w-auto min-w-[9rem]"
                            options={[{ value: 'all', label: t('All models') }, ...models.map((m) => ({ value: m, label: m }))]}
                          />
                          <Select
                            aria-label={t('Filter by review status')}
                            value={reviewFilter}
                            onChange={(e) => setReviewFilter(e.target.value as typeof reviewFilter)}
                            className="w-auto min-w-[10rem]"
                            options={[
                              { value: 'all', label: t('All review statuses') },
                              { value: 'not-required', label: t('Not required') },
                              { value: 'pending', label: t('Pending') },
                              { value: 'accepted', label: t('Accepted') },
                              { value: 'modified', label: t('Modified') },
                              { value: 'rejected', label: t('Rejected') },
                              { value: 'escalated', label: t('Escalated') },
                            ]}
                          />
                          <Select
                            aria-label={t('Filter by policy status')}
                            value={policyFilter}
                            onChange={(e) => setPolicyFilter(e.target.value as typeof policyFilter)}
                            className="w-auto min-w-[9rem]"
                            options={[
                              { value: 'all', label: t('All policy statuses') },
                              { value: 'passed', label: t('Passed') },
                              { value: 'flagged', label: t('Flagged') },
                              { value: 'blocked', label: t('Blocked') },
                            ]}
                          />
                          <Select
                            aria-label={t('Filter by confidence')}
                            value={confidenceFilter}
                            onChange={(e) => setConfidenceFilter(e.target.value as typeof confidenceFilter)}
                            className="w-auto min-w-[9rem]"
                            options={[
                              { value: 'all', label: t('All confidence') },
                              { value: 'high', label: t('High') },
                              { value: 'medium', label: t('Medium') },
                              { value: 'low', label: t('Low') },
                            ]}
                          />
                        </div>
                      }
                    >
                    <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                      {t('Sortable, searchable and paginated. Column visibility can be adjusted for a narrower screen.')}
                    </p>
                    <DataTable
                      rows={filtered}
                      columns={columns}
                      rowKey={(row) => row.id}
                      pageSize={12}
                      stickyHeader
                      maxHeight="30rem"
                      searchPlaceholder="Search prompts"
                      initialSort={{ columnId: 'latency', direction: 'desc' }}
                      emptyTitle={t('No requests match these filters')}
                      emptyDetail="Adjust the filters above to widen the result set."
                    />
                  </GovPanel>
              </div>

              <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
                <Card>
                  <ChartFrame title={t('Requests by use case')} unit="requests" timeframe="All recorded requests" height={220}>
                    <CategoryBarChart data={byUseCase} series={[{ key: 'value', label: t('Requests'), colour: '#2f6feb' }]} layout="horizontal" />
                  </ChartFrame>
                </Card>
                <Card>
                  <ChartFrame title={t('Confidence distribution')} unit="requests" timeframe="All recorded requests" height={220}>
                    <DonutChart data={byConfidence} centreValue={String(requests.length)} centreLabel="Requests" />
                  </ChartFrame>
                </Card>
                <Card>
                  <ChartFrame title={t('Latency distribution')} unit="requests" timeframe="All recorded requests" height={220}>
                    <CategoryBarChart data={byLatency} series={[{ key: 'value', label: t('Requests'), colour: '#0ea5b7' }]} layout="vertical" />
                  </ChartFrame>
                </Card>

                {flaggedOrBlocked.length > 0 ? (
                  <GovPanel title={t('Flagged and blocked requests')} tone="critical">
                    <p className="mb-3 text-xs leading-relaxed text-ink-500">
                      {t('Requests the AI gateway policy flagged for review or blocked outright before reaching a model, with the recorded policy note.')}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {flaggedOrBlocked.map((r) => (
                        <li key={r.id} className="flex items-start gap-2 rounded-[2px] border border-warn-200 bg-warn-50/40 p-2.5 text-xs">
                          {r.policyStatus === 'blocked' ? (
                            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crit-600" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn-600" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-ink-800">
                              <Badge tone={POLICY_TONE[r.policyStatus]} className="mr-1.5">{r.policyStatus}</Badge>
                              {AI_USE_CASE_LABEL[r.useCase]} · {r.modelId}
                            </p>
                            <p className="mt-0.5 leading-relaxed text-ink-600">{r.policyNote ?? 'No policy note recorded.'}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </GovPanel>
                ) : null}
              </div>
            </div>
          </>
        )
      ) : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

export default AIIntelligenceCentrePage
