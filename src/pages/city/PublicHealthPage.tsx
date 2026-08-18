import { useState } from 'react'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  ConfidenceBadge,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  MetricGrid,
  SeverityBadge,
  toneForScore,
  type Column,
} from '@/components/ui'
import { TrendBadge } from '@/components/ui/badges'
import { MetricCard } from '@/components/cards'
import { AlertCard } from '@/components/cards/domain-cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { ChartFrame, HeatmapMatrix, RankedBarChart, CompositionBar } from '@/components/charts'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { healthService } from '@/services/health.service'
import { alertService } from '@/services/alert.service'
import { useDrawerStore } from '@/stores/ui.store'
import { useActiveCorporation } from '@/stores/corporation.store'
import { cityName } from '@/config/corporations'
import { usePageMasthead } from '@/stores/masthead.store'
import { ROUTES } from '@/config/navigation'
import { WARDS, wardName, wardShortName } from '@/data/reference'
import { DISEASE_LABEL, type DiseaseIndicator, type HealthIndicator } from '@/types/city-domains'
import type { Trend } from '@/types/common'
import { formatCompact, formatDelta, formatPercent } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Public health module.
 *
 * CRITICAL CONSTRAINT - enforced in both the interface and the data model:
 * only aggregate, ward-level disease indicators exist anywhere in this
 * platform. `HealthIndicator` (see `src/types/city-domains.ts`) carries a
 * ward, a disease and a period count - nothing resembling a patient record,
 * a name, or any individually identifying attribute is modelled, requested
 * or rendered on this screen or anywhere else in the codebase.
 */

const DISEASES: DiseaseIndicator[] = [
  'dengue',
  'malaria',
  'leptospirosis',
  'gastroenteritis',
  'hepatitis',
  'respiratory',
  'chikungunya',
]
const VECTOR_BORNE: DiseaseIndicator[] = ['dengue', 'malaria', 'chikungunya']
function build$DISEASE_SHORT_LABEL(): Record<DiseaseIndicator, string> {
  return {
  dengue: t('Dengue'),
  malaria: t('Malaria'),
  leptospirosis: t('Lepto.'),
  gastroenteritis: t('Gastro.'),
  hepatitis: t('Hepat.'),
  respiratory: t('Respir.'),
  chikungunya: t('Chikun.'),
}
}
let DISEASE_SHORT_LABEL: Record<DiseaseIndicator, string> = build$DISEASE_SHORT_LABEL()
registerLayer(() => {
  DISEASE_SHORT_LABEL = build$DISEASE_SHORT_LABEL()
})

interface DiseaseSummaryRow {
  disease: DiseaseIndicator
  cases: number
  casesPrev: number
  changePct: number
  trend: Trend
  avgSignal: number
  wardsElevated: number
}

function aggregateByDisease(indicators: HealthIndicator[]): DiseaseSummaryRow[] {
  return DISEASES.map((disease) => {
    const rows = indicators.filter((h) => h.disease === disease)
    const cases = rows.reduce((s, h) => s + h.casesReported, 0)
    const casesPrev = rows.reduce((s, h) => s + h.casesPrevPeriod, 0)
    const changePct = casesPrev > 0 ? Math.round(((cases - casesPrev) / casesPrev) * 1000) / 10 : 0
    const avgSignal = rows.length > 0 ? Math.round(rows.reduce((s, h) => s + h.outbreakSignal, 0) / rows.length) : 0
    const wardsElevated = rows.filter((h) => h.outbreakSignal >= 50).length
    return {
      disease,
      cases,
      casesPrev,
      changePct,
      trend: {
        direction: changePct > 6 ? 'up' : changePct < -6 ? 'down' : 'flat',
        changePct,
        polarity: 'negative',
        comparisonLabel: 'vs previous period',
      },
      avgSignal,
      wardsElevated,
    }
  })
}

