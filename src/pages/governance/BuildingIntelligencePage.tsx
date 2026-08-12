import { useMemo, useState } from 'react'
import { Boxes, ShieldAlert } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { buildingService } from '@/services'
import { useDrawerStore } from '@/stores/ui.store'
import { ROUTES } from '@/config/navigation'
import type { BuildingProposal, BuildingRecord } from '@/types/city-domains'
import { wardName } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatNumber, formatRelative } from '@/utils/format'
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
  Select,
  type Column,
} from '@/components/ui'
import { SeverityBadge } from '@/components/ui/badges'
import { MetricCard } from '@/components/cards'
import { CategoryBarChart, ChartFrame, CompositionBar } from '@/components/charts'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-5800),
  refreshIntervalMinutes: 10080,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

function build$AUDIT_STATUS_LABEL(): Record<BuildingRecord['structuralAudit'], string> {
  return {
  'not-due': t('Not Due'),
  due: t('Due'),
  completed: t('Completed'),
  overdue: t('Overdue'),
}
}
let AUDIT_STATUS_LABEL: Record<BuildingRecord['structuralAudit'], string> = build$AUDIT_STATUS_LABEL()
registerLayer(() => {
  AUDIT_STATUS_LABEL = build$AUDIT_STATUS_LABEL()
})

function build$PERMISSION_LABEL(): Record<BuildingRecord['permissionStatus'], string> {
  return {
  approved: t('Approved'),
  'under-scrutiny': t('Under Scrutiny'),
  'notice-issued': t('Notice Issued'),
  'unauthorised-alleged': t('Unauthorised (Alleged)'),
}
}
let PERMISSION_LABEL: Record<BuildingRecord['permissionStatus'], string> = build$PERMISSION_LABEL()
registerLayer(() => {
  PERMISSION_LABEL = build$PERMISSION_LABEL()
})

function build$STAGE_LABEL(): Record<BuildingProposal['stage'], string> {
  return {
  submitted: t('Submitted'),
  scrutiny: t('Scrutiny'),
  'query-raised': t('Query Raised'),
  approved: t('Approved'),
  rejected: t('Rejected'),
}
}
let STAGE_LABEL: Record<BuildingProposal['stage'], string> = build$STAGE_LABEL()
registerLayer(() => {
  STAGE_LABEL = build$STAGE_LABEL()
})

function build$AGE_BANDS(): Array<{ label: string; test: (d: number) => boolean }> {
  return [
  { label: t('0–15 days'), test: (d) => d <= 15 },
  { label: t('16–30 days'), test: (d) => d > 15 && d <= 30 },
  { label: t('31–60 days'), test: (d) => d > 30 && d <= 60 },
  { label: t('61–90 days'), test: (d) => d > 60 && d <= 90 },
  { label: t('Over 90 days'), test: (d) => d > 90 },
]
}
let AGE_BANDS: Array<{ label: string; test: (d: number) => boolean }> = build$AGE_BANDS()
registerLayer(() => {
  AGE_BANDS = build$AGE_BANDS()
})

