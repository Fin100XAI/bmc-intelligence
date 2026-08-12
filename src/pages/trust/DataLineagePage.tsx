import { useMemo, useState } from 'react'
import { ArrowDown, ArrowRight, GitBranch, Layers, ShieldAlert, Table2 } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, ClassificationBadge, StateBadge } from '@/components/ui/badges'
import {
  Button,
  Card,
  CardHeader,
  DefinitionList,
  DefinitionRow,
  MetricGrid,
  ProgressBar,
  SegmentedControl,
  Select,
} from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useServiceQuery } from '@/hooks'
import { governanceService } from '@/services'
import { DOMAIN_LABEL, type IntelligenceDomain } from '@/types/common'
import { LINEAGE_STAGE_LABEL, type LineageGraph, type LineageStage } from '@/types/governance'
import { formatDate, formatRelative } from '@/utils/format'
import { DEMO_NOW } from '@/utils/deterministic'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'

/**
 * src/pages/trust/DataLineagePage.tsx
 *
 * Every derived metric this platform surfaces publishes a lineage graph —
 * Source → Ingestion → Validation → Canonical Entity → Derived Metric →
 * Intelligence Engine → Dashboard → Decision. The full catalogue is read in one
 * call through `governanceService.lineageGraphs`.
 *
 * The page is built around one institutional rule: a metric whose lineage has
 * not been validated recently is withheld from evidence chains rather than
 * shown with a caveat. That makes the currency of a graph an operational fact,
 * not a footnote — so the catalogue leads with it, the freshness threshold is
 * stated rather than implied, and every stage can be opened to see what it
 * does to the data and what fails downstream if it stops.
 */

/** Lineage validated longer ago than this is treated as no longer current. */
const FRESHNESS_DAYS = 90
/** Approaching the threshold — surfaced before it becomes a withholding. */
const WARNING_DAYS = 60

function daysSinceValidation(graph: LineageGraph): number {
  return Math.round((DEMO_NOW.getTime() - new Date(graph.lastValidatedAt).getTime()) / 86_400_000)
}

function currencyOf(graph: LineageGraph): 'current' | 'ageing' | 'stale' {
  const days = daysSinceValidation(graph)
  if (days > FRESHNESS_DAYS) return 'stale'
  if (days > WARNING_DAYS) return 'ageing'
  return 'current'
}

const CURRENCY_LABEL = {
  current: 'Current',
  ageing: 'Approaching threshold',
  stale: 'Beyond threshold',
} as const

const CURRENCY_TONE = { current: 'positive', ageing: 'warn', stale: 'critical' } as const

function averageQuality(graph: LineageGraph): number {
  if (graph.stages.length === 0) return 0
  return Math.round(graph.stages.reduce((s, st) => s + st.quality, 0) / graph.stages.length)
}

/**
 * What stops working if a stage stops working, phrased by stage kind.
 *
 * Impact is the question an operator actually asks when a pipeline breaks, and
 * it differs by position: a failed source withholds a metric outright, while a
 * failed dashboard stage leaves the figure derived but unreadable. Stating it
 * per kind is what turns a diagram into something to act on.
 */
const STAGE_IMPACT: Record<LineageStage['kind'], string> = {
  source: 'The metric loses its input entirely. It is withheld rather than published from an older batch, because a figure whose source has stopped is not a current figure.',
  ingestion: 'New records stop arriving. The metric continues to publish its last computed value with an ageing freshness label until it crosses the staleness threshold, then is withheld.',
  validation: 'Records arrive but are not checked. The platform will not promote unvalidated records into the canonical entity, so the metric freezes at its last validated batch.',
  'canonical-entity': 'Ward, department and asset references stop resolving. Every scoped figure derived from this metric loses its scope and is withheld rather than reported city-wide.',
  'derived-metric': 'The computation itself stops. Anything citing this metric as evidence loses that citation and the associated intelligence drops its confidence accordingly.',
  'intelligence-engine': 'The metric still computes but raises no signals. Alerts and intelligence items that would have been generated from it simply do not appear — a silent gap, which is why this stage is monitored rather than inferred.',
  dashboard: 'The figure remains derived and citable but is not rendered. Evidence chains and exports continue to resolve; only the on-screen presentation is lost.',
  decision: 'The metric can no longer be attached to a decision case. It remains readable, but decisions taken while this stage is down carry no recorded link to it.',
}

