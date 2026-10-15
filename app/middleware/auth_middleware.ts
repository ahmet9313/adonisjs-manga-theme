import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'

export default class AuthMiddleware {
  redirectTo = '/giris'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: { guards?: (keyof Authenticators)[] } = {}
  ) {
    const loginRoute =
      ctx.request.method() === 'GET'
        ? `${this.redirectTo}?next=${encodeURIComponent(ctx.request.url(true))}`
        : this.redirectTo
    await ctx.auth.authenticateUsing(options.guards || ['web'], { loginRoute })
    if (ctx.auth.user!.bannedAt) {
      await ctx.auth.use('web').logout()
      ctx.session.flash('error', 'Hesabınız askıya alınmış.')
      return ctx.response.redirect(this.redirectTo)
    }
    return next()
  }
}