export function BuildingIntelligencePage(): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)
  const [wardFilter, setWardFilter] = useState<string>('all')

  const buildingsQuery = useServiceQuery(queryKeys.admin('buildings'), (user) => buildingService.buildings(user))
  const proposalsQuery = useServiceQuery(queryKeys.admin('building-proposals'), (user) => buildingService.proposals(user))

  const buildings = buildingsQuery.data ?? []
  const proposals = proposalsQuery.data ?? []

  const filteredBuildings = wardFilter === 'all' ? buildings : buildings.filter((b) => b.wardId === wardFilter)
  const filteredProposals = wardFilter === 'all' ? proposals : proposals.filter((p) => p.wardId === wardFilter)

  const wardOptions = useMemo(
    () => Array.from(new Set(buildings.map((b) => b.wardId))).map((id) => ({ value: id, label: wardName(id) })).sort((a, b) => a.label.localeCompare(b.label)),
    [buildings],
  )

  const summary = useMemo(() => {
    const auditsOverdue = filteredBuildings.filter((b) => b.structuralAudit === 'overdue').length
    const c1 = filteredBuildings.filter((b) => b.dilapidationCategory === 'C1').length
    const c2a = filteredBuildings.filter((b) => b.dilapidationCategory === 'C2A').length
    const c2b = filteredBuildings.filter((b) => b.dilapidationCategory === 'C2B').length
    const c3 = filteredBuildings.filter((b) => b.dilapidationCategory === 'C3').length
    const inScrutiny = filteredProposals.filter((p) => p.stage === 'scrutiny' || p.stage === 'query-raised').length
    const slaBreached = filteredProposals.filter((p) => p.slaBreached).length
    return { auditsOverdue, c1, c2a, c2b, c3, inScrutiny, slaBreached }
  }, [filteredBuildings, filteredProposals])

  const lifeSafety = useMemo(
    () => filteredBuildings.filter((b) => b.dilapidationCategory === 'C1' || b.structuralAudit === 'overdue').sort((a) => (a.dilapidationCategory === 'C1' ? -1 : 1)),
    [filteredBuildings],
  )

  const auditComposition = useMemo(() => {
    const statuses: BuildingRecord['structuralAudit'][] = ['not-due', 'due', 'completed', 'overdue']
    const colours: Record<BuildingRecord['structuralAudit'], string> = { 'not-due': '#8195ac', due: '#f59e0b', completed: '#10b981', overdue: '#e5484d' }
    return statuses.map((s) => ({ id: s, label: AUDIT_STATUS_LABEL[s], value: filteredBuildings.filter((b) => b.structuralAudit === s).length, colour: colours[s] }))
  }, [filteredBuildings])

  const ageingData = useMemo(
    () => AGE_BANDS.map((band) => ({ label: band.label, proposals: filteredProposals.filter((p) => band.test(p.ageDays)).length })),
    [filteredProposals],
  )

  const buildingColumns: Array<Column<BuildingRecord>> = [
    { id: 'reference', header: t('Reference'), cell: (r) => <span className="font-mono text-[0.6875rem] text-ink-500">{r.reference}</span>, sortValue: (r) => r.reference, searchValue: (r) => `${r.reference} ${r.name}`, width: '9rem' },
    { id: 'name', header: t('Name'), cell: (r) => <span className="font-medium text-ink-800">{r.name}</span>, sortValue: (r) => r.name, width: '16rem' },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'md' },
    { id: 'type', header: t('Type'), cell: (r) => <Badge tone="neutral">{r.type}</Badge>, sortValue: (r) => r.type, hideBelow: 'lg' },
    { id: 'year', header: t('Year built'), cell: (r) => <span className="numeric">{r.yearBuilt}</span>, sortValue: (r) => r.yearBuilt, align: 'right', optional: true },
    { id: 'floors', header: t('Floors'), cell: (r) => <span className="numeric">{r.floors}</span>, sortValue: (r) => r.floors, align: 'right', optional: true },
    {
      id: 'audit',
      header: t('Structural audit'),
      cell: (r) => <Badge tone={r.structuralAudit === 'overdue' ? 'critical' : r.structuralAudit === 'due' ? 'warn' : r.structuralAudit === 'completed' ? 'positive' : 'neutral'}>{AUDIT_STATUS_LABEL[r.structuralAudit]}</Badge>,
      sortValue: (r) => r.structuralAudit,
    },
    {
      id: 'dilapidation',
      header: t('Dilapidation'),
      cell: (r) => (r.dilapidationCategory ? <Badge tone={r.dilapidationCategory === 'C1' ? 'critical' : r.dilapidationCategory === 'C2A' ? 'risk' : 'warn'}>{r.dilapidationCategory}</Badge> : <span className="text-ink-300">-</span>),
      sortValue: (r) => r.dilapidationCategory ?? '',
    },
    { id: 'occupancy', header: t('Occupancy units'), cell: (r) => <span className="numeric">{r.occupancyUnits}</span>, sortValue: (r) => r.occupancyUnits, align: 'right', hideBelow: 'lg' },
    { id: 'permission', header: t('Permission status'), cell: (r) => <Badge tone={r.permissionStatus === 'unauthorised-alleged' ? 'critical' : r.permissionStatus === 'notice-issued' ? 'warn' : 'neutral'}>{PERMISSION_LABEL[r.permissionStatus]}</Badge>, sortValue: (r) => r.permissionStatus, optional: true },
    { id: 'severity', header: t('Severity'), cell: (r) => <SeverityBadge severity={r.severity} />, sortValue: (r) => r.severity },
    { id: 'inspected', header: t('Last inspected'), cell: (r) => <span className="text-[0.6875rem] text-ink-500">{formatRelative(r.lastInspectedAt)}</span>, sortValue: (r) => r.lastInspectedAt },
  ]

  const proposalColumns: Array<Column<BuildingProposal>> = [
    { id: 'reference', header: t('Reference'), cell: (r) => <span className="font-mono text-[0.6875rem] text-ink-500">{r.reference}</span>, sortValue: (r) => r.reference, searchValue: (r) => r.reference, width: '10rem' },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId) },
    { id: 'applicant', header: t('Applicant type'), cell: (r) => <Badge tone="neutral">{r.applicantType}</Badge>, sortValue: (r) => r.applicantType, hideBelow: 'md' },
    { id: 'stage', header: t('Stage'), cell: (r) => <Badge tone={r.stage === 'rejected' ? 'critical' : r.stage === 'approved' ? 'positive' : 'warn'}>{STAGE_LABEL[r.stage]}</Badge>, sortValue: (r) => r.stage },
    { id: 'age', header: t('SLA age'), cell: (r) => <span className={`numeric ${r.slaBreached ? 'font-semibold text-crit-700' : ''}`}>{t('{0}d / {1}d', r.ageDays, r.slaDays)}</span>, sortValue: (r) => r.ageDays - r.slaDays, align: 'right' },
    { id: 'breach', header: t('SLA breach'), cell: (r) => (r.slaBreached ? <Badge tone="critical">{t('Breached')}</Badge> : <Badge tone="positive">{t('Within SLA')}</Badge>), sortValue: (r) => (r.slaBreached ? 1 : 0) },
    { id: 'area', header: t('Built-up area'), cell: (r) => <span className="numeric">{t('{0} m²', formatNumber(r.builtUpAreaSqm))}</span>, sortValue: (r) => r.builtUpAreaSqm, align: 'right', optional: true },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        title={t('Building Intelligence')}
        description={t('Structural audits, dilapidation status and development-control proposals across the municipal building stock. Structures with a C1 dilapidation category or an overdue structural audit are treated as a life-safety exposure requiring priority attention.')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Building Intelligence') }]}
        freshness={FRESHNESS}
        actions={
          <LinkButton to={ROUTES.assets} variant="outline" icon={<Boxes className="h-3.5 w-3.5" />}>
            {t('Open Asset Intelligence')}
          </LinkButton>
        }
        controls={
          <Select
            aria-label={t('Filter by ward')}
            value={wardFilter}
            onChange={(e) => setWardFilter(e.target.value)}
            options={[{ value: 'all', label: t('All wards') }, ...wardOptions]}
            className="w-auto"
          />
        }
      />

      {buildingsQuery.isLoading || proposalsQuery.isLoading ? <LoadingState variant="metrics" /> : null}
      {buildingsQuery.error || proposalsQuery.error ? (
        <ErrorState
          detail={(buildingsQuery.error ?? proposalsQuery.error)?.message}
          onRetry={() => {
            void buildingsQuery.refetch()
            void proposalsQuery.refetch()
          }}
        />
      ) : null}

      {!buildingsQuery.isLoading && !proposalsQuery.isLoading && !buildingsQuery.error && !proposalsQuery.error && buildings.length === 0 ? (
        <EmptyState title={t('No building records available')} detail="No structures are recorded within your authorised scope." />
      ) : null}

      {!buildingsQuery.isLoading && !proposalsQuery.isLoading && !buildingsQuery.error && !proposalsQuery.error && buildings.length > 0 ? (
        <>
          <Card>
            <CardHeader title={t('Register summary')} description={t('Scoped to the ward filter selected above.')} />
            <MetricGrid columns={5} className="mt-4">
              <MetricCard label={t('Structures tracked')} value={formatNumber(filteredBuildings.length)} />
              <MetricCard label={t('Audits overdue')} value={formatNumber(summary.auditsOverdue)} tone={summary.auditsOverdue > 0 ? 'warn' : 'default'} />
              <MetricCard
                label={t('C1 structures')}
                value={formatNumber(summary.c1)}
                support={t('Life-safety exposure - priority attention')}
                tone={summary.c1 > 0 ? 'critical' : 'default'}
              />
              <MetricCard label={t('Proposals in scrutiny')} value={formatNumber(summary.inScrutiny)} support={t('of {0} on record', filteredProposals.length)} />
              <MetricCard label={t('SLA-breached proposals')} value={formatNumber(summary.slaBreached)} tone={summary.slaBreached > 0 ? 'critical' : 'default'} />
            </MetricGrid>
          </Card>

          {lifeSafety.length > 0 ? (
            <Card tone="critical" flush>
              <CardHeader
                bordered
                icon={<ShieldAlert className="h-4 w-4" />}
                title={t('Life-safety exposure - {0} structure{1}', lifeSafety.length, lifeSafety.length === 1 ? '' : 's')}
                description={t('C1-category structures and structures with an overdue statutory structural audit, surfaced ahead of the general register.')}
              />
              <div className="scrollbar-slim max-h-64 overflow-y-auto p-2">
                {lifeSafety.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => openDrawer({ kind: 'ward', id: b.wardId })}
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-crit-50/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ink-800">{b.name}</p>
                      <p className="mt-0.5 truncate text-[0.625rem] text-ink-500">{t('{0} · {1} occupancy units · {2}', wardName(b.wardId), b.occupancyUnits, formatRelative(b.lastInspectedAt))}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {b.dilapidationCategory === 'C1' ? <Badge tone="critical">C1</Badge> : null}
                      {b.structuralAudit === 'overdue' ? <Badge tone="critical">{t('Audit overdue')}</Badge> : null}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          <Card flush>
            <CardHeader bordered title={t('Structures register')} description={t('Sortable, filterable and paginated. Row click opens the structure\'s ward record.')} />
            <DataTable
              rows={filteredBuildings}
              columns={buildingColumns}
              rowKey={(r) => r.id}
              pageSize={10}
              stickyHeader
              maxHeight="28rem"
              searchPlaceholder="Search structures"
              onRowClick={(r) => openDrawer({ kind: 'ward', id: r.wardId })}
              rowAccent={(r) => <SeverityRailFor severity={r.severity} />}
            />
          </Card>

          <Card flush>
            <CardHeader bordered title={t('Building proposals')} description={t('Development-control proposals with SLA age and breach status.')} />
            <DataTable rows={filteredProposals} columns={proposalColumns} rowKey={(r) => r.id} pageSize={10} stickyHeader maxHeight="26rem" searchPlaceholder="Search proposals" />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('Structural audit compliance')} description={t('Composition of the register by audit status.')} />
              <CompositionBar segments={auditComposition} className="mt-4" />
            </Card>
            <Card>
              <ChartFrame title={t('Proposal ageing')} unit="proposals" timeframe="Current scope" description={t('Age distribution of open and closed proposals against their SLA band.')} freshness={FRESHNESS} height={220}>
                <CategoryBarChart data={ageingData} categoryKey="label" series={[{ key: 'proposals', label: t('Proposals'), colour: '#2f6feb' }]} />
              </ChartFrame>
            </Card>
          </div>
        </>
      ) : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

function SeverityRailFor({ severity }: { severity: BuildingRecord['severity'] }): React.JSX.Element {
  const colour = severity === 'critical' ? 'bg-crit-500' : severity === 'high' ? 'bg-risk-500' : severity === 'medium' ? 'bg-warn-500' : 'bg-ok-500'
  return <span className={`w-[3px] rounded-full ${colour}`} aria-hidden />
}

export default BuildingIntelligencePage
