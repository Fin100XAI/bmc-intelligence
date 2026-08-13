import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Database,
  FileWarning,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Table2,
  Trash2,
  Zap,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, ClassificationBadge, SeverityBadge } from '@/components/ui/badges'
import {
  Button,
  Card,
  CardHeader,
  DefinitionList,
  DefinitionRow,
  IconButton,
  Input,
  Label,
  MetricGrid,
  ProgressBar,
  Select,
  Switch,
} from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ChartFrame } from '@/components/charts/ChartFrame'
import { DonutChart, MiniBar, RankedBarChart } from '@/components/charts/charts'
import { ConfirmDialog, Drawer, Modal, Tabs } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { adminService } from '@/services'
import {
  applyDataSourceState,
  meanQualityScore,
  useDataSourceStore,
  type SyncResult,
} from '@/stores/data-source.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { DEPARTMENTS_ORDERED, departmentName, officerDisplayName } from '@/data/reference'
import { municipality } from '@/config/municipality.config'
import { DEMO_NOW, det, isoFromAnchor } from '@/utils/deterministic'
import { formatCompact, formatDateTime, formatDuration, formatNumber, formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import { DOMAIN_LABEL, type IntelligenceDomain } from '@/types/common'
import type { BadgeTone } from '@/components/ui/badges'
import {
  DATA_SOURCE_CATEGORY_LABEL,
  DATA_SOURCE_FORMAT_LABEL,
  DATA_SOURCE_STATUS_LABEL,
  SYNC_FREQUENCY_LABEL,
  SYNC_OUTCOME_LABEL,
  type DataSource,
  type DataSourceCategory,
  type DataSourceFormat,
  type DataSourceQuality,
  type DataSourceStatus,
  type DataSourceSyncRun,
  type SyncFrequency,
  type SyncOutcome,
} from '@/types/governance'
import type { DataClassification } from '@/types/common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/admin/DataSourcesPage.tsx
 *
 * The operational ingestion register — the operator-facing complement to the
 * governance-focused Connectors page. Every control here does something:
 * a source can be enabled or paused, reclassified, have its retention,
 * ownership or cadence changed, be synced on demand, opened in full, added or
 * removed, and the whole register exported.
 *
 * Every one of those actions is real within the session — held in
 * `useDataSourceStore` and reflected immediately in the register, its charts
 * and its summary figures. None of it reaches a live corporation system: no
 * source is connected, every sync is simulated, and a simulated sync cannot
 * improve a source's completeness, validity, uniqueness or consistency. Those
 * are properties of the upstream data; only timeliness moves when a feed runs.
 */

const STATUS_TONE: Record<DataSourceStatus, BadgeTone> = {
  healthy: 'positive',
  degraded: 'warn',
  stale: 'neutral',
  paused: 'muted',
  error: 'critical',
}

const OUTCOME_TONE: Record<SyncOutcome, BadgeTone> = {
  succeeded: 'positive',
  partial: 'warn',
  failed: 'critical',
  skipped: 'muted',
}

const CATEGORY_OPTIONS: DataSourceCategory[] = [
  'sensor-network',
  'departmental-system',
  'public-registry',
  'citizen-channel',
  'external-feed',
  'geospatial',
]
const FORMAT_OPTIONS: DataSourceFormat[] = ['json-api', 'csv-sftp', 'event-stream', 'db-replica', 'webhook']
const FREQUENCY_OPTIONS: SyncFrequency[] = ['realtime', '5-min', 'hourly', 'daily', 'weekly']
const CLASSIFICATION_OPTIONS: DataClassification[] = ['public', 'internal', 'confidential', 'restricted']
const RETENTION_OPTIONS = [90, 180, 365, 1095, 1825, 2555, 3650, 7300]

const CATEGORY_COLOUR: Record<DataSourceCategory, string> = {
  'sensor-network': '#2f6feb',
  'departmental-system': '#0ea5b7',
  'public-registry': '#7c3aed',
  'citizen-channel': '#f59e0b',
  'external-feed': '#64748b',
  geospatial: '#059468',
}

function build$QUALITY_DIMENSIONS(): Array<{ key: keyof DataSourceQuality; label: string; help: string }> {
  return [
  { key: 'completeness', label: t('Completeness'), help: 'Share of expected records that arrived at all.' },
  { key: 'validity', label: t('Validity'), help: 'Share of arrived records that passed schema and range validation.' },
  { key: 'timeliness', label: t('Timeliness'), help: 'Share of records that arrived inside the freshness expectation.' },
  { key: 'uniqueness', label: t('Uniqueness'), help: 'Share with no duplicate on the declared natural key.' },
  { key: 'consistency', label: t('Consistency'), help: 'Agreement with the canonical ward, department and asset registers.' },
]
}
let QUALITY_DIMENSIONS: Array<{ key: keyof DataSourceQuality; label: string; help: string }> = build$QUALITY_DIMENSIONS()
registerLayer(() => {
  QUALITY_DIMENSIONS = build$QUALITY_DIMENSIONS()
})

function retentionLabel(days: number | undefined): string {
  if (!days) return 'Not declared'
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? '' : 's'}`
  return `${formatNumber(days)} days`
}

function slaLabel(minutes: number | undefined): string {
  if (!minutes) return 'Not declared'
  return formatDuration(minutes / 60)
}

/** True when the feed has not reported inside its own declared expectation. */
function breachesSla(source: DataSource): boolean {
  if (!source.slaMinutes || !source.enabled) return false
  const ageMinutes = (DEMO_NOW.getTime() - new Date(source.lastSyncAt).getTime()) / 60_000
  return ageMinutes > source.slaMinutes
}

interface DraftSource {
  name: string
  category: DataSourceCategory
  ownerDepartmentId: string
  format: DataSourceFormat
  frequency: SyncFrequency
  classification: DataClassification
  retentionDays: number
  purpose: string
}

const EMPTY_DRAFT: DraftSource = {
  name: '',
  category: 'departmental-system',
  ownerDepartmentId: DEPARTMENTS_ORDERED[0]?.id ?? '',
  format: 'json-api',
  frequency: 'daily',
  classification: 'internal',
  retentionDays: 1095,
  purpose: '',
}

interface EditDraft {
  classification: DataClassification
  frequency: SyncFrequency
  ownerDepartmentId: string
  retentionDays: number
}

export function DataSourcesPage(): React.JSX.Element {
  const seedQuery = useServiceQuery(queryKeys.admin('data-sources'), (u) => adminService.dataSources(u))

  const overrides = useDataSourceStore((s) => s.overrides)
  const added = useDataSourceStore((s) => s.added)
  const removed = useDataSourceStore((s) => s.removed)
  const toggleEnabled = useDataSourceStore((s) => s.toggleEnabled)
  const setFrequency = useDataSourceStore((s) => s.setFrequency)
  const updateSource = useDataSourceStore((s) => s.updateSource)
  const recordSync = useDataSourceStore((s) => s.recordSync)
  const addSource = useDataSourceStore((s) => s.addSource)
  const removeSource = useDataSourceStore((s) => s.removeSource)
  const resetAll = useDataSourceStore((s) => s.resetAll)
  const hasChanges = useDataSourceStore((s) => s.hasChanges())
  const changedCount = useDataSourceStore((s) => s.changedCount())

  const [syncingIds, setSyncingIds] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState<DraftSource>(EMPTY_DRAFT)
  const [removeTarget, setRemoveTarget] = useState<DataSource | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'overview' | 'schema' | 'quality' | 'history' | 'downstream'>('overview')
  const [editTarget, setEditTarget] = useState<DataSource | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [exportNote, setExportNote] = useState<string | null>(null)

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(
    t('Data Sources'),
    t('The operational ingestion register — every upstream feed the Urban Intelligence Core draws on, with the schema it ingests, the purpose it is held for, the retention it sits under and the metrics downstream of it. Enable or pause a source, change its cadence, classification or retention, run a sync, open it in full, add or remove one; changes apply immediately for this session. No source is connected to a live {0} system and every sync is simulated.', municipality.shortName),
  )

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<DataSourceCategory | ''>('')
  const [statusFilter, setStatusFilter] = useState<DataSourceStatus | ''>('')
  const [domainFilter, setDomainFilter] = useState<IntelligenceDomain | ''>('')
  const [classificationFilter, setClassificationFilter] = useState<DataClassification | ''>('')
  const [stateFilter, setStateFilter] = useState<'' | 'enabled' | 'paused' | 'attention' | 'personal' | 'sla'>('')

  const timers = useRef<Record<string, number>>({})

  // Clear any in-flight simulated syncs if the operator navigates away.
  useEffect(() => {
    const pending = timers.current
    return () => {
      Object.values(pending).forEach((entry) => window.clearTimeout(entry))
    }
  }, [])

  const sources = useMemo(
    () => applyDataSourceState(seedQuery.data ?? [], { overrides, added, removed }),
    [seedQuery.data, overrides, added, removed],
  )

  const filtered = useMemo(
    () =>
      sources.filter((s) => {
        if (categoryFilter && s.category !== categoryFilter) return false
        if (statusFilter && s.status !== statusFilter) return false
        if (domainFilter && s.domain !== domainFilter) return false
        if (classificationFilter && s.classification !== classificationFilter) return false
        if (stateFilter === 'enabled' && !s.enabled) return false
        if (stateFilter === 'paused' && s.enabled) return false
        if (stateFilter === 'attention' && s.status !== 'degraded' && s.status !== 'stale' && s.status !== 'error') return false
        if (stateFilter === 'personal' && !s.personalData) return false
        if (stateFilter === 'sla' && !breachesSla(s)) return false
        return true
      }),
    [sources, categoryFilter, statusFilter, domainFilter, classificationFilter, stateFilter],
  )

  const activeFilterCount =
    (categoryFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (domainFilter ? 1 : 0) +
    (classificationFilter ? 1 : 0) +
    (stateFilter ? 1 : 0)

  const metrics = useMemo(() => {
    const enabled = sources.filter((s) => s.enabled)
    const totalRecords = sources.reduce((sum, s) => sum + s.recordsIngested, 0)
    const avgQuality = enabled.length
      ? Math.round(enabled.reduce((sum, s) => sum + s.qualityScore, 0) / enabled.length)
      : 0
    return {
      total: sources.length,
      enabled: enabled.length,
      paused: sources.length - enabled.length,
      needingAttention: sources.filter((s) => s.status === 'degraded' || s.status === 'stale' || s.status === 'error').length,
      slaBreaches: sources.filter(breachesSla).length,
      personalData: sources.filter((s) => s.personalData).length,
      totalRecords,
      avgQuality,
    }
  }, [sources])

  const categoryComposition = useMemo(
    () =>
      CATEGORY_OPTIONS.map((c) => ({
        label: DATA_SOURCE_CATEGORY_LABEL[c],
        value: sources.filter((s) => s.category === c).length,
        colour: CATEGORY_COLOUR[c],
      })).filter((d) => d.value > 0),
    [sources],
  )

  const lowestQuality = useMemo(
    () =>
      [...sources]
        .filter((s) => s.enabled)
        .sort((a, b) => a.qualityScore - b.qualityScore)
        .slice(0, 8)
        .map((s) => ({ label: s.name, value: s.qualityScore })),
    [sources],
  )

  const detailSource = useMemo(() => sources.find((s) => s.id === detailId) ?? null, [sources, detailId])

  /**
   * Runs a simulated ingestion. Seeded on the source's current record count so
   * each successive run brings a different, repeatable increment — and, like a
   * real feed, a run can come back partial or fail outright.
   */
  function runSync(source: DataSource): void {
    if (!source.enabled || syncingIds.includes(source.id)) return
    setSyncingIds((ids) => [...ids, source.id])

    const r = det(`ds-sync:${source.id}:${source.recordsIngested}`)
    const outcome = r.weighted<SyncOutcome>([
      ['succeeded', 84],
      ['partial', 11],
      ['failed', 5],
    ])
    const delta = outcome === 'failed' ? 0 : r.int(80, 1400)
    const rejected = outcome === 'partial' ? Math.round(delta * r.float(0.05, 0.18)) : 0
    const latency = r.int(28, 420)
    const run: DataSourceSyncRun = {
      id: `${source.id}-session-${source.recordsIngested}`,
      startedAt: isoFromAnchor(0),
      durationSeconds: r.int(3, 180),
      outcome,
      recordsIngested: delta,
      recordsRejected: rejected,
      note:
        outcome === 'succeeded'
          ? 'Operator-initiated sync. Completed within the freshness expectation.'
          : outcome === 'partial'
            ? 'Operator-initiated sync. Some records failed validation and were rejected, not corrected.'
            : 'Operator-initiated sync. The simulated upstream did not respond; no records were ingested.',
    }

    const result: SyncResult = {
      run,
      recordsIngested: source.recordsIngested + delta,
      latencyMs: latency,
      // A run that succeeded restores timeliness; a failed one degrades it.
      timeliness: outcome === 'failed'
        ? Math.max(40, (source.quality?.timeliness ?? 90) - r.int(6, 18))
        : Math.min(100, (source.quality?.timeliness ?? 90) + r.int(1, 5)),
    }

    const entry = window.setTimeout(() => {
      recordSync(source, result)
      setSyncingIds((ids) => ids.filter((x) => x !== source.id))
      delete timers.current[source.id]
    }, 1100)
    timers.current[source.id] = entry
  }

  function syncAllEnabled(): void {
    filtered.filter((s) => s.enabled && !syncingIds.includes(s.id)).forEach(runSync)
  }

  function openEdit(source: DataSource): void {
    setEditTarget(source)
    setEditDraft({
      classification: source.classification,
      frequency: source.frequency,
      ownerDepartmentId: source.ownerDepartmentId,
      retentionDays: source.retentionDays ?? 1095,
    })
  }

  function submitEdit(): void {
    if (!editTarget || !editDraft) return
    updateSource(editTarget.id, editDraft)
    setEditTarget(null)
    setEditDraft(null)
  }


  if (seedQuery.isLoading) return <LoadingState variant="table" />
  if (seedQuery.error) return <ErrorState detail={seedQuery.error.message} onRetry={() => seedQuery.refetch()} />

  const columns: Array<Column<DataSource>> = [
    {
      id: 'name',
      header: t('Data source'),
      cell: (s) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-medium text-ink-800">{s.name}</p>
            {s.custom ? <Badge tone="intel" size="xs">{t('Added')}</Badge> : null}
            {s.personalData ? (
              <Badge tone="warn" size="xs" title={t('Carries at least one field marked personal; minimised at ingest.')}>
                {t('Personal')}
              </Badge>
            ) : null}
          </div>
          <p className="text-[0.6875rem] text-ink-400">
            {DATA_SOURCE_CATEGORY_LABEL[s.category]} · {DATA_SOURCE_FORMAT_LABEL[s.format]}
          </p>
        </div>
      ),
      sortValue: (s) => s.name,
      searchValue: (s) =>
        `${s.name} ${DATA_SOURCE_CATEGORY_LABEL[s.category]} ${departmentName(s.ownerDepartmentId)} ${s.purpose ?? ''} ${(s.downstream ?? []).join(' ')}`,
      width: 'minmax(14rem,1.6fr)',
    },
    {
      id: 'owner',
      header: t('Owner'),
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] text-ink-700">{departmentName(s.ownerDepartmentId)}</p>
          <p className="truncate text-[0.6875rem] text-ink-400">{officerDisplayName(s.ownerOfficerId)}</p>
        </div>
      ),
      sortValue: (s) => departmentName(s.ownerDepartmentId),
      hideBelow: 'lg',
    },
    {
      id: 'domain',
      header: t('Domain'),
      cell: (s) => <Badge tone="muted">{DOMAIN_LABEL[s.domain]}</Badge>,
      sortValue: (s) => DOMAIN_LABEL[s.domain],
      hideBelow: 'xl',
    },
    {
      id: 'classification',
      header: t('Class.'),
      cell: (s) => <ClassificationBadge classification={s.classification} showIcon={false} />,
      sortValue: (s) => s.classification,
      hideBelow: 'xl',
    },
    {
      id: 'frequency',
      header: t('Cadence'),
      cell: (s) => (
        <Select
          aria-label={t('Sync cadence for {0}', s.name)}
          className="h-7 w-[8.5rem] text-xs"
          value={s.frequency}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setFrequency(s.id, e.target.value as SyncFrequency)}
          options={FREQUENCY_OPTIONS.map((f) => ({ value: f, label: SYNC_FREQUENCY_LABEL[f] }))}
        />
      ),
      sortValue: (s) => s.frequency,
      hideBelow: 'md',
    },
    {
      id: 'records',
      header: t('Records'),
      align: 'right',
      cell: (s) => <span className="numeric text-ink-800">{s.recordsIngested > 0 ? formatCompact(s.recordsIngested) : '—'}</span>,
      sortValue: (s) => s.recordsIngested,
      hideBelow: 'md',
    },
    {
      id: 'quality',
      header: t('Quality'),
      cell: (s) =>
        s.recordsIngested > 0 ? (
          <div className="flex items-center gap-1.5">
            <MiniBar value={s.qualityScore} max={100} width={44} />
            <span className="numeric text-[0.6875rem] text-ink-600">{s.qualityScore}</span>
          </div>
        ) : (
          <span className="text-[0.6875rem] text-ink-400">—</span>
        ),
      sortValue: (s) => s.qualityScore,
      hideBelow: 'lg',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (s) => {
        const syncing = syncingIds.includes(s.id)
        if (syncing) {
          return <Badge tone="info" icon={<Loader2 className="h-3 w-3 animate-spin" />}>{t('Syncing…')}</Badge>
        }
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge tone={STATUS_TONE[s.status]} dot>
              {DATA_SOURCE_STATUS_LABEL[s.status]}
            </Badge>
            {breachesSla(s) ? (
              <Badge tone="warn" size="xs" title={t('Freshness expectation is {0}', slaLabel(s.slaMinutes))}>
                {t('Past expectation')}
              </Badge>
            ) : null}
          </div>
        )
      },
      sortValue: (s) => s.status,
    },
    {
      id: 'lastSync',
      header: t('Last sync'),
      cell: (s) => (
        <span className="text-[0.6875rem] text-ink-500">{s.recordsIngested > 0 ? formatRelative(s.lastSyncAt) : 'Never'}</span>
      ),
      sortValue: (s) => s.lastSyncAt,
      hideBelow: 'lg',
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (s) => {
        const syncing = syncingIds.includes(s.id)
        return (
          <div className="flex items-center justify-end gap-1.5">
            <IconButton
              label={s.enabled ? `Sync ${s.name} now` : 'Enable the source to sync it'}
              disabled={!s.enabled || syncing}
              onClick={() => runSync(s)}
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </IconButton>
            <Switch
              checked={s.enabled}
              onChange={(next) => toggleEnabled(s.id, next)}
              label={s.enabled ? `Pause ${s.name}` : `Enable ${s.name}`}
            />
            <IconButton label={t('Edit {0}', s.name)} onClick={() => openEdit(s)}>
              <Pencil className="h-3.5 w-3.5 text-ink-400" />
            </IconButton>
            <IconButton label={t('Remove {0}', s.name)} onClick={() => setRemoveTarget(s)}>
              <Trash2 className="h-3.5 w-3.5 text-ink-400" />
            </IconButton>
          </div>
        )
      },
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Administration')}
        breadcrumbs={[{ label: t('Administration') }, { label: t('Data Sources') }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {hasChanges ? (
              <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setResetOpen(true)}>
                {t('Reset session ({0})', changedCount)}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              icon={<Zap className="h-3.5 w-3.5" />}
              disabled={filtered.filter((s) => s.enabled).length === 0 || syncingIds.length > 0}
              onClick={syncAllEnabled}
            >
              {t('Sync all enabled')}
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddOpen(true)}>
              {t('Add data source')}
            </Button>
          </div>
        }
      />

      {exportNote ? (
        <Card tone="info">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.8125rem] text-ink-700">
              {t('Exported')}{' '}<span className="font-mono text-xs text-govt-700">{exportNote}</span>{t('. The file carries a provenance header naming this environment, the acting principal and the filters in force.')}
            </p>
            <Button variant="ghost" size="xs" onClick={() => setExportNote(null)}>
              {t('Dismiss')}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* ── Two columns ──────────────────────────────────────────────
          Where a data steward's attention is owed, and the standing
          declaration beneath it, read down the wide column. The register's
          own figures and its composition read down the narrow one, which is
          how a return states its totals — beside the account, not above it. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Column 1 — what needs attention ------------------------- */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          <Card>
            <ChartFrame
              title={t('Lowest quality among enabled sources')}
              unit={t('quality score /100')}
              timeframe="Current register"
              description={t('Where a data steward\'s attention is best spent first. Lower is worse.')}
              height={Math.max(200, lowestQuality.length * 26)}
            >
              <RankedBarChart data={lowestQuality} unit="" higherIsWorse={false} />
            </ChartFrame>
          </Card>

          {metrics.personalData > 0 ? (
            <Card tone="warn">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn-700" />
                <p className="text-[0.8125rem] leading-relaxed text-ink-700">
                  <span className="font-semibold text-warn-700">
                    {t('{0} of {1} sources declare at least one personal field.', metrics.personalData, metrics.total)}
                  </span>{' '}
                  {t('Every such field is minimised, banded or dropped at the adapter before it enters the platform store — open a source and read its schema tab to see exactly which fields those are and what happens to each. In a production deployment each of these feeds additionally requires a completed privacy impact assessment and a signed data-sharing agreement before it may be provisioned; nothing here implies either exists.')}
                </p>
              </div>
            </Card>
          ) : null}
        </div>

        {/* Column 2 — the register's own figures -------------------- */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
          <MetricGrid columns={2} className="xl:grid-cols-1">
            <Card>
              <p className="label-institutional">{t('Registered sources')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ink-900">{metrics.total}</p>
              <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('{0} enabled · {1} paused', metrics.enabled, metrics.paused)}</p>
            </Card>
            <Card tone={metrics.needingAttention > 0 ? 'warn' : 'default'}>
              <p className="label-institutional">{t('Needing attention')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ink-900">{metrics.needingAttention}</p>
              <p className="mt-0.5 text-[0.6875rem] text-ink-500">
                {t('Degraded, stale or in error · {0} past their freshness expectation', metrics.slaBreaches)}
              </p>
            </Card>
            <Card>
              <p className="label-institutional">{t('Records ingested')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ink-900">{formatCompact(metrics.totalRecords)}</p>
              <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Across all sources, simulated')}</p>
            </Card>
            <Card tone="info">
              <p className="label-institutional">{t('Mean quality (enabled)')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ink-900">
                {metrics.avgQuality}
                <span className="text-base text-ink-400">/100</span>
              </p>
              <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Mean of five published dimensions')}</p>
            </Card>
          </MetricGrid>

          <Card>
            <ChartFrame title={t('Sources by category')} unit="sources" timeframe="Current register" height={190}>
              <DonutChart data={categoryComposition} centreValue={String(metrics.total)} centreLabel="sources" />
            </ChartFrame>
            <div className="mt-3 space-y-1.5 border-t border-ink-100 pt-3">
              {categoryComposition.map((c) => (
                <div key={c.label} className="flex items-center justify-between gap-2 text-[0.6875rem]">
                  <span className="inline-flex items-center gap-1.5 text-ink-600">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.colour }} aria-hidden />
                    {c.label}
                  </span>
                  <span className="numeric font-semibold text-ink-800">{c.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card flush>
        <CardHeader
          className="px-4 pt-4"
          icon={<Database className="h-4 w-4" />}
          title={t('Ingestion register')}
          description={t('Select a row to open the full source record — schema, quality decomposition, sync history and downstream use.')}
          actions={
            activeFilterCount > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                icon={<RotateCcw className="h-3 w-3" />}
                onClick={() => {
                  setCategoryFilter('')
                  setStatusFilter('')
                  setDomainFilter('')
                  setClassificationFilter('')
                  setStateFilter('')
                }}
              >
                {t('Clear {0} filter{1}', activeFilterCount, activeFilterCount === 1 ? '' : 's')}
              </Button>
            ) : null
          }
        />

        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <Select
            aria-label={t('Filter by category')}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as DataSourceCategory | '')}
            options={[
              { value: '', label: t('All categories') },
              ...CATEGORY_OPTIONS.map((c) => ({ value: c, label: DATA_SOURCE_CATEGORY_LABEL[c] })),
            ]}
          />
          <Select
            aria-label={t('Filter by status')}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DataSourceStatus | '')}
            options={[
              { value: '', label: t('All statuses') },
              ...(Object.keys(DATA_SOURCE_STATUS_LABEL) as DataSourceStatus[]).map((s) => ({
                value: s,
                label: DATA_SOURCE_STATUS_LABEL[s],
              })),
            ]}
          />
          <Select
            aria-label={t('Filter by domain')}
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value as IntelligenceDomain | '')}
            options={[
              { value: '', label: t('All domains') },
              ...Array.from(new Set(sources.map((s) => s.domain)))
                .sort((a, b) => DOMAIN_LABEL[a].localeCompare(DOMAIN_LABEL[b]))
                .map((d) => ({ value: d, label: DOMAIN_LABEL[d] })),
            ]}
          />
          <Select
            aria-label={t('Filter by classification')}
            value={classificationFilter}
            onChange={(e) => setClassificationFilter(e.target.value as DataClassification | '')}
            options={[
              { value: '', label: t('All classifications') },
              ...CLASSIFICATION_OPTIONS.map((c) => ({ value: c, label: c })),
            ]}
          />
          <Select
            aria-label={t('Filter by state')}
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}
            options={[
              { value: '', label: t('Every source') },
              { value: 'enabled', label: t('Enabled only') },
              { value: 'paused', label: t('Paused only') },
              { value: 'attention', label: t('Needing attention') },
              { value: 'sla', label: t('Past freshness expectation') },
              { value: 'personal', label: t('Carrying personal data') },
            ]}
          />
        </div>

        {sources.length === 0 ? (
          <EmptyState
            title={t('No data sources')}
            detail="Every source has been removed for this session. Add one, or reset the session to restore the register."
          />
        ) : (
          <div className="p-4">
            <DataTable
              rows={filtered}
              columns={columns}
              rowKey={(s) => s.id}
              searchable
              searchPlaceholder="Search by name, owner, purpose or downstream metric"
              pageSize={12}
              activeRowKey={detailId ?? undefined}
              onRowClick={(s) => {
                setDetailId(s.id)
                setDetailTab('overview')
              }}
              initialSort={{ columnId: 'name', direction: 'asc' }}
              emptyTitle={t('No sources match the current filters')}
              emptyDetail="Widen a filter, or clear the search term, to see more of the register."
            />
          </div>
        )}
      </Card>

      {/* Source detail ---------------------------------------------------- */}
      <Drawer
        open={detailSource !== null}
        onClose={() => setDetailId(null)}
        width="lg"
        eyebrow={detailSource ? DATA_SOURCE_CATEGORY_LABEL[detailSource.category] : ''}
        title={detailSource?.name ?? ''}
        description={detailSource?.purpose}
        meta={
          detailSource ? (
            <>
              <Badge tone={STATUS_TONE[detailSource.status]} dot>
                {DATA_SOURCE_STATUS_LABEL[detailSource.status]}
              </Badge>
              <ClassificationBadge classification={detailSource.classification} />
              <Badge tone="muted">{DOMAIN_LABEL[detailSource.domain]}</Badge>
              <Badge tone="neutral">{SYNC_FREQUENCY_LABEL[detailSource.frequency]}</Badge>
              {detailSource.personalData ? <Badge tone="warn">{t('Carries personal data')}</Badge> : null}
            </>
          ) : null
        }
        tabs={
          detailSource ? (
            <Tabs
              items={[
                { id: 'overview', label: t('Overview') },
                { id: 'schema', label: t('Schema'), count: detailSource.schema?.length },
                { id: 'quality', label: t('Quality') },
                { id: 'history', label: t('Sync history'), count: detailSource.syncHistory?.length },
                { id: 'downstream', label: t('Downstream'), count: detailSource.downstream?.length },
              ]}
              value={detailTab}
              onChange={(id) => setDetailTab(id as typeof detailTab)}
              ariaLabel="Data source detail sections"
            />
          ) : null
        }
        footer={
          detailSource ? (
            <>
              <Button variant="ghost" onClick={() => setDetailId(null)}>
                {t('Close')}
              </Button>
              <Button variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(detailSource)}>
                {t('Edit source')}
              </Button>
              <Button
                variant="primary"
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                disabled={!detailSource.enabled || syncingIds.includes(detailSource.id)}
                title={detailSource.enabled ? 'Run a simulated ingestion now' : 'Enable the source before syncing it'}
                onClick={() => runSync(detailSource)}
              >
                {t('Sync now')}
              </Button>
            </>
          ) : null
        }
      >
        {detailSource ? (
          <DataSourceDetail source={detailSource} tab={detailTab} />
        ) : null}
      </Drawer>

      {/* Add data source ------------------------------------------------ */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        width="md"
        title={t('Add data source')}
        description={t('Register a new ingestion source for this session. It is added paused; enable it and run a sync once it is configured.')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>{t('Cancel')}</Button>
            <Button
              variant="primary"
              disabled={draft.name.trim().length < 3 || draft.ownerDepartmentId === ''}
              onClick={() => {
                const dept = DEPARTMENTS_ORDERED.find((d) => d.id === draft.ownerDepartmentId)
                const slug = draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                const source: DataSource = {
                  id: `ds-custom-${slug || 'source'}-${added.length}`,
                  name: draft.name.trim(),
                  category: draft.category,
                  ownerDepartmentId: draft.ownerDepartmentId,
                  ownerOfficerId: `off-head-${draft.ownerDepartmentId}`,
                  domain: dept?.domain ?? 'platform',
                  classification: draft.classification,
                  format: draft.format,
                  frequency: draft.frequency,
                  enabled: false,
                  status: 'paused',
                  lastSyncAt: isoFromAnchor(0),
                  recordsIngested: 0,
                  qualityScore: 0,
                  latencyMs: 0,
                  purpose: draft.purpose.trim() || 'Purpose not yet stated. A feed without a stated purpose cannot be enabled in a production deployment.',
                  retentionDays: draft.retentionDays,
                  slaMinutes: draft.frequency === 'realtime' ? 10 : draft.frequency === '5-min' ? 15 : draft.frequency === 'hourly' ? 120 : draft.frequency === 'daily' ? 1440 : 20_160,
                  personalData: false,
                  schema: [],
                  syncHistory: [],
                  incidents: [],
                  downstream: [],
                  custom: true,
                }
                addSource(source)
                setDraft(EMPTY_DRAFT)
                setAddOpen(false)
              }}
            >
              {t('Add source')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="ds-name">{t('Source name')}</Label>
            <Input
              id="ds-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder={t('e.g. Beach Water Quality Sensors')}
              aria-invalid={draft.name.trim().length > 0 && draft.name.trim().length < 3}
            />
            {draft.name.trim().length > 0 && draft.name.trim().length < 3 ? (
              <p className="mt-1 text-[0.6875rem] text-crit-600">{t('Give the source a name of at least 3 characters.')}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="ds-purpose">{t('Purpose of ingestion')}</Label>
            <Input
              id="ds-purpose"
              value={draft.purpose}
              onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
              placeholder={t('What decision does this feed inform?')}
            />
            <p className="mt-1 text-[0.625rem] leading-relaxed text-ink-500">
              {t('Purpose limitation, written down. A feed whose stated purpose has been served is one a reviewer can actually retire; a feed without one cannot be assessed at all.')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ds-category">{t('Category')}</Label>
              <Select
                id="ds-category"
                value={draft.category}
                onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as DataSourceCategory }))}
                options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: DATA_SOURCE_CATEGORY_LABEL[c] }))}
              />
            </div>
            <div>
              <Label htmlFor="ds-owner">{t('Owner department')}</Label>
              <Select
                id="ds-owner"
                value={draft.ownerDepartmentId}
                onChange={(e) => setDraft((d) => ({ ...d, ownerDepartmentId: e.target.value }))}
                options={DEPARTMENTS_ORDERED.map((dep) => ({ value: dep.id, label: dep.shortName }))}
              />
            </div>
            <div>
              <Label htmlFor="ds-format">{t('Transport format')}</Label>
              <Select
                id="ds-format"
                value={draft.format}
                onChange={(e) => setDraft((d) => ({ ...d, format: e.target.value as DataSourceFormat }))}
                options={FORMAT_OPTIONS.map((f) => ({ value: f, label: DATA_SOURCE_FORMAT_LABEL[f] }))}
              />
            </div>
            <div>
              <Label htmlFor="ds-frequency">{t('Sync cadence')}</Label>
              <Select
                id="ds-frequency"
                value={draft.frequency}
                onChange={(e) => setDraft((d) => ({ ...d, frequency: e.target.value as SyncFrequency }))}
                options={FREQUENCY_OPTIONS.map((f) => ({ value: f, label: SYNC_FREQUENCY_LABEL[f] }))}
              />
            </div>
            <div>
              <Label htmlFor="ds-classification">{t('Data classification')}</Label>
              <Select
                id="ds-classification"
                value={draft.classification}
                onChange={(e) => setDraft((d) => ({ ...d, classification: e.target.value as DataClassification }))}
                options={CLASSIFICATION_OPTIONS.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div>
              <Label htmlFor="ds-retention">{t('Retention')}</Label>
              <Select
                id="ds-retention"
                value={String(draft.retentionDays)}
                onChange={(e) => setDraft((d) => ({ ...d, retentionDays: Number(e.target.value) }))}
                options={RETENTION_OPTIONS.map((n) => ({ value: String(n), label: retentionLabel(n) }))}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Edit data source ----------------------------------------------- */}
      <Modal
        open={editTarget !== null && editDraft !== null}
        onClose={() => {
          setEditTarget(null)
          setEditDraft(null)
        }}
        width="md"
        title={t('Edit "{0}"', editTarget?.name ?? '')}
        description={t('Classification, retention, ownership and cadence are the four fields an operator may change on a registered feed. Schema, purpose and downstream use follow the source system and are changed there, not here.')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setEditTarget(null)
                setEditDraft(null)
              }}
            >
              {t('Cancel')}
            </Button>
            <Button variant="primary" onClick={submitEdit}>
              {t('Apply changes')}
            </Button>
          </>
        }
      >
        {editDraft ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="edit-classification">{t('Data classification')}</Label>
              <Select
                id="edit-classification"
                value={editDraft.classification}
                onChange={(e) => setEditDraft((d) => (d ? { ...d, classification: e.target.value as DataClassification } : d))}
                options={CLASSIFICATION_OPTIONS.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-frequency">{t('Sync cadence')}</Label>
              <Select
                id="edit-frequency"
                value={editDraft.frequency}
                onChange={(e) => setEditDraft((d) => (d ? { ...d, frequency: e.target.value as SyncFrequency } : d))}
                options={FREQUENCY_OPTIONS.map((f) => ({ value: f, label: SYNC_FREQUENCY_LABEL[f] }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-owner">{t('Owner department')}</Label>
              <Select
                id="edit-owner"
                value={editDraft.ownerDepartmentId}
                onChange={(e) => setEditDraft((d) => (d ? { ...d, ownerDepartmentId: e.target.value } : d))}
                options={DEPARTMENTS_ORDERED.map((dep) => ({ value: dep.id, label: dep.shortName }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-retention">{t('Retention')}</Label>
              <Select
                id="edit-retention"
                value={String(editDraft.retentionDays)}
                onChange={(e) => setEditDraft((d) => (d ? { ...d, retentionDays: Number(e.target.value) } : d))}
                options={RETENTION_OPTIONS.map((n) => ({ value: String(n), label: retentionLabel(n) }))}
              />
            </div>
            {editTarget?.personalData && editDraft.classification === 'public' ? (
              <p className="rounded-md bg-crit-50 px-3 py-2 text-[0.6875rem] leading-relaxed text-crit-700 sm:col-span-2">
                {t('This source declares a personal field. Classifying it public would place personal data in the platform&apos;s least protected tier — in a production deployment that reclassification would require a completed privacy review, not an operator&apos;s judgement alone.')}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* Remove confirmation ------------------------------------------- */}
      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) removeSource(removeTarget)
          if (removeTarget && removeTarget.id === detailId) setDetailId(null)
          setRemoveTarget(null)
        }}
        title={t('Remove "{0}"?', removeTarget?.name ?? '')}
        description={
          (removeTarget?.downstream?.length ?? 0) > 0
            ? `${removeTarget?.downstream?.length} downstream metric(s) draw on this source: ${(removeTarget?.downstream ?? []).join(', ')}. Removing it from this session's register does not remove those metrics, but in a live deployment they would lose their input.`
            : "The source is removed from this session's register. Reset the session to restore any seed sources you remove."
        }
        confirmLabel={t('Remove')}
        intent="critical"
      />

      {/* Reset confirmation -------------------------------------------- */}
      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          resetAll()
          setResetOpen(false)
        }}
        title={t('Reset the data source register?')}
        description={t('Every change made this session — enabling, pausing, cadence, classification, retention, ownership, syncs, additions and removals — is discarded and the register returns to its seed state.')}
        confirmLabel={t('Reset session')}
        intent="critical"
      />

      <DemonstrationNotice />
    </PageBody>
  )
}

