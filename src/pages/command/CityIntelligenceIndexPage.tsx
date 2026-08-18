import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Gauge, Minus, Plus } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, ConfidenceBadge, StateBadge } from '@/components/ui/badges'
import { Card, ProgressBar, ScoreDial } from '@/components/ui/primitives'
import { DemonstrationNotice, ErrorState, LoadingState } from '@/components/ui/states'
import { GovPanel } from '@/components/gov/GovPanel'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { cityIndexService } from '@/services'
import { useActiveCorporation } from '@/stores/corporation.store'
import { cityName } from '@/config/corporations'
import { usePageMasthead } from '@/stores/masthead.store'
import type { IndexDimension } from '@/domains/executive/intelligence-index'
import { INDEX_WEIGHTS } from '@/domains/executive/intelligence-index'
import { cn } from '@/utils/cn'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * src/pages/command/CityIntelligenceIndexPage.tsx
 *
 * The active corporation's City Intelligence Index.
 *
 * One composite over twelve dimensions - and the whole discipline of this page
 * is that the composite is never allowed to stand alone. Selecting a dimension
 * opens what raised it and what lowered it, in the corporation's own units,
 * with the weight that carried it into the headline. A Commissioner should be
 * able to answer "why did it move" without leaving the screen.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-120),
  refreshIntervalMinutes: 720,
  origin: 'derived-metric' as const,
  sourceState: 'operational' as const,
  stale: false,
}

function TrendGlyph({ points }: { points: number }): React.JSX.Element {
  if (points > 1.5) return <ArrowUpRight className="h-3.5 w-3.5 text-ok-600" aria-hidden />
  if (points < -1.5) return <ArrowDownRight className="h-3.5 w-3.5 text-crit-600" aria-hidden />
  return <ArrowRight className="h-3.5 w-3.5 text-ink-400" aria-hidden />
}

