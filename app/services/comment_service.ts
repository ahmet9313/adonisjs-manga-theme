import db from '@adonisjs/lucid/services/db'
import Comment from '#models/comment'
import CommentLike from '#models/comment_like'
import User from '#models/user'
import { now } from '#services/input_service'
import { removeContentFile } from '#services/upload_service'
import cosmetics from '#services/cosmetic_service'
import notifications from '#services/notification_service'
import progress from '#services/progress_service'

export const commentPageSize = 20
export const replyPreviewSize = 2

export type CommentSort = 'new' | 'top'

export interface Thread {
  seriesId: number
  chapterId: number | null
}

export function avatarHue(username: string) {
  return ([...(username || 'u')].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 37) % 360
}

const toIso = (value: string) => (value ? `${value.replace(' ', 'T')}Z` : null)

/** One-line description of a comment, used to show what a reply answers. */
export function excerptOf(
  comment: Pick<Comment, 'body' | 'image' | 'stickerId' | 'spoiler'>,
  max = 110
) {
  if (comment.spoiler) return 'Spoiler içeren yorum'
  const text = (comment.body || '').replace(/\s+/g, ' ').trim()
  if (text) return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
  if (comment.stickerId) return 'Bir çıkartma gönderdi'
  if (comment.image)
    return /\.gif$/i.test(comment.image) ? 'Bir GIF gönderdi' : 'Bir görsel gönderdi'
  return ''
}

