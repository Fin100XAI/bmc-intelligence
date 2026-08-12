import { useMemo, useState, type ReactNode } from 'react'
import { Filter, RotateCcw, X } from 'lucide-react'
import {
  DATE_RANGE_LABEL,
  DOMAIN_LABEL,
  SEVERITY_LABEL,
  type DateRangeKey,
  type IntelligenceDomain,
  type Severity,
} from '@/types/common'
import { DEPARTMENTS_ORDERED, WARDS } from '@/data/reference'
import { canAccess } from '@/security/access'
import { useCurrentUser } from '@/stores/auth.store'
import { useFilterStore } from '@/stores/ui.store'
import { cn } from '@/utils/cn'
import { Badge } from '@/components/ui/badges'
import { Button, Checkbox, Input, Select } from '@/components/ui/primitives'
import { t } from '@/i18n'

/**
 * Reusable global filter bar.
 *
 * Filter state is persisted in the layout store so an operator's working set
 * survives navigation between intelligence modules.
 */
export interface FilterBarProps {
  /** Which controls to render. Omitted controls are not shown. */
  show?: Array<'date' | 'ward' | 'department' | 'domain' | 'severity' | 'status' | 'search'>
  statusOptions?: Array<{ value: string; label: string }>
  domainOptions?: IntelligenceDomain[]
  searchPlaceholder?: string
  extra?: ReactNode
  className?: string
  compact?: boolean
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
const DATE_RANGES: DateRangeKey[] = ['24h', '7d', '30d', '90d', 'fy']

export function FilterBar({
  show = ['date', 'ward', 'department', 'severity', 'search'],
  statusOptions,
  domainOptions,
  searchPlaceholder = 'Search records',
  extra,
  className,
  compact,
}: FilterBarProps): React.JSX.Element {
  const user = useCurrentUser()
  const filters = useFilterStore((s) => s.filters)
  const setFilter = useFilterStore((s) => s.setFilter)
  const toggleInFilter = useFilterStore((s) => s.toggleInFilter)
  const resetFilters = useFilterStore((s) => s.resetFilters)
  const [openPanel, setOpenPanel] = useState<string | null>(null)

  const authorisedWards = useMemo(
    () => WARDS.filter((w) => canAccess(user, 'ward', 'view', { wardId: w.id }).allowed),
    [user],
  )

  const activeCount =
    filters.wardIds.length +
    filters.departmentIds.length +
    filters.domains.length +
    filters.severities.length +
    filters.statuses.length +
    (filters.search.trim() ? 1 : 0) +
    (filters.dateRange !== '30d' ? 1 : 0)

  const panelButton = (id: string, label: string, count: number): React.JSX.Element => (
    <button
      type="button"
      onClick={() => setOpenPanel((p) => (p === id ? null : id))}
      aria-expanded={openPanel === id}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
        count > 0
          ? 'border-govt-300 bg-govt-50 text-govt-700'
          : 'border-ink-200 bg-surface text-ink-600 hover:bg-ink-50',
      )}
    >
      {label}
      {count > 0 ? (
        <span className="numeric rounded bg-govt-200/70 px-1 text-[0.625rem] text-govt-800">{count}</span>
      ) : null}
    </button>
  )

  const panel = (id: string, children: ReactNode): React.JSX.Element | null =>
    openPanel === id ? (
      <>
        <div className="fixed inset-0 z-20" onClick={() => setOpenPanel(null)} aria-hidden />
        <div className="animate-in-scale absolute top-full left-0 z-30 mt-1 w-64 rounded-lg border border-ink-100 bg-surface p-2 shadow-overlay">
          <div className="scrollbar-slim max-h-64 space-y-0.5 overflow-y-auto">{children}</div>
        </div>
      </>
    ) : null

  return (
    <div data-filter-surface="bar" className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="inline-flex items-center gap-1.5 text-ink-400">
        <Filter className="h-3.5 w-3.5" aria-hidden />
        {!compact ? <span className="label-institutional">{t('Filters')}</span> : null}
      </span>

      {show.includes('date') ? (
        <Select
          value={filters.dateRange}
          onChange={(e) => setFilter('dateRange', e.target.value as DateRangeKey)}
          options={DATE_RANGES.map((r) => ({ value: r, label: DATE_RANGE_LABEL[r] }))}
          className="w-auto min-w-[9.5rem]"
          aria-label={t('Date range')}
        />
      ) : null}

      {show.includes('ward') ? (
        <div className="relative">
          {panelButton('ward', 'Ward', filters.wardIds.length)}
          {panel(
            'ward',
            authorisedWards.map((w) => (
              <Checkbox
                key={w.id}
                checked={filters.wardIds.includes(w.id)}
                onChange={() => toggleInFilter('wardIds', w.id)}
                label={`${w.code} - ${w.name.split(' · ')[0]}`}
                className="rounded px-1 py-1 hover:bg-ink-50"
              />
            )),
          )}
        </div>
      ) : null}

      {show.includes('department') ? (
        <div className="relative">
          {panelButton('department', 'Department', filters.departmentIds.length)}
          {panel(
            'department',
            DEPARTMENTS_ORDERED.map((d) => (
              <Checkbox
                key={d.id}
                checked={filters.departmentIds.includes(d.id)}
                onChange={() => toggleInFilter('departmentIds', d.id)}
                label={d.shortName}
                className="rounded px-1 py-1 hover:bg-ink-50"
              />
            )),
          )}
        </div>
      ) : null}

      {show.includes('domain') && domainOptions ? (
        <div className="relative">
          {panelButton('domain', 'Domain', filters.domains.length)}
          {panel(
            'domain',
            domainOptions.map((d) => (
              <Checkbox
                key={d}
                checked={filters.domains.includes(d)}
                onChange={() => toggleInFilter('domains', d)}
                label={DOMAIN_LABEL[d]}
                className="rounded px-1 py-1 hover:bg-ink-50"
              />
            )),
          )}
        </div>
      ) : null}

      {show.includes('severity') ? (
        <div className="relative">
          {panelButton('severity', 'Severity', filters.severities.length)}
          {panel(
            'severity',
            SEVERITIES.map((s) => (
              <Checkbox
                key={s}
                checked={filters.severities.includes(s)}
                onChange={() => toggleInFilter('severities', s)}
                label={SEVERITY_LABEL[s]}
                className="rounded px-1 py-1 hover:bg-ink-50"
              />
            )),
          )}
        </div>
      ) : null}

      {show.includes('status') && statusOptions ? (
        <div className="relative">
          {panelButton('status', 'Status', filters.statuses.length)}
          {panel(
            'status',
            statusOptions.map((s) => (
              <Checkbox
                key={s.value}
                checked={filters.statuses.includes(s.value)}
                onChange={() => toggleInFilter('statuses', s.value)}
                label={s.label}
                className="rounded px-1 py-1 hover:bg-ink-50"
              />
            )),
          )}
        </div>
      ) : null}

      {show.includes('search') ? (
        <Input
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          placeholder={searchPlaceholder}
          className="w-auto min-w-[12rem] flex-1 sm:max-w-xs"
          aria-label={searchPlaceholder}
        />
      ) : null}

      {extra}

      {activeCount > 0 ? (
        <Button size="xs" variant="ghost" onClick={resetFilters} icon={<RotateCcw className="h-3 w-3" />}>
          {t('Clear {0}', activeCount)}
        </Button>
      ) : null}
    </div>
  )
}

