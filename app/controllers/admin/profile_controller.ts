import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'

const profileValidator = vine.compile(
  vine.object({
    full_name: vine.string().minLength(2).maxLength(255),
    email: vine.string().email().maxLength(255),
    password: vine.string().minLength(4).maxLength(255).optional(),
  })
)

export default class ProfileController {
  async show({ view, auth }: HttpContext) {
    return view.render('pages/admin/profile', {
      title: 'Profil',
      user: auth.user!,
    })
  }

  async update({ request, auth, session, response }: HttpContext) {
    const data = await request.validateUsing(profileValidator)
    const user = auth.user!

    user.fullName = data.full_name
    user.email = data.email

    if (data.password) {
      user.password = data.password
    }

    await user.save()
    session.flash('success', 'Profil güncellendi')
    return response.redirect('/admin/profil')
  }
}
