import { useMemo, useState } from 'react'
import {
  Activity,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Lightbulb,
  Link2,
  Search,
  ShieldCheck,
  UserCheck,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { aiService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { useFilterStore } from '@/stores/ui.store'
import type { FilterState } from '@/stores/ui.store'
import { officerDisplayName } from '@/data/reference'
import { DEMO_NOW, isoFromAnchor } from '@/utils/deterministic'
import { DEMO_USERS } from '@/stores/auth.store'
import { enumLabel } from '@/utils/enum-label'
import { formatPercent, formatRelative } from '@/utils/format'
import { DOMAIN_LABEL, type DateRangeKey, type IntelligenceDomain } from '@/types/common'
import type { AgentWorkflow } from '@/types/ai'
import {
  Badge,
  Card,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Agent Workflows.
 *
 * Automated sequences the platform runs on a trigger - but every one of them
 * routes through at least one mandatory human checkpoint before a municipal
 * record can change state. This page exists to make that checkpoint visible,
 * not to hide it behind a "workflow completed" label.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-90),
  refreshIntervalMinutes: 60,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const STEP_ICON: Record<AgentWorkflow['steps'][number]['kind'], React.ElementType> = {
  retrieve: Search,
  analyse: Activity,
  correlate: GitBranch,
  recommend: Lightbulb,
  'human-checkpoint': UserCheck,
  notify: Link2,
}

function build$STEP_LABEL(): Record<AgentWorkflow['steps'][number]['kind'], string> {
  return {
  retrieve: t('Retrieve'),
  analyse: t('Analyse'),
  correlate: t('Correlate'),
  recommend: t('Recommend'),
  'human-checkpoint': t('Human checkpoint'),
  notify: t('Notify'),
}
}
let STEP_LABEL: Record<AgentWorkflow['steps'][number]['kind'], string> = build$STEP_LABEL()
registerLayer(() => {
  STEP_LABEL = build$STEP_LABEL()
})

const STATUS_TONE: Record<AgentWorkflow['status'], 'positive' | 'warn' | 'neutral'> = {
  active: 'positive',
  paused: 'warn',
  draft: 'neutral',
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

function matchesGlobalFilters(workflow: AgentWorkflow, filters: FilterState): boolean {
  if (filters.domains.length > 0 && !filters.domains.includes(workflow.domain)) return false
  if (filters.statuses.length > 0 && !filters.statuses.includes(workflow.status)) return false
  if (!withinDateRange(workflow.lastRunAt, filters.dateRange)) return false
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    if (!workflow.name.toLowerCase().includes(q) && !workflow.description.toLowerCase().includes(q)) return false
  }
  return true
}


/** Owners are recorded as officer or demonstration-user ids; show the post, never the raw id. */
function ownerLabel(id: string): string {
  const name = officerDisplayName(id)
  if (name !== id) return name
  return DEMO_USERS.find((u) => u.id === id)?.designation ?? id
}

export function AgentWorkflowsPage(): React.JSX.Element {
  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(t('Agent Workflows'))

  const workflowsQuery = useServiceQuery(queryKeys.ai('agent-workflows'), (u) => aiService.agentWorkflows(u))
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null)
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const filters = useFilterStore((s) => s.filters)

  const rawWorkflows = workflowsQuery.data ?? []
  const domainOptions = useMemo<IntelligenceDomain[]>(
    () => Array.from(new Set(rawWorkflows.map((w) => w.domain))).sort((a, b) => DOMAIN_LABEL[a].localeCompare(DOMAIN_LABEL[b])),
    [rawWorkflows],
  )
  const statusOptions = useMemo(
    () => [
      { value: 'active', label: t('Active') },
      { value: 'paused', label: t('Paused') },
      { value: 'draft', label: t('Draft') },
    ],
    [],
  )
  const workflows = useMemo(() => rawWorkflows.filter((w) => matchesGlobalFilters(w, filters)), [rawWorkflows, filters])
  const totalRuns = workflows.reduce((s, w) => s + w.runsLast30d, 0)
  const meanApproval =
    workflows.length > 0 ? workflows.reduce((s, w) => s + w.humanApprovalRate, 0) / workflows.length : 0
  const totalCheckpoints = workflows.reduce((s, w) => s + w.steps.filter((s2) => s2.requiresHuman).length, 0)

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('AI & Automation')}
        breadcrumbs={[{ label: t('AI & Automation') }, { label: t('Agent Workflows') }]}
        freshness={FRESHNESS}
        controls={<FilterBar show={['date', 'domain', 'status', 'search']} statusOptions={statusOptions} domainOptions={domainOptions} />}
      />

      {workflowsQuery.isLoading ? <LoadingState variant="metrics" /> : null}
      {workflowsQuery.error ? <ErrorState detail={workflowsQuery.error.message} onRetry={() => workflowsQuery.refetch()} /> : null}

      {/* ── Two columns ─────────────────────────────────────────────
          The workflows themselves are the record and read down the wide
          column, each expanding into its own pipeline. The standing figures
          and the rule that governs every one of them — that a checkpoint
          cannot be bypassed — sit beside them. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          {!workflowsQuery.isLoading && !workflowsQuery.error ? (
            rawWorkflows.length === 0 ? (
              <EmptyState title={t('No agent workflows configured')} detail={t('No agent workflow records are visible within your authorised scope.')} />
            ) : workflows.length === 0 ? (
              <EmptyState title={t('No workflows match the current filters')} detail={t('Widen the date range or clear a filter to see more results.')} />
            ) : (
              <>
                <p className="text-xs text-ink-400">
                  {t('{0} mandatory human checkpoint{1} across {2} workflow{3} - every one enforced, none optional.', totalCheckpoints, totalCheckpoints === 1 ? '' : 's', workflows.length, workflows.length === 1 ? '' : 's')}
                </p>

                {workflows.map((workflow) => {
                  const isOpen = expandedWorkflow === workflow.id
                  const checkpointCount = workflow.steps.filter((s) => s.requiresHuman).length
                  return (
                    <Card key={workflow.id} flush>
                      <button
                        type="button"
                        onClick={() => setExpandedWorkflow(isOpen ? null : workflow.id)}
                        className="flex w-full items-start justify-between gap-3 p-4 text-left"
                        aria-expanded={isOpen}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={STATUS_TONE[workflow.status]} dot>
                              {enumLabel(workflow.status)}
                            </Badge>
                            <Badge tone="muted">{DOMAIN_LABEL[workflow.domain]}</Badge>
                            <Badge tone="intel" icon={<UserCheck className="h-3 w-3" />}>
                              {t('{0} checkpoint{1}', checkpointCount, checkpointCount === 1 ? '' : 's')}
                            </Badge>
                          </div>
                          <h3 className="mt-1.5 text-[0.9375rem] font-semibold text-ink-900">{workflow.name}</h3>
                          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-500">{workflow.description}</p>
                          <p className="mt-1.5 text-[0.6875rem] text-ink-400">
                            {t('Trigger: {0} · Owner {1} · Last run {2}', workflow.trigger, ownerLabel(workflow.ownerId), formatRelative(workflow.lastRunAt))}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="numeric text-metric-sm font-semibold text-ink-900">{workflow.runsLast30d}</span>
                          <span className="text-[0.625rem] text-ink-400">{t('runs / 30d')}</span>
                          {isOpen ? <ChevronDown className="mt-1 h-4 w-4 text-ink-400" /> : <ChevronRight className="mt-1 h-4 w-4 text-ink-400" />}
                        </div>
                      </button>

                      {isOpen ? (
                        <div className="border-t border-ink-100 p-4">
                          <p className="label-institutional mb-3">{t('Workflow pipeline')}</p>
                          <div className="scrollbar-slim flex items-stretch gap-0 overflow-x-auto pb-2">
                            {workflow.steps.map((step, i) => {
                              const Icon = STEP_ICON[step.kind]
                              const stepKey = `${workflow.id}:${step.id}`
                              const stepOpen = expandedStep === stepKey
                              return (
                                <div key={step.id} className="flex items-stretch">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedStep(stepOpen ? null : stepKey)}
                                    aria-expanded={stepOpen}
                                    className={
                                      step.requiresHuman
                                        ? 'flex w-44 shrink-0 flex-col rounded-lg border-2 border-intel-300 bg-intel-50/50 p-2.5 text-left shadow-xs'
                                        : 'flex w-40 shrink-0 flex-col rounded-lg border border-google-blue-200 bg-google-blue-50 p-2.5 text-left'
                                    }
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <Icon className={step.requiresHuman ? 'h-3.5 w-3.5 shrink-0 text-intel-700' : 'h-3.5 w-3.5 shrink-0 text-google-blue-700'} />
                                      <span className={step.requiresHuman ? 'text-xs font-semibold text-intel-800' : 'text-xs font-semibold text-ink-800'}>
                                        {STEP_LABEL[step.kind]}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-[0.6875rem] leading-snug text-ink-700">{step.name}</p>
                                    {step.requiresHuman ? (
                                      <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded bg-intel-100 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide text-intel-800 uppercase">
                                        <ShieldCheck className="h-2.5 w-2.5" />{' '}{t('Cannot be bypassed')}
                                      </span>
                                    ) : null}
                                  </button>
                                  {i < workflow.steps.length - 1 ? (
                                    <div className="flex w-5 shrink-0 items-center justify-center">
                                      <ChevronRight className="h-3.5 w-3.5 text-ink-300" aria-hidden />
                                    </div>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                          {expandedStep && expandedStep.startsWith(`${workflow.id}:`) ? (
                            (() => {
                              const step = workflow.steps.find((s) => `${workflow.id}:${s.id}` === expandedStep)
                              if (!step) return null
                              return (
                                <div className="mt-3 rounded-lg border border-ink-100 bg-surface-sunken p-3">
                                  <p className="text-xs font-semibold text-ink-800">
                                    {STEP_LABEL[step.kind]} - {step.name}
                                  </p>
                                  <p className="mt-1 text-xs leading-relaxed text-ink-600">{step.description}</p>
                                  {step.requiresHuman ? (
                                    <p className="mt-2 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-intel-800">
                                      <UserCheck className="mt-0.5 h-3 w-3 shrink-0" />
                                      {t('This is a mandatory human checkpoint. The workflow halts here until a named, authorised officer reviews and confirms. No municipal record downstream of this step is transitioned until that confirmation is recorded.')}
                                    </p>
                                  ) : null}
                                </div>
                              )
                            })()
                          ) : null}
                          <p className="mt-3 text-[0.6875rem] text-ink-400">
                            {t('Human approval rate over the last 30 days:')}{' '}<span className="font-semibold text-ink-600">{formatPercent(workflow.humanApprovalRate)}</span>{' '}
                            {t('- the share of checkpointed runs an officer approved as recommended, rather than modified or rejected.')}
                          </p>
                        </div>
                      ) : null}
                    </Card>
                  )
                })}
              </>
            )
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
          {!workflowsQuery.isLoading && !workflowsQuery.error && workflows.length > 0 ? (
            <MetricGrid columns={2}>
              <MetricCard label={t('Configured workflows')} value={workflows.length} icon={<WorkflowIcon className="h-4 w-4" />} />
              <MetricCard label={t('Active')} value={workflows.filter((w) => w.status === 'active').length} tone="positive" />
              <MetricCard label={t('Runs, last 30 days')} value={totalRuns} />
              <MetricCard label={t('Mean human approval rate')} value={formatPercent(meanApproval)} />
            </MetricGrid>
          ) : null}

          <Card tone="info">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-700">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-govt-600" />
              {t('A human checkpoint cannot be bypassed. No workflow on this platform is able to transition a municipal record - an incident, a decision, a work order, an assignment - without a named officer completing the checkpoint step. Retrieval, analysis and recommendation steps run unattended; the transition itself never does.')}
            </p>
          </Card>

          <DemonstrationNotice />
        </div>
      </div>
    </PageBody>
  )
}

export default AgentWorkflowsPage
