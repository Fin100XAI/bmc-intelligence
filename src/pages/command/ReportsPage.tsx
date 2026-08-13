import { useState, type ReactNode } from 'react'
import {
  Banknote,
  Bot,
  CalendarClock,
  FileStack,
  HardHat,
  Landmark,
  MapPinned,
  Printer,
  ShieldCheck,
  Siren,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, DefinitionList, DefinitionRow } from '@/components/ui/primitives'
import { ClassificationBadge, SeverityBadge, StateBadge } from '@/components/ui/badges'
import { Tabs } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import {
  aiService,
  financeService,
  monsoonService,
  projectService,
  revenueService,
  securityService,
  wardService,
} from '@/services'
import { buildCityPosition } from '@/domains'
import { useCurrentUser } from '@/stores/auth.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { allowed } from '@/security'
import { municipality } from '@/config/municipality.config'
import { departmentName, wardName } from '@/data/reference'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCrore, formatDate, formatDateTime, formatPercent, formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { DataClassification, OperationalState } from '@/types/common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Report Workspace.
 *
 * Each report is a genuine institutional document - masthead, generated
 * timestamp, acting officer, classification, a data-provenance statement,
 * then real sections built from live service data. `window.print()` and the
 * shared print utility classes produce a clean, chrome-free document.
 */

type ReportId =
  | 'daily-brief'
  | 'ward-performance'
  | 'monsoon-readiness'
  | 'project-risk'
  | 'revenue'
  | 'budget-utilisation'
  | 'security'
  | 'ai-governance'

interface ReportDef {
  id: ReportId
  title: string
  icon: ReactNode
  classification: DataClassification
}

function build$REPORTS(): ReportDef[] {
  return [
  { id: 'daily-brief', title: t('Daily Commissioner Brief'), icon: <FileStack className="h-3.5 w-3.5" />, classification: 'confidential' },
  { id: 'ward-performance', title: t('Ward Performance Report'), icon: <MapPinned className="h-3.5 w-3.5" />, classification: 'internal' },
  { id: 'monsoon-readiness', title: t('Monsoon Readiness Report'), icon: <Siren className="h-3.5 w-3.5" />, classification: 'internal' },
  { id: 'project-risk', title: t('Project Risk Report'), icon: <HardHat className="h-3.5 w-3.5" />, classification: 'internal' },
  { id: 'revenue', title: t('Revenue Report'), icon: <Banknote className="h-3.5 w-3.5" />, classification: 'confidential' },
  { id: 'budget-utilisation', title: t('Budget Utilisation Report'), icon: <Landmark className="h-3.5 w-3.5" />, classification: 'confidential' },
  { id: 'security', title: t('Security Report'), icon: <ShieldCheck className="h-3.5 w-3.5" />, classification: 'restricted' },
  { id: 'ai-governance', title: t('AI Governance Report'), icon: <Bot className="h-3.5 w-3.5" />, classification: 'confidential' },
]
}
let REPORTS: ReportDef[] = build$REPORTS()
registerLayer(() => {
  REPORTS = build$REPORTS()
})

function ReportMasthead({ title, classification, children }: { title: string; classification: DataClassification; children: ReactNode }): React.JSX.Element {
  const user = useCurrentUser()
  return (
    <div>
      <header className="mb-5 border-b-2 border-ink-900 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label-institutional">{municipality.municipalityName} · {municipality.branding.productName}</p>
            <h1 className="mt-1 text-xl font-bold text-ink-900">{title}</h1>
          </div>
          <ClassificationBadge classification={classification} size="sm" />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-ink-400">{t('Generated')}</dt>
            <dd className="numeric text-ink-700">{formatDateTime(DEMO_NOW)}</dd>
          </div>
          <div>
            <dt className="text-ink-400">{t('Acting officer')}</dt>
            <dd className="text-ink-700">{user ? `${user.name} · ${user.designation}` : '-'}</dd>
          </div>
          <div>
            <dt className="text-ink-400">{t('Financial year')}</dt>
            <dd className="text-ink-700">{municipality.financialYear}</dd>
          </div>
          <div>
            <dt className="text-ink-400">{t('Data provenance')}</dt>
            <dd className="text-ink-700">{t('Modelled figures - not connected to live {0} systems', municipality.shortName)}</dd>
          </div>
        </dl>
      </header>
      <div className="space-y-5">{children}</div>
    </div>
  )
}

