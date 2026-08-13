import { useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { municipality } from '@/config/municipality.config'
import { NAV_SECTIONS, type NavItem } from '@/config/navigation'
import { canAccess } from '@/security/access'
import { useCurrentUser } from '@/stores/auth.store'
import { useLayoutStore } from '@/stores/ui.store'
import { cn } from '@/utils/cn'
import { Tooltip } from '@/components/ui/overlays'
import { t } from '@/i18n'

export interface SidebarBadges {
  'critical-alerts': number
  'pending-decisions': number
  'active-incidents': number
  'ai-pending': number
  'security-open': number
}

/**
 * Primary navigation - the command rail.
 *
 * A white surface separated from the workspace by a hairline and a soft
 * shadow: navigation reads as black ink on paper, and colour is spent only on
 * the active item and the counts that demand attention.
 *
 * Items are hidden where the principal does not hold the permission, but that
 * is a convenience only - the route guard and every data service re-evaluate
 * the same permission independently.
 */
export function Sidebar({
  badges,
  desktop = true,
}: {
  badges: SidebarBadges
  /**
   * Whether to render the pinned desktop rail.
   *
   * `false` leaves only the mobile overlay, which is how the shell uses this
   * component now that `MenuBar` carries primary navigation on wide screens.
   * The overlay stays here rather than being duplicated into the bar: a
   * horizontal menu of sixteen sections is unusable on a phone, and a vertical
   * rail behind a hamburger is already the right answer at that width.
   */
  desktop?: boolean
}): React.JSX.Element {
  const user = useCurrentUser()
  const location = useLocation()
  const collapsed = useLayoutStore((s) => s.sidebarCollapsed)
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen)
  const setSidebarOpen = useLayoutStore((s) => s.setSidebarOpen)
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar)
  const expandedGroups = useLayoutStore((s) => s.expandedGroups)
  const toggleGroup = useLayoutStore((s) => s.toggleGroup)

  const sections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            canAccess(user, item.requires.resource, item.requires.action, item.domain ? { domain: item.domain } : {})
              .allowed,
        ),
      })).filter((section) => section.items.length > 0),
    [user],
  )

  // The section containing the active route is always treated as expanded.
  //
  // Resolved by the longest matching path, never merely the first: the
  // platform operations pages keep their `/trust/*` paths but are read under
  // Platform & Administration, so a first-match would expand Trust Centre and
  // leave the item the operator just navigated to hidden inside a group that
  // stayed shut.
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

  const renderItem = (item: NavItem): React.JSX.Element => {
    const badgeCount = item.badge ? badges[item.badge] : 0
    const Icon = item.icon
    const urgent = item.badge === 'critical-alerts' || item.badge === 'active-incidents'

    const link = (
      <NavLink
        to={item.to}
        onClick={() => setSidebarOpen(false)}
        className={({ isActive }) =>
          cn(
            'group relative flex items-center gap-2.5 rounded-lg py-[0.4375rem] text-[0.8125rem] transition-all duration-200 ease-[var(--ease-calm)]',
            collapsed ? 'justify-center px-0' : 'px-2.5',
            isActive
              ? 'bg-govt-50 font-semibold text-rail-text ring-1 ring-govt-200/60 ring-inset'
              : 'text-rail-text/90 hover:bg-ink-50 hover:text-rail-text',
          )
        }
      >
        {({ isActive }) => (
          <>
            {/* The active marker is always mounted and scales on the vertical
                axis, so navigating slides the rail's accent from one item to
                the next instead of blinking it out and back in. Mounting it
                conditionally would give the transition nothing to animate
                from. */}
            <span
              aria-hidden
              className={cn(
                'absolute top-1/2 -left-1.5 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-govt-500 to-intel-500',
                'origin-center transition-transform duration-200 ease-[var(--ease-calm)]',
                isActive
                  ? 'scale-y-100 shadow-[0_0_8px_-1px_rgb(47_107_239/0.45)]'
                  : 'scale-y-0',
              )}
            />
            <Icon
              className={cn(
                'h-[1.0625rem] w-[1.0625rem] shrink-0 transition-colors',
                isActive ? 'text-govt-600' : 'text-rail-muted group-hover:text-rail-text',
              )}
              aria-hidden
            />
            {!collapsed ? (
              <>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {badgeCount > 0 ? (
                  <span
                    className={cn(
                      'numeric shrink-0 rounded-full px-1.5 py-px text-[0.625rem] font-bold tabular-nums',
                      urgent
                        ? 'bg-crit-500 text-white shadow-[0_1px_4px_-1px_rgb(239_68_68/0.55)]'
                        : item.badge === 'security-open'
                          ? 'bg-warn-100 text-warn-700 ring-1 ring-warn-300 ring-inset'
                          : 'bg-govt-100 text-govt-700 ring-1 ring-govt-200 ring-inset',
                    )}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                ) : null}
              </>
            ) : badgeCount > 0 ? (
              <span
                aria-hidden
                className={cn(
                  'absolute top-1 right-1 h-1.5 w-1.5 rounded-full',
                  urgent ? 'animate-sheen bg-crit-500' : 'bg-govt-500',
                )}
              />
            ) : null}
          </>
        )}
      </NavLink>
    )

    if (collapsed) {
      return (
        <li key={item.id}>
          <Tooltip
            side="right"
            content={
              <span>
                <span className="font-semibold">{item.label}</span>
                <span className="mt-0.5 block opacity-75">{item.description}</span>
              </span>
            }
          >
            {link}
          </Tooltip>
        </li>
      )
    }

    return <li key={item.id}>{link}</li>
  }

  const content = (
    <nav
      aria-label={t('Primary navigation')}
      className={cn(
        'rail-surface relative flex h-full flex-col shadow-rail transition-[width] duration-300',
        collapsed ? 'w-[4.25rem]' : 'w-[17rem]',
      )}
    >
      {/* Hairline separating the rail from the workspace. */}
      <span aria-hidden className="absolute inset-y-0 right-0 w-px bg-ink-100" />

      {/* Brand -------------------------------------------------------- */}
      <div className="relative flex h-14 shrink-0 items-center gap-2.5 border-b border-ink-100 px-3">
        {/* The mark is the photograph the Maha AI site serves on this
            project's card - the corporation headquarters - carried in at its
            published size rather than re-cropped, so the workspace and the
            site cannot drift apart at the next edit to either.

            It is a photograph rather than a flat glyph, which changes two
            things. It is cropped with `object-cover` so the box can never
            stretch it, and it carries a hairline ring: a photograph laid
            directly on the near-white rail has no edge of its own and reads
            as a smudge without one. The ring is the frame, not decoration -
            which is also why the glyph's coloured glow is gone, since an
            opaque photograph turns it into a halo bleeding past the edge. */}
        <img
          src={municipality.branding.markPath}
          alt=""
          aria-hidden
          className="h-9 w-9 shrink-0 rounded-[0.6rem] object-cover shadow-xs ring-1 ring-black/10"
        />
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            {/* The platform's own institutional identity, carried from the
                deployment branding so every corporation renders the same one.
                Allowed to wrap rather than truncate: a name clipped to
                "BMC Intelligence Infrastr…" on the one surface that is
                always on screen reads as a layout fault, not as a brand. */}
            <p className="text-[0.75rem] leading-[1.15] font-bold text-rail-text">
              {municipality.branding.productFamily}
            </p>
            {/* Which corporation this deployment is serving. The rail is the
                one surface always on screen, so it is where an operator should
                be able to confirm it without opening anything. */}
            <p className="mt-0.5 truncate text-[0.625rem] leading-tight text-rail-muted">
              {municipality.municipalityName}
            </p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="ml-auto rounded-md p-1 text-rail-muted transition-colors hover:bg-ink-100 hover:text-rail-text lg:hidden"
          aria-label={t('Close navigation')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Sections ----------------------------------------------------- */}
      <div className="scrollbar-rail relative flex-1 overflow-y-auto px-2.5 py-3">
        {sections.map((section) => {
          const isActiveSection = section.id === activeSectionId
          const isExpanded = expandedGroups.includes(section.id) || isActiveSection
          return (
            <div key={section.id} className="mb-1.5">
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(section.id)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-ink-50"
                >
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 shrink-0 transition-transform duration-200',
                      isActiveSection ? 'text-google-blue-700' : 'text-google-blue-500',
                      !isExpanded && '-rotate-90',
                    )}
                    aria-hidden
                  />
                  {/* Section headings carry the rail's structure, so they are
                      set larger than a conventional eyebrow label. The letter
                      spacing is pulled in from the usual uppercase tracking to
                      pay for the extra size, and the label wraps rather than
                      truncating - "Strategic Urban Intelligence" is the longest
                      heading here and must read in full. */}
                  <span
                    className={cn(
                      'flex-1 text-[0.75rem] leading-tight font-bold tracking-[0.07em] uppercase transition-colors',
                      isActiveSection ? 'text-google-blue-800' : 'text-google-blue-700',
                    )}
                  >
                    {section.label}
                  </span>
                </button>
              ) : (
                <div className="my-2.5 h-px bg-ink-100" aria-hidden />
              )}
              {isExpanded || collapsed ? (
                <ul className={cn('space-y-0.5', !collapsed && 'mt-0.5 pl-2.5')}>{section.items.map(renderItem)}</ul>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Collapse control --------------------------------------------- */}
      <div className="relative hidden shrink-0 border-t border-ink-100 p-2 lg:block">
        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-rail-muted transition-colors hover:bg-ink-50 hover:text-rail-text',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed ? <span>{t('Collapse')}</span> : null}
        </button>
      </div>
    </nav>
  )

  return (
    <>
      {/* Desktop - pinned to the viewport; only the workspace scrolls. */}
      {desktop ? (
        <div className="sticky top-0 hidden h-screen shrink-0 self-start lg:block">{content}</div>
      ) : null}

      {/* Mobile / tablet overlay */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="animate-in-fade absolute inset-0 bg-ink-900/50 backdrop-blur-[2px]"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
          <div className="animate-in-fade relative h-full w-[17rem] shadow-drawer">{content}</div>
        </div>
      ) : null}
    </>
  )
}
