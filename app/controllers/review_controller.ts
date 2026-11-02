import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import SeriesModel from '#models/series'
import SeriesReview from '#models/series_review'
import reviews, { isReviewSort } from '#services/review_service'
import { pageNumber } from '#services/input_service'
import { recordAttempt, tooManyAttempts } from '#services/throttle'
import access from '#services/access_service'
import moderation from '#services/moderation_service'
import wordFilter from '#services/word_filter_service'

const saveValidator = vine.compile(
  vine.object({
    series_id: vine.number().positive().withoutDecimals(),
    rating: vine.number().min(1).max(10).withoutDecimals(),
    title: vine.string().trim().maxLength(80).optional(),
    body: vine.string().trim().minLength(10).maxLength(4000).optional(),
    spoiler: vine.enum(['on', '1', 'true']).optional(),
  })
)

const listValidator = vine.compile(
  vine.object({ series: vine.number().positive().withoutDecimals() })
)

export default class ReviewController {
  async index({ request, auth, response }: HttpContext) {
    const { series } = await request.validateUsing(listValidator, { data: request.qs() })
    // Drafts stay hidden from readers here too (their page is a 404).
    const target = await SeriesModel.find(series)
    if (!target || !access.visible(auth.user, { series: target }))
      return response.notFound({ error: 'Seri bulunamadı' })
    const sortInput = request.input('sort')
    const page = pageNumber(request.input('page'))
    const viewer = auth.user ?? null
    const list = await reviews.list(
      series,
      {
        sort: isReviewSort(sortInput) ? sortInput : 'helpful',
        page,
        withText: request.input('text') !== '0',
      },
      viewer
    )
    return {
      ...list,
      ...(page === 1
        ? {
            summary: await reviews.summary(series),
            mine: viewer ? await reviews.mine(series, viewer) : null,
          }
        : {}),
    }
  }

  async store({ request, auth, response }: HttpContext) {
    const user = auth.user!
    const muted = moderation.muteError(user)
    if (muted) return response.forbidden({ error: muted })
    const key = `review:${user.id}`
    if (tooManyAttempts(key, 8))
      return response.tooManyRequests({ error: 'Çok hızlı işlem yapıyorsun. Biraz bekle.' })
    const data = await request.validateUsing(saveValidator)
    const blocked = wordFilter.check('review', data.title, data.body)
    if (blocked) return response.unprocessableEntity({ error: blocked })
    const series = await SeriesModel.find(data.series_id)
    if (!series || !access.visible(user, { series }))
      return response.notFound({ error: 'Seri bulunamadı' })
    if (!access.allows(user, series.access))
      return response.forbidden({ error: 'Bu seriyi puanlamak için erişimin yok.' })
    recordAttempt(key, 60 * 1000)
    const created = await reviews.save(user, series.id, {
      rating: data.rating,
      title: data.title || null,
      body: data.body || null,
      spoiler: Boolean(data.spoiler) && Boolean(data.body),
    })
    const payload = {
      created,
      mine: await reviews.mine(series.id, user),
      summary: await reviews.summary(series.id),
    }
    return created ? response.created(payload) : payload
  }

  async destroy({ params, auth, response }: HttpContext) {
    const review = await SeriesReview.find(params.id)
    if (!review) return response.notFound({ error: 'İnceleme bulunamadı' })
    const user = auth.user!
    if (review.userId !== user.id && !user.isStaff)
      return response.forbidden({ error: 'Bu incelemeyi silme yetkin yok.' })
    await reviews.remove(review)
    return { deleted: true, summary: await reviews.summary(review.seriesId) }
  }

  async vote({ params, auth, response }: HttpContext) {
    const user = auth.user!
    const review = await SeriesReview.query()
      .where('id', params.id)
      .preload('series', (series) => series.preload('contentType'))
      .first()
    if (!review) return response.notFound({ error: 'İnceleme bulunamadı' })
    if (review.userId === user.id)
      return response.unprocessableEntity({ error: 'Kendi incelemene oy veremezsin.' })
    const key = `review-vote:${user.id}`
    if (tooManyAttempts(key, 30)) return response.tooManyRequests({ error: 'Biraz yavaşla.' })
    recordAttempt(key, 60 * 1000)
    const result = await reviews.vote(user, review)
    if (result.voted)
      await reviews.notifyHelpful(
        review,
        user,
        `/series/${review.series.contentType.slug}/${review.series.slug}#incelemeler`,
        review.series.title
      )
    return result
  }
}
