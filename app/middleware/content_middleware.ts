import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { serveContent } from '#services/media_service'

/**
 * Serves `/content/*` images and videos before the router middleware runs, so media requests do not
 * create sessions, set cookies, verify CSRF or load the signed-in user.
 */
export default class ContentMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const url = ctx.request.url()
    const method = ctx.request.method()
    if (!url.startsWith('/content/') || (method !== 'GET' && method !== 'HEAD')) return next()
    let segments: string[]
    try {
      segments = url.slice('/content/'.length).split('/').map(decodeURIComponent)
    } catch {
      return ctx.response.notFound('Görsel bulunamadı')
    }
    return serveContent(ctx, segments)
  }
}
