import { useState } from 'react'
import { CloudDrizzle, Volume2, Wind } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  MetricGrid,
  Select,
  type Column,
} from '@/components/ui'
import { TrendBadge } from '@/components/ui/badges'
import { MetricCard } from '@/components/cards'
import { CategoryBarChart, ChartFrame, DonutChart, CHART_COLOURS } from '@/components/charts'
import { CityMap } from '@/components/map/CityMap'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { healthService } from '@/services/health.service'
import { useFilterStore } from '@/stores/ui.store'
import { wardName } from '@/data/reference'
import type { AirQualityStation, NoiseReading } from '@/types/city-domains'
import type { DataFreshness, Trend } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/** Air quality and noise intelligence. */

function build$AQI_CATEGORY_LABEL(): Record<AirQualityStation['category'], string> {
  return {
  good: t('Good'),
  satisfactory: t('Satisfactory'),
  moderate: t('Moderate'),
  poor: t('Poor'),
  'very-poor': t('Very Poor'),
  severe: t('Severe'),
}
}
let AQI_CATEGORY_LABEL: Record<AirQualityStation['category'], string> = build$AQI_CATEGORY_LABEL()
registerLayer(() => {
  AQI_CATEGORY_LABEL = build$AQI_CATEGORY_LABEL()
})
const AQI_CATEGORY_TONE: Record<AirQualityStation['category'], 'positive' | 'info' | 'warn' | 'risk' | 'critical'> = {
  good: 'positive',
  satisfactory: 'info',
  moderate: 'warn',
  poor: 'risk',
  'very-poor': 'critical',
  severe: 'critical',
}
const AQI_CATEGORY_COLOUR: Record<AirQualityStation['category'], string> = {
  good: CHART_COLOURS.positive,
  satisfactory: CHART_COLOURS.primary,
  moderate: CHART_COLOURS.warn,
  poor: CHART_COLOURS.risk,
  'very-poor': CHART_COLOURS.critical,
  severe: '#9f1239',
}
const AQI_CATEGORIES: Array<AirQualityStation['category']> = ['good', 'satisfactory', 'moderate', 'poor', 'very-poor', 'severe']

function build$ZONE_LABEL(): Record<NoiseReading['zoneType'], string> {
  return {
  silence: t('Silence Zone'),
  residential: t('Residential'),
  commercial: t('Commercial'),
  industrial: t('Industrial'),
}
}
let ZONE_LABEL: Record<NoiseReading['zoneType'], string> = build$ZONE_LABEL()
registerLayer(() => {
  ZONE_LABEL = build$ZONE_LABEL()
})
const ZONE_TYPES: Array<NoiseReading['zoneType']> = ['silence', 'residential', 'commercial', 'industrial']

function trendFor(direction: 'up' | 'down' | 'flat'): Trend {
  return { direction, changePct: direction === 'up' ? 2 : direction === 'down' ? -2 : 0, polarity: 'negative', comparisonLabel: 'vs previous reading' }
}

