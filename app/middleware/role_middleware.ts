import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Role } from '#config/roles'

/** Use after `auth`: lets only the listed roles through. */
export default class RoleMiddleware {
  async handle(ctx: HttpContext, next: NextFn, roles: Role[]) {
    if (!roles.includes(ctx.auth.user!.role)) {
      return ctx.response
        .status(403)
        .send(await ctx.view.render('pages/errors/forbidden', { title: 'Erişim reddedildi' }))
    }
    return next()
  }
}
