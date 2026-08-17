import { useMemo } from 'react'
import { Accessibility, Droplets, SquareParking, Toilet, Wrench } from 'lucide-react'
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
import { amenitiesService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { activeCorporation } from '@/config/municipality.config'
import { wardName, wardShortName } from '@/data/reference'
import {
  AMENITY_CAPACITY_UNIT,
  AMENITY_KIND_LABEL,
  AMENITY_OPERATOR_LABEL,
  PARKING_BAYS_PER_1000_VEHICLES_BENCHMARK,
  RESIDENTS_PER_TOILET_SEAT_BENCHMARK,
  type PublicAmenity,
  type WardAmenityGap,
} from '@/types/amenities'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCrore, formatDate, formatNumber, formatRelative } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/city/AmenitiesPage.tsx
 *
 * Parking and public amenities - function 17 of the Twelfth Schedule, less
 * street lighting, which is reported on its own surface.
 *
 * This page is built around a refusal. It will not show a count of facilities
 * on its own, because a public convenience that exists but has no water supply
 * is not a working amenity, and a bus shelter recorded on the asset register
 * but broken on the ground is a liability rather than a service. Availability
 * and CONDITION are reported together in every panel here, and the ward gap
 * counts a dry convenience as needing repair however recently it was built.
 *
 * The headline ratio is residents per public toilet seat, and it is measured
 * against seats a resident could actually use. That is the Swachh Bharat
 * denominator, it is the figure a bare facility count conceals, and it is the
 * figure that determines whether a woman can move through this city for a full
 * working day. It is ranked by ward rather than averaged into one civic total,
 * because the average is always survivable and the worst ward never is.
 *
 * Parking is presented as a demand-management instrument first. Bays for every
 * thousand registered vehicles governs whether a carriageway stays a road;
 * collections are what falls out of pricing that correctly, which is why the
 * revenue line sits beneath the provision ratio rather than above it.
 *
 * NO RESIDENT APPEARS BEHIND THIS PAGE. There is no ticket holder, no vehicle
 * registration and no complainant identity in the model - only the facility,
 * its condition, and the volume of grievances raised against it.
 */

/** Where a class is worked so hard that occupancy is itself the finding. */
const OCCUPANCY_PRESSURE_THRESHOLD = 88

