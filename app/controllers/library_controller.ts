import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import library from '#services/library_service'
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

  async import({ request, auth }: HttpContext) {
    const data = await request.validateUsing(importValidator)
    return library.importLocal(auth.user!.id, data)
  }
}
