import db from '@adonisjs/lucid/services/db'
import Bookmark from '#models/bookmark'
import ChapterRead from '#models/chapter_read'
import Chapter from '#models/chapter'
import SeriesModel from '#models/series'
import ContentType from '#models/content_type'
import { now } from '#services/input_service'
import { coverView, type CoverSource } from '#services/cover_policy_service'
import access from '#services/access_service'

/** Most chapters one library hand-over may write (see importLocal). */
const importLimit = 5000
import type User from '#models/user'

/** Cover fields of a library row as the current visitor may see them (no banner here). */
function veiled(series: CoverSource) {
  // Fields one by one: a Lucid model keeps its columns behind getters, which a spread drops.
  const view = coverView({
    coverImage: series.coverImage,
    bannerImage: null,
    ageRating: series.ageRating,
    coverMode: series.coverMode,
  })
  return { coverImage: view.coverImage, coverVeil: view.coverVeil }
}

export interface ReadingState {
  bookmarked: boolean
  read: number[]
  last: number | null
}

export interface LibraryImport {
  bookmarks?: { type: string; slug: string }[]
  reads?: { type: string; slug: string; chapters: number[] }[]
}

/** Account library: bookmarks and reading history. Guests keep the same data in localStorage. */
class LibraryService {
  async findSeriesId(type: string, slug: string): Promise<number | null> {
    const row = await db
      .from('series')
      .join('content_types', 'content_types.id', 'series.content_type_id')
      .where('content_types.slug', type)
      .where('series.slug', slug)
      .where('series.draft', false)
      .select('series.id')
      .first()
    return row?.id ?? null
  }

  async state(userId: number, seriesId: number): Promise<ReadingState> {
    const [bookmark, reads] = await Promise.all([
      Bookmark.query().where({ userId, seriesId }).first(),
      db
        .from('chapter_reads')
        .join('chapters', 'chapters.id', 'chapter_reads.chapter_id')
        .where('chapter_reads.user_id', userId)
        .where('chapter_reads.series_id', seriesId)
        .orderBy('chapter_reads.read_at', 'desc')
        .orderBy('chapter_reads.id', 'desc')
        .select('chapters.number'),
    ])
    const read = reads.map((row) => Number(row.number))
    return { bookmarked: Boolean(bookmark), read, last: read[0] ?? null }
  }

  /** Returns true when this is the reader's first visit to the chapter. */
  async recordRead(userId: number, seriesId: number, chapterId: number) {
    const readAt = now()
    const existing = await ChapterRead.query().where({ userId, chapterId }).first()
    if (existing) {
      existing.merge({ seriesId, readAt })
      await existing.save()
      return false
    }
    try {
      await ChapterRead.create({ userId, chapterId, seriesId, readAt })
      return true
    } catch {
      // A parallel request inserted the same row first; the unique index already holds it.
      return false
    }
  }

  /** Reading history: one row per series, most recently read first. */
  async history(userId: number, limit = 60) {
    const rows = await db
      .from('chapter_reads')
      .join('chapters', 'chapters.id', 'chapter_reads.chapter_id')
      .join('series', 'series.id', 'chapter_reads.series_id')
      .join('content_types', 'content_types.id', 'series.content_type_id')
      .where('chapter_reads.user_id', userId)
      .where('series.draft', false)
      .where('chapters.draft', false)
      .orderBy('chapter_reads.read_at', 'desc')
      .orderBy('chapter_reads.id', 'desc')
      .limit(2000)
      .select(
        'chapter_reads.series_id',
        'chapter_reads.read_at',
        'chapters.number',
        'series.title',
        'series.slug',
        'series.cover_image',
        'series.age_rating',
        'series.cover_mode',
        'content_types.slug as type',
        'content_types.format'
      )
    const seen = new Map<number, Record<string, any>>()
    const counts = new Map<number, number>()
    for (const row of rows) {
      counts.set(row.series_id, (counts.get(row.series_id) ?? 0) + 1)
      if (!seen.has(row.series_id)) seen.set(row.series_id, row)
    }
    return [...seen.values()].slice(0, limit).map((row) => ({
      type: row.type as string,
      video: row.format === 'video',
      slug: row.slug as string,
      title: row.title as string,
      ...veiled({
        coverImage: row.cover_image,
        ageRating: row.age_rating,
        coverMode: row.cover_mode,
      }),
      lastRead: Number(row.number),
      readCount: counts.get(row.series_id) ?? 0,
      readAt: `${String(row.read_at).replace(' ', 'T')}Z`,
    }))
  }

