import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import site from '#config/site'

/**
 * Use after `auth` on routes that publish something (comments, reviews). When
 * `site.requireVerifiedToPost` is on, accounts with an unconfirmed e-mail address are refused;
 * reading and saving series stay open to them. Off by default (nothing changes).
 */
export default class VerifiedMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user
    if (!site.requireVerifiedToPost || !user || user.emailVerifiedAt) return next()
    const message =
      'Yorum ve inceleme yazmak için önce e-posta adresini doğrula. Ayarlar → Hesap bölümünden doğrulama bağlantısını yeniden isteyebilirsin.'
    if (ctx.request.accepts(['html', 'json']) === 'json')
      return ctx.response.forbidden({ error: message, verify: true })
    ctx.session.flash('error', message)
    return ctx.response.redirect('/ayarlar#account')
  }
}
