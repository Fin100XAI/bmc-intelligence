import { useMemo, useState } from 'react'
import { AlertOctagon, Sparkles } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { aiService, type OversightFilters } from '@/services'
import { useCurrentUser } from '@/stores/auth.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { useDrawerStore } from '@/stores/ui.store'
import { allowed } from '@/security'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatPercent, formatRelative } from '@/utils/format'
import { evidenceForDomain } from '@/data/evidence.data'
import {
  AI_USE_CASE_LABEL,
  type AIEvaluation,
  type AIModel,
  type AIRecommendationBlock,
  type AIRequestRecord,
  type HumanOversightRecord,
} from '@/types/ai'
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

/** Evidence backing a recommendation is drawn from the same domain-scoped
 * corpus every AI answer cites from, sized to the originating request's own
 * citation count and seeded on the oversight record's id so the same
 * recommendation always resolves to the same records. Where the originating
 * request was general reasoning rather than evidence-backed, no evidence is
 * manufactured for it - that absence is stated in `why` above, not concealed
 * behind a fabricated citation list. */
function recommendationEvidenceRefs(record: HumanOversightRecord, request: AIRequestRecord | undefined): string[] {
  if (!request || request.grounding !== 'evidence-backed' || request.citationCount <= 0) return []
  const count = Math.min(Math.max(request.citationCount, 1), 4)
  return evidenceForDomain(record.domain, count, record.id)
}

function toRecommendationBlock(record: HumanOversightRecord, request: AIRequestRecord | undefined): AIRecommendationBlock {
  return {
    id: record.id,
    title: record.recommendationTitle,
    why: `Raised from a ${AI_USE_CASE_LABEL[record.useCase]} request in ${DOMAIN_LABEL[record.domain]}, submitted ${formatRelative(record.submittedAt)}.${request ? ` The originating request drew on ${request.citationCount} evidence citation${request.citationCount === 1 ? '' : 's'} with ${request.confidence} confidence.` : ''}`,
    evidenceRefs: recommendationEvidenceRefs(record, request),
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

  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(t('AI Recommendations'))

  const [tab, setTab] = useState<HumanOversightRecord['outcome']>('pending')
  const [dialog, setDialog] = useState<{ id: string; outcome: HumanOversightRecord['outcome']; title: string } | null>(null)

  const summaryQuery = useServiceQuery(queryKeys.ai('oversight-summary'), (u) => aiService.oversightSummary(u))
  const filters: OversightFilters = useMemo(() => ({ outcome: [tab], pageSize: 100 }), [tab])
  const oversightQuery = useServiceQuery(queryKeys.ai(`oversight:${tab}`), (u) => aiService.oversight(u, filters))
  const requestsQuery = useServiceQuery(queryKeys.ai('requests-for-oversight'), (u) => aiService.requests(u, { pageSize: 300 }))
  // The model and evaluation registers, so each recommendation can be traced
  // through to the model that produced it and that model's most recent
  // evaluation verdict - the accountability chain this page exists to close.
  const modelsQuery = useServiceQuery(queryKeys.ai('models'), (u) => aiService.models(u))
  const evaluationsQuery = useServiceQuery(queryKeys.ai('evaluations'), (u) => aiService.evaluations(u))
  const openDrawer = useDrawerStore((s) => s.open)

  const review = useServiceAction(
    (u, id: string, outcome: HumanOversightRecord['outcome'], note?: string) => aiService.reviewRecommendation(u, id, outcome, note),
    [['bmc-mii', 'ai']],
  )

  const requestById = useMemo(() => {
    const map = new Map<string, AIRequestRecord>()
    for (const r of requestsQuery.data?.items ?? []) map.set(r.id, r)
    return map
  }, [requestsQuery.data])

  const modelById = useMemo(() => {
    const map = new Map<string, AIModel>()
    for (const m of modelsQuery.data ?? []) map.set(m.id, m)
    return map
  }, [modelsQuery.data])

  // One evaluation run per model - see AI Evaluation.
  const evaluationByModelId = useMemo(() => {
    const map = new Map<string, AIEvaluation>()
    for (const e of evaluationsQuery.data ?? []) map.set(e.modelId, e)
    return map
  }, [evaluationsQuery.data])

  const summary = summaryQuery.data
  const records = oversightQuery.data?.items ?? []
  const mayReview = allowed(user, 'ai-governance', 'approve')

  const anyLoading = summaryQuery.isLoading || oversightQuery.isLoading || modelsQuery.isLoading || evaluationsQuery.isLoading
  const anyError = summaryQuery.error ?? oversightQuery.error ?? modelsQuery.error ?? evaluationsQuery.error

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
            void modelsQuery.refetch()
            void evaluationsQuery.refetch()
          }}
        />
      ) : null}

      {/* ── Two columns ─────────────────────────────────────────────
          The recommendations awaiting a decision take the wide column — that
          is the work. The standing counts and the statement of what an
          approval does and does not do sit beside them, where an officer sees
          the limit of the act before performing it. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          {!anyLoading && !anyError && summary ? (
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
                  {records.map((record) => {
                    const request = requestById.get(record.aiRequestId)
                    const model = request ? modelById.get(request.modelId) : undefined
                    const evaluation = model ? evaluationByModelId.get(model.id) : undefined
                    const block = toRecommendationBlock(record, request)
                    return (
                      <AIRecommendationCard
                        key={record.id}
                        recommendation={block}
                        status={record.outcome}
                        model={model ? { id: model.id, name: model.name, version: model.version } : undefined}
                        evaluation={evaluation ? { id: evaluation.id, verdict: evaluation.verdict, compositeScore: evaluation.compositeScore } : undefined}
                        onOpenEvidenceItem={block.evidenceRefs.length > 0 ? (evidenceId) => openDrawer({ kind: 'evidence', id: evidenceId }) : undefined}
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
                    )
                  })}
                </div>
              )}
              {!mayReview ? (
                <p className="border-t border-ink-100 px-4 py-3 text-[0.6875rem] text-ink-400">
                  {t('Your assigned role does not hold ai-governance:approve. Review controls are disabled - this is enforced by the permission engine, not hidden from view.')}
                </p>
              ) : null}
            </Card>
            ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
          {!anyLoading && !anyError && summary ? (
            <MetricGrid columns={2}>
              <MetricCard label={t('Pending review')} value={summary.pending} tone={summary.pending > 0 ? 'warn' : 'default'} icon={<Sparkles className="h-4 w-4" />} />
              <MetricCard label={t('Accepted')} value={summary.accepted} tone="positive" />
              <MetricCard label={t('Modified')} value={summary.modified} />
              <MetricCard label={t('Rejected')} value={summary.rejected} />
              <MetricCard label={t('Acceptance rate')} value={formatPercent(summary.acceptanceRate)} support={t('Of all reviewed recommendations')} />
            </MetricGrid>
          ) : null}

          <Card tone="info">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-700">
              <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-govt-600" />
              {t('Recommendations never execute automatically. Approving a recommendation here records the officer\'s decision against the audit trail; it does not itself deploy a resource, transfer funds or change a municipal record - the accountable department still carries out and records the resulting action through its own workflow.')}
            </p>
          </Card>

          <DemonstrationNotice />
        </div>
      </div>

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
    </PageBody>
  )
}

export default AIRecommendationsPage
