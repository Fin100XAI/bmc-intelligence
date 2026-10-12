import { type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertOctagon,
  Banknote,
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  CloudRain,
  Droplets,
  FileStack,
  HardHat,
  HeartPulse,
  KeyRound,
  Landmark,
  MapPinned,
  MessageSquareWarning,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Waves,
  XCircle,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, ScoreDial } from '@/components/ui/primitives'
import { CHART_COLOURS, MiniBar, RankedBarChart } from '@/components/charts'
import { BigFigure, KpiTile, ServiceTile, StateDonut, TargetBar, type InfoTone } from '@/components/infographic'
import { DivergingBars, PrintableFold, SegmentDonut, type Segment } from '@/components/infographic/work-surface'
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
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { allowed } from '@/security'
import { municipality } from '@/config/municipality.config'
import { departmentName, wardName } from '@/data/reference'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCrore, formatDate, formatDateTime, formatNumber, formatPercent, formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import { type DataClassification, type OperationalState } from '@/types/common'
import { PROJECT_STATUS_LABEL, type ProjectStatus } from '@/types/finance'
import { SECURITY_EVENT_LABEL } from '@/types/governance'
import { t } from '@/i18n'
import { SHADE, shadeForTone } from '@/components/ui/shade'
import { enumLabel } from '@/utils/enum-label'
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
    {
      id: 'daily-brief',
      title: t('Daily Commissioner Brief'),
      icon: <FileStack className="h-3.5 w-3.5" />,
      classification: 'confidential',
    },
    {
      id: 'ward-performance',
      title: t('Ward Performance Report'),
      icon: <MapPinned className="h-3.5 w-3.5" />,
      classification: 'internal',
    },
    {
      id: 'monsoon-readiness',
      title: t('Monsoon Readiness Report'),
      icon: <Siren className="h-3.5 w-3.5" />,
      classification: 'internal',
    },
    {
      id: 'project-risk',
      title: t('Project Risk Report'),
      icon: <HardHat className="h-3.5 w-3.5" />,
      classification: 'internal',
    },
    {
      id: 'revenue',
      title: t('Revenue Report'),
      icon: <Banknote className="h-3.5 w-3.5" />,
      classification: 'confidential',
    },
    {
      id: 'budget-utilisation',
      title: t('Budget Utilisation Report'),
      icon: <Landmark className="h-3.5 w-3.5" />,
      classification: 'confidential',
    },
    {
      id: 'security',
      title: t('Security Report'),
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
      classification: 'restricted',
    },
    {
      id: 'ai-governance',
      title: t('AI Governance Report'),
      icon: <Bot className="h-3.5 w-3.5" />,
      classification: 'confidential',
    },
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
            <p className="label-institutional">
              {municipality.municipalityName} · {municipality.branding.productName}
            </p>
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
   Infographic helpers shared by the report bodies
   --------------------------------------------------------------------------
   Each report opens with its findings as pictures - a gauge, headline tiles,
   a ranked bar or a composition - and keeps the precise ledger beneath,
   folded on screen but always printed (see `PrintableFold`), so the PDF
   remains the complete institutional document.
   ========================================================================== */

function FigureRow({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
}

function GaugeCard({ score, caption, children }: { score: number; caption: string; children: ReactNode }): React.JSX.Element {
  // The card takes the shade of its own score band: green good, amber watch, red adverse.
  return (
    <div className={cn('flex flex-col items-center gap-4 rounded-xl border p-4 sm:flex-row', SHADE[shadeForTone(bandTone(score))].tile)}>
      <ScoreDial score={Math.round(score)} size={124} label={t('of 100')} caption={caption} />
      <div className="w-full min-w-0 flex-1 space-y-3">{children}</div>
    </div>
  )
}

function ChartBox({ title, children, height = 240 }: { title: string; children: ReactNode; height?: number }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-ink-200 p-3">
      <p className="mb-2 text-[0.6875rem] font-bold tracking-[0.06em] text-ink-500 uppercase">{title}</p>
      <div style={{ height }}>{children}</div>
    </div>
  )
}

function shortWard(label: string): string {
  return label.split('·').pop()?.trim() ?? label
}

function bandTone(score: number, good = 75, watch = 55): InfoTone {
  return score >= good ? 'positive' : score >= watch ? 'warn' : 'critical'
}

/* ==========================================================================
   Individual reports - each owns its own queries and loading/error states
   ========================================================================== */

