import { useMemo } from 'react'
import { Clock3, Flame, Landmark, TriangleAlert } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
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
import { GovPanel } from '@/components/gov/GovPanel'
import { CategoryBarChart, CHART_COLOURS, RankedBarChart } from '@/components/charts'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { deathcareService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { activeCorporation } from '@/config/municipality.config'
import { wardName, wardShortName } from '@/data/reference'
import {
  BURIAL_GROUND_COMMUNITY_LABEL,
  BURIAL_GROUND_KIND_LABEL,
  type BurialGround,
} from '@/types/deathcare'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatDate, formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/city/DeathcarePage.tsx
 *
 * Cemeteries, burial grounds and crematoria - Twelfth Schedule function 14.
 *
 * Land for the dead is finite and non-renewable. A burial ground that fills
 * does not refill, and the ground it stands on cannot be recovered for the
 * purpose it was consumed for. That makes a crematorium or a burial ground
 * reaching capacity a crisis that arrives without warning and cannot be solved
 * quickly: acquiring land for a burial ground is among the hardest things a
 * corporation ever does, needing a willing seller, a consenting neighbourhood
 * and a community that accepts the site. The lead time is years. This page
 * exists so that the warning arrives with years to spare.
 *
 * The measure that carries the most weight here is the wait at the gate. The
 * hours a grieving family stands waiting is the dignity of the service stated
 * as a number, and it is the figure a corporation should be least willing to
 * see rise.
 *
 * NO REGISTER OF THE DEAD IS SHOWN HERE. This page holds facilities and their
 * capacity. There is no interment record, no name, no plot allotment and no
 * family detail anywhere behind it. Registers of the dead sit with the
 * Registrar and with each ground's own managing trust or committee, which is
 * where they belong.
 */

/** Below this share of ground remaining, a replacement site must already be in
 *  the acquisition pipeline rather than on a list of things to consider. */
const EXHAUSTION_THRESHOLD_PCT = 15

/** The planning horizon a corporation needs to acquire and commission a
 *  replacement site, in years. Anything shorter is already late. */
const PLANNING_HORIZON_YEARS = 10

export function DeathcarePage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)

  usePageMasthead(t('Cemeteries & Crematoria'))

  const facilitiesQuery = useServiceQuery(queryKeys.deathcare('facilities'), (u) => deathcareService.facilities(u))
  const trendQuery = useServiceQuery(queryKeys.deathcare('trend'), (u) => deathcareService.trend(u))

  const facilities = useMemo(() => facilitiesQuery.data ?? [], [facilitiesQuery.data])
  const trend = useMemo(() => trendQuery.data ?? [], [trendQuery.data])

  const filtered = useMemo(
    () =>
      facilities.filter((f) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(f.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!f.name.toLowerCase().includes(q) && !wardName(f.wardId).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [facilities, filters],
  )

  if (facilitiesQuery.isLoading || trendQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('City Intelligence')}
          breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Cemeteries & Crematoria') }]}
        />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (facilitiesQuery.error || trendQuery.error) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('City Intelligence')}
          breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Cemeteries & Crematoria') }]}
        />
        <ErrorState
          detail={(facilitiesQuery.error ?? trendQuery.error)?.message}
          onRetry={() => {
            void facilitiesQuery.refetch()
            void trendQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const cremations = filtered.reduce((s, f) => s + f.cremations30d, 0)
  const burials = filtered.reduce((s, f) => s + f.burials30d, 0)
  const rites = cremations + burials

  const exhausting = filtered.filter((f) => f.capacityRemainingPct < EXHAUSTION_THRESHOLD_PCT)
  const withinHorizon = filtered.filter((f) => f.estimatedYearsRemaining <= PLANNING_HORIZON_YEARS)

  // Weighted by the volume each facility carries, because the figure being
  // reported is the wait a FAMILY faces - not the wait an average facility
  // records. A quiet ground with no queue must not flatter a crowded one.
  const meanWait = rites
    ? Math.round(
        (filtered.reduce((s, f) => s + f.meanWaitHours * (f.cremations30d + f.burials30d), 0) / rites) * 10,
      ) / 10
    : 0

  const electricGasShare = cremations
    ? Math.round((filtered.reduce((s, f) => s + (f.cremations30d * f.electricGasSharePct) / 100, 0) / cremations) * 1000) /
      10
    : 0

  const groundHectares = Math.round(filtered.reduce((s, f) => s + f.areaHectares, 0) * 10) / 10

  const shortestHorizon = [...filtered]
    .sort((a, b) => a.estimatedYearsRemaining - b.estimatedYearsRemaining)
    .slice(0, 10)

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const columns: Array<Column<BurialGround>> = [
    {
      id: 'name',
      header: t('Facility'),
      cell: (f) => <span className="font-medium text-ink-900">{f.name}</span>,
      sortValue: (f) => f.name,
      searchValue: (f) => f.name,
      width: 'minmax(15rem,1.8fr)',
    },
    {
      id: 'ward',
      header: t('Ward'),
      cell: (f) => wardShortName(f.wardId),
      sortValue: (f) => wardName(f.wardId),
      hideBelow: 'sm',
    },
    {
      id: 'kind',
      header: t('Type'),
      cell: (f) => (
        <Badge tone="neutral" size="sm">
          {BURIAL_GROUND_KIND_LABEL[f.kind]}
        </Badge>
      ),
      sortValue: (f) => BURIAL_GROUND_KIND_LABEL[f.kind],
      hideBelow: 'lg',
    },
    {
      id: 'community',
      header: t('Provision for'),
      cell: (f) => <span className="text-ink-700">{BURIAL_GROUND_COMMUNITY_LABEL[f.community]}</span>,
      sortValue: (f) => BURIAL_GROUND_COMMUNITY_LABEL[f.community],
      hideBelow: 'xl',
    },
    {
      id: 'area',
      header: t('Ground'),
      cell: (f) => <span className="numeric">{f.areaHectares} ha</span>,
      sortValue: (f) => f.areaHectares,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'volume',
      header: t('Rites (30d)'),
      cell: (f) => (
        <span className="numeric">{formatNumber(f.cremations30d > 0 ? f.cremations30d : f.burials30d)}</span>
      ),
      sortValue: (f) => f.cremations30d + f.burials30d,
      align: 'right',
    },
    {
      id: 'electric',
      header: t('Electric / gas'),
      cell: (f) =>
        f.cremations30d > 0 ? <span className="numeric">{f.electricGasSharePct}%</span> : <span className="text-ink-400">-</span>,
      sortValue: (f) => f.electricGasSharePct,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'capacity',
      header: t('Ground left'),
      cell: (f) => (
        <span
          className={
            f.capacityRemainingPct < EXHAUSTION_THRESHOLD_PCT
              ? 'numeric font-semibold text-crit-600'
              : f.capacityRemainingPct < 30
                ? 'numeric font-semibold text-warn-700'
                : 'numeric text-ink-700'
          }
        >
          {f.capacityRemainingPct}%
        </span>
      ),
      sortValue: (f) => f.capacityRemainingPct,
      align: 'right',
    },
    {
      id: 'years',
      header: t('Years remaining'),
      cell: (f) => (
        <span
          className={
            f.estimatedYearsRemaining <= PLANNING_HORIZON_YEARS
              ? 'numeric font-semibold text-crit-600'
              : 'numeric text-ink-700'
          }
        >
          {f.estimatedYearsRemaining}
        </span>
      ),
      sortValue: (f) => f.estimatedYearsRemaining,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'wait',
      header: t('Family wait'),
      cell: (f) => (
        <span className={f.meanWaitHours > 3 ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
          {f.meanWaitHours} h
        </span>
      ),
      sortValue: (f) => f.meanWaitHours,
      align: 'right',
    },
    {
      id: 'upgraded',
      header: t('Last upgraded'),
      cell: (f) => <span className="text-ink-600">{formatDate(f.lastUpgradedAt)}</span>,
      sortValue: (f) => f.lastUpgradedAt,
      hideBelow: 'xl',
    },
    { id: 'state', header: t('Condition'), cell: (f) => <StateBadge state={f.state} />, sortValue: (f) => f.state },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Cemeteries & Crematoria') }]}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search burial grounds and crematoria" />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Facilities in service')}
          value={formatNumber(filtered.length)}
          support={t('{0} hectares of ground · {1} rites in 30 days', formatNumber(groundHectares), formatNumber(rites))}
          icon={<Landmark className="h-4 w-4" />}
          origin="demonstration"
          background="red"
          footer={
            activeCorporation.id === 'bmc' && activeCorporation.shamshanBhoomiCount ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('For context: contemporary reporting counts {0} Hindu Shamshan-bhoomi (cremation grounds) citywide, separately from 10 electric and 18 gas crematoria as a technology category within that estate. No single official citywide inventory document was found.', activeCorporation.shamshanBhoomiCount)}
              </span>
            ) : undefined
          }
        />
        <MetricCard
          label={t('Approaching exhaustion')}
          value={formatNumber(exhausting.length)}
          support={t('Under {0}% of ground left · {1} inside the {2}-year acquisition horizon', EXHAUSTION_THRESHOLD_PCT, formatNumber(withinHorizon.length), PLANNING_HORIZON_YEARS)}
          tone={exhausting.length > 0 ? 'critical' : 'positive'}
          icon={<TriangleAlert className="h-4 w-4" />}
          background="amber"
        />
        <MetricCard
          label={t('Mean family wait')}
          value={meanWait}
          unit=" hours"
          support={t('Arrival at the gate to commencement of the rite, weighted by the volume each facility carries')}
          tone={meanWait > 3 ? 'critical' : meanWait > 1.5 ? 'warn' : 'positive'}
          icon={<Clock3 className="h-4 w-4" />}
          background="green"
        />
        <MetricCard
          label={t('Electric or gas cremation')}
          value={electricGasShare}
          unit="%"
          support={t('Of {0} cremations in 30 days · the balance on wood pyres', formatNumber(cremations))}
          tone={electricGasShare < 35 ? 'warn' : 'positive'}
          icon={<Flame className="h-4 w-4" />}
        />
      </MetricGrid>

      {/* Two columns. The estate register — ground left, years left, the wait
          at the gate — carries the width. The standing warning about finite
          land and the ranking of which sites run out first read beside it. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <GovPanel title={t('Burial grounds, cemeteries and crematoria')} tone="amber" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Every facility within your authorised ward scope, with the ground it has left and the wait a family meets at its gate.')}
            </p>
            {filtered.length === 0 ? (
              <EmptyState
                title={t('No facilities match the current filters')}
                detail="Clear a filter to widen the estate."
              />
            ) : (
              <DataTable rows={filtered} columns={columns} rowKey={(f) => f.id} pageSize={12} />
            )}
          </GovPanel>

          <Card className="flex min-w-0 flex-col">
            <p className="label-institutional mb-2">{t('Monthly cremations and burials')}</p>
            <div style={{ height: 220 }}>
              <CategoryBarChart
                data={trend as unknown as Array<Record<string, string | number>>}
                categoryKey="month"
                showLegend
                series={[
                  { key: 'cremations', label: t('Cremations'), colour: CHART_COLOURS.primary },
                  { key: 'burials', label: t('Burials'), colour: CHART_COLOURS.neutral },
                ]}
              />
            </div>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
              {t('Volumes rise through the pre-monsoon heat and the monsoon months, so a facility that copes comfortably in March can queue in July. Capacity has to be planned against the peak a family arrives in, not against the annual mean.')}
            </p>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <Card tone="info" className="flex items-start gap-3">
            <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-govt-800">{t('Land for the dead is finite and cannot be replaced')}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                {t('Every interment consumes ground that is not returned. A ground that fills does not refill, so a facility reaching capacity is a crisis that arrives without warning and cannot be answered quickly - acquiring land for a burial ground needs a willing seller, a consenting neighbourhood and a community that accepts the site, and the lead time is measured in years. The years-remaining column is therefore a planning instruction, not a statistic. This page holds facilities and capacity only: no interment record, no name and no plot allotment appears anywhere behind it, because the register of the dead belongs to the Registrar and to each ground&apos;s own managing committee.')}
              </p>
            </div>
          </Card>

          <GovPanel title={t('Shortest planning horizon')} tone="red" dense className="flex min-w-0 flex-col">
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Years of use left at the current rate. A replacement site takes years to acquire, so anything here is already a decision due.')}
            </p>
            <div className="px-3 pb-3" style={{ height: Math.max(210, shortestHorizon.length * 26) }}>
              {shortestHorizon.length === 0 ? (
                <EmptyState compact title={t('No facilities in scope')} detail="Clear a filter to widen the estate." />
              ) : (
                <RankedBarChart
                  data={shortestHorizon.map((f) => ({ label: f.name.slice(0, 22), value: f.estimatedYearsRemaining }))}
                  unit=" yrs"
                  higherIsWorse={false}
                />
              )}
            </div>
          </GovPanel>
        </div>
      </div>
    </PageBody>
  )
}

export default DeathcarePage
