import { useMemo, useState } from 'react'
import {
  AlertOctagon,
  BrainCircuit,
  CheckCircle2,
  Compass,
  Gauge,
  ScrollText,
  ShieldBan,
  Sparkles,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, SeverityBadge } from '@/components/ui/badges'
import { Button, Card, CardHeader, Label, LinkButton, MetricGrid, ProgressBar, Select } from '@/components/ui/primitives'
import { DataTable } from '@/components/ui/DataTable'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { ConfirmDialog, Tabs } from '@/components/ui/overlays'
import { useServiceQuery, useServiceAction } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { aiService } from '@/services'
import { allowed, HUMAN_CONFIRMATION_REQUIRED } from '@/security'
import { useCurrentUser } from '@/stores/auth.store'
import { ROUTES } from '@/config/navigation'
import { userDisplayName } from '@/auth/demo-users'
import { formatDate, formatPercent, formatRelative } from '@/utils/format'
import { DOMAIN_LABEL } from '@/types/common'
import { AI_RISK_LABEL, type AIIncident, type AIModel, type AIRiskEntry, type HumanOversightRecord, type PromptTemplate } from '@/types/ai'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/trust/AIGovernancePage.tsx
 *
 * Flagship module. Model registry, prompt registry, AI risk register, human
 * oversight and AI incidents - every section reads through `aiService`, and
 * the human-in-the-loop panel renders the platform's real, code-enforced
 * `HUMAN_CONFIRMATION_REQUIRED` list rather than a paraphrase of it.
 */

function build$AI_MAY_DO(): Array<{ verb: string; detail: string }> {
  return [
  { verb: 'Analyse', detail: t('Evaluate structured municipal records against published rules and thresholds.') },
  { verb: 'Recommend', detail: t('Propose an action with a stated rationale, evidence and an accountable human owner.') },
  { verb: 'Forecast', detail: t('Project a metric forward under stated assumptions, with confidence always attached.') },
  { verb: 'Summarise', detail: t('Condense a timeline, brief or record set without adding an unsupported claim.') },
  { verb: 'Detect anomalies', detail: t('Flag a statistical departure from cohort comparables for human reconciliation.') },
  { verb: 'Prioritise', detail: t('Order a worklist against published, reviewable weights for human confirmation.') },
  { verb: 'Simulate', detail: t('Recalculate an outcome under a hypothetical input, always labelled as simulation.') },
  { verb: 'Explain', detail: t('Trace a derived figure back through its lineage, weights and contributing inputs.') },
]
}
let AI_MAY_DO: Array<{ verb: string; detail: string }> = build$AI_MAY_DO()
registerLayer(() => {
  AI_MAY_DO = build$AI_MAY_DO()
})

const OVERSIGHT_OUTCOME_TONE: Record<HumanOversightRecord['outcome'], 'warn' | 'positive' | 'info' | 'critical' | 'muted'> = {
  pending: 'warn',
  accepted: 'positive',
  modified: 'info',
  rejected: 'critical',
  escalated: 'muted',
}

const INCIDENT_STAGES: AIIncident['status'][] = ['detected', 'triaged', 'contained', 'resolved', 'reviewed']
function build$INCIDENT_STAGE_LABEL(): Record<AIIncident['status'], string> {
  return {
  detected: t('Detected'),
  triaged: t('Triaged'),
  contained: t('Contained'),
  resolved: t('Resolved'),
  reviewed: t('Reviewed'),
}
}
let INCIDENT_STAGE_LABEL: Record<AIIncident['status'], string> = build$INCIDENT_STAGE_LABEL()
registerLayer(() => {
  INCIDENT_STAGE_LABEL = build$INCIDENT_STAGE_LABEL()
})

const LIKELIHOOD_ORDER: Array<AIRiskEntry['likelihood']> = ['low', 'medium', 'high']
const IMPACT_ORDER: Array<AIRiskEntry['impact']> = ['high', 'medium', 'low']

type TabId = 'models' | 'prompts' | 'risk' | 'oversight' | 'incidents'

