import db from '@adonisjs/lucid/services/db'
import Notification, { type NotificationCategory } from '#models/notification'
import { now } from '#services/input_service'

export const notificationFilters = [
  'all',
  'unread',
  'system',
  'reward',
  'activity',
  'chapter',
] as const
export type NotificationFilter = (typeof notificationFilters)[number]
export const isNotificationFilter = (value: unknown): value is NotificationFilter =>
  typeof value === 'string' && (notificationFilters as readonly string[]).includes(value)

const pageSize = 20
/** Older read notifications beyond this many are pruned when new ones arrive. */
const keepPerUser = 300

const toIso = (value: string) => `${String(value).replace(' ', 'T')}Z`

interface Message {
  title: string
  body?: string
  link?: string | null
}

/** Inbox: system, reward, activity and new-chapter messages for one account. */
class NotificationService {
  private row(userId: number, category: NotificationCategory, message: Message, timestamp: string) {
    return {
      user_id: userId,
      category,
      title: message.title.slice(0, 120),
      body: (message.body ?? '').slice(0, 500),
      link: message.link ?? null,
      read_at: null,
      created_at: timestamp,
    }
  }

  async notify(userId: number, category: NotificationCategory, message: Message) {
    await db.table('notifications').insert(this.row(userId, category, message, now()))
    await this.prune(userId)
  }

  async notifyMany(userIds: number[], category: NotificationCategory, message: Message) {
    const timestamp = now()
    const ids = [...new Set(userIds)]
    for (let index = 0; index < ids.length; index += 200) {
      await db
        .table('notifications')
        .multiInsert(
          ids.slice(index, index + 200).map((id) => this.row(id, category, message, timestamp))
        )
    }
  }

  private async prune(userId: number) {
    const [row] = await db.from('notifications').where('user_id', userId).count('* as total')
    const extra = Number(row.total) - keepPerUser
    if (extra <= 0) return
    const old = await db
      .from('notifications')
      .where('user_id', userId)
      .whereNotNull('read_at')
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .limit(extra)
      .select('id')
    if (old.length)
      await db
        .from('notifications')
        .whereIn(
          'id',
          old.map((item) => item.id)
        )
        .delete()
  }

  private scoped(userId: number, filter: NotificationFilter) {
    const query = Notification.query().where('userId', userId)
    if (filter === 'unread') query.whereNull('readAt')
    else if (filter !== 'all') query.where('category', filter)
    return query
  }

  async list(userId: number, filter: NotificationFilter, page: number) {
    const result = await this.scoped(userId, filter)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .paginate(page, pageSize)
    return {
      items: result.all().map((item) => ({
        id: item.id,
        category: item.category,
        title: item.title,
        body: item.body,
        link: item.link,
        read: Boolean(item.readAt),
        createdAt: toIso(item.createdAt),
      })),
      hasMore: result.hasMorePages,
      unread: await this.unreadCount(userId),
    }
  }

  async unreadCount(userId: number) {
    const [row] = await db
      .from('notifications')
      .where('user_id', userId)
      .whereNull('read_at')
      .count('* as total')
    return Number(row.total)
  }

  async setRead(userId: number, id: number, read: boolean) {
    const changed = await db
      .from('notifications')
      .where({ id, user_id: userId })
      .update({ read_at: read ? now() : null })
    return Number(changed) > 0
  }

  async markAllRead(userId: number) {
    await db
      .from('notifications')
      .where('user_id', userId)
      .whereNull('read_at')
      .update({ read_at: now() })
  }

  async remove(userId: number, id: number) {
    const removed = await db.from('notifications').where({ id, user_id: userId }).delete()
    return Number(removed) > 0
  }

  async removeAll(userId: number, filter: NotificationFilter) {
    const query = db.from('notifications').where('user_id', userId)
    if (filter === 'unread') query.whereNull('read_at')
    else if (filter !== 'all') query.where('category', filter)
    await query.delete()
  }
}

export default new NotificationService()
