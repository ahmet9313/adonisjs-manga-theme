import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import adminTools from '#config/admin_tools'
import Chapter from '#models/chapter'
import SeriesModel from '#models/series'
import adminLog from '#services/admin_log_service'
import { announceChapters } from '#services/chapter_publish_service'
import { now } from '#services/input_service'
import { removeContentFiles } from '#services/upload_service'
import { localDay } from '#services/level'
import logger from '@adonisjs/core/services/logger'
import { bulkImportValidator } from '#validators/admin_tools'
import {
  analyzeZip,
  archivePath,
  BulkUploadError,
  claimArchive,
  extractChapters,
  receiveArchive,
  removeArchive,
} from '#services/bulk_upload_service'

/** Image-format series (manga, manhwa, webtoon …): the only ones that take page archives. */
async function imageSeries(id: unknown) {
  const seriesId = Number(id)
  if (!Number.isSafeInteger(seriesId) || seriesId <= 0) return { series: null, status: 404 }
  const series = await SeriesModel.query().where('id', seriesId).preload('contentType').first()
  if (!series) return { series: null, status: 404 }
  if ((series.contentType?.format || 'image') !== 'image') return { series: null, status: 422 }
  return { series, status: 200 }
}

const seriesMessage = (status: number) =>
  status === 404 ? 'Seri bulunamadı.' : 'Toplu yükleme yalnız görsel sayfalı serilerde yapılabilir.'

/**
 * Admin → Toplu Yükle: one ZIP becomes one or many chapters (one folder per chapter, or a flat
 * archive of pages for a single chapter). Upload (streamed to a temporary file) → preview →
 * import; bulk_upload_service reads the archive, this controller writes the chapters.
 */
export default class BulkUploadController {
  async show({ view, request }: HttpContext) {
    const seriesList = await SeriesModel.query()
      .whereHas('contentType', (type) => type.where('format', 'image'))
      .preload('contentType')
      .orderBy('title', 'asc')
    const requested = Number(request.input('series_id'))
    return view.render('pages/admin/bulk_upload', {
      title: 'Toplu Yükle',
      seriesList,
      selectedSeriesId: seriesList.some((series) => series.id === requested) ? requested : null,
      limits: adminTools.bulk,
    })
  }

  /** Streams the ZIP (`zip` field) to disk and answers with the chapters found in it. */
  async upload({ request, response, auth }: HttpContext) {
    const { series, status } = await imageSeries(request.qs().series_id)
    if (!series) return response.status(status).send({ message: seriesMessage(status) })
    try {
      const saved = await receiveArchive(request, auth.user!.id)
      let plan
      try {
        plan = await analyzeZip(saved.path, [saved.name])
      } catch (error) {
        await removeArchive(saved.path)
        throw error
      }
      const existing = await Chapter.query()
        .where('seriesId', series.id)
        .select('number', 'draft')
        .orderBy('number', 'desc')
      const taken = new Map(existing.map((chapter) => [chapter.number, chapter.draft]))
      return response.send({
        token: saved.token,
        fileName: saved.name,
        size: saved.size,
        flat: plan.flat,
        warnings: plan.warnings,
        ignored: plan.ignored,
        suggestedNumber: existing.length ? existing[0].number + 1 : 1,
        existing: [...taken.keys()],
        chapters: plan.chapters.map((chapter) => ({
          key: chapter.key,
          folder: chapter.folder,
          number: chapter.number,
          title: chapter.title,
          pageCount: chapter.pages.length,
          size: chapter.size,
          firstPage: chapter.pages[0]?.name.split('/').pop() || '',
          lastPage: chapter.pages[chapter.pages.length - 1]?.name.split('/').pop() || '',
          warnings: chapter.warnings,
          importable: chapter.importable,
        })),
      })
    } catch (error) {
      if (error instanceof BulkUploadError)
        return response.status(error.status).send({ message: error.message })
      throw error
    }
  }

  /** Drops the archive of a preview that staff cancelled. */
  async cancel({ request, response, auth }: HttpContext) {
    const path = archivePath(auth.user!.id, request.input('token'))
    if (path) await removeArchive(path)
    return response.send({ ok: true })
  }

