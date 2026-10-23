import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import installConfig from '#config/install'
import install from '#services/install_service'

/** True for `/kurulum` and the paths under it. */
export const isWizardPath = (path: string) =>
  path === installConfig.path || path.startsWith(`${installConfig.path}/`)

/**
 * Before the first-run wizard finishes, every page leads to it (JSON requests get 503); after it,
 * the wizard is gone. Static files and /content are served before the router, so the wizard's own
 * styles and scripts load either way.
 */
export default class InstallGateMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const wizard = isWizardPath(ctx.request.url())
    const installed = await install.isInstalled()
    if (installed && wizard) return ctx.response.redirect('/')
    if (!installed && !wizard) {
      if (ctx.request.method() === 'GET' && ctx.request.accepts(['html', 'json']) === 'html')
        return ctx.response.redirect(installConfig.path)
      return ctx.response.status(503).json({ message: 'Site henüz kurulmadı.' })
    }
    return next()
  }
}
