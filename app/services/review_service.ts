import db from '@adonisjs/lucid/services/db'
import SeriesReview from '#models/series_review'
import ReviewVote from '#models/review_vote'
import type User from '#models/user'
import cosmetics from '#services/cosmetic_service'
import notifications from '#services/notification_service'
import progress from '#services/progress_service'
import { avatarHue } from '#services/comment_service'
import { now } from '#services/input_service'

export const reviewPageSize = 8
export const reviewSorts = ['helpful', 'new', 'high', 'low'] as const
export type ReviewSort = (typeof reviewSorts)[number]
export const isReviewSort = (value: unknown): value is ReviewSort =>
  typeof value === 'string' && (reviewSorts as readonly string[]).includes(value)

/** Word that goes with each score, shown next to the rating picker. */
export const ratingLabels = [
  'Berbat',
  'Çok kötü',
  'Kötü',
  'Vasat',
  'Fena değil',
  'İyi',
  'Çok iyi',
  'Harika',
  'Muhteşem',
  'Başyapıt',
] as const

const toIso = (value: string) => (value ? `${String(value).replace(' ', 'T')}Z` : null)
const round = (value: number) => Math.round(value * 10) / 10

export interface ReviewInput {
  rating: number
  title: string | null
  body: string | null
  spoiler: boolean
}

/** 1–10 ratings with optional written reviews, helpful votes and per-series aggregates. */
class ReviewService {
  /** Average, count and the 1–10 histogram of a series. */
  async summary(seriesId: number) {
    const rows = await db
      .from('series_reviews')
      .where('series_id', seriesId)
      .select('rating')
      .count('* as total')
      .groupBy('rating')
    const distribution = Array.from({ length: 10 }, () => 0)
    for (const row of rows) distribution[Number(row.rating) - 1] = Number(row.total)
    const count = distribution.reduce((sum, value) => sum + value, 0)
    const total = distribution.reduce((sum, value, index) => sum + value * (index + 1), 0)
    const [written] = await db
      .from('series_reviews')
      .where('series_id', seriesId)
      .whereNotNull('body')
      .whereNot('body', '')
      .count('* as total')
    return {
      average: count ? round(total / count) : 0,
      count,
      written: Number(written.total),
      distribution,
    }
  }

  /** Rewrites the denormalised columns on the series row. */
  async refresh(seriesId: number, client: typeof db | ReturnType<typeof db.connection> = db) {
    const [row] = await client
      .from('series_reviews')
      .where('series_id', seriesId)
      .count('* as total')
      .avg('rating as average')
    const [written] = await client
      .from('series_reviews')
      .where('series_id', seriesId)
      .whereNotNull('body')
      .whereNot('body', '')
      .count('* as total')
    await client
      .from('series')
      .where('id', seriesId)
      .update({
        rating_avg: Number(row.total) ? Math.round(Number(row.average) * 100) / 100 : 0,
        rating_count: Number(row.total),
        review_count: Number(written.total),
      })
  }

  private serialize(review: SeriesReview, viewer: User | null, voted: Set<number>) {
    const author = review.user
    return {
      id: review.id,
      rating: review.rating,
      ratingLabel: ratingLabels[review.rating - 1],
      title: review.title,
      body: review.body,
      spoiler: review.spoiler,
      helpfulCount: review.helpfulCount,
      voted: voted.has(review.id),
      own: Boolean(viewer && viewer.id === review.userId),
      canDelete: Boolean(viewer && (viewer.id === review.userId || viewer.isStaff)),
      createdAt: toIso(review.createdAt),
      edited: review.updatedAt !== review.createdAt,
      author: {
        username: author.username,
        fullName: author.fullName,
        avatar: author.avatar,
        hue: avatarHue(author.username),
        role: author.role,
        roleLabel: author.roleInfo.label,
        roleStyle: author.roleInfo.style,
        level: author.level,
        online: author.isOnline,
        look: cosmetics.look(author),
      },
    }
  }

