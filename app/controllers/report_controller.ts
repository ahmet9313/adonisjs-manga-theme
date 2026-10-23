import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { reportLimits, reportNoteMax, reportTargets } from '#config/moderation'
import moderation from '#services/moderation_service'
import { takeAttempt } from '#services/throttle'

const reportValidator = vine.compile(
  vine.object({
    target_type: vine.enum(reportTargets),
    target_id: vine.number().positive().withoutDecimals(),
    reason: vine.string().trim().maxLength(32),
    note: vine.string().trim().maxLength(reportNoteMax).optional(),
  })
)

export default class ReportController {
  /**
   * "Hata bildir" (chapters, guests too) and "Şikâyet et" (comments and reviews, members only).
   * Guests are throttled per address, members per account; every attempt counts.
   */
  async store({ request, auth, response }: HttpContext) {
    const user = auth.user ?? null
    const data = await request.validateUsing(reportValidator)
    if (data.target_type !== 'chapter' && !user)
      return response.unauthorized({ error: 'Şikâyet etmek için giriş yapmalısın.' })

    const limit = user ? reportLimits.member : reportLimits.guest
    const key = user ? `report:user:${user.id}` : `report:ip:${moderation.ipKey(request.ip())}`
    if (!takeAttempt(key, limit.max, limit.windowMs))
      return response.tooManyRequests({
        error: 'Çok sık bildirim gönderdin. Biraz bekleyip tekrar dene.',
      })

    if (data.reason === 'other' && !data.note)
      return response.unprocessableEntity({ error: '“Diğer” için sorunu kısaca anlat.' })
    const result = await moderation.create({
      reporter: user,
      ip: request.ip(),
      type: data.target_type,
      id: data.target_id,
      reason: data.reason,
      note: data.note || null,
    })
    if ('error' in result) return response.status(result.status).send({ error: result.error })
    return response.created({
      message:
        data.target_type === 'chapter'
          ? 'Teşekkürler! Bildirimin ekibe ulaştı.'
          : 'Teşekkürler! Şikâyetin moderatörlere ulaştı.',
    })
  }
}