  async toggleBookmark(userId: number, seriesId: number): Promise<boolean> {
    const existing = await Bookmark.query().where({ userId, seriesId }).first()
    if (existing) {
      await existing.delete()
      return false
    }
    try {
      await Bookmark.create({ userId, seriesId, createdAt: now() })
    } catch {
      // Double click: the bookmark already exists.
    }
    return true
  }

  async removeBookmark(userId: number, seriesId: number) {
    await Bookmark.query().where({ userId, seriesId }).delete()
  }

  /** Bookmarked series with the last read and the latest chapter, newest bookmark first. */
  async list(userId: number) {
    const bookmarks = await Bookmark.query()
      .where('userId', userId)
      // A series turned back into a draft disappears from the list until it is published again.
      .whereHas('series', (series) => series.where('draft', false))
      .preload('series', (series) =>
        series
          .preload('contentType')
          .withAggregate('chapters', (chapters) =>
            chapters.where('draft', false).max('number').as('latestChapter')
          )
      )
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
    const seriesIds = bookmarks.map((bookmark) => bookmark.seriesId)
    const lastRead = new Map<number, number>()
    if (seriesIds.length) {
      const rows = await db
        .from('chapter_reads')
        .join('chapters', 'chapters.id', 'chapter_reads.chapter_id')
        .where('chapter_reads.user_id', userId)
        .whereIn('chapter_reads.series_id', seriesIds)
        .orderBy('chapter_reads.read_at', 'desc')
        .orderBy('chapter_reads.id', 'desc')
        .select('chapter_reads.series_id', 'chapters.number')
      for (const row of rows)
        if (!lastRead.has(row.series_id)) lastRead.set(row.series_id, Number(row.number))
    }
    return bookmarks.map(({ series }) => ({
      key: `bookmark:${series.contentType.slug}:${series.slug}`,
      type: series.contentType.slug,
      slug: series.slug,
      title: series.title,
      ...veiled(series),
      lastRead: lastRead.get(series.id) ?? null,
      latestChapter:
        series.$extras.latestChapter === null ? null : Number(series.$extras.latestChapter),
    }))
  }

  /**
   * Current cover (as this visitor may see it), title and newest chapter of series saved in a
   * guest's browser, which stores them only as they were when saved. Drafts are left out.
   */
  async savedSeries(items: { type: string; slug: string }[]) {
    if (!items.length) return []
    const types = await ContentType.query().whereIn('slug', [...new Set(items.map((i) => i.type))])
    const slugOf = new Map(types.map((type) => [type.id, type.slug]))
    const rows = await SeriesModel.query()
      .whereIn('contentTypeId', [...slugOf.keys()])
      .whereIn('slug', [...new Set(items.map((item) => item.slug))])
      .where('draft', false)
      .select('id', 'slug', 'title', 'contentTypeId', 'coverImage', 'ageRating', 'coverMode')
      .withAggregate('chapters', (chapters) =>
        chapters.where('draft', false).max('number').as('latestChapter')
      )
    const wanted = new Set(items.map((item) => `${item.type}/${item.slug}`))
    return rows
      .map((series) => ({
        type: slugOf.get(series.contentTypeId)!,
        slug: series.slug,
        title: series.title,
        ...veiled(series),
        latestChapter:
          series.$extras.latestChapter === null ? null : Number(series.$extras.latestChapter),
      }))
      .filter((item) => wanted.has(`${item.type}/${item.slug}`))
  }

