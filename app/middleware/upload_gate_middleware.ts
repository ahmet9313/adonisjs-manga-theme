import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/** Largest member upload is a comment image (8 MB) or banner (6 MB); leaves room for fields. */
export const MEMBER_UPLOAD_LIMIT = 12 * 1024 * 1024

/**
 * Runs before the body parser. Multipart bodies are written to disk while being parsed, so
 * only signed-in accounts may send them, and only staff may send large ones (chapter pages).
 * Without this, anyone could stream 200 MB to any POST URL before CSRF or auth was checked.
 */
export default class UploadGateMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const type = ctx.request.header('content-type') || ''
    if (!type.toLowerCase().startsWith('multipart/')) return next()

    await ctx.auth.authenticateUsing(['web'], { loginRoute: '/giris' })
    const user = ctx.auth.user!
    if (user.isStaff && !user.bannedAt) return next()

    const length = Number(ctx.request.header('content-length'))
    if (!Number.isFinite(length) || length <= 0)
      return ctx.response.status(411).send({ message: 'Yükleme boyutu belirtilmeli.' })
    if (length > MEMBER_UPLOAD_LIMIT)
      return ctx.response.status(413).send({ message: 'Yüklenen dosya çok büyük.' })
    return next()
  }
}
