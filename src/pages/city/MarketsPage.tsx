import { useMemo } from 'react'
import { Beef, CalendarClock, Droplets, ShieldAlert, Store } from 'lucide-react'
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
import { CategoryBarChart, CHART_COLOURS, RankedBarChart } from '@/components/charts'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { marketsService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardName, wardShortName } from '@/data/reference'
import {
  MARKET_INSPECTION_INTERVAL_DAYS,
  MARKET_KIND_LABEL,
  REGULATED_TRADE_KINDS,
  type MunicipalMarket,
} from '@/types/markets'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCrore, formatDate, formatNumber, formatRelative } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/city/MarketsPage.tsx
 *
 * Markets and slaughter houses - Twelfth Schedule function 18, "regulation of
 * slaughter houses and tanneries", together with the municipal retail and
 * wholesale market estate the corporation happens also to own.
 *
 * THIS IS A FOOD-SAFETY FUNCTION BEFORE IT IS A REVENUE ONE. The rent roll is
 * on this page because a corporation has to know what its estate earns, but it
 * is deliberately not the first thing on it. An uninspected slaughter house is
 * a public-health exposure sitting inside the city's meat supply, and it stays
 * one whether or not its licence fee has been paid.
 *
 * The measure that leads is therefore the INSPECTION INTERVAL, not the
 * inspection count. A rising monthly total achieved by revisiting the same
 * compliant markets leaves exactly the same premises unvisited as no
 * inspections at all, which is why "overdue inspections" is a headline figure
 * here and "inspections carried out" is only a chart.
 *
 * Effluent compliance is the point at which a slaughter house or a tannery
 * becomes an environmental matter as well as a hygiene one. Both trades
 * discharge high-load effluent; untreated it reaches a nullah and from there a
 * creek, and the same premises then appear in somebody else's water-quality
 * report.
 *
 * NO TRADER APPEARS HERE. The register is one of premises and their condition.
 * It carries no licence holder, no tenancy and no prosecution subject.
 * Enforcement against a named individual belongs in the licensing register
 * under its own safeguards, not in a management platform.
 */

/** Whole days between the demonstration anchor and an inspection date. */
function daysSinceInspection(iso: string): number {
  return Math.max(0, Math.round((DEMO_NOW.getTime() - new Date(iso).getTime()) / 86_400_000))
}

