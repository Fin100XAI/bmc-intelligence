import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { NAV_SECTIONS, type NavItem, type NavSection } from '@/config/navigation'
import { canAccess } from '@/security/access'
import { useCurrentUser } from '@/stores/auth.store'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'
import type { SidebarBadges } from './Sidebar'

/**
 * Primary navigation as a horizontal menu bar.
 *
 * Every section the principal may open is named on the bar — none are hidden
 * behind an overflow control, and none are truncated. Sixteen section names do
 * not fit on one line at most widths, so the bar is a single scrolling track
 * driven by arrows at either end. One line of chrome, every section reachable,
 * and nothing renamed to make it fit.
 *
 * A section's destinations open on hover. Three properties carried over from
 * the rail this sits alongside, because losing any of them would be a
 * regression dressed as a redesign:
 *
 *  1. **Permission filtering.** An item the principal cannot open is not
 *     rendered, and a section left with no items disappears entirely. This is
 *     a convenience only — the route guard and every data service re-check the
 *     same permission independently.
 *
 *  2. **Counts stay visible.** The rail badged each item. Here the items are
 *     behind a hover, so each section carries the SUM of its items' counts. An
 *     officer must not have to go looking for the fact that four incidents are
 *     active.
 *
 *  3. **It works without a pointer.** Hover opens a menu; it is never the only
 *     way in. Click toggles, Enter and Space open, arrow keys move along the
 *     bar, Escape closes. A menu that only opens on hover is unusable by
 *     keyboard and unreachable on a touchscreen.
 */

/** Opening delay — long enough that sweeping the pointer across the bar on the
 *  way somewhere else does not flash four menus open behind it. */
const OPEN_DELAY_MS = 90

/** Closing delay — long enough to travel from the trigger down into the panel
 *  diagonally, which is the movement a zero-delay menu punishes. */
const CLOSE_DELAY_MS = 220

interface VisibleSection extends NavSection {
  /** Sum of the section's item badge counts. */
  badgeCount: number
  /** True when any contributing badge is one the platform treats as urgent. */
  urgent: boolean
}

