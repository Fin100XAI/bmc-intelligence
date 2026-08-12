import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { onAfterRebuild } from '@/data/runtime'
import type { DateRangeKey, IntelligenceDomain, Severity } from '@/types/common'

/**
 * Interface state only. Zustand holds authentication context, selection
 * context, layout preference and transient workflow UI state - it is never
 * used as a database. Service-derived data lives in TanStack Query.
 */

interface LayoutState {
  sidebarCollapsed: boolean
  /** Mobile / tablet sidebar overlay. */
  sidebarOpen: boolean
  /** Situation Room reduces the shell to maximise the operational workspace. */
  situationMode: boolean
  expandedGroups: string[]
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSituationMode: (on: boolean) => void
  toggleGroup: (id: string) => void
  setExpandedGroups: (ids: string[]) => void
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarOpen: false,
      situationMode: false,
      // Section ids from `NAV_SECTIONS`. The section containing the current
      // route always expands on its own, so this only sets what is open before
      // the operator has navigated anywhere. Keep these ids in step with
      // `src/config/navigation.ts` - a stale id here fails silently, leaving
      // the sidebar collapsed on first load with nothing to explain why.
      expandedGroups: ['command', 'wards-localities'],
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSituationMode: (on) => set({ situationMode: on }),
      toggleGroup: (id) =>
        set((s) => ({
          expandedGroups: s.expandedGroups.includes(id)
            ? s.expandedGroups.filter((g) => g !== id)
            : [...s.expandedGroups, id],
        })),
      setExpandedGroups: (ids) => set({ expandedGroups: ids }),
    }),
    {
      name: 'bmc-mii.layout',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, expandedGroups: s.expandedGroups }),
      /**
       * Bumped whenever the navigation sections are regrouped, because a
       * persisted list of dead ids expands nothing - an operator who had used
       * the platform before would find the sidebar collapsed for no visible
       * reason, while a first-time visitor saw it correctly. Dropping the
       * stored value on a version change costs one expanded section and
       * removes a difference nobody could have diagnosed.
       *
       * v2 followed the retirement of the `city` section; v3 follows the
       * regrouping onto the corporation's departmental structure, which
       * retired `utilities`, `safety`, `citizen`, `council` and `admin`.
       */
      version: 3,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as { sidebarCollapsed?: boolean; expandedGroups?: string[] }
        const sidebarCollapsed = state.sidebarCollapsed ?? false
        if (version >= 3) return { sidebarCollapsed, expandedGroups: state.expandedGroups ?? [] }
        return { sidebarCollapsed, expandedGroups: ['command', 'wards-localities'] }
      },
    },
  ),
)

/* ==========================================================================
   Selection context - the ward / department in effect across the shell
   ========================================================================== */

interface ContextState {
  wardId: string | null
  departmentId: string | null
  setWard: (id: string | null) => void
  setDepartment: (id: string | null) => void
  reset: () => void
}

export const useContextStore = create<ContextState>()(
  persist(
    (set) => ({
      wardId: null,
      departmentId: null,
      // Both writers delegate to the reconcilers below rather than setting
      // this store alone - see the note on `applyWardSelection`.
      setWard: (id) => applyWardSelection(id ? [id] : []),
      setDepartment: (id) => applyDepartmentSelection(id ? [id] : []),
      reset: () => set({ wardId: null, departmentId: null }),
    }),
    { name: 'bmc-mii.context' },
  ),
)

/* ==========================================================================
   Command palette & global overlays
   ========================================================================== */

interface CommandState {
  paletteOpen: boolean
  copilotOpen: boolean
  notificationsOpen: boolean
  searchOpen: boolean
  setPaletteOpen: (open: boolean) => void
  setCopilotOpen: (open: boolean) => void
  setNotificationsOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  closeAll: () => void
}

