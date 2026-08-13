import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClipboardCheck, LayoutGrid, ListFilter, Table2 } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { projectService, wardService } from '@/services'
import { useDrawerStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { ROUTES } from '@/config/navigation'
import {
  PROJECT_CATEGORY_LABEL,
  PROJECT_STATUS_LABEL,
  type Project,
  type ProjectCategory,
  type ProjectStatus,
} from '@/types/finance'
import { departmentName, wardName } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatCrore, formatNumber, formatPercent } from '@/utils/format'
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
  SegmentedControl,
  Select,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { ProjectCard } from '@/components/cards/domain-cards'
import { CategoryBarChart, ChartFrame, ContributionBars, DonutChart, MiniBar, RankedBarChart } from '@/components/charts'
import { contractorName } from '@/data/finance.data'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Project Intelligence - flagship capital delivery surface with the
 * explainable Project Risk Engine.
 *
 * Reads through `projectService` only (`list`, `get`, `atRisk`, `riskDrivers`,
 * `byWard`, `contracts`). Every `Project` returned already carries its full
 * `riskDrivers: RiskDriver[]` - the identical weighted composite the engine
 * publishes - so the risk-engine section renders that array directly rather
 * than duplicating the computation. `contractorName` is imported from
 * `@/data/finance.data` purely as a display-label resolver, the same pattern
 * as `wardName`/`departmentName` from `@/data/reference`: no project, cost,
 * risk or milestone data is read from `@/data/*` anywhere on this page.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-70),
  refreshIntervalMinutes: 1440,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

type RiskBand = 'low' | 'medium' | 'high' | 'critical'

function riskBand(score: number): RiskBand {
  if (score >= 70) return 'critical'
  if (score >= 55) return 'high'
  if (score >= 38) return 'medium'
  return 'low'
}

function build$RISK_BAND_LABEL(): Record<RiskBand, string> {
  return { low: t('Low'), medium: t('Medium'), high: t('High'), critical: t('Critical') }
}
let RISK_BAND_LABEL: Record<RiskBand, string> = build$RISK_BAND_LABEL()
registerLayer(() => {
  RISK_BAND_LABEL = build$RISK_BAND_LABEL()
})
const RISK_BAND_TONE: Record<RiskBand, 'positive' | 'warn' | 'risk' | 'critical'> = {
  low: 'positive',
  medium: 'warn',
  high: 'risk',
  critical: 'critical',
}

const ACTIVE_STATUSES: ProjectStatus[] = ['planned', 'tendered', 'awarded', 'in-progress', 'delayed', 'on-hold']

