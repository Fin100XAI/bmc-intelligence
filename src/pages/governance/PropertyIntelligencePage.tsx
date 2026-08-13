import { useMemo, useState } from 'react'
import { Banknote, ExternalLink, RefreshCw } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { revenueService } from '@/services'
import { useContextStore, useDrawerStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { ROUTES } from '@/config/navigation'
import type { DataFreshness } from '@/types/common'
import type { PropertySegment } from '@/types/finance'
import { wardName, wardShortName } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatCrore, formatNumber, formatPercent } from '@/utils/format'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  IconButton,
  LinkButton,
  LoadingState,
  MetricGrid,
  SegmentedControl,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import {
  CATEGORICAL_SERIES,
  CHART_COLOURS,
  CategoryBarChart,
  ChartFrame,
  DonutChart,
  MiniBar,
  RankedBarChart,
} from '@/components/charts'
import { CityMap } from '@/components/map/CityMap'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Property Intelligence.
 *
 * Reads exclusively through `revenueService.propertySegments`, which returns
 * the full assessment-base cross of ward × segment. Every other surface on
 * this page - city summary, ward table, segment composition, efficiency
 * distribution, reassessment backlog and the map layer - is a deterministic
 * client-side aggregation of that single, authorised dataset.
 */

type SegmentKey = PropertySegment['segment']

function build$SEGMENT_META(): Array<{ value: SegmentKey; label: string }> {
  return [
  { value: 'residential', label: t('Residential') },
  { value: 'commercial', label: t('Commercial') },
  { value: 'industrial', label: t('Industrial') },
  { value: 'institutional', label: t('Institutional') },
  { value: 'mixed', label: t('Mixed') },
]
}
let SEGMENT_META: Array<{ value: SegmentKey; label: string }> = build$SEGMENT_META()
registerLayer(() => {
  SEGMENT_META = build$SEGMENT_META()
})

function build$EFFICIENCY_BANDS(): Array<{ label: string; test: (v: number) => boolean }> {
  return [
  { label: t('Below 20%'), test: (v) => v < 20 },
  { label: '20% – 40%', test: (v) => v >= 20 && v < 40 },
  { label: '40% – 60%', test: (v) => v >= 40 && v < 60 },
  { label: '60% – 80%', test: (v) => v >= 60 && v < 80 },
  { label: t('80% and above'), test: (v) => v >= 80 },
]
}
let EFFICIENCY_BANDS: Array<{ label: string; test: (v: number) => boolean }> = build$EFFICIENCY_BANDS()
registerLayer(() => {
  EFFICIENCY_BANDS = build$EFFICIENCY_BANDS()
})

const FRESHNESS: DataFreshness = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-210),
  refreshIntervalMinutes: 1440,
  origin: 'demonstration',
  sourceState: 'operational',
  stale: false,
}

interface WardAggregate {
  wardId: string
  assessedUnits: number
  assessedValueCrore: number
  collectedCrore: number
  arrearsCrore: number
  collectionEfficiencyPct: number
  reassessmentDue: number
}

function aggregateByWard(rows: PropertySegment[]): WardAggregate[] {
  const byWard = new Map<string, PropertySegment[]>()
  for (const row of rows) {
    const bucket = byWard.get(row.wardId) ?? []
    bucket.push(row)
    byWard.set(row.wardId, bucket)
  }
  return Array.from(byWard.entries()).map(([wardId, segs]) => {
    const assessedUnits = segs.reduce((s, r) => s + r.assessedUnits, 0)
    const assessedValueCrore = Math.round(segs.reduce((s, r) => s + r.assessedValueCrore, 0) * 100) / 100
    const collectedCrore = Math.round(segs.reduce((s, r) => s + r.collectedCrore, 0) * 100) / 100
    const arrearsCrore = Math.round(segs.reduce((s, r) => s + r.arrearsCrore, 0) * 100) / 100
    const reassessmentDue = segs.reduce((s, r) => s + r.reassessmentDue, 0)
    return {
      wardId,
      assessedUnits,
      assessedValueCrore,
      collectedCrore,
      arrearsCrore,
      collectionEfficiencyPct: assessedValueCrore > 0 ? Math.round((collectedCrore / assessedValueCrore) * 1000) / 10 : 0,
      reassessmentDue,
    }
  })
}