export const useCommandStore = create<CommandState>((set) => ({
  paletteOpen: false,
  copilotOpen: false,
  notificationsOpen: false,
  searchOpen: false,
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setCopilotOpen: (open) => set({ copilotOpen: open }),
  setNotificationsOpen: (open) => set({ notificationsOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  closeAll: () => set({ paletteOpen: false, copilotOpen: false, notificationsOpen: false, searchOpen: false }),
}))

/* ==========================================================================
   Global filters - persisted so an operator's working set survives navigation
   ========================================================================== */

export interface FilterState {
  dateRange: DateRangeKey
  wardIds: string[]
  departmentIds: string[]
  domains: IntelligenceDomain[]
  severities: Severity[]
  statuses: string[]
  search: string
}

const EMPTY_FILTERS: FilterState = {
  dateRange: '30d',
  wardIds: [],
  departmentIds: [],
  domains: [],
  severities: [],
  statuses: [],
  search: '',
}

interface FilterStore {
  filters: FilterState
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  toggleInFilter: (key: 'wardIds' | 'departmentIds' | 'domains' | 'severities' | 'statuses', value: string) => void
  resetFilters: () => void
  activeCount: () => number
}

export const useFilterStore = create<FilterStore>()(
  persist(
    (set, get) => ({
      filters: EMPTY_FILTERS,
      setFilter: (key, value) => {
        if (key === 'wardIds') return applyWardSelection(value as string[])
        if (key === 'departmentIds') return applyDepartmentSelection(value as string[])
        set((s) => ({ filters: { ...s.filters, [key]: value } }))
      },
      toggleInFilter: (key, value) => {
        // The filter arrays hold narrower string unions; the toggle operates
        // structurally, so widen to string[] for the membership test.
        const current = get().filters[key] as string[]
        const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
        if (key === 'wardIds') return applyWardSelection(next)
        if (key === 'departmentIds') return applyDepartmentSelection(next)
        set((s) => ({ filters: { ...s.filters, [key]: next } as FilterState }))
      },
      resetFilters: () => {
        set({ filters: EMPTY_FILTERS })
        useContextStore.setState({ wardId: null, departmentId: null })
      },
      activeCount: () => {
        const f = get().filters
        return (
          f.wardIds.length +
          f.departmentIds.length +
          f.domains.length +
          f.severities.length +
          f.statuses.length +
          (f.search.trim() ? 1 : 0) +
          (f.dateRange !== '30d' ? 1 : 0)
        )
      },
    }),
    { name: 'bmc-mii.filters' },
  ),
)

/* ==========================================================================
   Selection reconciliation - one ward selection, two stores
   --------------------------------------------------------------------------
   The platform offers an operator two ways to say "show me this ward": the
   ward context selector in the command bar, and the ward panel in a page's
   filter bar. They were two independent pieces of state. The context selector
   wrote `useContextStore.wardId`, which exactly ONE screen in ninety-one ever
   read - so choosing a ward at the top of the shell changed the breadcrumb and
   nothing else, on every other screen in the platform. An operator who narrows
   the interface to a ward and sees city-wide figures underneath has been told
   something untrue about what they are looking at.

   These two functions are the single writer for both stores. Everything that
   can change a ward or department selection routes through them, so the
   command bar, the filter bar and the chips can never disagree.

   `useContextStore` holds a SINGLE ward because it drives a breadcrumb and a
   page's "current ward"; the filter holds a SET because a comparison screen
   may want several. One ward selected means both agree; none or several means
   the context has no single ward to name, and it says so by holding null
   rather than by picking one arbitrarily.
   ========================================================================== */

function applyWardSelection(wardIds: string[]): void {
  useFilterStore.setState((s) => ({ filters: { ...s.filters, wardIds } }))
  useContextStore.setState({ wardId: wardIds.length === 1 ? (wardIds[0] as string) : null })
}

function applyDepartmentSelection(departmentIds: string[]): void {
  useFilterStore.setState((s) => ({ filters: { ...s.filters, departmentIds } }))
  useContextStore.setState({ departmentId: departmentIds.length === 1 ? (departmentIds[0] as string) : null })
}

/* ==========================================================================
   Drawer stack - contextual drilldowns without navigating away
   ========================================================================== */

export type DrawerKind =
  | 'intelligence'
  | 'evidence'
  | 'ward'
  | 'project'
  | 'incident'
  | 'decision'
  | 'security-event'
  | 'ai-explanation'
  | 'action'
  | 'alert'
  | 'graph-node'
  | 'asset'
  | 'contract'

export interface DrawerRequest {
  kind: DrawerKind
  id: string
  /** Optional payload for drawers that need more than an identifier. */
  context?: Record<string, string>
}

interface DrawerState {
  stack: DrawerRequest[]
  open: (request: DrawerRequest) => void
  /** Pushes a drawer on top of the current one (evidence from intelligence). */
  push: (request: DrawerRequest) => void
  close: () => void
  closeAll: () => void
  current: () => DrawerRequest | null
}

export const useDrawerStore = create<DrawerState>((set, get) => ({
  stack: [],
  open: (request) => set({ stack: [request] }),
  push: (request) => set((s) => ({ stack: [...s.stack, request] })),
  close: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  closeAll: () => set({ stack: [] }),
  current: () => get().stack[get().stack.length - 1] ?? null,
}))

/** Convenience hook returning the drawer on top of the stack. */
export function useCurrentDrawer(): DrawerRequest | null {
  const stack = useDrawerStore((s) => s.stack)
  return stack[stack.length - 1] ?? null
}

/* ==========================================================================
   Situation Room mode
   ========================================================================== */

export type SituationMode =
  | 'city-operations'
  | 'monsoon'
  | 'public-health'
  | 'emergency'
  | 'infrastructure'
  | 'major-event'

interface SituationState {
  mode: SituationMode
  selectedIncidentId: string | null
  setMode: (mode: SituationMode) => void
  selectIncident: (id: string | null) => void
}

export const useSituationStore = create<SituationState>((set) => ({
  mode: 'city-operations',
  selectedIncidentId: null,
  setMode: (mode) => set({ mode }),
  selectIncident: (id) => set({ selectedIncidentId: id }),
}))

/* ==========================================================================
   Municipal corporation switch
   ========================================================================== */

/**
 * Selection context, the global filter set, the drawer stack and the selected
 * incident are all expressed in ward, department or record identifiers, and
 * those identifiers belong to exactly one municipal corporation. Carrying
 * "Ward K/W" across a switch to Nagpur would silently filter every surface
 * down to nothing - which reads as an empty city rather than as a stale
 * selection - so all of it is cleared the moment the data layers rebuild.
 */
onAfterRebuild(() => {
  useContextStore.getState().reset()
  useFilterStore.getState().resetFilters()
  useDrawerStore.getState().closeAll()
  useSituationStore.getState().selectIncident(null)
})
