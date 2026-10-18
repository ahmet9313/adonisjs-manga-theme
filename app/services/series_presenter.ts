import type SeriesModel from '#models/series'
import type ContentType from '#models/content_type'
import type Chapter from '#models/chapter'
import type { VideoSourceKind } from '#config/watch'
import type { AccessLevel, ContentFormat } from '#config/site'

export interface Person {
  name: string
  slug: string
}

export interface SeriesInfo {
  id: number
  title: string
  alternativeTitles: string[]
  slug: string
  description: string
  type: string
  /** Content type format: pages, text or video ("izle" instead of "oku"). */
  format: ContentFormat
  status: string
  translationStatus: string
  author: string
  artist: string
  authors: Person[]
  artists: Person[]
  publicationYear: number
  ageRating: string | null
  genres: string[]
  keywords: string[]
  coverImage: string
  bannerImage: string | null
  featured: boolean
  featuredDescription: string | null
  /** Only staff ever receive drafts (previews); lists leave them out. */
  draft: boolean
  access: AccessLevel
  /** Average of 1–10 ratings (0 when nobody rated yet). */
  ratingAverage: number
  ratingCount: number
  reviewCount: number
  createdAt: string
  updatedAt: string
}

export interface ChapterInfo {
  number: number
  title: string | null
  publishedAt: string
  timeAgo?: string
  /** The chapter's own access (`public` = same as the series) and draft flag (staff only). */
  access?: AccessLevel
  draft?: boolean
}

export interface ChapterWithPages extends ChapterInfo {
  id: number
  pages: string[]
  textContent?: string
  warning: string | null
  /** Video episodes: sources in stored order (see config/watch.ts). */
  video?: EpisodeVideo
}

export interface EpisodeVideo {
  sources: { host: string; kind: VideoSourceKind; url: string; label: string | null }[]
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

  const people = (list: { name: string; slug: string }[]) => [
    ...new Map(list.map((item) => [item.slug, { name: item.name, slug: item.slug }])).values(),
  ]

  return {
    id: s.id,
    title: s.title,
    slug: s.slug,
    type: contentType?.slug || typeName,
    format: contentType?.format || 'image',
    description: s.description,
    author: authors.map((a) => a.name).join(', '),
    artist: artists.map((a) => a.name).join(', '),
    authors: people(authors),
    artists: people(artists),
    genres: [...new Set(genres.map((g) => g.name))],
    alternativeTitles: s.alternativeTitles || [],
    status: s.status,
    translationStatus: s.translationStatus,
    publicationYear: s.publicationYear,
    ageRating: s.ageRating,
    coverImage: s.coverImage?.startsWith('/') ? s.coverImage : '/images/no-cover.svg',
    bannerImage: s.bannerImage,
    featured: s.featured,
    featuredDescription: s.featuredDescription,
    draft: Boolean(s.draft),
    access: s.access || 'public',
    ratingAverage: Number(s.ratingAvg) || 0,
    ratingCount: s.ratingCount || 0,
    reviewCount: s.reviewCount || 0,
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
    access: c.access || 'public',
    draft: Boolean(c.draft),
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
