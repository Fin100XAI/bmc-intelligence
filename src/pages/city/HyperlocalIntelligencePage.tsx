import { useMemo, useState } from 'react'
import { Layers3, MapPin, ShieldAlert, Sigma } from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { Badge, SeverityBadge } from '@/components/ui/badges'
import { Card, Label, MetricGrid, ProgressBar, Select } from '@/components/ui/primitives'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { MetricCard } from '@/components/cards/MetricCard'
import { GovPanel } from '@/components/gov/GovPanel'
import { CityMap } from '@/components/map/CityMap'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { hyperlocalService } from '@/services'
import { SIGNAL_WEIGHTS } from '@/domains/hyperlocal/signals'
import { usePageMasthead } from '@/stores/masthead.store'
import { useContextStore } from '@/stores/ui.store'
import { WARDS } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * src/pages/city/HyperlocalIntelligencePage.tsx
 *
 * Hyperlocal Intelligence.
 *
 * A ward average conceals the street. This screen composes every signal the
 * platform already holds down to locality level and ranks localities by how
 * many DISTINCT problems are stacking in one place - a locality with drainage,
 * waste and road failure at once needs a coordinated visit, not three
 * departments arriving separately over three weeks.
 *
 * Two honesty constraints are load-bearing here. No citizen personal data is
 * read: a complaint contributes its category, locality and timing only.
 * And complaint counts are locality-level while the corporation's asset
 * registers are ward-level, so infrastructure signals are attributed to every
 * locality in that ward - the page says so rather than implying a survey.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-60),
  refreshIntervalMinutes: 360,
  origin: 'derived-metric' as const,
  sourceState: 'operational' as const,
  stale: false,
}

