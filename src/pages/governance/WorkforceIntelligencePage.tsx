import { useMemo } from 'react'
import { AlertTriangle, Boxes, Info } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { wardService, workforceService } from '@/services'
import { ROUTES } from '@/config/navigation'
import type { ComplaintCategory } from '@/types/operations'
import { departmentName } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatNumber, formatPercent } from '@/utils/format'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  MetricGrid,
  type Column,
} from '@/components/ui'
import { StateBadge } from '@/components/ui/badges'
import { MetricCard } from '@/components/cards'
import { CategoryBarChart, ChartFrame, MiniBar, RankedBarChart } from '@/components/charts'
import { t } from '@/i18n'

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-8600),
  refreshIntervalMinutes: 10080,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const WORKLOAD_THRESHOLD = 75
const VACANCY_CONCERN_THRESHOLD = 15
const SLA_CONCERN_THRESHOLD = 75

/** Institutional mapping from citizen-service category to the department
 * that owns it - written here as domain knowledge, not sourced from any
 * `@/data/*` collection, so the correlation panel below can compare
 * department vacancy against ward service-health SLA compliance. */
const CATEGORY_DEPARTMENT: Record<ComplaintCategory, string> = {
  'water-supply': 'dept-hydraulic',
  drainage: 'dept-stormwater',
  'road-defect': 'dept-roads',
  'solid-waste': 'dept-solid-waste',
  'street-light': 'dept-electrical',
  sewerage: 'dept-sewerage',
  building: 'dept-building',
  'health-sanitation': 'dept-health',
  encroachment: 'dept-estates',
  garden: 'dept-gardens',
  'public-convenience': 'dept-health',
  'stray-animal': 'dept-health',
  education: 'dept-education',
  licensing: 'dept-licence',
  registration: 'dept-registration',
  other: 'dept-commissioner',
}

interface DeptWorkforceRow {
  departmentId: string
  sanctioned: number
  deployed: number
  onLeave: number
  contractual: number
  vacancyPct: number
  workloadIndex: number
}

