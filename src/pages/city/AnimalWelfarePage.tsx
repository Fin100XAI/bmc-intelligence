import { useMemo } from 'react'
import { ClipboardCheck, PawPrint, ShieldAlert, Syringe } from 'lucide-react'
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
import { animalWelfareService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { activeCorporation } from '@/config/municipality.config'
import { WARD_BY_ID, wardName, wardShortName } from '@/data/reference'
import {
  ANIMAL_WELFARE_OPERATOR_LABEL,
  ANIMAL_WELFARE_UNIT_KIND_LABEL,
  type AnimalWelfareUnit,
  type WardAnimalSignal,
} from '@/types/animal-welfare'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatDate, formatNumber, formatRelative } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/city/AnimalWelfarePage.tsx
 *
 * Cattle pounds and the prevention of cruelty to animals - function 15 of the
 * Twelfth Schedule.
 *
 * THIS PAGE IS BUILT AROUND ONE DISTINCTION. The Animal Birth Control (Dogs)
 * Rules make sterilisation - not removal, not relocation - the lawful method of
 * controlling the free-roaming dog population. That settles the method, and it
 * means the sterilisation rate is the INPUT: it is what the corporation does.
 * The DOG BITE RATE is the OUTCOME: it is what a resident walking to a bus stop
 * before dawn actually experiences. A corporation that reports sterilisation
 * numbers without bite rates is reporting activity, not results, so the two are
 * placed on the same screen, on the same chart, and neither can be read here
 * without the other.
 *
 * Cattle pounds sit in the same estate because they are the same statutory
 * duty, though the public interest in them is different: loose cattle on a
 * carriageway are a nuisance and a road-safety cause before they are a welfare
 * case, and the impounding count is the only number that says whether the
 * corporation is answering that.
 *
 * NO BITE CASE IS DESCRIBED HERE. Bites are counted, never narrated - no
 * complainant, no patient, no address and no incident record exists behind
 * these figures. The bite rate is an epidemiological signal about a ward, and
 * it must never become a record about the resident who was bitten.
 */

/** Wards below this bite rate are not flagged; the residual is what no
 *  programme removes, because sterilisation thins a population rather than
 *  emptying a street. */
const BITE_RATE_CONCERN_PER_10K = 3.5

