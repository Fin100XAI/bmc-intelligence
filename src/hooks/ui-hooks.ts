import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Debounces a rapidly changing value - used by search inputs. */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

/** Reads a media query, defaulting to the desktop assumption during SSR. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const mql = window.matchMedia(query)
    const onChange = (e: MediaQueryListEvent): void => setMatches(e.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/**
 * Binds a piece of page state to a query-string parameter so a screen can be
 * shared with a colleague and reopen in exactly the same context.
 */
export function useQueryParamState(
  key: string,
  fallback = '',
): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) ?? fallback

  const setValue = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const updated = new URLSearchParams(prev)
          if (next) updated.set(key, next)
          else updated.delete(key)
          return updated
        },
        { replace: true },
      )
    },
    [key, setParams],
  )

  return [value, setValue]
}

/** Multi-selection state with a bounded maximum - used by ward comparison. */
export function useBoundedSelection(
  initial: string[] = [],
  max = 4,
): {
  selected: string[]
  toggle: (id: string) => void
  clear: () => void
  isSelected: (id: string) => boolean
  atLimit: boolean
} {
  const [selected, setSelected] = useState<string[]>(initial)

  const toggle = useCallback(
    (id: string) => {
      setSelected((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id)
        if (prev.length >= max) return [...prev.slice(1), id]
        return [...prev, id]
      })
    },
    [max],
  )

  return useMemo(
    () => ({
      selected,
      toggle,
      clear: () => setSelected([]),
      isSelected: (id: string) => selected.includes(id),
      atLimit: selected.length >= max,
    }),
    [selected, toggle, max],
  )
}

/**
 * Session-scoped activity log. Workflow transitions performed in a screen are
 * recorded here so an operator can see exactly what they have done, and the
 * same entries are written to the audit trail by the service layer.
 */
export interface ActivityEntry {
  id: string
  at: string
  actor: string
  action: string
  detail: string
  reason?: string
}

export function useActivityLog(actor: string): {
  entries: ActivityEntry[]
  record: (action: string, detail: string, reason?: string) => void
  clear: () => void
} {
  const [entries, setEntries] = useState<ActivityEntry[]>([])

  const record = useCallback(
    (action: string, detail: string, reason?: string) => {
      setEntries((prev) => [
        {
          id: `act-${prev.length + 1}-${action}`,
          at: new Date().toISOString(),
          actor,
          action,
          detail,
          reason,
        },
        ...prev,
      ])
    },
    [actor],
  )

  return { entries, record, clear: () => setEntries([]) }
}
