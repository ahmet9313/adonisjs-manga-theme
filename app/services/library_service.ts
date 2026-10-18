import db from '@adonisjs/lucid/services/db'
import Bookmark from '#models/bookmark'
import ChapterRead from '#models/chapter_read'
import Chapter from '#models/chapter'
import SeriesModel from '#models/series'
import ContentType from '#models/content_type'
import { now } from '#services/input_service'

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
      coverImage: String(row.cover_image || '').startsWith('/')
        ? row.cover_image
        : '/images/no-cover.svg',
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
      coverImage: series.coverImage?.startsWith('/') ? series.coverImage : '/images/no-cover.svg',
      lastRead: lastRead.get(series.id) ?? null,
      latestChapter:
        series.$extras.latestChapter === null ? null : Number(series.$extras.latestChapter),
    }))
  }

  /** Moves a guest's localStorage library into the account without overwriting newer reads. */
  async importLocal(userId: number, data: LibraryImport) {
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
      .select('id', 'slug', 'contentTypeId')
    const seriesId = (type: string, slug: string) =>
      series.find((item) => item.slug === slug && item.contentTypeId === typeIds.get(type))?.id

    let bookmarks = 0
    let reads = 0
    await db.transaction(async (trx) => {
      const timestamp = now()
      for (const item of data.bookmarks || []) {
        const id = seriesId(item.type, item.slug)
        if (!id) continue
        const exists = await Bookmark.query({ client: trx }).where({ userId, seriesId: id }).first()
        if (exists) continue
        await Bookmark.create({ userId, seriesId: id, createdAt: timestamp }, { client: trx })
        bookmarks++
      }
      for (const item of data.reads || []) {
        const id = seriesId(item.type, item.slug)
        if (!id || !item.chapters.length) continue
        const chapters = await Chapter.query({ client: trx })
          .where('seriesId', id)
          .whereIn('number', item.chapters)
          .where('draft', false)
          .select('id', 'number')
        const existing = await ChapterRead.query({ client: trx })
          .where({ userId, seriesId: id })
          .select('chapterId', 'readAt')
        const known = new Set(existing.map((row) => row.chapterId))
        // Imported chapters keep their local order (last entry = most recent) but never become
        // newer than reads the account already has.
        const order = new Map(item.chapters.map((number, index) => [number, index]))
        const fresh = chapters
          .filter((chapter) => !known.has(chapter.id))
          .sort((a, b) => (order.get(a.number) ?? 0) - (order.get(b.number) ?? 0))
        const oldest = existing.reduce<number>(
          (min, row) =>
            Math.min(min, Date.parse(String(row.readAt).replace(' ', 'T') + 'Z') || min),
          Date.now()
        )
        const base = oldest - (fresh.length + 1) * 1000
        for (const [index, chapter] of fresh.entries()) {
          const readAt = new Date(base + index * 1000).toISOString().slice(0, 19).replace('T', ' ')
          await ChapterRead.create(
            { userId, seriesId: id, chapterId: chapter.id, readAt },
            { client: trx }
          )
          reads++
        }
      }
    })
    return { bookmarks, reads }
  }
}

export default new LibraryService()
