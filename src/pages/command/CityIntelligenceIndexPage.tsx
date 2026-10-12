import { useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  Gauge,
  Minus,
  Plus,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, ConfidenceBadge, StateBadge } from '@/components/ui/badges'
import { Card, ScoreDial } from '@/components/ui/primitives'
import { DemonstrationNotice, ErrorState, LoadingState } from '@/components/ui/states'
import { GovPanel } from '@/components/gov/GovPanel'
import { CHART_COLOURS, RadarChart } from '@/components/charts'
import { DetailsFold, KpiTile, type InfoTone } from '@/components/infographic'
import { DivergingBars, MeterRow, scoreTone, toneFill, toneText } from '@/components/infographic/meters'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { cityIndexService } from '@/services'
import { useActiveCorporation } from '@/stores/corporation.store'
import { cityName } from '@/config/corporations'
import { usePageMasthead } from '@/stores/masthead.store'
import type { IndexDimension } from '@/domains/executive/intelligence-index'
import { INDEX_WEIGHTS } from '@/domains/executive/intelligence-index'
import { OPERATIONAL_STATE_LABEL } from '@/types/common'
import { cn } from '@/utils/cn'
import { SHADE, shadeForTone, type Shade } from '@/components/ui/shade'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'
import { meaningIcon } from '@/components/ui/meaning-icon'

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
 *
 * Read as an infographic: the composite gauge and the four movement figures
 * first, then the shape of the twelve dimensions (radar), their scores as
 * tiles and their movement as diverging bars; the precise weight ledger stays
 * one click away under "Show details".
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-120),
  refreshIntervalMinutes: 720,
  origin: 'demonstration' as const,
  sourceState: 'simulation' as const,
  stale: false,
}

