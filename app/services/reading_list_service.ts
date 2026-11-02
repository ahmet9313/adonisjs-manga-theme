import db from '@adonisjs/lucid/services/db'
import type User from '#models/user'
import type { AccessLevel, LibraryStatus } from '#config/site'
import { libraryStatusKeys } from '#config/site'
import access from '#services/access_service'
import { now } from '#services/input_service'

/** The series fields the access rules need. */
interface SeriesRules {
  id: number
  draft: boolean
  access: AccessLevel
  ageRating: string | null
}

/** "YYYY-MM-DD HH:mm:ss" (UTC, the database format) of a millisecond timestamp. */
const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

/**
 * Reading statuses of saved series and read marks made by hand ("Okundu işaretle",
 * "Tümünü okundu işaretle"). Hand-made marks are `chapter_reads` rows with `marked = true`: they
 * never give EXP, cards or badges (progress_service counts only opened chapters), and a chapter
 * opened before and marked unread later is remembered in `unmarked_reads` so opening it again
 * gives no second reward. Drafts and chapters the account may not open are never marked.
 */
class ReadingListService {
  isStatus(value: unknown): value is LibraryStatus {
    return typeof value === 'string' && (libraryStatusKeys as string[]).includes(value)
  }

  /** Saves the series with this status, or changes the status of the existing bookmark. */
  async setStatus(userId: number, seriesId: number, status: LibraryStatus) {
    const updated = await db
      .from('bookmarks')
      .where({ user_id: userId, series_id: seriesId })
      .update({ status })
    if (Number(updated)) return
    try {
      await db
        .table('bookmarks')
        .insert({ user_id: userId, series_id: seriesId, status, created_at: now() })
    } catch {
      // A parallel request saved it first; the unique index holds one row, which gets the status.
      await db.from('bookmarks').where({ user_id: userId, series_id: seriesId }).update({ status })
    }
  }

  /** Numbers of the listed chapters this visitor may mark: published and open to them. */
  markable(
    user: User | null | undefined,
    series: Omit<SeriesRules, 'id'>,
    chapters: { number: number; draft?: boolean; access?: AccessLevel }[]
  ) {
    if (series.draft) return []
    return chapters
      .filter(
        (chapter) =>
          !chapter.draft && access.allows(user, access.effectiveAccess({ series, chapter }))
      )
      .map((chapter) => chapter.number)
  }

  private async seriesRules(seriesId: number): Promise<SeriesRules | null> {
    const row = await db
      .from('series')
      .where('id', seriesId)
      .select('id', 'draft', 'access', 'age_rating')
      .first()
    if (!row) return null
    return {
      id: row.id,
      draft: Boolean(row.draft),
      access: (row.access || 'public') as AccessLevel,
      ageRating: row.age_rating,
    }
  }

  /** Chapters (id, number) of the series the user may mark, oldest first. */
  private async markableChapters(user: User, seriesId: number, numbers?: number[]) {
    const series = await this.seriesRules(seriesId)
    if (!series || series.draft) return []
    const rows = await db
      .from('chapters')
      .where('series_id', seriesId)
      .where('draft', false)
      .if(numbers, (query) => query.whereIn('number', numbers!))
      .orderBy('number', 'asc')
      .select('id', 'number', 'access')
    return rows
      .filter((row) =>
        access.allows(
          user,
          access.effectiveAccess({ series, chapter: { access: row.access || 'public' } })
        )
      )
      .map((row) => ({ id: Number(row.id), number: Number(row.number) }))
  }

  /** Read chapter numbers of the series, most recent first (the shape of ReadingState.read). */
  private async readNumbers(userId: number, seriesId: number) {
    const rows = await db
      .from('chapter_reads')
      .join('chapters', 'chapters.id', 'chapter_reads.chapter_id')
      .where('chapter_reads.user_id', userId)
      .where('chapter_reads.series_id', seriesId)
      .orderBy('chapter_reads.read_at', 'desc')
      .orderBy('chapter_reads.id', 'desc')
      .select('chapters.number')
    return rows.map((row) => Number(row.number))
  }

