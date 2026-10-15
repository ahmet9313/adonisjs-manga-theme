import { now, pageNumber, pageSize } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import notifications from '#services/notification_service'
import Chapter from '#models/chapter'
import SeriesModel from '#models/series'
import { chapterValidator } from '#validators/admin'
import { chapterContent, invalidField } from '#services/upload_service'
import db from '@adonisjs/lucid/services/db'

export default class ChapterAdminController {
  async index({ view, request }: HttpContext) {
    const seriesId = request.input('series_id') ? pageNumber(request.input('series_id')) : null

    const page = pageNumber(request.input('page'))
    const perPage = pageSize(request.input('per_page'))

    let query = Chapter.query().preload('series').orderBy('createdAt', 'desc')

    if (seriesId) {
      query = query.where('seriesId', seriesId)
    }

    const chapters = await query.paginate(page, perPage)
    chapters.baseUrl('/admin/bolumler')
    chapters.queryString({ per_page: perPage, ...(seriesId ? { series_id: seriesId } : {}) })

    const seriesList = await SeriesModel.query().orderBy('title', 'asc').select('id', 'title')

    return view.render('pages/admin/chapters/index', {
      title: 'Bölümler',
      chapters,
      paginator: chapters,
      seriesList,
      selectedSeriesId: seriesId ? Number(seriesId) : null,
      perPage,
    })
  }

  async create({ view, request }: HttpContext) {
    const preSelectedSeriesId = request.input('series_id')

    const seriesList = await SeriesModel.query().preload('contentType').orderBy('title', 'asc')

    const seriesContentTypeMap: Record<number, string> = {}
    for (const s of seriesList) {
      seriesContentTypeMap[s.id] = s.contentType?.slug || 'manga'
    }

    let currentContentType = ''
    if (preSelectedSeriesId) {
      currentContentType = seriesContentTypeMap[Number(preSelectedSeriesId)] || ''
    }

    return view.render('pages/admin/chapters/form', {
      title: 'Yeni Bölüm Ekle',
      seriesList,
      seriesContentTypeMap,
      currentContentType,
      preSelectedSeriesId: preSelectedSeriesId ? Number(preSelectedSeriesId) : null,
    })
  }

  private async save(request: HttpContext['request'], chapter = new Chapter()) {
    const data = await request.validateUsing(chapterValidator)
    const duplicate = await Chapter.query()
      .where('seriesId', data.series_id)
      .where('number', data.number)
      .if(chapter.$isPersisted, (query) => query.whereNot('id', chapter.id))
      .first()
    if (duplicate) invalidField('number', 'Bu seride aynı bölüm numarası zaten var.')
    const series = await SeriesModel.query()
      .where('id', data.series_id)
      .preload('contentType')
      .first()
    if (!series) invalidField('series_id', 'Seri bulunamadı.')
    const content = await chapterContent(
      request,
      series.contentType.slug === 'novel',
      data.text_content,
      data.page_order,
      [series.contentType.slug, series.slug, 'chapters', String(data.number)],
      chapter.content
    )
    const timestamp = now()
    const oldSeriesId = chapter.seriesId
    await db.transaction(async (trx) => {
      chapter.useTransaction(trx)
      chapter.merge({
        seriesId: series.id,
        number: data.number,
        title: data.title || null,
        content,
        publishedAt: chapter.publishedAt || timestamp.slice(0, 10),
        createdAt: chapter.createdAt || timestamp,
        updatedAt: timestamp,
      })
      await chapter.save()
      await SeriesModel.query({ client: trx })
        .whereIn('id', [...new Set([series.id, oldSeriesId].filter(Boolean))])
        .update({ updatedAt: timestamp })
    })
    return chapter
  }

  /** Tells every reader who saved the series that a new chapter is out. */
  private async announce(chapter: Chapter) {
    const series = await SeriesModel.query()
      .where('id', chapter.seriesId)
      .preload('contentType')
      .firstOrFail()
    const readers = await db.from('bookmarks').where('series_id', series.id).select('user_id')
    await notifications.notifyMany(
      readers.map((row) => Number(row.user_id)),
      'chapter',
      {
        title: `Yeni bölüm: ${series.title}`,
        body: `Bölüm ${chapter.number}${chapter.title ? ` — ${chapter.title}` : ''} yayında.`,
        link: `/series/${series.contentType.slug}/${series.slug}/${chapter.number}`,
      }
    )
  }

  async store({ request, session, response }: HttpContext) {
    const chapter = await this.save(request)
    await this.announce(chapter)
    session.flash('success', 'Bölüm eklendi')
    return response.redirect('/admin/bolumler')
  }

  async edit({ view, params }: HttpContext) {
    const chapter = await Chapter.query()
      .where('id', params.id)
      .preload('series', (q) => q.preload('contentType'))
      .firstOrFail()

    const seriesList = await SeriesModel.query().preload('contentType').orderBy('title', 'asc')

    const seriesContentTypeMap: Record<number, string> = {}
    for (const s of seriesList) {
      seriesContentTypeMap[s.id] = s.contentType?.slug || 'manga'
    }

    const currentContentType = chapter.series?.contentType?.slug || 'manga'

    return view.render('pages/admin/chapters/form', {
      title: 'Bölüm Düzenle',
      chapter,
      seriesList,
      seriesContentTypeMap,
      currentContentType,
    })
  }

  async update({ request, params, session, response }: HttpContext) {
    await this.save(request, await Chapter.findOrFail(params.id))
    session.flash('success', 'Bölüm güncellendi')
    return response.redirect('/admin/bolumler')
  }

  async destroy({ params, session, response }: HttpContext) {
    const chapter = await Chapter.findOrFail(params.id)
    await chapter.delete()
    session.flash('success', 'Bölüm silindi')
    return response.redirect('/admin/bolumler')
  }
}
