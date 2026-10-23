import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import reader from '#config/reader'
import Chapter from '#models/chapter'
import Series from '#models/series'
import access from '#services/access_service'
import readerService from '#services/reader_service'
import { takeAttempt } from '#services/throttle'

const prefsValidator = vine.compile(
  vine.object({
    mode: vine.enum(reader.modes),
    zoom: vine.enum(reader.zoomSteps),
    dir: vine.enum(reader.directions),
    font: vine
      .number()
      .withoutDecimals()
      .range([0, reader.fontSteps - 1]),
    auto: vine.boolean({ strict: true }),
  })
)

const positionValidator = vine.compile(
  vine.object({
    chapter: vine.number().withoutDecimals().positive(),
    page: vine.number().withoutDecimals().range([1, 10000]),
  })
)

/** Account side of the reader (resources/js/components/reader.js); guests keep both locally. */
export default class ReaderController {
  /** POST /okuyucu/tercihler: the reading settings follow the account across devices. */
  async prefs({ request, response, auth }: HttpContext) {
    const user = auth.user!
    if (!takeAttempt(`reader-prefs:${user.id}`, reader.prefsPerMinute, 60 * 1000))
      return response.tooManyRequests({
        error: 'Ayarlar çok sık değişti; biraz sonra tekrar dene.',
      })
    const prefs = await request.validateUsing(prefsValidator)
    return { prefs: await readerService.savePrefs(user, prefs) }
  }

  /**
   * POST /okuyucu/konum: the page on screen, so the chapter opens where the reader left it.
   * Only for chapters the reader may still open and has opened before; no EXP or cards.
   */
  async position({ request, response, auth }: HttpContext) {
    const user = auth.user!
    if (!takeAttempt(`reader-position:${user.id}`, reader.positionsPerMinute, 60 * 1000))
      return response.tooManyRequests({ error: 'Çok sık kaydedildi; biraz sonra tekrar dene.' })
    const { chapter: chapterId, page } = await request.validateUsing(positionValidator)
    const chapter = await Chapter.find(chapterId)
    const series = chapter ? await Series.find(chapter.seriesId) : null
    if (!chapter || !series || !access.visible(user, { series, chapter }))
      return response.notFound({ error: 'Bölüm bulunamadı.' })
    if (!access.allows(user, access.effectiveAccess({ series, chapter })))
      return response.forbidden({ error: 'Bu bölümü açma iznin yok.' })
    const pages = chapter.content?.type === 'images' ? chapter.content.pages.length : 0
    if (page > pages) return response.unprocessableEntity({ error: 'Bu bölümde o sayfa yok.' })
    if (!(await readerService.savePosition(user.id, chapter.id, page)))
      return response.notFound({ error: 'Bu bölüm henüz açılmamış.' })
    return { page }
  }
}