  /**
   * "Tümünü okundu işaretle": every published chapter the user may open becomes read, in one
   * transaction with batched inserts. The new marks are dated just now, oldest chapter first, and
   * the newest chapter becomes the last read one. Returns the series' read list afterwards.
   */
  async markAll(user: User, seriesId: number) {
    const chapters = await this.markableChapters(user, seriesId)
    let added = 0
    if (chapters.length) {
      // A parallel "mark all" may insert the same rows first (unique index); its result stands.
      await db
        .transaction(async (trx) => {
          const existing = await trx
            .from('chapter_reads')
            .where({ user_id: user.id, series_id: seriesId })
            .select('chapter_id', 'read_at')
          const known = new Set(existing.map((row) => Number(row.chapter_id)))
          const fresh = chapters.filter((chapter) => !known.has(chapter.id))
          // Times are stored to the second: the newest chapter gets a time later than every read
          // of the series, even one made a moment ago, so it is the last read one afterwards.
          const latest = existing.reduce<number>(
            (max, row) =>
              Math.max(max, Date.parse(String(row.read_at).replace(' ', 'T') + 'Z') || 0),
            0
          )
          const top = Math.max(Date.now(), latest + 1000)
          const base = top - (fresh.length + 1) * 1000
          const rows = fresh.map((chapter, index) => ({
            user_id: user.id,
            series_id: seriesId,
            chapter_id: chapter.id,
            read_at: stamp(base + index * 1000),
            marked: true,
          }))
          for (let start = 0; start < rows.length; start += 200)
            await trx.table('chapter_reads').insert(rows.slice(start, start + 200))
          added = rows.length
          if (rows.length)
            await trx
              .from('chapter_reads')
              .where({ user_id: user.id, chapter_id: chapters[chapters.length - 1].id })
              .update({ read_at: stamp(top) })
        })
        .catch(() => {
          added = 0
        })
    }
    return { added, read: await this.readNumbers(user.id, seriesId) }
  }

  /**
   * "Okundu işaretle" / "Okunmadı olarak işaretle" for one chapter. Null when the chapter does
   * not exist or the user may not open it. Unmarking an opened chapter remembers it, so opening
   * it again gives no second read reward.
   */
  async setRead(user: User, seriesId: number, number: number, read: boolean) {
    const [chapter] = await this.markableChapters(user, seriesId, [number])
    if (!chapter) return null
    await db.transaction(async (trx) => {
      const row = await trx
        .from('chapter_reads')
        .where({ user_id: user.id, chapter_id: chapter.id })
        .select('id', 'marked')
        .first()
      if (read && !row) {
        try {
          await trx.table('chapter_reads').insert({
            user_id: user.id,
            series_id: seriesId,
            chapter_id: chapter.id,
            read_at: now(),
            marked: true,
          })
        } catch {
          // A parallel request marked it first.
        }
      } else if (!read && row) {
        await trx.from('chapter_reads').where('id', row.id).delete()
        if (!row.marked) {
          const seen = await trx
            .from('unmarked_reads')
            .where({ user_id: user.id, chapter_id: chapter.id })
            .first()
          if (!seen)
            await trx
              .table('unmarked_reads')
              .insert({ user_id: user.id, chapter_id: chapter.id, created_at: now() })
        }
      }
    })
    return { read, chapters: await this.readNumbers(user.id, seriesId) }
  }

  /** True when the user opened this chapter before and marked it unread later. */
  async wasUnmarked(userId: number, chapterId: number) {
    const row = await db
      .from('unmarked_reads')
      .where({ user_id: userId, chapter_id: chapterId })
      .select('id')
      .first()
    return Boolean(row)
  }
}

export default new ReadingListService()
