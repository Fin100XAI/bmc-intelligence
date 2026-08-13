import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { ALERTS, INTELLIGENCE_ITEMS, NOTIFICATIONS } from '@/data/intelligence.data'
import { activeIncidents } from '@/data/operations.data'
import { canAccess } from '@/security/access'
import { DOMAIN_LABEL, type Severity } from '@/types/common'
import type { User } from '@/types/organisation'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'

/**
 * The live updates column.
 *
 * Every administration's own site carries one of these — a dated, tagged,
 * continuously moving list of what has just happened, read down the side of
 * the page. It is the surface an officer glances at rather than studies, and
 * its job is to make "is anything new?" answerable without navigating.
 *
 * What it is NOT is a second alerts screen. Each entry is one line of record:
 * when, which department signal, and what happened. Acting on any of them
 * means opening the item, which is a click on the entry.
 *
 * Three properties it has to hold:
 *
 *  - **Only what this principal may see.** Entries are drawn from four live
 *    collections and each is permission-checked with the same engine the rest
 *    of the platform uses, so a ward officer's feed is their ward's.
 *
 *  - **It stops when read.** The scroll pauses on hover and on keyboard focus,
 *    and there is an explicit control. A feed that keeps moving while someone
 *    is trying to read a line is worse than a static list.
 *
 *  - **It respects reduced motion.** `data-motion="reduced"` on the document,
 *    or the OS-level preference, disables the scroll entirely rather than
 *    slowing it.
 */

export type FeedKind = 'alert' | 'incident' | 'intelligence' | 'notice'

export interface FeedEntry {
  id: string
  kind: FeedKind
  at: string
  title: string
  detail?: string
  severity: Severity
  tag: string
  route?: string
}

const KIND_LABEL: Record<FeedKind, string> = {
  alert: 'Alert',
  incident: 'Incident',
  intelligence: 'Signal',
  notice: 'Notice',
}

/** Pixels per animation frame. Slow — this is a ticker, not a scroll. */
const SCROLL_STEP_PX = 0.28

/** How long an entry counts as "new" for the marker. */
const NEW_WINDOW_MS = 6 * 60 * 60 * 1000

function severityTone(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return 'bg-crit-500'
    case 'high':
      return 'bg-warn-500'
    case 'medium':
      return 'bg-gold-500'
    case 'low':
      return 'bg-govt-400'
    default:
      return 'bg-ink-300'
  }
}

/**
 * Merges the four live collections into one dated record.
 *
 * Exported so a page can show a count, or reuse the same reading elsewhere,
 * without a second implementation drifting from this one.
 */
export function buildFeed(user: User | null, now: Date, limit = 40): FeedEntry[] {
  if (!user) return []
  const entries: FeedEntry[] = []

  for (const alert of ALERTS) {
    if (alert.status === 'closed' || alert.status === 'resolved') continue
    if (
      !canAccess(user, 'alert', 'view', {
        wardIds: alert.wardIds,
        departmentId: alert.departmentId,
        classification: alert.classification,
      }).allowed
    )
      continue
    entries.push({
      id: `alert:${alert.id}`,
      kind: 'alert',
      at: alert.createdAt,
      title: alert.title,
      detail: alert.description,
      severity: alert.severity,
      tag: DOMAIN_LABEL[alert.domain],
    })
  }

  for (const incident of activeIncidents()) {
    if (!canAccess(user, 'incident', 'view', { wardId: incident.wardId, classification: incident.classification }).allowed)
      continue
    entries.push({
      id: `incident:${incident.id}`,
      kind: 'incident',
      at: incident.detectedAt,
      title: incident.title,
      detail: incident.description,
      severity: incident.severity,
      tag: incident.type.replace(/-/g, ' '),
    })
  }

  for (const item of INTELLIGENCE_ITEMS) {
    if (item.status === 'resolved' || item.status === 'verified') continue
    if (
      !canAccess(user, 'intelligence', 'view', {
        wardIds: item.wardIds,
        departmentId: item.departmentId,
        classification: item.classification,
        domain: item.domain,
      }).allowed
    )
      continue
    entries.push({
      id: `intel:${item.id}`,
      kind: 'intelligence',
      at: item.createdAt,
      title: item.title,
      detail: item.description,
      severity: item.severity,
      tag: DOMAIN_LABEL[item.domain],
    })
  }

  for (const notice of NOTIFICATIONS) {
    if (notice.recipientRoleIds.length > 0 && !notice.recipientRoleIds.includes(user.roleId)) continue
    entries.push({
      id: `notice:${notice.id}`,
      kind: 'notice',
      at: notice.createdAt,
      title: notice.title,
      detail: notice.body,
      severity: notice.severity,
      tag: KIND_LABEL.notice,
      route: notice.route,
    })
  }

  return entries
    .filter((e) => Date.parse(e.at) <= now.getTime())
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit)
}

