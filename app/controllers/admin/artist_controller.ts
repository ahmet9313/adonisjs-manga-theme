import { invalidField } from '#services/upload_service'
import { now, slugify, pageNumber, pageSize } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import Artist from '#models/artist'
import vine from '@vinejs/vine'

const artistValidator = vine.compile(
  vine.object({ name: vine.string().trim().minLength(1).maxLength(255) })
)

export default class ArtistController {
  async index({ view, request }: HttpContext) {
    const page = pageNumber(request.input('page'))
    const perPage = pageSize(request.input('per_page'))
    const artists = await Artist.query().orderBy('name', 'asc').paginate(page, perPage)
    artists.baseUrl('/admin/cizerler')
    artists.queryString({ per_page: perPage })
    return view.render('pages/admin/artists/index', {
      title: 'Çizerler',
      artists,
      paginator: artists,
      perPage,
    })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/admin/artists/form', { title: 'Yeni Çizer Ekle' })
  }

  async store({ request, session, response }: HttpContext) {
    const data = await request.validateUsing(artistValidator)
    if (!slugify(data.name)) invalidField('name', 'Ad en az bir harf veya rakam içermeli.')
    const existing = await Artist.query()
      .where('name', data.name)
      .orWhere('slug', slugify(data.name))
      .first()
    if (existing) {
      session.flash('error', 'Bu çizer zaten mevcut')
      return response.redirect('/admin/cizerler/ekle')
    }
    const timestamp = now()
    await Artist.create({
      name: data.name,
      slug: slugify(data.name),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
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
    if (!slugify(data.name)) invalidField('name', 'Ad en az bir harf veya rakam içermeli.')
    const existing = await Artist.query()
      .where((q) => q.where('name', data.name).orWhere('slug', slugify(data.name)))
      .whereNot('id', artist.id)
      .first()
    if (existing) {
      session.flash('error', 'Bu isimde başka bir çizer zaten mevcut')
      return response.redirect(`/admin/cizerler/${artist.id}/duzenle`)
    }
    artist.name = data.name
    artist.slug = slugify(data.name)
    artist.updatedAt = now()
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
