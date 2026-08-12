import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  CORPORATION_STORAGE_KEY,
  DEFAULT_CORPORATION_ID,
  getActiveCorporationId,
  setActiveCorporation,
  useActiveVersion,
} from '@/data/runtime'
import { CORPORATION_BY_ID, type CorporationRef } from '@/config/corporations'
import { activeCorporation } from '@/config/municipality.config'

/**
 * The active municipal corporation.
 *
 * Switching is not a filter. It rebuilds every data layer in the platform for
 * the selected corporation - geography, wards, departments, officers, finance,
 * operations, intelligence, AI records - resets the in-session store, clears
 * the query cache and re-issues the acting principal's session. All of that is
 * driven by `setActiveCorporation` in `src/data/runtime.ts`; this store is only
 * the persisted selection and the React-facing surface over it.
 *
 * The switch is synchronous by design. Every layer is consistent before React
 * is told anything changed, so no screen can render one corporation's figures
 * against another's ward list.
 */

interface CorporationState {
  corporationId: string
  /** Switches the active corporation and rebuilds the whole dataset. */
  setCorporation: (id: string) => void
}

export const useCorporationStore = create<CorporationState>()(
  persist(
    (set) => ({
      corporationId: getActiveCorporationId(),

      setCorporation: (id) => {
        if (!CORPORATION_BY_ID.has(id)) return
        // Rebuild the data layers BEFORE React re-renders, so the keyed remount
        // in the shell reads a fully consistent dataset.
        setActiveCorporation(id)
        set({ corporationId: id })
      },
    }),
    {
      name: CORPORATION_STORAGE_KEY,
      version: 1,
      partialize: (s) => ({ corporationId: s.corporationId }),
      // Anything that is not a corporation we actually carry resolves to the
      // default, so persisted storage and the runtime can never disagree.
      migrate: (state) => {
        const s = (state ?? {}) as Partial<CorporationState>
        const id = typeof s.corporationId === 'string' && CORPORATION_BY_ID.has(s.corporationId)
          ? s.corporationId
          : DEFAULT_CORPORATION_ID
        return { ...s, corporationId: id } as CorporationState
      },
      onRehydrateStorage: () => (restored) => {
        // `runtime.ts` already read this key directly before any data module
        // evaluated, so this only matters if the two ever diverge.
        if (restored?.corporationId) setActiveCorporation(restored.corporationId)
      },
    },
  ),
)

/**
 * The active corporation's full reference record, re-read on every switch.
 *
 * Subscribing to the runtime version rather than to the store id means this
 * hook updates only once the data layers have finished rebuilding, never
 * between the selection changing and the rebuild completing.
 */
export function useActiveCorporation(): CorporationRef {
  useActiveVersion()
  return activeCorporation
}
