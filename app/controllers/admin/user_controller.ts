import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import vine from '@vinejs/vine'
import User from '#models/user'
import { roleNames, isRole } from '#config/roles'
import { now, pageNumber, pageSize, searchText } from '#services/input_service'
import settings from '#services/settings_service'
import { invalidField } from '#services/upload_service'

const userValidator = vine.compile(
  vine.object({
    role: vine.enum(roleNames),
    banned: vine.enum(['on']).optional(),
  })
)

export default class UserController {
  async index({ view, request }: HttpContext) {
    const page = pageNumber(request.input('page'))
    const perPage = pageSize(request.input('per_page'))
    const search = searchText(request.input('search'))
    const roleInput = request.input('role')
    const role = isRole(roleInput) ? roleInput : ''

    const query = User.query().orderBy('id', 'desc')
    if (search) {
      const like = `%${search.toLowerCase()}%`
      query.where((q) =>
        q.whereRaw('lower(username) like ?', [like]).orWhereRaw('lower(email) like ?', [like])
      )
    }
    if (role) query.where('role', role)
    const users = await query.paginate(page, perPage)
    users.baseUrl('/admin/kullanicilar')
    users.queryString({ per_page: perPage, search, role })
    return view.render('pages/admin/users/index', {
      title: 'Kullanıcılar',
      users,
      paginator: users,
      perPage,
      search,
      role,
      roleList: settings.allRoles(),
    })
  }

  async edit({ view, params }: HttpContext) {
    const member = await User.findOrFail(params.id)
    return view.render('pages/admin/users/form', {
      title: 'Kullanıcıyı Düzenle',
      member,
      roleLabels: Object.fromEntries(settings.allRoles().map((role) => [role.key, role.label])),
    })
  }

  async update({ request, params, auth, session, response }: HttpContext) {
    const member = await User.findOrFail(params.id)
    const data = await request.validateUsing(userValidator)
    if (member.id === auth.user!.id)
      invalidField('role', 'Kendi rolünüzü veya durumunuzu değiştiremezsiniz.')
    member.role = data.role
    member.bannedAt = data.banned ? member.bannedAt || now() : null
    member.updatedAt = now()
    await member.save()
    if (member.bannedAt)
      await db.from('remember_me_tokens').where('tokenable_id', member.id).delete()
    session.flash('success', 'Kullanıcı güncellendi')
    return response.redirect('/admin/kullanicilar')
  }
}
