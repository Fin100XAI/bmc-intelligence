import { useMemo, useState } from 'react'
import { AlertTriangle, HardHat, Landmark, TrendingDown, TrendingUp } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { financeService, projectService } from '@/services'
import { useCurrentUser } from '@/stores/auth.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { allowed } from '@/security'
import { ROUTES } from '@/config/navigation'
import type { OperationalState } from '@/types/common'
import { BUDGET_HEAD_LABEL, type BudgetHead, type BudgetLine, type BudgetScenarioInput } from '@/types/finance'
import type { Project } from '@/types/finance'
import { departmentName, wardName } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatCrore, formatDelta, formatPercent } from '@/utils/format'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LinkButton,
  LoadingState,
  MetricGrid,
  ProgressBar,
  SimulationBadge,
  type Column,
} from '@/components/ui'
import { StateBadge } from '@/components/ui/badges'
import { MetricCard } from '@/components/cards'
import { ChartFrame, DonutChart, TrendChart } from '@/components/charts'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Budget Intelligence - flagship municipal financial control surface.
 *
 * Reads through `financeService` (`budgetLines`, `budgetTotals`,
 * `departmentVariance`, `wardVariance`, `runScenario`) and `projectService`
 * (`list`) for the project-expenditure linkage. Every figure is stated
 * against the phased (year-to-date) plan, matching `BudgetLine.variancePct`'s
 * own convention: positive = under-spend against the phased plan, negative =
 * over-spend. The scenario panel is illustrative simulation only - never a
 * forecast - and every scenario output carries `<SimulationBadge />`.
 */

const FY_ELAPSED_FRACTION = 0.31

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-340),
  refreshIntervalMinutes: 1440,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const HEAD_ORDER: BudgetHead[] = ['revenue', 'capital', 'establishment', 'debt-service']
const HEAD_COLOUR: Record<BudgetHead, string> = {
  revenue: '#2f6feb',
  capital: '#0ea5b7',
  establishment: '#f59e0b',
  'debt-service': '#8195ac',
}

interface DepartmentBudgetRow {
  departmentId: string
  approvedCrore: number
  revisedCrore: number
  committedCrore: number
  actualCrore: number
  forecastYearEndCrore: number
  utilisationPct: number
  variancePct: number
  state: OperationalState
  riskNotes: string[]
  lines: BudgetLine[]
}

