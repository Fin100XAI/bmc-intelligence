import { useMemo, useState } from 'react'
import {
  Activity,
  AlertOctagon,
  ArrowDownAZ,
  BadgeCheck,
  Clock,
  GitBranch,
  LayoutGrid,
  Rows3,
  ShieldQuestion,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/primitives'
import { GovPanel } from '@/components/gov/GovPanel'
import { Badge } from '@/components/ui/badges'
import { Tabs } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { ActiveFilterChips, FilterBar } from '@/components/filters/FilterBar'
import { IntelligenceCard } from '@/components/cards/domain-cards'
import { CHART_COLOURS } from '@/components/charts'
import { BigFigure, KpiTile } from '@/components/infographic'
import { CountBars, LegendDonut, SEVERITY_COLOUR, StackMeter } from '@/components/infographic/command-kit'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { intelligenceService } from '@/services'
import { useDrawerStore } from '@/stores/ui.store'
import { useFilterStore } from '@/stores/ui.store'
import type { FilterState } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCompact, formatNumber, formatPercent } from '@/utils/format'
import {
  DOMAIN_LABEL,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  type ConfidenceLevel,
  type DateRangeKey,
  type IntelligenceDomain,
  type Severity,
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
 *
 * The register stays the work surface; above it, a picture strip states what
 * the items currently shown add up to - severity mix, where they sit in the
 * workflow, how confident the platform is - and each summary bar doubles as a
 * filter, so the picture is also the way into the list.
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

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

export function IntelligenceFeedPage(): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)
  const filters = useFilterStore((s) => s.filters)
  const toggleInFilter = useFilterStore((s) => s.toggleInFilter)

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

  const severityComposition = useMemo(
    () =>
      SEVERITIES.map((sev) => ({
        id: sev,
        label: SEVERITY_LABEL[sev],
        value: filtered.filter((i) => i.severity === sev).length,
        colour: SEVERITY_COLOUR[sev],
      })),
    [filtered],
  )

  const confidenceMix = useMemo(() => {
    const colour: Record<ConfidenceLevel, string> = {
      high: CHART_COLOURS.positive,
      medium: CHART_COLOURS.warn,
      low: CHART_COLOURS.risk,
    }
    const label: Record<ConfidenceLevel, string> = {
      high: t('High confidence'),
      medium: t('Medium confidence'),
      low: t('Low confidence'),
    }
    return CONFIDENCE_OPTIONS.map((c) => ({ id: c, label: label[c], value: filtered.filter((i) => i.confidence === c).length, colour: colour[c] }))
  }, [filtered])

  // Signals overlap: three items in one ward usually describe the same
  // residents. Summing them double-counts towards half the city, so the tile
  // takes the largest exposure in each ward and adds those up - every resident
  // counted at most once per ward. An item spanning wards is credited to its
  // first ward.
  const shownCitizensAffected = useMemo(() => {
    const largestByWard = new Map<string, number>()
    for (const i of filtered) {
      const n = i.citizensAffected ?? 0
      if (n <= 0) continue
      const ward = i.wardIds[0] ?? 'city'
      largestByWard.set(ward, Math.max(largestByWard.get(ward) ?? 0, n))
    }
    return [...largestByWard.values()].reduce((s, n) => s + n, 0)
  }, [filtered])
  const shownWithAction = useMemo(() => filtered.filter((i) => i.decisionCaseId || i.incidentId).length, [filtered])

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
        detail={t('Widen the date range, clear a filter, or select a different workflow stage.')}
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
        eyebrow={t('City Operations')}
        breadcrumbs={[{ label: t('City Operations') }, { label: t('Situation Room') }, { label: t('Signal feed') }]}
        controls={
          <FilterBar
            show={['date', 'ward', 'department', 'domain', 'severity', 'search']}
            domainOptions={domainOptions}
            searchPlaceholder={t('Search intelligence')}
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

      {/* ── Headline figures ── */}
      {counts ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiTile
            icon={<Activity className="h-5 w-5" />}
            label={t('Total in scope')}
            value={formatNumber(counts.total)}
            reading={t('{0} shown with current filters', filtered.length)}
            tone="neutral"
            shade="blue"
          />
          <KpiTile
            icon={<AlertOctagon className="h-5 w-5" />}
            label={t('Critical + high')}
            value={counts.bySeverity.critical + counts.bySeverity.high}
            reading={t('{0} critical', counts.bySeverity.critical)}
            tone={counts.bySeverity.critical > 0 ? 'critical' : counts.bySeverity.high > 0 ? 'risk' : 'positive'}
            shade="tone"
          />
          <KpiTile
            icon={<ShieldQuestion className="h-5 w-5" />}
            label={t('Unassigned')}
            value={counts.unassigned}
            reading={counts.unassigned > 0 ? t('No named owner yet') : t('Every item has an owner')}
            tone={counts.unassigned > 0 ? 'warn' : 'positive'}
            shade="tone"
          />
          <KpiTile
            icon={<GitBranch className="h-5 w-5" />}
            label={t('Cross-domain items')}
            value={items.filter((i) => i.type === 'cross-domain').length}
            reading={t('Signals spanning domains')}
            tone="neutral"
            shade="teal"
          />
          <KpiTile
            icon={<BadgeCheck className="h-5 w-5" />}
            label={t('Taken into action')}
            value={shownWithAction}
            reading={t('Shown items with a decision case or incident')}
            tone={shownWithAction > 0 ? 'positive' : 'neutral'}
            shade="green"
          />
          <KpiTile
            icon={<Users className="h-5 w-5" />}
            label={t('Citizens affected')}
            value={formatCompact(shownCitizensAffected)}
            reading={t('Modelled estimate - largest exposure per ward, not a sum of overlapping items')}
            tone="neutral"
            shade="amber"
          />
        </div>
      ) : null}

      <ActiveFilterChips />

      {/* ── What the items shown add up to ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <GovPanel title={t('Severity composition')} subtitle={t('Of the items currently shown.')} tone="red" dense>
          <div className="p-3">
            <LegendDonut
              segments={severityComposition}
              centreValue={formatNumber(filtered.length)}
              centreLabel={t('items')}
              size={140}
              emptyLabel={t('No items to summarise.')}
            />
          </div>
        </GovPanel>

        <GovPanel title={t('Workflow stage')} subtitle={t('Select a stage to filter the feed')} tone="amber" dense>
          <div className="p-2">
            <CountBars
              rows={tabItems.map((tab) => ({ id: tab.id, label: tab.label, value: tab.count }))}
              activeIds={[statusTab]}
              onSelect={(id) => setStatusTab(id as 'all' | IntelligenceStatus)}
              emptyLabel={t('No items to summarise.')}
            />
          </div>
        </GovPanel>

        <GovPanel title={t('Platform confidence')} subtitle={t('Of the items currently shown.')} tone="green" dense>
          <div className="space-y-3 p-3">
            <BigFigure
              value={formatPercent(filtered.length > 0 ? ((confidenceMix[0]?.value ?? 0) / filtered.length) * 100 : 0, 0)}
              caption={t('of items shown are raised at high confidence')}
              tone="positive"
            />
            <StackMeter segments={confidenceMix} emptyLabel={t('No items to summarise.')} />
            <p className="text-[0.625rem] leading-snug text-ink-500">
              {t('Confidence is the platform\'s own assessment of its evidence - advisory, never a decision.')}
            </p>
          </div>
        </GovPanel>
      </div>

      <Tabs
        items={tabItems}
        value={statusTab}
        onChange={(id) => setStatusTab(id as 'all' | IntelligenceStatus)}
        ariaLabel={t('Workflow status')}
      />

      <SplitLayout
        asideWidth="sm"
        main={
          <GovPanel title={t('{0} item(s) shown', filtered.length)} subtitle={t('Feed')} tone="amber" dense>
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-3 py-2">
              <SegmentedControl
                ariaLabel={t('Sort by')}
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
                ariaLabel={t('Group by domain')}
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
            <GovPanel title={t('Domain breakdown')} subtitle={t('Select a domain to filter')} tone="red" dense>
              <div className="p-2">
                <CountBars
                  rows={domainBreakdown.map((d) => ({ id: d.domain, label: DOMAIN_LABEL[d.domain], value: d.count }))}
                  activeIds={filters.domains}
                  onSelect={(id) => toggleInFilter('domains', id)}
                  emptyLabel={t('No items to summarise.')}
                />
              </div>
            </GovPanel>
            <GovPanel title={t('Type distribution')} subtitle={t('Select a type to filter')} tone="amber" dense>
              <div className="p-2">
                <CountBars
                  rows={typeBreakdown.map((entry) => ({
                    id: entry.type,
                    label: INTELLIGENCE_TYPE_LABEL[entry.type],
                    value: entry.count,
                    colour: CHART_COLOURS.intel,
                  }))}
                  activeIds={typeFilter}
                  onSelect={(id) =>
                    setTypeFilter((prev) =>
                      prev.includes(id as IntelligenceType) ? prev.filter((x) => x !== id) : [...prev, id as IntelligenceType],
                    )
                  }
                  emptyLabel={t('No items to summarise.')}
                />
              </div>
            </GovPanel>
          </>
        }
      />

      <DemonstrationNotice />
    </PageBody>
  )
}

export default IntelligenceFeedPage