export function AmenitiesPage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)

  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(t('Parking & Public Amenities'))

  const amenitiesQuery = useServiceQuery(queryKeys.amenities('estate'), (u) => amenitiesService.amenities(u))
  const gapsQuery = useServiceQuery(queryKeys.amenities('ward-gaps'), (u) => amenitiesService.wardGaps(u))
  const trendQuery = useServiceQuery(queryKeys.amenities('trend'), (u) => amenitiesService.trend(u))

  const amenities = useMemo(() => amenitiesQuery.data ?? [], [amenitiesQuery.data])
  const gaps = useMemo(() => gapsQuery.data ?? [], [gapsQuery.data])
  const trend = useMemo(() => trendQuery.data ?? [], [trendQuery.data])

  const filtered = useMemo(
    () =>
      amenities.filter((a) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(a.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (
            !a.name.toLowerCase().includes(q) &&
            !wardName(a.wardId).toLowerCase().includes(q) &&
            !AMENITY_KIND_LABEL[a.kind].toLowerCase().includes(q)
          ) {
            return false
          }
        }
        return true
      }),
    [amenities, filters],
  )

  const filteredGaps = useMemo(
    () => (filters.wardIds.length > 0 ? gaps.filter((g) => filters.wardIds.includes(g.wardId)) : gaps),
    [gaps, filters.wardIds],
  )

  if (amenitiesQuery.isLoading || gapsQuery.isLoading || trendQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('City Intelligence')}
          breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Parking & Public Amenities') }]}
        />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }

  if (amenitiesQuery.error || gapsQuery.error || trendQuery.error) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('City Intelligence')}
          breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Parking & Public Amenities') }]}
        />
        <ErrorState
          detail={(amenitiesQuery.error ?? gapsQuery.error ?? trendQuery.error)?.message}
          onRetry={() => {
            void amenitiesQuery.refetch()
            void gapsQuery.refetch()
            void trendQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  /* ------------------------------------------------------------------ Totals */

  const toilets = filtered.filter((a) => a.kind === 'public-toilet')
  const usableToiletSeats = toilets
    .filter((a) => a.waterSupplyAvailable && a.state !== 'critical')
    .reduce((s, a) => s + a.capacity, 0)
  const dryToilets = toilets.filter((a) => !a.waterSupplyAvailable).length

  const parkingLots = filtered.filter((a) => a.kind === 'parking-lot')
  const parkingBays = parkingLots.reduce((s, a) => s + a.capacity, 0)
  const monthlyParkingRevenueLakh = parkingLots.reduce((s, a) => s + (a.monthlyRevenueLakh ?? 0), 0)

  const accessible = filtered.filter((a) => a.accessibleToPwD).length
  const accessibleSharePct = filtered.length ? Math.round((accessible / filtered.length) * 1000) / 10 : 0

  const needingRepair = filtered.filter(
    (a) => a.state === 'at-risk' || a.state === 'critical' || (a.kind === 'public-toilet' && !a.waterSupplyAvailable),
  ).length

  const openComplaints = filtered.reduce((s, a) => s + a.openComplaints30d, 0)

  // The city ratio across the wards in view. Stated as the mean of the ward
  // ratios rather than a single city-wide division, so that a large ward with
  // a good ratio cannot mask several small wards with terrible ones - which is
  // the arithmetic by which this figure is usually made to look acceptable.
  const residentsPerToilet = filteredGaps.length
    ? Math.round(filteredGaps.reduce((s, g) => s + g.populationPerPublicToilet, 0) / filteredGaps.length)
    : 0

  const meanBaysPer1000 = filteredGaps.length
    ? Math.round((filteredGaps.reduce((s, g) => s + g.parkingBaysPer1000Vehicles, 0) / filteredGaps.length) * 10) / 10
    : 0

  const worstToiletRatio = [...filteredGaps]
    .sort((a, b) => b.populationPerPublicToilet - a.populationPerPublicToilet)
    .slice(0, 10)

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  /* ----------------------------------------------------------------- Columns */

  const columns: Array<Column<PublicAmenity>> = [
    {
      id: 'name',
      header: t('Amenity'),
      cell: (a) => <span className="font-medium text-ink-900">{a.name}</span>,
      sortValue: (a) => a.name,
      searchValue: (a) => a.name,
      width: 'minmax(14rem,1.7fr)',
    },
    {
      id: 'ward',
      header: t('Ward'),
      cell: (a) => wardShortName(a.wardId),
      sortValue: (a) => wardName(a.wardId),
      hideBelow: 'sm',
    },
    {
      id: 'kind',
      header: t('Class'),
      cell: (a) => (
        <Badge tone="neutral" size="sm">
          {AMENITY_KIND_LABEL[a.kind]}
        </Badge>
      ),
      sortValue: (a) => AMENITY_KIND_LABEL[a.kind],
      searchValue: (a) => AMENITY_KIND_LABEL[a.kind],
    },
    {
      id: 'capacity',
      header: t('Capacity'),
      cell: (a) => (
        <span className="numeric text-ink-700">
          {formatNumber(a.capacity)} <span className="text-ink-400">{AMENITY_CAPACITY_UNIT[a.kind]}</span>
        </span>
      ),
      sortValue: (a) => a.capacity,
      align: 'right',
    },
    {
      id: 'occupancy',
      header: t('Mean occupancy'),
      cell: (a) => (
        <span
          className={
            a.meanOccupancyPct >= OCCUPANCY_PRESSURE_THRESHOLD
              ? 'numeric font-semibold text-warn-700'
              : 'numeric text-ink-700'
          }
        >
          {a.meanOccupancyPct}%
        </span>
      ),
      sortValue: (a) => a.meanOccupancyPct,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'water',
      header: t('Water supply'),
      cell: (a) =>
        a.waterSupplyAvailable ? (
          <Badge tone="positive" size="sm">
            {t('Available')}
          </Badge>
        ) : (
          <Badge tone={a.kind === 'public-toilet' ? 'critical' : 'muted'} size="sm">
            {a.kind === 'public-toilet' ? 'None - not usable' : 'None'}
          </Badge>
        ),
      sortValue: (a) => (a.waterSupplyAvailable ? 1 : 0),
      hideBelow: 'lg',
    },
    {
      id: 'access',
      header: t('Accessible'),
      cell: (a) =>
        a.accessibleToPwD ? (
          <Badge tone="positive" size="sm" icon={<Accessibility className="h-3 w-3" />}>
            {t('Yes')}
          </Badge>
        ) : (
          <Badge tone="warn" size="sm">
            {t('No')}
          </Badge>
        ),
      sortValue: (a) => (a.accessibleToPwD ? 1 : 0),
      hideBelow: 'lg',
    },
    {
      id: 'operator',
      header: t('Operated by'),
      cell: (a) => <span className="text-ink-700">{AMENITY_OPERATOR_LABEL[a.operatedBy]}</span>,
      sortValue: (a) => AMENITY_OPERATOR_LABEL[a.operatedBy],
      hideBelow: 'xl',
    },
    {
      id: 'revenue',
      header: t('Monthly collection'),
      cell: (a) =>
        a.monthlyRevenueLakh === undefined ? (
          <span className="text-ink-400">{t('Not charged')}</span>
        ) : (
          <span className="numeric text-ink-700">{t('₹{0} L', formatNumber(a.monthlyRevenueLakh, 1))}</span>
        ),
      sortValue: (a) => a.monthlyRevenueLakh ?? -1,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'complaints',
      header: t('Open (30d)'),
      cell: (a) => (
        <span className={a.openComplaints30d > 8 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
          {formatNumber(a.openComplaints30d)}
        </span>
      ),
      sortValue: (a) => a.openComplaints30d,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'serviced',
      header: t('Last serviced'),
      cell: (a) => (
        <span className="text-ink-600" title={formatDate(a.lastServicedAt)}>
          {formatRelative(a.lastServicedAt)}
        </span>
      ),
      sortValue: (a) => a.lastServicedAt,
      hideBelow: 'xl',
    },
    { id: 'state', header: t('Condition'), cell: (a) => <StateBadge state={a.state} />, sortValue: (a) => a.state },
  ]

  const gapColumns: Array<Column<WardAmenityGap>> = [
    {
      id: 'ward',
      header: t('Ward'),
      cell: (g) => <span className="font-medium text-ink-900">{wardName(g.wardId)}</span>,
      sortValue: (g) => wardName(g.wardId),
      searchValue: (g) => wardName(g.wardId),
      width: 'minmax(12rem,1.5fr)',
    },
    {
      id: 'amenities',
      header: t('Amenities'),
      cell: (g) => <span className="numeric text-ink-700">{formatNumber(g.amenities)}</span>,
      sortValue: (g) => g.amenities,
      align: 'right',
    },
    {
      id: 'toilet',
      header: t('Residents per usable seat'),
      cell: (g) => (
        <span
          className={
            g.populationPerPublicToilet > RESIDENTS_PER_TOILET_SEAT_BENCHMARK * 2
              ? 'numeric font-semibold text-crit-600'
              : g.populationPerPublicToilet > RESIDENTS_PER_TOILET_SEAT_BENCHMARK
                ? 'numeric font-semibold text-warn-700'
                : 'numeric text-ink-700'
          }
        >
          {formatNumber(g.populationPerPublicToilet)}
        </span>
      ),
      sortValue: (g) => g.populationPerPublicToilet,
      align: 'right',
    },
    {
      id: 'bays',
      header: t('Bays per 1,000 vehicles'),
      cell: (g) => (
        <span
          className={
            g.parkingBaysPer1000Vehicles < PARKING_BAYS_PER_1000_VEHICLES_BENCHMARK / 2
              ? 'numeric font-semibold text-warn-700'
              : 'numeric text-ink-700'
          }
        >
          {g.parkingBaysPer1000Vehicles}
        </span>
      ),
      sortValue: (g) => g.parkingBaysPer1000Vehicles,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'repair',
      header: t('Needing repair'),
      cell: (g) => (
        <span className={g.amenitiesNeedingRepair > 0 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
          {formatNumber(g.amenitiesNeedingRepair)}
        </span>
      ),
      sortValue: (g) => g.amenitiesNeedingRepair,
      align: 'right',
      hideBelow: 'sm',
    },
    { id: 'state', header: t('Provision'), cell: (g) => <StateBadge state={g.state} />, sortValue: (g) => g.state },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Parking & Public Amenities') }]}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search amenities, wards or classes" />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Amenities on the register')}
          value={formatNumber(filtered.length)}
          support={t('{0} conveniences · {1} parking lots', formatNumber(toilets.length), formatNumber(parkingLots.length))}
          icon={<SquareParking className="h-4 w-4" />}
          origin="demonstration"
          background="red"
          footer={
            activeCorporation.id === 'bmc' && activeCorporation.publicToiletBlocksCount ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('For context: a Praja Foundation RTI-based report (May 2024) counted {0} public toilet blocks across Mumbai\'s 24 wards - one seat per 752 males and one per 1,820 females; 69% of community blocks lack water, 60% lack electricity.', formatNumber(activeCorporation.publicToiletBlocksCount))}
              </span>
            ) : undefined
          }
        />
        <MetricCard
          label={t('Residents per usable toilet seat')}
          value={formatNumber(residentsPerToilet)}
          support={t('{0} usable seats · benchmark {1}', formatNumber(usableToiletSeats), formatNumber(RESIDENTS_PER_TOILET_SEAT_BENCHMARK))}
          tone={
            residentsPerToilet > RESIDENTS_PER_TOILET_SEAT_BENCHMARK * 2
              ? 'critical'
              : residentsPerToilet > RESIDENTS_PER_TOILET_SEAT_BENCHMARK
                ? 'warn'
                : 'positive'
          }
          icon={<Toilet className="h-4 w-4" />}
          explanation="Ward residents divided by public toilet seats they could actually use - seats with a water supply and not in critical condition. Seats, not blocks: a block of four and a block of twenty are not the same amenity."
          background="amber"
          footer={<span className="text-[0.625rem] leading-snug text-ink-400">{t('For reference: Praja Foundation\'s RTI-based report (data as of Dec 2023) counted 7,646 public toilet blocks across Mumbai\'s 24 wards — a block count, a coarser unit than the usable-seat ratio above, which this page measures because it is the Swachh Bharat standard. The two figures are not directly comparable.')}</span>}
        />
        <MetricCard
          label={t('Accessible to persons with disabilities')}
          value={accessibleSharePct}
          unit="%"
          support={t('{0} of {1} amenities', formatNumber(accessible), formatNumber(filtered.length))}
          tone={accessibleSharePct < 40 ? 'critical' : accessibleSharePct < 60 ? 'warn' : 'positive'}
          icon={<Accessibility className="h-4 w-4" />}
          explanation="Step-free approach, grab rails and a usable entrance width. An amenity a wheelchair user cannot enter is not available to them, however it is counted on the asset register."
          background="green"
        />
        <MetricCard
          label={t('Amenities needing repair')}
          value={formatNumber(needingRepair)}
          support={t('{0} grievances open · {1} conveniences without water', formatNumber(openComplaints), formatNumber(dryToilets))}
          tone={needingRepair > filtered.length * 0.25 ? 'critical' : needingRepair > 0 ? 'warn' : 'positive'}
          icon={<Wrench className="h-4 w-4" />}
        />
      </MetricGrid>

      {/* Two columns, read downward. The registers — what the corporation
          holds and where provision falls short — carry the width; the ranking
          and the two readings that qualify them stand beside, not below. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <GovPanel title={t('Public amenities')} tone="amber" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Every facility within your authorised ward scope, with the condition that qualifies it. Availability alone is never reported here.')}
            </p>
            {filtered.length === 0 ? (
              <EmptyState
                className="mx-3 mb-3"
                title={t('No amenities match the current filters')}
                detail="Clear a filter to widen the amenity register."
              />
            ) : (
              <DataTable rows={filtered} columns={columns} rowKey={(a) => a.id} pageSize={12} />
            )}
          </GovPanel>

          <GovPanel title={t('Ward provision gap')} tone="red" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Provision measured against the people it serves rather than against last year\'s asset register.')}
            </p>
            {filteredGaps.length === 0 ? (
              <EmptyState
                className="mx-3 mb-3"
                title={t('No wards match the current filters')}
                detail="Clear the ward filter to see provision across the corporation."
              />
            ) : (
              <DataTable rows={filteredGaps} columns={gapColumns} rowKey={(g) => g.wardId} pageSize={12} />
            )}
          </GovPanel>

          <Card className="flex flex-col">
            <p className="label-institutional mb-2">{t('Amenity grievances raised against grievances resolved')}</p>
            <div style={{ height: 220 }}>
              <CategoryBarChart
                data={trend as unknown as Array<Record<string, string | number>>}
                categoryKey="month"
                showLegend
                series={[
                  { key: 'complaintsRaised', label: t('Raised'), colour: CHART_COLOURS.primary },
                  { key: 'complaintsResolved', label: t('Resolved'), colour: CHART_COLOURS.positive },
                ]}
              />
            </div>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
              {t('The two series are charted side by side rather than netted off, because the gap between them is the finding. It opens every monsoon - complaints rise exactly when the crews who would close them are hardest to deploy - and a single net figure would show the shortfall as a small number instead of a widening one.')}
            </p>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <Card tone="info" className="flex items-start gap-3">
            <Droplets className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-govt-800">{t('A facility count is not a service')}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                {t('A public convenience that exists but has no water supply is not a working amenity, which is why availability and condition are reported together on this page and never as a bare count of facilities. Residents per public toilet seat is the honest denominator - it is the figure that decides whether a woman can move through this city for a full working day, and it is the Swachh Bharat measure that a count of blocks conceals. The {0} conveniences standing without a water supply are counted here as needing repair, not as provision.', formatNumber(dryToilets))}
              </p>
            </div>
          </Card>

          <GovPanel title={t('Wards worst served for public conveniences')} tone="amber" dense className="flex flex-col">
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Residents for every usable toilet seat. Ranked, not averaged - the average is always survivable and the worst ward never is.')}
            </p>
            <div className="px-4 pb-4" style={{ height: Math.max(210, worstToiletRatio.length * 26) }}>
              {worstToiletRatio.length === 0 ? (
                <EmptyState compact title={t('No wards in scope')} detail="Widen the ward filter to rank provision." />
              ) : (
                <RankedBarChart
                  data={worstToiletRatio.map((g) => ({
                    label: wardShortName(g.wardId),
                    value: g.populationPerPublicToilet,
                  }))}
                />
              )}
            </div>
          </GovPanel>

          <Card tone="default" className="flex items-start gap-3">
            <SquareParking className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-ink-900">{t('Parking is a demand-management instrument')}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                {t('The corporation holds {0} public bays against the vehicle fleet in these wards - {1} bays for every thousand registered vehicles, against a planning benchmark of {2}. Where that ratio collapses the shortfall does not disappear, it moves onto the carriageway and reappears as a traffic finding. Collections of {3} a month are what falls out of pricing the instrument correctly - they are the consequence of the policy, not the reason for it.', formatNumber(parkingBays), meanBaysPer1000, PARKING_BAYS_PER_1000_VEHICLES_BENCHMARK, formatCrore(monthlyParkingRevenueLakh / 100))}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </PageBody>
  )
}

export default AmenitiesPage
