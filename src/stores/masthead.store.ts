import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * What the shell's masthead should say for the screen currently open.
 *
 * The masthead is chrome — it sits above the top bar and is rendered once, by
 * the shell — but its wording is the page's business. A page knows it is "the
 * city's operational position"; the router only knows it is `/command/executive`.
 * So the shell renders, and the page states.
 *
 * A page that says nothing gets the navigation entry's own label and
 * description, which every route already carries. That fallback is why this is
 * an override rather than a requirement: no screen has to opt in for the
 * masthead to be correct, and one that wants a fuller reading can say so.
 */

interface MastheadState {
  title: string | null
  standfirst: string | null
  set: (value: { title?: string; standfirst?: string } | null) => void
}

export const useMastheadStore = create<MastheadState>()((set) => ({
  title: null,
  standfirst: null,
  set: (value) =>
    set(value === null ? { title: null, standfirst: null } : { title: value.title ?? null, standfirst: value.standfirst ?? null }),
}))

/**
 * Declares this screen's masthead wording for as long as it is mounted.
 *
 * Cleared on unmount so a page that sets nothing cannot inherit the previous
 * screen's heading — which is the failure mode that makes a shared masthead
 * worse than no masthead: a correct-looking title describing the wrong page.
 */
export function usePageMasthead(title: string, standfirst?: string): void {
  const set = useMastheadStore((s) => s.set)
  useEffect(() => {
    set({ title, standfirst })
    return () => set(null)
  }, [set, title, standfirst])
}