export function HyperlocalIntelligencePage(): React.JSX.Element {
  /**
   * The locality ranking answers to two ward controls: the one in the command
   * bar, which narrows the whole interface, and the one this page renders for
   * a quick local comparison. Holding the page control purely locally made the
   * shared selection inert here - an operator could narrow the shell to Ward
   * K/E and read the same city-wide locality ranking underneath it.
   *
   * `from` records which shared selection the local choice was made against,
   * so the two compose without an effect and without either silently winning:
   * a new selection in the command bar governs the page, and choosing on the
   * page overrides it until the command bar moves again.
   */
  const contextWardId = useContextStore((s) => s.wardId)
  const [localWard, setLocalWard] = useState<{ wardId: string; from: string | null }>({ wardId: '', from: null })

  const wardId = localWard.from === contextWardId ? localWard.wardId : contextWardId ?? ''
  const setWardId = (id: string): void => setLocalWard({ wardId: id, from: contextWardId })

  const [minTypes, setMinTypes] = useState<string>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  usePageMasthead(t('Hyperlocal Intelligence'))

  const filters = useMemo(
    () => ({
      ...(wardId ? { wardId } : {}),
      ...(minTypes ? { minSignalTypes: Number(minTypes) } : {}),
    }),
    [wardId, minTypes],
  )

  const summaryQuery = useServiceQuery(queryKeys.hyperlocal(`summary:${wardId}`), (u) =>
    hyperlocalService.summary(u, wardId ? { wardId } : {}),
  )
  const cellsQuery = useServiceQuery(queryKeys.hyperlocal(`cells:${wardId}:${minTypes}`), (u) =>
    hyperlocalService.cells(u, filters),
  )
  const rollupQuery = useServiceQuery(queryKeys.hyperlocal(`rollup:${wardId}`), (u) =>
    hyperlocalService.wardRollup(u, wardId ? { wardId } : {}),
  )

  const cells = useMemo(() => cellsQuery.data ?? [], [cellsQuery.data])
  const rollup = useMemo(() => rollupQuery.data ?? [], [rollupQuery.data])

  const selected = useMemo(
    () => cells.find((c) => c.id === selectedId) ?? cells[0] ?? null,
    [cells, selectedId],
  )

  const rollupByWard = useMemo(() => new Map(rollup.map((r) => [r.wardId, r])), [rollup])

  if (summaryQuery.isLoading) return <LoadingState variant="metrics" />
  if (summaryQuery.error) {
    return <ErrorState detail={summaryQuery.error.message} onRetry={() => summaryQuery.refetch()} />
  }

  const summary = summaryQuery.data

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Hyperlocal Intelligence') }]}
        freshness={FRESHNESS}
        controls={
          <>
            <div className="w-full max-w-[14rem]">
              <Label htmlFor="hl-ward">{t('Ward')}</Label>
              <Select
                id="hl-ward"
                value={wardId}
                onChange={(e) => setWardId(e.target.value)}
                aria-label={t('Filter by ward')}
                options={[
                  { value: '', label: t('All authorised wards') },
                  ...WARDS.map((w) => ({ value: w.id, label: `${w.code} - ${w.name.split(' · ')[0]}` })),
                ]}
              />
            </div>
            <div className="w-full max-w-[14rem]">
              <Label htmlFor="hl-stack">{t('Signal stacking')}</Label>
              <Select
                id="hl-stack"
                value={minTypes}
                onChange={(e) => setMinTypes(e.target.value)}
                aria-label={t('Filter by signal stacking')}
                options={[
                  { value: '', label: t('Any locality') },
                  { value: '3', label: t('3+ distinct signal types') },
                  { value: '4', label: t('4+ distinct signal types') },
                  { value: '5', label: t('5+ distinct signal types') },
                ]}
              />
            </div>
          </>
        }
      />

      <DemonstrationNotice />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Localities in scope')}
          value={summary?.localities ?? 0}
          support={t('With at least two reports on record')}
          icon={<MapPin className="h-4 w-4" />}
          background="red"
        />
        <MetricCard
          label={t('Critical localities')}
          value={summary?.criticalLocalities ?? 0}
          tone={(summary?.criticalLocalities ?? 0) > 0 ? 'critical' : 'positive'}
          support={t('Composite score at or above 78')}
          icon={<ShieldAlert className="h-4 w-4" />}
          background="amber"
        />
        <MetricCard
          label={t('Stacked localities')}
          value={summary?.stackedLocalities ?? 0}
          tone={(summary?.stackedLocalities ?? 0) > 0 ? 'warn' : 'default'}
          support={t('Four or more distinct signal types in one place')}
          icon={<Layers3 className="h-4 w-4" />}
          background="green"
        />
        <MetricCard
          label={t('Open reports')}
          value={summary?.totalOpenComplaints ?? 0}
          support={t('Worst locality score {0}/100', summary?.worstScore ?? 0)}
          icon={<Sigma className="h-4 w-4" />}
        />
      </MetricGrid>

      <SplitLayout
        asideWidth="lg"
        main={
          <>
            <GovPanel title={t('Ward composite')} tone="amber" dense>
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('Fill shows the worst locality composite in each ward. Illustrative spatial representation.')}
              </p>
              <div className="px-3 pb-3">
                <CityMap
                  height={320}
                  layers={[
                    {
                      id: 'worst',
                      label: t('Worst locality composite'),
                      valueFor: (id) => rollupByWard.get(id)?.worstScore,
                      higherIsWorse: true,
                      description: t('The highest locality composite score recorded in the ward.'),
                    },
                    {
                      id: 'mean',
                      label: t('Mean locality composite'),
                      valueFor: (id) => rollupByWard.get(id)?.meanScore,
                      higherIsWorse: true,
                      description: t('Mean composite across the ward’s reported localities.'),
                    },
                  ]}
                  selectedWardId={wardId || null}
                  onWardSelect={(id) => setWardId(id === wardId ? '' : id)}
                  caption={t('Ward boundaries are illustrative and not survey-accurate.')}
                />
              </div>
            </GovPanel>

            <GovPanel title={t('Localities by composite signal load')} tone="red" dense className="mt-4">
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('Ranked by how many distinct problems are stacking, weighted by the published signal weights.')}
              </p>
              {cells.length === 0 ? (
                <EmptyState
                  title={t('No locality reaches the reporting threshold')}
                  detail="A locality needs at least two reports on record before it is shown. Relax the stacking filter to widen the set."
                />
              ) : (
                <ul className="scrollbar-slim max-h-[34rem] divide-y divide-ink-50 overflow-y-auto">
                  {cells.slice(0, 60).map((cell) => (
                    <li key={cell.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(cell.id)}
                        className={
                          'w-full px-4 py-3 text-left transition-colors hover:bg-ink-50/70 ' +
                          (selected?.id === cell.id ? 'bg-govt-50/60' : '')
                        }
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[0.8125rem] font-semibold text-ink-900">
                              {cell.localityName}
                            </p>
                            <p className="mt-0.5 truncate text-[0.6875rem] text-ink-500">{cell.wardLabel}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Badge tone="muted">{t('{0} signal types', cell.signalTypes)}</Badge>
                            <SeverityBadge severity={cell.severity} />
                            <span className="numeric w-8 text-right text-[0.8125rem] font-semibold text-ink-900">
                              {cell.compositeScore}
                            </span>
                          </div>
                        </div>
                        <ProgressBar value={cell.compositeScore} className="mt-2" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </GovPanel>
          </>
        }
        aside={
          selected ? (
            <>
              <GovPanel title={selected.localityName} tone="amber" actions={<SeverityBadge severity={selected.severity} />}>
                <p className="mb-3 text-xs leading-relaxed text-ink-500">{selected.wardLabel}</p>
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="label-institutional">{t('Composite signal load')}</span>
                    <span className="numeric text-metric-sm font-semibold text-ink-900">
                      {selected.compositeScore}
                      <span className="ml-0.5 text-sm font-normal text-ink-400">/100</span>
                    </span>
                  </div>
                  <ProgressBar value={selected.compositeScore} className="mt-2" />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-600">{selected.explanation}</p>
              </GovPanel>

              <GovPanel title={t('Signals present')} tone="green">
                <p className="mb-3 text-xs leading-relaxed text-ink-500">
                  {t('Each signal the platform holds a record of at this locality or in its ward.')}
                </p>
                <ul className="space-y-2">
                  {selected.signals.map((s, i) => (
                    <li
                      key={`${selected.id}-${s.kind}-${i}`}
                      className="rounded-lg border border-ink-100 bg-surface-sunken p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-[0.8125rem] font-medium text-ink-800">{s.label}</p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="numeric text-[0.6875rem] text-ink-500">×{s.count}</span>
                          <SeverityBadge severity={s.severity} />
                        </div>
                      </div>
                      <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">{s.detail}</p>
                      <p className="numeric mt-1 text-[0.625rem] text-ink-400">
                        {t('Signal weight {0}', SIGNAL_WEIGHTS[s.kind].toFixed(1))}
                      </p>
                    </li>
                  ))}
                </ul>
              </GovPanel>

              <Card tone="sunken">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] font-semibold text-ink-800">{t('What this locality view is')}</p>
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">
                      {t('Complaint counts are held at locality level. The corporation\'s asset registers - drains, road defects, waste hotspots, sewerage nodes, water assets - are held at ward level, so those signals are attributed to every locality in the ward rather than surveyed to the street. Treat the ranking as where to send an inspection, not as a measured position. No citizen personal data is read or held anywhere in this view.')}
                    </p>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <EmptyState title={t('No locality selected')} detail="Select a locality to read its signal composition." />
            </Card>
          )
        }
      />
    </PageBody>
  )
}

export default HyperlocalIntelligencePage
