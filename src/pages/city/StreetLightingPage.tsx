import { useMemo } from 'react'
import { Lightbulb, Zap, TriangleAlert, Gauge } from 'lucide-react'
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
  SeverityBadge,
  StateBadge,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { CHART_COLOURS, DonutChart, RankedBarChart } from '@/components/charts'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { streetLightService } from '@/services'
import { activeCorporation } from '@/config/municipality.config'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardName, wardShortName } from '@/data/reference'
import {
  LAMP_TYPE_LABEL,
  LIGHTING_FAULT_CATEGORY_LABEL,
  type LampType,
  type LightingCircuit,
  type LightingFault,
} from '@/types/civic-services'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatNumber, formatRelative } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/city/StreetLightingPage.tsx
 *
 * Street lighting.
 *
 * A street light is the cheapest safety infrastructure a corporation owns and
 * the one residents notice fastest when it fails. It is also where the clearest
 * energy saving in the whole municipal estate sits: an LED fitting draws
 * roughly a third of the sodium-vapour lamp it replaces, so conversion is a
 * financial argument as much as a service one, and both are on this page.
 *
 * The unit is the FEEDER CIRCUIT rather than the pole, because that is what a
 * corporation switches, bills and maintains. A per-pole energy figure would be
 * an average presented as a meter reading.
 */

const LAMP_COLOUR: Record<LampType, string> = {
  led: CHART_COLOURS.positive,
  'sodium-vapour': CHART_COLOURS.warn,
  'metal-halide': CHART_COLOURS.risk,
  cfl: CHART_COLOURS.neutral,
}