/* ==========================================================================
   Source detail panel
   ========================================================================== */

function DataSourceDetail({
  source,
  tab,
}: {
  source: DataSource
  tab: 'overview' | 'schema' | 'quality' | 'history' | 'downstream'
}): React.JSX.Element {
  if (tab === 'overview') {
    const openIncidents = (source.incidents ?? []).filter((i) => !i.resolved)
    return (
      <div className="space-y-4">
        <MetricGrid columns={3}>
          <Card tone="sunken">
            <p className="label-institutional">{t('Records ingested')}</p>
            <p className="numeric mt-1.5 text-lg font-semibold text-ink-900">
              {source.recordsIngested > 0 ? formatNumber(source.recordsIngested) : '—'}
            </p>
          </Card>
          <Card tone="sunken">
            <p className="label-institutional">{t('Quality score')}</p>
            <p className="numeric mt-1.5 text-lg font-semibold text-ink-900">{source.qualityScore}/100</p>
          </Card>
          <Card tone={breachesSla(source) ? 'warn' : 'sunken'}>
            <p className="label-institutional">{t('Last sync')}</p>
            <p className="mt-1.5 text-[0.8125rem] font-semibold text-ink-900">
              {source.recordsIngested > 0 ? formatRelative(source.lastSyncAt) : 'Never'}
            </p>
            <p className="mt-0.5 text-[0.625rem] text-ink-500">{t('Expectation: {0}', slaLabel(source.slaMinutes))}</p>
          </Card>
        </MetricGrid>

        <DefinitionList>
          <DefinitionRow label={t('Purpose of ingestion')}>{source.purpose ?? 'Not stated'}</DefinitionRow>
          <DefinitionRow label={t('Owner department')}>{departmentName(source.ownerDepartmentId)}</DefinitionRow>
          <DefinitionRow label={t('Accountable officer')}>{officerDisplayName(source.ownerOfficerId)}</DefinitionRow>
          <DefinitionRow label={t('Transport')}>{DATA_SOURCE_FORMAT_LABEL[source.format]}</DefinitionRow>
          <DefinitionRow label={t('Endpoint')} mono>
            {source.endpointLabel ?? 'Not provisioned'}
          </DefinitionRow>
          <DefinitionRow label={t('Cadence')}>{SYNC_FREQUENCY_LABEL[source.frequency]}</DefinitionRow>
          <DefinitionRow label={t('Freshness expectation')}>{slaLabel(source.slaMinutes)}</DefinitionRow>
          <DefinitionRow label={t('Retention')}>{retentionLabel(source.retentionDays)}</DefinitionRow>
          <DefinitionRow label={t('Observed latency')}>
            <span className="numeric">{source.latencyMs} ms</span>
          </DefinitionRow>
        </DefinitionList>

        {source.notes ? (
          <Card tone="info">
            <p className="text-[0.8125rem] leading-relaxed text-ink-700">{source.notes}</p>
          </Card>
        ) : null}

        <Card flush>
          <CardHeader
            className="px-4 pt-4"
            icon={<FileWarning className="h-4 w-4" />}
            title={t('Ingestion incidents')}
            description={t('Faults in the feed itself. An ingestion fault is never recorded as a departmental failing.')}
          />
          <div className="px-4 pb-4">
            {(source.incidents ?? []).length === 0 ? (
              <EmptyState compact title={t('No ingestion incidents recorded')} />
            ) : (
              <ul className="mt-2 space-y-2">
                {(source.incidents ?? []).map((incident) => (
                  <li key={incident.id} className="rounded-md border border-ink-100 bg-surface-sunken px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeverityBadge severity={incident.severity} withDot={false} />
                      <Badge tone={incident.resolved ? 'positive' : 'warn'}>
                        {incident.resolved ? 'Resolved' : 'Open'}
                      </Badge>
                      <div className="flex-1" />
                      <span className="text-[0.625rem] text-ink-400">{formatRelative(incident.at)}</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{incident.summary}</p>
                  </li>
                ))}
              </ul>
            )}
            {openIncidents.length > 0 ? (
              <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-warn-700">
                {t('{0} incident{1} still open. Figures derived from this feed remain published, with the gap visible in the record rather than interpolated over.', openIncidents.length, openIncidents.length === 1 ? '' : 's')}
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    )
  }

  if (tab === 'schema') {
    const fields = source.schema ?? []
    return (
      <div className="space-y-3">
        <p className="text-[0.8125rem] leading-relaxed text-ink-600">
          {t('The fields this adapter ingests, exactly as declared. Fields marked')}{' '}<em>personal</em>{' '}{t('are minimised, banded or dropped before anything enters the platform store — the declaration is what a privacy review is conducted against, so an undeclared field is a defect, not an omission.')}
        </p>
        {fields.length === 0 ? (
          <EmptyState
            compact
            title={t('No schema declared')}
            detail="Sources added during this session carry no schema until their adapter is built."
          />
        ) : (
          <DataTable
            rows={fields}
            rowKey={(f) => f.name}
            searchable={false}
            ariaLabel={`Ingestion schema for ${source.name}`}
            columns={[
              {
                id: 'name',
                header: t('Field'),
                cell: (f) => (
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[0.6875rem] text-ink-800">{f.name}</span>
                    {f.sensitive ? <Badge tone="warn" size="xs">{t('Personal')}</Badge> : null}
                  </div>
                ),
                sortValue: (f) => f.name,
              },
              { id: 'type', header: t('Type'), cell: (f) => <Badge tone="muted">{f.type}</Badge>, sortValue: (f) => f.type },
              {
                id: 'nullable',
                header: t('Required'),
                cell: (f) => (f.nullable ? <span className="text-ink-400">{t('Optional')}</span> : <span className="text-ink-700">{t('Required')}</span>),
                sortValue: (f) => (f.nullable ? 1 : 0),
              },
              {
                id: 'description',
                header: t('Description'),
                cell: (f) => <span className="text-[0.75rem] leading-relaxed text-ink-600">{f.description}</span>,
                sortable: false,
                width: 'minmax(16rem,2fr)',
              },
            ]}
          />
        )}
      </div>
    )
  }

  if (tab === 'quality') {
    const quality = source.quality
    if (!quality) {
      return (
        <EmptyState
          compact
          title={t('No quality profile yet')}
          detail="A source reports quality once it has ingested at least one batch. Enable it and run a sync."
        />
      )
    }
    const weakest = QUALITY_DIMENSIONS.reduce((worst, d) => (quality[d.key] < quality[worst.key] ? d : worst), QUALITY_DIMENSIONS[0]!)
    return (
      <div className="space-y-4">
        <Card tone="sunken">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[0.8125rem] font-semibold text-ink-800">{t('Composite quality')}</p>
            <p className="numeric text-lg font-semibold text-ink-900">{meanQualityScore(quality)}/100</p>
          </div>
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">
            {t('The mean of the five dimensions below — never an independent judgement. A single composite tells a steward nothing about what to fix; these five are what they act on.')}
          </p>
        </Card>

        <div className="space-y-3">
          {QUALITY_DIMENSIONS.map((d) => (
            <div key={d.key}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[0.8125rem] font-medium text-ink-800">{d.label}</p>
                <span className={cn('numeric text-[0.8125rem] font-semibold', quality[d.key] < 85 ? 'text-warn-700' : 'text-ink-900')}>
                  {quality[d.key]}
                </span>
              </div>
              <ProgressBar value={quality[d.key]} size="xs" className="mt-1.5" />
              <p className="mt-1 text-[0.625rem] leading-relaxed text-ink-500">{d.help}</p>
            </div>
          ))}
        </div>

        <Card tone="info">
          <p className="text-[0.8125rem] leading-relaxed text-ink-700">
            {t('Weakest dimension:')}{' '}<span className="font-semibold text-govt-800">{weakest.label}</span> at{' '}
            <span className="numeric font-semibold">{quality[weakest.key]}</span>{t('. Running a sync from this panel refreshes timeliness and the record count only — completeness, validity, uniqueness and consistency are properties of the upstream data and cannot be improved by re-reading it.')}
          </p>
        </Card>
      </div>
    )
  }

  if (tab === 'history') {
    const runs = source.syncHistory ?? []
    return (
      <div className="space-y-3">
        <p className="text-[0.8125rem] leading-relaxed text-ink-600">
          {t('Simulated ingestion runs, newest first. Runs that failed or arrived partial are kept in the record — a history showing only successes would misrepresent how the feed actually behaves.')}
        </p>
        {runs.length === 0 ? (
          <EmptyState compact title={t('No runs recorded')} detail="This source has not ingested during this session." />
        ) : (
          <DataTable
            rows={runs}
            rowKey={(r) => r.id}
            searchable={false}
            pageSize={10}
            ariaLabel={`Sync history for ${source.name}`}
            columns={[
              {
                id: 'startedAt',
                header: t('Started'),
                cell: (r) => (
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] text-ink-800">{formatRelative(r.startedAt)}</p>
                    <p className="text-[0.625rem] text-ink-400">{formatDateTime(r.startedAt)}</p>
                  </div>
                ),
                sortValue: (r) => r.startedAt,
              },
              {
                id: 'outcome',
                header: t('Outcome'),
                cell: (r) => (
                  <Badge tone={OUTCOME_TONE[r.outcome]} dot>
                    {SYNC_OUTCOME_LABEL[r.outcome]}
                  </Badge>
                ),
                sortValue: (r) => r.outcome,
              },
              {
                id: 'ingested',
                header: t('Ingested'),
                align: 'right',
                cell: (r) => <span className="numeric">{formatNumber(r.recordsIngested)}</span>,
                sortValue: (r) => r.recordsIngested,
              },
              {
                id: 'rejected',
                header: t('Rejected'),
                align: 'right',
                cell: (r) => (
                  <span className={cn('numeric', r.recordsRejected > 0 && 'font-semibold text-warn-700')}>
                    {formatNumber(r.recordsRejected)}
                  </span>
                ),
                sortValue: (r) => r.recordsRejected,
              },
              {
                id: 'duration',
                header: t('Duration'),
                align: 'right',
                cell: (r) => <span className="numeric">{r.durationSeconds}s</span>,
                sortValue: (r) => r.durationSeconds,
                hideBelow: 'md',
              },
              {
                id: 'note',
                header: t('Note'),
                cell: (r) => <span className="text-[0.75rem] leading-relaxed text-ink-600">{r.note}</span>,
                sortable: false,
                hideBelow: 'lg',
                width: 'minmax(14rem,2fr)',
              },
            ]}
          />
        )}
      </div>
    )
  }

  const downstream = source.downstream ?? []
  return (
    <div className="space-y-3">
      <p className="text-[0.8125rem] leading-relaxed text-ink-600">
        {t('What this feed carries. If the source stopped reporting, each of these would degrade before anything else in the platform did — which is what makes this list an impact assessment rather than a description.')}
      </p>
      {downstream.length === 0 ? (
        <EmptyState compact title={t('No downstream consumers declared')} detail="Nothing in the platform currently derives from this source." />
      ) : (
        <ul className="space-y-2">
          {downstream.map((metric) => (
            <li key={metric} className="flex items-start gap-2.5 rounded-md border border-ink-100 bg-surface-sunken px-3 py-2">
              <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-govt-600" aria-hidden />
              <span className="text-[0.8125rem] text-ink-700">{metric}</span>
            </li>
          ))}
        </ul>
      )}
      <Card tone="warn">
        <div className="flex items-start gap-2.5">
          <Table2 className="mt-0.5 h-4 w-4 shrink-0 text-warn-700" />
          <p className="text-xs leading-relaxed text-ink-700">
            {t('Pausing or removing this source does not recompute or hide the metrics above. In a live deployment they would continue to publish their last value with an ageing freshness label until it exceeded the platform&apos;s staleness threshold, at which point they would be withheld rather than shown stale — the platform never presents an aged figure as current.')}
          </p>
        </div>
      </Card>
    </div>
  )
}

export default DataSourcesPage