  /**
   * Moves a guest's localStorage library into the account without overwriting newer reads.
   * Only what the account may open is taken (no drafts, no members-only/VIP chapters it cannot
   * read), at most `importLimit` chapters, with a few set-based queries so the single SQLite
   * connection is not held for long.
   */
  async importLocal(user: User, data: LibraryImport) {
    const userId = user.id
    const wanted = [...(data.bookmarks || []), ...(data.reads || [])]
    if (!wanted.length) return { bookmarks: 0, reads: 0 }
    const types = await ContentType.query().whereIn('slug', [
      ...new Set(wanted.map((item) => item.type)),
    ])
    const typeIds = new Map(types.map((type) => [type.slug, type.id]))
    const series = await SeriesModel.query()
      .whereIn('contentTypeId', [...typeIds.values()])
      .whereIn('slug', [...new Set(wanted.map((item) => item.slug))])
      .where('draft', false)
      .select('id', 'slug', 'contentTypeId', 'access', 'draft', 'ageRating')
    const find = (type: string, slug: string) =>
      series.find((item) => item.slug === slug && item.contentTypeId === typeIds.get(type))

    let bookmarks = 0
    let reads = 0
    let budget = importLimit
    await db.transaction(async (trx) => {
      const timestamp = now()
      const savedRows = await trx
        .from('bookmarks')
        .where('user_id', userId)
        .whereIn(
          'series_id',
          series.map((item) => item.id)
        )
        .select('series_id')
      const saved = new Set(savedRows.map((row) => row.series_id as number))
      const newBookmarks = (data.bookmarks || [])
        .map((item) => find(item.type, item.slug)?.id)
        .filter((id): id is number => {
          if (!id || saved.has(id)) return false
          saved.add(id)
          return true
        })
      if (newBookmarks.length) {
        await trx
          .table('bookmarks')
          .insert(
            newBookmarks.map((id) => ({ user_id: userId, series_id: id, created_at: timestamp }))
          )
        bookmarks = newBookmarks.length
      }

      for (const item of data.reads || []) {
        const target = find(item.type, item.slug)
        if (!target || !item.chapters.length || budget <= 0) continue
        const numbers = item.chapters.slice(-budget)
        const found = await Chapter.query({ client: trx })
          .where('seriesId', target.id)
          .whereIn('number', numbers)
          .where('draft', false)
          .select('id', 'number', 'access')
        const chapters = found.filter((chapter) =>
          access.allows(user, access.effectiveAccess({ series: target, chapter }))
        )
        const existing = await ChapterRead.query({ client: trx })
          .where({ userId, seriesId: target.id })
          .select('chapterId', 'readAt')
        const known = new Set(existing.map((row) => row.chapterId))
        // Imported chapters keep their local order (last entry = most recent) but never become
        // newer than reads the account already has.
        const order = new Map(numbers.map((number, index) => [number, index]))
        const fresh = chapters
          .filter((chapter) => !known.has(chapter.id))
          .sort((a, b) => (order.get(a.number) ?? 0) - (order.get(b.number) ?? 0))
        const oldest = existing.reduce<number>(
          (min, row) =>
            Math.min(min, Date.parse(String(row.readAt).replace(' ', 'T') + 'Z') || min),
          Date.now()
        )
        const base = oldest - (fresh.length + 1) * 1000
        const rows = fresh.map((chapter, index) => ({
          user_id: userId,
          series_id: target.id,
          chapter_id: chapter.id,
          read_at: new Date(base + index * 1000).toISOString().slice(0, 19).replace('T', ' '),
        }))
        for (let start = 0; start < rows.length; start += 200)
          await trx.table('chapter_reads').insert(rows.slice(start, start + 200))
        reads += rows.length
        budget -= numbers.length
      }
    })
    return { bookmarks, reads }
  }
}

export default new LibraryService()
