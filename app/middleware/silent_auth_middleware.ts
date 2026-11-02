import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'
import settings from '#services/settings_service'
import cosmetics from '#services/cosmetic_service'
import progress from '#services/progress_service'
import { now } from '#services/input_service'
import { isRecent } from '#services/level'
import { SESSION_STAMP, sessionStamp } from '#services/account_service'
import { isWizardPath } from '#middleware/install_gate_middleware'

/**
 * Loads the signed-in user (if any) so public pages can render the account menu, keeps the
 * "online" timestamp fresh and shares the menu summary with HTML pages. Banned accounts and
 * sessions from before a password/e-mail change are signed out. The setup wizard is skipped: its
 * database may not have any tables yet.
 */
export default class SilentAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (isWizardPath(ctx.request.url())) return next()
    await Promise.all([cosmetics.ready(), settings.ready()])
    if (await ctx.auth.check()) {
      const user = ctx.auth.user!
      // A session opened before the password or e-mail changed (on another device) ends here.
      const stamp = sessionStamp(user)
      const stored = ctx.session.get(SESSION_STAMP)
      if (!stored && !user.bannedAt) ctx.session.put(SESSION_STAMP, stamp)
      if (user.bannedAt || (stored && stored !== stamp)) {
        await ctx.auth.use('web').logout()
        ctx.session.forget(SESSION_STAMP)
      } else {
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