export function CityIntelligenceIndexPage(): React.JSX.Element {
  const corporation = useActiveCorporation()
  const query = useServiceQuery(queryKeys.cityIndex(), (u) => cityIndexService.index(u))
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(t('{0} City Intelligence Index', cityName(corporation)))

  const dimensions = useMemo(() => query.data?.dimensions ?? [], [query.data])
  const selected = useMemo(
    () => dimensions.find((d) => d.id === selectedId) ?? dimensions[0] ?? null,
    [dimensions, selectedId],
  )

  if (query.isLoading) return <LoadingState variant="metrics" />
  if (query.error) return <ErrorState detail={query.error.message} onRetry={() => query.refetch()} />

  const index = query.data
  if (!index) return <LoadingState variant="metrics" />

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Command')}
        breadcrumbs={[{ label: t('Command') }, { label: t('City Intelligence Index') }]}
        freshness={FRESHNESS}
      />

      <DemonstrationNotice />

      {/* ── Two columns ──────────────────────────────────────────────
          The composite and the twelve figures it is made of read down the
          wide column, in the order the arithmetic runs. Beside them: where
          the index is moving, and the full account of whichever dimension
          is open — so a score and its drivers are on screen together. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Column 1 — the composite and its components -------------- */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-7">
          <GovPanel title={t('Composite index')} tone="primary">
            <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Weighted across all twelve dimensions.')}</p>
            <div className="flex items-center gap-4">
              <ScoreDial score={index.score} label={t('Index')} caption={`${index.score}/100`} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StateBadge state={index.state} />
                  <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-ink-600">
                    <TrendGlyph points={index.trendPoints} />
                    {index.trendPoints >= 0 ? '+' : ''}
                    {index.trendPoints}{' '}{t('vs baseline')}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-600">{index.narrative}</p>
              </div>
            </div>
          </GovPanel>

          <GovPanel
            title={t('The twelve dimensions')}
            tone="red"
            dense
          >
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Ranked by weighted contribution to the composite. Select a dimension to open its drivers.')}
            </p>
            <ul className="divide-y divide-ink-50">
              {[...dimensions]
                .sort((a, b) => b.contribution - a.contribution)
                .map((dim) => (
                  <li key={dim.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(dim.id)}
                      className={cn(
                        'w-full px-4 py-3 text-left transition-colors hover:bg-ink-50/70',
                        selected?.id === dim.id && 'bg-govt-50/60',
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[0.8125rem] font-semibold text-ink-900">{dim.label}</span>
                          <ConfidenceBadge confidence={dim.confidence} />
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[0.6875rem] text-ink-500">
                            <TrendGlyph points={dim.trendPoints} />
                            {dim.trendPoints >= 0 ? '+' : ''}
                            {dim.trendPoints}
                          </span>
                          <span className="numeric w-9 text-right text-[0.8125rem] font-semibold text-ink-900">
                            {dim.score}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <ProgressBar value={dim.score} className="flex-1" />
                        <span className="numeric shrink-0 text-[0.625rem] text-ink-400">
                          {t('w {0} · {1} pts', dim.weight.toFixed(2), dim.contribution)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
            </ul>
          </GovPanel>

          <Card tone="sunken">
            <p className="text-[0.6875rem] leading-relaxed text-ink-500">
              {t('Weights sum to {0}. The trend for each dimension is computed against a deterministic prior-period baseline held in the demonstration environment - it is a modelled comparison, not an observed historical series, because this environment holds no time-series store. In production this becomes a genuine period-over-period comparison from the metric store.', Object.values(INDEX_WEIGHTS).reduce((s, w) => s + w, 0).toFixed(2))}
            </p>
          </Card>
        </div>

        {/* Column 2 — movement and the open dimension --------------- */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-5">
          <GovPanel title={t('Movement highlights')} tone="amber">
            <p className="mb-3 text-xs leading-relaxed text-ink-500">
              {t('Where the composite is anchored and where it is moving.')}
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {[
                { label: t('Strongest dimension'), dim: index.strongest, tone: 'positive' as const },
                { label: t('Weakest dimension'), dim: index.weakest, tone: 'critical' as const },
                { label: t('Most improved'), dim: index.mostImproved, tone: 'positive' as const },
                { label: t('Most deteriorated'), dim: index.mostDeteriorated, tone: 'critical' as const },
              ].map(({ label, dim }) =>
                dim ? (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSelectedId(dim.id)}
                    className="rounded-[2px] border border-ink-100 p-2.5 text-left transition-colors hover:bg-ink-50/70"
                  >
                    <p className="label-institutional">{label}</p>
                    <p className="mt-1 truncate text-[0.8125rem] font-semibold text-ink-900">{dim.label}</p>
                    <p className="numeric mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-ink-500">
                      {dim.score}/100
                      <span className="text-ink-300">·</span>
                      <TrendGlyph points={dim.trendPoints} />
                      {dim.trendPoints >= 0 ? '+' : ''}
                      {dim.trendPoints}
                    </p>
                  </button>
                ) : null,
              )}
            </div>
          </GovPanel>

          {selected ? <DimensionDetail dimension={selected} /> : null}
        </div>
      </div>
    </PageBody>
  )
}

function DimensionDetail({ dimension }: { dimension: IndexDimension }): React.JSX.Element {
  return (
    <>
      <GovPanel
        title={dimension.label}
        tone="red"
        actions={<StateBadge state={dimension.state} />}
      >
        <p className="mb-3 text-xs leading-relaxed text-ink-500">
          {t('Weight {0} · contributes {1} points to the composite', dimension.weight.toFixed(2), dimension.contribution)}
        </p>
        <div>
          <div className="flex items-baseline justify-between">
            <span className="label-institutional">{t('Dimension score')}</span>
            <span className="numeric text-metric-sm font-semibold text-ink-900">
              {dimension.score}
              <span className="ml-0.5 text-sm font-normal text-ink-400">/100</span>
            </span>
          </div>
          <ProgressBar value={dimension.score} className="mt-2" />
          <p className="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-ink-500">
            <TrendGlyph points={dimension.trendPoints} />
            {dimension.trendPoints >= 0 ? '+' : ''}
            {dimension.trendPoints}{' '}{t('points against the prior-period baseline · confidence')}{' '}
            <ConfidenceBadge confidence={dimension.confidence} />
          </p>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-600">{dimension.explanation}</p>
      </GovPanel>

      <GovPanel title={t('What raised this score')} tone="amber">
        {dimension.positiveContributors.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink-500">
            {t('No positive contributor is recorded for this dimension in the current period.')}
          </p>
        ) : (
          <ul className="space-y-2">
            {dimension.positiveContributors.map((c, i) => (
              <li key={`pos-${i}`} className="rounded-[2px] border border-ok-100 bg-ok-50/40 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-[0.8125rem] font-medium text-ink-800">{c.label}</p>
                  <span className="numeric inline-flex shrink-0 items-center gap-0.5 text-[0.6875rem] font-semibold text-ok-700">
                    <Plus className="h-3 w-3" />
                    {Math.abs(c.effect)}
                  </span>
                </div>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">{c.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </GovPanel>

      <GovPanel title={t('What lowered this score')} tone="green">
        {dimension.negativeContributors.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink-500">
            {t('No negative contributor is recorded for this dimension in the current period.')}
          </p>
        ) : (
          <ul className="space-y-2">
            {dimension.negativeContributors.map((c, i) => (
              <li key={`neg-${i}`} className="rounded-[2px] border border-crit-100 bg-crit-50/40 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-[0.8125rem] font-medium text-ink-800">{c.label}</p>
                  <span className="numeric inline-flex shrink-0 items-center gap-0.5 text-[0.6875rem] font-semibold text-crit-700">
                    <Minus className="h-3 w-3" />
                    {Math.abs(c.effect)}
                  </span>
                </div>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">{c.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </GovPanel>

      <Card tone="sunken">
        <div className="flex items-start gap-2.5">
          <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-semibold text-ink-800">{t('Computed from')}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {dimension.sources.map((s) => (
                <Badge key={s} tone="muted" size="sm">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}

export default CityIntelligenceIndexPage
