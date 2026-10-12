import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/config/navigation'
import { Download, FileSearch, Lock, ShieldOff, Activity, Filter, ShieldX, Users, Bot, Gauge } from 'lucide-react'
import { KpiTile } from '@/components/infographic'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, ClassificationBadge } from '@/components/ui/badges'
import { Button, Card, Input, Label, MetricGrid, Select } from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { Tabs } from '@/components/ui/overlays'
import { EvidenceCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery, useServiceAction } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import {
  auditService,
  governanceService,
  wardService,
  type AuditFilters,
  type EvidenceBrowseFilters,
} from '@/services'
import { allowed } from '@/security'
import { useCurrentUser } from '@/stores/auth.store'
import { useDrawerStore, useFilterStore, type FilterState } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardName } from '@/data/reference'
import { formatDateTime, formatNumber, formatRelative } from '@/utils/format'
import { DEMO_NOW } from '@/utils/deterministic'
import { CLASSIFICATION_LABEL, type DataClassification, type DateRangeKey } from '@/types/common'
import type { AuditAction, AuditEvent } from '@/types/governance'
import { AUDIT_ACTION_LABEL } from '@/types/governance'
import type { EvidenceItem, EvidenceKind } from '@/types/intelligence'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'
import { SHADE } from '@/components/ui/shade'

const DATE_RANGE_HOURS: Record<DateRangeKey, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  '90d': 24 * 90,
  fy: 24 * 365,
}

function withinDateRange(iso: string, range: DateRangeKey): boolean {
  const ageMs = DEMO_NOW.getTime() - new Date(iso).getTime()
  return ageMs <= DATE_RANGE_HOURS[range] * 3_600_000
}

/** The evidence corpus carries wardIds, a departmentId and an observed date - all real. */
function matchesEvidenceGlobalFilters(item: EvidenceItem, filters: FilterState): boolean {
  if (filters.wardIds.length > 0 && !item.wardIds.some((w) => filters.wardIds.includes(w))) return false
  if (filters.departmentIds.length > 0 && !filters.departmentIds.includes(item.departmentId)) return false
  if (!withinDateRange(item.observedAt, filters.dateRange)) return false
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    if (!item.title.toLowerCase().includes(q) && !item.summary.toLowerCase().includes(q)) return false
  }
  return true
}

/** The audit trail carries no ward or department - only a timestamp and free text. */
function matchesAuditGlobalFilters(e: AuditEvent, filters: FilterState): boolean {
  if (!withinDateRange(e.at, filters.dateRange)) return false
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    if (!e.actorName.toLowerCase().includes(q) && !e.resourceLabel.toLowerCase().includes(q) && !(e.reason ?? '').toLowerCase().includes(q)) return false
  }
  return true
}

/**
 * src/pages/trust/EvidenceAuditPage.tsx
 *
 * Evidence and audit are two faces of the same accountability guarantee.
 * The evidence corpus is browsed as a whole through
 * `governanceService.browseEvidence`, with kind, classification, ward and
 * search filters applied server-side; the audit trail reads through
 * `auditService`, and exporting it writes a new audit event of its own.
 */

function build$KIND_LABEL(): Record<EvidenceKind, string> {
  return {
  'source-record': t('Source record'),
  'derived-metric': t('Derived metric'),
  'sensor-reading': t('Sensor reading'),
  'field-report': t('Field report'),
  inspection: t('Inspection'),
  document: t('Document'),
  'model-output': t('Model output'),
  complaint: t('Complaint cluster'),
  'financial-record': t('Financial record'),
}
}
let KIND_LABEL: Record<EvidenceKind, string> = build$KIND_LABEL()
registerLayer(() => {
  KIND_LABEL = build$KIND_LABEL()
})

function build$PROVENANCE_RAIL(): Array<{ label: string; detail: string }> {
  return [
  { label: t('Source'), detail: t('The authoritative departmental system of record. The platform never writes back to it.') },
  { label: t('Transformation'), detail: t('The declared extract, cleaning and mapping applied between source and platform.') },
  { label: t('Metric'), detail: t('The derived indicator computed from canonical entities using published weights.') },
  { label: t('Rule / Model'), detail: t('The threshold rule or model that evaluated the metric.') },
  { label: t('Intelligence'), detail: t('The signal raised, with severity and confidence assigned.') },
  { label: t('Recommendation'), detail: t('An advisory action, always naming an accountable human role.') },
  { label: t('Human Decision'), detail: t('A named officer decides; the platform never selects on their behalf.') },
  { label: t('Action'), detail: t('An assigned, owned, due-dated task tracked to completion.') },
  { label: t('Outcome'), detail: t('The measured effect, reported without adjustment.') },
]
}
let PROVENANCE_RAIL: Array<{ label: string; detail: string }> = build$PROVENANCE_RAIL()
registerLayer(() => {
  PROVENANCE_RAIL = build$PROVENANCE_RAIL()
})