/** Threaded comments: top-level pages, lazy reply pages, likes and moderation. */
class CommentService {
  private serialize(
    comment: Comment,
    viewer: User | null,
    votes: Map<number, number>
  ): Record<string, unknown> {
    const deleted = Boolean(comment.deletedAt)
    const author = comment.user
    const parent = comment.$preloaded.parent ? comment.parent : null
    const parentAuthor = parent?.$preloaded.user ? (parent.user ?? null) : null
    return {
      id: comment.id,
      parentId: comment.parentId,
      rootId: comment.rootId,
      depth: comment.depth,
      body: deleted ? '' : comment.body,
      image: deleted ? null : comment.image,
      sticker: deleted ? null : cosmetics.sticker(comment.stickerId),
      spoiler: !deleted && comment.spoiler,
      likeCount: comment.likeCount,
      dislikeCount: comment.dislikeCount || 0,
      replyCount: comment.replyCount,
      vote: votes.get(comment.id) ?? 0,
      deleted,
      createdAt: toIso(comment.createdAt),
      canDelete: !deleted && Boolean(viewer && (viewer.id === comment.userId || viewer.isStaff)),
      replyTo: parentAuthor ? parentAuthor.username : null,
      /** What this reply answers (null for top-level comments). */
      parent: parent
        ? {
            id: parent.id,
            deleted: Boolean(parent.deletedAt),
            username: parent.deletedAt ? null : (parentAuthor?.username ?? null),
            fullName: parent.deletedAt ? null : (parentAuthor?.fullName ?? null),
            excerpt: parent.deletedAt ? '' : excerptOf(parent),
          }
        : null,
      author: deleted
        ? null
        : {
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
      replies: comment.$preloaded.replies
        ? comment.replies.map((reply) => this.serialize(reply, viewer, votes))
        : [],
    }
  }

  private async voteMap(viewer: User | null, comments: Comment[]) {
    await cosmetics.ready()
    const ids = comments.flatMap((comment) => [
      comment.id,
      ...(comment.$preloaded.replies ? comment.replies.map((reply) => reply.id) : []),
    ])
    if (!viewer || !ids.length) return new Map<number, number>()
    const rows = await CommentLike.query().where('userId', viewer.id).whereIn('commentId', ids)
    return new Map(rows.map((row) => [row.commentId, Number(row.value) < 0 ? -1 : 1]))
  }

  /** Thread totals: all comments, top-level ones and replies. */
  async counts(thread: Thread) {
    const query = db
      .from('comments')
      .where('series_id', thread.seriesId)
      .whereNull('deleted_at')
      .select(db.raw('case when parent_id is null then 0 else 1 end as is_reply'))
      .count('* as total')
      .groupByRaw('case when parent_id is null then 0 else 1 end')
    if (thread.chapterId) query.where('chapter_id', thread.chapterId)
    else query.whereNull('chapter_id')
    const rows = await query
    const roots = Number(rows.find((row) => Number(row.is_reply) === 0)?.total || 0)
    const replies = Number(rows.find((row) => Number(row.is_reply) === 1)?.total || 0)
    return { total: roots + replies, roots, replies }
  }

  async total(thread: Thread) {
    const query = db
      .from('comments')
      .where('series_id', thread.seriesId)
      .whereNull('deleted_at')
      .count('* as total')
    if (thread.chapterId) query.where('chapter_id', thread.chapterId)
    else query.whereNull('chapter_id')
    const [row] = await query
    return Number(row.total)
  }

  async topLevel(thread: Thread, sort: CommentSort, page: number, viewer: User | null) {
    const query = Comment.query()
      .where('seriesId', thread.seriesId)
      .whereNull('parentId')
      .preload('user')
      .preload('replies', (replies) =>
        replies
          .preload('user')
          .preload('parent', (parent) => parent.preload('user'))
          .groupOrderBy('created_at', 'asc')
          .groupLimit(replyPreviewSize)
      )
    if (thread.chapterId) query.where('chapterId', thread.chapterId)
    else query.whereNull('chapterId')
    // Deleted top-level comments only stay visible while they still have replies.
    query.where((builder) => builder.whereNull('deletedAt').orWhere('replyCount', '>', 0))
    if (sort === 'top')
      query.orderByRaw('(like_count - dislike_count) desc').orderBy('replyCount', 'desc')
    query.orderBy('createdAt', 'desc').orderBy('id', 'desc')

    const result = await query.paginate(page, commentPageSize)
    const comments = result.all()
    const votes = await this.voteMap(viewer, comments)
    const counts = await this.counts(thread)
    return {
      items: comments.map((comment) => this.serialize(comment, viewer, votes)),
      hasMore: result.hasMorePages,
      total: counts.total,
      roots: counts.roots,
      replies: counts.replies,
    }
  }

  async replies(parentId: number, page: number, viewer: User | null) {
    const result = await Comment.query()
      .where('parentId', parentId)
      .preload('user')
      .preload('parent', (parent) => parent.preload('user'))
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .paginate(page, commentPageSize)
    const comments = result.all()
    const votes = await this.voteMap(viewer, comments)
    return {
      items: comments.map((comment) => this.serialize(comment, viewer, votes)),
      hasMore: result.hasMorePages,
    }
  }

  async create(
    user: User,
    thread: Thread,
    data: {
      body: string
      spoiler: boolean
      image: string | null
      stickerId: number | null
      parent: Comment | null
      link: string
    }
  ) {
    const timestamp = now()
    const comment = await db.transaction(async (trx) => {
      const created = await Comment.create(
        {
          userId: user.id,
          seriesId: thread.seriesId,
          chapterId: thread.chapterId,
          parentId: data.parent?.id ?? null,
          rootId: data.parent ? (data.parent.rootId ?? data.parent.id) : null,
          depth: data.parent ? data.parent.depth + 1 : 0,
          body: data.body,
          image: data.image,
          stickerId: data.stickerId,
          spoiler: data.spoiler,
          likeCount: 0,
          dislikeCount: 0,
          replyCount: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        { client: trx }
      )
      if (data.parent)
        await trx.from('comments').where('id', data.parent.id).increment('reply_count', 1)
      return created
    })
    await progress.commented(user)
    await comment.load('user')
    if (comment.parentId) await comment.load('parent', (parent) => parent.preload('user'))
    const parentAuthor = data.parent ? comment.parent?.user : null
    if (parentAuthor && parentAuthor.id !== user.id && !data.parent?.deletedAt)
      await notifications.notify(parentAuthor.id, 'activity', {
        title: `${user.fullName} yorumuna yanıt verdi`,
        body: data.body
          ? data.body.slice(0, 140)
          : data.stickerId
            ? 'Bir çıkartma gönderdi.'
            : 'Bir görsel gönderdi.',
        link: data.link,
      })
    await cosmetics.ready()
    return this.serialize(comment, user, new Map())
  }

  /** Up/down vote. Sending the current vote again removes it. */
  async vote(user: User, comment: Comment, value: 1 | -1) {
    const result = await db.transaction(async (trx) => {
      const existing = await CommentLike.query({ client: trx })
        .where({ userId: user.id, commentId: comment.id })
        .first()
      const previous = existing ? (Number(existing.value) < 0 ? -1 : 1) : 0
      const next = previous === value ? 0 : value
      const column = (vote: number) => (vote > 0 ? 'like_count' : 'dislike_count')
      if (previous)
        await trx
          .from('comments')
          .where('id', comment.id)
          .where(column(previous), '>', 0)
          .decrement(column(previous), 1)
      if (next) await trx.from('comments').where('id', comment.id).increment(column(next), 1)
      if (existing && !next) await existing.useTransaction(trx).delete()
      else if (existing) {
        existing.value = next
        await existing.useTransaction(trx).save()
      } else
        await CommentLike.create(
          { userId: user.id, commentId: comment.id, value: next, createdAt: now() },
          { client: trx }
        )
      const fresh = await trx
        .from('comments')
        .where('id', comment.id)
        .select('like_count', 'dislike_count')
        .first()
      return {
        vote: next,
        liked: next > 0,
        likeCount: Number(fresh.like_count),
        dislikeCount: Number(fresh.dislike_count),
      }
    })
    if (result.vote > 0 && comment.userId !== user.id) {
      const author = await User.find(comment.userId)
      if (author) await progress.evaluate(author)
    }
    return result
  }

  /** Leaves with no replies disappear; comments with replies keep their place as "silindi". */
  async remove(comment: Comment) {
    const image = comment.image
    const mode = await db.transaction(async (trx) => {
      if (comment.replyCount > 0) {
        await trx
          .from('comments')
          .where('id', comment.id)
          .update({ deleted_at: now(), body: '', image: null, spoiler: false })
        return 'soft' as const
      }
      await trx.from('comments').where('id', comment.id).delete()
      if (comment.parentId)
        await trx
          .from('comments')
          .where('id', comment.parentId)
          .where('reply_count', '>', 0)
          .decrement('reply_count', 1)
      return 'hard' as const
    })
    await removeContentFile(image)
    return mode
  }

  /** Newest visible comments across the site, for the home page. */
  async latest(limit = 6) {
    await cosmetics.ready()
    return (
      Comment.query()
        .whereNull('deletedAt')
        .where('spoiler', false)
        .where((query) =>
          query.where('body', '!=', '').orWhereNotNull('stickerId').orWhereNotNull('image')
        )
        // Drafts and comments under restricted chapters stay off the home page.
        .whereHas('series', (series) => series.where('draft', false).where('access', 'public'))
        .where((query) =>
          query
            .whereNull('chapterId')
            .orWhereHas('chapter', (chapter) =>
              chapter.where('draft', false).where('access', 'public')
            )
        )
        .preload('user')
        .preload('series', (series) => series.preload('contentType'))
        .preload('chapter')
        .preload('parent', (parent) => parent.preload('user'))
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .limit(limit)
    )
  }

  async recentByUser(userId: number, limit = 10) {
    return Comment.query()
      .where('userId', userId)
      .whereNull('deletedAt')
      .preload('series', (series) => series.preload('contentType'))
      .preload('chapter')
      .preload('user')
      .preload('parent', (parent) => parent.preload('user'))
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
  }
}

export default new CommentService()
