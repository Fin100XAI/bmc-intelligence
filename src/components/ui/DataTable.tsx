import { useDeferredValue, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useCurrentUser } from '@/stores/auth.store'
import { municipality } from '@/config/municipality.config'
import { downloadCsv, type ExportColumn } from '@/utils/export'
import { Badge } from './badges'
import { Button, IconButton, Input } from './primitives'
import { EmptyState } from './states'
import { t } from '@/i18n'

/**
 * Enterprise data table.
 *
 * Sorting, searching, filtering, pagination, column visibility, row selection
 * and row actions all work - this is an operational instrument, not a
 * decorative grid.
 */

export interface Column<T> {
  id: string
  header: ReactNode
  /** Cell renderer. */
  cell: (row: T) => ReactNode
  /** Value used for sorting and free-text search. */
  sortValue?: (row: T) => string | number
  searchValue?: (row: T) => string
  /**
   * Value written to an exported file. Supply this where the cell renders
   * something a `sortValue` does not describe - a badge whose label differs
   * from its sort key, a composite cell, a formatted figure that should leave
   * as a plain number. Falls back to `sortValue`, then `searchValue`.
   */
  exportValue?: (row: T) => string | number | null | undefined
  /** Omit this column from exports (row action columns, selection rails). */
  exportExclude?: boolean
  width?: string
  align?: 'left' | 'right' | 'center'
  /** Column is hidden by default but available in the column picker. */
  optional?: boolean
  sortable?: boolean
  /** Hide below the given breakpoint to keep narrow layouts readable. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
}

export interface DataTableProps<T> {
  rows: T[]
  columns: Array<Column<T>>
  rowKey: (row: T) => string
  /** Enables the search field and searches across every `searchValue`. */
  searchable?: boolean
  searchPlaceholder?: string
  /**
   * Enables pagination; omit for a fully rendered table. The exact number is
   * the operator's — Settings → Rows per table wins over the value
   * passed here, so one preference governs every register in the platform.
   * Pass `fixedPageSize` where the layout genuinely depends on the count.
   */
  pageSize?: number
  /** Opts a table out of the operator's rows-per-table preference. */
  fixedPageSize?: boolean
  /** Sticky header - use inside a scroll container with a bounded height. */
  stickyHeader?: boolean
  maxHeight?: string
  onRowClick?: (row: T) => void
  /** Highlights the currently open row when a drawer is showing it. */
  activeRowKey?: string
  selectable?: boolean
  selectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  /** Rendered at the end of every row. */
  rowActions?: (row: T) => ReactNode
  /** Rendered to the left of the search field. */
  toolbar?: ReactNode
  /**
   * Export the register to CSV. On by default: an officer who can read a
   * register can take it away, and a review body asking to see the register as
   * it stood needs a file rather than a screenshot. Set `false` only where the
   * rows are not a register - a two-row summary strip, a legend.
   */
  exportable?: boolean
  /** Names the export - used for the file name and the provenance title. */
  exportName?: string
  /** Filters in force, written into the exported file's provenance block. */
  exportFilters?: Record<string, string | undefined>
  emptyTitle?: string
  emptyDetail?: string
  initialSort?: { columnId: string; direction: 'asc' | 'desc' }
  /** Leading accent element, e.g. a severity rail. */
  rowAccent?: (row: T) => ReactNode
  dense?: boolean
  className?: string
  /** Caption announced to assistive technology. */
  ariaLabel?: string
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchable = true,
  searchPlaceholder = 'Search records',
  pageSize: requestedPageSize,
  fixedPageSize,
  stickyHeader,
  maxHeight,
  onRowClick,
  activeRowKey,
  selectable,
  selectedKeys,
  onSelectionChange,
  rowActions,
  toolbar,
  exportable = true,
  exportName = 'Register',
  exportFilters,
  emptyTitle = 'No records match the current filters',
  emptyDetail = 'Adjust the filters above, or clear the search term, to widen the result set.',
  initialSort,
  rowAccent,
  dense,
  className,
  ariaLabel,
}: DataTableProps<T>): React.JSX.Element {
  const preferredPageSize = usePreferencesStore((s) => s.tablePageSize)
  // Attribution for exported files - an export leaves this application and
  // must say who took it.
  const actingUser = useCurrentUser()
  const pageSize = requestedPageSize ? (fixedPageSize ? requestedPageSize : preferredPageSize) : undefined

  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [sort, setSort] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>(initialSort ?? null)
  const [page, setPage] = useState(0)
  const [hidden, setHidden] = useState<string[]>(() => columns.filter((c) => c.optional).map((c) => c.id))
  const [columnPickerOpen, setColumnPickerOpen] = useState(false)
  const searchId = useId()

  // Reset to the first page whenever the result set changes shape.
  useEffect(() => {
    setPage(0)
  }, [deferredSearch, rows.length, pageSize])

  const visibleColumns = useMemo(() => columns.filter((c) => !hidden.includes(c.id)), [columns, hidden])

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      columns.some((col) => {
        const value = col.searchValue?.(row) ?? (col.sortValue ? String(col.sortValue(row)) : '')
        return value.toLowerCase().includes(q)
      }),
    )
  }, [rows, columns, deferredSearch])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = columns.find((c) => c.id === sort.columnId)
    if (!col?.sortValue) return filtered
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = col.sortValue!(a)
      const bv = col.sortValue!(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), 'en', { numeric: true }) * dir
    })
  }, [filtered, sort, columns])

  const totalPages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1
  const safePage = Math.min(page, totalPages - 1)
  const paged = pageSize ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted

  const toggleSort = (col: Column<T>): void => {
    if (col.sortable === false || !col.sortValue) return
    setSort((prev) => {
      if (prev?.columnId !== col.id) return { columnId: col.id, direction: 'desc' }
      if (prev.direction === 'desc') return { columnId: col.id, direction: 'asc' }
      return null
    })
  }

  const allPagedSelected =
    paged.length > 0 && paged.every((row) => selectedKeys?.includes(rowKey(row)))

  const toggleAll = (): void => {
    if (!onSelectionChange) return
    const pagedKeys = paged.map(rowKey)
    if (allPagedSelected) {
      onSelectionChange((selectedKeys ?? []).filter((k) => !pagedKeys.includes(k)))
    } else {
      onSelectionChange(Array.from(new Set([...(selectedKeys ?? []), ...pagedKeys])))
    }
  }

  /**
   * Exports every row that survives the current search and sort - not merely
   * the visible page. An officer who has filtered a register to the twelve
   * matters that concern them wants those twelve, and a file that silently
   * stopped at the page boundary would be a quietly wrong record.
   *
   * Hidden columns are included: they are hidden for layout reasons, and a
   * file has no layout constraints to respect.
   */
  const handleExport = (): void => {
    const exportColumns: Array<ExportColumn<T>> = columns
      .filter((c) => !c.exportExclude)
      .map((col) => ({
        header: typeof col.header === 'string' ? col.header : col.id,
        value: (row: T) =>
          col.exportValue?.(row) ?? col.sortValue?.(row) ?? col.searchValue?.(row) ?? '',
      }))

    downloadCsv(exportName, sorted, exportColumns, {
      title: exportName,
      actor: actingUser ? `${actingUser.name} · ${actingUser.designation}` : undefined,
      environment: municipality.environmentLabel,
      filters: {
        ...(deferredSearch.trim() ? { Search: deferredSearch.trim() } : {}),
        ...(sort ? { 'Sorted by': `${sort.columnId} ${sort.direction}` } : {}),
        ...exportFilters,
      },
      notes: [
        t('{0} of {1} records exported after filtering.', sorted.length, rows.length),
        t('Modelled demonstration data. Not a municipal record of account.'),
      ],
    })
  }

  const hideClass: Record<NonNullable<Column<T>['hideBelow']>, string> = {
    sm: 'hidden sm:table-cell',
    md: 'hidden md:table-cell',
    lg: 'hidden lg:table-cell',
    xl: 'hidden xl:table-cell',
  }

  const cellPad = dense ? 'px-2.5 py-1.5' : 'px-3 py-2.5'

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {(searchable || toolbar || exportable || columns.some((c) => c.optional)) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-3 py-2">
          {toolbar}
          <div className="flex-1" />
          {searchable ? (
            <div className="relative w-full max-w-56 sm:w-56">
              <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
              <label htmlFor={searchId} className="sr-only">
                {searchPlaceholder}
              </label>
              <Input
                id={searchId}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-7"
              />
            </div>
          ) : null}
          {exportable ? (
            <IconButton
              label={t('Export {0} as CSV', exportName.toLowerCase())}
              variant="outline"
              onClick={handleExport}
              disabled={sorted.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
          {columns.some((c) => c.optional) ? (
            <div className="relative">
              <IconButton
                label={t('Choose visible columns')}
                variant="outline"
                onClick={() => setColumnPickerOpen((v) => !v)}
                aria-expanded={columnPickerOpen}
              >
                <Columns3 className="h-3.5 w-3.5" />
              </IconButton>
              {columnPickerOpen ? (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setColumnPickerOpen(false)} aria-hidden />
                  <div className="animate-in-scale absolute top-full right-0 z-30 mt-1 w-56 rounded-lg border border-ink-100 bg-surface p-2 shadow-overlay">
                    <p className="label-institutional mb-1.5 px-1">{t('Visible columns')}</p>
                    <div className="scrollbar-slim max-h-64 space-y-0.5 overflow-y-auto">
                      {columns.map((col) => (
                        <label
                          key={col.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-ink-700 hover:bg-ink-50"
                        >
                          <input
                            type="checkbox"
                            checked={!hidden.includes(col.id)}
                            onChange={() =>
                              setHidden((prev) =>
                                prev.includes(col.id) ? prev.filter((c) => c !== col.id) : [...prev, col.id],
                              )
                            }
                            className="h-3.5 w-3.5 rounded-[3px] border-ink-300 text-govt-600"
                          />
                          <span className="truncate">{typeof col.header === 'string' ? col.header : col.id}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <div className={cn('scrollbar-slim min-w-0 overflow-auto')} style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full min-w-full border-collapse text-left" aria-label={ariaLabel}>
          <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
            <tr className="border-b border-ink-100 bg-surface-sunken">
              {rowAccent ? <th className="w-1 p-0" aria-hidden /> : null}
              {selectable ? (
                <th scope="col" className={cn('w-8', cellPad)}>
                  <input
                    type="checkbox"
                    aria-label={t('Select all rows on this page')}
                    checked={allPagedSelected}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded-[3px] border-ink-300 text-govt-600"
                  />
                </th>
              ) : null}
              {visibleColumns.map((col) => {
                const sortable = col.sortable !== false && Boolean(col.sortValue)
                const active = sort?.columnId === col.id
                return (
                  <th
                    key={col.id}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      'label-institutional font-semibold whitespace-nowrap',
                      cellPad,
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.hideBelow && hideClass[col.hideBelow],
                    )}
                    aria-sort={active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className={cn(
                          'inline-flex items-center gap-1 transition-colors hover:text-ink-800',
                          col.align === 'right' && 'flex-row-reverse',
                          active && 'text-govt-700',
                        )}
                      >
                        {col.header}
                        {active ? (
                          sort?.direction === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <SlidersHorizontal className="h-2.5 w-2.5 opacity-25" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
              {rowActions ? (
                <th scope="col" className={cn('w-px text-right', cellPad)}>
                  <span className="sr-only">{t('Actions')}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50">
            {paged.map((row) => {
              const key = rowKey(row)
              const isActive = key === activeRowKey
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onRowClick(row)
                          }
                        }
                      : undefined
                  }
                  /* `interactive-surface` puts the row on the platform's one
                     easing curve. A row is a record, not a control, so it
                     changes tint and nothing else - no lift, no scale, nothing
                     that moves a figure while it is being read. */
                  className={cn(
                    'interactive-surface',
                    onRowClick && 'cursor-pointer hover:bg-govt-50/50 focus-visible:bg-govt-50/70',
                    isActive && 'bg-govt-50',
                  )}
                >
                  {rowAccent ? (
                    <td className="w-1 p-0">
                      <div className="flex h-full items-stretch py-1.5 pl-1.5">{rowAccent(row)}</div>
                    </td>
                  ) : null}
                  {selectable ? (
                    <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={t('Select row')}
                        checked={selectedKeys?.includes(key) ?? false}
                        onChange={() => {
                          if (!onSelectionChange) return
                          const current = selectedKeys ?? []
                          onSelectionChange(
                            current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
                          )
                        }}
                        className="h-3.5 w-3.5 rounded-[3px] border-ink-300 text-govt-600"
                      />
                    </td>
                  ) : null}
                  {visibleColumns.map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        'align-middle text-[0.8125rem] text-ink-700',
                        cellPad,
                        col.align === 'right' && 'text-right',
                        col.align === 'center' && 'text-center',
                        col.hideBelow && hideClass[col.hideBelow],
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                  {rowActions ? (
                    <td className={cn('text-right whitespace-nowrap', cellPad)} onClick={(e) => e.stopPropagation()}>
                      {rowActions(row)}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>

        {paged.length === 0 ? <EmptyState title={emptyTitle} detail={emptyDetail} className="m-3" compact /> : null}
      </div>

      {pageSize && sorted.length > pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-3 py-2">
          <p className="numeric text-xs text-ink-500">
            {t('Showing')}{' '}{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of{' '}
            {sorted.length.toLocaleString('en-IN')}
            {filtered.length !== rows.length ? (
              <span className="ml-1 text-ink-400">{t('(filtered from {0})', rows.length.toLocaleString('en-IN'))}</span>
            ) : null}
          </p>
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant="outline"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              icon={<ChevronLeft className="h-3 w-3" />}
            >
              {t('Previous')}
            </Button>
            <Badge tone="neutral" className="mx-1">
              {safePage + 1} / {totalPages}
            </Badge>
            <Button
              size="xs"
              variant="outline"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              iconRight={<ChevronRight className="h-3 w-3" />}
            >
              {t('Next')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
