import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import library from '#services/library_service'
import { takeAttempt } from '#services/throttle'
import readingList from '#services/reading_list_service'
import ContentType from '#models/content_type'
import site, { libraryStatusKeys } from '#config/site'

const seriesValidator = vine.compile(
  vine.object({
    type: vine.string().trim().maxLength(50),
    slug: vine.string().trim().maxLength(255),
  })
)

const statusValidator = vine.compile(
  vine.object({
    type: vine.string().trim().maxLength(50),
    slug: vine.string().trim().maxLength(255),
    status: vine.enum(libraryStatusKeys),
  })
)

const markValidator = vine.compile(
  vine.object({
    type: vine.string().trim().maxLength(50),
    slug: vine.string().trim().maxLength(255),
    chapter: vine.number().withoutDecimals().range([0, 1000000]),
    read: vine.boolean(),
  })
)

const importValidator = vine.compile(
  vine.object({
    bookmarks: vine
      .array(
        vine.object({
          type: vine.string().maxLength(50),
          slug: vine.string().maxLength(255),
          // An unknown status from an older or edited browser copy falls back to "reading".
          status: vine.string().maxLength(20).optional(),
        })
      )
      .maxLength(1000)
      .optional(),
    reads: vine
      .array(
        vine.object({
          type: vine.string().maxLength(50),
          slug: vine.string().maxLength(255),
          chapters: vine.array(vine.number().withoutDecimals().range([0, 1000000])).maxLength(5000),
        })
      )
      .maxLength(1000)
      .optional(),
  })
)

export default class LibraryController {
  async index({ view, auth }: HttpContext) {
    const items = auth.user ? await library.list(auth.user.id) : null
    // Guests' bookmarks only know the type slug, so the page gets the video types to say "izle".
    const videoTypes = await ContentType.query().where('format', 'video').select('slug')
    return view.render('pages/bookmarks', {
      title: 'Kaydedilenler',
      items,
      videoTypes: videoTypes.map((type) => type.slug),
      statuses: libraryStatusKeys.map((key) => ({ key, ...site.libraryStatuses[key] })),
    })
  }

  async toggle({ request, auth, response }: HttpContext) {
    const { type, slug } = await request.validateUsing(seriesValidator)
    const seriesId = await library.findSeriesId(type, slug)
    if (!seriesId) return response.notFound({ error: 'Seri bulunamadı' })
    return { saved: await library.toggleBookmark(auth.user!.id, seriesId) }
  }

  async remove({ request, auth, response }: HttpContext) {
    const { type, slug } = await request.validateUsing(seriesValidator)
    const seriesId = await library.findSeriesId(type, slug)
    if (!seriesId) return response.notFound({ error: 'Seri bulunamadı' })
    await library.removeBookmark(auth.user!.id, seriesId)
    return { saved: false }
  }

  /** Saves the series with a reading status (Okuyorum, Bitirdim …) or changes its status. */
  async status({ request, auth, response }: HttpContext) {
    const { type, slug, status } = await request.validateUsing(statusValidator)
    const seriesId = await library.findSeriesId(type, slug)
    if (!seriesId) return response.notFound({ error: 'Seri bulunamadı' })
    await readingList.setStatus(auth.user!.id, seriesId, status)
    return { saved: true, status }
  }

  /** "Okundu işaretle" / "Okunmadı olarak işaretle" for one chapter (no rewards). */
  async markChapter({ request, auth, response }: HttpContext) {
    if (!takeAttempt(`library-mark:${auth.user!.id}`, 120, 60 * 1000))
      return response.tooManyRequests({ error: 'Çok hızlı işaretliyorsun; biraz bekle.' })
    const { type, slug, chapter, read } = await request.validateUsing(markValidator)
    const seriesId = await library.findSeriesId(type, slug)
    if (!seriesId) return response.notFound({ error: 'Seri bulunamadı' })
    const result = await readingList.setRead(auth.user!, seriesId, chapter, read)
    if (!result) return response.forbidden({ error: 'Bu bölümü işaretleyemezsin.' })
    return result
  }

  /** "Tümünü okundu işaretle": every published chapter the account may open (no rewards). */
  async markAll({ request, auth, response }: HttpContext) {
    if (!takeAttempt(`library-mark-all:${auth.user!.id}`, 20, 10 * 60 * 1000))
      return response.tooManyRequests({ error: 'Çok sık denendi; biraz sonra tekrar dene.' })
    const { type, slug } = await request.validateUsing(seriesValidator)
    const seriesId = await library.findSeriesId(type, slug)
    if (!seriesId) return response.notFound({ error: 'Seri bulunamadı' })
    return readingList.markAll(auth.user!, seriesId)
  }

  /** GET /kutuphane/kapaklar?items=type/slug,… (at most 200): see library.savedSeries. */
  async saved({ request, response }: HttpContext) {
    const items = String(request.input('items', ''))
      .split(',')
      .slice(0, 200)
      .map((entry) => entry.split('/'))
      .filter(([type, slug]) => type && slug && /^[\w-]+$/.test(type) && /^[\w-]+$/.test(slug))
      .map(([type, slug]) => ({ type, slug }))
    response.header('Cache-Control', 'no-store')
    return library.savedSeries(items)
  }

  /** Guest data is handed over once after signing in; a few tries per 10 minutes are plenty. */
  async import({ request, auth, response }: HttpContext) {
    if (!takeAttempt(`library-import:${auth.user!.id}`, 5, 10 * 60 * 1000))
      return response.tooManyRequests({
        error: 'Çok sık aktarım denendi; biraz sonra tekrar dene.',
      })
    const data = await request.validateUsing(importValidator)
    return library.importLocal(auth.user!, data)
  }
}
