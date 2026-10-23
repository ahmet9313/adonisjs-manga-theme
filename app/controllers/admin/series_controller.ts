import { now, slugify, pageNumber, pageSize, searchText } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import site from '#config/site'
import SeriesModel from '#models/series'
import ContentType from '#models/content_type'
import Genre from '#models/genre'
import Author from '#models/author'
import Artist from '#models/artist'
import { seriesValidator } from '#validators/admin'
import {
  invalidField,
  imageOptions,
  pageImages,
  removeContentFiles,
  removeUnreferencedImages,
  saveImage,
} from '#services/upload_service'
import Chapter from '#models/chapter'
import { localVideoPaths, removeUnusedVideos } from '#services/video_service'
import { refreshSearchText } from '#services/search_index_service'

export default class SeriesAdminController {
  /** Series list with read-only filters: ?search (title, address, alternative titles), ?status, ?type (slug). */
  async index({ view, request }: HttpContext) {
    const page = pageNumber(request.input('page'))
    const perPage = pageSize(request.input('per_page'))
    const search = searchText(request.input('search'))
    const status = site.statuses.find((value) => value === request.input('status')) || ''
    const contentTypes = await ContentType.query().orderBy('name', 'asc')
    const type = contentTypes.find((item) => item.slug === request.input('type')) || null
    const like = `%${search}%`
    const seriesList = await SeriesModel.query()
      .preload('contentType')
      .withCount('chapters')
      .if(search, (query) =>
        query.where((inner) =>
          inner
            .where('title', 'like', like)
            .orWhere('slug', 'like', like)
            .orWhere('alternativeTitles', 'like', like)
        )
      )
      .if(status, (query) => query.where('status', status))
      .if(type, (query) => query.where('contentTypeId', type!.id))
      .orderBy('updatedAt', 'desc')
      .paginate(page, perPage)

    const filtered = Boolean(search || status || type)
    seriesList.baseUrl('/admin/seriler')
    seriesList.queryString({
      per_page: perPage,
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type: type.slug } : {}),
    })
    const catalogTotal = filtered
      ? Number(
          ((await SeriesModel.query().count('* as total').first()) as any)?.$extras?.total || 0
        )
      : seriesList.total

    return view.render('pages/admin/series/index', {
      title: 'Seriler',
      seriesList,
      paginator: seriesList,
      perPage,
      contentTypes,
      filters: { search, status, type: type?.slug || '' },
      filtered,
      catalogTotal,
    })
  }

  private async getPopularKeywords(): Promise<string[]> {
    const allSeries = await SeriesModel.query().select('keywords').whereNotNull('keywords')
    const keywordCounts: Record<string, number> = {}
    for (const s of allSeries) {
      for (const kw of s.keywords || []) {
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

  private async save(request: HttpContext['request'], series = new SeriesModel()) {
    const data = await request.validateUsing(seriesValidator)
    const slug = series.$isPersisted ? series.slug : slugify(data.title)
    if (!slug) invalidField('title', 'Başlık en az bir harf veya rakam içermeli.')
    const duplicate = await SeriesModel.query()
      .where((query) => query.where('slug', slug).orWhere('title', data.title))
      .if(series.$isPersisted, (query) => query.whereNot('id', series.id))
      .first()
    if (duplicate) invalidField('title', 'Bu başlıkta veya URL adresinde bir seri zaten var.')
    const contentType = await ContentType.find(data.content_type_id)
    if (!contentType) invalidField('content_type_id', 'İçerik türü bulunamadı.')
    for (const [field, Model] of [
      ['genres', Genre],
      ['authors', Author],
      ['artists', Artist],
    ] as const) {
      const ids = [...new Set(data[field] || [])]
      const records = await Model.query().whereIn('id', ids)
      if (records.length !== ids.length) invalidField(field, 'Seçilen kayıt bulunamadı.')
    }
    const cover = request.file('cover_image', imageOptions)
    const banner = request.file('banner_image', imageOptions)
    for (const file of [cover, banner])
      if (file && !file.isValid)
        invalidField(file.fieldName, 'Görsel JPG, PNG veya WebP olmalı ve 10 MB sınırını aşmamalı.')
    const segments = [contentType.slug, slug]
    const previous = [series.coverImage, series.bannerImage]
    const coverImage = cover
      ? await saveImage(cover, segments)
      : series.coverImage || '/images/no-cover.svg'
    const bannerImage = banner ? await saveImage(banner, segments) : series.bannerImage || null
    const added = [cover ? coverImage : null, banner ? bannerImage : null]
    const timestamp = now()
    const split = (value?: string) => [
      ...new Set(
        (value || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      ),
    ]
    try {
      await db.transaction(async (trx) => {
        series.useTransaction(trx)
        series.merge({
          title: data.title,
          slug,
          description: data.description,
          contentTypeId: data.content_type_id,
          status: data.status,
          translationStatus: data.translation_status,
          publicationYear: data.publication_year,
          ageRating: data.age_rating || null,
          alternativeTitles: split(data.alternative_titles),
          keywords: split(data.keywords),
          featured: data.featured === 'on',
          featuredDescription: data.featured_description || null,
          draft: data.draft === 'on',
          access: data.access ?? 'public',
          coverMode: data.cover_mode ?? 'auto',
          coverImage,
          bannerImage,
          createdAt: series.createdAt || timestamp,
          updatedAt: timestamp,
        })
        await series.save()
        await series.related('genres').sync([...new Set(data.genres || [])])
        await series.related('authors').sync([...new Set(data.authors || [])])
        await series.related('artists').sync([...new Set(data.artists || [])])
        // Authors/artists are part of the search text (the model hook saw the old ones).
        await refreshSearchText([series.id], trx)
      })
    } catch (error) {
      // Images uploaded with a save that failed are not kept.
      await removeContentFiles(added)
      throw error
    }
    // A replaced cover/banner goes, unless a card or another series still shows it.
    await removeUnreferencedImages(
      previous.filter((path) => path !== coverImage && path !== bannerImage)
    )
  }

  async store({ request, session, response }: HttpContext) {
    await this.save(request)
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
      .withCount('chapters')
      .firstOrFail()

    const [contentTypes, genres, authors, artists, allKeywords] = await Promise.all([
      ContentType.query().orderBy('name', 'asc'),
      Genre.query().orderBy('name', 'asc'),
      Author.query().orderBy('name', 'asc'),
      Artist.query().orderBy('name', 'asc'),
      this.getPopularKeywords(),
    ])

    const selectedGenreIds = series.genres.map((g) => g.id)
    const selectedAuthorIds = series.authors.map((a) => a.id)
    const selectedArtistIds = series.artists.map((a) => a.id)

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
    await this.save(request, await SeriesModel.findOrFail(params.id))
    session.flash('success', 'Seri güncellendi')
    return response.redirect('/admin/seriler')
  }

  async destroy({ params, session, response }: HttpContext) {
    const series = await SeriesModel.findOrFail(params.id)
    // Chapters and comments cascade with the series; their files go afterwards: videos, page
    // images, comment images, and the cover/banner unless a card still shows them.
    const chapters = await Chapter.query().where('seriesId', series.id).select('content')
    const videos = chapters.flatMap((chapter) => localVideoPaths(chapter.content))
    const pages = chapters.flatMap((chapter) => pageImages(chapter.content))
    const images = await db
      .from('comments')
      .where('series_id', series.id)
      .whereNotNull('image')
      .select('image')
    await series.delete()
    await removeUnusedVideos(videos)
    await removeContentFiles([...pages, ...images.map((row) => row.image as string)])
    await removeUnreferencedImages([series.coverImage, series.bannerImage])
    session.flash('success', 'Seri silindi')
    return response.redirect('/admin/seriler')
  }
}
