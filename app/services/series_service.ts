import SeriesModel from '#models/series'
import ContentType from '#models/content_type'
import Genre from '#models/genre'
import Chapter from '#models/chapter'

import { serializeSeries, serializeChapter, calculateTimeAgo } from '#services/series_presenter'
import type { SeriesInfo, ChapterInfo, ChapterWithPages } from '#services/series_presenter'

function baseSeriesQuery() {
  return SeriesModel.query()
    .preload('contentType')
    .preload('genres')
    .preload('authors')
    .preload('artists')
}

class SeriesService {
  private async getContentTypeId(type: string): Promise<number | null> {
    const ct = await ContentType.findBy('slug', type)
    return ct?.id ?? null
  }

  async getSeriesBySlug(type: string, slug: string): Promise<SeriesInfo | null> {
    const ctId = await this.getContentTypeId(type)
    if (!ctId) return null

    const series = await baseSeriesQuery().where('contentTypeId', ctId).where('slug', slug).first()

    if (!series) return null
    return serializeSeries(series)
  }

  async getChapters(type: string, slug: string): Promise<ChapterInfo[]> {
    const ctId = await this.getContentTypeId(type)
    if (!ctId) return []

    const series = await SeriesModel.query()
      .where('contentTypeId', ctId)
      .where('slug', slug)
      .first()

    if (!series) return []

    const chapters = await Chapter.query()
      .select('id', 'seriesId', 'number', 'title', 'publishedAt')
      .where('seriesId', series.id)
      .orderBy('number', 'desc')

    return chapters.map(serializeChapter)
  }

  async getChapter(
    type: string,
    slug: string,
    chapterNum: number
  ): Promise<ChapterWithPages | null> {
    const ctId = await this.getContentTypeId(type)
    if (!ctId) return null

    const series = await SeriesModel.query()
      .where('contentTypeId', ctId)
      .where('slug', slug)
      .first()

    if (!series) return null

    const chapter = await Chapter.query()
      .where('seriesId', series.id)
      .where('number', chapterNum)
      .first()

    if (!chapter) return null

    const content = chapter.content
    const result: ChapterWithPages = {
      number: chapter.number,
      title: chapter.title,
      publishedAt: chapter.publishedAt,
      timeAgo: calculateTimeAgo(chapter.publishedAt),
      pages: [],
    }

    if (content.type === 'images') {
      result.pages = content.pages
    } else if (content.type === 'text') {
      result.textContent = content.text
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
          .select('id', 'seriesId', 'number', 'title', 'publishedAt')
          .groupOrderBy('number', 'desc')
          .groupLimit(3)
      )
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')
      .paginate(page, perPage)
    return {
      items: results.all().map((series) => ({
        ...serializeSeries(series),
        latestChapters: series.chapters.map(serializeChapter),
      })),
      hasNextPage: results.hasMorePages,
      totalPages: results.lastPage,
    }
  }

  async filterSeries(
    filters: {
      genres?: string[]
      statuses?: string[]
      types?: string[]
      search?: string
      orderBy?: string
    },
    page = 1,
    perPage = 24
  ) {
    const query = baseSeriesQuery()

    if (filters.genres && filters.genres.length > 0) {
      query.whereHas('genres', (genres) => genres.whereIn('name', filters.genres!))
    }
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
    if (filters.search) {
      const q = `%${filters.search}%`
      query.where((builder) => {
        builder.whereILike('title', q).orWhereILike('alternativeTitles', q)
      })
    }

    if (filters.orderBy === 'title') {
      query.orderBy('title', 'asc')
    } else if (filters.orderBy === 'title-desc') {
      query.orderBy('title', 'desc')
    } else if (filters.orderBy === 'newest') {
      query.orderBy('createdAt', 'desc')
    } else {
      query.orderBy('updatedAt', 'desc')
    }

    const results = await query
      .orderBy('id', 'desc')
      .withCount('chapters')
      .withAggregate('chapters', (chapters) => chapters.max('number').as('lastChapter'))
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
    const q = `%${query}%`
    const results = await baseSeriesQuery()
      .where((builder) => {
        builder.whereILike('title', q).orWhereILike('slug', q).orWhereILike('alternativeTitles', q)
      })
      .limit(10)

    return results.map(serializeSeries)
  }

  async getSimilarSeries(type: string, slug: string): Promise<SeriesInfo[]> {
    const ctId = await this.getContentTypeId(type)
    if (!ctId) return []

    const series = await baseSeriesQuery().where('contentTypeId', ctId).where('slug', slug).first()

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
