import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Check, ChevronDown, Search } from 'lucide-react'
import { CORPORATIONS_BY_DIVISION, resolveWardCount, type CorporationRef } from '@/config/corporations'
import { useActiveCorporation, useCorporationStore } from '@/stores/corporation.store'
import { formatCompact } from '@/utils/format'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'

/**
 * The active municipal corporation selector.
 *
 * Selecting a corporation here does not filter the interface - it re-deploys
 * it. Every intelligence layer is rebuilt against that corporation's own
 * published reference data before the shell re-renders, which is why the
 * control names what it is doing ("Deployment") rather than presenting itself
 * as a view filter an operator might expect to be able to combine with others.
 *
 * Twenty-nine options is past the point where a native `<select>` is usable,
 * so this is a search-first listbox: type to narrow, arrows to move, Enter to
 * deploy, Escape to abandon. Focus returns to the trigger on close, and the
 * open panel is the only thing that can receive pointer events beneath it.
 */
export function CorporationSelector({ className }: { className?: string }): React.JSX.Element {
  const active = useActiveCorporation()
  const setCorporation = useCorporationStore((s) => s.setCorporation)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  /** Division groups, narrowed by the search term. Empty groups are dropped. */
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (c: CorporationRef): boolean =>
      q.length === 0 ||
      c.name.toLowerCase().includes(q) ||
      c.shortName.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.district.toLowerCase().includes(q) ||
      c.division.toLowerCase().includes(q) ||
      (c.formerName?.toLowerCase().includes(q) ?? false)

    return CORPORATIONS_BY_DIVISION.map((g) => ({
      division: g.division,
      corporations: g.corporations.filter(matches),
    })).filter((g) => g.corporations.length > 0)
  }, [query])

  /** Flattened order, so arrow keys traverse groups without noticing them. */
  const flat = useMemo(() => groups.flatMap((g) => g.corporations), [groups])

  useEffect(() => {
    setHighlight(0)
  }, [query])

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  // Keep the highlighted row in view when the keyboard is driving the list.
  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  function close(): void {
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }

  function choose(id: string): void {
    if (id !== active.id) setCorporation(id)
    close()
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((h) => Math.min(flat.length - 1, h + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setHighlight(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setHighlight(Math.max(0, flat.length - 1))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const target = flat[highlight]
      if (target) choose(target.id)
    }
  }

  let index = -1

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('Active municipal corporation: {0}. Change corporation.', active.name)}
        className="flex h-8 max-w-[13rem] items-center gap-1.5 rounded-md border border-ink-200 bg-surface px-1.5 text-left shadow-xs transition-all hover:border-govt-300 hover:bg-surface-sunken focus:border-govt-400 focus:ring-2 focus:ring-govt-500/20 focus:outline-none sm:px-2"
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-govt-600" aria-hidden />
        {/* Below `sm` the command bar has no room for two lines, so the city
            drops and the corporation's own short name carries the identity. */}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.6875rem] leading-tight font-semibold text-ink-800">
            {active.shortName}
          </span>
          <span className="hidden truncate text-[0.5625rem] leading-tight text-ink-400 sm:block">{active.city}</span>
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-ink-400" aria-hidden />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
          <div
            role="dialog"
            aria-label={t('Select the active municipal corporation')}
            className="animate-in-scale absolute top-full right-0 z-50 mt-1.5 w-[23rem] max-w-[calc(100vw-1.5rem)] rounded-lg border border-ink-100 bg-surface shadow-overlay"
            onKeyDown={onKeyDown}
          >
            <div className="border-b border-ink-100 px-3 py-2.5">
              <p className="label-institutional">{t('Deployment')}</p>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">
                {t('Selecting a corporation rebuilds every intelligence layer against its own published reference data.')}
              </p>
            </div>

            <div className="border-b border-ink-100 p-2">
              <div className="flex h-8 items-center gap-2 rounded-md border border-ink-200 bg-surface-sunken px-2 focus-within:border-govt-400 focus-within:ring-2 focus-within:ring-govt-500/20">
                <Search className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('Search corporation, city or district…')}
                  aria-label={t('Search municipal corporations')}
                  className="min-w-0 flex-1 bg-transparent text-[0.8125rem] text-ink-800 placeholder:text-ink-400 focus:outline-none"
                />
              </div>
            </div>

            <div ref={listRef} role="listbox" aria-label={t('Municipal corporations')} className="scrollbar-slim max-h-[22rem] overflow-y-auto p-1">
              {flat.length === 0 ? (
                <p className="px-2.5 py-6 text-center text-[0.8125rem] text-ink-500">
                  {t('No municipal corporation matches “{0}”.', query)}
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.division} className="mb-1 last:mb-0">
                    <p className="label-institutional px-2.5 py-1.5">{t('{0} Division', group.division)}</p>
                    {group.corporations.map((corp) => {
                      index += 1
                      const rowIndex = index
                      const isActive = corp.id === active.id
                      return (
                        <button
                          key={corp.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          data-index={rowIndex}
                          onClick={() => choose(corp.id)}
                          onMouseEnter={() => setHighlight(rowIndex)}
                          className={cn(
                            'flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors',
                            rowIndex === highlight ? 'bg-govt-50' : 'hover:bg-ink-50',
                          )}
                        >
                          <span className="mt-0.5 w-4 shrink-0">
                            {isActive ? <Check className="h-3.5 w-3.5 text-govt-600" aria-hidden /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-1.5">
                              <span className="truncate text-[0.8125rem] font-medium text-ink-800">{corp.city}</span>
                              <span className="shrink-0 font-mono text-[0.625rem] text-ink-400">{corp.shortName}</span>
                            </span>
                            <span className="block truncate text-[0.625rem] text-ink-500">{corp.name}</span>
                            <span className="numeric mt-0.5 block text-[0.625rem] text-ink-400">
                              {t('{0} residents · {1} {2}{3}{4}', formatCompact(corp.population2011), resolveWardCount(corp), corp.wardTerminology.toLowerCase(), resolveWardCount(corp) === 1 ? '' : 's', corp.budgetCrore !== null ? ` · ₹${formatCompact(corp.budgetCrore)} cr` : '')}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            <p className="border-t border-ink-100 px-3 py-2 text-[0.625rem] leading-relaxed text-ink-400">
              {t('The Brihanmumbai Municipal Corporation deployment. Reference statistics are published figures; operational figures are modelled demonstration data.')}
            </p>
          </div>
        </>
      ) : null}
    </div>
  )
}
