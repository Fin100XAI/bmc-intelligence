import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * src/stores/onboarding.store.ts
 *
 * Tracks which guided-narrative flows (currently just the Commissioner
 * Cockpit's opening briefing) a browser has already dismissed, so a returning
 * visitor isn't shown the same walkthrough on every visit. Same
 * `zustand/persist` pattern as `auth.store.ts` - only the dismissal flag is
 * persisted, nothing that describes what was in the briefing itself, so this
 * stays correct across a corporation switch or a content change.
 */

export type OnboardingFlowId = 'cockpit-briefing'

interface OnboardingState {
  dismissed: Partial<Record<OnboardingFlowId, boolean>>
  dismiss: (flow: OnboardingFlowId) => void
  replay: (flow: OnboardingFlowId) => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      dismissed: {},
      dismiss: (flow) => set((s) => ({ dismissed: { ...s.dismissed, [flow]: true } })),
      replay: (flow) => set((s) => ({ dismissed: { ...s.dismissed, [flow]: false } })),
    }),
    { name: 'bmc-mii.onboarding' },
  ),
)

export function useIsFlowDismissed(flow: OnboardingFlowId): boolean {
  return useOnboardingStore((s) => Boolean(s.dismissed[flow]))
}