export function ProjectIntelligencePage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(
    t('Project Intelligence'),
    t('Capital project delivery across every category, with the explainable Project Risk Engine driving prioritisation. Every risk score is the transparent, published sum of seven weighted delivery-risk drivers - never a judgement of any person or organisation.'),
  )

  const [searchParams] = useSearchParams()
  const openDrawer = useDrawerStore((s) => s.open)

  const [wardFilter, setWardFilter] = useState<string>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProjectCategory>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all')
  const [riskFilter, setRiskFilter] = useState<'all' | RiskBand>('all')
  const [view, setView] = useState<'table' | 'grid'>('table')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const serviceFilters = useMemo(
    () => ({
      wardId: wardFilter === 'all' ? undefined : wardFilter,
      departmentId: departmentFilter === 'all' ? undefined : departmentFilter,
      category: categoryFilter === 'all' ? undefined : [categoryFilter],
      status: statusFilter === 'all' ? undefined : [statusFilter],
      pageSize: 200,
    }),
    [wardFilter, departmentFilter, categoryFilter, statusFilter],
  )

  const projectsQuery = useServiceQuery(queryKeys.projects(serviceFilters), (u) => projectService.list(u, serviceFilters))
  const wardsQuery = useServiceQuery(queryKeys.wards(), (u) => wardService.list(u))

  const allRows = projectsQuery.data?.items ?? []
  const rows = useMemo(
    () => (riskFilter === 'all' ? allRows : allRows.filter((p) => riskBand(p.riskScore) === riskFilter)),
    [allRows, riskFilter],
  )

  const selectedProject = rows.find((p) => p.id === selectedProjectId) ?? allRows.find((p) => p.id === selectedProjectId) ?? null

  // `?project=<id>` opens that project's drawer once on mount, independent of
  // the in-page risk-engine selection below.
  useEffect(() => {
    const id = searchParams.get('project')
    if (id) openDrawer({ kind: 'project', id })
    // Only ever re-run if the URL parameter itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (!selectedProjectId && rows.length > 0) setSelectedProjectId(rows[0]?.id ?? null)
  }, [rows, selectedProjectId])

  const departmentOptions = useMemo(() => {
    const ids = Array.from(new Set(allRows.map((p) => p.departmentId)))
    return ids.map((id) => ({ value: id, label: departmentName(id) })).sort((a, b) => a.label.localeCompare(b.label))
  }, [allRows])

  const summary = useMemo(() => {
    const sanctioned = rows.reduce((s, p) => s + p.sanctionedCostCrore, 0)
    const current = rows.reduce((s, p) => s + p.currentCostCrore, 0)
    const paid = rows.reduce((s, p) => s + p.paidCrore, 0)
    const avgCompletion = rows.length > 0 ? rows.reduce((s, p) => s + p.completionPct, 0) / rows.length : 0
    const avgPlanned = rows.length > 0 ? rows.reduce((s, p) => s + p.plannedCompletionPct, 0) / rows.length : 0
    const active = rows.filter((p) => ACTIVE_STATUSES.includes(p.status)).length
    const delayed = rows.filter((p) => p.status === 'delayed').length
    const atRisk = rows.filter((p) => p.riskScore >= 55).length
    const openInspections = rows.reduce((s, p) => s + p.inspectionObservationsOpen, 0)
    const complaints = rows.reduce((s, p) => s + p.complaintsLinked, 0)
    return {
      sanctioned: Math.round(sanctioned * 10) / 10,
      current: Math.round(current * 10) / 10,
      paid: Math.round(paid * 10) / 10,
      avgCompletion: Math.round(avgCompletion * 10) / 10,
      avgPlanned: Math.round(avgPlanned * 10) / 10,
      active,
      delayed,
      atRisk,
      openInspections,
      complaints,
    }
  }, [rows])

  const statusComposition = useMemo(() => {
    const counts = new Map<ProjectStatus, number>()
    for (const p of rows) counts.set(p.status, (counts.get(p.status) ?? 0) + 1)
    return Array.from(counts.entries()).map(([status, value]) => ({ label: PROJECT_STATUS_LABEL[status], value }))
  }, [rows])

  const riskDistribution = useMemo(() => {
    const bands: RiskBand[] = ['low', 'medium', 'high', 'critical']
    return bands.map((band) => ({ label: RISK_BAND_LABEL[band], count: rows.filter((p) => riskBand(p.riskScore) === band).length }))
  }, [rows])

  const costVarianceData = useMemo(
    () =>
      [...rows]
        .map((p) => ({
          label: p.reference.split('/').slice(-1)[0] ?? p.reference,
          value: p.sanctionedCostCrore > 0 ? Math.round(((p.currentCostCrore - p.sanctionedCostCrore) / p.sanctionedCostCrore) * 1000) / 10 : 0,
        }))
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    [rows],
  )

  const completionByCategory = useMemo(() => {
    const cats = Array.from(new Set(rows.map((p) => p.category)))
    return cats.map((cat) => {
      const inCat = rows.filter((p) => p.category === cat)
      return {
        label: PROJECT_CATEGORY_LABEL[cat],
        Actual: inCat.length > 0 ? Math.round((inCat.reduce((s, p) => s + p.completionPct, 0) / inCat.length) * 10) / 10 : 0,
        Planned: inCat.length > 0 ? Math.round((inCat.reduce((s, p) => s + p.plannedCompletionPct, 0) / inCat.length) * 10) / 10 : 0,
      }
    })
  }, [rows])

  const columns: Array<Column<Project>> = [
    {
      id: 'reference',
      header: t('Reference'),
      cell: (row) => <span className="font-mono text-[0.6875rem] text-ink-500">{row.reference}</span>,
      sortValue: (row) => row.reference,
      searchValue: (row) => row.reference,
      width: '9rem',
    },
    {
      id: 'name',
      header: t('Project'),
      cell: (row) => <span className="line-clamp-2 font-medium text-ink-800">{row.name}</span>,
      sortValue: (row) => row.name,
      searchValue: (row) => `${row.name} ${row.description}`,
      width: '20rem',
    },
    {
      id: 'ward',
      header: t('Ward'),
      cell: (row) => <span>{wardName(row.wardIds[0] ?? '')}{row.wardIds.length > 1 ? ` +${row.wardIds.length - 1}` : ''}</span>,
      sortValue: (row) => wardName(row.wardIds[0] ?? ''),
      hideBelow: 'md',
    },
    {
      id: 'department',
      header: t('Department'),
      cell: (row) => departmentName(row.departmentId),
      sortValue: (row) => departmentName(row.departmentId),
      optional: true,
    },
    {
      id: 'category',
      header: t('Category'),
      cell: (row) => <Badge tone="neutral">{PROJECT_CATEGORY_LABEL[row.category]}</Badge>,
      sortValue: (row) => PROJECT_CATEGORY_LABEL[row.category],
      hideBelow: 'lg',
    },
    {
      id: 'contractor',
      header: t('Contractor'),
      cell: (row) => <span className="truncate text-ink-600">{contractorName(row.contractorId)}</span>,
      sortValue: (row) => contractorName(row.contractorId),
      searchValue: (row) => contractorName(row.contractorId),
      optional: true,
    },
    {
      id: 'sanctioned',
      header: t('Sanctioned'),
      cell: (row) => <span className="numeric">{formatCrore(row.sanctionedCostCrore)}</span>,
      sortValue: (row) => row.sanctionedCostCrore,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'current',
      header: t('Current cost'),
      cell: (row) => <span className="numeric font-medium">{formatCrore(row.currentCostCrore)}</span>,
      sortValue: (row) => row.currentCostCrore,
      align: 'right',
    },
    {
      id: 'paid',
      header: t('Paid'),
      cell: (row) => <span className="numeric">{formatCrore(row.paidCrore)}</span>,
      sortValue: (row) => row.paidCrore,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'planned',
      header: t('Planned dates'),
      cell: (row) => (
        <span className="text-[0.6875rem] text-ink-500">
          {new Date(row.plannedStart).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })} →{' '}
          {new Date(row.plannedEnd).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
        </span>
      ),
      sortValue: (row) => row.plannedEnd,
      optional: true,
    },
    {
      id: 'completion',
      header: t('Completion vs plan'),
      cell: (row) => (
        <div className="w-28">
          <div className="flex items-center justify-between text-[0.625rem] text-ink-400">
            <span>{row.completionPct}%</span>
            <span>{t('plan {0}%', row.plannedCompletionPct)}</span>
          </div>
          <MiniBar value={row.completionPct} width={999} className="mt-0.5 w-full" tone={row.completionPct < row.plannedCompletionPct - 12 ? 'critical' : undefined} />
        </div>
      ),
      sortValue: (row) => row.completionPct - row.plannedCompletionPct,
    },
    {
      id: 'milestones',
      header: t('Milestones'),
      cell: (row) => {
        const achieved = row.milestones.filter((m) => m.status === 'achieved').length
        const slipped = row.milestones.filter((m) => m.status === 'slipped').length
        return (
          <span className="text-[0.6875rem]">
            <span className="font-medium text-ink-700">{achieved}/{row.milestones.length}</span>
            {slipped > 0 ? <span className="ml-1 text-crit-600">{slipped} slipped</span> : null}
          </span>
        )
      },
      sortValue: (row) => row.milestones.filter((m) => m.status === 'slipped').length,
      hideBelow: 'lg',
    },
    {
      id: 'risk',
      header: t('Risk score'),
      cell: (row) => <Badge tone={RISK_BAND_TONE[riskBand(row.riskScore)]}>{row.riskScore}/100</Badge>,
      sortValue: (row) => row.riskScore,
      align: 'right',
    },
    {
      id: 'complaints',
      header: t('Complaints'),
      cell: (row) => <span className="numeric text-ink-500">{row.complaintsLinked}</span>,
      sortValue: (row) => row.complaintsLinked,
      align: 'right',
      optional: true,
    },
    {
      id: 'inspections',
      header: t('Open inspections'),
      cell: (row) => <span className="numeric text-ink-500">{row.inspectionObservationsOpen}</span>,
      sortValue: (row) => row.inspectionObservationsOpen,
      align: 'right',
      optional: true,
    },
  ]

  const anyLoading = projectsQuery.isLoading || wardsQuery.isLoading
  const anyError = projectsQuery.error ?? wardsQuery.error

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Project Intelligence') }]}
        freshness={FRESHNESS}
        actions={
          <LinkButton to={ROUTES.procurement} variant="outline" icon={<ClipboardCheck className="h-3.5 w-3.5" />}>
            {t('Open Procurement Intelligence')}
          </LinkButton>
        }
        controls={
          <>
            <span className="label-institutional inline-flex items-center gap-1">
              <ListFilter className="h-3 w-3" />{' '}{t('Filters')}
            </span>
            <Select
              aria-label={t('Filter by ward')}
              value={wardFilter}
              onChange={(e) => setWardFilter(e.target.value)}
              options={[{ value: 'all', label: t('All wards') }, ...(wardsQuery.data ?? []).map((w) => ({ value: w.id, label: `${w.code} - ${w.name.split(' · ')[0]}` }))]}
              className="w-auto"
            />
            <Select
              aria-label={t('Filter by department')}
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              options={[{ value: 'all', label: t('All departments') }, ...departmentOptions]}
              className="w-auto"
            />
            <Select
              aria-label={t('Filter by category')}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
              options={[{ value: 'all', label: t('All categories') }, ...Object.entries(PROJECT_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))]}
              className="w-auto"
            />
            <Select
              aria-label={t('Filter by status')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              options={[{ value: 'all', label: t('All statuses') }, ...Object.entries(PROJECT_STATUS_LABEL).map(([value, label]) => ({ value, label }))]}
              className="w-auto"
            />
            <SegmentedControl
              value={riskFilter}
              onChange={setRiskFilter}
              ariaLabel="Filter by risk band"
              options={[
                { value: 'all', label: t('All risk') },
                { value: 'low', label: t('Low') },
                { value: 'medium', label: t('Medium') },
                { value: 'high', label: t('High') },
                { value: 'critical', label: t('Critical') },
              ]}
            />
          </>
        }
      />

      {anyLoading ? <LoadingState variant="metrics" /> : null}
      {anyError ? <ErrorState detail={anyError.message} onRetry={() => { void projectsQuery.refetch() }} /> : null}

      {!anyLoading && !anyError && allRows.length === 0 ? (
        <EmptyState title={t('No projects match the current filters')} detail="Widen the filters above to see the capital project portfolio." />
      ) : null}

      {!anyLoading && !anyError && allRows.length > 0 ? (
        <>
          <Card>
            <CardHeader title={t('Portfolio summary')} description={t('Scoped to the filters selected above.')} />
            <MetricGrid columns={5} className="mt-4">
              <MetricCard label={t('Active projects')} value={formatNumber(summary.active)} support={t('of {0} in this view', rows.length)} />
              <MetricCard label={t('Sanctioned value')} value={formatCrore(summary.sanctioned)} support={t('{0} current cost', formatCrore(summary.current))} />
              <MetricCard
                label={t('Physical progress')}
                value={formatPercent(summary.avgCompletion)}
                support={t('{0} planned to date', formatPercent(summary.avgPlanned))}
                progress={{ value: summary.avgCompletion, max: 100 }}
              />
              <MetricCard label={t('Projects at risk')} value={formatNumber(summary.atRisk)} support={`${summary.delayed} delayed`} tone={summary.atRisk > 0 ? 'critical' : 'default'} />
              <MetricCard label={t('Open inspection observations')} value={formatNumber(summary.openInspections)} support={t('{0} linked citizen complaints', summary.complaints)} />
            </MetricGrid>
          </Card>

          {/* Two columns. The portfolio is the record and holds the wide
              column; the engine's breakdown for the selected project sits
              beside it — a score read next to the row that produced it — with
              the four portfolio distributions beneath. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="min-w-0 xl:col-span-8">
          <Card flush>
            <CardHeader
              bordered
              title={t('Project portfolio')}
              description={t('Sortable, searchable and paginated. Choose visible columns with the column picker. Click a row to select it for the Risk Engine below and open its full record.')}
              actions={
                <SegmentedControl
                  value={view}
                  onChange={setView}
                  ariaLabel="Toggle table or card view"
                  options={[
                    { value: 'table', label: t('Table'), icon: <Table2 className="h-3 w-3" /> },
                    { value: 'grid', label: t('Cards'), icon: <LayoutGrid className="h-3 w-3" /> },
                  ]}
                />
              }
            />
            {view === 'table' ? (
              <DataTable
                rows={rows}
                columns={columns}
                rowKey={(row) => row.id}
                pageSize={12}
                stickyHeader
                maxHeight="32rem"
                searchPlaceholder="Search projects"
                onRowClick={(row) => {
                  setSelectedProjectId(row.id)
                  openDrawer({ kind: 'project', id: row.id })
                }}
                activeRowKey={selectedProjectId ?? undefined}
                rowAccent={(row) => <span className={`w-[3px] rounded-full ${RISK_BAND_TONE[riskBand(row.riskScore)] === 'critical' ? 'bg-crit-500' : RISK_BAND_TONE[riskBand(row.riskScore)] === 'risk' ? 'bg-risk-500' : RISK_BAND_TONE[riskBand(row.riskScore)] === 'warn' ? 'bg-warn-500' : 'bg-ok-500'}`} />}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.slice(0, 30).map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    active={p.id === selectedProjectId}
                    onClick={() => {
                      setSelectedProjectId(p.id)
                      openDrawer({ kind: 'project', id: p.id })
                    }}
                  />
                ))}
              </div>
            )}
          </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <div className="order-2 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Card>
              <ChartFrame title={t('Status composition')} unit="projects" timeframe="Current scope" freshness={FRESHNESS} height={220}>
                <DonutChart data={statusComposition} unit="projects" centreValue={formatNumber(rows.length)} centreLabel="Projects" />
              </ChartFrame>
            </Card>
            <Card>
              <ChartFrame title={t('Risk distribution')} unit="projects" timeframe="Current scope" freshness={FRESHNESS} height={220}>
                <CategoryBarChart
                  data={riskDistribution}
                  categoryKey="label"
                  series={[{ key: 'count', label: t('Projects'), colour: '#f97316' }]}
                />
              </ChartFrame>
            </Card>
            <Card>
              <ChartFrame
                title={t('Cost variance - top ten overruns')}
                unit={t('% over sanctioned')}
                timeframe="Current scope"
                description={t('Percentage by which current cost exceeds the sanctioned cost, highest first.')}
                freshness={FRESHNESS}
                height={240}
              >
                <RankedBarChart data={costVarianceData} unit="%" higherIsWorse />
              </ChartFrame>
            </Card>
            <Card>
              <ChartFrame
                title={t('Completion vs plan - by category')}
                unit="%"
                timeframe="Current scope"
                description={t('Average actual physical progress against average planned progress, by project category.')}
                freshness={FRESHNESS}
                height={240}
              >
                <CategoryBarChart
                  data={completionByCategory}
                  categoryKey="label"
                  series={[
                    { key: 'Actual', label: t('Actual'), colour: '#2f6feb' },
                    { key: 'Planned', label: t('Planned'), colour: '#8195ac' },
                  ]}
                  showLegend
                />
              </ChartFrame>
            </Card>
          </div>

          <Card className="order-1">
            <CardHeader
              title={t('Project Risk Engine')}
              description={t('A published, deterministic composite: seven delivery-risk drivers, each independently weighted and explained. The score identifies delivery risk requiring management attention - it is not a finding against any person or organisation.')}
              actions={
                selectedProject ? (
                  <LinkButton to={`${ROUTES.decisions}?from=project:${selectedProject.id}`} variant="primary" icon={<ClipboardCheck className="h-3.5 w-3.5" />}>
                    {t('Create decision case')}
                  </LinkButton>
                ) : undefined
              }
            />
            {!selectedProject ? (
              <EmptyState title={t('Select a project')} detail="Choose a project from the table or card view above to see its risk engine breakdown." compact className="mt-4" />
            ) : (
              <div className="mt-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral" className="font-mono">{selectedProject.reference}</Badge>
                  <span className="text-sm font-semibold text-ink-800">{selectedProject.name}</span>
                  <Badge tone={RISK_BAND_TONE[riskBand(selectedProject.riskScore)]}>{t('{0} risk · {1}/100', RISK_BAND_LABEL[riskBand(selectedProject.riskScore)], selectedProject.riskScore)}</Badge>
                </div>
                <p className="mb-3 text-xs leading-relaxed text-ink-500">
                  {t('Engine factors: schedule variance, cost variance, milestone slippage, payment-to-progress mismatch, executing-agency delivery history, unresolved inspection observations and linked citizen complaints. Each driver below states its raw 0–100 score, its published weight and its resulting contribution to the composite score of {0}.', selectedProject.riskScore)}
                </p>
                <ContributionBars items={selectedProject.riskDrivers} />
                <p className="mt-3 rounded-md bg-ink-50 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-ink-500">
                  {t('This score identifies a delivery-risk pattern requiring management attention. It is not, and must not be characterised as, a finding against any officer, contractor or department.')}
                </p>
              </div>
            )}
          </Card>
          </div>
          </div>
        </>
      ) : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

export default ProjectIntelligencePage
