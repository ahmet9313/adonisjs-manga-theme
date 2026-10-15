import type { HttpContext } from '@adonisjs/core/http'
import progress from '#services/progress_service'
import User from '#models/user'
import { errors as authErrors } from '@adonisjs/auth'
import { errors as vineErrors } from '@vinejs/vine'
import {
  loginValidator,
  registerValidator,
  safeNext,
  assertUniqueIdentity,
} from '#services/account_service'
import { now } from '#services/input_service'
import { clearAttempts, recordAttempt, tooManyAttempts } from '#services/throttle'

const loginWindow = 15 * 60 * 1000
const registerWindow = 60 * 60 * 1000

/** Form errors always return to the full-page form, because the modal is closed after a redirect. */
async function withFormErrors(
  { request, session, response }: HttpContext,
  page: '/giris' | '/kayit',
  handler: () => Promise<unknown>
) {
  try {
    return await handler()
  } catch (error) {
    if (!(error instanceof vineErrors.E_VALIDATION_ERROR)) throw error
    session.flashValidationErrors(error)
    return response.redirect(`${page}?next=${encodeURIComponent(safeNext(request.input('next')))}`)
  }
}

export default class AuthController {
  async showLogin({ view, auth, request, response }: HttpContext) {
    const next = safeNext(request.input('next'))
    if (await auth.check()) return response.redirect(next)
    return view.render('pages/auth/login', { title: 'Giriş Yap', next })
  }

  login(ctx: HttpContext) {
    return withFormErrors(ctx, '/giris', () => this.attemptLogin(ctx))
  }

  register(ctx: HttpContext) {
    return withFormErrors(ctx, '/kayit', () => this.createAccount(ctx))
  }

  private async attemptLogin({ request, auth, session, response }: HttpContext) {
    const data = await request.validateUsing(loginValidator)
    const next = safeNext(data.next)
    const key = `login:${request.ip()}`
    const fail = (message: string) => {
      session.flash('error', message)
      session.flash('login', data.login)
      return response.redirect(`/giris?next=${encodeURIComponent(next)}`)
    }
    if (tooManyAttempts(key, 8))
      return fail('Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin.')

    let user: User
    try {
      user = await User.verifyCredentials(data.login.toLowerCase(), data.password)
    } catch (error) {
      if (!(error instanceof authErrors.E_INVALID_CREDENTIALS)) throw error
      recordAttempt(key, loginWindow)
      return fail('Kullanıcı adı/e-posta veya parola hatalı.')
    }
    if (user.bannedAt) return fail('Hesabınız askıya alınmış. Destek ile iletişime geçin.')

    clearAttempts(key)
    await auth.use('web').login(user, data.remember === 'on')
    user.lastLoginAt = now()
    await user.save()
    session.flash('success', `Hoş geldin, ${user.fullName}!`)
    return response.redirect(next)
  }

  async showRegister({ view, auth, request, response }: HttpContext) {
    const next = safeNext(request.input('next'))
    if (await auth.check()) return response.redirect(next)
    return view.render('pages/auth/register', { title: 'Kayıt Ol', next })
  }

  private async createAccount({ request, auth, session, response }: HttpContext) {
    const data = await request.validateUsing(registerValidator)
    const key = `register:${request.ip()}`
    if (tooManyAttempts(key, 5)) {
      session.flash(
        'error',
        'Bu bağlantıdan çok fazla kayıt denendi. Lütfen daha sonra tekrar deneyin.'
      )
      return response.redirect('/kayit')
    }
    const username = data.username.toLowerCase()
    const email = data.email.toLowerCase()
    await assertUniqueIdentity(username, email)

    recordAttempt(key, registerWindow)
    const timestamp = now()
    const user = await User.create({
      username,
      fullName: data.username,
      email,
      password: data.password,
      role: 'member',
      lastLoginAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await progress.welcome(user)
    await auth.use('web').login(user)
    session.flash('success', 'Hesabın oluşturuldu. Aramıza hoş geldin!')
    return response.redirect(safeNext(data.next))
  }

  async logout({ auth, session, response }: HttpContext) {
    await auth.use('web').logout()
    session.flash('success', 'Çıkış yapıldı')
    return response.redirect('/')
  }
}
