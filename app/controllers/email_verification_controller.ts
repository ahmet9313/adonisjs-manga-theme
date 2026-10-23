import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import tokens from '#services/account_token_service'
import accountMail from '#services/account_mail_service'
import { safeNext } from '#services/account_service'
import { takeAttempt } from '#services/throttle'
import { now } from '#services/input_service'

/** Confirms an address from the mailed link; members can ask for a new link (throttled). */
export default class EmailVerificationController {
  async verify({ params, auth, session, response }: HttpContext) {
    response.header('Referrer-Policy', 'no-referrer')
    await auth.check()
    const home = auth.user ? '/ayarlar#account' : '/giris'
    const found = await tokens.find(params.token, ['verify', 'email_change'])
    if (!found) {
      session.flash(
        'error',
        'Doğrulama bağlantısı geçersiz ya da süresi dolmuş. Ayarlar → Hesap bölümünden yeni bağlantı isteyebilirsin.'
      )
      return response.redirect(home)
    }
    const confirmed = await db.transaction(async (trx) => {
      if (!(await tokens.consume(found.id, trx))) return false
      await trx
        .from('users')
        .where('id', found.user.id)
        .update({ email_verified_at: found.user.emailVerifiedAt ?? now() })
      await tokens.revoke(found.user.id, ['verify', 'email_change'], trx)
      return true
    })
    session.flash(
      confirmed ? 'success' : 'info',
      confirmed ? 'E-posta adresin doğrulandı. Teşekkürler!' : 'Bu bağlantı zaten kullanıldı.'
    )
    return response.redirect(home)
  }

  async resend({ request, auth, session, response }: HttpContext) {
    const user = auth.user!
    const back = safeNext(request.input('next'), '/ayarlar#account')
    if (user.emailVerifiedAt) {
      session.flash('info', 'E-posta adresin zaten doğrulanmış.')
      return response.redirect(back)
    }
    if (!takeAttempt(`verify-resend:${user.id}`, 3, 60 * 60 * 1000)) {
      session.flash('error', 'Çok sık bağlantı istedin. Bir saat içinde tekrar deneyebilirsin.')
      return response.redirect(back)
    }
    await accountMail.verification(user, request)
    session.flash('success', `Doğrulama bağlantısını ${user.email} adresine gönderdik.`)
    return response.redirect(back)
  }
}