function TrendGlyph({ points }: { points: number }): React.JSX.Element {
  if (points > 1.5) return <ArrowUpRight className="h-3.5 w-3.5 text-ok-600" aria-hidden />
  if (points < -1.5) return <ArrowDownRight className="h-3.5 w-3.5 text-crit-600" aria-hidden />
  return <ArrowRight className="h-3.5 w-3.5 text-ink-400" aria-hidden />
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${n}`
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
  const byContribution = useMemo(() => [...dimensions].sort((a, b) => b.contribution - a.contribution), [dimensions])
  const byMovement = useMemo(() => [...dimensions].sort((a, b) => b.trendPoints - a.trendPoints), [dimensions])

  if (query.isLoading) return <LoadingState variant="metrics" />
  if (query.error) return <ErrorState detail={query.error.message} onRetry={() => query.refetch()} />

  const index = query.data
  if (!index) return <LoadingState variant="metrics" />

  const compositeTone = scoreTone(index.score)
  const improving = dimensions.filter((d) => d.trendPoints > 1.5).length
  const deteriorating = dimensions.filter((d) => d.trendPoints < -1.5).length
  const weightSum = Object.values(INDEX_WEIGHTS).reduce((s, w) => s + w, 0)

  const highlights: Array<{ key: string; label: string; dim: IndexDimension | null; icon: React.ReactNode; tone: InfoTone; shade: Shade }> = [
    { key: 'strongest', label: t('Strongest dimension'), dim: index.strongest, icon: <Award className="h-5 w-5" />, tone: 'positive', shade: 'green' },
    { key: 'weakest', label: t('Weakest dimension'), dim: index.weakest, icon: <TriangleAlert className="h-5 w-5" />, tone: 'critical', shade: 'red' },
    { key: 'improved', label: t('Most improved'), dim: index.mostImproved, icon: <TrendingUp className="h-5 w-5" />, tone: 'positive', shade: 'teal' },
    { key: 'deteriorated', label: t('Most deteriorated'), dim: index.mostDeteriorated, icon: <TrendingDown className="h-5 w-5" />, tone: 'critical', shade: 'orange' },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Decision Intelligence')}
        breadcrumbs={[{ label: t('Decision Intelligence') }, { label: t('Commissioner Decision Room') }, { label: t('City Index') }]}
        freshness={FRESHNESS}
      />

      <DemonstrationNotice />

      {/* ── Hero: the composite gauge, then where it is anchored and moving ── */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className={cn('flex flex-col items-center gap-4 rounded-xl border p-4 shadow-xs sm:flex-row', SHADE[shadeForTone(compositeTone)].tile)}>
          <ScoreDial score={index.score} size={150} label={t('of 100')} caption={t('Composite index')} />
          <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
            <p className="text-[0.6875rem] font-bold tracking-[0.09em] text-ink-500 uppercase">
              {t('Weighted across all twelve dimensions.')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className={cn('text-lg leading-tight font-bold', toneText(compositeTone))}>
                {OPERATIONAL_STATE_LABEL[index.state]}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-700">
                <TrendGlyph points={index.trendPoints} />
                {signed(index.trendPoints)} {t('vs baseline')}
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 text-[0.6875rem] sm:justify-start">
              <Badge tone="positive" icon={<ArrowUpRight className="h-3 w-3" />}>
                {t('{0} improving', improving)}
              </Badge>
              <Badge tone="critical" icon={<ArrowDownRight className="h-3 w-3" />}>
                {t('{0} deteriorating', deteriorating)}
              </Badge>
              <Badge tone="muted">{t('{0} steady', dimensions.length - improving - deteriorating)}</Badge>
            </div>
            <p className="text-xs leading-relaxed text-ink-600">{index.narrative}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {highlights.map(({ key, label, dim, icon, tone, shade }) =>
            dim ? (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedId(dim.id)}
                className={cn(
                  'rounded-xl text-left transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-govt-400 focus-visible:outline-none',
                  selected?.id === dim.id && 'ring-2 ring-govt-300',
                )}
              >
                <KpiTile
                  icon={icon}
                  label={label}
                  value={
                    <span>
                      {dim.score}
                      <span className="ml-0.5 text-sm font-semibold text-ink-400">/100</span>
                    </span>
                  }
                  reading={`${dim.label} · ${signed(dim.trendPoints)}`}
                  tone={tone}
                  shade={shade}
                />
              </button>
            ) : null,
          )}
        </div>
      </div>

      {/* ── The twelve dimensions: shape · scores · movement ──────────── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <GovPanel title={t('Dimension profile')} subtitle={t('Scores out of 100')} tone="green" dense>
          <div className="h-[290px] p-2">
            <RadarChart
              data={dimensions.map((d) => ({ label: d.label, value: d.score }))}
              unit="/100"
              colour={CHART_COLOURS.primary}
            />
          </div>
        </GovPanel>

        <GovPanel title={t('The twelve dimensions')} subtitle={t('Select a dimension to open its drivers.')} tone="red" dense>
          <div className="grid grid-cols-2 gap-1.5 p-2.5 sm:grid-cols-3">
            {byContribution.map((dim) => {
              const tone = scoreTone(dim.score)
              return (
                <button
                  key={dim.id}
                  type="button"
                  onClick={() => setSelectedId(dim.id)}
                  className={cn(
                    'flex min-w-0 flex-col gap-1 rounded-lg border p-2 text-left transition-shadow hover:shadow-sm',
                    SHADE[shadeForTone(tone)].tile,
                    selected?.id === dim.id && 'border-govt-400 ring-2 ring-govt-400',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-[0.625rem] font-semibold text-ink-600">
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white', SHADE[shadeForTone(tone)].chip)} aria-hidden>
                      {meaningIcon(dim.label, shadeForTone(tone), 'h-3.5 w-3.5')}
                    </span>
                    <span className="truncate">{dim.label}</span>
                  </span>
                  <span className="flex items-baseline justify-between gap-1">
                    <span className={cn('numeric text-xl leading-none font-bold tabular-nums', toneText(tone))}>{dim.score}</span>
                    <span className="inline-flex items-center gap-0.5 text-[0.625rem] text-ink-500">
                      <TrendGlyph points={dim.trendPoints} />
                      {signed(dim.trendPoints)}
                    </span>
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-white/70">
                    <span className="block h-full rounded-full" style={{ width: `${dim.score}%`, backgroundColor: toneFill(tone) }} />
                  </span>
                </button>
              )
            })}
          </div>
          <DetailsFold summary={t('Show weights and contributions')}>
            <p className="px-3 pb-1.5 text-[0.6875rem] leading-relaxed text-ink-500">
              {t('Ranked by weighted contribution to the composite. Select a dimension to open its drivers.')}
            </p>
            <ul className="divide-y divide-ink-50">
              {byContribution.map((dim) => (
                <li key={dim.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(dim.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[0.6875rem] hover:bg-govt-50/60',
                      selected?.id === dim.id && 'bg-govt-50/60',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium text-ink-800">{dim.label}</span>
                      <ConfidenceBadge confidence={dim.confidence} />
                    </span>
                    <span className="numeric shrink-0 text-ink-500 tabular-nums">
                      {t('w {0} · {1} pts', dim.weight.toFixed(2), dim.contribution)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </DetailsFold>
        </GovPanel>

        <GovPanel title={t('Movement highlights')} subtitle={t('Points against the prior-period baseline')} tone="amber" dense>
          <p className="px-3 pt-2.5 text-[0.6875rem] leading-relaxed text-ink-500">
            {t('Where the composite is anchored and where it is moving.')}
          </p>
          <div className="p-2">
            <DivergingBars
              items={byMovement.map((d) => ({ id: d.id, label: d.label, value: d.trendPoints }))}
              onSelect={setSelectedId}
              selectedId={selected?.id ?? null}
            />
          </div>
          <p className="flex justify-between px-3 pb-2.5 text-[0.625rem] font-semibold tracking-wide text-ink-400 uppercase">
            <span>◂ {t('Deteriorating')}</span>
            <span>{t('Improving')} ▸</span>
          </p>
        </GovPanel>
      </div>

      {selected ? <DimensionDetail dimension={selected} /> : null}

      <Card tone="sunken">
        <p className="text-[0.6875rem] leading-relaxed text-ink-500">
          {t('Weights sum to {0}. The trend for each dimension is computed against a deterministic prior-period baseline held in the demonstration environment - it is a modelled comparison, not an observed historical series, because this environment holds no time-series store. In production this becomes a genuine period-over-period comparison from the metric store.', weightSum.toFixed(2))}
        </p>
      </Card>
    </PageBody>
  )
}

function DimensionDetail({ dimension }: { dimension: IndexDimension }): React.JSX.Element {
  const maxEffect = Math.max(
    ...dimension.positiveContributors.map((c) => Math.abs(c.effect)),
    ...dimension.negativeContributors.map((c) => Math.abs(c.effect)),
    1,
  )
  const raised = dimension.positiveContributors.reduce((s, c) => s + Math.abs(c.effect), 0)
  const lowered = dimension.negativeContributors.reduce((s, c) => s + Math.abs(c.effect), 0)
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <GovPanel title={dimension.label} subtitle={t('Dimension score')} tone="primary" dense actions={<StateBadge state={dimension.state} />}>
        <div className="flex flex-col items-center gap-3 p-3 sm:flex-row lg:flex-col xl:flex-row">
          <ScoreDial score={dimension.score} size={112} label="/100" caption={t('Dimension score')} />
          <div className="min-w-0 flex-1 space-y-2">
            <MeterRow
              label={t('Weight in the composite')}
              value={dimension.weight * 100}
              max={15}
              display={dimension.weight.toFixed(2)}
              tone="neutral"
            />
            <MeterRow
              label={t('Points carried into the composite')}
              value={dimension.contribution}
              max={15}
              display={t('{0} pts', dimension.contribution)}
              tone={scoreTone(dimension.score)}
            />
            <p className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-ink-500">
              <TrendGlyph points={dimension.trendPoints} />
              {signed(dimension.trendPoints)}{' '}{t('points against the prior-period baseline · confidence')}{' '}
              <ConfidenceBadge confidence={dimension.confidence} />
            </p>
          </div>
        </div>
        <p className="border-t border-ink-100 px-3 py-2.5 text-xs leading-relaxed text-ink-600">
          {t('Weight {0} · contributes {1} points to the composite', dimension.weight.toFixed(2), dimension.contribution)}
          {' — '}
          {dimension.explanation}
        </p>
        <div className="flex items-start gap-2 border-t border-ink-100 px-3 py-2.5">
          <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
          <div className="min-w-0">
            <p className="text-[0.75rem] font-semibold text-ink-800">{t('Computed from')}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {dimension.sources.map((s) => (
                <Badge key={s} tone="muted" size="sm">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </GovPanel>

      <ContributorPanel
        title={t('What raised this score')}
        tone="green"
        sign="positive"
        total={raised}
        maxEffect={maxEffect}
        contributors={dimension.positiveContributors}
        empty={t('No positive contributor is recorded for this dimension in the current period.')}
      />
      <ContributorPanel
        title={t('What lowered this score')}
        tone="red"
        sign="negative"
        total={lowered}
        maxEffect={maxEffect}
        contributors={dimension.negativeContributors}
        empty={t('No negative contributor is recorded for this dimension in the current period.')}
      />
    </div>
  )
}

function ContributorPanel({
  title,
  tone,
  sign,
  total,
  maxEffect,
  contributors,
  empty,
}: {
  title: string
  tone: 'green' | 'red'
  sign: 'positive' | 'negative'
  total: number
  maxEffect: number
  contributors: IndexDimension['positiveContributors']
  empty: string
}): React.JSX.Element {
  const infoTone: InfoTone = sign === 'positive' ? 'positive' : 'critical'
  const Glyph = sign === 'positive' ? Plus : Minus
  return (
    <GovPanel
      title={title}
      tone={tone}
      dense
      actions={
        <span className={cn('numeric inline-flex items-center gap-0.5 text-sm font-bold', toneText(infoTone))}>
          <Glyph className="h-3.5 w-3.5" />
          {Math.round(total * 10) / 10}
        </span>
      }
    >
      {contributors.length === 0 ? (
        <p className="p-3 text-xs leading-relaxed text-ink-500">{empty}</p>
      ) : (
        <>
          <div className="space-y-2 p-3">
            {contributors.map((c, i) => (
              <MeterRow
                key={`${sign}-${i}`}
                label={c.label}
                value={Math.abs(c.effect)}
                max={maxEffect}
                display={`${sign === 'positive' ? '+' : '−'}${Math.abs(c.effect)}`}
                tone={infoTone}
              />
            ))}
          </div>
          <DetailsFold summary={t('Show contributor detail')}>
            <ul className="space-y-1.5 px-3 pb-3">
              {contributors.map((c, i) => (
                <li key={`${sign}-d-${i}`} className="text-[0.6875rem] leading-relaxed text-ink-600">
                  <span className="font-semibold text-ink-800">{c.label}</span> — {c.detail}
                </li>
              ))}
            </ul>
          </DetailsFold>
        </>
      )}
    </GovPanel>
  )
}

export default CityIntelligenceIndexPage