  /**
   * Creates the chosen chapters. Existing numbers are skipped or overwritten (pages and title
   * replaced; comments and reads stay). New chapters are drafts or published as chosen; an
   * overwritten chapter keeps its state, except that "Yayınla" publishes it if it was a draft.
   */
  async import({ request, response, auth }: HttpContext) {
    const data = await request.validateUsing(bulkImportValidator)
    const { series, status } = await imageSeries(data.series_id)
    if (!series) return response.status(status).send({ message: seriesMessage(status) })
    // Checked before the archive is taken, so staff can correct the preview and try again.
    const numbers = data.chapters.map((chapter) => chapter.number)
    if (new Set(numbers).size !== numbers.length)
      return response.status(422).send({ message: 'Aynı bölüm numarası birden çok kez seçildi.' })
    const keys = data.chapters.map((chapter) => chapter.key ?? '')
    if (new Set(keys).size !== keys.length)
      return response.status(422).send({ message: 'Aynı klasör birden çok kez seçildi.' })

    const path = archivePath(auth.user!.id, data.token)
    const claimed = path ? await claimArchive(path) : null
    if (!claimed)
      return response
        .status(404)
        .send({ message: 'Yüklenen arşiv bulunamadı ya da zaten içe aktarıldı; yeniden yükleyin.' })

    const written: string[] = []
    try {
      const existing = await Chapter.query().where('seriesId', series.id).whereIn('number', numbers)
      const byNumber = new Map(existing.map((chapter) => [chapter.number, chapter]))
      const skipped = data.chapters
        .filter((chapter) => byNumber.has(chapter.number) && data.conflict === 'skip')
        .map((chapter) => chapter.number)
      const chosen = data.chapters.filter((chapter) => !skipped.includes(chapter.number))

      const draft = data.mode === 'draft'
      const created: Chapter[] = []
      const overwritten: Chapter[] = []
      const published: Chapter[] = []
      const replacedPages: string[] = []

      if (chosen.length) {
        const segments = (number: number) => [
          series.contentType.slug,
          series.slug,
          'chapters',
          String(number),
        ]
        const { pages } = await extractChapters(
          claimed,
          [],
          chosen.map((chapter) => ({ key: chapter.key ?? '', segments: segments(chapter.number) }))
        )
        for (const list of pages.values()) written.push(...list)

        const timestamp = now()
        // The site's calendar day (config/site.ts timezone), like the chapter form.
        const today = localDay()
        await db.transaction(async (trx) => {
          for (const choice of chosen) {
            const content = { type: 'images' as const, pages: pages.get(choice.key ?? '')! }
            const previous = byNumber.get(choice.number)
            if (previous) {
              const goesLive = !draft && previous.draft
              if (previous.content.type === 'images') replacedPages.push(...previous.content.pages)
              previous.useTransaction(trx)
              previous.merge({
                content,
                title: choice.title || previous.title,
                draft: goesLive ? false : previous.draft,
                publishedAt: goesLive ? today : previous.publishedAt,
                updatedAt: timestamp,
              })
              await previous.save()
              overwritten.push(previous)
              if (goesLive) published.push(previous)
            } else {
              const chapter = new Chapter()
              chapter.useTransaction(trx)
              chapter.merge({
                seriesId: series.id,
                number: choice.number,
                title: choice.title || null,
                content,
                draft,
                access: 'public',
                warning: null,
                publishedAt: today,
                createdAt: timestamp,
                updatedAt: timestamp,
              })
              await chapter.save()
              created.push(chapter)
              if (!draft) published.push(chapter)
            }
          }
          const live = [...created, ...overwritten].some((chapter) => !chapter.draft)
          if (data.bump && live)
            await SeriesModel.query({ client: trx })
              .where('id', series.id)
              .update({ updatedAt: timestamp })
        })
        written.length = 0
        // Pages of overwritten chapters are only on disk now; the new ones replaced them.
        await removeContentFiles(replacedPages)
        // The chapters are saved; a failed announcement is logged, not shown as an error.
        if (data.notify)
          await announceChapters(series.id, published).catch((error) =>
            logger.error({ err: error, seriesId: series.id }, 'Yeni bölüm bildirimi gönderilemedi')
          )
      }

      const list = (items: { number: number }[]) =>
        items
          .map((item) => item.number)
          .sort((a, b) => a - b)
          .join(', ')
      const parts = [
        created.length ? `${created.length} bölüm ekledi (${list(created)})` : '',
        overwritten.length
          ? `${overwritten.length} bölümün üzerine yazdı (${list(overwritten)})`
          : '',
        skipped.length ? `${skipped.length} bölümü atladı` : '',
      ].filter(Boolean)
      await adminLog.record(
        auth.user,
        'bulk_upload',
        'series',
        series.id,
        `"${series.title}" serisine ZIP'ten ${parts.join(', ') || 'hiç bölüm eklemedi'}${created.length && draft ? ' (taslak)' : ''}`
      )
      return response.send({
        created: created.map((chapter) => chapter.number).sort((a, b) => a - b),
        overwritten: overwritten.map((chapter) => chapter.number).sort((a, b) => a - b),
        skipped: skipped.sort((a, b) => a - b),
        published: published.length,
        draft,
        listUrl: `/admin/bolumler?series_id=${series.id}`,
      })
    } catch (error) {
      await removeContentFiles(written)
      if (error instanceof BulkUploadError)
        return response.status(error.status).send({ message: error.message })
      throw error
    } finally {
      await removeArchive(claimed)
    }
  }
}
