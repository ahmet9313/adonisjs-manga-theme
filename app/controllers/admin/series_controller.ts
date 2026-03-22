import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import SeriesModel from '#models/series'
import ContentType from '#models/content_type'
import Genre from '#models/genre'
import Author from '#models/author'
import Artist from '#models/artist'
import vine from '@vinejs/vine'
import app from '@adonisjs/core/services/app'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function slugify(text: string): string {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

const seriesValidator = vine.compile(
  vine.object({
    title: vine.string().minLength(1).maxLength(255),
    description: vine.string().minLength(1),
    content_type_id: vine.number(),
    status: vine.string(),
    translation_status: vine.string(),
    publication_year: vine.number(),
    age_rating: vine.string().optional(),
    alternative_titles: vine.string().optional(),
    featured: vine.string().optional(),
    featured_description: vine.string().optional(),
    keywords: vine.string().optional(),
  })
)

export default class SeriesAdminController {
  async index({ view, request }: HttpContext) {
    const page = request.input('page', 1)
    const allowedSizes = [10, 20, 30, 50, 1000, 5000]
    const perPage = allowedSizes.includes(Number(request.input('per_page'))) ? Number(request.input('per_page')) : 20
    const seriesList = await SeriesModel.query()
      .preload('contentType')
      .withCount('chapters')
      .orderBy('updatedAt', 'desc')
      .paginate(page, perPage)

    seriesList.baseUrl('/admin/seriler')
    seriesList.queryString({ per_page: perPage })

    return view.render('pages/admin/series/index', { title: 'Seriler', seriesList, paginator: seriesList, perPage })
  }

  private async getPopularKeywords(): Promise<string[]> {
    const allSeries = await SeriesModel.query().select('keywords').whereNotNull('keywords')
    const keywordCounts: Record<string, number> = {}
    for (const s of allSeries) {
      for (const kw of (s.keywords || [])) {
        keywordCounts[kw] = (keywordCounts[kw] || 0) + 1
      }
    }
    return Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([kw]) => kw)
  }

  async create({ view }: HttpContext) {
    const [contentTypes, genres, authors, artists, allKeywords] = await Promise.all([
      ContentType.query().orderBy('name', 'asc'),
      Genre.query().orderBy('name', 'asc'),
      Author.query().orderBy('name', 'asc'),
      Artist.query().orderBy('name', 'asc'),
      this.getPopularKeywords(),
    ])
    return view.render('pages/admin/series/form', {
      title: 'Yeni Seri Ekle',
      contentTypes,
      genres,
      authors,
      artists,
      allKeywords,
    })
  }

  async store({ request, session, response }: HttpContext) {
    const data = await request.validateUsing(seriesValidator)
    const slug = slugify(data.title)

    const existing = await SeriesModel.findBy('slug', slug)
    if (existing) {
      session.flash('error', 'Bu isimde bir seri zaten mevcut')
      return response.redirect('/admin/seriler/ekle')
    }

    // Handle alternative titles
    const altTitles = data.alternative_titles
      ? data.alternative_titles.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []

    // Handle keywords
    const keywords = data.keywords
      ? data.keywords.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []

    // Resolve content type for file paths
    const ct = await ContentType.find(data.content_type_id)
    const ctSlug = ct?.slug || 'manga'

    // Handle cover image
    let coverImage = `/content/${ctSlug}/${slug}/cover.svg`
    const coverFile = request.file('cover_image', { size: '10mb', extnames: ['jpg', 'jpeg', 'png', 'webp', 'svg'] })
    if (coverFile) {
      const dir = join(app.publicPath(), 'content', ctSlug, slug)
      await mkdir(dir, { recursive: true })
      const fileName = `cover.${coverFile.extname}`
      await coverFile.move(dir, { name: fileName })
      coverImage = `/content/${ctSlug}/${slug}/${fileName}`
    }

    // Handle banner image
    let bannerImage: string | null = null
    const bannerFile = request.file('banner_image', { size: '10mb', extnames: ['jpg', 'jpeg', 'png', 'webp', 'svg'] })
    if (bannerFile) {
      const dir = join(app.publicPath(), 'content', ctSlug, slug)
      await mkdir(dir, { recursive: true })
      const fileName = `banner.${bannerFile.extname}`
      await bannerFile.move(dir, { name: fileName })
      bannerImage = `/content/${ctSlug}/${slug}/${fileName}`
    }

    const timestamp = now()
    const series = await SeriesModel.create({
      title: data.title,
      slug,
      description: data.description,
      contentTypeId: data.content_type_id,
      status: data.status,
      translationStatus: data.translation_status,
      publicationYear: data.publication_year,
      ageRating: data.age_rating || null,
      alternativeTitles: altTitles,
      keywords,
      featured: data.featured === 'on',
      featuredDescription: data.featured_description || null,
      coverImage,
      bannerImage,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    // Attach genres
    const genreIds = request.input('genres', [])
    if (genreIds.length > 0) {
      await db.table('series_genres').multiInsert(
        genreIds.map((gid: string) => ({ series_id: series.id, genre_id: Number(gid) }))
      )
    }

    // Attach authors
    const authorIds = request.input('authors', [])
    if (authorIds.length > 0) {
      await db.table('series_authors').multiInsert(
        authorIds.map((aid: string) => ({ series_id: series.id, author_id: Number(aid) }))
      )
    }

    // Attach artists
    const artistIds = request.input('artists', [])
    if (artistIds.length > 0) {
      await db.table('series_artists').multiInsert(
        artistIds.map((aid: string) => ({ series_id: series.id, artist_id: Number(aid) }))
      )
    }

    session.flash('success', 'Seri eklendi')
    return response.redirect('/admin/seriler')
  }

  async edit({ view, params }: HttpContext) {
    const series = await SeriesModel.query()
      .where('id', params.id)
      .preload('contentType')
      .preload('genres')
      .preload('authors')
      .preload('artists')
      .firstOrFail()

    const [contentTypes, genres, authors, artists, allKeywords] = await Promise.all([
      ContentType.query().orderBy('name', 'asc'),
      Genre.query().orderBy('name', 'asc'),
      Author.query().orderBy('name', 'asc'),
      Artist.query().orderBy('name', 'asc'),
      this.getPopularKeywords(),
    ])

    const selectedGenreIds = series.genres.map((g: any) => g.id)
    const selectedAuthorIds = series.authors.map((a: any) => a.id)
    const selectedArtistIds = series.artists.map((a: any) => a.id)

    return view.render('pages/admin/series/form', {
      title: 'Seri Düzenle',
      series,
      contentTypes,
      genres,
      authors,
      artists,
      allKeywords,
      selectedGenreIds,
      selectedAuthorIds,
      selectedArtistIds,
    })
  }

  async update({ request, params, session, response }: HttpContext) {
    const series = await SeriesModel.findOrFail(params.id)
    const data = await request.validateUsing(seriesValidator)
    const slug = slugify(data.title)

    const existing = await SeriesModel.query().where('slug', slug).whereNot('id', series.id).first()
    if (existing) {
      session.flash('error', 'Bu isimde başka bir seri zaten mevcut')
      return response.redirect(`/admin/seriler/${series.id}/duzenle`)
    }

    const altTitles = data.alternative_titles
      ? data.alternative_titles.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []

    const keywords = data.keywords
      ? data.keywords.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []

    // Resolve content type for file paths
    const ct = await ContentType.find(data.content_type_id)
    const ctSlug = ct?.slug || 'manga'

    // Handle cover image
    const coverFile = request.file('cover_image', { size: '10mb', extnames: ['jpg', 'jpeg', 'png', 'webp', 'svg'] })
    if (coverFile) {
      const dir = join(app.publicPath(), 'content', ctSlug, slug)
      await mkdir(dir, { recursive: true })
      const fileName = `cover.${coverFile.extname}`
      await coverFile.move(dir, { name: fileName })
      series.coverImage = `/content/${ctSlug}/${slug}/${fileName}`
    }

    // Handle banner image
    const bannerFile = request.file('banner_image', { size: '10mb', extnames: ['jpg', 'jpeg', 'png', 'webp', 'svg'] })
    if (bannerFile) {
      const dir = join(app.publicPath(), 'content', ctSlug, slug)
      await mkdir(dir, { recursive: true })
      const fileName = `banner.${bannerFile.extname}`
      await bannerFile.move(dir, { name: fileName })
      series.bannerImage = `/content/${ctSlug}/${slug}/${fileName}`
    }

    series.title = data.title
    series.slug = slug
    series.description = data.description
    series.contentTypeId = data.content_type_id
    series.status = data.status
    series.translationStatus = data.translation_status
    series.publicationYear = data.publication_year
    series.ageRating = data.age_rating || null
    series.alternativeTitles = altTitles
    series.keywords = keywords
    series.updatedAt = now()
    series.featured = data.featured === 'on'
    series.featuredDescription = data.featured_description || null

    await series.save()

    // Re-sync genres
    await db.from('series_genres').where('series_id', series.id).delete()
    const genreIds = request.input('genres', [])
    if (genreIds.length > 0) {
      await db.table('series_genres').multiInsert(
        genreIds.map((gid: string) => ({ series_id: series.id, genre_id: Number(gid) }))
      )
    }

    // Re-sync authors
    await db.from('series_authors').where('series_id', series.id).delete()
    const authorIds = request.input('authors', [])
    if (authorIds.length > 0) {
      await db.table('series_authors').multiInsert(
        authorIds.map((aid: string) => ({ series_id: series.id, author_id: Number(aid) }))
      )
    }

    // Re-sync artists
    await db.from('series_artists').where('series_id', series.id).delete()
    const artistIds = request.input('artists', [])
    if (artistIds.length > 0) {
      await db.table('series_artists').multiInsert(
        artistIds.map((aid: string) => ({ series_id: series.id, artist_id: Number(aid) }))
      )
    }

    session.flash('success', 'Seri güncellendi')
    return response.redirect('/admin/seriler')
  }

  async destroy({ params, session, response }: HttpContext) {
    const series = await SeriesModel.findOrFail(params.id)
    await db.from('series_genres').where('series_id', series.id).delete()
    await db.from('series_authors').where('series_id', series.id).delete()
    await db.from('series_artists').where('series_id', series.id).delete()
    await series.delete()
    session.flash('success', 'Seri silindi')
    return response.redirect('/admin/seriler')
  }
}
