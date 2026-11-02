import SeriesModel from '#models/series'
import ContentType from '#models/content_type'
import Genre from '#models/genre'
import Chapter from '#models/chapter'

import { serializeSeries, serializeChapter, calculateTimeAgo } from '#services/series_presenter'
import type { SeriesInfo, ChapterInfo, ChapterWithPages } from '#services/series_presenter'
import { episodeVideo } from '#services/video_service'
import views from '#services/view_service'
import { applyDiscoveryFilters, orderByMatch, whereMatches } from '#services/discovery_service'
import type { DiscoveryFilters } from '#services/discovery_service'

/**
 * Published series with their relations; `drafts` (staff previews) also finds drafts. Authors
 * and artists are only shown on the series page, so lists skip them (`people`).
 */
function baseSeriesQuery({ drafts = false, people = false } = {}) {
  return SeriesModel.query()
    .if(!drafts, (query) => query.where('draft', false))
    .preload('contentType')
    .preload('genres')
    .if(people, (query) => query.preload('authors').preload('artists'))
}

/** Staff previews see drafts; everyone else gets published series and chapters only. */
interface Visibility {
  drafts?: boolean
}

class SeriesService {
  private async getContentTypeId(type: string): Promise<number | null> {
    const ct = await ContentType.findBy('slug', type)
    return ct?.id ?? null
  }

  /** `people: false` skips authors and artists (the reader does not show them). */
  async getSeriesBySlug(
    type: string,
    slug: string,
    { drafts = false, people = true }: Visibility & { people?: boolean } = {}
  ): Promise<SeriesInfo | null> {
    const ctId = await this.getContentTypeId(type)
    if (!ctId) return null

    const series = await baseSeriesQuery({ drafts, people })
      .where('contentTypeId', ctId)
      .where('slug', slug)
      .first()

    if (!series) return null
    return serializeSeries(series)
  }

  /** Chapter list (newest first) of a series already looked up by the caller. */
  async getChaptersOf(
    seriesId: number,
    { drafts = false }: Visibility = {}
  ): Promise<ChapterInfo[]> {
    const chapters = await Chapter.query()
      .select('id', 'seriesId', 'number', 'title', 'publishedAt', 'access', 'draft', 'viewCount')
      .where('seriesId', seriesId)
      .if(!drafts, (query) => query.where('draft', false))
      .orderBy('number', 'desc')

    return chapters.map(serializeChapter)
  }

  /** One chapter with its pages, text or video sources, of a series the caller already has. */
  async getChapterOf(
    seriesId: number,
    chapterNum: number,
    { drafts = false }: Visibility = {}
  ): Promise<ChapterWithPages | null> {
    const chapter = await Chapter.query()
      .where('seriesId', seriesId)
      .where('number', chapterNum)
      .if(!drafts, (query) => query.where('draft', false))
      .first()

    if (!chapter) return null

    const content = chapter.content
    const result: ChapterWithPages = {
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      publishedAt: chapter.publishedAt,
      timeAgo: calculateTimeAgo(chapter.publishedAt),
      access: chapter.access || 'public',
      draft: Boolean(chapter.draft),
      warning: chapter.warning || null,
      pages: [],
    }

    if (content.type === 'images') {
      result.pages = content.pages
    } else if (content.type === 'text') {
      result.textContent = content.text
    } else if (content.type === 'video') {
      result.video = episodeVideo(content.sources)
    }

    return result
  }

  async getFeaturedSeries(): Promise<SeriesInfo[]> {
    const featured = await baseSeriesQuery()
      .where('featured', true)
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')
      .limit(10)
    return featured.map(serializeSeries)
  }

  async getRecentlyUpdated(page = 1, perPage = 15) {
    const results = await baseSeriesQuery()
      .preload('chapters', (query) =>
        query
          .select('id', 'seriesId', 'number', 'title', 'publishedAt', 'access', 'draft')
          .where('draft', false)
          .groupOrderBy('number', 'desc')
          .groupLimit(3)
      )
      // Pinned series (admin series form) stay on top of the list.
      .orderBy('pinned', 'desc')
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')
      .paginate(page, perPage)
    return {
      items: results.all().map((series) => ({
        ...serializeSeries(series),
        pinned: Boolean(series.pinned),
        latestChapters: series.chapters.map(serializeChapter),
      })),
      hasNextPage: results.hasMorePages,
      totalPages: results.lastPage,
    }
  }

