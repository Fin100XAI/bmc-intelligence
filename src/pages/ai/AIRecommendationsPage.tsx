import { useMemo, useState } from 'react'
import { AlertOctagon, Sparkles } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { aiService, type OversightFilters } from '@/services'
import { useCurrentUser } from '@/stores/auth.store'
import { allowed } from '@/security'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatPercent, formatRelative } from '@/utils/format'
import { AI_USE_CASE_LABEL, type AIRecommendationBlock, type AIRequestRecord, type HumanOversightRecord } from '@/types/ai'
import { DOMAIN_LABEL, type IntelligenceDomain } from '@/types/common'
import {
  Card,
  ConfirmDialog,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  Tabs,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { AIRecommendationCard } from '@/components/cards/domain-cards'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * AI Recommendations.
 *
 * The human-oversight register for every advisory recommendation the AI
 * layer has produced. Nothing here executes on its own - this page exists
 * specifically so that a named officer's Approve / Modify / Reject decision
 * is the technical mechanism by which a recommendation is ever acted on.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-30),
  refreshIntervalMinutes: 15,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

/** HumanOversightRecord carries no departmentId of its own; this attributes
 * a plausible owning department from the domain for display purposes only. */
const DOMAIN_DEPARTMENT: Partial<Record<IntelligenceDomain, string>> = {
  water: 'dept-hydraulic',
  sewerage: 'dept-sewerage',
  stormwater: 'dept-stormwater',
  monsoon: 'dept-disaster',
  waste: 'dept-solid-waste',
  roads: 'dept-roads',
  mobility: 'dept-mobility',
  health: 'dept-health',
  hospitals: 'dept-hospitals',
  emergency: 'dept-fire',
  disaster: 'dept-disaster',
  property: 'dept-assessment',
  revenue: 'dept-assessment',
  budget: 'dept-finance',
  procurement: 'dept-procurement',
  projects: 'dept-projects',
  buildings: 'dept-building',
  environment: 'dept-environment',
  coastal: 'dept-coastal',
  planning: 'dept-planning',
  assets: 'dept-estates',
  workforce: 'dept-personnel',
  security: 'dept-security',
  'ai-governance': 'dept-ai-governance',
  platform: 'dept-it',
  wards: 'dept-commissioner',
  executive: 'dept-commissioner',
}

function build$TABS(): Array<{ id: HumanOversightRecord['outcome']; label: string }> {
  return [
  { id: 'pending', label: t('Pending') },
  { id: 'accepted', label: t('Accepted') },
  { id: 'modified', label: t('Modified') },
  { id: 'rejected', label: t('Rejected') },
  { id: 'escalated', label: t('Escalated') },
]
}
let TABS: Array<{ id: HumanOversightRecord['outcome']; label: string }> = build$TABS()
registerLayer(() => {
  TABS = build$TABS()
})

function toRecommendationBlock(record: HumanOversightRecord, request: AIRequestRecord | undefined): AIRecommendationBlock {
  return {
    id: record.id,
    title: record.recommendationTitle,
    why: `Raised from a ${AI_USE_CASE_LABEL[record.useCase]} request in ${DOMAIN_LABEL[record.domain]}, submitted ${formatRelative(record.submittedAt)}.${request ? ` The originating request drew on ${request.citationCount} evidence citation${request.citationCount === 1 ? '' : 's'} with ${request.confidence} confidence.` : ''}`,
    evidenceRefs: [],
    expectedImpact: t('Addresses a {0} severity condition identified in {1}. Confirming, modifying or declining this recommendation is what determines whether it has any operational effect.', record.severity, DOMAIN_LABEL[record.domain]),
    confidence: request?.confidence ?? 'medium',
    dependencies: [],
    risks: request?.policyStatus === 'flagged' ? [request.policyNote ?? 'This request was flagged by AI governance policy.'] : [],
    humanOwnerRole: t('Accountable reviewing officer'),
    departmentId: DOMAIN_DEPARTMENT[record.domain] ?? 'dept-commissioner',
    requiresHumanApproval: true,
  }
}