function relativeTime(at: string, now: Date): string {
  const diff = now.getTime() - Date.parse(at)
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return t('just now')
  if (minutes < 60) return t('{0}m ago', minutes)
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('{0}h ago', hours)
  return t('{0}d ago', Math.round(hours / 24))
}

export function LiveFeed({
  entries,
  now,
  height = 420,
  onSelect,
}: {
  entries: FeedEntry[]
  now: Date
  /**
   * Scroll-area height. Accepts a CSS length as well as a pixel number, so a
   * caller pinning this panel can bound it against the viewport — a sticky
   * panel taller than the screen can never be read in full.
   */
  height?: number | string
  onSelect?: (entry: FeedEntry) => void
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return true
    if (document.documentElement.dataset.motion === 'reduced') return true
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }, [])

  const running = !paused && !hovered && !reducedMotion && entries.length > 3

  useEffect(() => {
    if (!running) return
    const node = scrollRef.current
    if (!node) return

    let frame = 0
    let carry = 0
    const tick = () => {
      // Accumulated in a float and applied in whole pixels: assigning a
      // fractional scrollTop is rounded away by the browser, which on a
      // sub-pixel step means the feed never moves at all.
      carry += SCROLL_STEP_PX
      if (carry >= 1) {
        const whole = Math.floor(carry)
        carry -= whole
        const atEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 1
        node.scrollTop = atEnd ? 0 : node.scrollTop + whole
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running])

  if (entries.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-[0.75rem] text-ink-400">
        {t('No updates in the current scope.')}
      </p>
    )
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        style={{ height }}
        className="scrollbar-rail overflow-y-auto"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocusCapture={() => setHovered(true)}
        onBlurCapture={() => setHovered(false)}
      >
        <ul className="divide-y divide-ink-100">
          {entries.map((entry) => {
            const isNew = now.getTime() - Date.parse(entry.at) <= NEW_WINDOW_MS
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelect?.(entry)}
                  className="flex w-full gap-2 px-3 py-2 text-left transition-colors hover:bg-govt-50/60 focus-visible:bg-govt-50"
                >
                  {/* Severity is a rule down the left edge rather than a
                      coloured pill: a column of forty pills is a rash, a
                      column of rules is a margin. */}
                  <span aria-hidden className={cn('mt-0.5 w-[3px] shrink-0 self-stretch rounded-full', severityTone(entry.severity))} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[0.5625rem] font-bold tracking-[0.08em] text-govt-700 uppercase">
                        {KIND_LABEL[entry.kind]}
                      </span>
                      <span aria-hidden className="text-ink-300">·</span>
                      <span className="truncate text-[0.5625rem] font-semibold tracking-wide text-ink-500 uppercase">
                        {entry.tag}
                      </span>
                      {isNew ? (
                        <span className="rounded-[2px] bg-crit-500 px-1 py-px text-[0.5rem] font-bold tracking-wide text-white uppercase">
                          {t('New')}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[0.75rem] leading-snug font-semibold text-ink-800">
                      {entry.title}
                    </span>
                    {entry.detail ? (
                      <span className="mt-0.5 line-clamp-2 block text-[0.6875rem] leading-snug text-ink-500">
                        {entry.detail}
                      </span>
                    ) : null}
                    <span className="numeric mt-1 block text-[0.625rem] text-ink-400 tabular-nums">
                      {relativeTime(entry.at, now)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Fade at the foot, so the list reads as continuing rather than cut. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface to-transparent"
      />

      {!reducedMotion && entries.length > 3 ? (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="absolute right-2 bottom-2 flex items-center gap-1 rounded-[2px] border border-ink-200 bg-surface/95 px-1.5 py-0.5 text-[0.625rem] font-medium text-ink-500 shadow-xs transition-colors hover:text-ink-800"
          aria-label={paused ? t('Resume the updates feed') : t('Pause the updates feed')}
        >
          {paused ? <Play className="h-2.5 w-2.5" /> : <Pause className="h-2.5 w-2.5" />}
          {paused ? t('Resume') : t('Pause')}
        </button>
      ) : null}
    </div>
  )
}
