import { useMemo } from 'react'
import { AlarmClockCheck, ClipboardList, FileCheck2, Hourglass, ScrollText } from 'lucide-react'
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
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { notifiedServicesService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { departmentName } from '@/data/reference'
import { DOMAIN_LABEL, type DataFreshness } from '@/types/common'
import { NOTIFIED_SERVICE_CHANNEL_LABEL, type NotifiedService } from '@/types/civic-services'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatNumber, formatPercent } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/council/NotifiedServicesRegisterPage.tsx
 *
 * The Notified Services Register.
 *
 * BMC's own statutory-timeline story was, until now, told one page at a
 * time - `CitizenRegistrationPage` measures births and deaths against their
 * twenty-one day period, `LicensingIntelligencePage` measures trade licences
 * against theirs - and nothing showed a reader the whole notified-service
 * estate at once, across every department that issues one. This register is
 * that single cross-department view: every statutory certificate, licence
 * and permit a corporation is obliged to decide within a published
 * timeline, on the pattern set by Maharashtra's Right to Public Services
 * Act, 2015 and the individual Acts and Rules that notify each service.
 *
 * DELIBERATELY NOT THE SAME FIGURE AS COMPLAINT SLA. `ServiceHealth`
 * elsewhere on the platform measures how fast a grievance already lodged
 * against the corporation is resolved. A notified service is not a
 * grievance - it is a duty the corporation owes every applicant from the
 * day the application is filed, whether or not anything has gone wrong. The
 * two are read side by side on the Executive Overview for exactly this
 * reason: neither substitutes for the other.
 *
 * NO APPLICANT APPEARS HERE. The unit of record is the SERVICE, aggregated
 * city-wide. No application reference, no applicant name and no certificate
 * content is held anywhere behind this page.
 */

const BELOW_COMPLIANCE_THRESHOLD = 80

