import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import access, { AGE_COOKIE, AGE_COOKIE_MAX_AGE } from '#services/access_service'
import { safeNext } from '#services/account_service'

const confirmValidator = vine.compile(
  vine.object({
    age: vine.number().withoutDecimals().range([1, 99]),
    next: vine.string().maxLength(500).optional(),
  })
)

/** "I am old enough" on the age gate (pages/content_gate.edge): remembered for a year. */
export default class AgeController {
  async confirm({ request, response }: HttpContext) {
    const data = await request.validateUsing(confirmValidator)
    // Confirming 18+ also covers 16+; a lower confirmation never lowers a higher one.
    const confirmed = Math.max(
      data.age,
      access.confirmedAge(request.plainCookie(AGE_COOKIE, { encoded: false }))
    )
    response.plainCookie(AGE_COOKIE, String(confirmed), {
      encode: false,
      maxAge: AGE_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
    return response.redirect(safeNext(data.next))
  }
}
