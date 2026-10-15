import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'
import { isRole, permissions, roleNames, roles } from '#config/roles'
import User from '#models/user'
import settings from '#services/settings_service'

const roleValidator = vine.compile(
  vine.object({
    label: vine.string().trim().minLength(2).maxLength(24),
    color: vine
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/),
  })
)

export default class RoleController {
  async index({ view, request }: HttpContext) {
    const counts = await db.from('users').select('role').count('* as total').groupBy('role')
    const total = new Map(counts.map((row) => [row.role as string, Number(row.total)]))
    const list = settings.allRoles().map((role) => ({ ...role, members: total.get(role.key) || 0 }))

    const input = request.input('rol')
    const selected = list.find((role) => role.key === (isRole(input) ? input : 'admin'))!
    const members = await User.query().where('role', selected.key).orderBy('id', 'desc').limit(12)
    return view.render('pages/admin/roles/index', {
      title: 'Roller',
      roles: list,
      selected,
      defaults: roles[selected.key],
      members,
      permissions: permissions.map((permission) => ({
        label: permission.label,
        granted: permission.roles.includes(selected.key),
      })),
    })
  }

  async update({ request, params, session, response }: HttpContext) {
    if (!roleNames.includes(params.role)) return response.redirect('/admin/roller')
    const data = await request.validateUsing(roleValidator)
    await settings.save({
      [`role_${params.role}_label`]: data.label,
      [`role_${params.role}_color`]: data.color.toLowerCase(),
    })
    session.flash('success', 'Rol güncellendi')
    return response.redirect(`/admin/roller?rol=${params.role}`)
  }
}
