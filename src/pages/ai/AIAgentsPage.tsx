import { useMemo, useState } from 'react'
import { Bot, CircleCheck, Ban, ShieldAlert, UserCheck } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, StateBadge } from '@/components/ui/badges'
import { Card, CardHeader, DefinitionList, DefinitionRow, MetricGrid } from '@/components/ui/primitives'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { MetricCard } from '@/components/cards/MetricCard'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { aiService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import type { AIAgent, AIAgentStage } from '@/types/ai'
import { AI_MODEL_BY_ID } from '@/data/ai.data'
import { OFFICER_BY_ID } from '@/data/reference'
import { DOMAIN_LABEL } from '@/types/common'
import { formatPercent, formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/ai/AIAgentsPage.tsx
 *
 * Controlled AI Agents.
 *
 * Nine named agents, each operating strictly within one lifecycle:
 *
 *   Draft → AI Analysis → Human Review → Approved Action
 *
 * The lifecycle is the control. An agent may draft and analyse on its own, but
 * the transition into an approved action is a named human's act - never the
 * agent's. This page makes that boundary visible per agent, alongside the
 * government acts each agent is categorically barred from performing regardless
 * of its confidence.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-90),
  refreshIntervalMinutes: 720,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const STAGES: AIAgentStage[] = ['draft', 'ai-analysis', 'human-review', 'approved-action']
function build$STAGE_LABEL(): Record<AIAgentStage, string> {
  return {
  draft: t('Draft'),
  'ai-analysis': t('AI Analysis'),
  'human-review': t('Human Review'),
  'approved-action': t('Approved Action'),
}
}
let STAGE_LABEL: Record<AIAgentStage, string> = build$STAGE_LABEL()
registerLayer(() => {
  STAGE_LABEL = build$STAGE_LABEL()
})
function build$STAGE_DESCRIPTION(): Record<AIAgentStage, string> {
  return {
  draft: t('The agent is configured but has not produced an active cycle.'),
  'ai-analysis': t('The agent is assembling and analysing - no output has left for human review.'),
  'human-review': t('Output is with a named officer for review, amendment or rejection.'),
  'approved-action': t('A named officer has approved this cycle. The action taken is the officer’s, not the agent’s.'),
}
}
let STAGE_DESCRIPTION: Record<AIAgentStage, string> = build$STAGE_DESCRIPTION()
registerLayer(() => {
  STAGE_DESCRIPTION = build$STAGE_DESCRIPTION()
})

function StageMeter({ stage }: { stage: AIAgentStage }): React.JSX.Element {
  const activeIndex = STAGES.indexOf(stage)
  return (
    <ol className="flex items-center gap-1">
      {STAGES.map((s, i) => {
        const reached = i <= activeIndex
        const isHuman = s === 'human-review' || s === 'approved-action'
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-1">
            <div
              className={cn(
                'flex h-6 w-full items-center justify-center gap-1 rounded-[2px] border px-1.5 text-[0.625rem] font-medium',
                reached
                  ? isHuman
                    ? 'border-ok-200 bg-ok-50 text-ok-700'
                    : 'border-govt-200 bg-govt-50 text-govt-700'
                  : 'border-ink-100 bg-surface text-ink-400',
              )}
            >
              {isHuman && reached ? <UserCheck className="h-3 w-3" aria-hidden /> : null}
              <span className="truncate">{STAGE_LABEL[s]}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function AIAgentsPage(): React.JSX.Element {
  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(
    t('Controlled AI Agents'),
    t('Every agent is advisory only and operates within one lifecycle: draft, AI analysis, human review, approved action. The transition to an approved action is always a named officer\'s act - no agent approves its own output, and every agent is barred from a fixed set of government acts.'),
  )

  const query = useServiceQuery(queryKeys.ai('agents'), (u) => aiService.agents(u))
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const agents = useMemo(() => query.data ?? [], [query.data])
  const selected = useMemo(
    () => agents.find((a) => a.id === selectedId) ?? agents[0] ?? null,
    [agents, selectedId],
  )

  if (query.isLoading) return <LoadingState variant="block" rows={6} />
  if (query.error) return <ErrorState detail={query.error.message} onRetry={() => query.refetch()} />

  const active = agents.filter((a) => a.status === 'active').length
  const atHumanReview = agents.filter((a) => a.stage === 'human-review').length
  const meanApproval =
    agents.length > 0 ? Math.round(agents.reduce((s, a) => s + a.humanApprovalRate, 0) / agents.length) : 0

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('AI & Automation')}
        breadcrumbs={[{ label: t('AI & Automation') }, { label: t('AI Agents') }]}
        freshness={FRESHNESS}
      />

      {/* ── Two columns ─────────────────────────────────────────────
          The control that governs every agent, the standing figures and the
          registry itself read down the wide column, in that order. The agent
          an officer has opened stands pinned beside the register, so its
          reserved acts can be read against the row that led to it. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          {/* The lifecycle every agent obeys ------------------------------ */}
          <Card tone="sunken">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] font-semibold text-ink-800">{t('The lifecycle is the control')}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  {t('An agent may draft and analyse autonomously. It cannot cross into an approved action on its own - that step is reserved to a named officer and is enforced technically, not merely by policy. The same boundary the AI gateway enforces on every request is expressed here per agent.')}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {STAGES.map((s, i) => (
                    <div
                      key={s}
                      className={cn(
                        'rounded-[2px] border p-2',
                        s === 'approved-action' ? 'border-ok-200 bg-ok-50/50' : 'border-ink-100 bg-surface',
                      )}
                    >
                      <p className="text-[0.625rem] font-semibold text-ink-400">{t('Stage {0}', i + 1)}</p>
                      <p className="text-[0.8125rem] font-semibold text-ink-800">{STAGE_LABEL[s]}</p>
                      <p className="mt-0.5 text-[0.625rem] leading-relaxed text-ink-500">{STAGE_DESCRIPTION[s]}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <MetricGrid columns={3}>
            <MetricCard label={t('Agents registered')} value={agents.length} support={`${active} active`} icon={<Bot className="h-4 w-4" />} />
            <MetricCard
              label={t('Awaiting human review')}
              value={atHumanReview}
              tone={atHumanReview > 0 ? 'warn' : 'default'}
              support={t('Cycles held for a named officer')}
              icon={<UserCheck className="h-4 w-4" />}
            />
            <MetricCard
              label={t('Mean human approval rate')}
              value={formatPercent(meanApproval)}
              support={t('Across all agents, last 30 days')}
              icon={<CircleCheck className="h-4 w-4" />}
            />
          </MetricGrid>

          <Card flush>
            <CardHeader bordered title={t('Agent registry')} description={t('Each agent, its current lifecycle stage and 30-day activity.')} />
            <ul className="divide-y divide-ink-50">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(agent.id)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors hover:bg-ink-50/70',
                      selected?.id === agent.id && 'bg-govt-50/60',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[0.8125rem] font-semibold text-ink-900">{agent.name}</p>
                        <p className="mt-0.5 text-[0.6875rem] text-ink-500">
                          {t('{0} · {1} runs / 30d · {2} approved', DOMAIN_LABEL[agent.domain], agent.runsLast30d, formatPercent(agent.humanApprovalRate))}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge tone="muted" size="sm">
                          {t('Advisory only')}
                        </Badge>
                        <StateBadge state={agent.status === 'active' ? 'operational' : 'degraded'} />
                      </div>
                    </div>
                    <div className="mt-2">
                      <StageMeter stage={agent.stage} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* The whole column pins, not one panel of it: a `sticky` element stays
            in flow, so a panel below a pinned one would slide up underneath it. */}
        <div className="xl:col-span-4">
          <div className="scrollbar-rail flex flex-col gap-3 xl:sticky xl:top-[3.75rem] xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto">
            {selected ? <AgentDetail agent={selected} /> : <Card><EmptyState title={t('No agent selected')} detail="Select an agent to read its detail." /></Card>}

            <DemonstrationNotice />
          </div>
        </div>
      </div>
    </PageBody>
  )
}

function AgentDetail({ agent }: { agent: AIAgent }): React.JSX.Element {
  const model = AI_MODEL_BY_ID.get(agent.modelId)
  return (
    <>
      <Card>
        <CardHeader
          title={agent.name}
          description={agent.purpose}
          actions={<Badge tone="intel">{t('Advisory only')}</Badge>}
        />
        <div className="mt-3">
          <p className="label-institutional mb-2">{t('Current lifecycle stage')}</p>
          <StageMeter stage={agent.stage} />
          <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">{STAGE_DESCRIPTION[agent.stage]}</p>
        </div>
        <DefinitionList className="mt-4">
          <DefinitionRow label={t('Domain')}>{DOMAIN_LABEL[agent.domain]}</DefinitionRow>
          <DefinitionRow label={t('Model')}>{model?.name ?? agent.modelId}</DefinitionRow>
          <DefinitionRow label={t('Accountable officer')}>{OFFICER_BY_ID.get(agent.ownerId)?.designation ?? agent.ownerId}</DefinitionRow>
          <DefinitionRow label={t('Runs (30 days)')}>{agent.runsLast30d}</DefinitionRow>
          <DefinitionRow label={t('Human approval rate')}>{formatPercent(agent.humanApprovalRate)}</DefinitionRow>
          <DefinitionRow label={t('Last run')}>{formatRelative(agent.lastRunAt)}</DefinitionRow>
        </DefinitionList>
      </Card>

      <Card>
        <CardHeader
          icon={<Ban className="h-4 w-4 text-crit-500" />}
          title={t('Reserved acts')}
          description={t('Government acts this agent is categorically barred from performing, regardless of confidence.')}
        />
        <ul className="mt-3 space-y-1.5">
          {agent.reservedActs.map((act) => (
            <li key={act} className="flex items-start gap-2 rounded-[2px] border border-crit-100 bg-crit-50/40 px-2.5 py-1.5">
              <Ban className="mt-0.5 h-3 w-3 shrink-0 text-crit-500" aria-hidden />
              <span className="text-[0.6875rem] leading-relaxed text-ink-700">{act}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-ink-100 pt-2.5 text-[0.6875rem] leading-relaxed text-ink-500">
          {t('These are not advisory guidelines. The AI gateway blocks any request expressing one of these intents before it reaches a model, and this agent has no path to perform them.')}
        </p>
      </Card>
    </>
  )
}

export default AIAgentsPage