export function EnvironmentIntelligencePage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)
  const [zoneFilter, setZoneFilter] = useState<'all' | NoiseReading['zoneType']>('all')

  const aqiQuery = useServiceQuery(queryKeys.health('air-quality'), (u) => healthService.airQuality(u))
  const noiseQuery = useServiceQuery(queryKeys.health('noise'), (u) => healthService.noise(u))

  if (aqiQuery.isLoading || noiseQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={t('Environment Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Environment Intelligence') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (aqiQuery.error || noiseQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={t('Environment Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Environment Intelligence') }]} />
        <ErrorState detail={(aqiQuery.error ?? noiseQuery.error)?.message} onRetry={() => { void aqiQuery.refetch(); void noiseQuery.refetch() }} />
      </PageBody>
    )
  }

  const stations = aqiQuery.data ?? []
  const noise = noiseQuery.data ?? []

  const filteredStations = stations.filter((s) => {
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(s.wardId)) return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      if (!s.name.toLowerCase().includes(q) && !wardName(s.wardId).toLowerCase().includes(q)) return false
    }
    return true
  })

  const filteredNoise = noise.filter((n) => {
    if (zoneFilter !== 'all' && n.zoneType !== zoneFilter) return false
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(n.wardId)) return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      if (!n.location.toLowerCase().includes(q) && !wardName(n.wardId).toLowerCase().includes(q)) return false
    }
    return true
  })

  /**
   * Air and noise figures for the scope in view, not for the corporation.
   *
   * These read the full station and reading registers before, so narrowing to a
   * ward filtered the station table and the noise table while the mean AQI, the
   * best/worst station, the category mix and the exceedance count above them
   * went on describing the whole city. Air quality is the figure an operator is
   * most likely to read off a ward screen and quote, which makes it the worst
   * one to leave city-wide under a ward heading.
   */
  const avgAqi =
    filteredStations.length > 0
      ? Math.round(filteredStations.reduce((s, x) => s + x.aqi, 0) / filteredStations.length)
      : 0
  const worst = [...filteredStations].sort((a, b) => b.aqi - a.aqi)[0]
  const best = [...filteredStations].sort((a, b) => a.aqi - b.aqi)[0]
  const moderateOrWorse = filteredStations.filter((s) => s.category !== 'good' && s.category !== 'satisfactory').length

  const categoryCounts = AQI_CATEGORIES.map((c) => ({
    category: c,
    count: filteredStations.filter((s) => s.category === c).length,
  })).filter((c) => c.count > 0)

  const noiseByZone = ZONE_TYPES.map((zt) => {
    const rows = filteredNoise.filter((n) => n.zoneType === zt)
    const exceeding = rows.filter((n) => n.exceedance).length
    return { label: ZONE_LABEL[zt], compliant: rows.length - exceeding, exceeding, total: rows.length }
  })
  const totalExceeding = filteredNoise.filter((n) => n.exceedance).length

  const latestObserved = stations.reduce((max, s) => (s.observedAt > max ? s.observedAt : max), stations[0]?.observedAt ?? DEMO_NOW.toISOString())
  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: latestObserved,
    refreshIntervalMinutes: 60,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const aqiColumns: Array<Column<AirQualityStation>> = [
    { id: 'name', header: t('Station'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'aqi', header: 'AQI', cell: (r) => <span className="numeric font-semibold text-ink-900">{r.aqi}</span>, sortValue: (r) => r.aqi },
    { id: 'category', header: t('Category'), cell: (r) => <Badge tone={AQI_CATEGORY_TONE[r.category]}>{AQI_CATEGORY_LABEL[r.category]}</Badge>, sortValue: (r) => r.aqi },
    { id: 'pm25', header: t('PM2.5'), cell: (r) => `${r.pm25} µg/m³`, sortValue: (r) => r.pm25, align: 'right', hideBelow: 'lg' },
    { id: 'pm10', header: 'PM10', cell: (r) => `${r.pm10} µg/m³`, sortValue: (r) => r.pm10, align: 'right', hideBelow: 'lg' },
    { id: 'no2', header: t('NO₂'), cell: (r) => `${r.no2} µg/m³`, sortValue: (r) => r.no2, align: 'right', hideBelow: 'xl' },
    { id: 'trend', header: t('Trend'), cell: (r) => <TrendBadge trend={trendFor(r.trend)} showLabel={false} />, sortValue: (r) => r.trend },
  ]

  const noiseColumns: Array<Column<NoiseReading>> = [
    { id: 'location', header: t('Location'), cell: (r) => <span className="font-medium text-ink-900">{r.location}</span>, sortValue: (r) => r.location, searchValue: (r) => r.location },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'zone', header: t('Zone type'), cell: (r) => <Badge tone="neutral">{ZONE_LABEL[r.zoneType]}</Badge>, sortValue: (r) => r.zoneType },
    {
      id: 'day',
      header: t('Day (dB vs limit)'),
      cell: (r) => (
        <span className={r.dayDb > r.dayLimitDb ? 'font-semibold text-crit-600' : 'text-ink-700'}>
          {r.dayDb} <span className="text-ink-400">/ {r.dayLimitDb}</span>
        </span>
      ),
      sortValue: (r) => r.dayDb - r.dayLimitDb,
      align: 'right',
    },
    {
      id: 'night',
      header: t('Night (dB vs limit)'),
      cell: (r) => (
        <span className={r.nightDb > r.nightLimitDb ? 'font-semibold text-crit-600' : 'text-ink-700'}>
          {r.nightDb} <span className="text-ink-400">/ {r.nightLimitDb}</span>
        </span>
      ),
      sortValue: (r) => r.nightDb - r.nightLimitDb,
      align: 'right',
    },
    {
      id: 'exceedance',
      header: t('Status'),
      cell: (r) => (r.exceedance ? <Badge tone="critical">{t('Exceeds limit')}</Badge> : <Badge tone="positive">{t('Within limits')}</Badge>),
      sortValue: (r) => (r.exceedance ? 1 : 0),
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        title={t('Environment Intelligence')}
        description={t('Air quality and ambient noise across every ward, read against the standards each zone type is held to.')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Environment Intelligence') }]}
        freshness={freshness}
      />

      <Card tone="info" className="flex items-start gap-3">
        <CloudDrizzle className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-govt-800">{t('Current readings are seasonal, not structural')}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {t('These figures are drawn during the monsoon season, when rainfall washout materially suppresses particulate levels city-wide. The current AQI position should be read as a seasonal snapshot rather than the city&apos;s structural, year-round air-quality position - the same monitoring network typically reads materially higher in the dry winter months.')}
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_20rem]">
        <MetricGrid columns={4}>
          <MetricCard label={t('City average AQI')} value={avgAqi} icon={<Wind className="h-4 w-4" />} origin="demonstration" />
          <MetricCard label={t('Best reading')} value={best?.aqi ?? '-'} support={best ? wardName(best.wardId) : undefined} tone="positive" />
          <MetricCard label={t('Worst reading')} value={worst?.aqi ?? '-'} support={worst ? wardName(worst.wardId) : undefined} tone={worst && worst.category !== 'good' && worst.category !== 'satisfactory' ? 'warn' : 'default'} />
          <MetricCard label={t('Stations, moderate or worse')} value={moderateOrWorse} support={t('of {0} stations', stations.length)} tone={moderateOrWorse > 0 ? 'warn' : 'default'} />
        </MetricGrid>
        <Card className="flex flex-col">
          <p className="label-institutional mb-2">{t('Category distribution')}</p>
          <div style={{ height: 160 }}>
            <DonutChart
              data={categoryCounts.map((c) => ({ label: AQI_CATEGORY_LABEL[c.category], value: c.count, colour: AQI_CATEGORY_COLOUR[c.category] }))}
              centreValue={String(stations.length)}
              centreLabel="stations"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {categoryCounts.map((c) => (
              <span key={c.category} className="inline-flex items-center gap-1.5 text-[0.6875rem] text-ink-500">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AQI_CATEGORY_COLOUR[c.category] }} aria-hidden />
                {AQI_CATEGORY_LABEL[c.category]} <span className="font-semibold text-ink-700">{c.count}</span>
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card flush>
        <CardHeader className="px-4 pt-4 pb-3" title={t('Monitoring station register')} description={t('Sortable; filter by ward using the controls below.')} />
        <div className="px-4 pb-3">
          <FilterBar show={['ward', 'search']} searchPlaceholder="Search station or ward" compact />
        </div>
        {filteredStations.length === 0 ? (
          <EmptyState className="m-4" title={t('No stations match the current filters')} detail="Adjust the ward or search term above." />
        ) : (
          <DataTable rows={filteredStations} columns={aqiColumns} rowKey={(r) => r.id} pageSize={12} searchable={false} initialSort={{ columnId: 'aqi', direction: 'desc' }} ariaLabel="Air quality monitoring stations" />
        )}
      </Card>

      <Card>
        <CardHeader title={t('AQI by ward')} description={t('Ward shading reflects the reading from the station within that ward.')} />
        <div className="mt-3">
          <CityMap
            layers={[
              {
                id: 'aqi',
                label: t('Air Quality Index'),
                valueFor: (wardId) => {
                  const s = stations.find((st) => st.wardId === wardId)
                  if (!s) return undefined
                  return Math.min(100, Math.round((s.aqi / 200) * 100))
                },
                higherIsWorse: true,
                unit: ' AQI (scaled; 200 = 100)',
                description: t('Reporting station AQI for the ward, scaled 0–100 against the moderate-category upper bound for visual contrast.'),
              },
            ]}
            height={380}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <ChartFrame title={t('AQI distribution')} unit={t('Number of stations')} timeframe="Current reporting period" description={t('Stations grouped by air-quality category.')}>
            <CategoryBarChart
              data={categoryCounts.map((c) => ({ label: AQI_CATEGORY_LABEL[c.category], count: c.count }))}
              series={[{ key: 'count', label: t('Stations'), colour: CHART_COLOURS.primary }]}
              categoryKey="label"
            />
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title={t('Noise exceedance by zone type')} unit={t('Number of readings')} timeframe="Current reporting period" footnote={t('{0} of {1} readings city-wide currently exceed their day or night limit.', totalExceeding, noise.length)}>
            <CategoryBarChart
              data={noiseByZone}
              series={[
                { key: 'compliant', label: t('Within limits'), colour: CHART_COLOURS.positive, stackId: 'zone' },
                { key: 'exceeding', label: t('Exceeding limits'), colour: CHART_COLOURS.critical, stackId: 'zone' },
              ]}
              categoryKey="label"
              showLegend
            />
          </ChartFrame>
        </Card>
      </div>

      <Card flush>
        <CardHeader className="px-4 pt-4 pb-3" icon={<Volume2 className="h-4 w-4" />} title={t('Noise readings by zone type')} description={t('Measured against day and night limits for silence, residential, commercial and industrial zones.')} />
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          <FilterBar show={['ward', 'search']} searchPlaceholder="Search location or ward" compact />
          <div className="flex items-center gap-1.5">
            <Label className="mb-0 whitespace-nowrap">{t('Zone type')}</Label>
            <Select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value as 'all' | NoiseReading['zoneType'])}
              className="w-auto min-w-[9.5rem]"
              options={[{ value: 'all', label: t('All zone types') }, ...ZONE_TYPES.map((z) => ({ value: z, label: ZONE_LABEL[z] }))]}
              aria-label={t('Filter by zone type')}
            />
          </div>
        </div>
        <MetricGrid columns={4} className="px-4 pb-3">
          {noiseByZone.map((z) => (
            <MetricCard key={z.label} label={z.label} value={`${formatNumber((z.exceeding / Math.max(1, z.total)) * 100, 0)}%`} support={t('{0} of {1} readings exceed limit', z.exceeding, z.total)} tone={z.exceeding > 0 ? 'warn' : 'default'} size="sm" />
          ))}
        </MetricGrid>
        {filteredNoise.length === 0 ? (
          <EmptyState className="m-4" title={t('No readings match the current filters')} detail="Adjust the zone type, ward or search term above." />
        ) : (
          <DataTable rows={filteredNoise} columns={noiseColumns} rowKey={(r) => r.id} pageSize={12} searchable={false} initialSort={{ columnId: 'exceedance', direction: 'desc' }} ariaLabel="Noise readings" />
        )}
      </Card>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default EnvironmentIntelligencePage
