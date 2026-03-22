import type { HttpContext } from '@adonisjs/core/http'
import Artist from '#models/artist'
import vine from '@vinejs/vine'

function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function slugify(text: string): string {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

const artistValidator = vine.compile(
  vine.object({ name: vine.string().minLength(1).maxLength(255) })
)

export default class ArtistController {
  async index({ view, request }: HttpContext) {
    const page = request.input('page', 1)
    const allowedSizes = [10, 20, 30, 50, 1000, 5000]
    const perPage = allowedSizes.includes(Number(request.input('per_page'))) ? Number(request.input('per_page')) : 20
    const artists = await Artist.query().orderBy('name', 'asc').paginate(page, perPage)
    artists.baseUrl('/admin/cizerler')
    artists.queryString({ per_page: perPage })
    return view.render('pages/admin/artists/index', { title: 'Çizerler', artists, paginator: artists, perPage })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/admin/artists/form', { title: 'Yeni Çizer Ekle' })
  }

  async store({ request, session, response }: HttpContext) {
    const data = await request.validateUsing(artistValidator)
    const existing = await Artist.findBy('name', data.name)
    if (existing) {
      session.flash('error', 'Bu çizer zaten mevcut')
      return response.redirect('/admin/cizerler/ekle')
    }
    const timestamp = now()
    await Artist.create({ name: data.name, slug: slugify(data.name), createdAt: timestamp, updatedAt: timestamp })
    session.flash('success', 'Çizer eklendi')
    return response.redirect('/admin/cizerler')
  }

  async edit({ view, params }: HttpContext) {
    const artist = await Artist.findOrFail(params.id)
    return view.render('pages/admin/artists/form', { title: 'Çizer Düzenle', artist })
  }

  async update({ request, params, session, response }: HttpContext) {
    const artist = await Artist.findOrFail(params.id)
    const data = await request.validateUsing(artistValidator)
    const existing = await Artist.query().where('name', data.name).whereNot('id', artist.id).first()
    if (existing) {
      session.flash('error', 'Bu isimde başka bir çizer zaten mevcut')
      return response.redirect(`/admin/cizerler/${artist.id}/duzenle`)
    }
    artist.name = data.name
    artist.slug = slugify(data.name)
    await artist.save()
    session.flash('success', 'Çizer güncellendi')
    return response.redirect('/admin/cizerler')
  }

  async destroy({ params, session, response }: HttpContext) {
    const artist = await Artist.findOrFail(params.id)
    try {
      await artist.delete()
      session.flash('success', 'Çizer silindi')
    } catch {
      session.flash('error', 'Bu çizer serilere bağlı olduğu için silinemez')
    }
    return response.redirect('/admin/cizerler')
  }
}