export function MarketsPage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)

  usePageMasthead(
    t('Markets & Slaughterhouses'),
    t('The corporation\'s market estate and the trades it regulates inside it - stall occupancy, hygiene at the last inspection, the interval since anybody last looked, and whether trade effluent is leaving the premises lawfully.'),
  )

  const facilitiesQuery = useServiceQuery(queryKeys.markets('facilities'), (u) => marketsService.facilities(u))
  const trendQuery = useServiceQuery(queryKeys.markets('trend'), (u) => marketsService.trend(u))

  const facilities = useMemo(() => facilitiesQuery.data ?? [], [facilitiesQuery.data])
  const trend = useMemo(() => trendQuery.data ?? [], [trendQuery.data])

  const filtered = useMemo(
    () =>
      facilities.filter((m) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(m.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (
            !m.name.toLowerCase().includes(q) &&
            !MARKET_KIND_LABEL[m.kind].toLowerCase().includes(q) &&
            !wardName(m.wardId).toLowerCase().includes(q)
          ) {
            return false
          }
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
          breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Markets & Slaughterhouses') }]}
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
          breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Markets & Slaughterhouses') }]}
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

  const totalStalls = filtered.reduce((s, m) => s + m.stalls, 0)
  const occupiedStalls = filtered.reduce((s, m) => s + m.stallsOccupied, 0)
  const occupancyPct = totalStalls > 0 ? Math.round((occupiedStalls / totalStalls) * 1000) / 10 : 0

  const meanHygiene = filtered.length
    ? Math.round((filtered.reduce((s, m) => s + m.hygieneScore, 0) / filtered.length) * 10) / 10
    : 0

  const overdue = filtered.filter((m) => daysSinceInspection(m.lastInspectedAt) > MARKET_INSPECTION_INTERVAL_DAYS)
  const regulated = filtered.filter((m) => REGULATED_TRADE_KINDS.includes(m.kind))
  const overdueRegulated = overdue.filter((m) => REGULATED_TRADE_KINDS.includes(m.kind))
  const effluentBreaches = filtered.filter((m) => !m.effluentCompliant)
  const openViolations = filtered.reduce((s, m) => s + m.openViolations, 0)
  const annualRentCrore = (filtered.reduce((s, m) => s + m.monthlyRentLakh, 0) * 12) / 100

  const longestInterval = overdue.length ? Math.max(...overdue.map((m) => daysSinceInspection(m.lastInspectedAt))) : 0

  const lowestHygiene = [...filtered].sort((a, b) => a.hygieneScore - b.hygieneScore).slice(0, 10)

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const columns: Array<Column<MunicipalMarket>> = [
    {
      id: 'name',
      header: t('Facility'),
      cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>,
      sortValue: (r) => r.name,
      searchValue: (r) => r.name,
      width: 'minmax(14rem,1.8fr)',
    },
    {
      id: 'ward',
      header: t('Ward'),
      cell: (r) => wardShortName(r.wardId),
      sortValue: (r) => wardName(r.wardId),
      hideBelow: 'sm',
    },
    {
      id: 'kind',
      header: t('Trade'),
      cell: (r) => (
        <Badge tone={REGULATED_TRADE_KINDS.includes(r.kind) ? 'intel' : 'neutral'} size="sm">
          {MARKET_KIND_LABEL[r.kind]}
        </Badge>
      ),
      sortValue: (r) => MARKET_KIND_LABEL[r.kind],
      searchValue: (r) => MARKET_KIND_LABEL[r.kind],
    },
    {
      id: 'stalls',
      header: t('Stalls let'),
      cell: (r) => (
        <span className="numeric text-ink-700">
          {formatNumber(r.stallsOccupied)} / {formatNumber(r.stalls)}
        </span>
      ),
      sortValue: (r) => (r.stalls > 0 ? r.stallsOccupied / r.stalls : 0),
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'licensed',
      header: t('Licensed'),
      cell: (r) => (
        <span className={r.licensedTradersPct < 75 ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
          {r.licensedTradersPct}%
        </span>
      ),
      sortValue: (r) => r.licensedTradersPct,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'hygiene',
      header: t('Hygiene'),
      cell: (r) => (
        <span
          className={
            r.hygieneScore < 45
              ? 'numeric font-semibold text-crit-600'
              : r.hygieneScore < 62
                ? 'numeric font-semibold text-warn-700'
                : 'numeric text-ink-700'
          }
        >
          {r.hygieneScore}
        </span>
      ),
      sortValue: (r) => r.hygieneScore,
      align: 'right',
    },
    {
      id: 'inspected',
      header: t('Last inspected'),
      cell: (r) => {
        const days = daysSinceInspection(r.lastInspectedAt)
        return (
          <span
            className={days > MARKET_INSPECTION_INTERVAL_DAYS ? 'font-semibold text-crit-600' : 'text-ink-700'}
            title={formatDate(r.lastInspectedAt)}
          >
            {formatRelative(r.lastInspectedAt)}
          </span>
        )
      },
      sortValue: (r) => -daysSinceInspection(r.lastInspectedAt),
    },
    {
      id: 'violations',
      header: t('Open violations'),
      cell: (r) => (
        <span className={r.openViolations > 6 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
          {formatNumber(r.openViolations)}
        </span>
      ),
      sortValue: (r) => r.openViolations,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'effluent',
      header: t('Effluent'),
      cell: (r) =>
        r.effluentCompliant ? (
          <Badge tone="positive" size="sm">
            {t('Consent met')}
          </Badge>
        ) : (
          <Badge tone="critical" size="sm">
            {t('Breach')}
          </Badge>
        ),
      sortValue: (r) => (r.effluentCompliant ? 1 : 0),
      hideBelow: 'lg',
    },
    {
      id: 'cold',
      header: t('Cold chain'),
      cell: (r) => (r.coldStorage ? 'Yes' : 'No'),
      sortValue: (r) => (r.coldStorage ? 1 : 0),
      hideBelow: 'xl',
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Markets & Slaughterhouses') }]}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search markets, abattoirs and tanneries" />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Facilities on the register')}
          value={formatNumber(filtered.length)}
          support={t('{0} regulated trades · {1} annual rent demand', formatNumber(regulated.length), formatCrore(annualRentCrore))}
          icon={<Store className="h-4 w-4" />}
          origin="demonstration"
        />
        <MetricCard
          label={t('Stall occupancy')}
          value={occupancyPct}
          unit="%"
          support={t('{0} of {1} stalls and bays let', formatNumber(occupiedStalls), formatNumber(totalStalls))}
          tone={occupancyPct < 65 ? 'warn' : 'positive'}
          progress={{ value: occupancyPct, max: 100 }}
        />
        <MetricCard
          label={t('Mean hygiene score')}
          value={meanHygiene}
          support={t('{0} violations open across the estate', formatNumber(openViolations))}
          tone={meanHygiene < 55 ? 'critical' : meanHygiene < 70 ? 'warn' : 'positive'}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Overdue inspections (> {0} days)', MARKET_INSPECTION_INTERVAL_DAYS)}
          value={formatNumber(overdue.length)}
          support={
            overdue.length > 0
              ? `${formatNumber(overdueRegulated.length)} of them regulated trades · longest gap ${formatNumber(longestInterval)} days`
              : 'Every facility inspected within the interval'
          }
          tone={overdueRegulated.length > 0 ? 'critical' : overdue.length > 0 ? 'warn' : 'positive'}
          icon={<CalendarClock className="h-4 w-4" />}
        />
      </MetricGrid>

      {/* Two columns. The estate register and the enforcement series carry the
          width; the function's own reading, the discharge exceptions and the
          worst hygiene findings are read down the column beside them. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <Card flush>
            <CardHeader
              bordered
              icon={<Store className="h-4 w-4" />}
              title={t('Market estate and regulated trades')}
              description={t('Retail markets, wholesale yards, fish markets, slaughter houses and tanneries within your authorised ward scope. Premises only - no trader, licence holder or tenancy is held.')}
            />
            {filtered.length === 0 ? (
              <EmptyState
                title={t('No facilities match the current filters')}
                detail="Clear a filter to widen the register."
              />
            ) : (
              <DataTable rows={filtered} columns={columns} rowKey={(r) => r.id} pageSize={12} />
            )}
          </Card>

          <Card className="flex min-w-0 flex-col">
            <p className="label-institutional mb-2">{t('Monthly inspections, violations found and licences issued')}</p>
            <div style={{ height: 220 }}>
              <CategoryBarChart
                data={trend as unknown as Array<Record<string, string | number>>}
                categoryKey="month"
                showLegend
                series={[
                  { key: 'inspections', label: t('Inspections'), colour: CHART_COLOURS.primary },
                  { key: 'violationsFound', label: t('Violations found'), colour: CHART_COLOURS.warn },
                  { key: 'licencesIssued', label: t('Licences issued'), colour: CHART_COLOURS.intel },
                ]}
              />
            </div>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
              {t('Read the two enforcement series against each other rather than separately. Inspections rising while violations found stay flat usually means the inspections are going where they are easiest, not where they are needed - which is the failure mode the overdue count above is there to catch.')}
            </p>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <Card tone="info" className="flex items-start gap-3">
            <Beef className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-govt-800">{t('A food-safety function before a revenue one')}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                {t('The Twelfth Schedule assigns the corporation regulation of slaughter houses and tanneries, not merely the letting of stalls. An uninspected slaughter house is a public-health exposure inside the city&apos;s meat supply whether or not its licence fee has been paid, which is why the interval since the last inspection leads this page and the rent roll does not. The interval - not the inspection count - is the control that matters: a rising monthly total achieved by revisiting the same compliant markets leaves exactly the same premises unvisited as no inspections at all. Effluent compliance is where a slaughter house or a tannery becomes an environmental matter as well as a hygiene one, since untreated trade effluent reaches a nullah and from there a creek.')}
              </p>
            </div>
          </Card>

          {effluentBreaches.length > 0 ? (
            <Card tone="warn" className="flex items-start gap-3">
              <Droplets className="mt-0.5 h-4 w-4 shrink-0 text-warn-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold text-warn-700">
                  {t('{0} facilities discharging outside consent conditions', formatNumber(effluentBreaches.length))}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  {t('Trade effluent from a slaughter house, a tannery or a fish market is high-load organic and chemical waste. Where it is not treated to consent conditions it enters the storm water network, and the same premises reappear in the environment department&apos;s water-quality record downstream. These are hygiene findings and environmental findings at once, and closing them needs both departments in the room.')}
                </p>
              </div>
            </Card>
          ) : null}

          <Card flush className="flex min-w-0 flex-col">
            <CardHeader
              bordered
              title={t('Lowest hygiene score')}
              description={t('Where the last inspection found the worst conditions. These are the premises a re-inspection should reach first.')}
            />
            <div className="px-4 pb-4" style={{ height: Math.max(210, lowestHygiene.length * 26) }}>
              {lowestHygiene.length === 0 ? (
                <EmptyState compact title={t('No facilities in scope')} detail="Clear a filter to widen the register." />
              ) : (
                <RankedBarChart
                  data={lowestHygiene.map((m) => ({ label: m.name.slice(0, 22), value: m.hygieneScore }))}
                  higherIsWorse={false}
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </PageBody>
  )
}

export default MarketsPage
