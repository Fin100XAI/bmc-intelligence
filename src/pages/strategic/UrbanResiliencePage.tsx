import { useMemo, useState } from 'react'
import { ShieldCheck, Waves } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { StateBadge } from '@/components/ui/badges'
import { Card, CardHeader, DefinitionList, DefinitionRow, ProgressBar, ScoreDial } from '@/components/ui/primitives'
import { DemonstrationNotice, ErrorState, LoadingState } from '@/components/ui/states'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { resilienceService } from '@/services'
import { useActiveCorporation } from '@/stores/corporation.store'
import { usePageMasthead } from '@/stores/masthead.store'

import { cn } from '@/utils/cn'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * src/pages/strategic/UrbanResiliencePage.tsx
 *
 * The active corporation's Urban Resilience Index.
 *
 * Ten hazards, each scored on the corporation's PREPAREDNESS to absorb them -
 * not on the likelihood the hazard occurs. That distinction is the whole point
 * of the page and is stated on every score: a high flood-resilience number
 * says the drains, pumps and ward readiness are in a state to cope, never that
 * the monsoon will be mild.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-240),
  refreshIntervalMinutes: 1440,
  origin: 'derived-metric' as const,
  sourceState: 'operational' as const,
  stale: false,
}

export function UrbanResiliencePage(): React.JSX.Element {
  const corporation = useActiveCorporation()
  const query = useServiceQuery(queryKeys.resilience(), (u) => resilienceService.index(u))
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const dimensions = useMemo(() => query.data?.dimensions ?? [], [query.data])
  const selected = useMemo(
    () => dimensions.find((d) => d.id === selectedId) ?? dimensions[0] ?? null,
    [dimensions, selectedId],
  )

  // The shell's masthead states the screen's name; the page states the wording.
  // Declared above the loading guards because a hook cannot sit behind an early
  // return - `dimensions` is the same list `index.dimensions` resolves to.
  usePageMasthead(
    t('{0} Urban Resilience Index', corporation.city),
    t('The city\'s capacity to absorb a shock and keep functioning, scored across the {0} hazards {1} plans against. Every score measures preparedness, not the likelihood of the hazard - a strong flood score does not forecast a mild monsoon.', dimensions.length, corporation.city),
  )

  if (query.isLoading) return <LoadingState variant="metrics" />
  if (query.error) return <ErrorState detail={query.error.message} onRetry={() => query.refetch()} />

  const index = query.data
  if (!index) return <LoadingState variant="metrics" />

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Strategic Intelligence')}
        breadcrumbs={[{ label: t('Strategic Intelligence') }, { label: t('Urban Resilience') }]}
        freshness={FRESHNESS}
      />

      {/* ── Two columns ─────────────────────────────────────────────
          The composite, the ranked hazards and the full preparedness detail
          read down the wide column, in that order: the one figure, then the
          ordering that explains it, then the record behind each line. The
          hazard the officer has selected stands pinned beside them. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          <Card>
            <CardHeader
              title={t('Composite resilience')}
              description={t('Weighted across all {0} hazards assessed for this corporation.', index.dimensions.length)}
            />
            <div className="mt-3 flex items-center gap-4">
              <ScoreDial score={index.score} label={t('Index')} caption={`${index.score}/100`} />
              <div className="min-w-0">
                <StateBadge state={index.state} />
                <p className="mt-2 text-xs leading-relaxed text-ink-600">{index.narrative}</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t('Preparedness by hazard')}
              description={t('Ranked weakest first - where the corporation is least prepared to absorb a shock.')}
            />
            <ul className="mt-2 divide-y divide-ink-50">
              {dimensions.map((dim) => (
                <li key={dim.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(dim.id)}
                    className={cn(
                      'w-full px-1 py-2 text-left transition-colors hover:bg-ink-50/70',
                      selected?.id === dim.id && 'bg-govt-50/60',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[0.8125rem] font-medium text-ink-800">{dim.label}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <StateBadge state={dim.state} />
                        <span className="numeric w-9 text-right text-[0.8125rem] font-semibold text-ink-900">
                          {dim.score}
                        </span>
                      </div>
                    </div>
                    <ProgressBar value={dim.score} className="mt-1.5" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card flush>
            <CardHeader
              bordered
              title={t('Hazard preparedness detail')}
              description={t('Each hazard\'s score, its weight in the composite and its primary gap.')}
            />
            <ul className="divide-y divide-ink-50">
              {[...dimensions]
                .sort((a, b) => b.contribution - a.contribution)
                .map((dim) => (
                  <li key={dim.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Waves className="h-4 w-4 shrink-0 text-govt-500" aria-hidden />
                        <span className="truncate text-[0.8125rem] font-semibold text-ink-900">{dim.label}</span>
                        <StateBadge state={dim.state} />
                      </div>
                      <span className="numeric shrink-0 text-[0.625rem] text-ink-400">
                        {t('w {0} · {1} pts', dim.weight.toFixed(2), dim.contribution)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{dim.explanation}</p>
                    <p className="mt-1.5 text-[0.6875rem] font-medium text-crit-700">{t('Primary gap · {0}', dim.primaryGap)}</p>
                  </li>
                ))}
            </ul>
          </Card>

          <Card tone="sunken">
            <p className="text-[0.6875rem] leading-relaxed text-ink-500">
              {t('Weights sum to {0} across the {1} dimensions assessed here, ordered so that flood and extreme rainfall carry the most weight - the recurring monsoon hazards every municipal corporation in the state plans against. A dimension the corporation has no jurisdiction over is not scored at all rather than scored as zero, and the remaining weights are rescaled in proportion, so two corporations\' composite scores stay comparable. Flood, rainfall, fire, building and emergency-response dimensions read live from the corporation\'s registers; heat and utility-failure resilience are partially instrumented and carry demonstration baselines until their production telemetry is connected.', index.dimensions.reduce((s, d) => s + d.weight, 0).toFixed(2), index.dimensions.length)}
            </p>
          </Card>
        </div>

        {/* The whole column pins, not one panel of it: a `sticky` element stays
            in flow, so a panel below a pinned one would slide up underneath it.
            The bounded height is the safety net on a short viewport. */}
        <div className="xl:col-span-4">
          <div className="scrollbar-rail flex flex-col gap-3 xl:sticky xl:top-[3.75rem] xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto">
            {selected ? (
              <>
                <Card>
                  <CardHeader
                    title={selected.label}
                    description={t('Weight {0} · contributes {1} points', selected.weight.toFixed(2), selected.contribution)}
                    actions={<StateBadge state={selected.state} />}
                  />
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between">
                      <span className="label-institutional">{t('Preparedness score')}</span>
                      <span className="numeric text-metric-sm font-semibold text-ink-900">
                        {selected.score}
                        <span className="ml-0.5 text-sm font-normal text-ink-400">/100</span>
                      </span>
                    </div>
                    <ProgressBar value={selected.score} className="mt-2" />
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-ink-600">{selected.explanation}</p>
                </Card>

                <Card>
                  <CardHeader title={t('Drivers')} description={t('The records this hazard\'s preparedness is computed from.')} />
                  <DefinitionList className="mt-2">
                    {selected.drivers.map((d) => (
                      <DefinitionRow key={d.label} label={d.label}>
                        {d.value}
                      </DefinitionRow>
                    ))}
                  </DefinitionList>
                </Card>

                <Card tone="sunken">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[0.8125rem] font-semibold text-ink-800">{t('Preparedness, not prediction')}</p>
                      <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">
                        {t('This score describes how prepared the corporation is to absorb a {0} shock. It is not a forecast that such a shock will or will not occur, and it must never be read as one. Some hazards here - heat and utility continuity in particular - are only partially instrumented in this environment and are marked accordingly.', selected.label.toLowerCase())}
                      </p>
                    </div>
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

export default UrbanResiliencePage