export function EvidenceAuditPage(): React.JSX.Element {
  const currentUser = useCurrentUser()
  const openDrawer = useDrawerStore((s) => s.open)
  const globalFilters = useFilterStore((s) => s.filters)
  const [tab, setTab] = useState<'evidence' | 'audit'>('evidence')

  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(t('Evidence & Audit'))

  // ---------------------------------------------------------------- Evidence
  const [evidenceSearch, setEvidenceSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<EvidenceKind | ''>('')
  const [evClassificationFilter, setEvClassificationFilter] = useState<DataClassification | ''>('')
  const [evWardFilter, setEvWardFilter] = useState('')

  const evidenceFilters: EvidenceBrowseFilters = useMemo(() => {
    const f: EvidenceBrowseFilters = {}
    if (kindFilter) f.kind = kindFilter
    if (evClassificationFilter) f.classification = evClassificationFilter
    if (evWardFilter) f.wardId = evWardFilter
    if (evidenceSearch.trim()) f.search = evidenceSearch.trim()
    // The whole scoped corpus: the filter bar narrows it afterwards, and a
    // "latest 120" cut taken first would leave a single ward empty.
    f.limit = 5000
    return f
  }, [kindFilter, evClassificationFilter, evWardFilter, evidenceSearch])

  // Kind/classification/ward/search are applied server-side by
  // `governanceService.browseEvidence` - the query key includes the filter
  // set so a change re-issues the request rather than filtering client-side.
  const evidenceQuery = useServiceQuery(
    ['trust-evidence-audit', 'browse-evidence', JSON.stringify(evidenceFilters)],
    (user) => governanceService.browseEvidence(user, evidenceFilters),
  )
  const wardsQuery = useServiceQuery(queryKeys.wards(), (user) => wardService.list(user))

  // Kind/classification/ward/search narrow the request server-side; the global
  // filter bar's ward/department/date/search are applied on top, client-side.
  const filteredEvidence = (evidenceQuery.data ?? []).filter((e) => matchesEvidenceGlobalFilters(e, globalFilters))
  const wardOptions = wardsQuery.data ?? []
  const [shown, setShown] = useState(30)
  const resetGlobalFilters = useFilterStore((s) => s.resetFilters)
  const restrictedCount = filteredEvidence.filter((e) => e.classification === 'restricted').length
  const kindCounts = useMemo(() => {
    const m = new Map<EvidenceKind, number>()
    for (const e of filteredEvidence) m.set(e.kind, (m.get(e.kind) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [filteredEvidence])

  // ------------------------------------------------------------------ Audit
  const auditQuery = useServiceQuery(queryKeys.audit(), (user) => auditService.list(user, { pageSize: 260 }))
  const [actorFilter, setActorFilter] = useState('')
  const [actionFilter, setActionFilter] = useState<AuditAction | ''>('')
  const [outcomeFilter, setOutcomeFilter] = useState<AuditEvent['outcome'] | ''>('')
  const [classificationFilter, setClassificationFilter] = useState<DataClassification | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [exportResult, setExportResult] = useState<{ count: number; at: string } | null>(null)

  const auditEvents = useMemo(() => auditQuery.data?.items ?? [], [auditQuery.data])
  const actorOptions = useMemo(() => Array.from(new Set(auditEvents.map((e) => e.actorName))).sort(), [auditEvents])

  const activeAuditFilters: AuditFilters = useMemo(() => {
    const f: AuditFilters = {}
    if (actionFilter) f.action = [actionFilter]
    if (classificationFilter) f.classification = [classificationFilter]
    if (dateFrom) f.dateFrom = new Date(dateFrom).toISOString()
    if (dateTo) f.dateTo = new Date(dateTo).toISOString()
    return f
  }, [actionFilter, classificationFilter, dateFrom, dateTo])

  const filteredAudit = useMemo(() => {
    return auditEvents.filter((e) => {
      if (actorFilter && e.actorName !== actorFilter) return false
      if (actionFilter && e.action !== actionFilter) return false
      if (outcomeFilter && e.outcome !== outcomeFilter) return false
      if (classificationFilter && e.classification !== classificationFilter) return false
      if (dateFrom && e.at < new Date(dateFrom).toISOString()) return false
      if (dateTo && e.at > new Date(dateTo).toISOString()) return false
      if (!matchesAuditGlobalFilters(e, globalFilters)) return false
      return true
    })
  }, [auditEvents, actorFilter, actionFilter, outcomeFilter, classificationFilter, dateFrom, dateTo, globalFilters])

  const exportAudit = useServiceAction(
    (user, filters: AuditFilters) => auditService.export(user, filters),
    [queryKeys.audit()],
  )
  const canExport = allowed(currentUser, 'audit', 'export')

  const auditColumns: Array<Column<AuditEvent>> = [
    { id: 'actor', header: t('Actor'), cell: (e) => e.actorName, sortValue: (e) => e.actorName, searchValue: (e) => `${e.actorName} ${e.resourceLabel}` },
    { id: 'role', header: t('Role'), cell: (e) => e.actorRole, sortValue: (e) => e.actorRole, hideBelow: 'lg' },
    { id: 'action', header: t('Action'), cell: (e) => <Badge tone="muted">{AUDIT_ACTION_LABEL[e.action]}</Badge>, sortValue: (e) => AUDIT_ACTION_LABEL[e.action] },
    { id: 'resourceType', header: t('Resource type'), cell: (e) => e.resourceType, sortValue: (e) => e.resourceType, hideBelow: 'lg' },
    { id: 'resource', header: t('Resource'), cell: (e) => <span className="font-mono text-[0.6875rem] text-ink-600">{e.resourceLabel}</span>, sortValue: (e) => e.resourceLabel },
    { id: 'timestamp', header: t('Timestamp'), cell: (e) => formatDateTime(e.at), sortValue: (e) => e.at },
    { id: 'reason', header: t('Reason'), cell: (e) => (e.reason ? <span className="line-clamp-2 max-w-[12rem] text-[0.75rem] text-ink-500">{e.reason}</span> : '-'), sortable: false, hideBelow: 'xl' },
    { id: 'source', header: t('Source address'), cell: () => <span className="font-mono text-[0.625rem] text-ink-300">{t('not recorded')}</span>, sortable: false, hideBelow: 'xl' },
    { id: 'session', header: t('Session'), cell: (e) => <span className="font-mono text-[0.625rem] text-ink-400">{e.sessionId}</span>, sortable: false, hideBelow: 'xl' },
    { id: 'classification', header: t('Classification'), cell: (e) => <ClassificationBadge classification={e.classification} />, sortValue: (e) => e.classification, hideBelow: 'lg' },
    {
      id: 'outcome',
      header: t('Outcome'),
      cell: (e) => (
        <Badge tone={e.outcome === 'denied' ? 'critical' : e.outcome === 'error' ? 'warn' : 'positive'} dot icon={e.outcome === 'denied' ? <ShieldOff className="h-3 w-3" /> : undefined}>
          {e.outcome}
        </Badge>
      ),
      sortValue: (e) => e.outcome,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Trust Centre')}
        breadcrumbs={[{ label: t('Trust Centre'), to: '/trust' }, { label: t('Evidence & Audit') }]}
        controls={
          <div className="flex w-full flex-wrap items-center gap-2">
            <Tabs
              items={[
                { id: 'evidence', label: t('Evidence'), count: filteredEvidence.length || undefined },
                { id: 'audit', label: t('Audit trail'), count: auditEvents.length || undefined },
              ]}
              value={tab}
              onChange={(id) => setTab(id as 'evidence' | 'audit')}
              ariaLabel={t('Evidence and audit sections')}
            />
            <FilterBar show={tab === 'evidence' ? ['ward', 'department', 'date', 'search'] : ['date', 'search']} />
          </div>
        }
      />

      <GovPanel title={t('The provenance chain')} tone="amber">
        <p className="mb-3 text-xs leading-relaxed text-ink-500">
          {t('Every figure the platform presents can be traced through these nine stages, end to end. Sourced figures, each with its document and verbatim quote, are in the Evidence Registry.')}{' '}
          <Link to={ROUTES.evidenceRegistry} className="font-semibold text-govt-700 underline underline-offset-2 hover:text-govt-900">
            {t('Open the Evidence Registry')}
          </Link>
        </p>
        <div className="flex flex-col gap-2 overflow-x-auto sm:flex-row sm:items-stretch">
          {PROVENANCE_RAIL.map((stage, i) => (
            <div key={stage.label} className="flex min-w-[8rem] flex-1 items-center gap-2">
              <div className="min-w-0 flex-1 rounded-md border border-ink-100 bg-surface-sunken px-2.5 py-2" title={stage.detail}>
                <p className="text-[0.6875rem] font-semibold text-ink-800">{stage.label}</p>
                <p className="mt-0.5 hidden text-[0.625rem] leading-snug text-ink-500 lg:block">{stage.detail}</p>
              </div>
              {i < PROVENANCE_RAIL.length - 1 ? <span className="hidden shrink-0 text-ink-300 sm:block">→</span> : null}
            </div>
          ))}
        </div>
      </GovPanel>

      {tab === 'evidence' ? (
        <>
          {evidenceQuery.isLoading ? (
            <LoadingState variant="table" />
          ) : evidenceQuery.error ? (
            <ErrorState detail={evidenceQuery.error.message} onRetry={() => evidenceQuery.refetch()} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <KpiTile
                  icon={<FileSearch className="h-5 w-5" />}
                  label={t('Evidence records reachable')}
                  value={formatNumber(filteredEvidence.length)}
                  reading={t('within your post\'s scope and the filters below')}
                />
                <KpiTile
                  icon={<Lock className="h-5 w-5" />}
                  label={t('Restricted classification')}
                  value={formatNumber(restrictedCount)}
                  reading={t('readable only to posts cleared for them')}
                  tone={restrictedCount > 0 ? 'warn' : 'neutral'}
                />
                <KpiTile
                  icon={<Bot className="h-5 w-5" />}
                  label={t('Model-assisted records')}
                  value={formatNumber(filteredEvidence.filter((e) => e.modelId).length)}
                  reading={t('records carrying a model identifier')}
                  shade="teal"
                />
                <KpiTile
                  icon={<Gauge className="h-5 w-5" />}
                  label={t('Average data quality')}
                  value={`${
                    filteredEvidence.length > 0
                      ? Math.round(filteredEvidence.reduce((s, e) => s + e.dataQuality, 0) / filteredEvidence.length)
                      : 0
                  }/100`}
                  reading={t('mean across the records shown')}
                  shade="blue"
                />
              </div>

              <GovPanel
                title={t('Evidence corpus')}
                subtitle={t('Open a record to inspect its full provenance chain.')}
                tone="primary"
                actions={
                  <Badge tone="info" size="sm">
                    {t('{0} record(s)', formatNumber(filteredEvidence.length))}
                  </Badge>
                }
              >
                <p className="mb-3 text-xs leading-relaxed text-ink-500">
                  {t('The evidence corpus browsed in full, scoped to your principal\'s ward, department and classification ceiling. Open a record to inspect its full provenance chain.')}
                </p>

                {/* One click per kind - the quickest way into a large corpus. */}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {kindCounts.map(([kind, n]) => {
                    const on = kindFilter === kind
                    return (
                      <button
                        key={kind}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setKindFilter(on ? '' : kind)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.6875rem] font-semibold ring-1 transition-colors',
                          on ? 'bg-navy-900 text-white ring-navy-900' : 'bg-surface text-ink-700 ring-ink-200 hover:bg-govt-50 hover:ring-govt-300',
                        )}
                      >
                        {KIND_LABEL[kind]}
                        <span className={cn('numeric rounded-full px-1.5', on ? 'bg-white/20' : 'bg-ink-100 text-ink-600')}>{formatNumber(n)}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-full max-w-56">
                    <Label htmlFor="ev-search" className="sr-only">{t('Search evidence')}</Label>
                    <Input id="ev-search" value={evidenceSearch} onChange={(e) => setEvidenceSearch(e.target.value)} placeholder={t('Search title or summary')} />
                  </div>
                  <Select
                    className="w-auto min-w-[11rem]"
                    value={evClassificationFilter}
                    onChange={(e) => setEvClassificationFilter(e.target.value as DataClassification | '')}
                    options={[{ value: '', label: t('All classifications') }, ...(Object.keys(CLASSIFICATION_LABEL) as DataClassification[]).map((c) => ({ value: c, label: CLASSIFICATION_LABEL[c] }))]}
                  />
                  <Select
                    className="w-auto min-w-[11rem]"
                    value={evWardFilter}
                    onChange={(e) => setEvWardFilter(e.target.value)}
                    options={[{ value: '', label: t('All wards') }, ...wardOptions.map((w) => ({ value: w.id, label: wardName(w.id) }))]}
                  />
                  {globalFilters.wardIds.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-50 px-2.5 py-1 text-[0.6875rem] text-warn-700 ring-1 ring-warn-200">
                      {t('Filter bar: {0}', globalFilters.wardIds.map((w) => wardName(w)).join(', '))}
                      <button type="button" onClick={resetGlobalFilters} className="font-bold underline">
                        {t('Clear')}
                      </button>
                    </span>
                  ) : null}
                </div>

                {filteredEvidence.length === 0 ? (
                  <EmptyState className="mt-3" compact title={t('No evidence matches the current filters')} />
                ) : (
                  <>
                    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                      {filteredEvidence.slice(0, shown).map((e) => (
                        <EvidenceCard key={e.id} evidence={e} onOpen={() => openDrawer({ kind: 'evidence', id: e.id })} />
                      ))}
                    </div>
                    {filteredEvidence.length > shown ? (
                      <div className="mt-3 flex justify-center">
                        <Button onClick={() => setShown((n) => n + 30)}>
                          {t('Show {0} more of {1}', formatNumber(Math.min(30, filteredEvidence.length - shown)), formatNumber(filteredEvidence.length - shown))}
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </GovPanel>
            </>
          )}
        </>
      ) : (
        <>
          {auditQuery.isLoading ? (
            <LoadingState variant="table" />
          ) : auditQuery.error ? (
            <ErrorState detail={auditQuery.error.message} onRetry={() => auditQuery.refetch()} />
          ) : (
            <>
              <MetricGrid columns={4}>
                <Card className={cn(SHADE.blue.tile, 'flex items-start gap-3')}>
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white', SHADE.blue.chip)}>
                    <Activity className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="label-institutional">{t('Audit events in scope')}</p>
                    <p className={cn('numeric mt-1.5 text-[1.75rem] leading-none font-bold tabular-nums', SHADE.blue.value)}>{auditEvents.length}</p>
                  </div>
                </Card>
                <Card className={cn(SHADE[auditEvents.some((e) => e.outcome === 'denied') ? 'amber' : 'green'].tile, 'flex items-start gap-3')}>
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white', SHADE[auditEvents.some((e) => e.outcome === 'denied') ? 'amber' : 'green'].chip)}>
                    <ShieldX className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="label-institutional">{t('Access denied')}</p>
                    <p className={cn('numeric mt-1.5 text-[1.75rem] leading-none font-bold tabular-nums', SHADE[auditEvents.some((e) => e.outcome === 'denied') ? 'amber' : 'green'].value)}>
                      {auditEvents.filter((e) => e.outcome === 'denied').length}
                    </p>
                  </div>
                </Card>
                <Card className={cn(SHADE.teal.tile, 'flex items-start gap-3')}>
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white', SHADE.teal.chip)}>
                    <Users className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="label-institutional">{t('Distinct actors')}</p>
                    <p className={cn('numeric mt-1.5 text-[1.75rem] leading-none font-bold tabular-nums', SHADE.teal.value)}>{actorOptions.length}</p>
                  </div>
                </Card>
                <Card className={cn(SHADE.blue.tile, 'flex items-start gap-3')}>
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white', SHADE.blue.chip)}>
                    <Filter className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="label-institutional">{t('Filtered result')}</p>
                    <p className={cn('numeric mt-1.5 text-[1.75rem] leading-none font-bold tabular-nums', SHADE.blue.value)}>{filteredAudit.length}</p>
                  </div>
                </Card>
              </MetricGrid>

              {/* Two columns. The register and the filters that scope it read
                  down the wide column; the chronological narrative of the same
                  events sits beside it, where it can be checked against the
                  rows rather than scrolled past them. */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
              <GovPanel
                title={t('Filters')}
                tone="red"
                actions={
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Download className="h-3.5 w-3.5" />}
                    disabled={!canExport}
                    title={canExport ? t('Export the filtered audit trail. This export is itself recorded as an audit event.') : t('Your role does not hold audit:export. This control is disabled by the permission engine.')}
                    onClick={async () => {
                      const result = await exportAudit(activeAuditFilters)
                      setExportResult({ count: result.length, at: new Date().toISOString() })
                    }}
                  >
                    {t('Export audit trail')}
                  </Button>
                }
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} options={[{ value: '', label: t('All actors') }, ...actorOptions.map((a) => ({ value: a, label: a }))]} />
                  <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value as AuditAction | '')} options={[{ value: '', label: t('All actions') }, ...(Object.keys(AUDIT_ACTION_LABEL) as AuditAction[]).map((a) => ({ value: a, label: AUDIT_ACTION_LABEL[a] }))]} />
                  <Select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value as AuditEvent['outcome'] | '')} options={[{ value: '', label: t('All outcomes') }, { value: 'success', label: t('Success') }, { value: 'denied', label: t('Denied') }, { value: 'error', label: t('Error') }]} />
                  <Select value={classificationFilter} onChange={(e) => setClassificationFilter(e.target.value as DataClassification | '')} options={[{ value: '', label: t('All classifications') }, ...(Object.keys(CLASSIFICATION_LABEL) as DataClassification[]).map((c) => ({ value: c, label: CLASSIFICATION_LABEL[c] }))]} />
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label={t('From date')} />
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label={t('To date')} />
                </div>
                {exportResult ? (
                  <p className="mt-3 rounded-md bg-ok-50 px-2.5 py-2 text-[0.75rem] text-ok-700">
                    {t('Export completed: {0} record(s) matching the current filters, {1}. The export itself has been written to the audit trail below.', exportResult.count, formatRelative(exportResult.at))}
                  </p>
                ) : null}
              </GovPanel>

              <GovPanel title={t('Full audit register')} tone="amber" dense>
                <div className="p-3">
                  <DataTable
                    rows={filteredAudit}
                    columns={auditColumns}
                    rowKey={(e) => e.id}
                    searchable
                    searchPlaceholder={t('Search resource or reason')}
                    pageSize={15}
                    initialSort={{ columnId: 'timestamp', direction: 'desc' }}
                    rowAccent={(e) => <span className={cn('block h-full w-full rounded-full', e.outcome === 'denied' ? 'bg-crit-500' : 'bg-transparent')} />}
                  />
                </div>
              </GovPanel>
                </div>

                <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
              <GovPanel title={t('Recent activity')} tone="green">
                <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('The most recent audit events, newest first.')}</p>
                <ol className="space-y-0">
                  {filteredAudit.slice(0, 25).map((event, i, arr) => (
                    <li key={event.id} className="relative pb-3 pl-6 last:pb-0">
                      {i < arr.length - 1 ? <span className="absolute top-4 bottom-0 left-[7px] w-px bg-ink-100" aria-hidden /> : null}
                      <span
                        className={cn(
                          'absolute top-1 left-0 h-3.5 w-3.5 rounded-full border-2 bg-surface',
                          event.outcome === 'denied' ? 'border-crit-500' : event.outcome === 'error' ? 'border-warn-500' : 'border-ok-500',
                        )}
                        aria-hidden
                      />
                      <p className="text-xs text-ink-800">
                        <span className="font-medium">{event.actorName}</span>{' '}
                        <span className="text-ink-500">{AUDIT_ACTION_LABEL[event.action].toLowerCase()}</span>{' '}
                        <span className="font-mono text-ink-600">{event.resourceLabel}</span>
                      </p>
                      {event.detail ? <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-500">{event.detail}</p> : null}
                      <p className="mt-0.5 text-[0.625rem] text-ink-400">{formatDateTime(event.at)} · {formatRelative(event.at)}</p>
                    </li>
                  ))}
                </ol>
                {filteredAudit.length === 0 ? <EmptyState compact title={t('No audit events match the current filters')} /> : null}
              </GovPanel>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <Card tone="warn">
        <p className="text-xs leading-relaxed text-ink-700">
          {t('The audit trail in this demonstration environment is held in-session only - it resets on reload and is not independently retained. Production deployment requires a real, tamper-evident, append-only audit store held outside the application itself. See Platform Readiness for the full production requirement.')}
        </p>
      </Card>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default EvidenceAuditPage
