import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Comment from '#models/comment'
import Chapter from '#models/chapter'
import SeriesModel from '#models/series'
import comments, { type CommentSort } from '#services/comment_service'
import { pageNumber } from '#services/input_service'
import { removeContentFile, saveImage } from '#services/upload_service'
import { refundAttempt, takeAttempt } from '#services/throttle'
import cosmetics from '#services/cosmetic_service'
import access from '#services/access_service'
import type User from '#models/user'
import moderation from '#services/moderation_service'
import wordFilter from '#services/word_filter_service'

export const commentImageRules = { size: '8mb', extnames: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }
const maxBody = 1000

const commentValidator = vine.compile(
  vine.object({
    series_id: vine.number().positive().withoutDecimals(),
    chapter_id: vine.number().positive().withoutDecimals().optional(),
    parent_id: vine.number().positive().withoutDecimals().optional(),
    body: vine.string().trim().maxLength(maxBody).optional(),
    sticker_id: vine.number().positive().withoutDecimals().optional(),
    spoiler: vine.enum(['on', '1', 'true']).optional(),
  })
)

const listValidator = vine.compile(
  vine.object({
    series: vine.number().positive().withoutDecimals(),
    chapter: vine.number().positive().withoutDecimals().optional(),
  })
)

/**
 * True when the visitor may read and write the thread: the series (and chapter) are published
 * or the visitor is staff, and the visitor may open the content (members / VIP). Age warnings
 * are a page concern and do not block the thread.
 */
async function threadOpen(user: User | null, seriesId: number, chapterId: number | null) {
  const series = await SeriesModel.find(seriesId)
  if (!series) return false
  const chapter = chapterId
    ? await Chapter.query().where('id', chapterId).where('seriesId', seriesId).first()
    : null
  if (chapterId && !chapter) return false
  const target = { series, chapter }
  return access.visible(user, target) && access.allows(user, access.effectiveAccess(target))
}

export default class CommentController {
  async index({ request, auth, response }: HttpContext) {
    const { series, chapter } = await request.validateUsing(listValidator, {
      data: request.qs(),
    })
    if (!(await threadOpen(auth.user ?? null, series, chapter ?? null)))
      return response.forbidden({ error: 'Bu içeriğin yorumlarını göremezsin.' })
    const sort: CommentSort = request.input('sort') === 'top' ? 'top' : 'new'
    return comments.topLevel(
      { seriesId: series, chapterId: chapter ?? null },
      sort,
      pageNumber(request.input('page')),
      auth.user ?? null
    )
  }

  async replies({ params, request, auth, response }: HttpContext) {
    const parent = await Comment.find(params.id)
    if (!parent) return response.notFound({ error: 'Yorum bulunamadı' })
    if (!(await threadOpen(auth.user ?? null, parent.seriesId, parent.chapterId)))
      return response.forbidden({ error: 'Bu içeriğin yorumlarını göremezsin.' })
    return comments.replies(parent.id, pageNumber(request.input('page')), auth.user ?? null)
  }

  async store({ request, auth, response }: HttpContext) {
    const user = auth.user!
    const muted = moderation.muteError(user)
    if (muted) return response.forbidden({ error: muted })
    const data = await request.validateUsing(commentValidator)
    const body = data.body ?? ''
    const file = request.file('image', commentImageRules)
    if (!body && !file && !data.sticker_id)
      return response.unprocessableEntity({ error: 'Bir şey yaz, görsel ya da çıkartma ekle.' })
    const blocked = wordFilter.check('comment', body)
    if (blocked) return response.unprocessableEntity({ error: blocked })
    // Counted at once (not after the image is saved), so parallel posts cannot slip through;
    // a post refused further down gives its attempt back.
    const key = `comment:${user.id}`
    if (!takeAttempt(key, 6, 60 * 1000))
      return response.tooManyRequests({
        error: 'Çok hızlı yorum yapıyorsun. Biraz bekleyip tekrar dene.',
      })
    const refuse = <T>(answer: T) => {
      refundAttempt(key)
      return answer
    }
    const sticker = data.sticker_id ? await cosmetics.usableSticker(user, data.sticker_id) : null
    if (data.sticker_id && !sticker)
      return refuse(response.unprocessableEntity({ error: 'Bu çıkartma henüz açılmadı.' }))

    const series = await SeriesModel.query()
      .where('id', data.series_id)
      .preload('contentType')
      .first()
    if (!series) return refuse(response.notFound({ error: 'Seri bulunamadı' }))
    const chapterId = data.chapter_id ?? null
    if (!(await threadOpen(user, series.id, chapterId)))
      return refuse(response.forbidden({ error: 'Bu içeriğe yorum yazamazsın.' }))
    let link = `/series/${series.contentType.slug}/${series.slug}`
    if (chapterId) {
      const chapter = await Chapter.query()
        .where('id', chapterId)
        .where('seriesId', series.id)
        .first()
      if (!chapter) return refuse(response.notFound({ error: 'Bölüm bulunamadı' }))
      link += `/${chapter.number}`
    }
    let parent: Comment | null = null
    if (data.parent_id) {
      parent = await Comment.find(data.parent_id)
      if (
        !parent ||
        parent.deletedAt ||
        parent.seriesId !== series.id ||
        parent.chapterId !== chapterId
      )
        return refuse(response.unprocessableEntity({ error: 'Yanıtlanan yorum bulunamadı.' }))
    }

    let image: string | null = null
    if (file) {
      if (!file.isValid)
        return refuse(
          response.unprocessableEntity({
            error: 'Görsel JPG, PNG, WebP veya GIF olmalı ve 8 MB sınırını aşmamalı.',
          })
        )
      image = await saveImage(file, ['comments'])
    }
    try {
      const comment = await comments.create(
        user,
        { seriesId: series.id, chapterId },
        {
          body,
          spoiler: Boolean(data.spoiler),
          image,
          stickerId: sticker?.id ?? null,
          parent,
          link: `${link}#yorumlar`,
        }
      )
      return response.created(comment)
    } catch (error) {
      await removeContentFile(image)
      throw error
    }
  }

  async vote(ctx: HttpContext) {
    return this.castVote(ctx, Number(ctx.request.input('value')) < 0 ? -1 : 1)
  }

  private async castVote({ params, auth, response }: HttpContext, value: 1 | -1) {
    const user = auth.user!
    if (!takeAttempt(`comment-vote:${user.id}`, 30, 60 * 1000))
      return response.tooManyRequests({ error: 'Biraz yavaşla.' })
    const comment = await Comment.find(params.id)
    if (!comment || comment.deletedAt) return response.notFound({ error: 'Yorum bulunamadı' })
    if (!(await threadOpen(user, comment.seriesId, comment.chapterId)))
      return response.forbidden({ error: 'Bu içeriğin yorumlarına oy veremezsin.' })
    return comments.vote(user, comment, value)
  }

  async destroy({ params, auth, response }: HttpContext) {
    const comment = await Comment.find(params.id)
    if (!comment || comment.deletedAt) return response.notFound({ error: 'Yorum bulunamadı' })
    const user = auth.user!
    if (comment.userId !== user.id && !user.isStaff)
      return response.forbidden({ error: 'Bu yorumu silme yetkin yok.' })
    return { deleted: await comments.remove(comment) }
  }
}
