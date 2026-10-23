import { now, pageNumber, pageSize } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import notifications from '#services/notification_service'
import Chapter from '#models/chapter'
import SeriesModel from '#models/series'
import { chapterValidator } from '#validators/admin'
import {
  chapterContent,
  invalidField,
  pageImages,
  removeContentFiles,
} from '#services/upload_service'
import { localDay } from '#services/level'
import db from '@adonisjs/lucid/services/db'
import watch from '#config/watch'
import {
  localVideoPaths,
  parseSources,
  removeUnusedVideos,
  VideoUploadError,
  receiveVideo,
} from '#services/video_service'
import teamService from '#services/team_service'

export default class ChapterAdminController {
  async index({ view, request }: HttpContext) {
    const seriesId = request.input('series_id') ? pageNumber(request.input('series_id')) : null

    const page = pageNumber(request.input('page'))
    const perPage = pageSize(request.input('per_page'))

    let query = Chapter.query()
      .preload('series', (series) => series.preload('contentType'))
      .orderBy('createdAt', 'desc')

    if (seriesId) {
      query = query.where('seriesId', seriesId)
    }

    const chapters = await query.paginate(page, perPage)
    chapters.baseUrl('/admin/bolumler')
    chapters.queryString({ per_page: perPage, ...(seriesId ? { series_id: seriesId } : {}) })

    const seriesList = await SeriesModel.query().orderBy('title', 'asc').select('id', 'title')
    // The filtered series is shown above the table (cover, type, chapter count, links).
    const selectedSeries = seriesId
      ? await SeriesModel.query()
          .where('id', seriesId)
          .preload('contentType')
          .withCount('chapters')
          .first()
      : null

    return view.render('pages/admin/chapters/index', {
      title: 'Bölümler',
      chapters,
      paginator: chapters,
      seriesList,
      selectedSeriesId: seriesId ? Number(seriesId) : null,
      selectedSeries,
      perPage,
    })
  }

  async create({ view, request }: HttpContext) {
    const preSelectedSeriesId = request.input('series_id')

    const seriesList = await SeriesModel.query().preload('contentType').orderBy('title', 'asc')

    const seriesFormats = this.formatsOf(seriesList)
    const currentFormat = preSelectedSeriesId
      ? seriesFormats[Number(preSelectedSeriesId)] || ''
      : ''

    return view.render('pages/admin/chapters/form', {
      title: 'Yeni Bölüm Ekle',
      seriesList,
      seriesFormats,
      currentFormat,
      preSelectedSeriesId: preSelectedSeriesId ? Number(preSelectedSeriesId) : null,
      ...this.videoOptions(),
      teams: await teamService.options(),
    })
  }

  /** Content format (image/text/video) of every series, keyed by id, for the chapter form. */
  private formatsOf(seriesList: SeriesModel[]) {
    return Object.fromEntries(seriesList.map((s) => [s.id, s.contentType?.format || 'image']))
  }

  /** Form data for video episodes: upload limits and the local player name. */
  private videoOptions() {
    return {
      localHost: watch.localHost,
      maxUploadBytes: watch.maxUploadBytes,
      videoExtensions: watch.videoExtensions,
    }
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
    const teamIds = await teamService.checkIds(data.teams)
    const previous = chapter.$isPersisted ? chapter.content : undefined
    const chapterBody: Chapter['content'] =
      series.contentType.format === 'video'
        ? {
            type: 'video',
            sources: await parseSources(data.sources, {
              seriesId: series.id,
              previous: previous?.type === 'video' ? previous.sources : [],
            }),
          }
        : await chapterContent(
            request,
            series.contentType.format === 'text',
            data.text_content,
            data.page_order,
            [series.contentType.slug, series.slug, 'chapters', String(data.number)],
            chapter.content
          )
    const timestamp = now()
    const oldSeriesId = chapter.seriesId
    const draft = data.draft === 'on'
    // A chapter leaving draft is published now: it gets today's date and its announcement.
    const published = !draft && (!chapter.$isPersisted || chapter.draft)
    const before = new Set(pageImages(previous))
    const added = pageImages(chapterBody).filter((page) => !before.has(page))
    const today = localDay()
    try {
      await db.transaction(async (trx) => {
        chapter.useTransaction(trx)
        chapter.merge({
          seriesId: series.id,
          number: data.number,
          title: data.title || null,
          content: chapterBody,
          draft,
          access: data.access ?? 'public',
          warning: data.warning || null,
          credits: data.credits || null,
          // The site's calendar day (config/site.ts timezone), not the UTC one.
          publishedAt: published && chapter.$isPersisted ? today : chapter.publishedAt || today,
          createdAt: chapter.createdAt || timestamp,
          updatedAt: timestamp,
        })
        await chapter.save()
        await teamService.sync('chapter_teams', chapter.id, teamIds, trx)
        // Drafts do not move the series up in "Son Güncellenenler".
        if (!draft)
          await SeriesModel.query({ client: trx })
            .whereIn('id', [...new Set([series.id, oldSeriesId].filter(Boolean))])
            .update({ updatedAt: timestamp })
      })
    } catch (error) {
      // Pages written for this save are not kept when the save itself fails.
      await removeContentFiles(added)
      throw error
    }
    // Pages and uploaded videos dropped from the chapter are deleted once the new body is stored.
    const keptPages = new Set(pageImages(chapterBody))
    await removeContentFiles(pageImages(previous).filter((page) => !keptPages.has(page)))
    const kept = new Set(localVideoPaths(chapterBody))
    await removeUnusedVideos(localVideoPaths(previous).filter((path) => !kept.has(path)))
    return { chapter, published }
  }