function ReportSection({ title, description, children }: { title: string; description?: string; children: ReactNode }): React.JSX.Element {
  return (
    <section>
      <h2 className="text-[0.9375rem] font-semibold text-ink-900">{title}</h2>
      {description ? <p className="mt-0.5 text-xs text-ink-500">{description}</p> : null}
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

interface ReportColumn<T> {
  header: string
  align?: 'left' | 'right'
  cell: (row: T) => ReactNode
}

function ReportTable<T>({ columns, rows, keyFn }: { columns: Array<ReportColumn<T>>; rows: T[]; keyFn: (row: T) => string }): React.JSX.Element {
  if (rows.length === 0) return <p className="text-xs text-ink-400">{t('No records for this section.')}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-ink-300">
            {columns.map((c, i) => (
              <th key={i} className={cn('label-institutional py-1.5 pr-3 font-semibold whitespace-nowrap', c.align === 'right' && 'text-right')}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => (
            <tr key={keyFn(row)}>
              {columns.map((c, i) => (
                <td key={i} className={cn('py-1.5 pr-3 align-top text-ink-700', c.align === 'right' && 'numeric text-right')}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ==========================================================================
   Individual reports - each owns its own queries and loading/error states
   ========================================================================== */

function DailyBriefReportBody(): React.JSX.Element {
  const position = buildCityPosition()
  return (
    <ReportMasthead title={t('Daily Commissioner Brief')} classification="confidential">
      <ReportSection title={t('City position')} description={t('Composite operational health across every domain.')}>
        <DefinitionList>
          <DefinitionRow label={t('City health score')}><span className="numeric font-semibold">{position.healthScore}/100</span> - <StateBadge state={position.state} /></DefinitionRow>
          <DefinitionRow label={t('Critical / high alerts open')}>{t('{0} critical, {1} high', position.criticalAlerts, position.highAlerts)}</DefinitionRow>
          <DefinitionRow label={t('Priority decisions')}>{t('{0} draft or under review', position.priorityDecisions)}</DefinitionRow>
          <DefinitionRow label={t('Services at risk')}>{t('{0} categories below SLA threshold', position.servicesAtRisk)}</DefinitionRow>
          <DefinitionRow label={t('Active incidents')}>{position.activeIncidents}</DefinitionRow>
        </DefinitionList>
      </ReportSection>

      <ReportSection title={t('Top risks')} description={t('Highest-severity open intelligence, city-wide.')}>
        <ReportTable
          keyFn={(r) => r.id}
          rows={position.topRisks.slice(0, 8)}
          columns={[
            { header: t('Severity'), cell: (r) => <SeverityBadge severity={r.severity} /> },
            { header: t('Item'), cell: (r) => r.title },
            { header: t('Ward(s)'), cell: (r) => r.wardIds.map((w) => wardName(w)).join(', ') || 'City-wide' },
            { header: t('Department'), cell: (r) => departmentName(r.departmentId) },
            { header: t('Raised'), cell: (r) => formatRelative(r.createdAt) },
          ]}
        />
      </ReportSection>

      <ReportSection title={t('Financial position')}>
        <DefinitionList>
          <DefinitionRow label={t('Revenue collected vs target')}>{t('{0} of {1} ({2})', formatCrore(position.revenue.collectedCrore), formatCrore(position.revenue.targetCrore), formatPercent(position.revenue.efficiencyPct))}</DefinitionRow>
          <DefinitionRow label={t('Budget utilisation')}>{t('{0} of {1} revised allocation', formatPercent(position.budget.utilisationPct), formatCrore(position.budget.revisedCrore))}</DefinitionRow>
          <DefinitionRow label={t('Capital works at risk')}>{t('{0} of {1} active', position.projects.atRisk, position.projects.total)}</DefinitionRow>
        </DefinitionList>
      </ReportSection>

      <ReportSection title={t('Infrastructure and monsoon')}>
        <DefinitionList>
          <DefinitionRow label={t('Water supply position')}>{t('{0} MLD supplied against {1} MLD demand ({2} zone(s) at risk)', position.water.supplyMld.toFixed(0), position.water.demandMld.toFixed(0), position.water.zonesAtRisk)}</DefinitionRow>
          <DefinitionRow label={t('Monsoon readiness')}>{position.monsoon.readinessScore}/100 mean ward readiness; {position.monsoon.wardsBelowThreshold}{' '}{t('ward(s) below threshold')}</DefinitionRow>
          <DefinitionRow label={t('Public health')}>{t('Highest outbreak signal {0}/100 across {1} ward(s)', position.health.highestSignal, position.health.wardsWithSignal)}</DefinitionRow>
        </DefinitionList>
      </ReportSection>
    </ReportMasthead>
  )
}

interface WardPerformanceRow {
  wardId: string
  code: string
  name: string
  region: string
  health: number
  risk: number
  state: OperationalState
  openComplaints: number
  monsoonReadiness: number | undefined
  budgetUtilisation: number
}

function WardPerformanceReportBody(): React.JSX.Element {
  const query = useServiceQuery(queryKeys.wards('report-performance'), async (u) => {
    const wards = await wardService.list(u)
    const comparison = await wardService.compare(u, wards.map((w) => w.id))
    const metric = new Map(comparison.map((row) => [row.id, row]))
    const rows: WardPerformanceRow[] = wards.map((w) => ({
      wardId: w.id,
      code: w.code,
      name: w.name.split(' · ')[0] ?? w.name,
      region: w.region,
      health: w.healthScore,
      risk: w.riskScore,
      state: w.state,
      openComplaints: metric.get('complaints-open')?.values[w.id] ?? 0,
      monsoonReadiness: metric.get('monsoon')?.values[w.id],
      budgetUtilisation: metric.get('budget')?.values[w.id] ?? 0,
    }))
    return rows
  })
  if (query.isLoading) return <LoadingState variant="table" rows={10} />
  if (query.error) return <ErrorState detail={query.error.message} onRetry={() => query.refetch()} />
  const rows = [...(query.data ?? [])].sort((a, b) => b.risk - a.risk)
  if (rows.length === 0) return <EmptyState title={t('No ward records available')} />
  const avgHealth = rows.reduce((s, r) => s + r.health, 0) / rows.length

  return (
    <ReportMasthead title={t('Ward Performance Report')} classification="internal">
      <ReportSection title={t('City-wide summary')}>
        <DefinitionList>
          <DefinitionRow label={t('Wards reported')}>{rows.length}</DefinitionRow>
          <DefinitionRow label={t('Average operational health')}>{avgHealth.toFixed(1)}/100</DefinitionRow>
          <DefinitionRow label={t('Total open complaints')}>{rows.reduce((s, r) => s + r.openComplaints, 0)}</DefinitionRow>
        </DefinitionList>
      </ReportSection>
      <ReportSection title={t('Ward-by-ward position')} description={t('Ranked by composite risk index, highest first.')}>
        <ReportTable
          keyFn={(r) => r.wardId}
          rows={rows}
          columns={[
            { header: t('Ward'), cell: (r) => `${r.code} - ${r.name}` },
            { header: t('Region'), cell: (r) => r.region },
            { header: t('Health'), align: 'right', cell: (r) => r.health },
            { header: t('Risk'), align: 'right', cell: (r) => r.risk },
            { header: t('Open complaints'), align: 'right', cell: (r) => r.openComplaints },
            { header: t('Monsoon readiness'), align: 'right', cell: (r) => r.monsoonReadiness ?? '-' },
            { header: t('Budget utilisation'), align: 'right', cell: (r) => formatPercent(r.budgetUtilisation) },
            { header: t('State'), cell: (r) => <StateBadge state={r.state} /> },
          ]}
        />
      </ReportSection>
    </ReportMasthead>
  )
}

function MonsoonReadinessReportBody(): React.JSX.Element {
  const readinessQuery = useServiceQuery(queryKeys.monsoon('report-readiness'), (u) => monsoonService.readiness(u))
  const pumpsQuery = useServiceQuery(queryKeys.monsoon('report-pumps'), (u) => monsoonService.pumpingStations(u))
  if (readinessQuery.isLoading || pumpsQuery.isLoading) return <LoadingState variant="table" rows={10} />
  if (readinessQuery.error) return <ErrorState detail={readinessQuery.error.message} onRetry={() => readinessQuery.refetch()} />
  const readiness = [...(readinessQuery.data ?? [])].sort((a, b) => a.readinessScore - b.readinessScore)
  const pumps = pumpsQuery.data ?? []
  const avgReadiness = readiness.length > 0 ? readiness.reduce((s, r) => s + r.readinessScore, 0) / readiness.length : 0
  const pumpsOperational = pumps.reduce((s, p) => s + p.pumpsOperational, 0)
  const pumpsTotal = pumps.reduce((s, p) => s + p.pumpsTotal, 0)

  return (
    <ReportMasthead title={t('Monsoon Readiness Report')} classification="internal">
      <ReportSection title={t('Readiness summary')}>
        <DefinitionList>
          <DefinitionRow label={t('Mean ward readiness')}>{avgReadiness.toFixed(1)}/100</DefinitionRow>
          <DefinitionRow label={t('Wards below 70/100')}>{readiness.filter((r) => r.readinessScore < 70).length} of {readiness.length}</DefinitionRow>
          <DefinitionRow label={t('Pumping capacity operational')}>{t('{0} of {1} pumps', pumpsOperational, pumpsTotal)}</DefinitionRow>
        </DefinitionList>
      </ReportSection>
      <ReportSection title={t('Ward readiness')} description={t('Ranked lowest readiness first - the priority order for pre-monsoon works.')}>
        <ReportTable
          keyFn={(r) => r.wardId}
          rows={readiness}
          columns={[
            { header: t('Ward'), cell: (r) => wardName(r.wardId) },
            { header: t('Readiness'), align: 'right', cell: (r) => r.readinessScore },
            { header: t('Desilting'), align: 'right', cell: (r) => formatPercent(r.desiltingPct) },
            { header: t('Pump readiness'), align: 'right', cell: (r) => formatPercent(r.pumpReadiness) },
            { header: t('Flood spots'), align: 'right', cell: (r) => r.floodSpots },
            { header: t('Mitigated'), align: 'right', cell: (r) => r.spotsMitigated },
            { header: t('State'), cell: (r) => <StateBadge state={r.state} /> },
          ]}
        />
      </ReportSection>
      <ReportSection title={t('Pumping stations')}>
        <ReportTable
          keyFn={(p) => p.id}
          rows={[...pumps].sort((a, b) => a.readinessIndex - b.readinessIndex)}
          columns={[
            { header: t('Station'), cell: (p) => p.name },
            { header: t('Ward'), cell: (p) => wardName(p.wardId) },
            { header: t('Pumps'), align: 'right', cell: (p) => `${p.pumpsOperational} / ${p.pumpsTotal}` },
            { header: t('Standby power'), cell: (p) => (p.standbyPowerAvailable ? 'Available' : 'Not available') },
            { header: t('Readiness'), align: 'right', cell: (p) => p.readinessIndex },
          ]}
        />
      </ReportSection>
    </ReportMasthead>
  )
}

function ProjectRiskReportBody(): React.JSX.Element {
  const query = useServiceQuery(queryKeys.projects('report-risk'), (u) => projectService.list(u, { pageSize: 300 }))
  if (query.isLoading) return <LoadingState variant="table" rows={10} />
  if (query.error) return <ErrorState detail={query.error.message} onRetry={() => query.refetch()} />
  const projects = [...(query.data?.items ?? [])].sort((a, b) => b.riskScore - a.riskScore)
  if (projects.length === 0) return <EmptyState title={t('No projects available')} />
  const atRisk = projects.filter((p) => p.riskScore >= 60)
  const delayed = projects.filter((p) => p.status === 'delayed')
  const sanctioned = projects.reduce((s, p) => s + p.sanctionedCostCrore, 0)

  return (
    <ReportMasthead title={t('Project Risk Report')} classification="internal">
      <ReportSection title={t('Portfolio summary')}>
        <DefinitionList>
          <DefinitionRow label={t('Projects reported')}>{projects.length}</DefinitionRow>
          <DefinitionRow label={t('At risk (score ≥ 60)')}>{atRisk.length}</DefinitionRow>
          <DefinitionRow label={t('Delayed')}>{delayed.length}</DefinitionRow>
          <DefinitionRow label={t('Sanctioned exposure')}>{formatCrore(sanctioned)}</DefinitionRow>
        </DefinitionList>
      </ReportSection>
      <ReportSection title={t('Highest-risk works')} description={t('Top 20 by composite project risk score.')}>
        <ReportTable
          keyFn={(p) => p.id}
          rows={projects.slice(0, 20)}
          columns={[
            { header: t('Reference'), cell: (p) => p.reference },
            { header: t('Project'), cell: (p) => p.name },
            { header: t('Ward(s)'), cell: (p) => p.wardIds.map((w) => wardName(w)).join(', ') },
            { header: t('Department'), cell: (p) => departmentName(p.departmentId) },
            { header: t('Status'), cell: (p) => p.status },
            { header: t('Physical progress'), align: 'right', cell: (p) => formatPercent(p.completionPct) },
            { header: t('Risk'), align: 'right', cell: (p) => p.riskScore },
            { header: t('Sanctioned'), align: 'right', cell: (p) => formatCrore(p.sanctionedCostCrore) },
          ]}
        />
      </ReportSection>
    </ReportMasthead>
  )
}

function RevenueReportBody(): React.JSX.Element {
  const totalsQuery = useServiceQuery(queryKeys.revenue('report-totals'), (u) => revenueService.totals(u))
  const recordsQuery = useServiceQuery(queryKeys.revenue('report-records'), (u) => revenueService.records(u, { pageSize: 200 }))
  if (totalsQuery.isLoading || recordsQuery.isLoading) return <LoadingState variant="table" rows={8} />
  if (totalsQuery.error) return <ErrorState detail={totalsQuery.error.message} onRetry={() => totalsQuery.refetch()} />
  const totals = totalsQuery.data
  const records = [...(recordsQuery.data?.items ?? [])].sort((a, b) => a.targetVariancePct - b.targetVariancePct)

  return (
    <ReportMasthead title={t('Revenue Report')} classification="confidential">
      {totals ? (
        <ReportSection title={t('Collection summary')}>
          <DefinitionList>
            <DefinitionRow label={t('Target')}>{formatCrore(totals.target)}</DefinitionRow>
            <DefinitionRow label={t('Collected')}>{formatCrore(totals.collected)}</DefinitionRow>
            <DefinitionRow label={t('Collection efficiency')}>{formatPercent(totals.efficiencyPct)}</DefinitionRow>
            <DefinitionRow label={t('Arrears')}>{formatCrore(totals.arrears)}</DefinitionRow>
          </DefinitionList>
        </ReportSection>
      ) : null}
      <ReportSection title={t('Position by revenue stream and ward')} description={t('Ordered by target variance, most adverse first.')}>
        <ReportTable
          keyFn={(r) => r.id}
          rows={records.slice(0, 30)}
          columns={[
            { header: t('Stream'), cell: (r) => r.stream.replace(/-/g, ' ') },
            { header: t('Ward'), cell: (r) => (r.wardId ? wardName(r.wardId) : 'City-wide') },
            { header: t('Target'), align: 'right', cell: (r) => formatCrore(r.targetCrore) },
            { header: t('Collected'), align: 'right', cell: (r) => formatCrore(r.collectedCrore) },
            { header: t('Efficiency'), align: 'right', cell: (r) => formatPercent(r.collectionEfficiencyPct) },
            { header: t('Variance'), align: 'right', cell: (r) => `${r.targetVariancePct > 0 ? '+' : ''}${r.targetVariancePct.toFixed(1)} pp` },
            { header: t('State'), cell: (r) => <StateBadge state={r.state} /> },
          ]}
        />
      </ReportSection>
    </ReportMasthead>
  )
}

function BudgetUtilisationReportBody(): React.JSX.Element {
  const totalsQuery = useServiceQuery(queryKeys.finance('report-totals'), (u) => financeService.budgetTotals(u))
  const varianceQuery = useServiceQuery(queryKeys.finance('report-variance'), (u) => financeService.departmentVariance(u))
  if (totalsQuery.isLoading || varianceQuery.isLoading) return <LoadingState variant="table" rows={8} />
  if (totalsQuery.error) return <ErrorState detail={totalsQuery.error.message} onRetry={() => totalsQuery.refetch()} />
  const totals = totalsQuery.data
  const rows = [...(varianceQuery.data ?? [])].sort((a, b) => a.variancePct - b.variancePct)

  return (
    <ReportMasthead title={t('Budget Utilisation Report')} classification="confidential">
      {totals ? (
        <ReportSection title={t('Corporation-wide position')}>
          <DefinitionList>
            <DefinitionRow label={t('Approved budget')}>{formatCrore(totals.approved)}</DefinitionRow>
            <DefinitionRow label={t('Revised budget')}>{formatCrore(totals.revised)}</DefinitionRow>
            <DefinitionRow label={t('Actual expenditure')}>{formatCrore(totals.actual)}</DefinitionRow>
            <DefinitionRow label={t('Utilisation')}>{formatPercent(totals.utilisationPct)}</DefinitionRow>
          </DefinitionList>
        </ReportSection>
      ) : null}
      <ReportSection title={t('Department variance against phased plan')} description={t('Most adverse variance first.')}>
        <ReportTable
          keyFn={(r) => r.departmentId}
          rows={rows}
          columns={[
            { header: t('Department'), cell: (r) => departmentName(r.departmentId) },
            { header: t('Approved'), align: 'right', cell: (r) => formatCrore(r.approvedCrore) },
            { header: t('Revised'), align: 'right', cell: (r) => formatCrore(r.revisedCrore) },
            { header: t('Actual'), align: 'right', cell: (r) => formatCrore(r.actualCrore) },
            { header: t('Variance'), align: 'right', cell: (r) => `${r.variancePct > 0 ? '+' : ''}${r.variancePct.toFixed(1)} pp` },
            { header: t('State'), cell: (r) => <StateBadge state={r.state} /> },
          ]}
        />
      </ReportSection>
    </ReportMasthead>
  )
}

function SecurityReportBody(): React.JSX.Element {
  const postureQuery = useServiceQuery(queryKeys.security('report-posture'), (u) => securityService.posture(u))
  const eventsQuery = useServiceQuery(queryKeys.security('report-events'), (u) => securityService.events(u))
  if (postureQuery.isLoading || eventsQuery.isLoading) return <LoadingState variant="table" rows={8} />
  if (postureQuery.error) return <ErrorState detail={postureQuery.error.message} onRetry={() => postureQuery.refetch()} />
  const posture = postureQuery.data
  const events = [...(eventsQuery.data ?? [])].slice(0, 20)

  return (
    <ReportMasthead title={t('Security Report')} classification="restricted">
      {posture ? (
        <ReportSection title={t('Security posture')}>
          <DefinitionList>
            <DefinitionRow label={t('Authentication health')}>{posture.authenticationHealth}/100</DefinitionRow>
            <DefinitionRow label={t('MFA coverage')}>{formatPercent(posture.mfaCoveragePct)}</DefinitionRow>
            <DefinitionRow label={t('Privileged accounts without MFA')}>{posture.privilegedWithoutMfa} of {posture.privilegedAccounts}</DefinitionRow>
            <DefinitionRow label={t('Security events (30 days)')}>{posture.securityEvents30d}</DefinitionRow>
            <DefinitionRow label={t('Open vulnerabilities')}>
              {t('{0} critical, {1} high, {2} medium, {3} low', posture.openVulnerabilities.critical, posture.openVulnerabilities.high, posture.openVulnerabilities.medium, posture.openVulnerabilities.low)}
            </DefinitionRow>
            <DefinitionRow label={t('Certification status')}>{posture.certificationNote}</DefinitionRow>
          </DefinitionList>
        </ReportSection>
      ) : null}
      <ReportSection title={t('Recent security events')} description={t('Most recently detected first.')}>
        <ReportTable
          keyFn={(e) => e.id}
          rows={events}
          columns={[
            { header: t('Reference'), cell: (e) => e.reference },
            { header: t('Type'), cell: (e) => e.type.replace(/-/g, ' ') },
            { header: t('Severity'), cell: (e) => <SeverityBadge severity={e.severity} /> },
            { header: t('Status'), cell: (e) => e.status },
            { header: t('Detected'), cell: (e) => formatDate(e.detectedAt) },
          ]}
        />
      </ReportSection>
    </ReportMasthead>
  )
}

function AIGovernanceReportBody(): React.JSX.Element {
  const summaryQuery = useServiceQuery(queryKeys.ai('report-summary'), (u) => aiService.oversightSummary(u))
  const riskQuery = useServiceQuery(queryKeys.ai('report-risk'), (u) => aiService.riskRegister(u))
  const modelsQuery = useServiceQuery(queryKeys.ai('report-models'), (u) => aiService.models(u))
  if (summaryQuery.isLoading || riskQuery.isLoading || modelsQuery.isLoading) return <LoadingState variant="table" rows={8} />
  if (summaryQuery.error) return <ErrorState detail={summaryQuery.error.message} onRetry={() => summaryQuery.refetch()} />
  const summary = summaryQuery.data
  const risks = riskQuery.data ?? []
  const models = modelsQuery.data ?? []

  return (
    <ReportMasthead title={t('AI Governance Report')} classification="confidential">
      {summary ? (
        <ReportSection title={t('Human oversight of AI recommendations')}>
          <DefinitionList>
            <DefinitionRow label={t('Pending review')}>{summary.pending}</DefinitionRow>
            <DefinitionRow label={t('Accepted')}>{summary.accepted}</DefinitionRow>
            <DefinitionRow label={t('Modified before acceptance')}>{summary.modified}</DefinitionRow>
            <DefinitionRow label={t('Rejected')}>{summary.rejected}</DefinitionRow>
            <DefinitionRow label={t('Escalated')}>{summary.escalated}</DefinitionRow>
            <DefinitionRow label={t('Acceptance rate')}>{formatPercent(summary.acceptanceRate)}</DefinitionRow>
          </DefinitionList>
        </ReportSection>
      ) : null}
      <ReportSection title={t('Approved model registry')} description={t('{0} of {1} models active.', models.filter((m) => m.status === 'active').length, models.length)}>
        <ReportTable
          keyFn={(m) => m.id}
          rows={models}
          columns={[
            { header: t('Model'), cell: (m) => m.name },
            { header: t('Provider'), cell: (m) => m.provider },
            { header: t('Risk class'), cell: (m) => m.riskClass },
            { header: t('Evaluation'), cell: (m) => m.evaluationStatus },
            { header: t('Status'), cell: (m) => m.status },
          ]}
        />
      </ReportSection>
      <ReportSection title={t('AI risk register')} description={t('Open and monitored risk entries.')}>
        <ReportTable
          keyFn={(r) => r.id}
          rows={risks.filter((r) => r.status !== 'accepted')}
          columns={[
            { header: t('Category'), cell: (r) => r.category.replace(/-/g, ' ') },
            { header: t('Likelihood'), cell: (r) => r.likelihood },
            { header: t('Impact'), cell: (r) => r.impact },
            { header: t('Inherent rating'), cell: (r) => <SeverityBadge severity={r.inherentRating} /> },
            { header: t('Residual rating'), cell: (r) => <SeverityBadge severity={r.residualRating} /> },
            { header: t('Status'), cell: (r) => r.status },
            { header: t('Review due'), cell: (r) => formatDate(r.reviewDue) },
          ]}
        />
      </ReportSection>
    </ReportMasthead>
  )
}

/* ==========================================================================
   Page
   ========================================================================== */

export function ReportsPage(): React.JSX.Element {
  const user = useCurrentUser()
  const [selected, setSelected] = useState<ReportId>('daily-brief')
  const canPrint = allowed(user, 'report', 'export')
  const activeReport = REPORTS.find((r) => r.id === selected) ?? REPORTS[0]

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(
    t('Report Workspace'),
    t('Institutional reports rendered as print-ready documents - masthead, provenance statement and figures drawn directly from the live service layer.'),
  )

  return (
    <PageBody>
      <PageHeader
        className="print-hidden"
        eyebrow={t('Command')}
        breadcrumbs={[{ label: t('Command') }, { label: t('Report Workspace') }]}
        actions={
          <Button
            variant="primary"
            icon={<Printer className="h-3.5 w-3.5" />}
            disabled={!canPrint}
            title={canPrint ? undefined : 'Your role does not hold report:export'}
            onClick={() => window.print()}
          >
            {t('Print / Save as PDF')}
          </Button>
        }
        controls={
          <Tabs
            variant="pill"
            ariaLabel="Select report"
            value={selected}
            onChange={(id) => setSelected(id as ReportId)}
            items={REPORTS.map((r) => ({ id: r.id, label: r.title, icon: r.icon }))}
          />
        }
      />

      <Card className="print-full p-6 sm:p-8">
        {activeReport?.id === 'daily-brief' ? <DailyBriefReportBody /> : null}
        {activeReport?.id === 'ward-performance' ? <WardPerformanceReportBody /> : null}
        {activeReport?.id === 'monsoon-readiness' ? <MonsoonReadinessReportBody /> : null}
        {activeReport?.id === 'project-risk' ? <ProjectRiskReportBody /> : null}
        {activeReport?.id === 'revenue' ? <RevenueReportBody /> : null}
        {activeReport?.id === 'budget-utilisation' ? <BudgetUtilisationReportBody /> : null}
        {activeReport?.id === 'security' ? <SecurityReportBody /> : null}
        {activeReport?.id === 'ai-governance' ? <AIGovernanceReportBody /> : null}
      </Card>

      <div className="print-hidden flex items-center gap-1.5 text-xs text-ink-400">
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
        {t('Reports reflect the platform\'s current session state and regenerate on each view - they are not archived snapshots in this demonstration environment.')}
      </div>

      <DemonstrationNotice className="print-hidden" />
    </PageBody>
  )
}

export default ReportsPage
