import type { HttpContext } from '@adonisjs/core/http'
import notifications, { isNotificationFilter } from '#services/notification_service'
import { pageNumber } from '#services/input_service'

export default class NotificationController {
  async index({ request, auth }: HttpContext) {
    const filter = request.input('filter')
    return notifications.list(
      auth.user!.id,
      isNotificationFilter(filter) ? filter : 'all',
      pageNumber(request.input('page'))
    )
  }

  async read({ params, request, auth, response }: HttpContext) {
    const read = request.input('read') !== '0' && request.input('read') !== false
    if (!(await notifications.setRead(auth.user!.id, Number(params.id), read)))
      return response.notFound({ error: 'Bildirim bulunamadı' })
    return { read, unread: await notifications.unreadCount(auth.user!.id) }
  }

  async readAll({ auth }: HttpContext) {
    await notifications.markAllRead(auth.user!.id)
    return { unread: 0 }
  }

  async destroy({ params, auth, response }: HttpContext) {
    if (!(await notifications.remove(auth.user!.id, Number(params.id))))
      return response.notFound({ error: 'Bildirim bulunamadı' })
    return { unread: await notifications.unreadCount(auth.user!.id) }
  }

  async destroyAll({ request, auth }: HttpContext) {
    const filter = request.input('filter')
    await notifications.removeAll(auth.user!.id, isNotificationFilter(filter) ? filter : 'all')
    return { unread: await notifications.unreadCount(auth.user!.id) }
  }
}
