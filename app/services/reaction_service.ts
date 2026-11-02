import db from '@adonisjs/lucid/services/db'
import site from '#config/site'
import { now } from '#services/input_service'

export type ReactionKey = (typeof site.chapterReactions)[number]['key']

export const reactionKeys = site.chapterReactions.map((reaction) => reaction.key) as ReactionKey[]
export const isReaction = (value: unknown): value is ReactionKey =>
  typeof value === 'string' && (reactionKeys as string[]).includes(value)

export interface ReactionSummary {
  /** Count per reaction key (every key present, 0 when nobody chose it). */
  counts: Record<string, number>
  total: number
  /** The viewer's reaction, or null. */
  mine: ReactionKey | null
}

/**
 * "Bölüm nasıldı?": one reaction per member and chapter, changeable and removable. Counts are a
 * grouped query on the (chapter_id, user_id) unique index, so nothing denormalised can drift.
 */
class ReactionService {
  async summary(chapterId: number, userId: number | null = null): Promise<ReactionSummary> {
    const rows = await db
      .from('chapter_reactions')
      .where('chapter_id', chapterId)
      .select('reaction')
      .count('* as total')
      .groupBy('reaction')
    const counts: Record<string, number> = Object.fromEntries(reactionKeys.map((key) => [key, 0]))
    for (const row of rows) if (isReaction(row.reaction)) counts[row.reaction] = Number(row.total)
    let mine: ReactionKey | null = null
    if (userId) {
      const own = await db
        .from('chapter_reactions')
        .where({ chapter_id: chapterId, user_id: userId })
        .select('reaction')
        .first()
      mine = own && isReaction(own.reaction) ? own.reaction : null
    }
    return { counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0), mine }
  }

  /** Sets the member's reaction (idempotent); null removes it. */
  async set(userId: number, chapterId: number, reaction: ReactionKey | null) {
    try {
      await this.write(userId, chapterId, reaction)
    } catch (error) {
      // A parallel first reaction of the same member hit the unique index; the row exists now.
      await this.write(userId, chapterId, reaction).catch(() => Promise.reject(error))
    }
    return this.summary(chapterId, userId)
  }

  private async write(userId: number, chapterId: number, reaction: ReactionKey | null) {
    await db.transaction(async (trx) => {
      const existing = await trx
        .from('chapter_reactions')
        .where({ chapter_id: chapterId, user_id: userId })
        .select('id', 'reaction')
        .first()
      if (existing?.reaction === reaction) return
      if (!reaction) {
        if (existing) await trx.from('chapter_reactions').where('id', existing.id).delete()
        return
      }
      const timestamp = now()
      if (existing)
        await trx
          .from('chapter_reactions')
          .where('id', existing.id)
          .update({ reaction, updated_at: timestamp })
      else
        await trx.table('chapter_reactions').insert({
          chapter_id: chapterId,
          user_id: userId,
          reaction,
          created_at: timestamp,
          updated_at: timestamp,
        })
    })
  }
}

export default new ReactionService()
