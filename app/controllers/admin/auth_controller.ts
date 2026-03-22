import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import vine from '@vinejs/vine'

const loginValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string(),
  })
)

export default class AuthController {
  async showLogin({ view, auth, response }: HttpContext) {
    if (await auth.check()) {
      return response.redirect('/admin')
    }
    return view.render('pages/admin/login')
  }

  async login({ request, auth, session, response }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    try {
      const user = await User.verifyCredentials(email, password)
      await auth.use('web').login(user)
      session.flash('success', 'Başarıyla giriş yapıldı')
      return response.redirect('/admin')
    } catch {
      session.flash('error', 'E-posta veya şifre hatalı')
      return response.redirect('/admin/giris')
    }
  }

  async logout({ auth, session, response }: HttpContext) {
    await auth.use('web').logout()
    session.flash('success', 'Çıkış yapıldı')
    return response.redirect('/admin/giris')
  }
}
