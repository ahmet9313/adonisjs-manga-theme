import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import cosmetics from '#services/cosmetic_service'

/** "YYYY-MM-DD HH:mm:ss" (UTC, the database format) of `days` days ago. */
function since(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace('T', ' ')
}

/** Read-only figures for the home page: the most active readers and the genre index. */
class CommunityStatsService {
  /**
   * Members who read the most chapters in the last `days` days (suspended accounts are left
   * out). Each entry carries the user (with the columns lookOf() needs), the number of chapters
   * and of distinct series read in that period.
   */
  async topReaders(days = 30, limit = 8) {
    const rows = await db
      .from('chapter_reads')
      .join('users', 'users.id', 'chapter_reads.user_id')
      .whereNull('users.banned_at')
      .where('chapter_reads.read_at', '>=', since(days))
      .groupBy('chapter_reads.user_id')
      .select('chapter_reads.user_id')
      .count('* as chapters')
      .countDistinct('chapter_reads.series_id as series_total')
      .orderBy('chapters', 'desc')
      .orderBy('chapter_reads.user_id', 'asc')
      .limit(limit)
    if (!rows.length) return []

    await cosmetics.ready()
    const users = await User.query().whereIn(
      'id',
      rows.map((row) => Number(row.user_id))
    )
    const byId = new Map(users.map((user) => [user.id, user]))
    return rows.flatMap((row) => {
      const user = byId.get(Number(row.user_id))
      return user
        ? [{ user, chapters: Number(row.chapters), series: Number(row.series_total) }]
        : []
    })
  }

  /** Genres that have at least one series, the largest first (catalog links with counts). */
  async genres(limit = 30) {
    const rows = await db
      .from('genres')
      .join('series_genres', 'series_genres.genre_id', 'genres.id')
      .groupBy('genres.id', 'genres.name')
      .select('genres.name')
      .countDistinct('series_genres.series_id as total')
      .orderBy('total', 'desc')
      .orderBy('genres.name', 'asc')
      .limit(limit)
    return rows.map((row) => ({ name: String(row.name), total: Number(row.total) }))
  }
}

export default new CommunityStatsService()
