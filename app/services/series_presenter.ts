import type SeriesModel from '#models/series'
import type ContentType from '#models/content_type'
import type Chapter from '#models/chapter'

export interface SeriesInfo {
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

export interface ChapterInfo {
  number: number
  title: string | null
  publishedAt: string
  timeAgo?: string
}

export interface ChapterWithPages extends ChapterInfo {
  pages: string[]
  textContent?: string
}

export interface SeriesWithChapters extends SeriesInfo {
  latestChapters: ChapterInfo[]
}

export function serializeSeries(s: SeriesModel): SeriesInfo {
  const contentType = s.$getRelated('contentType') as ContentType | undefined
  const authors = s.authors || []
  const artists = s.artists || []
  const genres = s.genres || []
  const typeName = contentType?.name || ''

  return {
    title: s.title,
    slug: s.slug,
    type: contentType?.slug || typeName,
    description: s.description,
    author: authors.map((a) => a.name).join(', '),
    artist: artists.map((a) => a.name).join(', '),
    genres: genres.map((g) => g.name),
    alternativeTitles: s.alternativeTitles || [],
    status: s.status,
    translationStatus: s.translationStatus,
    publicationYear: s.publicationYear,
    ageRating: s.ageRating,
    coverImage: s.coverImage?.startsWith('/') ? s.coverImage : '/images/no-cover.svg',
    bannerImage: s.bannerImage,
    featured: s.featured,
    featuredDescription: s.featuredDescription,
    keywords:
      s.keywords && s.keywords.length > 0
        ? s.keywords
        : [`${s.slug.replace(/-/g, ' ')} turkce oku`, `${s.slug.replace(/-/g, ' ')} ${typeName}`],
    createdAt: s.createdAt || '',
    updatedAt: s.updatedAt || '',
  }
}

export function serializeChapter(c: Chapter): ChapterInfo {
  return {
    number: c.number,
    title: c.title,
    publishedAt: c.publishedAt,
    timeAgo: calculateTimeAgo(c.publishedAt),
  }
}

export function calculateTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (!Number.isFinite(diffMs)) return 'Tarih bilinmiyor'
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))

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
