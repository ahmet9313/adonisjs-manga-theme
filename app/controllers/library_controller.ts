import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import library from '#services/library_service'
import { takeAttempt } from '#services/throttle'
import ContentType from '#models/content_type'

const seriesValidator = vine.compile(
  vine.object({
    type: vine.string().trim().maxLength(50),
    slug: vine.string().trim().maxLength(255),
  })
)

const importValidator = vine.compile(
  vine.object({
    bookmarks: vine
      .array(vine.object({ type: vine.string().maxLength(50), slug: vine.string().maxLength(255) }))
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
