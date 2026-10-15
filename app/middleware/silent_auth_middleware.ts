import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'
import settings from '#services/settings_service'
import cosmetics from '#services/cosmetic_service'
import progress from '#services/progress_service'
import { now } from '#services/input_service'
import { isRecent } from '#services/level'

/**
 * Loads the signed-in user (if any) so public pages can render the account menu, keeps the
 * "online" timestamp fresh and shares the menu summary with HTML pages.
 */
export default class SilentAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await Promise.all([cosmetics.ready(), settings.ready()])
    if (await ctx.auth.check()) {
      const user = ctx.auth.user!
      if (user.bannedAt) await ctx.auth.use('web').logout()
      else {
        if (!isRecent(user.lastSeenAt, 1)) {
          user.lastSeenAt = now()
          user.$original.lastSeenAt = user.lastSeenAt
          await db.from('users').where('id', user.id).update({ last_seen_at: user.lastSeenAt })
        }
        if (ctx.request.method() === 'GET' && ctx.request.accepts(['html', 'json']) === 'html')
          ctx.view.share({ account: await progress.summary(user) })
      }
    }
    return next()
  }
}
