import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import compression from 'compression'

/**
 * Brotli/gzip for text answers (HTML, CSS, JS, JSON, SVG): the home page HTML goes from about
 * 150 KB to 20 KB. Images, videos and small answers (< 1 KB) pass through unchanged, and so does
 * a request that asks for a byte range. A reverse proxy that compresses may stay in front; the
 * proxy then sees an already encoded answer and leaves it alone.
 */
const compress = compression({
  threshold: 1024,
  filter: (req, res) => !req.headers.range && compression.filter(req, res),
})

export default class CompressMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await new Promise<void>((resolve, reject) =>
      compress(ctx.request.request as any, ctx.response.response as any, (error?: unknown) =>
        error ? reject(error) : resolve()
      )
    )
    return next()
  }
}