  async filterSeries(
    filters: Partial<DiscoveryFilters> & {
      genres?: string[]
      statuses?: string[]
      types?: string[]
      authors?: string[]
      artists?: string[]
      search?: string
      orderBy?: string
    },
    page = 1,
    perPage = 24
  ) {
    const query = baseSeriesQuery()

    // Genres (include/exclude, VE/VEYA), years, minimum chapters and the text search.
    applyDiscoveryFilters(query, filters)
    if (filters.statuses && filters.statuses.length > 0) {
      query.whereIn('status', filters.statuses)
    }
    if (filters.types && filters.types.length > 0) {
      const ctIds = await ContentType.query().whereIn('slug', filters.types).select('id')
      query.whereIn(
        'contentTypeId',
        ctIds.map((ct) => ct.id)
      )
    }
    if (filters.authors && filters.authors.length > 0) {
      query.whereHas('authors', (authors) => authors.whereIn('slug', filters.authors!))
    }
    if (filters.artists && filters.artists.length > 0) {
      query.whereHas('artists', (artists) => artists.whereIn('slug', filters.artists!))
    }
    if (filters.orderBy === 'title') {
      query.orderBy('title', 'asc')
    } else if (filters.orderBy === 'title-desc') {
      query.orderBy('title', 'desc')
    } else if (filters.orderBy === 'newest') {
      query.orderBy('createdAt', 'desc')
    } else if (filters.orderBy === 'rating') {
      // Weighted score (prior of 5 votes at 7.0) so one perfect vote cannot beat hundreds.
      query.orderByRaw('((rating_avg * rating_count) + 35.0) / (rating_count + 5) desc')
    } else if (filters.orderBy === 'votes') {
      query.orderBy('ratingCount', 'desc')
    } else if (filters.orderBy === 'views') {
      query.orderBy('viewCount', 'desc')
    } else if (filters.orderBy === 'trending') {
      views.orderByTrend(query)
    } else {
      query.orderBy('updatedAt', 'desc')
    }

    const results = await query
      .orderBy('id', 'desc')
      .withCount('chapters', (chapters) => chapters.where('draft', false))
      .withAggregate('chapters', (chapters) =>
        chapters.where('draft', false).max('number').as('lastChapter')
      )
      .paginate(page, perPage)
    return {
      items: results.all().map((series) => ({
        ...serializeSeries(series),
        chapterCount: Number(series.$extras.chapters_count || 0),
        lastChapter: Number(series.$extras.lastChapter || 0),
      })),
      totalResults: results.total,
      totalPages: results.lastPage,
      hasNextPage: results.hasMorePages,
    }
  }

  async searchSeries(query: string): Promise<SeriesInfo[]> {
    if (!query || query.length < 2) return []
    const results = await orderByMatch(whereMatches(baseSeriesQuery(), query), query).limit(10)

    return results.map(serializeSeries)
  }

  async getSimilarSeries(type: string, slug: string): Promise<SeriesInfo[]> {
    const ctId = await this.getContentTypeId(type)
    if (!ctId) return []

    // The source may be a draft a staff member previews; the suggestions never are.
    const series = await baseSeriesQuery({ drafts: true })
      .where('contentTypeId', ctId)
      .where('slug', slug)
      .first()

    if (!series) return []

    const genres = series.genres || []
    const genreIds = genres.map((g) => g.id)

    let similarQuery = baseSeriesQuery().where('id', '!=', series.id)

    if (genreIds.length > 0) {
      similarQuery.where((builder) => {
        builder
          .where('contentTypeId', ctId)
          .orWhereHas('genres', (genresQuery) => genresQuery.whereIn('genres.id', genreIds))
      })
    } else {
      similarQuery.where('contentTypeId', ctId)
    }

    const similar = await similarQuery.limit(6)
    return similar.map(serializeSeries)
  }

  async getAllGenres(): Promise<string[]> {
    const genres = await Genre.query().orderBy('name', 'asc')
    return genres.map((g) => g.name)
  }
}

export default new SeriesService()
