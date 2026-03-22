import db from '@adonisjs/lucid/services/db'
import SeriesModel from '#models/series'
import ContentType from '#models/content_type'
import Genre from '#models/genre'
import Chapter from '#models/chapter'

interface SeriesInfo {
  title: string
  alternativeTitles: string[]
  slug: string
  description: string
  type: string
  status: string
  translationStatus: string
  author: string
  artist: string
  publicationYear: number
  ageRating: string | null
  genres: string[]
  keywords: string[]
  coverImage: string
  bannerImage: string | null
  featured: boolean
  featuredDescription: string | null
  createdAt: string
  updatedAt: string
}

interface ChapterInfo {
  number: number
  title: string | null
  publishedAt: string
  timeAgo?: string
}

interface ChapterWithPages extends ChapterInfo {
  pages: string[]
  textContent?: string
}

interface SeriesWithChapters extends SeriesInfo {
  latestChapters: ChapterInfo[]
}

function serializeSeries(s: SeriesModel): SeriesInfo {
  const contentType = s.$getRelated('contentType') as ContentType | undefined
  const authors = (s.$getRelated('authors') as any[]) || []
  const artists = (s.$getRelated('artists') as any[]) || []
  const genres = (s.$getRelated('genres') as any[]) || []
  const typeName = contentType?.name || ''

  return {
    title: s.title,
    slug: s.slug,
    type: typeName,
    description: s.description,
    author: authors.map((a: any) => a.name).join(', '),
    artist: artists.map((a: any) => a.name).join(', '),
    genres: genres.map((g: any) => g.name),
    alternativeTitles: s.alternativeTitles || [],
    status: s.status,
    translationStatus: s.translationStatus,
    publicationYear: s.publicationYear,
    ageRating: s.ageRating,
    coverImage: s.coverImage,
    bannerImage: s.bannerImage,
    featured: s.featured,
    featuredDescription: s.featuredDescription,
    keywords: (s.keywords && s.keywords.length > 0)
      ? s.keywords
      : [
          `${s.slug.replace(/-/g, ' ')} turkce oku`,
          `${s.slug.replace(/-/g, ' ')} ${typeName}`,
        ],
    createdAt: s.createdAt || '',
    updatedAt: s.updatedAt || '',
  }
}

function serializeChapter(c: Chapter): ChapterInfo {
  return {
    number: c.number,
    title: c.title,
    publishedAt: c.publishedAt,
    timeAgo: calculateTimeAgo(c.publishedAt),
  }
}

function calculateTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Bugün'
  if (diffDays === 1) return '1 gün önce'
  if (diffDays < 7) return `${diffDays} gün önce`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks} hafta önce`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} ay önce`
  }
  const years = Math.floor(diffDays / 365)
  return `${years} yıl önce`
}

function baseSeriesQuery() {
  return SeriesModel.query()
    .preload('contentType')
    .preload('genres')
    .preload('authors')
    .preload('artists')
}

class SeriesService {
  private async getContentTypeId(type: string): Promise<number | null> {
    const ct = await ContentType.findBy('name', type)
    return ct?.id ?? null
  }

  async getAllSeries(): Promise<SeriesInfo[]> {
    const all = await baseSeriesQuery().orderBy('updatedAt', 'desc')
    return all.map(serializeSeries)
  }

  async getSeriesBySlug(type: string, slug: string): Promise<SeriesInfo | null> {
    const ctId = await this.getContentTypeId(type)
    if (!ctId) return null

    const series = await baseSeriesQuery()
      .where('contentTypeId', ctId)
      .where('slug', slug)
      .first()

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
    const featured = await baseSeriesQuery().where('featured', true).orderBy('updatedAt', 'desc')
    return featured.map(serializeSeries)
  }

  async getRecentlyUpdated(
    page: number = 1,
    perPage: number = 12
  ): Promise<{
    items: SeriesWithChapters[]
    hasNextPage: boolean
  }> {
    const all = await this.getAllSeries()
    const start = (page - 1) * perPage
    const end = start + perPage
    const paginated = all.slice(start, end)

    const items: SeriesWithChapters[] = []
    for (const series of paginated) {
      const chapters = await this.getChapters(series.type, series.slug)
      items.push({
        ...series,
        latestChapters: chapters.slice(0, 3),
      })
    }

    return { items, hasNextPage: end < all.length }
  }

  async filterSeries(filters: {
    genres?: string[]
    statuses?: string[]
    types?: string[]
    search?: string
    orderBy?: string
  }): Promise<SeriesInfo[]> {
    let query = baseSeriesQuery()

    if (filters.genres && filters.genres.length > 0) {
      const genreIds = await Genre.query().whereIn('name', filters.genres).select('id')
      const ids = genreIds.map((g) => g.id)
      const seriesIds = await db
        .from('series_genres')
        .whereIn('genre_id', ids)
        .select('series_id')
        .distinct()
      query.whereIn(
        'id',
        seriesIds.map((r: any) => r.series_id)
      )
    }
    if (filters.statuses && filters.statuses.length > 0) {
      query.whereIn('status', filters.statuses)
    }
    if (filters.types && filters.types.length > 0) {
      const ctIds = await ContentType.query().whereIn('name', filters.types).select('id')
      query.whereIn(
        'contentTypeId',
        ctIds.map((ct) => ct.id)
      )
    }
    if (filters.search) {
      const q = `%${filters.search}%`
      query.where((builder) => {
        builder
          .whereILike('title', q)
          .orWhereRaw("JSON_SEARCH(alternative_titles, 'one', ?) IS NOT NULL", [
            `%${filters.search}%`,
          ])
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
    return results.map(serializeSeries)
  }

  async searchSeries(query: string): Promise<SeriesInfo[]> {
    if (!query || query.length < 2) return []
    const q = `%${query}%`
    const results = await baseSeriesQuery()
      .where((builder) => {
        builder
          .whereILike('title', q)
          .orWhereILike('slug', q)
          .orWhereRaw("JSON_SEARCH(alternative_titles, 'one', ?) IS NOT NULL", [
            `%${query}%`,
          ])
      })
      .limit(10)

    return results.map(serializeSeries)
  }

  async getSimilarSeries(type: string, slug: string): Promise<SeriesInfo[]> {
    const ctId = await this.getContentTypeId(type)
    if (!ctId) return []

    const series = await baseSeriesQuery()
      .where('contentTypeId', ctId)
      .where('slug', slug)
      .first()

    if (!series) return []

    const genres = (series.$getRelated('genres') as any[]) || []
    const genreIds = genres.map((g: any) => g.id)

    let similarQuery = baseSeriesQuery().where('id', '!=', series.id)

    if (genreIds.length > 0) {
      const matchingSeriesIds = await db
        .from('series_genres')
        .whereIn('genre_id', genreIds)
        .select('series_id')
        .distinct()
      const sIds = matchingSeriesIds.map((r: any) => r.series_id)

      similarQuery.where((builder) => {
        builder.where('contentTypeId', ctId).orWhereIn('id', sIds)
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