  async list(
    seriesId: number,
    options: { sort: ReviewSort; page: number; withText: boolean },
    viewer: User | null
  ) {
    await cosmetics.ready()
    const query = SeriesReview.query().where('seriesId', seriesId).preload('user')
    if (options.withText) query.whereNotNull('body').whereNot('body', '')
    if (options.sort === 'new') query.orderBy('createdAt', 'desc')
    else if (options.sort === 'high')
      query.orderBy('rating', 'desc').orderBy('helpfulCount', 'desc')
    else if (options.sort === 'low') query.orderBy('rating', 'asc').orderBy('helpfulCount', 'desc')
    else query.orderBy('helpfulCount', 'desc').orderBy('createdAt', 'desc')
    query.orderBy('id', 'desc')

    const result = await query.paginate(options.page, reviewPageSize)
    const reviews = result.all()
    const votes =
      viewer && reviews.length
        ? await ReviewVote.query()
            .where('userId', viewer.id)
            .whereIn(
              'reviewId',
              reviews.map((review) => review.id)
            )
        : []
    const voted = new Set(votes.map((vote) => vote.reviewId))
    return {
      items: reviews.map((review) => this.serialize(review, viewer, voted)),
      hasMore: result.hasMorePages,
    }
  }

  async mine(seriesId: number, user: User) {
    const review = await SeriesReview.query()
      .where({ seriesId, userId: user.id })
      .preload('user')
      .first()
    if (!review) return null
    await cosmetics.ready()
    return this.serialize(review, user, new Set())
  }

  /** Creates or edits the reader's rating (one per series). */
  async save(user: User, seriesId: number, input: ReviewInput) {
    const timestamp = now()
    const created = await db.transaction(async (trx) => {
      const existing = await SeriesReview.query({ client: trx })
        .where({ seriesId, userId: user.id })
        .first()
      if (existing) {
        existing.merge({ ...input, updatedAt: timestamp })
        await existing.useTransaction(trx).save()
      } else {
        await SeriesReview.create(
          {
            ...input,
            userId: user.id,
            seriesId,
            helpfulCount: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          { client: trx }
        )
      }
      await this.refresh(seriesId, trx)
      return !existing
    })
    await progress.reviewed(user, created)
    return created
  }

  async remove(review: SeriesReview) {
    await db.transaction(async (trx) => {
      await trx.from('series_reviews').where('id', review.id).delete()
      await this.refresh(review.seriesId, trx)
    })
  }

  /** "Faydalı" toggle. Authors cannot vote on their own review. */
  async vote(user: User, review: SeriesReview) {
    const result = await db.transaction(async (trx) => {
      const existing = await ReviewVote.query({ client: trx })
        .where({ userId: user.id, reviewId: review.id })
        .first()
      if (existing) {
        await existing.useTransaction(trx).delete()
        await trx
          .from('series_reviews')
          .where('id', review.id)
          .where('helpful_count', '>', 0)
          .decrement('helpful_count', 1)
      } else {
        await ReviewVote.create(
          { userId: user.id, reviewId: review.id, createdAt: now() },
          { client: trx }
        )
        await trx.from('series_reviews').where('id', review.id).increment('helpful_count', 1)
      }
      const fresh = await trx
        .from('series_reviews')
        .where('id', review.id)
        .select('helpful_count')
        .first()
      return { voted: !existing, helpfulCount: Number(fresh.helpful_count) }
    })
    if (result.voted) {
      const author = await review.related('user').query().first()
      if (author) await progress.evaluate(author)
    }
    return result
  }

  /** Tells the reviewer when a reader found the review useful (once per voter). */
  async notifyHelpful(review: SeriesReview, voter: User, link: string, seriesTitle: string) {
    const already = await db
      .from('notifications')
      .where({ user_id: review.userId, category: 'activity', link })
      .where('title', `${voter.fullName} incelemeni faydalı buldu`)
      .first()
    if (already) return
    await notifications.notify(review.userId, 'activity', {
      title: `${voter.fullName} incelemeni faydalı buldu`,
      body: `${seriesTitle} incelemen bir okura yardımcı oldu.`,
      link,
    })
  }

  /** Most helpful written reviews without spoilers, for the home page. */
  async featured(limit = 4) {
    await cosmetics.ready()
    return SeriesReview.query()
      .whereNotNull('body')
      .whereNot('body', '')
      .where('spoiler', false)
      .preload('user')
      .preload('series', (series) => series.preload('contentType'))
      .orderBy('helpfulCount', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(limit)
  }

  /** Profile: a member's latest ratings with series info. */
  async recentByUser(userId: number, limit = 10) {
    return SeriesReview.query()
      .where('userId', userId)
      .preload('series', (series) => series.preload('contentType'))
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
  }
}

export default new ReviewService()
