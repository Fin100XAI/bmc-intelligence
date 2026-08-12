import { useMemo } from 'react'
import { Building, Droplet, ShieldCheck, Home } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  StateBadge,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { CHART_COLOURS, DonutChart, RankedBarChart } from '@/components/charts'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { housingService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { wardName, wardShortName } from '@/data/reference'
import {
  REDEVELOPMENT_STAGE_LABEL,
  SETTLEMENT_RECOGNITION_LABEL,
  type HousingScheme,
  type Settlement,
  type SettlementRecognition,
} from '@/types/civic-services'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCrore, formatDate, formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/city/HousingIntelligencePage.tsx
 *
 * Slum and housing intelligence.
 *
 * A very large share of an Indian city lives in informal settlements, and the
 * corporation's duty to them is not conditional on how the land is held: water,
 * sanitation, collection and lighting are obligatory services under the Twelfth
 * Schedule. This page reads service adequacy where the pressure is greatest.
 *
 * THE LINE THIS PAGE DOES NOT CROSS. Everything here describes a PLACE and the
 * service it receives - persons per water point, functioning toilet seats,
 * collection rounds. Nothing describes a person. There is no household
 * register, no resident record, no name and no entitlement determination, and
 * the housing service exposes no method that could return one. That is a
 * deliberate structural refusal, not an omission: an intelligence platform able
 * to enumerate residents of informal settlements is a surveillance instrument
 * whatever the intent behind it, so the interface cannot ask the question.
 */

const RECOGNITION_COLOUR: Record<SettlementRecognition, string> = {
  notified: CHART_COLOURS.primary,
  census: CHART_COLOURS.intel,
  identified: CHART_COLOURS.warn,
  unrecognised: CHART_COLOURS.neutral,
}

/** Service adequacy below this reads as a settlement the corporation is not
 *  currently serving to the standard it designs to. */
const SERVICE_THRESHOLD = 50

export function HousingIntelligencePage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)

  const settlementsQuery = useServiceQuery(queryKeys.housing('settlements'), (u) => housingService.settlements(u))
  const schemesQuery = useServiceQuery(queryKeys.housing('schemes'), (u) => housingService.schemes(u))

  const settlements = useMemo(() => settlementsQuery.data ?? [], [settlementsQuery.data])
  const schemes = useMemo(() => schemesQuery.data ?? [], [schemesQuery.data])

  const filtered = useMemo(
    () =>
      settlements.filter((s) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(s.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!s.name.toLowerCase().includes(q) && !wardName(s.wardId).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [settlements, filters],
  )

  if (settlementsQuery.isLoading || schemesQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={t('Slum & Housing Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Slum & Housing Intelligence') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (settlementsQuery.error || schemesQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={t('Slum & Housing Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Slum & Housing Intelligence') }]} />
        <ErrorState
          detail={(settlementsQuery.error ?? schemesQuery.error)?.message}
          onRetry={() => { void settlementsQuery.refetch(); void schemesQuery.refetch() }}
        />
      </PageBody>
    )
  }

  const population = filtered.reduce((s, x) => s + x.estimatedPopulation, 0)
  const belowThreshold = filtered.filter((s) => s.serviceIndex < SERVICE_THRESHOLD)
  const floodProne = filtered.filter((s) => s.floodProne).length
  const seatsTotal = filtered.reduce((s, x) => s + x.toiletSeatsTotal, 0)
  const seatsFunctional = filtered.reduce((s, x) => s + x.toiletSeatsFunctional, 0)
  const seatFunctionalPct = seatsTotal > 0 ? Math.round((seatsFunctional / seatsTotal) * 1000) / 10 : 0

  const byRecognition = (Object.keys(SETTLEMENT_RECOGNITION_LABEL) as SettlementRecognition[])
    .map((k) => ({ kind: k, count: filtered.filter((s) => s.recognition === k).length }))
    .filter((x) => x.count > 0)

  const worstServed = [...filtered].sort((a, b) => a.serviceIndex - b.serviceIndex).slice(0, 10)

  const tenementsSanctioned = schemes.reduce((s, x) => s + x.tenementsSanctioned, 0)
  const tenementsDelivered = schemes.reduce((s, x) => s + x.tenementsDelivered, 0)
  const inTransit = schemes.reduce((s, x) => s + x.householdsInTransit, 0)

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 10080,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const settlementColumns: Array<Column<Settlement>> = [
    {
      id: 'name',
      header: t('Settlement'),
      cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>,
      sortValue: (r) => r.name,
      searchValue: (r) => r.name,
      width: 'minmax(12rem,1.5fr)',
    },
    { id: 'ward', header: t('Ward'), cell: (r) => wardShortName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    {
      id: 'recognition',
      header: t('Recognition'),
      cell: (r) => <Badge tone="neutral" size="sm">{SETTLEMENT_RECOGNITION_LABEL[r.recognition]}</Badge>,
      sortValue: (r) => r.recognition,
      hideBelow: 'lg',
    },
    { id: 'population', header: t('Residents'), cell: (r) => <span className="numeric">{formatNumber(r.estimatedPopulation)}</span>, sortValue: (r) => r.estimatedPopulation, align: 'right' },
    {
      id: 'water',
      header: t('Persons / water point'),
      cell: (r) => (
        <span className={r.personsPerWaterPoint > 150 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
          {r.personsPerWaterPoint}
        </span>
      ),
      sortValue: (r) => r.personsPerWaterPoint,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'toilet',
      header: t('Persons / toilet seat'),
      cell: (r) => (
        <span className={r.personsPerToiletSeat > 100 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
          {r.personsPerToiletSeat}
        </span>
      ),
      sortValue: (r) => r.personsPerToiletSeat,
      align: 'right',
      hideBelow: 'md',
    },
    { id: 'collection', header: t('Collection / week'), cell: (r) => <span className="numeric">{r.wasteCollectionRoundsPerWeek}</span>, sortValue: (r) => r.wasteCollectionRoundsPerWeek, align: 'right', hideBelow: 'xl' },
    {
      id: 'index',
      header: t('Service index'),
      cell: (r) => (
        <span className={r.serviceIndex < SERVICE_THRESHOLD ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
          {r.serviceIndex}
        </span>
      ),
      sortValue: (r) => r.serviceIndex,
      align: 'right',
    },
    { id: 'redevelopment', header: t('Rehousing'), cell: (r) => REDEVELOPMENT_STAGE_LABEL[r.redevelopment], sortValue: (r) => r.redevelopment, hideBelow: 'xl' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  const schemeColumns: Array<Column<HousingScheme>> = [
    { id: 'name', header: t('Scheme'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name, width: 'minmax(12rem,1.5fr)' },
    { id: 'reference', header: t('Reference'), cell: (r) => <span className="numeric text-[0.6875rem] text-ink-500">{r.reference}</span>, sortValue: (r) => r.reference, hideBelow: 'lg' },
    { id: 'stage', header: t('Stage'), cell: (r) => <Badge tone="neutral" size="sm">{REDEVELOPMENT_STAGE_LABEL[r.stage]}</Badge>, sortValue: (r) => r.stage },
    {
      id: 'tenements',
      header: t('Tenements (delivered / sanctioned)'),
      cell: (r) => (
        <span className="numeric text-ink-700">
          {formatNumber(r.tenementsDelivered)} <span className="text-ink-400">/ {formatNumber(r.tenementsSanctioned)}</span>
        </span>
      ),
      sortValue: (r) => r.tenementsDelivered / Math.max(1, r.tenementsSanctioned),
      align: 'right',
      hideBelow: 'md',
    },
    { id: 'transit', header: t('In transit'), cell: (r) => <span className={r.householdsInTransit > 0 ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-500'}>{formatNumber(r.householdsInTransit)}</span>, sortValue: (r) => r.householdsInTransit, align: 'right', hideBelow: 'lg' },
    { id: 'outlay', header: t('Outlay'), cell: (r) => formatCrore(r.outlayCrore), sortValue: (r) => r.outlayCrore, align: 'right', hideBelow: 'xl' },
    {
      id: 'delay',
      header: t('Delay'),
      cell: (r) => (r.delayDays > 0 ? <span className={r.delayDays > 365 ? 'font-semibold text-crit-600' : 'text-warn-700'}>{r.delayDays} days</span> : <span className="text-ok-600">{t('On schedule')}</span>),
      sortValue: (r) => r.delayDays,
      align: 'right',
    },
    { id: 'target', header: t('Target'), cell: (r) => formatDate(r.targetCompletionAt), sortValue: (r) => r.targetCompletionAt, hideBelow: 'xl' },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        title={t('Slum & Housing Intelligence')}
        description={t('Service adequacy in the city\'s informal settlements, and the rehousing schemes running against them. A corporation\'s duty to provide water, sanitation and collection does not depend on how the land beneath a settlement is held.')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Slum & Housing Intelligence') }]}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <Card tone="info" className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-govt-800">{t('This page holds places, never people')}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {t('Every figure here describes a settlement and the service it receives - water points, toilet seats, collection rounds, lighting. Nothing describes a resident. There is no household register, no name and no eligibility determination anywhere behind this page, and the service exposes no method that could return one. The recognition status shown is a service-entitlement classification used for planning delivery; it is not a finding about tenure, legality or anyone&apos;s rights.')}
          </p>
        </div>
      </Card>

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search settlements" />

      <MetricGrid columns={4}>
        <MetricCard label={t('Settlements')} value={filtered.length} support={t('{0} residents served', formatNumber(population))} icon={<Home className="h-4 w-4" />} origin="demonstration" />
        <MetricCard
          label={t('Below service threshold')}
          value={belowThreshold.length}
          support={t('Service index under {0} of 100', SERVICE_THRESHOLD)}
          tone={belowThreshold.length > 0 ? 'critical' : 'positive'}
          icon={<Droplet className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Toilet seats functional')}
          value={seatFunctionalPct}
          unit="%"
          support={t('{0} of {1} seats', formatNumber(seatsFunctional), formatNumber(seatsTotal))}
          tone={seatFunctionalPct < 75 ? 'warn' : 'positive'}
        />
        <MetricCard
          label={t('Flood-prone settlements')}
          value={floodProne}
          support={t('Requiring pre-monsoon attention')}
          tone={floodProne > 0 ? 'warn' : 'default'}
        />
      </MetricGrid>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="flex flex-col">
          <p className="label-institutional mb-2">{t('Recognition status')}</p>
          <div style={{ height: 200 }}>
            <DonutChart
              data={byRecognition.map((r) => ({
                label: SETTLEMENT_RECOGNITION_LABEL[r.kind],
                value: r.count,
                colour: RECOGNITION_COLOUR[r.kind],
              }))}
              centreValue={String(filtered.length)}
              centreLabel="settlements"
            />
          </div>
          <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
            {t('Recognition determines which delivery programmes a settlement is eligible for. It says nothing about the standing of anyone living there.')}
          </p>
        </Card>

        <Card flush className="flex flex-col">
          <CardHeader
            bordered
            title={t('Least-served settlements')}
            description={t('Ranked on the composite service index - water points, toilet seats, paved lanes and working lights.')}
          />
          <div className="px-4 pb-4" style={{ height: Math.max(210, worstServed.length * 26) }}>
            <RankedBarChart
              data={worstServed.map((s) => ({ label: s.name.slice(0, 22), value: s.serviceIndex }))}
              higherIsWorse={false}
            />
          </div>
        </Card>
      </div>

      <Card flush>
        <CardHeader
          bordered
          icon={<Home className="h-4 w-4" />}
          title={t('Settlement register')}
          description={t('Service coverage by settlement, within your authorised ward scope.')}
        />
        {filtered.length === 0 ? (
          <EmptyState title={t('No settlements match the current filters')} detail="Clear a filter to widen the register." />
        ) : (
          <DataTable rows={filtered} columns={settlementColumns} rowKey={(r) => r.id} pageSize={12} />
        )}
      </Card>

      <MetricGrid columns={3}>
        <MetricCard label={t('Tenements sanctioned')} value={formatNumber(tenementsSanctioned)} support={`${schemes.length} schemes`} icon={<Building className="h-4 w-4" />} />
        <MetricCard
          label={t('Tenements delivered')}
          value={formatNumber(tenementsDelivered)}
          support={tenementsSanctioned > 0 ? `${Math.round((tenementsDelivered / tenementsSanctioned) * 100)}% of sanctioned` : undefined}
          progress={{ value: tenementsDelivered, max: Math.max(1, tenementsSanctioned) }}
        />
        <MetricCard
          label={t('Households in transit')}
          value={formatNumber(inTransit)}
          support={t('Awaiting rehousing under a live scheme')}
          tone={inTransit > 0 ? 'warn' : 'positive'}
        />
      </MetricGrid>

      <Card flush>
        <CardHeader
          bordered
          icon={<Building className="h-4 w-4" />}
          title={t('Rehousing schemes')}
          description={t('Sanctioned schemes and what has actually been delivered against them.')}
        />
        {schemes.length === 0 ? (
          <EmptyState title={t('No rehousing schemes in scope')} />
        ) : (
          <DataTable rows={schemes} columns={schemeColumns} rowKey={(r) => r.id} pageSize={10} />
        )}
      </Card>
    </PageBody>
  )
}

export default HousingIntelligencePage
