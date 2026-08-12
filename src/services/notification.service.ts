import type { NotificationItem } from '@/types/intelligence'
import type { User } from '@/types/organisation'
import { ServiceError, deepClone, recordAudit, simulateLatency } from './client'
import { emitChange, getCollection, setCollection } from './store'
import { t } from '@/i18n'

/**
 * src/services/notification.service.ts
 *
 * In-app notifications, routed by `recipientRoleIds` rather than by
 * individual user - every officer holding a given role sees the same
 * notification, matching how `NOTIFICATIONS` is seeded in
 * `src/data/intelligence.data.ts`.
 */

function visibleToUser(user: User, notification: NotificationItem): boolean {
  return notification.tenantId === user.tenantId && notification.recipientRoleIds.includes(user.roleId)
}

async function list(user: User | null): Promise<NotificationItem[]> {
  await simulateLatency('notification.list')
  if (!user) return []
  const visible = getCollection('notifications').filter((n) => visibleToUser(user, n))
  const sorted = [...visible].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return deepClone(sorted)
}

async function markRead(user: User | null, id: string): Promise<NotificationItem> {
  await simulateLatency(`notification.markRead:${id}`)
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const notification = getCollection('notifications').find((n) => n.id === id && n.tenantId === user.tenantId)
  if (!notification) throw new ServiceError('not-found', `Notification "${id}" was not found.`)
  if (!visibleToUser(user, notification)) {
    throw new ServiceError('forbidden', 'This notification is not addressed to your role.')
  }
  const updated: NotificationItem = { ...notification, read: true }
  setCollection('notifications', getCollection('notifications').map((n) => (n.id === id ? updated : n)))
  recordAudit(user, {
    action: 'status-change',
    resourceType: 'Notification',
    resourceId: notification.id,
    resourceLabel: notification.title,
    classification: 'internal',
    outcome: 'success',
    detail: t('Marked read.'),
  })
  emitChange()
  return deepClone(updated)
}

async function markAllRead(user: User | null): Promise<number> {
  await simulateLatency('notification.markAllRead')
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  let count = 0
  const updated = getCollection('notifications').map((n) => {
    if (visibleToUser(user, n) && !n.read) {
      count += 1
      return { ...n, read: true }
    }
    return n
  })
  if (count > 0) {
    setCollection('notifications', updated)
    recordAudit(user, {
      action: 'status-change',
      resourceType: 'Notification',
      resourceId: 'all',
      resourceLabel: 'All notifications',
      classification: 'internal',
      outcome: 'success',
      detail: t('{0} notification(s) marked read.', count),
    })
    emitChange()
  }
  return count
}

async function unreadCount(user: User | null): Promise<number> {
  await simulateLatency('notification.unreadCount')
  if (!user) return 0
  return getCollection('notifications').filter((n) => visibleToUser(user, n) && !n.read).length
}

export const notificationService = {
  list,
  markRead,
  markAllRead,
  unreadCount,
}