/** Renders the currently applied filters as removable chips. */
export function ActiveFilterChips({ className }: { className?: string }): React.JSX.Element | null {
  const filters = useFilterStore((s) => s.filters)
  const toggleInFilter = useFilterStore((s) => s.toggleInFilter)
  const setFilter = useFilterStore((s) => s.setFilter)

  const chips: Array<{ key: string; label: string; remove: () => void }> = [
    ...filters.wardIds.map((id) => ({
      key: `w-${id}`,
      label: WARDS.find((w) => w.id === id)?.code ?? id,
      remove: () => toggleInFilter('wardIds', id),
    })),
    ...filters.departmentIds.map((id) => ({
      key: `d-${id}`,
      label: DEPARTMENTS_ORDERED.find((d) => d.id === id)?.shortName ?? id,
      remove: () => toggleInFilter('departmentIds', id),
    })),
    ...filters.severities.map((s) => ({
      key: `s-${s}`,
      label: SEVERITY_LABEL[s],
      remove: () => toggleInFilter('severities', s),
    })),
    ...filters.domains.map((d) => ({
      key: `dm-${d}`,
      label: DOMAIN_LABEL[d],
      remove: () => toggleInFilter('domains', d),
    })),
    ...filters.statuses.map((s) => ({ key: `st-${s}`, label: s, remove: () => toggleInFilter('statuses', s) })),
  ]

  if (filters.search.trim()) {
    chips.push({ key: 'search', label: `“${filters.search.trim()}”`, remove: () => setFilter('search', '') })
  }

  if (chips.length === 0) return null

  return (
    <div data-filter-surface="chips" className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          className="inline-flex h-5 items-center gap-1 rounded bg-govt-50 px-1.5 text-[0.6875rem] font-medium text-govt-700 ring-1 ring-govt-200/70 ring-inset transition-colors hover:bg-govt-100"
        >
          {chip.label}
          <X className="h-2.5 w-2.5" aria-hidden />
        </button>
      ))}
      <Badge tone="muted">{t('{0} filter(s) applied', chips.length)}</Badge>
    </div>
  )
}