function DailyBriefReportBody(): React.JSX.Element {
  const position = buildCityPosition()
  const capitalAtRiskPct = (position.projects.atRisk / Math.max(1, position.projects.total)) * 100
  return (
    <ReportMasthead title={t('Daily Commissioner Brief')} classification="confidential">
      <ReportSection title={t('City position')} description={t('Composite operational health across every domain.')}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <GaugeCard score={position.healthScore} caption={t('City health score')}>
            <p className="text-[0.6875rem] font-bold tracking-[0.09em] text-ink-500 uppercase">{t('Overall position')}</p>
            <StateBadge state={position.state} />
          </GaugeCard>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <KpiTile
              icon={<AlertOctagon className="h-5 w-5" />}
              label={t('Critical alerts')}
              value={position.criticalAlerts}
              reading={t('{0} high', position.highAlerts)}
              tone={position.criticalAlerts > 0 ? 'critical' : 'positive'}
              shade="red"
            />
            <KpiTile
              icon={<ClipboardList className="h-5 w-5" />}
              label={t('Priority decisions')}
              value={position.priorityDecisions}
              reading={t('Draft or under review')}
              tone={position.priorityDecisions > 0 ? 'warn' : 'positive'}
              shade="blue"
            />
            <KpiTile
              icon={<Siren className="h-5 w-5" />}
              label={t('Active incidents')}
              value={position.activeIncidents}
              tone={position.activeIncidents > 0 ? 'risk' : 'positive'}
              shade="amber"
            />
            <KpiTile
              icon={<ShieldAlert className="h-5 w-5" />}
              label={t('Services at risk')}
              value={position.servicesAtRisk}
              reading={t('Categories below SLA threshold')}
              tone={position.servicesAtRisk > 0 ? 'warn' : 'positive'}
              shade="tone"
            />
          </div>
        </div>
      </ReportSection>

      <ReportSection title={t('Top risks')} description={t('Highest-severity open intelligence, city-wide.')}>
        <ReportTable
          keyFn={(r) => r.id}
          rows={position.topRisks.slice(0, 8)}
          columns={[
            {
              header: t('Severity'),
              cell: (r) => <SeverityBadge severity={r.severity} />,
            },
            { header: t('Item'), cell: (r) => r.title },
            {
              header: t('Ward(s)'),
              cell: (r) => r.wardIds.map((w) => wardName(w)).join(', ') || t('City-wide'),
            },
            {
              header: t('Department'),
              cell: (r) => departmentName(r.departmentId),
            },
            { header: t('Raised'), cell: (r) => formatRelative(r.createdAt) },
          ]}
        />
      </ReportSection>

      <ReportSection title={t('Financial position')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ServiceTile
            icon={<Banknote className="h-4 w-4" />}
            label={t('Revenue collected vs target')}
            value={formatPercent(position.revenue.efficiencyPct)}
            meter={position.revenue.efficiencyPct}
            note={t('{0} of {1}', formatCrore(position.revenue.collectedCrore), formatCrore(position.revenue.targetCrore))}
            tone={bandTone(position.revenue.efficiencyPct, 85, 70)}
            shade="gold"
          />
          <ServiceTile
            icon={<Landmark className="h-4 w-4" />}
            label={t('Budget utilisation')}
            value={formatPercent(position.budget.utilisationPct)}
            meter={position.budget.utilisationPct}
            note={t('{0} of {1} revised allocation', formatPercent(position.budget.utilisationPct), formatCrore(position.budget.revisedCrore))}
            tone={position.budget.utilisationPct >= 75 ? 'positive' : 'warn'}
            shade="tone"
          />
          <ServiceTile
            icon={<HardHat className="h-4 w-4" />}
            label={t('Capital works at risk')}
            value={t('{0} of {1} active', position.projects.atRisk, position.projects.total)}
            meter={capitalAtRiskPct}
            note={t('{0} of works at risk', formatPercent(capitalAtRiskPct, 0))}
            tone={position.projects.atRisk > 0 ? 'warn' : 'positive'}
            shade="blue"
          />
        </div>
      </ReportSection>

      <ReportSection title={t('Infrastructure and monsoon')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ServiceTile
            icon={<Droplets className="h-4 w-4" />}
            label={t('Water supply position')}
            value={t('{0}/{1} MLD', position.water.supplyMld.toFixed(0), position.water.demandMld.toFixed(0))}
            meter={(position.water.supplyMld / Math.max(1, position.water.demandMld)) * 100}
            note={t('{0} zone(s) at risk', position.water.zonesAtRisk)}
            tone={position.water.zonesAtRisk > 0 ? 'warn' : 'positive'}
            shade="blue"
          />
          <ServiceTile
            icon={<CloudRain className="h-4 w-4" />}
            label={t('Monsoon readiness')}
            value={`${position.monsoon.readinessScore}/100`}
            meter={position.monsoon.readinessScore}
            note={t('{0} ward(s) below threshold', position.monsoon.wardsBelowThreshold)}
            tone={bandTone(position.monsoon.readinessScore)}
            shade="amber"
          />
          <ServiceTile
            icon={<HeartPulse className="h-4 w-4" />}
            label={t('Public health')}
            value={`${position.health.highestSignal}/100`}
            meter={position.health.highestSignal}
            note={t('Highest outbreak signal across {0} ward(s)', position.health.wardsWithSignal)}
            tone={position.health.highestSignal >= 70 ? 'critical' : position.health.highestSignal >= 50 ? 'warn' : 'positive'}
            shade="tone"
          />
        </div>
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
    const comparison = await wardService.compare(
      u,
      wards.map((w) => w.id),
    )
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
  const needingAttention = rows.filter((r) => r.state === 'at-risk' || r.state === 'critical').length

  return (
    <ReportMasthead title={t('Ward Performance Report')} classification="internal">
      <ReportSection title={t('City-wide summary')}>
        <FigureRow>
          <KpiTile icon={<MapPinned className="h-5 w-5" />} label={t('Wards reported')} value={rows.length} shade="blue" />
          <KpiTile
            icon={<HeartPulse className="h-5 w-5" />}
            label={t('Average operational health')}
            value={`${avgHealth.toFixed(1)}/100`}
            tone={bandTone(avgHealth)}
            shade="tone"
          />
          <KpiTile
            icon={<MessageSquareWarning className="h-5 w-5" />}
            label={t('Total open complaints')}
            value={formatNumber(rows.reduce((s, r) => s + r.openComplaints, 0))}
            tone="neutral"
            shade="teal"
          />
          <KpiTile
            icon={<AlertOctagon className="h-5 w-5" />}
            label={t('Wards needing attention')}
            value={needingAttention}
            reading={t('At risk or critical')}
            tone={needingAttention > 0 ? 'risk' : 'positive'}
            shade="tone"
          />
        </FigureRow>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-ink-200 p-3">
            <p className="mb-2 text-[0.6875rem] font-bold tracking-[0.06em] text-ink-500 uppercase">{t('Wards by operating state')}</p>
            <StateDonut states={rows.map((r) => r.state)} unitLabel={t('wards')} />
          </div>
          <ChartBox title={t('Highest-risk wards (risk index)')}>
            <RankedBarChart data={rows.slice(0, 10).map((r) => ({ label: shortWard(r.name), value: r.risk }))} unit="/100" />
          </ChartBox>
        </div>
      </ReportSection>
      <ReportSection title={t('Ward-by-ward position')} description={t('Ranked by composite risk index, highest first.')}>
        <PrintableFold summary={t('Show the ward-by-ward table')}>
          <ReportTable
            keyFn={(r) => r.wardId}
            rows={rows}
            columns={[
              { header: t('Ward'), cell: (r) => `${r.code} - ${r.name}` },
              { header: t('Region'), cell: (r) => r.region },
              {
                header: t('Health'),
                align: 'right',
                cell: (r) => (
                  <span className="inline-flex items-center gap-1.5">
                    <MiniBar value={r.health} width={40} />
                    {r.health}
                  </span>
                ),
              },
              {
                header: t('Risk'),
                align: 'right',
                cell: (r) => (
                  <span className="inline-flex items-center gap-1.5">
                    <MiniBar value={r.risk} width={40} higherIsWorse />
                    {r.risk}
                  </span>
                ),
              },
              {
                header: t('Open complaints'),
                align: 'right',
                cell: (r) => r.openComplaints,
              },
              {
                header: t('Monsoon readiness'),
                align: 'right',
                cell: (r) => r.monsoonReadiness ?? '-',
              },
              {
                header: t('Budget utilisation'),
                align: 'right',
                cell: (r) => formatPercent(r.budgetUtilisation),
              },
              {
                header: t('State'),
                cell: (r) => <StateBadge state={r.state} />,
              },
            ]}
          />
        </PrintableFold>
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
  const below = readiness.filter((r) => r.readinessScore < 70).length
  const floodSpots = readiness.reduce((s, r) => s + r.floodSpots, 0)
  const mitigated = readiness.reduce((s, r) => s + r.spotsMitigated, 0)
  const pumpPct = (pumpsOperational / Math.max(1, pumpsTotal)) * 100
  const mitigatedPct = (mitigated / Math.max(1, floodSpots)) * 100

  return (
    <ReportMasthead title={t('Monsoon Readiness Report')} classification="internal">
      <ReportSection title={t('Readiness summary')}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <GaugeCard score={avgReadiness} caption={t('Mean ward readiness')}>
            <BigFigure value={t('{0} of {1}', below, readiness.length)} caption={t('Wards below 70/100')} tone={below > 0 ? 'warn' : 'positive'} />
          </GaugeCard>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ServiceTile
              icon={<Waves className="h-4 w-4" />}
              label={t('Pumping capacity operational')}
              value={t('{0} of {1} pumps', pumpsOperational, pumpsTotal)}
              meter={pumpPct}
              note={t('{0} operational', formatPercent(pumpPct, 0))}
              tone={bandTone(pumpPct, 90, 75)}
              shade="blue"
            />
            <ServiceTile
              icon={<CloudRain className="h-4 w-4" />}
              label={t('Flood spots mitigated')}
              value={t('{0} of {1}', mitigated, floodSpots)}
              meter={mitigatedPct}
              note={t('{0} mitigated', formatPercent(mitigatedPct, 0))}
              tone={bandTone(mitigatedPct, 80, 50)}
              shade="tone"
            />
          </div>
        </div>
        <div className="mt-3">
          <ChartBox title={t('Lowest-readiness wards')}>
            <RankedBarChart
              data={readiness.slice(0, 10).map((r) => ({
                label: shortWard(wardName(r.wardId)),
                value: r.readinessScore,
              }))}
              unit="/100"
              higherIsWorse={false}
            />
          </ChartBox>
        </div>
      </ReportSection>
      <ReportSection title={t('Ward readiness')} description={t('Ranked lowest readiness first - the priority order for pre-monsoon works.')}>
        <PrintableFold summary={t('Show the ward readiness table')}>
          <ReportTable
            keyFn={(r) => r.wardId}
            rows={readiness}
            columns={[
              { header: t('Ward'), cell: (r) => wardName(r.wardId) },
              {
                header: t('Readiness'),
                align: 'right',
                cell: (r) => (
                  <span className="inline-flex items-center gap-1.5">
                    <MiniBar value={r.readinessScore} width={40} />
                    {r.readinessScore}
                  </span>
                ),
              },
              {
                header: t('Desilting'),
                align: 'right',
                cell: (r) => formatPercent(r.desiltingPct),
              },
              {
                header: t('Pump readiness'),
                align: 'right',
                cell: (r) => formatPercent(r.pumpReadiness),
              },
              {
                header: t('Flood spots'),
                align: 'right',
                cell: (r) => r.floodSpots,
              },
              {
                header: t('Mitigated'),
                align: 'right',
                cell: (r) => r.spotsMitigated,
              },
              {
                header: t('State'),
                cell: (r) => <StateBadge state={r.state} />,
              },
            ]}
          />
        </PrintableFold>
      </ReportSection>
      <ReportSection title={t('Pumping stations')}>
        <PrintableFold summary={t('Show the pumping station table')}>
          <ReportTable
            keyFn={(p) => p.id}
            rows={[...pumps].sort((a, b) => a.readinessIndex - b.readinessIndex)}
            columns={[
              { header: t('Station'), cell: (p) => p.name },
              { header: t('Ward'), cell: (p) => wardName(p.wardId) },
              {
                header: t('Pumps'),
                align: 'right',
                cell: (p) => `${p.pumpsOperational} / ${p.pumpsTotal}`,
              },
              {
                header: t('Standby power'),
                cell: (p) => (p.standbyPowerAvailable ? t('Available') : t('Not available')),
              },
              {
                header: t('Readiness'),
                align: 'right',
                cell: (p) => (
                  <span className="inline-flex items-center gap-1.5">
                    <MiniBar value={p.readinessIndex} width={40} />
                    {p.readinessIndex}
                  </span>
                ),
              },
            ]}
          />
        </PrintableFold>
      </ReportSection>
    </ReportMasthead>
  )
}

const PROJECT_STATUS_COLOUR: Record<ProjectStatus, string> = {
  planned: CHART_COLOURS.neutral,
  tendered: CHART_COLOURS.primarySoft,
  awarded: CHART_COLOURS.intel,
  'in-progress': CHART_COLOURS.primary,
  delayed: CHART_COLOURS.critical,
  'on-hold': CHART_COLOURS.warn,
  completed: CHART_COLOURS.positive,
  closed: CHART_COLOURS.intelSoft,
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
  const statusSegments: Segment[] = (Object.keys(PROJECT_STATUS_COLOUR) as ProjectStatus[]).map((s) => ({
    id: s,
    label: PROJECT_STATUS_LABEL[s],
    value: projects.filter((p) => p.status === s).length,
    colour: PROJECT_STATUS_COLOUR[s],
  }))

  return (
    <ReportMasthead title={t('Project Risk Report')} classification="internal">
      <ReportSection title={t('Portfolio summary')}>
        <FigureRow>
          <KpiTile icon={<HardHat className="h-5 w-5" />} label={t('Projects reported')} value={projects.length} shade="blue" />
          <KpiTile
            icon={<AlertOctagon className="h-5 w-5" />}
            label={t('At risk (score ≥ 60)')}
            value={atRisk.length}
            reading={t('{0} of the portfolio', formatPercent((atRisk.length / projects.length) * 100, 0))}
            tone={atRisk.length > 0 ? 'risk' : 'positive'}
            shade="tone"
          />
          <KpiTile
            icon={<CalendarClock className="h-5 w-5" />}
            label={t('Delayed')}
            value={delayed.length}
            tone={delayed.length > 0 ? 'critical' : 'positive'}
            shade="tone"
          />
          <KpiTile icon={<Landmark className="h-5 w-5" />} label={t('Sanctioned exposure')} value={formatCrore(sanctioned)} shade="gold" />
        </FigureRow>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-ink-200 p-3">
            <p className="mb-2 text-[0.6875rem] font-bold tracking-[0.06em] text-ink-500 uppercase">{t('Works by status')}</p>
            <SegmentDonut segments={statusSegments} centreLabel={t('works')} size={150} />
          </div>
          <ChartBox title={t('Highest project risk scores')}>
            <RankedBarChart data={projects.slice(0, 10).map((p) => ({ label: p.reference, value: p.riskScore }))} unit="/100" />
          </ChartBox>
        </div>
      </ReportSection>
      <ReportSection title={t('Highest-risk works')} description={t('Top 20 by composite project risk score.')}>
        <PrintableFold summary={t('Show the top 20 works')}>
          <ReportTable
            keyFn={(p) => p.id}
            rows={projects.slice(0, 20)}
            columns={[
              { header: t('Reference'), cell: (p) => p.reference },
              { header: t('Project'), cell: (p) => p.name },
              {
                header: t('Ward(s)'),
                cell: (p) => p.wardIds.map((w) => wardName(w)).join(', '),
              },
              {
                header: t('Department'),
                cell: (p) => departmentName(p.departmentId),
              },
              {
                header: t('Status'),
                cell: (p) => PROJECT_STATUS_LABEL[p.status],
              },
              {
                header: t('Physical progress'),
                align: 'right',
                cell: (p) => (
                  <span className="inline-flex items-center gap-1.5">
                    <MiniBar value={p.completionPct} width={40} tone="neutral" />
                    {formatPercent(p.completionPct)}
                  </span>
                ),
              },
              { header: t('Risk'), align: 'right', cell: (p) => p.riskScore },
              {
                header: t('Sanctioned'),
                align: 'right',
                cell: (p) => formatCrore(p.sanctionedCostCrore),
              },
            ]}
          />
        </PrintableFold>
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
  const byStream = new Map<string, { target: number; collected: number }>()
  for (const r of records) {
    const bucket = byStream.get(r.stream) ?? { target: 0, collected: 0 }
    bucket.target += r.targetCrore
    bucket.collected += r.collectedCrore
    byStream.set(r.stream, bucket)
  }
  const streamEfficiency = Array.from(byStream.entries())
    .map(([stream, b]) => ({
      label: enumLabel(stream),
      value: Math.round((b.collected / Math.max(0.0001, b.target)) * 1000) / 10,
    }))
    .sort((a, b) => a.value - b.value)

  return (
    <ReportMasthead title={t('Revenue Report')} classification="confidential">
      {totals ? (
        <ReportSection title={t('Collection summary')}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <GaugeCard score={totals.efficiencyPct} caption={t('Collection efficiency')}>
              <BigFigure value={formatCrore(totals.collected)} caption={t('collected of {0} target', formatCrore(totals.target))} tone="positive" />
              <BigFigure value={formatCrore(totals.arrears)} caption={t('arrears outstanding')} tone="warn" />
            </GaugeCard>
            <ChartBox title={t('Collection efficiency by stream (%)')} height={200}>
              <RankedBarChart data={streamEfficiency} unit="%" higherIsWorse={false} />
            </ChartBox>
          </div>
        </ReportSection>
      ) : null}
      <ReportSection title={t('Position by revenue stream and ward')} description={t('Ordered by target variance, most adverse first.')}>
        <PrintableFold summary={t('Show the stream and ward table')}>
          <ReportTable
            keyFn={(r) => r.id}
            rows={records.slice(0, 30)}
            columns={[
              { header: t('Stream'), cell: (r) => enumLabel(r.stream) },
              {
                header: t('Ward'),
                cell: (r) => (r.wardId ? wardName(r.wardId) : t('City-wide')),
              },
              {
                header: t('Target'),
                align: 'right',
                cell: (r) => formatCrore(r.targetCrore),
              },
              {
                header: t('Collected'),
                align: 'right',
                cell: (r) => formatCrore(r.collectedCrore),
              },
              {
                header: t('Efficiency'),
                align: 'right',
                cell: (r) => (
                  <span className="inline-flex items-center gap-1.5">
                    <MiniBar value={r.collectionEfficiencyPct} width={40} />
                    {formatPercent(r.collectionEfficiencyPct)}
                  </span>
                ),
              },
              {
                header: t('Variance'),
                align: 'right',
                cell: (r) => `${r.targetVariancePct > 0 ? '+' : ''}${r.targetVariancePct.toFixed(1)} pp`,
              },
              {
                header: t('State'),
                cell: (r) => <StateBadge state={r.state} />,
              },
            ]}
          />
        </PrintableFold>
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
          <GaugeCard score={totals.utilisationPct} caption={t('Utilisation')}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <BigFigure value={formatCrore(totals.approved)} caption={t('Approved budget')} />
              <BigFigure value={formatCrore(totals.revised)} caption={t('Revised budget')} />
              <BigFigure value={formatCrore(totals.actual)} caption={t('Actual expenditure')} tone="positive" />
            </div>
            <TargetBar label={t('Utilisation')} value={totals.utilisationPct} target={75} note={t('Target {0}%', 75)} />
          </GaugeCard>
        </ReportSection>
      ) : null}
      <ReportSection title={t('Department variance against phased plan')} description={t('Most adverse variance first.')}>
        {rows.length > 0 ? (
          <div className="rounded-xl border border-ink-200 p-3">
            <DivergingBars
              rows={rows.map((r) => ({
                id: r.departmentId,
                label: departmentName(r.departmentId),
                value: r.variancePct,
              }))}
              unit=" pp"
            />
          </div>
        ) : null}
        <div className="mt-3">
          <PrintableFold summary={t('Show the department variance table')}>
            <ReportTable
              keyFn={(r) => r.departmentId}
              rows={rows}
              columns={[
                {
                  header: t('Department'),
                  cell: (r) => departmentName(r.departmentId),
                },
                {
                  header: t('Approved'),
                  align: 'right',
                  cell: (r) => formatCrore(r.approvedCrore),
                },
                {
                  header: t('Revised'),
                  align: 'right',
                  cell: (r) => formatCrore(r.revisedCrore),
                },
                {
                  header: t('Actual'),
                  align: 'right',
                  cell: (r) => formatCrore(r.actualCrore),
                },
                {
                  header: t('Variance'),
                  align: 'right',
                  cell: (r) => `${r.variancePct > 0 ? '+' : ''}${r.variancePct.toFixed(1)} pp`,
                },
                {
                  header: t('State'),
                  cell: (r) => <StateBadge state={r.state} />,
                },
              ]}
            />
          </PrintableFold>
        </div>
      </ReportSection>
    </ReportMasthead>
  )
}

const VULNERABILITY_COLOUR = {
  critical: CHART_COLOURS.critical,
  high: CHART_COLOURS.risk,
  medium: CHART_COLOURS.warn,
  low: CHART_COLOURS.neutral,
} as const

function SecurityReportBody(): React.JSX.Element {
  const postureQuery = useServiceQuery(queryKeys.security('report-posture'), (u) => securityService.posture(u))
  const eventsQuery = useServiceQuery(queryKeys.security('report-events'), (u) => securityService.events(u))
  if (postureQuery.isLoading || eventsQuery.isLoading) return <LoadingState variant="table" rows={8} />
  if (postureQuery.error) return <ErrorState detail={postureQuery.error.message} onRetry={() => postureQuery.refetch()} />
  const posture = postureQuery.data
  const events = [...(eventsQuery.data ?? [])].slice(0, 20)
  const vulnerabilitySegments: Segment[] = posture
    ? (['critical', 'high', 'medium', 'low'] as const).map((level) => ({
        id: level,
        label: enumLabel(level),
        value: posture.openVulnerabilities[level],
        colour: VULNERABILITY_COLOUR[level],
      }))
    : []
  const openVulnerabilities = vulnerabilitySegments.reduce((s, x) => s + x.value, 0)

  return (
    <ReportMasthead title={t('Security Report')} classification="restricted">
      {posture ? (
        <ReportSection title={t('Security posture')}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <GaugeCard score={posture.authenticationHealth} caption={t('Authentication health')}>
              <TargetBar label={t('MFA coverage')} value={posture.mfaCoveragePct} target={100} note={formatPercent(posture.mfaCoveragePct)} />
              <p className="text-[0.6875rem] leading-relaxed text-ink-600">{posture.certificationNote}</p>
            </GaugeCard>
            <div className="grid grid-cols-2 gap-3">
              <KpiTile
                icon={<KeyRound className="h-5 w-5" />}
                label={t('Privileged accounts without MFA')}
                value={t('{0} of {1}', posture.privilegedWithoutMfa, posture.privilegedAccounts)}
                tone={posture.privilegedWithoutMfa > 0 ? 'critical' : 'positive'}
                shade="tone"
              />
              <KpiTile
                icon={<ShieldAlert className="h-5 w-5" />}
                label={t('Security events (30 days)')}
                value={formatNumber(posture.securityEvents30d)}
                tone="neutral"
                shade="teal"
              />
              <KpiTile
                icon={<AlertOctagon className="h-5 w-5" />}
                label={t('Critical vulnerabilities open')}
                value={posture.openVulnerabilities.critical}
                tone={posture.openVulnerabilities.critical > 0 ? 'critical' : 'positive'}
                shade="tone"
              />
              <KpiTile
                icon={<ShieldCheck className="h-5 w-5" />}
                label={t('High vulnerabilities open')}
                value={posture.openVulnerabilities.high}
                tone={posture.openVulnerabilities.high > 0 ? 'risk' : 'positive'}
                shade="tone"
              />
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-ink-200 p-3">
            <p className="mb-2 text-[0.6875rem] font-bold tracking-[0.06em] text-ink-500 uppercase">{t('Open vulnerabilities by severity')}</p>
            <SegmentDonut segments={vulnerabilitySegments} centreValue={String(openVulnerabilities)} centreLabel={t('open')} size={150} />
          </div>
        </ReportSection>
      ) : null}
      <ReportSection title={t('Recent security events')} description={t('Most recently detected first.')}>
        <PrintableFold summary={t('Show the security event table')}>
          <ReportTable
            keyFn={(e) => e.id}
            rows={events}
            columns={[
              { header: t('Reference'), cell: (e) => e.reference },
              { header: t('Type'), cell: (e) => SECURITY_EVENT_LABEL[e.type] },
              { header: t('Severity'), cell: (e) => <SeverityBadge severity={e.severity} /> },
              { header: t('Status'), cell: (e) => enumLabel(e.status) },
              { header: t('Detected'), cell: (e) => formatDate(e.detectedAt) },
            ]}
          />
        </PrintableFold>
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
  const activeModels = models.filter((m) => m.status === 'active').length
  const openRisks = risks.filter((r) => r.status !== 'accepted')
  const reviewSegments: Segment[] = summary
    ? [
        { id: 'pending', label: t('Pending review'), value: summary.pending, colour: CHART_COLOURS.neutral },
        { id: 'accepted', label: t('Accepted'), value: summary.accepted, colour: CHART_COLOURS.positive },
        { id: 'modified', label: t('Modified before acceptance'), value: summary.modified, colour: CHART_COLOURS.intel },
        { id: 'rejected', label: t('Rejected'), value: summary.rejected, colour: CHART_COLOURS.critical },
        { id: 'escalated', label: t('Escalated'), value: summary.escalated, colour: CHART_COLOURS.warn },
      ]
    : []

  return (
    <ReportMasthead title={t('AI Governance Report')} classification="confidential">
      {summary ? (
        <ReportSection title={t('Human oversight of AI recommendations')}>
          <FigureRow>
            <KpiTile
              icon={<ClipboardList className="h-5 w-5" />}
              label={t('Pending review')}
              value={summary.pending}
              tone={summary.pending > 0 ? 'warn' : 'positive'}
              shade="tone"
            />
            <KpiTile icon={<CheckCircle2 className="h-5 w-5" />} label={t('Accepted')} value={summary.accepted} tone="positive" shade="green" />
            <KpiTile icon={<XCircle className="h-5 w-5" />} label={t('Rejected')} value={summary.rejected} tone="neutral" shade="blue" />
            <KpiTile
              icon={<AlertOctagon className="h-5 w-5" />}
              label={t('Escalated')}
              value={summary.escalated}
              tone={summary.escalated > 0 ? 'risk' : 'positive'}
              shade="tone"
            />
          </FigureRow>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-ink-200 p-3">
              <p className="mb-2 text-[0.6875rem] font-bold tracking-[0.06em] text-ink-500 uppercase">{t('Recommendations by review outcome')}</p>
              <SegmentDonut segments={reviewSegments} centreLabel={t('recommendations')} size={150} />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <ServiceTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                label={t('Acceptance rate')}
                value={formatPercent(summary.acceptanceRate)}
                meter={summary.acceptanceRate}
                note={t('{0} modified before acceptance', summary.modified)}
                tone="neutral"
                shade="teal"
              />
              <ServiceTile
                icon={<Bot className="h-4 w-4" />}
                label={t('Approved model registry')}
                value={t('{0} of {1} active', activeModels, models.length)}
                meter={(activeModels / Math.max(1, models.length)) * 100}
                note={t('{0} AI risk entries open or monitored', openRisks.length)}
                tone="neutral"
                shade="blue"
              />
            </div>
          </div>
        </ReportSection>
      ) : null}
      <ReportSection title={t('Approved model registry')} description={t('{0} of {1} models active.', activeModels, models.length)}>
        <PrintableFold summary={t('Show the model registry table')}>
          <ReportTable
            keyFn={(m) => m.id}
            rows={models}
            columns={[
              { header: t('Model'), cell: (m) => m.name },
              { header: t('Provider'), cell: (m) => m.provider },
              { header: t('Risk class'), cell: (m) => enumLabel(m.riskClass) },
              { header: t('Evaluation'), cell: (m) => enumLabel(m.evaluationStatus) },
              { header: t('Status'), cell: (m) => enumLabel(m.status) },
            ]}
          />
        </PrintableFold>
      </ReportSection>
      <ReportSection title={t('AI risk register')} description={t('Open and monitored risk entries.')}>
        <PrintableFold summary={t('Show the AI risk register')}>
          <ReportTable
            keyFn={(r) => r.id}
            rows={openRisks}
            columns={[
              { header: t('Category'), cell: (r) => enumLabel(r.category) },
              { header: t('Likelihood'), cell: (r) => enumLabel(r.likelihood) },
              { header: t('Impact'), cell: (r) => enumLabel(r.impact) },
              { header: t('Inherent rating'), cell: (r) => <SeverityBadge severity={r.inherentRating} /> },
              { header: t('Residual rating'), cell: (r) => <SeverityBadge severity={r.residualRating} /> },
              { header: t('Status'), cell: (r) => enumLabel(r.status) },
              { header: t('Review due'), cell: (r) => formatDate(r.reviewDue) },
            ]}
          />
        </PrintableFold>
      </ReportSection>
    </ReportMasthead>
  )
}

/* ==========================================================================
   Page
   ========================================================================== */

export function ReportsPage(): React.JSX.Element {
  const user = useCurrentUser()
  // The open report lives in the URL, so a printed or shared link reopens it.
  const [params, setParams] = useSearchParams()
  const reportParam = params.get('report')
  const selected: ReportId = REPORTS.some((r) => r.id === reportParam) ? (reportParam as ReportId) : 'daily-brief'
  const setSelected = (id: ReportId): void =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id === 'daily-brief') next.delete('report')
        else next.set('report', id)
        return next
      },
      { replace: true },
    )
  const scopedWardCount = useFilterStore((s) => s.filters.wardIds.length)
  const canPrint = allowed(user, 'report', 'export')
  const activeReport = REPORTS.find((r) => r.id === selected) ?? REPORTS[0]

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(t('Report Workspace'))

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
            title={canPrint ? undefined : t('Your role does not hold report:export')}
            onClick={() => window.print()}
          >
            {t('Print / Save as PDF')}
          </Button>
        }
        controls={
          <Tabs
            variant="pill"
            ariaLabel={t('Select report')}
            value={selected}
            onChange={(id) => setSelected(id as ReportId)}
            items={REPORTS.map((r) => ({
              id: r.id,
              label: r.title,
              icon: r.icon,
            }))}
          />
        }
      />

      {scopedWardCount > 0 ? (
        <p className="print-hidden rounded-lg border border-warn-200 bg-warn-50 px-3 py-2 text-xs leading-relaxed text-warn-700">
          {t('These are corporation-wide reports. The ward selection narrows the working screens, not these reports, so every figure below covers all of your authorised wards.')}
        </p>
      ) : null}

      <Card className="print-full p-4 sm:p-8">
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
        {t(
          "Reports reflect the platform's current session state and regenerate on each view - they are not archived snapshots in this demonstration environment.",
        )}
      </div>

      <DemonstrationNotice className="print-hidden" />
    </PageBody>
  )
}

export default ReportsPage
