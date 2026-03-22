import type { HttpContext } from '@adonisjs/core/http'
import Genre from '#models/genre'
import vine from '@vinejs/vine'

function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const genreValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(1).maxLength(255),
  })
)

export default class GenreController {
  async index({ view, request }: HttpContext) {
    const page = request.input('page', 1)
    const allowedSizes = [10, 20, 30, 50, 1000, 5000]
    const perPage = allowedSizes.includes(Number(request.input('per_page'))) ? Number(request.input('per_page')) : 20
    const genres = await Genre.query().orderBy('name', 'asc').paginate(page, perPage)
    genres.baseUrl('/admin/turler')
    genres.queryString({ per_page: perPage })
    return view.render('pages/admin/genres/index', { title: 'Türler', genres, paginator: genres, perPage })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/admin/genres/form', { title: 'Yeni Tür Ekle' })
  }

  async store({ request, session, response }: HttpContext) {
    const data = await request.validateUsing(genreValidator)
    const slug = slugify(data.name)

    const existing = await Genre.findBy('name', data.name)
    if (existing) {
      session.flash('error', 'Bu tür zaten mevcut')
      return response.redirect('/admin/turler/ekle')
    }

    const timestamp = now()
    await Genre.create({ name: data.name, slug, createdAt: timestamp, updatedAt: timestamp })
    session.flash('success', 'Tür eklendi')
    return response.redirect('/admin/turler')
  }

  async edit({ view, params }: HttpContext) {
    const genre = await Genre.findOrFail(params.id)
    return view.render('pages/admin/genres/form', { title: 'Tür Düzenle', genre })
  }

  async update({ request, params, session, response }: HttpContext) {
    const genre = await Genre.findOrFail(params.id)
    const data = await request.validateUsing(genreValidator)
    const slug = slugify(data.name)

    const existing = await Genre.query().where('name', data.name).whereNot('id', genre.id).first()
    if (existing) {
      session.flash('error', 'Bu isimde başka bir tür zaten mevcut')
      return response.redirect(`/admin/turler/${genre.id}/duzenle`)
    }

    genre.name = data.name
    genre.slug = slug
    await genre.save()

    session.flash('success', 'Tür güncellendi')
    return response.redirect('/admin/turler')
  }

  async destroy({ params, session, response }: HttpContext) {
    const genre = await Genre.findOrFail(params.id)
    try {
      await genre.delete()
      session.flash('success', 'Tür silindi')
    } catch {
      session.flash('error', 'Bu tür serilere bağlı olduğu için silinemez')
    }
    return response.redirect('/admin/turler')
  }
}
