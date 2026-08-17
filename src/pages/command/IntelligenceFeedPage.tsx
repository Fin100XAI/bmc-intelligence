import { useMemo, useState } from 'react'
import { Activity, ArrowDownAZ, Clock, GitBranch, LayoutGrid, Rows3, ShieldQuestion, SlidersHorizontal } from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { MetricGrid, SegmentedControl } from '@/components/ui/primitives'
import { GovPanel } from '@/components/gov/GovPanel'
import { Badge } from '@/components/ui/badges'
import { Tabs } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { ActiveFilterChips, FilterBar } from '@/components/filters/FilterBar'
import { MetricCard } from '@/components/cards/MetricCard'
import { IntelligenceCard } from '@/components/cards/domain-cards'
import { CompositionBar, MiniBar } from '@/components/charts/charts'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { intelligenceService } from '@/services'
import { useDrawerStore } from '@/stores/ui.store'
import { useFilterStore } from '@/stores/ui.store'
import type { FilterState } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { DEMO_NOW } from '@/utils/deterministic'
import {
  DOMAIN_LABEL,
  SEVERITY_ORDER,
  type ConfidenceLevel,
  type DateRangeKey,
  type IntelligenceDomain,
} from '@/types/common'
import {
  INTELLIGENCE_STATUS_LABEL,
  INTELLIGENCE_TYPE_LABEL,
  type IntelligenceItem,
  type IntelligenceStatus,
  type IntelligenceType,
} from '@/types/intelligence'
import { t } from '@/i18n'

/**
 * Institutional intelligence feed - every signal the platform has raised
 * across every domain, from source evidence through to recommended action.
 * This is an operations register, not a social stream: every item states its
 * confidence, its evidence count and the named owner accountable for it.
 */

const DATE_RANGE_HOURS: Record<DateRangeKey, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  '90d': 24 * 90,
  fy: 24 * 365,
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 0, medium: 1, low: 2 }
const CONFIDENCE_OPTIONS: ConfidenceLevel[] = ['high', 'medium', 'low']

type SortKey = 'severity' | 'recency' | 'confidence'

function withinDateRange(iso: string, range: DateRangeKey): boolean {
  const ageMs = DEMO_NOW.getTime() - new Date(iso).getTime()
  return ageMs <= DATE_RANGE_HOURS[range] * 3_600_000
}

function matchesGlobalFilters(item: IntelligenceItem, filters: FilterState): boolean {
  if (filters.wardIds.length > 0 && !item.wardIds.some((w) => filters.wardIds.includes(w))) return false
  if (filters.departmentIds.length > 0 && !filters.departmentIds.includes(item.departmentId)) return false
  if (filters.domains.length > 0 && !filters.domains.includes(item.domain)) return false
  if (filters.severities.length > 0 && !filters.severities.includes(item.severity)) return false
  if (!withinDateRange(item.createdAt, filters.dateRange)) return false
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    if (
      !item.title.toLowerCase().includes(q) &&
      !item.description.toLowerCase().includes(q) &&
      !item.explanation.toLowerCase().includes(q)
    )
      return false
  }
  return true
}

function sortItems(items: IntelligenceItem[], key: SortKey): IntelligenceItem[] {
  const sorted = [...items]
  if (key === 'severity') sorted.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  else if (key === 'confidence') sorted.sort((a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence])
  else sorted.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return sorted
}

const SEVERITY_TONE_MAP = { critical: '#e5484d', high: '#f97316', medium: '#f59e0b', low: '#2f6feb', info: '#8195ac' } as const

