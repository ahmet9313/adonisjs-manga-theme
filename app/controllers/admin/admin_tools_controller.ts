import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import adminTools, { logActions, logTargets } from '#config/admin_tools'
import AdminLog from '#models/admin_log'
import { checkFiles } from '#services/file_check_service'
import { pageNumber, searchText } from '#services/input_service'

/** One scan at a time: a second request waits for the running one instead of starting another. */
let runningScan: ReturnType<typeof checkFiles> | null = null

/** Admin → Dosya Denetimi and Etkinlik Kaydı (administrators only). */
export default class AdminToolsController {
  /** The scan runs only on request (`?tara=1`), never when the page is just opened. */
  async files({ view, request }: HttpContext) {
    let report = null
    if (request.input('tara') === '1') {
      runningScan ??= checkFiles().finally(() => (runningScan = null))
      report = await runningScan
    }
    return view.render('pages/admin/file_check', {
      title: 'Dosya Denetimi',
      report,
      timeLimit: Math.round(adminTools.fileCheck.timeLimitMs / 1000),
    })
  }

  /** Activity log with filters: ?user (id), ?action, ?target (type), ?q (summary text). */
  async activity({ view, request }: HttpContext) {
    const page = pageNumber(request.input('page'))
    const perPage = adminTools.log.perPage
    const action = Object.hasOwn(logActions, request.input('action')) ? request.input('action') : ''
    const target = Object.hasOwn(logTargets, request.input('target')) ? request.input('target') : ''
    const rawUser = Number(request.input('user'))
    const userId = Number.isSafeInteger(rawUser) && rawUser > 0 ? rawUser : null
    const search = searchText(request.input('q'))

    const logs = await AdminLog.query()
      .preload('user')
      .if(action, (query) => query.where('action', action))
      .if(target, (query) => query.where('targetType', target))
      .if(userId, (query) => query.where('userId', userId!))
      .if(search, (query) => query.where('summary', 'like', `%${search}%`))
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .paginate(page, perPage)
    logs.baseUrl('/admin/etkinlik')
    logs.queryString({
      ...(action ? { action } : {}),
      ...(target ? { target } : {}),
      ...(userId ? { user: userId } : {}),
      ...(search ? { q: search } : {}),
    })

    // People who appear in the log, for the filter.
    const people = await db
      .from('admin_logs')
      .join('users', 'users.id', 'admin_logs.user_id')
      .distinct('users.id', 'users.username')
      .orderBy('users.username', 'asc')

    return view.render('pages/admin/activity', {
      title: 'Etkinlik Kaydı',
      logs,
      people,
      filters: { action, target, user: userId || '', q: search },
      filtered: Boolean(action || target || userId || search),
      logActions,
      logTargets,
      retentionDays: adminTools.log.retentionDays,
    })
  }
}
