import { create } from 'zustand'

/**
 * The page-specific tail of the shell's global context line.
 *
 * `ContextBar` (in `Topbar`) renders one continuous trail — product, module,
 * ward — the same way every reference platform in this programme does it.
 * The page itself only knows the last leg of that trail (its section and its
 * own name); `PageHeader` reports it here instead of drawing a second,
 * separate breadcrumb bar on the page, which read as two disconnected trails
 * stacked on top of one another rather than one.
 */
export interface BreadcrumbCrumb {
  label: string
  to?: string
}

interface BreadcrumbState {
  trail: BreadcrumbCrumb[]
  set: (trail: BreadcrumbCrumb[]) => void
}

export const useBreadcrumbStore = create<BreadcrumbState>()((set) => ({
  trail: [],
  set: (trail) => set({ trail }),
}))