export function NotifiedServicesRegisterPage(): React.JSX.Element {
  usePageMasthead(t('Notified Services Register'))

  const filters = useFilterStore((s) => s.filters)

  const servicesQuery = useServiceQuery(queryKeys.notifiedServices(), (u) => notifiedServicesService.list(u))
  const services = useMemo(() => servicesQuery.data ?? [], [servicesQuery.data])

  const filtered = useMemo(
    () =>
      services.filter((s) => {
        if (filters.departmentIds.length > 0 && !filters.departmentIds.includes(s.departmentId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!s.name.toLowerCase().includes(q) && !departmentName(s.departmentId).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [services, filters],
  )

  if (servicesQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Council')} breadcrumbs={[{ label: t('Council') }, { label: t('Notified Services Register') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (servicesQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Council')} breadcrumbs={[{ label: t('Council') }, { label: t('Notified Services Register') }]} />
        <ErrorState detail={servicesQuery.error.message} onRetry={() => servicesQuery.refetch()} />
      </PageBody>
    )
  }

  const totalServices = filtered.length
  const totalApplications = filtered.reduce((s, x) => s + x.applications30d, 0)
  const totalBacklog = filtered.reduce((s, x) => s + x.backlog, 0)
  const belowThreshold = filtered.filter((x) => x.issuedWithinStatutoryPeriodPct < BELOW_COMPLIANCE_THRESHOLD).length

  // A single overall figure, weighted by application volume rather than
  // averaged flat across services - a high-volume service lagging matters
  // more to the city than a rarely-used one doing the same.
  const overallWithinPeriod = totalApplications > 0
    ? Math.round((filtered.reduce((s, x) => s + x.issuedWithinStatutoryPeriodPct * x.applications30d, 0) / totalApplications) * 10) / 10
    : 0

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const columns: Array<Column<NotifiedService>> = [
    {
      id: 'name',
      header: t('Notified service'),
      cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>,
      sortValue: (r) => r.name,
      searchValue: (r) => r.name,
      width: 'minmax(15rem,1.8fr)',
    },
    {
      id: 'department',
      header: t('Department'),
      cell: (r) => <span className="text-ink-700">{departmentName(r.departmentId)}</span>,
      sortValue: (r) => departmentName(r.departmentId),
      searchValue: (r) => departmentName(r.departmentId),
      hideBelow: 'lg',
    },
    {
      id: 'domain',
      header: t('Domain'),
      cell: (r) => <Badge tone="neutral" size="sm">{DOMAIN_LABEL[r.domain]}</Badge>,
      sortValue: (r) => DOMAIN_LABEL[r.domain],
      hideBelow: 'xl',
    },
    {
      id: 'statutoryDays',
      header: t('Statutory period'),
      cell: (r) => <span className="numeric text-ink-700">{t('{0} days', r.statutoryDays)}</span>,
      sortValue: (r) => r.statutoryDays,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'applications',
      header: t('Applications (30d)'),
      cell: (r) => <span className="numeric">{formatNumber(r.applications30d)}</span>,
      sortValue: (r) => r.applications30d,
      align: 'right',
    },
    {
      id: 'within',
      header: t('Within statutory period'),
      cell: (r) => (
        <span className={r.issuedWithinStatutoryPeriodPct < BELOW_COMPLIANCE_THRESHOLD ? 'numeric font-semibold text-crit-600' : r.issuedWithinStatutoryPeriodPct < 90 ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
          {formatPercent(r.issuedWithinStatutoryPeriodPct)}
        </span>
      ),
      sortValue: (r) => r.issuedWithinStatutoryPeriodPct,
      align: 'right',
    },
    {
      id: 'avgIssue',
      header: t('Mean issue'),
      cell: (r) => (
        <span className={r.avgIssueDays > r.statutoryDays ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
          {t('{0} d', r.avgIssueDays)}
        </span>
      ),
      sortValue: (r) => r.avgIssueDays,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'backlog',
      header: t('Backlog'),
      cell: (r) => <span className={r.backlog > r.applications30d * 0.3 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>{formatNumber(r.backlog)}</span>,
      sortValue: (r) => r.backlog,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'channel',
      header: t('Channel'),
      cell: (r) => <span className="text-ink-500">{NOTIFIED_SERVICE_CHANNEL_LABEL[r.channel]}</span>,
      sortValue: (r) => r.channel,
      hideBelow: 'xl',
    },
    {
      id: 'trend',
      header: t('Trend'),
      cell: (r) => (
        <span className={r.trendPct > 0 ? 'numeric text-google-green-700' : r.trendPct < 0 ? 'numeric text-crit-600' : 'numeric text-ink-500'}>
          {t('{0} pp', `${r.trendPct > 0 ? '+' : ''}${r.trendPct}`)}
        </span>
      ),
      sortValue: (r) => r.trendPct,
      align: 'right',
      hideBelow: 'xl',
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} /> },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Council')}
        breadcrumbs={[{ label: t('Council') }, { label: t('Notified Services Register') }]}
        freshness={freshness}
      />

      <Card tone="info" className="flex items-start gap-3">
        <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-govt-800">
            {t('A statutory delivery timeline, not a complaint SLA')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {t('Each row is a service a citizen applies FOR - a certificate, a licence, a permit - measured against the turnaround the corporation has published for it. This is distinct from complaint-resolution SLA reported elsewhere: a notified service is owed to every applicant from the day it is filed, whether or not anything has gone wrong.')}
          </p>
        </div>
      </Card>

      <FilterBar show={['department', 'search']} searchPlaceholder="Search by service or department" />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Notified services tracked')}
          value={totalServices}
          support={t('{0} applications in 30 days, across every department', formatNumber(totalApplications))}
          icon={<ClipboardList className="h-4 w-4" />}
          origin="demonstration"
          background="red"
        />
        <MetricCard
          label={t('Within statutory period')}
          value={overallWithinPeriod}
          unit="%"
          support={t('Weighted by application volume')}
          tone={overallWithinPeriod < BELOW_COMPLIANCE_THRESHOLD ? 'critical' : overallWithinPeriod < 90 ? 'warn' : 'positive'}
          icon={<AlarmClockCheck className="h-4 w-4" />}
          background="amber"
        />
        <MetricCard
          label={t('Below {0}% compliance', BELOW_COMPLIANCE_THRESHOLD)}
          value={belowThreshold}
          support={t('of {0} services tracked', totalServices)}
          tone={belowThreshold > 0 ? 'warn' : 'positive'}
          icon={<Hourglass className="h-4 w-4" />}
          background="green"
        />
        <MetricCard
          label={t('Backlog')}
          value={formatNumber(totalBacklog)}
          support={t('Applications pending decision, city-wide')}
          tone={totalBacklog > totalApplications * 0.25 ? 'critical' : totalBacklog > totalApplications * 0.1 ? 'warn' : 'positive'}
          icon={<FileCheck2 className="h-4 w-4" />}
        />
      </MetricGrid>

      <GovPanel title={t('Notified services, city-wide')} tone="amber" dense>
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('One row per notified service, aggregated across every ward and counter that issues it.')}
        </p>
        {filtered.length === 0 ? (
          <EmptyState className="mx-3 mb-3" title={t('No notified services match the current filters')} detail="Clear a filter to widen the register." />
        ) : (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id}
            pageSize={20}
            initialSort={{ columnId: 'within', direction: 'asc' }}
          />
        )}
      </GovPanel>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default NotifiedServicesRegisterPage
