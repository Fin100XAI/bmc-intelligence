import { useMemo } from 'react'
import { BadgeCheck, Clock3, FileText, Landmark } from 'lucide-react'
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
import { registrationService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { activeCorporation } from '@/config/municipality.config'
import { wardName, wardShortName } from '@/data/reference'
import type { RegistrationCentre } from '@/types/civic-services'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/city/CitizenRegistrationPage.tsx
 *
 * Registration of births and deaths.
 *
 * This is the highest-volume counter service a corporation runs and the one
 * where delay is felt hardest: a birth certificate that takes three weeks holds
 * up a school admission, and a death certificate that takes three weeks holds
 * up a pension claim or an insurance settlement at the worst possible moment
 * for the family waiting on it. Registration is a statutory duty under the
 * Twelfth Schedule, and the twenty-one day statutory period is the standard
 * this page measures against.
 *
 * THE REGISTER ITSELF IS NOT HERE. What this page holds is the ADMINISTRATION
 * of the register - volumes, compliance with the statutory period, issue times
 * and backlog. No registered event, no name, no date of birth and no
 * certificate content appears anywhere behind it. Vital records are the
 * Registrar's statutory register and stay in the Registrar's custody; a
 * management platform reports on how well it is being kept, and never
 * reproduces it.
 */

const STATUTORY_PERIOD_DAYS = 21

export function CitizenRegistrationPage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)

  usePageMasthead(t('Births & Deaths Registration'))

  const centresQuery = useServiceQuery(queryKeys.registration('centres'), (u) => registrationService.centres(u))
  const trendQuery = useServiceQuery(queryKeys.registration('trend'), (u) => registrationService.trend(u))

  const centres = useMemo(() => centresQuery.data ?? [], [centresQuery.data])
  const trend = useMemo(() => trendQuery.data ?? [], [trendQuery.data])

  const filtered = useMemo(
    () =>
      centres.filter((c) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(c.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!c.name.toLowerCase().includes(q) && !wardName(c.wardId).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [centres, filters],
  )

  if (centresQuery.isLoading || trendQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Births & Deaths Registration') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (centresQuery.error || trendQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Births & Deaths Registration') }]} />
        <ErrorState
          detail={(centresQuery.error ?? trendQuery.error)?.message}
          onRetry={() => { void centresQuery.refetch(); void trendQuery.refetch() }}
        />
      </PageBody>
    )
  }

  const births = filtered.reduce((s, c) => s + c.birthsRegistered30d, 0)
  const deaths = filtered.reduce((s, c) => s + c.deathsRegistered30d, 0)
  const certificates = filtered.reduce((s, c) => s + c.certificatesIssued30d, 0)
  const backlog = filtered.reduce((s, c) => s + c.backlog, 0)
  const late = filtered.reduce((s, c) => s + c.lateRegistrations30d, 0)

  const withinPeriod = filtered.length
    ? Math.round((filtered.reduce((s, c) => s + c.withinStatutoryPeriodPct, 0) / filtered.length) * 10) / 10
    : 0
  const meanIssue = filtered.length
    ? Math.round((filtered.reduce((s, c) => s + c.meanIssueDays, 0) / filtered.length) * 10) / 10
    : 0
  const digitalShare = filtered.length
    ? Math.round((filtered.reduce((s, c) => s + c.digitalSharePct, 0) / filtered.length) * 10) / 10
    : 0

  const slowest = [...filtered].sort((a, b) => b.meanIssueDays - a.meanIssueDays).slice(0, 10)

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const columns: Array<Column<RegistrationCentre>> = [
    {
      id: 'name',
      header: t('Registration centre'),
      cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>,
      sortValue: (r) => r.name,
      searchValue: (r) => r.name,
      width: 'minmax(14rem,1.7fr)',
    },
    { id: 'ward', header: t('Ward'), cell: (r) => wardShortName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    {
      id: 'kind',
      header: t('Type'),
      cell: (r) => <Badge tone="neutral" size="sm">{r.kind === 'hospital-unit' ? 'Hospital Unit' : 'Ward Office'}</Badge>,
      sortValue: (r) => r.kind,
      hideBelow: 'lg',
    },
    { id: 'births', header: t('Births (30d)'), cell: (r) => <span className="numeric">{formatNumber(r.birthsRegistered30d)}</span>, sortValue: (r) => r.birthsRegistered30d, align: 'right' },
    { id: 'deaths', header: t('Deaths (30d)'), cell: (r) => <span className="numeric">{formatNumber(r.deathsRegistered30d)}</span>, sortValue: (r) => r.deathsRegistered30d, align: 'right', hideBelow: 'md' },
    {
      id: 'within',
      header: t('Within {0} days', STATUTORY_PERIOD_DAYS),
      cell: (r) => (
        <span className={r.withinStatutoryPeriodPct < 90 ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
          {r.withinStatutoryPeriodPct}%
        </span>
      ),
      sortValue: (r) => r.withinStatutoryPeriodPct,
      align: 'right',
    },
    {
      id: 'issue',
      header: t('Mean issue'),
      cell: (r) => (
        <span className={r.meanIssueDays > 7 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
          {r.meanIssueDays} d
        </span>
      ),
      sortValue: (r) => r.meanIssueDays,
      align: 'right',
      hideBelow: 'md',
    },
    { id: 'digital', header: t('Applied online'), cell: (r) => <span className="numeric">{r.digitalSharePct}%</span>, sortValue: (r) => r.digitalSharePct, align: 'right', hideBelow: 'xl' },
    {
      id: 'backlog',
      header: t('Backlog'),
      cell: (r) => <span className={r.backlog > 150 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>{formatNumber(r.backlog)}</span>,
      sortValue: (r) => r.backlog,
      align: 'right',
      hideBelow: 'lg',
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Births & Deaths Registration') }]}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search registration centres" />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Registered in 30 days')}
          value={formatNumber(births + deaths)}
          support={t('{0} births · {1} deaths', formatNumber(births), formatNumber(deaths))}
          icon={<Landmark className="h-4 w-4" />}
          origin="demonstration"
          background="red"
          footer={
            activeCorporation.id === 'bmc' && activeCorporation.annualBirthsRegistered && activeCorporation.annualDeathsRegistered ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('For context: BMC registered {0} deaths in {1} (provisional) and {2} births in {3} - the lowest annual birth count since 2015, a 23% drop on 2019. These are annual totals, not directly comparable to the rolling 30-day figure above.', formatNumber(activeCorporation.annualDeathsRegistered), activeCorporation.annualDeathsAsOfYear ?? '-', formatNumber(activeCorporation.annualBirthsRegistered), activeCorporation.annualBirthsAsOfYear ?? '-')}
              </span>
            ) : undefined
          }
        />
        <MetricCard
          label={t('Within {0}-day period', STATUTORY_PERIOD_DAYS)}
          value={withinPeriod}
          unit="%"
          support={t('{0} late registrations requiring an order', formatNumber(late))}
          tone={withinPeriod < 90 ? 'warn' : 'positive'}
          icon={<BadgeCheck className="h-4 w-4" />}
          background="amber"
        />
        <MetricCard
          label={t('Mean certificate issue')}
          value={meanIssue}
          unit=" days"
          support={t('{0} certificates issued in 30 days', formatNumber(certificates))}
          tone={meanIssue > 7 ? 'critical' : meanIssue > 4 ? 'warn' : 'positive'}
          icon={<Clock3 className="h-4 w-4" />}
          background="green"
          footer={<span className="text-[0.625rem] leading-snug text-ink-400">{t("Mirrors MCGM's birth/death certificate services — a simulated feed in this demonstration.")}</span>}
        />
        <MetricCard
          label={t('Backlog')}
          value={formatNumber(backlog)}
          support={t('Applications pending · {0}% applied online', digitalShare)}
          tone={backlog > 1000 ? 'critical' : backlog > 300 ? 'warn' : 'positive'}
        />
      </MetricGrid>

      {/* Two columns. The counter register carries the width; the standing
          caveat about custody and the ranking of where a family waits longest
          are read beside it. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <GovPanel title={t('Registration centres')} tone="amber" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Hospital registration units and ward offices within your authorised ward scope.')}
            </p>
            {filtered.length === 0 ? (
              <EmptyState className="mx-3 mb-3" title={t('No registration centres match the current filters')} detail="Clear a filter to widen the register." />
            ) : (
              <DataTable rows={filtered} columns={columns} rowKey={(r) => r.id} pageSize={12} />
            )}
          </GovPanel>

          <Card className="flex flex-col">
            <p className="label-institutional mb-2">{t('Monthly registrations and certificates issued')}</p>
            <div style={{ height: 220 }}>
              <CategoryBarChart
                data={trend as unknown as Array<Record<string, string | number>>}
                categoryKey="month"
                showLegend
                series={[
                  { key: 'births', label: t('Births'), colour: CHART_COLOURS.primary },
                  { key: 'deaths', label: t('Deaths'), colour: CHART_COLOURS.neutral },
                  { key: 'certificatesIssued', label: t('Certificates issued'), colour: CHART_COLOURS.intel },
                ]}
              />
            </div>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
              {t('Certificates exceed registrations because a single registered event is commonly certified more than once - for a school, an employer and a claim - which is why counter load is not the same as registration volume.')}
            </p>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <Card tone="info" className="flex items-start gap-3">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-govt-800">{t('The register is not held here')}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                {t('This page reports on how well the statutory register is being kept - volumes, timeliness and backlog. It does not reproduce the register. No registered event, no name, no date and no certificate content appears anywhere behind this page. Vital records remain in the Registrar&apos;s statutory custody, which is where the law places them and where they should stay.')}
              </p>
            </div>
          </Card>

          <GovPanel title={t('Slowest certificate issue')} tone="red" dense className="flex flex-col">
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Where a family waits longest for the document they came for.')}
            </p>
            <div className="px-4 pb-4" style={{ height: Math.max(210, slowest.length * 26) }}>
              <RankedBarChart data={slowest.map((c) => ({ label: c.name.slice(0, 22), value: c.meanIssueDays }))} unit=" d" />
            </div>
          </GovPanel>
        </div>
      </div>
    </PageBody>
  )
}

export default CitizenRegistrationPage
