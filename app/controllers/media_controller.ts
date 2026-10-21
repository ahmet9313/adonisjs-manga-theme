import type { HttpContext } from '@adonisjs/core/http'
import { serveContent } from '#services/media_service'

/** Fallback `/content/*` route; normally content_middleware answers before the router. */
export default class MediaController {
  async show(ctx: HttpContext) {
    const { params } = ctx
    const segments = Array.isArray(params['*']) ? params['*'] : [params['*'] || '']
    return serveContent(ctx, segments)
  }
}