export function PublicHealthPage(): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)
  const corporation = useActiveCorporation()
  const [focusedId, setFocusedId] = useState<string | null>(null)

  usePageMasthead(t('{0} Public Health Intelligence', cityName(corporation)))

  const indicatorsQuery = useServiceQuery(queryKeys.health('indicators'), (u) => healthService.indicators(u))
  const outbreakQuery = useServiceQuery(queryKeys.health('outbreak-signals'), (u) => healthService.outbreakSignals(u))
  const hospitalsQuery = useServiceQuery(queryKeys.health('hospitals'), (u) => healthService.hospitals(u))
  const alertsQuery = useServiceQuery(queryKeys.alerts({ domain: 'health' }), (u) =>
    alertService.list(u, { domain: 'health', pageSize: 30 }),
  )

  const criticalNotice = (
    <Card tone="info" className="flex items-start gap-3">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-semibold text-govt-800">{t('Aggregate, ward-level data only')}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-600">
          {t('This module models and displays only aggregate disease indicators, reported by ward and period. No patient-level information of any kind - no names, no individual case records, no personally identifying detail - is modelled, stored or displayed anywhere on this platform. Every count below is an aggregate across a ward and a reporting period.')}
        </p>
      </div>
    </Card>
  )

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Public Health') }]}
      />

      {/* --- Primary care network headline counts ------------------------ */}
      {hospitalsQuery.data ? (
        (() => {
          const hospitals = hospitalsQuery.data
          const dispensaries = hospitals.filter((h) => h.type === 'dispensary').length
          const maternityHomes = hospitals.filter((h) => h.type === 'maternity').length
          return (
            <MetricGrid columns={3}>
              <MetricCard
                label={t('Health posts')}
                value={corporation.healthPostsCount ?? 0}
                background="red"
                footer={<span className="text-[0.625rem] leading-snug text-ink-400">{t("BMC's Public Health Department reports 212 health posts citywide (Aug 2025) — shown here as published, not modelled.")}</span>}
              />
              <MetricCard
                label={t('Dispensaries')}
                value={dispensaries}
                background="amber"
                footer={<span className="text-[0.625rem] leading-snug text-ink-400">{t("BMC's Public Health Department reports 192 dispensaries citywide (Aug 2025); this register is anchored to that count.")}</span>}
              />
              <MetricCard
                label={t('Maternity homes')}
                value={maternityHomes}
                background="green"
                footer={<span className="text-[0.625rem] leading-snug text-ink-400">{t("BMC's Public Health Department reports 30 maternity homes citywide (Aug 2025); this register is anchored to that count.")}</span>}
              />
            </MetricGrid>
          )
        })()
      ) : null}

      {/* Two columns, read downward. The surveillance record — the condition
          summary, the ward-by-condition matrix, the ranked signals and the
          alerts raised against them — carries the width. The standing caveat,
          the seasonal framing, the recorded correlates and the capacity
          position that receives the cases read beside it. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">

      {/* --- Disease indicator summary ---------------------------------- */}
      {indicatorsQuery.isLoading ? (
        <LoadingState variant="table" rows={7} />
      ) : indicatorsQuery.error ? (
        <ErrorState detail={indicatorsQuery.error.message} onRetry={() => indicatorsQuery.refetch()} />
      ) : (
        (() => {
          const indicators = indicatorsQuery.data ?? []
          if (indicators.length === 0) {
            return <EmptyState title={t('No health indicators available')} detail="No aggregate indicators were returned for the current scope." />
          }
          const summary = aggregateByDisease(indicators)

          const columns: Array<Column<DiseaseSummaryRow>> = [
            { id: 'disease', header: t('Condition'), cell: (r) => <span className="font-medium text-ink-900">{DISEASE_LABEL[r.disease]}</span>, sortValue: (r) => DISEASE_LABEL[r.disease] },
            { id: 'cases', header: t('Cases this period'), cell: (r) => formatCompact(r.cases), sortValue: (r) => r.cases, align: 'right' },
            { id: 'casesPrev', header: t('Cases previous period'), cell: (r) => formatCompact(r.casesPrev), sortValue: (r) => r.casesPrev, align: 'right', hideBelow: 'md' },
            { id: 'change', header: t('Change'), cell: (r) => <span className={r.changePct > 0 ? 'font-semibold text-crit-600' : 'font-semibold text-ok-700'}>{formatDelta(r.changePct)}</span>, sortValue: (r) => r.changePct, align: 'right' },
            { id: 'trend', header: t('Trend'), cell: (r) => <TrendBadge trend={r.trend} showLabel={false} />, sortValue: (r) => r.changePct },
            {
              id: 'signal',
              header: t('Outbreak signal (avg)'),
              cell: (r) => <Badge tone={toneForScore(r.avgSignal, false)}>{r.avgSignal} / 100</Badge>,
              sortValue: (r) => r.avgSignal,
            },
            { id: 'elevated', header: t('Wards elevated'), cell: (r) => r.wardsElevated, sortValue: (r) => r.wardsElevated, align: 'right', hideBelow: 'lg' },
          ]

          return (
            <GovPanel title={t('Disease indicator summary')} tone="amber" dense>
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('Aggregate reported cases by condition, current reporting period vs previous, across all wards.')}
              </p>
              <DataTable rows={summary} columns={columns} rowKey={(r) => r.disease} searchable={false} dense ariaLabel="Disease indicator summary" />
            </GovPanel>
          )
        })()
      )}

      {/* --- Ward × disease heatmap -------------------------------------- */}
      {indicatorsQuery.data && indicatorsQuery.data.length > 0 ? (
        (() => {
          const indicators = indicatorsQuery.data
          const heatValues: Record<string, Record<string, number>> = {}
          for (const h of indicators) {
            heatValues[h.wardId] ??= {}
            heatValues[h.wardId]![h.disease] = h.outbreakSignal
          }
          const focused = indicators.find((h) => h.id === focusedId) ?? outbreakQuery.data?.[0] ?? null

          return (
            <GovPanel title={t('Ward × disease outbreak signal')} tone="red">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                {t('Click a cell to inspect a specific ward and condition. Colour reflects the modelled 0–100 outbreak signal, not a confirmed outbreak.')}
              </p>
              <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="min-w-0" style={{ height: 460 }}>
                  <HeatmapMatrix
                    rows={WARDS.map((w) => ({ id: w.id, label: w.code }))}
                    columns={DISEASES.map((d) => ({ id: d, label: DISEASE_SHORT_LABEL[d] }))}
                    values={heatValues}
                    higherIsBetter={false}
                    onCellClick={(wardId, disease) => {
                      const match = indicators.find((h) => h.wardId === wardId && h.disease === disease)
                      if (match) setFocusedId(match.id)
                    }}
                  />
                </div>
                <div className="min-w-0 rounded-lg border border-ink-100 bg-surface-sunken p-3">
                  {focused ? (
                    <>
                      <p className="label-institutional">{t('Focused indicator')}</p>
                      <p className="mt-1 text-sm font-semibold text-ink-900">
                        {wardName(focused.wardId)} · {DISEASE_LABEL[focused.disease]}
                      </p>
                      <p className="mt-0.5 text-[0.6875rem] text-ink-400">{focused.periodLabel}</p>
                      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div>
                          <span className="text-ink-400">{t('Cases this period')}</span>
                          <p className="numeric font-semibold text-ink-800">{focused.casesReported}</p>
                        </div>
                        <div>
                          <span className="text-ink-400">{t('Previous period')}</span>
                          <p className="numeric font-semibold text-ink-800">{focused.casesPrevPeriod}</p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <SeverityBadge severity={focused.severity} />
                        <ConfidenceBadge confidence={focused.confidence} />
                        <Badge tone={toneForScore(focused.outbreakSignal, false)}>{t('Signal {0}', focused.outbreakSignal)}</Badge>
                      </div>
                      {focused.correlates.length > 0 ? (
                        <div className="mt-3 border-t border-ink-100 pt-2.5">
                          <p className="label-institutional">{t('Correlates observed in this ward')}</p>
                          <ul className="mt-1.5 space-y-1">
                            {focused.correlates.map((c) => (
                              <li key={c} className="text-[0.6875rem] leading-relaxed text-ink-600">
                                · {c}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-[0.625rem] leading-relaxed text-warn-700">
                            {t('Correlation does not establish causation. These are observed co-occurrences, not a determination of cause.')}
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <EmptyState compact title={t('No cell focused')} detail="Click a cell in the heatmap to inspect a ward and condition." />
                  )}
                </div>
              </div>
            </GovPanel>
          )
        })()
      ) : null}

      {/* --- Outbreak signal ranking -------------------------------------- */}
      {outbreakQuery.isLoading ? (
        <LoadingState variant="chart" />
      ) : outbreakQuery.error ? (
        <ErrorState detail={outbreakQuery.error.message} onRetry={() => outbreakQuery.refetch()} />
      ) : (
        (() => {
          const signals = outbreakQuery.data ?? []
          if (signals.length === 0) {
            return (
              <GovPanel title={t('Outbreak signal ranking')} tone="amber">
                <EmptyState compact title={t('No elevated signals')} detail="No ward × condition combination currently reaches the 50/100 outbreak signal threshold." />
              </GovPanel>
            )
          }
          const columns: Array<Column<HealthIndicator>> = [
            { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId) },
            { id: 'disease', header: t('Condition'), cell: (r) => DISEASE_LABEL[r.disease], sortValue: (r) => DISEASE_LABEL[r.disease] },
            { id: 'cases', header: t('Cases'), cell: (r) => r.casesReported, sortValue: (r) => r.casesReported, align: 'right' },
            { id: 'change', header: t('Change'), cell: (r) => formatDelta(r.changePct), sortValue: (r) => r.changePct, align: 'right', hideBelow: 'md' },
            { id: 'signal', header: t('Signal'), cell: (r) => <Badge tone={toneForScore(r.outbreakSignal, false)}>{r.outbreakSignal}</Badge>, sortValue: (r) => r.outbreakSignal },
            { id: 'confidence', header: t('Confidence'), cell: (r) => <ConfidenceBadge confidence={r.confidence} />, sortValue: (r) => r.confidence, hideBelow: 'lg' },
            { id: 'severity', header: t('Severity'), cell: (r) => <SeverityBadge severity={r.severity} />, sortValue: (r) => r.severity },
          ]
          return (
            <GovPanel title={t('Outbreak signal ranking')} tone="amber" dense>
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('Every ward × condition combination at or above a 50/100 modelled outbreak signal, ranked by strength. This is a modelled signal for prioritising field verification, not a confirmed outbreak declaration.')}
              </p>
              <div className="px-3 pt-2" style={{ height: 260 }}>
                <ChartFrame title={t('Top signals')} unit={t('0–100 index')} timeframe="Current reporting period" height={230}>
                  <RankedBarChart
                    data={signals.slice(0, 12).map((h) => ({ label: `${wardShortName(h.wardId)} · ${DISEASE_SHORT_LABEL[h.disease]}`, value: h.outbreakSignal }))}
                  />
                </ChartFrame>
              </div>
              <div className="mt-2">
                <DataTable
                  rows={signals}
                  columns={columns}
                  rowKey={(r) => r.id}
                  onRowClick={(r) => setFocusedId(r.id)}
                  activeRowKey={focusedId ?? undefined}
                  pageSize={10}
                  searchPlaceholder="Search ward or condition"
                  ariaLabel="Outbreak signal ranking"
                />
              </div>
            </GovPanel>
          )
        })()
      )}

      {/* --- Health alerts ---------------------------------------------------- */}
      {alertsQuery.isLoading ? (
        <LoadingState variant="block" rows={3} />
      ) : alertsQuery.error ? (
        <ErrorState detail={alertsQuery.error.message} onRetry={() => alertsQuery.refetch()} />
      ) : (
        (() => {
          const alerts = alertsQuery.data?.items ?? []
          return (
            <GovPanel title={t('Health alerts')} tone="green" dense>
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                {t('Open operational alerts raised against the public health domain.')}
              </p>
              {alerts.length === 0 ? (
                <EmptyState compact className="mx-3 mb-3" title={t('No open health alerts')} detail="No alert is currently open against the public health domain." />
              ) : (
                <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {alerts.map((alert) => (
                    <AlertCard key={alert.id} alert={alert} onClick={() => openDrawer({ kind: 'alert', id: alert.id })} />
                  ))}
                </div>
              )}
            </GovPanel>
          )
        })()
      )}

        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          {criticalNotice}

      {/* --- Hospital utilisation summary ----------------------------------- */}
      {hospitalsQuery.isLoading ? (
        <LoadingState variant="metrics" />
      ) : hospitalsQuery.error ? (
        <ErrorState detail={hospitalsQuery.error.message} onRetry={() => hospitalsQuery.refetch()} />
      ) : (
        (() => {
          const hospitals = hospitalsQuery.data ?? []
          const totalBeds = hospitals.reduce((s, h) => s + h.bedsTotal, 0)
          const occupiedBeds = hospitals.reduce((s, h) => s + h.bedsOccupied, 0)
          const occupancyPct = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 1000) / 10 : 0
          const icuTotal = hospitals.reduce((s, h) => s + h.icuTotal, 0)
          const icuOccupied = hospitals.reduce((s, h) => s + h.icuOccupied, 0)
          const icuOccupancyPct = icuTotal > 0 ? Math.round((icuOccupied / icuTotal) * 1000) / 10 : 0
          const highLoad = hospitals.filter((h) => h.emergencyLoadIndex >= 80).length
          const isBmc = corporation.id === 'bmc'

          return (
            <GovPanel
              title={t('Hospital utilisation summary')}
              tone="amber"
              actions={<LinkButton to={ROUTES.hospitals} size="xs" variant="outline">{t('Open Hospital Intelligence')}</LinkButton>}
            >
              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                {t('City-wide capacity position across major, peripheral, maternity and dispensary facilities.')}
              </p>
              <MetricGrid columns={2}>
                <MetricCard
                  label={t('Functional beds')}
                  value={formatCompact(totalBeds)}
                  support={`${hospitals.length} facilities`}
                  footer={
                    isBmc && corporation.majorHospitalsCount ? (
                      <span className="text-[0.625rem] leading-snug text-ink-400">
                        {t('For context: BMC\'s own network runs {0} specialised major hospitals, {1} health posts, {2} dispensaries and {3} maternity homes.', corporation.majorHospitalsCount, corporation.healthPostsCount ?? '-', corporation.dispensariesCount ?? '-', corporation.maternityHomesCount ?? '-')}
                      </span>
                    ) : undefined
                  }
                />
                <MetricCard label={t('Bed occupancy')} value={formatPercent(occupancyPct)} tone={occupancyPct >= 90 ? 'critical' : occupancyPct >= 78 ? 'warn' : 'default'} />
                <MetricCard label={t('ICU occupancy')} value={formatPercent(icuOccupancyPct)} support={t('{0} of {1} beds', icuOccupied, icuTotal)} tone={icuOccupancyPct >= 92 ? 'critical' : icuOccupancyPct >= 80 ? 'warn' : 'default'} />
                <MetricCard label={t('Facilities at high emergency load')} value={highLoad} support={t('Emergency load index ≥ 80')} tone={highLoad > 0 ? 'warn' : 'default'} />
              </MetricGrid>
            </GovPanel>
          )
        })()
      )}


      {/* --- Vector-borne risk framed to monsoon season -------------------- */}
      {indicatorsQuery.data && indicatorsQuery.data.length > 0 ? (
        (() => {
          const indicators = indicatorsQuery.data
          const vectorRows = indicators.filter((h) => VECTOR_BORNE.includes(h.disease))
          const nonVectorRows = indicators.filter((h) => !VECTOR_BORNE.includes(h.disease))
          const vectorCases = vectorRows.reduce((s, h) => s + h.casesReported, 0)
          const nonVectorCases = nonVectorRows.reduce((s, h) => s + h.casesReported, 0)
          const vectorAvgSignal = vectorRows.length > 0 ? Math.round(vectorRows.reduce((s, h) => s + h.outbreakSignal, 0) / vectorRows.length) : 0
          const floodProneWardIds = new Set(WARDS.filter((w) => w.floodProne).map((w) => w.id))
          const floodProneElevated = new Set(
            vectorRows.filter((h) => h.outbreakSignal >= 50 && floodProneWardIds.has(h.wardId)).map((h) => h.wardId),
          ).size

          return (
            <GovPanel title={t('Vector-borne risk - monsoon season framing')} tone="red">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                {t('Dengue, malaria and chikungunya are mosquito-borne conditions whose breeding conditions are seasonally associated with standing water during the monsoon. This is a seasonal association, not a forecast of any individual outbreak.')}
              </p>
              <div className="grid grid-cols-1 gap-4">
                <MetricGrid columns={2}>
                  <MetricCard label={t('Vector-borne cases, this period')} value={formatCompact(vectorCases)} support={t('Dengue + malaria + chikungunya')} origin="demonstration" />
                  <MetricCard label={t('Average outbreak signal')} value={vectorAvgSignal} unit="/100" tone={vectorAvgSignal >= 50 ? 'warn' : 'default'} support={t('Across vector-borne conditions')} />
                  <MetricCard
                    label={t('Flood-prone wards, elevated signal')}
                    value={floodProneElevated}
                    support={t('Observed association - not a causal claim')}
                    tone={floodProneElevated > 0 ? 'warn' : 'default'}
                  />
                </MetricGrid>
                <div>
                  <p className="label-institutional mb-2">{t('Case share this period')}</p>
                  <CompositionBar
                    segments={[
                      { id: 'vector', label: t('Vector-borne (dengue, malaria, chikungunya)'), value: vectorCases, colour: 'var(--color-warn-500)' },
                      { id: 'other', label: t('Other conditions'), value: nonVectorCases, colour: 'var(--color-govt-400)' },
                    ]}
                  />
                </div>
              </div>
              <p className="mt-3 border-t border-ink-100 pt-2.5 text-[0.6875rem] leading-relaxed text-ink-400">
                {t('Wards flagged here are flood-prone wards that also carry an elevated vector-borne outbreak signal in the same period. The co-occurrence is presented as an observed association to inform vector-control prioritisation during the monsoon season; it is not a determination that flooding caused any specific case.')}
              </p>
            </GovPanel>
          )
        })()
      ) : null}

      {/* --- Sanitation and environmental correlates ----------------------- */}
      {indicatorsQuery.data && indicatorsQuery.data.length > 0 ? (
        (() => {
          const significant = indicatorsQuery.data.filter((h) => h.outbreakSignal >= 50 && h.correlates.length > 0)
          const counts = new Map<string, number>()
          for (const h of significant) {
            for (const c of h.correlates) counts.set(c, (counts.get(c) ?? 0) + 1)
          }
          const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])

          return (
            <GovPanel title={t('Sanitation and environmental correlates')} tone="amber">
              <p className="mb-2 text-xs leading-relaxed text-ink-500">
                {t('Conditions observed alongside elevated outbreak signals in the same ward and period.')}
              </p>
              <div className="flex items-start gap-2 rounded-md border border-warn-200 bg-warn-50/70 px-3 py-2">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warn-700" aria-hidden />
                <p className="text-xs leading-relaxed text-warn-700">
                  <span className="font-semibold">{t('Correlation does not establish causation.')}</span>{' '}{t('The observations below are co-occurrences recorded in the same ward and reporting period as an elevated outbreak signal. They are presented to inform field verification and are not a determination of cause.')}
                </p>
              </div>
              {rows.length === 0 ? (
                <EmptyState compact className="mt-3" title={t('No correlates recorded')} detail="No elevated signal in the current period carries a recorded correlate." />
              ) : (
                <ul className="mt-3 divide-y divide-ink-50">
                  {rows.map(([correlate, count]) => (
                    <li key={correlate} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-xs leading-relaxed text-ink-700">{correlate}</span>
                      <Badge tone="muted">{t('{0} ward × condition record{1}', count, count === 1 ? '' : 's')}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </GovPanel>
          )
        })()
      ) : null}

        </div>
      </div>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default PublicHealthPage