export function MenuBar({ badges }: { badges: SidebarBadges }): React.JSX.Element | null {
  const user = useCurrentUser()
  const location = useLocation()

  const [openId, setOpenId] = useState<string | null>(null)
  const [panelPos, setPanelPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

  const barRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Whether there is anything left to slide to, in each direction. */
  const [overflow, setOverflow] = useState({ left: false, right: false })

  /* --- What this principal may see ---------------------------------- */

  const sections = useMemo<VisibleSection[]>(() => {
    const urgentKeys = new Set(['critical-alerts', 'active-incidents'])
    return NAV_SECTIONS.map((section) => {
      const items = section.items.filter(
        (item) =>
          canAccess(user, item.requires.resource, item.requires.action, item.domain ? { domain: item.domain } : {})
            .allowed,
      )
      let badgeCount = 0
      let urgent = false
      for (const item of items) {
        if (!item.badge) continue
        const count = badges[item.badge]
        if (count <= 0) continue
        badgeCount += count
        if (urgentKeys.has(item.badge)) urgent = true
      }
      return { ...section, items, badgeCount, urgent }
    }).filter((section) => section.items.length > 0)
  }, [user, badges])

  /**
   * The section owning the current route, resolved by the LONGEST matching
   * path rather than the first. The platform-operations pages keep their
   * `/trust/*` paths while being read under Platform & Administration, so a
   * first-match would light up the wrong section every time.
   */
  const activeSectionId = useMemo(() => {
    let best: { id: string; specificity: number } | undefined
    for (const section of sections) {
      for (const item of section.items) {
        if (location.pathname !== item.to && !location.pathname.startsWith(`${item.to}/`)) continue
        if (!best || item.to.length > best.specificity) best = { id: section.id, specificity: item.to.length }
      }
    }
    return best?.id
  }, [sections, location.pathname])

  /* --- Open / close ------------------------------------------------- */

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    openTimer.current = null
    closeTimer.current = null
  }, [])

  const scheduleOpen = useCallback(
    (id: string) => {
      clearTimers()
      // Already showing a menu: switch immediately. Once the operator has
      // committed to reading the bar, a delay between sections is friction,
      // not protection.
      if (openId !== null) {
        setOpenId(id)
        return
      }
      openTimer.current = setTimeout(() => setOpenId(id), OPEN_DELAY_MS)
    },
    [clearTimers, openId],
  )

  const scheduleClose = useCallback(() => {
    clearTimers()
    closeTimer.current = setTimeout(() => setOpenId(null), CLOSE_DELAY_MS)
  }, [clearTimers])

  const closeNow = useCallback(() => {
    clearTimers()
    setOpenId(null)
  }, [clearTimers])

  // Navigating must close the menu, or the panel stays open over the page the
  // operator just asked for.
  useEffect(() => {
    closeNow()
  }, [location.pathname, closeNow])

  useEffect(() => clearTimers, [clearTimers])

  // Escape closes from anywhere; a pointer press outside the bar dismisses it.
  useEffect(() => {
    if (openId === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNow()
    }
    const onPointer = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) closeNow()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [openId, closeNow])

  /** Recomputes whether either arrow has anywhere to go. */
  const syncOverflow = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const max = track.scrollWidth - track.clientWidth
    setOverflow({
      left: track.scrollLeft > 1,
      // A pixel of slack: sub-pixel layout routinely leaves scrollWidth a
      // fraction above clientWidth on a track that is in fact fully visible,
      // which would strand an arrow that does nothing.
      right: max > 1 && track.scrollLeft < max - 1,
    })
  }, [])

  useLayoutEffect(() => {
    syncOverflow()
    const track = trackRef.current
    if (!track || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(syncOverflow)
    observer.observe(track)
    return () => observer.disconnect()
  }, [syncOverflow, sections])

  /** Slides roughly two-thirds of a screenful, so context is never lost. */
  const slide = useCallback(
    (direction: -1 | 1) => {
      const track = trackRef.current
      if (!track) return
      // Any open panel is anchored to a trigger that is about to move out from
      // under it, so it closes rather than being dragged along.
      closeNow()
      track.scrollBy({ left: direction * Math.max(240, track.clientWidth * 0.66), behavior: 'smooth' })
    },
    [closeNow],
  )

  /**
   * Seat the panel flush against the bottom edge of its own trigger.
   *
   * Both axes are measured rather than left to CSS. The track scrolls
   * horizontally, so a trigger's `offsetLeft` — which ignores scrolling — is
   * not where it actually is on screen; subtracting the track's `scrollLeft`
   * is what keeps the panel under the name that opened it after the bar has
   * been slid along.
   *
   * `left` is clamped to the bar so a section near the right edge does not
   * open a panel running off the screen.
   */
  useLayoutEffect(() => {
    if (openId === null) return
    const bar = barRef.current
    const track = trackRef.current
    const panel = panelRef.current
    if (!bar || !track || !panel) return
    const trigger = track.querySelector<HTMLElement>(`[data-section="${openId}"]`)
    if (!trigger) return

    const maxLeft = Math.max(0, bar.clientWidth - panel.offsetWidth)
    setPanelPos({
      left: Math.min(Math.max(0, trigger.offsetLeft - track.scrollLeft), maxLeft),
      top: track.offsetTop + trigger.offsetHeight,
    })
  }, [openId, sections, overflow])

  /** Left/Right along the bar; Down or Enter enters the open panel. */
  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const ids = sections.map((s) => s.id)
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const next = event.key === 'ArrowRight' ? index + 1 : index - 1
      const target = ids[(next + ids.length) % ids.length]
      if (!target) return
      if (openId !== null) setOpenId(target)
      barRef.current?.querySelector<HTMLButtonElement>(`[data-section="${target}"]`)?.focus()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const id = ids[index]
      if (!id) return
      setOpenId(id)
      // Wait for the panel to mount before reaching into it.
      requestAnimationFrame(() => {
        panelRef.current?.querySelector<HTMLAnchorElement>('a')?.focus()
      })
    }
  }

  if (sections.length === 0) return null

  const openSection = sections.find((s) => s.id === openId)

  /* --- Rendering ---------------------------------------------------- */

  const renderItem = (item: NavItem): React.JSX.Element => {
    const count = item.badge ? badges[item.badge] : 0
    const urgent = item.badge === 'critical-alerts' || item.badge === 'active-incidents'
    const Icon = item.icon
    return (
      <li key={item.id}>
        <NavLink
          to={item.to}
          onClick={closeNow}
          className={({ isActive }) =>
            cn(
              'group flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors',
              isActive ? 'bg-govt-50 ring-1 ring-govt-200/60 ring-inset' : 'hover:bg-ink-50',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                aria-hidden
                className={cn(
                  'mt-0.5 h-[1.0625rem] w-[1.0625rem] shrink-0 transition-colors',
                  isActive ? 'text-govt-600' : 'text-rail-muted group-hover:text-rail-text',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'truncate text-[0.8125rem]',
                      isActive ? 'font-semibold text-rail-text' : 'font-medium text-rail-text/90',
                    )}
                  >
                    {item.label}
                  </span>
                  {count > 0 ? (
                    <span
                      className={cn(
                        'numeric shrink-0 rounded-full px-1.5 py-px text-[0.625rem] font-bold tabular-nums',
                        urgent
                          ? 'bg-crit-500 text-white'
                          : item.badge === 'security-open'
                            ? 'bg-warn-100 text-warn-700 ring-1 ring-warn-300 ring-inset'
                            : 'bg-govt-100 text-govt-700 ring-1 ring-govt-200 ring-inset',
                      )}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  ) : null}
                </span>
                {/* The rail could only afford this in a tooltip. A panel has the
                    room, and a one-line description is what makes a hundred
                    destinations navigable by someone still learning them. */}
                <span className="mt-0.5 line-clamp-2 block text-[0.6875rem] leading-snug text-ink-400">
                  {item.description}
                </span>
              </span>
            </>
          )}
        </NavLink>
      </li>
    )
  }

  return (
    <nav
      aria-label={t('Primary navigation')}
      /* The masthead's exact blue — the institutional navy `govt-900` — not a
         second one. The white top bar between them is what separates the two,
         and two near-but-not-equal blues a row apart read as a mistake rather
         than as a hierarchy.
         The hairline is white at low opacity rather than a darker step of any
         ramp, so no third colour enters the band. */
      className="relative z-30 hidden shrink-0 border-b border-white/10 bg-govt-900 lg:block"
    >
      <div className="mx-auto max-w-[1600px] px-3">
        <div ref={barRef} className="relative flex items-center">
          {/* Slide left. Rendered only when there is something to the left, so
              the control never lies about what it will do. */}
          <button
            type="button"
            onClick={() => slide(-1)}
            tabIndex={-1}
            aria-hidden={!overflow.left}
            className={cn(
              'z-10 shrink-0 self-stretch px-1 text-white/60 transition-all hover:bg-white/10 hover:text-white',
              overflow.left ? 'opacity-100' : 'pointer-events-none w-0 overflow-hidden opacity-0',
            )}
            aria-label={t('Scroll the menu left')}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* The single-line track. Scrollable by wheel, trackpad, touch and
              the arrows; its own scrollbar is suppressed because a horizontal
              bar under a navigation strip reads as a rendering fault. */}
          <div
            ref={trackRef}
            onScroll={syncOverflow}
            className="scrollbar-none min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
          >
            <div className="flex w-max items-center gap-0.5 py-1.5">
              {sections.map((section, index) => {
            const isOpen = openId === section.id
            const isActive = section.id === activeSectionId
            return (
              <button
                key={section.id}
                type="button"
                data-section={section.id}
                aria-haspopup="true"
                aria-expanded={isOpen}
                onPointerEnter={() => scheduleOpen(section.id)}
                onPointerLeave={scheduleClose}
                onClick={() => (isOpen ? closeNow() : setOpenId(section.id))}
                onKeyDown={(event) => onTriggerKeyDown(event, index)}
                className={cn(
                  'relative flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.78125rem] whitespace-nowrap',
                  'transition-colors duration-150 ease-[var(--ease-calm)]',
                  // Light-on-dark: the selected state is a lift in the surface
                  // rather than a colour swap, which is what keeps sixteen
                  // names legible on one navy band.
                  isActive || isOpen
                    ? 'bg-white/15 font-semibold text-white'
                    : 'font-medium text-white/80 hover:bg-white/10 hover:text-white',
                )}
              >
                <span>{section.label}</span>

                {section.badgeCount > 0 ? (
                  <span
                    className={cn(
                      'numeric rounded-full px-1.5 py-px text-[0.625rem] font-bold tabular-nums',
                      // Critical keeps its own red — it has to out-shout the
                      // band. Everything else is a translucent white chip,
                      // because a pale-blue pill on navy is a smudge.
                      section.urgent
                        ? 'bg-crit-500 text-white shadow-[0_1px_4px_-1px_rgb(239_68_68/0.55)]'
                        : 'bg-white/20 text-white ring-1 ring-white/25 ring-inset',
                    )}
                  >
                    {section.badgeCount > 99 ? '99+' : section.badgeCount}
                  </span>
                ) : null}

                <ChevronDown
                  aria-hidden
                  className={cn(
                    'h-3 w-3 text-white/55 transition-transform duration-150',
                    isOpen && 'rotate-180',
                  )}
                />

                {/* The active-section marker, in the masthead's gold. Always
                    mounted and scaled on the X axis, so navigating slides the
                    accent along the bar rather than blinking it out and back in
                    somewhere else. Gold rather than blue because a blue accent
                    on a blue band states nothing. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-1.5 bottom-0 h-[2px] rounded-full bg-gradient-to-r from-gold-400 to-gold-600',
                    'origin-center transition-transform duration-200 ease-[var(--ease-calm)]',
                    isActive ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Slide right. */}
          <button
            type="button"
            onClick={() => slide(1)}
            tabIndex={-1}
            aria-hidden={!overflow.right}
            className={cn(
              'z-10 shrink-0 self-stretch px-1 text-white/60 transition-all hover:bg-white/10 hover:text-white',
              overflow.right ? 'opacity-100' : 'pointer-events-none w-0 overflow-hidden opacity-0',
            )}
            aria-label={t('Scroll the menu right')}
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* The open section's destinations, seated flush against the bottom
              edge of the section name that opened them.

              A sibling of the track rather than a child of it: the track is an
              `overflow-x-auto` box, and a panel inside one is clipped to it —
              the menu would open and then be sliced off at the bar's edge. */}
          {openSection ? (
            <div
              ref={panelRef}
              onPointerEnter={clearTimers}
              onPointerLeave={scheduleClose}
              style={{ left: panelPos.left, top: panelPos.top }}
              className={cn(
                'animate-in-fade absolute z-40 max-h-[70vh] overflow-y-auto',
                'rounded-b-xl border border-t-0 border-ink-100 bg-surface p-2 shadow-drawer',
              )}
            >
              <p className="px-2 pt-1 pb-1.5 text-[0.625rem] font-bold tracking-[0.08em] text-google-blue-700 uppercase">
                {openSection.label}
              </p>
              {/* Two columns once a section carries more than five destinations,
                  so the tallest sections do not run off a laptop screen. */}
              <ul
                className={cn(
                  'grid gap-0.5',
                  openSection.items.length > 5 ? 'w-[38rem] grid-cols-2' : 'w-[19rem] grid-cols-1',
                )}
              >
                {openSection.items.map(renderItem)}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  )
}