export function AnimalWelfarePage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)

  usePageMasthead(t('Animal Welfare'))

  const unitsQuery = useServiceQuery(queryKeys.animalWelfare('units'), (u) => animalWelfareService.units(u))
  const signalsQuery = useServiceQuery(queryKeys.animalWelfare('ward-signals'), (u) =>
    animalWelfareService.wardSignals(u),
  )
  const trendQuery = useServiceQuery(queryKeys.animalWelfare('trend'), (u) => animalWelfareService.trend(u))

  const units = useMemo(() => unitsQuery.data ?? [], [unitsQuery.data])
  const signals = useMemo(() => signalsQuery.data ?? [], [signalsQuery.data])
  const trend = useMemo(() => trendQuery.data ?? [], [trendQuery.data])

  const filteredUnits = useMemo(
    () =>
      units.filter((u) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(u.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!u.name.toLowerCase().includes(q) && !wardName(u.wardId).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [units, filters],
  )

  const filteredSignals = useMemo(
    () =>
      signals.filter((s) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(s.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!wardName(s.wardId).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [signals, filters],
  )

  const isLoading = unitsQuery.isLoading || signalsQuery.isLoading || trendQuery.isLoading
  const error = unitsQuery.error ?? signalsQuery.error ?? trendQuery.error

  if (isLoading) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('City Intelligence')}
          breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Animal Welfare') }]}
        />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (error) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('City Intelligence')}
          breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Animal Welfare') }]}
        />
        <ErrorState
          detail={error.message}
          onRetry={() => {
            void unitsQuery.refetch()
            void signalsQuery.refetch()
            void trendQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  /* ------------------------------------------------------------- The estate */

  const capacity = filteredUnits.reduce((s, u) => s + u.capacity, 0)
  const animalsInCare = filteredUnits.reduce((s, u) => s + u.animalsInCare, 0)
  const sterilisations = filteredUnits.reduce((s, u) => s + u.sterilisations30d, 0)
  const vaccinations = filteredUnits.reduce((s, u) => s + u.rabiesVaccinations30d, 0)
  const cattleImpounded = filteredUnits.reduce((s, u) => s + u.cattleImpounded30d, 0)
  const pounds = filteredUnits.filter((u) => u.kind === 'cattle-pound').length
  const ngoOperated = filteredUnits.filter((u) => u.operatedBy === 'ngo-partner').length
  const overCapacity = filteredUnits.filter((u) => u.animalsInCare > u.capacity).length
  const occupancyPct = capacity > 0 ? Math.round((animalsInCare / capacity) * 1000) / 10 : 0

  /* ------------------------------------------------------------ The outcome */

  const strayPopulation = filteredSignals.reduce((s, w) => s + w.estimatedStrayPopulation, 0)
  const bites = filteredSignals.reduce((s, w) => s + w.dogBites30d, 0)
  const residents = filteredSignals.reduce((s, w) => s + (WARD_BY_ID.get(w.wardId)?.population ?? 0), 0)

  // Coverage is weighted by the stray population each ward carries, not
  // averaged across wards - a small ward at 90 per cent does not offset a dense
  // ward at 40 per cent, and an unweighted mean would let it.
  const sterilisedCoveragePct =
    strayPopulation > 0
      ? Math.round(
          (filteredSignals.reduce((s, w) => s + w.estimatedStrayPopulation * w.sterilisedPct, 0) / strayPopulation) * 10,
        ) / 10
      : 0
  const bitesPer10k = residents > 0 ? Math.round((bites / residents) * 10_000 * 10) / 10 : 0
  const wardsOfConcern = filteredSignals.filter((w) => w.bitesPer10kPopulation >= BITE_RATE_CONCERN_PER_10K).length

  const worstWards = [...filteredSignals]
    .sort((a, b) => b.bitesPer10kPopulation - a.bitesPer10kPopulation)
    .slice(0, 10)

  const firstMonth = trend[0]
  const lastMonth = trend[trend.length - 1]
  const biteMovementPct =
    firstMonth && lastMonth && firstMonth.dogBites > 0
      ? Math.round(((lastMonth.dogBites - firstMonth.dogBites) / firstMonth.dogBites) * 1000) / 10
      : 0
  const sterilisationMovementPct =
    firstMonth && lastMonth && firstMonth.sterilisations > 0
      ? Math.round(((lastMonth.sterilisations - firstMonth.sterilisations) / firstMonth.sterilisations) * 1000) / 10
      : 0

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  /* --------------------------------------------------------------- Registers */

  const unitColumns: Array<Column<AnimalWelfareUnit>> = [
    {
      id: 'name',
      header: t('Unit'),
      cell: (u) => <span className="font-medium text-ink-900">{u.name}</span>,
      sortValue: (u) => u.name,
      searchValue: (u) => u.name,
      width: 'minmax(15rem,1.8fr)',
    },
    {
      id: 'ward',
      header: t('Ward'),
      cell: (u) => wardShortName(u.wardId),
      sortValue: (u) => wardName(u.wardId),
      hideBelow: 'sm',
    },
    {
      id: 'kind',
      header: t('Type'),
      cell: (u) => (
        <Badge tone={u.kind === 'cattle-pound' ? 'info' : 'neutral'} size="sm">
          {ANIMAL_WELFARE_UNIT_KIND_LABEL[u.kind]}
        </Badge>
      ),
      sortValue: (u) => ANIMAL_WELFARE_UNIT_KIND_LABEL[u.kind],
      hideBelow: 'md',
    },
    {
      id: 'operator',
      header: t('Operated by'),
      cell: (u) => (
        <Badge tone={u.operatedBy === 'ngo-partner' ? 'intel' : 'muted'} size="sm">
          {ANIMAL_WELFARE_OPERATOR_LABEL[u.operatedBy]}
        </Badge>
      ),
      sortValue: (u) => ANIMAL_WELFARE_OPERATOR_LABEL[u.operatedBy],
      hideBelow: 'xl',
    },
    {
      id: 'care',
      header: t('In care / capacity'),
      cell: (u) => (
        <span className={u.animalsInCare > u.capacity ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
          {formatNumber(u.animalsInCare)} / {formatNumber(u.capacity)}
        </span>
      ),
      sortValue: (u) => (u.capacity > 0 ? u.animalsInCare / u.capacity : 0),
      align: 'right',
    },
    {
      id: 'sterilisations',
      header: t('Sterilisations (30d)'),
      cell: (u) => <span className="numeric">{u.sterilisations30d > 0 ? formatNumber(u.sterilisations30d) : '-'}</span>,
      sortValue: (u) => u.sterilisations30d,
      align: 'right',
    },
    {
      id: 'vaccinations',
      header: t('Anti-rabies (30d)'),
      cell: (u) => (
        <span className="numeric">{u.rabiesVaccinations30d > 0 ? formatNumber(u.rabiesVaccinations30d) : '-'}</span>
      ),
      sortValue: (u) => u.rabiesVaccinations30d,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'cattle',
      header: t('Cattle impounded (30d)'),
      cell: (u) => <span className="numeric">{u.cattleImpounded30d > 0 ? formatNumber(u.cattleImpounded30d) : '-'}</span>,
      sortValue: (u) => u.cattleImpounded30d,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'inspected',
      header: t('Last inspected'),
      cell: (u) => (
        <span className="text-ink-600" title={formatDate(u.lastInspectedAt)}>
          {formatRelative(u.lastInspectedAt)}
        </span>
      ),
      sortValue: (u) => u.lastInspectedAt,
      hideBelow: 'lg',
    },
    { id: 'state', header: t('Condition'), cell: (u) => <StateBadge state={u.state} />, sortValue: (u) => u.state },
  ]

  const signalColumns: Array<Column<WardAnimalSignal>> = [
    {
      id: 'ward',
      header: t('Ward'),
      cell: (w) => <span className="font-medium text-ink-900">{wardName(w.wardId)}</span>,
      sortValue: (w) => wardName(w.wardId),
      searchValue: (w) => wardName(w.wardId),
      width: 'minmax(12rem,1.4fr)',
    },
    {
      id: 'strays',
      header: t('Estimated strays'),
      cell: (w) => <span className="numeric">{formatNumber(w.estimatedStrayPopulation)}</span>,
      sortValue: (w) => w.estimatedStrayPopulation,
      align: 'right',
    },
    {
      id: 'sterilised',
      header: t('Sterilised'),
      cell: (w) => (
        <span className={w.sterilisedPct < 70 ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
          {w.sterilisedPct}%
        </span>
      ),
      sortValue: (w) => w.sterilisedPct,
      align: 'right',
    },
    {
      id: 'bites',
      header: t('Dog bites (30d)'),
      cell: (w) => <span className="numeric">{formatNumber(w.dogBites30d)}</span>,
      sortValue: (w) => w.dogBites30d,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'rate',
      header: t('Bites per 10k residents'),
      cell: (w) => (
        <span
          className={
            w.bitesPer10kPopulation >= BITE_RATE_CONCERN_PER_10K
              ? 'numeric font-semibold text-crit-600'
              : 'numeric text-ink-700'
          }
        >
          {w.bitesPer10kPopulation}
        </span>
      ),
      sortValue: (w) => w.bitesPer10kPopulation,
      align: 'right',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Animal Welfare') }]}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search units and wards" />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Sterilisation coverage')}
          value={sterilisedCoveragePct}
          unit="%"
          support={t('Of an estimated {0} free-roaming dogs', formatNumber(strayPopulation))}
          tone={sterilisedCoveragePct < 70 ? 'warn' : 'positive'}
          footer={
            activeCorporation.id === 'bmc' && activeCorporation.animalBirthControlCentresCount ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('For context: BMC runs just {0} ABC centres against an estimated 90,000+ stray dogs, per BMC officials (Nov 2025). 4,03,374 dogs have been sterilised 1994-Dec 2023, with a 45,000/year target and ₹23 crore allocated for the current drive.', activeCorporation.animalBirthControlCentresCount)}
              </span>
            ) : undefined
          }
          progress={{ value: sterilisedCoveragePct, max: 100 }}
          icon={<ClipboardCheck className="h-4 w-4" />}
          explanation="Weighted by the stray population each ward carries rather than averaged across wards, so a small ward with high coverage cannot offset a dense ward with low coverage. Seventy per cent sustained is the threshold below which a population does not fall."
          background="red"
        />
        <MetricCard
          label={t('Dog bites per 10k residents')}
          value={bitesPer10k}
          support={t('{0} cases in 30 days · {1} ward{2} above {3}', formatNumber(bites), wardsOfConcern, wardsOfConcern === 1 ? '' : 's', BITE_RATE_CONCERN_PER_10K)}
          tone={bitesPer10k >= BITE_RATE_CONCERN_PER_10K ? 'critical' : 'positive'}
          deltaPct={biteMovementPct}
          deltaHigherIsBetter={false}
          icon={<ShieldAlert className="h-4 w-4" />}
          explanation="The outcome residents actually experience. Cases are counted at municipal facilities and never described - no complainant, patient or address sits behind this figure."
          background="amber"
        />
        <MetricCard
          label={t('Animals in care')}
          value={formatNumber(animalsInCare)}
          support={t('{0}% of {1} sanctioned places · {2} unit{3} over capacity', occupancyPct, formatNumber(capacity), overCapacity, overCapacity === 1 ? '' : 's')}
          tone={overCapacity > 0 ? 'warn' : 'default'}
          icon={<PawPrint className="h-4 w-4" />}
          origin="demonstration"
          background="green"
        />
        <MetricCard
          label={t('Sterilisations in 30 days')}
          value={formatNumber(sterilisations)}
          support={t('{0} anti-rabies doses · {1} cattle impounded', formatNumber(vaccinations), formatNumber(cattleImpounded))}
          deltaPct={sterilisationMovementPct}
          deltaHigherIsBetter
          icon={<Syringe className="h-4 w-4" />}
        />
      </MetricGrid>

      {/* Two columns. The result the ward records is read first and carries the
          width; the estate that produced it follows beneath. The programme's
          own reasoning and the ranking of where it has not reached stand
          beside them rather than pushing the registers down the page. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <GovPanel title={t('Ward outcome register')} tone="amber" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('The result side of the function - sterilised share against the bite rate the ward records. The first is what the corporation did; the second is what residents felt.')}
            </p>
            {filteredSignals.length === 0 ? (
              <EmptyState
                className="mx-3 mb-3"
                title={t('No ward outcome matches the current filters')}
                detail="Clear a filter to widen the register."
              />
            ) : (
              <DataTable rows={filteredSignals} columns={signalColumns} rowKey={(w) => w.wardId} pageSize={12} />
            )}
          </GovPanel>

          <GovPanel title={t('Animal welfare estate')} tone="red" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Birth control centres, pounds, shelters and clinics within your authorised ward scope. {0} of {1} are run by NGO partners under contract, where the corporation\'s inspection record is its only assurance; {2} cattle pound{3} carry the traffic-safety side of the duty.', formatNumber(ngoOperated), formatNumber(filteredUnits.length), formatNumber(pounds), pounds === 1 ? '' : 's')}
            </p>
            {filteredUnits.length === 0 ? (
              <EmptyState
                className="mx-3 mb-3"
                title={t('No animal welfare units match the current filters')}
                detail="Clear a filter to widen the register."
              />
            ) : (
              <DataTable rows={filteredUnits} columns={unitColumns} rowKey={(u) => u.id} pageSize={12} />
            )}
          </GovPanel>

          <Card className="flex flex-col">
            <p className="label-institutional mb-2">{t('Monthly sterilisations, vaccinations and dog bites')}</p>
            <div style={{ height: 220 }}>
              <CategoryBarChart
                data={trend as unknown as Array<Record<string, string | number>>}
                categoryKey="month"
                showLegend
                series={[
                  { key: 'sterilisations', label: t('Sterilisations'), colour: CHART_COLOURS.primary },
                  { key: 'vaccinations', label: t('Anti-rabies doses'), colour: CHART_COLOURS.intel },
                  { key: 'dogBites', label: t('Dog bites reported'), colour: CHART_COLOURS.critical },
                ]}
              />
            </div>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
              {t('The two headline series move against each other - sterilisations {0} {1}% across the period, reported bites {2} {3}%. That inverse relationship, sustained over months, is the entire case for the programme; a single reporting period shows neither. Vaccination is delivered in the same visit as sterilisation, which is why the two rise together.', sterilisationMovementPct >= 0 ? 'up' : 'down', Math.abs(sterilisationMovementPct), biteMovementPct <= 0 ? 'down' : 'up', Math.abs(biteMovementPct))}
            </p>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <Card tone="info" className="flex items-start gap-3">
            <PawPrint className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-govt-800">
                {t('Sterilisation is the input. The bite rate is the result.')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                {t('The Animal Birth Control (Dogs) Rules make sterilisation - not removal and not relocation - the lawful method of controlling the free-roaming dog population. That settles the method and leaves one honest question about performance: did the bite rate move? A corporation that publishes sterilisation numbers without bite rates is reporting activity, not results, so both are held on this screen and neither is shown alone. Cattle pounds appear in the same estate because they are the same statutory duty - though loose cattle on a carriageway are a nuisance and a road-safety cause before they are a welfare case.')}
              </p>
            </div>
          </Card>

          <GovPanel title={t('Wards with the highest bite rate')} tone="amber" dense className="flex flex-col">
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Bites per 10,000 residents in 30 days - where the programme has not yet reached.')}
            </p>
            <div className="px-4 pb-4" style={{ height: Math.max(210, worstWards.length * 26) }}>
              {worstWards.length === 0 ? (
                <EmptyState title={t('No ward outcome recorded')} detail="Clear a filter to widen the comparison." compact />
              ) : (
                <RankedBarChart
                  data={worstWards.map((w) => ({ label: wardShortName(w.wardId), value: w.bitesPer10kPopulation }))}
                  unit=" / 10k"
                />
              )}
            </div>
          </GovPanel>
        </div>
      </div>
    </PageBody>
  )
}

export default AnimalWelfarePage
