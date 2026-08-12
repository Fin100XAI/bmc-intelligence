import { useMemo, useState } from 'react'
import { Activity, Gauge, Loader2, Play, RotateCcw, Workflow } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, StateBadge } from '@/components/ui/badges'
import {
  Button,
  Card,
  CardHeader,
  DefinitionList,
  DefinitionRow,
  MetricGrid,
  ProgressBar,
  Select,
} from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { ChartFrame } from '@/components/charts/ChartFrame'
import { RankedBarChart, Sparkline, TrendChart } from '@/components/charts/charts'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { platformService } from '@/services'
import { DOMAIN_LABEL, type SeriesPoint } from '@/types/common'
import { DEMO_NOW, det, isoFromAnchor } from '@/utils/deterministic'
import { formatDateTime, formatNumber, formatPercent, formatRelative, formatShortDate } from '@/utils/format'
import type { PipelineJob, PlatformService } from '@/types/governance'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/trust/PlatformHealthPage.tsx
 *
 * The honest self-assessment surface. Every simulated component says so
 * explicitly — this page never claims a production service level.
 *
 * The one action here is re-running a pipeline job, and it is deliberately
 * bounded: a re-run is simulated, its outcome is seeded from the job's own
 * history rather than forced to succeed, and it is labelled as an operator
 * re-run for the rest of the session. A "re-run" button that always went green
 * would teach an operator to trust a control that had told them nothing.
 */

function build$CATEGORY_LABEL(): Record<PlatformService['category'], string> {
  return {
  application: t('Application'),
  'data-pipeline': t('Data Pipeline'),
  'ai-gateway': t('AI Gateway'),
  integration: t('Integration'),
  storage: t('Storage'),
  'event-processing': t('Event Processing'),
}
}
let CATEGORY_LABEL: Record<PlatformService['category'], string> = build$CATEGORY_LABEL()
registerLayer(() => {
  CATEGORY_LABEL = build$CATEGORY_LABEL()
})

const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABEL) as Array<PlatformService['category']>

function formatJobDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`
}

const JOB_STATUS_TONE: Record<PipelineJob['status'], 'positive' | 'critical' | 'info' | 'muted'> = {
  succeeded: 'positive',
  failed: 'critical',
  running: 'info',
  skipped: 'muted',
}

/**
 * A 30-day availability series for a service, derived from its own identifier
 * and headline figure. Seeded, so the history a service shows today is the
 * history it showed yesterday — an availability chart that reshuffles on
 * reload is worse than no chart.
 */
function availabilitySeries(service: PlatformService): SeriesPoint[] {
  const r = det(`platform-availability:${service.id}`)
  const points = r.series(30, {
    start: service.availabilityPct,
    volatility: service.simulated ? 0.004 : 0.002,
    min: Math.max(90, service.availabilityPct - 6),
    max: 100,
    decimals: 2,
  })
  return points.map((value, i) => ({
    label: formatShortDate(new Date(DEMO_NOW.getTime() - (29 - i) * 86_400_000)),
    value,
  }))
}

/** A simulated operator re-run of a pipeline job, held for the session. */
interface JobRerun {
  status: PipelineJob['status']
  ranAt: string
  durationSeconds: number
  recordsProcessed: number
  note: string
}

export function PlatformHealthPage(): React.JSX.Element {
  const servicesQuery = useServiceQuery(queryKeys.platform(), (u) => platformService.services(u))
  const jobsQuery = useServiceQuery(['trust-platform-health', 'jobs'], (u) => platformService.jobs(u))
  const summaryQuery = useServiceQuery(['trust-platform-health', 'summary'], (u) => platformService.summary(u))

  const [categoryFilter, setCategoryFilter] = useState<PlatformService['category'] | ''>('')
  const [originFilter, setOriginFilter] = useState<'' | 'simulated' | 'direct'>('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [runningJobs, setRunningJobs] = useState<string[]>([])
  const [reruns, setReruns] = useState<Record<string, JobRerun>>({})

  const services = useMemo(() => servicesQuery.data ?? [], [servicesQuery.data])
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data])

  const filteredServices = useMemo(
    () =>
      services.filter((s) => {
        if (categoryFilter && s.category !== categoryFilter) return false
        if (originFilter === 'simulated' && !s.simulated) return false
        if (originFilter === 'direct' && s.simulated) return false
        return true
      }),
    [services, categoryFilter, originFilter],
  )

  /** Jobs with this session's re-runs layered over the seed. */
  const effectiveJobs = useMemo(
    () =>
      jobs.map((job) => {
        const rerun = reruns[job.id]
        if (!rerun) return job
        return {
          ...job,
          status: rerun.status,
          lastRunAt: rerun.ranAt,
          durationSeconds: rerun.durationSeconds,
          recordsProcessed: rerun.recordsProcessed,
          // A re-run that failed adds to the seven-day failure count. It does
          // not clear the count on success: a job that failed yesterday still
          // failed yesterday, whatever it does when an operator re-runs it.
          failures7d: rerun.status === 'failed' ? job.failures7d + 1 : job.failures7d,
        }
      }),
    [jobs, reruns],
  )

  const detail = useMemo(() => services.find((s) => s.id === detailId) ?? null, [services, detailId])

  /**
   * Simulates a job re-run. The outcome is seeded on the job's own failure
   * history, so a job that has been failing is more likely to fail again —
   * a re-run is a diagnostic, not a remedy.
   */
  function rerunJob(job: PipelineJob): void {
    if (runningJobs.includes(job.id)) return
    setRunningJobs((ids) => [...ids, job.id])

    const r = det(`job-rerun:${job.id}:${Object.keys(reruns).length}`)
    const failureWeight = Math.min(60, 6 + job.failures7d * 14)
    const status = r.weighted<PipelineJob['status']>([
      ['succeeded', 100 - failureWeight],
      ['failed', failureWeight],
    ])
    const rerun: JobRerun = {
      status,
      ranAt: isoFromAnchor(0),
      durationSeconds: r.int(Math.max(2, Math.round(job.durationSeconds * 0.6)), Math.round(job.durationSeconds * 1.5)),
      recordsProcessed: status === 'failed' ? 0 : Math.round(job.recordsProcessed * r.float(0.85, 1.15)),
      note:
        status === 'succeeded'
          ? 'Operator re-run completed. This does not retire the recorded failures in the last seven days.'
          : 'Operator re-run failed again. A job failing on re-run is a defect in the job, not a transient condition.',
    }

    window.setTimeout(() => {
      setReruns((prev) => ({ ...prev, [job.id]: rerun }))
      setRunningJobs((ids) => ids.filter((id) => id !== job.id))
    }, 900)
  }


  if (servicesQuery.isLoading || jobsQuery.isLoading || summaryQuery.isLoading) {
    return <LoadingState variant="metrics" />
  }
  if (servicesQuery.error) return <ErrorState detail={servicesQuery.error.message} onRetry={() => servicesQuery.refetch()} />
  if (jobsQuery.error) return <ErrorState detail={jobsQuery.error.message} onRetry={() => jobsQuery.refetch()} />
  if (summaryQuery.error) return <ErrorState detail={summaryQuery.error.message} onRetry={() => summaryQuery.refetch()} />

  const summary = summaryQuery.data
  if (services.length === 0 || !summary) {
    return <EmptyState title={t('No platform services registered')} detail="The platform health surface returned no entries." />
  }

  const rerunCount = Object.keys(reruns).length
  const failingNow = effectiveJobs.filter((j) => j.status === 'failed').length

  const serviceColumns: Array<Column<PlatformService>> = [
    {
      id: 'name',
      header: t('Service'),
      cell: (s) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-800">{s.name}</p>
          <p className="text-[0.6875rem] text-ink-400">{CATEGORY_LABEL[s.category]}</p>
        </div>
      ),
      sortValue: (s) => s.name,
      searchValue: (s) => `${s.name} ${CATEGORY_LABEL[s.category]} ${s.note}`,
      width: 'minmax(12rem,1.4fr)',
    },
    {
      id: 'state',
      header: t('State'),
      cell: (s) => <StateBadge state={s.state} />,
      sortValue: (s) => s.state,
    },
    {
      id: 'availability',
      header: t('Availability'),
      cell: (s) => (
        <div className="flex items-center justify-end gap-2">
          <Sparkline points={availabilitySeries(s).map((p) => p.value)} width={52} height={18} />
          <span className="numeric">{formatPercent(s.availabilityPct, 2)}</span>
        </div>
      ),
      sortValue: (s) => s.availabilityPct,
      align: 'right',
    },
    {
      id: 'latency',
      header: t('p95 latency'),
      cell: (s) => <span className="numeric">{s.p95LatencyMs} ms</span>,
      sortValue: (s) => s.p95LatencyMs,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'errorRate',
      header: t('Error rate'),
      cell: (s) => (
        <span className={cn('numeric', s.errorRatePct > 1 && 'font-semibold text-crit-600')}>
          {formatPercent(s.errorRatePct, 2)}
        </span>
      ),
      sortValue: (s) => s.errorRatePct,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'incident',
      header: t('Last incident'),
      cell: (s) => (s.lastIncidentAt ? formatRelative(s.lastIncidentAt) : <span className="text-ink-300">{t('None recorded')}</span>),
      sortValue: (s) => s.lastIncidentAt ?? '',
      hideBelow: 'lg',
    },
    {
      id: 'simulated',
      header: t('Simulated'),
      cell: (s) => (
        <Badge tone={s.simulated ? 'intel' : 'neutral'}>{s.simulated ? 'Simulated component' : 'Runs directly'}</Badge>
      ),
      sortValue: (s) => (s.simulated ? 1 : 0),
    },
  ]

  const jobColumns: Array<Column<PipelineJob>> = [
    {
      id: 'name',
      header: t('Pipeline job'),
      cell: (j) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-ink-800">{j.name}</p>
            {reruns[j.id] ? <Badge tone="intel" size="xs">{'Re-run'}</Badge> : null}
          </div>
          <p className="text-[0.6875rem] text-ink-400">{j.schedule}</p>
        </div>
      ),
      sortValue: (j) => j.name,
      searchValue: (j) => `${j.name} ${j.schedule} ${DOMAIN_LABEL[j.domain]}`,
      width: 'minmax(12rem,1.4fr)',
    },
    {
      id: 'lastRun',
      header: t('Last run'),
      cell: (j) => formatRelative(j.lastRunAt),
      sortValue: (j) => j.lastRunAt,
    },
    {
      id: 'duration',
      header: t('Duration'),
      cell: (j) => <span className="numeric">{formatJobDuration(j.durationSeconds)}</span>,
      sortValue: (j) => j.durationSeconds,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (j) =>
        runningJobs.includes(j.id) ? (
          <Badge tone="info" icon={<Loader2 className="h-3 w-3 animate-spin" />}>{t('Running…')}</Badge>
        ) : (
          <Badge tone={JOB_STATUS_TONE[j.status]} dot>
            {j.status}
          </Badge>
        ),
      sortValue: (j) => j.status,
    },
    {
      id: 'records',
      header: t('Records processed'),
      cell: (j) => <span className="numeric">{formatNumber(j.recordsProcessed)}</span>,
      sortValue: (j) => j.recordsProcessed,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'failures',
      header: t('Failures (7d)'),
      cell: (j) => (
        <span className={cn('numeric', j.failures7d > 0 && 'font-semibold text-crit-600')}>{j.failures7d}</span>
      ),
      sortValue: (j) => j.failures7d,
      align: 'right',
    },
    {
      id: 'domain',
      header: t('Domain'),
      cell: (j) => <Badge tone="muted">{DOMAIN_LABEL[j.domain]}</Badge>,
      sortValue: (j) => DOMAIN_LABEL[j.domain],
      hideBelow: 'xl',
    },
  ]

  const availabilityData = [...filteredServices]
    .sort((a, b) => a.availabilityPct - b.availabilityPct)
    .map((s) => ({ label: s.name, value: s.availabilityPct }))

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Trust Centre')}
        title={t('Platform Health')}
        description={t('Service availability, data pipeline health, the AI gateway, connector runtime, storage and event processing - reported plainly, with every simulated component labelled as such.')}
        breadcrumbs={[{ label: t('Trust Centre'), to: '/trust' }, { label: t('Platform Health') }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {rerunCount > 0 ? (
              <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setReruns({})}>
                {t('Discard {0} re-run{1}', rerunCount, rerunCount === 1 ? '' : 's')}
              </Button>
            ) : null}
          </div>
        }
      />

      <MetricGrid columns={4}>
        <Card>
          <p className="label-institutional">{t('Overall state')}</p>
          <div className="mt-2">
            <StateBadge state={summary.overallState} size="sm" />
          </div>
          <p className="mt-1.5 text-[0.6875rem] text-ink-500">{t('Across {0} registered services', services.length)}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Average availability')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">
            {formatPercent(summary.availabilityAvgPct, 2)}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Last 30 days, modelled')}</p>
        </Card>
        <Card tone={failingNow > 0 ? 'critical' : 'default'}>
          <p className="label-institutional">{t('Failing pipeline jobs')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{failingNow}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">
            {rerunCount > 0 ? `Includes ${rerunCount} operator re-run this session` : 'As last scheduled'}
          </p>
        </Card>
        <Card tone="info">
          <p className="label-institutional">{t('Simulated services')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">
            {summary.simulatedServices} / {services.length}
          </p>
          <ProgressBar
            value={(summary.simulatedServices / Math.max(1, services.length)) * 100}
            size="xs"
            className="mt-2"
          />
        </Card>
      </MetricGrid>

      <Card flush>
        <CardHeader
          className="px-4 pt-4"
          icon={<Gauge className="h-4 w-4" />}
          title={t('Service register')}
          description={t('Select a service to see its 30-day availability history and what it actually runs on in this environment.')}
          actions={
            categoryFilter || originFilter ? (
              <Button
                variant="ghost"
                size="xs"
                icon={<RotateCcw className="h-3 w-3" />}
                onClick={() => {
                  setCategoryFilter('')
                  setOriginFilter('')
                }}
              >
                {t('Clear filters')}
              </Button>
            ) : null
          }
        />
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <Select
            aria-label={t('Filter by category')}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as PlatformService['category'] | '')}
            options={[
              { value: '', label: t('All categories') },
              ...CATEGORY_OPTIONS.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
            ]}
          />
          <Select
            aria-label={t('Filter by origin')}
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value as typeof originFilter)}
            options={[
              { value: '', label: t('Simulated and direct') },
              { value: 'simulated', label: t('Simulated components only') },
              { value: 'direct', label: t('Runs directly only') },
            ]}
          />
        </div>
        <div className="p-4">
          <DataTable
            rows={filteredServices}
            columns={serviceColumns}
            rowKey={(s) => s.id}
            searchable
            searchPlaceholder="Search services"
            activeRowKey={detailId ?? undefined}
            onRowClick={(s) => setDetailId(s.id)}
            initialSort={{ columnId: 'availability', direction: 'asc' }}
            emptyTitle={t('No service matches the current filters')}
          />
        </div>
      </Card>

      <Card>
        <ChartFrame
          title={t('Availability by service')}
          unit="%"
          timeframe="Last 30 days"
          description={t('Lowest availability first.')}
          height={Math.max(220, availabilityData.length * 26)}
        >
          <RankedBarChart data={availabilityData} unit="%" higherIsWorse={false} />
        </ChartFrame>
      </Card>

      <Card flush>
        <CardHeader
          className="px-4 pt-4"
          icon={<Workflow className="h-4 w-4" />}
          title={t('Data pipeline jobs')}
          description={t('Scheduled jobs feeding the intelligence engine. Jobs with failures in the last seven days are flagged. A re-run is simulated and can fail — it is a diagnostic, not a remedy.')}
        />
        <div className="p-4">
          <DataTable
            rows={effectiveJobs}
            columns={jobColumns}
            rowKey={(j) => j.id}
            searchable
            searchPlaceholder="Search pipeline jobs"
            initialSort={{ columnId: 'failures', direction: 'desc' }}
            rowAccent={(j) => (
              <span className={cn('block h-full w-full rounded-full', j.status === 'failed' || j.failures7d > 0 ? 'bg-crit-500' : 'bg-ink-100')} />
            )}
            rowActions={(j) => (
              <Button
                size="xs"
                variant="outline"
                icon={runningJobs.includes(j.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                disabled={runningJobs.includes(j.id)}
                onClick={() => rerunJob(j)}
                title={t('Run this job again. The outcome is simulated and weighted by the job\'s own recent failures.')}
              >
                {'Re-run'}
              </Button>
            )}
          />
        </div>
        {rerunCount > 0 ? (
          <div className="border-t border-ink-100 px-4 py-3">
            <p className="text-[0.6875rem] leading-relaxed text-ink-500">
              {t('{0} job{1} been re-run this session. A successful re-run does not clear the seven-day failure count — a job that failed on Tuesday still failed on Tuesday, and a register that erased that on demand would be useless for spotting a job that fails intermittently.', rerunCount, rerunCount === 1 ? ' has' : 's have')}
            </p>
          </div>
        ) : null}
      </Card>

      <Card tone="info">
        <div className="flex items-start gap-2.5">
          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-govt-700" />
          <p className="text-xs leading-relaxed text-ink-700">
            {t('Components marked &quot;Simulated component&quot; above run entirely within this application using deterministic local logic - the AI gateway, connector runtime, audit service, event processing and search index are all simulated in this environment. Components marked &quot;Runs directly&quot; are genuinely served by the deployment target (the application shell and the intelligence engine evaluating this demonstration&apos;s deterministic data). No figure on this page implies a production service-level commitment.')}
          </p>
        </div>
      </Card>

      {/* Service detail ---------------------------------------------------- */}
      <Drawer
        open={detail !== null}
        onClose={() => setDetailId(null)}
        width="md"
        eyebrow={detail ? CATEGORY_LABEL[detail.category] : ''}
        title={detail?.name ?? ''}
        description={detail?.note}
        meta={
          detail ? (
            <>
              <StateBadge state={detail.state} />
              <Badge tone={detail.simulated ? 'intel' : 'neutral'}>
                {detail.simulated ? 'Simulated component' : 'Runs directly'}
              </Badge>
              <Badge tone={detail.errorRatePct > 1 ? 'critical' : 'neutral'}>
                {t('{0} error rate', formatPercent(detail.errorRatePct, 2))}
              </Badge>
            </>
          ) : null
        }
        footer={
          <Button variant="ghost" onClick={() => setDetailId(null)}>
            {t('Close')}
          </Button>
        }
      >
        {detail ? (
          <div className="space-y-4">
            <Card tone="sunken">
              <ChartFrame
                title={t('Availability, last 30 days')}
                unit="%"
                timeframe="Daily, modelled"
                description={t('Seeded from the service identifier, so this history is the same on every visit.')}
                height={160}
              >
                <TrendChart
                  points={availabilitySeries(detail)}
                  unit="%"
                  seriesLabel="Availability"
                  variant="line"
                  domain={[Math.floor(Math.min(...availabilitySeries(detail).map((p) => p.value)) - 0.5), 100]}
                />
              </ChartFrame>
            </Card>

            <DefinitionList>
              <DefinitionRow label={t('Category')}>{CATEGORY_LABEL[detail.category]}</DefinitionRow>
              <DefinitionRow label={t('Operational state')}>
                <StateBadge state={detail.state} />
              </DefinitionRow>
              <DefinitionRow label={t('Availability (30d)')}>
                <span className="numeric">{formatPercent(detail.availabilityPct, 2)}</span>
              </DefinitionRow>
              <DefinitionRow label={t('p95 latency')}>
                <span className="numeric">{detail.p95LatencyMs} ms</span>
              </DefinitionRow>
              <DefinitionRow label={t('Error rate')}>
                <span className="numeric">{formatPercent(detail.errorRatePct, 2)}</span>
              </DefinitionRow>
              <DefinitionRow label={t('Last incident')}>
                {detail.lastIncidentAt ? formatDateTime(detail.lastIncidentAt) : 'None recorded'}
              </DefinitionRow>
            </DefinitionList>

            <Card tone={detail.simulated ? 'warn' : 'info'}>
              <CardHeader title={detail.simulated ? 'This component is simulated' : 'This component runs directly'} />
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-700">
                {detail.simulated
                  ? 'Its availability, latency and error figures describe deterministic local logic running inside this application, not a deployed service. They are useful for demonstrating the shape of the surface and useless as a service-level indicator — nothing here can be relied upon as one.'
                  : 'Its figures describe something genuinely served by the deployment target. They are still modelled for this environment and carry no service-level commitment, but the component itself is not a stand-in.'}
              </p>
            </Card>
          </div>
        ) : null}
      </Drawer>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default PlatformHealthPage