export function WorkforceIntelligencePage(): React.JSX.Element {
  const unitsQuery = useServiceQuery(queryKeys.admin('workforce'), (user) => workforceService.units(user))
  const units = useMemo(() => unitsQuery.data ?? [], [unitsQuery.data])

  const serviceHealthQuery = useServiceQuery(queryKeys.wards('service-health-by-department'), async (u) => {
    const wards = await wardService.list(u)
    const profiles = await Promise.all(wards.map((w) => wardService.profile(u, w.id)))
    return profiles.flatMap((p) => p.services.byCategory)
  })

  const summary = useMemo(() => {
    const sanctioned = units.reduce((s, u) => s + u.sanctioned, 0)
    const deployed = units.reduce((s, u) => s + u.deployed, 0)
    const contractual = units.reduce((s, u) => s + u.contractual, 0)
    const avgWorkload = units.length > 0 ? units.reduce((s, u) => s + u.workloadIndex, 0) / units.length : 0
    const aboveThreshold = units.filter((u) => u.workloadIndex >= WORKLOAD_THRESHOLD).length
    return {
      sanctioned,
      deployed,
      vacancyPct: sanctioned > 0 ? Math.round(((sanctioned - deployed) / sanctioned) * 1000) / 10 : 0,
      contractualSharePct: sanctioned > 0 ? Math.round((contractual / sanctioned) * 1000) / 10 : 0,
      avgWorkload: Math.round(avgWorkload * 10) / 10,
      aboveThreshold,
    }
  }, [units])

  const departmentRows: DeptWorkforceRow[] = useMemo(() => {
    const byDept = new Map<string, typeof units>()
    for (const u of units) {
      const bucket = byDept.get(u.departmentId) ?? []
      bucket.push(u)
      byDept.set(u.departmentId, bucket)
    }
    return Array.from(byDept.entries()).map(([departmentId, list]) => {
      const sanctioned = list.reduce((s, u) => s + u.sanctioned, 0)
      const deployed = list.reduce((s, u) => s + u.deployed, 0)
      return {
        departmentId,
        sanctioned,
        deployed,
        onLeave: list.reduce((s, u) => s + u.onLeave, 0),
        contractual: list.reduce((s, u) => s + u.contractual, 0),
        vacancyPct: sanctioned > 0 ? Math.round(((sanctioned - deployed) / sanctioned) * 1000) / 10 : 0,
        workloadIndex: Math.round((list.reduce((s, u) => s + u.workloadIndex, 0) / list.length) * 10) / 10,
      }
    })
  }, [units])

  const vacancyRanking = useMemo(
    () => [...departmentRows].sort((a, b) => b.vacancyPct - a.vacancyPct).map((d) => ({ label: departmentName(d.departmentId), value: d.vacancyPct })),
    [departmentRows],
  )

  const workloadBands: Array<{ label: string; test: (v: number) => boolean }> = [
    { label: t('Below 50'), test: (v) => v < 50 },
    { label: '50 – 65', test: (v) => v >= 50 && v < 65 },
    { label: '65 – 80', test: (v) => v >= 65 && v < 80 },
    { label: t('80 and above'), test: (v) => v >= 80 },
  ]
  const workloadDistribution = useMemo(
    () => workloadBands.map((band) => ({ label: band.label, cadres: units.filter((u) => band.test(u.workloadIndex)).length })),
    [units],
  )

  const slaByDepartment = useMemo(() => {
    const rows = serviceHealthQuery.data ?? []
    const byDept = new Map<string, number[]>()
    for (const r of rows) {
      const deptId = CATEGORY_DEPARTMENT[r.category]
      const bucket = byDept.get(deptId) ?? []
      bucket.push(r.slaCompliancePct)
      byDept.set(deptId, bucket)
    }
    return new Map(Array.from(byDept.entries()).map(([deptId, values]) => [deptId, Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10]))
  }, [serviceHealthQuery.data])

  const correlationRows = useMemo(
    () =>
      departmentRows
        .filter((d) => slaByDepartment.has(d.departmentId))
        .map((d) => ({ ...d, slaCompliancePct: slaByDepartment.get(d.departmentId) ?? 0 }))
        .sort((a, b) => b.vacancyPct - a.vacancyPct),
    [departmentRows, slaByDepartment],
  )

  const columns: Array<Column<(typeof units)[number]>> = [
    { id: 'department', header: t('Department'), cell: (r) => <span className="font-medium text-ink-800">{departmentName(r.departmentId)}</span>, sortValue: (r) => departmentName(r.departmentId), searchValue: (r) => departmentName(r.departmentId), width: '14rem' },
    { id: 'cadre', header: t('Cadre'), cell: (r) => r.cadre, sortValue: (r) => r.cadre, searchValue: (r) => r.cadre },
    { id: 'sanctioned', header: t('Sanctioned'), cell: (r) => <span className="numeric">{formatNumber(r.sanctioned)}</span>, sortValue: (r) => r.sanctioned, align: 'right' },
    { id: 'deployed', header: t('Deployed'), cell: (r) => <span className="numeric font-medium">{formatNumber(r.deployed)}</span>, sortValue: (r) => r.deployed, align: 'right' },
    { id: 'leave', header: t('On leave'), cell: (r) => <span className="numeric text-ink-500">{formatNumber(r.onLeave)}</span>, sortValue: (r) => r.onLeave, align: 'right', hideBelow: 'lg' },
    { id: 'contractual', header: t('Contractual'), cell: (r) => <span className="numeric text-ink-500">{formatNumber(r.contractual)}</span>, sortValue: (r) => r.contractual, align: 'right', hideBelow: 'md' },
    {
      id: 'vacancy',
      header: t('Vacancy'),
      cell: (r) => <span className={`numeric font-semibold ${r.vacancyPct >= VACANCY_CONCERN_THRESHOLD ? 'text-crit-700' : 'text-ink-700'}`}>{formatPercent(r.vacancyPct)}</span>,
      sortValue: (r) => r.vacancyPct,
      align: 'right',
    },
    {
      id: 'workload',
      header: t('Workload index'),
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={r.workloadIndex} />
          <span className="numeric w-8 text-right font-semibold">{r.workloadIndex}</span>
        </div>
      ),
      sortValue: (r) => r.workloadIndex,
      align: 'right',
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        title={t('Workforce Intelligence')}
        description={t('Sanctioned and deployed strength, vacancy and workload pressure by department and cadre, with an explicit view of where high vacancy co-occurs with service-response deterioration.')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Workforce Intelligence') }]}
        freshness={FRESHNESS}
        actions={
          <LinkButton to={ROUTES.assets} variant="outline" icon={<Boxes className="h-3.5 w-3.5" />}>
            {t('Open Asset Intelligence')}
          </LinkButton>
        }
      />

      {unitsQuery.isLoading ? <LoadingState variant="metrics" /> : null}
      {unitsQuery.error ? <ErrorState detail={unitsQuery.error.message} onRetry={() => unitsQuery.refetch()} /> : null}

      {!unitsQuery.isLoading && !unitsQuery.error && units.length === 0 ? (
        <EmptyState title={t('No workforce records available')} detail="No establishment records are recorded within your authorised scope." />
      ) : null}

      {!unitsQuery.isLoading && !unitsQuery.error && units.length > 0 ? (
        <>
          <Card>
            <CardHeader title={t('Establishment summary')} />
            <MetricGrid columns={5} className="mt-4">
              <MetricCard label={t('Sanctioned strength')} value={formatNumber(summary.sanctioned)} />
              <MetricCard label={t('Deployed')} value={formatNumber(summary.deployed)} support={t('{0} of sanctioned strength', formatPercent(100 - summary.vacancyPct))} />
              <MetricCard label={t('Vacancy')} value={formatPercent(summary.vacancyPct)} tone={summary.vacancyPct >= VACANCY_CONCERN_THRESHOLD ? 'critical' : 'default'} />
              <MetricCard label={t('Contractual share')} value={formatPercent(summary.contractualSharePct)} support={t('Of sanctioned strength')} />
              <MetricCard label={t('Average workload index')} value={String(summary.avgWorkload)} support={t('{0} cadres at or above {1}', summary.aboveThreshold, WORKLOAD_THRESHOLD)} tone={summary.aboveThreshold > 0 ? 'warn' : 'default'} />
            </MetricGrid>
          </Card>

          <Card flush>
            <CardHeader bordered title={t('Department × cadre establishment')} description={t('Sortable, searchable and paginated.')} />
            <DataTable rows={units} columns={columns} rowKey={(r) => r.id} pageSize={12} stickyHeader maxHeight="30rem" searchPlaceholder="Search department or cadre" />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <ChartFrame title={t('Vacancy ranking - by department')} unit="%" timeframe="Current establishment" description={t('Departments ranked by vacancy against sanctioned strength, highest first.')} freshness={FRESHNESS} height={Math.max(220, vacancyRanking.length * 20)}>
                <RankedBarChart data={vacancyRanking} unit="%" higherIsWorse />
              </ChartFrame>
            </Card>
            <Card>
              <ChartFrame title={t('Workload distribution')} unit="cadres" timeframe="Current establishment" description={t('Count of department–cadre records in each workload-index band.')} freshness={FRESHNESS} height={240}>
                <CategoryBarChart data={workloadDistribution} categoryKey="label" series={[{ key: 'cadres', label: t('Cadres'), colour: '#f59e0b' }]} />
              </ChartFrame>
            </Card>
          </div>

          <Card tone="warn">
            <CardHeader
              icon={<AlertTriangle className="h-4 w-4" />}
              title={t('Vacancy and service-response - a correlation requiring assessment')}
              description={t('Department vacancy is set against ward-level SLA compliance for the citizen-service categories that department owns. A department appearing in both columns below shows vacancy and service-response pressure occurring together - this is a correlation the platform surfaces for assessment. It is not a causal claim, and it is not a finding against any department, officer or individual.')}
            />
            {serviceHealthQuery.isLoading ? (
              <p className="mt-3 text-xs text-ink-400">{t('Retrieving ward service-health position…')}</p>
            ) : serviceHealthQuery.error ? (
              <p className="mt-3 text-xs text-crit-600">{serviceHealthQuery.error.message}</p>
            ) : correlationRows.length === 0 ? (
              <p className="mt-3 text-xs text-ink-400">{t('No department currently has both a workforce record and a mapped service-health category.')}</p>
            ) : (
              <div className="scrollbar-slim mt-3 max-h-72 overflow-y-auto">
                <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-ink-100 text-ink-400">
                      <th className="label-institutional py-1.5 pr-2 font-semibold">{t('Department')}</th>
                      <th className="label-institutional py-1.5 px-2 text-right font-semibold">{t('Vacancy')}</th>
                      <th className="label-institutional py-1.5 pl-2 text-right font-semibold">{t('SLA compliance')}</th>
                      <th className="label-institutional py-1.5 pl-2 text-right font-semibold">{'Co-occurrence'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {correlationRows.map((row) => {
                      const flagged = row.vacancyPct >= VACANCY_CONCERN_THRESHOLD && row.slaCompliancePct < SLA_CONCERN_THRESHOLD
                      return (
                        <tr key={row.departmentId} className={flagged ? 'bg-warn-50/50' : undefined}>
                          <td className="py-1.5 pr-2 font-medium text-ink-800">{departmentName(row.departmentId)}</td>
                          <td className={`numeric py-1.5 px-2 text-right font-semibold ${row.vacancyPct >= VACANCY_CONCERN_THRESHOLD ? 'text-crit-700' : 'text-ink-700'}`}>{formatPercent(row.vacancyPct)}</td>
                          <td className={`numeric py-1.5 pl-2 text-right font-semibold ${row.slaCompliancePct < SLA_CONCERN_THRESHOLD ? 'text-crit-700' : 'text-ink-700'}`}>{formatPercent(row.slaCompliancePct)}</td>
                          <td className="py-1.5 pl-2 text-right">
                            {flagged ? <Badge tone="warn">{t('Requires assessment')}</Badge> : <Badge tone="muted">{t('Not flagged')}</Badge>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-ink-500">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {t('Flagged rows meet both a vacancy threshold of')}{' '}{VACANCY_CONCERN_THRESHOLD}{t('% and an SLA compliance threshold below')}{' '}
              {SLA_CONCERN_THRESHOLD}{t('%. Meeting both thresholds identifies a pattern for institutional review; it does not establish that vacancy caused the service-response position, which may share other contributing factors.')}
            </p>
          </Card>
        </>
      ) : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

export default WorkforceIntelligencePage