export function AIGovernancePage(): React.JSX.Element {
  const currentUser = useCurrentUser()
  const [tab, setTab] = useState<TabId>('risk')

  const modelsQuery = useServiceQuery(queryKeys.ai('models'), (user) => aiService.models(user))
  const promptsQuery = useServiceQuery(queryKeys.ai('prompts'), (user) => aiService.prompts(user))
  const riskQuery = useServiceQuery(queryKeys.ai('risk-register'), (user) => aiService.riskRegister(user))
  const oversightQuery = useServiceQuery(queryKeys.ai('oversight'), (user) => aiService.oversight(user, { pageSize: 200 }))
  const oversightSummaryQuery = useServiceQuery(queryKeys.ai('oversight-summary'), (user) => aiService.oversightSummary(user))
  const incidentsQuery = useServiceQuery(queryKeys.ai('incidents'), (user) => aiService.incidents(user))

  const [reviewTarget, setReviewTarget] = useState<HumanOversightRecord | null>(null)
  const [reviewOutcome, setReviewOutcome] = useState<HumanOversightRecord['outcome']>('accepted')

  const reviewMutation = useServiceAction(
    (user, id: string, outcome: HumanOversightRecord['outcome'], note: string) =>
      aiService.reviewRecommendation(user, id, outcome, note || undefined),
    [queryKeys.ai('oversight'), queryKeys.ai('oversight-summary')],
  )

  const canReview = allowed(currentUser, 'ai-governance', 'approve', { domain: 'ai-governance' })

  const riskMatrix = useMemo(() => {
    const risks = riskQuery.data ?? []
    const cells = new Map<string, AIRiskEntry[]>()
    for (const r of risks) {
      const key = `${r.impact}:${r.likelihood}`
      cells.set(key, [...(cells.get(key) ?? []), r])
    }
    return cells
  }, [riskQuery.data])

  if (modelsQuery.isLoading || promptsQuery.isLoading || riskQuery.isLoading) return <LoadingState variant="metrics" />
  if (modelsQuery.error) return <ErrorState detail={modelsQuery.error.message} onRetry={() => modelsQuery.refetch()} />
  if (promptsQuery.error) return <ErrorState detail={promptsQuery.error.message} onRetry={() => promptsQuery.refetch()} />
  if (riskQuery.error) return <ErrorState detail={riskQuery.error.message} onRetry={() => riskQuery.refetch()} />

  const models = modelsQuery.data ?? []
  const prompts = promptsQuery.data ?? []
  const risks = riskQuery.data ?? []
  const oversightSummary = oversightSummaryQuery.data
  const incidents = incidentsQuery.data ?? []

  const activeModels = models.filter((m) => m.status === 'active').length
  const highRiskModels = models.filter((m) => m.riskClass === 'high').length
  const approvedPrompts = prompts.filter((p) => p.approvalStatus === 'approved').length
  const openRisks = risks.filter((r) => r.status === 'open' || r.status === 'monitoring').length
  const openIncidents = incidents.filter((i) => i.status !== 'resolved' && i.status !== 'reviewed').length

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Trust Centre - Flagship')}
        title={t('AI Governance')}
        description={t('Every AI capability in this platform is registered, risk-assessed and subject to named human oversight. AI analyses, recommends, forecasts, summarises, detects, prioritises, simulates and explains - it never decides.')}
        breadcrumbs={[{ label: t('Trust Centre'), to: '/trust' }, { label: t('AI Governance') }]}
      />

      {/* ---------------------------------------------------- Human-in-the-loop */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card tone="critical">
          <CardHeader
            icon={<ShieldBan className="h-4 w-4 text-crit-700" />}
            title={t('AI must never')}
            description={t('Technically blocked at the gateway, regardless of role or confidence.')}
          />
          <ul className="mt-3 space-y-2.5">
            {HUMAN_CONFIRMATION_REQUIRED.map((item) => (
              <li key={item.id} className="rounded-md border border-crit-100 bg-surface px-3 py-2">
                <p className="text-[0.8125rem] font-medium text-ink-900">{item.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{item.rationale}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card tone="positive">
          <CardHeader icon={<CheckCircle2 className="h-4 w-4 text-ok-700" />} title={t('AI may')} description={t('The full extent of what this platform\'s AI layer is built to do.')} />
          <ul className="mt-3 space-y-2.5">
            {AI_MAY_DO.map((item) => (
              <li key={item.verb} className="rounded-md border border-ok-100 bg-surface px-3 py-2">
                <p className="text-[0.8125rem] font-medium text-ink-900">{item.verb}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{item.detail}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <MetricGrid columns={5}>
        <Card>
          <p className="label-institutional">{t('Active models')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{activeModels} / {models.length}</p>
        </Card>
        <Card tone={highRiskModels > 0 ? 'warn' : 'default'}>
          <p className="label-institutional">{t('High risk-class models')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{highRiskModels}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Approved prompts')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{approvedPrompts} / {prompts.length}</p>
        </Card>
        <Card tone={openRisks > 0 ? 'warn' : 'default'}>
          <p className="label-institutional">{t('Open / monitored AI risks')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{openRisks}</p>
        </Card>
        <Card tone={openIncidents > 0 ? 'critical' : 'default'}>
          <p className="label-institutional">{t('Open AI incidents')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{openIncidents}</p>
        </Card>
      </MetricGrid>

      <Tabs
        items={[
          { id: 'models', label: t('Model registry'), count: models.length },
          { id: 'prompts', label: t('Prompt registry'), count: prompts.length },
          { id: 'risk', label: t('AI risk register'), count: risks.length },
          { id: 'oversight', label: t('Human oversight'), count: oversightSummary ? oversightSummary.pending : undefined },
          { id: 'incidents', label: t('AI incidents'), count: incidents.length },
        ]}
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        ariaLabel="AI Governance sections"
      />

      {tab === 'models' ? (
        <Card>
          <CardHeader
            icon={<BrainCircuit className="h-4 w-4" />}
            title={t('Model registry - summary')}
            description={t('Every model this platform is capable of invoking, its approved use and its evaluation status.')}
            actions={<LinkButton to={ROUTES.modelRegistry} icon={<Compass className="h-3.5 w-3.5" />}>{t('Open full registry')}</LinkButton>}
          />
          <div className="mt-3">
            <DataTable
              rows={models}
              rowKey={(m: AIModel) => m.id}
              searchable
              searchPlaceholder="Search models"
              columns={[
                { id: 'name', header: t('Model'), cell: (m: AIModel) => (
                  <div className="min-w-0">
                    <p className="font-medium text-ink-800">{m.name}</p>
                    <p className="text-[0.6875rem] text-ink-400">{t('{0} · v{1}', m.provider, m.version)}</p>
                  </div>
                ), sortValue: (m: AIModel) => m.name },
                { id: 'risk', header: t('Risk class'), cell: (m: AIModel) => (
                  <Badge tone={m.riskClass === 'high' ? 'critical' : m.riskClass === 'moderate' ? 'warn' : 'neutral'}>{m.riskClass}</Badge>
                ), sortValue: (m: AIModel) => m.riskClass },
                { id: 'evaluation', header: t('Evaluation status'), cell: (m: AIModel) => (
                  <Badge tone={m.evaluationStatus === 'passed' ? 'positive' : m.evaluationStatus === 'failed' ? 'critical' : m.evaluationStatus === 're-evaluation-due' ? 'warn' : 'neutral'}>
                    {m.evaluationStatus.replace(/-/g, ' ')}
                  </Badge>
                ), sortValue: (m: AIModel) => m.evaluationStatus },
                { id: 'lastEvaluated', header: t('Last evaluated'), cell: (m: AIModel) => formatDate(m.lastEvaluatedAt), sortValue: (m: AIModel) => m.lastEvaluatedAt, hideBelow: 'lg' },
                { id: 'status', header: t('Status'), cell: (m: AIModel) => (
                  <Badge tone={m.status === 'active' ? 'positive' : m.status === 'retired' ? 'muted' : m.status === 'restricted' ? 'warn' : 'neutral'} dot>
                    {m.status.replace('-', ' ')}
                  </Badge>
                ), sortValue: (m: AIModel) => m.status },
              ]}
            />
          </div>
        </Card>
      ) : null}

      {tab === 'prompts' ? (
        <Card>
          <CardHeader
            icon={<ScrollText className="h-4 w-4" />}
            title={t('Prompt registry - summary')}
            description={t('Versioned, approved prompt templates with their guardrails and allowed roles.')}
            actions={<LinkButton to={ROUTES.promptRegistry} icon={<Compass className="h-3.5 w-3.5" />}>{t('Open full registry')}</LinkButton>}
          />
          <div className="mt-3">
            <DataTable
              rows={prompts}
              rowKey={(p: PromptTemplate) => p.id}
              searchable
              searchPlaceholder="Search prompt templates"
              columns={[
                { id: 'title', header: t('Template'), cell: (p: PromptTemplate) => (
                  <div className="min-w-0">
                    <p className="font-medium text-ink-800">{p.title}</p>
                    <p className="text-[0.6875rem] text-ink-400">{t('v{0} · {1} guardrail(s)', p.version, p.guardrails.length)}</p>
                  </div>
                ), sortValue: (p: PromptTemplate) => p.title },
                { id: 'approval', header: t('Approval status'), cell: (p: PromptTemplate) => (
                  <Badge tone={p.approvalStatus === 'approved' ? 'positive' : p.approvalStatus === 'under-review' ? 'warn' : p.approvalStatus === 'withdrawn' ? 'muted' : 'neutral'}>
                    {p.approvalStatus.replace('-', ' ')}
                  </Badge>
                ), sortValue: (p: PromptTemplate) => p.approvalStatus },
                { id: 'risk', header: t('Risk class'), cell: (p: PromptTemplate) => (
                  <Badge tone={p.riskClass === 'high' ? 'critical' : p.riskClass === 'moderate' ? 'warn' : 'neutral'}>{p.riskClass}</Badge>
                ), sortValue: (p: PromptTemplate) => p.riskClass },
                { id: 'roles', header: t('Allowed roles'), cell: (p: PromptTemplate) => <span className="numeric">{p.allowedRoles.length}</span>, sortValue: (p: PromptTemplate) => p.allowedRoles.length, align: 'right', hideBelow: 'lg' },
                { id: 'modified', header: t('Last modified'), cell: (p: PromptTemplate) => formatDate(p.lastModifiedAt), sortValue: (p: PromptTemplate) => p.lastModifiedAt, hideBelow: 'lg' },
              ]}
            />
          </div>
        </Card>
      ) : null}

      {tab === 'risk' ? (
        <>
          <Card>
            <CardHeader icon={<Gauge className="h-4 w-4" />} title={t('Likelihood / impact matrix')} description={t('Count of registered risks at each combination. Darker cells carry higher inherent severity.')} />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] border-separate border-spacing-1 text-center">
                <thead>
                  <tr>
                    <th className="w-24">
                      <span className="sr-only">{t('Impact')}</span>
                    </th>
                    {LIKELIHOOD_ORDER.map((l) => (
                      <th key={l} className="text-[0.6875rem] font-semibold text-ink-500 capitalize">
                        {t('Likelihood: {0}', l)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {IMPACT_ORDER.map((impact) => (
                    <tr key={impact}>
                      <th scope="row" className="text-right text-[0.6875rem] font-semibold text-ink-500 capitalize">
                        {t('Impact: {0}', impact)}
                      </th>
                      {LIKELIHOOD_ORDER.map((likelihood) => {
                        const cellRisks = riskMatrix.get(`${impact}:${likelihood}`) ?? []
                        const severe = impact === 'high' && likelihood === 'high'
                        const moderate = (impact === 'high' && likelihood === 'medium') || (impact === 'medium' && likelihood === 'high') || (impact === 'medium' && likelihood === 'medium')
                        return (
                          <td
                            key={likelihood}
                            title={cellRisks.map((r) => AI_RISK_LABEL[r.category]).join(', ') || 'No registered risk at this combination'}
                            className={cn(
                              'h-16 rounded-md text-lg font-semibold',
                              cellRisks.length === 0
                                ? 'bg-ink-50 text-ink-300'
                                : severe
                                  ? 'bg-crit-500/85 text-white'
                                  : moderate
                                    ? 'bg-warn-500/80 text-ink-900'
                                    : 'bg-ok-500/70 text-ink-900',
                            )}
                          >
                            {cellRisks.length}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('AI risk register')} description={t('Every declared risk with its controls, owner and review schedule.')} />
            <div className="mt-3">
              <DataTable
                rows={risks}
                rowKey={(r: AIRiskEntry) => r.id}
                searchable
                searchPlaceholder="Search risks"
                pageSize={10}
                initialSort={{ columnId: 'residual', direction: 'desc' }}
                columns={[
                  { id: 'category', header: t('Category'), cell: (r: AIRiskEntry) => <Badge tone="muted">{AI_RISK_LABEL[r.category]}</Badge>, sortValue: (r: AIRiskEntry) => AI_RISK_LABEL[r.category] },
                  { id: 'description', header: t('Description'), cell: (r: AIRiskEntry) => <span className="line-clamp-2 max-w-xs text-[0.75rem] text-ink-600">{r.description}</span>, sortable: false },
                  { id: 'likelihood', header: t('Likelihood'), cell: (r: AIRiskEntry) => <span className="capitalize">{r.likelihood}</span>, sortValue: (r: AIRiskEntry) => r.likelihood, hideBelow: 'lg' },
                  { id: 'impact', header: t('Impact'), cell: (r: AIRiskEntry) => <span className="capitalize">{r.impact}</span>, sortValue: (r: AIRiskEntry) => r.impact, hideBelow: 'lg' },
                  { id: 'inherent', header: t('Inherent'), cell: (r: AIRiskEntry) => <SeverityBadge severity={r.inherentRating} />, sortValue: (r: AIRiskEntry) => r.inherentRating },
                  { id: 'residual', header: t('Residual'), cell: (r: AIRiskEntry) => <SeverityBadge severity={r.residualRating} />, sortValue: (r: AIRiskEntry) => r.residualRating },
                  { id: 'controls', header: t('Controls'), cell: (r: AIRiskEntry) => <span className="numeric">{r.controls.length}</span>, sortValue: (r: AIRiskEntry) => r.controls.length, align: 'right', hideBelow: 'xl' },
                  { id: 'owner', header: t('Owner'), cell: (r: AIRiskEntry) => userDisplayName(r.ownerId), sortValue: (r: AIRiskEntry) => userDisplayName(r.ownerId), hideBelow: 'lg' },
                  { id: 'reviewDue', header: t('Review due'), cell: (r: AIRiskEntry) => formatDate(r.reviewDue), sortValue: (r: AIRiskEntry) => r.reviewDue, hideBelow: 'lg' },
                  { id: 'status', header: t('Status'), cell: (r: AIRiskEntry) => <Badge tone={r.status === 'open' ? 'critical' : r.status === 'monitoring' ? 'warn' : r.status === 'mitigated' ? 'positive' : 'muted'} dot>{r.status}</Badge>, sortValue: (r: AIRiskEntry) => r.status },
                ]}
              />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {risks.map((r) => (
                <div key={`controls-${r.id}`} className="rounded-md border border-ink-100 bg-surface-sunken p-2.5">
                  <p className="text-[0.6875rem] font-semibold text-ink-700">{t('{0} - controls in place', AI_RISK_LABEL[r.category])}</p>
                  <ul className="mt-1 space-y-0.5">
                    {r.controls.map((c) => (
                      <li key={c} className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-ink-600">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-govt-500" aria-hidden />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}

      {tab === 'oversight' ? (
        <>
          {oversightSummaryQuery.isLoading ? (
            <LoadingState variant="metrics" />
          ) : oversightSummaryQuery.error ? (
            <ErrorState detail={oversightSummaryQuery.error.message} onRetry={() => oversightSummaryQuery.refetch()} />
          ) : oversightSummary ? (
            <MetricGrid columns={6}>
              <Card tone="warn">
                <p className="label-institutional">{t('Pending')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{oversightSummary.pending}</p>
              </Card>
              <Card>
                <p className="label-institutional">{t('Accepted')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{oversightSummary.accepted}</p>
              </Card>
              <Card>
                <p className="label-institutional">{t('Modified')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{oversightSummary.modified}</p>
              </Card>
              <Card>
                <p className="label-institutional">{t('Rejected')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{oversightSummary.rejected}</p>
              </Card>
              <Card>
                <p className="label-institutional">{t('Escalated')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{oversightSummary.escalated}</p>
              </Card>
              <Card tone="positive">
                <p className="label-institutional">{t('Acceptance rate')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{formatPercent(oversightSummary.acceptanceRate, 1)}</p>
                <ProgressBar value={oversightSummary.acceptanceRate} size="xs" className="mt-2" />
              </Card>
            </MetricGrid>
          ) : null}

          <Card>
            <CardHeader title={t('Human oversight register')} description={t('Every AI-originated recommendation requiring human review, with reviewer and modification notes. Pending items may be reviewed below.')} />
            {oversightQuery.isLoading ? (
              <LoadingState variant="table" />
            ) : oversightQuery.error ? (
              <ErrorState detail={oversightQuery.error.message} onRetry={() => oversightQuery.refetch()} />
            ) : (
              <div className="mt-3">
                <DataTable
                  rows={oversightQuery.data?.items ?? []}
                  rowKey={(r: HumanOversightRecord) => r.id}
                  searchable
                  searchPlaceholder="Search recommendations"
                  pageSize={10}
                  initialSort={{ columnId: 'submitted', direction: 'desc' }}
                  columns={[
                    { id: 'title', header: t('Recommendation'), cell: (r: HumanOversightRecord) => <span className="line-clamp-2 max-w-xs text-[0.8125rem] text-ink-800">{r.recommendationTitle}</span>, sortable: false },
                    { id: 'domain', header: t('Domain'), cell: (r: HumanOversightRecord) => <Badge tone="muted">{DOMAIN_LABEL[r.domain]}</Badge>, sortValue: (r: HumanOversightRecord) => DOMAIN_LABEL[r.domain], hideBelow: 'lg' },
                    { id: 'severity', header: t('Severity'), cell: (r: HumanOversightRecord) => <SeverityBadge severity={r.severity} />, sortValue: (r: HumanOversightRecord) => r.severity },
                    { id: 'submitted', header: t('Submitted'), cell: (r: HumanOversightRecord) => formatRelative(r.submittedAt), sortValue: (r: HumanOversightRecord) => r.submittedAt },
                    { id: 'reviewer', header: t('Reviewer'), cell: (r: HumanOversightRecord) => (r.reviewerId ? userDisplayName(r.reviewerId) : <span className="text-ink-300">{t('Unreviewed')}</span>), sortValue: (r: HumanOversightRecord) => (r.reviewerId ? userDisplayName(r.reviewerId) : ''), hideBelow: 'lg' },
                    { id: 'note', header: t('Modification note'), cell: (r: HumanOversightRecord) => r.modificationNote ? <span className="line-clamp-2 max-w-xs text-[0.75rem] text-ink-500">{r.modificationNote}</span> : '-', sortable: false, hideBelow: 'xl' },
                    { id: 'outcome', header: t('Outcome'), cell: (r: HumanOversightRecord) => <Badge tone={OVERSIGHT_OUTCOME_TONE[r.outcome]} dot>{r.outcome}</Badge>, sortValue: (r: HumanOversightRecord) => r.outcome },
                  ]}
                  rowActions={(r: HumanOversightRecord) =>
                    r.outcome === 'pending' ? (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={!canReview}
                        title={canReview ? 'Record a human review outcome for this recommendation' : 'Your role does not hold ai-governance:approve. This control is disabled by the permission engine.'}
                        onClick={(e) => {
                          e.stopPropagation()
                          setReviewOutcome('accepted')
                          setReviewTarget(r)
                        }}
                      >
                        {t('Review')}
                      </Button>
                    ) : null
                  }
                />
              </div>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'incidents' ? (
        <div className="space-y-3">
          {incidentsQuery.isLoading ? (
            <LoadingState variant="block" />
          ) : incidentsQuery.error ? (
            <ErrorState detail={incidentsQuery.error.message} onRetry={() => incidentsQuery.refetch()} />
          ) : incidents.length === 0 ? (
            <EmptyState title={t('No AI incidents recorded')} />
          ) : (
            incidents.map((incident) => {
              const stageIndex = INCIDENT_STAGES.indexOf(incident.status)
              return (
                <Card key={incident.id}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="muted" className="font-mono">{incident.reference}</Badge>
                    <SeverityBadge severity={incident.severity} />
                    <Badge tone="intel">{AI_RISK_LABEL[incident.category]}</Badge>
                    <Badge tone="muted" className="font-mono">{incident.modelId}</Badge>
                    <div className="flex-1" />
                    <span className="text-[0.6875rem] text-ink-400">{t('Detected {0}', formatRelative(incident.detectedAt))}</span>
                  </div>

                  <h3 className="mt-2 text-[0.9375rem] font-semibold text-ink-900">{incident.title}</h3>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-600">{incident.description}</p>

                  <ol className="mt-3 flex items-center gap-1">
                    {INCIDENT_STAGES.map((stage, i) => (
                      <li key={stage} className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className={cn('h-1 w-full rounded-full', i <= stageIndex ? 'bg-govt-600' : 'bg-ink-100')} aria-hidden />
                        <span className={cn('truncate text-[0.5625rem] leading-tight', i === stageIndex ? 'font-semibold text-govt-700' : i < stageIndex ? 'text-ink-500' : 'text-ink-300')}>
                          {INCIDENT_STAGE_LABEL[stage]}
                        </span>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem]">
                    <div>
                      <p className="label-institutional mb-1.5">{t('Actions taken')}</p>
                      <ul className="space-y-1">
                        {incident.actionsTaken.map((a) => (
                          <li key={a} className="flex items-start gap-1.5 text-[0.75rem] leading-relaxed text-ink-600">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ok-500" aria-hidden />
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-md bg-surface-sunken px-2.5 py-2 text-center">
                      <p className="numeric text-lg font-semibold text-ink-900">{incident.affectedRequests}</p>
                      <p className="text-[0.625rem] text-ink-500">{t('affected request(s)')}</p>
                      <p className="mt-1.5 text-[0.625rem] text-ink-400">{t('Owner: {0}', userDisplayName(incident.ownerId))}</p>
                    </div>
                  </div>
                </Card>
              )
            })
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        onConfirm={(reason) => {
          if (!reviewTarget) return
          void reviewMutation(reviewTarget.id, reviewOutcome, reason)
        }}
        title={reviewTarget ? `Review recommendation - ${reviewTarget.recommendationTitle.slice(0, 60)}` : 'Review recommendation'}
        description={t('Recorded permanently in the audit trail against your name. This action never modifies the underlying AI request - only the human review outcome.')}
        confirmLabel={t('Record review outcome')}
        intent="primary"
        requireReason
        reasonLabel="Review note (recorded in the audit trail)"
        extra={
          <div>
            <Label htmlFor="review-outcome">{t('Outcome')}</Label>
            <Select
              id="review-outcome"
              value={reviewOutcome}
              onChange={(e) => setReviewOutcome(e.target.value as HumanOversightRecord['outcome'])}
              options={[
                { value: 'accepted', label: t('Accepted') },
                { value: 'modified', label: t('Modified') },
                { value: 'rejected', label: t('Rejected') },
                { value: 'escalated', label: t('Escalated') },
              ]}
            />
          </div>
        }
      />

      <Card tone="info">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-govt-700" />
          <p className="text-xs leading-relaxed text-ink-700">
            {t('Every AI response in this platform is generated by a local, deterministic demonstration provider - no external model endpoint is contacted and no credential material exists in the application bundle. This page governs that capability regardless: the registers, risk assessment and oversight enforcement shown here are the same mechanism that would govern a production model.')}
          </p>
        </div>
      </Card>

      {models.some((m) => m.status === 'pending-approval') ? (
        <Card tone="warn">
          <div className="flex items-start gap-2.5">
            <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-warn-700" />
            <p className="text-xs leading-relaxed text-ink-700">
              {t('{0} awaits hosting determination, evaluation, privacy review and AI governance approval before any production use - see Platform Readiness for the full production requirement list.', models.filter((m) => m.status === 'pending-approval').map((m) => m.name).join(', '))}
            </p>
          </div>
        </Card>
      ) : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

export default AIGovernancePage
