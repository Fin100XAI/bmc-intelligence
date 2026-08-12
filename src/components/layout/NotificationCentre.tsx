import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellOff, CheckCheck, SlidersHorizontal } from 'lucide-react'
import { NOTIFICATION_TYPE_LABEL, type NotificationItem, type NotificationType } from '@/types/intelligence'
import { NOTIFICATIONS } from '@/data/intelligence.data'
import { ROUTES } from '@/config/navigation'
import { useCurrentUser } from '@/stores/auth.store'
import { useCommandStore } from '@/stores/ui.store'
import { severitiesAtOrAbove, usePreferencesStore } from '@/stores/preferences.store'
import { formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import { Badge, SeverityBadge } from '@/components/ui/badges'
import { Button } from '@/components/ui/primitives'
import { EmptyState } from '@/components/ui/states'
import { Drawer, Tabs } from '@/components/ui/overlays'
import { t } from '@/i18n'

const TYPE_TONE: Record<NotificationType, 'critical' | 'warn' | 'info' | 'intel' | 'neutral'> = {
  'critical-alert': 'critical',
  escalation: 'warn',
  'decision-required': 'info',
  'sla-warning': 'warn',
  assignment: 'neutral',
  'ai-recommendation': 'intel',
  'security-event': 'critical',
}

/**
 * Notification centre. Notifications are addressed by role, so an operator
 * only sees what their institutional position makes them accountable for.
 *
 * On top of that institutional routing sits the operator's own filter — a
 * severity floor and a set of muted types, both set in Settings. The
 * filter is presentational and reversible: anything it withholds is counted
 * and named in the drawer, never silently dropped, because an operator who
 * cannot see that they filtered something out will misread an empty list as an
 * absence of events.
 */
export function NotificationCentre(): React.JSX.Element {
  const open = useCommandStore((s) => s.notificationsOpen)
  const setOpen = useCommandStore((s) => s.setNotificationsOpen)
  const user = useCurrentUser()
  const notificationFloor = usePreferencesStore((s) => s.notificationFloor)
  const mutedTypes = usePreferencesStore((s) => s.mutedNotificationTypes)
  const [readIds, setReadIds] = useState<string[]>(() => NOTIFICATIONS.filter((n) => n.read).map((n) => n.id))
  const [tab, setTab] = useState<'unread' | 'all'>('unread')

  const addressed = useMemo<NotificationItem[]>(() => {
    if (!user) return []
    return NOTIFICATIONS.filter((n) => n.recipientRoleIds.includes(user.roleId)).map((n) => ({
      ...n,
      read: readIds.includes(n.id),
    }))
  }, [user, readIds])

  const relevant = useMemo(() => {
    const allowedSeverities = severitiesAtOrAbove(notificationFloor)
    return addressed.filter((n) => allowedSeverities.includes(n.severity) && !mutedTypes.includes(n.type))
  }, [addressed, notificationFloor, mutedTypes])

  const withheldByPreference = addressed.length - relevant.length
  const unread = relevant.filter((n) => !n.read)
  const shown = tab === 'unread' ? unread : relevant

  const markRead = (id: string): void => setReadIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const markAllRead = (): void => setReadIds(relevant.map((n) => n.id))

  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      title={t('Notifications')}
      eyebrow={t('Addressed to your role')}
      description={t('Notifications are routed by institutional accountability, not broadcast to every user.')}
      width="sm"
      tabs={
        <Tabs
          items={[
            { id: 'unread', label: t('Unread'), count: unread.length },
            { id: 'all', label: t('All'), count: relevant.length },
          ]}
          value={tab}
          onChange={(id) => setTab(id as 'unread' | 'all')}
          ariaLabel="Notification filter"
        />
      }
      footer={
        <div className="flex w-full items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            disabled={unread.length === 0}
            icon={<CheckCheck className="h-3.5 w-3.5" />}
          >
            {t('Mark all as read')}
          </Button>
          <div className="flex-1" />
          <Link
            to={ROUTES.settings}
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 text-[0.6875rem] font-medium text-ink-500 transition-colors hover:text-govt-700"
          >
            <SlidersHorizontal className="h-3 w-3" />
            {t('Notification preferences')}
          </Link>
        </div>
      }
    >
      {withheldByPreference > 0 ? (
        <div className="mb-2.5 rounded-md border border-ink-100 bg-surface-sunken px-3 py-2 text-[0.6875rem] leading-relaxed text-ink-600">
          <span className="font-medium text-ink-800">
            {t('{0} notification{1} hidden by your own filter.', withheldByPreference, withheldByPreference === 1 ? '' : 's')}
          </span>{' '}
          {t('Your severity floor and muted types are a personal view setting; they do not change who the platform holds accountable for an item.')}{' '}
          <Link to={ROUTES.settings} onClick={() => setOpen(false)} className="font-medium text-govt-600 hover:text-govt-800">
            {t('Adjust in Settings')}
          </Link>
          .
        </div>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          title={tab === 'unread' ? 'No unread notifications' : 'No notifications'}
          detail="Notifications appear here when an item requires your attention, decision or acknowledgement."
          icon={<BellOff className="h-4 w-4" />}
          compact
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((n) => (
            <li key={n.id}>
              <div
                className={cn(
                  'rounded-lg border p-3 transition-colors',
                  n.read ? 'border-ink-100 bg-surface' : 'border-govt-200 bg-govt-50/40',
                )}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={TYPE_TONE[n.type]}>{NOTIFICATION_TYPE_LABEL[n.type]}</Badge>
                  <SeverityBadge severity={n.severity} withDot={false} />
                  <div className="flex-1" />
                  <span className="text-[0.625rem] text-ink-400">{formatRelative(n.createdAt)}</span>
                </div>
                <p className="mt-2 text-[0.8125rem] leading-snug font-semibold text-ink-900">{n.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">{n.body}</p>
                <div className="mt-2.5 flex items-center gap-2 border-t border-ink-100 pt-2">
                  {n.route ? (
                    <Link
                      to={n.route}
                      onClick={() => {
                        markRead(n.id)
                        setOpen(false)
                      }}
                      className="text-[0.6875rem] font-medium text-govt-600 hover:text-govt-800"
                    >
                      {t('Open →')}
                    </Link>
                  ) : null}
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className="text-[0.6875rem] text-ink-400 transition-colors hover:text-ink-700"
                  >
                    {n.read ? 'Mark unread' : 'Mark read'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  )
}

/**
 * Unread count for the topbar badge — filtered to the acting role, then to the
 * operator's own severity floor and muted types, so the badge agrees with what
 * the drawer will actually show when it is opened.
 */
export function useUnreadNotificationCount(): number {
  const user = useCurrentUser()
  const notificationFloor = usePreferencesStore((s) => s.notificationFloor)
  const mutedTypes = usePreferencesStore((s) => s.mutedNotificationTypes)
  if (!user) return 0
  const allowedSeverities = severitiesAtOrAbove(notificationFloor)
  return NOTIFICATIONS.filter(
    (n) =>
      !n.read &&
      n.recipientRoleIds.includes(user.roleId) &&
      allowedSeverities.includes(n.severity) &&
      !mutedTypes.includes(n.type),
  ).length
}