function varianceTone(variancePct: number): 'positive' | 'warn' | 'critical' {
  const abs = Math.abs(variancePct)
  if (abs <= 12) return 'positive'
  if (abs <= 25) return 'warn'
  return 'critical'
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

export function BudgetIntelligencePage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(
    t('Budget Intelligence'),
    t('Municipal budget utilisation, department and ward variance against the phased plan, and a scenario engine for allocation, collection and contingency stress-testing. All expenditure figures are year-to-date; the financial year is approximately 31% elapsed at this reporting date.'),
  )

  const user = useCurrentUser()
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null)

  const linesQuery = useServiceQuery(queryKeys.finance('budget-lines'), (u) => financeService.budgetLines(u, { pageSize: 200 }))
  const totalsQuery = useServiceQuery(queryKeys.finance('budget-totals'), (u) => financeService.budgetTotals(u))
  const deptVarianceQuery = useServiceQuery(queryKeys.finance('department-variance'), (u) => financeService.departmentVariance(u))
  const wardVarianceQuery = useServiceQuery(queryKeys.finance('ward-variance'), (u) => financeService.wardVariance(u))
  const projectsQuery = useServiceQuery(queryKeys.projects({ scope: 'budget-linkage' }), (u) => projectService.list(u, { pageSize: 200 }))

  const [scenarioInputs, setScenarioInputs] = useState<BudgetScenarioInput>({
    capitalAllocationDeltaPct: 0,
    revenueExpenditureDeltaPct: 0,
    collectionEfficiencyDeltaPct: 0,
    contingencyCrore: 0,
  })
  const runScenario = useServiceAction((u, inputs: BudgetScenarioInput) => financeService.runScenario(u, inputs), [])
  const [scenarioResult, setScenarioResult] = useState<Awaited<ReturnType<typeof financeService.runScenario>> | null>(null)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const [scenarioPending, setScenarioPending] = useState(false)

  const lines = linesQuery.data?.items ?? []
  const deptVarianceRows = deptVarianceQuery.data ?? []
  const projects = projectsQuery.data?.items ?? []

  const departmentRows: DepartmentBudgetRow[] = useMemo(() => {
    const byDept = new Map<string, BudgetLine[]>()
    for (const line of lines) {
      const bucket = byDept.get(line.departmentId) ?? []
      bucket.push(line)
      byDept.set(line.departmentId, bucket)
    }
    return Array.from(byDept.entries()).map(([departmentId, deptLines]) => {
      const approvedCrore = round1(deptLines.reduce((s, l) => s + l.approvedCrore, 0))
      const revisedCrore = round1(deptLines.reduce((s, l) => s + l.revisedCrore, 0))
      const committedCrore = round1(deptLines.reduce((s, l) => s + l.committedCrore, 0))
      const actualCrore = round1(deptLines.reduce((s, l) => s + l.actualCrore, 0))
      const forecastYearEndCrore = round1(deptLines.reduce((s, l) => s + l.forecastYearEndCrore, 0))
      const phasedTarget = revisedCrore * FY_ELAPSED_FRACTION
      const variancePct = phasedTarget > 0 ? round1(((phasedTarget - actualCrore) / phasedTarget) * 100) : 0
      const matched = deptVarianceRows.find((r) => r.departmentId === departmentId)
      return {
        departmentId,
        approvedCrore,
        revisedCrore,
        committedCrore,
        actualCrore,
        forecastYearEndCrore,
        utilisationPct: revisedCrore > 0 ? round1((actualCrore / revisedCrore) * 100) : 0,
        variancePct,
        state: matched?.state ?? 'operational',
        riskNotes: Array.from(new Set(deptLines.map((l) => l.riskNote).filter((n): n is string => Boolean(n)))),
        lines: deptLines,
      }
    })
  }, [lines, deptVarianceRows])

  const headRows = useMemo(() => {
    const scope = selectedDepartmentId ? lines.filter((l) => l.departmentId === selectedDepartmentId) : lines
    return HEAD_ORDER.map((head) => {
      const headLines = scope.filter((l) => l.head === head)
      const approvedCrore = round1(headLines.reduce((s, l) => s + l.approvedCrore, 0))
      const revisedCrore = round1(headLines.reduce((s, l) => s + l.revisedCrore, 0))
      const committedCrore = round1(headLines.reduce((s, l) => s + l.committedCrore, 0))
      const actualCrore = round1(headLines.reduce((s, l) => s + l.actualCrore, 0))
      return {
        head,
        approvedCrore,
        revisedCrore,
        committedCrore,
        actualCrore,
        utilisationPct: revisedCrore > 0 ? round1((actualCrore / revisedCrore) * 100) : 0,
      }
    })
  }, [lines, selectedDepartmentId])

  const cityForecast = round1(lines.reduce((s, l) => s + l.forecastYearEndCrore, 0))
  const totals = totalsQuery.data
  const cityPhasedTarget = totals ? totals.revised * FY_ELAPSED_FRACTION : 0
  const cityVariancePct = totals && cityPhasedTarget > 0 ? round1(((cityPhasedTarget - totals.actual) / cityPhasedTarget) * 100) : 0

  const progressionPoints = totals
    ? [
        { label: t('Approved'), value: totals.approved },
        { label: t('Revised'), value: totals.revised },
        { label: t('Committed'), value: totals.committed },
        { label: t('Actual (YTD)'), value: totals.actual },
        { label: t('Forecast (Year-End)'), value: cityForecast },
      ]
    : []

  const behindPlan = [...departmentRows].filter((d) => d.variancePct > 25).sort((a, b) => b.variancePct - a.variancePct)
  const aheadOfPlan = [...departmentRows].filter((d) => d.variancePct < -25).sort((a, b) => a.variancePct - b.variancePct)

  const topProjectsByCost = useMemo(
    () =>
      [...projects]
        .filter((p) => p.status !== 'completed' && p.status !== 'closed')
        .sort((a, b) => b.currentCostCrore - a.currentCostCrore)
        .slice(0, 8),
    [projects],
  )

  const selectedDeptProjects = selectedDepartmentId ? projects.filter((p) => p.departmentId === selectedDepartmentId) : []
  const selectedDeptWardIds = Array.from(new Set(selectedDeptProjects.flatMap((p) => p.wardIds)))
  const selectedDeptWardRows = (wardVarianceQuery.data ?? []).filter((w) => selectedDeptWardIds.includes(w.wardId))

  const canRunScenario = allowed(user, 'budget', 'edit')

  const departmentColumns: Array<Column<DepartmentBudgetRow>> = [
    {
      id: 'department',
      header: t('Department'),
      cell: (row) => <span className="font-medium text-ink-800">{departmentName(row.departmentId)}</span>,
      sortValue: (row) => departmentName(row.departmentId),
      searchValue: (row) => departmentName(row.departmentId),
      width: '15rem',
    },
    {
      id: 'approved',
      header: t('Approved'),
      cell: (row) => <span className="numeric">{formatCrore(row.approvedCrore)}</span>,
      sortValue: (row) => row.approvedCrore,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'revised',
      header: t('Revised'),
      cell: (row) => <span className="numeric">{formatCrore(row.revisedCrore)}</span>,
      sortValue: (row) => row.revisedCrore,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'committed',
      header: t('Committed'),
      cell: (row) => <span className="numeric">{formatCrore(row.committedCrore)}</span>,
      sortValue: (row) => row.committedCrore,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'actual',
      header: t('Actual (YTD)'),
      cell: (row) => <span className="numeric font-medium">{formatCrore(row.actualCrore)}</span>,
      sortValue: (row) => row.actualCrore,
      align: 'right',
    },
    {
      id: 'utilisation',
      header: t('Utilisation'),
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <ProgressBar value={row.utilisationPct} size="xs" className="w-14" />
          <span className="numeric w-11 text-right font-semibold">{formatPercent(row.utilisationPct)}</span>
        </div>
      ),
      sortValue: (row) => row.utilisationPct,
      align: 'right',
    },
    {
      id: 'forecast',
      header: t('Forecast year-end'),
      cell: (row) => <span className="numeric">{formatCrore(row.forecastYearEndCrore)}</span>,
      sortValue: (row) => row.forecastYearEndCrore,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'variance',
      header: t('Variance vs phased plan'),
      cell: (row) => (
        <Badge
          tone={varianceTone(row.variancePct) === 'positive' ? 'positive' : varianceTone(row.variancePct) === 'warn' ? 'warn' : 'critical'}
          title={t('Positive = behind the phased plan (under-spent). Negative = ahead of the phased plan (over-spent).')}
        >
          {formatDelta(row.variancePct)}
        </Badge>
      ),
      sortValue: (row) => row.variancePct,
      align: 'right',
    },
    {
      id: 'risk',
      header: t('Risk note'),
      cell: (row) =>
        row.riskNotes.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-[0.6875rem] text-crit-700" title={row.riskNotes.join(' ')}>
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="max-w-[14rem] truncate">{row.riskNotes[0]}</span>
          </span>
        ) : (
          <span className="text-[0.6875rem] text-ink-300">-</span>
        ),
      sortValue: (row) => row.riskNotes.length,
      hideBelow: 'xl',
    },
  ]

  const scenarioDeptRows = useMemo(() => {
    if (!scenarioResult) return []
    const cityRevised = totals?.revised ?? departmentRows.reduce((s, d) => s + d.revisedCrore, 0)
    return departmentRows.map((dept) => {
      const capitalRevised = dept.lines.filter((l) => l.head === 'capital').reduce((s, l) => s + l.revisedCrore, 0)
      const revenueRevised = dept.lines.filter((l) => l.head === 'revenue').reduce((s, l) => s + l.revisedCrore, 0)
      const contingencyShare = cityRevised > 0 ? (dept.revisedCrore / cityRevised) * scenarioInputs.contingencyCrore : 0
      const scenarioRevised = round1(
        dept.revisedCrore +
          capitalRevised * (scenarioInputs.capitalAllocationDeltaPct / 100) +
          revenueRevised * (scenarioInputs.revenueExpenditureDeltaPct / 100) +
          contingencyShare,
      )
      const scenarioActual = round1(dept.actualCrore * (1 + scenarioInputs.collectionEfficiencyDeltaPct / 100))
      return {
        departmentId: dept.departmentId,
        baselineRevised: dept.revisedCrore,
        scenarioRevised,
        baselineUtilisation: dept.utilisationPct,
        scenarioUtilisation: scenarioRevised > 0 ? round1((scenarioActual / scenarioRevised) * 100) : 0,
      }
    })
  }, [scenarioResult, departmentRows, scenarioInputs, totals])

  const scenarioHeadroom = scenarioResult ? round1(scenarioResult.scenario.revisedCrore - scenarioResult.scenario.forecastYearEndCrore) : 0

  const scenarioRisks: string[] = useMemo(() => {
    if (!scenarioResult) return []
    const risks: string[] = []
    if (scenarioResult.scenario.utilisationPct > 100) {
      risks.push('Scenario utilisation exceeds 100% of the revised allocation - this would require an in-year revised sanction.')
    }
    if (scenarioResult.confidence === 'low') {
      risks.push('One or more inputs exceed a ±25% change; confidence in this scenario is assessed as low.')
    }
    if (scenarioResult.deltaCrore < 0) {
      risks.push('Net allocation falls under this scenario; committed capital works would require re-phasing or deferral.')
    }
    if (scenarioInputs.collectionEfficiencyDeltaPct < -10) {
      risks.push('A material fall in collection efficiency would constrain cash availability independent of the allocation change.')
    }
    if (risks.length === 0) {
      risks.push('No threshold-based risk condition is raised for this combination of inputs.')
    }
    return risks
  }, [scenarioResult, scenarioInputs])

  const anyLoading = linesQuery.isLoading || totalsQuery.isLoading || deptVarianceQuery.isLoading
  const anyError = linesQuery.error ?? totalsQuery.error ?? deptVarianceQuery.error

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Budget Intelligence') }]}
        freshness={FRESHNESS}
        actions={
          <LinkButton to={ROUTES.projects} variant="outline" icon={<HardHat className="h-3.5 w-3.5" />}>
            {t('Open Project Intelligence')}
          </LinkButton>
        }
      />

      {anyLoading ? <LoadingState variant="metrics" /> : null}
      {anyError ? <ErrorState detail={anyError.message} onRetry={() => { void linesQuery.refetch(); void totalsQuery.refetch(); void deptVarianceQuery.refetch() }} /> : null}

      {!anyLoading && !anyError && totals ? (
        <>
          <Card>
            <CardHeader
              eyebrow={t('FY 2026–27 · Year to date')}
              title={t('City budget position')}
              description={t('Revised allocation, booked expenditure and commitment position against the phased plan. Variance is measured against the phased (31% elapsed) plan, not the full annual allocation - positive means behind plan, negative means ahead of plan.')}
            />
            <MetricGrid columns={5} className="mt-4">
              <MetricCard label={t('Revised budget')} value={formatCrore(totals.revised)} support={t('of {0} approved', formatCrore(totals.approved))} />
              <MetricCard
                label={t('Actual expenditure - YTD')}
                value={formatCrore(totals.actual)}
                support={`${formatPercent(totals.utilisationPct)} utilisation`}
                progress={{ value: totals.utilisationPct, max: 100 }}
              />
              <MetricCard label={t('Committed')} value={formatCrore(totals.committed)} support={t('Contracted but not yet booked')} />
              <MetricCard
                label={t('Forecast - year end')}
                value={formatCrore(cityForecast)}
                support={t('{0} vs revised allocation', formatDelta(((cityForecast - totals.revised) / totals.revised) * 100))}
              />
              <MetricCard
                label={t('Variance vs phased plan')}
                value={formatDelta(cityVariancePct)}
                support={cityVariancePct > 0 ? 'Behind the phased plan' : cityVariancePct < 0 ? 'Ahead of the phased plan' : 'On the phased plan'}
                tone={varianceTone(cityVariancePct) === 'positive' ? 'default' : varianceTone(cityVariancePct) === 'warn' ? 'warn' : 'critical'}
              />
            </MetricGrid>
          </Card>

          {/* Two columns. The registers an officer works down — departments,
              their heads, the wards behind them, then the works and the
              scenario run against all of it — hold the wide column; the
              departments materially off plan and the year's control-stage
              progression stand beside them as the exception and the trend. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-4 xl:order-2 xl:col-span-4">
          {(behindPlan.length > 0 || aheadOfPlan.length > 0) && (
            <Card tone="warn">
              <CardHeader
                icon={<AlertTriangle className="h-4 w-4" />}
                title={t('Departments materially off the phased plan')}
                description={t('Departments whose year-to-date position diverges from the phased plan by more than 25 percentage points, with the institutional consequence stated.')}
              />
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-1">
                {behindPlan.map((d) => (
                  <div key={d.departmentId} className="flex items-start gap-2 rounded-md border border-crit-200 bg-crit-50/50 p-2.5">
                    <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crit-600" />
                    <p className="text-xs leading-relaxed text-ink-700">
                      <span className="font-semibold">{departmentName(d.departmentId)}</span>{' '}{t('trails the phased plan by')}{' '}
                      <span className="font-semibold text-crit-700">{formatDelta(d.variancePct)}</span>{t('. At the current pace, the department is at risk of failing to deliver its sanctioned programme within the financial year without re-phasing or accelerated execution.')}
                    </p>
                  </div>
                ))}
                {aheadOfPlan.map((d) => (
                  <div key={d.departmentId} className="flex items-start gap-2 rounded-md border border-warn-200 bg-warn-50/50 p-2.5">
                    <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn-600" />
                    <p className="text-xs leading-relaxed text-ink-700">
                      <span className="font-semibold">{departmentName(d.departmentId)}</span>{' '}{t('is running')}{' '}
                      <span className="font-semibold text-warn-700">{formatDelta(Math.abs(d.variancePct))}</span>{' '}{t('ahead of the phased plan. Expenditure pace requires commitment verification against available allocation before further release.')}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <ChartFrame
              title={t('Financial position progression')}
              unit={t('₹ crore')}
              timeframe="FY 2026–27 - control stages, not a calendar series"
              description={t('Progression across the financial control stages for the current year: approved, revised, committed, actual to date and the modelled year-end forecast.')}
              freshness={FRESHNESS}
              height={260}
            >
              <TrendChart points={progressionPoints} unit={t('₹ Cr')} variant="area" seriesLabel="₹ Crore" />
            </ChartFrame>
          </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-4 xl:order-1 xl:col-span-8">
          <Card flush>
            <CardHeader
              bordered
              title={t('Department variance')}
              description={t('Sortable and searchable. Click a department to drill into its head breakdown, linked wards and projects below.')}
            />
            <DataTable
              rows={departmentRows}
              columns={departmentColumns}
              rowKey={(row) => row.departmentId}
              pageSize={10}
              stickyHeader
              maxHeight="26rem"
              searchPlaceholder="Search departments"
              onRowClick={(row) => setSelectedDepartmentId(row.departmentId === selectedDepartmentId ? null : row.departmentId)}
              activeRowKey={selectedDepartmentId ?? undefined}
            />
          </Card>

          <Card>
            <CardHeader
              title={selectedDepartmentId ? `Head, ward and project drilldown - ${departmentName(selectedDepartmentId)}` : 'Head breakdown - all departments'}
              description={
                selectedDepartmentId
                  ? 'Budget heads, capital-linked wards and projects for the selected department. Select the department row again to clear.'
                  : 'Revenue, capital, establishment and debt-service expenditure, city-wide. Select a department above to scope this view.'
              }
              actions={
                selectedDepartmentId ? (
                  <Button size="xs" variant="ghost" onClick={() => setSelectedDepartmentId(null)}>
                    {t('Clear selection')}
                  </Button>
                ) : undefined
              }
            />
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="scrollbar-slim overflow-x-auto">
                <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-ink-100 text-ink-400">
                      <th className="label-institutional py-1.5 pr-2 font-semibold">{t('Head')}</th>
                      <th className="label-institutional py-1.5 px-2 text-right font-semibold">{t('Approved')}</th>
                      <th className="label-institutional py-1.5 px-2 text-right font-semibold">{t('Revised')}</th>
                      <th className="label-institutional py-1.5 px-2 text-right font-semibold">{t('Actual')}</th>
                      <th className="label-institutional py-1.5 pl-2 text-right font-semibold">{t('Utilisation')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {headRows.map((h) => (
                      <tr key={h.head}>
                        <td className="py-1.5 pr-2 font-medium text-ink-800">{BUDGET_HEAD_LABEL[h.head]}</td>
                        <td className="numeric py-1.5 px-2 text-right text-ink-600">{formatCrore(h.approvedCrore)}</td>
                        <td className="numeric py-1.5 px-2 text-right text-ink-600">{formatCrore(h.revisedCrore)}</td>
                        <td className="numeric py-1.5 px-2 text-right font-medium text-ink-800">{formatCrore(h.actualCrore)}</td>
                        <td className="numeric py-1.5 pl-2 text-right font-semibold text-ink-800">{formatPercent(h.utilisationPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedDepartmentId && departmentRows.find((d) => d.departmentId === selectedDepartmentId)?.riskNotes.length ? (
                  <div className="mt-3 space-y-1.5">
                    {departmentRows
                      .find((d) => d.departmentId === selectedDepartmentId)
                      ?.riskNotes.map((note) => (
                        <p key={note} className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-crit-700">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          {note}
                        </p>
                      ))}
                  </div>
                ) : null}
              </div>

              <div className="h-52">
                <DonutChart
                  data={headRows.map((h) => ({ label: BUDGET_HEAD_LABEL[h.head], value: h.revisedCrore, colour: HEAD_COLOUR[h.head] }))}
                  unit={t('₹ Cr')}
                  centreValue={formatCrore(headRows.reduce((s, h) => s + h.revisedCrore, 0), 0)}
                  centreLabel="Revised allocation"
                />
              </div>
            </div>

            {selectedDepartmentId ? (
              <div className="mt-4 grid grid-cols-1 gap-4 border-t border-ink-100 pt-4 lg:grid-cols-2">
                <div>
                  <p className="label-institutional mb-2">{t('Wards with capital exposure ({0})', selectedDeptWardRows.length)}</p>
                  {selectedDeptWardRows.length === 0 ? (
                    <p className="text-xs text-ink-400">{t('No ward-attributable capital projects recorded for this department.')}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {selectedDeptWardRows.slice(0, 8).map((w) => (
                        <li key={w.wardId} className="flex items-center justify-between text-xs">
                          <span className="text-ink-600">{wardName(w.wardId)}</span>
                          <span className="numeric font-medium text-ink-800">
                            {formatCrore(w.spentCrore)} / {formatCrore(w.allocatedCrore)} ({formatPercent(w.utilisationPct)})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="label-institutional mb-2">{t('Linked projects ({0})', selectedDeptProjects.length)}</p>
                  {selectedDeptProjects.length === 0 ? (
                    <p className="text-xs text-ink-400">{t('No capital projects are currently linked to this department.')}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {selectedDeptProjects.slice(0, 8).map((p) => (
                        <li key={p.id}>
                          <LinkButton to={`${ROUTES.projects}?project=${p.id}`} variant="ghost" size="xs" className="w-full justify-between">
                            <span className="truncate">{p.name}</span>
                            <span className="numeric ml-2 shrink-0 text-ink-500">{formatCrore(p.currentCostCrore)}</span>
                          </LinkButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </Card>

            <Card flush>
              <CardHeader bordered title={t('Ward variance')} description={t('Capital allocation and spend by ward, from the finance service ward variance view.')} />
              <DataTable
                rows={wardVarianceQuery.data ?? []}
                columns={[
                  {
                    id: 'ward',
                    header: t('Ward'),
                    cell: (row) => <span className="font-medium text-ink-800">{wardName(row.wardId)}</span>,
                    sortValue: (row) => wardName(row.wardId),
                    searchValue: (row) => wardName(row.wardId),
                  },
                  {
                    id: 'allocated',
                    header: t('Allocated'),
                    cell: (row) => <span className="numeric">{formatCrore(row.allocatedCrore)}</span>,
                    sortValue: (row) => row.allocatedCrore,
                    align: 'right',
                  },
                  {
                    id: 'spent',
                    header: t('Spent'),
                    cell: (row) => <span className="numeric font-medium">{formatCrore(row.spentCrore)}</span>,
                    sortValue: (row) => row.spentCrore,
                    align: 'right',
                  },
                  {
                    id: 'utilisation',
                    header: t('Utilisation'),
                    cell: (row) => (
                      <div className="flex items-center justify-end gap-2">
                        <ProgressBar value={row.utilisationPct} size="xs" className="w-14" />
                        <span className="numeric w-11 text-right font-semibold">{formatPercent(row.utilisationPct)}</span>
                      </div>
                    ),
                    sortValue: (row) => row.utilisationPct,
                    align: 'right',
                  },
                ]}
                rowKey={(row) => row.wardId}
                pageSize={8}
                stickyHeader
                maxHeight="22rem"
                searchPlaceholder="Search wards"
              />
            </Card>

          <Card flush>
            <CardHeader
              bordered
              title={t('Project expenditure linkage')}
              description={t('The largest active capital commitments by current cost, linking budget utilisation to physical delivery in Project Intelligence.')}
            />
            <DataTable
              rows={topProjectsByCost}
              columns={projectLinkageColumns}
              rowKey={(row) => row.id}
              searchable={false}
              pageSize={8}
            />
          </Card>

          <Card>
            <CardHeader
              icon={<Landmark className="h-4 w-4" />}
              title={t('Budget scenario analysis')}
              description={t('Model the effect of a capital allocation change, a revenue expenditure change, a collection efficiency change and an additional contingency reserve on city and departmental utilisation. This is a simulation constructed from published, deterministic logic - it is never a forecast and never a budget instruction.')}
              actions={<SimulationBadge />}
            />

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div>
                <Label htmlFor="capital-delta" hint="%">{t('Capital allocation delta')}</Label>
                <Input
                  id="capital-delta"
                  type="number"
                  step={1}
                  value={scenarioInputs.capitalAllocationDeltaPct}
                  onChange={(e) => setScenarioInputs((s) => ({ ...s, capitalAllocationDeltaPct: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label htmlFor="revenue-delta" hint="%">{t('Revenue expenditure delta')}</Label>
                <Input
                  id="revenue-delta"
                  type="number"
                  step={1}
                  value={scenarioInputs.revenueExpenditureDeltaPct}
                  onChange={(e) => setScenarioInputs((s) => ({ ...s, revenueExpenditureDeltaPct: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label htmlFor="collection-delta" hint="%">{t('Collection efficiency delta')}</Label>
                <Input
                  id="collection-delta"
                  type="number"
                  step={1}
                  value={scenarioInputs.collectionEfficiencyDeltaPct}
                  onChange={(e) => setScenarioInputs((s) => ({ ...s, collectionEfficiencyDeltaPct: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label htmlFor="contingency" hint={t('₹ crore')}>{t('Contingency reserve')}</Label>
                <Input
                  id="contingency"
                  type="number"
                  step={1}
                  min={0}
                  value={scenarioInputs.contingencyCrore}
                  onChange={(e) => setScenarioInputs((s) => ({ ...s, contingencyCrore: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="primary"
                disabled={!canRunScenario || scenarioPending}
                title={canRunScenario ? undefined : 'Your role does not hold budget:edit. This control is disabled by the permission engine.'}
                onClick={() => {
                  setScenarioPending(true)
                  setScenarioError(null)
                  runScenario(scenarioInputs)
                    .then((result) => setScenarioResult(result))
                    .catch((err: unknown) => setScenarioError(err instanceof Error ? err.message : 'The scenario could not be run.'))
                    .finally(() => setScenarioPending(false))
                }}
              >
                {scenarioPending ? 'Running scenario…' : 'Run scenario'}
              </Button>
              {scenarioResult ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setScenarioInputs({ capitalAllocationDeltaPct: 0, revenueExpenditureDeltaPct: 0, collectionEfficiencyDeltaPct: 0, contingencyCrore: 0 })
                    setScenarioResult(null)
                  }}
                >
                  {t('Reset')}
                </Button>
              ) : null}
            </div>
            {scenarioError ? <p className="mt-2 text-xs text-crit-600">{scenarioError}</p> : null}

            {scenarioResult ? (
              <div className="mt-4 space-y-4 border-t border-ink-100 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SimulationBadge />
                  <Badge tone="warn">{t('Simulation - not forecast')}</Badge>
                  <Badge tone={scenarioResult.confidence === 'high' ? 'positive' : scenarioResult.confidence === 'medium' ? 'warn' : 'risk'}>
                    {scenarioResult.confidence} confidence
                  </Badge>
                </div>

                <MetricGrid columns={4}>
                  <MetricCard
                    label={t('Projected utilisation')}
                    value={formatPercent(scenarioResult.scenario.utilisationPct)}
                    support={t('Baseline {0}', formatPercent(scenarioResult.baseline.utilisationPct))}
                  />
                  <MetricCard
                    label={t('Revised allocation')}
                    value={formatCrore(scenarioResult.scenario.revisedCrore)}
                    support={t('{0} vs baseline', formatDelta((scenarioResult.deltaCrore / scenarioResult.baseline.revisedCrore) * 100))}
                  />
                  <MetricCard
                    label={t('Headroom')}
                    value={formatCrore(scenarioHeadroom)}
                    support={t('Revised allocation less year-end forecast')}
                    tone={scenarioHeadroom < 0 ? 'critical' : 'default'}
                  />
                  <MetricCard label={t('Forecast - year end')} value={formatCrore(scenarioResult.scenario.forecastYearEndCrore)} />
                </MetricGrid>

                <div>
                  <p className="label-institutional mb-2">{t('Per-department movement - baseline → scenario')}</p>
                  <p className="mb-2 text-[0.6875rem] leading-relaxed text-ink-400">
                    {t('Departmental figures apply the same scenario formula used city-wide, with the contingency reserve distributed in proportion to each department\'s share of revised allocation. This is an illustrative allocation, not a resource-allocation decision.')}
                  </p>
                  <div className="scrollbar-slim max-h-64 overflow-auto">
                    <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-surface">
                        <tr className="border-b border-ink-100 text-ink-400">
                          <th className="label-institutional py-1.5 pr-2 font-semibold">{t('Department')}</th>
                          <th className="label-institutional py-1.5 px-2 text-right font-semibold">{t('Baseline revised')}</th>
                          <th className="label-institutional py-1.5 px-2 text-right font-semibold">{t('Scenario revised')}</th>
                          <th className="label-institutional py-1.5 px-2 text-right font-semibold">{t('Baseline util.')}</th>
                          <th className="label-institutional py-1.5 pl-2 text-right font-semibold">{t('Scenario util.')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-50">
                        {scenarioDeptRows.map((row) => (
                          <tr key={row.departmentId}>
                            <td className="py-1.5 pr-2 font-medium text-ink-800">{departmentName(row.departmentId)}</td>
                            <td className="numeric py-1.5 px-2 text-right text-ink-600">{formatCrore(row.baselineRevised)}</td>
                            <td className="numeric py-1.5 px-2 text-right font-medium text-ink-800">{formatCrore(row.scenarioRevised)}</td>
                            <td className="numeric py-1.5 px-2 text-right text-ink-500">{formatPercent(row.baselineUtilisation)}</td>
                            <td
                              className={`numeric py-1.5 pl-2 text-right font-semibold ${row.scenarioUtilisation > 100 ? 'text-crit-700' : 'text-ink-800'}`}
                            >
                              {formatPercent(row.scenarioUtilisation)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <p className="label-institutional mb-2">{t('Risks this scenario raises')}</p>
                  <ul className="space-y-1.5">
                    {scenarioRisks.map((risk) => (
                      <li key={risk} className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-600">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warn-600" />
                        {risk}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </Card>
          </div>
          </div>
        </>
      ) : null}

      {!anyLoading && !anyError && !totals ? (
        <EmptyState title={t('No budget position available')} detail="The finance service did not return a city-wide budget position for the current scope." />
      ) : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

function build$projectLinkageColumns(): Array<Column<Project>> {
  return [
  {
    id: 'project',
    header: t('Project'),
    cell: (row) => (
      <LinkButton to={`${ROUTES.projects}?project=${row.id}`} variant="ghost" size="xs" className="justify-start px-0 font-medium text-govt-700">
        {row.name}
      </LinkButton>
    ),
    sortValue: (row) => row.name,
    searchValue: (row) => row.name,
    width: '22rem',
  },
  {
    id: 'department',
    header: t('Department'),
    cell: (row) => departmentName(row.departmentId),
    sortValue: (row) => departmentName(row.departmentId),
    hideBelow: 'md',
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
    header: t('Paid to date'),
    cell: (row) => <span className="numeric">{formatCrore(row.paidCrore)}</span>,
    sortValue: (row) => row.paidCrore,
    align: 'right',
  },
  {
    id: 'state',
    header: t('Status'),
    cell: (row) => <StateBadge state={row.status === 'delayed' || row.status === 'on-hold' ? 'at-risk' : 'operational'} />,
    sortValue: (row) => row.status,
    hideBelow: 'sm',
  },
]
}
let projectLinkageColumns: Array<Column<Project>> = build$projectLinkageColumns()
registerLayer(() => {
  projectLinkageColumns = build$projectLinkageColumns()
})

export default BudgetIntelligencePage