export function IntelligenceFeedPage(): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)
  const filters = useFilterStore((s) => s.filters)

  const [statusTab, setStatusTab] = useState<'all' | IntelligenceStatus>('all')
  const [sortKey, setSortKey] = useState<SortKey>('severity')
  const [groupByDomain, setGroupByDomain] = useState(false)
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceLevel[]>([])
  const [typeFilter, setTypeFilter] = useState<IntelligenceType[]>([])

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(t('Intelligence Feed'))

  const feedQuery = useServiceQuery(queryKeys.intelligence(), (u) => intelligenceService.list(u, { pageSize: 500 }))
  const countsQuery = useServiceQuery(queryKeys.intelligence('counts'), (u) => intelligenceService.feedCounts(u))

  const items = useMemo(() => feedQuery.data?.items ?? [], [feedQuery.data])

  const domainOptions = useMemo<IntelligenceDomain[]>(
    () => Array.from(new Set(items.map((i) => i.domain))).sort((a, b) => DOMAIN_LABEL[a].localeCompare(DOMAIN_LABEL[b])),
    [items],
  )
  const typeOptions = useMemo<IntelligenceType[]>(() => Array.from(new Set(items.map((i) => i.type))), [items])

  const filtered = useMemo(() => {
    const base = items
      .filter((i) => matchesGlobalFilters(i, filters))
      .filter((i) => statusTab === 'all' || i.status === statusTab)
      .filter((i) => confidenceFilter.length === 0 || confidenceFilter.includes(i.confidence))
      .filter((i) => typeFilter.length === 0 || typeFilter.includes(i.type))
    return sortItems(base, sortKey)
  }, [items, filters, statusTab, confidenceFilter, typeFilter, sortKey])

  const grouped = useMemo(() => {
    if (!groupByDomain) return null
    const map = new Map<IntelligenceDomain, IntelligenceItem[]>()
    for (const item of filtered) {
      const bucket = map.get(item.domain) ?? []
      bucket.push(item)
      map.set(item.domain, bucket)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [filtered, groupByDomain])

  const domainBreakdown = useMemo(() => {
    const map = new Map<IntelligenceDomain, number>()
    for (const item of filtered) map.set(item.domain, (map.get(item.domain) ?? 0) + 1)
    return Array.from(map.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [filtered])

  const typeBreakdown = useMemo(() => {
    const map = new Map<IntelligenceType, number>()
    for (const item of filtered) map.set(item.type, (map.get(item.type) ?? 0) + 1)
    return Array.from(map.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  const severityComposition = useMemo(() => {
    const order: Array<{ id: keyof typeof SEVERITY_TONE_MAP; label: string }> = [
      { id: 'critical', label: t('Critical') },
      { id: 'high', label: t('High') },
      { id: 'medium', label: t('Medium') },
      { id: 'low', label: t('Low') },
      { id: 'info', label: t('Informational') },
    ]
    return order
      .map((o) => ({
        id: o.id,
        label: o.label,
        value: filtered.filter((i) => i.severity === o.id).length,
        colour: SEVERITY_TONE_MAP[o.id],
      }))
      .filter((s) => s.value > 0)
  }, [filtered])

  if (feedQuery.isLoading || countsQuery.isLoading) {
    return (
      <PageBody>
        <LoadingState variant="metrics" />
        <LoadingState variant="block" rows={6} />
      </PageBody>
    )
  }
  if (feedQuery.error) {
    return (
      <PageBody>
        <ErrorState detail={feedQuery.error.message} onRetry={() => feedQuery.refetch()} />
      </PageBody>
    )
  }

  const counts = countsQuery.data

  const tabItems = [
    { id: 'all', label: t('All'), count: counts?.total ?? items.length },
    ...(Object.keys(INTELLIGENCE_STATUS_LABEL) as IntelligenceStatus[]).map((status) => ({
      id: status,
      label: INTELLIGENCE_STATUS_LABEL[status],
      count: counts?.byStatus[status] ?? 0,
    })),
  ]

  const listBody =
    filtered.length === 0 ? (
      <EmptyState
        title={t('No intelligence items match the current filters')}
        detail="Widen the date range, clear a filter, or select a different workflow stage."
      />
    ) : grouped ? (
      <div className="space-y-5">
        {grouped.map(([domain, domainItems]) => (
          <div key={domain}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-[0.8125rem] font-semibold text-ink-800">{DOMAIN_LABEL[domain]}</h3>
              <Badge tone="muted">{domainItems.length}</Badge>
            </div>
            <div className="space-y-2.5">
              {domainItems.map((item) => (
                <IntelligenceCard key={item.id} item={item} onClick={() => openDrawer({ kind: 'intelligence', id: item.id })} />
              ))}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="space-y-2.5">
        {filtered.map((item) => (
          <IntelligenceCard key={item.id} item={item} onClick={() => openDrawer({ kind: 'intelligence', id: item.id })} />
        ))}
      </div>
    )

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Command')}
        breadcrumbs={[{ label: t('Command') }, { label: t('Intelligence Feed') }]}
        controls={
          <FilterBar
            show={['date', 'ward', 'department', 'domain', 'severity', 'search']}
            domainOptions={domainOptions}
            searchPlaceholder="Search intelligence"
            extra={
              <>
                <div className="flex items-center gap-1">
                  <span className="text-[0.6875rem] text-ink-400">{t('Confidence')}</span>
                  {CONFIDENCE_OPTIONS.map((c) => {
                    const active = confidenceFilter.includes(c)
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          setConfidenceFilter((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
                        }
                        className={
                          active
                            ? 'inline-flex h-7 items-center rounded-md border border-govt-300 bg-govt-50 px-2 text-xs font-medium text-govt-700'
                            : 'inline-flex h-7 items-center rounded-md border border-ink-200 bg-surface px-2 text-xs font-medium text-ink-600 hover:bg-ink-50'
                        }
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[0.6875rem] text-ink-400">{t('Type')}</span>
                  {typeOptions.map((intelligenceType) => {
                    const active = typeFilter.includes(intelligenceType)
                    return (
                      <button
                        key={intelligenceType}
                        type="button"
                        onClick={() => setTypeFilter((prev) => (prev.includes(intelligenceType) ? prev.filter((x) => x !== intelligenceType) : [...prev, intelligenceType]))}
                        className={
                          active
                            ? 'inline-flex h-7 items-center rounded-md border border-govt-300 bg-govt-50 px-2 text-xs font-medium text-govt-700'
                            : 'inline-flex h-7 items-center rounded-md border border-ink-200 bg-surface px-2 text-xs font-medium text-ink-600 hover:bg-ink-50'
                        }
                      >
                        {INTELLIGENCE_TYPE_LABEL[intelligenceType]}
                      </button>
                    )
                  })}
                </div>
              </>
            }
          />
        }
      />

      {counts ? (
        <MetricGrid columns={4}>
          <MetricCard label={t('Total in scope')} value={counts.total} icon={<Activity className="h-3.5 w-3.5" />} background="red" />
          <MetricCard
            label={t('Critical + high')}
            value={counts.bySeverity.critical + counts.bySeverity.high}
            tone={counts.bySeverity.critical > 0 ? 'critical' : 'default'}
            background="amber"
          />
          <MetricCard label={t('Unassigned')} value={counts.unassigned} tone={counts.unassigned > 0 ? 'warn' : 'default'} icon={<ShieldQuestion className="h-3.5 w-3.5" />} background="green" />
          <MetricCard label={t('Cross-domain items')} value={items.filter((i) => i.type === 'cross-domain').length} icon={<GitBranch className="h-3.5 w-3.5" />} />
        </MetricGrid>
      ) : null}

      <ActiveFilterChips />

      <Tabs
        items={tabItems}
        value={statusTab}
        onChange={(id) => setStatusTab(id as 'all' | IntelligenceStatus)}
        ariaLabel="Workflow status"
      />

      <SplitLayout
        asideWidth="sm"
        main={
          <GovPanel title={t('{0} item(s) shown', filtered.length)} subtitle={t('Feed')} tone="amber" dense>
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-3 py-2">
              <SegmentedControl
                ariaLabel="Sort by"
                size="xs"
                value={sortKey}
                onChange={setSortKey}
                options={[
                  { value: 'severity', label: t('Severity'), icon: <SlidersHorizontal className="h-3 w-3" /> },
                  { value: 'recency', label: t('Recency'), icon: <Clock className="h-3 w-3" /> },
                  { value: 'confidence', label: t('Confidence'), icon: <ArrowDownAZ className="h-3 w-3" /> },
                ]}
              />
              <SegmentedControl
                ariaLabel="Group by domain"
                size="xs"
                value={groupByDomain ? 'grouped' : 'flat'}
                onChange={(v) => setGroupByDomain(v === 'grouped')}
                options={[
                  { value: 'flat', label: t('Flat'), icon: <Rows3 className="h-3 w-3" /> },
                  { value: 'grouped', label: t('By domain'), icon: <LayoutGrid className="h-3 w-3" /> },
                ]}
              />
            </div>
            <div className="p-3">{listBody}</div>
          </GovPanel>
        }
        aside={
          <>
            <GovPanel title={t('Severity composition')} tone="amber">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Of the items currently shown.')}</p>
              {severityComposition.length > 0 ? (
                <CompositionBar segments={severityComposition} />
              ) : (
                <p className="text-xs text-ink-400">{t('No items to summarise.')}</p>
              )}
            </GovPanel>
            <GovPanel title={t('Domain breakdown')} tone="red">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Top domains by item count.')}</p>
              <ul className="space-y-2">
                {domainBreakdown.map((d) => (
                  <li key={d.domain} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-ink-600">{DOMAIN_LABEL[d.domain]}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <MiniBar value={d.count} max={Math.max(...domainBreakdown.map((x) => x.count), 1)} width={40} />
                      <span className="numeric font-semibold text-ink-800">{d.count}</span>
                    </span>
                  </li>
                ))}
                {domainBreakdown.length === 0 ? <p className="text-xs text-ink-400">{t('No items to summarise.')}</p> : null}
              </ul>
            </GovPanel>
            <GovPanel title={t('Type distribution')} tone="amber">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Signal type across the current filter set.')}</p>
              <ul className="space-y-2">
                {typeBreakdown.map((entry) => (
                  <li key={entry.type} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-ink-600">{INTELLIGENCE_TYPE_LABEL[entry.type]}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <MiniBar value={entry.count} max={Math.max(...typeBreakdown.map((x) => x.count), 1)} width={40} />
                      <span className="numeric font-semibold text-ink-800">{entry.count}</span>
                    </span>
                  </li>
                ))}
                {typeBreakdown.length === 0 ? <p className="text-xs text-ink-400">{t('No items to summarise.')}</p> : null}
              </ul>
            </GovPanel>
          </>
        }
      />

      <DemonstrationNotice />
    </PageBody>
  )
}

export default IntelligenceFeedPage