  /**
   * Tells every reader who saved the series that a new chapter is out. The chapter is already
   * saved, so a failure here is logged instead of answering the editor with an error page (a
   * retry would only hit "bu numara zaten var").
   */
  private async announce(chapter: Chapter) {
    try {
      await this.notifyReaders(chapter)
    } catch (error) {
      logger.error({ err: error, chapterId: chapter.id }, 'Yeni bölüm bildirimi gönderilemedi')
    }
  }

  private async notifyReaders(chapter: Chapter) {
    const series = await SeriesModel.query()
      .where('id', chapter.seriesId)
      .preload('contentType')
      .firstOrFail()
    if (series.draft) return
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
    const { chapter, published } = await this.save(request)
    if (published) await this.announce(chapter)
    session.flash('success', chapter.draft ? 'Bölüm taslak olarak kaydedildi' : 'Bölüm eklendi')
    return response.redirect('/admin/bolumler')
  }

  async edit({ view, params }: HttpContext) {
    const chapter = await Chapter.query()
      .where('id', params.id)
      .preload('series', (q) => q.preload('contentType'))
      .firstOrFail()

    const seriesList = await SeriesModel.query().preload('contentType').orderBy('title', 'asc')

    return view.render('pages/admin/chapters/form', {
      title: 'Bölüm Düzenle',
      chapter,
      seriesList,
      seriesFormats: this.formatsOf(seriesList),
      currentFormat: chapter.series?.contentType?.format || 'image',
      ...this.videoOptions(),
      teams: await teamService.options(),
      selectedTeamIds: await teamService.idsOf('chapter_teams', chapter.id),
    })
  }

  async update({ request, params, session, response }: HttpContext) {
    const { chapter, published } = await this.save(request, await Chapter.findOrFail(params.id))
    // A draft series stays quiet; its readers hear about the chapter when the series goes live.
    if (published) await this.announce(chapter)
    session.flash('success', published ? 'Bölüm yayınlandı' : 'Bölüm güncellendi')
    return response.redirect('/admin/bolumler')
  }

  async destroy({ params, session, response }: HttpContext) {
    const chapter = await Chapter.findOrFail(params.id)
    const videos = localVideoPaths(chapter.content)
    const images = await db
      .from('comments')
      .where('chapter_id', chapter.id)
      .whereNotNull('image')
      .select('image')
    await chapter.delete()
    await removeUnusedVideos(videos)
    await removeContentFiles([...pageImages(chapter.content), ...images.map((row) => row.image)])
    session.flash('success', 'Bölüm silindi')
    return response.redirect('/admin/bolumler')
  }

  /**
   * Streams one video (`video` field) of a video series into
   * `<content root>/videos/<series id>/<uuid>.<ext>`. The body is not parsed by the body parser
   * for this route (`processManually`), so the CSRF token arrives in the `X-CSRF-TOKEN` header.
   */
  async uploadVideo({ request, response }: HttpContext) {
    const seriesId = Number(request.qs().series_id)
    const series =
      Number.isSafeInteger(seriesId) && seriesId > 0
        ? await SeriesModel.query().where('id', seriesId).preload('contentType').first()
        : null
    if (!series) return response.status(404).send({ message: 'Seri bulunamadı.' })
    if (series.contentType?.format !== 'video')
      return response.status(422).send({ message: 'Bu seriye video yüklenemez.' })
    try {
      const saved = await receiveVideo(request, series.id)
      return response.send(saved)
    } catch (error) {
      if (error instanceof VideoUploadError)
        return response.status(error.status).send({ message: error.message })
      throw error
    }
  }
}