export function StreetLightingPage(): React.JSX.Element {
  usePageMasthead(t('Street Lighting'))

  const filters = useFilterStore((s) => s.filters)

  const circuitsQuery = useServiceQuery(queryKeys.streetLighting('circuits'), (u) => streetLightService.circuits(u))
  const faultsQuery = useServiceQuery(queryKeys.streetLighting('faults'), (u) => streetLightService.faults(u))

  const circuits = useMemo(() => circuitsQuery.data ?? [], [circuitsQuery.data])
  const faults = useMemo(() => faultsQuery.data ?? [], [faultsQuery.data])

  const filtered = useMemo(
    () =>
      circuits.filter((c) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(c.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!c.location.toLowerCase().includes(q) && !c.reference.toLowerCase().includes(q)) return false
        }
        return true
      }),
    [circuits, filters],
  )

  if (circuitsQuery.isLoading || faultsQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Street Lighting') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (circuitsQuery.error || faultsQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Street Lighting') }]} />
        <ErrorState
          detail={(circuitsQuery.error ?? faultsQuery.error)?.message}
          onRetry={() => { void circuitsQuery.refetch(); void faultsQuery.refetch() }}
        />
      </PageBody>
    )
  }

  const polesTotal = filtered.reduce((s, c) => s + c.polesTotal, 0)
  const polesFunctional = filtered.reduce((s, c) => s + c.polesFunctional, 0)
  const functionalPct = polesTotal > 0 ? Math.round((polesFunctional / polesTotal) * 1000) / 10 : 0
  const monthlyCost = filtered.reduce((s, c) => s + c.monthlyEnergyCostRupees, 0)
  const monthlyKwh = filtered.reduce((s, c) => s + c.monthlyConsumptionKwh, 0)

  const ledPoles = filtered.filter((c) => c.lampType === 'led').reduce((s, c) => s + c.polesTotal, 0)
  const ledPct = polesTotal > 0 ? Math.round((ledPoles / polesTotal) * 1000) / 10 : 0

  const openFaults = faults.filter((f) => f.status !== 'rectified')
  const breached = openFaults.filter((f) => f.breached)

  const byLamp = (Object.keys(LAMP_TYPE_LABEL) as LampType[])
    .map((entry) => ({ type: entry, poles: filtered.filter((c) => c.lampType === entry).reduce((s, c) => s + c.polesTotal, 0) }))
    .filter((x) => x.poles > 0)

  const worstCompliance = [...filtered].sort((a, b) => a.burningHoursCompliancePct - b.burningHoursCompliancePct).slice(0, 10)

  /**
   * The financial case for conversion, stated conservatively.
   *
   * Only the load difference is claimed - an LED fitting at roughly a third of
   * the draw of the sodium-vapour lamp it replaces. Nothing is claimed for
   * maintenance, lamp life or reduced failure rates, all of which are real and
   * all of which would need the corporation's own contract terms to quantify
   * honestly.
   */
  const nonLed = filtered.filter((c) => c.lampType !== 'led')
  const nonLedMonthlyCost = nonLed.reduce((s, c) => s + c.monthlyEnergyCostRupees, 0)
  const indicativeAnnualSaving = Math.round((nonLedMonthlyCost * 0.66 * 12) / 100000) / 10

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const circuitColumns: Array<Column<LightingCircuit>> = [
    { id: 'reference', header: t('Circuit'), cell: (r) => <span className="numeric text-[0.6875rem] text-ink-500">{r.reference}</span>, sortValue: (r) => r.reference, searchValue: (r) => r.reference, hideBelow: 'lg' },
    {
      id: 'location',
      header: t('Location'),
      cell: (r) => (
        <span className="font-medium text-ink-900">
          {r.location}
          {r.priorityCorridor ? <Badge tone="info" size="sm" className="ml-1.5">{t('Priority')}</Badge> : null}
        </span>
      ),
      sortValue: (r) => r.location,
      searchValue: (r) => r.location,
      width: 'minmax(12rem,1.5fr)',
    },
    { id: 'ward', header: t('Ward'), cell: (r) => wardShortName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    {
      id: 'poles',
      header: t('Poles (working / total)'),
      cell: (r) => {
        const pct = (r.polesFunctional / r.polesTotal) * 100
        return (
          <span className={pct < 85 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
            {r.polesFunctional} <span className="text-ink-400">/ {r.polesTotal}</span>
          </span>
        )
      },
      sortValue: (r) => r.polesFunctional / r.polesTotal,
      align: 'right',
    },
    { id: 'lamp', header: t('Lamp'), cell: (r) => <Badge tone={r.lampType === 'led' ? 'positive' : 'neutral'} size="sm">{LAMP_TYPE_LABEL[r.lampType]}</Badge>, sortValue: (r) => r.lampType, hideBelow: 'md' },
    { id: 'load', header: t('Load'), cell: (r) => <span className="numeric">{r.connectedLoadKw} kW</span>, sortValue: (r) => r.connectedLoadKw, align: 'right', hideBelow: 'xl' },
    { id: 'energy', header: t('Monthly energy'), cell: (r) => <span className="numeric">₹{formatNumber(r.monthlyEnergyCostRupees)}</span>, sortValue: (r) => r.monthlyEnergyCostRupees, align: 'right', hideBelow: 'lg' },
    {
      id: 'compliance',
      header: t('Burning hours'),
      cell: (r) => (
        <span className={r.burningHoursCompliancePct < 85 ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
          {r.burningHoursCompliancePct}%
        </span>
      ),
      sortValue: (r) => r.burningHoursCompliancePct,
      align: 'right',
      hideBelow: 'md',
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  const faultColumns: Array<Column<LightingFault>> = [
    { id: 'reference', header: t('Fault'), cell: (r) => <span className="numeric text-[0.6875rem] text-ink-500">{r.reference}</span>, sortValue: (r) => r.reference, searchValue: (r) => r.reference },
    { id: 'ward', header: t('Ward'), cell: (r) => wardShortName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'category', header: t('Category'), cell: (r) => LIGHTING_FAULT_CATEGORY_LABEL[r.category], sortValue: (r) => r.category, hideBelow: 'md' },
    { id: 'poles', header: t('Poles affected'), cell: (r) => <span className="numeric">{r.polesAffected}</span>, sortValue: (r) => r.polesAffected, align: 'right', hideBelow: 'lg' },
    { id: 'severity', header: t('Severity'), cell: (r) => <SeverityBadge severity={r.severity} />, sortValue: (r) => r.severity },
    { id: 'reported', header: t('Reported'), cell: (r) => formatRelative(r.reportedAt), sortValue: (r) => r.reportedAt, hideBelow: 'lg' },
    {
      id: 'sla',
      header: t('Against SLA'),
      cell: (r) =>
        r.status === 'rectified' ? (
          <Badge tone="positive" size="sm">{t('Rectified')}</Badge>
        ) : r.breached ? (
          <Badge tone="critical" size="sm">{t('{0}h of {1}h', r.ageHours, r.slaHours)}</Badge>
        ) : (
          <Badge tone="muted" size="sm">{t('{0}h of {1}h', r.ageHours, r.slaHours)}</Badge>
        ),
      sortValue: (r) => (r.status === 'rectified' ? -1 : r.ageHours / r.slaHours),
      align: 'right',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Street Lighting') }]}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search circuits" />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Poles working')}
          value={functionalPct}
          unit="%"
          support={t('{0} of {1} across {2} circuits', formatNumber(polesFunctional), formatNumber(polesTotal), filtered.length)}
          tone={functionalPct < 90 ? 'warn' : 'positive'}
          footer={
            activeCorporation.id === 'bmc' && activeCorporation.streetlightsLedConvertedSuburbs ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('For context: BMC\'s own LED-conversion project converted {0} streetlights across the western and eastern suburbs, ~97% of that project complete (30 Jan 2023). This is the suburban conversion count only - no citywide total streetlight figure (including the island city) was found.', formatNumber(activeCorporation.streetlightsLedConvertedSuburbs))}
              </span>
            ) : undefined
          }
          icon={<Lightbulb className="h-4 w-4" />}
          origin="demonstration"
          background="red"
        />
        <MetricCard
          label={t('LED conversion')}
          value={ledPct}
          unit="%"
          support={t('{0} poles converted', formatNumber(ledPoles))}
          progress={{ value: ledPoles, max: Math.max(1, polesTotal) }}
          icon={<Zap className="h-4 w-4" />}
          background="amber"
          footer={<span className="text-[0.625rem] leading-snug text-ink-400">{t('BMC reported {0} streetlights converted to LED across the western and eastern suburbs, ~97% of that conversion project complete (Jan 2023) — a suburbs-only published figure, not a citywide total; the citywide count and percentage above are modelled.', formatNumber(activeCorporation.streetlightsLedConvertedSuburbs ?? 0))}</span>}
        />
        <MetricCard
          label={t('Monthly energy')}
          value={`₹${formatNumber(Math.round(monthlyCost / 100000))} L`}
          support={t('{0} kWh drawn', formatNumber(monthlyKwh))}
          icon={<Gauge className="h-4 w-4" />}
          background="green"
        />
        <MetricCard
          label={t('Faults past SLA')}
          value={breached.length}
          support={t('of {0} open faults', openFaults.length)}
          tone={breached.length > 0 ? 'critical' : 'positive'}
          icon={<TriangleAlert className="h-4 w-4" />}
        />
      </MetricGrid>

      {/* Two columns. What is broken now and what the corporation owns read
          down the wide column in that order; the lamp mix that governs the
          energy bill and the burning-hours ranking stand beside them. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
        <GovPanel title={t('Open faults')} tone="amber" dense>
          <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
            {t('Reported and assigned faults, measured against the restoration time the corporation commits to for each severity.')}
          </p>
          {openFaults.length === 0 ? (
            <EmptyState className="mx-3 mb-3" title={t('No open lighting faults')} detail="Every reported fault within your ward scope has been rectified." />
          ) : (
            <DataTable rows={openFaults} columns={faultColumns} rowKey={(r) => r.id} pageSize={10} />
          )}
        </GovPanel>

        <GovPanel title={t('Circuit register')} tone="red" dense>
          <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
            {t('Every feeder circuit within your authorised ward scope.')}
          </p>
          {filtered.length === 0 ? (
            <EmptyState className="mx-3 mb-3" title={t('No circuits match the current filters')} detail="Clear a filter to widen the register." />
          ) : (
            <DataTable rows={filtered} columns={circuitColumns} rowKey={(r) => r.id} pageSize={15} />
          )}
        </GovPanel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <GovPanel title={t('Circuits by burning-hours compliance')} tone="green" dense className="flex flex-col">
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Hours a circuit was actually lit against the hours it should have been. A circuit dark at 21:00 is a safety matter, not a billing one.')}
            </p>
            <div className="px-4 pb-4" style={{ height: Math.max(210, worstCompliance.length * 26) }}>
              <RankedBarChart
                data={worstCompliance.map((c) => ({ label: c.location.slice(0, 22), value: c.burningHoursCompliancePct }))}
                unit="%"
                higherIsWorse={false}
              />
            </div>
          </GovPanel>


          <Card className="flex flex-col">
            <p className="label-institutional mb-2">{t('Poles by lamp type')}</p>
            <div style={{ height: 200 }}>
              <DonutChart
                data={byLamp.map((l) => ({ label: LAMP_TYPE_LABEL[l.type], value: l.poles, colour: LAMP_COLOUR[l.type] }))}
                centreValue={`${ledPct}%`}
                centreLabel="LED"
              />
            </div>
            <div className="mt-3 rounded-lg bg-surface-sunken p-3">
              <p className="text-[0.6875rem] font-semibold text-ink-700">
                {t('Indicative saving from completing conversion: ₹{0} Cr a year', indicativeAnnualSaving)}
              </p>
              <p className="mt-1 text-[0.625rem] leading-relaxed text-ink-500">
                {t('Counts the energy difference only, at roughly a third of the draw of the fitting replaced. Nothing is claimed here for lamp life, maintenance or failure rates - all real, none quantifiable without the corporation&apos;s own contract terms.')}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </PageBody>
  )
}

export default StreetLightingPage