export function AIRecommendationsPage(): React.JSX.Element {
  const user = useCurrentUser()
  const [tab, setTab] = useState<HumanOversightRecord['outcome']>('pending')
  const [dialog, setDialog] = useState<{ id: string; outcome: HumanOversightRecord['outcome']; title: string } | null>(null)

  const summaryQuery = useServiceQuery(queryKeys.ai('oversight-summary'), (u) => aiService.oversightSummary(u))
  const filters: OversightFilters = useMemo(() => ({ outcome: [tab], pageSize: 100 }), [tab])
  const oversightQuery = useServiceQuery(queryKeys.ai(`oversight:${tab}`), (u) => aiService.oversight(u, filters))
  const requestsQuery = useServiceQuery(queryKeys.ai('requests-for-oversight'), (u) => aiService.requests(u, { pageSize: 300 }))

  const review = useServiceAction(
    (u, id: string, outcome: HumanOversightRecord['outcome'], note?: string) => aiService.reviewRecommendation(u, id, outcome, note),
    [['bmc-mii', 'ai']],
  )

  const requestById = useMemo(() => {
    const map = new Map<string, AIRequestRecord>()
    for (const r of requestsQuery.data?.items ?? []) map.set(r.id, r)
    return map
  }, [requestsQuery.data])

  const summary = summaryQuery.data
  const records = oversightQuery.data?.items ?? []
  const mayReview = allowed(user, 'ai-governance', 'approve')

  const anyLoading = summaryQuery.isLoading || oversightQuery.isLoading
  const anyError = summaryQuery.error ?? oversightQuery.error

  const tabItems = TABS.map((tabDef) => ({
    id: tabDef.id,
    label: tabDef.label,
    count: summary
      ? tabDef.id === 'pending'
        ? summary.pending
        : tabDef.id === 'accepted'
          ? summary.accepted
          : tabDef.id === 'modified'
            ? summary.modified
            : tabDef.id === 'rejected'
              ? summary.rejected
              : summary.escalated
      : undefined,
  }))

  async function handleConfirm(reason: string): Promise<void> {
    if (!dialog) return
    await review(dialog.id, dialog.outcome, reason || undefined)
    setDialog(null)
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('AI & Automation')}
        title={t('AI Recommendations')}
        description={t('Every advisory recommendation the AI layer has produced, awaiting or carrying a named officer\'s decision. An AI recommendation is not an instruction - it becomes an action only once a competent, accountable officer approves it here.')}
        breadcrumbs={[{ label: t('AI & Automation') }, { label: t('AI Recommendations') }]}
        freshness={FRESHNESS}
      />

      {anyLoading ? <LoadingState variant="metrics" /> : null}
      {anyError ? (
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void summaryQuery.refetch()
            void oversightQuery.refetch()
          }}
        />
      ) : null}

      {!anyLoading && !anyError && summary ? (
        <>
          <MetricGrid columns={5}>
            <MetricCard label={t('Pending review')} value={summary.pending} tone={summary.pending > 0 ? 'warn' : 'default'} icon={<Sparkles className="h-4 w-4" />} />
            <MetricCard label={t('Accepted')} value={summary.accepted} tone="positive" />
            <MetricCard label={t('Modified')} value={summary.modified} />
            <MetricCard label={t('Rejected')} value={summary.rejected} />
            <MetricCard label={t('Acceptance rate')} value={formatPercent(summary.acceptanceRate)} support={t('Of all reviewed recommendations')} />
          </MetricGrid>

          <Card flush>
            <div className="border-b border-ink-100 px-4 pt-4 pb-3">
              <Tabs items={tabItems} value={tab} onChange={(id) => setTab(id as HumanOversightRecord['outcome'])} />
            </div>

            {records.length === 0 ? (
              <EmptyState
                className="m-4"
                title={t('No {0} recommendations', tab)}
                detail="No recommendation currently sits in this review state within your authorised scope."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
                {records.map((record) => (
                  <AIRecommendationCard
                    key={record.id}
                    recommendation={toRecommendationBlock(record, requestById.get(record.aiRequestId))}
                    status={record.outcome}
                    onApprove={
                      tab === 'pending' && mayReview
                        ? () => setDialog({ id: record.id, outcome: 'accepted', title: t('Approve - {0}', record.recommendationTitle) })
                        : undefined
                    }
                    onModify={
                      tab === 'pending' && mayReview
                        ? () => setDialog({ id: record.id, outcome: 'modified', title: t('Modify - {0}', record.recommendationTitle) })
                        : undefined
                    }
                    onReject={
                      tab === 'pending' && mayReview
                        ? () => setDialog({ id: record.id, outcome: 'rejected', title: t('Reject - {0}', record.recommendationTitle) })
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
            {!mayReview ? (
              <p className="border-t border-ink-100 px-4 py-3 text-[0.6875rem] text-ink-400">
                {t('Your assigned role does not hold ai-governance:approve. Review controls are disabled - this is enforced by the permission engine, not hidden from view.')}
              </p>
            ) : null}
          </Card>
        </>
      ) : null}

      <Card tone="info">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-700">
          <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-govt-600" />
          {t('Recommendations never execute automatically. Approving a recommendation here records the officer\'s decision against the audit trail; it does not itself deploy a resource, transfer funds or change a municipal record - the accountable department still carries out and records the resulting action through its own workflow.')}
        </p>
      </Card>

      <ConfirmDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => void handleConfirm(reason)}
        title={dialog?.title ?? 'Review recommendation'}
        description={
          dialog?.outcome === 'accepted'
            ? 'Recorded as your decision against this recommendation.'
            : dialog?.outcome === 'modified'
              ? 'State how the recommendation was modified before being actioned.'
              : 'State the institutional basis for declining this recommendation.'
        }
        confirmLabel={dialog?.outcome === 'accepted' ? 'Approve' : dialog?.outcome === 'modified' ? 'Record modification' : 'Reject'}
        intent={dialog?.outcome === 'accepted' ? 'positive' : dialog?.outcome === 'rejected' ? 'critical' : 'primary'}
        requireReason={dialog?.outcome === 'modified' || dialog?.outcome === 'rejected'}
      />

      <DemonstrationNotice />
    </PageBody>
  )
}

export default AIRecommendationsPage