export function DataLineagePage(): React.JSX.Element {
  const lineageQuery = useServiceQuery(['trust-data-lineage', 'all-graphs'], (u) => governanceService.lineageGraphs(u))

  const [view, setView] = useState<'graph' | 'catalogue'>('graph')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [domainFilter, setDomainFilter] = useState<IntelligenceDomain | ''>('')
  const [currencyFilter, setCurrencyFilter] = useState<'' | 'current' | 'ageing' | 'stale'>('')
  const [openStage, setOpenStage] = useState<LineageStage | null>(null)

  const graphs = useMemo(() => lineageQuery.data ?? [], [lineageQuery.data])

  const filtered = useMemo(
    () =>
      graphs.filter((g) => {
        if (domainFilter && g.domain !== domainFilter) return false
        if (currencyFilter && currencyOf(g) !== currencyFilter) return false
        return true
      }),
    [graphs, domainFilter, currencyFilter],
  )

  const rollup = useMemo(() => {
    const stale = graphs.filter((g) => currencyOf(g) === 'stale')
    const ageing = graphs.filter((g) => currencyOf(g) === 'ageing')
    const stages = graphs.reduce((sum, g) => sum + g.stages.length, 0)
    const quality = graphs.length
      ? Math.round(graphs.reduce((sum, g) => sum + averageQuality(g), 0) / graphs.length)
      : 0
    return { stale, ageing, stages, quality }
  }, [graphs])


  if (lineageQuery.isLoading) return <LoadingState variant="block" />
  if (lineageQuery.error) return <ErrorState detail={lineageQuery.error.message} onRetry={() => lineageQuery.refetch()} />

  if (graphs.length === 0) {
    return <EmptyState title={t('No lineage graphs published')} detail="No metric lineage was reachable for your principal's scope." />
  }

  const selected = filtered.find((g) => g.id === selectedId) ?? filtered[0] ?? graphs[0]!
  const selectedCurrency = currencyOf(selected)
  const selectedDays = daysSinceValidation(selected)
  const weakestStage = [...selected.stages].sort((a, b) => a.quality - b.quality)[0]

  const catalogueColumns: Array<Column<LineageGraph>> = [
    {
      id: 'metric',
      header: t('Metric'),
      cell: (g) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-800">{g.metricLabel}</p>
          <p className="font-mono text-[0.625rem] text-ink-400">{g.id}</p>
        </div>
      ),
      sortValue: (g) => g.metricLabel,
      searchValue: (g) => `${g.metricLabel} ${g.id} ${DOMAIN_LABEL[g.domain]}`,
      width: 'minmax(12rem,1.5fr)',
    },
    {
      id: 'domain',
      header: t('Domain'),
      cell: (g) => <Badge tone="muted">{DOMAIN_LABEL[g.domain]}</Badge>,
      sortValue: (g) => DOMAIN_LABEL[g.domain],
    },
    {
      id: 'stages',
      header: t('Stages'),
      align: 'right',
      cell: (g) => <span className="numeric">{g.stages.length}</span>,
      sortValue: (g) => g.stages.length,
      hideBelow: 'md',
    },
    {
      id: 'quality',
      header: t('Mean quality'),
      cell: (g) => (
        <div className="flex items-center gap-2">
          <ProgressBar value={averageQuality(g)} size="xs" className="w-16" />
          <span className="numeric text-[0.6875rem] text-ink-600">{averageQuality(g)}</span>
        </div>
      ),
      sortValue: (g) => averageQuality(g),
      hideBelow: 'lg',
    },
    {
      id: 'weakest',
      header: t('Weakest stage'),
      cell: (g) => {
        const weakest = [...g.stages].sort((a, b) => a.quality - b.quality)[0]
        return weakest ? (
          <span className="text-[0.75rem] text-ink-600">
            {weakest.name} <span className="numeric text-ink-400">({weakest.quality})</span>
          </span>
        ) : (
          <span className="text-ink-300">—</span>
        )
      },
      sortable: false,
      hideBelow: 'xl',
    },
    {
      id: 'validated',
      header: t('Last validated'),
      cell: (g) => (
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-ink-700">{formatDate(g.lastValidatedAt)}</p>
          <p className="text-[0.625rem] text-ink-400">{t('{0} days ago', daysSinceValidation(g))}</p>
        </div>
      ),
      sortValue: (g) => g.lastValidatedAt,
    },
    {
      id: 'currency',
      header: t('Currency'),
      cell: (g) => {
        const currency = currencyOf(g)
        return (
          <Badge tone={CURRENCY_TONE[currency]} dot>
            {CURRENCY_LABEL[currency]}
          </Badge>
        )
      },
      sortValue: (g) => daysSinceValidation(g),
    },
    {
      id: 'classification',
      header: t('Class.'),
      cell: (g) => <ClassificationBadge classification={g.classification} showIcon={false} />,
      sortValue: (g) => g.classification,
      hideBelow: 'xl',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Trust Centre')}
        title={t('Data Lineage')}
        description={t('Every derived metric this platform presents publishes the full pipeline that produced it, from the departmental source through to the decision it can inform. A metric whose lineage has not been recently validated is not presented as evidence.')}
        breadcrumbs={[{ label: t('Trust Centre'), to: '/trust' }, { label: t('Data Lineage') }]}
        controls={
          <div className="flex w-full flex-wrap items-center gap-2">
            <SegmentedControl<'graph' | 'catalogue'>
              value={view}
              onChange={setView}
              ariaLabel="Lineage view"
              options={[
                { value: 'graph', label: t('Pipeline'), icon: <GitBranch className="h-3.5 w-3.5" /> },
                { value: 'catalogue', label: t('Catalogue'), icon: <Table2 className="h-3.5 w-3.5" /> },
              ]}
            />
            <Select
              aria-label={t('Filter by domain')}
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value as IntelligenceDomain | '')}
              options={[
                { value: '', label: t('All domains') },
                ...Array.from(new Set(graphs.map((g) => g.domain)))
                  .sort((a, b) => DOMAIN_LABEL[a].localeCompare(DOMAIN_LABEL[b]))
                  .map((d) => ({ value: d, label: DOMAIN_LABEL[d] })),
              ]}
            />
            <Select
              aria-label={t('Filter by currency')}
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value as typeof currencyFilter)}
              options={[
                { value: '', label: t('Any currency') },
                { value: 'current', label: t('Current') },
                { value: 'ageing', label: t('Approaching threshold') },
                { value: 'stale', label: t('Beyond threshold') },
              ]}
            />
            {view === 'graph' ? (
              <Select
                aria-label={t('Select a lineage graph')}
                className="min-w-[16rem] flex-1"
                value={selected.id}
                onChange={(e) => setSelectedId(e.target.value)}
                options={(filtered.length > 0 ? filtered : graphs).map((g) => ({
                  value: g.id,
                  label: `${g.metricLabel} (${DOMAIN_LABEL[g.domain]})`,
                }))}
              />
            ) : null}
          </div>
        }
      />

      <MetricGrid columns={4}>
        <Card>
          <p className="label-institutional">{t('Lineage graphs published')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{graphs.length}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('{0} pipeline stages in total', rollup.stages)}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Mean stage quality')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{rollup.quality}/100</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Across every published graph')}</p>
        </Card>
        <Card tone={rollup.ageing.length > 0 ? 'warn' : 'default'}>
          <p className="label-institutional">{t('Approaching threshold')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{rollup.ageing.length}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Validated {0}–{1} days ago', WARNING_DAYS, FRESHNESS_DAYS)}</p>
        </Card>
        <Card tone={rollup.stale.length > 0 ? 'critical' : 'default'}>
          <p className="label-institutional">{t('Withheld from evidence')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{rollup.stale.length}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Beyond the {0}-day threshold', FRESHNESS_DAYS)}</p>
        </Card>
      </MetricGrid>

      {rollup.stale.length > 0 ? (
        <Card tone="critical">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-crit-600" />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-crit-700">
                {t('{0} metric{1} currently withheld from evidence chains', rollup.stale.length, rollup.stale.length === 1 ? '' : 's')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-700">
                {t('These metrics still compute and still render, but they cannot be cited as evidence supporting a recommendation or decision until their lineage is revalidated:')}{' '}
                <span className="font-medium text-ink-800">
                  {rollup.stale.map((g) => g.metricLabel).join(', ')}
                </span>
                {t('. Withholding rather than caveating is deliberate — a decision record that cites a metric nobody has validated in')}{' '}{FRESHNESS_DAYS}{' '}{t('days is worse than one that cites nothing.')}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {view === 'catalogue' ? (
        <Card flush>
          <CardHeader
            className="px-4 pt-4"
            icon={<Layers className="h-4 w-4" />}
            title={t('Lineage catalogue')}
            description={t('Every published graph, ordered by how recently its pipeline was validated. Select a row to open its pipeline.')}
          />
          <div className="p-4">
            <DataTable
              rows={filtered}
              columns={catalogueColumns}
              rowKey={(g) => g.id}
              searchable
              searchPlaceholder="Search metrics and domains"
              pageSize={12}
              activeRowKey={selected.id}
              onRowClick={(g) => {
                setSelectedId(g.id)
                setView('graph')
              }}
              initialSort={{ columnId: 'currency', direction: 'desc' }}
              emptyTitle={t('No lineage graph matches the current filters')}
            />
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              icon={<GitBranch className="h-4 w-4" />}
              title={selected.metricLabel}
              description={t('{0} · lineage graph {1} · select any stage to see what it does and what fails without it', DOMAIN_LABEL[selected.domain], selected.id)}
              actions={
                <div className="flex items-center gap-1.5">
                  <Badge tone={CURRENCY_TONE[selectedCurrency]} dot>
                    {CURRENCY_LABEL[selectedCurrency]}
                  </Badge>
                  <ClassificationBadge classification={selected.classification} />
                </div>
              }
            />

            <div className="mt-4 flex flex-col gap-0 overflow-x-auto lg:flex-row lg:items-stretch lg:gap-0">
              {selected.stages.map((stage, i) => (
                <div key={stage.id} className="flex flex-col items-stretch lg:flex-row lg:items-center">
                  <button
                    type="button"
                    onClick={() => setOpenStage(stage)}
                    aria-label={t('Open {0}', stage.name)}
                    className={cn(
                      'w-full min-w-0 rounded-lg border border-ink-100 bg-surface-sunken p-3 text-left transition-colors lg:w-56',
                      'hover:border-govt-300 hover:bg-govt-50/40 focus-visible:ring-2 focus-visible:ring-govt-500/30 focus-visible:outline-none',
                      weakestStage?.id === stage.id && 'border-warn-300 bg-warn-50/40',
                    )}
                  >
                    <Badge tone="info" size="xs">
                      {LINEAGE_STAGE_LABEL[stage.kind]}
                    </Badge>
                    <p className="mt-1.5 text-[0.8125rem] font-semibold text-ink-900">{stage.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-600">{stage.detail}</p>
                    <div className="mt-2 flex items-center justify-between text-[0.6875rem] text-ink-500">
                      <span className="truncate">{stage.owner}</span>
                      <span className="numeric shrink-0 font-semibold text-ink-700">{stage.quality}/100</span>
                    </div>
                    <ProgressBar value={stage.quality} size="xs" className="mt-1.5" />
                    <div className="mt-1.5">
                      <StateBadge state={stage.state} size="xs" />
                    </div>
                    {stage.transformations.length > 0 ? (
                      <ul className="mt-2 space-y-1 border-t border-ink-100 pt-2">
                        {stage.transformations.map((transformation) => (
                          <li key={transformation} className="flex items-start gap-1.5 text-[0.625rem] leading-relaxed text-ink-500">
                            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-govt-400" aria-hidden />
                            {transformation}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </button>
                  {i < selected.stages.length - 1 ? (
                    <div className="flex shrink-0 items-center justify-center py-1 lg:px-1 lg:py-0">
                      <ArrowDown className="h-3.5 w-3.5 text-ink-300 lg:hidden" aria-hidden />
                      <ArrowRight className="hidden h-3.5 w-3.5 text-ink-300 lg:block" aria-hidden />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {weakestStage ? (
              <p className="mt-3 border-t border-ink-100 pt-3 text-[0.6875rem] leading-relaxed text-ink-500">
                {t('The weakest link governs the chain. This pipeline&apos;s lowest-scoring stage is')}{' '}
                <span className="font-medium text-ink-700">{weakestStage.name}</span> at{' '}
                <span className="numeric font-medium text-ink-700">{weakestStage.quality}/100</span>{' '}{t('— the mean of')}{' '}
                {averageQuality(selected)} across {selected.stages.length}{' '}{t('stages is the more flattering number, and the one an operator should trust less.')}
              </p>
            ) : null}
          </Card>

          <Card tone={selectedCurrency === 'stale' ? 'critical' : selectedCurrency === 'ageing' ? 'warn' : 'info'}>
            <div className="flex items-start gap-2.5">
              <ShieldAlert
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  selectedCurrency === 'stale' ? 'text-crit-600' : selectedCurrency === 'ageing' ? 'text-warn-700' : 'text-govt-700',
                )}
              />
              <p className="text-xs leading-relaxed text-ink-700">
                {t('This lineage graph was last validated {0} — {1} days against a {2}-day threshold. A metric whose lineage has not been recently validated is not presented anywhere in this platform as evidence supporting a recommendation or decision; it is withheld from the evidence chain until validation is refreshed.{3}', formatRelative(selected.lastValidatedAt), selectedDays, FRESHNESS_DAYS, selectedCurrency === 'stale'
                  ? ` This graph is past the threshold, so "${selected.metricLabel}" is currently withheld from evidence chains.`
                  : selectedCurrency === 'ageing'
                    ? ` This graph is within ${FRESHNESS_DAYS - selectedDays} days of the threshold and should be revalidated before it crosses it.`
                    : '')}
              </p>
            </div>
          </Card>
        </>
      )}

      {/* Stage detail ----------------------------------------------------- */}
      <Drawer
        open={openStage !== null}
        onClose={() => setOpenStage(null)}
        width="md"
        eyebrow={openStage ? LINEAGE_STAGE_LABEL[openStage.kind] : ''}
        title={openStage?.name ?? ''}
        description={openStage?.detail}
        meta={
          openStage ? (
            <>
              <StateBadge state={openStage.state} />
              <Badge tone="muted">{selected.metricLabel}</Badge>
              <Badge tone={openStage.quality < 80 ? 'warn' : 'neutral'}>{t('Quality {0}/100', openStage.quality)}</Badge>
            </>
          ) : null
        }
        footer={
          <Button variant="ghost" onClick={() => setOpenStage(null)}>
            {t('Close')}
          </Button>
        }
      >
        {openStage ? (
          <div className="space-y-4">
            <DefinitionList>
              <DefinitionRow label={t('Stage kind')}>{LINEAGE_STAGE_LABEL[openStage.kind]}</DefinitionRow>
              <DefinitionRow label={t('Accountable owner')}>{openStage.owner}</DefinitionRow>
              <DefinitionRow label={t('Operational state')}>
                <StateBadge state={openStage.state} />
              </DefinitionRow>
              <DefinitionRow label={t('Quality assessment')}>
                <div className="flex items-center gap-2">
                  <ProgressBar value={openStage.quality} size="xs" className="w-24" />
                  <span className="numeric text-[0.8125rem] font-semibold text-ink-900">{openStage.quality}/100</span>
                </div>
              </DefinitionRow>
              <DefinitionRow label={t('Position in pipeline')}>
                {t('Stage {0} of {1}', selected.stages.findIndex((s) => s.id === openStage.id) + 1, selected.stages.length)}
              </DefinitionRow>
            </DefinitionList>

            <Card tone="sunken">
              <CardHeader title={t('What this stage does to the data')} />
              {openStage.transformations.length === 0 ? (
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-600">
                  {t('This stage applies no transformation. It passes records through unchanged, which is itself worth recording — a pipeline position that transforms nothing should not silently look like one that does.')}
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {openStage.transformations.map((transformation) => (
                    <li key={transformation} className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-ink-700">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-govt-500" aria-hidden />
                      {transformation}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card tone="warn">
              <CardHeader
                icon={<ShieldAlert className="h-4 w-4 text-warn-700" />}
                title={t('If this stage stops')}
                description={t('Impact assessment, not a hypothetical.')}
              />
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-700">{STAGE_IMPACT[openStage.kind]}</p>
            </Card>
          </div>
        ) : null}
      </Drawer>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default DataLineagePage
