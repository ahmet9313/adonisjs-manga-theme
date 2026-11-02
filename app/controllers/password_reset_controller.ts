import type { HttpContext } from '@adonisjs/core/http'
import vine, { errors as vineErrors } from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import tokens from '#services/account_token_service'
import accountMail from '#services/account_mail_service'
import { ghostUsername } from '#services/account_data_service'
import { SESSION_STAMP, sessionStamp } from '#services/account_service'
import { recordAttempt, takeAttempt, tooManyAttempts } from '#services/throttle'
import { now } from '#services/input_service'

const forgotValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().maxLength(255),
  })
)

/** Same rules as registration (account_service.registerValidator). */
const resetValidator = vine.compile(
  vine.object({
    password: vine
      .string()
      .minLength(8)
      .maxLength(255)
      .confirmed({ confirmationField: 'password_confirmation' }),
  })
)

const quarter = 15 * 60 * 1000
const hour = 60 * 60 * 1000
/** Shown whether or not the address has an account, so the form cannot reveal members. */
const sentMessage =
  'Bu adrese kayıtlı bir hesap varsa parola sıfırlama bağlantısını gönderdik. Gelen kutunu ve gereksiz klasörünü kontrol et.'

/** The reset page carries the link's token in its address: keep it out of caches and referrers. */
function privatePage(response: HttpContext['response']) {
  response.header('Cache-Control', 'no-store')
  response.header('Referrer-Policy', 'no-referrer')
}

/** "Şifremi unuttum": request a mailed link, then choose a new password with it. */
export default class PasswordResetController {
  async showForgot({ view }: HttpContext) {
    return view.render('pages/auth/forgot', { title: 'Şifremi Unuttum' })
  }

  async sendForgot({ request, session, response }: HttpContext) {
    let email: string
    try {
      const data = await request.validateUsing(forgotValidator)
      email = data.email.toLowerCase()
    } catch (error) {
      if (!(error instanceof vineErrors.E_VALIDATION_ERROR)) throw error
      session.flashValidationErrors(error)
      return response.redirect('/sifremi-unuttum')
    }
    // Per connection and per address; both count every request, existing account or not.
    if (
      !takeAttempt(`forgot:${request.ip()}`, 5, quarter) ||
      !takeAttempt(`forgot-email:${email}`, 3, hour)
    ) {
      session.flash(
        'error',
        'Çok fazla sıfırlama isteği gönderildi. Lütfen biraz sonra tekrar dene.'
      )
      session.flash('email', email)
      return response.redirect('/sifremi-unuttum')
    }
    const user = await User.query().where('email', email).first()
    if (user && !user.bannedAt && user.username !== ghostUsername)
      await accountMail.passwordReset(user, request)
    session.flash('success', sentMessage)
    session.flash('resetSent', email)
    return response.redirect('/sifremi-unuttum')
  }

  async showReset({ params, view, response }: HttpContext) {
    privatePage(response)
    const found = await tokens.find(params.token, ['reset'])
    return view.render('pages/auth/reset', {
      title: 'Yeni Parola',
      token: found ? params.token : null,
      username: found?.user.username ?? null,
    })
  }

  async reset({ params, request, auth, session, response }: HttpContext) {
    privatePage(response)
    const back = `/sifre-sifirla/${encodeURIComponent(String(params.token))}`
    const ipKey = `reset:${request.ip()}`
    if (tooManyAttempts(ipKey, 10)) {
      session.flash('error', 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene.')
      return response.redirect('/sifremi-unuttum')
    }
    const found = await tokens.find(params.token, ['reset'])
    if (!found) {
      recordAttempt(ipKey, quarter)
      session.flash('error', 'Bağlantı geçersiz ya da süresi dolmuş. Yeni bir bağlantı iste.')
      return response.redirect('/sifremi-unuttum')
    }
    let password: string
    try {
      const data = await request.validateUsing(resetValidator)
      password = data.password
    } catch (error) {
      if (!(error instanceof vineErrors.E_VALIDATION_ERROR)) throw error
      session.flashValidationErrors(error)
      return response.redirect(back)
    }

    const user = found.user
    const used = await db.transaction(async (trx) => {
      if (!(await tokens.consume(found.id, trx))) return false
      user.useTransaction(trx)
      user.password = password
      // Opening the mailed link proves the address belongs to the member.
      user.emailVerifiedAt ??= now()
      user.updatedAt = now()
      await user.save()
      // Every "beni hatırla" login ends; other sessions end too, because the password is part
      // of their stamp (silent_auth_middleware).
      await trx.from('remember_me_tokens').where('tokenable_id', user.id).delete()
      await tokens.revoke(user.id, ['reset'], trx)
      return true
    })
    if (!used) {
      session.flash('error', 'Bu bağlantı zaten kullanıldı. Gerekirse yeni bir bağlantı iste.')
      return response.redirect('/sifremi-unuttum')
    }
    if (user.bannedAt) {
      session.flash(
        'error',
        'Parolan değişti ancak hesabın askıya alınmış. Destek ile iletişime geç.'
      )
      return response.redirect('/giris')
    }
    await auth.use('web').login(user)
    session.put(SESSION_STAMP, sessionStamp(user))
    session.flash('success', 'Parolan değiştirildi; diğer cihazlardaki oturumlar kapatıldı.')
    return response.redirect('/')
  }
}
