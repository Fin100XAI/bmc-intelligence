import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClipboardCheck, FlaskConical, Network, ShieldCheck } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badges'
import { Card, DefinitionList, DefinitionRow, MetricGrid, ProgressBar } from '@/components/ui/primitives'
import { GovPanel } from '@/components/gov/GovPanel'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { MetricCard } from '@/components/cards/MetricCard'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { aiService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { useFilterStore } from '@/stores/ui.store'
import type { FilterState } from '@/stores/ui.store'
import type { AIEvaluation } from '@/types/ai'
import type { DateRangeKey } from '@/types/common'
import { formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import { DEMO_NOW, isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/ai/AIEvaluationPage.tsx
 *
 * AI Evaluation.
 *
 * The model registry records a one-word evaluation status. This screen is the
 * evidence behind that word: for each model, a dated run against six published
 * dimensions, each scored against a published threshold. A model passes only if
 * it clears every dimension. An evaluation a governance board cannot inspect is
 * not an evaluation, so the whole run is laid open here.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-22 * 24 * 60),
  refreshIntervalMinutes: 43200,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const VERDICT_TONE: Record<AIEvaluation['verdict'], 'positive' | 'critical' | 'warn'> = {
  passed: 'positive',
  failed: 'critical',
  're-evaluation-due': 'warn',
}
function build$VERDICT_LABEL(): Record<AIEvaluation['verdict'], string> {
  return {
    passed: t('Passed'),
    failed: t('Failed'),
    're-evaluation-due': t('Re-evaluation due'),
  }
}
let VERDICT_LABEL: Record<AIEvaluation['verdict'], string> = build$VERDICT_LABEL()
registerLayer(() => {
  VERDICT_LABEL = build$VERDICT_LABEL()
})

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

function matchesGlobalFilters(evaluation: AIEvaluation, filters: FilterState): boolean {
  if (filters.statuses.length > 0 && !filters.statuses.includes(evaluation.verdict)) return false
  if (!withinDateRange(evaluation.evaluatedAt, filters.dateRange)) return false
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    if (
      !evaluation.modelName.toLowerCase().includes(q) &&
      !evaluation.modelVersion.toLowerCase().includes(q) &&
      !evaluation.summary.toLowerCase().includes(q)
    )
      return false
  }
  return true
}

export function AIEvaluationPage(): React.JSX.Element {
  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(t('AI Evaluation'))

  const query = useServiceQuery(queryKeys.ai('evaluations'), (u) => aiService.evaluations(u))
  const [searchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const filters = useFilterStore((s) => s.filters)

  const evaluations = useMemo(() => query.data ?? [], [query.data])
  const statusOptions = useMemo(
    () => (Object.keys(VERDICT_LABEL) as AIEvaluation['verdict'][]).map((v) => ({ value: v, label: VERDICT_LABEL[v] })),
    [],
  )
  const filteredEvaluations = useMemo(
    () => evaluations.filter((e) => matchesGlobalFilters(e, filters)),
    [evaluations, filters],
  )
  const selected = useMemo(
    () => filteredEvaluations.find((e) => e.id === selectedId) ?? filteredEvaluations[0] ?? null,
    [filteredEvaluations, selectedId],
  )

  // `?run=<evaluationId>` selects that evaluation run on arrival - the entry
  // point a model's card and AI Recommendations link into, so a reviewer
  // reaches the full run behind a model's evaluation status in one click.
  useEffect(() => {
    const id = searchParams.get('run')
    if (id) setSelectedId(id)
    // Only ever re-run if the URL parameter itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  if (query.isLoading) return <LoadingState variant="block" rows={6} />
  if (query.error) return <ErrorState detail={query.error.message} onRetry={() => query.refetch()} />

  const passed = filteredEvaluations.filter((e) => e.verdict === 'passed').length
  const failed = filteredEvaluations.filter((e) => e.verdict === 'failed').length
  const due = filteredEvaluations.filter((e) => e.verdict === 're-evaluation-due').length

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('AI & Automation')}
        breadcrumbs={[{ label: t('AI & Automation') }, { label: t('AI Evaluation') }]}
        freshness={FRESHNESS}
        controls={<FilterBar show={['date', 'status', 'search']} statusOptions={statusOptions} />}
      />

      {/* ── Two columns ─────────────────────────────────────────────
          The standing count of what passes, fails and is due, then the runs
          themselves, read down the wide column. The run an officer has opened
          — its composite, its six dimensions and the rule that a single failed
          threshold withholds the model — stands pinned beside them. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          <MetricGrid columns={3}>
            <MetricCard label={t('Models evaluated')} value={evaluations.length} support={t('{0} passing', passed)} icon={<FlaskConical className="h-4 w-4" />} background="amber" />
            <MetricCard
              label={t('Failing evaluation')}
              value={failed}
              tone={failed > 0 ? 'critical' : 'positive'}
              support={t('Withheld from declared uses')}
              icon={<ShieldCheck className="h-4 w-4" />}
              background="green"
            />
            <MetricCard label={t('Re-evaluation due')} value={due} tone={due > 0 ? 'warn' : 'default'} support={t('Approaching or past threshold')} icon={<ClipboardCheck className="h-4 w-4" />} background="red" />
          </MetricGrid>

          <Card tone="sunken">
            <div className="flex items-start gap-2.5">
              <Network className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold text-ink-900">{t('Evaluated once, applies to every tenant')}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  {t('These runs score the model and prompt template themselves against the platform\'s AI gateway - they hold no corporation-specific data and are not scoped to a tenant. A model that passes here is approved for every corporation the reusable engine serves, not for Brihanmumbai alone; a corporation onboarded after this evaluation inherits the same verdict without a re-run.')}
                </p>
              </div>
            </div>
          </Card>

          <GovPanel title={t('Evaluation runs')} tone="amber" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('One run per model. Select a run to open its dimension scores.')}
            </p>
            {evaluations.length === 0 ? (
              <EmptyState title={t('No evaluations')} detail={t('No model evaluation runs are on record.')} />
            ) : filteredEvaluations.length === 0 ? (
              <EmptyState title={t('No evaluations match the current filters')} detail={t('Widen the date range or clear a filter to see more results.')} />
            ) : (
              <ul className="divide-y divide-ink-50">
                {filteredEvaluations.map((evaluation) => (
                  <li key={evaluation.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(evaluation.id)}
                      className={cn(
                        'w-full px-4 py-3 text-left transition-colors hover:bg-ink-50/70',
                        selected?.id === evaluation.id && 'bg-govt-50/60',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[0.8125rem] font-semibold text-ink-900">
                            {evaluation.modelName} <span className="numeric text-ink-400">v{evaluation.modelVersion}</span>
                          </p>
                          <p className="mt-0.5 text-[0.6875rem] text-ink-500">
                            {t('{0} cases · evaluated {1}', evaluation.caseCount.toLocaleString(), formatRelative(evaluation.evaluatedAt))}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge tone={VERDICT_TONE[evaluation.verdict]}>{VERDICT_LABEL[evaluation.verdict]}</Badge>
                          <span className="numeric w-9 text-right text-[0.8125rem] font-semibold text-ink-900">
                            {evaluation.compositeScore}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        {evaluation.dimensions.map((d) => (
                          <span
                            key={d.id}
                            title={t('{0}: {1} (threshold {2})', d.label, d.score, d.threshold)}
                            className={cn('h-1.5 flex-1 rounded-full', d.passed ? 'bg-ok-500' : 'bg-crit-500')}
                          />
                        ))}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </GovPanel>
        </div>

        {/* The whole column pins, not one panel of it: a `sticky` element stays
            in flow, so a panel below a pinned one would slide up underneath it. */}
        <div className="xl:col-span-4">
          <div className="scrollbar-rail flex flex-col gap-3 xl:sticky xl:top-[3.75rem] xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto">
            {selected ? (
              <>
                <GovPanel
                  title={t('{0} v{1}', selected.modelName, selected.modelVersion)}
                  tone="red"
                  actions={<Badge tone={VERDICT_TONE[selected.verdict]}>{VERDICT_LABEL[selected.verdict]}</Badge>}
                >
                  <p className="mb-3 text-xs leading-relaxed text-ink-500">{selected.summary}</p>
                  <DefinitionList className="mt-3">
                    <DefinitionRow label={t('Composite score')}>{selected.compositeScore}/100</DefinitionRow>
                    <DefinitionRow label={t('Held-out cases')}>{selected.caseCount.toLocaleString()}</DefinitionRow>
                    <DefinitionRow label={t('Evaluated')}>{formatRelative(selected.evaluatedAt)}</DefinitionRow>
                  </DefinitionList>
                </GovPanel>

                <GovPanel title={t('Dimension results')} tone="amber">
                  <p className="mb-3 text-xs leading-relaxed text-ink-500">
                    {t('Each dimension scored against its published pass threshold.')}
                  </p>
                  <ul className="mt-3 space-y-3">
                    {selected.dimensions.map((d) => (
                      <li key={d.id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[0.8125rem] font-medium text-ink-800">{d.label}</span>
                          <span className="numeric text-[0.6875rem] text-ink-500">
                            <span className={cn('font-semibold', d.passed ? 'text-ok-700' : 'text-crit-700')}>
                              {d.score}
                            </span>
                            <span className="mx-1 text-ink-300">/</span>
                            {t('threshold {0}', d.threshold)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <ProgressBar value={d.score} className="flex-1" />
                          <Badge tone={d.passed ? 'positive' : 'critical'} size="sm">
                            {d.passed ? t('Pass') : t('Fail')}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">{d.detail}</p>
                      </li>
                    ))}
                  </ul>
                </GovPanel>

                <Card tone="sunken">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
                    <p className="text-[0.6875rem] leading-relaxed text-ink-600">
                      {t('A model is approved for its declared uses only when it clears every dimension. A single failed dimension withholds the model, regardless of how high the composite score is - the composite cannot buy back a failed threshold.')}
                    </p>
                  </div>
                </Card>
              </>
            ) : null}

            <DemonstrationNotice />
          </div>
        </div>
      </div>
    </PageBody>
  )
}

export default AIEvaluationPage
