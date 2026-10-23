import { randomBytes } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import type User from '#models/user'
import site from '#config/site'
import reviews from '#services/review_service'
import { levelFor } from '#services/level'
import { now } from '#services/input_service'
import { removeContentFiles } from '#services/upload_service'

type Trx = Awaited<ReturnType<typeof db.transaction>>

/**
 * Placeholder author for comments of deleted accounts, so reply threads stay whole. Its user
 * name cannot be registered (a hyphen fails the registration pattern), it cannot sign in (random
 * password, suspended) and its profile is hidden like every suspended one.
 */
export const ghostUsername = 'silinmis-uye'
const ghostName = 'Silinmiş üye'

/** One numeric column of a query's rows. */
const column = async (query: { select(name: string): Promise<any[]> }, name: string) => {
  const rows = await query.select(name)
  return rows.map((row) => Number(row[name]))
}

const toIso = (value: unknown) =>
  typeof value === 'string' && value ? `${value.replace(' ', 'T')}Z` : (value ?? null)

/** KVKK: "Verilerimi indir" (JSON export) and account deletion. */
class AccountDataService {
  /** Everything stored about the member, as one JSON document. */
  async export(user: User) {
    const id = user.id
    // A series that became a draft since keeps its row but not its title (drafts never leak).
    const seriesTitle = (row: any) => (row.series_draft ? null : row.series_title)
    const [
      bookmarks,
      reads,
      commentRows,
      reviewRows,
      notifications,
      cosmetics,
      cards,
      shards,
      badges,
      liked,
      commentVotes,
      reviewVotes,
    ] = await Promise.all([
      db
        .from('bookmarks')
        .join('series', 'series.id', 'bookmarks.series_id')
        .where('bookmarks.user_id', id)
        .select(
          'bookmarks.series_id',
          'bookmarks.created_at',
          'series.title as series_title',
          'series.draft as series_draft'
        )
        .orderBy('bookmarks.created_at', 'desc'),
      db
        .from('chapter_reads')
        .join('series', 'series.id', 'chapter_reads.series_id')
        .join('chapters', 'chapters.id', 'chapter_reads.chapter_id')
        .where('chapter_reads.user_id', id)
        .select(
          'chapter_reads.series_id',
          'chapter_reads.read_at',
          'chapters.number as chapter_number',
          'chapters.draft as chapter_draft',
          'series.title as series_title',
          'series.draft as series_draft'
        )
        .orderBy('chapter_reads.read_at', 'desc'),
      db
        .from('comments')
        .join('series', 'series.id', 'comments.series_id')
        .leftJoin('chapters', 'chapters.id', 'comments.chapter_id')
        .where('comments.user_id', id)
        .select(
          'comments.id',
          'comments.series_id',
          'comments.parent_id',
          'comments.body',
          'comments.image',
          'comments.spoiler',
          'comments.like_count',
          'comments.dislike_count',
          'comments.reply_count',
          'comments.deleted_at',
          'comments.created_at',
          'chapters.number as chapter_number',
          'series.title as series_title',
          'series.draft as series_draft'
        )
        .orderBy('comments.created_at', 'desc'),
      db
        .from('series_reviews')
        .join('series', 'series.id', 'series_reviews.series_id')
        .where('series_reviews.user_id', id)
        .select(
          'series_reviews.series_id',
          'series_reviews.rating',
          'series_reviews.title',
          'series_reviews.body',
          'series_reviews.spoiler',
          'series_reviews.helpful_count',
          'series_reviews.created_at',
          'series_reviews.updated_at',
          'series.title as series_title',
          'series.draft as series_draft'
        )
        .orderBy('series_reviews.created_at', 'desc'),
      db
        .from('notifications')
        .where('user_id', id)
        .select('category', 'title', 'body', 'link', 'read_at', 'created_at')
        .orderBy('created_at', 'desc'),
      db
        .from('user_cosmetics')
        .join('cosmetics', 'cosmetics.id', 'user_cosmetics.cosmetic_id')
        .where('user_cosmetics.user_id', id)
        .select(
          'cosmetics.id',
          'cosmetics.kind',
          'cosmetics.name',
          'cosmetics.slug',
          'user_cosmetics.created_at'
        ),
      db
        .from('user_cards')
        .join('cards', 'cards.id', 'user_cards.card_id')
        .where('user_cards.user_id', id)
        .select('cards.name', 'cards.rarity', 'user_cards.count', 'user_cards.obtained_at'),
      db.from('user_shards').where('user_id', id).select('rarity', 'amount'),
      db.from('user_badges').where('user_id', id).select('badge', 'earned_at'),
      db
        .from('profile_likes')
        .join('users', 'users.id', 'profile_likes.member_id')
        .where('profile_likes.user_id', id)
        .select('users.username', 'profile_likes.created_at'),
      db.from('comment_likes').where('user_id', id).select('comment_id', 'value'),
      db.from('review_votes').where('user_id', id).select('review_id', 'created_at'),
    ])
    const equipped = new Set([user.frameId, user.effectId, user.wallpaperId].filter(Boolean))
    return {
      format: 'mangahub-account-export',
      version: 1,
      site: site.name,
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        emailVerifiedAt: toIso(user.emailVerifiedAt),
        role: user.role,
        bio: user.bio,
        avatar: user.avatar,
        banner: user.banner,
        exp: user.exp || 0,
        level: levelFor(user.exp || 0).level,
        streak: user.streak || 0,
        bestStreak: user.bestStreak || 0,
        lastCheckinOn: user.lastCheckinOn,
        profileLikes: user.profileLikeCount || 0,
        createdAt: toIso(user.createdAt),
        lastLoginAt: toIso(user.lastLoginAt),
      },
      bookmarks: bookmarks.map((row) => ({
        seriesId: row.series_id,
        series: seriesTitle(row),
        savedAt: toIso(row.created_at),
      })),
      readingHistory: reads.map((row) => ({
        seriesId: row.series_id,
        series: seriesTitle(row),
        chapter: row.chapter_draft ? null : row.chapter_number,
        readAt: toIso(row.read_at),
      })),
      comments: commentRows.map((row) => ({
        id: row.id,
        seriesId: row.series_id,
        series: seriesTitle(row),
        chapter: row.chapter_number ?? null,
        replyTo: row.parent_id,
        body: row.body,
        image: row.image,
        spoiler: Boolean(row.spoiler),
        likes: Number(row.like_count || 0),
        dislikes: Number(row.dislike_count || 0),
        replies: Number(row.reply_count || 0),
        deletedAt: toIso(row.deleted_at),
        createdAt: toIso(row.created_at),
      })),
      reviews: reviewRows.map((row) => ({
        seriesId: row.series_id,
        series: seriesTitle(row),
        rating: Number(row.rating),
        title: row.title,
        body: row.body,
        spoiler: Boolean(row.spoiler),
        helpful: Number(row.helpful_count || 0),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      })),
      notifications: notifications.map((row) => ({
        category: row.category,
        title: row.title,
        body: row.body,
        link: row.link,
        readAt: toIso(row.read_at),
        createdAt: toIso(row.created_at),
      })),
      cosmetics: cosmetics.map((row) => ({
        kind: row.kind,
        name: row.name,
        slug: row.slug,
        equipped: equipped.has(row.id),
        obtainedAt: toIso(row.created_at),
      })),
      cards: cards.map((row) => ({
        name: row.name,
        rarity: row.rarity,
        count: Number(row.count),
        obtainedAt: toIso(row.obtained_at),
      })),
      shards: shards.map((row) => ({ rarity: row.rarity, amount: Number(row.amount) })),
      badges: badges.map((row) => ({ badge: row.badge, earnedAt: toIso(row.earned_at) })),
      profilesLiked: liked.map((row) => ({
        username: row.username,
        likedAt: toIso(row.created_at),
      })),
      commentVotes: commentVotes.map((row) => ({
        commentId: row.comment_id,
        vote: Number(row.value) < 0 ? -1 : 1,
      })),
      helpfulVotes: reviewVotes.map((row) => ({
        reviewId: row.review_id,
        votedAt: toIso(row.created_at),
      })),
    }
  }

  /** True when this administrator is the only one left (that account cannot be deleted). */
  async isLastAdmin(user: User) {
    if (user.role !== 'admin') return false
    const [row] = await db
      .from('users')
      .where('role', 'admin')
      .whereNull('banned_at')
      .whereNot('id', user.id)
      .count('* as total')
    return Number(row.total) === 0
  }

  /**
   * Deletes the account and its personal data in one transaction: library, reading history,
   * notifications, cosmetics, cards, badges, votes, likes, reviews, links and remember-me
   * logins; the counters those fed are recomputed. Comments keep their place under "Silinmiş
   * üye" so reply threads stay whole; with `deleteComments` their text and images are removed
   * too (comments without replies disappear, ones with replies stay as "silindi"). Image files
   * are removed after the commit.
   */
  async remove(user: User, options: { deleteComments: boolean }) {
    const files: (string | null)[] = [user.avatar, user.banner]
    await db.transaction(async (trx) => {
      const ghost = await this.ghost(trx)
      const id = user.id

      // Votes on comments and reviews, and profile likes given: the counts they fed go down.
      const votedComments = await column(
        trx.from('comment_likes').where('user_id', id),
        'comment_id'
      )
      await trx.from('comment_likes').where('user_id', id).delete()
      for (const commentId of new Set(votedComments)) await this.recountVotes(trx, commentId)

      const votedReviews = await column(trx.from('review_votes').where('user_id', id), 'review_id')
      await trx.from('review_votes').where('user_id', id).delete()
      for (const reviewId of new Set(votedReviews)) await this.recountHelpful(trx, reviewId)

      const likedMembers = await column(trx.from('profile_likes').where('user_id', id), 'member_id')
      await trx.from('profile_likes').where('user_id', id).orWhere('member_id', id).delete()
      for (const memberId of new Set(likedMembers)) {
        const [row] = await trx
          .from('profile_likes')
          .where('member_id', memberId)
          .count('* as total')
        await trx
          .from('users')
          .where('id', memberId)
          .update({ profile_like_count: Number(row.total) })
      }

      // Ratings and reviews (one per series, so they cannot move to the placeholder).
      const ratedSeries = await column(trx.from('series_reviews').where('user_id', id), 'series_id')
      const reviewIds = await column(trx.from('series_reviews').where('user_id', id), 'id')
      if (reviewIds.length) await trx.from('review_votes').whereIn('review_id', reviewIds).delete()
      await trx.from('series_reviews').where('user_id', id).delete()
      for (const seriesId of new Set(ratedSeries)) await reviews.refresh(seriesId, trx)

      // Comments move to the placeholder author.
      const commentIds = await column(trx.from('comments').where('user_id', id), 'id')
      if (options.deleteComments && commentIds.length) {
        const images = await trx
          .from('comments')
          .whereIn('id', commentIds)
          .whereNotNull('image')
          .select('image')
        files.push(...images.map((row) => String(row.image)))
        await trx
          .from('comments')
          .whereIn('id', commentIds)
          .update({ body: '', image: null, spoiler: false, sticker_id: null })
        await trx
          .from('comments')
          .whereIn('id', commentIds)
          .whereNull('deleted_at')
          .update({ deleted_at: now() })
      }
      if (commentIds.length)
        await trx.from('comments').whereIn('id', commentIds).update({ user_id: ghost })
      if (options.deleteComments) await this.pruneDeleted(trx, commentIds)

      for (const table of [
        'bookmarks',
        'chapter_reads',
        'notifications',
        'user_cosmetics',
        'user_badges',
        'user_cards',
        'user_shards',
        'account_tokens',
      ])
        await trx.from(table).where('user_id', id).delete()
      await trx.from('remember_me_tokens').where('tokenable_id', id).delete()
      await trx.from('users').where('id', id).delete()
    })
    await removeContentFiles(files)
  }

  /** The placeholder account, created on first use. */
  private async ghost(trx: Trx): Promise<number> {
    const existing = await trx.from('users').where('username', ghostUsername).first()
    if (existing) return Number(existing.id)
    const stamp = now()
    await trx.table('users').insert({
      username: ghostUsername,
      full_name: ghostName,
      email: `${ghostUsername}@deleted.invalid`,
      password: await hash.make(randomBytes(32).toString('hex')),
      role: 'member',
      banned_at: stamp,
      created_at: stamp,
      updated_at: stamp,
    })
    const created = await trx.from('users').where('username', ghostUsername).firstOrFail()
    return Number(created.id)
  }

  private async recountVotes(trx: Trx, commentId: number) {
    const [up] = await trx
      .from('comment_likes')
      .where('comment_id', commentId)
      .where('value', '>', 0)
      .count('* as total')
    const [down] = await trx
      .from('comment_likes')
      .where('comment_id', commentId)
      .where('value', '<', 0)
      .count('* as total')
    await trx
      .from('comments')
      .where('id', commentId)
      .update({ like_count: Number(up.total), dislike_count: Number(down.total) })
  }

  private async recountHelpful(trx: Trx, reviewId: number) {
    const [row] = await trx.from('review_votes').where('review_id', reviewId).count('* as total')
    await trx
      .from('series_reviews')
      .where('id', reviewId)
      .update({ helpful_count: Number(row.total) })
  }

  /**
   * Deleted comments without replies disappear, like a single comment deleted by its author
   * (comment_service.remove). Removing a reply can leave its parent without replies, so this
   * repeats until nothing changes (bounded by the deepest thread).
   */
  private async pruneDeleted(trx: Trx, ids: number[]) {
    let candidates = ids
    for (let round = 0; round < 100 && candidates.length; round++) {
      const leaves = await trx
        .from('comments')
        .whereIn('id', candidates)
        .whereNotNull('deleted_at')
        .where('reply_count', 0)
        .select('id', 'parent_id')
      if (!leaves.length) return
      await trx
        .from('comments')
        .whereIn(
          'id',
          leaves.map((row) => row.id)
        )
        .delete()
      const parents = leaves.map((row) => row.parent_id).filter(Boolean) as number[]
      for (const parentId of parents)
        await trx
          .from('comments')
          .where('id', parentId)
          .where('reply_count', '>', 0)
          .decrement('reply_count', 1)
      // Only parents can have become leaves; the member's own deleted ones are pruned next.
      const own = new Set(ids)
      candidates = [...new Set(parents)].filter((parentId) => own.has(parentId))
    }
  }
}

export default new AccountDataService()
