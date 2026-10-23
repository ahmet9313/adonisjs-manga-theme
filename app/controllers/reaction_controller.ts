import type { HttpContext } from '@adonisjs/core/http'
import Chapter from '#models/chapter'
import SeriesModel from '#models/series'
import access from '#services/access_service'
import reactions, { isReaction } from '#services/reaction_service'
import { takeAttempt } from '#services/throttle'

/** "Bölüm nasıldı?" reactions under the chapter end card (members only). */
export default class ReactionController {
  /** Sets (`reaction`: a key of site.chapterReactions) or removes (empty) the member's reaction. */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.user!
    const chapterId = Number(params.id)
    const chapter = Number.isSafeInteger(chapterId) ? await Chapter.find(chapterId) : null
    const series = chapter ? await SeriesModel.find(chapter.seriesId) : null
    if (!chapter || !series) return response.notFound({ error: 'Bölüm bulunamadı.' })
    // Drafts and members / VIP chapters the member cannot open take no reactions.
    const target = { series, chapter }
    if (!access.visible(user, target) || !access.allows(user, access.effectiveAccess(target)))
      return response.forbidden({ error: 'Bu bölüme tepki veremezsin.' })

    const raw = request.input('reaction')
    if (raw && !isReaction(raw)) return response.unprocessableEntity({ error: 'Geçersiz tepki.' })
    if (!takeAttempt(`reaction:${user.id}`, 30, 60 * 1000))
      return response.tooManyRequests({ error: 'Çok hızlı tepki veriyorsun. Biraz bekle.' })
    return reactions.set(user.id, chapter.id, isReaction(raw) ? raw : null)
  }
}
