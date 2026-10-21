import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { rm } from 'node:fs/promises'

/** Largest member upload is a comment image (8 MB) or banner (6 MB); leaves room for fields. */
export const MEMBER_UPLOAD_LIMIT = 12 * 1024 * 1024

/**
 * Runs before the body parser. Multipart bodies are written to disk while being parsed, so
 * only signed-in accounts may send them, and only staff may send large ones (chapter pages).
 * Without this, anyone could stream 200 MB to any POST URL before CSRF or auth was checked.
 * Temporary files nobody kept are removed after the answer (removeLeftovers).
 */
export default class UploadGateMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const type = ctx.request.header('content-type') || ''
    if (!type.toLowerCase().startsWith('multipart/')) return next()

    await ctx.auth.authenticateUsing(['web'], { loginRoute: '/giris' })
    const user = ctx.auth.user!
    if (!user.isStaff || user.bannedAt) {
      const length = Number(ctx.request.header('content-length'))
      if (!Number.isFinite(length) || length <= 0)
        return ctx.response.status(411).send({ message: 'Yükleme boyutu belirtilmeli.' })
      if (length > MEMBER_UPLOAD_LIMIT)
        return ctx.response.status(413).send({ message: 'Yüklenen dosya çok büyük.' })
    }
    try {
      return await next()
    } finally {
      await removeLeftovers(ctx)
    }
  }
}

/**
 * The body parser writes every uploaded part to the system's temporary folder. Files a
 * controller kept were moved away; the rest (refused, invalid, or sent to a URL that takes no
 * files) would stay there forever, so they are deleted once the request is answered.
 */
async function removeLeftovers(ctx: HttpContext) {
  const files = Object.values(ctx.request.allFiles()).flatMap((entry) =>
    Array.isArray(entry) ? entry : [entry]
  )
  await Promise.all(
    files
      .filter((file) => file.tmpPath && file.state !== 'moved')
      .map((file) => rm(file.tmpPath!, { force: true }).catch(() => {}))
  )
}