export function PropertyIntelligencePage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(
    t('Property Intelligence'),
    t('The property assessment base by ward and use-class segment - assessed units, assessed value, collection position and the reassessment backlog. This is the base register from which property tax realisation in Revenue Intelligence is drawn.'),
  )

  const openDrawer = useDrawerStore((s) => s.open)
  const [segmentFilter, setSegmentFilter] = useState<'all' | SegmentKey>('all')

  /**
   * The ward in effect answers to two things: the selection made across the
   * platform in the command bar, and the row or map ward the operator focuses
   * on this page. The focus was held purely locally, so the shared selection
   * reached the breadcrumb and nothing else - an operator could narrow the
   * whole interface to one ward and read the full 24-ward assessment register
   * underneath.
   *
   * `from` records which shared selection the local focus was taken against,
   * so the two compose without an effect and without either silently winning:
   * a new selection in the command bar governs the page, and focusing a ward
   * here overrides it until the command bar moves again.
   */
  const contextWardId = useContextStore((s) => s.wardId)
  const [wardFocus, setWardFocus] = useState<{ wardId: string | null; from: string | null }>({ wardId: null, from: null })
  const focusIsCurrent = wardFocus.from === contextWardId
  const selectedWardId = focusIsCurrent ? wardFocus.wardId : contextWardId

  function focusWard(id: string | null): void {
    setWardFocus({ wardId: id, from: contextWardId })
  }

  const segmentsQuery = useServiceQuery(queryKeys.revenue('property-segments'), (user) =>
    revenueService.propertySegments(user),
  )

  const allSegments = segmentsQuery.data ?? []

  const filteredSegments = useMemo(
    () => (segmentFilter === 'all' ? allSegments : allSegments.filter((s) => s.segment === segmentFilter)),
    [allSegments, segmentFilter],
  )

  /**
   * The ward scope narrows every figure the operator reads. The map keeps the
   * unnarrowed cross so the city stays legible with the selected ward on it -
   * a single shaded ward on an otherwise blank map is not a spatial view.
   */
  const scopedSegments = useMemo(
    () => (selectedWardId ? filteredSegments.filter((s) => s.wardId === selectedWardId) : filteredSegments),
    [filteredSegments, selectedWardId],
  )

  const cityWardAggregates = useMemo(() => aggregateByWard(filteredSegments), [filteredSegments])
  const wardAggregates = useMemo(() => aggregateByWard(scopedSegments), [scopedSegments])

  const cityTotals = useMemo(() => {
    const assessedUnits = scopedSegments.reduce((s, r) => s + r.assessedUnits, 0)
    const assessedValueCrore = scopedSegments.reduce((s, r) => s + r.assessedValueCrore, 0)
    const collectedCrore = scopedSegments.reduce((s, r) => s + r.collectedCrore, 0)
    const arrearsCrore = scopedSegments.reduce((s, r) => s + r.arrearsCrore, 0)
    const reassessmentDue = scopedSegments.reduce((s, r) => s + r.reassessmentDue, 0)
    return {
      assessedUnits,
      assessedValueCrore,
      collectedCrore,
      arrearsCrore,
      reassessmentDue,
      efficiencyPct: assessedValueCrore > 0 ? Math.round((collectedCrore / assessedValueCrore) * 1000) / 10 : 0,
    }
  }, [scopedSegments])

  const compositionSource = useMemo(
    () => (selectedWardId ? allSegments.filter((s) => s.wardId === selectedWardId) : allSegments),
    [allSegments, selectedWardId],
  )
  const compositionData = useMemo(
    () =>
      SEGMENT_META.map((meta, i) => ({
        label: meta.label,
        value: Math.round(compositionSource.filter((s) => s.segment === meta.value).reduce((s, r) => s + r.assessedValueCrore, 0) * 10) / 10,
        colour: CATEGORICAL_SERIES[i % CATEGORICAL_SERIES.length],
      })),
    [compositionSource],
  )
  const compositionTotal = compositionData.reduce((s, d) => s + d.value, 0)

  const distributionData = useMemo(
    () =>
      EFFICIENCY_BANDS.map((band) => ({
        label: band.label,
        records: scopedSegments.filter((s) => band.test(s.collectionEfficiencyPct)).length,
      })),
    [scopedSegments],
  )

  const backlogData = useMemo(
    () =>
      [...wardAggregates]
        .sort((a, b) => b.reassessmentDue - a.reassessmentDue)
        .slice(0, 10)
        .map((w) => ({ label: wardShortName(w.wardId), value: w.reassessmentDue })),
    [wardAggregates],
  )

  const efficiencyByWard = useMemo(
    () => new Map(cityWardAggregates.map((w) => [w.wardId, w.collectionEfficiencyPct])),
    [cityWardAggregates],
  )

  const tableRows = wardAggregates

  const wardColumns: Array<Column<WardAggregate>> = [
    {
      id: 'ward',
      header: t('Ward'),
      cell: (row) => <span className="font-medium text-ink-800">{wardName(row.wardId)}</span>,
      sortValue: (row) => wardName(row.wardId),
      searchValue: (row) => wardName(row.wardId),
      width: '17rem',
    },
    {
      id: 'units',
      header: t('Assessed units'),
      cell: (row) => <span className="numeric">{formatNumber(row.assessedUnits)}</span>,
      sortValue: (row) => row.assessedUnits,
      align: 'right',
      hideBelow: 'sm',
    },
    {
      id: 'value',
      header: t('Assessed value'),
      cell: (row) => <span className="numeric font-medium">{formatCrore(row.assessedValueCrore)}</span>,
      sortValue: (row) => row.assessedValueCrore,
      align: 'right',
    },
    {
      id: 'collected',
      header: t('Collected'),
      cell: (row) => <span className="numeric">{formatCrore(row.collectedCrore)}</span>,
      sortValue: (row) => row.collectedCrore,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'arrears',
      header: t('Arrears'),
      cell: (row) => <span className="numeric text-warn-700">{formatCrore(row.arrearsCrore)}</span>,
      sortValue: (row) => row.arrearsCrore,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'efficiency',
      header: t('Collection efficiency'),
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={row.collectionEfficiencyPct} />
          <span className="numeric w-11 text-right font-semibold">{formatPercent(row.collectionEfficiencyPct)}</span>
        </div>
      ),
      sortValue: (row) => row.collectionEfficiencyPct,
      align: 'right',
    },
    {
      id: 'reassessment',
      header: t('Reassessments due'),
      cell: (row) => (
        <span className={row.reassessmentDue > 0 ? 'numeric font-medium text-govt-700' : 'numeric text-ink-400'}>
          {formatNumber(row.reassessmentDue)}
        </span>
      ),
      sortValue: (row) => row.reassessmentDue,
      align: 'right',
      hideBelow: 'md',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Property Intelligence') }]}
        freshness={FRESHNESS}
        actions={
          <LinkButton to={ROUTES.revenue} variant="outline" icon={<Banknote className="h-3.5 w-3.5" />}>
            {t('Open Revenue Intelligence')}
          </LinkButton>
        }
        controls={
          <>
            <span className="label-institutional">{t('Segment')}</span>
            <div className="scrollbar-slim max-w-full min-w-0 overflow-x-auto">
              <SegmentedControl
                value={segmentFilter}
                onChange={setSegmentFilter}
                ariaLabel="Filter by property segment"
                options={[{ value: 'all', label: t('All segments') }, ...SEGMENT_META.map((s) => ({ value: s.value, label: s.label }))]}
              />
            </div>
            {selectedWardId ? (
              <Button size="xs" variant="ghost" onClick={() => focusWard(null)} icon={<RefreshCw className="h-3 w-3" />}>
                {t('Clear ward focus ({0})', wardShortName(selectedWardId))}
              </Button>
            ) : null}
          </>
        }
      />

      {segmentsQuery.isLoading ? <LoadingState variant="metrics" /> : null}
      {segmentsQuery.error ? (
        <ErrorState detail={segmentsQuery.error.message} onRetry={() => segmentsQuery.refetch()} />
      ) : null}

      {!segmentsQuery.isLoading && !segmentsQuery.error && allSegments.length === 0 ? (
        <EmptyState
          title={t('No assessment records available')}
          detail="The property assessment base did not return any records for the current scope."
        />
      ) : null}

      {!segmentsQuery.isLoading && !segmentsQuery.error && allSegments.length > 0 ? (
        <>
          <Card>
            <CardHeader
              eyebrow={`${municipalityFinancialYearLabel()} · ${segmentFilter === 'all' ? 'All segments' : SEGMENT_META.find((s) => s.value === segmentFilter)?.label} · ${selectedWardId ? wardName(selectedWardId) : 'All wards'}`}
              title={t('City assessment position')}
              description={t('Assessed base and collection performance across the scope selected above.')}
            />
            <MetricGrid columns={5} className="mt-4">
              <MetricCard
                label={t('Assessed value')}
                value={formatCrore(cityTotals.assessedValueCrore)}
                support={t('{0} assessed units', formatNumber(cityTotals.assessedUnits))}
                origin="demonstration"
              />
              <MetricCard
                label={t('Collected')}
                value={formatCrore(cityTotals.collectedCrore)}
                support={t('{0} of assessed value', formatPercent(cityTotals.efficiencyPct))}
              />
              <MetricCard
                label={t('Arrears outstanding')}
                value={formatCrore(cityTotals.arrearsCrore)}
                tone={cityTotals.arrearsCrore > cityTotals.collectedCrore ? 'warn' : 'default'}
              />
              <MetricCard
                label={t('Collection efficiency')}
                value={formatPercent(cityTotals.efficiencyPct)}
                progress={{ value: cityTotals.efficiencyPct, max: 100 }}
              />
              <MetricCard
                label={t('Reassessments due')}
                value={formatNumber(cityTotals.reassessmentDue)}
                support={t('Properties flagged for periodic reassessment')}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              />
            </MetricGrid>
          </Card>

          {/* Two columns. The ward register and the map of the same figures
              read down the wide column; the composition, the two
              distributions and the reading note stand beside them. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
            <Card flush>
              <CardHeader
                bordered
                title={t('Ward assessment register')}
                description={t('Assessed base, collection position and reassessment backlog by ward. Click a row to focus the map; use the profile action to open the ward\'s full intelligence record.')}
              />
              <DataTable
                rows={tableRows}
                columns={wardColumns}
                rowKey={(row) => row.wardId}
                pageSize={10}
                stickyHeader
                maxHeight="26rem"
                onRowClick={(row) => focusWard(row.wardId)}
                activeRowKey={selectedWardId ?? undefined}
                searchPlaceholder="Search wards"
                rowActions={(row) => (
                  <IconButton
                    label={t('Open ward profile for {0}', wardName(row.wardId))}
                    onClick={() => openDrawer({ kind: 'ward', id: row.wardId })}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </IconButton>
                )}
                emptyTitle={t('No wards match the current focus')}
                emptyDetail="Clear the ward focus above to see the full register."
              />
            </Card>

            <Card flush>
              <CardHeader
                bordered
                title={t('Assessment efficiency - spatial view')}
                description={t('Illustrative ward map shaded by collection efficiency for the segment scope selected above. Click a ward to focus the register above.')}
              />
              <div className="p-4">
                <CityMap
                  layers={[
                    {
                      id: 'assessment-efficiency',
                      label: t('Assessment Efficiency'),
                      valueFor: (wardId) => efficiencyByWard.get(wardId),
                      higherIsWorse: false,
                      unit: '%',
                      description: t('Collection efficiency against assessed value, for the segment scope selected above.'),
                    },
                  ]}
                  selectedWardId={selectedWardId}
                  onWardSelect={focusWard}
                  height={420}
                />
              </div>
            </Card>
            </div>

            <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
            <Card>
              <CardHeader
                title={t('Segment composition')}
                description={selectedWardId ? `Assessed value mix for ${wardName(selectedWardId)}` : 'City-wide assessed value mix by use-class segment'}
              />
              <div className="mt-3 h-56">
                <DonutChart data={compositionData} unit={t('₹ Cr')} centreValue={formatCrore(compositionTotal, 0)} centreLabel="Assessed value" />
              </div>
              <ul className="mt-3 space-y-1.5">
                {compositionData.map((d) => (
                  <li key={d.label} className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 text-ink-600">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.colour }} aria-hidden />
                      {d.label}
                    </span>
                    <span className="numeric font-semibold text-ink-800">{formatCrore(d.value)}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <ChartFrame
                title={t('Collection efficiency distribution')}
                unit={t('ward–segment records')}
                timeframe={municipalityFinancialYearLabel()}
                description={t('Count of ward–segment assessment records falling in each collection-efficiency band, for the segment scope selected above.')}
                freshness={FRESHNESS}
                height={240}
              >
                <CategoryBarChart
                  data={distributionData}
                  categoryKey="label"
                  series={[{ key: 'records', label: t('Records'), colour: CHART_COLOURS.primary }]}
                />
              </ChartFrame>
            </Card>
            <Card>
              <ChartFrame
                title={t('Reassessment backlog - top ten wards')}
                unit={t('properties due')}
                timeframe={municipalityFinancialYearLabel()}
                description={t('Wards with the largest count of properties flagged for periodic reassessment, for the segment scope selected above.')}
                freshness={FRESHNESS}
                height={240}
              >
                <RankedBarChart data={backlogData} unit="due" higherIsWorse />
              </ChartFrame>
            </Card>

            <Card tone="info">
              <p className="text-xs leading-relaxed text-ink-600">
                <Badge tone="info" className="mr-1.5">
                  {t('Reading note')}
                </Badge>
                {t('Collection efficiency is measured against assessed value for the current financial year to date, not against the full outstanding demand including prior-year arrears. A ward showing high arrears alongside high in-year efficiency is collecting well against current demand while carrying a legacy balance that requires separate recovery action.')}
              </p>
            </Card>
            </div>
          </div>
        </>
      ) : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

function municipalityFinancialYearLabel(): string {
  return 'FY 2026–27 to date'
}

export default PropertyIntelligencePage
